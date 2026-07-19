import { afterEach, describe, expect, it } from "vitest"
import { PptxIRSchema } from "@/ir"
import { formatIssues, generatePptx, irJsonSchema, listThemes, renderSlideSvg, validateIr } from "./api"
import { __resetRegisteredThemes, registerTheme, type ThemeDefinition } from "./themes/definitions"

const raw = {
  version: "4",
  filename: "api-test",
  theme: { id: "consulting" },
  slides: [
    { type: "cover", heading: "Hello" },
    { type: "content", heading: "Points", components: [{ type: "bullets", items: ["a", "b"] }] },
  ],
}

describe("validateIr", () => {
  it("accepts a valid IR and returns parsed data with defaults applied", () => {
    const r = validateIr(raw)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.ir?.slides[0]?.components).toEqual([])
  })

  it("gives a migration message for IR v2 input (spec §15.3: combined mapping straight to v4)", () => {
    const v = validateIr({ version: "2", filename: "x", theme: { id: "tech" }, slides: [] })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.message).toMatch(/theme\.override is now theme\.style/)
    expect(v.errors[0]!.message).toMatch(/variant is split into layout and arrangement/)
    expect(v.errors[0]!.message).toMatch(/blocks are now components/)
    expect(v.errors[0]!.message).toMatch(/scenario is now narrative/)
    expect(v.errors[0]!.message).toMatch(/mode renamed to strategy/)
    expect(v.errors[0]!.message).toMatch(/"narrative" strategy value is now "storytelling"/)
    expect(v.errors[0]!.message).toMatch(/delivery renamed to pacing/)
    expect(v.errors[0]!.message).toMatch(/"text" pacing value is now "dense"/)
    expect(v.errors[0]!.message).toMatch(/"presentation" is now "spacious"/)
    // v2 has no automated migration path (spec §15.3: "不接 v2") — the
    // message must not point to `pptfast migrate`.
    expect(v.errors[0]!.message).not.toMatch(/pptfast migrate/)
  })

  it("hard-rejects IR v3 input with the full §9.1 mapping and a migrate-command pointer (spec §9.3)", () => {
    const v = validateIr({ version: "3", filename: "x", theme: { id: "tech" }, slides: [] })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.path).toBe("version")
    expect(v.errors[0]!.message).toMatch(/IR v3 is not supported/)
    expect(v.errors[0]!.message).toMatch(/pptfast migrate <input> -o <output>/)
    expect(v.errors[0]!.message).toMatch(/scenario is now narrative/)
    expect(v.errors[0]!.message).toMatch(/scenario\.mode is now narrative\.strategy/)
    expect(v.errors[0]!.message).toMatch(/mode "narrative" is now strategy "storytelling"/)
    expect(v.errors[0]!.message).toMatch(/scenario\.delivery is now narrative\.pacing/)
    expect(v.errors[0]!.message).toMatch(/delivery "text" is now pacing "dense"/)
    expect(v.errors[0]!.message).toMatch(/"presentation" is now "spacious"/)
    expect(v.errors[0]!.message).toMatch(/scenario\.audience is now narrative\.audience/)
  })

  it("hard-rejects an unknown theme id with the available list", () => {
    const v = validateIr({ theme: { id: "neon" }, slides: [{ heading: "x" }] })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.message).toMatch(/available:.*consulting/)
  })

  it("maps slide-scoped issues to 1-based page numbers", () => {
    const bad = { ...raw, slides: [{ type: "nope" }] }
    const r = validateIr(bad)
    expect(r.ok).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.errors[0]?.page).toBe(1)
    expect(r.errors[0]?.path.startsWith("slides.0")).toBe(true)
  })

  it("rejects a schema-valid cover slide with no heading (content-quality gate)", () => {
    const bad = {
      ...raw,
      slides: [{ type: "cover" }, raw.slides[1]],
    }
    const r = validateIr(bad)
    expect(r.ok).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.errors[0]?.path).toBe("slides.0")
    expect(r.errors[0]?.page).toBe(1)
    // readable, English (public error surface — see describeQualityIssue in api.ts)
    expect(r.errors[0]?.message).toMatch(/heading/i)
    expect(r.errors[0]?.message).not.toMatch(/[一-鿿]/)
  })

  it("rejects an empty deck", () => {
    const r = validateIr({ ...raw, slides: [] })
    expect(r.ok).toBe(false)
    expect(r.errors).toEqual([{ path: "slides", message: "deck has no slides" }])
  })

  describe("layout applicability gate (W2 task 3)", () => {
    it("rejects a cover slide carrying a content-only takeover layout id (cover-hijack fix)", () => {
      const v = validateIr({
        ...raw,
        slides: [{ type: "cover", heading: "Hello", layout: "image-top" }, raw.slides[1]],
      })
      expect(v.ok).toBe(false)
      expect(v.errors[0]!.page).toBe(1)
      expect(v.errors[0]!.message).toMatch(/image-top/)
      expect(v.errors[0]!.message).toMatch(/cover/)
    })

    it("rejects an unknown layout id, listing the available ids for that slide type", () => {
      const v = validateIr({
        ...raw,
        slides: [raw.slides[0], { type: "content", heading: "x", layout: "not-a-real-layout", components: [] }],
      })
      expect(v.ok).toBe(false)
      expect(v.errors[0]!.page).toBe(2)
      expect(v.errors[0]!.message).toMatch(/not-a-real-layout/)
      expect(v.errors[0]!.message).toMatch(/available/)
    })

    it("accepts a content slide naming a valid takeover layout id", () => {
      const v = validateIr({
        ...raw,
        slides: [
          raw.slides[0],
          {
            type: "content",
            heading: "Split",
            layout: "image-split",
            components: [{ type: "image", asset_id: "a" }],
          },
        ],
      })
      expect(v.ok).toBe(true)
    })

    it("accepts a content slide naming a valid archetype layout id", () => {
      const v = validateIr({
        ...raw,
        slides: [
          raw.slides[0],
          { type: "content", heading: "Bento", layout: "bento-panel", components: [{ type: "paragraph", text: "x" }] },
        ],
      })
      expect(v.ok).toBe(true)
    })

    it("does not gate on arrangement-vs-layout compatibility (declarative this wave, W3 decides)", () => {
      // "two-column" only *declares* arrangements: ["two_column"], but the
      // gate must not enforce that yet — only registry existence +
      // slideTypes applicability are hard errors this task.
      const v = validateIr({
        ...raw,
        slides: [
          raw.slides[0],
          {
            type: "content",
            heading: "Mismatched on purpose",
            layout: "two-column",
            arrangement: "quote",
            components: [{ type: "paragraph", text: "x" }],
          },
        ],
      })
      expect(v.ok).toBe(true)
    })
  })
})

