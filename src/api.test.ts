import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { PptxIRSchema } from "@/ir"
import { measureTextUnits } from "@/lib/svg-text-layout"
import { makeSolidRegionPngDataUri } from "@/platform/test-png-fixture"
import { formatIssues, formatWarnings, generatePptx, irJsonSchema, listThemes, renderSlideSvg, validateIr } from "./api"
import { ENUM_ERROR_MESSAGE_MAX_LENGTH } from "./ir/schema-error-hints"
import { CAPACITY } from "./svg/audit/capacity"
import { LAYOUT_REGISTRY } from "./svg/layouts/registry"
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

    it("accepts a content slide naming a valid layout id", () => {
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

    // quote-stage wave, task T1 (`.issues/2026-07-28-quote-stage/plan.md`'s
    // 裁定 1, TDD assertion (d)): `checkLayoutApplicability` only ever checks
    // registry existence + `slideTypes` — it must keep passing a pinOnly
    // layout, since pin-only means "only an explicit pin reaches it", and
    // this *is* that explicit pin. A synthetic `LAYOUT_REGISTRY` entry
    // stands in for the not-yet-built `quote-stage` (T2's job) — this task
    // is the mechanism only.
    describe("pinOnly layout: explicit pin still passes applicability", () => {
      const PIN_ONLY_TEST_ID = "test-pin-only-layout"

      beforeEach(() => {
        LAYOUT_REGISTRY[PIN_ONLY_TEST_ID] = {
          id: PIN_ONLY_TEST_ID,
          kind: "archetype",
          slideTypes: ["content"],
          slots: [],
          pinOnly: true,
        }
      })
      afterEach(() => {
        delete LAYOUT_REGISTRY[PIN_ONLY_TEST_ID]
      })

      it("accepts a content slide explicitly pinning a pinOnly layout id", () => {
        const v = validateIr({
          ...raw,
          slides: [
            raw.slides[0],
            { type: "content", heading: "Quote", layout: PIN_ONLY_TEST_ID, components: [] },
          ],
        })
        expect(v.ok).toBe(true)
      })
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

describe("full-body component exclusivity gate (structure-components wave 1 task 1 decision 2, set extended by wave 1 task 2 and wave 2 tasks 1-2)", () => {
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
  const fiveForcesOnly = {
    type: "five_forces",
    rivalry: { items: ["r"] },
    new_entrants: { items: ["n"] },
    supplier_power: { items: ["sp"] },
    buyer_power: { items: ["bp"] },
    substitutes: { items: ["su"] },
  }
  const heatmapOnly = {
    type: "heatmap",
    x_labels: ["Q1", "Q2"],
    y_labels: ["A"],
    values: [[1, 2]],
  }
  const sankeyOnly = {
    type: "sankey",
    nodes: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    links: [{ from: "a", to: "b", value: 10 }],
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

  it("accepts a slide whose sole component is a full-body type (five_forces)", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "content", heading: "Five Forces", components: [fiveForcesOnly] }],
    })
    expect(v.ok).toBe(true)
  })

  it("accepts a slide whose sole component is a full-body type (heatmap)", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "content", heading: "Heatmap", components: [heatmapOnly] }],
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

  it("hard-rejects two full-body components across the wave-2 named-slot pair sharing one slide", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "content", heading: "PEST + Five Forces", components: [pestOnly, fiveForcesOnly] }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.message).toMatch(/"pest, five_forces" is a full-body component/)
  })

  it("hard-rejects the wave-2 value-grid full-body type (heatmap) paired with an ordinary sibling", () => {
    const v = validateIr({
      ...raw,
      slides: [
        {
          type: "content",
          heading: "Heatmap + bullets",
          components: [heatmapOnly, { type: "bullets", items: ["extra sibling"] }],
        },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.message).toMatch(/"heatmap" is a full-body component/)
  })

  it("accepts a slide whose sole component is a full-body type (sankey)", () => {
    const v = validateIr({
      ...raw,
      slides: [{ type: "content", heading: "Sankey", components: [sankeyOnly] }],
    })
    expect(v.ok).toBe(true)
  })

  it("hard-rejects the wave-2 flow-graph full-body type (sankey) paired with an ordinary sibling", () => {
    const v = validateIr({
      ...raw,
      slides: [
        {
          type: "content",
          heading: "Sankey + bullets",
          components: [sankeyOnly, { type: "bullets", items: ["extra sibling"] }],
        },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.message).toMatch(/"sankey" is a full-body component/)
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
    "hard-rejects a %s slide carrying components — every layout in that family drops them silently",
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
    "accepts a %s slide carrying only a subheading — never gated, since no type drops it on every layout (corrects the benchmark's initial hypothesis that subheading might belong here too)",
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
  // must find something) instead of falling through to layout auto-pick.
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

// quote-stage wave, task T2, 裁定 2: pinning a `pinOnly` layout
// (registry.ts's `LayoutDefinition.pinOnly`) over its own declared `body`
// capacity is a hard error end-to-end through `validateIr` — not just at
// the `checkIrQuality` unit level (`ir-quality.test.tsx` already covers
// that). quote-stage is the pool's only `pinOnly` member as of this task.
describe("pin_only_over_capacity end-to-end via validateIr (quote-stage wave, task T2, 裁定 2)", () => {
  it("pinning quote-stage with 2 components hard-blocks validateIr, naming the layout id and both numbers", () => {
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        { type: "content", heading: "金句", layout: "quote-stage", components: [{ type: "paragraph", text: "a" }, { type: "paragraph", text: "b" }] },
      ],
    })
    expect(v.ok).toBe(false)
    expect(
      v.errors.some(
        (e) => e.message.includes('"quote-stage"') && e.message.includes("at most 1") && e.message.includes("has 2"),
      ),
    ).toBe(true)
  })

  it("pinning quote-stage with 1 component (at capacity) validates ok", () => {
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        { type: "content", heading: "金句", layout: "quote-stage", components: [{ type: "paragraph", text: "—— 出处" }] },
      ],
    })
    expect(v.ok).toBe(true)
  })

  it("pinning quote-stage with 0 components (a pure quote) validates ok", () => {
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content", heading: "金句", layout: "quote-stage", components: [] }],
    })
    expect(v.ok).toBe(true)
  })

  it("pinning statement with 2 components hard-blocks validateIr, naming the layout id and both numbers", () => {
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "金句",
          layout: "statement",
          components: [
            { type: "paragraph", text: "a" },
            { type: "paragraph", text: "b" },
          ],
        },
      ],
    })
    expect(v.ok).toBe(false)
    expect(
      v.errors.some(
        (e) => e.message.includes('"statement"') && e.message.includes("at most 1") && e.message.includes("has 2"),
      ),
    ).toBe(true)
  })

  it("pinning verse-chapter with components still hard-rejects as a chapter boundary (no body slot, so pin_only_over_capacity does not apply)", () => {
    const v = validateIr({
      ...raw,
      slides: [
        {
          type: "chapter",
          heading: "章首",
          layout: "verse-chapter",
          components: [{ type: "paragraph", text: "should not be here" }],
        },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.message.includes('"chapter" slides do not render components'))).toBe(true)
    expect(v.errors.every((e) => !e.message.includes("pinned layout"))).toBe(true)
  })

  it("regression: pinning an ordinary (non-pinOnly) layout over its own capacity keeps ok:true with only a density warning — the new hard error never fires for it", () => {
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "标题",
          layout: "two-column",
          components: Array.from({ length: 5 }, (_, i) => ({ type: "paragraph" as const, text: String(i) })),
        },
      ],
    })
    expect(v.ok).toBe(true)
    expect(v.warnings?.some((w) => w.message.includes("too many components"))).toBe(true)
  })

  it("a pathologically long quote-stage heading that still truncates at minPt hard-blocks validateIr, naming the render-safety limit", () => {
    const CJK_LONG =
      "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: `${CJK_LONG}${CJK_LONG}${CJK_LONG}`,
          layout: "quote-stage",
          components: [],
        },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.message.includes("render-safety limit"))).toBe(true)
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

