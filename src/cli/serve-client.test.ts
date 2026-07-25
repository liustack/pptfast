// @vitest-environment jsdom
// (vitest.config.ts already defaults to jsdom — serve.test.ts is the one
// that opts *out* to node for its real-http/fs tests. Pinned explicitly here
// so the two files read as an intentional pair, not an accident of config.)
import { afterEach, describe, expect, it, vi } from "vitest"
import { SERVE_CLIENT_JS } from "./serve"

/**
 * Runs {@link SERVE_CLIENT_JS} as a top-level script in this file's jsdom
 * global scope — the same "a `<script>` tag just ran" semantics a real
 * served page gets, not a re-parse of it as a template to grep (that's what
 * `preview-html.test.ts`'s own tests do for the *other* injected script,
 * `buildPreviewHtml`'s `JS`; this file's subject is meant to run, not just
 * exist). `new Function(...)`, not `eval`, matching the one other place this
 * codebase already executes page-injected source under jsdom:
 * `browser-audit.test.ts`'s `serializePageFunction` round-trip test.
 */
function runServeClientScript(): void {
  new Function(SERVE_CLIENT_JS)()
}

/**
 * jsdom (this project's vitest default environment) ships no `EventSource`
 * at all — confirmed absent, not merely present-but-throws-later. Stubbed
 * with a no-op so `SERVE_CLIENT_JS`'s live-reload half doesn't log a
 * `ReferenceError` to the console on every test in this file. Live reload
 * itself is out of scope here by design: `serve.test.ts`'s own SSE tests
 * already exercise the real `EventSource`/reload wiring end to end (a real
 * client over real HTTP) — this file's only subject is the *other*,
 * independently try/catch-wrapped half (see `SERVE_CLIENT_JS`'s own doc
 * comment, `./serve.ts`): the revision-request submit button.
 */
class FakeEventSource {
  addEventListener(): void {}
}

/**
 * Minimal DOM fixture: the one element `SERVE_CLIENT_JS`'s submit half reads
 * directly, `#pf-export-btn` (`buildPreviewHtml`, `./preview-html.ts`'s own
 * "Export revision requests" button). The status line and the
 * download-fallback link are deliberately not part of the fixture — they're
 * the script's own output, created fresh by its `setUpRevisionRequestSubmit()`
 * on every run, not something a caller pre-renders.
 */
function renderFixtureAndRunClient(): HTMLButtonElement {
  document.body.innerHTML = `<button type="button" id="pf-export-btn">Export revision requests</button>`
  vi.stubGlobal("EventSource", FakeEventSource)
  runServeClientScript()
  // The submit button keeps the original's id: setUpRevisionRequestSubmit()
  // clones the original node (cloneNode copies attributes, including id,
  // never listeners) and replaces it in place, rather than rewiring the
  // original directly — see SERVE_CLIENT_JS's own doc comment for why
  // (cloning is what keeps the untouched download fallback reachable).
  return document.getElementById("pf-export-btn") as HTMLButtonElement
}

function submitStatus(): HTMLElement {
  return document.getElementById("pptfast-serve-submit-status") as HTMLElement
}

type WindowWithHook = typeof window & { __pptfastBuildExportBlob?: () => Blob }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ""
  delete (window as WindowWithHook).__pptfastBuildExportBlob
})

describe("SERVE_CLIENT_JS — revision-request submit (S2 rework carry, jsdom-executed)", () => {
  it("(a) hook missing (window.__pptfastBuildExportBlob undefined): submit shows the failure status text, fetch never called", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const submitBtn = renderFixtureAndRunClient()
    expect(typeof (window as WindowWithHook).__pptfastBuildExportBlob).toBe("undefined")

    submitBtn.click()

    // Synchronous branch (no promise involved) — the assertion can run
    // immediately after click(), same as the real click handler.
    expect(submitStatus().textContent).toContain("failed to submit revision request")
    expect(submitStatus().textContent).toContain("export function unavailable")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("(b) hook present but throws synchronously: same failure surface, fetch never called", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const submitBtn = renderFixtureAndRunClient()
    ;(window as WindowWithHook).__pptfastBuildExportBlob = () => {
      throw new Error("synchronous boom")
    }

    submitBtn.click()

    // The throw lands inside a `Promise.resolve().then(...)` chain (see
    // SERVE_CLIENT_JS's own doc comment for why: so a synchronous throw and
    // an async rejection share one .catch), so the status update is
    // asynchronous even though the hook itself never awaits anything.
    await vi.waitFor(() => {
      expect(submitStatus().textContent).toContain("failed to submit revision request")
    })
    expect(submitStatus().textContent).toContain("synchronous boom")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("(c) hook returns a Blob: fetch is called once, POSTing the blob's own text to /revision-request", async () => {
    const payload = {
      version: "1",
      deck: "serve-client-test-deck",
      requests: [{ pageId: "p-a", annotation: "tighten this copy", createdAt: "2026-07-25T00:00:00.000Z" }],
    }
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" })
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const submitBtn = renderFixtureAndRunClient()
    ;(window as WindowWithHook).__pptfastBuildExportBlob = () => blob

    submitBtn.click()

    await vi.waitFor(() => {
      expect(submitStatus().textContent).toContain("Revision request saved to the deck directory")
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("/revision-request")
    expect(init.method).toBe("POST")
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" })
    // The exact bytes POSTed are the blob's own serialization — not a
    // re-derivation of `payload` — matching production: the client never
    // re-serializes window.__pptfastBuildExportBlob()'s return value, only
    // reads it via blob.text().
    expect(init.body).toBe(await blob.text())
  })
})
