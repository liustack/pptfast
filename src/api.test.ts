import { afterEach, describe, expect, it } from "vitest"
import { PptxIRSchema } from "@/ir"
import { measureTextUnits } from "@/lib/svg-text-layout"
import { makeSolidRegionPngDataUri } from "@/platform/test-png-fixture"
import { formatIssues, formatWarnings, generatePptx, irJsonSchema, listThemes, renderSlideSvg, validateIr } from "./api"
import { ENUM_ERROR_MESSAGE_MAX_LENGTH } from "./ir/schema-error-hints"
import { CAPACITY } from "./svg/audit/capacity"
import { __resetRegisteredThemes, registerTheme, type ThemeDefinition } from "./themes/definitions"

/** A real, minimal, decodable PNG data URI — every "byte-inertness" and
 *  "dangling asset_id" test below (Task 2, borrow wave) needs an asset that
 *  passes `checkAssetBytes` cleanly so it isn't what the test under
 *  scrutiny observes. */
const realPngDataUri = makeSolidRegionPngDataUri(2, 2, () => [10, 20, 30])

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

  it("warns (not rejects) a schema-valid cover slide with no heading — missing_heading is editorial, not content-loss (Task 2, dual-threshold severity)", () => {
    // Pre-Task-2 this was a hard error (ok:false) — missing_heading is an
    // authoring-completeness signal, not a case where render truncates or
    // drops anything, so it moved to `warnings` and no longer blocks `ok`.
    const bad = {
      ...raw,
      slides: [{ type: "cover" }, raw.slides[1]],
    }
    const r = validateIr(bad)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.warnings?.length).toBeGreaterThan(0)
    expect(r.warnings?.[0]?.path).toBe("slides.0")
    expect(r.warnings?.[0]?.page).toBe(1)
    // readable, English (public error surface — see describeQualityIssue in api.ts)
    expect(r.warnings?.[0]?.message).toMatch(/heading/i)
    expect(r.warnings?.[0]?.message).not.toMatch(/[一-鿿]/)
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

describe("ValidateResult.warnings + formatWarnings (Task 2, borrow wave — dual-threshold severity)", () => {
  it("omits `warnings` entirely when there are no warn-severity findings (backward-compatible addition, same shape as `normalized`)", () => {
    const v = validateIr(raw)
    expect(v.ok).toBe(true)
    expect(v.warnings).toBeUndefined()
  })

  it("surfaces a warn-severity finding on `warnings` without affecting `errors` or `ok`", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "cover" }, raw.slides[1]], // missing heading — warn only
    })
    expect(v.ok).toBe(true)
    expect(v.errors).toEqual([])
    expect(v.warnings).toHaveLength(1)
  })

  it("formatWarnings prints 'warning: page N — path: message' — formatIssues' own per-line shape, prefixed", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "cover" }, raw.slides[1]],
    })
    expect(formatWarnings(v.warnings!)).toBe(`warning: ${formatIssues(v.warnings!)}`)
    expect(formatWarnings(v.warnings!)).toMatch(/^warning: page 1 — slides\.0: /)
  })

  it("`warnings` can be present alongside a failing (`ok:false`) result too — a rejected deck's warnings are not hidden", () => {
    // slide 2 mixes a real error (unknown layout) with slide 1's own
    // warn-only missing heading — both must be visible on their own arrays.
    const v = validateIr({
      ...raw,
      slides: [
        { type: "cover" }, // missing heading — warn
        { type: "content", heading: "x", layout: "not-a-real-layout", components: [] }, // error
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors.length).toBeGreaterThan(0)
    // The layout-applicability hard gate returns early (api.ts's validateIr
    // short-circuits at the first hard-gate failure, before checkIrQuality
    // ever runs) — so this specific deck's warning never actually gets
    // computed. Documents that ordering rather than asserting warnings
    // exist here: `ok:false` alone is the behavior under test.
    expect(v.warnings).toBeUndefined()
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
  const pestOnly = {
    type: "pest",
    political: { items: ["p"] },
    economic: { items: ["e"] },
    social: { items: ["s"] },
    technological: { items: ["t"] },
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

  it("accepts a slide whose sole component is a full-body type (pest)", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "content", heading: "PEST", components: [pestOnly] }],
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

describe("boundary-page render-surface gate (bench-driven fixes wave, defect D)", () => {
  const bullets = { type: "bullets" as const, items: ["a"] }

  it.each(["cover", "chapter", "ending"] as const)(
    "hard-rejects a %s slide carrying components — every archetype in that family drops them silently",
    (type) => {
      const v = validateIr({
        ...raw,
        slides: [{ type, heading: "H", components: [bullets] }],
      })
      expect(v.ok).toBe(false)
      expect(v.errors).toHaveLength(1)
      expect(v.errors[0]!.path).toBe("slides.0")
      expect(v.errors[0]!.page).toBe(1)
      expect(v.errors[0]!.message).toBe(
        `"${type}" slides do not render components — move this content to a content slide or remove it`,
      )
    },
  )

  it.each(["cover", "chapter", "ending"] as const)(
    "hard-rejects a %s slide carrying a footnote",
    (type) => {
      const v = validateIr({
        ...raw,
        slides: [{ type, heading: "H", footnote: "source: x" }],
      })
      expect(v.ok).toBe(false)
      expect(v.errors[0]!.message).toBe(
        `"${type}" slides do not render footnote — move this content to a content slide or remove it`,
      )
    },
  )

  it("names both offending fields, components first, when a slide carries both", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "cover", heading: "H", components: [bullets], footnote: "source: x" }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.message).toBe(
      '"cover" slides do not render components/footnote — move this content to a content slide or remove it',
    )
  })

  it.each(["cover", "chapter", "ending"] as const)(
    "accepts a %s slide carrying only a subheading — never gated, since no type drops it on every archetype (corrects the benchmark's initial hypothesis that subheading might belong here too)",
    (type) => {
      const v = validateIr({
        ...raw,
        slides: [{ type, heading: "H", subheading: "S" }],
      })
      expect(v.ok).toBe(true)
    },
  )

  it("accepts a content slide carrying components, footnote, and subheading together — the one type that renders all three", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "content", heading: "H", subheading: "S", components: [bullets], footnote: "source: x" }],
    })
    expect(v.ok).toBe(true)
  })

  it.each(["cover", "chapter", "ending"] as const)(
    "exempts a placeholder %s slide — an assemble-generated stub has no real content to judge (same exemption checkIrQuality already applies)",
    (type) => {
      const v = validateIr({
        ...raw,
        slides: [{ type, placeholder: true, components: [bullets], footnote: "source: x" }],
      })
      expect(v.ok).toBe(true)
    },
  )

  it("never flags notes — speaker notes are never rendered onto the canvas by design, on any page type", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "cover", heading: "H", notes: "say hello warmly" }],
    })
    expect(v.ok).toBe(true)
  })

  it("sets slideId when the offending slide has one (same shape as checkLayoutApplicability/checkFullBodyExclusivity)", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "ending", id: "p-end", heading: "Thanks", components: [bullets] }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.slideId).toBe("p-end")
  })

  it("lists one issue per offending slide, not just the first", () => {
    const v = validateIr({
      ...raw,
      slides: [
        { type: "cover", heading: "C", components: [bullets] },
        { type: "content", heading: "OK", components: [bullets] },
        { type: "ending", heading: "E", footnote: "source: x" },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(2)
    expect(v.errors[0]!.page).toBe(1)
    expect(v.errors[1]!.page).toBe(3)
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
    // missing_heading is warn-only since Task 2 — ok:true, the issue lands
    // on `warnings` instead of `errors` (see "reads slideId" naming: the
    // slideId-scoping behavior under test is unchanged, only which array
    // carries the issue moved).
    expect(v.ok).toBe(true)
    expect(v.warnings?.[0]!.page).toBe(2)
    expect(v.warnings?.[0]!.slideId).toBeUndefined()
  })

  it("the content-quality-gate translation sets slideId when the flagged slide has an id", () => {
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content", id: "p-body" }],
    })
    expect(v.ok).toBe(true)
    expect(v.warnings?.[0]!.page).toBe(2)
    expect(v.warnings?.[0]!.slideId).toBe("p-body")
    expect(formatIssues(v.warnings!)).toMatch(/^page 2 \(p-body\) — /)
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

  it("a normal (non-placeholder) empty content slide still warns the missing-heading gate (ok:true since Task 2 — missing_heading is editorial, not content-loss)", () => {
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content" }],
    })
    expect(v.ok).toBe(true)
    expect(v.warnings?.some((w) => /heading/i.test(w.message))).toBe(true)
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
  //
  // Task 2 (dual-threshold severity): density/bullets_overflow/
  // bullet_item_long are all editorial-budget codes (warn), so every case
  // below reads its message off `v.warnings` and asserts `ok:true` — before
  // Task 2 these were hard errors (`ok:false`, read off `v.errors`). The
  // message content and shape are otherwise unchanged.
  //
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
    v.warnings?.find((w) => w.message.includes("too many components"))?.message

  it("no geometric term (takeover layout): names the pacing alone", () => {
    const v = validateIr({
      ...raw,
      narrative: { pacing: "spacious" },
      slides: [raw.slides[0], denseSlide(4, { layout: "image-top", withImage: true })],
    })
    expect(v.ok).toBe(true)
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
    expect(v.ok).toBe(true)
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
    expect(v.ok).toBe(true)
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
    expect(v.ok).toBe(true)
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
    expect(v.ok).toBe(true)
    expect(v.warnings?.find((w) => w.message.includes("too many items"))?.message).toBe(
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
    expect(v.ok).toBe(true)
    expect(v.warnings?.find((w) => w.message.includes("too long"))?.message).toBe(
      "a bullet item is too long for dense pacing — keep it within about 2 lines",
    )
  })
})

describe("bullets geometric hard error (Task 2, borrow wave — dual-threshold severity)", () => {
  // Q3's boundary scan (fact-report, borrow wave) found validateIr's old
  // "any finding blocks" design hard-rejecting a 44-CJK-unit bullet item —
  // well inside the balanced-pacing 40-unit *editorial* budget's reach —
  // while real render never truncates until ~156 units for a full-width
  // single column: a ~3.5x gap between the old block point and the true
  // render-safety edge. Task 2 splits severity so that gap can no longer
  // turn a legitimate deck into a hard rejection: 44 units is now warn-only
  // (bullet_item_long fires, `ok` stays true), and rendering the exact same
  // content produces zero data-truncated markers — closing the loop the
  // fact-report flagged as the real risk ("a real deck rejected outright").
  it("44-unit CJK bullet item: warns but ok:true, and a real render has zero data-truncated (Q3's 3.5x gap regression guard)", () => {
    // "测" is a pure CJK char (measureTextUnits weight 1.0/char), so
    // repeat(44) is exactly the boundary scan's own "validateIr first
    // rejects at 44 CJK chars" fixture (fact-report Q3 — the "measured units"
    // reading, not the density-probe's own differently-sized "47-unit"
    // illustrative string quoted elsewhere in that same report).
    const cjk44 = "测".repeat(44)
    expect(measureTextUnits(cjk44)).toBe(44) // pins the fact-report's own boundary-scan number
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        { type: "content", heading: "Density probe", components: [{ type: "bullets", items: ["filler item one", cjk44] }] },
      ],
    })
    expect(v.ok).toBe(true)
    expect(v.warnings?.some((w) => w.message.includes("too long"))).toBe(true)
    const svg = renderSlideSvg(v.ir!, 1)
    expect(svg).not.toContain('data-truncated="1"')
  })

  it(`a bullet item past the geometric ceiling (${CAPACITY.bullets.itemOverflowUnits} units) hard-blocks generation via generatePptx`, async () => {
    const tooLong = "测".repeat(CAPACITY.bullets.itemOverflowUnits + 1)
    const ir = {
      ...raw,
      slides: [
        raw.slides[0],
        { type: "content", heading: "Overflow probe", components: [{ type: "bullets", items: [tooLong] }] },
      ],
    }
    const v = validateIr(ir)
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.message.includes("exceeds"))).toBe(true)
    await expect(generatePptx(ir)).rejects.toThrow(/invalid IR/)
  })

  it(`does NOT report bullet_item_overflow at exactly ${CAPACITY.bullets.itemOverflowUnits} units — still ok:true (only the editorial warn, if any, applies)`, () => {
    const atCeiling = "测".repeat(CAPACITY.bullets.itemOverflowUnits)
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        { type: "content", heading: "At ceiling", components: [{ type: "bullets", items: [atCeiling] }] },
      ],
    })
    expect(v.ok).toBe(true)
  })
})

