// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { contrastRatio } from "../ink"
import { BannerMotif } from "./motif-banner-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
/** chapter 不画（整版 primary 底），其余三档画同一张。 */
const DRAWN_SLIDES = [coverSlide, contentSlide, endingSlide]

/** 本 motif 的三家消费者：锚点 + `MOTIF_CANDIDATES` 里借它的两家。 */
const CONSUMERS = ["consulting", "academic", "enterprise"] as const

/** 设计板上的四条红虚线禁区。 */
const BOARD_ZONES = {
  title: { x: 96, y: 48, w: 1040, h: 122 },
  body: { x: 96, y: 200, w: 1040, h: 420 },
  footerMeta: { x: 48, y: 664, w: 1184, h: 44 },
  brLogo: { x: 1120, y: 630, w: 96, h: 40 },
} as const

/** `branding.tsx` 的四个 logo 位（`brand.position` 四选一），各 96×40。 */
const LOGO_BOXES = [
  { x: 64, y: 48, w: 96, h: 40 },
  { x: 1120, y: 48, w: 96, h: 40 },
  { x: 64, y: 630, w: 96, h: 40 },
  { x: 1120, y: 630, w: 96, h: 40 },
] as const

/**
 * 全版式 + 主题 deck 十页在 consulting/academic/enterprise 三家上实测出来的
 * 排字外沿（工具：`.issues/2026-08-18-theme-redesign/skins/tools/
 * text-margin-sweep.mts`，非 chapter 页 1376 条文字）。板上的四条红虚线是
 * 意图，这四个数是事实——推导写在 `motif-banner-motif.tsx` 的文件头。
 */
