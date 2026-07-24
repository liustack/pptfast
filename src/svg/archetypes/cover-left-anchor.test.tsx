// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../themes"
import { assertSubset } from "../subset-validate"
import { fitHeadingLines } from "../heading-fit"
import { readableOn } from "../ink"
import { LeftAnchorCover } from "./cover-left-anchor"
import type { PptxIR, Slide } from "@/ir"

// BrandChrome's brand logo bands (see templates/academic.test.tsx's own
// LOGO_BANDS) — the confidentiality badge sits top-right (y=104, not 64,
// specifically to clear TR_LOGO).
const TL_LOGO = { x: 64, y: 48, w: 96, h: 40 }
const TR_LOGO = { x: 1120, y: 48, w: 96, h: 40 }
const BL_LOGO = { x: 64, y: 630, w: 96, h: 40 }
const BR_LOGO = { x: 1120, y: 630, w: 96, h: 40 }
const LOGO_BANDS = [TL_LOGO, TR_LOGO, BL_LOGO, BR_LOGO]

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

const slide: Slide = {
  type: "cover",
  heading: "创新前沿",
  subheading: "面向未来的实证研究",
  components: [],
} as Slide
const ir = (theme: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: { organization: "测试所", date: "2026-07" },
    assets: { images: {} },
    slides: [slide],
  }) as unknown as PptxIR