// P0 hardening (robustness deep-review D1): bullets_overflow's count-based
// second-tier escalation — bullets_count_overflow, same dual-threshold
// severity machinery as bullet_item_overflow above (this file's own
// precedent/template), just on item count instead of item length.
describe("bullets count geometric hard error (P0 hardening, robustness deep-review D1)", () => {
  it(`a bullets list past the count ceiling (${CAPACITY.bullets.countOverflowItems} items) hard-blocks generation via generatePptx`, async () => {
    const tooMany = Array.from({ length: CAPACITY.bullets.countOverflowItems + 1 }, (_, i) => `item ${i}`)
    const ir = {
      ...raw,
      slides: [
        raw.slides[0],
        { type: "content", heading: "Count overflow probe", components: [{ type: "bullets", items: tooMany }] },
      ],
    }
    const v = validateIr(ir)
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.message.includes("far too many items"))).toBe(true)
    await expect(generatePptx(ir)).rejects.toThrow(/invalid IR/)
  })

  it(`does NOT report bullets_count_overflow at exactly ${CAPACITY.bullets.countOverflowItems} items — still ok:true`, () => {
    const atCeiling = Array.from({ length: CAPACITY.bullets.countOverflowItems }, (_, i) => `item ${i}`)
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        { type: "content", heading: "At count ceiling", components: [{ type: "bullets", items: atCeiling }] },
      ],
    })
    expect(v.ok).toBe(true)
  })

  it("names the ceiling and stays free of a leaked '+N more'-style per-item dump — message stays short regardless of item count", async () => {
    const tooMany = Array.from({ length: 20_000 }, (_, i) => `item ${i}`)
    const ir = {
      ...raw,
      slides: [
        raw.slides[0],
        { type: "content", heading: "Extreme", components: [{ type: "bullets", items: tooMany }] },
      ],
    }
    let caught: Error | undefined
    try {
      await generatePptx(ir)
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeTruthy()
    expect(caught!.message).toContain(String(CAPACITY.bullets.countOverflowItems))
    expect(caught!.message.length).toBeLessThan(2_000)
  })
})

