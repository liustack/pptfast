// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { measureTextUnits } from "../../lib/svg-text-layout"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../themes"
import { NarrowColumnContent } from "./content-narrow-column"
import type { Block, PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

function para(text: string): Block {
  return { type: "paragraph", text }
}

// Deck with a preceding chapter so `sectionNameFor` resolves a kicker for
// the content slide, and a content slide carrying multiple block types
// (paragraph + bullets + quote) plus subheading/footnote to exercise every
// conditional slot the archetype renders.
const chapter: Slide = { type: "chapter", heading: "第一部分：市场洞察", blocks: [] } as Slide
const content: Slide = {
  type: "content",
  heading: "窄栏叙事：从数据到洞察",
  subheading: "**核心结论**：留存率显著提升",
  footnote: "数据来源：内部埋点，2026Q2",
  blocks: [
    { type: "paragraph", text: "本季度用户留存呈现持续上行趋势。" },
    { type: "bullets", items: ["留存率 +12%", "活跃时长 +8%", "流失率 -5%"], style: "default" },
    { type: "quote", text: "增长的本质是留住已经信任你的人。", attribution: "内部访谈" },
  ],
} as Slide

const ir = (theme: string, slides: Slide[] = [chapter, content]): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides,
  }) as unknown as PptxIR

// Captured from NarrowColumnContent (magazine tokens, fixtures above) —
// pinned as literals so this test no longer depends on the legacy
// `templates/magazine` module (slated for deletion).
const MAGAZINE_EXPECTED =
  '<line x1="96" y1="88" x2="1184" y2="88" stroke="#E4DCD0" stroke-width="1.2"></line><text x="96" y="124" font-family="SimSun, Songti SC, STSong, serif" font-size="16" fill="#C0392B" font-style="italic" dominant-baseline="alphabetic">第一部分：市场洞察</text><text x="96" y="190" font-family="SimSun, Songti SC, STSong, serif" font-size="60" font-weight="600" fill="#1F1F1F" dominant-baseline="alphabetic">窄栏叙事：从数据到洞察</text><text x="96" y="254" font-family="SimSun, Songti SC, STSong, serif" font-size="22" fill="#C0392B" font-style="italic" dominant-baseline="alphabetic"><tspan fill="#1F1F1F" font-weight="700">核心结论</tspan><tspan fill="#C0392B">：留存率显著提升</tspan></text><g data-audit-rect="96,298,880,342"><g data-audit-box="96,298,880"><g transform="translate(96,298)"><text x="0" y="20" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#1F1F1F" dominant-baseline="alphabetic">本季度用户留存呈现持续上行趋势。</text></g></g><g data-audit-box="96,342,880"><g transform="translate(96,342)"><circle cx="5" cy="16" r="3" fill="#1A1A1A"></circle><text x="26" y="22" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#1F1F1F" dominant-baseline="alphabetic">留存率 +12%</text><circle cx="5" cy="52" r="3" fill="#1A1A1A"></circle><text x="26" y="58" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#1F1F1F" dominant-baseline="alphabetic">活跃时长 +8%</text><circle cx="5" cy="88" r="3" fill="#1A1A1A"></circle><text x="26" y="94" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#1F1F1F" dominant-baseline="alphabetic">流失率 -5%</text></g></g><g data-audit-box="96,480,880"><g transform="translate(96,480)"><text x="0" y="44" font-size="64" fill="#C0392B" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" dominant-baseline="alphabetic">“</text><text x="20" y="86" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="26" font-style="italic" fill="#1F1F1F" dominant-baseline="alphabetic">增长的本质是留住已经信任你的人。</text><text x="20" y="123" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#6E6259" dominant-baseline="alphabetic">— 内部访谈</text></g></g></g><text x="1184" y="628" font-family="SimSun, Songti SC, STSong, serif" font-size="64" fill="#6E6259" opacity="0.3" text-anchor="end" dominant-baseline="alphabetic">02</text><text x="96" y="652" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#6E6259" font-style="italic" dominant-baseline="alphabetic">数据来源：内部埋点，2026Q2</text>'

