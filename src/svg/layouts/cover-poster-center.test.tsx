// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { PosterCenterCover } from "./cover-poster-center"
import type { PptxIR, Slide } from "@/ir"

const slide: Slide = { type: "cover", heading: "创意提案", subheading: "一次品牌焕新实验", components: [] } as Slide
const ir = (theme: string): PptxIR =>
  ({ version: "3", filename: "x.pptx", theme: { id: theme }, meta: { organization: "品牌组" }, assets: { images: {} }, slides: [slide] }) as unknown as PptxIR

function render(body: React.ReactElement): { markup: string; root: Element } {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

describe("PosterCenterCover", () => {
  it("creative tokens 下标题居中，且无旧 baked hex 残留（观感等价档）", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const out = renderSvgMarkup(<PosterCenterCover ir={ir("insight")} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain("创意提案")
    expect(out).toContain('text-anchor="middle"')
    // 短横条是这一页唯一读 colors.primary 的件，2026-08-20 悬空装饰清扫删掉
    // 之后 primary 在本页不再有载体——RED 依旧不映射到 accent。
    expect(out).not.toContain("#16202B")
    expect(out).not.toContain("#F0A63C") // insight accent（终端琥珀）不应出现——RED 不映射到 accent
    expect(out).not.toContain("#666670") // META_MUTED 并入 muted 后不得残留
  })
  it("consulting tokens 下用 consulting 自己的色，insight 烤色不残留（token 化成立）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const out = renderSvgMarkup(<PosterCenterCover ir={ir("consulting")} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain(resolveStyle("consulting").colors.text)
    expect(out).not.toContain("#16202B") // insight primary 不得残留
  })

  it("副标题居中、底部合并 meta 行含组织/密级/日期，且不再画悬空短横条", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const fullSlide: Slide = {
      type: "cover",
      heading: "年度财务报告",
      subheading: "信息安全与增长",
      components: [],
    } as Slide
    const fullIr: PptxIR = {
      version: "3",
      filename: "deck.pptx",
      theme: { id: "insight" },
      meta: { organization: "DarkCo", confidentiality: "internal", version: "v2", date: "2026" },
      assets: { images: {} },
      slides: [fullSlide],
    } as unknown as PptxIR
    const { markup, root } = render(<PosterCenterCover ir={fullIr} slide={fullSlide} index={0} ctx={ctx} />)

    const title = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("年度财务报告"),
    )!
    expect(title.getAttribute("text-anchor")).toBe("middle")
    expect(title.getAttribute("x")).toBe("640")
    expect(title.getAttribute("font-weight")).toBe("800")

    // 2026-08-20 悬空装饰清扫：标题下 70px、副题上 64px 的那条 60x4 短横条
    // 删了，两头都不贴。
    expect(
      Array.from(root.querySelectorAll("rect")).find(
        (r) => r.getAttribute("width") === "60" && r.getAttribute("height") === "4",
      ),
    ).toBeUndefined()

    const subtitle = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("信息安全与增长"),
    )!
    expect(subtitle.getAttribute("text-anchor")).toBe("middle")

    // Combined meta line carries org/confidentiality/date as a single
    // centered row (CONF_LABEL.internal -> "Internal").
    expect(markup).toContain("DarkCo")
    expect(markup).toContain("Internal")
  })

  // 这里曾有一条「Cover 元素避开四角 BrandChrome logo 条带」的守卫，量的是
  // 那条 60x4 短横条的墨盒——全页唯一一个 rect。短横条在 2026-08-20 悬空装饰
  // 清扫里删了，这一页现在只剩居中的文字行，没有可量的盒子，守卫随之退役。
  it("Cover 页不画任何装饰 rect", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const { root } = render(<PosterCenterCover ir={ir("insight")} slide={slide} index={0} ctx={ctx} />)
    expect(Array.from(root.querySelectorAll("rect"))).toHaveLength(0)
  })

  it("Cover 页通过 subset 校验", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const { root } = render(<PosterCenterCover ir={ir("insight")} slide={slide} index={0} ctx={ctx} />)
    expect(() => assertSubset(root)).not.toThrow()
  })
})
