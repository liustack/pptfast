// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { BannerEnding } from "./ending-banner-ending"
import type { PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// 有 heading 的 ending：标题原样渲染，不触发 `slide.heading || "Thank you."`
// 兜底，且 heading 有值时副题不触发"We appreciate your time."兜底（同源码
// 2026-07-09 去重裁决）。
const endingWithHeading: Slide = {
  type: "ending",
  heading: "衷心感谢",
  subheading: "感谢参与本次评审",
  components: [],
} as Slide

// 无 heading（也无 subheading）的 ending：触发双重兜底——标题兜底
// "Thank you."，副题兜底"We appreciate your time."。
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

// contrast-policy 波 T1（推翻本文件头旧裁决"COPYRIGHT_FAINT 跨主题固定不
// 变"）：版权行不再是文件私有孤儿色，改用 `metaInk(colors.muted, bg)`
// （`../ink`）——B 层门槛 3:1 下已达标时原样保留 `colors.muted`，这里两个
// theme 的 `colors.muted` 对各自真实背景都已经 >=3:1（consulting 4.96:1、
// tech 5.96:1，见 task-1-report.md 的实测），所以两处断言都从"跨主题保持
// 同一个 hex 不变"改为"等于该主题自己的 colors.muted，随主题变化"——这正是
// 新裁决要断言的属性：派生色随背景变，不是钉死不变。
describe("BannerEnding", () => {
  it("consulting tokens 下渲染 org 标 + 联系区块 + B 层版权行（data-contrast-tier=meta），heading 存在时不兜底", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const deck = ir("consulting", endingWithHeading)
    const out = renderSvgMarkup(
      <BannerEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )

    // 标题 / 副标题 / 联系 / 版权内容存在，不触发标题兜底、不触发副题兜底
    expect(out).toContain("衷心感谢")
    expect(out).toContain("感谢参与本次评审")
    expect(out).not.toContain("Thank you.")
    expect(out).not.toContain("We appreciate your time.")
    expect(out).toContain("Contact")
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

    // 版权行现在派生自 colors.muted（consulting 的 #6B6B6B 对真实渲染背景
    // #F7F7F2 已经 4.96:1，clears B 层 3:1，metaInk 原样保留），挂
    // data-contrast-tier="meta"。不再是独立于 muted 的孤儿色。
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${out}</svg>`)
    const copyrightText = Array.from(root.querySelectorAll("text")).find(
      (t) => t.textContent === "© 2026 维岚科技 保留所有权利",
    )!
    expect(copyrightText.getAttribute("fill")).toBe("#6B6B6B")
    expect(copyrightText.getAttribute("data-contrast-tier")).toBe("meta")
  })

  it("tech tokens 下用 tech 的 primary/accent/muted，consulting 烤色不残留，版权行随主题派生（不再跨主题固定同一 hex）", () => {
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

    // 版权行派生自 tech 自己的 colors.muted（#8A94A6 对 tech ending 背景
    // #0D1526 已经 5.96:1，clears B 层，metaInk 原样保留）——跟上一个测试
    // consulting 断言的 #6B6B6B 不是同一个 hex，证明这是随主题派生，不是
    // 跨主题固定不变的孤儿色。
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${out}</svg>`)
    const copyrightText = Array.from(root.querySelectorAll("text")).find(
      (t) => t.textContent === "© 2026 维岚科技 保留所有权利",
    )!
    expect(copyrightText.getAttribute("fill")).toBe("#8A94A6")
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
      <BannerEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )

    expect(out).toContain("#E63946") // insight primary，用在标题/分隔线上
    expect(out).toContain("#D4A57C") // insight accent，用在 org 圆点上
    expect(out).toContain("#93939C") // insight muted，用在副标题/联系标签上

    // 版权行派生自 insight 自己的 colors.muted（#93939C 对 insight ending
    // 背景 #0A0A0C 实测 6.494:1，远超 B 层 3:1 门槛，metaInk 原样保留）。
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${out}</svg>`)
    const copyrightText = Array.from(root.querySelectorAll("text")).find(
      (t) => t.textContent === "© 2026 维岚科技 保留所有权利",
    )!
    expect(copyrightText.getAttribute("fill")).toBe("#93939C")
    expect(copyrightText.getAttribute("data-contrast-tier")).toBe("meta")
  })

  it("luxe tokens（深底）下版权行随主题派生，实测远超 B 层门槛", () => {
    const ctx = buildCtx(resolveStyle("luxe"), {})
    const deck = ir("luxe", endingWithHeading)
    const out = renderSvgMarkup(
      <BannerEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )

    expect(out).toContain("#D4B876") // luxe primary，用在标题/分隔线上
    expect(out).toContain("#A67B45") // luxe accent，用在 org 圆点上
    expect(out).toContain("#9C9386") // luxe muted，用在副标题/联系标签上

    // 版权行派生自 luxe 自己的 colors.muted（#9C9386 对 luxe ending 背景
    // #161310 实测 6.108:1，远超 B 层 3:1 门槛，metaInk 原样保留）。
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${out}</svg>`)
    const copyrightText = Array.from(root.querySelectorAll("text")).find(
      (t) => t.textContent === "© 2026 维岚科技 保留所有权利",
    )!
    expect(copyrightText.getAttribute("fill")).toBe("#9C9386")
    expect(copyrightText.getAttribute("data-contrast-tier")).toBe("meta")
  })

  it("consulting tokens 下无 heading 时标题兜底为“Thank you.”，副题兜底“We appreciate your time.”（双重兜底）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const deck = ir("consulting", endingBare)
    const out = renderSvgMarkup(<BannerEnding ir={deck} slide={endingBare} index={0} ctx={ctx} />)

    expect(out).toContain("Thank you.")
    expect(out).toContain("We appreciate your time.")
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