const MAGAZINE_EXPECTED_BARE =
  '<line x1="96" y1="88" x2="1184" y2="88" stroke="#E4DCD0" stroke-width="1.2"></line><text x="96" y="190" font-family="SimSun, Songti SC, STSong, serif" font-size="60" font-weight="600" fill="#1F1F1F" dominant-baseline="alphabetic">简报</text><g data-audit-rect="96,230,880,410"><g data-audit-box="96,375.15999999999997,880"><g transform="translate(96,375.15999999999997)"><text x="0" y="20" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#1F1F1F" dominant-baseline="alphabetic">一</text></g></g></g><text x="1184" y="628" font-family="SimSun, Songti SC, STSong, serif" font-size="64" fill="#6E6259" opacity="0.3" text-anchor="end" dominant-baseline="alphabetic">01</text>'

describe("NarrowColumnContent", () => {
  it("magazine tokens 下输出与固化的基准 markup 逐字节一致（档位一，含多种 block/kicker/subheading/footnote，档案来自旧 EditorialSerifContent）", () => {
    const ctx = buildCtx({ ...resolveStyle("journal"), shape: undefined }, {})
    const deck = ir("journal")

    const next = renderSvgMarkup(<NarrowColumnContent ir={deck} slide={content} index={1} ctx={ctx} />)
    expect(next).toBe(MAGAZINE_EXPECTED)
    // Sanity: the multi-block content, kicker (section name), subheading and
    // footnote all actually rendered, not silently dropped.
    expect(next).toContain("第一部分：市场洞察")
    expect(next).toContain("留存率 +12%")
    expect(next).toContain("增长的本质是留住已经信任你的人。")
    expect(next).toContain("数据来源：内部埋点，2026Q2")
    expect(next).toContain(">02<") // zero-padded page number, index 1 -> "02"
  })

  it("单块 slide（无 subheading/footnote）同样与固化基准逐字节一致", () => {
    const ctx = buildCtx({ ...resolveStyle("journal"), shape: undefined }, {})
    const bare: Slide = { type: "content", heading: "简报", blocks: [{ type: "paragraph", text: "一" }] } as Slide
    const deck = ir("journal", [bare])

    const next = renderSvgMarkup(<NarrowColumnContent ir={deck} slide={bare} index={0} ctx={ctx} />)
    expect(next).toBe(MAGAZINE_EXPECTED_BARE)
  })

  it("consulting tokens 下用 consulting 的色（证明 token 化成立，无 baked hex）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const deck = ir("consulting")
    const out = renderSvgMarkup(<NarrowColumnContent ir={deck} slide={content} index={1} ctx={ctx} />)
    expect(out).toContain("#FFC72C") // consulting accent
    expect(out).not.toContain("#C0392B") // magazine accent 不得残留
    expect(out).not.toContain("#E4DCD0") // magazine border 不得残留
  })

  it("passes assertSubset (no forbidden elements)", () => {
    const ctx = buildCtx({ ...resolveStyle("journal"), shape: undefined }, {})
    const deck = ir("journal")
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <NarrowColumnContent ir={deck} slide={content} index={1} ctx={ctx} />
      </svg>,
    )
    expect(markup).not.toContain("foreignObject")
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("lays blocks into the deliberately narrow 880-wide column (not the full 1088 width)", () => {
    const ctx = buildCtx({ ...resolveStyle("journal"), shape: undefined }, {})
    const slide: Slide = {
      type: "content",
      heading: "窄栏叙事",
      blocks: [para("一"), para("二"), para("三")],
    } as Slide
    const deck = ir("journal", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <NarrowColumnContent ir={deck} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const rectEl = root.querySelector('[data-audit-rect^="96,"]')
    expect(rectEl).not.toBeNull()
    const auditRect = rectEl!.getAttribute("data-audit-rect") ?? ""
    expect(auditRect).toContain(",880,")
    const [x, , w] = auditRect.split(",").map(Number)
    expect(x).toBe(96)
    expect(w).toBe(880)
  })

  it("renders a large, 30%-opacity, zero-padded page number anchored to the right gutter", () => {
    const ctx = buildCtx({ ...resolveStyle("journal"), shape: undefined }, {})
    const slide: Slide = { type: "content", heading: "标题", blocks: [para("一")] } as Slide
    // 9th slide (index 8) => page label "09"
    const slides = Array.from({ length: 9 }, () => ({ ...slide }))
    const deck = ir("journal", slides)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <NarrowColumnContent ir={deck} slide={slide} index={8} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const pageNum = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "09")
    expect(pageNum).toBeDefined()
    expect(pageNum!.getAttribute("opacity")).toBe("0.3")
    expect(pageNum!.getAttribute("text-anchor")).toBe("end")
    expect(pageNum!.getAttribute("x")).toBe("1184")
    expect(pageNum!.getAttribute("font-size")).toBe("64")

    // Single-digit pages are still zero-padded.
    const markupFirst = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <NarrowColumnContent ir={ir("journal", [slide])} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const rootFirst = parseSvgRoot(markupFirst)
    const firstPage = Array.from(rootFirst.querySelectorAll("text")).find((t) => t.textContent === "01")
    expect(firstPage).toBeDefined()
  })

  it("converges a pathologically long (48-char) heading to <32pt or 2 lines within the 880 column", () => {
    const ctx = buildCtx({ ...resolveStyle("journal"), shape: undefined }, {})
    const longHeading = "微服务架构下分布式事务一致性保障机制补偿策略设计".repeat(3).slice(0, 48)
    expect(longHeading.length).toBe(48)
    const slide: Slide = {
      type: "content",
      heading: longHeading,
      blocks: [para("概要")],
    } as Slide
    const deck = ir("journal", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <NarrowColumnContent ir={deck} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    const headingTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "600" && t.getAttribute("fill") === ctx.colors.text,
    )
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    expect(headingTexts.length).toBeLessThanOrEqual(2)
    const converged =
      headingTexts.length === 2 || Number(headingTexts[0].getAttribute("font-size")) < 32
    expect(converged).toBe(true)
    expect(headingTexts.every((t) => t.textContent !== longHeading)).toBe(true)
  })

  it("kicker fits an overlong section name instead of overflowing at fixed 16px", () => {
    const ctx = buildCtx({ ...resolveStyle("journal"), shape: undefined }, {})
    const chapterSlide: Slide = { type: "chapter", heading: CJK_LONG.repeat(2), blocks: [] } as Slide
    const contentSlide: Slide = {
      type: "content",
      heading: "小节标题",
      blocks: [para("一")],
    } as Slide
    const deck = ir("journal", [chapterSlide, contentSlide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <NarrowColumnContent ir={deck} slide={contentSlide} index={1} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const kicker = Array.from(root.querySelectorAll("text")).find(
      (t) => t.getAttribute("font-style") === "italic" && t.getAttribute("fill") === ctx.colors.accent,
    )
    expect(kicker).toBeDefined()
    const fontSize = Number(kicker!.getAttribute("font-size"))
    const truncated = (kicker!.textContent ?? "").includes("…")
    expect(fontSize < 16 || truncated).toBe(true)
  })

  it("footnote stays within the 980-wide budget instead of colliding with the page number", () => {
    const ctx = buildCtx({ ...resolveStyle("journal"), shape: undefined }, {})
    const longFootnote = "数据来源：" + "内部报告与季度审计草案汇总说明".repeat(6)
    const slide: Slide = {
      type: "content",
      heading: "标题",
      blocks: [para("一")],
      footnote: longFootnote,
    } as Slide
    const deck = ir("journal", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <NarrowColumnContent ir={deck} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const footnoteEl = Array.from(root.querySelectorAll("text")).find((t) => t.getAttribute("y") === "652")
    expect(footnoteEl).toBeDefined()
    const fontSize = Number(footnoteEl!.getAttribute("font-size"))
    const text = footnoteEl!.textContent ?? ""
    expect(measureTextUnits(text) * fontSize).toBeLessThanOrEqual(980)
  })

  describe("subheading (Task 5)", () => {
    const base: Slide = {
      type: "content",
      heading: "四大支柱",
      blocks: [para("一"), para("二")],
    } as Slide

    function columnRectY(root: Element): number {
      const rectEl = root.querySelector('[data-audit-rect^="96,"]')!
      return Number(rectEl.getAttribute("data-audit-rect")!.split(",")[1])
    }

    it("no subheading: narrow column y stays at the pre-subheading formula (headingLastY + 40)", () => {
      const ctx = buildCtx({ ...resolveStyle("journal"), shape: undefined }, {})
      const deck = ir("journal", [base])
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <NarrowColumnContent ir={deck} slide={base} index={0} ctx={ctx} />
        </svg>,
      )
      const root = parseSvgRoot(markup)
      expect(columnRectY(root)).toBe(190 + 40)
      expect(root.querySelector('text[y="220"]')).toBeNull()
    })

    it("with subheading: italic accent text below the heading, and pushes the narrow column down 68 (S3b: headingLastY+64)", () => {
      const ctx = buildCtx({ ...resolveStyle("journal"), shape: undefined }, {})
      const slide: Slide = { ...base, subheading: "效率提升三成，风险敞口下降" } as Slide
      const deck = ir("journal", [slide])
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <NarrowColumnContent ir={deck} slide={slide} index={0} ctx={ctx} />
        </svg>,
      )
      const root = parseSvgRoot(markup)
      const sub = Array.from(root.querySelectorAll("text")).find((t) =>
        (t.textContent ?? "").includes("效率提升三成"),
      )!
      expect(sub.getAttribute("fill")).toBe(ctx.colors.accent)
      expect(sub.getAttribute("font-style")).toBe("italic")
      expect(sub.getAttribute("y")).toBe(String(190 + 64))
      expect(columnRectY(root)).toBe(190 + 40 + 68)
    })

    it("emphasis markup: ** ** segments invert to colors.text at fontWeight 700, staying italic", () => {
      const ctx = buildCtx({ ...resolveStyle("journal"), shape: undefined }, {})
      const slide: Slide = { ...base, subheading: "**效率提升三成**，风险敞口下降" } as Slide
      const deck = ir("journal", [slide])
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <NarrowColumnContent ir={deck} slide={slide} index={0} ctx={ctx} />
        </svg>,
      )
      const root = parseSvgRoot(markup)
      const parent = Array.from(root.querySelectorAll("text")).find((t) =>
        (t.textContent ?? "").includes("效率提升三成"),
      )!
      expect(parent.getAttribute("font-style")).toBe("italic")
      const tspan = Array.from(parent.querySelectorAll("tspan")).find((t) =>
        (t.textContent ?? "").includes("效率提升三成"),
      )!
      expect(tspan.getAttribute("fill")).toBe(ctx.colors.text)
      expect(tspan.getAttribute("font-weight")).toBe("700")
      const plainTspan = Array.from(parent.querySelectorAll("tspan")).find((t) =>
        (t.textContent ?? "").includes("风险敞口下降"),
      )!
      expect(plainTspan.getAttribute("fill")).toBe(ctx.colors.accent)
    })

    it("overly long subheading shrinks to 16px then truncates", () => {
      const ctx = buildCtx({ ...resolveStyle("journal"), shape: undefined }, {})
      const slide: Slide = { ...base, subheading: CJK_LONG.repeat(2) } as Slide
      const deck = ir("journal", [slide])
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <NarrowColumnContent ir={deck} slide={slide} index={0} ctx={ctx} />
        </svg>,
      )
      const root = parseSvgRoot(markup)
      const sub = Array.from(root.querySelectorAll("text")).find((t) =>
        (t.textContent ?? "").includes("微服务"),
      )!
      expect(sub.getAttribute("font-size")).toBe("16")
      expect((sub.textContent ?? "").endsWith("…")).toBe(true)
      expect(sub.textContent).not.toBe(CJK_LONG.repeat(2))
    })
  })
})