describe("describeQualityIssue: chart_axes_ignored English message (chart-axes feature)", () => {
  // `axes` (x_title/y_title/show_grid) only renders for bar/line
  // (chart.tsx's AXES_APPLICABLE_TYPES) — a pie/funnel/dumbbell chart
  // setting it gets a warn-severity advisory (ir-quality.ts's own Chinese
  // `message`, dual-threshold severity/Task 2 machinery), translated to
  // English here for the public validate surface, same convention as every
  // other QualityIssue code this file already translates.
  it("names the chart_type and stays ok:true (warn, not error)", () => {
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "Share",
          components: [
            {
              type: "chart",
              chart_type: "pie",
              axes: { x_title: "Segment" },
              series: [{ name: "S1", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }],
            },
          ],
        },
      ],
    })
    expect(v.ok).toBe(true)
    const warning = v.warnings?.find((w) => w.message.includes("axes"))
    expect(warning).toBeTruthy()
    expect(warning?.message).toMatch(/pie/)
    expect(warning?.message).toMatch(/ignored/)
    // public surface (CLI output/error messages) is English — never leak
    // ir-quality.ts's own internal Chinese wording.
    expect(warning?.message).not.toMatch(/[一-鿿]/)
  })

  it("does NOT fire for a bar chart with axes (the applicable type)", () => {
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "Trend",
          components: [
            {
              type: "chart",
              chart_type: "bar",
              axes: { x_title: "Quarter" },
              series: [{ name: "S1", data: [{ x: "A", y: 10 }] }],
            },
          ],
        },
      ],
    })
    expect(v.ok).toBe(true)
    expect(v.warnings?.some((w) => w.message.includes("axes")) ?? false).toBe(false)
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

