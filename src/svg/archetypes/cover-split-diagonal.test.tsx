// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { buildCtx } from "../full-slide-svg"
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

  // task R2（svg-text-layout.ts 的 tokenize 无空格分支修复 + retry-ladder
  // scope extension）：一个粘在 CJK 中间、自身不含空格的拉丁 run（本仓
  // 惯用语）修复前会被本文件的 588px fitHeadingLines 预算从中间切断。
  //
  // R2 review 的 Important finding（test 诚实性）：上一轮实现把这里的钉子
  // 换成了 run 在 position ≥1（"OpenAPIGateway"，前面垫了 5 个 CJK 字符）
  // 的变体，回避了 brief 原始 repro——run 在 STRING POSITION 0（串首即
  // 拉丁 run）的场景。下面先恢复 brief 原文字面 pin 串作为主用例，
  // position ≥1 的钉子保留在本 describe 块末尾作为补充覆盖。
  it("the brief's own literal position-0 pin string genuinely resolves at this archetype's own (wider) budget — no mid-run break, real fix demonstrated (R2 review: restored primary case)", () => {
    const RUN = "Brandxxxxxxxxxxxxxxx"
    const literalPin = `${RUN}：让工程团队将大模型推理性能提升`
    const literalSlide: Slide = { type: "cover", heading: literalPin, components: [] } as Slide
    const ctx = buildCtx(resolveStyle("academic"), {})
    const out = renderSvgMarkup(
      <SplitDiagonalCover ir={ir("academic")} slide={literalSlide} index={0} ctx={ctx} />,
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
    expect(lineTexts).toEqual(["Brandxxxxxxxxxxxxxxx", "：让工程团队将大模型推理", "性能提升"])
    expect(lineTexts[0]).toBe(RUN) // run 独占第 1 行，从 position 0 起无切断
    expect(titleLines[0]?.getAttribute("font-size")).toBe("48")

    const expected = fitHeadingLines(literalPin, {
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

  // Sweep-derived regression（reviewer 实测阈值，见任务报告）：run 长度 15
  // 在这个预算下确实可以整体不切，与上面 20 字符的主用例一起构成"修复在
  // 真实可达范围内切实生效"的第二个独立证据点。
  it("a position-0 run of length 15 (the reviewer's own measured threshold) genuinely resolves — no mid-run break", () => {
    const RUN = "Brandxxxxxxxxxx"
    const heading15 = `${RUN}：让工程团队将大模型推理性能提升`
    const slide15: Slide = { type: "cover", heading: heading15, components: [] } as Slide
    const ctx = buildCtx(resolveStyle("academic"), {})
    const out = renderSvgMarkup(
      <SplitDiagonalCover ir={ir("academic")} slide={slide15} index={0} ctx={ctx} />,
    )
    const root = parseSvgRoot(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`,
    )
    const titleLines = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("x") === "596" && t.getAttribute("font-weight") === "700",
    )
    const lineTexts = titleLines.map((t) => t.textContent)
    expect(lineTexts).toEqual(["Brandxxxxxxxxxx", "：让工程团队将大模", "型推理性能提升"])
    expect(lineTexts[0]).toBe(RUN)
    expect(titleLines[0]?.getAttribute("font-size")).toBe("64")
    const expected = fitHeadingLines(heading15, {
      maxWidth: 1280 - 596 - 96,
      fontSize: 76,
      maxLines: 3,
      minPt: 44,
      fontFamily: ctx.fonts.heading,
    })
    expect(expected.truncated).toBe(false)
    expect(lineTexts).toEqual(expected.lines)
  })

  // Sweep-derived regression（reviewer 实测阈值）：run 长度 24 在这个预算
  // 下，即使收缩到本页面的 minPt=44，整行也放不下（run 自身宽度换算出的
  // 最佳"整体不切"字号只有 40——比 44 floor 低）。这是本任务设计明确要求
  // 的兜底条件（"run genuinely wider than a full line at minPt"）——落回
  // 拆分是设计上正确、经过验证的结果，不是残留缺陷；与上面 cover-left-
  // anchor 文件里 20 字符的兜底场景是同一机制在另一个真实预算点上的体现。
  it("a longer position-0 run (length 24) hits the documented minPt fallback boundary — falls back to the legacy split, never worse", () => {
    const RUN = "Brandxxxxxxxxxxxxxxxxxxx"
    const heading24 = `${RUN}：让工程团队将大模型推理性能提升`
    const slide24: Slide = { type: "cover", heading: heading24, components: [] } as Slide
    const ctx = buildCtx(resolveStyle("academic"), {})
    const out = renderSvgMarkup(
      <SplitDiagonalCover ir={ir("academic")} slide={slide24} index={0} ctx={ctx} />,
    )
    const root = parseSvgRoot(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`,
    )
    const titleLines = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("x") === "596" && t.getAttribute("font-weight") === "700",
    )
    const lineTexts = titleLines.map((t) => t.textContent)
    expect(lineTexts).toEqual(["Brandxxxxxxxxxxxxxx", "xxxxx：让工程团队将大", "模型推理性能提升"])
    expect(titleLines[0]?.getAttribute("font-size")).toBe("51")
    // 尽管发生了 mid-run 拆分，仍必须无丢字、无重排——拆分而非丢内容。
    expect(lineTexts.join("")).toBe(heading24)
    const expected = fitHeadingLines(heading24, {
      maxWidth: 1280 - 596 - 96,
      fontSize: 76,
      maxLines: 3,
      minPt: 44,
      fontFamily: ctx.fonts.heading,
    })
    expect(expected.truncated).toBe(false)
    expect(lineTexts).toEqual(expected.lines)
  })

  // Position ≥1（"OpenAPIGateway"，前面垫了 5 个 CJK 字符）：原始 R2
  // tokenize 修复已经独自解决——前导 CJK 吸收第 1 行预算，run 无需收缩
  // 字号即可整体换到第 2 行。保留作为补充覆盖（守护"已经工作的那一半"），
  // 不是本次 ladder 修复要验证的目标场景。
  it("keeps a fused Latin run intact when wrapping a realistic English-glued-to-CJK heading, run at position ≥1 (additional coverage — guards the already-working half)", () => {
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