describe("field-alias normalization at the validate boundary (W5 task 4)", () => {
  const withKpi = (item: Record<string, unknown>) => ({
    ...raw,
    slides: [raw.slides[0], { type: "content", heading: "KPIs", components: [{ type: "kpi_cards", items: [item] }] }],
  })

  it("normalizes a synonym field name before parsing and reports it on ValidateResult.normalized", () => {
    const v = validateIr(withKpi({ value: "42", title: "Revenue" }))
    expect(v.ok).toBe(true)
    expect(v.normalized).toEqual(["slides[1].components[0].items[0]: title → label"])
    expect(v.ir?.slides[1]?.components[0]).toMatchObject({
      type: "kpi_cards",
      items: [{ value: "42", label: "Revenue" }],
    })
  })

  it("omits `normalized` entirely when nothing needed rewriting", () => {
    const v = validateIr(raw)
    expect(v.ok).toBe(true)
    expect(v.normalized).toBeUndefined()
  })

  it("both alias and canonical present is left for zod strict to reject as an unrecognized key, not silently resolved", () => {
    const v = validateIr(withKpi({ value: "42", label: "Real", title: "Ignored" }))
    expect(v.ok).toBe(false)
    expect(v.normalized).toBeUndefined()
    expect(v.errors.some((e) => e.message.includes("title"))).toBe(true)
  })

  it("still reports `normalized` on a failing result when normalization ran but a different gate then rejects the deck", () => {
    // theme.id is invalid — unrelated to the kpi alias — but the alias
    // rewrite happens first (before the schema parse) regardless, so it is
    // still visible on the failing result: normalization is informational,
    // not conditioned on the rest of the pipeline succeeding.
    const v = validateIr({ ...withKpi({ value: "42", title: "Revenue" }), theme: { id: "not-a-theme" } })
    expect(v.ok).toBe(false)
    expect(v.normalized).toEqual(["slides[1].components[0].items[0]: title → label"])
  })
})

