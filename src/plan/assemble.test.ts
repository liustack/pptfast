import { describe, expect, it } from "vitest"
import { PptfastError } from "../errors"
import { PptxIRSchema, type PptxIR } from "../ir"
import { resolveEffectiveLayoutId } from "../svg/effective-layout"
import { assembleDeck, disassembleDeck, type PageContent } from "./assemble"

// ── fixtures ─────────────────────────────────────────────────────────────

/** 4 pages clears the "presentation" delivery's page-count floor (spec §5:
 *  4-16) with the smallest fixture — every test below opts into that
 *  delivery explicitly so plan-level page-count noise never has to be
 *  reasoned about alongside whatever the test actually cares about. */
function makePlan(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: "1",
    scenario: { delivery: "presentation" },
    theme: "consulting",
    filename: "q3-review",
    pages: [
      { id: "p-cover", type: "cover", heading: "Q3 Review" },
      { id: "p-kpi", type: "content", heading: "Revenue is up" },
      { id: "p-detail", type: "content", heading: "Detail breakdown" },
      { id: "p-ending", type: "ending", heading: "Thanks" },
    ],
    ...extra,
  }
}

describe("assembleDeck", () => {
  // ── step 1 ──────────────────────────────────────────────────────────

  describe("step 1 — invalid plan", () => {
    it("throws PptfastError with validatePlan's own formatted issues", () => {
      expect(() => assembleDeck({ pages: [] }, {})).toThrow(PptfastError)
      expect(() => assembleDeck({ pages: [] }, {})).toThrow(/invalid plan.*no pages/s)
    })

    it("surfaces a duplicate-id plan error through the same gate", () => {
      const dup = makePlan({
        pages: [
          { id: "p-cover", type: "cover", heading: "Cover" },
          { id: "dup", type: "content", heading: "A" },
          { id: "dup", type: "content", heading: "B" },
          { id: "p-ending", type: "ending", heading: "End" },
        ],
      })
      expect(() => assembleDeck(dup, {})).toThrow(/invalid plan/)
      expect(() => assembleDeck(dup, {})).toThrow(/duplicate page id "dup"/)
    })
  })

  // ── step 2 ──────────────────────────────────────────────────────────

  describe("step 2 — locked-field protection", () => {
    it('rejects a page file that redeclares "heading"', () => {
      const rawPages: Record<string, unknown> = { "p-kpi": { heading: "sneaky" } }
      expect(() => assembleDeck(makePlan(), rawPages as Record<string, PageContent>)).toThrow(
        /page "p-kpi": "heading" is locked by the plan — remove it from the page file/,
      )
    })

    it('rejects a page file that redeclares "type"', () => {
      const rawPages: Record<string, unknown> = { "p-kpi": { type: "chapter" } }
      expect(() => assembleDeck(makePlan(), rawPages as Record<string, PageContent>)).toThrow(
        /page "p-kpi": "type" is locked by the plan — remove it from the page file/,
      )
    })

    it("rejects even when the locked key's own value is explicitly undefined (Object.hasOwn, not a definedness check)", () => {
      const rawPages: Record<string, unknown> = { "p-kpi": { heading: undefined } }
      expect(() => assembleDeck(makePlan(), rawPages as Record<string, PageContent>)).toThrow(/"heading" is locked/)
    })

    it("reports the locked-field violation before an unrelated orphan-key violation", () => {
      const rawPages: Record<string, unknown> = {
        "p-kpi": { heading: "sneaky" }, // locked-field violation, valid plan id
        "totally-not-a-page": {}, // orphan violation, unrelated id
      }
      expect(() => assembleDeck(makePlan(), rawPages as Record<string, PageContent>)).toThrow(/is locked by the plan/)
    })

    it("rejects a null page content value with a readable error instead of a native TypeError", () => {
      const rawPages: Record<string, unknown> = { "p-kpi": null }
      expect(() => assembleDeck(makePlan(), rawPages as Record<string, PageContent>)).toThrow(PptfastError)
      expect(() => assembleDeck(makePlan(), rawPages as Record<string, PageContent>)).toThrow(
        /page "p-kpi": page content must be an object/,
      )
    })

    it("rejects a string page content value the same way", () => {
      const rawPages: Record<string, unknown> = { "p-kpi": "not-an-object" }
      expect(() => assembleDeck(makePlan(), rawPages as Record<string, PageContent>)).toThrow(
        /page "p-kpi": page content must be an object/,
      )
    })
  })

  // ── step 3 ──────────────────────────────────────────────────────────

  describe("step 3 — orphan pages keys", () => {
    it("rejects a pages entry whose id is not in the plan", () => {
      const pages: Record<string, PageContent> = { "not-a-real-page": {} }
      expect(() => assembleDeck(makePlan(), pages)).toThrow(/orphan page id "not-a-real-page"/)
      expect(() => assembleDeck(makePlan(), pages)).toThrow(/delete the page file or add the page to the plan/)
    })

    it("lists multiple orphan ids together in one error", () => {
      const pages: Record<string, PageContent> = { "orphan-a": {}, "orphan-b": {} }
      expect(() => assembleDeck(makePlan(), pages)).toThrow(/"orphan-a"/)
      expect(() => assembleDeck(makePlan(), pages)).toThrow(/"orphan-b"/)
    })
  })

  // ── step 4 ──────────────────────────────────────────────────────────

  describe("step 4 — missing pages become placeholders", () => {
    it("fills an unfilled plan page with a placeholder slide", () => {
      const { ir } = assembleDeck(makePlan(), {})
      const kpi = ir.slides.find((s) => s.id === "p-kpi")
      expect(kpi).toMatchObject({ id: "p-kpi", type: "content", heading: "Revenue is up", placeholder: true })
    })

    it("carries the plan page's summary into the placeholder's subheading", () => {
      const withSummary = makePlan({
        pages: [
          { id: "p-cover", type: "cover", heading: "Q3 Review" },
          { id: "p-kpi", type: "content", heading: "Revenue is up", summary: "Q3 revenue beat guidance by 12%" },
          { id: "p-detail", type: "content", heading: "Detail breakdown" },
          { id: "p-ending", type: "ending", heading: "Thanks" },
        ],
      })
      const { ir } = assembleDeck(withSummary, {})
      const kpi = ir.slides.find((s) => s.id === "p-kpi")
      expect(kpi?.subheading).toBe("Q3 revenue beat guidance by 12%")
    })

    it("leaves subheading unset on a placeholder whose plan page has no summary", () => {
      const { ir } = assembleDeck(makePlan(), {})
      const kpi = ir.slides.find((s) => s.id === "p-kpi")
      expect(kpi?.subheading).toBeUndefined()
    })
  })

  // ── step 5 ──────────────────────────────────────────────────────────

  describe("step 5 — present pages", () => {
    it("injects id/type/heading from the plan and content fields from the page record", () => {
      const pages: Record<string, PageContent> = {
        "p-kpi": {
          components: [{ type: "paragraph", text: "Revenue grew 12% QoQ" }],
          layout: "kpi-strip",
          arrangement: "kpi_focus",
          footnote: "unaudited",
        },
      }
      const { ir } = assembleDeck(makePlan(), pages)
      const kpi = ir.slides.find((s) => s.id === "p-kpi")
      expect(kpi).toMatchObject({
        id: "p-kpi",
        type: "content",
        heading: "Revenue is up",
        layout: "kpi-strip",
        arrangement: "kpi_focus",
        footnote: "unaudited",
        components: [{ type: "paragraph", text: "Revenue grew 12% QoQ" }],
      })
      expect(kpi?.placeholder).toBeUndefined()
    })

    it("never lets plan-only rhythm/focus/summary reach the IR for a present page", () => {
      const withAnchors = makePlan({
        pages: [
          { id: "p-cover", type: "cover", heading: "Q3 Review" },
          {
            id: "p-kpi",
            type: "content",
            heading: "Revenue is up",
            rhythm: "anchor",
            focus: "kpi_cards",
            summary: "should not leak",
          },
          { id: "p-detail", type: "content", heading: "Detail breakdown" },
          { id: "p-ending", type: "ending", heading: "Thanks" },
        ],
      })
      const { ir } = assembleDeck(withAnchors, { "p-kpi": {} })
      const kpi = ir.slides.find((s) => s.id === "p-kpi") as unknown as Record<string, unknown>
      expect(kpi.rhythm).toBeUndefined()
      expect(kpi.focus).toBeUndefined()
      expect(kpi.subheading).toBeUndefined()
    })

    it("applies component-level schema defaults (e.g. image.fit) via the final IR parse", () => {
      const rawPages: Record<string, unknown> = {
        "p-kpi": { components: [{ type: "image", asset_id: "logo" }] },
      }
      const { ir } = assembleDeck(makePlan(), rawPages as Record<string, PageContent>)
      const kpi = ir.slides.find((s) => s.id === "p-kpi")
      expect(kpi?.components).toEqual([{ type: "image", asset_id: "logo", fit: "cover" }])
    })
  })

  // ── step 6 ──────────────────────────────────────────────────────────

  describe("step 6 — top-level field passthrough", () => {
    it("passes scenario/theme/filename through from the plan", () => {
      const { ir } = assembleDeck(makePlan(), {})
      expect(ir.version).toBe("3")
      expect(ir.scenario).toEqual({ delivery: "presentation" })
      expect(ir.theme).toEqual({ id: "consulting" })
      expect(ir.filename).toBe("q3-review")
    })

    it("passes brand through into ir.brand when the plan sets it", () => {
      const { ir } = assembleDeck(makePlan({ brand: { logo_asset_id: "logo-1", position: "tl" } }), {})
      expect(ir.brand).toEqual({ logo_asset_id: "logo-1", position: "tl" })
    })

    it("lets IR schema defaults handle theme/filename/meta when the plan omits them", () => {
      const minimal = {
        scenario: { delivery: "presentation" },
        pages: [
          { id: "p-cover", type: "cover", heading: "Cover" },
          { id: "p-body", type: "content", heading: "Body" },
          { id: "p-body-2", type: "content", heading: "Body 2" },
          { id: "p-ending", type: "ending", heading: "Ending" },
        ],
      }
      const { ir } = assembleDeck(minimal, {})
      expect(ir.theme).toEqual({ id: "consulting" })
      expect(ir.filename).toBe("presentation")
      expect(ir.meta).toEqual({})
    })
  })

  // ── step 7 ──────────────────────────────────────────────────────────

  describe("step 7 — seed", () => {
    it("passes an explicit plan seed through and reports no generatedSeed", () => {
      const { ir, generatedSeed } = assembleDeck(makePlan({ seed: 424242 }), {})
      expect(ir.seed).toBe(424242)
      expect(generatedSeed).toBeUndefined()
    })

    it("generates a deterministic integer seed when the plan omits one, and reports it as generatedSeed", () => {
      const { ir, generatedSeed } = assembleDeck(makePlan(), {})
      expect(Number.isInteger(ir.seed)).toBe(true)
      expect(generatedSeed).toBe(ir.seed)
    })

    it("generates the same seed across repeated calls on the same plan", () => {
      const a = assembleDeck(makePlan(), {})
      const b = assembleDeck(makePlan(), {})
      expect(a.generatedSeed).toBe(b.generatedSeed)
    })

    it("generates a different seed when the page id sequence differs", () => {
      const a = assembleDeck(makePlan(), {})
      const reordered = makePlan({
        pages: [
          { id: "p-cover", type: "cover", heading: "Q3 Review" },
          { id: "p-detail", type: "content", heading: "Detail breakdown" },
          { id: "p-kpi", type: "content", heading: "Revenue is up" },
          { id: "p-ending", type: "ending", heading: "Thanks" },
        ],
      })
      const b = assembleDeck(reordered, {})
      expect(a.generatedSeed).not.toBe(b.generatedSeed)
    })

    it("stays the same regardless of which pages happen to be filled in yet", () => {
      const a = assembleDeck(makePlan(), {})
      const b = assembleDeck(makePlan(), { "p-kpi": { footnote: "filled in later" } })
      expect(a.generatedSeed).toBe(b.generatedSeed)
    })
  })

  // ── step 8 ──────────────────────────────────────────────────────────

  describe("step 8 — idempotence", () => {
    it("two calls with the same plan and pages produce a deep-equal result", () => {
      const pages: Record<string, PageContent> = {
        "p-kpi": { components: [{ type: "paragraph", text: "hello" }], footnote: "note" },
      }
      const a = assembleDeck(makePlan(), pages)
      const b = assembleDeck(makePlan(), pages)
      expect(a).toEqual(b)
    })

    it("stays deep-equal even when the plan/pages omit seed (generation is deterministic too)", () => {
      const a = assembleDeck(makePlan(), {})
      const b = assembleDeck(makePlan(), {})
      expect(a).toEqual(b)
    })
  })

  // ── materialization (W4 design decision 10) ────────────────────────

  describe("materializes effective layouts", () => {
    it("fills in a layout for every page type when the page file omits one", () => {
      const { ir } = assembleDeck(makePlan(), {})
      for (const slide of ir.slides) {
        expect(slide.layout, `slide "${slide.id}" (${slide.type})`).toEqual(expect.any(String))
      }
    })

    it("leaves an explicit page-file layout untouched", () => {
      const pages: Record<string, PageContent> = { "p-kpi": { layout: "two-column" } }
      const { ir } = assembleDeck(makePlan(), pages)
      expect(ir.slides.find((s) => s.id === "p-kpi")?.layout).toBe("two-column")
    })

    it("leaves layout omitted for the image-cover takeover bypass — no invented representation for resolveEffectiveLayoutId's null", () => {
      const pages: Record<string, PageContent> = {
        "p-cover": { background: { kind: "asset", asset_id: "bg" } },
      }
      const { ir } = assembleDeck(makePlan(), pages)
      const cover = ir.slides.find((s) => s.id === "p-cover")
      expect(cover?.background).toEqual({ kind: "asset", asset_id: "bg" })
      expect(cover?.layout).toBeUndefined()
    })

    it("materializes a layout on an unfilled (placeholder) page too — placeholder status doesn't exempt a page from selection", () => {
      const { ir } = assembleDeck(makePlan(), {})
      const kpi = ir.slides.find((s) => s.id === "p-kpi")
      expect(kpi?.placeholder).toBe(true)
      expect(kpi?.layout).toEqual(expect.any(String))
    })

    it("materializes exactly what resolveEffectiveLayoutId independently computes (parity — not a second selection-logic copy)", () => {
      const seed = 909090
      const { ir } = assembleDeck(makePlan({ seed }), {})

      // Independently rebuilt pre-materialization shape (assembleDeck's own
      // step 6, minus the materialization this test exists to check) — a
      // fresh object, so `resolveEffectiveLayoutId`'s WeakMap cache (keyed by
      // `ir` identity, `../svg/effective-layout.ts`) can't be silently
      // reading back assembleDeck's own answer. If assembleDeck ever grew a
      // second, drifted copy of the selection logic instead of calling this
      // function, this is the test that would catch it.
      const manualIr: PptxIR = PptxIRSchema.parse({
        version: "3",
        scenario: { delivery: "presentation" },
        theme: { id: "consulting" },
        filename: "q3-review",
        seed,
        slides: [
          { id: "p-cover", type: "cover", heading: "Q3 Review", placeholder: true },
          { id: "p-kpi", type: "content", heading: "Revenue is up", placeholder: true },
          { id: "p-detail", type: "content", heading: "Detail breakdown", placeholder: true },
          { id: "p-ending", type: "ending", heading: "Thanks", placeholder: true },
        ],
      })

      manualIr.slides.forEach((slide, i) => {
        const expected = resolveEffectiveLayoutId(manualIr, slide, i)
        const actual = ir.slides.find((s) => s.id === slide.id)?.layout
        expect(actual).toBe(expected ?? undefined)
      })
    })

    it("reports materializedLayoutCount matching the number of pages it filled in", () => {
      const { materializedLayoutCount } = assembleDeck(makePlan(), {})
      expect(materializedLayoutCount).toBe(4) // all 4 of makePlan()'s pages omit layout
    })

    it("omits materializedLayoutCount (undefined) when every page already has an explicit layout", () => {
      const pages: Record<string, PageContent> = {
        "p-cover": { layout: "banner-title" },
        "p-kpi": { layout: "two-column" },
        "p-detail": { layout: "two-column" },
        "p-ending": { layout: "tone-adaptive-ending" },
      }
      const { materializedLayoutCount } = assembleDeck(makePlan(), pages)
      expect(materializedLayoutCount).toBeUndefined()
    })

    it("excludes an image-cover-bypassed page from materializedLayoutCount", () => {
      const pages: Record<string, PageContent> = {
        "p-cover": { background: { kind: "asset", asset_id: "bg" } }, // bypass — stays uncounted
      }
      const { materializedLayoutCount } = assembleDeck(makePlan(), pages)
      expect(materializedLayoutCount).toBe(3) // p-kpi, p-detail, p-ending — not p-cover
    })
  })

  // ── defensive: malformed page content ──────────────────────────────

  describe("page content that cannot produce valid IR", () => {
    it("throws PptfastError for a component shape that fails IR schema validation", () => {
      const rawPages: Record<string, unknown> = {
        "p-kpi": { components: [{ type: "bullets", items: "not-an-array" }] },
      }
      expect(() => assembleDeck(makePlan(), rawPages as Record<string, PageContent>)).toThrow(PptfastError)
      expect(() => assembleDeck(makePlan(), rawPages as Record<string, PageContent>)).toThrow(/did not produce valid IR/)
    })
  })
})

