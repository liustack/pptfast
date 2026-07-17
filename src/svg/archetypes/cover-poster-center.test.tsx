// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../themes"
import { PosterCenterCover } from "./cover-poster-center"
import type { PptxIR, Slide } from "@/ir"

const slide: Slide = { type: "cover", heading: "创意提案", subheading: "一次品牌焕新实验", blocks: [] } as Slide
const ir = (theme: string): PptxIR =>
  ({ version: "3", filename: "x.pptx", theme: { id: theme }, meta: { organization: "品牌组" }, assets: { images: {} }, slides: [slide] }) as unknown as PptxIR

// BrandChrome's brand logo bands (BrandChrome.tsx logoBox: image at
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
    const ctx = buildCtx(resolveStyle("insight"), {})
    const out = renderSvgMarkup(<PosterCenterCover ir={ir("insight")} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain("创意提案")
    expect(out).toContain('text-anchor="middle"')
    expect(out).toContain("#E63946") // RED 经 ctx.colors.primary 而来，与 creative primary 逐字节相同
    expect(out).not.toContain("#D4A57C") // creative accent（暖棕）不应出现——RED 不映射到 accent
    expect(out).not.toContain("#666670") // META_MUTED 并入 muted 后不得残留
  })
  it("consulting tokens 下用 consulting 的 primary 色（token 化成立）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const out = renderSvgMarkup(<PosterCenterCover ir={ir("consulting")} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain("#051C2C") // consulting primary
    expect(out).not.toContain("#E63946") // creative primary 不得残留
  })

  it("accent 短横条精确坐标(width=60/height=4)走 primary、副标题居中、底部合并 meta 行含组织/密级/日期", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const fullSlide: Slide = {
      type: "cover",
      heading: "年度财务报告",
      subheading: "信息安全与增长",
      blocks: [],
    } as Slide
    const fullIr: PptxIR = {
      version: "3",
      filename: "deck.pptx",
      theme: { id: "insight" },
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
    // centered row (CONF_LABEL.internal -> "内部").
    expect(markup).toContain("DarkCo")
    expect(markup).toContain("内部")
  })

  it("Cover 元素避开四角 BrandChrome logo 条带", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
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
    const ctx = buildCtx(resolveStyle("insight"), {})
    const { root } = render(<PosterCenterCover ir={ir("insight")} slide={slide} index={0} ctx={ctx} />)
    expect(() => assertSubset(root)).not.toThrow()
  })
})