describe("duplicate slide id gate (W5 task 1)", () => {
  it("hard-rejects a deck with duplicate slide ids, listing them (path 'slides', no page)", () => {
    const v = validateIr({
      ...raw,
      slides: [
        { ...raw.slides[0], id: "p-1" },
        { ...raw.slides[1], id: "p-1" },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.path).toBe("slides")
    expect(v.errors[0]!.page).toBeUndefined()
    expect(v.errors[0]!.message).toBe(
      'duplicate slide id(s): "p-1" (pages 1, 2) — slide ids must be unique within a deck',
    )
  })

  it("accepts unique ids across slides", () => {
    const v = validateIr({
      ...raw,
      slides: [
        { ...raw.slides[0], id: "p-1" },
        { ...raw.slides[1], id: "p-2" },
      ],
    })
    expect(v.ok).toBe(true)
  })

  it("accepts slides that omit id entirely (bare, pre-W5 IR)", () => {
    const v = validateIr(raw)
    expect(v.ok).toBe(true)
  })

  it("sets slideId to a representative duplicated id, without changing formatIssues' output (no page, W5 whole-branch review finding 2)", () => {
    const v = validateIr({
      ...raw,
      slides: [
        { ...raw.slides[0], id: "p-1" },
        { ...raw.slides[1], id: "p-1" },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.slideId).toBe("p-1")
    // page stays unset (deck-level issue, spans multiple slides) — formatIssues
    // only appends the parenthesized id alongside a page number, so this
    // issue's printed format is byte-identical to before this task.
    expect(formatIssues(v.errors)).toBe(
      'slides: duplicate slide id(s): "p-1" (pages 1, 2) — slide ids must be unique within a deck',
    )
  })
})

describe("full-body component exclusivity gate (structure-components wave task 1 decision 2, set extended by task 2)", () => {
  const swotOnly = { type: "swot", strengths: ["s"], weaknesses: ["w"], opportunities: ["o"], threats: ["t"] }
  const bmcOnly = {
    type: "bmc",
    key_partners: ["p"],
    key_activities: ["a"],
    key_resources: ["r"],
    value_propositions: ["v"],
    customer_relationships: ["cr"],
    channels: ["c"],
    customer_segments: ["cs"],
    cost_structure: ["co"],
    revenue_streams: ["rs"],
  }
  const waterfallOnly = {
    type: "waterfall",
    items: [
      { label: "a", value: 10 },
      { label: "b", value: -5 },
      { label: "c", value: 3 },
    ],
  }
  const ganttOnly = {
    type: "gantt",
    items: [
      { label: "a", start: 0, end: 3 },
      { label: "b", start: 2, end: 5 },
    ],
  }

  it("accepts a slide whose sole component is a full-body type (swot)", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "content", heading: "SWOT", components: [swotOnly] }],
    })
    expect(v.ok).toBe(true)
  })

  it("accepts a slide whose sole component is a full-body type (bmc)", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "content", heading: "BMC", components: [bmcOnly] }],
    })
    expect(v.ok).toBe(true)
  })

  it("accepts a slide whose sole component is a full-body type (waterfall)", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "content", heading: "Waterfall", components: [waterfallOnly] }],
    })
    expect(v.ok).toBe(true)
  })

  it("accepts a slide whose sole component is a full-body type (gantt)", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "content", heading: "Gantt", components: [ganttOnly] }],
    })
    expect(v.ok).toBe(true)
  })

  it("hard-rejects a full-body component paired with an ordinary sibling — not a silent drop", () => {
    const v = validateIr({
      ...raw,
      slides: [
        {
          type: "content",
          heading: "SWOT + bullets",
          components: [swotOnly, { type: "bullets", items: ["额外的兄弟块"] }],
        },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.path).toBe("slides.0.components")
    expect(v.errors[0]!.page).toBe(1)
    expect(v.errors[0]!.message).toMatch(/"swot" is a full-body component/)
    expect(v.errors[0]!.message).toMatch(/found 2 components/)
  })

  it("hard-rejects two full-body components sharing one slide", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "content", heading: "SWOT + BMC", components: [swotOnly, bmcOnly] }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.message).toMatch(/"swot, bmc" is a full-body component/)
  })

  it("hard-rejects two full-body components from the numeric-axis family sharing one slide", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "content", heading: "Waterfall + Gantt", components: [waterfallOnly, ganttOnly] }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.message).toMatch(/"waterfall, gantt" is a full-body component/)
  })

  it("hard-rejects two components of the *same* full-body type sharing one slide (task-1 review minor: literal same-type double)", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "content", heading: "SWOT + SWOT", components: [swotOnly, swotOnly] }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    // The offending-type name list dedupes via Set (api.ts's own
    // `checkFullBodyExclusivity`) — two swot components still name "swot"
    // once, not "swot, swot" — but the component count in the message still
    // reflects the real total (2), so the message stays actionable even
    // though the two offenders share one type name.
    expect(v.errors[0]!.message).toMatch(/^"swot" is a full-body component/)
    expect(v.errors[0]!.message).toMatch(/found 2 components/)
  })

  it("sets slideId when the offending slide has one (same shape as checkLayoutApplicability)", () => {
    const v = validateIr({
      ...raw,
      slides: [
        {
          type: "content",
          id: "p-swot",
          heading: "SWOT + bullets",
          components: [swotOnly, { type: "bullets", items: ["x"] }],
        },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.slideId).toBe("p-swot")
  })

  it("leaves an ordinary (non-full-body) multi-component slide untouched", () => {
    const v = validateIr(raw) // raw's content slide has just bullets, single component
    expect(v.ok).toBe(true)
  })
})

