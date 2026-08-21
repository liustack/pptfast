// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { PACING_BUDGETS } from "@/narrative"
import { PLAYBILL_TOKENS } from "../../themes/playbill"
import { PlaybillMotif, PLAYBILL_PATCH_D } from "./motif-playbill-motif"
import type { Component, PptxIR, Slide } from "@/ir"
import type { StyleTokens } from "../../themes/tokens"

const para = (text: string): Component => ({ type: "paragraph", text }) as Component
const slideOf = (type: Slide["type"], components: Component[] = [], heading = "标题"): Slide =>
  ({ type, heading, components }) as Slide

const coverSlide = slideOf("cover")
const chapterSlide = slideOf("chapter")
const contentSlide = slideOf("content")
const endingSlide = slideOf("ending", [], undefined as unknown as string)
const ALL_SLIDES = [coverSlide, chapterSlide, contentSlide, endingSlide]

const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
const FOOTER_ZONE = { x: 48, y: 664, w: 1184, h: 44 }
const BR_LOGO = { x: 1120, y: 630, w: 96, h: 40 }
const TR_LOGO = { x: 1120, y: 48, w: 96, h: 40 }
const FIFTH_BAND = { x: 0, y: 620, w: 1280, h: 44 }
const TITLE_RIGHT = 1136