const TEXT_ENVELOPE = { top: 40, bottom: 709.5, left: 56, right: 1224 } as const

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
  return { ...render(<BannerMotif ir={ir(theme)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** 两段线各自的墨迹盒（含半线宽）。 */
function inkBoxes(root: Element): { label: string; box: Box }[] {
  const out: { label: string; box: Box }[] = []
  for (const l of Array.from(root.querySelectorAll("line"))) {
    const half = num(l, "stroke-width") / 2
    out.push({
      label: num(l, "x1") < 96 ? "lead-rule" : "top-rule",
      box: {
        x0: Math.min(num(l, "x1"), num(l, "x2")) - half,
        x1: Math.max(num(l, "x1"), num(l, "x2")) + half,
        y0: Math.min(num(l, "y1"), num(l, "y2")) - half,
        y1: Math.max(num(l, "y1"), num(l, "y2")) + half,
      },
    })
  }
  return out
}

const intersects = (b: Box, z: { x: number; y: number; w: number; h: number }) =>
  b.x0 < z.x + z.w && b.x1 > z.x && b.y0 < z.y + z.h && b.y1 > z.y

/**
 * banner-motif v2「批注线」（2026-08-20 编辑组皮肤重设计）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group5-editorial-boards
 * .dc.html` 的 `section#g5` consulting 设计表。本文件是本轮新建。
 */
describe("BannerMotif（批注线）", () => {
  it("cover/content/ending 画同一张：顶缘规矩线的两段，别的什么都没有", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("consulting", slide)
      expect(Array.from(root.querySelectorAll("line")), `rules on ${slide.type}`).toHaveLength(2)
      // 第四轮评审删掉的两件：黄色高亮块（唯一的 rect）与底缘页码线。
      expect(Array.from(root.querySelectorAll("rect")), `highlight block back on ${slide.type}`).toHaveLength(0)
      // v1 的五竖线 + 两通栏横线网格底纹整族退役。
      expect(Array.from(root.querySelectorAll("polyline, path, circle")), `v1 leftovers on ${slide.type}`).toHaveLength(0)
    }
  })

  /**
   * 第四轮评审（academic p01/p09）的返工点。用户原话：「底部那个无意义的
   * 装饰绿色横线是什么，很奇怪」「如果你要高亮文字，就画在要高亮的具体
   * 文字底部，画在这里不伦不类」。装饰位置写死、不读内容，所以它永远
   * 高亮不到任何一个真的关键词——干脆不装高亮，也不留那条什么都没划到的
   * 短划线。这条钉的是「底带一件不剩、页面上没有任何短划线」。
   */
  it("底带空无一物：页码线已删，全页不留任何短于半幅的横划线", () => {
    for (const theme of CONSUMERS) {
      for (const slide of DRAWN_SLIDES) {
        const { root } = draw(theme, slide)
        for (const { label, box } of inkBoxes(root)) {
          expect(box.y0, `${label} still sits in the bottom band`).toBeLessThan(100)
          // 两段线首尾相接成一条通栏线，单独一段短划线不算数——量的是整条。
          expect(box.x1 - box.x0, `${label} is a stray short dash`).toBeGreaterThan(0)
        }
        const xs = inkBoxes(root).flatMap(({ box }) => [box.x0, box.x1])
        expect(Math.max(...xs) - Math.min(...xs), "the rule no longer spans the page").toBeGreaterThan(1000)
      }
    }
  })

  it("cover/ending 输出完全相同。内容页退底，件数不变", () => {
    expect(draw("consulting", coverSlide).markup).toBe(draw("consulting", endingSlide).markup)
    expect(draw("consulting", contentSlide).root.querySelectorAll("line")).toHaveLength(2)
  })

  it("chapter 完全退让——两条线走 primary，consulting/academic 的 chapter 底就是各自的 primary，实测 1.00:1", () => {
    for (const theme of ["consulting", "academic"] as const) {
      const t = resolveStyle(theme)
      const { root } = draw(theme, chapterSlide)
      expect(root.children, `${theme} chapter draws nothing`).toHaveLength(0)
      // 退让的实测依据，而不是「感觉太淡」。
      const chapterBg = t.defaultBackgrounds.chapter
      expect(chapterBg.kind).toBe("color")
      expect(contrastRatio(t.colors.primary, (chapterBg as { value: string }).value)).toBeCloseTo(1, 2)
    }
  })

  it("颜色一律读 token：通栏一段走 primary、起手一段走 accent，两段同宽 1.5", () => {
    const t = resolveStyle("consulting")
    const { root } = draw("consulting", coverSlide)
    const [top, lead] = Array.from(root.querySelectorAll("line"))
    expect(top!.getAttribute("stroke")).toBe(t.colors.primary)
    expect(lead!.getAttribute("stroke")).toBe(t.colors.accent)
    for (const l of [top!, lead!]) expect(l.getAttribute("stroke-width")).toBe("1.5")
  })

  it("顶缘规矩线几何：accent 段 x48→116、primary 段 x116→1232，同在 y32 首尾相接", () => {
    const { root } = draw("consulting", coverSlide)
    const [top, lead] = Array.from(root.querySelectorAll("line"))
    expect([num(top!, "x1"), num(top!, "y1"), num(top!, "x2"), num(top!, "y2")]).toEqual([116, 32, 1232, 32])
    expect([num(lead!, "x1"), num(lead!, "y1"), num(lead!, "x2"), num(lead!, "y2")]).toEqual([48, 32, 116, 32])
    // 首尾相接：同一条 y、共用端点 x116，既不留缝也不叠画（butt cap）。
    expect(num(lead!, "x2")).toBe(num(top!, "x1"))
    expect(num(lead!, "y1")).toBe(num(top!, "y1"))
    // 起手段的长度照搬原来那枚黄色高亮块的 68px 宽。
    expect(num(lead!, "x2") - num(lead!, "x1")).toBe(68)
  })

  /** 安全区守卫：板上四条红虚线 + 四个 logo 位 + 实测排字外沿，逐件量。 */
  it("安全区：两段线都不进板上四条红虚线禁区", () => {
    const { root } = draw("consulting", coverSlide)
    for (const { label, box } of inkBoxes(root)) {
      for (const [name, zone] of Object.entries(BOARD_ZONES)) {
        expect(intersects(box, zone), `${label} enters the ${name} zone`).toBe(false)
      }
    }
  })

  it("安全区：两段线都不进 branding 的四个 logo 位（tl/tr/bl/br）", () => {
    const { root } = draw("consulting", coverSlide)
    for (const { label, box } of inkBoxes(root)) {
      for (const zone of LOGO_BOXES) {
        expect(intersects(box, zone), `${label} enters the logo box at ${zone.x},${zone.y}`).toBe(false)
      }
    }
  })

  it("安全区：两段线全部落在实测排字外沿之外（y<40 顶带 / y>709.5 底带）", () => {
    const { root } = draw("consulting", coverSlide)
    for (const { label, box } of inkBoxes(root)) {
      const outside = box.y1 <= TEXT_ENVELOPE.top || box.y0 >= TEXT_ENVELOPE.bottom
      expect(outside, `${label} sits inside the measured text envelope: ${JSON.stringify(box)}`).toBe(true)
    }
  })

  it("不画任何左竖条（编辑组板上的组内互检：左竖条 0 处）", () => {
    for (const theme of CONSUMERS) {
      for (const slide of DRAWN_SLIDES) {
        const { root } = draw(theme, slide)
        for (const r of Array.from(root.querySelectorAll("rect"))) {
          expect(num(r, "width") < 40 && num(r, "height") > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
        }
        for (const l of Array.from(root.querySelectorAll("line"))) {
          const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
          expect(vertical, `vertical bar rendered: ${l.outerHTML}`).toBe(false)
        }
      }
    }
  })

  it("画笔属性写在叶子上，不挂 <g>——导出侧的既有惯例", () => {
    const { root } = draw("consulting", coverSlide)
    for (const g of Array.from(root.querySelectorAll("g"))) {
      for (const attr of ["fill", "stroke", "opacity", "stroke-width"]) {
        expect(g.getAttribute(attr), `<g> carries ${attr}`).toBeNull()
      }
    }
    for (const el of Array.from(root.querySelectorAll("line"))) {
      expect(el.getAttribute("stroke"), "line has no own stroke").toBeTruthy()
      expect(el.getAttribute("stroke-width"), "line has no own stroke-width").toBeTruthy()
    }
  })

  it("motif 不读 chartPalette——图表调色板轮转改不动它一个字节", () => {
    const tokens = resolveStyle("consulting")
    const markups = new Set(
      tokens.colors.chartPalette.map((_, offset) =>
        renderSvgMarkup(
          <BannerMotif
            ir={ir("consulting")}
            slide={coverSlide}
            ctx={buildCtx(tokens, {}, undefined, undefined, undefined, offset)}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
    // 前两格与 primary/accent 同值（板上「chart 首两格即结构色」），所以
    // 要钉的是只属于图表的那两格在装饰里一次都不出现。
    const chartOnly = tokens.colors.chartPalette.filter(
      (c) => c !== tokens.colors.primary && c !== tokens.colors.accent,
    )
    expect(chartOnly.length).toBeGreaterThan(0)
    const markup = renderSvgMarkup(
      <BannerMotif ir={ir("consulting")} slide={coverSlide} ctx={buildCtx(tokens, {})} />,
    )
    for (const hex of chartOnly) expect(markup, `chart-only ${hex} painted by the motif`).not.toContain(hex)
  })

  it("换一家 tokens 渲染时颜色跟着换，consulting 的色一处不残留（零 hex 纪律的实证）", () => {
    const enterprise = resolveStyle("enterprise")
    const ctx = buildCtx(enterprise, {})
    const { markup } = render(<BannerMotif ir={ir("enterprise")} slide={coverSlide} ctx={ctx} />)
    expect(markup).toContain(enterprise.colors.primary)
    expect(markup).toContain(enterprise.colors.accent)
    for (const hex of ["#1E2A4A", "#F5C518", "#F7F6F2", "#1C1E23", "#5B6069", "#DDDCD4"]) {
      expect(markup, `consulting token ${hex} leaked into the enterprise render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变（v1 的三档 seed 变体已删）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <BannerMotif ir={{ ...ir("consulting"), filename: `probe-${i}.pptx` } as PptxIR} slide={coverSlide} ctx={ctx} />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("Decor body passes subset validation（三家消费者各一遍）", () => {
    for (const theme of CONSUMERS) {
      for (const slide of [...DRAWN_SLIDES, chapterSlide]) {
        expect(() => assertSubset(draw(theme, slide).root)).not.toThrow()
      }
    }
  })
})
