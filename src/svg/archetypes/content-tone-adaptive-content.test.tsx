// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { accessibleInk, contrastRatio, requiredContrastRatio } from "../ink"
import { ToneAdaptiveContent } from "./content-tone-adaptive-content"
import type { PptxIR, Slide } from "@/ir"
import { LEGACY_CUSTOM_TOKENS } from "./legacy-custom-tokens"

function wrap(el: React.ReactElement): React.ReactElement {
  return <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">{el}</svg>
}

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// Frozen literal snapshots of ToneAdaptiveContent's own output under custom
// tokens — captured once from this component (not from the legacy
// `templates/custom.tsx` `CustomContent`, which templates/ deletion will
// remove) so this file has zero runtime dependency on templates/. Verified
// byte-identical to the legacy output before this migration (see the
// "无 CRITICAL 发现" report).
// W4 task 3 re-pin: balanced delivery's 24px body baseline (was 20px) —
// paragraph/bullets grow taller, pushing everything below them down.
// Kicker/heading/subheading/divider/footnote (archetype-bespoke, not the
// paragraph/bullets/callout trio) keep their exact pixel values.
const EXPECTED_CONTENT_NO_BG =
  '<text x="64" y="62" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#3F3F46" letter-spacing="2" dominant-baseline="alphabetic">Chapter 01 · 第一部分：产品概览</text><text x="64" y="130" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="46" font-weight="700" fill="#18181B" dominant-baseline="alphabetic">双色态：从纸面到屏幕</text><text x="64" y="172" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#3F3F46" dominant-baseline="alphabetic"><tspan fill="#18181B" font-weight="700">核心结论</tspan><tspan fill="#3F3F46">：适配任意底色</tspan></text><line x1="64" y1="208" x2="112" y2="208" stroke="#3F3F46" stroke-width="4"></line><line x1="112" y1="208" x2="1216" y2="208" stroke="#E4E4E7" stroke-width="1.6"></line><g data-audit-rect="64,226,1152,374"><g data-audit-box="64,226,1152"><g transform="translate(64,226)"><text x="0" y="24" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#18181B" dominant-baseline="alphabetic">本节演示 custom 主题的双色态排版。</text></g></g><g data-audit-box="64,300,1152"><g transform="translate(64,300)"><circle cx="5" cy="18.8" r="3" fill="#18181B"></circle><text x="26" y="26" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#18181B" dominant-baseline="alphabetic">无背景图走墨色文字</text><circle cx="5" cy="60.8" r="3" fill="#18181B"></circle><text x="26" y="68" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#18181B" dominant-baseline="alphabetic">有背景图走浮动白卡</text><circle cx="5" cy="102.8" r="3" fill="#18181B"></circle><text x="26" y="110" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#18181B" dominant-baseline="alphabetic">两者色语义一致</text></g></g></g><text x="64" y="688" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#71717A" font-style="italic" dominant-baseline="alphabetic">数据来源：内部埋点，2026Q2</text>'
const EXPECTED_CONTENT_WITH_BG =
  '<rect x="48" y="44" width="1184" height="632" rx="14" fill="#FFFFFF"></rect><text x="92" y="104" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#3F3F46" letter-spacing="2" dominant-baseline="alphabetic">Chapter 01 · 第一部分：产品概览</text><text x="92" y="168" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="44" font-weight="700" fill="#18181B" dominant-baseline="alphabetic">双色态：从纸面到屏幕</text><text x="92" y="210" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#3F3F46" dominant-baseline="alphabetic"><tspan fill="#18181B" font-weight="700">核心结论</tspan><tspan fill="#3F3F46">：适配任意底色</tspan></text><line x1="92" y1="244" x2="140" y2="244" stroke="#3F3F46" stroke-width="4"></line><line x1="140" y1="244" x2="1188" y2="244" stroke="#E4E4E7" stroke-width="1.6"></line><g data-audit-rect="92,262,1096,354"><g data-audit-box="92,262,1096"><g transform="translate(92,262)"><text x="0" y="24" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#18181B" dominant-baseline="alphabetic">本节演示 custom 主题的双色态排版。</text></g></g><g data-audit-box="92,336,1096"><g transform="translate(92,336)"><circle cx="5" cy="18.8" r="3" fill="#18181B"></circle><text x="26" y="26" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#18181B" dominant-baseline="alphabetic">无背景图走墨色文字</text><circle cx="5" cy="60.8" r="3" fill="#18181B"></circle><text x="26" y="68" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#18181B" dominant-baseline="alphabetic">有背景图走浮动白卡</text><circle cx="5" cy="102.8" r="3" fill="#18181B"></circle><text x="26" y="110" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#18181B" dominant-baseline="alphabetic">两者色语义一致</text></g></g></g><text x="92" y="636" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#71717A" dominant-baseline="alphabetic">Internal  ·  ACME  ·  v1</text>'
