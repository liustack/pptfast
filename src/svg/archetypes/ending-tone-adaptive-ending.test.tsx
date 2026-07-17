// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../styles"
import { ToneAdaptiveEnding } from "./ending-tone-adaptive-ending"
import type { PptxIR, Slide } from "@/ir"
import { LEGACY_CUSTOM_TOKENS } from "./legacy-custom-tokens"

function wrap(el: React.ReactElement): React.ReactElement {
  return <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">{el}</svg>
}

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// Frozen literal snapshots of ToneAdaptiveEnding's own output under custom
// tokens — captured once from this component (not from the legacy
// `templates/custom.tsx` `CustomEnding`, which templates/ deletion will
// remove) so this file has zero runtime dependency on templates/. Verified
// byte-identical to the legacy output before this migration (see the
// "无 CRITICAL 发现" report).
const EXPECTED_ENDING_WITH_HEADING_NO_BG =
  '<text x="64" y="74" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#71717A" opacity="1" letter-spacing="3" dominant-baseline="alphabetic">维岚科技</text><text x="64" y="396" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="100" font-weight="700" fill="#18181B" letter-spacing="-2" dominant-baseline="alphabetic">衷心感谢</text><line x1="64" y1="520" x2="1216" y2="520" stroke="#E4E4E7" stroke-opacity="1" stroke-width="1.6"></line><text x="64" y="572" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#71717A" opacity="1" letter-spacing="4" dominant-baseline="alphabetic">联系</text><text x="64" y="608" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="28" fill="#18181B" dominant-baseline="alphabetic">李雷 · hi@weilan.example · weilan.example</text><text x="64" y="684" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#71717A" opacity="1" dominant-baseline="alphabetic">© 2026 维岚科技 保留所有权利</text>'
const EXPECTED_ENDING_BARE_NO_BG =
  '<text x="64" y="74" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#71717A" opacity="1" letter-spacing="3" dominant-baseline="alphabetic">维岚科技</text><text x="64" y="396" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="100" font-weight="700" fill="#18181B" letter-spacing="-2" dominant-baseline="alphabetic">谢谢</text><line x1="64" y1="520" x2="1216" y2="520" stroke="#E4E4E7" stroke-opacity="1" stroke-width="1.6"></line><text x="64" y="572" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#71717A" opacity="1" letter-spacing="4" dominant-baseline="alphabetic">联系</text><text x="64" y="608" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="28" fill="#18181B" dominant-baseline="alphabetic">李雷 · hi@weilan.example · weilan.example</text><text x="64" y="684" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#71717A" opacity="1" dominant-baseline="alphabetic">© 2026 维岚科技 保留所有权利</text>'
const EXPECTED_ENDING_WITH_HEADING_WITH_BG =
  '<rect width="1280" height="720" fill="#000000" opacity="0.32"></rect><text x="64" y="74" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#FFFFFF" opacity="0.8" letter-spacing="3" dominant-baseline="alphabetic">维岚科技</text><text x="64" y="396" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="100" font-weight="700" fill="#FFFFFF" letter-spacing="-2" dominant-baseline="alphabetic">衷心感谢</text><line x1="64" y1="520" x2="1216" y2="520" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="1.6"></line><text x="64" y="572" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#FFFFFF" opacity="0.6" letter-spacing="4" dominant-baseline="alphabetic">联系</text><text x="64" y="608" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="28" fill="#FFFFFF" dominant-baseline="alphabetic">李雷 · hi@weilan.example · weilan.example</text><text x="64" y="684" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#FFFFFF" opacity="0.55" dominant-baseline="alphabetic">© 2026 维岚科技 保留所有权利</text>'

// 有 heading 的 ending：标题原样渲染，不触发 `slide.heading || "谢谢"` 兜底。
const endingWithHeading: Slide = { type: "ending", heading: "衷心感谢", blocks: [] } as Slide

// 无 heading 的 ending：触发标题兜底"谢谢"——注意源函数（见文件头「副题兜底
// 语义」）完全没有 subheading 分支，无副题可兜底。
const endingBare: Slide = { type: "ending", blocks: [] } as Slide

const bgImages: PptxIR["assets"]["images"] = {
  bg: { src: "data:image/png;base64,iVBOR", alt: "背景" },
}
const endingWithHeadingAndBg: Slide = {
  ...endingWithHeading,
  background: { kind: "asset", asset_id: "bg", fit: "cover" },
} as Slide

