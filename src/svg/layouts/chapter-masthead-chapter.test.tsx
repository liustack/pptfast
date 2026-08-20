// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { MastheadChapter } from "./chapter-masthead-chapter"
import type { PptxIR, Slide } from "@/ir"

// W4 fix round: MastheadChapter's heading/subheading now adapt to
// `ctx.defaultBg` (accessibleInk) — a ctx built without the theme's *true*
// chapter default background (consulting's is a distinct dark navy, not its
// light colors.bg) can't exercise that path. See chapter-rail-chapter.test.tsx's
// own `chapterCtx` helper for the same pattern.
function chapterCtx(themeId: string) {
  const tokens = resolveStyle(themeId)
  return buildCtx(tokens, {}, undefined, resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface))
}

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// Deck with two chapter slides (separated by a content slide) so
// `chapterNumberFor` has something to derive — index 0 is chapter "01",
// index 2 is chapter "02".
const chapter1: Slide = { type: "chapter", heading: "第一部分：市场洞察", components: [] } as Slide
const content: Slide = { type: "content", heading: "现状", components: [] } as Slide
const chapter2: Slide = {
  type: "chapter",
  heading: "第二部分：技术路线图",
  subheading: "面向 2027 的演进方向",
  components: [],
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
  '<line x1="96" y1="200" x2="1184" y2="200" stroke="#D9D3C2" stroke-width="1.4"></line><text x="1184" y="640" font-family="SimSun, Songti SC, STSong, serif" font-size="220" font-weight="700" fill="#8C4A3C" opacity="0.12" text-anchor="end" dominant-baseline="alphabetic">01</text><text x="96" y="380" font-family="SimSun, Songti SC, STSong, serif" font-size="64" font-weight="600" fill="#26261F" dominant-baseline="alphabetic">第一部分：市场洞察</text><line x1="96" y1="520" x2="1184" y2="520" stroke="#D9D3C2" stroke-width="1.4"></line>'
const MAGAZINE_EXPECTED_2 =
  '<line x1="96" y1="200" x2="1184" y2="200" stroke="#D9D3C2" stroke-width="1.4"></line><text x="1184" y="640" font-family="SimSun, Songti SC, STSong, serif" font-size="220" font-weight="700" fill="#8C4A3C" opacity="0.12" text-anchor="end" dominant-baseline="alphabetic">02</text><text x="96" y="380" font-family="SimSun, Songti SC, STSong, serif" font-size="64" font-weight="600" fill="#26261F" dominant-baseline="alphabetic">第二部分：技术路线图</text><text x="96" y="428" font-family="SimSun, Songti SC, STSong, serif" font-size="24" fill="#626159" font-style="italic" dominant-baseline="alphabetic">面向 2027 的演进方向</text><line x1="96" y1="520" x2="1184" y2="520" stroke="#D9D3C2" stroke-width="1.4"></line>'

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
    expect(out).toContain("#F5C518") // consulting accent
    expect(out).not.toContain("#8C4A3C") // journal accent 不得残留
  })

  it("W4 fix round：consulting 的 colors.text/muted 压自己的 chapter 默认底都读不出来（1.18:1 / 2.24:1），标题与副标题双双退回反白（design decision 8 台账 #1）", () => {
    const ctx = chapterCtx("consulting")
    // 编辑组换血（2026-08-20）之前这里是「同色压同色」：text 与 chapter 底
    // 都是 #051C2C。换血把 text（#1C1E23）与 primary/chapter 底（#1E2A4A）
    // 拆成两个值，所以「撞色」这个说法不再字面成立——但两个都还是近黑压近
    // 藏青，实测 1.18:1，`accessibleInk` 照样退回反白，本条断言的结论不变。
    expect(ctx.defaultBg).toBe("#1E2A4A")
    expect(resolveStyle("consulting").colors.text).toBe("#1C1E23")

    const deck = ir("consulting")
    const root = parseSvgRoot(
      `<svg xmlns="http://www.w3.org/2000/svg">${renderSvgMarkup(<MastheadChapter ir={deck} slide={chapter2} index={2} ctx={ctx} />)}</svg>`,
    )
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("第二部分：技术路线图"),
    )!
    const subheading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("面向 2027 的演进方向"),
    )!
    // 标题退回 readableOn 的中性白（1.18:1，怎么都过不了）。副标题本轮
    // 起也退回反白：编辑组把纸面脚注灰压深（#6B6B6B → #5B6069）、chapter
    // 底提亮偏蓝（#051C2C → #1E2A4A），muted 压这块底从 3.26:1 掉到
    // 2.24:1，24px 副题的 3:1 大字门槛因此失守，`accessibleInk` 接手。
    // 这是本轮 consulting 在 chapter 上唯一一处观感变化，且是往可读的方向
    // 变——两个 token 各自为纸面而调，压满版藏青时由 accessibleInk 兜底，
    // 正是这个 helper 存在的理由。
    expect(heading.getAttribute("fill")).toBe("#FFFFFF")
    expect(subheading.getAttribute("fill")).toBe("#FFFFFF")
  })

  it("W4 fix round：journal（本文件唯一 pre-W4 策展主题）的标题/副标题保持 colors.text/colors.muted 原值不变（既有 pinned 渲染的逐字节不变性）", () => {
    const ctx = chapterCtx("journal")
    const journalTokens = resolveStyle("journal")
    const deck = ir("journal")
    const root = parseSvgRoot(
      `<svg xmlns="http://www.w3.org/2000/svg">${renderSvgMarkup(<MastheadChapter ir={deck} slide={chapter2} index={2} ctx={ctx} />)}</svg>`,
    )
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("第二部分：技术路线图"),
    )!
    const subheading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("面向 2027 的演进方向"),
    )!
    expect(heading.getAttribute("fill")).toBe(journalTokens.colors.text)
    expect(subheading.getAttribute("fill")).toBe(journalTokens.colors.muted)
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
    const slide: Slide = { type: "chapter", heading: "增长战略", subheading: "从 0 到 1", components: [] } as Slide
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
    const slide: Slide = { type: "chapter", heading: CJK_LONG, components: [] } as Slide
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
