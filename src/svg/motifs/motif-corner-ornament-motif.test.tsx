// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { contrastRatio, accessibleInk } from "../ink"
import { CornerOrnamentMotif } from "./motif-corner-ornament-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
/** chapter 不画（两条实测依据见 motif 文件头），其余三档画同一张。 */
const DRAWN_SLIDES = [coverSlide, contentSlide, endingSlide]

/** 本 motif 的四家消费者：锚点 + `MOTIF_CANDIDATES` 里借它的三家。 */
const CONSUMERS = ["journal", "academic", "luxe", "heritage"] as const

/** 设计板上的四条红虚线禁区。 */
const BOARD_ZONES = {
  title: { x: 96, y: 48, w: 1040, h: 122 },
  body: { x: 96, y: 200, w: 1040, h: 420 },
  footerMeta: { x: 48, y: 664, w: 1184, h: 44 },
  brLogo: { x: 1120, y: 630, w: 96, h: 40 },
} as const

/** `brand-chrome.tsx` 的四个 logo 位（`brand.position` 四选一），各 96×40。 */
const LOGO_BOXES = [
  { x: 64, y: 48, w: 96, h: 40 },
  { x: 1120, y: 48, w: 96, h: 40 },
  { x: 64, y: 630, w: 96, h: 40 },
  { x: 1120, y: 630, w: 96, h: 40 },
] as const

/**
 * 全版式 + 主题 deck 十页在 journal/academic/luxe/heritage 四家上实测出来的
 * 排字外沿（工具：`.issues/2026-08-18-theme-redesign/skins/tools/
 * text-margin-sweep.mts`，非 chapter 页 1833 条文字）。推导写在
 * `motif-corner-ornament-motif.tsx` 的文件头。
 */
const TEXT_ENVELOPE = { top: 40, bottom: 709.5 } as const

/**
 * 期号那一件是唯一落在页脚带里的装饰，走的是另一条实测依据。
 *
 * 板上的 `footerMeta` 禁区画成通栏一条（48,664,1184×44），但页脚的**真实
 * 墨迹**不是一条带：`brand-chrome.tsx` 只在 x56（左组）与 x1224 右对齐
 * （右组）各写一行，中间整段是空的。四家消费者 × 全版式 + 十页 deck 实测，
 * 这个中间窗口一条文字都没有——连放宽到 160×28 都是 0 碰撞：
 *   tsx .issues/2026-08-18-theme-redesign/skins/tools/text-margin-sweep.mts \
 *     --themes=journal,academic,luxe,heritage --skip-types=chapter \
 *     --probe=560,686,160,28,issue-mark-generous   → 0 collisions
 * 所以期号按实测的中间窗口收边，而不是按板上那条通栏带——「板是意图、
 * 实测是事实」这条纪律在这一件上指向的正是「板画宽了」。
 */
const FOOTER_MIDDLE_WINDOW = { x: 560, y: 686, w: 160, h: 28 } as const

const contains = (b: Box, z: { x: number; y: number; w: number; h: number }) =>
  b.x0 >= z.x && b.x1 <= z.x + z.w && b.y0 >= z.y && b.y1 <= z.y + z.h