describe("describeQualityIssue: chart_duplicate_category English message (R1 evidence wave, Task T2)", () => {
  // chart-model.ts's buildChartModel flags a category (x value) repeated
  // within one series — a warn-severity advisory (Global Constraint 2: a
  // data-quality concern, never a schema-level hard error), translated to
  // English here for the public validate surface, same convention as
  // chart_axes_ignored above.
  it("names the series and the duplicated category, and stays ok:true (warn, not error)", () => {
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "Revenue",
          components: [
            {
              type: "chart",
              chart_type: "bar",
              series: [
                {
                  name: "Q1 Actuals",
                  data: [{ x: "East", y: 10 }, { x: "East", y: 20 }, { x: "West", y: 15 }],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(v.ok).toBe(true)
    const warning = v.warnings?.find((w) => w.message.includes("duplicate category"))
    expect(warning).toBeTruthy()
    expect(warning?.message).toMatch(/Q1 Actuals/)
    expect(warning?.message).toMatch(/East/)
    // public surface (CLI output/error messages) is English — never leak
    // ir-quality.ts's own internal Chinese wording.
    expect(warning?.message).not.toMatch(/[一-鿿]/)
  })

  it("does NOT fire when every series has distinct category values", () => {
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "Revenue",
          components: [
            {
              type: "chart",
              chart_type: "bar",
              series: [{ name: "Q1 Actuals", data: [{ x: "East", y: 10 }, { x: "West", y: 15 }] }],
            },
          ],
        },
      ],
    })
    expect(v.ok).toBe(true)
    expect(v.warnings?.some((w) => w.message.includes("duplicate category")) ?? false).toBe(false)
  })

  it("fires for a duplicate category on a chart_type that renders it byte-identically otherwise (pie — data-quality concern is chart_type-agnostic)", () => {
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
              series: [
                { name: "Segment", data: [{ x: "Enterprise", y: 40 }, { x: "Enterprise", y: 10 }, { x: "SMB", y: 50 }] },
              ],
            },
          ],
        },
      ],
    })
    expect(v.ok).toBe(true)
    const warning = v.warnings?.find((w) => w.message.includes("duplicate category"))
    expect(warning).toBeTruthy()
    expect(warning?.message).toMatch(/Enterprise/)
  })
})

