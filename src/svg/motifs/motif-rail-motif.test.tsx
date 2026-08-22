// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { footnoteBaselineFor, FOOTER_DIVIDER_Y } from "../branding-geometry"
import { RailMotif } from "./motif-rail-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
/** chapter 不画；cover 与 content/ending 只差点轨的 x 锚。 */
const DRAWN_SLIDES = [coverSlide, contentSlide, endingSlide]

/** 设计板上的四条红虚线禁区。 */
const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
/** 默认（`br`）品牌 logo 盒，`branding.tsx` 的 `logoBox`；右上带同宽同高。 */
const LOGO_BOX = { x: 1120, y: 630, w: 96, h: 40 }
const TR_LOGO_BAND = { x: 1120, y: 48, w: 96, h: 40 }
/** `cover-left-anchor.tsx` 的 `COVER_BLOCK_W`：左侧通高 primary 色块。 */
const COVER_BLOCK_W = 512

const ir = (theme: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides: [coverSlide],
  }) as unknown as PptxIR

function render(body: React.ReactElement | null): { markup: string; root: Element } {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

function draw(theme: string, slide: Slide) {
  const ctx = buildCtx(resolveStyle(theme), {})
  return { ...render(<RailMotif ir={ir(theme)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

/**
 * rail-motif v2「顶带点轨」（2026-08-20 冷调组皮肤重设计）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group3-cool-boards.dc.html`
 * 的 academic 设计表。本文件在本轮整体重写——v1 的四分之一圆盘（含它自己的
 * `readableOn` 反白分支与 br logo 盒重叠说明）随圆盘一并退役。
 */
describe("RailMotif（顶带点轨）", () => {
  it("cover/content/ending 各画五枚相同空心圆 + 两条角标线", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("academic", slide)
      expect(Array.from(root.querySelectorAll("circle")), `dots on ${slide.type}`).toHaveLength(5)
      expect(Array.from(root.querySelectorAll("line")), `corner marks on ${slide.type}`).toHaveLength(2)
      // v1 的圆盘是一段 path，v2 一段都不画。
      expect(Array.from(root.querySelectorAll("path")), `no arc left on ${slide.type}`).toHaveLength(0)
    }
  })

  it("chapter 完全退让——rail-chapter 自带点轨，且整版 primary 底上画 primary 等于看不见", () => {
    const { root } = draw("academic", chapterSlide)
    expect(root.children).toHaveLength(0)
    expect(Array.from(root.querySelectorAll("circle"))).toHaveLength(0)
    expect(Array.from(root.querySelectorAll("line"))).toHaveLength(0)
  })

  it("颜色一律读 token：五枚点全部空心、走 primary 1.5 描边（不是一实四空），角标走 accent", () => {
    const t = resolveStyle("academic")
    const { root } = draw("academic", contentSlide)
    const dots = Array.from(root.querySelectorAll("circle"))
    expect(dots).toHaveLength(5)
    for (const d of dots) {
      expect(d.getAttribute("fill"), "a filled first-dot still reads as progress").toBe("none")
      expect(d.getAttribute("stroke")).toBe(t.colors.primary)
      expect(d.getAttribute("stroke-width")).toBe("1.5")
      expect(num(d, "r")).toBe(6)
    }
    const corners = Array.from(root.querySelectorAll("line"))
    expect(corners, "corner marks must read colors.accent").toHaveLength(2)
    for (const l of corners) {
      expect(l.getAttribute("stroke")).toBe(t.colors.accent)
      expect(l.getAttribute("stroke-width")).toBe("1.5")
    }
  })

  it("点轨几何：默认锚落在 x96-296 顶带槽内居中、间距 46、y30 上的五枚 r6", () => {
    const { root } = draw("academic", contentSlide)
    const dots = Array.from(root.querySelectorAll("circle")).map((c) => [num(c, "cx"), num(c, "cy"), num(c, "r")])
    expect(dots).toEqual([
      [104, 30, 6],
      [150, 30, 6],
      [196, 30, 6],
      [242, 30, 6],
      [288, 30, 6],
    ])
    const mid = (dots[0]![0] + dots[4]![0]) / 2
    expect(mid, "five-dot cluster must sit on the x96-296 band midpoint").toBe(196)
    expect(dots[0]![0] - 6).toBeGreaterThanOrEqual(96)
    expect(dots[4]![0] + 6).toBeLessThanOrEqual(296)
  })

  it("cover 档整组让位到右板 x570-760 槽内居中（left-anchor 的通高色块盖不到）", () => {
    const { root } = draw("academic", coverSlide)
    const dots = Array.from(root.querySelectorAll("circle")).map((c) => [num(c, "cx"), num(c, "cy"), num(c, "r")])
    expect(dots).toEqual([
      [570, 30, 6],
      [616, 30, 6],
      [662, 30, 6],
      [708, 30, 6],
      [754, 30, 6],
    ])
    const mid = (dots[0]![0] + dots[4]![0]) / 2
    // 板上这档是首点圆心 570、末点右沿 760。组已经把 196px 视觉宽吃满这条槽。
    expect(mid).toBe(662)
    expect(dots[4]![0] + 6).toBe(760)
    // 让位的全部意义：首点左沿必须在色块右沿之外，否则它会被色块整个盖掉。
    expect(dots[0]![0] - 6).toBeGreaterThan(COVER_BLOCK_W)
  })

  it("角标几何：x1200/x1224 起、都止于 x1256 的两条线（y20 长、y30 短）", () => {
    const { root } = draw("academic", coverSlide)
    const marks = Array.from(root.querySelectorAll("line")).map((l) => [
      num(l, "x1"),
      num(l, "y1"),
      num(l, "x2"),
      num(l, "y2"),
    ])
    expect(marks).toEqual([
      [1200, 20, 1256, 20],
      [1224, 30, 1256, 30],
    ])
  })

  /**
   * 安全区守卫（设计板的四条红虚线逐条量）。把点轨或角标往下挪进标题区，
   * 这一条立刻红。
   */
  it("安全区：点轨与角标整组在标题区上沿 y48 之上，够不到正文区", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("academic", slide)
      for (const c of Array.from(root.querySelectorAll("circle"))) {
        expect(num(c, "cy") + num(c, "r"), `dot dips into the title zone on ${slide.type}`).toBeLessThan(TITLE_ZONE.y)
      }
      for (const l of Array.from(root.querySelectorAll("line"))) {
        expect(num(l, "y1")).toBeLessThan(TITLE_ZONE.y)
        expect(num(l, "y2")).toBeLessThan(TITLE_ZONE.y)
      }
      expect(BODY_ZONE.y).toBeGreaterThan(TITLE_ZONE.y)
    }
  })

  it("安全区：点轨够不到右上/右下 logo 盒的左沿，角标在标题区右沿之外、右上 logo 带之上", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("academic", slide)
      for (const c of Array.from(root.querySelectorAll("circle"))) {
        expect(num(c, "cx") + num(c, "r")).toBeLessThan(LOGO_BOX.x)
      }
      for (const l of Array.from(root.querySelectorAll("line"))) {
        expect(num(l, "x1")).toBeGreaterThan(TITLE_ZONE.x + TITLE_ZONE.w)
        // 角标横向与右上 logo 带（x1120-1216）有重叠，靠纵向让开：它整条
        // 画在 y20-30，logo 带从 y48 起。
        expect(num(l, "y1")).toBeLessThan(TR_LOGO_BAND.y)
      }
    }
  })

  /**
   * 设计板把点轨放在 y648，而底带那一行是本仓库所有脚注的共用基线
   * （`branding-geometry.ts` 的 `footnoteBaselineFor`）——实测把点轨压在
   * consulting 八个 content 版式的脚注下面（3.26:1）。这一条锁住「点轨不回
   * 底带」：把 `DOT_Y` 改回 648 立刻红。基线不再是一个定值，最大字号的
   * 脚注坐得最高，所以用它当上界。
   */
  it("点轨不落在脚注基线与页脚带上（板上 y648 的实测撞位，本文件的偏离理由）", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("academic", slide)
      for (const c of Array.from(root.querySelectorAll("circle"))) {
        const bottom = num(c, "cy") + num(c, "r")
        // 20px 是脚注的最大字号（`fitSvgLine` 的 fontSize 上限），字顶按字号估。
        expect(bottom, "dot reaches the shared footnote baseline band").toBeLessThan(
          footnoteBaselineFor(20) - 20,
        )
        expect(bottom).toBeLessThan(FOOTER_DIVIDER_Y)
      }
    }
  })

  it("不画任何左竖条", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("academic", slide)
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        expect(num(r, "width") < 40 && num(r, "height") > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
      }
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
        expect(vertical, `vertical bar rendered: ${l.outerHTML}`).toBe(false)
      }
    }
  })

  it("换一家 tokens 渲染时颜色跟着换，academic 的色一处不残留（零 hex 纪律的实证）", () => {
    const consulting = resolveStyle("consulting")
    const ctx = buildCtx(consulting, {})
    const { markup } = render(<RailMotif ir={ir("consulting")} slide={contentSlide} ctx={ctx} />)
    expect(markup).toContain(consulting.colors.primary)
    expect(markup).toContain(consulting.colors.accent)
    for (const hex of ["#F5F3EC", "#FCFBF6", "#0E6245", "#A8861D", "#23251F", "#62655B", "#DDD9C8"]) {
      expect(markup, `academic token ${hex} leaked into the consulting render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变（v1 的三档 seed 变体已删）", () => {
    const ctx = buildCtx(resolveStyle("academic"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <RailMotif ir={{ ...ir("academic"), filename: `probe-${i}.pptx` } as PptxIR} slide={contentSlide} ctx={ctx} />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("Decor body passes subset validation", () => {
    for (const slide of [...DRAWN_SLIDES, chapterSlide]) {
      expect(() => assertSubset(draw("academic", slide).root)).not.toThrow()
    }
  })
})
