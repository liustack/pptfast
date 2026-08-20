// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { contrastRatio } from "../audit/deck-audit"
import { PosterMotif } from "./motif-poster-motif"
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
const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }

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

/**
 * poster-motif v3「行情语汇」（2026-08-19 深底组皮肤重设计）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group1-dark-boards.dc.html`
 * 的 insight 设计表。
 */
describe("PosterMotif（行情语汇）", () => {
  it("四种页型都画顶缘行情带：y28/y42 双细线走 border，五枚刻度齿走 accent", () => {
    const tokens = resolveStyle("insight")
    for (const slide of ALL_SLIDES) {
      const { root } = draw("insight", slide)
      const lines = Array.from(root.querySelectorAll("line"))
      const band = lines.filter((l) => l.getAttribute("x1") === "48")
      expect(band.map((l) => l.getAttribute("y1")).sort()).toEqual(["28", "42"])
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

  it("行情带整条压在标题区上沿之上（y<=42+描边，不进 96,48,1040×122）", () => {
    const { root } = draw("insight", contentSlide)
    for (const l of Array.from(root.querySelectorAll("line"))) {
      const y = Math.max(Number(l.getAttribute("y1")), Number(l.getAttribute("y2")))
      const stroke = Number(l.getAttribute("stroke-width") ?? 1)
      expect(y + stroke / 2).toBeLessThan(TITLE_ZONE.y)
    }
  })

  /**
   * 2026-08-21 变淡波把这两档从 0.12/0.8 降到 0.08/0.25，几何一 px 不动。
   * 走线原来的 0.8 档压在 insight 底色上是 6.0:1，高过 4.5:1 的正文地板——
   * 它当时确实在跟署名/脚注抢读（实测 52 页）。新值把两档钉在这里，改回去
   * 立刻红。
   */
  it("四种页型都画基线面积线：面积 8% + 走线 25%（退底档），都走 accent", () => {
    const tokens = resolveStyle("insight")
    for (const slide of ALL_SLIDES) {
      const { root } = draw("insight", slide)
      const area = root.querySelector("path")!
      expect(area.getAttribute("fill")).toBe(tokens.colors.accent)
      expect(area.getAttribute("opacity")).toBe("0.08")
      const line = root.querySelector("polyline")!
      expect(line.getAttribute("stroke")).toBe(tokens.colors.accent)
      expect(line.getAttribute("opacity")).toBe("0.25")
      expect(line.getAttribute("fill")).toBe("none")
      // 走线要压得住署名，但不能压没：面积填充必须比走线更淡，否则整条
      // 行情走线会读成一块实心色带。
      expect(Number(area.getAttribute("opacity"))).toBeLessThan(Number(line.getAttribute("opacity")))
    }
  })

  /**
   * 「压字检测」：走线与署名/脚注同处 y594-656，所以它混出来的颜色压在页面
   * 底色上，必须低于 4.5:1 的正文地板——高过这条线，它读起来就是另一段正文
   * 而不是背景。把 `BASELINE_LINE_OPACITY` 改回 0.8（6.0:1）这条立刻红。
   */
  it("压字检测：走线混色后的对比度低于 4.5:1 的正文地板", () => {
    const t = resolveStyle("insight")
    const { root } = draw("insight", coverSlide)
    const bg = t.defaultBackgrounds.cover
    const ground = bg.kind === "gradient" ? bg.from : t.colors.bg
    const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
    const blend = (fg: string, a: number) => {
      const f = hex(fg)
      const b = hex(ground)
      return "#" + f.map((c, i) => Math.round(c * a + b[i]! * (1 - a)).toString(16).padStart(2, "0")).join("")
    }
    const line = root.querySelector("polyline")!
    const area = root.querySelector("path")!
    const lineRatio = contrastRatio(blend(line.getAttribute("stroke")!, Number(line.getAttribute("opacity"))), ground)
    const areaRatio = contrastRatio(blend(area.getAttribute("fill")!, Number(area.getAttribute("opacity"))), ground)
    // Body ink on the same ground is the other end of the scale — the point
    // of the fade is the gap between these two numbers.
    const inkRatio = contrastRatio(t.colors.text, ground)
    expect(lineRatio).toBeLessThan(4.5)
    expect(areaRatio).toBeLessThan(lineRatio)
    expect(inkRatio).toBeGreaterThan(4.5)
  })

  /**
   * 顶缘双线里只有下沿那条降了档（1.435:1 → 1.157:1）：它横穿
   * `poster-chapter`/`roman-chapter` 的 kicker 字身上三分之一，全语料 153 页
   * 命中 6 页。上沿 2px 那条与五枚琥珀刻度齿零相交，一处不改。
   */
  it("顶缘双线只有下沿一条带退底不透明度，上沿与刻度齿保持满不透明", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("insight", slide)
      const lines = Array.from(root.querySelectorAll("line"))
      const top = lines.find((l) => l.getAttribute("y1") === "28")!
      const bottom = lines.find((l) => l.getAttribute("y1") === "42")!
      expect(top.getAttribute("opacity")).toBe(null)
      expect(bottom.getAttribute("opacity")).toBe("0.45")
      for (const t of lines.filter((l) => l.getAttribute("y1") === "24")) {
        expect(t.getAttribute("opacity")).toBe(null)
      }
    }
  })

  /**
   * 安全区守卫（主会话裁定的两处微调之一）。设计稿原稿把走线画到 x1232，
   * 会从 logo 盒 (1120,630,96×40) 上方穿过并一路顶到页缘；裁定提前在
   * x1100 收笔。把 `BASELINE_POINTS` 的右端改回 1170/1232 这条立刻红。
   */
  it("安全区微调：基线走线右端止于 x1100，让开右下 logo 盒", () => {
    const { root } = draw("insight", contentSlide)
    const pts = polylinePoints(root)
    const maxX = Math.max(...pts.map(([x]) => x))
    expect(maxX).toBe(1100)
    expect(maxX).toBeLessThan(LOGO_BANDS[3].x)

    // 走线整体（连同 2px 描边与面积填充）不与**右下** logo 盒相交。
    //
    // 只判右下这一个，不是偷懒：`brand.position` 缺省就是 `"br"`，一份 deck
    // 只画一个 logo 盒，设计稿的红虚线禁区图里画出来的也正是 (1120,630,96×40)
    // 这一个。裁定要解决的就是它——原稿走线画到 x1232 会从它正中穿过去。
    //
    // 记在这里免得后来人以为漏judgement：这条线是设计稿点名的「全宽」基线，
    // 左端起于 x48，所以一份把 logo 配到**左下**（`position: "bl"`,
    // 64,630,96×40）的 deck，logo 会压在这条线 12% 面积填充的尾巴上。
    // 那是 deck 侧的配置选择，不在本轮裁定范围内；真要躲开就得放弃「全宽」，
    // 属于设计改动而不是安全区微调。
    const minY = Math.min(...pts.map(([, y]) => y))
    const inkBox = { x: pts[0][0] - 1, y: minY - 1, w: maxX - pts[0][0] + 2, h: 656 - minY + 2 }
    expect(rectsOverlap(inkBox, LOGO_BANDS[3]), "baseline ink overlaps the default br logo band").toBe(false)
    // 顶缘行情带则对四个位置都安全（y<=42，四个盒子最上沿是 y48）。
    for (const band of LOGO_BANDS) {
      expect(rectsOverlap({ x: 48, y: 23, w: 1184, h: 20 }, band)).toBe(false)
    }
  })

  it("面积填充闭合到 y656，且首末点与走线两端一致（面积与走线同一组折点）", () => {
    const { root } = draw("insight", contentSlide)
    const pts = polylinePoints(root)
    const d = root.querySelector("path")!.getAttribute("d")!
    expect(d.startsWith(`M ${pts[0][0]} 656`)).toBe(true)
    expect(d.endsWith(`L ${pts[pts.length - 1][0]} 656 Z`)).toBe(true)
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