describe("ValidationIssue.slideId + formatIssues (W5 whole-branch review finding 2)", () => {
  it("checkLayoutApplicability sets slideId, and formatIssues prints 'page N (id) — path: message'", () => {
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        { type: "content", id: "p-kpi", heading: "x", layout: "not-a-real-layout", components: [] },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.page).toBe(2)
    expect(v.errors[0]!.slideId).toBe("p-kpi")
    expect(formatIssues(v.errors)).toBe(
      `page 2 (p-kpi) — slides.1.layout: ${v.errors[0]!.message}`,
    )
  })

  it("leaves the format unchanged (no parens) when the offending slide has no id", () => {
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content", heading: "x", layout: "not-a-real-layout", components: [] }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.page).toBe(2)
    expect(v.errors[0]!.slideId).toBeUndefined()
    expect(formatIssues(v.errors)).toBe(`page 2 — slides.1.layout: ${v.errors[0]!.message}`)
    expect(formatIssues(v.errors)).not.toContain("(")
  })

  it("the content-quality-gate translation reads slideId off the flagged slide itself, not any other slide in the deck", () => {
    const v = validateIr({
      ...raw,
      // Slide 0 has an id, but slide 1 (the one missing a heading) does not
      // — slideId must stay unset, not leak slide 0's id onto slide 1's issue.
      slides: [{ ...raw.slides[0], id: "p-cover" }, { type: "content" }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.page).toBe(2)
    expect(v.errors[0]!.slideId).toBeUndefined()
  })

  it("the content-quality-gate translation sets slideId when the flagged slide has an id", () => {
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content", id: "p-body" }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.page).toBe(2)
    expect(v.errors[0]!.slideId).toBe("p-body")
    expect(formatIssues(v.errors)).toMatch(/^page 2 \(p-body\) — /)
  })
})

describe("placeholder slide quality exemption (W5 task 1)", () => {
  it("a placeholder slide with no heading passes validate", () => {
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content", id: "p-2", placeholder: true }],
    })
    expect(v.ok).toBe(true)
  })

  it("a normal (non-placeholder) empty content slide still fails the missing-heading gate", () => {
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content" }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => /heading/i.test(e.message))).toBe(true)
  })

  it("skips every content rule for a placeholder page, not only missing_heading", () => {
    const overloaded = {
      type: "content" as const,
      placeholder: true as const,
      heading: "标".repeat(100), // would trip long_heading if checked
      components: Array.from({ length: 10 }, (_, i) => ({ type: "paragraph" as const, text: String(i) })), // would trip density
    }
    const v = validateIr({ ...raw, slides: [raw.slides[0], overloaded] })
    expect(v.ok).toBe(true)
  })
})

