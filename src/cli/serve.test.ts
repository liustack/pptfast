// @vitest-environment node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import http from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { installNodePlatform } from "@/platform/node"
import { createServeServer, SERVE_CLIENT_SCRIPT_ID, type ServeHandle } from "./serve"

installNodePlatform()

const VALID_IR = {
  version: "4",
  filename: "serve-test",
  theme: { id: "tech" },
  slides: [
    { type: "cover", heading: "Serve Test" },
    { type: "content", heading: "Body", components: [{ type: "paragraph", text: "hello from serve" }] },
  ],
}

// Same shape commands.test.ts's own `bad.json` uses to pin runValidate's
// "invalid IR" rejection — reused here to trigger the exact same rejection
// out of createServeServer's own initial build.
const INVALID_IR_SHAPE = { version: "4" }

// 1x1 red PNG — the same fixture commands.test.ts uses to exercise a real
// deck-dir `assets/` asset (see its own "assets/ auto-registration reaches
// rendered output" describe block).
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

function makeDir(prefix = "pptfast-serve-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}


/** 5 pages (cover + 3 content + ending) clears "spacious" pacing's
 *  page-count floor with room to leave some unfilled — same fixture-sizing
 *  rationale as commands.test.ts's own makeDeckPlan. */
function makeDeckPlan(): Record<string, unknown> {
  return {
    version: "1",
    narrative: "boardroom-report",
    theme: "consulting",
    filename: "serve-deck",
    pages: [
      { id: "p-cover", type: "cover", heading: "Serve Deck" },
      { id: "p-a", type: "content", heading: "Segment A" },
      { id: "p-b", type: "content", heading: "Segment B" },
      { id: "p-c", type: "content", heading: "Segment C" },
      { id: "p-ending", type: "ending", heading: "Thanks" },
    ],
  }
}

// ── raw HTTP/SSE helpers ─────────────────────────────────────────────────
// A raw node:http request, not fetch: the SSE test needs one anyway (reading
// a stream frame-by-frame), so every helper here shares the one primitive
// rather than mixing fetch + http.

function get(port: number, path: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolvePromise, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path }, (res) => {
      let body = ""
      res.setEncoding("utf8")
      res.on("data", (chunk: string) => (body += chunk))
      res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on("error", reject)
  })
}

/** Headers-only variant — `/events` never ends its response on its own (a
 *  live SSE stream), so `get()`'s "wait for the body to finish" shape would
 *  hang forever against it. Destroys the connection right after reading the
 *  status/headers instead of draining a body that never completes. */
function getHeaders(port: number, path: string): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolvePromise, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path }, (res) => {
      resolvePromise({ status: res.statusCode ?? 0, headers: res.headers })
      res.destroy()
      req.destroy()
    })
    req.on("error", reject)
  })
}

/** POST helper — same shape as `get()`, but `http.request` (not `http.get`)
 *  since it needs to set the method and write a body. `contentType`
 *  defaults to JSON since every real caller of `/revision-request` sends
 *  that; the 413 test overrides it to `text/plain` purely so its
 *  deliberately-not-JSON oversized payload reads honestly. */
function post(
  port: number,
  path: string,
  body: string,
  contentType = "application/json",
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolvePromise, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "POST", headers: { "Content-Type": contentType } },
      (res) => {
        let resBody = ""
        res.setEncoding("utf8")
        res.on("data", (chunk: string) => (resBody += chunk))
        res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, headers: res.headers, body: resBody }))
      },
    )
    req.on("error", reject)
    req.end(body)
  })
}

interface SseEvent {
  event: string
  data: string
}

/** A raw http request reading `/events`'s stream, parsing SSE frames
 *  (`event:`/`data:` lines terminated by a blank line) and letting a test
 *  await the next frame of a given event name — event-driven, not polling.
 *  Frames with no `event:` line (the `retry:` hint, `: heartbeat` comment
 *  pings) are intentionally never surfaced: nothing here cares about either,
 *  only the `reload`/`error` frames `createServeServer` actually names. */
