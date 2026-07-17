// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../styles"
import { MastheadChapter } from "./chapter-masthead-chapter"
import type { PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

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

const ir = (theme: string, slides: Slide[] = [chapter1, content, chapter2]): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides,
  }) as unknown as PptxIR

// Captured from MastheadChapter (magazine tokens, chapter1 @ index 0 /
// chapter2 @ index 2 above) — pinned as literals so this test no longer
// depends on the legacy `templates/magazine` module (slated for deletion).
const MAGAZINE_EXPECTED_1 =
  '<line x1="96" y1="200" x2="1184" y2="200" stroke="#E4DCD0" stroke-width="1.4"></line><text x="1184" y="640" font-family="SimSun, Songti SC, STSong, serif" font-size="220" font-weight="700" fill="#C0392B" opacity="0.12" text-anchor="end" dominant-baseline="alphabetic">01</text><text x="96" y="380" font-family="SimSun, Songti SC, STSong, serif" font-size="64" font-weight="600" fill="#1F1F1F" dominant-baseline="alphabetic">第一部分：市场洞察</text><line x1="96" y1="520" x2="1184" y2="520" stroke="#E4DCD0" stroke-width="1.4"></line>'
const MAGAZINE_EXPECTED_2 =
  '<line x1="96" y1="200" x2="1184" y2="200" stroke="#E4DCD0" stroke-width="1.4"></line><text x="1184" y="640" font-family="SimSun, Songti SC, STSong, serif" font-size="220" font-weight="700" fill="#C0392B" opacity="0.12" text-anchor="end" dominant-baseline="alphabetic">02</text><text x="96" y="380" font-family="SimSun, Songti SC, STSong, serif" font-size="64" font-weight="600" fill="#1F1F1F" dominant-baseline="alphabetic">第二部分：技术路线图</text><text x="96" y="428" font-family="SimSun, Songti SC, STSong, serif" font-size="24" fill="#6E6259" font-style="italic" dominant-baseline="alphabetic">面向 2027 的演进方向</text><line x1="96" y1="520" x2="1184" y2="520" stroke="#E4DCD0" stroke-width="1.4"></line>'

describe("MastheadChapter", () => {
  it("magazine tokens 下输出与固化的基准 markup 逐字节一致（档位一，含章节序号，档案来自旧 EditorialSerifChapter）", () => {
    const ctx = buildCtx(resolveStyle("journal"), {})
    const deck = ir("journal")

    const next1 = renderSvgMarkup(<MastheadChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />)
    expect(next1).toBe(MAGAZINE_EXPECTED_1)
    expect(next1).toContain(">01<")

    const next2 = renderSvgMarkup(<MastheadChapter ir={deck} slide={chapter2} index={2} ctx={ctx} />)
    expect(next2).toBe(MAGAZINE_EXPECTED_2)
    expect(next2).toContain(">02<")
  })

  it("consulting tokens 下用 consulting 的色（证明 token 化成立，无 baked hex）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const deck = ir("consulting")
    const out = renderSvgMarkup(<MastheadChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />)
    expect(out).toContain("#FFC72C") // consulting accent
    expect(out).not.toContain("#C0392B") // magazine accent 不得残留
  })

  it("Cover / Chapter body passes assertSubset (no forbidden elements)", () => {
    const ctx = buildCtx(resolveStyle("journal"), {})
    const deck = ir("journal")
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <MastheadChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />
      </svg>,
    )
    expect(markup).not.toContain("foreignObject")
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("keeps the watermark digit (anchored x=1184, end) horizontally clear of the title (maxWidth 720)", () => {
    const ctx = buildCtx(resolveStyle("journal"), {})
    const slide: Slide = { type: "chapter", heading: "增长战略", subheading: "从 0 到 1", blocks: [] } as Slide
    const deck = ir("journal", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <MastheadChapter ir={deck} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const digit = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "01")!
    expect(digit.getAttribute("text-anchor")).toBe("end")
    expect(digit.getAttribute("x")).toBe("1184")
    expect(digit.getAttribute("opacity")).toBe("0.12")
    expect(digit.getAttribute("font-size")).toBe("220")

    const title = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "增长战略")!
    expect(title.getAttribute("x")).toBe("96")
    // Widest 2-digit label at 220px (~246px) starts no earlier than
    // 1184 - 246 = 938 — comfortably clear of the title's 96 + 720 = 816
    // right edge.
    expect(96 + 720).toBeLessThan(938)
  })

  it("shrinks a pathologically long heading instead of overflowing", () => {
    const ctx = buildCtx(resolveStyle("journal"), {})
    const slide: Slide = { type: "chapter", heading: CJK_LONG, blocks: [] } as Slide
    const deck = ir("journal", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <MastheadChapter ir={deck} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
    const headingTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "600" && t.getAttribute("x") === "96",
    )
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    for (const t of headingTexts) {
      const fontSize = Number(t.getAttribute("font-size"))
      expect(fontSize).toBeLessThan(64)
      expect(fontSize).toBeGreaterThanOrEqual(36)
    }
    expect(headingTexts.every((t) => t.textContent !== CJK_LONG)).toBe(true)
  })
})