describe("describeQualityIssue: density/bullets English messages (W3 task 3, spec §5)", () => {
  // Each message must name whichever side(s) of min(pacing editorial
  // budget, resolved layout capacity) actually bound the limit — see
  // ir-quality.ts's `density`/`bulletsBudget` QualityIssue fields and this
  // file's own describeQualityIssue. Reached only through validateIr (the
  // function itself is private), same convention as the existing
  // "readable, English" missing-heading test above.
  // `n` is the slide's total component count (what the density gate counts
  // against); `withImage` prepends one `image` component (counted as one of
  // `n`) so a pinned takeover layout actually takes over (findImageComponent
  // must find something) instead of falling through to archetype auto-pick.
  const denseSlide = (n: number, opts: { layout?: string; withImage?: boolean } = {}) => ({
    type: "content" as const,
    heading: "Dense",
    layout: opts.layout,
    components: [
      ...(opts.withImage ? [{ type: "image" as const, asset_id: "a" }] : []),
      ...Array.from({ length: opts.withImage ? n - 1 : n }, (_, i) => ({ type: "paragraph" as const, text: String(i) })),
    ],
  })
  const densityMessage = (v: ReturnType<typeof validateIr>) =>
    v.errors.find((e) => e.message.includes("too many components"))?.message

  it("no geometric term (takeover layout): names the pacing alone", () => {
    const v = validateIr({
      ...raw,
      narrative: { pacing: "spacious" },
      slides: [raw.slides[0], denseSlide(4, { layout: "image-top", withImage: true })],
    })
    expect(v.ok).toBe(false)
    expect(densityMessage(v)).toBe(
      "too many components on this slide (max 3 for spacious pacing) — split into multiple slides",
    )
  })

  it("tied capacities (explicit generic layout, balanced): names the pacing alone", () => {
    const v = validateIr({
      ...raw,
      narrative: { pacing: "balanced" },
      slides: [raw.slides[0], denseSlide(5, { layout: "two-column" })],
    })
    expect(v.ok).toBe(false)
    expect(densityMessage(v)).toBe(
      "too many components on this slide (max 4 for balanced pacing) — split into multiple slides",
    )
  })

  it("pacing binds but the layout allows more (bento-panel exception): names both sides", () => {
    const v = validateIr({
      ...raw,
      theme: { id: "tech" },
      narrative: { pacing: "balanced" },
      slides: [raw.slides[0], denseSlide(5, { layout: "bento-panel" })],
    })
    expect(v.ok).toBe(false)
    expect(densityMessage(v)).toBe(
      "too many components on this slide (max 4 — bento-panel fits 6 but balanced pacing caps at 4) — split into multiple slides",
    )
  })

  it("the layout's own capacity is the binding side (dense pacing, generic layout): names the layout", () => {
    const v = validateIr({
      ...raw,
      narrative: { pacing: "dense" },
      slides: [raw.slides[0], denseSlide(5, { layout: "two-column" })],
    })
    expect(v.ok).toBe(false)
    expect(densityMessage(v)).toBe(
      "too many components on this slide (max 4 — two-column layout's capacity is tighter than dense pacing's 5) — split into multiple slides",
    )
  })

  it("bullets_overflow names the pacing", () => {
    const v = validateIr({
      ...raw,
      narrative: { pacing: "balanced" },
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "List",
          components: [{ type: "bullets", items: ["a", "b", "c", "d", "e", "f"] }],
        },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors.find((e) => e.message.includes("too many items"))?.message).toBe(
      "bullet list has too many items (max 5 for balanced pacing) — trim it or split into multiple slides",
    )
  })

  it("bullet_item_long names the pacing", () => {
    const v = validateIr({
      ...raw,
      narrative: { pacing: "dense" },
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "List",
          components: [{ type: "bullets", items: ["长".repeat(49)] }],
        },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors.find((e) => e.message.includes("too long"))?.message).toBe(
      "a bullet item is too long for dense pacing — keep it within about 2 lines",
    )
  })
})

