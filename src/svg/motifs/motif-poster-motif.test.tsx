// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { DECOR_CEILING, PosterMotif } from "./motif-poster-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
const ALL_SLIDES = [coverSlide, chapterSlide, contentSlide, endingSlide]

/** BrandChrome 的四个 logo 盒（brand-chrome.tsx 的 logoBox）。 */
const LOGO_BANDS = [
  { x: 64, y: 48, w: 96, h: 40 },
  { x: 1120, y: 48, w: 96, h: 40 },
  { x: 64, y: 630, w: 96, h: 40 },
  { x: 1120, y: 630, w: 96, h: 40 },
]
/** 设计稿的四个内容区（红虚线禁区）。 */
const CONTENT_ZONES = [
  { x: 96, y: 48, w: 1040, h: 122 }, // 标题区
  { x: 96, y: 200, w: 1040, h: 420 }, // 正文区
  { x: 48, y: 664, w: 1184, h: 44 }, // 页脚 meta 带
  { x: 1120, y: 630, w: 96, h: 40 }, // 右下 logo 盒
]

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

const ir = (theme: string, date?: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: date ? { date } : {},
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

function draw(theme: string, slide: Slide, date?: string) {
  const ctx = buildCtx(resolveStyle(theme), {})
  return { ...render(<PosterMotif ir={ir(theme, date)} slide={slide} ctx={ctx} />), ctx }
}

/** 走线折点（polyline 的 points 属性）解析成数对。 */
function polylinePoints(root: Element): [number, number][] {
  const pl = root.querySelector("polyline")!
  return pl
    .getAttribute("points")!
    .trim()
    .split(/\s+/)
    .map((p) => p.split(",").map(Number) as [number, number])
}

/** 一笔线状装饰的着墨下沿（含描边半宽）。 */
function lineInkBottom(el: Element): number {
  const stroke = Number(el.getAttribute("stroke-width") ?? 1)
  const y = Math.max(Number(el.getAttribute("y1")), Number(el.getAttribute("y2")))
  return y + stroke / 2
}

/**
 * poster-motif v4「行情语汇」（2026-08-19 深底组皮肤重设计；v4 = 2026-08-20
 * 第四轮评审「装饰归背景」的返工，整套语汇搬进 y<34 的顶缘空带）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group1-dark-boards.dc.html`
 * 的 insight 设计表。
 */
describe("PosterMotif（行情语汇）", () => {
  it("四种页型都画顶缘行情带：上檐 y8 与行情轴 y28 走 border，五枚刻度齿走 accent", () => {
    const tokens = resolveStyle("insight")
    for (const slide of ALL_SLIDES) {
      const { root } = draw("insight", slide)
      const lines = Array.from(root.querySelectorAll("line"))
      const band = lines.filter((l) => l.getAttribute("x1") === "48")
      expect(band.map((l) => l.getAttribute("y1")).sort()).toEqual(["28", "8"])
      for (const l of band) {
        expect(l.getAttribute("stroke")).toBe(tokens.colors.border)
        expect(l.getAttribute("x2")).toBe("1232")
      }
      const ticks = lines.filter((l) => l.getAttribute("y1") === "24")
      expect(ticks.map((t) => Number(t.getAttribute("x1")))).toEqual([128, 368, 608, 848, 1088])
      for (const t of ticks) {
        expect(t.getAttribute("stroke")).toBe(tokens.colors.accent)
        expect(t.getAttribute("y2")).toBe("32")
      }
    }
  })

  /**
   * v4 的核心守卫，替掉 v3 那条「右端止于 x1100 让开 logo 盒」的局部微调。
   *
   * v3 把基线走线画在 y594-656，`text-margin-sweep` 实测压中 40 条文字，
   * 第二条带线（y42）另压 4 条——评审的「折线图跟文本交叉，分不清主次」
   * 与「本季度概览跟分割线交叉」都出在这里。v4 的处置是位置而不是浓淡：
   * 整套线状装饰收进实测空带 y<34。把任何一笔搬回下半页，这条立刻红。
   */
  it("线状装饰整体压在实测文字上沿之上（着墨 <= 34），四个内容区与四只 logo 盒一处不碰", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("insight", slide)

      for (const l of Array.from(root.querySelectorAll("line"))) {
        expect(lineInkBottom(l), `line ${l.outerHTML} dips below the measured text ceiling`).toBeLessThanOrEqual(
          DECOR_CEILING,
        )
      }
      const pts = polylinePoints(root)
      const walkBottom = Math.max(...pts.map(([, y]) => y)) + 1 // 2px 描边的半宽
      expect(walkBottom).toBeLessThanOrEqual(DECOR_CEILING)

      // 走线 + 面积填充的整块着墨盒（面积闭合到行情轴 y28）。
      const inkBox = {
        x: Math.min(...pts.map(([x]) => x)) - 1,
        y: Math.min(...pts.map(([, y]) => y)) - 1,
        w: Math.max(...pts.map(([x]) => x)) - Math.min(...pts.map(([x]) => x)) + 2,
        h: 28 - Math.min(...pts.map(([, y]) => y)) + 2,
      }
      for (const zone of [...CONTENT_ZONES, ...LOGO_BANDS]) {
        expect(rectsOverlap(inkBox, zone), `ticker ink overlaps ${JSON.stringify(zone)}`).toBe(false)
      }
      // 带线与刻度齿同样对四只 logo 盒安全（着墨 <= 34，盒子最上沿 y48）。
      for (const band of LOGO_BANDS) {
        expect(rectsOverlap({ x: 48, y: 7, w: 1184, h: DECOR_CEILING - 7 }, band)).toBe(false)
      }
    }
  })

  it("四种页型都画行情走线：面积 12% + 走线 80%，都走 accent", () => {
    const tokens = resolveStyle("insight")
    for (const slide of ALL_SLIDES) {
      const { root } = draw("insight", slide)
      const area = root.querySelector("path")!
      expect(area.getAttribute("fill")).toBe(tokens.colors.accent)
      expect(area.getAttribute("opacity")).toBe("0.12")
      const line = root.querySelector("polyline")!
      expect(line.getAttribute("stroke")).toBe(tokens.colors.accent)
      expect(line.getAttribute("opacity")).toBe("0.8")
      expect(line.getAttribute("fill")).toBe("none")
    }
  })

  /**
   * 「给谁对齐」的答案：走线两端与两条带线共用页面自己的外边距
   * （x48/x1232 = 页脚 meta 带 48,664,1184×44 的左右缘），面积填充闭合到
   * 行情轴 y28。三样东西因此落在同一张网格上，而不是半空里的一个数字。
   */
  it("走线两端落在页面外边距 x48/x1232 上，面积闭合到行情轴 y28", () => {
    const { root } = draw("insight", contentSlide)
    const pts = polylinePoints(root)
    expect(pts[0][0]).toBe(48)
    expect(pts[pts.length - 1][0]).toBe(1232)

    const d = root.querySelector("path")!.getAttribute("d")!
    expect(d.startsWith(`M ${pts[0][0]} 28`)).toBe(true)
    expect(d.endsWith(`L ${pts[pts.length - 1][0]} 28 Z`)).toBe(true)

    const axis = Array.from(root.querySelectorAll("line")).find((l) => l.getAttribute("y1") === "28")!
    expect(axis.getAttribute("x1")).toBe(String(pts[0][0]))
    expect(axis.getAttribute("x2")).toBe(String(pts[pts.length - 1][0]))
  })

  describe("幽灵季度水印", () => {
    it("只在 cover 画，且字样从 meta.date 推季度（不是写死 Q2）", () => {
      const { root } = draw("insight", coverSlide, "2026-07-15")
      const t = root.querySelector("text")!
      expect(t.textContent).toBe("Q3")
      expect(t.getAttribute("opacity")).toBe("0.05")
      expect(t.getAttribute("fill")).toBe(resolveStyle("insight").colors.accent)
      expect(t.getAttribute("font-size")).toBe("430")

      for (const slide of [chapterSlide, contentSlide, endingSlide]) {
        expect(draw("insight", slide, "2026-07-15").root.querySelector("text")).toBeNull()
      }
    })

    it.each([
      ["2026-01-01", "Q1"],
      ["2026-03-31", "Q1"],
      ["2026-04-01", "Q2"],
      ["2026 年 6 月", "Q2"],
      ["2026/09/30", "Q3"],
      ["2026-10-02", "Q4"],
      ["2026-12-31", "Q4"],
    ])("%s -> %s", (date, quarter) => {
      expect(draw("insight", coverSlide, date).root.querySelector("text")!.textContent).toBe(quarter)
    })

    it.each([
      ["读不懂的自由文本", "无年月"],
      ["2026", "只有年"],
      ["2026-13-01", "月份越界"],
      ["2026-00-01", "月份为零"],
    ])("%s（%s）时整块不画，而不是猜一个季度", (date) => {
      expect(draw("insight", coverSlide, date).root.querySelector("text")).toBeNull()
    })

    it("meta 没有 date 时不画", () => {
      expect(draw("insight", coverSlide).root.querySelector("text")).toBeNull()
    })
  })

  it("换一家 tokens 渲染时颜色整体跟着换，insight 的色一处不残留（零 hex 纪律的实证）", () => {
    const consulting = resolveStyle("consulting")
    const ctx = buildCtx(consulting, {})
    const { markup } = render(
      <PosterMotif ir={ir("consulting", "2026-07-15")} slide={coverSlide} ctx={ctx} />,
    )
    expect(markup).toContain(consulting.colors.accent)
    expect(markup).toContain(consulting.colors.border)
    // 本轮 insight 的七个色一个都不许出现在别家的渲染里
    for (const hex of ["#0F1216", "#171C22", "#16202B", "#F0A63C", "#F2EFE8", "#9AA7B4", "#2A3440"]) {
      expect(markup, `insight token ${hex} leaked into consulting render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <PosterMotif
            ir={{ ...ir("insight", "2026-07-15"), filename: `probe-${i}.pptx` } as PptxIR}
            slide={coverSlide}
            ctx={ctx}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("不画任何左竖条——深底三家的反面基线里那根左侧竖条不来自本 motif", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("insight", slide)
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        const w = Number(r.getAttribute("width"))
        const h = Number(r.getAttribute("height"))
        expect(w < 40 && h > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
      }
    }
  })

  it("Decor body passes subset validation", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("insight", slide, "2026-07-15")
      expect(() => assertSubset(root)).not.toThrow()
    }
  })
})
