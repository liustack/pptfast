// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../themes"
import { ToneAdaptiveHeaderCover } from "./cover-tone-adaptive-header"
import type { PptxIR, Slide } from "@/ir"
import { LEGACY_CUSTOM_TOKENS } from "./legacy-custom-tokens"

function wrap(el: React.ReactElement): React.ReactElement {
  return <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">{el}</svg>
}

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// Frozen literal snapshots of ToneAdaptiveHeaderCover's own output under
// custom tokens — captured once from this component (not from the legacy
// `templates/custom.tsx` `CustomCover`, which templates/ deletion will remove)
// so this file has zero runtime dependency on templates/. custom tokens'
// text/primary/muted/border precisely matched the legacy INK/MUTED/BORDER
// constants at capture time (see file header's replacement-table note), so
// these literals also happen to equal what `CustomCover` used to render —
// that equivalence was verified via `toBe` before this migration, per the
// "无 CRITICAL 发现" report.
const EXPECTED_COVER_NO_BG =
  '<text x="64" y="74" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#71717A" opacity="1" letter-spacing="3" dominant-baseline="alphabetic">ACME</text><g><rect x="1086" y="50" width="130" height="44" rx="6" fill="none" stroke="#18181B" stroke-width="2" stroke-opacity="1"></rect><text x="1151" y="79" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#18181B" text-anchor="middle" dominant-baseline="alphabetic">内部</text></g><text x="64" y="392" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="92" font-weight="700" fill="#18181B" letter-spacing="-2" dominant-baseline="alphabetic">年度战略回顾</text><text x="64" y="450" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="34" fill="#71717A" opacity="1" dominant-baseline="alphabetic">增长与韧性</text><line x1="64" y1="600" x2="1216" y2="600" stroke="#E4E4E7" stroke-opacity="1" stroke-width="1.6"></line><text x="64" y="650" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="26" fill="#18181B" dominant-baseline="alphabetic">张三 · 分析师</text><text x="1216" y="650" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#71717A" text-anchor="end" dominant-baseline="alphabetic">2026 · v1</text>'
const EXPECTED_COVER_WITH_BG =
  '<rect width="1280" height="720" fill="#000000" opacity="0.38"></rect><text x="64" y="74" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#FFFFFF" opacity="0.8" letter-spacing="3" dominant-baseline="alphabetic">ACME</text><g><rect x="1086" y="50" width="130" height="44" rx="6" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-opacity="0.6"></rect><text x="1151" y="79" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#FFFFFF" text-anchor="middle" dominant-baseline="alphabetic">内部</text></g><text x="64" y="520" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="92" font-weight="700" fill="#FFFFFF" letter-spacing="-2" dominant-baseline="alphabetic">年度战略回顾</text><text x="64" y="578" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="34" fill="#FFFFFF" opacity="0.82" dominant-baseline="alphabetic">增长与韧性</text><text x="64" y="684" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#FFFFFF" opacity="0.7" dominant-baseline="alphabetic">张三 · 分析师  ·  2026  ·  v1</text>'

const slide: Slide = {
  type: "cover",
  heading: "年度战略回顾",
  subheading: "增长与韧性",
  components: [],
} as Slide

const bgImages: PptxIR["assets"]["images"] = {
  bg: { src: "data:image/png;base64,iVBOR", alt: "背景" },
}
const bgSlide: Slide = {
  ...slide,
  background: { kind: "asset", asset_id: "bg", fit: "cover" },
} as Slide

function ir(theme: string, images: PptxIR["assets"]["images"] = {}): PptxIR {
  return {
    version: "3",
    filename: "deck.pptx",
    theme: { id: theme },
    meta: {
      organization: "ACME",
      confidentiality: "internal",
      version: "v1",
      date: "2026",
      authors: [{ name: "张三", role: "分析师" }],
    },
    assets: { images },
    slides: [slide],
  } as unknown as PptxIR
}

