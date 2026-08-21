
import { describe, it, expect } from "vitest"
import { parsePptxIR, BUILTIN_THEME_IDS } from "./index"

const minimal = () => ({
  version: "4", filename: "d.pptx",
  theme: { id: "consulting" }, meta: { organization: "ACME" },
  assets: { images: {} },
  slides: [{ type: "cover", heading: "标题" }],
})

describe("IR v4 theme field", () => {
  it("accepts theme with style and brand overrides", () => {
    const d: any = minimal()
    d.theme = {
      id: "ink",
      style: { colors: { primary: "#0B5FFF" } },
      brand: { suppressFooterRule: false },
    }
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("rejects the retired top-level style field (strict)", () => {
    const d: any = minimal()
    d.style = { id: "consulting" }
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects the dropped override field", () => {
    const d: any = minimal()
    d.theme = { id: "consulting", override: { primary: "#123456" } }
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("IR v4 omission defaults (weak-model friendly)", () => {
  it("a bare slides-only deck parses with all defaults", () => {
    const r = parsePptxIR({ slides: [{ heading: "只有一页", components: [] }] })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.version).toBe("4")
      expect(r.data.filename).toBe("presentation")
      expect(r.data.theme.id).toBe("consulting")
      expect(r.data.slides[0]!.type).toBe("content")
    }
  })
  it("theme with style but no id defaults to consulting", () => {
    const d: any = minimal()
    d.theme = { style: { colors: { primary: "#0B5FFF" } } }
    const r = parsePptxIR(d)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.theme.id).toBe("consulting")
  })
  it("a wrong value is still a hard error (omission ≠ typo)", () => {
    const d: any = minimal()
    d.version = "3"
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("pptx-ir v4", () => {
  it("parses minimal v4", () => {
    const r = parsePptxIR(minimal()); expect(r.success).toBe(true)
  })
  it("slide carries type/arrangement, no layout_ref", () => {
    const d: any = minimal()
    d.slides = [{ type: "content", arrangement: "two_column", heading: "x", components: [] }]
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("slide accepts an explicit layout id as an open string (registry existence is a validateIr gate, not a schema enum)", () => {
    const d: any = minimal()
    d.slides = [{ type: "content", layout: "image-split", heading: "x", components: [] }]
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("rejects the retired variant field (strict schema — W2 task 3 split it into layout + arrangement)", () => {
    const d: any = minimal()
    d.slides = [{ type: "content", variant: "two_column", heading: "x", components: [] }]
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects an arrangement value from the old image-takeover family (those 4 promoted to layout, not arrangement)", () => {
    const d: any = minimal()
    d.slides = [{ type: "content", arrangement: "image_split", heading: "x", components: [] }]
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects layouts / layout_ref", () => {
    const d: any = minimal(); d.layouts = { cover: { type: "cover" } }
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects unknown slide field (strict)", () => {
    const d: any = minimal(); d.slides[0].decorations = []
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("slide accepts an optional beat (P1 variety wave, task 1's additive v4 field — 'anchor'/'dense'/'breathing')", () => {
    for (const beat of ["anchor", "dense", "breathing"]) {
      const d: any = minimal()
      d.slides = [{ type: "content", heading: "x", beat, components: [] }]
      const r = parsePptxIR(d)
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.slides[0]!.beat).toBe(beat)
    }
  })
  it("a slide with no beat omits the field entirely (no default, unlike type/version)", () => {
    const r = parsePptxIR(minimal())
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.slides[0]!.beat).toBeUndefined()
  })
  it("rejects an unknown beat value (typo, not omission)", () => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "x", beat: "urgent", components: [] }]
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("parses successfully when assets is omitted (backend default)", () => {
    const d: any = minimal()
    delete d.assets
    const r = parsePptxIR(d)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.assets).toEqual({ images: {} })
    }
  })
  it("consulting is a built-in theme id, stripe-purple is not", () => {
    expect(BUILTIN_THEME_IDS).toContain("consulting")
    expect(BUILTIN_THEME_IDS).not.toContain("stripe-purple")
  })
})

describe("expressive components: roadmap / matrix / insight_panel", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  it("parses roadmap with period + label:value rows", () => {
    const d = withComponents([
      {
        type: "roadmap",
        items: [
          { title: "样板验证", period: "0-6 个月", rows: [{ label: "规模", value: "3-5 站" }] },
          { title: "区域扩张", rows: [] },
        ],
      },
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("rejects roadmap with a single item (min 2)", () => {
    const d = withComponents([{ type: "roadmap", items: [{ title: "只有一个" }] }])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("parses matrix with axis titles + tone-coded items", () => {
    const d = withComponents([
      {
        type: "matrix",
        x_title: "需求确定性",
        y_title: "资产投入",
        cols: 2,
        items: [
          { title: "县乡节点", tag: "低确定性", tone: "neutral" },
          { title: "城市旗舰", tag: "高刚需", tone: "accent" },
        ],
      },
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("rejects matrix with an unknown tone (strict enum)", () => {
    const d = withComponents([
      { type: "matrix", cols: 2, items: [{ title: "a", tone: "danger" }, { title: "b" }] },
    ])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("parses insight_panel with rows + footnote", () => {
    const d = withComponents([
      {
        type: "insight_panel",
        title: "策略推演｜三类资本纪律",
        rows: [{ label: "重资产", text: "城市旗舰、高速走廊。" }],
        footnote: "退出条件：现金流未达门槛。",
      },
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("rejects insight_panel with an unknown field (strict)", () => {
    const d = withComponents([
      { type: "insight_panel", title: "t", rows: [{ label: "a", text: "b" }], extra: 1 },
    ])
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("chart subtypes (chart-depth wave: scatter / area / donut / gauge)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const chart = (extra: Record<string, unknown>) => withComponents([{ type: "chart", ...extra }])

  it("accepts the four new chart_type values alongside the original five", () => {
    for (const chart_type of ["bar", "line", "pie", "funnel", "dumbbell", "scatter", "area", "donut", "gauge"]) {
      // scatter/gauge get shape-valid single-value fixtures; the rest share one label series.
      const series =
        chart_type === "scatter"
          ? [{ name: "s", data: [{ x: 1, y: 2 }] }]
          : [{ name: "s", data: [{ x: "A", y: 5 }] }]
      expect(parsePptxIR(chart({ chart_type, series })).success, chart_type).toBe(true)
    }
  })

  it("scatter accepts numeric x-y pairs with an optional per-point size (bubble)", () => {
    const d = chart({ chart_type: "scatter", series: [{ name: "s", data: [{ x: 1, y: 2, size: 8 }, { x: 3, y: 4 }] }] })
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("scatter rejects a string x — the model reaching for line/bar by the wrong name", () => {
    const d = chart({ chart_type: "scatter", series: [{ name: "s", data: [{ x: "Q1", y: 2 }] }] })
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("scatter accepts a single point (a legal, if minimal, plot)", () => {
    expect(parsePptxIR(chart({ chart_type: "scatter", series: [{ name: "s", data: [{ x: 5, y: 5 }] }] })).success).toBe(true)
  })
  it("scatter rejects a negative per-point size", () => {
    const d = chart({ chart_type: "scatter", series: [{ name: "s", data: [{ x: 1, y: 2, size: -3 }] }] })
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("donut accepts an optional center_total flag", () => {
    expect(parsePptxIR(chart({ chart_type: "donut", center_total: true, series: [{ name: "s", data: [{ x: "A", y: 5 }] }] })).success).toBe(true)
    expect(parsePptxIR(chart({ chart_type: "donut", series: [{ name: "s", data: [{ x: "A", y: 5 }] }] })).success).toBe(true)
  })

  it("gauge accepts exactly one series with one point, with an optional min/max range", () => {
    expect(parsePptxIR(chart({ chart_type: "gauge", series: [{ name: "s", data: [{ x: "Done", y: 62 }] }] })).success).toBe(true)
    expect(parsePptxIR(chart({ chart_type: "gauge", gauge: { min: 0, max: 200 }, series: [{ name: "s", data: [{ x: "Done", y: 150 }] }] })).success).toBe(true)
  })
  it("gauge rejects more than one data point (kpi_cards territory)", () => {
    const d = chart({ chart_type: "gauge", series: [{ name: "s", data: [{ x: "A", y: 1 }, { x: "B", y: 2 }] }] })
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("gauge rejects more than one series", () => {
    const d = chart({ chart_type: "gauge", series: [{ name: "a", data: [{ x: "A", y: 1 }] }, { name: "b", data: [{ x: "B", y: 2 }] }] })
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("gauge rejects a max at or below min", () => {
    const d = chart({ chart_type: "gauge", gauge: { min: 100, max: 50 }, series: [{ name: "s", data: [{ x: "A", y: 60 }] }] })
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("gauge boundary values 0% and 100% are legal", () => {
    for (const y of [0, 100]) {
      expect(parsePptxIR(chart({ chart_type: "gauge", series: [{ name: "s", data: [{ x: "P", y }] }] })).success, String(y)).toBe(true)
    }
  })

  it("area accepts a multi-series category shape, like line", () => {
    const d = chart({
      chart_type: "area",
      series: [
        { name: "a", data: [{ x: "Q1", y: 5 }, { x: "Q2", y: 8 }] },
        { name: "b", data: [{ x: "Q1", y: 3 }, { x: "Q2", y: 6 }] },
      ],
    })
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("area accepts a negative value (volume can dip below the baseline)", () => {
    expect(parsePptxIR(chart({ chart_type: "area", series: [{ name: "s", data: [{ x: "Q1", y: -4 }, { x: "Q2", y: 6 }] }] })).success).toBe(true)
  })
})

describe("swot component (structure-components wave task 1, named-slot family)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const swotComponent = (n: number) => ({
    type: "swot",
    strengths: Array.from({ length: n }, (_, i) => `s${i}`),
    weaknesses: ["w0"],
    opportunities: ["o0"],
    threats: ["t0"],
  })

  it("accepts 1-5 items per quadrant", () => {
    for (const n of [1, 3, 5]) {
      expect(parsePptxIR(withComponents([swotComponent(n)])).success).toBe(true)
    }
  })
  it("rejects an empty quadrant array (min 1)", () => {
    const d = withComponents([{ type: "swot", strengths: [], weaknesses: ["w0"], opportunities: ["o0"], threats: ["t0"] }])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects more than 5 items in a quadrant (max 5)", () => {
    expect(parsePptxIR(withComponents([swotComponent(6)])).success).toBe(false)
  })
  it("rejects a missing quadrant (all four are required, not a positional array)", () => {
    const d = withComponents([{ type: "swot", strengths: ["s0"], weaknesses: ["w0"], opportunities: ["o0"] }])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects an unknown top-level field (strict)", () => {
    const d = withComponents([{ ...swotComponent(1), extra: 1 }])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("accepts an optional labels override with any subset of the four keys", () => {
    const d = withComponents([{ ...swotComponent(1), labels: { strengths: "优势" } }])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("rejects an unknown key inside labels (strict)", () => {
    const d = withComponents([{ ...swotComponent(1), labels: { strengths: "优势", extra: "x" } }])
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("bmc component (structure-components wave task 1, named-slot family)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const bmcComponent = (overrides: Record<string, string[]> = {}) => ({
    type: "bmc",
    key_partners: ["p0"],
    key_activities: ["a0"],
    key_resources: ["r0"],
    value_propositions: ["v0"],
    customer_relationships: ["cr0"],
    channels: ["c0"],
    customer_segments: ["cs0"],
    cost_structure: ["co0"],
    revenue_streams: ["rs0"],
    ...overrides,
  })

  it("accepts all nine named keys with 1-4 items each", () => {
    expect(parsePptxIR(withComponents([bmcComponent()])).success).toBe(true)
    expect(
      parsePptxIR(withComponents([bmcComponent({ key_partners: ["p0", "p1", "p2", "p3"] })])).success,
    ).toBe(true)
  })
  it("rejects an empty block array (min 1)", () => {
    expect(parsePptxIR(withComponents([bmcComponent({ key_partners: [] })])).success).toBe(false)
  })
  it("rejects more than 4 items in a block (max 4)", () => {
    expect(
      parsePptxIR(withComponents([bmcComponent({ key_partners: ["p0", "p1", "p2", "p3", "p4"] })])).success,
    ).toBe(false)
  })
  it("rejects a missing named key (all nine are required, not a positional array)", () => {
    const full = bmcComponent() as any
    delete full.revenue_streams
    expect(parsePptxIR(withComponents([full])).success).toBe(false)
  })
  it("rejects an unknown top-level field (strict)", () => {
    const d = withComponents([{ ...bmcComponent(), extra: 1 }])
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("waterfall component (structure-components wave task 2, numeric-axis family)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const items = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ label: `项目${i}`, value: i % 2 === 0 ? 10 : -5 }))

  it("accepts 3-8 items", () => {
    for (const n of [3, 5, 8]) {
      expect(parsePptxIR(withComponents([{ type: "waterfall", items: items(n) }])).success).toBe(true)
    }
  })
  it("rejects fewer than 3 items", () => {
    expect(parsePptxIR(withComponents([{ type: "waterfall", items: items(2) }])).success).toBe(false)
  })
  it("rejects more than 8 items", () => {
    expect(parsePptxIR(withComponents([{ type: "waterfall", items: items(9) }])).success).toBe(false)
  })
  it("accepts an item with kind omitted, 'delta', or 'total'", () => {
    const d = withComponents([
      {
        type: "waterfall",
        items: [
          { label: "a", value: 10 },
          { label: "b", value: -5, kind: "delta" },
          { label: "c", value: 20, kind: "total" },
        ],
      },
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("rejects an unknown kind value", () => {
    const d = withComponents([{ type: "waterfall", items: [...items(2), { label: "c", value: 1, kind: "bogus" }] }])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("accepts an optional unit string", () => {
    const d = withComponents([{ type: "waterfall", items: items(3), unit: "万" }])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("rejects an unknown top-level field (strict)", () => {
    const d = withComponents([{ type: "waterfall", items: items(3), extra: 1 }])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects an unknown field inside an item (strict)", () => {
    const d = withComponents([{ type: "waterfall", items: [...items(2), { label: "c", value: 1, extra: 1 }] }])
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("gantt component (structure-components wave task 2, numeric-axis family)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `阶段${i}`, start: i, end: i + 2 }))

  it("accepts 2-8 items", () => {
    for (const n of [2, 5, 8]) {
      expect(parsePptxIR(withComponents([{ type: "gantt", items: items(n) }])).success).toBe(true)
    }
  })
  it("rejects fewer than 2 items", () => {
    expect(parsePptxIR(withComponents([{ type: "gantt", items: items(1) }])).success).toBe(false)
  })
  it("rejects more than 8 items", () => {
    expect(parsePptxIR(withComponents([{ type: "gantt", items: items(9) }])).success).toBe(false)
  })
  it("rejects an item whose end is not greater than start (positive refine test)", () => {
    const equal = withComponents([{ type: "gantt", items: [{ label: "a", start: 3, end: 3 }, ...items(1)] }])
    expect(parsePptxIR(equal).success).toBe(false)
    const inverted = withComponents([{ type: "gantt", items: [{ label: "a", start: 5, end: 2 }, ...items(1)] }])
    expect(parsePptxIR(inverted).success).toBe(false)
  })
  it("accepts an optional axis_labels array", () => {
    const d = withComponents([{ type: "gantt", items: items(2), axis_labels: ["W1", "W2", "W3"] }])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("rejects an unknown top-level field (strict)", () => {
    const d = withComponents([{ type: "gantt", items: items(2), extra: 1 }])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects an unknown field inside an item (strict)", () => {
    const d = withComponents([{ type: "gantt", items: [{ label: "a", start: 0, end: 1, extra: 1 }, ...items(1)] }])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("does not parse date strings — start/end must be numbers", () => {
    const d = withComponents([{ type: "gantt", items: [{ label: "a", start: "2024-01-01", end: "2024-02-01" }, ...items(1)] }])
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("pest component (structure-components wave 2 task 1, named-slot family)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const quadrant = (n: number, overrides: Record<string, unknown> = {}) => ({
    items: Array.from({ length: n }, (_, i) => `i${i}`),
    ...overrides,
  })
  const pestComponent = (overrides: Record<string, unknown> = {}) => ({
    type: "pest",
    political: quadrant(1),
    economic: quadrant(1),
    social: quadrant(1),
    technological: quadrant(1),
    ...overrides,
  })

  it("accepts 1-5 items per quadrant", () => {
    for (const n of [1, 3, 5]) {
      expect(parsePptxIR(withComponents([pestComponent({ political: quadrant(n) })])).success).toBe(true)
    }
  })
  it("rejects an empty quadrant items array (min 1)", () => {
    expect(parsePptxIR(withComponents([pestComponent({ political: quadrant(0) })])).success).toBe(false)
  })
  it("rejects more than 5 items in a quadrant (max 5)", () => {
    expect(parsePptxIR(withComponents([pestComponent({ political: quadrant(6) })])).success).toBe(false)
  })
  it("rejects a missing quadrant (all four are required, not a positional array)", () => {
    const full = pestComponent() as any
    delete full.technological
    expect(parsePptxIR(withComponents([full])).success).toBe(false)
  })
  it("rejects an unknown top-level field (strict)", () => {
    const d = withComponents([{ ...pestComponent(), extra: 1 }])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("accepts an optional inline title per quadrant", () => {
    const d = withComponents([pestComponent({ political: quadrant(1, { title: "政治" }) })])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("rejects an unknown field inside a quadrant object (strict)", () => {
    const d = withComponents([pestComponent({ political: quadrant(1, { extra: "x" }) })])
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("five_forces component (structure-components wave 2 task 1, named-slot family)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const panel = (n: number, overrides: Record<string, unknown> = {}) => ({
    items: Array.from({ length: n }, (_, i) => `i${i}`),
    ...overrides,
  })
  const fiveForcesComponent = (overrides: Record<string, unknown> = {}) => ({
    type: "five_forces",
    rivalry: panel(1),
    new_entrants: panel(1),
    supplier_power: panel(1),
    buyer_power: panel(1),
    substitutes: panel(1),
    ...overrides,
  })

  it("accepts 1-5 items per panel", () => {
    for (const n of [1, 3, 5]) {
      expect(parsePptxIR(withComponents([fiveForcesComponent({ rivalry: panel(n) })])).success).toBe(true)
    }
  })
  it("rejects an empty panel items array (min 1)", () => {
    expect(parsePptxIR(withComponents([fiveForcesComponent({ rivalry: panel(0) })])).success).toBe(false)
  })
  it("rejects more than 5 items in a panel (max 5)", () => {
    expect(parsePptxIR(withComponents([fiveForcesComponent({ rivalry: panel(6) })])).success).toBe(false)
  })
  it("rejects a missing panel (all five are required, not a positional array)", () => {
    const full = fiveForcesComponent() as any
    delete full.substitutes
    expect(parsePptxIR(withComponents([full])).success).toBe(false)
  })
  it("rejects an unknown top-level field (strict)", () => {
    const d = withComponents([{ ...fiveForcesComponent(), extra: 1 }])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("accepts an optional inline label per panel", () => {
    const d = withComponents([fiveForcesComponent({ rivalry: panel(1, { label: "竞争烈度" }) })])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("accepts an optional intensity enum (low/medium/high) on any panel, including the center", () => {
    for (const level of ["low", "medium", "high"]) {
      const d = withComponents([fiveForcesComponent({ rivalry: panel(1, { intensity: level }) })])
      expect(parsePptxIR(d).success).toBe(true)
    }
  })
  it("rejects an unknown intensity value (strict enum)", () => {
    const d = withComponents([fiveForcesComponent({ rivalry: panel(1, { intensity: "extreme" }) })])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects an unknown field inside a panel object (strict)", () => {
    const d = withComponents([fiveForcesComponent({ rivalry: panel(1, { extra: "x" }) })])
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("heatmap component (structure-components wave 2 task 2, value-grid family)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const heatmapComponent = (overrides: Record<string, unknown> = {}) => ({
    type: "heatmap",
    x_labels: ["Q1", "Q2"],
    y_labels: ["North", "South"],
    values: [
      [1, 2],
      [3, 4],
    ],
    ...overrides,
  })

  it("accepts a well-formed rectangular grid", () => {
    expect(parsePptxIR(withComponents([heatmapComponent()])).success).toBe(true)
  })
  it("accepts a single row (1 y_label)", () => {
    const d = withComponents([heatmapComponent({ y_labels: ["only"], values: [[1, 2]] })])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("accepts a single column (1 x_label)", () => {
    const d = withComponents([heatmapComponent({ x_labels: ["only"], values: [[1], [2]] })])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("accepts a single cell (1x1)", () => {
    const d = withComponents([heatmapComponent({ x_labels: ["x"], y_labels: ["y"], values: [[42]] })])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("accepts the schema-max 10x10 grid", () => {
    const labels = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)
    const d = withComponents([
      heatmapComponent({
        x_labels: labels(10, "x"),
        y_labels: labels(10, "y"),
        values: Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => r * 10 + c)),
      }),
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("rejects more than 10 x_labels (max 10)", () => {
    const d = withComponents([
      heatmapComponent({ x_labels: Array.from({ length: 11 }, (_, i) => `x${i}`), values: [Array.from({ length: 11 }, () => 1), Array.from({ length: 11 }, () => 1)] }),
    ])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects more than 10 y_labels (max 10)", () => {
    const d = withComponents([
      heatmapComponent({ y_labels: Array.from({ length: 11 }, (_, i) => `y${i}`), values: Array.from({ length: 11 }, () => [1, 2]) }),
    ])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects an empty x_labels array (min 1)", () => {
    const d = withComponents([heatmapComponent({ x_labels: [], values: [[], []] })])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects a row count that doesn't match y_labels length (rectangularity refine)", () => {
    const d = withComponents([heatmapComponent({ y_labels: ["North", "South", "East"], values: [[1, 2], [3, 4]] })])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects a ragged row whose length doesn't match x_labels length (rectangularity refine)", () => {
    const d = withComponents([heatmapComponent({ values: [[1, 2], [3, 4, 5]] })])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("accepts negative values (no sign constraint)", () => {
    const d = withComponents([heatmapComponent({ values: [[-10, 2], [3, -4]] })])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("accepts an explicit domain override", () => {
    const d = withComponents([heatmapComponent({ domain: { min: 0, max: 100 } })])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("accepts a degenerate explicit domain (min === max)", () => {
    const d = withComponents([heatmapComponent({ domain: { min: 5, max: 5 } })])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("rejects an explicit domain where max < min", () => {
    const d = withComponents([heatmapComponent({ domain: { min: 10, max: 5 } })])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("accepts an optional show_values flag", () => {
    const d = withComponents([heatmapComponent({ show_values: true })])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("accepts optional x_title/y_title", () => {
    const d = withComponents([heatmapComponent({ x_title: "Quarter", y_title: "Region" })])
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("rejects an unknown top-level field (strict)", () => {
    const d = withComponents([{ ...heatmapComponent(), extra: 1 }])
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects an unknown field inside domain (strict)", () => {
    const d = withComponents([heatmapComponent({ domain: { min: 0, max: 1, extra: 1 } })])
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("sankey component (structure-components wave 2 task 3, flow-graph family)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const sankeyComponent = (overrides: Record<string, unknown> = {}) => ({
    type: "sankey",
    nodes: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ],
    links: [
      { from: "a", to: "c", value: 10 },
      { from: "b", to: "c", value: 20 },
    ],
    ...overrides,
  })

  it("accepts a well-formed two-layer graph", () => {
    expect(parsePptxIR(withComponents([sankeyComponent()])).success).toBe(true)
  })

  it("accepts a minimal two-node one-link graph", () => {
    const d = withComponents([
      sankeyComponent({
        nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
        links: [{ from: "a", to: "b", value: 1 }],
      }),
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("accepts a disconnected node alongside a normal chain", () => {
    const d = withComponents([
      sankeyComponent({
        nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }, { id: "orphan", label: "Orphan" }],
      }),
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("accepts a multi-layer chain (A->B->C)", () => {
    const d = withComponents([
      sankeyComponent({
        nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
        links: [{ from: "a", to: "b", value: 5 }, { from: "b", to: "c", value: 5 }],
      }),
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("accepts the schema-max shape (16 nodes, 30 links)", () => {
    const nodes = Array.from({ length: 16 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` }))
    // A dense bipartite-ish fan: first 8 nodes each link to all of the last
    // 8 — 8*8=64 possible, capped at 30 to stay within schema bounds.
    const links: { from: string; to: string; value: number }[] = []
    outer: for (let i = 0; i < 8; i++) {
      for (let j = 8; j < 16; j++) {
        if (links.length >= 30) break outer
        links.push({ from: `n${i}`, to: `n${j}`, value: i + j + 1 })
      }
    }
    const d = withComponents([sankeyComponent({ nodes, links })])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("rejects more than 16 nodes (max 16)", () => {
    const nodes = Array.from({ length: 17 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` }))
    const d = withComponents([sankeyComponent({ nodes, links: [{ from: "n0", to: "n1", value: 1 }] })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects fewer than 2 nodes (min 2)", () => {
    const d = withComponents([sankeyComponent({ nodes: [{ id: "a", label: "A" }], links: [] })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects more than 30 links (max 30)", () => {
    const nodes = Array.from({ length: 16 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` }))
    const links: { from: string; to: string; value: number }[] = []
    outer: for (let i = 0; i < 8; i++) {
      for (let j = 8; j < 16; j++) {
        if (links.length >= 31) break outer
        links.push({ from: `n${i}`, to: `n${j}`, value: 1 })
      }
    }
    const d = withComponents([sankeyComponent({ nodes, links })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an empty links array (min 1)", () => {
    const d = withComponents([sankeyComponent({ links: [] })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects duplicate node ids", () => {
    const d = withComponents([
      sankeyComponent({ nodes: [{ id: "a", label: "A" }, { id: "a", label: "A2" }, { id: "c", label: "C" }] }),
    ])
    const r = parsePptxIR(d)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/duplicated.*'a'/)
  })

  it("rejects a link whose 'from' references an undeclared node id, naming it", () => {
    const d = withComponents([sankeyComponent({ links: [{ from: "ghost", to: "c", value: 1 }] })])
    const r = parsePptxIR(d)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/'ghost'.*not declared/)
  })

  it("rejects a link whose 'to' references an undeclared node id, naming it", () => {
    const d = withComponents([sankeyComponent({ links: [{ from: "a", to: "ghost", value: 1 }] })])
    const r = parsePptxIR(d)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/'ghost'.*not declared/)
  })

  it("rejects a self-loop link with an actionable message", () => {
    const d = withComponents([sankeyComponent({ links: [{ from: "a", to: "a", value: 1 }] })])
    const r = parsePptxIR(d)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/self-loop/)
  })

  it("rejects a zero-value link (value must be > 0)", () => {
    const d = withComponents([sankeyComponent({ links: [{ from: "a", to: "c", value: 0 }] })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects a negative-value link", () => {
    const d = withComponents([sankeyComponent({ links: [{ from: "a", to: "c", value: -5 }] })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("accepts a tiny positive value (pathological-small, not zero)", () => {
    const d = withComponents([sankeyComponent({ links: [{ from: "a", to: "c", value: 0.0001 }] })])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("rejects a 2-cycle (a->b->a) with a message naming the cycle", () => {
    const d = withComponents([
      sankeyComponent({
        nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
        links: [{ from: "a", to: "b", value: 1 }, { from: "b", to: "a", value: 1 }],
      }),
    ])
    const r = parsePptxIR(d)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error).toMatch(/cycle/)
      expect(r.error).toMatch(/a -> b -> a/)
    }
  })

  it("rejects a longer cycle (a->b->c->a) with a message naming the cycle", () => {
    const d = withComponents([
      sankeyComponent({
        links: [{ from: "a", to: "b", value: 1 }, { from: "b", to: "c", value: 1 }, { from: "c", to: "a", value: 1 }],
      }),
    ])
    const r = parsePptxIR(d)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/cycle/)
  })

  it("accepts a DAG that reconverges (diamond shape, not a cycle)", () => {
    const d = withComponents([
      sankeyComponent({
        nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }, { id: "d", label: "D" }],
        links: [
          { from: "a", to: "b", value: 5 },
          { from: "a", to: "c", value: 5 },
          { from: "b", to: "d", value: 5 },
          { from: "c", to: "d", value: 5 },
        ],
      }),
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("rejects an unknown top-level field (strict)", () => {
    const d = withComponents([{ ...sankeyComponent(), extra: 1 }])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an unknown field inside a node object (strict)", () => {
    const d = withComponents([sankeyComponent({ nodes: [{ id: "a", label: "A", extra: 1 }, { id: "b", label: "B" }, { id: "c", label: "C" }] })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an unknown field inside a link object (strict)", () => {
    const d = withComponents([sankeyComponent({ links: [{ from: "a", to: "c", value: 1, extra: 1 }] })])
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("architecture component direction field (probe evidence-gate byproduct, 2026-07-26)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const architectureComponent = (overrides: Record<string, unknown> = {}) => ({
    type: "architecture",
    layers: [
      { title: "Ad Hoc", items: ["No process"] },
      { title: "Data-Led", items: ["Fully instrumented"] },
    ],
    ...overrides,
  })

  it("accepts a component with no direction field (byte-compat default)", () => {
    const d = withComponents([architectureComponent()])
    const result = parsePptxIR(d)
    expect(result.success).toBe(true)
    if (result.success) {
      const c = result.data.slides[0].components?.[0] as any
      expect(c.direction).toBeUndefined()
    }
  })

  it("accepts direction: 'top_down'", () => {
    const d = withComponents([architectureComponent({ direction: "top_down" })])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("accepts direction: 'bottom_up'", () => {
    const d = withComponents([architectureComponent({ direction: "bottom_up" })])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("rejects an invalid direction value", () => {
    const d = withComponents([architectureComponent({ direction: "sideways" })])
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("comparison component cells/columns length contract (probe evidence-gate byproduct, 2026-07-26)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const comparisonComponent = (overrides: Record<string, unknown> = {}) => ({
    type: "comparison",
    columns: ["Sales", "Customer Success"],
    rows: [{ label: "Owns", cells: ["Pipeline", "Renewals"] }],
    ...overrides,
  })

  it("accepts rows whose cells length exactly matches columns.length (unchanged)", () => {
    const d = withComponents([comparisonComponent()])
    expect(parsePptxIR(d).success).toBe(true)
  })

  // ── lenient-fewer-cells contract, unchanged: a row with fewer cells than
  // columns is schema-legal — comparison.tsx's columnTexts() already reads
  // a missing index as "" and renders an empty cell, the positional
  // equivalent of data_table's own "missing key" lenience. ──
  it("accepts a row with fewer cells than columns.length (lenient — renders empty, unchanged)", () => {
    const d = withComponents([
      comparisonComponent({ rows: [{ label: "Owns", cells: ["Pipeline"] }] }),
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("accepts a row with zero cells (lenient — unchanged)", () => {
    const d = withComponents([comparisonComponent({ rows: [{ label: "Owns", cells: [] }] })])
    expect(parsePptxIR(d).success).toBe(true)
  })

  // ── strict-extra-cells contract: a row with more cells than columns is a
  // hard error naming the row index and both counts (superRefine,
  // comparison.ts) — the exact shape the probe artifact hit
  // (qwen3.6-27b/p07: 2 columns, 3 cells per row, the 3rd silently
  // dropped at render). ──
  it("rejects a row with more cells than columns.length (extra-cell hard error)", () => {
    const d = withComponents([
      comparisonComponent({
        rows: [{ label: "Owns", cells: ["Pipeline", "Renewals", "Main point of contact"] }],
      }),
    ])
    const result = parsePptxIR(d)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/rows\[0\]/)
      expect(result.error).toMatch(/3 cell/)
      expect(result.error).toMatch(/2 column/)
    }
  })

  it("extra-cell error names the correct row index for a non-zero row", () => {
    const d = withComponents([
      comparisonComponent({
        rows: [
          { label: "Owns", cells: ["Pipeline", "Renewals"] },
          { label: "Shared", cells: ["Onboarding", "Onboarding", "Main point of contact"] },
        ],
      }),
    ])
    const result = parsePptxIR(d)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/rows\[1\]/)
  })
})

describe("data_table component (R1 evidence wave Task T3 — 33rd component, first through the wave-2 domain-file flow)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const dataTableComponent = (overrides: Record<string, unknown> = {}) => ({
    type: "data_table",
    columns: [
      { key: "metric", label: "Metric" },
      { key: "q1", label: "Q1", align: "right" },
    ],
    rows: [{ cells: { metric: "Revenue", q1: "120" } }],
    ...overrides,
  })

  it("accepts a well-formed minimal table (2 columns, 1 row)", () => {
    expect(parsePptxIR(withComponents([dataTableComponent()])).success).toBe(true)
  })

  it("accepts the schema-max shape (8 columns, 12 rows)", () => {
    const columns = Array.from({ length: 8 }, (_, i) => ({ key: `c${i}`, label: `Col ${i}` }))
    const rows = Array.from({ length: 12 }, (_, r) => ({
      cells: Object.fromEntries(columns.map((c) => [c.key, r])),
    }))
    const d = withComponents([dataTableComponent({ columns, rows })])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("rejects fewer than 2 columns", () => {
    const d = withComponents([
      dataTableComponent({ columns: [{ key: "a", label: "A" }], rows: [{ cells: { a: "x" } }] }),
    ])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects more than 8 columns", () => {
    const columns = Array.from({ length: 9 }, (_, i) => ({ key: `c${i}`, label: `Col ${i}` }))
    const d = withComponents([dataTableComponent({ columns, rows: [{ cells: {} }] })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an empty rows array (min 1)", () => {
    const d = withComponents([dataTableComponent({ rows: [] })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects more than 12 rows", () => {
    const rows = Array.from({ length: 13 }, () => ({ cells: { metric: "x", q1: "1" } }))
    const d = withComponents([dataTableComponent({ rows })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("accepts an explicit align on a column", () => {
    const d = withComponents([
      dataTableComponent({
        columns: [{ key: "a", label: "A", align: "center" }, { key: "b", label: "B" }],
        rows: [{ cells: { a: "x", b: "y" } }],
      }),
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("rejects an invalid align value", () => {
    const d = withComponents([
      dataTableComponent({
        columns: [{ key: "a", label: "A", align: "justify" }, { key: "b", label: "B" }],
        rows: [{ cells: { a: "x", b: "y" } }],
      }),
    ])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("accepts emphasis: highlight and emphasis: total on rows", () => {
    const d = withComponents([
      dataTableComponent({
        rows: [
          { cells: { metric: "Revenue", q1: "120" }, emphasis: "highlight" },
          { cells: { metric: "Total", q1: "500" }, emphasis: "total" },
        ],
      }),
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("rejects an invalid emphasis value", () => {
    const d = withComponents([
      dataTableComponent({ rows: [{ cells: { metric: "x", q1: "1" }, emphasis: "bold" }] }),
    ])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("accepts an optional source footnote", () => {
    const d = withComponents([dataTableComponent({ source: "Internal finance system, FY26" })])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("accepts a numeric cell value (no formatting imposed at schema level)", () => {
    const d = withComponents([dataTableComponent({ rows: [{ cells: { metric: "Revenue", q1: 120.5 } }] })])
    expect(parsePptxIR(d).success).toBe(true)
  })

  // ── lenient-missing-key contract: a row omitting a declared column's key
  // is schema-legal (renders empty + ir-quality warn, see ir-quality.test.tsx
  // for the warn-path assertion — this file only proves the parse itself
  // still succeeds).
  it("accepts a row whose cells omit a declared column's key (lenient — renders empty, warn only)", () => {
    const d = withComponents([dataTableComponent({ rows: [{ cells: { metric: "Revenue" } }] })])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("accepts a row with completely empty cells (every declared column's key missing)", () => {
    const d = withComponents([dataTableComponent({ rows: [{ cells: {} }] })])
    expect(parsePptxIR(d).success).toBe(true)
  })

  // ── strict-extra-key contract: a cells key not declared in columns is a
  // hard error naming the row index and the offending key (superRefine,
  // data-table.ts).
  it("rejects a row whose cells carry a key not declared in any column (extra-key hard error)", () => {
    const d = withComponents([
      dataTableComponent({ rows: [{ cells: { metric: "Revenue", q1: "120", ghost_col: "x" } }] }),
    ])
    const result = parsePptxIR(d)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/rows\[0\]/)
      expect(result.error).toMatch(/ghost_col/)
    }
  })

  it("extra-key error names the correct row index for a non-zero row", () => {
    const d = withComponents([
      dataTableComponent({
        rows: [
          { cells: { metric: "Revenue", q1: "120" } },
          { cells: { metric: "Costs", q1: "80", ghost_col: "x" } },
        ],
      }),
    ])
    const result = parsePptxIR(d)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/rows\[1\]/)
  })

  // ── unique-column-key contract ──
  it("rejects duplicate column keys (structural — hard error)", () => {
    const d = withComponents([
      dataTableComponent({
        columns: [{ key: "a", label: "A" }, { key: "a", label: "A duplicate" }],
        rows: [{ cells: { a: "x" } }],
      }),
    ])
    const result = parsePptxIR(d)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/unique/)
  })

  it("rejects an unknown top-level field (strict)", () => {
    const d = withComponents([{ ...dataTableComponent(), extra: 1 }])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an unknown field inside a column object (strict)", () => {
    const d = withComponents([
      dataTableComponent({ columns: [{ key: "a", label: "A", extra: 1 }, { key: "b", label: "B" }] }),
    ])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an unknown field inside a row object (strict)", () => {
    const d = withComponents([dataTableComponent({ rows: [{ cells: { metric: "x", q1: "1" }, extra: 1 }] })])
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("device_mockup component (device_mockup wave, `.issues/2026-08-05-component-waves/plan-device-mockup.md` — 34th component)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const deviceMockupComponent = (overrides: Record<string, unknown> = {}) => ({
    type: "device_mockup",
    device: "browser",
    asset_id: "dash",
    ...overrides,
  })

  it("accepts a minimal browser mockup (no url, no caption)", () => {
    expect(parsePptxIR(withComponents([deviceMockupComponent()])).success).toBe(true)
  })

  it("accepts a minimal phone mockup (no url, no caption)", () => {
    const d = withComponents([deviceMockupComponent({ device: "phone" })])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("accepts a browser mockup with url and caption both set", () => {
    const d = withComponents([
      deviceMockupComponent({ url: "app.example.com/dashboard", caption: "Live dispatch queue" }),
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("rejects an invalid device value", () => {
    const d = withComponents([deviceMockupComponent({ device: "tablet" })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an unknown top-level field (strict)", () => {
    const d = withComponents([{ ...deviceMockupComponent(), extra: 1 }])
    expect(parsePptxIR(d).success).toBe(false)
  })

  // ── phone-has-no-address-bar contract (superRefine, device-mockup.ts) ──
  it("rejects url set on a phone mockup (tripwire: phone has no address bar)", () => {
    const d = withComponents([deviceMockupComponent({ device: "phone", url: "app.example.com" })])
    const result = parsePptxIR(d)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/url/)
      expect(result.error).toMatch(/phone/)
    }
  })

  it("accepts url set on a browser mockup (the one legal case)", () => {
    const d = withComponents([deviceMockupComponent({ device: "browser", url: "app.example.com" })])
    expect(parsePptxIR(d).success).toBe(true)
  })
})

describe("cycle component (cycle wave, `.issues/2026-08-05-component-waves/plan-cycle.md` — 35th component)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const items = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ label: `Stage ${i + 1}` }))
  const cycleComponent = (overrides: Record<string, unknown> = {}) => ({
    type: "cycle",
    items: items(4),
    ...overrides,
  })

  it("accepts the schema minimum (3 items)", () => {
    expect(parsePptxIR(withComponents([cycleComponent({ items: items(3) })])).success).toBe(true)
  })

  it("accepts the schema maximum (8 items)", () => {
    expect(parsePptxIR(withComponents([cycleComponent({ items: items(8) })])).success).toBe(true)
  })

  it("accepts an optional overall title and per-item description", () => {
    const d = withComponents([
      cycleComponent({
        title: "Product loop",
        items: [
          { label: "Plan", description: "Set goals" },
          { label: "Execute", description: "Do the work" },
          { label: "Review", description: "Check outcomes" },
        ],
      }),
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("accepts omitting the optional title and per-item description", () => {
    expect(parsePptxIR(withComponents([cycleComponent({ items: items(3) })])).success).toBe(true)
  })

  // ── 裁定 1: 2 stages can't close into a ring — the hard floor, with a
  // clear error pointing authors at flowchart/steps instead. ──
  it("rejects 2 items (too few to read as a closed loop) with a message pointing at flowchart/steps", () => {
    const d = withComponents([cycleComponent({ items: items(2) })])
    const result = parsePptxIR(d)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/closed loop/)
      expect(result.error).toMatch(/flowchart/)
      expect(result.error).toMatch(/steps/)
    }
  })

  it("rejects 0 items", () => {
    expect(parsePptxIR(withComponents([cycleComponent({ items: items(0) })])).success).toBe(false)
  })

  // ── geometric ceiling — 9+ would crowd the ring past legible size. ──
  it("rejects 9 items with a message explaining the ceiling", () => {
    const d = withComponents([cycleComponent({ items: items(9) })])
    const result = parsePptxIR(d)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/at most 8/)
    }
  })

  it("rejects an item missing a label", () => {
    const d = withComponents([cycleComponent({ items: [{ description: "no label" }, ...items(3)] })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an unknown top-level field (strict)", () => {
    const d = withComponents([{ ...cycleComponent(), extra: 1 }])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an unknown item-level field (strict)", () => {
    const d = withComponents([cycleComponent({ items: [{ label: "Plan", bogus: 1 }, ...items(3)] })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  // ── 裁定 1: no direction field, no center-text slot — not part of this
  // component's minimal semantic surface. ──
  it("rejects a direction field (not part of this component's schema)", () => {
    const d = withComponents([cycleComponent({ direction: "counterclockwise" })])
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("people_cards component (people_cards wave, `.issues/2026-08-05-component-waves/plan-people-cards.md` — 36th component)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const people = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `Person ${i + 1}` }))
  const peopleCardsComponent = (overrides: Record<string, unknown> = {}) => ({
    type: "people_cards",
    people: people(4),
    ...overrides,
  })

  it("accepts the schema minimum (2 people)", () => {
    expect(parsePptxIR(withComponents([peopleCardsComponent({ people: people(2) })])).success).toBe(true)
  })

  it("accepts the schema maximum (12 people)", () => {
    expect(parsePptxIR(withComponents([peopleCardsComponent({ people: people(12) })])).success).toBe(true)
  })

  it("accepts an optional overall title and per-person role/org", () => {
    const d = withComponents([
      peopleCardsComponent({
        title: "Leadership team",
        people: [
          { name: "Sarah Chen", role: "CEO", org: "Acme Corp" },
          { name: "王小明", role: "CTO", org: "Acme Corp" },
        ],
      }),
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("accepts omitting the optional title and per-person role/org", () => {
    expect(parsePptxIR(withComponents([peopleCardsComponent({ people: people(2) })])).success).toBe(true)
  })

  // ── 裁定 1: a single person doesn't need a grid — the hard floor, with a
  // clear error pointing authors at callout/plain text instead. ──
  it("rejects 1 person (too few for a grid) with a message pointing at callout/plain text", () => {
    const d = withComponents([peopleCardsComponent({ people: people(1) })])
    const result = parsePptxIR(d)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/at least 2 people/)
      expect(result.error).toMatch(/callout/)
    }
  })

  it("rejects 0 people", () => {
    expect(parsePptxIR(withComponents([peopleCardsComponent({ people: people(0) })])).success).toBe(false)
  })

  // ── 裁定 1: the p12 evidence's own ceiling — 13+ should split across
  // multiple people_cards slides instead. ──
  it("rejects 13 people with a message explaining the ceiling", () => {
    const d = withComponents([peopleCardsComponent({ people: people(13) })])
    const result = parsePptxIR(d)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/at most 12/)
    }
  })

  it("rejects a person missing a name", () => {
    const d = withComponents([peopleCardsComponent({ people: [{ role: "no name" }, ...people(2)] })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an unknown top-level field (strict)", () => {
    const d = withComponents([{ ...peopleCardsComponent(), extra: 1 }])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an unknown person-level field (strict)", () => {
    const d = withComponents([
      peopleCardsComponent({ people: [{ name: "Sarah Chen", bogus: 1 }, ...people(2)] }),
    ])
    expect(parsePptxIR(d).success).toBe(false)
  })

  // ── 裁定 1: no photo/contact/social fields — not part of this
  // component's minimal semantic surface. ──
  it("rejects a photo field on a person (not part of this component's schema)", () => {
    const d = withComponents([
      peopleCardsComponent({ people: [{ name: "Sarah Chen", photo: "asset-1" }, ...people(2)] }),
    ])
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("logo_wall component (logo_wall wave, `.issues/2026-08-06-logo-wall/plan.md` — 37th component)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const logos = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ asset_id: `logo-${i + 1}` }))
  const logoWallComponent = (overrides: Record<string, unknown> = {}) => ({
    type: "logo_wall",
    items: logos(6),
    ...overrides,
  })

  it("accepts the schema minimum (4 logos)", () => {
    expect(parsePptxIR(withComponents([logoWallComponent({ items: logos(4) })])).success).toBe(true)
  })

  it("accepts the schema maximum (12 logos)", () => {
    expect(parsePptxIR(withComponents([logoWallComponent({ items: logos(12) })])).success).toBe(true)
  })

  it("accepts an optional overall title and per-item label", () => {
    const d = withComponents([
      logoWallComponent({
        title: "As seen in",
        items: [
          { asset_id: "the-ledger", label: "The Ledger Review" },
          { asset_id: "vantage", label: "Vantage Wire" },
          { asset_id: "circuit" },
          { asset_id: "harbor", label: "Harbor Press" },
        ],
      }),
    ])
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("accepts omitting the optional title and per-item label", () => {
    expect(parsePptxIR(withComponents([logoWallComponent({ items: logos(4) })])).success).toBe(true)
  })

  // ── 裁定 1: fewer than 4 logos don't need a wall — the hard floor, with a
  // clear error pointing authors at image/image_grid instead. ──
  it("rejects 3 logos (too few for a wall) with a message pointing at image/image_grid", () => {
    const d = withComponents([logoWallComponent({ items: logos(3) })])
    const result = parsePptxIR(d)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/at least 4 logos/)
      expect(result.error).toMatch(/image_grid/)
    }
  })

  it("rejects 0 logos", () => {
    expect(parsePptxIR(withComponents([logoWallComponent({ items: logos(0) })])).success).toBe(false)
  })

  // ── 裁定 4: past 12 each logo shrinks below a legible size — split across
  // multiple slides instead. ──
  it("rejects 13 logos with a message explaining the ceiling", () => {
    const d = withComponents([logoWallComponent({ items: logos(13) })])
    const result = parsePptxIR(d)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/at most 12/)
    }
  })

  it("rejects an item missing asset_id", () => {
    const d = withComponents([logoWallComponent({ items: [{ label: "no asset" }, ...logos(4)] })])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an unknown top-level field (strict)", () => {
    const d = withComponents([{ ...logoWallComponent(), extra: 1 }])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an unknown item-level field (strict)", () => {
    const d = withComponents([
      logoWallComponent({ items: [{ asset_id: "logo-x", bogus: 1 }, ...logos(4)] }),
    ])
    expect(parsePptxIR(d).success).toBe(false)
  })

  // ── 裁定 1: no grayscale/link/weight fields — not part of this
  // component's minimal semantic surface. ──
  it("rejects a grayscale field on an item (not part of this component's schema)", () => {
    const d = withComponents([
      logoWallComponent({ items: [{ asset_id: "logo-x", grayscale: true }, ...logos(4)] }),
    ])
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("tag_row component (tag_row wave, `.issues/2026-08-06-tag-row/plan.md` — 38th component)", () => {
  const withComponents = (components: any[]) => {
    const d: any = minimal()
    d.slides = [{ type: "content", heading: "h", components }]
    return d
  }
  const tags = (n: number) => Array.from({ length: n }, (_, i) => `Tag${i + 1}`)
  const tagRowComponent = (overrides: Record<string, unknown> = {}) => ({
    type: "tag_row",
    items: tags(4),
    ...overrides,
  })

  it("accepts the schema minimum (2 tags)", () => {
    expect(parsePptxIR(withComponents([tagRowComponent({ items: tags(2) })])).success).toBe(true)
  })

  it("accepts the schema maximum (16 tags)", () => {
    expect(parsePptxIR(withComponents([tagRowComponent({ items: tags(16) })])).success).toBe(true)
  })

  it("accepts an optional overall title and an emphasis of \"first\"/\"none\"", () => {
    for (const emphasis of ["first", "none"] as const) {
      const d = withComponents([tagRowComponent({ title: "Tech stack", emphasis, items: ["React", "TypeScript", "Vite"] })])
      expect(parsePptxIR(d).success).toBe(true)
    }
  })

  it("accepts omitting the optional title and emphasis", () => {
    expect(parsePptxIR(withComponents([tagRowComponent({ items: tags(3) })])).success).toBe(true)
  })

  it("accepts a CJK/Latin-mixed label at the length cap", () => {
    const d = withComponents([tagRowComponent({ items: ["基于 Kubernetes Operator", "分布式事务一致性"] })])
    expect(parsePptxIR(d).success).toBe(true)
  })

  // ── 裁定 1: one label isn't a row — the hard floor. ──
  it("rejects 1 tag (not a row) with a message pointing at heading/callout/verdict_banner", () => {
    const result = parsePptxIR(withComponents([tagRowComponent({ items: tags(1) })]))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/at least 2 tags/)
      expect(result.error).toMatch(/callout|verdict_banner/)
    }
  })

  it("rejects 0 tags", () => {
    expect(parsePptxIR(withComponents([tagRowComponent({ items: tags(0) })])).success).toBe(false)
  })

  // ── 裁定 1: past 16 the row is a keyword dump — the hard ceiling. ──
  it("rejects 17 tags with a message explaining the ceiling", () => {
    const result = parsePptxIR(withComponents([tagRowComponent({ items: tags(17) })]))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/at most 16/)
  })

  // ── 裁定 3: the per-item length cap is the boundary that stops a model
  // shoving sentence-shaped bullet content into a tag — the error points at
  // bullets/row_cards/icon_cards by name. ──
  it("rejects a sentence-shaped item (over the 24-char cap) pointing at bullets/row_cards", () => {
    const sentence = "This is a full descriptive sentence that belongs in bullets"
    const result = parsePptxIR(withComponents([tagRowComponent({ items: [sentence, "ok"] })]))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/short nominal label/)
      expect(result.error).toMatch(/bullets/)
      expect(result.error).toMatch(/row_cards|icon_cards/)
    }
  })

  it("rejects an empty-string tag", () => {
    expect(parsePptxIR(withComponents([tagRowComponent({ items: ["", "ok"] })])).success).toBe(false)
  })

  it("rejects an unknown top-level field (strict)", () => {
    const d = withComponents([{ ...tagRowComponent(), extra: 1 }])
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an unknown emphasis value", () => {
    expect(parsePptxIR(withComponents([tagRowComponent({ emphasis: "last" })])).success).toBe(false)
  })

  // ── 裁定 1: items are plain strings, not objects — no per-tag icon/color/
  // link struct. ──
  it("rejects an object item (a tag is a plain string, not a struct)", () => {
    expect(parsePptxIR(withComponents([tagRowComponent({ items: [{ label: "React" }, "Vite"] })])).success).toBe(false)
  })
})

describe("meta.animation (deck-level switch, wave-C S1)", () => {
  it("is omittable — meta.animation stays undefined, no default is baked in by the schema", () => {
    const r = parsePptxIR(minimal())
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.meta.animation).toBeUndefined()
  })
  it("accepts all four transition values and both elements values", () => {
    for (const transition of ["fade", "push", "wipe", "none"] as const) {
      const d: any = minimal(); d.meta.animation = { transition }
      expect(parsePptxIR(d).success).toBe(true)
    }
    for (const elements of ["none", "auto"] as const) {
      const d: any = minimal(); d.meta.animation = { elements }
      expect(parsePptxIR(d).success).toBe(true)
    }
  })
  it("rejects an unknown transition value", () => {
    const d: any = minimal(); d.meta.animation = { transition: "spin" }
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects an unknown field on animation (strict)", () => {
    const d: any = minimal(); d.meta.animation = { transition: "fade", speed: "fast" }
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("icon_cards component", () => {
  const iconCardsComponent = (n: number) => ({
    type: "icon_cards",
    items: Array.from({ length: n }, (_, i) => ({
      icon: "rocket",
      title: `断言 ${i}`,
      text: `说明 ${i}`,
    })),
  })

  it("accepts 2-4 items", () => {
    for (const n of [2, 3, 4]) {
      const d: any = minimal()
      d.slides = [{ type: "content", components: [iconCardsComponent(n)] }]
      expect(parsePptxIR(d).success).toBe(true)
    }
  })

  it("rejects fewer than 2 items", () => {
    const d: any = minimal()
    d.slides = [{ type: "content", components: [iconCardsComponent(1)] }]
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("accepts 6 items (2026-07-11 六宫格扩容), rejects more than 6", () => {
    const d: any = minimal()
    d.slides = [{ type: "content", components: [iconCardsComponent(6)] }]
    expect(parsePptxIR(d).success).toBe(true)
    d.slides = [{ type: "content", components: [iconCardsComponent(7)] }]
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an icon outside the catalogued enum", () => {
    const d: any = minimal()
    const component = iconCardsComponent(2)
    component.items[0].icon = "not-a-real-icon"
    d.slides = [{ type: "content", components: [component] }]
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("steps component", () => {
  const stepsComponent = (n: number) => ({
    type: "steps",
    items: Array.from({ length: n }, (_, i) => ({
      title: `步骤 ${i}`,
      text: `说明 ${i}`,
    })),
  })

  it("accepts 2-5 items", () => {
    for (const n of [2, 3, 4, 5]) {
      const d: any = minimal()
      d.slides = [{ type: "content", components: [stepsComponent(n)] }]
      expect(parsePptxIR(d).success).toBe(true)
    }
  })

  it("rejects fewer than 2 items", () => {
    const d: any = minimal()
    d.slides = [{ type: "content", components: [stepsComponent(1)] }]
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects more than 5 items", () => {
    const d: any = minimal()
    d.slides = [{ type: "content", components: [stepsComponent(6)] }]
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an unknown field on an item (strict)", () => {
    const d: any = minimal()
    const component = stepsComponent(2)
    ;(component.items[0] as any).icon = "rocket"
    d.slides = [{ type: "content", components: [component] }]
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("verdict_banner component", () => {
  const verdictBannerComponent = (
    tone: string,
    extra: Record<string, unknown> = {}
  ) => ({
    type: "verdict_banner",
    text: "结论文本",
    tone,
    ...extra,
  })

  it("accepts all three tone values", () => {
    for (const tone of ["positive", "warning", "neutral"]) {
      const d: any = minimal()
      d.slides = [{ type: "content", components: [verdictBannerComponent(tone)] }]
      expect(parsePptxIR(d).success).toBe(true)
    }
  })

  it("accepts an optional icon", () => {
    const d: any = minimal()
    d.slides = [
      {
        type: "content",
        components: [verdictBannerComponent("positive", { icon: "rocket" })],
      },
    ]
    expect(parsePptxIR(d).success).toBe(true)
  })

  it("rejects a tone outside the enum", () => {
    const d: any = minimal()
    d.slides = [{ type: "content", components: [verdictBannerComponent("danger")] }]
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an icon outside the catalogued enum", () => {
    const d: any = minimal()
    d.slides = [
      {
        type: "content",
        components: [verdictBannerComponent("positive", { icon: "not-a-real-icon" })],
      },
    ]
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an unknown field on the component (strict)", () => {
    const d: any = minimal()
    d.slides = [
      {
        type: "content",
        components: [verdictBannerComponent("positive", { variant: "loud" })],
      },
    ]
    expect(parsePptxIR(d).success).toBe(false)
  })
})

// Schema layer only distinguishes string vs. object vs. neither for the
// axes-object branch (W3 task-2 review fix) — key/value semantics (only
// strategy/pacing/audience, each a closed enum) are solely resolveNarrative's
// job, exercised through validateIr in api.test.ts's "narrative field"
// describe block, not here. Nesting a schema-closed enum object inside a
// z.union used to collapse every rejection into one opaque zod
// `invalid_union` issue regardless of what was actually wrong — see
// NarrativeProfileInputSchema's docstring in ir/index.ts for the full story.
//
// Field renamed `scenario` → `narrative` (vocabulary-v4 rename, task 1, spec
// §8.1/§9.1). `parsePptxIR` is a raw schema parse — there is no alias
// rescue anywhere in the v4 pipeline for this field (spec §16: the
// now-superseded §15.4 rescue was removed), so setting the pre-rename
// `scenario` key here is a strict-schema rejection, not a
// semantically-open-but-later-rejected value — see the last two `it`s below.
describe("IR v4 narrative field (W3 task 2)", () => {
  it("accepts a preset id string", () => {
    const d: any = minimal()
    d.narrative = "boardroom-report"
    const r = parsePptxIR(d)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.narrative).toBe("boardroom-report")
  })

  it("accepts a partial axes object", () => {
    const d: any = minimal()
    d.narrative = { strategy: "pyramid", audience: "executive" }
    const r = parsePptxIR(d)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.narrative).toEqual({ strategy: "pyramid", audience: "executive" })
  })

  it("accepts omission — narrative stays undefined, no default is baked in by the schema", () => {
    const r = parsePptxIR(minimal())
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.narrative).toBeUndefined()
  })

  it("schema-accepts an unknown key on the axes object — resolveNarrative rejects it (api.test.ts)", () => {
    const d: any = minimal()
    d.narrative = { strategy: "pyramid", speed: "fast" }
    const r = parsePptxIR(d)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.narrative).toEqual({ strategy: "pyramid", speed: "fast" })
  })

  it("schema-accepts a wrong-type axis value — resolveNarrative rejects it (api.test.ts)", () => {
    const d: any = minimal()
    d.narrative = { strategy: 123 }
    const r = parsePptxIR(d)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.narrative).toEqual({ strategy: 123 })
  })

  it("schema-accepts an axis-value typo — resolveNarrative rejects it (api.test.ts)", () => {
    const d: any = minimal()
    d.narrative = { strategy: "pyramidal" }
    const r = parsePptxIR(d)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.narrative).toEqual({ strategy: "pyramidal" })
  })

  it("rejects a narrative value that is neither a preset string nor an axes object (number)", () => {
    const d: any = minimal()
    d.narrative = 42
    // Union type error (fails both branches structurally) — generic zod
    // message is acceptable here, unlike the object-branch cases above:
    // there is no per-axis semantic to report, "not a string and not an
    // object" is the whole story.
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects a narrative value that is neither a preset string nor an axes object (array)", () => {
    const d: any = minimal()
    d.narrative = ["boardroom-report"]
    // Arrays are not plain objects (z.record's isPlainObject check) and not
    // strings, so this fails the union the same structural way as a number.
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects the pre-rename `scenario` field name outright (strict schema, no alias rescue at this layer)", () => {
    const d: any = minimal()
    d.scenario = "boardroom-report"
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("IR v4 seed field (W5 task 1)", () => {
  it("accepts an integer seed", () => {
    const d: any = minimal()
    d.seed = 12345
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("omits cleanly — stays undefined, no default baked in by the schema", () => {
    const r = parsePptxIR(minimal())
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.seed).toBeUndefined()
  })
  it("rejects a non-integer seed", () => {
    const d: any = minimal()
    d.seed = 1.5
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("IR v4 slide id field (W5 task 1)", () => {
  it("accepts a string id on a slide", () => {
    const d: any = minimal()
    d.slides = [{ type: "cover", id: "p-1", heading: "x" }]
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("omits cleanly — stays undefined", () => {
    const r = parsePptxIR(minimal())
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.slides[0]!.id).toBeUndefined()
  })
  it("schema alone does not reject duplicate ids across slides — uniqueness is validateIr's job (api.test.ts)", () => {
    const d: any = minimal()
    d.slides = [
      { type: "cover", id: "dup", heading: "a" },
      { type: "content", id: "dup", heading: "b", components: [] },
    ]
    expect(parsePptxIR(d).success).toBe(true)
  })
})

describe("IR v4 slide placeholder field (W5 task 1)", () => {
  it("accepts placeholder: true", () => {
    const d: any = minimal()
    d.slides = [{ type: "content", placeholder: true }]
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("omits cleanly — stays undefined", () => {
    const r = parsePptxIR(minimal())
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.slides[0]!.placeholder).toBeUndefined()
  })
  it("rejects placeholder: false (z.literal(true) accepts only true)", () => {
    const d: any = minimal()
    d.slides = [{ type: "content", placeholder: false }]
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("IR v4 slide notes field (notes+preview wave, task 1)", () => {
  it("accepts a string notes on a slide", () => {
    const d: any = minimal()
    d.slides = [{ type: "cover", heading: "x", notes: "remember to slow down here" }]
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("omits cleanly — stays undefined, no default baked in by the schema", () => {
    const r = parsePptxIR(minimal())
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.slides[0]!.notes).toBeUndefined()
  })
  it("rejects a non-string notes", () => {
    const d: any = minimal()
    d.slides = [{ type: "cover", heading: "x", notes: 42 }]
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("theme.style override", () => {
  it("accepts a palette/fonts/shape override", () => {
    const d: any = minimal()
    d.theme = {
      id: "consulting",
      style: {
        colors: { primary: "#0B5FFF", chartPalette: ["#111111", "#222222"] },
        fonts: { heading: ["Inter"] },
        shape: { radius: 10, gapScale: 1.1, typeScale: 1.5 },
      },
    }
    expect(parsePptxIR(d).success).toBe(true)
  })
  it("rejects a non-hex color", () => {
    const d: any = minimal()
    d.theme = { id: "consulting", style: { colors: { primary: "blue" } } }
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects unknown keys (strict)", () => {
    const d: any = minimal()
    d.theme = { id: "consulting", style: { colours: {} } }
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects gapScale outside the documented range", () => {
    const d: any = minimal()
    d.theme = { id: "consulting", style: { shape: { gapScale: 2 } } }
    expect(parsePptxIR(d).success).toBe(false)
  })
  it("rejects typeScale outside the documented range", () => {
    const d: any = minimal()
    d.theme = { id: "consulting", style: { shape: { typeScale: 3 } } }
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("deck chrome posture", () => {
  it("is omittable: chrome stays undefined, no default is baked in by the schema", () => {
    const r = parsePptxIR(minimal())
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.chrome).toBeUndefined()
  })

  it.each(["full", "cover-only", "minimal"] as const)("accepts chrome %s", (chrome) => {
    const d: any = minimal()
    d.chrome = chrome
    const r = parsePptxIR(d)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.chrome).toBe(chrome)
  })

  it("rejects an unknown chrome value (typo, not omission)", () => {
    const d: any = minimal()
    d.chrome = "none"
    const r = parsePptxIR(d)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/chrome/)
  })
})
