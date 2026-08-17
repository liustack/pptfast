// @vitest-environment node
//
// This file used to execute `SERVE_CLIENT_JS` inside jsdom to drive the
// revision-request submit flow end to end — hook missing, hook throwing,
// hook returning a Blob. That flow is gone, and so is the machinery that
// exercised it.
//
// What remains is a pin on the removal itself. The submit control read its
// payload from `window.__pptfastBuildExportBlob`, the export function the
// preview's annotation panel installed; the panel was removed on 2026-08-16
// (see `preview-html.test.ts`), which left the hook hunting for a button
// that no longer existed and a payload nothing produced. Dead on both ends,
// and silently — `serve.test.ts` kept passing because it searched the served
// HTML for `pf-export-btn`, a string that still occurred inside the injected
// client's own source. It was matching script text, not the DOM.
import { describe, expect, it } from "vitest"
import { SERVE_CLIENT_JS } from "./serve"

describe("SERVE_CLIENT_JS", () => {
  it("carries no revision-request submit flow, because nothing produces its payload", () => {
    expect(SERVE_CLIENT_JS).not.toContain("__pptfastBuildExportBlob")
    expect(SERVE_CLIENT_JS).not.toContain("setUpRevisionRequestSubmit")
    expect(SERVE_CLIENT_JS).not.toContain("/revision-request")
  })

  it("is live reload and nothing else", () => {
    expect(SERVE_CLIENT_JS).toContain("setUpLiveReload")
    expect(SERVE_CLIENT_JS).toContain("EventSource")
  })
})