const ir = (theme: string, date?: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: date === undefined ? {} : { date },
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

function draw(theme: string, slide: Slide, date?: string) {
  const ctx = buildCtx(resolveStyle(theme), {})
  return { ...render(<CornerOrnamentMotif ir={ir(theme, date)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** 三条线 + 期号的墨迹盒（线含半线宽；期号按 ascent=fontSize、descent=0.25 估，
 *  与 `deck-audit.ts` 的 `TEXT_DESCENT_RATIO` 同源）。 */
function inkBoxes(root: Element): { label: string; box: Box }[] {
  const out: { label: string; box: Box }[] = []
  for (const l of Array.from(root.querySelectorAll("line"))) {
    const half = num(l, "stroke-width") / 2
    const y = num(l, "y1")
    out.push({
      label: y < 30 ? "thick-rule" : y < 100 ? "thin-rule" : "foot-rule",
      box: {
        x0: Math.min(num(l, "x1"), num(l, "x2")) - half,
        x1: Math.max(num(l, "x1"), num(l, "x2")) + half,
        y0: y - half,
        y1: y + half,
      },
    })
  }
  for (const t of Array.from(root.querySelectorAll("text"))) {
    const fs = num(t, "font-size")
    // 「№ 07」四个字符，中点锚定；宽度按最坏情形一个字符一个 em 估。
    const w = (t.textContent ?? "").length * fs
    out.push({
      label: "issue",
      box: { x0: num(t, "x") - w / 2, x1: num(t, "x") + w / 2, y0: num(t, "y") - fs, y1: num(t, "y") + fs * 0.25 },
    })
  }
  return out
}

const intersects = (b: Box, z: { x: number; y: number; w: number; h: number }) =>
  b.x0 < z.x + z.w && b.x1 > z.x && b.y0 < z.y + z.h && b.y1 > z.y

/**
 * corner-ornament-motif v2「报头双线」（2026-08-20 编辑组皮肤重设计）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group5-editorial-boards
 * .dc.html` 的 `section#g5` journal 设计表。本文件是本轮重写。
 * **id 未改、画的东西整个换了**——角花整族退役并让给 heritage，理由见
 * motif 文件头。
 */
describe("CornerOrnamentMotif（报头双线）", () => {
  it("cover/content/ending 画同一张：顶缘文武双线 + 底缘单线 + 线上中点期号", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("journal", slide, "2026 年 7 月")
      expect(Array.from(root.querySelectorAll("line")), `rules on ${slide.type}`).toHaveLength(3)
      expect(Array.from(root.querySelectorAll("text")), `issue mark on ${slide.type}`).toHaveLength(1)
    }
  })

  it("角花整族退役：不再有任何四角「L」形双线支架（v1 是 16 段 / 4 段短线）", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("journal", slide)
      // v1 的角花每段长 20px 且贴在四角 40/44 处；v2 三条线全是通栏横线。
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const len = Math.abs(num(l, "x2") - num(l, "x1")) + Math.abs(num(l, "y2") - num(l, "y1"))
        expect(len, `short corner-bracket leg survived: ${l.outerHTML}`).toBeGreaterThan(100)
      }
    }
  })

  it("三档输出完全相同——v1 的强档四角 / 弱档单角之分已取消", () => {
    const markups = new Set(DRAWN_SLIDES.map((slide) => draw("journal", slide, "2026 年 7 月").markup))
    expect(markups.size).toBe(1)
  })

  it("chapter 完全退让——借用方 luxe/academic 的 chapter 底上，线走的 primary 实测 1.08:1 / 1.00:1", () => {
    for (const [theme, expected] of [
      ["luxe", 1.08],
      ["academic", 1.0],
    ] as const) {
      const t = resolveStyle(theme)
      const { root } = draw(theme, chapterSlide)
      expect(root.children, `${theme} chapter draws nothing`).toHaveLength(0)
      const chapterBg = t.defaultBackgrounds.chapter
      expect(chapterBg.kind).toBe("color")
      expect(contrastRatio(t.colors.primary, (chapterBg as { value: string }).value)).toBeCloseTo(expected, 1)
    }
    // journal 自己在 chapter 上画得出（11.75:1），退让的是另一条理由：底缘
    // 单线在 chapter 页型上压字（大章号墨迹到 y715）——见 motif 文件头。
    expect(draw("journal", chapterSlide).root.children).toHaveLength(0)
  })

  it("颜色一律读 token：三条线走 primary，线宽 2 / 0.75 / 0.75", () => {
    const t = resolveStyle("journal")
    const { root } = draw("journal", coverSlide)
    const [thick, thin, foot] = Array.from(root.querySelectorAll("line"))
    for (const l of [thick, thin, foot]) expect(l!.getAttribute("stroke")).toBe(t.colors.primary)
    expect(thick!.getAttribute("stroke-width")).toBe("2")
    expect(thin!.getAttribute("stroke-width")).toBe("0.75")
    expect(foot!.getAttribute("stroke-width")).toBe("0.75")
  })

  it("顶缘文武双线几何：x48→1232，粗线 y26、细线 y32", () => {
    const { root } = draw("journal", coverSlide)
    const [thick, thin] = Array.from(root.querySelectorAll("line"))
    expect([num(thick!, "x1"), num(thick!, "y1"), num(thick!, "x2"), num(thick!, "y2")]).toEqual([48, 26, 1232, 26])
    expect([num(thin!, "x1"), num(thin!, "y1"), num(thin!, "x2"), num(thin!, "y2")]).toEqual([48, 32, 1232, 32])
  })

  it("底缘单线几何：x96→1184，落在页缘 y712（板上的 y640 横穿共享脚注行，实测 86 条碰撞）", () => {
    const { root } = draw("journal", coverSlide)
    const foot = Array.from(root.querySelectorAll("line"))[2]!
    expect([num(foot, "x1"), num(foot, "y1"), num(foot, "x2"), num(foot, "y2")]).toEqual([96, 712, 1184, 712])
    // 板上原值就是踩坑的那个值，钉在这里免得有人「改回板上」。
    expect(num(foot, "y1")).not.toBe(640)
  })

  it("期号：字样从 meta.date 推，居中 x640、基线 y706（板上 y646 实测 44 条碰撞），落在新底线正上方", () => {
    const { root } = draw("journal", coverSlide, "2026 年 7 月")
    const t = root.querySelector("text")!
    expect(t.textContent).toBe("№ 07")
    expect([num(t, "x"), num(t, "y"), num(t, "font-size")]).toEqual([640, 706, 16])
    expect(t.getAttribute("text-anchor")).toBe("middle")
    expect(num(t, "y")).not.toBe(646)
  })

  it("期号：日期推不出月份就只留「№」——写死一个刊号会在每份 deck 上撒同一个谎", () => {
    for (const date of [undefined, "", "去年秋天", "2026", "2026 年 13 月"]) {
      const { root } = draw("journal", coverSlide, date)
      expect(root.querySelector("text")!.textContent, `date=${String(date)}`).toBe("№")
    }
    expect(draw("journal", coverSlide, "2026-01-15").root.querySelector("text")!.textContent).toBe("№ 01")
  })

  it("期号是装饰里唯一的文字，所以走 accessibleInk——journal 自己逐字节 no-op，借用方过不了线才抬", () => {
    for (const theme of CONSUMERS) {
      const t = resolveStyle(theme)
      const bg = (t.defaultBackgrounds.content as { value: string }).value
      const { root } = draw(theme, contentSlide, "2026 年 7 月")
      expect(root.querySelector("text")!.getAttribute("fill")).toBe(accessibleInk(t.colors.accent, bg, 16))
    }
    // journal 自己 5.58:1，早过 4.5:1 门槛 → accessibleInk 原样返回 accent。
    const journal = resolveStyle("journal")
    expect(draw("journal", contentSlide).root.querySelector("text")!.getAttribute("fill")).toBe(journal.colors.accent)
  })

  /** 安全区守卫：板上四条红虚线 + 四个 logo 位 + 实测排字外沿，逐件量。 */
  it("安全区：三条线都不进板上四条红虚线禁区", () => {
    const { root } = draw("journal", coverSlide, "2026 年 7 月")
    for (const { label, box } of inkBoxes(root).filter((b) => b.label !== "issue")) {
      for (const [name, zone] of Object.entries(BOARD_ZONES)) {
        expect(intersects(box, zone), `${label} enters the ${name} zone`).toBe(false)
      }
    }
  })

  it("安全区：期号不进标题区/正文区/右下 logo 盒，并整个落在实测的页脚中间空窗里", () => {
    const { root } = draw("journal", coverSlide, "2026 年 7 月")
    const issue = inkBoxes(root).find((b) => b.label === "issue")!.box
    for (const name of ["title", "body", "brLogo"] as const) {
      expect(intersects(issue, BOARD_ZONES[name]), `issue enters the ${name} zone`).toBe(false)
    }
    // 板上的 footerMeta 通栏带是画宽了的那一条，实测依据见 FOOTER_MIDDLE_WINDOW。
    expect(contains(issue, FOOTER_MIDDLE_WINDOW), `issue leaves the measured footer window: ${JSON.stringify(issue)}`).toBe(true)
  })

  it("安全区：四件装饰都不进 brand-chrome 的四个 logo 位（tl/tr/bl/br）", () => {
    const { root } = draw("journal", coverSlide, "2026 年 7 月")
    for (const { label, box } of inkBoxes(root)) {
      for (const zone of LOGO_BOXES) {
        expect(intersects(box, zone), `${label} enters the logo box at ${zone.x},${zone.y}`).toBe(false)
      }
    }
  })

  it("安全区：三条线全部落在实测排字外沿之外（y<40 顶带 / y>709.5 底带）", () => {
    const { root } = draw("journal", coverSlide, "2026 年 7 月")
    for (const { label, box } of inkBoxes(root).filter((b) => b.label !== "issue")) {
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
    const { root } = draw("journal", coverSlide, "2026 年 7 月")
    for (const g of Array.from(root.querySelectorAll("g"))) {
      for (const attr of ["fill", "stroke", "opacity", "stroke-width"]) {
        expect(g.getAttribute(attr), `<g> carries ${attr}`).toBeNull()
      }
    }
    for (const el of Array.from(root.querySelectorAll("line"))) {
      expect(el.getAttribute("stroke"), "line has no own stroke").toBeTruthy()
      expect(el.getAttribute("stroke-width"), "line has no own stroke-width").toBeTruthy()
    }
    expect(root.querySelector("text")!.getAttribute("fill")).toBeTruthy()
  })

  it("motif 不读 chartPalette——图表调色板轮转改不动它一个字节", () => {
    const tokens = resolveStyle("journal")
    const markups = new Set(
      tokens.colors.chartPalette.map((_, offset) =>
        renderSvgMarkup(
          <CornerOrnamentMotif
            ir={ir("journal", "2026 年 7 月")}
            slide={coverSlide}
            ctx={buildCtx(tokens, {}, undefined, undefined, undefined, offset)}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
    const chartOnly = tokens.colors.chartPalette.filter(
      (c) => c !== tokens.colors.primary && c !== tokens.colors.accent,
    )
    expect(chartOnly.length).toBeGreaterThan(0)
    const markup = renderSvgMarkup(
      <CornerOrnamentMotif ir={ir("journal", "2026 年 7 月")} slide={coverSlide} ctx={buildCtx(tokens, {})} />,
    )
    for (const hex of chartOnly) expect(markup, `chart-only ${hex} painted by the motif`).not.toContain(hex)
  })

  it("换一家 tokens 渲染时颜色跟着换，journal 的色一处不残留（零 hex 纪律的实证）", () => {
    const heritage = resolveStyle("heritage")
    const ctx = buildCtx(heritage, {})
    const { markup } = render(<CornerOrnamentMotif ir={ir("heritage", "2026 年 7 月")} slide={coverSlide} ctx={ctx} />)
    expect(markup).toContain(heritage.colors.primary)
    for (const hex of ["#2C2C2A", "#8C4A3C", "#EFEBE1", "#26261F", "#66655C", "#D9D3C2"]) {
      expect(markup, `journal token ${hex} leaked into the heritage render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变（v1 的三档 seed 变体已删）", () => {
    const ctx = buildCtx(resolveStyle("journal"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <CornerOrnamentMotif
            ir={{ ...ir("journal", "2026 年 7 月"), filename: `probe-${i}.pptx` } as PptxIR}
            slide={coverSlide}
            ctx={ctx}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("Decor body passes subset validation（四家消费者各一遍）", () => {
    for (const theme of CONSUMERS) {
      for (const slide of [...DRAWN_SLIDES, chapterSlide]) {
        expect(() => assertSubset(draw(theme, slide, "2026 年 7 月").root)).not.toThrow()
      }
    }
  })
})
