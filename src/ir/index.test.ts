
import { describe, it, expect } from "vitest"
import { parsePptxIR, BUILTIN_THEME_IDS } from "./index"

const minimal = () => ({
  version: "3", filename: "d.pptx",
  theme: { id: "consulting" }, meta: { organization: "ACME" },
  assets: { images: {} },
  slides: [{ type: "cover", heading: "标题" }],
})

describe("IR v3 theme field", () => {
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

describe("IR v3 omission defaults (weak-model friendly)", () => {
  it("a bare slides-only deck parses with all defaults", () => {
    const r = parsePptxIR({ slides: [{ heading: "只有一页", components: [] }] })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.version).toBe("3")
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
    d.version = "4"
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("pptx-ir v3", () => {
  it("parses minimal v3", () => {
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
// mode/delivery/audience, each a closed enum) are solely resolveScenario's
// job, exercised through validateIr in api.test.ts's "scenario field"
// describe block, not here. Nesting a schema-closed enum object inside a
// z.union used to collapse every rejection into one opaque zod
// `invalid_union` issue regardless of what was actually wrong — see
// ScenarioAxesInputSchema's docstring in ir/index.ts for the full story.
describe("IR v3 scenario field (W3 task 2)", () => {
  it("accepts a preset id string", () => {
    const d: any = minimal()
    d.scenario = "boardroom-report"
    const r = parsePptxIR(d)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.scenario).toBe("boardroom-report")
  })

  it("accepts a partial axes object", () => {
    const d: any = minimal()
    d.scenario = { mode: "pyramid", audience: "executive" }
    const r = parsePptxIR(d)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.scenario).toEqual({ mode: "pyramid", audience: "executive" })
  })

  it("accepts omission — scenario stays undefined, no default is baked in by the schema", () => {
    const r = parsePptxIR(minimal())
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.scenario).toBeUndefined()
  })

  it("schema-accepts an unknown key on the axes object — resolveScenario rejects it (api.test.ts)", () => {
    const d: any = minimal()
    d.scenario = { mode: "pyramid", speed: "fast" }
    const r = parsePptxIR(d)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.scenario).toEqual({ mode: "pyramid", speed: "fast" })
  })

  it("schema-accepts a wrong-type axis value — resolveScenario rejects it (api.test.ts)", () => {
    const d: any = minimal()
    d.scenario = { mode: 123 }
    const r = parsePptxIR(d)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.scenario).toEqual({ mode: 123 })
  })

  it("schema-accepts an axis-value typo — resolveScenario rejects it (api.test.ts)", () => {
    const d: any = minimal()
    d.scenario = { mode: "pyramidal" }
    const r = parsePptxIR(d)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.scenario).toEqual({ mode: "pyramidal" })
  })

  it("rejects a scenario value that is neither a preset string nor an axes object (number)", () => {
    const d: any = minimal()
    d.scenario = 42
    // Union type error (fails both branches structurally) — generic zod
    // message is acceptable here, unlike the object-branch cases above:
    // there is no per-axis semantic to report, "not a string and not an
    // object" is the whole story.
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects a scenario value that is neither a preset string nor an axes object (array)", () => {
    const d: any = minimal()
    d.scenario = ["boardroom-report"]
    // Arrays are not plain objects (z.record's isPlainObject check) and not
    // strings, so this fails the union the same structural way as a number.
    expect(parsePptxIR(d).success).toBe(false)
  })
})

describe("IR v3 seed field (W5 task 1)", () => {
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

describe("IR v3 slide id field (W5 task 1)", () => {
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

describe("IR v3 slide placeholder field (W5 task 1)", () => {
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

describe("IR v3 slide notes field (notes+preview wave, task 1)", () => {
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
