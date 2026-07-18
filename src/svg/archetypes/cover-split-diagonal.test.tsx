// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup } from "../serialize"
import { buildCtx } from "../FullSlideSvg"
import { CANONICAL_THEME_IDS, resolveStyle } from "../../themes"
import { THEME_DEFINITIONS } from "../../themes/definitions"
import { SplitDiagonalCover } from "./cover-split-diagonal"
import type { PptxIR, Slide } from "@/ir"

const slide: Slide = {
  type: "cover",
  heading: "对角分割封面",
  subheading: "斜切线上的标题",
  components: [],
} as Slide
const ir = (theme: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: { organization: "测试部", date: "2026-07" },
    assets: { images: {} },
    slides: [slide],
  }) as unknown as PptxIR

describe("SplitDiagonalCover", () => {
  it("academic tokens 下：标题存在、色块用 ctx.colors.primary", () => {
    const ctx = buildCtx(resolveStyle("academic"), {})
    const out = renderSvgMarkup(<SplitDiagonalCover ir={ir("academic")} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain("对角分割封面")
    expect(out).toContain(ctx.colors.primary) // #006A4E
  })

  it("tech tokens 下：色块颜色随 tokens 变化（证明零烤色）", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const out = renderSvgMarkup(<SplitDiagonalCover ir={ir("tech")} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain("#2DD4E6") // tech primary
    expect(out).not.toContain("#006A4E") // academic primary 不得残留
  })

  // `readableOn`'s own contrast-adaptivity/hex-parsing unit tests moved to
  // `src/svg/ink.test.ts` (W4 fix round: extracted into a shared module —
  // see that file's own header). This describe block keeps only the
  // component-level render assertions.
})

// W4 全集放开（design decision 7，spec §3「缺省 = 全集」）后，cover 页型在
// 十三主题里没有任何策展排除（唯三例外只在 content，见 definitions.ts）——
// 本节原先记录的「journal/runway 不吸纳 split-diagonal」人工策展裁决已被
// 全集放开取代：那两个主题的 cover 允许集现在同样含 split-diagonal，全量
// 逐主题的钉值基线交给 definitions.test.ts 的全集断言维护（这里不重复），
// 只保留一条轻量烟雾测试证明这个 archetype 对每个主题都可达。
describe("split-diagonal 全集放开后对十三主题均可达（definitions.test.ts 持有逐主题钉值基线）", () => {
  it("every canonical theme's cover allowed set includes split-diagonal, including journal/runway (the old opt-out is retired by the full-set default)", () => {
    for (const id of CANONICAL_THEME_IDS) {
      expect(THEME_DEFINITIONS[id].layouts.cover, id).toContain("split-diagonal")
    }
  })
})