function ir(theme: string, slide: Slide, images: PptxIR["assets"]["images"] = {}): PptxIR {
  return {
    version: "3",
    filename: "deck.pptx",
    theme: { id: theme },
    meta: {
      organization: "维岚科技",
      authors: [{ name: "李雷", role: "顾问" }],
      contact: { email: "hi@weilan.example", website: "weilan.example" },
      copyright: "© 2026 维岚科技 保留所有权利",
    },
    assets: { images },
    slides: [slide],
  } as unknown as PptxIR
}

// 档位判定：本文件的替换表（见 ending-tone-adaptive-ending.tsx 文件头）三个
// 烤死常量 INK/MUTED/BORDER 均与 custom token 表精确匹配、无孤儿色——
// `#F0F0F0` 已核实不在 CustomEnding 函数体消费范围内。custom 自己的
// tokens 下，新 archetype 的输出应与旧 CustomEnding 逐字节一致（档位一）。
// 跨主题断言证明这不是巧合抄同一份 hex，而是真正走 ctx.colors。
describe("ToneAdaptiveEnding", () => {
  describe("custom tokens 下输出锁定（迁移前已与旧 CustomEnding 逐字节核对一致）", () => {
    it("无背景图分支，heading 存在时不兜底", () => {
      const tokens = LEGACY_CUSTOM_TOKENS
      const ctx = buildCtx(tokens, {})
      const deck = ir("custom", endingWithHeading)

      const next = renderSvgMarkup(
        <ToneAdaptiveEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
      )
      expect(next).toBe(EXPECTED_ENDING_WITH_HEADING_NO_BG)
      expect(next).toContain("衷心感谢")
      expect(next).not.toContain("谢谢")
    })

    it("无背景图分支，heading 缺省时兜底渲染“谢谢”", () => {
      const tokens = LEGACY_CUSTOM_TOKENS
      const ctx = buildCtx(tokens, {})
      const deck = ir("custom", endingBare)

      const next = renderSvgMarkup(
        <ToneAdaptiveEnding ir={deck} slide={endingBare} index={0} ctx={ctx} />,
      )
      expect(next).toBe(EXPECTED_ENDING_BARE_NO_BG)
      expect(next).toContain("谢谢")
    })

    it("有背景图分支（withBg 白字/黑幕豁免）", () => {
      const tokens = LEGACY_CUSTOM_TOKENS
      const ctxWithImg = buildCtx(tokens, bgImages)
      const deck = ir("custom", endingWithHeadingAndBg, bgImages)
      const next = renderSvgMarkup(
        <ToneAdaptiveEnding ir={deck} slide={endingWithHeadingAndBg} index={0} ctx={ctxWithImg} />,
      )
      expect(next).toBe(EXPECTED_ENDING_WITH_HEADING_WITH_BG)
    })
  })

  // Ported from templates/custom.test.tsx's describe.each controlled-subset
  // check (Ending row) — merged with the "shrinks a pathologically long
  // custom heading instead of overflowing" case (both used assertSubset on a
  // CJK_LONG heading in the old file's structure, but the describe.each row
  // used the short `endingSlide` fixture — both are covered below).
  it("serializes to controlled-subset SVG (no gradient, no foreignObject)", () => {
    const tokens = LEGACY_CUSTOM_TOKENS
    const ctx = buildCtx(tokens, {})
    const deck = ir("custom", endingWithHeading)
    const markup = renderSvgMarkup(
      wrap(<ToneAdaptiveEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />),
    )
    expect(markup).not.toContain("foreignObject")
    expect(markup).not.toContain("linearGradient")
    expect(markup).not.toContain("url(#")
    expect(markup).not.toContain("<defs")

    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  // Ported from templates/custom.test.tsx's "Ending shrinks a pathologically
  // long custom heading instead of overflowing".
  it("shrinks a pathologically long custom heading instead of overflowing", () => {
    const tokens = LEGACY_CUSTOM_TOKENS
    const ctx = buildCtx(tokens, {})
    const longSlide: Slide = { type: "ending", heading: CJK_LONG, blocks: [] } as Slide
    const deck = ir("custom", longSlide)
    const markup = renderSvgMarkup(
      wrap(<ToneAdaptiveEnding ir={deck} slide={longSlide} index={0} ctx={ctx} />),
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  // Ported from templates/custom.test.tsx's describe "Ending: two-line title
  // reflow (S3b addendum, 2026-07-07)".
  describe("two-line title reflow (S3b addendum, 2026-07-07)", () => {
    it("last-line-anchored: a 2-line heading's last line lands at the same y (396) as the 1-line case, so the divider/contact/copyright chain below is byte-identical regardless of line count", () => {
      // "从今天开始用声明式管理你" (12 CJK chars) is the shortest input that
      // forces wrapping here (maxWidth=1152/fontSize=100) while staying at
      // the *nominal* 100px (not shrunk) — the worst case for lineHeight.
      const twoLineSlide: Slide = { type: "ending", heading: "从今天开始用声明式管理你", blocks: [] } as Slide
      const oneLineSlide: Slide = { type: "ending", heading: "谢谢", blocks: [] } as Slide
      const tokens = LEGACY_CUSTOM_TOKENS
      const ctx = buildCtx(tokens, {})

      const twoLineRoot = parseSvgRoot(
        renderSvgMarkup(
          wrap(<ToneAdaptiveEnding ir={ir("custom", twoLineSlide)} slide={twoLineSlide} index={0} ctx={ctx} />),
        ),
      )
      const oneLineRoot = parseSvgRoot(
        renderSvgMarkup(
          wrap(<ToneAdaptiveEnding ir={ir("custom", oneLineSlide)} slide={oneLineSlide} index={0} ctx={ctx} />),
        ),
      )

      const twoLineHeadingTexts = Array.from(twoLineRoot.querySelectorAll("text")).filter(
        (t) => t.getAttribute("font-weight") === "700" && t.getAttribute("letter-spacing") === "-2",
      )
      expect(twoLineHeadingTexts.length).toBe(2)
      expect(Number(twoLineHeadingTexts[0].getAttribute("font-size"))).toBe(100) // nominal, not shrunk
      const ys = twoLineHeadingTexts.map((t) => Number(t.getAttribute("y"))).sort((a, b) => a - b)
      const [firstY, lastY] = ys
      expect(firstY).toBe(396 - 108) // HEADING_LAST_BASELINE(396) - lineHeight(round(100*1.08)=108)
      expect(lastY).toBe(396) // invariant — same as the 1-line baseline

      const oneLineHeading = Array.from(oneLineRoot.querySelectorAll("text")).find(
        (t) => t.textContent === "谢谢",
      )!
      expect(oneLineHeading.getAttribute("y")).toBe("396")

      const twoLineDivider = twoLineRoot.querySelector("line")!
      const oneLineDivider = oneLineRoot.querySelector("line")!
      expect(twoLineDivider.getAttribute("y1")).toBe(oneLineDivider.getAttribute("y1"))
    })
  })

  it("tech tokens 下（无背景图）用 tech 的 text/muted/border，custom 自己的烤色不再出现（证明真正 token 化）", () => {
    const tokens = resolveStyle("tech")
    const ctx = buildCtx(tokens, {})
    const deck = ir("tech", endingWithHeading)
    const out = renderSvgMarkup(
      <ToneAdaptiveEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )

    expect(out).toContain("衷心感谢")
    expect(out).toContain(ctx.colors.text) // INK→text 语境：主标题/联系正文
    expect(out).toContain(ctx.colors.muted) // MUTED→muted：org/联系标签/版权
    expect(out).toContain(ctx.colors.border ?? ctx.colors.muted) // BORDER→border：分隔线

    // custom 自己的烤死常量不得残留（tech 的 text/muted/border 均与 custom 不同值）
    expect(ctx.colors.text).not.toBe("#18181B")
    expect(ctx.colors.muted).not.toBe("#71717A")
    expect(ctx.colors.border).not.toBe("#E4E4E7")
    expect(out).not.toContain("#18181B")
    expect(out).not.toContain("#71717A")
    expect(out).not.toContain("#E4E4E7")
    // #F0F0F0 不属于本函数的消费范围（见文件头核实），跨主题都不应出现
    expect(out).not.toContain("#F0F0F0")
  })

  it("withBg 分支跨主题：白字/黑幕豁免固定为纯白/纯黑，不随主题变化", () => {
    const tokens = resolveStyle("tech")
    const ctxWithImg = buildCtx(tokens, bgImages)
    const deck = ir("tech", endingWithHeadingAndBg, bgImages)
    const out = renderSvgMarkup(
      <ToneAdaptiveEnding ir={deck} slide={endingWithHeadingAndBg} index={0} ctx={ctxWithImg} />,
    )

    expect(out).toContain('fill="#FFFFFF"')
    expect(out).toContain('fill="#000000"')
    // 有背景图时切到白字，不应再出现 tech 自己的 text/muted/border
    expect(out).not.toContain(ctxWithImg.colors.text)
    expect(out).not.toContain(ctxWithImg.colors.muted)
  })
})