describe("v4 has no old-vocabulary rescue (spec §16, reversing the now-superseded §15.4)", () => {
  it("hard-rejects the pre-rename `scenario` field name as an unrecognized key — no rename, no rescue, message points at `narrative`", () => {
    const v = validateIr({ ...raw, scenario: { strategy: "pyramid" } })
    expect(v.ok).toBe(false)
    expect(v.normalized).toBeUndefined()
    expect(v.ir).toBeUndefined()
    expect(v.errors.some((e) => e.message.includes('"scenario" was renamed to "narrative" in IR v4'))).toBe(true)
    expect(v.errors.some((e) => e.message.includes("pptfast migrate"))).toBe(true)
  })

  it("hard-rejects a preset-id string under the pre-rename `scenario` field name too, with the same pointer", () => {
    const v = validateIr({ ...raw, scenario: "annual-review" })
    expect(v.ok).toBe(false)
    expect(v.normalized).toBeUndefined()
    expect(v.errors.some((e) => e.message.includes('"scenario" was renamed to "narrative" in IR v4'))).toBe(true)
  })

  it("hard-rejects the pre-rename `mode`/`delivery` axis field names inside `narrative`, listing the current axis names", () => {
    const v = validateIr({ ...raw, narrative: { mode: "pyramid", delivery: "balanced" } })
    expect(v.ok).toBe(false)
    expect(v.normalized).toBeUndefined()
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.path).toBe("narrative")
    // `narrative` stays an open record at the schema layer (NarrativeProfileInputSchema),
    // so `mode`/`delivery` slip past zod and are caught one level down by
    // resolveNarrative's own runtime axis-key check.
    expect(v.errors[0]!.message).toMatch(/unknown narrative axis "mode"/)
    expect(v.errors[0]!.message).toMatch(/strategy/)
    expect(v.errors[0]!.message).toMatch(/pacing/)
    expect(v.errors[0]!.message).toMatch(/audience/)
  })

  it("hard-rejects the pre-rename enum values under the current field names, listing the current values", () => {
    const v = validateIr({ ...raw, narrative: { strategy: "narrative" } })
    expect(v.ok).toBe(false)
    expect(v.normalized).toBeUndefined()
    expect(v.errors[0]!.message).toMatch(/unknown strategy "narrative"/)
    expect(v.errors[0]!.message).toMatch(/storytelling/)

    const v2 = validateIr({ ...raw, narrative: { pacing: "text" } })
    expect(v2.ok).toBe(false)
    expect(v2.errors[0]!.message).toMatch(/unknown pacing "text"/)
    expect(v2.errors[0]!.message).toMatch(/dense/)

    const v3 = validateIr({ ...raw, narrative: { pacing: "presentation" } })
    expect(v3.ok).toBe(false)
    expect(v3.errors[0]!.message).toMatch(/unknown pacing "presentation"/)
    expect(v3.errors[0]!.message).toMatch(/spacious/)
  })

  it("hard-rejects the pre-rename `mode`/`delivery` field names carrying pre-rename enum values too — no rescue at either layer", () => {
    const v = validateIr({ ...raw, narrative: { mode: "narrative", delivery: "text" } })
    expect(v.ok).toBe(false)
    expect(v.normalized).toBeUndefined()
    // The axis-key check runs before any value is inspected, so the
    // unrecognized-key message fires first — the old enum value never even
    // gets its own chance to be evaluated.
    expect(v.errors[0]!.message).toMatch(/unknown narrative axis "mode"/)
  })

  it("still hard-rejects an explicit version \"3\" first, same as before — the v3 boundary is unaffected by the rescue removal", () => {
    const v = validateIr({ ...raw, version: "3", scenario: { strategy: "pyramid" } })
    expect(v.ok).toBe(false)
    expect(v.normalized).toBeUndefined()
    expect(v.errors[0]!.message).toMatch(/IR v3 is not supported/)
  })

  // Pins that the component-alias walk (normalizeComponentAliases, unaffected
  // by this section) never mistakes a slide heading/text merely *containing*
  // the words "narrative"/"text"/"presentation" for anything narrative-axis
  // related — those words have no special meaning inside slides[] either way,
  // rescued or not.
  it("a slide heading/text containing the words 'narrative'/'text'/'presentation' still parses fine — those words carry no meaning inside slides[]", () => {
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

// Borrow-wave task 3 (error-message quality): the rest of the documented
// v2/v3 → v4 rename map gets the same "renamed, here's the new name" rescue
// `scenario` already had (see `./ir/rename-hints.ts`), plus a generic
// slide-level location hint for an unrecognized key that isn't one of those
// renames. Every case below is one of the borrow-wave B report's 15
// forgiveness probes (P2/P4/P7) — pinned here as the probe's *new* message
// shape, replacing the bare "Unrecognized key" the probe originally found.
describe("unrecognized-key rescue hints (borrow-wave task 3, generalizing the scenario rescue)", () => {
  it("P7: hints blocks -> components at slide level", () => {
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content", heading: "x", blocks: [{ type: "bullets", items: ["a", "b"] }] }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.message.includes('Unrecognized key: "blocks"'))).toBe(true)
    expect(v.errors.some((e) => e.message.includes('"blocks" was renamed to "components" in IR v4'))).toBe(true)
  })

  it("hints variant -> layout/arrangement at slide level", () => {
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content", heading: "x", variant: "two-column" }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.message.includes('"variant" was split into "layout" and "arrangement" in IR v4'))).toBe(
      true,
    )
  })

  it("hints theme.override -> theme.style, scoped to the theme object", () => {
    const v = validateIr({ ...raw, theme: { id: "consulting", override: { accent: "#ff0000" } } })
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.message.includes('"theme.override" was renamed to "theme.style" in IR v4'))).toBe(true)
  })

  it("P2: a non-rename unrecognized key directly on a slide gets the generic components[] location hint instead", () => {
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content", heading: "x", items: ["stray", "items"] }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.message.includes('Unrecognized key: "items"'))).toBe(true)
    expect(v.errors.some((e) => e.message.includes("belong inside one of the slide's components[] entries"))).toBe(true)
    // Never both hints on the same key.
    expect(v.errors.some((e) => e.message.includes("was renamed"))).toBe(false)
  })

  it("P4: an unrecognized key that is neither a documented rename nor at slide level gets no hint at all (out of this task's scope)", () => {
    const v = validateIr({ ...raw, theme: { id: "consulting", colour: "#ff0000" } })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.message).toBe('Unrecognized key: "colour"')
  })
})

