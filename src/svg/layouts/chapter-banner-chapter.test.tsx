// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { BannerChapter } from "./chapter-banner-chapter"
import type { PptxIR, Slide } from "@/ir"

// W4 fix round: BannerChapter's heading/subheading now adapt to
// `ctx.defaultBg` (readableOn) instead of a hardcoded white — every ctx in
// this file must carry the theme's *true* chapter default background, not
// `buildCtx`'s own `colors.bg` fallback (wrong for consulting, whose
// `defaultBackgrounds.chapter` is a distinct dark navy, not its light
// `colors.bg`; see `chapter-rail-chapter.tsx`'s file header for the same
// per-theme fact about academic/classroom).
function chapterCtx(themeId: string) {
  const tokens = resolveStyle(themeId)
  return buildCtx(tokens, {}, undefined, resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface))
}

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// Deck with two chapter slides (separated by a content slide) so
// `chapterNumberFor` has something to derive from — index 0 is chapter "01",
// index 2 is chapter "02" out of 2 total chapters.
const chapter1: Slide = { type: "chapter", heading: "第一章：市场洞察", components: [] } as Slide
const content: Slide = { type: "content", heading: "现状", components: [] } as Slide
const chapter2: Slide = {
  type: "chapter",
  heading: "第二章：战略选择与路径",
  subheading: "面向 2027 的三个决定",
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

// Captured verbatim from the legacy `MckinseyNavyChapter` (templates/consulting.tsx)
// for these exact fixtures before templates/ was deleted — see P2 Task 26
// dependency-break note (same pattern as cover-banner-title.test.tsx).
const LEGACY_CHAPTER1_MARKUP = `<text x="1224" y="650" font-family="Georgia, Songti SC, STSong, serif" font-size="260" font-weight="700" fill="#FFFFFF" opacity="0.05" text-anchor="end" dominant-baseline="alphabetic">01</text><text x="640" y="404" font-family="Georgia, Songti SC, STSong, serif" font-size="84" font-weight="600" fill="#FFFFFF" text-anchor="middle" dominant-baseline="alphabetic">第一章：市场洞察</text><line x1="560" y1="452" x2="720" y2="452" stroke="#F5C518" stroke-width="1.6" opacity="0.6"></line>`
const LEGACY_CHAPTER2_MARKUP = `<text x="1224" y="650" font-family="Georgia, Songti SC, STSong, serif" font-size="260" font-weight="700" fill="#FFFFFF" opacity="0.05" text-anchor="end" dominant-baseline="alphabetic">02</text><text x="640" y="404" font-family="Georgia, Songti SC, STSong, serif" font-size="84" font-weight="600" fill="#FFFFFF" text-anchor="middle" dominant-baseline="alphabetic">第二章：战略选择与路径</text><text x="640" y="460" font-family="Georgia, Songti SC, STSong, serif" font-size="36" fill="#FFFFFF" opacity="0.7" text-anchor="middle" dominant-baseline="alphabetic">面向 2027 的三个决定</text><line x1="560" y1="490" x2="720" y2="490" stroke="#F5C518" stroke-width="1.6" opacity="0.6"></line>`

// The accent rule is the one element that no longer matches the legacy
// render — it was a fixed 160px dash at `x1=560 x2=720`, and it is now an
// underline of the line the block ends with (see the layout's own comment
// for the two review rounds that got it here). Everything else — watermark,
// heading, subheading, and the rule's own stroke/opacity — is still expected
// byte-for-byte, so the equivalence test compares the markup with the rule
// element lifted out of both sides and asserts the new geometry separately.
const RULE_RE = /<line[^>]*><\/line>/
const withoutRule = (markup: string) => markup.replace(RULE_RE, "")
const ruleOf = (markup: string) => markup.match(RULE_RE)?.[0] ?? ""

describe("BannerChapter", () => {
  it("consulting tokens 下除装饰线外与旧 MckinseyNavyChapter 输出逐字节一致（档位一，含多 chapter 序号）", () => {
    const ctx = chapterCtx("consulting")
    const deck = ir("consulting")

    const next1 = renderSvgMarkup(<BannerChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />)
    expect(withoutRule(next1)).toBe(withoutRule(LEGACY_CHAPTER1_MARKUP))
    expect(next1).toContain(">01<")

    const next2 = renderSvgMarkup(<BannerChapter ir={deck} slide={chapter2} index={2} ctx={ctx} />)
    expect(withoutRule(next2)).toBe(withoutRule(LEGACY_CHAPTER2_MARKUP))
    expect(next2).toContain(">02<")

    // Same stroke, same opacity, same accent token as the legacy dash — only
    // its span and its baseline offset changed.
    for (const rule of [ruleOf(next1), ruleOf(next2)]) {
      expect(rule).toContain('stroke="#F5C518"')
      expect(rule).toContain('stroke-width="1.6"')
      expect(rule).toContain('opacity="0.6"')
    }
  })

  it("装饰线是它上面那行字的下划线：宽度随该行文本，落点随该行字号", () => {
    const ctx = chapterCtx("consulting")
    const deck = ir("consulting")
    const root = (slide: Slide, index: number) =>
      parseSvgRoot(
        `<svg xmlns="http://www.w3.org/2000/svg">${renderSvgMarkup(
          <BannerChapter ir={deck} slide={slide} index={index} ctx={ctx} />,
        )}</svg>`,
      )

    // With a subheading, the rule underlines the subheading: 「面向 2027 的三个
    // 决定」 at 36px measures 358px wide, centered on the page's own 640 axis.
    const withSub = root(chapter2, 2)
    const subRule = withSub.querySelector("line")!
    expect(Number(subRule.getAttribute("x1")) + Number(subRule.getAttribute("x2"))).toBe(1280)
    expect(Number(subRule.getAttribute("x2")) - Number(subRule.getAttribute("x1"))).toBe(358)

    // Without one, it underlines the last heading line instead — a wider
    // line, 84px type, so a proportionally lower offset.
    const noSub = root(chapter1, 0)
    const headRule = noSub.querySelector("line")!
    expect(Number(headRule.getAttribute("x1")) + Number(headRule.getAttribute("x2"))).toBe(1280)
    expect(Number(headRule.getAttribute("x2")) - Number(headRule.getAttribute("x1"))).toBe(672)

    // 0.33em below the baseline it belongs to — `INK_DESCENT_RATIO` (0.22,
    // the deepest measured ink) plus `UNDERLINE_AIR_RATIO` (0.11 of air).
    expect(Number(subRule.getAttribute("y1"))).toBe(Math.round(460 + 36 * 0.33))
    expect(Number(headRule.getAttribute("y1"))).toBe(Math.round(404 + 84 * 0.33))
  })

  it("没有可下划的文字时不画装饰线", () => {
    const ctx = chapterCtx("consulting")
    const slide: Slide = { type: "chapter", heading: "", components: [] } as unknown as Slide
    const deck: PptxIR = {
      version: "3",
      filename: "x.pptx",
      theme: { id: "consulting" },
      meta: {},
      assets: { images: {} },
      slides: [slide],
    } as unknown as PptxIR
    const markup = renderSvgMarkup(<BannerChapter ir={deck} slide={slide} index={0} ctx={ctx} />)
    expect(markup).not.toContain("<line")
  })

  // 回填旧测试「Chapter positions subheading/hairline off a fixed single-line
  // heading baseline」（旧文件 consulting.test.tsx L440-460）：单行标题时
  // headingY/subheadingY/hairlineY 的三个固定基线值。上面的逐字节测试已经
  // 隐含验证了这些数字（字面量里就是 404/460/452），这里显式断言，避免
  // 「值虽正确但没有可读断言」。
  it("单行标题时 heading/subheading 落在固定基线 y=404/460，hairline 落在副标题之下", () => {
    const ctx = chapterCtx("consulting")
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
    // The rule used to be pinned at 452 — 8px *above* the subheading's own
    // baseline of 460, so a 160px accent rule ran through the middle of that
    // text and read as a strikethrough (visual review 2026-08-16: "客户洞察
    // 怎么画了个黄色删除线"). It only ever looked right on the subheading-less
    // case it was measured against, which is why the number survived that
    // long. 490 cleared the ink but floated the dash 23px below it; 472 is
    // the underline the 2026-08-20 round asked for. The assertion that
    // matters is the relationship, not the literal: the rule clears the
    // deepest ink 36px type can put below its baseline (0.22em) and still
    // sits close enough to belong to that line (under 0.5em).
    const hairline = root.querySelector("line")!
    expect(hairline.getAttribute("y1")).toBe("472")
    expect(hairline.getAttribute("y1")).toBe(hairline.getAttribute("y2"))
    const subBaseline = Number(subheadingText.getAttribute("y"))
    const subSize = Number(subheadingText.getAttribute("font-size"))
    expect(Number(hairline.getAttribute("y1"))).toBeGreaterThan(subBaseline + subSize * 0.22)
    expect(Number(hairline.getAttribute("y1"))).toBeLessThan(subBaseline + subSize * 0.5)
  })

  // 回填旧测试「Chapter shrinks a pathologically long heading onto <=2 lines
  // instead of overflowing」（旧文件 consulting.test.tsx L347-371）：超长
  // heading 必须被压缩换行/缩字号，不能原样溢出。
  it("超长标题被压缩到 <=2 行且字号收缩（40-84px 之间），不会原样溢出", () => {
    const ctx = chapterCtx("consulting")
    const slide: Slide = { type: "chapter", heading: CJK_LONG, subheading: CJK_LONG, components: [] } as Slide
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
    expect(out).toContain("#53E0D2") // tech accent
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

  it("W4 fix round Critical C1：runway/enterprise 的 chapter 默认背景是近白，标题/副标题不再是不可见的白字压白底", () => {
    // 冷调组皮肤重设计（2026-08-20）把 enterprise 的白墙从纯白压到
    // #F7F7F4（纯白让给 surface），runway 仍是纯白——两家都还是「近白底」，
    // 也就是本条修复的前提。逐家断言各自的真实值，不再共用一个字面量。
    const CHAPTER_BG = { runway: "#F2F0EB", enterprise: "#F7F7F4" } as const
    for (const themeId of ["runway", "enterprise"] as const) {
      const ctx = chapterCtx(themeId)
      expect(ctx.defaultBg).toBe(CHAPTER_BG[themeId])
      const deck = ir(themeId)
      const root = parseSvgRoot(
        `<svg xmlns="http://www.w3.org/2000/svg">${renderSvgMarkup(<BannerChapter ir={deck} slide={chapter2} index={2} ctx={ctx} />)}</svg>`,
      )
      const heading = Array.from(root.querySelectorAll("text")).find((t) =>
        (t.textContent ?? "").includes("第二章：战略选择与路径"),
      )!
      const subheading = Array.from(root.querySelectorAll("text")).find((t) =>
        (t.textContent ?? "").includes("面向 2027 的三个决定"),
      )!
      expect(heading.getAttribute("fill")).toBe("#0A0E14")
      expect(subheading.getAttribute("fill")).toBe("#0A0E14")
    }
  })
})
