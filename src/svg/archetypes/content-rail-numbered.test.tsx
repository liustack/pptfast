// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { assertSubset } from "../subset-validate"
import { readableOn } from "../ink"
import { RailNumberedContent } from "./content-rail-numbered"
import type { PptxIR, Slide } from "@/ir"

// BrandChrome's brand logo bands (see templates/academic.test.tsx's own
// LOGO_BANDS) — any theme chrome placed near a page corner must stay clear
// of these; the number badge sits top-left (BADGE_Y=96, not 64, specifically
// to clear TL_LOGO).
const TL_LOGO = { x: 64, y: 48, w: 96, h: 40 }
const TR_LOGO = { x: 1120, y: 48, w: 96, h: 40 }
const BL_LOGO = { x: 64, y: 630, w: 96, h: 40 }
const BR_LOGO = { x: 1120, y: 630, w: 96, h: 40 }
const LOGO_BANDS = [TL_LOGO, TR_LOGO, BL_LOGO, BR_LOGO]

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

// Two-chapter deck with two content slides inside chapter 1 and one inside
// chapter 2, so `contentIndexInChapter` resets across the chapter boundary
// (badge "1.1"/"1.2"/"2.1", not a running "1"/"2"/"3") and the rail node's
// proportional position (`(chapter-1)/(totalChapters-1)`) actually moves
// between chapter 1 (top) and chapter 2 (bottom) content slides.
const chapter1: Slide = { type: "chapter", heading: "第一部分：研究背景", components: [] } as Slide
const content1a: Slide = {
  type: "content",
  heading: "编号导轨：从章节到小节",
  subheading: "**核心结论**：证据链完整",
  footnote: "数据来源：内部埋点，2026Q2",
  components: [
    { type: "paragraph", text: "本节梳理研究背景与既有文献。" },
    { type: "bullets", items: ["假设一成立", "假设二部分成立", "假设三待验证"], style: "default" },
  ],
} as Slide
const content1b: Slide = {
  type: "content",
  heading: "同一章节的第二小节",
  components: [{ type: "paragraph", text: "承接上一小节继续展开。" }],
} as Slide
const chapter2: Slide = { type: "chapter", heading: "第二部分：方法与证据", components: [] } as Slide
const content2a: Slide = {
  type: "content",
  heading: "第二章节的首个小节",
  components: [{ type: "paragraph", text: "方法论概述。" }],
} as Slide

const ir = (theme: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides: [chapter1, content1a, content1b, chapter2, content2a],
  }) as unknown as PptxIR

// Literal markup fixed from `templates/academic.tsx`'s `BCGEmeraldContent`
// under academic tokens (captured once, pre-templates-deletion — see task
// report) — this is what `toBe(legacy)` used to assert at runtime. Fixating
// it here keeps the same byte-for-byte assertion strength (including the
// exact rail-node cy at each chapter position, the badge label per slide,
// and the subheading-slot-driven content-rect y) without importing the
// (soon-to-be-deleted) templates/ module.
// W4 task 3 re-pin: balanced delivery's 24px body baseline (was 20px) —
// paragraph/bullets grow taller (line height 28px -> 34px), pushing the
// bullets block and everything below it down. Badge/rail/heading/subheading/
// footnote (all archetype-bespoke, not the paragraph/bullets/callout trio)
// keep their exact pixel values.
const EXPECTED_CONTENT_1A =
  '<rect x="48" y="96" width="4" height="544" fill="#006A4E"></rect><circle cx="50" cy="96" r="7" fill="#006A4E"></circle><rect x="96" y="96" width="64" height="32" rx="6" fill="#006A4E"></rect><text x="128" y="116" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="14" font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="alphabetic">1.1</text><text x="180" y="125" font-family="Georgia, Songti SC, STSong, serif" font-size="40" font-weight="600" fill="#1A2421" dominant-baseline="alphabetic">编号导轨：从章节到小节</text><text x="180" y="166" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#006A4E" dominant-baseline="alphabetic"><tspan fill="#1A2421" font-weight="700">核心结论</tspan><tspan fill="#006A4E">：证据链完整</tspan></text><g data-audit-rect="96,206,1088,434"><g data-audit-box="96,206,1088"><g transform="translate(96,206)"><text x="0" y="24" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#1A2421" dominant-baseline="alphabetic">本节梳理研究背景与既有文献。</text></g></g><g data-audit-box="96,280,1088"><g transform="translate(96,280)"><circle cx="5" cy="18.8" r="3" fill="#006A4E"></circle><text x="26" y="26" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#1A2421" dominant-baseline="alphabetic">假设一成立</text><circle cx="5" cy="60.8" r="3" fill="#006A4E"></circle><text x="26" y="68" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#1A2421" dominant-baseline="alphabetic">假设二部分成立</text><circle cx="5" cy="102.8" r="3" fill="#006A4E"></circle><text x="26" y="110" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#1A2421" dominant-baseline="alphabetic">假设三待验证</text></g></g></g><text x="96" y="656" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="14" fill="#5D6B65" font-style="italic" dominant-baseline="alphabetic">数据来源：内部埋点，2026Q2</text>'
