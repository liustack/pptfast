// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { BrandChrome } from "./brand-chrome"
import type { PptxIR, Slide } from "@/ir"
import type { ComponentCtx } from "./components/types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#051C2C",
    accent: "#FFC72C",
    text: "#1A2421",
    muted: "#5D6B65",
    border: "#D5D5CB",
    chartPalette: ["#051C2C", "#FFC72C"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

function ir(themeId: PptxIR["theme"]["id"], slides: Slide[], chrome?: PptxIR["chrome"]): PptxIR {
  return {
    version: "4",
    filename: "deck.pptx",
    theme: { id: themeId },
    meta: { organization: "ACME", confidentiality: "internal", version: "v1", date: "2026" },
    assets: {
      images: { bg: { src: "data:image/png;base64,iVBOR", alt: "背景" } },
    },
    slides,
    ...(chrome !== undefined ? { chrome } : {}),
  }
}

const cardBgContentSlide: Slide = {
  type: "content",
  heading: "带背景卡片",
  components: [{ type: "paragraph", text: "卡内文字。" }],
  background: { kind: "asset", asset_id: "bg", fit: "cover" },
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

describe("BrandChrome footer suppression (W1: theme brand.suppressFooterOnCardContent via resolveBrand)", () => {
  it("enterprise 主题：content 页 + 卡片背景图 → 页脚整体消失（theme brand 驱动）", () => {
    const doc = ir("enterprise", [cardBgContentSlide], "full")
    const { container } = svg(<BrandChrome ir={doc} slide={cardBgContentSlide} ctx={ctx} />)
    expect(container.querySelector("line")).toBeNull()
    expect(container.textContent).not.toContain("ACME")
    expect(container.textContent).not.toContain("v1")
  })

  it.each(["consulting", "insight", "academic", "tech", "journal"] as const)(
    "%s 主题：同样的 content 页 + 卡片背景图 → 页脚正常显示（未设 brand.suppressFooterOnCardContent，不受影响）",
    (themeId) => {
      const doc = ir(themeId, [cardBgContentSlide], "full")
      const { container } = svg(<BrandChrome ir={doc} slide={cardBgContentSlide} ctx={ctx} />)
      expect(container.querySelector("line")).not.toBeNull()
      expect(container.textContent).toContain("ACME")
      expect(container.textContent).toContain("v1")
    },
  )
})

// ── theme-redesign wave (2026-08-18): the third, orthogonal footer switch ──
//
// `suppressFooterMeta` exists because ink v3's motif draws a right-edge
// colophon rail carrying the org and the year/month
// (`motifs/motif-ink-motif.tsx`) — leaving the footer row on prints both
// on the same page. Mutation guard 4 of the wave's four: dropping the
// `!brandConfig.suppressFooterMeta` gate in `brand-chrome.tsx` re-lands the
// duplicate and fails the first case below.

const plainContentSlide: Slide = {
  type: "content",
  heading: "普通内容页",
  components: [{ type: "paragraph", text: "正文。" }],
}

describe("BrandChrome footer meta suppression (brand.suppressFooterMeta, ink v3)", () => {
  it("ink 主题：content 页页脚不排 meta 文字（org/密级/版本/日期全部交给落款列）", () => {
    const doc = ir("ink", [plainContentSlide], "full")
    const { container } = svg(<BrandChrome ir={doc} slide={plainContentSlide} ctx={ctx} />)
    expect(container.textContent).not.toContain("ACME")
    expect(container.textContent).not.toContain("v1")
    expect(container.textContent).not.toContain("2026")
    expect(container.textContent).not.toContain("Internal")
    // 与 suppressFooterRule 正交，不是同一个开关的两种说法：分隔线也没画，
    // 但那是 ink 早就设的另一个 flag 的功劳。
    expect(container.querySelector("line")).toBeNull()
  })

  it.each(["consulting", "insight", "academic", "tech", "journal", "enterprise"] as const)(
    "%s 主题：同一页页脚 meta 照排（未设 suppressFooterMeta，逐字节不受影响）",
    (themeId) => {
      const doc = ir(themeId, [plainContentSlide], "full")
      const { container } = svg(<BrandChrome ir={doc} slide={plainContentSlide} ctx={ctx} />)
      expect(container.textContent).toContain("ACME")
      expect(container.textContent).toContain("v1")
      expect(container.querySelector("line")).not.toBeNull()
    },
  )

  it("IR 级 brand override 能把 ink 的抑制关掉（resolveBrand 的浅合并，override 胜出）", () => {
    const doc = ir("ink", [plainContentSlide], "full")
    const withOverride: PptxIR = {
      ...doc,
      theme: { id: "ink", brand: { suppressFooterMeta: false } },
    }
    const { container } = svg(<BrandChrome ir={withOverride} slide={plainContentSlide} ctx={ctx} />)
    expect(container.textContent).toContain("ACME")
  })
})

const LOGO_SRC =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] }
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] }
const endingSlide: Slide = { type: "ending", heading: "收束", components: [] }
const statementSlide: Slide = {
  type: "content",
  layout: "statement",
  heading: "一句就够",
  components: [],
}

