// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { PosterChapter } from "./chapter-poster-chapter"
import type { PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// Deck with two chapter slides (separated by a content slide) so
// `chapterNumberFor` has something to derive from — index 0 is chapter "01",
// index 2 is chapter "02" out of 2 total chapters.
const chapter1: Slide = { type: "chapter", heading: "第一章：品牌重塑", components: [] } as Slide
const content: Slide = { type: "content", heading: "现状", components: [] } as Slide
const chapter2: Slide = {
  type: "chapter",
  heading: "第二章：视觉语言与传播路径",
  components: [],
} as Slide

const ir = (theme: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: { organization: "创意组" },
    assets: { images: {} },
    slides: [chapter1, content, chapter2],
  }) as unknown as PptxIR

function render(body: React.ReactElement): { markup: string; root: Element } {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

describe("PosterChapter", () => {
  it("creative tokens 下左对齐大数字(y=400/224/primary)+800-weight 标题(y=532/text)，上下两道 border 分隔线(y1=80,642)，含多 chapter 序号", () => {
    // 数值来自 templates/creative.test.tsx「keeps the original left-aligned
    // big-number spacing」一案——PosterChapter 与旧 EditorialDarkChapter 是
    // 同一份构图逻辑做 token 替换，几何值不变，这里固化为字面量而非与已删除
    // 的旧模板逐字节比较。
    const ctx = buildCtx(resolveStyle("insight"), {})
    const deck = ir("insight")

    const { root: root1 } = render(<PosterChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />)
    const number1 = Array.from(root1.querySelectorAll("text")).find((t) => t.textContent === "01")!
    expect(number1.getAttribute("y")).toBe("400")
    expect(number1.getAttribute("font-size")).toBe("224")
    expect(number1.getAttribute("font-weight")).toBe("800")
    // 深底组皮肤重设计（2026-08-19）后 insight 的 primary 变成「与底几乎同色的
    // 色块底色」，压 chapter 底色只剩 1.x:1——本版式早就有的 accessibleInk
    // 因此接管，巨幅数字落到 readableOn 的白墨（压 #0F1216 实测 18.78:1）。
    // 断言锁的仍是「数字色由对比度自适应挑出来」这件事，只是钉的值换了。
    expect(number1.getAttribute("fill")).toBe("#FFFFFF")

    const heading1 = Array.from(root1.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("第一章：品牌重塑"),
    )!
    expect(heading1.getAttribute("x")).toBe("56")
    expect(heading1.getAttribute("y")).toBe("532") // single-line baseline, unchanged
    expect(heading1.getAttribute("font-weight")).toBe("800")
    expect(heading1.getAttribute("fill")).toBe(ctx.colors.text)

    const dividers1 = root1.querySelectorAll("line")
    expect(dividers1[0].getAttribute("y1")).toBe("80")
    expect(dividers1[0].getAttribute("stroke")).toBe(ctx.colors.border)
    expect(dividers1[1].getAttribute("y1")).toBe("642") // headingLastY(532) + 110

    const { root: root2 } = render(<PosterChapter ir={deck} slide={chapter2} index={2} ctx={ctx} />)
    const number2 = Array.from(root2.querySelectorAll("text")).find((t) => t.textContent === "02")!
    expect(number2.getAttribute("y")).toBe("400")
  })

  it("shrinks a pathologically long heading onto <=2 lines instead of overflowing, at 800-weight", () => {
    const longSlide: Slide = { type: "chapter", heading: CJK_LONG, components: [] } as Slide
    const deck: PptxIR = {
      version: "3",
      filename: "x.pptx",
      theme: { id: "insight" },
      meta: {},
      assets: { images: {} },
      slides: [longSlide],
    } as unknown as PptxIR
    const ctx = buildCtx(resolveStyle("insight"), {})
    const { root } = render(<PosterChapter ir={deck} slide={longSlide} index={0} ctx={ctx} />)
    expect(() => assertSubset(root)).not.toThrow()

    const headingTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => (t.textContent ?? "").includes("微服务") && t.getAttribute("fill") === ctx.colors.text,
    )
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    for (const t of headingTexts) {
      expect(t.getAttribute("font-weight")).toBe("800")
      const fontSize = Number(t.getAttribute("font-size"))
      expect(fontSize).toBeLessThan(56)
      expect(fontSize).toBeGreaterThanOrEqual(28)
    }
  })

  it("consulting tokens 下用 consulting 的 primary/border/muted 色，creative 的烤死色不残留（token 化成立）", () => {
    const consultingTheme = resolveStyle("consulting")
    const ctx = buildCtx(consultingTheme, {})
    const deck = ir("consulting")
    const out = renderSvgMarkup(<PosterChapter ir={deck} slide={chapter1} index={0} ctx={ctx} />)

    // token 化成立：章节数字走 consulting 的 primary，不是写死的 insight RED
    expect(out).toContain("#1E2A4A") // consulting primary（编辑组换血后与 text 不再同值）
    expect(out).not.toContain("#16202B") // insight primary 不得残留
    expect(out).not.toContain("#F0A63C") // insight accent（终端琥珀）本就不该出现
    expect(out).not.toContain("#F2EFE8") // insight text 不得残留
    expect(out).not.toContain("#9AA7B4") // insight muted 不得残留
    expect(out).not.toContain("#2A3440") // insight border 不得残留

    // ctx 确实按主题切换：heading 字体走 consulting 的解析结果
    expect(out).toContain(`font-family="${ctx.fonts.heading}"`)
    expect(out).toContain(">01<")
  })
})
