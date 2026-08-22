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
 * Routes: `GET /` returns the in-memory cached HTML — after {@link injectServeClient}
 * has spliced this module's own `<script>` into it (task S2; see that
 * function's own doc comment) — rebuilt on change, never per-request (a
 * request never blocks on a render). `GET /events` is the SSE stream: a
 * `retry:` hint on connect, a `: heartbeat` comment frame every 30s (keeps
 * the connection alive through an idle-timeout proxy — pure SSE comment
 * syntax, invisible to `EventSource`), an `event: reload` frame after every
 * successful rebuild, an `event: error` frame with a JSON `{message}` body
 * after a failed one. Everything else 404s.
 *
 * This server is read-only. It carried a `POST /revision-request` endpoint
 * until 2026-08-16, which took the preview annotation panel's export and
 * wrote it into the deck directory; the panel went first, leaving the
 * endpoint with no producer, and the pair was removed together. A reviewer
 * who wants something changed says so in the conversation — a screenshot
 * reaches the agent faster than a panel whose output has to be exported and
 * routed back — and the agent edits `pages/*.json` through the same gate as
 * every other change.
 *
 * Watch roots (design ruling 3) come straight from {@link buildDeckPreview}'s
 * own `resolvedTarget`/`isDir` — the exact path `loadDeckTarget`
 * (`./commands.ts`) already resolved `target` to — rather than this module
 * re-deriving the bare-name/`decksDir` resolution a second time: a deck
 * project directory watches `deck.spec.json` + `pages/` + `assets/`
 * (non-recursive `fs.watch` on each — three flat, non-nested directories
 * cover the whole deck-project layout anyway, `docs/deck-projects.md`, so
 * `{recursive: true}` buys nothing here even now that the repo's floor
 * (Node 22.19, `package.json#engines`) has it on every platform); a bare IR
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
import { type FSWatcher, watch } from "node:fs"
import { createServer, type Server, type ServerResponse } from "node:http"
import { platform as osPlatform } from "node:os"
import { join } from "node:path"
import { PptfastError } from "../errors"
import { spawnHidden } from "./child"
import { buildDeckPreview } from "./commands"
import { findConfig } from "./config"
import { ASSETS_DIRNAME, PAGES_DIRNAME, SPEC_FILENAME } from "./deck-dir"
import { resolveWorkspaceLocation } from "./workspace"

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
  /** `--theme-file <path>` (brand-extract wave) — threaded into every
   *  `buildDeckPreview` call (initial and each rebuild). The registration is
   *  idempotent per id (`registerBrandThemeFile`, `../themes/brand-theme-file.ts`),
   *  so re-running it every rebuild is safe — but note the flip side: the
   *  first successful registration wins for the process's lifetime, so
   *  editing the theme file itself mid-serve does not live-reload the brand
   *  (restart `pptfast serve` for that). */
  themeFilePath?: string
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
function watchRoots(resolvedTarget: string, isDir: boolean, extra: string[] = []): string[] {
  const roots = isDir
    ? [join(resolvedTarget, SPEC_FILENAME), join(resolvedTarget, PAGES_DIRNAME), join(resolvedTarget, ASSETS_DIRNAME)]
    : [resolvedTarget]
  return [...roots, ...extra]
}

/** Marker on the injected `<script>` element (task S2: "serve 模式检测（注入的
 *  脚本自带标记）", spec-plan.md §4) — lets a test (`serve.test.ts`) or later
 *  tooling confirm a served page carries this module's client wiring
 *  without parsing or executing it, and gives {@link injectServeClient} a
 *  fixed string to check for (a defensive double-injection guard —
 *  `createServeServer` only ever calls it on a fresh `buildDeckPreview`
 *  result, which never already contains it, but the check costs nothing). */
export const SERVE_CLIENT_SCRIPT_ID = "pptfast-serve-client"

