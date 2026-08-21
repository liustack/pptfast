// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { BUILTIN_THEME_IDS, type PptxIR, type Slide } from "@/ir"
import { renderSlideSvg, validateIr } from "../../api"
import { checkIrQuality } from "../ir-quality"
import { parseSvgRoot } from "../serialize"
import { THEME_DEFINITIONS, themeOffersSparse } from "../../themes/definitions"
import { resolveEffectiveLayoutId } from "../layout-selection"
import { LAYOUT_REGISTRY } from "./registry"
import { FOOTER_DIVIDER_Y } from "../chrome-geometry"

const LOGO_SRC =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

function chromeDeck(theme: string, slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "minimal-chrome.pptx",
    theme: { id: theme },
    chrome: "full",
    meta: { organization: "ACME", date: "2026", version: "v1" },
    brand: { logo_asset_id: "logo", position: "br" },
    assets: { images: { logo: { src: LOGO_SRC, alt: "logo" } } },
    seed: 1,
    slides,
  } as PptxIR
}

function assertNoBrandChrome(markup: string) {
  const root = parseSvgRoot(markup)
  expect(root.querySelector(`line[y1="${FOOTER_DIVIDER_Y}"]`)).toBeNull()
  expect(markup).not.toContain("ACME")
  expect(root.querySelector("image")).toBeNull()
}

describe("layout-declared chrome:none (editorial-verse wave)", () => {
  it("statement skips footer rule, footer meta, and logo on consulting", () => {
    const slide: Slide = {
      type: "content",
      layout: "statement",
      heading: "记得的事会变成下个世纪的天气",
      components: [],
    } as Slide
    const markup = renderSlideSvg(chromeDeck("consulting", [slide]), 0)
    expect(markup).toContain("下个世纪")
    assertNoBrandChrome(markup)
  })

  it("statement on lecture still paints the theme motif while skipping the footer", () => {
    const slide: Slide = {
      type: "content",
      layout: "statement",
      heading: "记得的事会变成下个世纪的天气",
      components: [],
    } as Slide
    const markup = renderSlideSvg(chromeDeck("lecture", [slide]), 0)
    const root = parseSvgRoot(markup)
    expect(root.querySelector(`line[y1="${FOOTER_DIVIDER_Y}"]`)).toBeNull()
    expect(markup).not.toContain("ACME")
    expect(root.querySelector("image")).toBeNull()
    expect(root.querySelector("g[data-decor]")).not.toBeNull()
  })

  it("pull-quote skips chrome on consulting (light) the same way", () => {
    const slide: Slide = {
      type: "content",
      layout: "pull-quote",
      heading: "A parrot never forgets a face.",
      components: [{ type: "paragraph", text: "Alex could count to six." }],
    } as Slide
    const markup = renderSlideSvg(chromeDeck("consulting", [slide]), 0)
    expect(markup).toContain("parrot")
    assertNoBrandChrome(markup)
  })

  it("verse-chapter skips logo (chapter already has no footer)", () => {
    const slide: Slide = {
      type: "chapter",
      layout: "verse-chapter",
      heading: "羽毛下的智识",
      components: [],
    } as Slide
    const markup = renderSlideSvg(chromeDeck("consulting", [slide]), 0)
    expect(markup).toContain("羽毛下的智识")
    assertNoBrandChrome(markup)
  })

  it("stat-hero skips chrome on insight (dark)", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "3.2 亿",
      components: [],
    } as Slide
    const markup = renderSlideSvg(chromeDeck("insight", [slide]), 0)
    expect(markup).toContain("3.2")
    assertNoBrandChrome(markup)
  })

  it("one-evidence skips chrome on consulting (light)", () => {
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: "迁徙路线在十年里缩短了四成",
      components: [
        {
          type: "chart",
          chart_type: "bar",
          series: [{ name: "S", data: [{ x: "A", y: 10 }, { x: "B", y: 20 }] }],
        },
      ],
    } as Slide
    const markup = renderSlideSvg(chromeDeck("consulting", [slide]), 0)
    expect(markup).toContain("迁徙路线")
    assertNoBrandChrome(markup)
  })

  it("mono-bleed skips chrome and paints its own primary field", () => {
    const slide: Slide = {
      type: "content",
      layout: "mono-bleed",
      heading: "把灯关掉",
      components: [],
    } as Slide
    const markup = renderSlideSvg(chromeDeck("consulting", [slide]), 0)
    expect(markup).toContain("把灯关掉")
    assertNoBrandChrome(markup)
  })

  it("quote-stage still draws footer meta and motif (negative control)", () => {
    const slide: Slide = {
      type: "content",
      layout: "quote-stage",
      heading: "简洁是最终的复杂",
      components: [],
    } as Slide
    const markup = renderSlideSvg(chromeDeck("luxe", [slide]), 0)
    const root = parseSvgRoot(markup)
    expect(root.querySelector(`line[y1="${FOOTER_DIVIDER_Y}"]`)).not.toBeNull()
    expect(markup).toContain("ACME")
    expect(root.querySelector("g[data-decor]")).not.toBeNull()
    expect(root.querySelector("image")).not.toBeNull()
  })
})

