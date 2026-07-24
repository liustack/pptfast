// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { buildCtx } from "../FullSlideSvg"
import { CANONICAL_THEME_IDS, resolveStyle } from "../../themes"
import { THEME_DEFINITIONS } from "../../themes/definitions"
import { fitHeadingLines } from "../heading-fit"
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

  // task R2（svg-text-layout.ts 的 tokenize 无空格分支修复）：一个粘在
  // CJK 中间、自身不含空格的拉丁 run（本仓惯用语，本例 "OpenAPIGateway"）
  // 修复前会被本文件的 588px fitHeadingLines 预算从中间切断——实测修复前
  // 渲染输出（`git stash` 到修复前逐一核实过，见任务报告）：
  //   ["统一接入层OpenAPI", "Gateway让跨团队协", "作效率显著提升"]，font-size 60
  // "OpenAPIGateway" 被拆成 "OpenAPI" / "Gateway" 两截。下面钉的是修复后的
  // 行为。
  it("keeps a fused Latin run intact when wrapping a realistic English-glued-to-CJK heading (task R2 regression)", () => {
    const RUN = "OpenAPIGateway"
    const fusedHeading = "统一接入层OpenAPIGateway让跨团队协作效率显著提升"
    const fusedSlide: Slide = { type: "cover", heading: fusedHeading, components: [] } as Slide
    const ctx = buildCtx(resolveStyle("academic"), {})
    const out = renderSvgMarkup(
      <SplitDiagonalCover ir={ir("academic")} slide={fusedSlide} index={0} ctx={ctx} />,
    )
    const root = parseSvgRoot(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`,
    )
    // 标题净空区左缘 x=596（TITLE_X）+ fontWeight="700" 是标题 <text> 独有
    // 属性（subtitle/metaLine 同样画在 x=596，但不带 fontWeight），必须两者
    // 都匹配才能排除 metaLine（"测试部    ·    2026-07"）混进标题行数组。
    const titleLines = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("x") === "596" && t.getAttribute("font-weight") === "700",
    )
    const lineTexts = titleLines.map((t) => t.textContent)
    expect(lineTexts).toEqual(["统一接入层", "OpenAPIGateway让跨", "团队协作效率显著提升"])
    // run 必须整体落在某一行内，任何一行都不能从 run 内部切开
    expect(lineTexts.some((l) => l?.includes(RUN))).toBe(true)
    expect(titleLines[0]?.getAttribute("font-size")).toBe("53")

    const expected = fitHeadingLines(fusedHeading, {
      maxWidth: 1280 - 596 - 96,
      fontSize: 76,
      maxLines: 3,
      minPt: 44,
      fontFamily: ctx.fonts.heading,
    })
    // truncated:false 语义仍需准确：贪心 wrap 直接命中 3 行，从未落进
    // truncateToUnits。
    expect(expected.truncated).toBe(false)
    expect(lineTexts).toEqual(expected.lines)
  })
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