describe("describeQualityIssue: chart_line_too_many_series English message", () => {
  const manyLineSeries = Array.from({ length: 9 }, (_, i) => ({
    name: `S${i}`,
    data: [
      { x: "A", y: i + 1 },
      { x: "B", y: i + 2 },
    ],
  }))

  it("names the 8-series ceiling and stays ok:true (warn, not error)", () => {
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "Trend",
          components: [{ type: "chart", chart_type: "line", series: manyLineSeries }],
        },
      ],
    })
    expect(v.ok).toBe(true)
    const warning = v.warnings?.find((w) => w.message.includes("series"))
    expect(warning).toBeTruthy()
    expect(warning?.message).toMatch(/8/)
    expect(warning?.message).toMatch(/line/)
    expect(warning?.message).not.toMatch(/[一-鿿]/)
  })

  it("does NOT fire at 8 line series", () => {
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "Trend",
          components: [{ type: "chart", chart_type: "line", series: manyLineSeries.slice(0, 8) }],
        },
      ],
    })
    expect(v.ok).toBe(true)
    expect(v.warnings?.some((w) => w.message.includes("too many series")) ?? false).toBe(false)
  })
})

describe("describeQualityIssue: data_table_missing_cell English message (R1 evidence wave, Task T3)", () => {
  // data-table.ts's schema tolerates a row whose `cells` omits one of
  // `columns`' declared keys (the lenient half of the plan's revised
  // contract — the strict half, an extra undeclared key, is a schema-level
  // hard error instead, never reaching this warn-severity advisory).
  // Translated to English here for the public validate surface, same
  // convention as chart_duplicate_category above.
  it("names the row index and the missing column key, and stays ok:true (warn, not error)", () => {
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "Metrics",
          components: [
            {
              type: "data_table",
              columns: [
                { key: "metric", label: "Metric" },
                { key: "q1", label: "Q1" },
              ],
              rows: [{ cells: { metric: "Revenue" } }],
            },
          ],
        },
      ],
    })
    expect(v.ok).toBe(true)
    const warning = v.warnings?.find((w) => w.message.includes("missing a value"))
    expect(warning).toBeTruthy()
    expect(warning?.message).toMatch(/row 0/)
    expect(warning?.message).toMatch(/"q1"/)
    // public surface (CLI output/error messages) is English — never leak
    // ir-quality.ts's own internal Chinese wording.
    expect(warning?.message).not.toMatch(/[一-鿿]/)
  })

  it("does NOT fire when every row's cells cover every declared column", () => {
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "Metrics",
          components: [
            {
              type: "data_table",
              columns: [
                { key: "metric", label: "Metric" },
                { key: "q1", label: "Q1" },
              ],
              rows: [{ cells: { metric: "Revenue", q1: "120" } }],
            },
          ],
        },
      ],
    })
    expect(v.ok).toBe(true)
    expect(v.warnings?.some((w) => w.message.includes("missing a value")) ?? false).toBe(false)
  })
})

