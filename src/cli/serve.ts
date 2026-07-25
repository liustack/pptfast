/**
 * `pptfast serve <target>` (serve wave, task S1, spec-plan.md
 * `.issues/2026-07-25-serve/spec-plan.md`): a live-reloading HTTP preview of
 * the exact same `preview.html` bundle `pptfast preview --html` writes to
 * disk (`buildDeckPreview`, `./commands.ts`) — this module never builds its
 * own HTML, only serves and refreshes what that shared pipeline produces
 * (design ruling 5: "buildPreviewHtml 复用现状 ... 禁止 fork 一份 preview 构建
 * 逻辑").
 *
 * Two layers:
 * - {@link createServeServer}: the testable factory — a plain `node:http`
 *   server (design ruling 1: zero new dependencies, no express/ws/chokidar)
 *   bound hard to `127.0.0.1` (design ruling 6: no remote bind, no auth — a
 *   local dev tool), an `fs.watch`-based rebuild loop, and an SSE channel for
 *   push (design ruling 2: v1 is a whole-page `location.reload()` over SSE,
 *   no partial DOM patching). No process-level side effects (no `SIGINT`
 *   handler, no browser launch) — a caller (tests, or {@link runServe} below)
 *   owns that, which is what keeps this factory usable outside the CLI.
 * - {@link runServe}: the CLI-facing wrapper — prints the URL, opens a
 *   browser unless `--no-open`, wires `SIGINT` to a clean shutdown.
 *
 * Routes: `GET /` returns the in-memory cached HTML (rebuilt on change, never
 * per-request — a request never blocks on a render). `GET /events` is the
 * SSE stream: a `retry:` hint on connect, a `: heartbeat` comment frame every
 * 30s (keeps the connection alive through an idle-timeout proxy — pure SSE
 * comment syntax, invisible to `EventSource`), an `event: reload` frame after
 * every successful rebuild, an `event: error` frame with a JSON `{message}`
 * body after a failed one. Everything else 404s (S2 adds
 * `POST /revision-request` as the one exception).
 *
 * Watch roots (design ruling 3) come straight from {@link buildDeckPreview}'s
 * own `resolvedTarget`/`isDir` — the exact path `loadDeckTarget`
 * (`./commands.ts`) already resolved `target` to — rather than this module
 * re-deriving the bare-name/`decksDir` resolution a second time: a deck
 * project directory watches `deck.spec.json` + `pages/` + `assets/`
 * (non-recursive `fs.watch` on each — `{recursive: true}` is macOS/Windows
 * only below Node 20 (ENOSYS on Linux otherwise), and this repo's floor is
 * Node 18, `package.json#engines` — three flat, non-nested directories cover
 * the whole deck-project layout anyway, `docs/deck-projects.md`); a bare IR
 * target watches that one file. Multiple `fs.watch` events firing for a
 * single logical save (editors that write via a temp file + rename, or
 * saving several page files in one "save all") are coalesced by a 200ms
 * debounce into one rebuild.
 *
 * Resilience (design ruling 3's other half): a rebuild that throws — a
 * mid-edit malformed JSON save is the common case — never crashes the server
 * or throws out of the watch handler. It's caught, turned into an `error` SSE
 * event, and the previous good `html` stays cached and keeps serving `GET /`
 * until a later rebuild succeeds. Only the *first* build (at
 * `createServeServer` call time, before the server starts listening) is
 * allowed to reject the whole call — same "throw `PptfastError` → CLI exit 1"
 * contract every other `run*` command already has (`./commands.ts`), since
 * there is no previous-good HTML yet to fall back to.
 */
import { spawn } from "node:child_process"
import { type FSWatcher, watch } from "node:fs"
import { createServer, type Server, type ServerResponse } from "node:http"
import { platform as osPlatform } from "node:os"
import { join } from "node:path"
import { PptfastError } from "../errors"
import { buildDeckPreview } from "./commands"
import { ASSETS_DIRNAME, PAGES_DIRNAME, SPEC_FILENAME } from "./deck-dir"

/** `pptfast serve`'s own default (spec-plan.md §2's worked example,
 *  `pptfast serve <target> [--port 4400] [--no-open]`) — never
 *  auto-incremented on conflict (design ruling 7: "不自动递增——agent 要可
 *  预测的 URL"), so a busy port is a hard error naming `--port` as the way
 *  out, never a silent fallback to some other port the caller didn't ask
 *  for. */
