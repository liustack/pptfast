// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../themes"
import { BannerEnding } from "./ending-banner-ending"
import type { PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// 有 heading 的 ending：标题原样渲染，不触发 `slide.heading || "Thank you."`
// 兜底，且 heading 有值时副题不触发"谢谢。"兜底（同源码 2026-07-09 去重裁决）。
const endingWithHeading: Slide = {
  type: "ending",
  heading: "衷心感谢",
  subheading: "感谢参与本次评审",
  components: [],
} as Slide

// 无 heading（也无 subheading）的 ending：触发双重兜底——标题兜底
// "Thank you."，副题兜底"谢谢。"。
const endingBare: Slide = { type: "ending", components: [] } as Slide

const ir = (theme: string, slide: Slide): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {
      organization: "维岚科技",
      authors: [{ name: "张三", role: "顾问" }],
      contact: { email: "hi@weilan.example", website: "weilan.example" },
      copyright: "© 2026 维岚科技 保留所有权利",
    },
    assets: { images: {} },
    slides: [slide],
  }) as unknown as PptxIR

// 档位二（观感等价档，见文件头"孤儿色处理"）：`COPYRIGHT_FAINT`(#8a8a86)
// 是版权行专属的、比 `colors.muted` 浅一档的弱化灰，语义上不对应任何 token
// 字段——不并入 `colors.muted`（会抹平"联系信息 > 版权"的弱化层级），原样
// 保留为文件私有 hex 常量。验收：结构锚点 + 内容存在 + 该装饰 hex（同白字
// 例外一样）跨主题稳定出现，而非逐字节 toBe。
describe("BannerEnding", () => {
  it("consulting tokens 下渲染 org 标 + 联系区块 + 未隐形的孤儿装饰色（COPYRIGHT_FAINT），heading 存在时不兜底", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const deck = ir("consulting", endingWithHeading)
    const out = renderSvgMarkup(
      <BannerEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )

    // 标题 / 副标题 / 联系 / 版权内容存在，不触发标题兜底、不触发副题兜底
    expect(out).toContain("衷心感谢")
    expect(out).toContain("感谢参与本次评审")
    expect(out).not.toContain("Thank you.")
    expect(out).not.toContain("谢谢。")
    expect(out).toContain("联系")
    expect(out).toContain("张三")
    expect(out).toContain("hi@weilan.example")
    expect(out).toContain("© 2026 维岚科技 保留所有权利")

    // 结构性锚点：org 圆点标 + 通栏分隔线
    expect(out).toContain('<circle cx="12" cy="-12" r="12"')
    expect(out).toContain('x1="96"')
    expect(out).toContain('x2="1184"')

    // consulting 自己的 primary/accent 用在标题/org 圆点上
    expect(out).toContain("#051C2C")
    expect(out).toContain("#FFC72C")

    // 孤儿装饰色原样保留、未被并入 muted——版权行在 consulting 下仍然可见，
    // 与 colors.muted(#6C6C6C) 不同色，是它本该有的"更浅一档"视觉层级
    // （#6C6C6C 本身合法出现在联系标签上，不是本断言要排除的对象）
    expect(out).toContain("#8a8a86")
  })

  it("tech tokens 下用 tech 的 primary/accent/muted，consulting 烤色不残留，COPYRIGHT_FAINT 装饰色跨主题保持不变（证明 token 化成立）", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const deck = ir("tech", endingWithHeading)
    const out = renderSvgMarkup(
      <BannerEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )

    expect(out).toContain("#2DD4E6") // tech primary === accent，用在标题/org 圆点/分隔线上
    expect(out).toContain("#8A94A6") // tech muted，用在副标题/联系标签上

    // consulting 的烤死 token 值不得残留
    expect(out).not.toContain("#051C2C")
    expect(out).not.toContain("#FFC72C")
    expect(out).not.toContain("#6C6C6C")
    expect(out).not.toContain("#D5D5CB")

    // 装饰豁免色是文件私有常量，不随主题变化——跨主题依然渲染同一个 hex
    expect(out).toContain("#8a8a86")
  })

  it("consulting tokens 下无 heading 时标题兜底为“Thank you.”，副题兜底“谢谢。”（双重兜底）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const deck = ir("consulting", endingBare)
    const out = renderSvgMarkup(<BannerEnding ir={deck} slide={endingBare} index={0} ctx={ctx} />)

    expect(out).toContain("Thank you.")
    expect(out).toContain("谢谢。")
  })

  // 回填旧测试「Ending shrinks a pathologically long heading instead of
  // overflowing」（旧文件 consulting.test.tsx L373-384）：超长 heading 必须被
  // 压缩，不能原样溢出，且 assertSubset 通过。
  it("超长 heading 会被压缩（assertSubset 通过），不会原样渲染整段长文本", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const slide: Slide = { type: "ending", heading: CJK_LONG, subheading: CJK_LONG, components: [] } as Slide
    const deck = ir("consulting", slide)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BannerEnding ir={deck} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
    expect(markup).not.toContain(`>${CJK_LONG}<`)
  })

  // 回填旧测试「Ending: two-line title reflow (S3b addendum, 2026-07-07)」的
  // 1 行分支（旧文件 consulting.test.tsx L387-402）：单行 heading 时
  // headingY=356、分隔线间距=164（修复前的基准行为不变）。
  it("单行 heading：headingY=356、分隔线间距=164", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const slide: Slide = { type: "ending", heading: "Thank you.", components: [] } as Slide
    const deck = ir("consulting", slide)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BannerEnding ir={deck} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const heading = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "Thank you.")!
    expect(heading.getAttribute("y")).toBe("356")
    const divider = root.querySelector("line")!
    expect(divider.getAttribute("y1")).toBe(String(356 + 164))
  })

  // 回填旧测试「Ending: two-line title reflow」的 2 行最坏情形分支（旧文件
  // consulting.test.tsx L404-437）：恰好换行为 2 行且字号未收缩（132px）时，
  // 首行上移（封顶 85px）、分隔线间距收紧到 128、且所有文字 y 不超出页面
  // （<=714）。
  it("2 行 heading 最坏情形（恰好 2 行、132px 未收缩）：首行上移封顶 85、分隔线间距收紧为 128、版权不超出页面", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const slide: Slide = { type: "ending", heading: "从今天开始用声明式", components: [] } as Slide
    const deck = ir("consulting", slide)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BannerEnding ir={deck} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const headingTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-style") === "italic" && t.getAttribute("font-weight") === "500",
    )
    expect(headingTexts.length).toBe(2)
    const ys = headingTexts.map((t) => Number(t.getAttribute("y"))).sort((a, b) => a - b)
    const [firstY, lastY] = ys
    expect(Number(headingTexts[0].getAttribute("font-size"))).toBe(132) // nominal, not shrunk
    // shift = min(lineHeight, 85); lineHeight = round(132*1.08) = 143 -> shift=85
    expect(firstY).toBe(356 - 85)
    expect(lastY - firstY).toBe(143) // lineHeight
    expect(lastY).toBe(356 + (143 - 85)) // headingLastY = 414

    const divider = root.querySelector("line")!
    expect(Number(divider.getAttribute("y1"))).toBe(lastY + 128) // tightened 2-line gap

    const allYs = Array.from(root.querySelectorAll("text")).map((t) => Number(t.getAttribute("y")))
    expect(Math.max(...allYs)).toBeLessThanOrEqual(714)
  })
})