/**
 * The serve-mode client (task S2), spliced into every served page by
 * {@link injectServeClient} — never seen by the non-serve `pptfast preview
 * --html` download path. Two jobs:
 *
 * 1. Live reload: opens `EventSource('/events')`, reloads the whole page on
 *    `reload` (design ruling 2), shows a fixed top banner on `error`. The
 *    server's own custom `event: error` frame and `EventSource`'s *built-in*
 *    connection-failure event share the same DOM event name on this one
 *    object — a real connection hiccup is a plain `Event` with no `data`
 *    (EventSource auto-reconnects itself off the server's `retry:` hint,
 *    nothing for this page to do); the server's frame is a `MessageEvent`
 *    whose `data` is a JSON `{message}` string. Checking for `.data` first
 *    tells the two apart. No explicit "clear the banner" path either: every
 *    successful rebuild's `reload` does a full `location.reload()`, wiping
 *    the banner along with the rest of the DOM — a separate hide-on-success
 *    branch would be dead code a reload always beats to it.
 *
 * 2. Revision-request submit: rewires the existing export/download button
 *    (`#pf-export-btn`, `buildPreviewHtml`/`./preview-html.ts`) to POST
 *    instead of only downloading. The exact serialized payload comes from
 *    `window.__pptfastBuildExportBlob` — a plain function reference that
 *    file's own `<script>` closure assigns onto `window` specifically as
 *    this module's seam (see that file's own doc comment for the full
 *    rationale; design ruling 5 forbids a second copy of any part of the
 *    preview-build logic, and calling back into the original closure's own
 *    function is how this reuses it instead of re-deriving the
 *    `{version, deck, requests}` shape here). Called through
 *    `Promise.resolve(...).then(...)` rather than invoked and trusted
 *    directly — cheap insurance that both a synchronous throw *and* a
 *    rejected/async return from `buildExportBlob()` land in the same
 *    `.catch` as a network failure, all surfaced as the same inline
 *    status-line feedback, never a silent no-op. (An earlier version of
 *    this file took a different approach here — briefly monkey-patching
 *    `URL.createObjectURL`/`HTMLAnchorElement.prototype.click` around a
 *    programmatic click on the original button, to capture the `Blob` it
 *    built without a seam existing yet. Reviewed out: it only worked
 *    because that handler happened to be perfectly synchronous start to
 *    finish, an assumption a later change to it — one `await` — could
 *    silently break with zero user-visible error, on the one feature this
 *    whole command exists to make possible.) The rewired button (a
 *    `cloneNode` swapped in for the original — `cloneNode` never copies
 *    `addEventListener` listeners, so the original element, though detached
 *    from the document, keeps `buildPreviewHtml`'s own listener intact and
 *    still runnable via `.click()`) shows success/failure inline; a small
 *    secondary link next to it just calls `originalBtn.click()` — the
 *    untouched, real download path — so a manual copy is always still one
 *    click away regardless of whether the POST succeeds.
 *
 * Exported (S3, S2 re-review's named test carry) purely so
 * `serve-client.test.ts` can execute this exact string under jsdom instead of
 * only grepping it as markup — this file has no other export consumer, isn't
 * re-exported from anywhere `pptfast --help` or the SDK's public surface ever
 * reads, and stays exactly as inert to import as before: `src/cli/serve.ts`
 * is already Node-only (AGENTS.md's layout rule), never reachable from
 * `src/index.ts`'s browser-safe closure regardless of what it exports.
 */
export const SERVE_CLIENT_JS = `
(function () {
  // Live reload is the whole of this client (the revision-request submit
  // that used to sit beside it was removed on 2026-08-16 — see this
  // module's own header). It keeps its own function and its own try/catch
  // at the call site below: an EventSource construction that throws in some
  // unusual embedding must degrade to a page that simply does not
  // auto-refresh, not abort the IIFE.

  function setUpLiveReload() {
    var es = new EventSource('/events')
    es.addEventListener('reload', function () { location.reload() })

    var banner = document.createElement('div')
    banner.id = 'pptfast-serve-error-banner'
    banner.setAttribute('role', 'alert')
    banner.style.cssText =
      'display:none;position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
      'background:#dc2626;color:#fff;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;' +
      'padding:8px 16px;text-align:center'
    document.body.appendChild(banner)

    function showBanner(message) {
      banner.textContent = 'pptfast serve: ' + message
      banner.style.display = 'block'
    }

    es.addEventListener('error', function (e) {
      if (!e || typeof e.data !== 'string') return // a real connection hiccup, not the server's own rebuild-failed frame
      var message = 'rebuild failed'
      try {
        var parsed = JSON.parse(e.data)
        if (parsed && typeof parsed.message === 'string') message = parsed.message
      } catch (err) {}
      showBanner(message)
    })
  }

  try {
    setUpLiveReload()
  } catch (e) {
    console.error('pptfast serve: failed to set up live reload', e)
  }
})()
`.trim()

/** Wraps {@link SERVE_CLIENT_JS} in its own `<script>` tag, marked with
 *  {@link SERVE_CLIENT_SCRIPT_ID}. */
function buildServeClientScriptTag(): string {
  return `<script id="${SERVE_CLIENT_SCRIPT_ID}">${SERVE_CLIENT_JS}</script>`
}