const EXPECTED_CONTENT_BARE_NO_BG =
  '<text x="64" y="130" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="46" font-weight="700" fill="#18181B" dominant-baseline="alphabetic">简报</text><line x1="64" y1="162" x2="112" y2="162" stroke="#3F3F46" stroke-width="4"></line><line x1="112" y1="162" x2="1216" y2="162" stroke="#E4E4E7" stroke-width="1.6"></line><g data-audit-rect="64,180,1152,460"><g data-audit-box="64,341.88,1152"><g transform="translate(64,341.88)"><text x="0" y="24" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#18181B" dominant-baseline="alphabetic">一</text></g></g></g>'
const EXPECTED_CONTENT_BARE_WITH_BG =
  '<rect x="48" y="44" width="1184" height="632" rx="14" fill="#FFFFFF"></rect><text x="92" y="168" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="44" font-weight="700" fill="#18181B" dominant-baseline="alphabetic">简报</text><line x1="92" y1="198" x2="140" y2="198" stroke="#3F3F46" stroke-width="4"></line><line x1="140" y1="198" x2="1188" y2="198" stroke="#E4E4E7" stroke-width="1.6"></line><g data-audit-rect="92,216,1096,400"><g data-audit-box="92,355.08000000000004,1096"><g transform="translate(92,355.08000000000004)"><text x="0" y="24" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#18181B" dominant-baseline="alphabetic">一</text></g></g></g><text x="92" y="636" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#71717A" dominant-baseline="alphabetic"></text>'

// Deck with a preceding chapter so `sectionNameFor`/`chapterNumberFor` resolve
// a kicker for the content slide, and a content slide carrying multiple component
// types plus subheading/footnote to exercise every conditional slot both
// branches render.
const chapter: Slide = { type: "chapter", heading: "第一部分：产品概览", components: [] } as Slide
const content: Slide = {
  type: "content",
  heading: "双色态：从纸面到屏幕",
  subheading: "**核心结论**：适配任意底色",
  footnote: "数据来源：内部埋点，2026Q2",
  components: [
    { type: "paragraph", text: "本节演示 custom 主题的双色态排版。" },
    { type: "bullets", items: ["无背景图走墨色文字", "有背景图走浮动白卡", "两者色语义一致"], style: "default" },
  ],
} as Slide

const bgImages: PptxIR["assets"]["images"] = {
  bg: { src: "data:image/png;base64,iVBOR", alt: "背景" },
}
const contentWithBg: Slide = {
  ...content,
  background: { kind: "asset", asset_id: "bg", fit: "cover" },
} as Slide

function ir(theme: string, images: PptxIR["assets"]["images"] = {}): PptxIR {
  return {
    version: "3",
    filename: "deck.pptx",
    theme: { id: theme },
    meta: { organization: "ACME", confidentiality: "internal", version: "v1" },
    assets: { images },
    slides: [chapter, content],
  } as unknown as PptxIR
}