// 档位二（观感等价档，见文件头注释的"装饰色豁免"说明）：`TRIANGLE_DEEP`
// 是色块角落三角形的纯装饰同色系深色，语义上不对应任何 token 字段——不并入
// `colors.primary`（那会让三角形与背景色块同色而彻底隐形，是观感被破坏而非
// 等价），原样保留为文件私有 hex 常量。验收：结构锚点 + 内容存在 + 该装饰
// hex（同白字例外一样）跨主题稳定出现，而非逐字节 toBe。
describe("LeftAnchorCover", () => {
  it("academic tokens 下渲染左侧色块 + 白字标题 + 未隐形的装饰三角（TRIANGLE_DEEP）", () => {
    const ctx = buildCtx(resolveStyle("academic"), {})
    const out = renderSvgMarkup(<LeftAnchorCover ir={ir("academic")} slide={slide} index={0} ctx={ctx} />)

    // 标题文本存在
    expect(out).toContain("创新前沿")
    // 结构性锚点：40%宽（512px）通栏色块 + 其角落的装饰三角形
    expect(out).toContain('width="512"')
    expect(out).toContain("0,720 0,520 200,720")
    // 白字例外：标题在色块上固定纯白，不是主题色
    expect(out).toContain('fill="#FFFFFF"')
    // academic 自己的 primary 用在色块上
    expect(out).toContain("#006A4E")
    // 装饰豁免色原样保留、未被并入 primary——三角形在 academic 下仍然可见
    // （与 primary 的 #006A4E 不同色，是它本该有的"深一号"视觉对比）
    expect(out).toContain("#004C38")
  })

  it("tech tokens 下用 tech 的 primary/accent 色，标题对比度自适应出深字，装饰三角豁免跨主题保持不变（证明 token 化成立）", () => {
    const techTokens = resolveStyle("tech")
    const ctx = buildCtx(techTokens, {})
    const out = renderSvgMarkup(<LeftAnchorCover ir={ir("tech")} slide={slide} index={0} ctx={ctx} />)

    expect(out).toContain("#2DD4E6") // tech primary === accent
    expect(out).not.toContain("#006A4E") // academic primary 不得残留
    // W4 fix round: 标题不再固定纯白——design decision 8 的实测发现白字 on
    // tech 亮青 primary（#2DD4E6）只有 ~1.80:1，一度靠策展排除
    // （COVER_WITHOUT_LEFT_ANCHOR）处理。改用 readableOn(colors.primary) 后
    // tech 落中性深墨（#0A0E14，对比度 ~10.75:1），不再出现纯白。
    const expectedInk = readableOn(techTokens.colors.primary)
    expect(expectedInk).toBe("#0A0E14")
    expect(out).toContain(`fill="${expectedInk}"`)
    expect(out).not.toContain('fill="#FFFFFF"')
    // 装饰豁免色是文件私有常量，不随主题变化——跨主题依然渲染同一个 hex
    expect(out).toContain("#004C38")
  })

  it("academic tokens 下标题仍是纯白——readableOn 对当前既有策展主题（academic 是本文件唯一 pre-W4 owner）产出与旧硬编码逐字节相同的结果", () => {
    const academicTokens = resolveStyle("academic")
    const ctx = buildCtx(academicTokens, {})
    const out = renderSvgMarkup(<LeftAnchorCover ir={ir("academic")} slide={slide} index={0} ctx={ctx} />)
    expect(readableOn(academicTokens.colors.primary)).toBe("#FFFFFF")
    expect(out).toContain('fill="#FFFFFF"')
  })

  it("org 文本渲染在右侧白面板（translate(576,168)），Cover body 通过 subset validation（迁移自 academic.test.tsx）", () => {
    const ctx = buildCtx(resolveStyle("academic"), {})
    const out = renderSvgMarkup(<LeftAnchorCover ir={ir("academic")} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain("测试所")

    const root = parseSvgRoot(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`,
    )
    const orgGroup = Array.from(root.querySelectorAll("g")).find((g) =>
      g.getAttribute("transform")?.startsWith("translate(576,"),
    )
    expect(orgGroup).toBeTruthy()

    expect(() => assertSubset(root)).not.toThrow()
  })

  describe("标题过长换行收缩（迁移自 academic.test.tsx 的 'Cover title leaves a real margin' 分支，user-reported 2026-07-08）", () => {
    const REPORTED_HEADING = "DSpark：让大模型推理快 60-85% 的工程突破"

    it("wraps to 3 lines and shrinks to fontSize=47 — matches fitHeadingLines(maxWidth=360) directly", () => {
      const reportedSlide: Slide = { type: "cover", heading: REPORTED_HEADING, components: [] } as Slide
      const ctx = buildCtx(resolveStyle("academic"), {})
      const out = renderSvgMarkup(
        <LeftAnchorCover ir={ir("academic")} slide={reportedSlide} index={0} ctx={ctx} />,
      )
      const root = parseSvgRoot(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`,
      )
      const titleLines = Array.from(root.querySelectorAll("text")).filter(
        (t) => t.getAttribute("x") === "64" && t.getAttribute("fill") === "#FFFFFF",
      )
      expect(titleLines.length).toBe(3)
      // bold-metrics fix (2026-07-24): 44, not the pre-fix 47 -- this
      // heading renders `fontWeight="600"` (LeftAnchorCover.tsx), academic's
      // heading face resolves to Georgia, and Georgia Bold's real per-
      // character advances (the round-2 exact model, svg-text-layout.ts's
      // `GEORGIA_BOLD_EXACT`) size this line a hair larger than round 1's
      // class-average-plus-margin estimate did (43) -- this string's actual
      // character composition (mostly CJK, plus "DSpark" and the digits
      // "60-85") doesn't concentrate the wide-character risk round 1's
      // margin was blindly defending against everywhere. Re-pinned twice
      // now (47 pre-fix -> 43 round 1 -> 44 round 2), never blindly `-u`'d:
      // see this fix's report for the full re-pin list and the round-2
      // aesthetic-comparison data this delta is one data point of.
      expect(titleLines[0].getAttribute("font-size")).toBe("44")

      const expected = fitHeadingLines(REPORTED_HEADING, {
        maxWidth: 360,
        fontSize: 64,
        maxLines: 3,
        minPt: 32,
        fontFamily: ctx.fonts.heading,
      })
      expect(titleLines.map((t) => t.textContent)).toEqual(expected.lines)
      expect(Number(titleLines[0].getAttribute("font-size"))).toBe(expected.fontSize)
    })

    it("a longer stress title that wraps further also stays within the same maxWidth budget (no per-title exception)", () => {
      const longer =
        "DSpark：让大规模语言模型推理速度提升 60-85% 的关键工程突破与实践路径"
      const longerSlide: Slide = { type: "cover", heading: longer, components: [] } as Slide
      const ctx = buildCtx(resolveStyle("academic"), {})
      const out = renderSvgMarkup(
        <LeftAnchorCover ir={ir("academic")} slide={longerSlide} index={0} ctx={ctx} />,
      )
      const root = parseSvgRoot(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`,
      )
      const titleLines = Array.from(root.querySelectorAll("text")).filter(
        (t) => t.getAttribute("x") === "64" && t.getAttribute("fill") === "#FFFFFF",
      )
      expect(titleLines.length).toBeGreaterThan(0)
      expect(titleLines.length).toBeLessThanOrEqual(3)
      const expected = fitHeadingLines(longer, {
        maxWidth: 360,
        fontSize: 64,
        maxLines: 3,
        minPt: 32,
        fontFamily: ctx.fonts.heading,
      })
      expect(titleLines.map((t) => t.textContent)).toEqual(expected.lines)
    })

    // task R2（svg-text-layout.ts 的 tokenize 无空格分支修复 + retry-ladder
    // scope extension）：一个粘在 CJK 中间、自身不含空格的拉丁 run（本仓
    // 惯用语）修复前会被 360px 这个本文件最窄的 fitHeadingLines 预算从中间
    // 切断，且 truncated 从未被触发（静默）。
    //
    // R2 review 的 Important finding（test 诚实性）：上一轮实现把这里的钉子
    // 换成了 run 在 position ≥1（"OpenAPIGateway"，前面垫了 5 个 CJK 字符）
    // 的变体，回避了 brief 原始 repro——run 在 STRING POSITION 0（串首即
    // 拉丁 run）的场景。下面先恢复 brief 原文字面 pin 串作为主用例，
    // position ≥1 的钉子保留在本 describe 块末尾作为补充覆盖。
    it("the brief's own literal position-0 pin string, at this archetype's own narrowest budget, hits the documented minPt fallback boundary — falls back to the legacy split, never worse (R2 review: restored primary case)", () => {
      // 经 fitHeadingLines 直调独立核实（Georgia Bold 精确字宽表，这个页面
      // 真实使用的字重/字体）：这个 20 字符 run 自身宽度在 360px 预算下，
      // 即使收缩到本页面的 minPt=32，整行也放不下（run 自身宽度换算出的
      // 最佳"整体不切"字号只有 29——比 32 floor 还低 3pt）。这正是本任务
      // 设计明确要求的兜底条件："run genuinely wider than a full line at
      // minPt"——落回拆分是设计上正确、经过验证的结果，不是残留缺陷。落回
      // 结果与本任务 ladder 修复前（3c8fe2b）的 fitHeadingLines 输出逐字节
      // 一致（见任务报告的核实记录）。
      const RUN = "Brandxxxxxxxxxxxxxxx"
      const literalPin = `${RUN}：让工程团队将大模型推理性能提升`
      const literalSlide: Slide = { type: "cover", heading: literalPin, components: [] } as Slide
      const ctx = buildCtx(resolveStyle("academic"), {})
      const out = renderSvgMarkup(
        <LeftAnchorCover ir={ir("academic")} slide={literalSlide} index={0} ctx={ctx} />,
      )
      const root = parseSvgRoot(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`,
      )
      const titleLines = Array.from(root.querySelectorAll("text")).filter(
        (t) => t.getAttribute("x") === "64" && t.getAttribute("fill") === "#FFFFFF",
      )
      const lineTexts = titleLines.map((t) => t.textContent)
      expect(lineTexts).toEqual(["Brandxxxxxxxxxxxx", "xxx：让工程团队将大模", "型推理性能提升"])
      expect(titleLines[0]?.getAttribute("font-size")).toBe("33")
      // 尽管发生了 mid-run 拆分，仍必须无丢字、无重排——拆分而非丢内容。
      expect(lineTexts.join("")).toBe(literalPin)
      const expected = fitHeadingLines(literalPin, {
        maxWidth: 360,
        fontSize: 64,
        maxLines: 3,
        minPt: 32,
        fontFamily: ctx.fonts.heading,
      })
      expect(expected.truncated).toBe(false)
      expect(lineTexts).toEqual(expected.lines)
      expect(Number(titleLines[0]?.getAttribute("font-size"))).toBe(expected.fontSize)
    })

    // Sweep-derived regression（reviewer 实测阈值，见任务报告）：run 长度
    // 16 在这个预算下确实可以整体不切——与上面 20 字符的兜底场景对照，
    // 证明修复在其真实可达范围内切实生效，而不只是有文档说明的兜底路径。
    it("a shorter position-0 run (length 16, the reviewer's own measured threshold) genuinely resolves — no mid-run break, real fix demonstrated", () => {
      const RUN = "Brandxxxxxxxxxxx"
      const heading16 = `${RUN}：让工程团队将大模型推理性能提升`
      const slide16: Slide = { type: "cover", heading: heading16, components: [] } as Slide
      const ctx = buildCtx(resolveStyle("academic"), {})
      const out = renderSvgMarkup(<LeftAnchorCover ir={ir("academic")} slide={slide16} index={0} ctx={ctx} />)
      const root = parseSvgRoot(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`,
      )
      const titleLines = Array.from(root.querySelectorAll("text")).filter(
        (t) => t.getAttribute("x") === "64" && t.getAttribute("fill") === "#FFFFFF",
      )
      const lineTexts = titleLines.map((t) => t.textContent)
      expect(lineTexts).toEqual(["Brandxxxxxxxxxxx", "：让工程团队将大模", "型推理性能提升"])
      expect(lineTexts[0]).toBe(RUN) // run 独占第 1 行，从 position 0 起无切断
      expect(titleLines[0]?.getAttribute("font-size")).toBe("37")
      const expected = fitHeadingLines(heading16, {
        maxWidth: 360,
        fontSize: 64,
        maxLines: 3,
        minPt: 32,
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
        <LeftAnchorCover ir={ir("academic")} slide={fusedSlide} index={0} ctx={ctx} />,
      )
      const root = parseSvgRoot(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`,
      )
      const titleLines = Array.from(root.querySelectorAll("text")).filter(
        (t) => t.getAttribute("x") === "64" && t.getAttribute("fill") === "#FFFFFF",
      )
      const lineTexts = titleLines.map((t) => t.textContent)
      expect(lineTexts).toEqual(["统一接入层", "OpenAPIGateway让跨", "团队协作效率显著提升"])
      // run 必须整体落在某一行内，任何一行都不能从 run 内部切开
      expect(lineTexts.some((l) => l?.includes(RUN))).toBe(true)
      expect(titleLines[0]?.getAttribute("font-size")).toBe("32")
      // truncated:false 语义仍需准确——内容并未被 truncateToUnits 丢字，
      // 只是收缩到了 minPt 地板（32），这与 fitHeadingLines 直接调用的结果
      // 必须一致。
      const expected = fitHeadingLines(fusedHeading, {
        maxWidth: 360,
        fontSize: 64,
        maxLines: 3,
        minPt: 32,
        fontFamily: ctx.fonts.heading,
      })
      expect(expected.truncated).toBe(false)
      expect(lineTexts).toEqual(expected.lines)
    })
  })

  it("confidentiality 徽标 (1064,104,120,48) 避让 BrandChrome 四个 logo 带（迁移自 academic.test.tsx）", () => {
    const ctx = buildCtx(resolveStyle("academic"), {})
    const deck: PptxIR = {
      version: "3",
      filename: "x.pptx",
      theme: { id: "academic" },
      meta: { organization: "测试所", date: "2026-07", confidentiality: "internal" },
      assets: { images: {} },
      slides: [slide],
    } as unknown as PptxIR
    const out = renderSvgMarkup(<LeftAnchorCover ir={deck} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain("Internal")

    const root = parseSvgRoot(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`,
    )
    const confRect = Array.from(root.querySelectorAll("rect")).find(
      (r) =>
        r.getAttribute("x") === "1064" &&
        r.getAttribute("y") === "104" &&
        r.getAttribute("width") === "120" &&
        r.getAttribute("height") === "48",
    )
    expect(confRect).toBeTruthy()

    const confBox = {
      x: Number(confRect?.getAttribute("x")),
      y: Number(confRect?.getAttribute("y")),
      w: Number(confRect?.getAttribute("width")),
      h: Number(confRect?.getAttribute("height")),
    }
    for (const band of LOGO_BANDS) {
      expect(rectsOverlap(confBox, band)).toBe(false)
    }
  })

  // The corner triangle sits inside Cover's own full-height color block and
  // deliberately bleeds into the bl logo band by construction — same
  // precedent as the confidentiality badge's non-overlap check above (a
  // solid-fill area under an opaque logo loses no information, see
  // templates/academic.test.tsx's own "documents (not asserts false)" case).
  // Documented here, not silently skipped.
  it("documents (not asserts false) that the corner triangle overlaps the bl logo band by design（迁移自 academic.test.tsx）", () => {
    const ctx = buildCtx(resolveStyle("academic"), {})
    const out = renderSvgMarkup(<LeftAnchorCover ir={ir("academic")} slide={slide} index={0} ctx={ctx} />)
    const root = parseSvgRoot(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`,
    )
    const triangle = root.querySelector("polygon")
    expect(triangle).toBeTruthy()
    const triangleBox = { x: 0, y: 520, w: 200, h: 200 } // bbox of "0,720 0,520 200,720"
    expect(rectsOverlap(triangleBox, BL_LOGO)).toBe(true)
  })
})