function connectSSE(port: number): {
  events: SseEvent[]
  waitFor: (eventName: string, timeoutMs?: number) => Promise<SseEvent>
  close: () => void
} {
  const events: SseEvent[] = []
  const waiters: Array<{ eventName: string; resolve: (e: SseEvent) => void }> = []
  let buffer = ""

  function deliver(evt: SseEvent): void {
    events.push(evt)
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i]!.eventName === evt.event) {
        waiters[i]!.resolve(evt)
        waiters.splice(i, 1)
      }
    }
  }

  const req = http.get({ host: "127.0.0.1", port, path: "/events" }, (res) => {
    res.setEncoding("utf8")
    res.on("data", (chunk: string) => {
      buffer += chunk
      let idx: number
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        let eventName: string | undefined
        let data = ""
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim()
          else if (line.startsWith("data:")) data = line.slice(5).trim()
        }
        if (eventName !== undefined) deliver({ event: eventName, data })
      }
    })
  })
  req.on("error", () => {
    // Torn down via close()/the server's own shutdown — a reset after that
    // is expected, not a test failure.
  })

  function waitFor(eventName: string, timeoutMs = 3000): Promise<SseEvent> {
    const already = events.find((e) => e.event === eventName)
    if (already) return Promise.resolve(already)
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for SSE event "${eventName}"`)), timeoutMs)
      waiters.push({
        eventName,
        resolve: (e) => {
          clearTimeout(timer)
          resolvePromise(e)
        },
      })
    })
  }

  return { events, waitFor, close: () => req.destroy() }
}

const openHandles: ServeHandle[] = []
async function startServe(target: string, opts: { port?: number; cwd?: string } = {}): Promise<ServeHandle> {
  const handle = await createServeServer({ target, port: opts.port ?? 0, cwd: opts.cwd })
  openHandles.push(handle)
  return handle
}

afterEach(async () => {
  await Promise.all(openHandles.splice(0).map((h) => h.close()))
})

describe("createServeServer — GET /", () => {
  it("200s with the rendered HTML, containing a real <svg> marker from the actual render", async () => {
    const dir = await makeDir()
    const irPath = join(dir, "deck.json")
    await writeFile(irPath, JSON.stringify(VALID_IR))
    const handle = await startServe(irPath)
    const res = await get(handle.port, "/")
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toMatch(/text\/html/)
    expect(res.body).toContain("<svg")
    expect(res.body).toContain("hello from serve")
  })
})

describe("createServeServer — GET /events", () => {
  it("responds with an SSE content-type", async () => {
    const dir = await makeDir()
    const irPath = join(dir, "deck.json")
    await writeFile(irPath, JSON.stringify(VALID_IR))
    const handle = await startServe(irPath)
    const res = await getHeaders(handle.port, "/events")
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/)
  })
})

describe("createServeServer — 404", () => {
  it("404s any other path", async () => {
    const dir = await makeDir()
    const irPath = join(dir, "deck.json")
    await writeFile(irPath, JSON.stringify(VALID_IR))
    const handle = await startServe(irPath)
    const res = await get(handle.port, "/nope")
    expect(res.status).toBe(404)
  })
})

describe("createServeServer — startup failures", () => {
  it("rejects when the initial target fails to build (invalid IR), never starting a server", async () => {
    const dir = await makeDir()
    const irPath = join(dir, "bad.json")
    await writeFile(irPath, JSON.stringify(INVALID_IR_SHAPE))
    await expect(createServeServer({ target: irPath, port: 0 })).rejects.toThrow(/invalid IR/)
  })

  it("rejects with a clean error when the port is already in use", async () => {
    const dir = await makeDir()
    const irPath = join(dir, "deck.json")
    await writeFile(irPath, JSON.stringify(VALID_IR))
    const handle1 = await startServe(irPath)
    await expect(createServeServer({ target: irPath, port: handle1.port })).rejects.toThrow(/already in use/)
  })
})

describe("createServeServer — watch + rebuild (bare IR file)", () => {
  it("rebuilds and pushes an SSE reload event when the watched IR file changes", async () => {
    const dir = await makeDir()
    const irPath = join(dir, "deck.json")
    await writeFile(irPath, JSON.stringify(VALID_IR))
    const handle = await startServe(irPath)
    const sse = connectSSE(handle.port)

    const updated = { ...VALID_IR, slides: [...VALID_IR.slides, { type: "ending", heading: "The End" }] }
    await writeFile(irPath, JSON.stringify(updated))
    await sse.waitFor("reload")

    const res = await get(handle.port, "/")
    expect(res.body).toContain("The End")
    sse.close()
  })
})

describe("createServeServer — watch + rebuild (deck project directory)", () => {
  it("rebuilds when a pages/*.json file changes", async () => {
    const deckDir = await makeDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
    await mkdir(join(deckDir, "pages"))
    await writeFile(
      join(deckDir, "pages", "p-a.json"),
      JSON.stringify({ components: [{ type: "paragraph", text: "first draft" }] }),
    )
    const handle = await startServe(deckDir)
    const initial = await get(handle.port, "/")
    expect(initial.body).toContain("first draft")

    const sse = connectSSE(handle.port)
    await writeFile(
      join(deckDir, "pages", "p-a.json"),
      JSON.stringify({ components: [{ type: "paragraph", text: "revised draft" }] }),
    )
    await sse.waitFor("reload")

    const revised = await get(handle.port, "/")
    expect(revised.body).toContain("revised draft")
    sse.close()
  })

  it("survives a mid-edit malformed JSON save (error event, server stays alive) and recovers on the next valid save", async () => {
    const deckDir = await makeDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
    await mkdir(join(deckDir, "pages"))
    await writeFile(
      join(deckDir, "pages", "p-a.json"),
      JSON.stringify({ components: [{ type: "paragraph", text: "first draft" }] }),
    )
    const handle = await startServe(deckDir)
    const beforeBody = (await get(handle.port, "/")).body

    const sse = connectSSE(handle.port)
    // Simulates an editor saving mid-write: the file is momentarily not
    // valid JSON.
    await writeFile(join(deckDir, "pages", "p-a.json"), "{not valid json")
    const errorEvent = await sse.waitFor("error")
    const payload = JSON.parse(errorEvent.data) as { message: string }
    expect(payload.message).toMatch(/JSON/)

    // The server must still be alive and still serving the last-good HTML —
    // a failed rebuild must never clobber the cache or crash the process.
    const duringError = await get(handle.port, "/")
    expect(duringError.status).toBe(200)
    expect(duringError.body).toBe(beforeBody)

    // A subsequent valid save recovers: reload fires and the cache updates.
    await writeFile(
      join(deckDir, "pages", "p-a.json"),
      JSON.stringify({ components: [{ type: "paragraph", text: "recovered draft" }] }),
    )
    await sse.waitFor("reload")
    const recovered = await get(handle.port, "/")
    expect(recovered.body).toContain("recovered draft")
    sse.close()
  })

  // S1 review carry: task S1's own watch-coverage tests only exercised
  // pages/*.json — these two round out the other two watch roots
  // (`watchRoots`, `./serve.ts`) with dedicated coverage of their own.

  it("rebuilds when a file appears inside assets/ (dedicated assets/ watch coverage)", async () => {
    const deckDir = await makeDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
    await mkdir(join(deckDir, "pages"))
    await writeFile(
      join(deckDir, "pages", "p-a.json"),
      JSON.stringify({ components: [{ type: "image", asset_id: "logo" }] }),
    )
    await mkdir(join(deckDir, "assets"))
    await writeFile(join(deckDir, "assets", "logo.png"), PNG_1PX)
    const handle = await startServe(deckDir)
    const initial = await get(handle.port, "/")
    expect(initial.body).toContain("data:image/png;base64")

    const sse = connectSSE(handle.port)
    // A second, unreferenced file — this test's only job is proving the
    // assets/ *directory* is watched at all (task S1's own coverage was
    // pages/*.json only), not re-proving asset-content resolution
    // (commands.test.ts's "assets/ auto-registration reaches rendered
    // output" already covers that).
    await writeFile(join(deckDir, "assets", "extra.png"), PNG_1PX)
    await sse.waitFor("reload")
    sse.close()
  })

  it("rebuilds when only deck.spec.json changes, with no pages/ edit", async () => {
    const deckDir = await makeDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
    await mkdir(join(deckDir, "pages"))
    await writeFile(
      join(deckDir, "pages", "p-a.json"),
      JSON.stringify({ components: [{ type: "paragraph", text: "steady content" }] }),
    )
    const handle = await startServe(deckDir)
    const initial = await get(handle.port, "/")
    expect(initial.body).toContain("serve-deck")

    const sse = connectSSE(handle.port)
    const renamedPlan = { ...makeDeckPlan(), filename: "serve-deck-renamed" }
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(renamedPlan))
    await sse.waitFor("reload")

    const revised = await get(handle.port, "/")
    expect(revised.body).toContain("serve-deck-renamed")
    sse.close()
  })
})

describe("createServeServer — rebuild()", () => {
  it("can be called directly, without waiting on the fs.watch debounce", async () => {
    const dir = await makeDir()
    const irPath = join(dir, "deck.json")
    await writeFile(irPath, JSON.stringify(VALID_IR))
    const handle = await startServe(irPath)

    const updated = { ...VALID_IR, filename: "serve-test-renamed" }
    await writeFile(irPath, JSON.stringify(updated))
    await handle.rebuild()

    const res = await get(handle.port, "/")
    expect(res.body).toContain("serve-test-renamed")
  })
})

// ── task S2: revision-request POST loop + serve-mode client injection ────

describe("createServeServer — serve-mode client injection", () => {
  it("GET / carries the injected client's marker, on top of the normal preview markup", async () => {
    const dir = await makeDir()
    const irPath = join(dir, "deck.json")
    await writeFile(irPath, JSON.stringify(VALID_IR))
    const handle = await startServe(irPath)
    const res = await get(handle.port, "/")
    expect(res.body).toContain(SERVE_CLIENT_SCRIPT_ID)
    // Still the same preview markup the non-serve download path renders —
    // injection is additive, not a replacement.
    expect(res.body).toContain("<svg")
    expect(res.body).toContain("pf-filmstrip")
    // Not `pf-export-btn`: that assertion kept passing after the button was
    // removed from the preview, because the string still occurred inside the
    // injected client's own source. It was matching the script text, not the
    // DOM — a false green, and exactly what let the dead submit hook sit
    // here unnoticed.
  })
})

describe("createServeServer — /revision-request, removed", () => {
  it("no longer accepts a revision-request POST", async () => {
    // The endpoint's only client was the preview's annotation export, which
    // was removed on 2026-08-16. An endpoint with no producer is a
    // half-feature, so the whole path went with it — the revise loop is now
    // "screenshot the page, tell the agent", which is what it had become in
    // practice anyway.
    const dir = await makeDir()
    const irPath = join(dir, "deck.json")
    await writeFile(irPath, JSON.stringify(VALID_IR))
    const handle = await startServe(irPath)
    const res = await post(handle.port, "/revision-request", JSON.stringify({ version: 1, requests: [] }))
    expect(res.status).toBe(404)
  })
})
