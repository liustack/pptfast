// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../themes"
import { BannerChapter } from "./chapter-banner-chapter"
import type { PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// Deck with two chapter slides (separated by a content slide) so
// `chapterNumberFor` has something to derive from — index 0 is chapter "01",
// index 2 is chapter "02" out of 2 total chapters.
const chapter1: Slide = { type: "chapter", heading: "第一章：市场洞察", blocks: [] } as Slide
const content: Slide = { type: "content", heading: "现状", blocks: [] } as Slide
const chapter2: Slide = {
  type: "chapter",
  heading: "第二章：战略选择与路径",
  subheading: "面向 2027 的三个决定",
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

// Captured verbatim from the legacy `MckinseyNavyChapter` (templates/consulting.tsx)
// for these exact fixtures before templates/ was deleted — see P2 Task 26
// dependency-break note (same pattern as cover-banner-title.test.tsx).
const LEGACY_CHAPTER1_MARKUP = `<text x="1224" y="650" font-family="Georgia, Songti SC, STSong, serif" font-size="260" font-weight="700" fill="#FFFFFF" opacity="0.05" text-anchor="end" dominant-baseline="alphabetic">01</text><text x="640" y="404" font-family="Georgia, Songti SC, STSong, serif" font-size="84" font-weight="600" fill="#FFFFFF" text-anchor="middle" dominant-baseline="alphabetic">第一章：市场洞察</text><line x1="560" y1="452" x2="720" y2="452" stroke="#FFC72C" stroke-width="1.6" opacity="0.6"></line>`
const LEGACY_CHAPTER2_MARKUP = `<text x="1224" y="650" font-family="Georgia, Songti SC, STSong, serif" font-size="260" font-weight="700" fill="#FFFFFF" opacity="0.05" text-anchor="end" dominant-baseline="alphabetic">02</text><text x="640" y="404" font-family="Georgia, Songti SC, STSong, serif" font-size="84" font-weight="600" fill="#FFFFFF" text-anchor="middle" dominant-baseline="alphabetic">第二章：战略选择与路径</text><text x="640" y="460" font-family="Georgia, Songti SC, STSong, serif" font-size="36" fill="#FFFFFF" opacity="0.7" text-anchor="middle" dominant-baseline="alphabetic">面向 2027 的三个决定</text><line x1="560" y1="452" x2="720" y2="452" stroke="#FFC72C" stroke-width="1.6" opacity="0.6"></line>`

describe("BannerChapter", () => {
  it("consulting tokens 下与旧 MckinseyNavyChapter 输出逐字节一致（档位一，含多 chapter 序号）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const deck = ir("consulting")

    const next1 = renderSvgMarkup(<BannerChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />)
    expect(next1).toBe(LEGACY_CHAPTER1_MARKUP)
    expect(next1).toContain(">01<")

    const next2 = renderSvgMarkup(<BannerChapter ir={deck} slide={chapter2} index={2} ctx={ctx} />)
    expect(next2).toBe(LEGACY_CHAPTER2_MARKUP)
    expect(next2).toContain(">02<")
  })

  // 回填旧测试「Chapter positions subheading/hairline off a fixed single-line
  // heading baseline」（旧文件 consulting.test.tsx L440-460）：单行标题时
  // headingY/subheadingY/hairlineY 的三个固定基线值。上面的逐字节测试已经
  // 隐含验证了这些数字（字面量里就是 404/460/452），这里显式断言，避免
  // 「值虽正确但没有可读断言」。
  it("单行标题时 heading/subheading/hairline 落在固定基线 y=404/460/452 上", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const deck = ir("consulting")
    const markup = renderSvgMarkup(<BannerChapter ir={deck} slide={chapter2} index={2} ctx={ctx} />)
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)

    const headingText = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("第二章：战略选择与路径"),
    )!
    expect(headingText.getAttribute("y")).toBe("404")
    const subheadingText = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("面向 2027 的三个决定"),
    )!
    expect(subheadingText.getAttribute("y")).toBe("460")
    const hairline = root.querySelector("line")!
    expect(hairline.getAttribute("y1")).toBe("452")
    expect(hairline.getAttribute("y2")).toBe("452")
  })

  // 回填旧测试「Chapter shrinks a pathologically long heading onto <=2 lines
  // instead of overflowing」（旧文件 consulting.test.tsx L347-371）：超长
  // heading 必须被压缩换行/缩字号，不能原样溢出。
  it("超长标题被压缩到 <=2 行且字号收缩（40-84px 之间），不会原样溢出", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const slide: Slide = { type: "chapter", heading: CJK_LONG, subheading: CJK_LONG, blocks: [] } as Slide
    const deck: PptxIR = {
      version: "3",
      filename: "x.pptx",
      theme: { id: "consulting" },
      meta: {},
      assets: { images: {} },
      slides: [slide],
    } as unknown as PptxIR
    const markup = renderSvgMarkup(<BannerChapter ir={deck} slide={slide} index={0} ctx={ctx} />)
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
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

  it("tech tokens 下用 tech 的 accent 色画装饰线，consulting 的烤死色不残留；白字例外跨主题稳定", () => {
    const techTheme = resolveStyle("tech")
    const ctx = buildCtx(techTheme, {})
    const deck = ir("tech")
    const out = renderSvgMarkup(<BannerChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />)

    // token 化成立：装饰线走 tech 的 accent，不是写死的 consulting YELLOW
    expect(out).toContain("#2DD4E6") // tech accent
    expect(out).not.toContain("#FFC72C") // consulting accent 不得残留
    expect(out).not.toContain("#051C2C") // consulting primary 不得残留

    // 白字例外：固定纯白，不随主题变化
    expect(out).toContain('fill="#FFFFFF"')
    // tech 的 surface 是深色，若误映射会让文字在深色背景上隐形
    expect(ctx.colors.surface).not.toBe("#FFFFFF")
    expect(out).not.toContain(String(ctx.colors.surface))

    // ctx 确实按主题切换：heading 字体走 tech 的解析结果
    expect(out).toContain(`font-family="${ctx.fonts.heading}"`)
    expect(out).toContain(">01<")
  })
})
