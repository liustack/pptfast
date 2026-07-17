// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup } from "../serialize"
import { buildCtx } from "../FullSlideSvg"
import { getTheme } from "../../styles"
import { THEME_MANIFESTS } from "../../styles/manifest"
import { SplitDiagonalCover, readableOn } from "./cover-split-diagonal"
import type { PptxIR, Slide } from "@/ir"

const slide: Slide = {
  type: "cover",
  heading: "对角分割封面",
  subheading: "斜切线上的标题",
  blocks: [],
} as Slide
const ir = (theme: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    style: { id: theme },
    meta: { organization: "测试部", date: "2026-07" },
    assets: { images: {} },
    slides: [slide],
  }) as unknown as PptxIR

describe("SplitDiagonalCover", () => {
  it("academic tokens 下：标题存在、色块用 ctx.colors.primary", () => {
    const ctx = buildCtx(getTheme("academic"), {})
    const out = renderSvgMarkup(<SplitDiagonalCover ir={ir("academic")} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain("对角分割封面")
    expect(out).toContain(ctx.colors.primary) // #006A4E
  })

  it("tech tokens 下：色块颜色随 tokens 变化（证明零烤色）", () => {
    const ctx = buildCtx(getTheme("tech"), {})
    const out = renderSvgMarkup(<SplitDiagonalCover ir={ir("tech")} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain("#2DD4E6") // tech primary
    expect(out).not.toContain("#006A4E") // academic primary 不得残留
  })

  it("色块上文字对比度自适应：深色 primary（academic 深绿）配浅字、浅色 primary（tech 亮青）配深字", () => {
    // academic primary #006A4E 明度低 → 浅字
    expect(readableOn("#006A4E")).toBe("#FFFFFF")
    // tech primary #2DD4E6 明度高 → 深字
    expect(readableOn("#2DD4E6")).toBe("#0A0E14")
  })

  it("HexColor 短写/带 alpha 形态（schema 允许 3~8 位）：#RGB 展开、#RRGGBBAA 裁 alpha", () => {
    // 亮黄短写 #FFC ≡ #FFFFCC 明度高 → 深字（原实现按 0 明度错配白字的回归锁）
    expect(readableOn("#FFC")).toBe("#0A0E14")
    // 深绿带 alpha → 与 6 位判定一致
    expect(readableOn("#006A4EFF")).toBe("#FFFFFF")
    // 4 位 #RGBA：展开后裁 alpha
    expect(readableOn("#FFCF")).toBe("#0A0E14")
  })
})

describe("split-diagonal manifest 吸纳（新表达一次全主题生效）", () => {
  it("academic 与 tech 的 cover 允许集都含 split-diagonal", () => {
    expect(THEME_MANIFESTS.academic.archetypes.cover).toContain("split-diagonal")
    expect(THEME_MANIFESTS.tech.archetypes.cover).toContain("split-diagonal")
  })

  it("未吸纳的主题不含（journal/runway 的报头体是招牌，斜切不符，铺开裁决后的例外）", () => {
    expect(THEME_MANIFESTS.journal.archetypes.cover).not.toContain("split-diagonal")
    expect(THEME_MANIFESTS.runway.archetypes.cover).not.toContain("split-diagonal")
  })
})