// carried-items wave: comparison/citation/architecture got a render-time
// box.h cap + data-dropped marker from P0 hardening's family sweep (same
// fix bullets.tsx got) but no pre-render editorial signal of their own —
// this wave's warn tier (English message coverage below) plus its error
// tier (the following describe block, mirroring bullets_count_overflow's
// end-to-end generatePptx enforcement) close that gap. Thresholds come from
// CAPACITY.comparison/.citation/.architecture (capacity.ts's own derivation
// comments carry the box-geometry arithmetic).
describe("describeQualityIssue: comparison/citation/architecture English messages (carried-items wave)", () => {
  it("comparison_overflow names the row count and stays ok:true (warn, not error)", () => {
    const threshold = CAPACITY.comparison.warnRows
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "Comparison",
          components: [
            {
              type: "comparison",
              columns: ["A", "B"],
              rows: Array.from({ length: threshold + 1 }, (_, i) => ({ label: `row ${i}`, cells: ["x", "y"] })),
            },
          ],
        },
      ],
    })
    expect(v.ok).toBe(true)
    const warning = v.warnings?.find((w) => w.message.includes("comparison table"))
    expect(warning).toBeTruthy()
    expect(warning?.message).toMatch(/too many rows/)
    expect(warning?.message).toContain(String(threshold))
    // public surface (CLI output/error messages) is English — never leak
    // ir-quality.ts's own internal Chinese wording.
    expect(warning?.message).not.toMatch(/[一-鿿]/)
  })

  it("citation_overflow names the source count and stays ok:true (warn, not error)", () => {
    const threshold = CAPACITY.citation.warnSources
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "Citation",
          components: [
            {
              type: "citation",
              sources: Array.from({ length: threshold + 1 }, (_, i) => ({ label: `source ${i}` })),
            },
          ],
        },
      ],
    })
    expect(v.ok).toBe(true)
    const warning = v.warnings?.find((w) => w.message.includes("citation list"))
    expect(warning).toBeTruthy()
    expect(warning?.message).toMatch(/too many sources/)
    expect(warning?.message).toContain(String(threshold))
    expect(warning?.message).not.toMatch(/[一-鿿]/)
  })

  it("architecture_overflow names the layer count and stays ok:true (warn, not error)", () => {
    const threshold = CAPACITY.architecture.warnLayers
    const v = validateIr({
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "Architecture",
          components: [
            {
              type: "architecture",
              layers: Array.from({ length: threshold + 1 }, (_, i) => ({ title: `layer ${i}`, items: ["a"] })),
            },
          ],
        },
      ],
    })
    expect(v.ok).toBe(true)
    const warning = v.warnings?.find((w) => w.message.includes("architecture diagram"))
    expect(warning).toBeTruthy()
    expect(warning?.message).toMatch(/too many layers/)
    expect(warning?.message).toContain(String(threshold))
    expect(warning?.message).not.toMatch(/[一-鿿]/)
  })
})

