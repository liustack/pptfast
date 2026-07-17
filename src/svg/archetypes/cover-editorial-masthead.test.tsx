// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../styles"
import { EditorialMastheadCover } from "./cover-editorial-masthead"
import type { PptxIR, Slide } from "@/ir"

const slide: Slide = {
  type: "cover",
  heading: "数据驱动的增长引擎",
  subheading: "面向 2027 的技术路线图",
  blocks: [],
} as Slide
const ir = (theme: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: { organization: "测试实验室", date: "2026-07" },
    assets: { images: {} },
    slides: [slide],
  }) as unknown as PptxIR

// Captured from EditorialMastheadCover (magazine tokens, the fixture above) —
// pinned as a literal so this test no longer depends on the legacy
// `templates/magazine` module (slated for deletion). Regenerate by rendering
// the component and copying its output if this archetype's markup ever
// intentionally changes.
const MAGAZINE_EXPECTED =
  '<text x="640" y="340" font-family="SimSun, Songti SC, STSong, serif" font-size="92" font-weight="600" fill="#1F1F1F" text-anchor="middle" dominant-baseline="alphabetic">数据驱动的增长引擎</text><line x1="560" y1="396" x2="720" y2="396" stroke="#C0392B" stroke-width="1.6"></line><text x="640" y="448" font-family="SimSun, Songti SC, STSong, serif" font-size="28" fill="#6E6259" font-style="italic" text-anchor="middle" dominant-baseline="alphabetic">面向 2027 的技术路线图</text><text x="640" y="656" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="13" fill="#6E6259" letter-spacing="2" text-anchor="middle" dominant-baseline="alphabetic">测试实验室    ·    2026-07</text>'

describe("EditorialMastheadCover", () => {
  it("magazine tokens 下输出与固化的基准 markup 逐字节一致（档位一，档案来自旧 EditorialSerifCover）", () => {
    const ctx = buildCtx(resolveStyle("journal"), {})
    const next = renderSvgMarkup(<EditorialMastheadCover ir={ir("journal")} slide={slide} index={0} ctx={ctx} />)
    expect(next).toBe(MAGAZINE_EXPECTED)
  })

  it("consulting tokens 下用 consulting 的色（证明 token 化成立，无 baked hex）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const out = renderSvgMarkup(<EditorialMastheadCover ir={ir("consulting")} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain("#FFC72C") // consulting accent
    expect(out).not.toContain("#C0392B") // magazine accent 不得残留
  })

  it("passes assertSubset (no forbidden elements)", () => {
    const ctx = buildCtx(resolveStyle("journal"), {})
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <EditorialMastheadCover ir={ir("journal")} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    expect(markup).not.toContain("foreignObject")
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("centers the serif hero title and draws the accent underline beneath it", () => {
    const ctx = buildCtx(resolveStyle("journal"), {})
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <EditorialMastheadCover ir={ir("journal")} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const heading = Array.from(root.querySelectorAll("text")).find(
      (t) => t.textContent === "数据驱动的增长引擎",
    )!
    expect(heading.getAttribute("text-anchor")).toBe("middle")
    expect(heading.getAttribute("x")).toBe("640")
    expect(heading.getAttribute("font-family")).toBe(ctx.fonts.heading)

    const underline = Array.from(root.querySelectorAll("line")).find(
      (l) => l.getAttribute("stroke") === ctx.colors.accent,
    )
    expect(underline).toBeDefined()
    expect(underline!.getAttribute("x1")).toBe("560")
    expect(underline!.getAttribute("x2")).toBe("720")
  })
})
