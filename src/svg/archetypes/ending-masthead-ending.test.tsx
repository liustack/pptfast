// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../styles"
import { MastheadEnding } from "./ending-masthead-ending"
import type { PptxIR, Slide } from "@/ir"

// 有 heading 的 ending：不触发副题兜底（heading 有值时 subheading 缺省不显示
// 任何副题文本，同 2026-07-09 去重裁决）。
const endingWithHeading: Slide = {
  type: "ending",
  heading: "感谢聆听",
  blocks: [],
} as Slide

// 无 heading 的 ending：触发双重兜底——heading 兜底"致谢"，subheading 兜底
// "谢谢。"。
const endingBare: Slide = { type: "ending", blocks: [] } as Slide

const ir = (theme: string, slide: Slide): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: { organization: "维岚科技", date: "2026-07-09" },
    assets: { images: {} },
    slides: [slide],
  }) as unknown as PptxIR

// Captured from MastheadEnding (magazine tokens, fixtures above) — pinned as
// literals so this test no longer depends on the legacy `templates/magazine`
// module (slated for deletion).
const MAGAZINE_EXPECTED_WITH_HEADING =
  '<text x="640" y="340" font-family="SimSun, Songti SC, STSong, serif" font-size="76" font-weight="600" fill="#1F1F1F" text-anchor="middle" dominant-baseline="alphabetic">感谢聆听</text><text x="640" y="640" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="13" fill="#6E6259" letter-spacing="2" text-anchor="middle" dominant-baseline="alphabetic">维岚科技    ·    2026-07-09</text>'
const MAGAZINE_EXPECTED_BARE =
  '<text x="640" y="340" font-family="SimSun, Songti SC, STSong, serif" font-size="76" font-weight="600" fill="#1F1F1F" text-anchor="middle" dominant-baseline="alphabetic">致谢</text><text x="640" y="396" font-family="SimSun, Songti SC, STSong, serif" font-size="28" fill="#6E6259" font-style="italic" text-anchor="middle" dominant-baseline="alphabetic">谢谢。</text><text x="640" y="640" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="13" fill="#6E6259" letter-spacing="2" text-anchor="middle" dominant-baseline="alphabetic">维岚科技    ·    2026-07-09</text>'