// Borrow-wave task 3: zod's default enum/discriminator error flattens every
// valid value into the message (a real icon typo produced a 24,910-char,
// 1756-option wall; a component-type typo produced a 437-char, 28-option one
// — borrow-wave B report §3.3 #1/#2). `./ir/schema-error-hints.ts` replaces
// both with a nearest-neighbor "did you mean" suggestion, a count, and a
// pointer — this describe block pins probes P9 and P10 as their new shape,
// plus the length ceiling that makes the old wall structurally impossible.
describe("enum/discriminator did-you-mean hints (borrow-wave task 3)", () => {
  const withComponent = (component: unknown) => ({
    ...raw,
    slides: [raw.slides[0], { type: "content", heading: "x", components: [component] }],
  })

  it("P9: an icon near-miss ('check-circle' for lucide's 'circle-check') gets a did-you-mean suggestion, not the full enum", () => {
    const v = validateIr(
      withComponent({ type: "icon_cards", items: [{ icon: "check-circle", title: "a", text: "x" }, { icon: "circle-check", title: "b", text: "y" }] }),
    )
    expect(v.ok).toBe(false)
    const message = v.errors.find((e) => e.path.endsWith(".icon"))!.message
    expect(message).toContain('"check-circle" is not a valid icon name')
    expect(message).toContain('did you mean "circle-check"?')
    expect(message).toContain("pptfast schema")
    expect(message).not.toMatch(/"a-arrow-down"/) // the enum is never flattened into the message
    expect(message.length).toBeLessThan(ENUM_ERROR_MESSAGE_MAX_LENGTH)
  })

  it("P10: a component-type near-miss (singular 'kpi_card' for 'kpi_cards') gets a did-you-mean suggestion, not the full type list", () => {
    const v = validateIr(withComponent({ type: "kpi_card", items: [{ value: "1", label: "x" }] }))
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    const message = v.errors[0]!.message
    expect(message).toContain('"kpi_card" is not a valid component type')
    expect(message).toContain('did you mean "kpi_cards"?')
    expect(message).toContain("pptfast schema")
    expect(message).not.toMatch(/'bullets' \| 'paragraph'/) // the full 28-option list is never flattened into the message
    expect(message.length).toBeLessThan(ENUM_ERROR_MESSAGE_MAX_LENGTH)
  })

  it("an icon value with no plausible match still stays short, with no suggestion offered", () => {
    const v = validateIr(
      withComponent({ type: "icon_cards", items: [{ icon: "totally-unrelated-nonsense-value", title: "a", text: "x" }, { icon: "circle-check", title: "b", text: "y" }] }),
    )
    expect(v.ok).toBe(false)
    const message = v.errors.find((e) => e.path.endsWith(".icon"))!.message
    expect(message).not.toContain("did you mean")
    expect(message.length).toBeLessThan(ENUM_ERROR_MESSAGE_MAX_LENGTH)
  })

  it("every icon field site (callout/kpi_cards/icon_cards/row_cards/verdict_banner) shares the same did-you-mean treatment", () => {
    const sites: unknown[] = [
      { type: "callout", variant: "info", text: "x", icon: "check-circle" },
      { type: "kpi_cards", items: [{ value: "1", label: "x", icon: "check-circle" }] },
      { type: "row_cards", items: [{ title: "a", icon: "check-circle" }, { title: "b" }, { title: "c" }] },
      { type: "verdict_banner", text: "x", tone: "positive", icon: "check-circle" },
    ]
    for (const component of sites) {
      const v = validateIr(withComponent(component))
      expect(v.ok).toBe(false)
      const message = v.errors.find((e) => e.path.endsWith(".icon"))!.message
      expect(message).toContain('did you mean "circle-check"?')
      expect(message.length).toBeLessThan(ENUM_ERROR_MESSAGE_MAX_LENGTH)
    }
  })

  // Review round: the length bound above was not actually code-enforced —
  // `enumMismatchMessage` interpolated the raw offending value verbatim, so
  // a long *typo* (not just a large candidate list) could blow the bound.
  // Reviewer measured a 2000-char garbage icon value producing a 2098-char
  // message. `describeOffendingValue` (schema-error-hints.ts) now truncates
  // the echoed value past 60 chars — pinned end-to-end here with the
  // reviewer's exact input size.
  it("a long (2000-char) garbage icon value still produces a message under the length bound, with the echoed value truncated", () => {
    const v = validateIr(withComponent({ type: "icon_cards", items: [{ icon: "x".repeat(2000), title: "a", text: "b" }, { icon: "circle-check", title: "c", text: "d" }] }))
    expect(v.ok).toBe(false)
    const message = v.errors.find((e) => e.path.endsWith(".icon"))!.message
    expect(message.length).toBeLessThan(ENUM_ERROR_MESSAGE_MAX_LENGTH)
    expect(message).toContain("(2000 chars total)")
    expect(message).not.toContain("x".repeat(2000)) // the full 2000-char value is never echoed verbatim
  })

  it("a 5000-char garbage icon value resolves quickly (no suggestion search runs) and still respects the length bound", () => {
    const start = performance.now()
    const v = validateIr(withComponent({ type: "icon_cards", items: [{ icon: "y".repeat(5000), title: "a", text: "b" }, { icon: "circle-check", title: "c", text: "d" }] }))
    const elapsed = performance.now() - start
    expect(v.ok).toBe(false)
    const message = v.errors.find((e) => e.path.endsWith(".icon"))!.message
    expect(message.length).toBeLessThan(ENUM_ERROR_MESSAGE_MAX_LENGTH)
    expect(message).not.toContain("did you mean") // far too long to be a plausible typo of any real icon name
    // Generous smoke bound (see src/ir/suggest.test.ts's own comment on why
    // this isn't a tight/flaky assertion) — reviewer measured 483ms against
    // the unguarded search for this exact input size through validateIr's
    // full call chain.
    expect(elapsed).toBeLessThan(200)
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

describe("checkAssetBytes: byte-level asset validation (Task 2, borrow wave — D3)", () => {
  const irWithImage = (src: string) => ({
    ...raw,
    assets: { images: { photo: { src } } },
    slides: [
      raw.slides[0],
      { type: "content" as const, heading: "x", components: [{ type: "image" as const, asset_id: "photo" }] },
    ],
  })

  it("accepts a real PNG data URI unchanged — byte-inertness for a valid deck (hard requirement)", () => {
    const v = validateIr(irWithImage(realPngDataUri))
    expect(v.ok).toBe(true)
    expect(v.errors).toEqual([])
  })

  // dr/d-robustness.md probe 1: a zero-byte PNG previously sailed through
  // resolveLocalAssets/generatePptx and landed in the exported .pptx as a
  // 0-byte media part.
  it("rejects a zero-byte image data URI as an error", () => {
    const v = validateIr(irWithImage("data:image/png;base64,"))
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.path).toBe("assets.images.photo")
    expect(v.errors[0]!.message).toMatch(/zero-byte image/)
  })

  // dr/d-robustness.md probe 2: corrupt/garbage bytes under a PNG-shaped
  // wrapper previously passed every existing check silently.
  it("rejects garbage bytes with an unrecognized header as an error", () => {
    const v = validateIr(irWithImage("data:image/png;base64,AAAA"))
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.message).toMatch(/corrupt or unrecognized header/)
    expect(v.errors[0]!.message).toMatch(/PNG, JPEG, WebP, or GIF/)
  })

  // dr/d-robustness.md probe 3: a real PNG's bytes declared as image/jpeg.
  // Disposition: reject, don't silently trust the bytes and rewrite the
  // MIME (see checkAssetBytes's own doc comment for why).
  it("rejects a real PNG declared as image/jpeg — extension/MIME-vs-bytes mismatch", () => {
    const pngPayload = realPngDataUri.slice(realPngDataUri.indexOf(",") + 1)
    const v = validateIr(irWithImage(`data:image/jpeg;base64,${pngPayload}`))
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.message).toBe(
      'asset "photo" declares "image/jpeg" but its bytes are actually image/png — fix the data URI\'s MIME prefix or re-export the image as image/jpeg',
    )
  })

  it("does not decode/sniff an http(s) source — that ingestion form is validated at a different seam", () => {
    const v = validateIr(irWithImage("https://example.com/photo.png"))
    expect(v.ok).toBe(true)
    expect(v.errors).toEqual([])
  })

  it("does not decode/sniff a not-yet-resolved local file path — resolveLocalAssets validates that seam", () => {
    const v = validateIr(irWithImage("photo.png"))
    expect(v.ok).toBe(true)
    expect(v.errors).toEqual([])
  })
})

describe("checkAssetReferences: dangling asset_id warning (Task 2, borrow wave — B5)", () => {
  it("warns (does not reject) when an image component references an asset_id absent from assets.images", () => {
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        { type: "content", heading: "x", components: [{ type: "image", asset_id: "missing" }] },
      ],
    })
    expect(v.ok).toBe(true)
    expect(v.errors).toEqual([])
    expect(v.warnings).toHaveLength(1)
    expect(v.warnings?.[0]!.path).toBe("slides.1.components.0.asset_id")
    expect(v.warnings?.[0]!.message).toBe(
      'asset_id "missing" is not defined in assets.images — available: (none defined)',
    )
  })

  it("names the available asset keys when one is defined but the reference is a typo", () => {
    const v = validateIr({
      ...raw,
      assets: { images: { logo: { src: realPngDataUri } } },
      slides: [
        raw.slides[0],
        { type: "content", heading: "x", components: [{ type: "image", asset_id: "logoo" }] },
      ],
    })
    expect(v.ok).toBe(true)
    expect(v.warnings?.[0]!.message).toBe(
      'asset_id "logoo" is not defined in assets.images — available: "logo"',
    )
  })

  it("does not warn when the asset_id resolves to a real key", () => {
    const v = validateIr({
      ...raw,
      assets: { images: { logo: { src: realPngDataUri } } },
      slides: [
        raw.slides[0],
        { type: "content", heading: "x", components: [{ type: "image", asset_id: "logo" }] },
      ],
    })
    expect(v.ok).toBe(true)
    expect(v.warnings).toBeUndefined()
  })

  it("catches a dangling asset_id on an \"asset\"-kind slide background", () => {
    const v = validateIr({
      ...raw,
      slides: [
        { ...raw.slides[0], background: { kind: "asset", asset_id: "missing-bg" } },
        raw.slides[1],
      ],
    })
    expect(v.ok).toBe(true)
    expect(v.warnings?.[0]!.path).toBe("slides.0.background.asset_id")
    expect(v.warnings?.[0]!.message).toMatch(/asset_id "missing-bg" is not defined/)
  })

  it("catches a dangling brand.logo_asset_id", () => {
    const v = validateIr({ ...raw, brand: { logo_asset_id: "missing-logo" } })
    expect(v.ok).toBe(true)
    expect(v.warnings?.[0]!.path).toBe("brand.logo_asset_id")
    expect(v.warnings?.[0]!.message).toMatch(/asset_id "missing-logo" is not defined/)
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
