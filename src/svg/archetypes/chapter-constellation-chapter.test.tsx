// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../styles"
import { ConstellationChapter } from "./chapter-constellation-chapter"
import type { PptxIR, Slide } from "@/ir"

// Deck with two chapter slides (separated by a content slide) so
// `chapterNumberFor` has something to derive — index 0 is chapter "01",
// index 2 is chapter "02".
const chapter1: Slide = { type: "chapter", heading: "第一部分：市场洞察", blocks: [] } as Slide
const content: Slide = { type: "content", heading: "现状", blocks: [] } as Slide
const chapter2: Slide = {
  type: "chapter",
  heading: "第二部分：技术路线图",
  subheading: "面向 2027 的演进方向",
  blocks: [],
} as Slide

const ir = (theme: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides: [chapter1, content, chapter2],
  }) as unknown as PptxIR

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// Captured once from the (now-retired) legacy `BentoTechChapter` — locks the
// byte-identical output the port preserved, without importing templates/.
const CHAPTER_TECH_1_MARKUP =
  '<text x="96" y="400" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="160" font-weight="700" fill="#2DD4E6" dominant-baseline="alphabetic">01</text><text x="320" y="392" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="56" font-weight="600" fill="#F2F6FA" dominant-baseline="alphabetic">第一部分：市场洞察</text><line x1="96" y1="560" x2="1184" y2="560" stroke="#2C3140" stroke-width="1.4"></line>'
const CHAPTER_TECH_2_MARKUP =
  '<text x="96" y="400" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="160" font-weight="700" fill="#2DD4E6" dominant-baseline="alphabetic">02</text><text x="320" y="392" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="56" font-weight="600" fill="#F2F6FA" dominant-baseline="alphabetic">第二部分：技术路线图</text><text x="320" y="448" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="26" fill="#8A94A6" dominant-baseline="alphabetic">面向 2027 的演进方向</text><line x1="96" y1="560" x2="1184" y2="560" stroke="#2C3140" stroke-width="1.4"></line>'

describe("ConstellationChapter", () => {
  it("tech tokens 下与旧 BentoTechChapter 输出逐字节一致（档位一，含章节序号）", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const deck = ir("tech")

    const next1 = renderSvgMarkup(
      <ConstellationChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />,
    )
    expect(next1).toBe(CHAPTER_TECH_1_MARKUP)
    expect(next1).toContain(">01<")

    const next2 = renderSvgMarkup(
      <ConstellationChapter ir={deck} slide={chapter2} index={2} ctx={ctx} />,
    )
    expect(next2).toBe(CHAPTER_TECH_2_MARKUP)
    expect(next2).toContain(">02<")
  })

  it("consulting tokens 下用 consulting 的色（证明 token 化成立，无 baked hex）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const deck = ir("consulting")
    const out = renderSvgMarkup(
      <ConstellationChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />,
    )
    expect(out).toContain("#FFC72C") // consulting accent
    expect(out).not.toContain("#2DD4E6") // tech accent 不得残留
  })

  it("renders markup that passes assertSubset (no forbidden elements)", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const deck = ir("tech")
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <ConstellationChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />
      </svg>,
    )
    expect(markup).not.toContain("foreignObject")
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("separates the accent-colored number (x=96) from the title (x=320) with no horizontal overlap", () => {
    const slide: Slide = {
      type: "chapter",
      heading: "增长战略",
      subheading: "从 0 到 1",
      blocks: [],
    } as Slide
    // Single-chapter deck so chapterNumberFor derives "01" unambiguously.
    const soloDeck: PptxIR = { ...ir("tech"), slides: [slide] }
    const ctx = buildCtx(resolveStyle("tech"), {})
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <ConstellationChapter ir={soloDeck} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const number = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "01")!
    const title = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "增长战略")!
    expect(number.getAttribute("x")).toBe("96")
    expect(title.getAttribute("x")).toBe("320")
    // "08" at 160px is the widest 2-digit label (~2 * 0.56 * 160 ≈ 180px) —
    // 96 + 180 = 276 stays clear of the title's x=320 start.
    expect(Number(number.getAttribute("x")) + 180).toBeLessThan(Number(title.getAttribute("x")))
  })

  it("shrinks a pathologically long heading instead of overflowing", () => {
    const slide: Slide = { type: "chapter", heading: CJK_LONG, blocks: [] } as Slide
    const deck: PptxIR = { ...ir("tech"), slides: [slide] }
    const ctx = buildCtx(resolveStyle("tech"), {})
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <ConstellationChapter ir={deck} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
    // Heading lines are font-weight 600 at x=320 (see the previous test).
    const headingTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "600" && t.getAttribute("x") === "320",
    )
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    for (const t of headingTexts) {
      const fontSize = Number(t.getAttribute("font-size"))
      expect(fontSize).toBeLessThan(56)
      expect(fontSize).toBeGreaterThanOrEqual(28)
    }
    expect(headingTexts.every((t) => t.textContent !== CJK_LONG)).toBe(true)
  })
})
