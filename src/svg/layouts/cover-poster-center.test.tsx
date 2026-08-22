// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { PosterCenterCover } from "./cover-poster-center"
import type { PptxIR, Slide } from "@/ir"
import type { StyleTokens } from "../../themes/tokens"
import { accessibleInk } from "../ink"

function tokensWithoutCover(themeId: string): StyleTokens {
  const tokens = resolveStyle(themeId)
  if (!tokens.shape?.cover) return tokens
  const { cover: _omit, ...shape } = tokens.shape
  return { ...tokens, shape }
}

const slide: Slide = { type: "cover", heading: "创意提案", subheading: "一次品牌焕新实验", components: [] } as Slide
const ir = (theme: string): PptxIR =>
  ({ version: "3", filename: "x.pptx", theme: { id: theme }, meta: { organization: "品牌组" }, assets: { images: {} }, slides: [slide] }) as unknown as PptxIR

// Branding's brand logo bands (branding.tsx logoBox: image at
// width=96 height=40, positioned tl/tr/bl/br). Ported from
// templates/creative.test.tsx — the poster grammar's entire premise is
// centering everything on x=640 so its x-extent stays within [190,1090],
// clear of both corner columns regardless of y.
const TL_LOGO = { x: 64, y: 48, w: 96, h: 40 }
const TR_LOGO = { x: 1120, y: 48, w: 96, h: 40 }
const BL_LOGO = { x: 64, y: 630, w: 96, h: 40 }
const BR_LOGO = { x: 1120, y: 630, w: 96, h: 40 }
const LOGO_BANDS = [TL_LOGO, TR_LOGO, BL_LOGO, BR_LOGO]

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function render(body: React.ReactElement): { markup: string; root: Element } {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

describe("PosterCenterCover", () => {
  it("creative tokens 下标题居中、短横条走 primary（RED≡primary）且无旧 baked hex 残留（观感等价档）", () => {
    const ctx = buildCtx(tokensWithoutCover("insight"), {})
    const out = renderSvgMarkup(<PosterCenterCover ir={ir("insight")} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain("创意提案")
    expect(out).toContain('text-anchor="middle"')
    expect(out).toContain("#16202B") // RED 经 ctx.colors.primary 而来，与 insight primary 逐字节相同
    expect(out).not.toContain("#F0A63C") // insight accent（终端琥珀）不应出现——RED 不映射到 accent
    expect(out).not.toContain("#666670") // META_MUTED 并入 muted 后不得残留
  })
  it("consulting tokens 下用 consulting 的 primary 色（token 化成立）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const out = renderSvgMarkup(<PosterCenterCover ir={ir("consulting")} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain("#1E2A4A") // consulting primary
    expect(out).not.toContain("#16202B") // insight primary 不得残留
  })

  it("accent 短横条精确坐标(width=60/height=4)走 primary、副标题居中、底部合并 meta 行含组织/密级/日期", () => {
    const ctx = buildCtx(tokensWithoutCover("insight"), {})
    const fullSlide: Slide = {
      type: "cover",
      heading: "年度财务报告",
      subheading: "信息安全与增长",
      components: [],
    } as Slide
    const fullIr: PptxIR = {
      version: "3",
      filename: "deck.pptx",
      theme: { id: "insight" },
      branding: "full",
      meta: { organization: "DarkCo", confidentiality: "internal", version: "v2", date: "2026" },
      assets: { images: {} },
      slides: [fullSlide],
    } as unknown as PptxIR
    const { markup, root } = render(<PosterCenterCover ir={fullIr} slide={fullSlide} index={0} ctx={ctx} />)

    const title = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("年度财务报告"),
    )!
    expect(title.getAttribute("text-anchor")).toBe("middle")
    expect(title.getAttribute("x")).toBe("640")
    expect(title.getAttribute("font-weight")).toBe("800")

    const accentBar = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("width") === "60" && r.getAttribute("height") === "4",
    )!
    expect(accentBar).toBeTruthy()
    expect(accentBar.getAttribute("fill")).toBe(ctx.colors.primary)

    const subtitle = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("信息安全与增长"),
    )!
    expect(subtitle.getAttribute("text-anchor")).toBe("middle")

    // Combined meta line carries org/confidentiality/date as a single
    // centered row (CONF_LABEL.internal -> "Internal").
    expect(markup).toContain("DarkCo")
    expect(markup).toContain("Internal")
  })

  it("Cover 元素避开四角 Branding logo 条带", () => {
    const ctx = buildCtx(tokensWithoutCover("insight"), {})
    const { root } = render(<PosterCenterCover ir={ir("insight")} slide={slide} index={0} ctx={ctx} />)
    const accentBar = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("width") === "60" && r.getAttribute("height") === "4",
    )!
    const box = {
      x: Number(accentBar.getAttribute("x")),
      y: Number(accentBar.getAttribute("y")),
      w: Number(accentBar.getAttribute("width")),
      h: Number(accentBar.getAttribute("height")),
    }
    for (const band of LOGO_BANDS) {
      expect(rectsOverlap(box, band)).toBe(false)
    }
  })

  it("Cover 页通过 subset 校验", () => {
    const ctx = buildCtx(tokensWithoutCover("insight"), {})
    const { root } = render(<PosterCenterCover ir={ir("insight")} slide={slide} index={0} ctx={ctx} />)
    expect(() => assertSubset(root)).not.toThrow()
  })
})

