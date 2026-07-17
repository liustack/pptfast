// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { getTheme } from "../../themes"
import { ToneAdaptiveChapter } from "./chapter-tone-adaptive-chapter"
import type { PptxIR, Slide } from "@/ir"
import { LEGACY_CUSTOM_TOKENS } from "./legacy-custom-tokens"

function wrap(el: React.ReactElement): React.ReactElement {
  return <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">{el}</svg>
}

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// Frozen literal snapshots of ToneAdaptiveChapter's own output under custom
// tokens — captured once from this component (not from the legacy
// `templates/custom.tsx` `CustomChapter`, which templates/ deletion will
// remove) so this file has zero runtime dependency on templates/. Verified
// byte-identical to the legacy output before this migration (see the
// "无 CRITICAL 发现" report).
const EXPECTED_CHAPTER_NO_BG_IDX0 =
  '<text x="1224" y="610" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="260" font-weight="800" fill="#18181B" opacity="0.05" text-anchor="end" dominant-baseline="alphabetic">01</text><text x="640" y="408" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="88" font-weight="700" fill="#18181B" text-anchor="middle" dominant-baseline="alphabetic">第一部分：市场回顾</text>'
const EXPECTED_CHAPTER_NO_BG_IDX2 =
  '<text x="1224" y="610" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="260" font-weight="800" fill="#18181B" opacity="0.05" text-anchor="end" dominant-baseline="alphabetic">02</text><text x="640" y="408" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="88" font-weight="700" fill="#18181B" text-anchor="middle" dominant-baseline="alphabetic">第二部分：策略与执行路径</text>'
const EXPECTED_CHAPTER_WITH_BG =
  '<rect width="1280" height="720" fill="#000000" opacity="0.32"></rect><text x="1224" y="610" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="260" font-weight="800" fill="#FFFFFF" opacity="0.05" text-anchor="end" dominant-baseline="alphabetic">01</text><text x="640" y="408" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="88" font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="alphabetic">第一部分：市场回顾</text>'

// Deck with two chapter slides (separated by a content slide) so
// `chapterNumberFor` has something to derive from — index 0 is chapter "01",
// index 2 is chapter "02" out of the deck (章节序号水印 + 多 chapter index 覆盖).
const chapter1: Slide = { type: "chapter", heading: "第一部分：市场回顾", blocks: [] } as Slide
const content: Slide = { type: "content", heading: "现状", blocks: [] } as Slide
const chapter2: Slide = {
  type: "chapter",
  heading: "第二部分：策略与执行路径",
  blocks: [],
} as Slide

const bgImages: PptxIR["assets"]["images"] = {
  bg: { src: "data:image/png;base64,iVBOR", alt: "背景" },
}
const chapter1WithBg: Slide = {
  ...chapter1,
  background: { kind: "asset", asset_id: "bg", fit: "cover" },
} as Slide

function ir(theme: string, images: PptxIR["assets"]["images"] = {}): PptxIR {
  return {
    version: "3",
    filename: "deck.pptx",
    style: { id: theme },
    meta: {},
    assets: { images },
    slides: [chapter1, content, chapter2],
  } as unknown as PptxIR
}