// 档位判定：本文件的替换表（见 content-tone-adaptive-content.tsx 文件头）三
// 个烤死常量（INK/MUTED/BORDER）全部与 custom token 表精确匹配、无孤儿色——
// 唯一颜色字面量是已点名并测试锁死的白色卡片豁免。custom 自己的 primary/
// text 当前同值，故在 custom 自己的 tokens 下，新 archetype 的输出应与旧
// CustomContent 逐字节一致（档位一）。跨主题断言证明这不是巧合抄同一份
// hex，而是真正走 ctx.colors。
describe("ToneAdaptiveContent", () => {
  describe("custom tokens 下输出锁定（迁移前已与旧 CustomContent 逐字节核对一致）", () => {
    it("无背景图分支（多 component + subheading + footnote + kicker）", () => {
      const tokens = LEGACY_CUSTOM_TOKENS
      const ctx = buildCtx(tokens, {})
      const deck = ir("custom")

      const next = renderSvgMarkup(
        <ToneAdaptiveContent ir={deck} slide={content} index={1} ctx={ctx} />,
      )
      expect(next).toBe(EXPECTED_CONTENT_NO_BG)
      expect(next).toContain("双色态：从纸面到屏幕")
      expect(next).toContain("无背景图走墨色文字")
      expect(next).toContain("数据来源：内部埋点，2026Q2")
      expect(next).toContain("Chapter 01 · 第一部分：产品概览")
    })

    it("有背景图分支（浮动白卡，卡片内文字与无背景图分支同色，非白字豁免）", () => {
      const tokens = LEGACY_CUSTOM_TOKENS
      const ctxWithImg = buildCtx(tokens, bgImages)
      const deck = ir("custom", bgImages)

      const next = renderSvgMarkup(
        <ToneAdaptiveContent ir={deck} slide={contentWithBg} index={1} ctx={ctxWithImg} />,
      )
      expect(next).toBe(EXPECTED_CONTENT_WITH_BG)

      // 白色卡片豁免：唯一的颜色字面量
      expect(next).toContain('fill="#FFFFFF"')
      // 与三个已提炼的 custom 兄弟页型不同：withBg 分支不切白字，卡片内标题
      // 仍用 colors.text（墨色），不是纯白
      expect(next).toContain(`fill="${ctxWithImg.colors.text}"`)
      expect(next).toContain("双色态：从纸面到屏幕")
    })
  })

  it("单块 slide（无 subheading/footnote/kicker）两分支输出锁定", () => {
    const tokens = LEGACY_CUSTOM_TOKENS
    const bare: Slide = { type: "content", heading: "简报", components: [{ type: "paragraph", text: "一" }] } as Slide
    const bareWithBg: Slide = { ...bare, background: { kind: "asset", asset_id: "bg", fit: "cover" } } as Slide
    const deck: PptxIR = {
      version: "3",
      filename: "x.pptx",
      theme: { id: "custom" },
      meta: {},
      assets: { images: bgImages },
      slides: [bare],
    } as unknown as PptxIR

    const ctx = buildCtx(tokens, {})
    const next = renderSvgMarkup(<ToneAdaptiveContent ir={deck} slide={bare} index={0} ctx={ctx} />)
    expect(next).toBe(EXPECTED_CONTENT_BARE_NO_BG)

    const ctxWithImg = buildCtx(tokens, bgImages)
    const nextBg = renderSvgMarkup(<ToneAdaptiveContent ir={deck} slide={bareWithBg} index={0} ctx={ctxWithImg} />)
    expect(nextBg).toBe(EXPECTED_CONTENT_BARE_WITH_BG)
  })

  it("tech tokens 下用 tech 的 text/muted/border/accent 色（证明 token 化成立，无 baked hex）", () => {
    const tokens = resolveStyle("tech")
    const ctx = buildCtx(tokens, {})
    const deck = ir("tech")
    const out = renderSvgMarkup(<ToneAdaptiveContent ir={deck} slide={content} index={1} ctx={ctx} />)

    expect(out).toContain(ctx.colors.text) // INK→text 语境：标题
    expect(out).toContain(ctx.colors.muted) // MUTED→muted：footnote
    expect(out).toContain(ctx.colors.accent) // 本就直接消费：kicker/subheading/divider
    expect(out).toContain(ctx.colors.border as string) // BORDER→border：divider 第二段

    // custom 自己的烤死常量不得残留（tech 的对应字段与 custom 均不同值）
    expect(ctx.colors.text).not.toBe("#18181B")
    expect(ctx.colors.muted).not.toBe("#71717A")
    expect(ctx.colors.border).not.toBe("#E4E4E7")
    expect(out).not.toContain("#18181B")
    expect(out).not.toContain("#71717A")
    expect(out).not.toContain("#E4E4E7")
  })

  it("跨主题 withBg 分支：白色卡片豁免跨主题保持不变，卡片内文字走对白卡可读的墨色（不切白字）", () => {
    const tokens = resolveStyle("tech")
    const ctxWithImg = buildCtx(tokens, bgImages)
    const deck = ir("tech", bgImages)
    const out = renderSvgMarkup(
      <ToneAdaptiveContent ir={deck} slide={contentWithBg} index={1} ctx={ctxWithImg} />,
    )

    expect(out).toContain('fill="#FFFFFF"') // 白色卡片豁免，跨主题不变
    // tech 的 colors.text 是浅色（对白卡不可读），卡片内文字必须是
    // accessibleInk 校正后的墨色——原始浅色一处都不得残留（此前该断言
    // 靠强调段 tspan 泄漏的裸浅色意外通过，泄漏封死后按意图重钉）
    const cardInk = accessibleInk(ctxWithImg.colors.text, "#FFFFFF", 44)
    expect(cardInk).not.toBe(ctxWithImg.colors.text)
    expect(out).toContain(`fill="${cardInk}"`)
    expect(out).not.toContain(`fill="${ctxWithImg.colors.text}"`)
    expect(cardInk).not.toBe("#FFFFFF")
  })

  // Ported from templates/custom.test.tsx's describe.each controlled-subset
  // check (Content row) — svg2pptx export guard.
  it("serializes to controlled-subset SVG (no gradient, no foreignObject)", () => {
    const tokens = LEGACY_CUSTOM_TOKENS
    const ctx = buildCtx(tokens, {})
    const deck = ir("custom")
    const markup = renderSvgMarkup(
      wrap(<ToneAdaptiveContent ir={deck} slide={content} index={1} ctx={ctx} />),
    )
    expect(markup).not.toContain("foreignObject")
    expect(markup).not.toContain("linearGradient")
    expect(markup).not.toContain("url(#")
    expect(markup).not.toContain("<defs")

    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  // Ported from templates/custom.test.tsx's "Content (with bg-image card) is
  // still controlled-subset and has no foreignObject".
  it("Content (with bg-image card) is still controlled-subset and has no foreignObject", () => {
    const tokens = LEGACY_CUSTOM_TOKENS
    const bgSlide: Slide = {
      type: "content",
      heading: "带背景卡片",
      components: [{ type: "paragraph", text: "卡内文字。" }],
      background: { kind: "asset", asset_id: "bg", fit: "cover" },
    } as Slide
    const deck: PptxIR = {
      version: "3",
      filename: "x.pptx",
      theme: { id: "custom" },
      meta: {},
      assets: { images: bgImages },
      slides: [bgSlide],
    } as unknown as PptxIR
    const ctxWithImg = buildCtx(tokens, bgImages)

    const markup = renderSvgMarkup(
      wrap(<ToneAdaptiveContent ir={deck} slide={bgSlide} index={0} ctx={ctxWithImg} />),
    )

    expect(markup).not.toContain("foreignObject")
    expect(markup).not.toContain("linearGradient")
    expect(markup).not.toContain("url(#")
    expect(markup).toContain("带背景卡片")

    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  // Ported from templates/custom.test.tsx's "Content (white bg) shrinks a
  // pathologically long heading onto <=2 lines".
  it("Content (white bg) shrinks a pathologically long heading onto <=2 lines", () => {
    const tokens = LEGACY_CUSTOM_TOKENS
    const ctx = buildCtx(tokens, {})
    const longSlide: Slide = {
      type: "content",
      heading: CJK_LONG,
      components: [{ type: "paragraph", text: "文本。" }],
    } as Slide
    const deck: PptxIR = {
      version: "3",
      filename: "x.pptx",
      theme: { id: "custom" },
      meta: {},
      assets: { images: {} },
      slides: [longSlide],
    } as unknown as PptxIR
    const markup = renderSvgMarkup(wrap(<ToneAdaptiveContent ir={deck} slide={longSlide} index={0} ctx={ctx} />))
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
    const headingTexts = Array.from(root.querySelectorAll("text")).filter((t) =>
      (t.textContent ?? "").includes("微服务"),
    )
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    // The full text must not survive as a single unbounded line: it should be
    // wrapped across multiple <text> lines at <=46pt.
    const allHeadingLines = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("fill") === ctx.colors.text && t.getAttribute("font-weight") === "700",
    )
    expect(allHeadingLines.length).toBeGreaterThan(1)
    for (const t of headingTexts) {
      const fontSize = Number(t.getAttribute("font-size"))
      expect(fontSize).toBeLessThanOrEqual(46)
    }
  })

  // Ported from templates/custom.test.tsx's describe "Content subheading
  // (Task 5)".
  describe("subheading (Task 5)", () => {
    const noBgBase: Slide = {
      type: "content",
      heading: "三大支柱",
      components: [{ type: "paragraph", text: "围绕三个方向推进。" }],
    } as Slide
    const withBgBase: Slide = {
      ...noBgBase,
      background: { kind: "asset", asset_id: "bg", fit: "cover" },
    } as Slide

    function buildDeck(slide: Slide, images: PptxIR["assets"]["images"] = {}): PptxIR {
      return {
        version: "3",
        filename: "x.pptx",
        theme: { id: "custom" },
        meta: {},
        assets: { images },
        slides: [slide],
      } as unknown as PptxIR
    }

    function dividerY(root: Element): number {
      return Number(root.querySelector("line")!.getAttribute("y1"))
    }

    describe("no-bg branch", () => {
      it("no subheading: divider/content stay at the pre-subheading formula (headingLastY + 32 / + 50)", () => {
        const tokens = LEGACY_CUSTOM_TOKENS
        const ctx = buildCtx(tokens, {})
        const deck = buildDeck(noBgBase)
        const markup = renderSvgMarkup(
          wrap(<ToneAdaptiveContent ir={deck} slide={noBgBase} index={0} ctx={ctx} />),
        )
        const root = parseSvgRoot(markup)
        expect(dividerY(root)).toBe(130 + 32)
        expect(root.querySelector('text[y="160"]')).toBeNull()
      })

      it("with subheading: renders in colors.accent at headingLastY+42 (S3b unified formula), pushing the divider/content down 46", () => {
        const tokens = LEGACY_CUSTOM_TOKENS
        const ctx = buildCtx(tokens, {})
        const slide: Slide = { ...noBgBase, subheading: "效率提升三成，风险敞口下降" } as Slide
        const deck = buildDeck(slide)
        const markup = renderSvgMarkup(wrap(<ToneAdaptiveContent ir={deck} slide={slide} index={0} ctx={ctx} />))
        const root = parseSvgRoot(markup)
        const sub = Array.from(root.querySelectorAll("text")).find((t) =>
          (t.textContent ?? "").includes("效率提升三成"),
        )!
        expect(sub.getAttribute("fill")).toBe(ctx.colors.accent)
        // S3b unified formula (46px title): headingLastY + 22+14+round(0.12*46) = +42
        expect(sub.getAttribute("y")).toBe(String(130 + 42))
        expect(dividerY(root)).toBe(130 + 32 + 46)
      })

      it("emphasis markup: ** ** segments invert to colors.text at fontWeight 700", () => {
        const tokens = LEGACY_CUSTOM_TOKENS
        const ctx = buildCtx(tokens, {})
        const slide: Slide = { ...noBgBase, subheading: "**效率提升三成**，风险敞口下降" } as Slide
        const deck = buildDeck(slide)
        const markup = renderSvgMarkup(wrap(<ToneAdaptiveContent ir={deck} slide={slide} index={0} ctx={ctx} />))
        const root = parseSvgRoot(markup)
        const tspan = Array.from(root.querySelectorAll("tspan")).find((t) =>
          (t.textContent ?? "").includes("效率提升三成"),
        )!
        expect(tspan.getAttribute("fill")).toBe(ctx.colors.text)
        expect(tspan.getAttribute("font-weight")).toBe("700")
      })

      it("overly long subheading shrinks to 16px then truncates", () => {
        const tokens = LEGACY_CUSTOM_TOKENS
        const ctx = buildCtx(tokens, {})
        const slide: Slide = { ...noBgBase, subheading: CJK_LONG.repeat(2) } as Slide
        const deck = buildDeck(slide)
        const markup = renderSvgMarkup(wrap(<ToneAdaptiveContent ir={deck} slide={slide} index={0} ctx={ctx} />))
        const root = parseSvgRoot(markup)
        const sub = Array.from(root.querySelectorAll("text")).find((t) =>
          (t.textContent ?? "").includes("微服务"),
        )!
        expect(sub.getAttribute("font-size")).toBe("16")
        expect((sub.textContent ?? "").endsWith("…")).toBe(true)
        expect(sub.textContent).not.toBe(CJK_LONG.repeat(2))
      })
    })

    describe("withBg branch", () => {
      it("no subheading: divider/content stay at the pre-subheading formula (headingLastY + 30 / + 48)", () => {
        const tokens = LEGACY_CUSTOM_TOKENS
        const ctxWithImg = buildCtx(tokens, bgImages)
        const deck = buildDeck(withBgBase, bgImages)
        const markup = renderSvgMarkup(
          wrap(<ToneAdaptiveContent ir={deck} slide={withBgBase} index={0} ctx={ctxWithImg} />),
        )
        const root = parseSvgRoot(markup)
        expect(dividerY(root)).toBe(168 + 30)
        expect(root.querySelector('text[y="198"]')).toBeNull()
      })

      it("with subheading: renders in colors.accent at headingLastY+42 (S3b unified formula), pushing the divider/content down 46", () => {
        const tokens = LEGACY_CUSTOM_TOKENS
        const ctxWithImg = buildCtx(tokens, bgImages)
        const slide: Slide = { ...withBgBase, subheading: "效率提升三成，风险敞口下降" } as Slide
        const deck = buildDeck(slide, bgImages)
        const markup = renderSvgMarkup(
          wrap(<ToneAdaptiveContent ir={deck} slide={slide} index={0} ctx={ctxWithImg} />),
        )
        const root = parseSvgRoot(markup)
        const sub = Array.from(root.querySelectorAll("text")).find((t) =>
          (t.textContent ?? "").includes("效率提升三成"),
        )!
        expect(sub.getAttribute("fill")).toBe(ctxWithImg.colors.accent)
        // S3b unified formula (44px title): headingLastY + 22+14+round(0.12*44) = +42
        expect(sub.getAttribute("y")).toBe(String(168 + 42))
        expect(dividerY(root)).toBe(168 + 30 + 46)
      })
    })
  })

  // Ported from templates/custom.test.tsx's describe "Content kicker (Task
  // 5b: accent, not muted)".
  describe("kicker (Task 5b: accent, not muted)", () => {
    const chapterFirst: Slide = { type: "chapter", heading: "第一章", components: [] } as Slide
    const withSection: Slide = {
      type: "content",
      heading: "三大支柱",
      components: [{ type: "paragraph", text: "正文。" }],
    } as Slide

    function findKicker(root: Element): Element {
      return Array.from(root.querySelectorAll("text")).find((t) =>
        (t.textContent ?? "").startsWith("Chapter"),
      )!
    }

    it("no-bg branch: kicker renders in ctx.colors.accent (was hardcoded muted before Task 5)", () => {
      const tokens = LEGACY_CUSTOM_TOKENS
      const ctx = buildCtx(tokens, {})
      const deck: PptxIR = {
        version: "3",
        filename: "x.pptx",
        theme: { id: "custom" },
        meta: {},
        assets: { images: {} },
        slides: [chapterFirst, withSection],
      } as unknown as PptxIR
      const markup = renderSvgMarkup(
        wrap(<ToneAdaptiveContent ir={deck} slide={withSection} index={1} ctx={ctx} />),
      )
      const root = parseSvgRoot(markup)
      const kicker = findKicker(root)
      expect(kicker.getAttribute("fill")).toBe(ctx.colors.accent)
      expect(kicker.getAttribute("fill")).not.toBe(ctx.colors.muted)
      expect(kicker.getAttribute("fill")).not.toBe("#71717A") // the old MUTED literal
    })

    it("withBg branch: kicker renders in ctx.colors.accent (card content ignores the bg-image fg swap)", () => {
      const tokens = LEGACY_CUSTOM_TOKENS
      const bgSlide: Slide = {
        ...withSection,
        background: { kind: "asset", asset_id: "bg", fit: "cover" },
      } as Slide
      const deck: PptxIR = {
        version: "3",
        filename: "x.pptx",
        theme: { id: "custom" },
        meta: {},
        assets: { images: bgImages },
        slides: [chapterFirst, bgSlide],
      } as unknown as PptxIR
      const ctxWithImg = buildCtx(tokens, bgImages)
      const markup = renderSvgMarkup(
        wrap(<ToneAdaptiveContent ir={deck} slide={bgSlide} index={1} ctx={ctxWithImg} />),
      )
      const root = parseSvgRoot(markup)
      const kicker = findKicker(root)
      expect(kicker.getAttribute("fill")).toBe(ctxWithImg.colors.accent)
    })
  })

  // Regression test for commit 181892a (P1 variety wave, task 3 fix round —
  // "fix(svg): guard tone-adaptive-content kicker fill with accessibleInk"),
  // which shipped without one of its own (P1 task 3's own minor finding,
  // carried to the P1 final review, carried again to roadmap.md's 跟进池).
  //
  // The kicker (section label) was the one text element in this archetype
  // that never got the accessibleInk contrast guard heading/subheading/
  // footer meta already had — both branches rendered it in raw
  // `colors.accent` regardless of background. The exact combo that exposed
  // it: consulting's theme, no-bg branch (`examples/basic.json` carries no
  // background-image slides, so this is the branch a real deck's auto-pick
  // actually reaches) — `accent` (#FFC72C) against consulting's page
  // background (#F7F7F2, `ctx.defaultBg`) measures ~1.452:1, far under the
  // 4.5:1 a 22px kicker needs. Reverting the fix (raw `fill={colors.accent}`
  // in the no-bg branch's kicker `<text>`) makes the second test below fail
  // — verified directly during implementation by temporarily reintroducing
  // that exact line and confirming this test goes red, then restoring it.
  describe("181892a regression: kicker clears contrast on consulting's no-bg page background (pre-fix ~1.452:1)", () => {
    const chapterFirst: Slide = { type: "chapter", heading: "第一章", components: [] } as Slide
    const withSection: Slide = {
      type: "content",
      heading: "三大支柱",
      components: [{ type: "paragraph", text: "正文。" }],
    } as Slide

    function findKicker(root: Element): Element {
      return Array.from(root.querySelectorAll("text")).find((t) =>
        (t.textContent ?? "").startsWith("Chapter"),
      )!
    }

    it("characterizes the pre-fix defect: consulting's raw accent fails the 22px kicker's required ratio against its own page background", () => {
      const tokens = resolveStyle("consulting")
      const ctx = buildCtx(tokens, {})
      // Pins the exact number this fix's own commit message and the P1
      // task 3 review both cite (~1.452:1) — independently recomputed here
      // via the same contrastRatio the archetype itself now guards with,
      // not copied from either source.
      const rawRatio = contrastRatio(tokens.colors.accent, ctx.defaultBg!)
      expect(rawRatio).toBeCloseTo(1.452, 3)
      expect(rawRatio).toBeLessThan(requiredContrastRatio(22))
    })

    it("no-bg branch: the rendered kicker's ink now clears the required ratio (accessibleInk-guarded, not raw colors.accent)", () => {
      const tokens = resolveStyle("consulting")
      const ctx = buildCtx(tokens, {})
      const deck: PptxIR = {
        version: "3",
        filename: "x.pptx",
        theme: { id: "consulting" },
        meta: {},
        assets: { images: {} },
        slides: [chapterFirst, withSection],
      } as unknown as PptxIR
      const markup = renderSvgMarkup(
        wrap(<ToneAdaptiveContent ir={deck} slide={withSection} index={1} ctx={ctx} />),
      )
      const root = parseSvgRoot(markup)
      const kicker = findKicker(root)
      const fill = kicker.getAttribute("fill")!
      const fontSize = Number(kicker.getAttribute("font-size"))

      // The actual regression guard: past this line reverting 181892a's
      // fix (fill={colors.accent} instead of fill={sectionLabelFill}) fails.
      expect(contrastRatio(fill, ctx.defaultBg!)).toBeGreaterThanOrEqual(requiredContrastRatio(fontSize))
      // Must be genuinely corrected, not coincidentally passing while still
      // being the raw (failing) token value.
      expect(fill).not.toBe(tokens.colors.accent)
      // Pins the exact formula the archetype uses (same background
      // reference as subheadingFill, this branch's own S3b precedent) —
      // catches a revert to raw colors.accent AND a wrong background/font-
      // size reference, not just "still not raw accent."
      expect(fill).toBe(accessibleInk(tokens.colors.accent, ctx.defaultBg!, fontSize))
    })
  })

  // Ported from templates/custom.test.tsx's describe "Content title accent
  // bar (Task 5c, candidate ①)".
  describe("title accent bar (Task 5c, candidate ①)", () => {
    const slide: Slide = {
      type: "content",
      heading: "三大支柱",
      components: [{ type: "paragraph", text: "正文。" }],
    } as Slide

    it("no-bg branch: divider splits into a 48px accent lead-in + thin remainder spanning the original x1..x2", () => {
      const tokens = LEGACY_CUSTOM_TOKENS
      const ctx = buildCtx(tokens, {})
      const deck: PptxIR = {
        version: "3",
        filename: "x.pptx",
        theme: { id: "custom" },
        meta: {},
        assets: { images: {} },
        slides: [slide],
      } as unknown as PptxIR
      const markup = renderSvgMarkup(
        wrap(<ToneAdaptiveContent ir={deck} slide={slide} index={0} ctx={ctx} />),
      )
      const root = parseSvgRoot(markup)
      const lines = Array.from(root.querySelectorAll("line"))
      expect(lines).toHaveLength(2)
      const [bar, rule] = lines
      expect(bar.getAttribute("x1")).toBe("64")
      expect(bar.getAttribute("x2")).toBe("112")
      expect(bar.getAttribute("stroke")).toBe(ctx.colors.accent)
      expect(bar.getAttribute("stroke-width")).toBe("4")
      expect(rule.getAttribute("x1")).toBe("112")
      expect(rule.getAttribute("x2")).toBe("1216") // unchanged original x2
      expect(rule.getAttribute("stroke")).toBe(ctx.colors.border ?? ctx.colors.muted)
      expect(rule.getAttribute("stroke-width")).toBe("1.6")
      // Zero geometry change: both segments still share the pre-Task-5 y.
      expect(bar.getAttribute("y1")).toBe(rule.getAttribute("y1"))
      expect(bar.getAttribute("y1")).toBe(String(130 + 32))
    })

    it("withBg branch: divider splits into a 48px accent lead-in + thin remainder spanning the original x1..x2", () => {
      const tokens = LEGACY_CUSTOM_TOKENS
      const bgSlide: Slide = {
        ...slide,
        background: { kind: "asset", asset_id: "bg", fit: "cover" },
      } as Slide
      const deck: PptxIR = {
        version: "3",
        filename: "x.pptx",
        theme: { id: "custom" },
        meta: {},
        assets: { images: bgImages },
        slides: [bgSlide],
      } as unknown as PptxIR
      const ctxWithImg = buildCtx(tokens, bgImages)
      const markup = renderSvgMarkup(
        wrap(<ToneAdaptiveContent ir={deck} slide={bgSlide} index={0} ctx={ctxWithImg} />),
      )
      const root = parseSvgRoot(markup)
      const lines = Array.from(root.querySelectorAll("line"))
      expect(lines).toHaveLength(2)
      const [bar, rule] = lines
      expect(bar.getAttribute("x1")).toBe("92")
      expect(bar.getAttribute("x2")).toBe("140")
      expect(bar.getAttribute("stroke")).toBe(ctxWithImg.colors.accent)
      expect(rule.getAttribute("x1")).toBe("140")
      expect(rule.getAttribute("x2")).toBe("1188") // unchanged original x2
      expect(bar.getAttribute("y1")).toBe(String(168 + 30))
    })
  })
})

// Ported from templates/custom.test.tsx's describe "custom tokens (Task
// 5b/5d)". These assert the raw `LEGACY_CUSTOM_TOKENS` token values rather than
// ToneAdaptiveContent's rendered markup — content is the only one of the five
// custom archetypes that actually consumes `colors.accent` (the token this
// split protects), so its distinctness from text/primary is load-bearing here
// specifically (the emphasis-reversal contrast bug the comment references).
// `cardStroke` has no natural home among the five custom archetypes — none of
// them render a card-shell that consumes it (it's consumed by
// components/kpi.tsx, components/icon-cards.tsx, components/callout.tsx,
// components/steps.tsx, all outside this migration's file scope) — kept here
// rather than dropped so the custom theme's token value isn't left untested
// once templates/custom.test.tsx is deleted.
describe("custom theme tokens (Task 5b/5d)", () => {
  it("accent is split from text/primary — fixes the backlog item where subheading emphasis-reversal lost all color contrast", () => {
    const tokens = LEGACY_CUSTOM_TOKENS
    expect(tokens.colors.accent).toBe("#3F3F46")
    expect(tokens.colors.accent).not.toBe(tokens.colors.text)
    expect(tokens.colors.accent).not.toBe(tokens.colors.primary)
    // text/primary are untouched — only accent moved.
    expect(tokens.colors.text).toBe("#18181B")
    expect(tokens.colors.primary).toBe("#18181B")
  })

  it("sets cardStroke for the shared kpi_cards/icon_cards/callout card shells", () => {
    const tokens = LEGACY_CUSTOM_TOKENS
    expect(tokens.colors.cardStroke).toBe("#E4E4E7")
  })
})
