// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveFontFace, resolveFontStack } from "../fonts"
import { resolveStyle } from "../../themes"
import { THEME_DEFINITIONS } from "../../themes/definitions"
import { HeritageMotif } from "./motif-heritage-motif"
import { VermilionMotif } from "./motif-vermilion-motif"
import { MemoMotif } from "./motif-memo-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
const ALL_SLIDES = [coverSlide, chapterSlide, contentSlide, endingSlide]

const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
const FIFTH_BAND = { y: 620, h: 44 }
const LOGO_BOX_BR = { x: 1120, y: 630, w: 96, h: 40 }
const LOGO_BOX_TL = { x: 64, y: 48, w: 96, h: 40 }

const ir = (theme: string): PptxIR =>
  ({
    version: "4",
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
  return { ...render(<MemoMotif ir={ir(theme)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

function parts(root: Element) {
  const lines = Array.from(root.querySelectorAll("line"))
  const texts = Array.from(root.querySelectorAll("text"))
  return {
    thickRule: lines.find((l) => l.getAttribute("stroke-width") === "3")!,
    thinRule: lines.find((l) => l.getAttribute("stroke-width") === "1")!,
    eyebrow: texts.find((t) => t.textContent === "MEMORANDUM")!,
    lines,
    texts,
    rects: Array.from(root.querySelectorAll("rect")),
  }
}

describe("MemoMotif（打字机眉行）", () => {
  it("封面整片不画：公文头改由 memo-head 版式承担", () => {
    const { root } = draw("memo", coverSlide)
    expect(root.querySelectorAll("line")).toHaveLength(0)
    expect(root.querySelectorAll("text")).toHaveLength(0)
  })

  it("content 稀排钉 pin 整片退让，不和 statement 等脸的横线叠预算", () => {
    for (const layout of ["statement", "pull-quote", "stat-hero", "one-evidence", "mono-bleed"] as const) {
      const slide = { ...contentSlide, layout } as Slide
      const { root } = draw("memo", slide)
      expect(root.querySelectorAll("line"), layout).toHaveLength(0)
      expect(root.querySelectorAll("text"), layout).toHaveLength(0)
    }
    expect(parts(draw("memo", contentSlide).root).thickRule).toBeTruthy()
    expect(parts(draw("memo", chapterSlide).root).thickRule).toBeTruthy()
  })

  it("章节/内容/收尾仍画顶缘红双线 + MEMORANDUM 眉字", () => {
    for (const slide of [chapterSlide, contentSlide, endingSlide]) {
      const { root } = draw("memo", slide)
      const p = parts(root)
      expect(p.thickRule, `no thick rule on ${slide.type}`).toBeTruthy()
      expect(p.thinRule, `no thin rule on ${slide.type}`).toBeTruthy()
      expect(p.eyebrow, `no MEMORANDUM on ${slide.type}`).toBeTruthy()
    }
  })

  it("颜色一律读 token：双线与眉字走 accent", () => {
    const t = resolveStyle("memo")
    const { root } = draw("memo", contentSlide)
    const p = parts(root)
    expect(p.thickRule.getAttribute("stroke")).toBe(t.colors.accent)
    expect(p.thinRule.getAttribute("stroke")).toBe(t.colors.accent)
    expect(p.eyebrow.getAttribute("fill")).toBe(t.colors.accent)
  })

  it("换一家 tokens 渲染时颜色跟着换，memo 的色一处不残留", () => {
    const journal = resolveStyle("journal")
    const ctx = buildCtx(journal, {})
    const { markup } = render(<MemoMotif ir={ir("journal")} slide={contentSlide} ctx={ctx} />)
    expect(markup).toContain(journal.colors.accent)
    for (const hex of ["#F6F1E7", "#FBF8F1", "#A63A2B", "#675E51", "#E4DFD2"]) {
      expect(markup, `memo token ${hex} leaked into the journal render`).not.toContain(hex)
    }
  })

  it("顶缘双线几何：x48→1232，粗线 3px y26 / 细线 1px y32", () => {
    const { root } = draw("memo", contentSlide)
    const { thickRule, thinRule } = parts(root)
    for (const l of [thickRule, thinRule]) {
      expect(num(l, "x1")).toBe(48)
      expect(num(l, "x2")).toBe(1232)
    }
    expect(num(thickRule, "y1")).toBe(26)
    expect(num(thinRule, "y1")).toBe(32)
  })

  it("眉字是 MEMORANDUM，等宽、加粗、落在双线上方", () => {
    const t = resolveStyle("memo")
    const { root } = draw("memo", contentSlide)
    const { eyebrow } = parts(root)
    expect(eyebrow.textContent).toBe("MEMORANDUM")
    expect(eyebrow.getAttribute("font-family")).toBe(resolveFontStack(t.fonts.mono ?? [], "mono"))
    expect(resolveFontFace(t.fonts.mono ?? [], "mono")).toBe("Courier New")
    expect(Number(eyebrow.getAttribute("font-size"))).toBe(12)
    expect(eyebrow.getAttribute("font-weight")).toBe("700")
    expect(num(eyebrow, "x")).toBe(96)
    expect(num(eyebrow, "y")).toBe(20)
    expect(num(eyebrow, "y")).toBeLessThan(26)
  })

  it("印章红永不成面：不画任何 accent 填充的 rect", () => {
    for (const slide of ALL_SLIDES) {
      const t = resolveStyle("memo")
      const { root } = draw("memo", slide)
      const p = parts(root)
      expect(p.rects).toHaveLength(0)
      for (const el of Array.from(root.querySelectorAll("[fill]"))) {
        if (el.tagName.toLowerCase() === "text") continue
        expect(el.getAttribute("fill"), `filled shape in accent: ${el.outerHTML}`).not.toBe(t.colors.accent)
      }
    }
  })

  it("安全区：双线与眉字全在标题区上沿 y48 之上，不进第五带，不碰两个 logo 盒", () => {
    const { root } = draw("memo", contentSlide)
    const { thickRule, thinRule, eyebrow } = parts(root)
    expect(num(thickRule, "y1")).toBeLessThan(TITLE_ZONE.y)
    expect(num(thinRule, "y1")).toBeLessThan(TITLE_ZONE.y)
    expect(num(eyebrow, "y")).toBeLessThan(TITLE_ZONE.y)
    expect(num(eyebrow, "y")).toBeLessThan(LOGO_BOX_TL.y)
    for (const l of [thickRule, thinRule]) {
      expect(num(l, "y1")).toBeLessThan(FIFTH_BAND.y)
      expect(num(l, "y1")).not.toBeGreaterThanOrEqual(LOGO_BOX_BR.y)
    }
  })

  it("安全区：整幅装饰不进正文区（y200-620 一件不落）", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("memo", slide)
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const y = Math.max(num(l, "y1"), num(l, "y2"))
        expect(y < BODY_ZONE.y || y > BODY_ZONE.y + BODY_ZONE.h, `line inside the body zone: ${l.outerHTML}`).toBe(true)
      }
    }
  })

  it("不画任何左竖条", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("memo", slide)
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
        expect(vertical, `vertical bar rendered: ${l.outerHTML}`).toBe(false)
      }
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变", () => {
    const ctx = buildCtx(resolveStyle("memo"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <MemoMotif ir={{ ...ir("memo"), filename: `probe-${i}.pptx` } as PptxIR} slide={coverSlide} ctx={ctx} />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("Decor body passes subset validation", () => {
    for (const slide of ALL_SLIDES) {
      expect(() => assertSubset(draw("memo", slide).root)).not.toThrow()
    }
  })
})

describe("memo vs heritage vs vermilion（字族用法分家）", () => {
  it("三家顶缘双线不是同一张几何：memo 3px@y26，heritage 2px@y28，vermilion 金线 2px@y22", () => {
    const memo = parts(draw("memo", contentSlide).root)
    const heritageCtx = buildCtx(resolveStyle("heritage"), {})
    const vermilionCtx = buildCtx(resolveStyle("vermilion"), {})
    const heritageRoot = render(<HeritageMotif ir={ir("heritage")} slide={coverSlide} ctx={heritageCtx} />).root
    const vermilionRoot = render(<VermilionMotif ir={ir("vermilion")} slide={coverSlide} ctx={vermilionCtx} />).root
    const heritageThick = Array.from(heritageRoot.querySelectorAll("line")).find((l) => l.getAttribute("stroke-width") === "2")!
    const vermilionThick = Array.from(vermilionRoot.querySelectorAll("line")).find((l) => l.getAttribute("stroke-width") === "2")!

    expect(num(memo.thickRule, "y1")).toBe(26)
    expect(memo.thickRule.getAttribute("stroke-width")).toBe("3")
    expect(num(heritageThick, "y1")).toBe(28)
    expect(heritageThick.getAttribute("stroke-width")).toBe("2")
    expect(num(vermilionThick, "y1")).toBe(22)
    expect(vermilionThick.getAttribute("stroke")).toBe(resolveStyle("vermilion").colors.accent)
    expect(memo.thickRule.getAttribute("stroke")).toBe(resolveStyle("memo").colors.accent)
    expect(memo.thickRule.getAttribute("stroke")).not.toBe(heritageThick.getAttribute("stroke"))
  })

  it("只有 memo 在顶缘写下 MEMORANDUM，heritage 是角花，vermilion chapter 整页退让", () => {
    expect(parts(draw("memo", contentSlide).root).eyebrow).toBeTruthy()
    const heritageCtx = buildCtx(resolveStyle("heritage"), {})
    const heritageRoot = render(<HeritageMotif ir={ir("heritage")} slide={coverSlide} ctx={heritageCtx} />).root
    expect(heritageRoot.querySelector("text")).toBeNull()
    expect(Array.from(heritageRoot.querySelectorAll("rect")).length).toBeGreaterThan(0)

    const vermilionChapter = render(
      <VermilionMotif ir={ir("vermilion")} slide={chapterSlide} ctx={buildCtx(resolveStyle("vermilion"), {})} />,
    ).root
    expect(vermilionChapter.querySelector("line")).toBeNull()
    expect(parts(draw("memo", chapterSlide).root).thickRule).toBeTruthy()
  })

  it("branding 仍归 deck 声明：主题定义不绑定 branding", () => {
    expect(THEME_DEFINITIONS.memo.brand).toEqual({})
    expect(THEME_DEFINITIONS.memo).not.toHaveProperty("branding")
  })
})