describe("pinOnly auto-pool: editorial-verse ids never enter selection", () => {
  const AUTO_CONTENT = [
    "narrow-column",
    "two-column",
    "rail-numbered",
    "banner-heading",
    "stacked-poster",
    "bento-panel",
    "tone-adaptive-content",
    "side-highlight",
    "asymmetric-triptych",
    "quiet-frame",
    "image-lead-split",
    "split-band",
  ]

  it("consulting's auto content pool is the 12-id set, and no built-in theme lists a pinOnly editorial-verse id", () => {
    expect([...THEME_DEFINITIONS.consulting.layouts.content]).toEqual(AUTO_CONTENT)
    for (const id of BUILTIN_THEME_IDS) {
      expect(THEME_DEFINITIONS[id].layouts.content, id).not.toContain("statement")
      expect(THEME_DEFINITIONS[id].layouts.content, id).not.toContain("pull-quote")
      expect(THEME_DEFINITIONS[id].layouts.content, id).not.toContain("quote-stage")
      expect(THEME_DEFINITIONS[id].layouts.content, id).not.toContain("stat-hero")
      expect(THEME_DEFINITIONS[id].layouts.content, id).not.toContain("one-evidence")
      expect(THEME_DEFINITIONS[id].layouts.content, id).not.toContain("mono-bleed")
      expect(THEME_DEFINITIONS[id].layouts.chapter, id).not.toContain("verse-chapter")
    }
  })

  it("consulting seed=1 auto-pick sequence never lands on a pinOnly layout", () => {
    const slides: Slide[] = [
      { type: "cover", heading: "Q3 Strategy Review", components: [] },
      { type: "chapter", heading: "Chapter One: Market Landscape", components: [] },
      { type: "content", heading: "Key Findings", components: [{ type: "paragraph", text: "x" }] },
      {
        type: "content",
        heading: "Supporting Data",
        arrangement: "two_column",
        components: [
          { type: "bullets", items: ["a", "b"] },
          { type: "bullets", items: ["c", "d"] },
        ],
      },
      { type: "chapter", heading: "Chapter Two: Recommendations", components: [] },
      { type: "content", heading: "Next Steps", components: [{ type: "bullets", items: ["1", "2", "3"] }] },
      { type: "ending", heading: "Thank You", components: [] },
    ] as Slide[]
    const doc = {
      version: "4",
      filename: "theme-structure-fixture.pptx",
      theme: { id: "consulting" },
      meta: {},
      assets: { images: {} },
      seed: 1,
      slides,
    } as PptxIR
    const ids = slides.map((slide, i) => resolveEffectiveLayoutId(doc, slide, i))
    expect(ids).toEqual([
      "verdict-index",
      "constellation-chapter",
      "narrow-column",
      "split-band",
      "poster-chapter",
      "two-column",
      "tone-adaptive-ending",
    ])
    for (const id of ids) {
      expect(id).toBeTruthy()
      if (!id) continue
      expect(LAYOUT_REGISTRY[id]?.pinOnly, id).toBeFalsy()
    }
  })

  it("never auto-selects statement / pull-quote / verse-chapter / speech layouts across a seed spread", () => {
    const slide: Slide = { type: "content", heading: "x", components: [{ type: "paragraph", text: "y" }] } as Slide
    for (let seed = 0; seed < 40; seed++) {
      const doc = { ...chromeDeck("consulting", [slide]), seed } as PptxIR
      const picked = resolveEffectiveLayoutId(doc, slide, 0)
      expect(picked).not.toBe("statement")
      expect(picked).not.toBe("pull-quote")
      expect(picked).not.toBe("verse-chapter")
      expect(picked).not.toBe("stat-hero")
      expect(picked).not.toBe("one-evidence")
      expect(picked).not.toBe("mono-bleed")
    }
  })
})

describe("sparse pages are not density-blocked", () => {
  it("statement with 0 components (two-line heading) has no density warning", () => {
    const doc = chromeDeck("consulting", [
      {
        type: "content",
        layout: "statement",
        heading: "记得的事\n会变成天气",
        components: [],
      } as Slide,
    ])
    expect(checkIrQuality(doc).filter((i) => i.code === "density")).toEqual([])
  })

  it("pull-quote with 1 paragraph has no density warning", () => {
    const doc = chromeDeck("consulting", [
      {
        type: "content",
        layout: "pull-quote",
        heading: "一句引言",
        components: [{ type: "paragraph", text: "一段散文。" }],
      } as Slide,
    ])
    expect(checkIrQuality(doc).filter((i) => i.code === "density")).toEqual([])
  })

  it("stat-hero with 0 components has no density warning", () => {
    const doc = chromeDeck("consulting", [
      { type: "content", layout: "stat-hero", heading: "95.7%", components: [] } as Slide,
    ])
    expect(checkIrQuality(doc).filter((i) => i.code === "density")).toEqual([])
  })

  it("mono-bleed with 0 components has no density warning", () => {
    const doc = chromeDeck("consulting", [
      { type: "content", layout: "mono-bleed", heading: "把灯关掉", components: [] } as Slide,
    ])
    expect(checkIrQuality(doc).filter((i) => i.code === "density")).toEqual([])
  })
})