describe("disassembleDeck", () => {
  it("reconstructs plan pages and page content from a fully-authored IR", () => {
    const ir = PptxIRSchema.parse({
      version: "3",
      filename: "q3-review",
      theme: { id: "consulting" },
      scenario: { delivery: "presentation" },
      seed: 777,
      slides: [
        { id: "p-cover", type: "cover", heading: "Q3 Review" },
        {
          id: "p-kpi",
          type: "content",
          heading: "Revenue is up",
          components: [{ type: "paragraph", text: "hi" }],
          footnote: "note",
        },
        { id: "p-ending", type: "ending", heading: "Thanks" },
      ],
    })
    const { plan, pages } = disassembleDeck(ir)

    expect(plan.filename).toBe("q3-review")
    expect(plan.theme).toBe("consulting")
    expect(plan.scenario).toEqual({ delivery: "presentation" })
    expect(plan.seed).toBe(777)
    expect(plan.pages).toEqual([
      { id: "p-cover", type: "cover", heading: "Q3 Review" },
      { id: "p-kpi", type: "content", heading: "Revenue is up" },
      { id: "p-ending", type: "ending", heading: "Thanks" },
    ])
    expect(pages["p-kpi"]).toEqual({ components: [{ type: "paragraph", text: "hi" }], footnote: "note" })
    expect(pages["p-cover"]).toEqual({})
    expect(pages["p-ending"]).toEqual({})
  })

  it("synthesizes a stable positional id (p-<ordinal>-<type>) for a slide that omits one", () => {
    const ir = PptxIRSchema.parse({
      version: "3",
      theme: { id: "consulting" },
      slides: [
        { type: "cover", heading: "Cover" },
        { type: "content", heading: "Body" },
        { type: "ending", heading: "End" },
      ],
    })
    const { plan } = disassembleDeck(ir)
    expect(plan.pages.map((p) => p.id)).toEqual(["p-1-cover", "p-2-content", "p-3-ending"])
  })

  it('synthesizes "Untitled" for a slide with a missing or blank heading', () => {
    const ir = PptxIRSchema.parse({
      version: "3",
      theme: { id: "consulting" },
      slides: [
        { id: "p-cover", type: "cover", heading: "Cover" },
        { id: "p-body", type: "content" },
        { id: "p-blank", type: "content", heading: "   " },
        { id: "p-ending", type: "ending", heading: "End" },
      ],
    })
    const { plan } = disassembleDeck(ir)
    expect(plan.pages.find((p) => p.id === "p-body")?.heading).toBe("Untitled")
    expect(plan.pages.find((p) => p.id === "p-blank")?.heading).toBe("Untitled")
  })

  it("produces no pages entry for a placeholder slide, and recovers summary from its subheading", () => {
    const ir = PptxIRSchema.parse({
      version: "3",
      theme: { id: "consulting" },
      slides: [
        { id: "p-cover", type: "cover", heading: "Cover" },
        { id: "p-gap", type: "content", heading: "Gap page", placeholder: true, subheading: "fill me in" },
        { id: "p-ending", type: "ending", heading: "End" },
      ],
    })
    const { plan, pages } = disassembleDeck(ir)
    expect(pages["p-gap"]).toBeUndefined()
    expect(plan.pages.find((p) => p.id === "p-gap")?.summary).toBe("fill me in")
  })

  it("never sets rhythm or focus on any produced plan page (no IR-side home for either)", () => {
    const ir = PptxIRSchema.parse({
      version: "3",
      theme: { id: "consulting" },
      slides: [
        { id: "p-cover", type: "cover", heading: "Cover" },
        { id: "p-body", type: "content", heading: "Body" },
        { id: "p-ending", type: "ending", heading: "End" },
      ],
    })
    const { plan } = disassembleDeck(ir)
    for (const page of plan.pages) {
      expect(page.rhythm).toBeUndefined()
      expect(page.focus).toBeUndefined()
    }
  })
})

