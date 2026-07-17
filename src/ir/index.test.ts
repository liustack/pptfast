
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

  it("strict-rejects an unknown key on the axes object", () => {
    const d: any = minimal()
    d.scenario = { mode: "pyramid", speed: "fast" }
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects a wrong type for an axis value", () => {
    const d: any = minimal()
    d.scenario = { mode: 123 }
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects an axis value outside the enum (typo)", () => {
    const d: any = minimal()
    d.scenario = { mode: "pyramidal" }
    expect(parsePptxIR(d).success).toBe(false)
  })

  it("rejects a scenario value that is neither a preset string nor an axes object", () => {
    const d: any = minimal()
    d.scenario = 42
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
