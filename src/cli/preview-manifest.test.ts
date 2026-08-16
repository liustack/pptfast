// @vitest-environment node
import { describe, expect, it } from "vitest"
import { buildPreviewManifest, PREVIEW_MANIFEST_VERSION } from "./preview-manifest"

const base = {
  title: "deck",
  pptfastVersion: "9.9.9",
  width: 1280,
  height: 720,
}

describe("buildPreviewManifest", () => {
  it("lists every page with the file it was written to", () => {
    const m = buildPreviewManifest({
      ...base,
      slides: [
        { index: 0, type: "cover", file: "001-cover.svg" },
        { index: 1, type: "content", file: "002-content.svg" },
      ],
    })
    expect(m.manifestVersion).toBe(PREVIEW_MANIFEST_VERSION)
    expect(m.slide).toEqual({ width: 1280, height: 720 })
    expect(m.pages.map((p) => [p.page, p.type, p.file])).toEqual([
      [1, "cover", "001-cover.svg"],
      [2, "content", "002-content.svg"],
    ])
  })

  it("derives page ids from the deck's own slide ids, not from array position", () => {
    // A consumer holds these ids: a selection, a scroll position, a comment
    // anchored to a page. They have to survive a re-render that did not
    // change that page, so a slide id wins over position wherever it exists.
    const m = buildPreviewManifest({
      ...base,
      slides: [
        { index: 0, type: "cover", id: "Q2 Cover", file: "a.svg" },
        { index: 1, type: "content", file: "b.svg" },
      ],
    })
    expect(m.pages[0]!.id).toBe("q2-cover")
    expect(m.pages[0]!.slideId).toBe("Q2 Cover")
    // No id on the deck's side: fall back to the page number, still stable.
    expect(m.pages[1]!.id).toBe("page-002")
    expect(m.pages.every((p) => /^[a-z0-9-]+$/.test(p.id))).toBe(true)
  })

  it("attaches each finding to the page it belongs to", () => {
    const m = buildPreviewManifest({
      ...base,
      slides: [
        { index: 0, type: "cover", file: "a.svg" },
        { index: 1, type: "content", file: "b.svg" },
      ],
      findings: [
        { page: 2, code: "overflow", message: "too long" },
        { page: 2, code: "low-contrast", message: "too faint" },
      ],
    })
    expect(m.pages[0]!.findings).toBeUndefined()
    expect(m.pages[1]!.findings).toEqual([
      { code: "overflow", message: "too long" },
      { code: "low-contrast", message: "too faint" },
    ])
  })

  it("distinguishes an audit that ran and found nothing from one that never ran", () => {
    // The distinction this whole surface exists to protect: a consumer that
    // renders "no findings" for a deck nobody audited is reporting a clean
    // bill of health it never earned.
    const audited = buildPreviewManifest({
      ...base,
      slides: [{ index: 0, type: "cover", file: "a.svg" }],
      findings: [],
      checks: { svg: "completed", pixels: "not-requested" },
    })
    expect(audited.checks).toEqual({ svg: "completed", pixels: "not-requested" })
    expect(audited.auditNote).toBeUndefined()

    const skipped = buildPreviewManifest({
      ...base,
      slides: [{ index: 0, type: "cover", file: "a.svg", placeholder: true }],
      auditNote: "audit skipped — deck has unfilled placeholder pages",
    })
    expect(skipped.checks).toBeUndefined()
    expect(skipped.auditNote).toMatch(/skipped/)
    // And the unfilled page says so, so no consumer can present it as finished.
    expect(skipped.pages[0]!.placeholder).toBe(true)
  })
})