function branded(slides: Slide[], chrome?: PptxIR["chrome"]): PptxIR {
  const base = ir("consulting", slides)
  return {
    ...base,
    brand: { logo_asset_id: "logo", position: "br" },
    assets: {
      images: {
        ...base.assets.images,
        logo: { src: LOGO_SRC, alt: "logo" },
      },
    },
    ...(chrome !== undefined ? { chrome } : {}),
  }
}

describe("deck chrome posture (BrandChrome gate)", () => {
  it("omitted chrome drops footer rule, meta, and logo on a content page", () => {
    const doc = branded([plainContentSlide])
    const { container } = svg(<BrandChrome ir={doc} slide={plainContentSlide} ctx={ctx} />)
    expect(container.querySelector("line")).toBeNull()
    expect(container.textContent).not.toContain("ACME")
    expect(container.querySelector("image")).toBeNull()
  })

  it("explicit chrome cover-only matches the omitted path on a content page", () => {
    const omitted = branded([plainContentSlide])
    const coverOnly = branded([plainContentSlide], "cover-only")
    const a = svg(<BrandChrome ir={omitted} slide={plainContentSlide} ctx={ctx} />).container.innerHTML
    const b = svg(<BrandChrome ir={coverOnly} slide={plainContentSlide} ctx={ctx} />).container.innerHTML
    expect(a).toBe(b)
  })

  it("explicit chrome full still draws the content footer rule, meta, and logo", () => {
    const doc = branded([plainContentSlide], "full")
    const { container } = svg(<BrandChrome ir={doc} slide={plainContentSlide} ctx={ctx} />)
    expect(container.querySelector("line")).not.toBeNull()
    expect(container.textContent).toContain("ACME")
    expect(container.querySelector("image")).not.toBeNull()
  })

  it("omitted chrome keeps the logo on cover and chapter pages", () => {
    const doc = branded([coverSlide, chapterSlide])
    for (const slide of [coverSlide, chapterSlide]) {
      const { container } = svg(<BrandChrome ir={doc} slide={slide} ctx={ctx} />)
      expect(container.querySelector("image"), slide.type).not.toBeNull()
      expect(container.querySelector("line"), slide.type).toBeNull()
    }
  })

  it("omitted chrome drops the logo on an ending page", () => {
    const doc = branded([endingSlide])
    const { container } = svg(<BrandChrome ir={doc} slide={endingSlide} ctx={ctx} />)
    expect(container.querySelector("image")).toBeNull()
    expect(container.querySelector("line")).toBeNull()
    expect(container.textContent).not.toContain("ACME")
  })

  it("cover-only drops footer rule, meta, and logo on a content page", () => {
    const doc = branded([plainContentSlide], "cover-only")
    const { container } = svg(<BrandChrome ir={doc} slide={plainContentSlide} ctx={ctx} />)
    expect(container.querySelector("line")).toBeNull()
    expect(container.textContent).not.toContain("ACME")
    expect(container.querySelector("image")).toBeNull()
  })

  it("cover-only keeps the logo on cover and chapter pages", () => {
    const doc = branded([coverSlide, chapterSlide], "cover-only")
    for (const slide of [coverSlide, chapterSlide]) {
      const { container } = svg(<BrandChrome ir={doc} slide={slide} ctx={ctx} />)
      expect(container.querySelector("image"), slide.type).not.toBeNull()
      expect(container.querySelector("line"), slide.type).toBeNull()
    }
  })

  it("cover-only drops the logo on an ending page", () => {
    const doc = branded([endingSlide], "cover-only")
    const { container } = svg(<BrandChrome ir={doc} slide={endingSlide} ctx={ctx} />)
    expect(container.querySelector("image")).toBeNull()
    expect(container.querySelector("line")).toBeNull()
    expect(container.textContent).not.toContain("ACME")
  })

  it("layout chrome:none still wins under chrome full", () => {
    const doc = branded([statementSlide], "full")
    const { container } = svg(<BrandChrome ir={doc} slide={statementSlide} ctx={ctx} />)
    expect(container.querySelector("line")).toBeNull()
    expect(container.querySelector("image")).toBeNull()
    expect(container.textContent).not.toContain("ACME")
  })

  it("cover-only stacked on layout chrome:none stays empty (no conflict)", () => {
    const doc = branded([statementSlide], "cover-only")
    const { container } = svg(<BrandChrome ir={doc} slide={statementSlide} ctx={ctx} />)
    expect(container.querySelector("line")).toBeNull()
    expect(container.querySelector("image")).toBeNull()
    expect(container.textContent).not.toContain("ACME")
  })

  it("minimal drops the content footer rule and meta but keeps the logo", () => {
    const doc = branded([plainContentSlide], "minimal")
    const { container } = svg(<BrandChrome ir={doc} slide={plainContentSlide} ctx={ctx} />)
    expect(container.querySelector("line")).toBeNull()
    expect(container.textContent).not.toContain("ACME")
    expect(container.querySelector("image")).not.toBeNull()
  })
})