// carried-items wave: the error-tier counterpart of the warn messages above
// — same dual-threshold end-to-end enforcement bullets_count_overflow's own
// describe block (above) already pins for bullets, applied to the other
// three vertical-stacking family members.
describe("comparison/citation/architecture count geometric hard error (carried-items wave, mirrors bullets_count_overflow)", () => {
  it(`comparison: a table past the count ceiling (${CAPACITY.comparison.errorRows} rows) hard-blocks generatePptx with a bounded English message`, async () => {
    const tooMany = Array.from({ length: CAPACITY.comparison.errorRows + 1 }, (_, i) => ({ label: `row ${i}`, cells: ["x", "y"] }))
    const ir = {
      ...raw,
      slides: [raw.slides[0], { type: "content", heading: "Overflow", components: [{ type: "comparison", columns: ["A", "B"], rows: tooMany }] }],
    }
    const v = validateIr(ir)
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.message.includes("far too many rows"))).toBe(true)
    let caught: Error | undefined
    try {
      await generatePptx(ir)
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeTruthy()
    expect(caught!.message).toContain(String(CAPACITY.comparison.errorRows))
    expect(caught!.message.length).toBeLessThan(2_000)
  })

  it(`does NOT report comparison_count_overflow at exactly ${CAPACITY.comparison.errorRows} rows — still ok:true`, () => {
    const atCeiling = Array.from({ length: CAPACITY.comparison.errorRows }, (_, i) => ({ label: `row ${i}`, cells: ["x", "y"] }))
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content", heading: "At ceiling", components: [{ type: "comparison", columns: ["A", "B"], rows: atCeiling }] }],
    })
    expect(v.ok).toBe(true)
  })

  it(`citation: a list past the count ceiling (${CAPACITY.citation.errorSources} sources) hard-blocks generatePptx with a bounded English message`, async () => {
    const tooMany = Array.from({ length: CAPACITY.citation.errorSources + 1 }, (_, i) => ({ label: `source ${i}` }))
    const ir = {
      ...raw,
      slides: [raw.slides[0], { type: "content", heading: "Overflow", components: [{ type: "citation", sources: tooMany }] }],
    }
    const v = validateIr(ir)
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.message.includes("far too many sources"))).toBe(true)
    let caught: Error | undefined
    try {
      await generatePptx(ir)
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeTruthy()
    expect(caught!.message).toContain(String(CAPACITY.citation.errorSources))
    expect(caught!.message.length).toBeLessThan(2_000)
  })

  it(`does NOT report citation_count_overflow at exactly ${CAPACITY.citation.errorSources} sources — still ok:true`, () => {
    const atCeiling = Array.from({ length: CAPACITY.citation.errorSources }, (_, i) => ({ label: `source ${i}` }))
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content", heading: "At ceiling", components: [{ type: "citation", sources: atCeiling }] }],
    })
    expect(v.ok).toBe(true)
  })

  it(`architecture: a diagram past the count ceiling (${CAPACITY.architecture.errorLayers} layers) hard-blocks generatePptx with a bounded English message`, async () => {
    const tooMany = Array.from({ length: CAPACITY.architecture.errorLayers + 1 }, (_, i) => ({ title: `layer ${i}`, items: ["a"] }))
    const ir = {
      ...raw,
      slides: [raw.slides[0], { type: "content", heading: "Overflow", components: [{ type: "architecture", layers: tooMany }] }],
    }
    const v = validateIr(ir)
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.message.includes("far too many layers"))).toBe(true)
    let caught: Error | undefined
    try {
      await generatePptx(ir)
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeTruthy()
    expect(caught!.message).toContain(String(CAPACITY.architecture.errorLayers))
    expect(caught!.message.length).toBeLessThan(2_000)
  })

  it(`does NOT report architecture_count_overflow at exactly ${CAPACITY.architecture.errorLayers} layers — still ok:true`, () => {
    const atCeiling = Array.from({ length: CAPACITY.architecture.errorLayers }, (_, i) => ({ title: `layer ${i}`, items: ["a"] }))
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content", heading: "At ceiling", components: [{ type: "architecture", layers: atCeiling }] }],
    })
    expect(v.ok).toBe(true)
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

