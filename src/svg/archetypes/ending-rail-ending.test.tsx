// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { buildCtx } from "../FullSlideSvg"
import { getTheme } from "../../themes"
import { assertSubset } from "../subset-validate"
import { RailEnding } from "./ending-rail-ending"
import type { PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// 有 heading 的 ending：标题原样渲染，不触发 `slide.heading || "谢谢"` 兜底。
const endingWithHeading: Slide = {
  type: "ending",
  heading: "衷心感谢",
  subheading: "感谢参与本次评审",
  blocks: [],
} as Slide

// 无 heading（也无 subheading）的 ending：触发标题兜底"谢谢"——注意源函数
// 只有标题一层兜底，副标题没有独立兜底文案（见文件头"副题兜底语义"）。
const endingBare: Slide = { type: "ending", blocks: [] } as Slide

const ir = (theme: string, slide: Slide): PptxIR =>
  ({
    version: "2",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {
      organization: "维岚科技",
      contact: { email: "hi@weilan.example", website: "weilan.example" },
      copyright: "© 2026 维岚科技 保留所有权利",
    },
    assets: { images: {} },
    slides: [slide],
  }) as unknown as PptxIR

// 档位二（观感等价档，见文件头"孤儿色处理"）：`COPYRIGHT_FAINT`(#8A968F)
// 是版权行专属的、比 `colors.muted` 浅一档的弱化灰，语义上不对应任何 token
// 字段——不并入 `colors.muted`（会抹平"联系信息 > 版权"的弱化层级），原样
// 保留为文件私有 hex 常量。验收：结构锚点 + 内容存在 + 该装饰 hex（同白字
// 例外一样）跨主题稳定出现，而非逐字节 toBe。
describe("RailEnding", () => {
  it("academic tokens 下渲染角块 + 联系区块 + 未隐形的孤儿装饰色（COPYRIGHT_FAINT），heading 存在时不兜底", () => {
    const ctx = buildCtx(getTheme("academic"), {})
    const deck = ir("academic", endingWithHeading)
    const out = renderSvgMarkup(
      <RailEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )

    // 标题 / 副标题 / 联系 / 版权内容存在，不触发标题兜底
    expect(out).toContain("衷心感谢")
    expect(out).toContain("感谢参与本次评审")
    expect(out).not.toContain("谢谢")
    expect(out).toContain("联系")
    expect(out).toContain("hi@weilan.example")
    expect(out).toContain("© 2026 维岚科技 保留所有权利")

    // 结构性锚点：左下角两块矩形（rect，非旧版三角 path）
    expect(out).toContain('width="280" height="240"')
    expect(out).toContain('width="140" height="120"')

    // academic 自己的 primary/accent 用在角块上
    expect(out).toContain("#006A4E")
    expect(out).toContain("#00A878")

    // 孤儿装饰色原样保留、未被并入 muted——版权行在 academic 下仍然可见，
    // 与 colors.muted(#5D6B65) 不同色，是它本该有的"更浅一档"视觉层级
    // （#5D6B65 本身合法出现在副标题/联系标签上，不是本断言要排除的对象）
    expect(out).toContain("#8A968F")
  })

  it("tech tokens 下用 tech 的 primary/accent/text/muted/border，academic 烤色不残留，COPYRIGHT_FAINT 装饰色跨主题保持不变（证明 token 化成立）", () => {
    const ctx = buildCtx(getTheme("tech"), {})
    const deck = ir("tech", endingWithHeading)
    const out = renderSvgMarkup(
      <RailEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )

    expect(out).toContain("#2DD4E6") // tech primary === accent，用在角块上
    expect(out).toContain("#F2F6FA") // tech text，用在主标题上
    expect(out).toContain("#8A94A6") // tech muted，用在副标题/联系标签上
    expect(out).toContain("#2C3140") // tech border，用在 hairline 上

    // academic 的烤死 token 值不得残留
    expect(out).not.toContain("#006A4E")
    expect(out).not.toContain("#00A878")
    expect(out).not.toContain("#1A2421")
    expect(out).not.toContain("#5D6B65")
    expect(out).not.toContain("#D5D5CB")

    // 装饰豁免色是文件私有常量，不随主题变化——跨主题依然渲染同一个 hex
    expect(out).toContain("#8A968F")
  })

  it("academic tokens 下无 heading 时标题兜底为“谢谢”，副标题没有独立兜底文案（不渲染任何斜体副标题元素）", () => {
    const ctx = buildCtx(getTheme("academic"), {})
    const deck = ir("academic", endingBare)
    const out = renderSvgMarkup(<RailEnding ir={deck} slide={endingBare} index={0} ctx={ctx} />)

    expect(out).toContain("谢谢")
    // 副标题只按 slide.subheading 是否存在决定渲染，没有独立兜底文案——
    // `fontStyle="italic"` 只用在副标题元素上（本组件内唯一的斜体来源），
    // 此处不应出现
    expect(out).not.toContain("italic")
  })

  // 回填缺省分支：heading 存在但 subheading 缺省（不同于 endingBare——那里
  // heading 也缺省，同时触发标题兜底"谢谢"）。这里单独确认"有 heading、无
  // subheading"这一常见组合下，副标题槽位不渲染任何元素，且不影响标题正常
  // 渲染。
  it("heading 存在但 subheading 缺省：标题正常渲染，副标题槽位不渲染任何元素", () => {
    const ctx = buildCtx(getTheme("academic"), {})
    const slide: Slide = { type: "ending", heading: "衷心感谢", blocks: [] } as Slide
    const deck = ir("academic", slide)
    const out = renderSvgMarkup(<RailEnding ir={deck} slide={slide} index={0} ctx={ctx} />)

    expect(out).toContain("衷心感谢")
    expect(out).not.toContain("谢谢") // 不触发标题兜底（"衷心感谢" 不等于兜底文案 "谢谢"）
    expect(out).not.toContain("italic") // 唯一的斜体来源（副标题）未渲染
  })

  it("标题过长时收缩字号、不整段输出原文，Ending body 通过 subset validation（迁移自 academic.test.tsx）", () => {
    const ctx = buildCtx(getTheme("academic"), {})
    const slide: Slide = { type: "ending", heading: CJK_LONG, subheading: CJK_LONG, blocks: [] } as Slide
    const deck = ir("academic", slide)
    const markup = renderSvgMarkup(<RailEnding ir={deck} slide={slide} index={0} ctx={ctx} />)
    const root = parseSvgRoot(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${markup}</svg>`,
    )
    expect(() => assertSubset(root)).not.toThrow()
    expect(markup).not.toContain(`>${CJK_LONG}<`)
  })

  describe("两行标题重排（S3b addendum，迁移自 academic.test.tsx 的 'Ending: two-line title reflow' 分支）", () => {
    it("1 行标题：headingY=356，hairline y1=476（S3b 修复前的基线值，未触发重排逻辑）", () => {
      const ctx = buildCtx(getTheme("academic"), {})
      const slide: Slide = { type: "ending", heading: "谢谢", blocks: [] } as Slide
      const deck = ir("academic", slide)
      const markup = renderSvgMarkup(<RailEnding ir={deck} slide={slide} index={0} ctx={ctx} />)
      const root = parseSvgRoot(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${markup}</svg>`,
      )
      const heading = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "谢谢")!
      expect(heading.getAttribute("y")).toBe("356")
      const hairline = root.querySelector("line")!
      expect(hairline.getAttribute("y1")).toBe(String(356 + 120))
    })

    it("2 行标题最坏情形（“从今天开始用声”，nominal 120px 字号下恰好换行的最大 lineHeight）：首行上移封顶 88px，hairline 间距收紧到 100，末行/所有文字 y 均不越过页面底部", () => {
      const ctx = buildCtx(getTheme("academic"), {})
      const slide: Slide = { type: "ending", heading: "从今天开始用声", blocks: [] } as Slide
      const deck = ir("academic", slide)
      const markup = renderSvgMarkup(<RailEnding ir={deck} slide={slide} index={0} ctx={ctx} />)
      const root = parseSvgRoot(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${markup}</svg>`,
      )
      const headingTexts = Array.from(root.querySelectorAll("text")).filter(
        (t) => t.getAttribute("font-weight") === "600",
      )
      expect(headingTexts.length).toBe(2)
      const ys = headingTexts.map((t) => Number(t.getAttribute("y"))).sort((a, b) => a - b)
      const [firstY, lastY] = ys
      expect(Number(headingTexts[0].getAttribute("font-size"))).toBe(120) // nominal, not shrunk
      // shift = min(lineHeight, 88); lineHeight = round(120*1.08) = 130 -> shift=88
      expect(firstY).toBe(356 - 88)
      expect(lastY - firstY).toBe(130) // lineHeight
      expect(lastY).toBe(356 + (130 - 88)) // headingLastY = 398

      const hairline = root.querySelector("line")!
      expect(Number(hairline.getAttribute("y1"))).toBe(lastY + 100) // tightened 2-line gap

      // Every <text> element must clear the page with margin, not just
      // satisfy the audit's raw tolerance — the copyright line (the lowest
      // element in this Ending) is the binding constraint.
      const allYs = Array.from(root.querySelectorAll("text")).map((t) => Number(t.getAttribute("y")))
      expect(Math.max(...allYs)).toBeLessThanOrEqual(714)
    })
  })
})