const EXPECTED_CONTENT_1B =
  '<rect x="48" y="96" width="4" height="544" fill="#006A4E"></rect><circle cx="50" cy="96" r="7" fill="#006A4E"></circle><rect x="96" y="96" width="64" height="32" rx="6" fill="#006A4E"></rect><text x="128" y="116" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="14" font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="alphabetic">1.2</text><text x="180" y="125" font-family="Georgia, Songti SC, STSong, serif" font-size="40" font-weight="600" fill="#1A2421" dominant-baseline="alphabetic">同一章节的第二小节</text><g data-audit-rect="96,161,1088,479"><g data-audit-box="96,330.1,1088"><g transform="translate(96,330.1)"><text x="0" y="24" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#1A2421" dominant-baseline="alphabetic">承接上一小节继续展开。</text></g></g></g>'
const EXPECTED_CONTENT_2A =
  '<rect x="48" y="96" width="4" height="544" fill="#006A4E"></rect><circle cx="50" cy="640" r="7" fill="#006A4E"></circle><rect x="96" y="96" width="64" height="32" rx="6" fill="#006A4E"></rect><text x="128" y="116" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="14" font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="alphabetic">2.1</text><text x="180" y="125" font-family="Georgia, Songti SC, STSong, serif" font-size="40" font-weight="600" fill="#1A2421" dominant-baseline="alphabetic">第二章节的首个小节</text><g data-audit-rect="96,161,1088,479"><g data-audit-box="96,330.1,1088"><g transform="translate(96,330.1)"><text x="0" y="24" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#1A2421" dominant-baseline="alphabetic">方法论概述。</text></g></g></g>'
const EXPECTED_CONTENT_BARE =
  '<rect x="48" y="96" width="4" height="544" fill="#006A4E"></rect><circle cx="50" cy="96" r="7" fill="#006A4E"></circle><rect x="96" y="96" width="64" height="32" rx="6" fill="#006A4E"></rect><text x="128" y="116" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="14" font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="alphabetic">1.1</text><text x="180" y="125" font-family="Georgia, Songti SC, STSong, serif" font-size="40" font-weight="600" fill="#1A2421" dominant-baseline="alphabetic">简报</text><g data-audit-rect="96,161,1088,479"><g data-audit-box="96,330.1,1088"><g transform="translate(96,330.1)"><text x="0" y="24" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#1A2421" dominant-baseline="alphabetic">一</text></g></g></g>'