// 档位判定：本文件的替换表（见 chapter-tone-adaptive-chapter.tsx 文件头）唯
// 一烤死常量 INK 与 custom token 表的 `text` 字段精确匹配、无孤儿色——
// custom 自己的 primary/text 当前同值，在 custom 自己的 tokens 下，新
// archetype 的输出应与旧 CustomChapter 逐字节一致（档位一）。跨主题断言证明
// 这不是巧合抄同一份 hex，而是真正走 ctx.colors。
describe("ToneAdaptiveChapter", () => {
  describe("custom tokens 下输出锁定（迁移前已与旧 CustomChapter 逐字节核对一致）", () => {
    it("无背景图分支，多 chapter index（01/02）", () => {
      const tokens = LEGACY_CUSTOM_TOKENS
      const ctx = buildCtx(tokens, {})
      const deck = ir("custom")

      const next1 = renderSvgMarkup(
        <ToneAdaptiveChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />,
      )
      expect(next1).toBe(EXPECTED_CHAPTER_NO_BG_IDX0)
      expect(next1).toContain(">01<")

      const next2 = renderSvgMarkup(
        <ToneAdaptiveChapter ir={deck} slide={chapter2} index={2} ctx={ctx} />,
      )
      expect(next2).toBe(EXPECTED_CHAPTER_NO_BG_IDX2)
      expect(next2).toContain(">02<")
    })

    it("有背景图分支（withBg 白字/黑幕豁免）", () => {
      const tokens = LEGACY_CUSTOM_TOKENS
      const ctxWithImg = buildCtx(tokens, bgImages)
      const deck = ir("custom", bgImages)
      const next = renderSvgMarkup(
        <ToneAdaptiveChapter ir={deck} slide={chapter1WithBg} index={0} ctx={ctxWithImg} />,
      )
      expect(next).toBe(EXPECTED_CHAPTER_WITH_BG)
    })
  })

  // Ported from templates/custom.test.tsx's describe.each controlled-subset
  // check (Chapter row).
  it("serializes to controlled-subset SVG (no gradient, no foreignObject)", () => {
    const tokens = LEGACY_CUSTOM_TOKENS
    const ctx = buildCtx(tokens, {})
    const deck = ir("custom")
    const markup = renderSvgMarkup(
      wrap(<ToneAdaptiveChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />),
    )
    expect(markup).not.toContain("foreignObject")
    expect(markup).not.toContain("linearGradient")
    expect(markup).not.toContain("url(#")
    expect(markup).not.toContain("<defs")

    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  // Ported from templates/custom.test.tsx's "Chapter shrinks a pathologically
  // long heading onto <=2 lines instead of overflowing".
  it("shrinks a pathologically long heading onto <=2 lines instead of overflowing", () => {
    const tokens = LEGACY_CUSTOM_TOKENS
    const ctx = buildCtx(tokens, {})
    const longSlide: Slide = { type: "chapter", heading: CJK_LONG, blocks: [] } as Slide
    const deck = ir("custom")
    const markup = renderSvgMarkup(
      wrap(<ToneAdaptiveChapter ir={deck} slide={longSlide} index={0} ctx={ctx} />),
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
    const headingTexts = Array.from(root.querySelectorAll("text")).filter((t) =>
      (t.textContent ?? "").includes("微服务"),
    )
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    for (const t of headingTexts) {
      const fontSize = Number(t.getAttribute("font-size"))
      expect(fontSize).toBeLessThan(88)
      expect(fontSize).toBeGreaterThanOrEqual(40)
    }
  })

  it("tech tokens 下（无背景图）用 tech 的 text 色，custom 自己的烤色不再出现（证明真正 token 化）", () => {
    const tokens = getTheme("tech")
    const ctx = buildCtx(tokens, {})
    const deck = ir("tech")
    const out = renderSvgMarkup(
      <ToneAdaptiveChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />,
    )

    expect(out).toContain("第一部分：市场回顾")
    expect(out).toContain(ctx.colors.text) // INK→text 语境：章节号水印/章节标题

    // custom 自己的烤死常量不得残留（tech 的 text 与 custom 不同值）
    expect(ctx.colors.text).not.toBe("#18181B")
    expect(out).not.toContain("#18181B")
  })

  it("withBg 分支跨主题：白字/黑幕豁免固定为纯白/纯黑，不随主题变化", () => {
    const tokens = getTheme("tech")
    const ctxWithImg = buildCtx(tokens, bgImages)
    const deck = ir("tech", bgImages)
    const out = renderSvgMarkup(
      <ToneAdaptiveChapter ir={deck} slide={chapter1WithBg} index={0} ctx={ctxWithImg} />,
    )

    expect(out).toContain('fill="#FFFFFF"')
    expect(out).toContain('fill="#000000"')
    // 有背景图时切到白字，不应再出现 tech 自己的 text
    expect(out).not.toContain(ctxWithImg.colors.text)
  })
})
