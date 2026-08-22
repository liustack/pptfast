// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { HeritageMotif } from "./motif-heritage-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
const ALL_SLIDES = [coverSlide, chapterSlide, contentSlide, endingSlide]

/** 设计板上的四条红虚线禁区。 */
const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
const FOOTER_ZONE = { x: 48, y: 664, w: 1184, h: 44 }
/** 默认（`br`）品牌 logo 盒，`branding.tsx` 的 `logoBox`。 */
const LOGO_BOX = { x: 1120, y: 630, w: 96, h: 40 }
const TR_LOGO = { x: 1120, y: 48, w: 96, h: 40 }

const ir = (theme: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides: [coverSlide],
  }) as unknown as PptxIR

function render(body: React.ReactElement): { markup: string; root: Element } {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

function draw(theme: string, slide: Slide) {
  const ctx = buildCtx(resolveStyle(theme), {})
  return { ...render(<HeritageMotif ir={ir(theme)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

/** 三件东西：顶缘双线（按描边宽度分粗/细）、两枚角花、底缘线 + 中点金菱。 */
function parts(root: Element) {
  const lines = Array.from(root.querySelectorAll("line"))
  const rects = Array.from(root.querySelectorAll("rect"))
  const diamonds = rects.filter((r) => r.getAttribute("transform")?.startsWith("rotate(45"))
  return {
    thickRule: lines.find((l) => l.getAttribute("stroke-width") === "2")!,
    thinRule: lines.find((l) => l.getAttribute("stroke-width") === "0.75")!,
    footRule: lines.find((l) => l.getAttribute("stroke-width") === "1")!,
    florets: diamonds.filter((r) => num(r, "width") === 8),
    centerDiamond: diamonds.find((r) => num(r, "width") === 10)!,
  }
}

/** 旋转 45° 的方块的外接半径（边长/2 · √2）。 */
const circumRadius = (r: Element) => (num(r, "width") / 2) * Math.SQRT2

/**
 * heritage-motif v3「藏书票纹饰」（2026-08-19 暖纸组皮肤重设计）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group2-warm-boards.dc.html`
 * 的 heritage 设计表。本文件是本轮新建——v2 的三档 seed 变体一直没有自己的
 * 测试，四家皮肤这一轮一并补齐。
 */
describe("HeritageMotif（藏书票纹饰）", () => {
  it("四种页型都画：顶缘双线 + 两角角花 + 底缘线带中点金菱（v2 的 chapter 退让取消）", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("heritage", slide)
      const p = parts(root)
      expect(p.thickRule, `no thick rule on ${slide.type}`).toBeTruthy()
      expect(p.thinRule, `no thin rule on ${slide.type}`).toBeTruthy()
      expect(p.footRule, `no foot rule on ${slide.type}`).toBeTruthy()
      expect(p.florets, `wrong floret count on ${slide.type}`).toHaveLength(2)
      expect(p.centerDiamond, `no center diamond on ${slide.type}`).toBeTruthy()
    }
  })

  it("颜色一律读 token：双线与金菱走 accent、角花走 primary、底缘线走 border", () => {
    const t = resolveStyle("heritage")
    const { root } = draw("heritage", coverSlide)
    const p = parts(root)
    expect(p.thickRule.getAttribute("stroke")).toBe(t.colors.accent)
    expect(p.thinRule.getAttribute("stroke")).toBe(t.colors.accent)
    expect(p.centerDiamond.getAttribute("fill")).toBe(t.colors.accent)
    for (const f of p.florets) expect(f.getAttribute("fill")).toBe(t.colors.primary)
    expect(p.footRule.getAttribute("stroke")).toBe(t.colors.border)
  })

  it("顶缘双线几何：x48→1232，粗线 y28 / 细线 y36", () => {
    const { root } = draw("heritage", coverSlide)
    const { thickRule, thinRule } = parts(root)
    for (const l of [thickRule, thinRule]) {
      expect(num(l, "x1")).toBe(48)
      expect(num(l, "x2")).toBe(1232)
    }
    expect(num(thickRule, "y1")).toBe(28)
    expect(num(thinRule, "y1")).toBe(36)
  })

  it("两角角花几何：中心 (60,16) 与 (1220,16)，8×8 旋转 45°", () => {
    const { root } = draw("heritage", coverSlide)
    const centers = parts(root)
      .florets.map((f) => [num(f, "x") + num(f, "width") / 2, num(f, "y") + num(f, "height") / 2] as const)
      .sort((a, b) => a[0] - b[0])
    expect(centers).toEqual([
      [60, 16],
      [1220, 16],
    ])
    for (const f of parts(root).florets) {
      expect(num(f, "width")).toBe(num(f, "height"))
      const cx = num(f, "x") + num(f, "width") / 2
      const cy = num(f, "y") + num(f, "height") / 2
      expect(f.getAttribute("transform")).toBe(`rotate(45 ${cx} ${cy})`)
    }
  })

  it("底缘线几何：x96→1184 的 y626，金菱压在它的中点 x640", () => {
    const { root } = draw("heritage", coverSlide)
    const { footRule, centerDiamond } = parts(root)
    expect(num(footRule, "x1")).toBe(96)
    expect(num(footRule, "x2")).toBe(1184)
    expect(num(footRule, "y1")).toBe(626)
    expect(num(footRule, "y2")).toBe(626)
    const cx = num(centerDiamond, "x") + num(centerDiamond, "width") / 2
    const cy = num(centerDiamond, "y") + num(centerDiamond, "height") / 2
    expect(cx).toBe((num(footRule, "x1") + num(footRule, "x2")) / 2)
    expect(cy).toBe(626)
    expect(centerDiamond.getAttribute("transform")).toBe(`rotate(45 ${cx} ${cy})`)
  })

  /**
   * 安全区守卫（设计板的四条红虚线逐条量）。把顶缘双线压进标题区、或把
   * 底缘线放到 logo 盒的纵向区间里，这一条立刻红。
   */
  it("安全区：顶缘三件全在标题区上沿 y48 之上", () => {
    const { root } = draw("heritage", coverSlide)
    const { thickRule, thinRule, florets } = parts(root)
    expect(num(thickRule, "y1")).toBeLessThan(TITLE_ZONE.y)
    expect(num(thinRule, "y1")).toBeLessThan(TITLE_ZONE.y)
    for (const f of florets) {
      const cy = num(f, "y") + num(f, "height") / 2
      expect(cy + circumRadius(f)).toBeLessThan(TITLE_ZONE.y)
    }
  })

  it("安全区：底缘线让开右下 logo 盒的上沿 y630，且整组都在正文区之下、页脚 meta 带之上", () => {
    const { root } = draw("heritage", coverSlide)
    const { footRule, centerDiamond } = parts(root)
    expect(num(footRule, "y1")).toBeLessThan(LOGO_BOX.y)
    expect(num(footRule, "y1")).toBeGreaterThan(BODY_ZONE.y + BODY_ZONE.h)
    // 中点金菱纵向压过 y630，但横向离 logo 盒的 x1120-1216 有 480px。
    const cx = num(centerDiamond, "x") + num(centerDiamond, "width") / 2
    const cy = num(centerDiamond, "y") + num(centerDiamond, "height") / 2
    const r = circumRadius(centerDiamond)
    expect(cx + r).toBeLessThan(LOGO_BOX.x)
    expect(cy + r).toBeLessThan(FOOTER_ZONE.y)
  })

  it("安全区：整幅装饰不进正文区（y200-620 一件不落）", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("heritage", slide)
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const y = Math.max(num(l, "y1"), num(l, "y2"))
        expect(y < BODY_ZONE.y || y > BODY_ZONE.y + BODY_ZONE.h, `line inside the body zone: ${l.outerHTML}`).toBe(true)
      }
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        const cy = num(r, "y") + num(r, "height") / 2
        expect(cy < BODY_ZONE.y || cy > BODY_ZONE.y + BODY_ZONE.h, `rect inside the body zone: ${r.outerHTML}`).toBe(
          true,
        )
      }
    }
  })

  it("不画任何左竖条——v2 的左右页缘竖双线（variant c）已退役", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("heritage", slide)
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
        expect(vertical, `vertical bar rendered: ${l.outerHTML}`).toBe(false)
      }
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        expect(num(r, "width") < 40 && num(r, "height") > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
      }
    }
  })

  it("换一家 tokens 渲染时颜色跟着换，heritage 的色一处不残留（零 hex 纪律的实证）", () => {
    const journal = resolveStyle("journal")
    const ctx = buildCtx(journal, {})
    const { markup } = render(<HeritageMotif ir={ir("journal")} slide={coverSlide} ctx={ctx} />)
    expect(markup).toContain(journal.colors.accent)
    expect(markup).toContain(journal.colors.primary)
    for (const hex of ["#F4EDE2", "#FBF6EC", "#6E1F2A", "#B8742C", "#2E2119", "#6F5F51", "#DCCDB8"]) {
      expect(markup, `heritage token ${hex} leaked into the journal render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变（v2 的三档 seed 变体已删）", () => {
    const ctx = buildCtx(resolveStyle("heritage"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <HeritageMotif ir={{ ...ir("heritage"), filename: `probe-${i}.pptx` } as PptxIR} slide={coverSlide} ctx={ctx} />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("Decor body passes subset validation", () => {
    for (const slide of ALL_SLIDES) {
      expect(() => assertSubset(draw("heritage", slide).root)).not.toThrow()
    }
  })

  it("cover-only bookplate stamp: 60×76 outer frame at (1150, 96), wine stroke, caramel inner + diamond", () => {
    const { root, ctx } = draw("heritage", coverSlide)
    const stamp = Array.from(root.querySelectorAll("rect")).filter((r) => num(r, "width") === 60 && num(r, "height") === 76)
    expect(stamp).toHaveLength(1)
    expect(num(stamp[0]!, "x")).toBe(1150)
    expect(num(stamp[0]!, "y")).toBe(96)
    expect(stamp[0]!.getAttribute("fill")).toBe("none")
    expect(stamp[0]!.getAttribute("stroke")).toBe(ctx.colors.primary)
    const inner = Array.from(root.querySelectorAll("rect")).find((r) => num(r, "width") === 48 && num(r, "height") === 64)!
    expect(num(inner, "x")).toBe(1156)
    expect(num(inner, "y")).toBe(102)
    expect(inner.getAttribute("fill")).toBe("none")
    expect(inner.getAttribute("stroke")).toBe(ctx.colors.accent)
    const gem = Array.from(root.querySelectorAll("rect")).find((r) => num(r, "width") === 16)!
    expect(gem.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(num(gem, "x") + 8).toBe(1180)
    expect(num(gem, "y") + 8).toBe(134)
    expect(num(stamp[0]!, "y")).toBeGreaterThan(TR_LOGO.y + TR_LOGO.h)
    expect(num(stamp[0]!, "x")).toBeGreaterThan(TITLE_ZONE.x + TITLE_ZONE.w)
    expect(num(stamp[0]!, "y") + num(stamp[0]!, "height")).toBeLessThan(BODY_ZONE.y)
  })

  it("other page types do not grow a stamp", () => {
    for (const slide of [chapterSlide, contentSlide, endingSlide]) {
      const { root } = draw("heritage", slide)
      const stamp = Array.from(root.querySelectorAll("rect")).filter((r) => num(r, "width") === 60 && num(r, "height") === 76)
      expect(stamp, `stamp leaked onto ${slide.type}`).toHaveLength(0)
    }
  })
})
