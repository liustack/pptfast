// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { assertSubset } from "../subset-validate"
import { RailEnding } from "./ending-rail-ending"
import type { PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// 有 heading 的 ending：标题原样渲染，不触发 `slide.heading || "Thank you"` 兜底。
const endingWithHeading: Slide = {
  type: "ending",
  heading: "衷心感谢",
  subheading: "感谢参与本次评审",
  components: [],
} as Slide

// 无 heading（也无 subheading）的 ending：触发标题兜底"Thank you"（defect C
// 修复：原中文兜底"谢谢"改英文）——注意源函数只有标题一层兜底，副标题没有
// 独立兜底文案（见文件头"副题兜底语义"）。
const endingBare: Slide = { type: "ending", components: [] } as Slide

const ir = (theme: string, slide: Slide): PptxIR =>
  ({
    version: "3",
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

// contrast-policy 波 T1（推翻本文件头旧裁决"COPYRIGHT_FAINT 跨主题固定不
// 变"）：版权行不再是文件私有孤儿色，改用 `metaInk(colors.muted, bg)`
// （`../ink`）——B 层门槛 3:1 下已达标时原样保留 `colors.muted`，这里两个
// theme 的 `colors.muted` 对各自真实背景都已经 >=3:1（academic 5.34:1、
// tech 5.96:1，见 task-1-report.md 的实测），所以两处断言都从"跨主题保持
// 同一个 hex 不变"改为"等于该主题自己的 colors.muted，随主题变化"——这正是
// 新裁决要断言的属性：派生色随背景变，不是钉死不变。
describe("RailEnding", () => {
  it("academic tokens 下渲染角块 + 联系区块 + B 层版权行（data-contrast-tier=meta），heading 存在时不兜底", () => {
    const ctx = buildCtx(resolveStyle("academic"), {})
    const deck = ir("academic", endingWithHeading)
    const out = renderSvgMarkup(
      <RailEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )

    // 标题 / 副标题 / 联系 / 版权内容存在，不触发标题兜底
    expect(out).toContain("衷心感谢")
    expect(out).toContain("感谢参与本次评审")
    expect(out).not.toContain("Thank you")
    expect(out).toContain("Contact")
    expect(out).toContain("hi@weilan.example")
    expect(out).toContain("© 2026 维岚科技 保留所有权利")

    // 结构性锚点：左下角两块矩形（rect，非旧版三角 path）
    expect(out).toContain('width="280" height="240"')
    expect(out).toContain('width="140" height="120"')

    // academic 自己的 primary/accent 用在角块上
    expect(out).toContain("#006A4E")
    expect(out).toContain("#00A878")

    // 版权行现在派生自 colors.muted（academic 的 #5D6B65 对真实渲染背景
    // #FAFAF6 已经 5.34:1，clears B 层 3:1，metaInk 原样保留），挂
    // data-contrast-tier="meta"。不再是独立于 muted 的孤儿色——副标题/联系
    // 标签本来就已经用 #5D6B65，版权行现在与它们同色是预期结果，不是要
    // 排除的巧合。
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${out}</svg>`)
    const copyrightText = Array.from(root.querySelectorAll("text")).find(
      (t) => t.textContent === "© 2026 维岚科技 保留所有权利",
    )!
    expect(copyrightText.getAttribute("fill")).toBe("#5D6B65")
    expect(copyrightText.getAttribute("data-contrast-tier")).toBe("meta")
  })

  it("tech tokens 下用 tech 的 primary/accent/text/muted/border，academic 烤色不残留，版权行随主题派生（不再跨主题固定同一 hex）", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const deck = ir("tech", endingWithHeading)
    const out = renderSvgMarkup(
      <RailEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )

    // 深底组皮肤重设计（2026-08-19）把 primary 与 accent 拆成两个色，此前它们
    // 同值、一条断言就够，现在两个角色各锁一条。
    expect(out).toContain("#14294A") // tech primary，用在大角块 + 角块上的 org 文字上
    expect(out).toContain("#53E0D2") // tech accent，用在小角块/org 圆点上
    expect(out).toContain("#EAF1FA") // tech text，用在主标题上
    expect(out).toContain("#93A5C0") // tech muted，用在副标题/联系标签上
    expect(out).toContain("#24304A") // tech border，用在 hairline 上

    // academic 的烤死 token 值不得残留
    expect(out).not.toContain("#006A4E")
    expect(out).not.toContain("#00A878")
    expect(out).not.toContain("#1A2421")
    expect(out).not.toContain("#5D6B65")
    expect(out).not.toContain("#D5D5CB")

    // 版权行派生自 tech 自己的 colors.muted（#93A5C0 对本例真正渲染到的底
    // colors.bg #0A0F1E 实测 7.622:1，压 ending 默认渐变更严的起点 #0E1630
    // 也有 7.128:1，clears B 层，metaInk 原样保留）——跟上一个测试
    // academic 断言的 #5D6B65 不是同一个 hex，证明这是随主题派生，不是
    // 跨主题固定不变的孤儿色。
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${out}</svg>`)
    const copyrightText = Array.from(root.querySelectorAll("text")).find(
      (t) => t.textContent === "© 2026 维岚科技 保留所有权利",
    )!
    expect(copyrightText.getAttribute("fill")).toBe("#93A5C0")
    expect(copyrightText.getAttribute("data-contrast-tier")).toBe("meta")
  })

  // contrast-policy 波 T3（T1 review 遗留 minor b）：tech 已实测深底可读，这
  // 里补齐另外两个深底主题 insight/luxe——避免"只测过一个深底主题"的覆盖
  // 假象。两个主题的 colors.muted 相对各自真实渲染背景（`ctx.defaultBg`，
  // ending 页 defaultBackgrounds）都远超 B 层 3:1 门槛，metaInk 原样保留。
  it("insight tokens（深底）下版权行随主题派生，实测远超 B 层门槛", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const deck = ir("insight", endingWithHeading)
    const out = renderSvgMarkup(
      <RailEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )

    expect(out).toContain("#16202B") // insight primary，用在左下角块上
    expect(out).toContain("#F0A63C") // insight accent，用在角块/org 圆点上
    expect(out).toContain("#F2EFE8") // insight text，用在主标题/联系值上
    expect(out).toContain("#9AA7B4") // insight muted，用在副标题/联系标签上

    // 版权行派生自 insight 自己的 colors.muted（#9AA7B4 对本例真正渲染到的底
    // colors.bg #0F1216 实测 7.654:1，压 ending 默认渐变更严的起点 #151B23
    // 也有 7.058:1，远超 B 层 3:1 门槛，metaInk 原样保留）。
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${out}</svg>`)
    const copyrightText = Array.from(root.querySelectorAll("text")).find(
      (t) => t.textContent === "© 2026 维岚科技 保留所有权利",
    )!
    expect(copyrightText.getAttribute("fill")).toBe("#9AA7B4")
    expect(copyrightText.getAttribute("data-contrast-tier")).toBe("meta")
  })

  it("luxe tokens（深底）下版权行随主题派生，实测远超 B 层门槛", () => {
    const ctx = buildCtx(resolveStyle("luxe"), {})
    const deck = ir("luxe", endingWithHeading)
    const out = renderSvgMarkup(
      <RailEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )

    expect(out).toContain("#171310") // luxe primary，用在左下角块上
    expect(out).toContain("#C6A15B") // luxe accent，用在角块/org 圆点上
    expect(out).toContain("#F5EFE3") // luxe text，用在主标题/联系值上
    expect(out).toContain("#A89A82") // luxe muted，用在副标题/联系标签上

    // 版权行派生自 luxe 自己的 colors.muted（#A89A82 对 luxe ending 背景
    // #0B0908 实测 7.200:1，远超 B 层 3:1 门槛，metaInk 原样保留）。
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${out}</svg>`)
    const copyrightText = Array.from(root.querySelectorAll("text")).find(
      (t) => t.textContent === "© 2026 维岚科技 保留所有权利",
    )!
    expect(copyrightText.getAttribute("fill")).toBe("#A89A82")
    expect(copyrightText.getAttribute("data-contrast-tier")).toBe("meta")
  })

  it("academic tokens 下无 heading 时标题兜底为“Thank you”，副标题没有独立兜底文案（不渲染任何斜体副标题元素）", () => {
    const ctx = buildCtx(resolveStyle("academic"), {})
    const deck = ir("academic", endingBare)
    const out = renderSvgMarkup(<RailEnding ir={deck} slide={endingBare} index={0} ctx={ctx} />)

    expect(out).toContain("Thank you")
    // 副标题只按 slide.subheading 是否存在决定渲染，没有独立兜底文案——
    // `fontStyle="italic"` 只用在副标题元素上（本组件内唯一的斜体来源），
    // 此处不应出现
    expect(out).not.toContain("italic")
  })

  // 回填缺省分支：heading 存在但 subheading 缺省（不同于 endingBare——那里
  // heading 也缺省，同时触发标题兜底"Thank you"）。这里单独确认"有 heading、
  // 无 subheading"这一常见组合下，副标题槽位不渲染任何元素，且不影响标题
  // 正常渲染。
  it("heading 存在但 subheading 缺省：标题正常渲染，副标题槽位不渲染任何元素", () => {
    const ctx = buildCtx(resolveStyle("academic"), {})
    const slide: Slide = { type: "ending", heading: "衷心感谢", components: [] } as Slide
    const deck = ir("academic", slide)
    const out = renderSvgMarkup(<RailEnding ir={deck} slide={slide} index={0} ctx={ctx} />)

    expect(out).toContain("衷心感谢")
    expect(out).not.toContain("Thank you") // 不触发标题兜底（"衷心感谢" 不等于兜底文案 "Thank you"）
    expect(out).not.toContain("italic") // 唯一的斜体来源（副标题）未渲染
  })

  it("标题过长时收缩字号、不整段输出原文，Ending body 通过 subset validation（迁移自 academic.test.tsx）", () => {
    const ctx = buildCtx(resolveStyle("academic"), {})
    const slide: Slide = { type: "ending", heading: CJK_LONG, subheading: CJK_LONG, components: [] } as Slide
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
      const ctx = buildCtx(resolveStyle("academic"), {})
      const slide: Slide = { type: "ending", heading: "谢谢", components: [] } as Slide
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
      const ctx = buildCtx(resolveStyle("academic"), {})
      const slide: Slide = { type: "ending", heading: "从今天开始用声", components: [] } as Slide
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