/**
 * Post-processing HTML injection (design ruling 5: `buildPreviewHtml`
 * (`./preview-html.ts`) has no seam of its own for extra script content,
 * and forking a second copy of its build logic is forbidden — so this
 * rewrites the *string* `buildDeckPreview` already returned instead,
 * leaving that module — and every byte it produces for the non-serve
 * `pptfast preview --html` download path — completely untouched).
 * `createServeServer` is the only caller, on every fresh
 * `buildDeckPreview` result (initial build and every rebuild alike).
 * Inserted right before the document's one `</body>`: by the time it runs,
 * every element the injected script itself touches (`#pf-export-btn`, ...)
 * already exists, the same reasoning `buildPreviewHtml` already places its
 * own `<script>` there for.
 */
export function injectServeClient(html: string): string {
  if (html.includes(SERVE_CLIENT_SCRIPT_ID)) return html
  return html.replace("</body>", `${buildServeClientScriptTag()}\n</body>`)
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
  const initial = await buildDeckPreview(options.target, { cwd, themeFilePath: options.themeFilePath })
  let cachedHtml = injectServeClient(initial.html)
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
      const result = await buildDeckPreview(options.target, { cwd, themeFilePath: options.themeFilePath })
      cachedHtml = injectServeClient(result.html)
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

  const projectHit = await findConfig(cwd)
  const workspaceAssets = join(
    resolveWorkspaceLocation({
      cwd,
      projectConfigPath: projectHit?.path,
      outDir: projectHit?.config.outDir,
      target: initial.resolvedTarget,
      isDir: initial.isDir,
    }).dir,
    ASSETS_DIRNAME,
  )

  const watchers: FSWatcher[] = []
  for (const path of watchRoots(initial.resolvedTarget, initial.isDir, [workspaceAssets])) {
    try {
      watchers.push(watch(path, () => scheduleRebuild()))
    } catch (e) {
      // `pages/`/`assets/` may not exist yet for a brand-new deck project
      // (nothing filled in, no local images) — nothing to watch there until
      // it's created, not a reason to fail serve startup. Anything other
      // than "doesn't exist yet" (permissions, ...) is a real problem.
      // Consequence (S1 review carry): this watch-setup pass only ever runs
      // once, at `createServeServer` call time — a directory that gets
      // created *later* in the same session (e.g. the first local image
      // asset is added, materializing `assets/` mid-edit) is never picked
      // up, since nothing here re-scans for newly-appeared watch roots
      // afterward. Changes under such a directory go unnoticed until the
      // user restarts `pptfast serve`.
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
    // `res.end()` above finishes each SSE response, but the socket behind a
    // `Connection: keep-alive` response (`GET /events`'s own header) is not
    // guaranteed to be released the instant the response ends —
    // `server.close()`'s callback only fires once every socket the server
    // ever accepted has actually closed, so a lingering keep-alive socket
    // can otherwise leave it hanging indefinitely (S1 review carry).
    // `closeIdleConnections`/`closeAllConnections` ("http: added connection
    // closing methods", nodejs/node#42812) exist on every Node this repo
    // supports (floor 22.19, package.json#engines), so the `typeof` guard is
    // only there for a non-node http server double passed in by a test.
    // Calling both explicitly rather than trusting `close()` is deliberate:
    // whether `close()` alone releases idle keep-alive sockets has varied by
    // release (nodejs/node#52336), and calling both is correct either way, a
    // harmless no-op wherever `close()` already handled it.
    if (typeof server.closeIdleConnections === "function") server.closeIdleConnections()
    if (typeof server.closeAllConnections === "function") server.closeAllConnections()
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((err) => (err ? rejectClose(err) : resolveClose()))
    })
  }

  return { server, rebuild, close, url: `http://127.0.0.1:${actualPort}`, port: actualPort }
}

/**
 * Best-effort browser launch (spec-plan.md S1: "--no-open: 默认行为打开浏览器
 * ... 若无则 spawn open (darwin) / xdg-open (linux)"). Nothing
 * in this repo already opens URLs (`./update.ts` runs `npm`, not
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
    const child = spawnHidden(command, [url], { stdio: "ignore", detached: true })
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
  /** `--theme-file <path>` — see {@link ServeOptions.themeFilePath}. */
  themeFilePath?: string
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
  const handle = await createServeServer({ target, port: opts.port, cwd: opts.cwd, themeFilePath: opts.themeFilePath })
  console.log(`pptfast serve: ${handle.url} (Ctrl+C to stop)`)
  if (opts.open !== false) openBrowser(handle.url)
  process.on("SIGINT", () => {
    void handle.close().then(
      () => process.exit(0),
      () => process.exit(1),
    )
  })
}
