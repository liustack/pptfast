
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
        shape: { radius: 10, gapScale: 1.1 },
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
})