describe("schema / validate accept the three new layout ids", () => {
  it("validateIr accepts an explicit pin of each new id", () => {
    const cover: Slide = { type: "cover", heading: "封面", components: [] } as Slide
    const statement: Slide = {
      type: "content",
      layout: "statement",
      heading: "金句",
      components: [],
    } as Slide
    const pull: Slide = {
      type: "content",
      layout: "pull-quote",
      heading: "引言",
      components: [{ type: "quote", text: "q", attribution: "a" }],
    } as Slide
    const verse: Slide = {
      type: "chapter",
      layout: "verse-chapter",
      heading: "章首",
      components: [],
    } as Slide
    const stat: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "95.7%",
      components: [],
    } as Slide
    const evidence: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: "迁徙路线在十年里缩短了四成",
      components: [
        {
          type: "chart",
          chart_type: "bar",
          series: [{ name: "S", data: [{ x: "A", y: 10 }, { x: "B", y: 20 }] }],
        },
      ],
    } as Slide
    const bleed: Slide = {
      type: "content",
      layout: "mono-bleed",
      heading: "把灯关掉",
      components: [],
    } as Slide
    const v = validateIr(chromeDeck("consulting", [cover, statement, pull, verse, stat, evidence, bleed]))
    expect(v.ok, JSON.stringify(v.errors)).toBe(true)
  })

  it("verse-chapter still cannot carry a footnote (existing chapter boundary)", () => {
    const v = validateIr(
      chromeDeck("consulting", [
        {
          type: "chapter",
          layout: "verse-chapter",
          heading: "章首",
          footnote: "不该出现",
          components: [],
        } as Slide,
      ]),
    )
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.message.includes("footnote"))).toBe(true)
  })
})

describe("19-theme smoke: each new layout renders on every built-in theme", () => {
  const light = "consulting"
  const dark = "luxe"
  it.each([...BUILTIN_THEME_IDS])("%s renders statement, pull-quote, verse-chapter, and the three speech layouts without throwing", (themeId) => {
    const statement: Slide = {
      type: "content",
      layout: "statement",
      heading: "记得的事会变成下个世纪的天气",
      components: [],
    } as Slide
    const pull: Slide = {
      type: "content",
      layout: "pull-quote",
      heading: "鹦鹉从不忘记一张它决定去爱的脸",
      subheading: "佩珀伯格",
      components: [{ type: "paragraph", text: "亚历克斯能数到六。" }],
    } as Slide
    const verse: Slide = {
      type: "chapter",
      layout: "verse-chapter",
      heading: "羽毛下的智识",
      components: [],
    } as Slide
    const stat: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "3.2 亿",
      components: [],
    } as Slide
    const evidence: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: "迁徙路线在十年里缩短了四成",
      components: [
        {
          type: "chart",
          chart_type: "bar",
          series: [{ name: "S", data: [{ x: "A", y: 10 }, { x: "B", y: 20 }] }],
        },
      ],
    } as Slide
    const bleed: Slide = {
      type: "content",
      layout: "mono-bleed",
      heading: "把灯关掉",
      components: [],
    } as Slide
    const doc = chromeDeck(themeId, [statement, pull, verse, stat, evidence, bleed])
    const a = renderSlideSvg(doc, 0)
    const b = renderSlideSvg(doc, 1)
    const c = renderSlideSvg(doc, 2)
    const d = renderSlideSvg(doc, 3)
    const e = renderSlideSvg(doc, 4)
    const f = renderSlideSvg(doc, 5)
    const textOf = (markup: string) => parseSvgRoot(markup).textContent ?? ""
    expect(textOf(a)).toContain("下个世纪")
    expect(textOf(b)).toContain("鹦鹉")
    expect(textOf(c)).toContain("羽毛下的智识")
    expect(textOf(d)).toContain("3.2")
    expect(textOf(e)).toContain("迁徙路线")
    expect(textOf(f)).toContain("把灯关掉")
    // consulting still offers every sparse id (omitted list). luxe only
    // offers its boarded faces plus verse-chapter. Unoffered pins fall
    // back to a regular layout and keep ordinary chrome.
    if (themeId === light || themeId === dark) {
      const markups = [a, b, c, d, e, f]
      const layoutIds = ["statement", "pull-quote", "verse-chapter", "stat-hero", "one-evidence", "mono-bleed"]
      for (let i = 0; i < layoutIds.length; i++) {
        if (themeOffersSparse(themeId, layoutIds[i]!)) assertNoBrandChrome(markups[i]!)
      }
    }
  })
})