describe("round trip: assembleDeck(disassembleDeck(ir)) reproduces slide content", () => {
  it("reproduces every slide's content across cover/content/placeholder/ending", () => {
    const original = PptxIRSchema.parse({
      version: "3",
      filename: "roundtrip-deck",
      theme: { id: "consulting" },
      scenario: { delivery: "presentation" },
      seed: 555,
      brand: { logo_asset_id: "logo-1", position: "tl" },
      slides: [
        { id: "p-cover", type: "cover", heading: "Cover" },
        {
          id: "p-kpi",
          type: "content",
          heading: "KPI page",
          components: [{ type: "paragraph", text: "hi" }],
          layout: "kpi-strip",
          arrangement: "kpi_focus",
          footnote: "note",
        },
        { id: "p-gap", type: "content", heading: "Gap page", placeholder: true, subheading: "fill me in" },
        { id: "p-ending", type: "ending", heading: "End" },
      ],
    })

    const { plan, pages } = disassembleDeck(original)
    const { ir: reassembled } = assembleDeck(plan, pages)

    // `original` was hand-authored via a bare `PptxIRSchema.parse` — it
    // never went through `assembleDeck`, so its cover/gap/ending slides never
    // had a `layout` materialized (W4 design decision 10). `reassembled` DID
    // go through `assembleDeck`, so those same three slides now each carry
    // an auto-picked `layout` `original` doesn't have — an accepted
    // consequence, not a bug (`disassembleDeck`'s own doc comment). Compare
    // content field-by-field with `layout` stripped so this test keeps
    // covering "content survives the round trip" without re-asserting
    // materialization (covered separately below and in the materialization
    // describe block above).
    const withoutLayout = (slides: typeof original.slides) =>
      slides.map(({ layout: _layout, ...rest }) => rest)
    expect(withoutLayout(reassembled.slides)).toEqual(withoutLayout(original.slides))

    // p-kpi's explicit pin came from an actual page file field (`raw.layout`
    // in `buildSlide`), so materialization skips it and it survives
    // untouched — unlike the other three slides below.
    expect(reassembled.slides[1]?.layout).toBe("kpi-strip")
    // p-cover / p-gap / p-ending all omitted `layout` on `original` and each
    // now carries whatever `resolveEffectiveLayoutId` auto-picked for it.
    for (const id of ["p-cover", "p-gap", "p-ending"]) {
      expect(original.slides.find((s) => s.id === id)?.layout).toBeUndefined()
      expect(reassembled.slides.find((s) => s.id === id)?.layout).toEqual(expect.any(String))
    }

    expect(reassembled.filename).toBe(original.filename)
    expect(reassembled.theme).toEqual(original.theme)
    expect(reassembled.scenario).toEqual(original.scenario)
    expect(reassembled.seed).toBe(original.seed)
    expect(reassembled.brand).toEqual(original.brand)
  })

  it("round-trips a deck whose slides omit id entirely (positional synthesis both ways)", () => {
    const original = PptxIRSchema.parse({
      version: "3",
      theme: { id: "consulting" },
      scenario: { delivery: "presentation" },
      slides: [
        { type: "cover", heading: "Cover" },
        { type: "content", heading: "Body", components: [{ type: "paragraph", text: "hi" }] },
        { type: "content", heading: "Body 2" },
        { type: "ending", heading: "End" },
      ],
    })

    const { plan, pages } = disassembleDeck(original)
    const { ir: reassembled } = assembleDeck(plan, pages)

    // ids are synthesized (not present on `original`), but re-assembling the
    // disassembled plan/pages is still internally consistent and stable.
    const second = assembleDeck(plan, pages)
    expect(reassembled.slides).toEqual(second.ir.slides)
    expect(reassembled.slides.map((s) => s.heading)).toEqual(["Cover", "Body", "Body 2", "End"])
    expect(reassembled.slides[1]?.components).toEqual([{ type: "paragraph", text: "hi" }])
  })
})