const FULL_META: PptxIR["meta"] = {
  organization: "云觅科技",
  authors: [{ name: "陈砚清", role: "首席技术官" }],
  date: "2026 年 7 月",
  confidentiality: "internal",
}

function fullIr(themeId: string): PptxIR {
  return {
    version: "4",
    filename: "deck.pptx",
    theme: { id: themeId },
    branding: "full",
    meta: FULL_META,
    assets: { images: {} },
    slides: [slide],
  } as unknown as PptxIR
}

function renderCover(
  themeId: string,
  cover?: NonNullable<StyleTokens["shape"]>["cover"],
  s: Slide = slide,
) {
  const tokens = resolveStyle(themeId)
  const shaped: StyleTokens = { ...tokens, shape: { ...tokens.shape, cover: { ...tokens.shape?.cover, ...cover } } }
  const ctx = buildCtx(shaped, {})
  const doc = fullIr(themeId)
  const { markup, root } = render(<PosterCenterCover ir={doc} slide={s} index={0} ctx={ctx} />)
  return { markup, root, tokens, ctx }
}

function bar(root: Element) {
  return Array.from(root.querySelectorAll("rect")).find(
    (r) => r.getAttribute("width") === "60" && r.getAttribute("height") === "4",
  )!
}

describe("PosterCenterCover — cover knobs (board-cover-restore wave 2)", () => {
  it("default: primary bar, no kicker, centered meta", () => {
    const { root, tokens } = renderCover("stage")
    expect(bar(root).getAttribute("fill")).toBe(tokens.colors.primary)
    const texts = Array.from(root.querySelectorAll("text"))
    const kickers = texts.filter((t) => t.textContent === "云觅科技" && t.getAttribute("y") !== texts.find((x) => (x.textContent ?? "").includes("云觅科技") && Number(x.getAttribute("y")) >= 600)?.getAttribute("y"))
    const meta = texts.find((t) => (t.textContent ?? "").includes("云觅科技") && Number(t.getAttribute("y")) >= 600)!
    expect(meta.getAttribute("text-anchor")).toBe("middle")
    expect(meta.getAttribute("x")).toBe("640")
    expect(kickers.every((k) => Number(k.getAttribute("y")) >= 600) || texts.filter((t) => t.textContent === "云觅科技").length === 1).toBe(true)
  })

  it("campaign knobs: kicker present, bar fill accent, meta start + left", () => {
    const knobs = { showKicker: true, barFill: "accent" as const, metaPlacement: "bottom-left" as const }
    const { root, tokens, ctx } = renderCover("campaign", knobs)
    expect(bar(root).getAttribute("fill")).toBe(tokens.colors.accent)
    const kicker = Array.from(root.querySelectorAll("text")).find(
      (t) => t.textContent === "云觅科技" && Number(t.getAttribute("y")) < 280,
    )!
    expect(kicker).toBeTruthy()
    expect(kicker.getAttribute("fill")).toBe(
      accessibleInk(tokens.colors.accent, ctx.defaultBg ?? tokens.colors.bg, Number(kicker.getAttribute("font-size"))),
    )
    const meta = Array.from(root.querySelectorAll("text")).find((t) => Number(t.getAttribute("y")) >= 680)!
    expect(meta.getAttribute("text-anchor")).toBe("start")
    expect(meta.getAttribute("x")).toBe("48")
    expect(Number(meta.getAttribute("y"))).toBeGreaterThanOrEqual(664)
    expect(rectsOverlap(
      { x: 48, y: Number(meta.getAttribute("y")) - 20, w: 200, h: 24 },
      BL_LOGO,
    )).toBe(false)
  })

  it("insight knobs: no bottom meta at y650, org appears once at top", () => {
    const { root } = renderCover("insight", { metaPlacement: "top" })
    const orgRuns = Array.from(root.querySelectorAll("text")).filter((t) => (t.textContent ?? "").includes("云觅科技"))
    expect(orgRuns).toHaveLength(1)
    expect(Number(orgRuns[0]!.getAttribute("y"))).toBeLessThan(100)
    expect(orgRuns[0]!.getAttribute("y")).toBe("56")
    const bottomMeta = Array.from(root.querySelectorAll("text")).find((t) => Number(t.getAttribute("y")) >= 640)
    expect(bottomMeta).toBeUndefined()
  })

  it("luxe knobs: meta end-anchored right, below the frame, clear of the logo box", () => {
    const { root } = renderCover("luxe", { metaPlacement: "bottom-right" })
    const meta = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("云觅科技"))!
    expect(meta.getAttribute("text-anchor")).toBe("end")
    expect(meta.getAttribute("x")).toBe("1208")
    const y = Number(meta.getAttribute("y"))
    expect(y).toBeGreaterThanOrEqual(624)
    expect(y).toBe(684)
    // Baseline sits below the logo box (y630-670). Horizontal overlap with
    // x1120-1216 is fine: the two do not share y.
    expect(y).toBeGreaterThan(BR_LOGO.y + BR_LOGO.h)
  })

  it("museum knobs: meta at top", () => {
    const { root } = renderCover("museum", { metaPlacement: "top" })
    const meta = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("云觅科技"))!
    expect(Number(meta.getAttribute("y"))).toBeLessThan(100)
    expect(meta.getAttribute("y")).toBe("56")
    expect(meta.getAttribute("text-anchor")).toBe("start")
  })

  it("omitted textAnchor equals explicit middle (default poster geometry)", () => {
    const omitted = renderCover("insight", { metaPlacement: "top" })
    const middle = renderCover("insight", { metaPlacement: "top", textAnchor: "middle" })
    expect(omitted.markup).toBe(middle.markup)
    const title = Array.from(omitted.root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("创意提案"),
    )!
    expect(title.getAttribute("text-anchor")).toBe("middle")
    expect(title.getAttribute("x")).toBe("640")
    expect(bar(omitted.root).getAttribute("x")).toBe("610")
  })

  it("textAnchor start left-aligns kicker, title, bar and subtitle at x=96", () => {
    const knobs = {
      showKicker: true,
      barFill: "accent" as const,
      metaPlacement: "bottom-left" as const,
      textAnchor: "start" as const,
    }
    const { root } = renderCover("campaign", knobs)
    const title = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("创意提案"))!
    expect(title.getAttribute("text-anchor")).toBe("start")
    expect(title.getAttribute("x")).toBe("96")
    const kicker = Array.from(root.querySelectorAll("text")).find(
      (t) => t.textContent === "云觅科技" && Number(t.getAttribute("y")) < 280,
    )!
    expect(kicker.getAttribute("text-anchor")).toBe("start")
    expect(kicker.getAttribute("x")).toBe("96")
    expect(bar(root).getAttribute("x")).toBe("96")
    const subtitle = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("一次品牌焕新实验"),
    )!
    expect(subtitle.getAttribute("text-anchor")).toBe("start")
    expect(subtitle.getAttribute("x")).toBe("96")
  })
})