describe("narrative field (W3 task 2, renamed from scenario spec §8.1)", () => {
  it("hard-rejects an unknown narrative preset name, listing available presets", () => {
    const v = validateIr({ ...raw, narrative: "not-a-real-preset" })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.path).toBe("narrative")
    expect(v.errors[0]!.page).toBeUndefined()
    expect(v.errors[0]!.message).toMatch(/unknown narrative preset/)
    expect(v.errors[0]!.message).toMatch(/available:.*general/)
  })

  it("accepts a valid narrative preset string", () => {
    const v = validateIr({ ...raw, narrative: "boardroom-report" })
    expect(v.ok).toBe(true)
  })

  it("accepts a partial narrative axes object", () => {
    const v = validateIr({ ...raw, narrative: { strategy: "pyramid" } })
    expect(v.ok).toBe(true)
  })

  it("accepts an omitted narrative field (defaults to general, no error)", () => {
    const v = validateIr(raw)
    expect(v.ok).toBe(true)
  })

  // W3 task-2 review fix: the axes-object branch used to be schema-closed
  // (a strict z.enum per axis) nested inside a z.union, which zod reports as
  // one opaque invalid_union issue on a failing branch — every one of these
  // would have collapsed to the same useless
  // { path: "narrative", message: "Invalid input" } instead of surfacing
  // resolveNarrative's specific, available-values message. The schema now
  // only shape-checks (string vs. object vs. neither — see
  // src/ir/index.test.ts's "IR v4 narrative field" describe block for that
  // layer's coverage); these pin the message content actually reaching the
  // caller through validateIr's resolveNarrative try/catch.
  it("hard-rejects a bad axis value inside the axes object, listing valid values", () => {
    const v = validateIr({ ...raw, narrative: { strategy: "pyramidal" } })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.path).toBe("narrative")
    expect(v.errors[0]!.page).toBeUndefined()
    expect(v.errors[0]!.message).toMatch(/unknown strategy/)
    expect(v.errors[0]!.message).toMatch(/pyramid/)
  })

  it("hard-rejects an unknown key on the axes object, listing valid keys", () => {
    const v = validateIr({ ...raw, narrative: { speed: "fast" } })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.path).toBe("narrative")
    expect(v.errors[0]!.page).toBeUndefined()
    expect(v.errors[0]!.message).toMatch(/unknown narrative axis/)
    expect(v.errors[0]!.message).toMatch(/strategy/)
    expect(v.errors[0]!.message).toMatch(/pacing/)
    expect(v.errors[0]!.message).toMatch(/audience/)
  })
})