const ir = (theme = "playbill", filename = "x.pptx"): PptxIR =>
  ({
    version: "3",
    filename,
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

function draw(slide: Slide, tokens: StyleTokens = PLAYBILL_TOKENS, filename?: string) {
  const ctx = buildCtx(tokens, {})
  return { ...render(<PlaybillMotif ir={ir(tokens.id, filename)} slide={slide} ctx={ctx} />), ctx }
}

type Box = { x0: number; y0: number; x1: number; y1: number }

const intersects = (b: Box, z: { x: number; y: number; w: number; h: number }) =>
  b.x0 < z.x + z.w && b.x1 > z.x && b.y0 < z.y + z.h && b.y1 > z.y

function pathBox(d: string): Box {
  const nums = d.match(/-?[\d.]+/g)!.map(Number)
  const xs = nums.filter((_, i) => i % 2 === 0)
  const ys = nums.filter((_, i) => i % 2 === 1)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/**
 * playbill-motif「右上黑贴片」（2026-08-21）。
 * 设计源：`scratchpad/theme-wave7/Playbill.dc.html`。板上大贴片是封面
 * layout 件，motif 版取小号、无字符。
 */
describe("PlaybillMotif（右上黑贴片）", () => {
  it("四页型都画且只画这一枚 path，几何逐字节相同", () => {
    const markups = new Set<string>()
    for (const slide of ALL_SLIDES) {
      const { root, markup } = draw(slide)
      expect(Array.from(root.querySelectorAll("path")), slide.type).toHaveLength(1)
      expect(root.querySelectorAll("line, rect, circle, text, polygon")).toHaveLength(0)
      markups.add(markup)
    }
    expect(markups.size).toBe(1)
  })

  it("贴片 path 几何钉死：88×32 绕 (1196,27) 顺时针 4°", () => {
    const { root } = draw(coverSlide)
    expect(root.querySelector("path")!.getAttribute("d")).toBe(PLAYBILL_PATCH_D)
    expect(PLAYBILL_PATCH_D).toBe("M 1151 14.1 L 1238.8 8 L 1241 39.9 L 1153.2 46 Z")
  })

  it("AABB 落在 x≥1150、y8-60 带内，躲开标题区右沿 x1136", () => {
    const box = pathBox(PLAYBILL_PATCH_D)
    expect(box.x0).toBeGreaterThanOrEqual(1150)
    expect(box.x1).toBeLessThanOrEqual(1280)
    expect(box.y0).toBeGreaterThanOrEqual(8)
    expect(box.y1).toBeLessThanOrEqual(60)
    expect(box.x0).toBeGreaterThan(TITLE_RIGHT)
    // 小号：板上大贴片从约 x960 起笔、宽约 200。motif 版宽应远小于那块。
    expect(box.x1 - box.x0).toBeLessThan(120)
  })

  it("贴片内无字符（板上日期字是封面 layout 件，不进 motif）", () => {
    const { root } = draw(coverSlide)
    expect(root.querySelectorAll("text")).toHaveLength(0)
  })

  it("不画板上那条 5px 粗收场线（第五带实色粗件禁入）", () => {
    const { root } = draw(coverSlide)
    expect(root.querySelectorAll("line, rect")).toHaveLength(0)
    const box = pathBox(root.querySelector("path")!.getAttribute("d")!)
    expect(intersects(box, FIFTH_BAND)).toBe(false)
  })

  it("填色走 token.primary，零 baked hex", () => {
    const { root } = draw(contentSlide)
    expect(root.querySelector("path")!.getAttribute("fill")).toBe(PLAYBILL_TOKENS.colors.primary)
  })

  it("换一家 tokens 渲染时颜色跟着换，playbill 的色一处不残留", () => {
    const heritage = resolveStyle("heritage")
    const ctx = buildCtx(heritage, {})
    const { markup } = render(<PlaybillMotif ir={ir("heritage")} slide={contentSlide} ctx={ctx} />)
    expect(markup).toContain(heritage.colors.primary)
    for (const hex of ["#F4DD1B", "#131313", "#6B5E4A", "#3D4248", "#8B6914", "#8C1810", "#7A5A18", "#3D5A32"]) {
      expect(markup, `playbill token ${hex} leaked into the heritage render`).not.toContain(hex)
    }
  })

  it("安全区：不进标题/正文/页脚/右下 logo/第五带，也不擦右上 logo 盒", () => {
    const box = pathBox(PLAYBILL_PATCH_D)
    for (const [name, zone] of Object.entries({
      title: TITLE_ZONE,
      body: BODY_ZONE,
      footer: FOOTER_ZONE,
      brLogo: BR_LOGO,
      trLogo: TR_LOGO,
      fifth: FIFTH_BAND,
    })) {
      expect(intersects(box, zone), `patch enters the ${name} zone: ${JSON.stringify(box)}`).toBe(false)
    }
  })

  describe("密页不降档（装饰只有一枚小贴片）", () => {
    const threshold = PACING_BUDGETS.dense.maxComponentsPerSlide
    const sparse = slideOf("content", Array.from({ length: threshold - 1 }, (_, i) => para(`第 ${i} 段`)))
    const dense = slideOf("content", Array.from({ length: threshold }, (_, i) => para(`第 ${i} 段`)))

    it("密页与疏页输出逐字节相同（没有降档开关可拨）", () => {
      expect(threshold).toBe(5)
      expect(draw(dense).markup).toBe(draw(sparse).markup)
      expect(draw(dense).root.querySelectorAll("path")).toHaveLength(1)
    })

    it("密页内容区 1040×420 内零装饰像素", () => {
      const box = pathBox(draw(dense).root.querySelector("path")!.getAttribute("d")!)
      expect(intersects(box, BODY_ZONE)).toBe(false)
    })

    it("同结构不同文案：输出逐字节相同（不读文字几何）", () => {
      const short = slideOf("content", [para("短")], "短")
      const long = slideOf(
        "content",
        [
          para(
            "这一段正文特意写得很长很长很长，长到足以把版式的自动缩字号与换行逻辑整个跑一遍。",
          ),
        ],
        "这是一个长到会换行、会触发标题自动缩字号的超长标题",
      )
      expect(draw(long).markup).toBe(draw(short).markup)
    })
  })

  it("不用 rotate transform（导出侧明说旋转不在受控子集内，斜角写进 path）", () => {
    const { root } = draw(coverSlide)
    for (const el of Array.from(root.querySelectorAll("path, line, rect, g"))) {
      expect(el.getAttribute("transform"), `${el.tagName} carries a transform`).toBeNull()
    }
  })

  it("画笔属性写在叶子上，不挂 <g>", () => {
    const { root } = draw(coverSlide)
    for (const g of Array.from(root.querySelectorAll("g"))) {
      for (const attr of ["fill", "stroke", "opacity"]) {
        expect(g.getAttribute(attr), `<g> carries ${attr}, which svg2pptx drops`).toBeNull()
      }
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变", () => {
    const markups = new Set(Array.from({ length: 12 }, (_, i) => draw(coverSlide, PLAYBILL_TOKENS, `probe-${i}.pptx`).markup))
    expect(markups.size).toBe(1)
  })

  it("同一份 IR 两次渲染逐字节相同", () => {
    expect(draw(coverSlide).markup).toBe(draw(coverSlide).markup)
  })

  it("Decor body passes subset validation", () => {
    for (const slide of ALL_SLIDES) {
      expect(() => assertSubset(draw(slide).root)).not.toThrow()
    }
  })
})