describe("RailNumberedContent", () => {
  it("academic tokens 下输出与迁移前的 BCGEmeraldContent 逐字节一致（档位一，含跨章节编号 + 多 component/subheading/footnote）", () => {
    const ctx = buildCtx({ ...resolveStyle("academic"), shape: undefined }, {})
    const deck = ir("academic")

    const next1a = renderSvgMarkup(<RailNumberedContent ir={deck} slide={content1a} index={1} ctx={ctx} />)
    expect(next1a).toBe(EXPECTED_CONTENT_1A)
    // 章节内编号：chapter1 的第一个 content -> "1.1"
    expect(next1a).toContain(">1.1<")
    expect(next1a).toContain("证据链完整")
    expect(next1a).toContain("假设一成立")
    expect(next1a).toContain("数据来源：内部埋点，2026Q2")

    const next1b = renderSvgMarkup(<RailNumberedContent ir={deck} slide={content1b} index={2} ctx={ctx} />)
    expect(next1b).toBe(EXPECTED_CONTENT_1B)
    // 同一章节的第二个 content -> 编号递增到 "1.2"，不是跨章节累计的 "2"
    expect(next1b).toContain(">1.2<")

    const next2a = renderSvgMarkup(<RailNumberedContent ir={deck} slide={content2a} index={4} ctx={ctx} />)
    expect(next2a).toBe(EXPECTED_CONTENT_2A)
    // 跨过 chapter2 边界后重置为 "2.1"
    expect(next2a).toContain(">2.1<")
  })

  it("单块 slide（无 subheading/footnote，单章节 deck）同样逐字节一致", () => {
    const ctx = buildCtx({ ...resolveStyle("academic"), shape: undefined }, {})
    const bare: Slide = { type: "content", heading: "简报", components: [{ type: "paragraph", text: "一" }] } as Slide
    const soloChapter: Slide = { type: "chapter", heading: "唯一章节", components: [] } as Slide
    const deck: PptxIR = {
      version: "3",
      filename: "x.pptx",
      theme: { id: "academic" },
      meta: {},
      assets: { images: {} },
      slides: [soloChapter, bare],
    } as unknown as PptxIR

    const next = renderSvgMarkup(<RailNumberedContent ir={deck} slide={bare} index={1} ctx={ctx} />)
    expect(next).toBe(EXPECTED_CONTENT_BARE)
    expect(next).toContain(">1.1<")
  })

  it("renders the left rail track, a progress node, the number badge (clear of all four logo bands) and no foreignObject（迁移自 academic.test.tsx 的 numbered-rail grammar 断言）", () => {
    const ctx = buildCtx({ ...resolveStyle("academic"), shape: undefined }, {})
    const deck = ir("academic")
    const markup = renderSvgMarkup(<RailNumberedContent ir={deck} slide={content1a} index={1} ctx={ctx} />)
    const root = parseSvgRoot(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${markup}</svg>`,
    )
    expect(markup).not.toContain("foreignObject")

    // rail track: rect(48, 96, 4, 544) filled with the theme's primary color
    const rail = Array.from(root.querySelectorAll("rect")).find(
      (r) =>
        r.getAttribute("x") === "48" &&
        r.getAttribute("y") === "96" &&
        r.getAttribute("width") === "4" &&
        r.getAttribute("height") === "544",
    )
    expect(rail).toBeTruthy()
    expect(rail?.getAttribute("fill")).toBe(ctx.colors.primary)

    // number badge: rect(96, 96, 64, 32) rx=6 — y=96 (not 64) keeps it clear
    // of BrandChrome's tl logo band (x 64-160, y 48-88)
    const badge = Array.from(root.querySelectorAll("rect")).find(
      (r) =>
        r.getAttribute("x") === "96" &&
        r.getAttribute("y") === "96" &&
        r.getAttribute("width") === "64" &&
        r.getAttribute("height") === "32",
    )
    expect(badge).toBeTruthy()
    expect(badge?.getAttribute("rx")).toBe("6")
    expect(badge?.getAttribute("fill")).toBe(ctx.colors.primary)

    const badgeRect = {
      x: Number(badge?.getAttribute("x")),
      y: Number(badge?.getAttribute("y")),
      w: Number(badge?.getAttribute("width")),
      h: Number(badge?.getAttribute("height")),
    }
    for (const band of LOGO_BANDS) {
      expect(rectsOverlap(badgeRect, band)).toBe(false)
    }
  })

  it("shrinks the number badge label through fitSvgLine instead of overflowing the 64px-wide badge（迁移自 academic.test.tsx，12/10 常规场景 + 100/1000 极端收缩场景）", () => {
    const ctx = buildCtx({ ...resolveStyle("academic"), shape: undefined }, {})

    // Common two-digit-on-both-sides shape ("12.10") still renders at the
    // nominal 14px size — the fit fallback is a safety net, not a change to
    // everyday rendering.
    const manyChapters12 = Array.from({ length: 12 }, (_, i) => ({
      type: "chapter" as const,
      heading: `第${i + 1}章`,
      components: [],
    }))
    const tenContent = Array.from({ length: 10 }, (_, i) => ({
      type: "content" as const,
      heading: `内容${i + 1}`,
      components: [],
    }))
    const doc12 = ir("academic")
    doc12.slides = [...manyChapters12, ...tenContent]
    const lastContent = tenContent[9]
    const lastIndex = manyChapters12.length + tenContent.length - 1
    const m12 = renderSvgMarkup(
      <RailNumberedContent ir={doc12} slide={lastContent} index={lastIndex} ctx={ctx} />,
    )
    expect(m12).toContain(">12.10<")
    const label12 = Array.from(
      parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${m12}</svg>`).querySelectorAll("text"),
    ).find((t) => t.textContent === "12.10")
    expect(label12?.getAttribute("font-size")).toBe("14")

    // Pathologically long "{chapter}.{content}" (7 digits total) overflows
    // the badge's text budget at 14px — fitSvgLine shrinks the font instead
    // of letting the label spill past the badge's rounded corners.
    const manyChapters100 = Array.from({ length: 100 }, (_, i) => ({
      type: "chapter" as const,
      heading: `第${i + 1}章`,
      components: [],
    }))
    const thousandContent = Array.from({ length: 1000 }, (_, i) => ({
      type: "content" as const,
      heading: `内容${i + 1}`,
      components: [],
    }))
    const doc100 = ir("academic")
    doc100.slides = [...manyChapters100, ...thousandContent]
    const bigContent = thousandContent[999]
    const bigIndex = manyChapters100.length + thousandContent.length - 1
    const mBig = renderSvgMarkup(
      <RailNumberedContent ir={doc100} slide={bigContent} index={bigIndex} ctx={ctx} />,
    )
    // Full label survives (fitSvgLine shrinks before it truncates)
    expect(mBig).toContain(">100.1000<")
    const labelBig = Array.from(
      parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${mBig}</svg>`).querySelectorAll("text"),
    ).find((t) => t.textContent === "100.1000")
    expect(Number(labelBig?.getAttribute("font-size"))).toBeLessThan(14)
    expect(Number(labelBig?.getAttribute("font-size"))).toBeGreaterThanOrEqual(10)
  })

  it("Content body passes subset validation（迁移自 academic.test.tsx）", () => {
    const ctx = buildCtx({ ...resolveStyle("academic"), shape: undefined }, {})
    const slide: Slide = {
      type: "content",
      heading: "验证子集",
      components: [
        { type: "paragraph", text: "文本段落。" },
        { type: "bullets", items: ["项目一", "项目二"], style: "default" },
      ],
    } as Slide
    const doc: PptxIR = {
      version: "3",
      filename: "x.pptx",
      theme: { id: "academic" },
      meta: {},
      assets: { images: {} },
      slides: [slide],
    } as unknown as PptxIR
    const markup = renderSvgMarkup(<RailNumberedContent ir={doc} slide={slide} index={0} ctx={ctx} />)
    const root = parseSvgRoot(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${markup}</svg>`,
    )
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("超长标题（40+ 字）经 fitHeadingLines 收缩/换行渲染，不整段输出原文，通过 subset validation（补齐迁移前遗漏的长标题边缘场景）", () => {
    const ctx = buildCtx({ ...resolveStyle("academic"), shape: undefined }, {})
    const CJK_LONG =
      "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"
    const slide: Slide = {
      type: "content",
      heading: CJK_LONG,
      components: [{ type: "paragraph", text: "概要。" }],
    } as Slide
    const doc: PptxIR = {
      version: "3",
      filename: "x.pptx",
      theme: { id: "academic" },
      meta: {},
      assets: { images: {} },
      slides: [slide],
    } as unknown as PptxIR

    // render() itself must not throw for a pathologically long heading.
    const markup = renderSvgMarkup(<RailNumberedContent ir={doc} slide={slide} index={0} ctx={ctx} />)
    const root = parseSvgRoot(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${markup}</svg>`,
    )
    expect(() => assertSubset(root)).not.toThrow()

    const headingTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "600" && t.getAttribute("fill") === ctx.colors.text,
    )
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    expect(headingTexts.length).toBeLessThanOrEqual(2) // maxLines: 2
    for (const t of headingTexts) {
      const fontSize = Number(t.getAttribute("font-size"))
      expect(fontSize).toBeLessThanOrEqual(40) // nominal
      expect(fontSize).toBeGreaterThanOrEqual(24) // minPt
    }
    // Not silently dropped, and never dumps the whole string onto one line.
    expect(markup).toContain("微服务架构")
    expect(headingTexts.every((t) => t.textContent !== CJK_LONG)).toBe(true)
  })

  it("overly long subheading shrinks to 16px then truncates with an ellipsis（迁移自 academic.test.tsx 的 Content subheading Task 5 分支）", () => {
    const ctx = buildCtx({ ...resolveStyle("academic"), shape: undefined }, {})
    const CJK_LONG =
      "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"
    const slide: Slide = {
      type: "content",
      heading: "三大支柱",
      subheading: CJK_LONG.repeat(2),
      components: [{ type: "paragraph", text: "核心概要。" }],
    } as Slide
    const doc: PptxIR = {
      version: "3",
      filename: "x.pptx",
      theme: { id: "academic" },
      meta: {},
      assets: { images: {} },
      slides: [slide],
    } as unknown as PptxIR
    const markup = renderSvgMarkup(<RailNumberedContent ir={doc} slide={slide} index={0} ctx={ctx} />)
    const root = parseSvgRoot(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${markup}</svg>`,
    )
    const sub = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("微服务"),
    )!
    expect(sub.getAttribute("font-size")).toBe("16")
    expect((sub.textContent ?? "").endsWith("…")).toBe(true)
    expect(sub.textContent).not.toBe(CJK_LONG.repeat(2))
  })

  it("tech tokens 下用 tech 的色（证明 token 化成立，无 baked hex），徽章对比度自适应出深字", () => {
    const techTheme = resolveStyle("tech")
    const ctx = buildCtx(techTheme, {})
    const deck = ir("tech")
    const out = renderSvgMarkup(<RailNumberedContent ir={deck} slide={content1a} index={1} ctx={ctx} />)

    expect(out).toContain(ctx.colors.primary as string) // tech 的 primary 驱动 rail/badge
    expect(out).toContain(ctx.colors.text as string) // tech 的 text 驱动标题
    expect(out).toContain(ctx.colors.muted as string) // tech 的 muted 驱动 footnote
    // academic 自己的烤死色不得残留
    expect(out).not.toContain("#1A2421") // academic TEXT
    expect(out).not.toContain("#5D6B65") // academic MUTED
    expect(out).not.toContain("#006A4E") // academic primary（回归锁，本函数未烤死但仍确认没有意外硬编码）

    // W4 fix round: 徽章文字不再固定纯白——白字 on tech 亮青 primary
    // （#2DD4E6）只有 ~1.80:1，全矩阵扫描确认精确 1.00:1（因为 audit 把徽章
    // 误判到页面背景，见 full-matrix-contrast.test.ts 的 allowlist 说明。
    // 真实渲染是 badge 自画的 primary 色块）。改用
    // readableOn(colors.primary) 后 tech 落中性深墨。
    const expectedInk = readableOn(techTheme.colors.primary)
    expect(expectedInk).toBe("#0A0E14")
    expect(out).toContain(`fill="${expectedInk}"`)
    expect(out).not.toContain('fill="#FFFFFF"')
    expect(ctx.colors.text).not.toBe("#FFFFFF")

    // ctx 确实按主题切换生效：heading 字体走 tech 的解析结果
    expect(out).toContain(`font-family="${ctx.fonts.heading}"`)
  })
})