describe("MastheadEnding", () => {
  it("magazine tokens 下与固化的基准 markup 逐字节一致（档位一，有 heading，不兜底副题，档案来自旧 EditorialSerifEnding）", () => {
    const ctx = buildCtx(resolveStyle("journal"), {})
    const deck = ir("journal", endingWithHeading)

    const next = renderSvgMarkup(<MastheadEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />)
    expect(next).toBe(MAGAZINE_EXPECTED_WITH_HEADING)
    expect(next).toContain("感谢聆听")
    expect(next).not.toContain("谢谢。")
  })

  it("magazine tokens 下无 heading 时与固化的基准 markup 逐字节一致（档位一，双重兜底）", () => {
    const ctx = buildCtx(resolveStyle("journal"), {})
    const deck = ir("journal", endingBare)

    const next = renderSvgMarkup(<MastheadEnding ir={deck} slide={endingBare} index={0} ctx={ctx} />)
    expect(next).toBe(MAGAZINE_EXPECTED_BARE)
    expect(next).toContain("致谢")
    expect(next).toContain("谢谢。")
  })

  it("consulting tokens 下用 consulting 的色（证明 token 化成立，无 baked hex）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const deck = ir("consulting", endingWithHeading)
    const out = renderSvgMarkup(<MastheadEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />)
    expect(out).toContain("#051C2C") // consulting text
    expect(out).toContain("#6C6C6C") // consulting muted
    expect(out).not.toContain("#1F1F1F") // magazine text 不得残留
    expect(out).not.toContain("#6E6259") // magazine muted 不得残留
  })

  it("passes assertSubset (no forbidden elements)", () => {
    const ctx = buildCtx(resolveStyle("journal"), {})
    const deck = ir("journal", endingWithHeading)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <MastheadEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />
      </svg>,
    )
    expect(markup).not.toContain("foreignObject")
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("falls back to 「致谢」/「谢谢。」 when heading/subheading are absent, with italic centered fallback subheading", () => {
    const ctx = buildCtx(resolveStyle("journal"), {})
    const slide: Slide = { type: "ending", heading: "", blocks: [] } as Slide
    const deck = ir("journal", slide)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <MastheadEnding ir={deck} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    expect(markup).toContain("致谢")
    expect(markup).toContain("谢谢")
    const root = parseSvgRoot(markup)
    const subheading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("谢谢"),
    )!
    expect(subheading.getAttribute("font-style")).toBe("italic")
    expect(subheading.getAttribute("text-anchor")).toBe("middle")
  })

  it("renders an explicit subheading instead of the default when provided (heading present)", () => {
    const ctx = buildCtx(resolveStyle("journal"), {})
    const slide: Slide = { type: "ending", heading: "致谢", subheading: "感谢聆听与支持", blocks: [] } as Slide
    const deck = ir("journal", slide)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <MastheadEnding ir={deck} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    expect(markup).toContain("感谢聆听与支持")
    expect(markup).not.toContain("谢谢。")
  })

  describe("two-line title reflow (S3b addendum, 2026-07-07 — regression lock for six-theme consistency)", () => {
    it("last-line-anchored (pre-existing design, unchanged by this task): a 2-line heading's last line lands at the same y (340) as the 1-line case, so the subheading/meta below is byte-identical regardless of line count", () => {
      const ctx = buildCtx(resolveStyle("journal"), {})
      // "从今天开始用声明式管理你的整个" (15 CJK chars) is the shortest input
      // that forces wrapping here (maxWidth=1088/fontSize=76 -> ~14.3
      // units/line) while staying at the *nominal* 76px (not shrunk).
      // 显式副题：2026-07-09 去重裁决后，有 heading 时副题不再兜底渲染，
      // 本测试锁的是副题基线几何，需自带副题。
      const twoLineSlide: Slide = { type: "ending", heading: "从今天开始用声明式管理你的整个", subheading: "感谢聆听", blocks: [] } as Slide
      const oneLineSlide: Slide = { type: "ending", heading: "致谢", subheading: "感谢聆听", blocks: [] } as Slide

      const twoLineRoot = parseSvgRoot(
        renderSvgMarkup(
          <svg xmlns="http://www.w3.org/2000/svg">
            <MastheadEnding ir={ir("journal", twoLineSlide)} slide={twoLineSlide} index={0} ctx={ctx} />
          </svg>,
        ),
      )
      const oneLineRoot = parseSvgRoot(
        renderSvgMarkup(
          <svg xmlns="http://www.w3.org/2000/svg">
            <MastheadEnding ir={ir("journal", oneLineSlide)} slide={oneLineSlide} index={0} ctx={ctx} />
          </svg>,
        ),
      )

      const twoLineHeadingTexts = Array.from(twoLineRoot.querySelectorAll("text")).filter(
        (t) => t.getAttribute("font-weight") === "600" && t.getAttribute("text-anchor") === "middle",
      )
      expect(twoLineHeadingTexts.length).toBe(2)
      expect(Number(twoLineHeadingTexts[0].getAttribute("font-size"))).toBe(76) // nominal, not shrunk
      const ys = twoLineHeadingTexts.map((t) => Number(t.getAttribute("y"))).sort((a, b) => a - b)
      const [firstY, lastY] = ys
      expect(firstY).toBe(340 - 82) // HEADING_LAST_BASELINE(340) - lineHeight(round(76*1.08)=82)
      expect(lastY).toBe(340) // invariant — same as the 1-line baseline

      const oneLineHeading = Array.from(oneLineRoot.querySelectorAll("text")).find(
        (t) => t.textContent === "致谢",
      )!
      expect(oneLineHeading.getAttribute("y")).toBe("340")

      // Subheading baseline (headingLastY+56=396) and the fixed y=640 meta
      // line are both untouched by line count.
      const twoLineSub = twoLineRoot.querySelector('text[font-style="italic"]')!
      const oneLineSub = oneLineRoot.querySelector('text[font-style="italic"]')!
      expect(twoLineSub.getAttribute("y")).toBe(oneLineSub.getAttribute("y"))
      expect(twoLineSub.getAttribute("y")).toBe("396")
    })
  })
})