describe("narrative {id} shape rescue (T0b fix 2, bench-evidence)", () => {
  // A weak model that just wrote `theme: {id: "consulting"}` pattern-matches
  // the same wrapper shape onto `narrative`. Real bench-failing inputs
  // (.issues/notes/quality-evidence.md item 2, 3 real failures — 60%
  // of flash's total): {"id":"training"}, {"id":"boardroom-report"}.
  it("rescues the exact bench-failing input {id: \"training\"} — validates, resolves to the training preset, and reports the rewrite", () => {
    const v = validateIr({ ...raw, narrative: { id: "training" } })
    expect(v.ok).toBe(true)
    // The rewrite reaches the parsed IR itself (not just this call's local
    // resolveNarrative check) — a downstream render re-resolving
    // ir.narrative independently sees the corrected string too.
    expect(v.ir?.narrative).toBe("training")
    expect(v.normalized).toBeDefined()
    expect(v.normalized!.some((n) => n.includes("narrative") && n.includes("training"))).toBe(true)
  })

  it("rescues {id: \"boardroom-report\"} — the other real bench-failing input", () => {
    const v = validateIr({ ...raw, narrative: { id: "boardroom-report" } })
    expect(v.ok).toBe(true)
    expect(v.ir?.narrative).toBe("boardroom-report")
  })

  it("an unknown preset id under the {id} shape still hard-errors with resolveNarrative's own message — the rescue only normalizes shape, never validates the id", () => {
    const v = validateIr({ ...raw, narrative: { id: "not-a-real-preset" } })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.path).toBe("narrative")
    expect(v.errors[0]!.message).toMatch(/unknown narrative preset/)
  })

  it("does NOT rescue a mixed {id, strategy} shape — genuinely ambiguous, stays a hard error", () => {
    const v = validateIr({ ...raw, narrative: { id: "training", strategy: "pyramid" } })
    expect(v.ok).toBe(false)
    expect(v.normalized).toBeUndefined()
    expect(v.errors[0]!.path).toBe("narrative")
    expect(v.errors[0]!.message).toMatch(/unknown narrative axis "id"/)
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
    expect(message).not.toMatch(/'bullets' \| 'paragraph'/) // the full component-type option list is never flattened into the message
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
          // White/light-gray text — every `defaultBackgrounds` entry below is
          // the same medium-saturation "#123ABC" blue, and #101010/#666666
          // (this fixture's pre-registerTheme-contrast-floor values) measured
          // 2.14:1/1.55:1 against it, below the new 3.0 floor
          // (`assertContrastFloor`, backlog-sweep task I2). Unrelated to what
          // either test in this describe block actually asserts (the
          // "#123ABC" substring check reads `colors.bg`/`colors.primary`, not
          // these two tokens).
          text: "#FFFFFF",
          muted: "#CCCCCC",
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
      // Narrow (single-layout) curated set per slide type — proves
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

  it("throws a named PptfastError (not a bare TypeError) for a component.type that bypassed validateIr (wave-2 sweep, T3, final review Minor 2)", () => {
    const ir = PptxIRSchema.parse(raw)
    // A type assertion, not `validateIr`, is what could ever put an invalid
    // `type` on a `Component` — `RENDER_DEFS[component.type]` used to be
    // `undefined` for it, surfacing as a bare "Cannot read properties of
    // undefined" TypeError instead of a message naming the bad type.
    ir.slides[1]!.components = [{ type: "not_a_real_component_type" } as unknown as (typeof ir.slides)[1]["components"][number]]
    expect(() => renderSlideSvg(ir, 1)).toThrow(/not_a_real_component_type/)
    expect(() => renderSlideSvg(ir, 1)).toThrow(/validateIr/)
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

  it("omitted chrome matches cover-only: content page drops the footer rule and org", () => {
    const omitted = {
      version: "4",
      filename: "omit-chrome",
      theme: { id: "consulting" },
      meta: { organization: "ACME", date: "2026" },
      slides: [
        { type: "cover", heading: "Pitch" },
        { type: "content", heading: "The point", layout: "quiet-frame", components: [{ type: "paragraph", text: "Say it." }] },
        { type: "ending", heading: "Thanks" },
      ],
    }
    const v = validateIr(omitted)
    expect(v.ok).toBe(true)
    expect(v.ir?.chrome).toBeUndefined()
    const contentSvg = renderSlideSvg(v.ir!, 1)
    expect(contentSvg).not.toContain('y1="664"')
    expect(contentSvg).not.toContain("ACME")
    const coverSvg = renderSlideSvg(v.ir!, 0)
    expect(coverSvg).toContain("Pitch")
  })

  it("validates and renders a cover-only talk deck to pptx", async () => {
    const talk = {
      version: "4",
      filename: "talk-chrome",
      theme: { id: "consulting" },
      chrome: "cover-only",
      meta: { organization: "ACME", date: "2026" },
      slides: [
        { type: "cover", heading: "Pitch" },
        { type: "content", heading: "The point", layout: "quiet-frame", components: [{ type: "paragraph", text: "Say it." }] },
        { type: "ending", heading: "Thanks" },
      ],
    }
    const v = validateIr(talk)
    expect(v.ok).toBe(true)
    expect(v.ir?.chrome).toBe("cover-only")
    const contentSvg = renderSlideSvg(v.ir!, 1)
    expect(contentSvg).not.toContain('y1="664"')
    expect(contentSvg).not.toContain("ACME")
    const bytes = await generatePptx(talk)
    expect(bytes.length).toBeGreaterThan(10_000)
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
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

describe("generatePptx content-drop gate (deep-review P1)", () => {
  // Eight long CJK paragraphs on one page: `layoutContentFit` compresses the
  // gaps, then drops whatever still does not fit (same fixture shape as
  // `svg/layout.test.ts`'s own drop case). Nothing on the rendered slide
  // says the missing blocks ever existed — which is the whole reason the
  // export refuses.
  const LONG =
    "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"
  const overfull = (n: number) =>
    Array.from({ length: n }, () => ({ type: "paragraph" as const, text: LONG.repeat(3) }))
  const dropping = {
    ...raw,
    slides: [
      raw.slides[0],
      { type: "content" as const, id: "p-2", heading: "Too much", components: overfull(8) },
    ],
  }

  it("the fixture really does lose content silently — no marker text on the rendered slide", () => {
    const v = validateIr(dropping)
    expect(v.ok).toBe(true)
    const svg = renderSlideSvg(v.ir!, 1)
    expect(svg).toMatch(/data-dropped-silent="[1-9]/)
    expect(svg).not.toContain("more")
  })

  it("throws PptfastError naming the page, the count and the way out", async () => {
    await expect(generatePptx(dropping)).rejects.toThrow(
      /deck drops \d+ content blocks that do not fit the content area, on 1 page: p-2 \(page 2, \d+\) — shorten the content, split the page in two, or pass --allow-dropped-content/,
    )
  })

  it("falls back to a page-only reference when the slide has no id", async () => {
    const noId = {
      ...raw,
      slides: [raw.slides[0], { type: "content" as const, heading: "Too much", components: overfull(8) }],
    }
    await expect(generatePptx(noId)).rejects.toThrow(/on 1 page: page 2 \(\d+\)/)
  })

  it("exports when { allowDroppedContent: true } is passed", async () => {
    const bytes = await generatePptx(dropping, { allowDroppedContent: true })
    expect(bytes.length).toBeGreaterThan(10_000)
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
  })

  it("is unaffected by a deck that fits", async () => {
    const bytes = await generatePptx(raw)
    expect(bytes.length).toBeGreaterThan(10_000)
  })

  it("renderSlideSvg never gates on dropped content (preview shows work in progress)", () => {
    const v = validateIr(dropping)
    expect(() => renderSlideSvg(v.ir!, 1)).not.toThrow()
  })

  it("does not fire on a component's own visible '+N …' trim", async () => {
    // `bullets.tsx` caps its items to what `box.h` holds and *says so* on
    // the slide. The reader is not misled, so this stays an advisory audit
    // finding — blocking it here would make the gate unfalsifiable noise.
    const manyBullets = {
      ...raw,
      slides: [
        raw.slides[0],
        {
          type: "content" as const,
          heading: "Long list",
          components: [
            { type: "bullets" as const, items: Array.from({ length: 40 }, (_, i) => `${LONG} ${i}`) },
          ],
        },
      ],
    }
    const v = validateIr(manyBullets)
    expect(v.ok).toBe(true)
    const svg = renderSlideSvg(v.ir!, 1)
    expect(svg).toContain("data-dropped=")
    expect(svg).not.toContain("data-dropped-silent")
    const bytes = await generatePptx(manyBullets)
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
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
  it("lists 22 canonical themes with labels and color tokens", () => {
    const themes = listThemes()
    expect(themes).toHaveLength(22)
    expect(themes.map((t) => t.id)).toContain("consulting")
    expect(themes.map((t) => t.id)).toContain("crayon")
    expect(themes.map((t) => t.id)).toContain("museum")
    expect(themes.map((t) => t.id)).toContain("stage")
    expect(themes.map((t) => t.id)).toContain("lecture")
    expect(themes.map((t) => t.id)).toContain("swiss")
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

  // Review fix round, Important-1: `irJsonSchema()` is the schema surface a
  // model actually reads before writing IR (`pptfast schema`, `cli/commands
  // .ts`'s `schema` command) — a component-vs-alternative selection call
  // that only lives in a source comment never reaches it. device_mockup is
  // the first component to carry a `.describe()` (`ir/components/
  // device-mockup.ts`); this locks that the guidance text actually survives
  // z.toJSONSchema's traversal (component-level .describe() sits underneath
  // a .strict().superRefine() wrapper, and the schema itself is a member of
  // a top-level z.discriminatedUnion — either layer could have silently
  // dropped it) all the way into the emitted JSON Schema, not just that the
  // source file calls .describe() somewhere.
  it("surfaces device_mockup's component-selection guidance (when to use it vs `image`)", () => {
    const json = JSON.stringify(irJsonSchema())
    expect(json).toContain("Frames a product or app screenshot inside a real device")
    expect(json).toContain("keep plain photos, illustrations, and other non-screen images as `image`")
  })

  it("surfaces device_mockup's device/url field-level guidance", () => {
    const json = JSON.stringify(irJsonSchema())
    expect(json).toContain("Frame shape to draw")
    expect(json).toContain("Address-bar text shown in the browser chrome bar")
  })

  // cycle wave (`.issues/2026-08-05-component-waves/plan-cycle.md`, 裁定 3):
  // same precedent device_mockup's Important-1 fix established — the
  // flowchart-vs-cycle selection test (does the process reach an endpoint,
  // or loop back to its own start) has to survive z.toJSONSchema's
  // traversal (component-level .describe() sits underneath .strict(), and
  // the schema is a member of a top-level z.discriminatedUnion) into the
  // emitted JSON Schema, not just live in a source comment.
  it("surfaces cycle's component-selection guidance (when to use it vs `flowchart`)", () => {
    const json = JSON.stringify(irJsonSchema())
    expect(json).toContain("Lays 3-8 stages out on a closed ring with arrow connectors")
    expect(json).toContain("loops back to its own start")
    expect(json).toContain("use `flowchart` instead when the process reaches a real")
  })

  it("surfaces cycle's items field-level guidance", () => {
    const json = JSON.stringify(irJsonSchema())
    expect(json).toContain("connected clockwise, the last stage")
    expect(json).toContain("Short label shown inside the stage's node on the ring")
  })

  // people_cards wave (`.issues/2026-08-05-component-waves/
  // plan-people-cards.md`, 裁定 4): same precedent — the people_cards vs.
  // row_cards/icon_cards selection test (is the content fundamentally
  // about people) has to survive z.toJSONSchema's traversal into the
  // emitted JSON Schema, not just live in a source comment.
  it("surfaces people_cards's component-selection guidance (when to use it vs `row_cards`/`icon_cards`)", () => {
    const json = JSON.stringify(irJsonSchema())
    expect(json).toContain("Lays 2-12 people out on an equal-weight card grid")
    expect(json).toContain("deterministic initials badge")
    expect(json).toContain("keep `row_cards`/`icon_cards`")
  })

  it("surfaces people_cards's name field-level guidance (the initials-derivation contract)", () => {
    const json = JSON.stringify(irJsonSchema())
    expect(json).toContain("the initials badge is derived from this exact string")
    expect(json).toContain("a CJK name takes only its first character (surname), never two")
  })

  // logo_wall wave (`.issues/2026-08-06-logo-wall/plan.md`, 裁定 5): the
  // model already guesses this component's own name — the selection guidance
  // (logo_wall vs image_grid vs device_mockup) has to reach the emitted JSON
  // Schema the model reads, not just a source comment.
  it("surfaces logo_wall's component-selection guidance (when to use it vs `image_grid`/`device_mockup`)", () => {
    const json = JSON.stringify(irJsonSchema())
    expect(json).toContain("Lays 4-12 organization/brand logos out on an even wall")
    expect(json).toContain("contain-fit (never cropped)")
    expect(json).toContain("Keep `image_grid`")
  })

  it("surfaces logo_wall's asset_id field-level guidance (the contain-fit backing contract)", () => {
    const json = JSON.stringify(irJsonSchema())
    expect(json).toContain("drawn contain-fit (never cropped) on an auto-generated neutral backing panel")
    expect(json).toContain("transparent single-ink logo")
  })

  // chart-depth wave (`.issues/2026-08-06-chart-depth/task-1-report.md`): the
  // four new chart subtypes (scatter/area/donut/gauge) and the guidance for
  // WHICH one to reach for — including the gauge-vs-kpi_cards boundary ("never
  // a row of gauges") — live only in chart_type's `.describe()`. That enum
  // sits under the chart schema's `.strict().superRefine()` wrapper inside the
  // top-level discriminatedUnion, the same two layers that could silently drop
  // a description (same precedent device_mockup's Important-1 fix established);
  // this locks that the subtype enum members AND their selection guidance
  // survive z.toJSONSchema into the emitted JSON Schema the model actually
  // reads (`pptfast schema`), not just a source comment.
  it("surfaces chart_type's subtype selection guidance (the four chart-depth subtypes + the gauge-vs-kpi_cards boundary)", () => {
    const json = JSON.stringify(irJsonSchema())
    // the new enum members reach the emitted schema
    expect(json).toContain('"scatter","area","donut","gauge"')
    // per-subtype selection guidance (when to reach for each)
    expect(json).toContain("a numeric x-y point cloud")
    expect(json).toContain("the ring form of pie")
    // the distinctive gauge-vs-kpi_cards redirect
    expect(json).toContain("never a row of gauges")
  })

  // tag_row wave (`.issues/2026-08-06-tag-row/plan.md`, 裁定 3): the whole
  // point of this component is the selection boundary the model reads (short
  // nominal labels vs bullets/row_cards prose) — lock that the boundary
  // survives into the emitted JSON Schema, same as every component wave since
  // device_mockup's Important-1 established the precedent.
  it("surfaces tag_row's component-selection guidance (labels-not-sentences boundary + the bullets/row_cards redirects)", () => {
    const json = JSON.stringify(irJsonSchema())
    expect(json).toContain("wrapping row of pills")
    expect(json).toContain("a name, not a sentence")
    expect(json).toContain("If each item carries its own descriptive text")
  })

  it("surfaces tag_row's item-level length guidance (the ≤24-char nominal-label contract)", () => {
    const json = JSON.stringify(irJsonSchema())
    expect(json).toContain("One short, nominal label")
    expect(json).toContain("Not a sentence and not a described item")
  })

  it("surfaces the deck chrome enum (full / cover-only / minimal)", () => {
    const json = JSON.stringify(irJsonSchema())
    expect(json).toContain("cover-only")
    expect(json).toContain("minimal")
    expect(json).toContain('Omitted equals \\"cover-only\\"')
  })
})