describe("v4 narrative alias normalization (spec §15.4)", () => {
  it("rescues the pre-rename `scenario` field name, printing a root-level normalization note", () => {
    const v = validateIr({ ...raw, scenario: { strategy: "pyramid" } })
    expect(v.ok).toBe(true)
    expect(v.normalized).toEqual(["(root): scenario → narrative"])
    expect(v.ir?.narrative).toEqual({ strategy: "pyramid" })
  })

  it("rescues the pre-rename `mode`/`delivery` axis field names inside `narrative`", () => {
    const v = validateIr({ ...raw, narrative: { mode: "pyramid", delivery: "balanced" } })
    expect(v.ok).toBe(true)
    expect(v.normalized).toEqual([
      "(root).narrative: mode → strategy",
      "(root).narrative: delivery → pacing",
    ])
    expect(v.ir?.narrative).toEqual({ strategy: "pyramid", pacing: "balanced" })
  })

  it("rescues the pre-rename enum values (mode \"narrative\" → strategy \"storytelling\", delivery \"text\"/\"presentation\" → pacing \"dense\"/\"spacious\")", () => {
    const v = validateIr({ ...raw, narrative: { mode: "narrative", delivery: "text" } })
    expect(v.ok).toBe(true)
    expect(v.normalized).toEqual([
      "(root).narrative: mode → strategy",
      "(root).narrative: delivery → pacing",
      "(root).narrative.strategy: narrative → storytelling",
      "(root).narrative.pacing: text → dense",
    ])
    expect(v.ir?.narrative).toEqual({ strategy: "storytelling", pacing: "dense" })

    const v2 = validateIr({ ...raw, narrative: { delivery: "presentation" } })
    expect(v2.normalized).toEqual([
      "(root).narrative: delivery → pacing",
      "(root).narrative.pacing: presentation → spacious",
    ])
    expect(v2.ir?.narrative).toEqual({ pacing: "spacious" })
  })

  it("rescues an old enum value even when the field is already written under its new name", () => {
    const v = validateIr({ ...raw, narrative: { strategy: "narrative" } })
    expect(v.ok).toBe(true)
    expect(v.normalized).toEqual(["(root).narrative.strategy: narrative → storytelling"])
    expect(v.ir?.narrative).toEqual({ strategy: "storytelling" })
  })

  it("both the alias and the canonical field present at the same level is left untouched (ambiguous — zod strict/resolveNarrative reports it)", () => {
    const v = validateIr({ ...raw, scenario: "boardroom-report", narrative: "pitch" })
    expect(v.ok).toBe(false)
    expect(v.normalized).toBeUndefined()
    // `scenario` never got renamed away (both present), so the v4 schema's
    // strict parse rejects it as an unrecognized key.
    expect(v.errors.some((e) => e.message.includes("scenario"))).toBe(true)
  })

  it("a preset-id string narrative value needs no aliasing — preset ids are unchanged by the rename", () => {
    const v = validateIr({ ...raw, scenario: "annual-review" })
    expect(v.ok).toBe(true)
    expect(v.normalized).toEqual(["(root): scenario → narrative"])
    expect(v.ir?.narrative).toBe("annual-review")
  })

  it("never rescues an explicit version \"3\" — the hard-reject fires before any alias pass runs", () => {
    const v = validateIr({ ...raw, version: "3", scenario: { strategy: "pyramid" } })
    expect(v.ok).toBe(false)
    expect(v.normalized).toBeUndefined()
    expect(v.errors[0]!.message).toMatch(/IR v3 is not supported/)
  })

  // Task-1 whole-branch review minor, routed to task 2: `normalizeNarrativeAliases`
  // only ever reads `input.scenario`/`input.narrative` at the IR root, and
  // `narrative`'s own `mode`/`delivery` keys one level down inside that field
  // — it never walks `input.slides` at all (a completely separate walk,
  // `normalizeComponentAliases`, handles that array). This pins the
  // consequence: a slide heading or component text field that merely
  // *contains* the words "narrative"/"text"/"presentation" (the vocabulary's
  // own axis/value names) must never be mistaken for a root-level narrative
  // key or rewritten — the alias walk only ever renames object *keys* at
  // fixed, known paths, never pattern-matches string *content* anywhere.
  it("never descends into slides[] — a slide heading/text containing the words 'narrative'/'text'/'presentation' is left untouched", () => {
    const withTrickyContent = {
      ...raw,
      slides: [
        { type: "cover", heading: "The Narrative Text Presentation Strategy" },
        {
          type: "content",
          heading: "Body",
          components: [{ type: "paragraph", text: "mode: narrative, delivery: presentation, text: dense" }],
        },
      ],
    }
    const v = validateIr(withTrickyContent)
    expect(v.ok).toBe(true)
    expect(v.normalized).toBeUndefined()
    expect(v.ir?.slides[0]?.heading).toBe("The Narrative Text Presentation Strategy")
    expect(v.ir?.slides[1]?.components[0]).toMatchObject({
      type: "paragraph",
      text: "mode: narrative, delivery: presentation, text: dense",
    })
  })
})

describe("registerTheme end-to-end (W3 task 4)", () => {
  afterEach(() => {
    __resetRegisteredThemes()
  })

  function registeredTheme(id: string): ThemeDefinition {
    return {
      id,
      style: {
        id,
        colors: {
          bg: "#123ABC",
          surface: "#FFFFFF",
          primary: "#123ABC",
          accent: "#FF00AA",
          text: "#101010",
          muted: "#666666",
          chartPalette: ["#123ABC", "#FF00AA"],
        },
        fonts: { heading: ["Arial"], body: ["Arial"] },
        defaultBackgrounds: {
          cover: { kind: "color", value: "#123ABC" },
          chapter: { kind: "color", value: "#123ABC" },
          content: { kind: "color", value: "#123ABC" },
          ending: { kind: "color", value: "#123ABC" },
        },
      },
      brand: {},
      tags: [],
      // Narrow (single-archetype) curated set per slide type — proves
      // selection actually respects the registered theme's own curation
      // rather than falling back to consulting's allowed set.
      layouts: {
        cover: ["poster-center"],
        chapter: ["banner-chapter"],
        content: ["two-column"],
        ending: ["banner-ending"],
      },
    }
  }

  it("a registered theme's style and curated layout take effect end-to-end (validateIr → renderSlideSvg)", () => {
    registerTheme(registeredTheme("acme-registered"))
    const v = validateIr({
      version: "4",
      filename: "registered-theme-test",
      theme: { id: "acme-registered" },
      slides: [{ type: "cover", heading: "Hello from a registered theme" }],
    })
    expect(v.ok).toBe(true)

    const svg = renderSlideSvg(v.ir!, 0)
    // distinctive primary color from the registered theme's own style tokens
    expect(svg).toContain("#123ABC")
    // respects the registered theme's narrow (single-entry) curated cover layout
    expect(svg).toContain('data-archetype="poster-center"')
  })

  it("validateIr accepts a registered theme id and still rejects an unknown id with the enlarged available list", () => {
    registerTheme(registeredTheme("acme-registered-2"))

    const accepted = validateIr({ ...raw, theme: { id: "acme-registered-2" } })
    expect(accepted.ok).toBe(true)

    const rejected = validateIr({ ...raw, theme: { id: "still-not-a-theme" } })
    expect(rejected.ok).toBe(false)
    expect(rejected.errors[0]!.message).toMatch(/available:.*acme-registered-2/)
  })
})