export const DEFAULT_PORT = 4400

const DEBOUNCE_MS = 200
const HEARTBEAT_MS = 30_000

export interface ServeOptions {
  /** Same target shape every deck-accepting command accepts: an IR JSON
   *  file, a deck project directory, or a bare name under
   *  `~/.pptfast/decks` (`buildDeckPreview`/`loadDeckTarget`, `./commands.ts`). */
  target: string
  /** Default {@link DEFAULT_PORT}. `0` binds an OS-assigned ephemeral port
   *  (tests only — `pptfast serve` itself always resolves a fixed port, see
   *  {@link DEFAULT_PORT}'s own doc comment on why this command never
   *  auto-increments). */
  port?: number
  cwd?: string
}

export interface ServeHandle {
  server: Server
  /** Re-run the build pipeline immediately and push the result over SSE
   *  (`reload` on success, `error` on failure) — never throws, same
   *  catch-and-broadcast contract the `fs.watch` path uses internally.
   *  Exposed so a caller (or a test) can force a synchronous rebuild without
   *  waiting on the 200ms debounce. */
  rebuild: () => Promise<void>
  /** Stops watching, closes every open SSE connection, and closes the HTTP
   *  server. Safe to call more than once. */
  close: () => Promise<void>
  /** `http://127.0.0.1:<port>` — the actual bound port, resolved even when
   *  `options.port` was `0`. */
  url: string
  port: number
}

/** The concrete paths `createServeServer` should `fs.watch` for `target`,
 *  given `buildDeckPreview`'s own `resolvedTarget`/`isDir` for it — see this
 *  module's own doc comment for why these three (deck-dir mode) or this one
 *  (bare-IR mode) are the whole watch surface. */
function watchRoots(resolvedTarget: string, isDir: boolean): string[] {
  if (!isDir) return [resolvedTarget]
  return [join(resolvedTarget, SPEC_FILENAME), join(resolvedTarget, PAGES_DIRNAME), join(resolvedTarget, ASSETS_DIRNAME)]
}

/**
 * The testable factory (serve wave, task S1). Builds once up front — a
 * failure here rejects the whole call, see this module's own doc comment —
 * then starts listening and watching. Every fs/network resource this
 * function opens (the watchers, the heartbeat timer, the HTTP server) is
 * torn down by the returned {@link ServeHandle.close} and by nothing else:
 * this function has no other side effect a caller would need to separately
 * clean up, which is what makes it safe to call directly from a test without
 * going through the CLI at all.
 */