// 档位判定：本文件的替换表（见 cover-tone-adaptive-header.tsx 文件头）三个
// 烤死常量（INK/MUTED/BORDER）全部与 custom token 表精确匹配、无孤儿色——
// custom 自己的 primary/text 当前同值，故在 custom 自己的 tokens 下，新
// archetype 的输出应与旧 CustomCover 逐字节一致（强于 Step D 档位一要求的
// "观感等价"）。跨主题断言证明这不是巧合抄同一份 hex，而是真正走
// ctx.colors。
describe("ToneAdaptiveHeaderCover", () => {
  describe("custom tokens 下输出锁定（迁移前已与旧 CustomCover 逐字节核对一致）", () => {
    it("无背景图分支", () => {
      const tokens = LEGACY_CUSTOM_TOKENS
      const ctx = buildCtx(tokens, {})
      const doc = ir("custom")
      const newOut = renderSvgMarkup(
        <ToneAdaptiveHeaderCover ir={doc} slide={slide} index={0} ctx={ctx} />,
      )
      expect(newOut).toBe(EXPECTED_COVER_NO_BG)
    })

    it("有背景图分支（withBg 白字/黑幕豁免）", () => {
      const tokens = LEGACY_CUSTOM_TOKENS
      const ctxWithImg = buildCtx(tokens, bgImages)
      const doc = ir("custom", bgImages)
      const newOut = renderSvgMarkup(
        <ToneAdaptiveHeaderCover ir={doc} slide={bgSlide} index={0} ctx={ctxWithImg} />,
      )
      expect(newOut).toBe(EXPECTED_COVER_WITH_BG)
    })
  })

  // Ported from templates/custom.test.tsx's describe.each controlled-subset
  // check (Cover row) — svg2pptx export guard: no forbidden elements, and
  // any fill="url(#...)" resolves to a declared gradient.
  it("serializes to controlled-subset SVG (no gradient, no foreignObject)", () => {
    const tokens = LEGACY_CUSTOM_TOKENS
    const ctx = buildCtx(tokens, {})
    const doc = ir("custom")
    const markup = renderSvgMarkup(
      wrap(<ToneAdaptiveHeaderCover ir={doc} slide={slide} index={0} ctx={ctx} />),
    )
    expect(markup).not.toContain("foreignObject")
    expect(markup).not.toContain("linearGradient")
    expect(markup).not.toContain("url(#")
    expect(markup).not.toContain("<defs")

    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  // Ported from templates/custom.test.tsx's "Cover shrinks a pathologically
  // long subheading instead of overflowing".
  it("shrinks a pathologically long subheading instead of overflowing", () => {
    const tokens = LEGACY_CUSTOM_TOKENS
    const ctx = buildCtx(tokens, {})
    const longSlide: Slide = { type: "cover", heading: "标题", subheading: CJK_LONG, components: [] } as Slide
    const doc = ir("custom")
    const markup = renderSvgMarkup(
      wrap(<ToneAdaptiveHeaderCover ir={doc} slide={longSlide} index={0} ctx={ctx} />),
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
    const subtitleTexts = Array.from(root.querySelectorAll("text")).filter((t) =>
      (t.textContent ?? "").includes("微服务"),
    )
    expect(subtitleTexts.length).toBe(1)
    const fontSize = Number(subtitleTexts[0].getAttribute("font-size"))
    expect(fontSize).toBeLessThan(34)
    expect(fontSize).toBeGreaterThanOrEqual(18)
  })

  it("tech tokens 下（无背景图）用 tech 的 primary/text/muted/border 色，custom 自己的烤色不再出现（证明真正 token 化）", () => {
    const tokens = resolveStyle("tech")
    const ctx = buildCtx(tokens, {})
    const doc = ir("tech")
    const out = renderSvgMarkup(
      <ToneAdaptiveHeaderCover ir={doc} slide={slide} index={0} ctx={ctx} />,
    )

    expect(out).toContain("年度战略回顾")
    expect(out).toContain(ctx.colors.text) // INK→text 语境：标题/徽标文案/作者名
    expect(out).toContain(ctx.colors.primary) // INK→primary 语境：保密徽标描边
    expect(out).toContain(ctx.colors.muted) // MUTED→muted：org/副标题/右下角meta
    expect(out).toContain(ctx.colors.border) // BORDER→border：底部分隔线

    // custom 自己的烤死常量不得残留（tech 的对应字段与 custom 均不同值）
    expect(ctx.colors.text).not.toBe("#18181B")
    expect(ctx.colors.primary).not.toBe("#18181B")
    expect(ctx.colors.muted).not.toBe("#71717A")
    expect(ctx.colors.border).not.toBe("#E4E4E7")
    expect(out).not.toContain("#18181B")
    expect(out).not.toContain("#71717A")
    expect(out).not.toContain("#E4E4E7")
  })

  it("withBg 分支跨主题：白字/黑幕豁免固定为纯白/纯黑，不随主题变化", () => {
    const tokens = resolveStyle("tech")
    const ctxWithImg = buildCtx(tokens, bgImages)
    const doc = ir("tech", bgImages)
    const out = renderSvgMarkup(
      <ToneAdaptiveHeaderCover ir={doc} slide={bgSlide} index={0} ctx={ctxWithImg} />,
    )

    expect(out).toContain('fill="#FFFFFF"')
    expect(out).toContain('fill="#000000"')
    // 有背景图时切到白字，不应再出现 tech 自己的 text/primary/muted/border
    expect(out).not.toContain(ctxWithImg.colors.text)
    expect(out).not.toContain(ctxWithImg.colors.primary)
    expect(out).not.toContain(ctxWithImg.colors.muted)
    expect(out).not.toContain(ctxWithImg.colors.border)
  })
})