describe("renderSlideSvg", () => {
  it("renders one slide to standalone SVG markup", () => {
    const ir = PptxIRSchema.parse(raw)
    const svg = renderSlideSvg(ir, 0)
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg).toContain("Hello")
  })

  it("throws a readable error for an out-of-range index", () => {
    const ir = PptxIRSchema.parse(raw)
    expect(() => renderSlideSvg(ir, 99)).toThrow(/out of range/)
  })
})

describe("generatePptx", () => {
  it("returns pptx bytes (zip magic) for a valid IR", async () => {
    const bytes = await generatePptx(raw)
    expect(bytes.length).toBeGreaterThan(10_000)
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]) // "PK"
  })

  it("throws PptfastError with per-page details for invalid input", async () => {
    await expect(generatePptx({ nope: true })).rejects.toThrow(/invalid IR/)
  })
})

describe("generatePptx draft gate (W5 task 1)", () => {
  const withPlaceholder = {
    ...raw,
    slides: [raw.slides[0], { type: "content" as const, id: "p-2", placeholder: true as const }],
  }

  it("throws PptfastError listing the placeholder page number + id when draft is not passed", async () => {
    await expect(generatePptx(withPlaceholder)).rejects.toThrow(
      "deck has 1 unfilled placeholder page: p-2 (page 2) — fill them or pass --draft",
    )
  })

  it("lists every placeholder page when there is more than one", async () => {
    const twoPlaceholders = {
      ...raw,
      slides: [
        raw.slides[0],
        { type: "content" as const, id: "p-2", placeholder: true as const },
        { type: "content" as const, placeholder: true as const }, // no id — falls back to page-only ref
      ],
    }
    await expect(generatePptx(twoPlaceholders)).rejects.toThrow(
      "deck has 2 unfilled placeholder pages: p-2 (page 2), page 3 — fill them or pass --draft",
    )
  })

  it("renders successfully when placeholders exist and { draft: true } is passed", async () => {
    const bytes = await generatePptx(withPlaceholder, { draft: true })
    expect(bytes.length).toBeGreaterThan(10_000)
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
  })

  it("is unaffected when there are no placeholder pages, draft omitted", async () => {
    const bytes = await generatePptx(raw)
    expect(bytes.length).toBeGreaterThan(10_000)
  })

  it("renderSlideSvg never gates on placeholder pages (preview always allowed)", () => {
    const v = validateIr(withPlaceholder)
    expect(v.ok).toBe(true)
    expect(() => renderSlideSvg(v.ir!, 1)).not.toThrow()
  })
})

describe("listThemes", () => {
  it("lists 13 canonical themes with labels and color tokens", () => {
    const themes = listThemes()
    expect(themes).toHaveLength(13)
    expect(themes.map((t) => t.id)).toContain("consulting")
    for (const t of themes) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(Object.keys(t.colors).length).toBeGreaterThan(0)
    }
  })
})

describe("irJsonSchema", () => {
  it("exports a JSON Schema object for the IR", () => {
    const schema = irJsonSchema()
    expect(schema).toHaveProperty("$schema")
    expect(JSON.stringify(schema)).toContain("slides")
  })
})