export async function createServeServer(options: ServeOptions): Promise<ServeHandle> {
  const cwd = options.cwd ?? process.cwd()
  const requestedPort = options.port ?? DEFAULT_PORT
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
    throw new PptfastError(`invalid port ${requestedPort} — expected an integer between 0 and 65535`)
  }

  // First build happens before the server ever starts listening — deliberate:
  // there is no previous-good HTML to fall back to yet, so an invalid target
  // must fail this call outright (CLI exit 1, same as every other command)
  // rather than start a server with nothing to show at `GET /`.
  const initial = await buildDeckPreview(options.target, { cwd })
  let cachedHtml = initial.html
  const sseClients = new Set<ServerResponse>()

  function writeToAll(chunk: string): void {
    for (const res of sseClients) {
      try {
        res.write(chunk)
      } catch {
        // A client that disconnected mid-broadcast — its own `close`/`error`
        // listener (registered where it's added to `sseClients` below)
        // removes it; one dead client must never stop the rest from hearing
        // about this rebuild.
      }
    }
  }

  function broadcast(event: string, data: unknown): void {
    writeToAll(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  async function rebuild(): Promise<void> {
    try {
      const result = await buildDeckPreview(options.target, { cwd })
      cachedHtml = result.html
      broadcast("reload", {})
    } catch (e) {
      broadcast("error", { message: e instanceof Error ? e.message : String(e) })
    }
  }

  const server = createServer((req, res) => {
    const pathname = (req.url ?? "/").split("?")[0]
    if (req.method === "GET" && pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(cachedHtml)
      return
    }
    if (req.method === "GET" && pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      })
      res.write("retry: 2000\n\n")
      sseClients.add(res)
      res.on("close", () => sseClients.delete(res))
      res.on("error", () => sseClients.delete(res))
      return
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
    res.end("not found")
  })

  const heartbeat = setInterval(() => writeToAll(": heartbeat\n\n"), HEARTBEAT_MS)

  let debounceTimer: NodeJS.Timeout | undefined
  function scheduleRebuild(): void {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      void rebuild()
    }, DEBOUNCE_MS)
  }

  const watchers: FSWatcher[] = []
  for (const path of watchRoots(initial.resolvedTarget, initial.isDir)) {
    try {
      watchers.push(watch(path, () => scheduleRebuild()))
    } catch (e) {
      // `pages/`/`assets/` may not exist yet for a brand-new deck project
      // (nothing filled in, no local images) — nothing to watch there until
      // it's created, not a reason to fail serve startup. Anything other
      // than "doesn't exist yet" (permissions, ...) is a real problem.
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
    }
  }

  function teardownWatchersAndTimers(): void {
    clearInterval(heartbeat)
    if (debounceTimer) clearTimeout(debounceTimer)
    for (const w of watchers) w.close()
  }

  try {
    await new Promise<void>((resolveListen, rejectListen) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.removeListener("listening", onListening)
        rejectListen(err)
      }
      const onListening = () => {
        server.removeListener("error", onError)
        resolveListen()
      }
      server.once("error", onError)
      server.once("listening", onListening)
      server.listen(requestedPort, "127.0.0.1")
    })
  } catch (e) {
    teardownWatchersAndTimers()
    if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") {
      throw new PptfastError(`port ${requestedPort} is already in use — pick a different one with --port`)
    }
    throw e
  }

  const address = server.address()
  const actualPort = typeof address === "object" && address !== null ? address.port : requestedPort

  let closed = false
  async function close(): Promise<void> {
    if (closed) return
    closed = true
    teardownWatchersAndTimers()
    for (const res of sseClients) res.end()
    sseClients.clear()
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((err) => (err ? rejectClose(err) : resolveClose()))
    })
  }

  return { server, rebuild, close, url: `http://127.0.0.1:${actualPort}`, port: actualPort }
}

/**
 * Best-effort browser launch (spec-plan.md S1: "--no-open: 默认行为打开浏览器
 * ... 若无则用 child_process spawn open (darwin) / xdg-open (linux)"). Nothing
 * in this repo already opens URLs (`./update.ts`'s `execFile` runs `npm`, not
 * a GUI app) — this is the one place that does. Never throws and never
 * rejects a caller's own flow: a headless box, a sandboxed CI runner, or a
 * missing `xdg-open` binary all fail silently — the URL `runServe` already
 * printed to the terminal is the fallback, so a failed launch here degrades
 * to "the user copies the URL themselves", not a broken `pptfast serve`.
 * Windows is out of scope (this repo's own dev-machine assumption is
 * macOS/Linux, spec-plan.md design ruling 1) — falls through to the
 * `xdg-open` branch, which simply fails to spawn (caught below) rather than
 * crashing.
 */
export function openBrowser(url: string): void {
  const command = osPlatform() === "darwin" ? "open" : "xdg-open"
  try {
    const child = spawn(command, [url], { stdio: "ignore", detached: true })
    child.on("error", () => {})
    child.unref()
  } catch {
    // spawn() itself can throw synchronously (e.g. EMFILE) — equally non-fatal.
  }
}

export interface RunServeOptions {
  port?: number
  /** `false` suppresses the browser launch (`--no-open`). Default `true`. */
  open?: boolean
  cwd?: string
}

/**
 * `pptfast serve <target>` (`../cli.ts`'s CLI wiring). Resolving does not
 * mean the command is finished — unlike every other `run*` (`./commands.ts`),
 * which does its one unit of work and returns, this one starts a long-lived
 * server and returns almost immediately after; the open listening socket
 * `createServeServer` set up is what keeps the CLI process alive from here
 * (the standard long-running-dev-server shape — same reason `vite dev`'s own
 * process doesn't exit right after printing its URL), not this function
 * blocking on anything.
 */
export async function runServe(target: string, opts: RunServeOptions = {}): Promise<void> {
  const handle = await createServeServer({ target, port: opts.port, cwd: opts.cwd })
  console.log(`pptfast serve: ${handle.url} (Ctrl+C to stop)`)
  if (opts.open !== false) openBrowser(handle.url)
  process.on("SIGINT", () => {
    void handle.close().then(
      () => process.exit(0),
      () => process.exit(1),
    )
  })
}
