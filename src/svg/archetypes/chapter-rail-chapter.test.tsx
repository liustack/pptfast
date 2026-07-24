// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { assertSubset } from "../subset-validate"
import { RailChapter } from "./chapter-rail-chapter"
import type { PptxIR, Slide } from "@/ir"

// W4 fix round: RailChapter's heading/subheading now adapt to
// `ctx.defaultBg` (readableOn) instead of a hardcoded white — every ctx in
// this file must carry the theme's *true* chapter default background, not
// `buildCtx`'s own `colors.bg` fallback (wrong for academic, whose
// `defaultBackgrounds.chapter` is a distinct dark green, not its light
// `colors.bg`; see this file's own archetype header for the same
// per-theme fact about classroom/consulting).
function chapterCtx(themeId: string) {
  const tokens = resolveStyle(themeId)
  return buildCtx(tokens, {}, undefined, resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface))
}

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// Deck with two chapter slides (separated by a content slide) so
// `chapterNumberFor`/`totalChapters` have something to derive from — index 0
// is chapter "01", index 2 is chapter "02" out of 2 total chapters (drives
// the horizontal progress dot row's track + node position).
const chapter1: Slide = { type: "chapter", heading: "第一部分：研究背景", components: [] } as Slide
const content: Slide = { type: "content", heading: "现状", components: [] } as Slide
const chapter2: Slide = {
  type: "chapter",
  heading: "第二部分：方法与证据",
  subheading: "面向可复现的实证研究",
  components: [],
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

// Literal markup fixed from `templates/academic.tsx`'s `BCGEmeraldChapter`
// under academic tokens (captured once, pre-templates-deletion, via a
// throwaway render — see task report) — this is what `toBe(legacy)` used to
// assert at runtime. Fixating it here keeps the same byte-for-byte assertion
// strength without importing the (soon-to-be-deleted) templates/ module.
const EXPECTED_CHAPTER1 =
  '<text x="1224" y="650" font-family="Georgia, Songti SC, STSong, serif" font-size="260" font-weight="700" fill="#FFFFFF" opacity="0.06" text-anchor="end" dominant-baseline="alphabetic">01</text><text x="640" y="392" font-family="Georgia, Songti SC, STSong, serif" font-size="84" font-weight="600" fill="#FFFFFF" text-anchor="middle" dominant-baseline="alphabetic">第一部分：研究背景</text><line x1="620" y1="600" x2="660" y2="600" stroke="#FFFFFF" stroke-opacity="0.3" stroke-width="1.6"></line><circle cx="620" cy="600" r="7" fill="#FFFFFF" fill-opacity="1"></circle><circle cx="660" cy="600" r="5" fill="#FFFFFF" fill-opacity="0.35"></circle>'
const EXPECTED_CHAPTER2 =
  '<text x="1224" y="650" font-family="Georgia, Songti SC, STSong, serif" font-size="260" font-weight="700" fill="#FFFFFF" opacity="0.06" text-anchor="end" dominant-baseline="alphabetic">02</text><text x="640" y="392" font-family="Georgia, Songti SC, STSong, serif" font-size="84" font-weight="600" fill="#FFFFFF" text-anchor="middle" dominant-baseline="alphabetic">第二部分：方法与证据</text><text x="640" y="438" font-family="Georgia, Songti SC, STSong, serif" font-size="34" fill="#FFFFFF" opacity="0.7" text-anchor="middle" font-style="italic" dominant-baseline="alphabetic">面向可复现的实证研究</text><line x1="620" y1="600" x2="660" y2="600" stroke="#FFFFFF" stroke-opacity="0.3" stroke-width="1.6"></line><circle cx="620" cy="600" r="5" fill="#FFFFFF" fill-opacity="0.35"></circle><circle cx="660" cy="600" r="7" fill="#FFFFFF" fill-opacity="1"></circle>'

describe("RailChapter", () => {
  it("academic tokens 下输出与迁移前的 BCGEmeraldChapter 逐字节一致（档位一，含多 chapter 序号）", () => {
    const ctx = chapterCtx("academic")
    const deck = ir("academic")

    const next1 = renderSvgMarkup(<RailChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />)
    expect(next1).toBe(EXPECTED_CHAPTER1)
    expect(next1).toContain(">01<")

    const next2 = renderSvgMarkup(<RailChapter ir={deck} slide={chapter2} index={2} ctx={ctx} />)
    expect(next2).toBe(EXPECTED_CHAPTER2)
    expect(next2).toContain(">02<")
  })

  it("章节标题过长时收缩到 <=2 行、字号落在 [40,84) 区间，不整段输出原文（迁移自 academic.test.tsx 的 Chapter 长标题分支）", () => {
    const ctx = chapterCtx("academic")
    const slide: Slide = { type: "chapter", heading: CJK_LONG, subheading: CJK_LONG, components: [] } as Slide
    const doc: PptxIR = {
      version: "3",
      filename: "x.pptx",
      theme: { id: "academic" },
      meta: {},
      assets: { images: {} },
      slides: [slide],
    } as unknown as PptxIR
    const markup = renderSvgMarkup(<RailChapter ir={doc} slide={slide} index={0} ctx={ctx} />)
    const root = parseSvgRoot(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${markup}</svg>`,
    )
    expect(() => assertSubset(root)).not.toThrow()

    const headingTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => (t.textContent ?? "").includes("微服务") && t.getAttribute("font-weight") === "600",
    )
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    for (const t of headingTexts) {
      const fontSize = Number(t.getAttribute("font-size"))
      expect(fontSize).toBeLessThan(84)
      expect(fontSize).toBeGreaterThanOrEqual(40)
    }
    expect(headingTexts.every((t) => t.textContent !== CJK_LONG)).toBe(true)
  })

  it("tech tokens 下白字例外跨主题稳定（不被 tech 的 colors.surface/primary 替换——见文件头'逐字节陷阱'说明）", () => {
    const techTheme = resolveStyle("tech")
    const ctx = buildCtx(techTheme, {})
    const deck = ir("tech")
    const out = renderSvgMarkup(<RailChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />)

    // 白字例外：固定纯白，不随主题变化
    expect(out).toContain('fill="#FFFFFF"')
    // tech 的 surface 是深色（#0A101C），若被误映射会让文字在深色背景上隐形
    expect(ctx.colors.surface).not.toBe("#FFFFFF")
    expect(out).not.toContain(ctx.colors.surface as string)
    // academic 自己的烤死色不得残留（本函数本就不消费 ctx.colors，属于回归锁）
    expect(out).not.toContain("#006A4E")
    // ctx 确实按主题切换生效：heading 字体走 tech 的解析结果，不是写死的 academic 字体
    expect(out).toContain(`font-family="${ctx.fonts.heading}"`)

    // 结构性锚点：进度轨道 + 章节序号水印仍然存在
    expect(out).toContain(">01<")
  })

  it("W4 fix round Critical C1：runway/enterprise 的 chapter 默认背景是纯白，标题/副标题不再是不可见的白字压白底", () => {
    for (const themeId of ["runway", "enterprise"] as const) {
      const ctx = chapterCtx(themeId)
      // Both themes' defaultBackgrounds.chapter is literal #FFFFFF — assert
      // that's still true (the fix's premise) before asserting the fix's
      // effect, so a future token edit can't silently invalidate this test.
      expect(ctx.defaultBg).toBe("#FFFFFF")
      const deck = ir(themeId)
      const root = parseSvgRoot(
        `<svg xmlns="http://www.w3.org/2000/svg">${renderSvgMarkup(<RailChapter ir={deck} slide={chapter2} index={2} ctx={ctx} />)}</svg>`,
      )
      // Pre-fix this was a hardcoded "#FFFFFF" heading/subheading on a
      // #FFFFFF background — precisely the Critical C1 finding (1.00:1,
      // functionally invisible). Now both resolve to the neutral dark ink —
      // asserted directly off the heading/subheading elements themselves
      // (not a markup substring check), since the watermark/dots
      // legitimately keep literal white regardless (low opacity/non-text,
      // out of this fix's scope — see file header).
      const heading = Array.from(root.querySelectorAll("text")).find((t) =>
        (t.textContent ?? "").includes("第二部分：方法与证据"),
      )!
      const subheading = Array.from(root.querySelectorAll("text")).find((t) =>
        (t.textContent ?? "").includes("面向可复现的实证研究"),
      )!
      expect(heading.getAttribute("fill")).toBe("#0A0E14")
      expect(subheading.getAttribute("fill")).toBe("#0A0E14")
    }
  })
})
