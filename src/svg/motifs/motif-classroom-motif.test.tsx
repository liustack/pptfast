// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { contrastRatio } from "../ink"
import { ClassroomMotif } from "./motif-classroom-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
/** chapter 不画（整版 primary 底），其余三档画同一张。 */
const DRAWN_SLIDES = [coverSlide, contentSlide, endingSlide]

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
 * 全 41 版式 + 主题 deck 十页实测出来的排字外沿（工具：
 * `.issues/2026-08-18-theme-redesign/skins/tools/text-margin-sweep.mts`，
 * 486 条文字 / 51 页）。板上的四条红虚线是意图，这四个数是事实，本 motif
 * 三件东西按事实收边——推导写在 `motif-classroom-motif.tsx` 的文件头。
 */
const TEXT_ENVELOPE = { top: 34, bottom: 708.6, left: 56, right: 1224 } as const

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
  return { ...render(<ClassroomMotif ir={ir(theme)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

type Box = { x0: number; y0: number; x1: number; y1: number }

/** 每件装饰的墨迹包围盒（含半线宽）。 */
function inkBoxes(root: Element): { label: string; box: Box }[] {
  const out: { label: string; box: Box }[] = []
  for (const c of Array.from(root.querySelectorAll("circle"))) {
    const half = num(c, "stroke-width") / 2
    const r = num(c, "r") + half
    out.push({
      label: `hole@${num(c, "cx")}`,
      box: { x0: num(c, "cx") - r, y0: num(c, "cy") - r, x1: num(c, "cx") + r, y1: num(c, "cy") + r },
    })
  }
  for (const l of Array.from(root.querySelectorAll("line"))) {
    const half = num(l, "stroke-width") / 2
    out.push({
      label: "pencil",
      box: {
        x0: Math.min(num(l, "x1"), num(l, "x2")) - half,
        y0: Math.min(num(l, "y1"), num(l, "y2")) - half,
        x1: Math.max(num(l, "x1"), num(l, "x2")) + half,
        y1: Math.max(num(l, "y1"), num(l, "y2")) + half,
      },
    })
  }
  for (const p of Array.from(root.querySelectorAll("path"))) {
    // 回形针只有 M/q/l 三种指令，取所有出现过的绝对坐标的极值即可——
    // 二次贝塞尔的控制点恒在包围盒内，用控制点扩张是保守的一侧。
    const d = p.getAttribute("d") ?? ""
    const half = num(p, "stroke-width") / 2
    let cx = 0
    let cy = 0
    const xs: number[] = []
    const ys: number[] = []
    for (const seg of d.match(/[MqlL][^MqlL]*/g) ?? []) {
      const cmd = seg[0]
      const n = (seg.slice(1).match(/-?[\d.]+/g) ?? []).map(Number)
      if (cmd === "M") {
        cx = n[0]
        cy = n[1]
        xs.push(cx)
        ys.push(cy)
      } else if (cmd === "q") {
        xs.push(cx + n[0], cx + n[2])
        ys.push(cy + n[1], cy + n[3])
        cx += n[2]
        cy += n[3]
        xs.push(cx)
        ys.push(cy)
      } else if (cmd === "l") {
        cx += n[0]
        cy += n[1]
        xs.push(cx)
        ys.push(cy)
      }
    }
    out.push({
      label: "paperclip",
      box: {
        x0: Math.min(...xs) - half,
        y0: Math.min(...ys) - half,
        x1: Math.max(...xs) + half,
        y1: Math.max(...ys) + half,
      },
    })
  }
  return out
}

const intersects = (b: Box, z: { x: number; y: number; w: number; h: number }) =>
  b.x0 < z.x + z.w && b.x1 > z.x && b.y0 < z.y + z.h && b.y1 > z.y

/**
 * classroom-motif v2「拍纸簿」（2026-08-20 柔和组皮肤重设计）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group4-soft-boards.dc.html`
 * 的 `section#g4` classroom 设计表。本文件是本轮新建。
 */
describe("ClassroomMotif（拍纸簿）", () => {
  it("cover/content/ending 画同一张：12 枚装订孔 + 一条铅笔虚线 + 一枚回形针", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("classroom", slide)
      expect(Array.from(root.querySelectorAll("circle")), `holes on ${slide.type}`).toHaveLength(12)
      expect(Array.from(root.querySelectorAll("line")), `pencil on ${slide.type}`).toHaveLength(1)
      expect(Array.from(root.querySelectorAll("path")), `paperclip on ${slide.type}`).toHaveLength(1)
      // 有机斑块（v1 的主体）整族退役——一个 blob path 都不剩，path 只剩回形针。
      expect(Array.from(root.querySelectorAll("path")).filter((p) => (p.getAttribute("fill") ?? "none") !== "none")).toHaveLength(0)
    }
  })

  it("三档输出完全相同——v1 的 content 弱档（贴角小斑 + 点阵 + 波浪线）已取消", () => {
    const markups = new Set(DRAWN_SLIDES.map((slide) => draw("classroom", slide).markup))
    expect(markups.size).toBe(1)
  })

  it("chapter 完全退让——整版 primary 雾蓝底上，铅笔灰 1.08:1 / 陶土红 1.41:1，看不见", () => {
    const t = resolveStyle("classroom")
    const { root } = draw("classroom", chapterSlide)
    expect(root.children).toHaveLength(0)
    // 退让的实测依据，而不是「感觉太淡」。
    expect(contrastRatio(t.colors.muted, t.colors.primary)).toBeLessThan(1.5)
    expect(contrastRatio(t.colors.accent, t.colors.primary)).toBeLessThan(1.5)
  })

  it("bloom 作为色板 preset 渲同一张几何，chapter 同样退让（自家 primary 上 1.04/1.55:1）", () => {
    const classroom = draw("classroom", coverSlide)
    const bloom = draw("bloom", coverSlide)
    // 几何逐字节同：把各自的 token 色替换成符号名之后应当完全一致。
    const strip = (markup: string, theme: string) => {
      const t = resolveStyle(theme)
      return markup.split(t.colors.muted).join("<muted>").split(t.colors.accent).join("<accent>")
    }
    expect(strip(bloom.markup, "bloom")).toBe(strip(classroom.markup, "classroom"))
    expect(bloom.markup).not.toBe(classroom.markup)
    const t = resolveStyle("bloom")
    expect(contrastRatio(t.colors.muted, t.colors.primary)).toBeLessThan(1.5)
    expect(contrastRatio(t.colors.accent, t.colors.primary)).toBeLessThan(2)
    expect(draw("bloom", chapterSlide).root.children).toHaveLength(0)
  })

  it("颜色一律读 token：孔与虚线走 muted（铅笔灰），回形针走 accent（陶土红）", () => {
    const t = resolveStyle("classroom")
    const { root } = draw("classroom", coverSlide)
    for (const c of Array.from(root.querySelectorAll("circle"))) {
      expect(c.getAttribute("stroke")).toBe(t.colors.muted)
      expect(c.getAttribute("fill")).toBe("none")
      expect(c.getAttribute("stroke-width")).toBe("1.2")
    }
    const pencil = root.querySelector("line")!
    expect(pencil.getAttribute("stroke")).toBe(t.colors.muted)
    expect(pencil.getAttribute("stroke-dasharray")).toBe("10 8")
    const clip = root.querySelector("path")!
    expect(clip.getAttribute("stroke")).toBe(t.colors.accent)
    expect(clip.getAttribute("fill")).toBe("none")
  })

  it("画笔属性写在叶子上，不挂 <g>——导出侧只读叶子自己的 fill/stroke", () => {
    const { root } = draw("classroom", coverSlide)
    for (const g of Array.from(root.querySelectorAll("g"))) {
      for (const attr of ["fill", "stroke", "opacity", "stroke-width"]) {
        expect(g.getAttribute(attr), `<g> carries ${attr}, which svg2pptx drops`).toBeNull()
      }
    }
    for (const el of Array.from(root.querySelectorAll("circle, line, path"))) {
      expect(el.getAttribute("stroke"), `${el.tagName} has no own stroke`).toBeTruthy()
    }
  })

  it("motif 不读 chartPalette——图表调色板轮转改不动它一个字节（v1 按下标解构四色）", () => {
    const tokens = resolveStyle("classroom")
    const markups = new Set(
      tokens.colors.chartPalette.map((_, offset) =>
        renderSvgMarkup(
          <ClassroomMotif
            ir={ir("classroom")}
            slide={coverSlide}
            ctx={buildCtx(tokens, {}, undefined, undefined, undefined, offset)}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
    // 四色里前两格与 primary/accent 同值（板上「chart 即莫兰迪装饰四色」），
    // 所以「不含 chartPalette」这句话没法按字面写。真正要钉的是：只属于图表
    // 的那两格（鼠尾草 / 砂黄）在装饰里一次都不出现。
    const chartOnly = tokens.colors.chartPalette.filter(
      (c) => c !== tokens.colors.primary && c !== tokens.colors.accent && c !== tokens.colors.muted,
    )
    expect(chartOnly.length).toBeGreaterThan(0)
    const markup = renderSvgMarkup(
      <ClassroomMotif ir={ir("classroom")} slide={coverSlide} ctx={buildCtx(tokens, {})} />,
    )
    for (const hex of chartOnly) expect(markup, `chart-only ${hex} painted by the motif`).not.toContain(hex)
  })

  it("装订孔几何：12 枚，cx = 118 + i*96，cy24 r6", () => {
    const { root } = draw("classroom", coverSlide)
    const holes = Array.from(root.querySelectorAll("circle")).map((c) => [num(c, "cx"), num(c, "cy"), num(c, "r")])
    expect(holes).toEqual(Array.from({ length: 12 }, (_, i) => [118 + i * 96, 24, 6]))
  })

  it("铅笔虚线几何：x96→420 的一段，落在页缘 y712（板上的 y640 压着共享脚注行）", () => {
    const { root } = draw("classroom", coverSlide)
    const l = root.querySelector("line")!
    expect([num(l, "x1"), num(l, "y1"), num(l, "x2"), num(l, "y2")]).toEqual([96, 712, 420, 712])
    // 板上原值就是踩坑的那个值，钉在这里免得有人「改回板上」。
    expect(num(l, "y1")).not.toBe(640)
  })

  it("回形针几何：包围盒 x1181-1230 / y6-32（板上 y18-44，与两个 chapter 版式的引首重叠）", () => {
    const { root } = draw("classroom", coverSlide)
    const clip = inkBoxes(root).find((b) => b.label === "paperclip")!.box
    expect(clip.x0).toBeCloseTo(1180.25, 2)
    expect(clip.x1).toBeCloseTo(1230.75, 2)
    expect(clip.y0).toBeCloseTo(5.25, 2)
    expect(clip.y1).toBeCloseTo(32.75, 2)
  })

  /** 安全区守卫：板上四条红虚线 + 四个 logo 位 + 实测排字外沿，逐件量。 */
  it("安全区：三件装饰都不进板上四条红虚线禁区", () => {
    const { root } = draw("classroom", coverSlide)
    for (const { label, box } of inkBoxes(root)) {
      for (const [name, zone] of Object.entries(BOARD_ZONES)) {
        expect(intersects(box, zone), `${label} enters the ${name} zone`).toBe(false)
      }
    }
  })

  it("安全区：三件装饰都不进 brand-chrome 的四个 logo 位（tl/tr/bl/br）", () => {
    const { root } = draw("classroom", coverSlide)
    for (const { label, box } of inkBoxes(root)) {
      for (const zone of LOGO_BOXES) {
        expect(intersects(box, zone), `${label} enters the logo box at ${zone.x},${zone.y}`).toBe(false)
      }
    }
  })

  it("安全区：三件装饰全部落在实测排字外沿之外（y<34 / y>708.6 / x<56 / x>1224 四条边）", () => {
    const { root } = draw("classroom", coverSlide)
    for (const { label, box } of inkBoxes(root)) {
      const outside =
        box.y1 <= TEXT_ENVELOPE.top ||
        box.y0 >= TEXT_ENVELOPE.bottom ||
        box.x1 <= TEXT_ENVELOPE.left ||
        box.x0 >= TEXT_ENVELOPE.right
      expect(outside, `${label} sits inside the measured text envelope: ${JSON.stringify(box)}`).toBe(true)
    }
  })

  it("不画任何左竖条", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("classroom", slide)
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        expect(num(r, "width") < 40 && num(r, "height") > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
      }
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
        expect(vertical, `vertical bar rendered: ${l.outerHTML}`).toBe(false)
      }
    }
  })

  it("换一家 tokens 渲染时颜色跟着换，classroom 的色一处不残留（零 hex 纪律的实证）", () => {
    const academic = resolveStyle("academic")
    const ctx = buildCtx(academic, {})
    const { markup } = render(<ClassroomMotif ir={ir("academic")} slide={coverSlide} ctx={ctx} />)
    expect(markup).toContain(academic.colors.muted)
    for (const hex of ["#ECF0F2", "#F9FBFC", "#4A6B8A", "#B96A5E", "#23282E", "#5A6470", "#D3DBE0"]) {
      expect(markup, `classroom token ${hex} leaked into the academic render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变（v1 的三档 seed 变体已删）", () => {
    const ctx = buildCtx(resolveStyle("classroom"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <ClassroomMotif ir={{ ...ir("classroom"), filename: `probe-${i}.pptx` } as PptxIR} slide={coverSlide} ctx={ctx} />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("Decor body passes subset validation", () => {
    for (const slide of [...DRAWN_SLIDES, chapterSlide]) {
      expect(() => assertSubset(draw("classroom", slide).root)).not.toThrow()
    }
  })
})
