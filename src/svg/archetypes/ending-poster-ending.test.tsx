// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { getTheme } from "../../themes"
import { PosterEnding } from "./ending-poster-ending"
import type { PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

function render(body: React.ReactElement): { markup: string; root: Element } {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

// 有 heading 的 ending：标题原样渲染，副标题原样渲染，不触发任一兜底。
const endingWithHeading: Slide = {
  type: "ending",
  heading: "感谢聆听",
  subheading: "期待与你继续探讨",
  blocks: [],
} as Slide

// 无 heading（也无 subheading）的 ending：主标题兜底"提问与讨论"，且
// slide.heading 缺省触发副标题连带兜底"Questions & Discussion"（见文件头
// "副题兜底语义"，仅 heading 也缺省才兜底副题）。
const endingBare: Slide = { type: "ending", blocks: [] } as Slide

const ir = (theme: string, slide: Slide): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    style: { id: theme },
    meta: {
      organization: "维岚科技",
      contact: { email: "hi@weilan.example" },
      copyright: "© 2026 维岚科技 保留所有权利",
      authors: [{ name: "李雷" }],
    },
    assets: { images: {} },
    slides: [slide],
  }) as unknown as PptxIR

// 档位二（观感等价档，见文件头"孤儿色处理"）：META_MUTED（#666670）在
// creative token 表里没有精确匹配，并入 ctx.colors.muted——验收退化为结构性
// 锚点 + 内容存在 + 归并掉的孤儿色不再出现，而非逐字节 toBe。
describe("PosterEnding", () => {
  it("creative tokens 下居中标题、accent 短横条走 primary（RED≡primary）、meta 合并行走 muted，heading 存在时不触发任何兜底", () => {
    const ctx = buildCtx(getTheme("insight"), {})
    const deck = ir("insight", endingWithHeading)
    const out = renderSvgMarkup(
      <PosterEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )

    // 标题 / 副标题 / meta 内容存在，不触发主标题兜底、不触发副标题兜底
    expect(out).toContain("感谢聆听")
    expect(out).toContain("期待与你继续探讨")
    expect(out).not.toContain("提问与讨论")
    expect(out).not.toContain("Questions")
    expect(out).toContain("维岚科技")
    expect(out).toContain("hi@weilan.example")
    expect(out).toContain("李雷")
    expect(out).toContain("© 2026 维岚科技 保留所有权利")

    // 结构性锚点：居中标题/副标题/meta 均 text-anchor middle，短横条是 rect
    expect(out).toContain('text-anchor="middle"')
    expect(out).toContain('width="60" height="4"')

    // RED 经 ctx.colors.primary 而来，与 creative primary 逐字节相同
    expect(out).toContain("#E63946")
    // creative accent（暖棕）不应出现——RED 不映射到 accent
    expect(out).not.toContain("#D4A57C")
    // META_MUTED（#666670）已并入 muted，不得残留
    expect(out).not.toContain("#666670")
  })

  it("consulting tokens 下用 consulting 自己的 primary/text/muted/border，creative 烤色不残留（token 化成立）", () => {
    const ctx = buildCtx(getTheme("consulting"), {})
    const deck = ir("consulting", endingWithHeading)
    const out = renderSvgMarkup(
      <PosterEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )

    expect(out).toContain("#051C2C") // consulting primary，短横条 + text
    expect(out).toContain("#6C6C6C") // consulting muted，副标题/meta 行
    expect(out).toContain("#D5D5CB") // consulting border，分隔线

    // creative 烤死的 hex 一律不得残留
    expect(out).not.toContain("#E63946")
    expect(out).not.toContain("#F5F5F5")
    expect(out).not.toContain("#888892")
    expect(out).not.toContain("#2A2A2E")
    expect(out).not.toContain("#666670")
  })

  it("creative tokens 下无 heading 时主标题兜底“提问与讨论”，且连带触发副标题兜底“Questions & Discussion”", () => {
    const ctx = buildCtx(getTheme("insight"), {})
    const deck = ir("insight", endingBare)
    const out = renderSvgMarkup(<PosterEnding ir={deck} slide={endingBare} index={0} ctx={ctx} />)

    expect(out).toContain("提问与讨论")
    expect(out).toContain("Questions &amp; Discussion")
  })

  // 回填缺省分支：heading 存在但 subheading 缺省时，源函数的兜底表达式
  // `slide.subheading || (slide.heading ? "" : "Questions & Discussion")`
  // 求值为空字符串（heading 已存在，不触发 Q&A 连带兜底）——`{subheading.text
  // && (...)}` 因而完全不渲染该 <text> 元素。这与 endingBare（heading 和
  // subheading 都缺省，触发 Q&A 兜底）是两条不同的分支，此前未被单独断言过。
  it("heading 存在但 subheading 缺省：既不渲染用户副标题，也不触发 Q&A 连带兜底（不同于 heading 也缺省的 endingBare 分支）", () => {
    const ctx = buildCtx(getTheme("insight"), {})
    const slide: Slide = { type: "ending", heading: "感谢聆听", blocks: [] } as Slide
    const deck = ir("insight", slide)
    const out = renderSvgMarkup(<PosterEnding ir={deck} slide={slide} index={0} ctx={ctx} />)

    expect(out).toContain("感谢聆听")
    expect(out).not.toContain("Questions")
    expect(out).not.toContain("提问与讨论")

    const { root } = render(<PosterEnding ir={deck} slide={slide} index={0} ctx={ctx} />)
    // Subheading's structural signature: italic + muted + centered. Nothing
    // else on this archetype shares all three (the heading is italic but
    // colors.text, the meta line is centered but not italic), so an absence
    // here means the subheading slot rendered nothing at all.
    const subheadingLike = Array.from(root.querySelectorAll("text")).filter(
      (t) =>
        t.getAttribute("font-style") === "italic" &&
        t.getAttribute("fill") === ctx.colors.muted &&
        t.getAttribute("text-anchor") === "middle",
    )
    expect(subheadingLike.length).toBe(0)
  })

  it("shrinks a pathologically long custom heading instead of overflowing", () => {
    const longSlide: Slide = { type: "ending", heading: CJK_LONG, subheading: CJK_LONG, blocks: [] } as Slide
    const ctx = buildCtx(getTheme("insight"), {})
    const deck = ir("insight", longSlide)
    const { root } = render(<PosterEnding ir={deck} slide={longSlide} index={0} ctx={ctx} />)
    expect(() => assertSubset(root)).not.toThrow()
  })

  describe("two-line title reflow (S3b addendum, 2026-07-07)", () => {
    it("last-line-anchored: a 2-line heading's last line lands at the same y (424) as the 1-line case, so the accent/subheading/divider/meta chain below is byte-identical regardless of line count", () => {
      // "从今天开始用声明" (8 CJK chars) is the shortest input that forces
      // wrapping here (maxWidth=1152/fontSize=150 -> ~7.68 units/line) while
      // staying at the *nominal* 150px (not shrunk) — ported verbatim from
      // templates/creative.test.tsx, same fixture/formula since PosterEnding
      // is the same construction under token replacement.
      const twoLineSlide: Slide = { type: "ending", heading: "从今天开始用声明", blocks: [] } as Slide
      const oneLineSlide: Slide = { type: "ending", heading: "提问与讨论", blocks: [] } as Slide
      const ctx = buildCtx(getTheme("insight"), {})

      const { root: twoLineRoot } = render(
        <PosterEnding ir={ir("insight", twoLineSlide)} slide={twoLineSlide} index={0} ctx={ctx} />,
      )
      const { root: oneLineRoot } = render(
        <PosterEnding ir={ir("insight", oneLineSlide)} slide={oneLineSlide} index={0} ctx={ctx} />,
      )

      const twoLineHeadingTexts = Array.from(twoLineRoot.querySelectorAll("text")).filter(
        (t) => t.getAttribute("font-weight") === "800" && t.getAttribute("text-anchor") === "middle",
      )
      expect(twoLineHeadingTexts.length).toBe(2)
      expect(Number(twoLineHeadingTexts[0].getAttribute("font-size"))).toBe(150) // nominal, not shrunk
      const ys = twoLineHeadingTexts.map((t) => Number(t.getAttribute("y"))).sort((a, b) => a - b)
      const [firstY, lastY] = ys
      expect(firstY).toBe(424 - 162) // HEADING_LAST_BASELINE(424) - lineHeight(round(150*1.08)=162)
      expect(lastY).toBe(424) // invariant — same as the 1-line baseline

      const oneLineHeading = Array.from(oneLineRoot.querySelectorAll("text")).find(
        (t) => t.textContent === "提问与讨论",
      )!
      expect(oneLineHeading.getAttribute("y")).toBe("424")

      const twoLineAccentBar = Array.from(twoLineRoot.querySelectorAll("rect")).find(
        (r) => r.getAttribute("width") === "60" && r.getAttribute("height") === "4",
      )!
      const oneLineAccentBar = Array.from(oneLineRoot.querySelectorAll("rect")).find(
        (r) => r.getAttribute("width") === "60" && r.getAttribute("height") === "4",
      )!
      expect(twoLineAccentBar.getAttribute("y")).toBe(oneLineAccentBar.getAttribute("y"))
      // Accent bar must not sit inside the second line's own glyph span —
      // the reported bug (accent bar piercing the second line's glyphs).
      // CJK glyph descent ≈ baseline + 0.12*fontSize: lastY(424) +
      // round(0.12*150) = 424+18 = 442.
      expect(Number(twoLineAccentBar.getAttribute("y"))).toBeGreaterThanOrEqual(414)
    })

    it("user-reported repro heading ('从今天开始，用声明式管理你的集群') renders with the whole downstream chain within the page", () => {
      const slide: Slide = { type: "ending", heading: "从今天开始，用声明式管理你的集群", blocks: [] } as Slide
      const ctx = buildCtx(getTheme("insight"), {})
      const { root } = render(<PosterEnding ir={ir("insight", slide)} slide={slide} index={0} ctx={ctx} />)
      const allYs = Array.from(root.querySelectorAll("text")).map((t) => Number(t.getAttribute("y")))
      expect(Math.max(...allYs)).toBeLessThanOrEqual(714)
    })
  })
})
