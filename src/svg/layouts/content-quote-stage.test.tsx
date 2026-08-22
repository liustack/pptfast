// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { QuoteStageContent, layoutDef } from "./content-quote-stage"
import type { PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"
const MIXED_LONG =
  "基于 Kubernetes Operator 的 StatefulSet 滚动升级与 PodDisruptionBudget 联动策略 v2.3.1-rc.4 说明"

function ir(theme: string, slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides,
  } as unknown as PptxIR
}

function render(body: React.ReactElement): { markup: string; root: Element } {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

const zeroComponentSlide: Slide = {
  type: "content",
  layout: "quote-stage",
  heading: "简洁是最终的复杂",
  components: [],
} as Slide

const oneComponentSlide: Slide = {
  type: "content",
  layout: "quote-stage",
  heading: "简洁是最终的复杂",
  components: [{ type: "paragraph", text: "—— 达·芬奇" }],
} as Slide

describe("layoutDef", () => {
  it("declares pinOnly, a capacity-1 body slot, and the content slide type", () => {
    expect(layoutDef.id).toBe("quote-stage")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.slideTypes).toEqual(["content"])
    const body = layoutDef.slots.find((s) => s.name === "body")
    expect(body?.capacity).toBe(1)
  })
})

describe("QuoteStageContent", () => {
  it("0 components: renders the heading as a centered, oversized main visual with no crash", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const { markup, root } = render(
      <QuoteStageContent ir={ir("insight", [zeroComponentSlide])} slide={zeroComponentSlide} index={0} ctx={ctx} />,
    )
    expect(markup).toContain("简洁是最终的复杂")
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("简洁是最终的复杂"),
    )!
    expect(heading.getAttribute("text-anchor")).toBe("middle")
    expect(heading.getAttribute("x")).toBe("640")
    expect(heading.getAttribute("font-weight")).toBe("800")
    expect(heading.getAttribute("fill")).toBe(ctx.colors.text)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("1 component: renders as a small centered attribution annotation below the heading, not a full-width body", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const { markup, root } = render(
      <QuoteStageContent ir={ir("insight", [oneComponentSlide])} slide={oneComponentSlide} index={0} ctx={ctx} />,
    )
    expect(markup).toContain("达·芬奇")
    const bodyGroup = root.querySelector("g[data-audit-rect]")!
    const [, , w] = (bodyGroup.getAttribute("data-audit-rect") ?? "").split(",").map(Number)
    expect(w).toBeLessThan(1000) // narrower than the heading's own maxWidth — an annotation, not a body column
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("accent hairline is the only primary-filled element; heading uses colors.text, never accent, unwrapped (no accessibleInk needed)", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const { root } = render(
      <QuoteStageContent ir={ir("insight", [zeroComponentSlide])} slide={zeroComponentSlide} index={0} ctx={ctx} />,
    )
    const accentBar = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("fill") === ctx.colors.primary,
    )!
    expect(accentBar).toBeTruthy()
    const primaryTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("fill") === ctx.colors.primary,
    )
    expect(primaryTexts.length).toBe(0)
  })

  it("subheading renders as a small muted annotation (never accent, never emphasis tspans)", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = { ...zeroComponentSlide, subheading: "**强调** 的附注" } as Slide
    const { root } = render(<QuoteStageContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)
    const sub = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("附注"))!
    expect(sub.getAttribute("fill")).toBe(ctx.colors.muted)
    expect(sub.getAttribute("text-anchor")).toBe("middle")
    // No renderEmphasisTspans segmentation — the literal `**...**` markers
    // pass through as plain text rather than becoming <tspan> children.
    expect(sub.querySelector("tspan")).toBeNull()
    expect(sub.textContent).toContain("**强调**")
  })

  it("footnote renders as a small italic muted caption, independent of the body annotation slot", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = { ...oneComponentSlide, footnote: "数据来源：内部审计" } as Slide
    const { root } = render(<QuoteStageContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)
    const footnote = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("数据来源"),
    )!
    expect(footnote.getAttribute("fill")).toBe(ctx.colors.muted)
    expect(footnote.getAttribute("font-style")).toBe("italic")
  })

  it("no kicker/section-label text is rendered even when preceded by a chapter — quote-stage is deliberately uninterrupted", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const chapter: Slide = { type: "chapter", heading: "第一章", components: [] } as Slide
    const { root } = render(
      <QuoteStageContent
        ir={ir("insight", [chapter, zeroComponentSlide])}
        slide={zeroComponentSlide}
        index={1}
        ctx={ctx}
      />,
    )
    expect(Array.from(root.querySelectorAll("text")).some((t) => (t.textContent ?? "").includes("Chapter"))).toBe(
      false,
    )
  })

  describe("pathological long-quote content (CJK_LONG / MIXED_LONG)", () => {
    it("a single CJK_LONG heading shrinks/wraps via fitHeadingLines but does not truncate (well within budget)", () => {
      const ctx = buildCtx(resolveStyle("insight"), {})
      const slide: Slide = { type: "content", layout: "quote-stage", heading: CJK_LONG, components: [] } as Slide
      const { markup, root } = render(<QuoteStageContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)
      expect(() => assertSubset(root)).not.toThrow()
      expect(root.querySelector('[data-truncated="1"]')).toBeNull()
      expect(markup).toContain("微服务架构")
      const headingTexts = Array.from(root.querySelectorAll("text")).filter(
        (t) => t.getAttribute("font-weight") === "800",
      )
      for (const t of headingTexts) {
        const fontSize = Number(t.getAttribute("font-size"))
        expect(fontSize).toBeLessThanOrEqual(92) // nominal
        expect(fontSize).toBeGreaterThanOrEqual(36) // minPt
      }
    })

    it("a pathologically long heading (2x CJK_LONG + MIXED_LONG) still renders without throwing, shrinks to minPt, wraps to at most maxLines, and never dumps the raw source string verbatim", () => {
      const ctx = buildCtx(resolveStyle("insight"), {})
      const extreme = `${CJK_LONG}${CJK_LONG}${MIXED_LONG}`
      const slide: Slide = { type: "content", layout: "quote-stage", heading: extreme, components: [] } as Slide
      const { markup, root } = render(<QuoteStageContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)
      expect(() => assertSubset(root)).not.toThrow()

      const headingTexts = Array.from(root.querySelectorAll("text")).filter(
        (t) => t.getAttribute("font-weight") === "800",
      )
      expect(headingTexts.length).toBeGreaterThanOrEqual(1)
      expect(headingTexts.length).toBeLessThanOrEqual(4) // maxLines: 4
      for (const t of headingTexts) {
        // The truncate-fallback branch (fitHeadingLines) re-wraps the
        // *truncated* text at fontSize=minPt, but layoutSvgText can still
        // shrink further below that floor as an absolute last resort if a
        // single unbreakable line is still too wide — so this is <=, not
        // ===, the same tolerance every other layout's own pathological-
        // content test gives this exact fallback path.
        expect(Number(t.getAttribute("font-size"))).toBeLessThanOrEqual(36)
      }
      expect(headingTexts.every((t) => t.textContent !== extreme)).toBe(true)
      expect(markup).not.toContain(extreme)
    })

    it("0-component + 1-component variants both stay within the SVG page bounds for extreme content (body rect never runs past y=720)", () => {
      const ctx = buildCtx(resolveStyle("insight"), {})
      const extreme = `${CJK_LONG}${CJK_LONG}${MIXED_LONG}`
      for (const components of [[], [{ type: "paragraph", text: MIXED_LONG }]] as Slide["components"][]) {
        const slide: Slide = { type: "content", layout: "quote-stage", heading: extreme, subheading: MIXED_LONG, components } as Slide
        const { root } = render(<QuoteStageContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)
        const bodyGroup = root.querySelector("g[data-audit-rect]")!
        const [, y, , h] = (bodyGroup.getAttribute("data-audit-rect") ?? "").split(",").map(Number)
        expect(y + h).toBeLessThanOrEqual(720)
      }
    })
  })

  // quote-stage wave, T2 fix round (whole-branch review, Finding 2 — Global
  // Constraint 3's determinism requirement had no dedicated test for a
  // pinned quote-stage page): unlike the two determinism tests above (this
  // file's own `QuoteStageContent`-only render, bypassing motif/decor
  // selection), this one goes through the real public entry point end to
  // end — `renderSlideSvg` (`src/api.ts`) on a full `PptxIR` — the same
  // "double-render, same IR, byte-identical output" shape
  // `full-slide-svg.test.tsx`'s own "double-render determinism" test and
  // `generate-determinism.test.ts`'s whole-file tests already established,
  // just at the SVG-string layer those don't individually cover for this
  // layout. A long CJK heading (this layout's most content-heavy,
  // most fitHeadingLines-shrinking case) plus one attribution component
  // (the body slot's only legal non-empty shape, capacity 1) is the
  // combination most likely to expose any non-determinism in either
  // fitHeadingLines' text layout or the shared motif/decor seed derivation.
  describe("end-to-end determinism via renderSlideSvg (quote-stage wave, T2 fix round)", () => {
    it("a pinned quote-stage page with a long CJK heading and one attribution component renders byte-identical SVG across two independent renderSlideSvg calls", async () => {
      const { renderSlideSvg } = await import("../../api")
      const slide: Slide = {
        type: "content",
        layout: "quote-stage",
        heading: CJK_LONG,
        components: [{ type: "paragraph", text: "—— 出处" }],
      } as Slide
      const doc = ir("consulting", [slide])

      const svgA = renderSlideSvg(doc, 0)
      const svgB = renderSlideSvg(doc, 0)

      expect(svgB).toBe(svgA)
    })
  })

  it("CJK two-line heading does not overlap itself, and the citation sits below last ink with air", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = {
      type: "content",
      layout: "quote-stage",
      heading: "竞品在中小客户市场的价格压力",
      components: [{ type: "citation", sources: [{ label: "[1] 云觅科技 2026 年第二季度经营数据" }] }],
    } as Slide
    const { root } = render(<QuoteStageContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)
    const headings = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "800")
    expect(headings.length).toBe(2)
    const fs = Number(headings[0]!.getAttribute("font-size"))
    const y0 = Number(headings[0]!.getAttribute("y"))
    const y1 = Number(headings[1]!.getAttribute("y"))
    expect(y1 - fs).toBeGreaterThan(y0 + fs * 0.16)
    const lastInk = y1 + fs * 0.16
    const body = root.querySelector("g[data-audit-rect]")!
    const [, citY] = (body.getAttribute("data-audit-rect") ?? "").split(",").map(Number)
    expect(citY).toBeGreaterThan(lastInk + 24)
    const bar = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "56")!
    const barBottom = Number(bar.getAttribute("y")) + Number(bar.getAttribute("height"))
    expect(y0 - fs).toBeGreaterThan(barBottom)
  })

  it("English three-line heading shrinks or wraps so the last line clears the citation", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = {
      type: "content",
      layout: "quote-stage",
      heading: "Competitors are pricing below cost in the mid-market",
      components: [{ type: "citation", sources: [{ label: "[1] CloudSeek Collaboration Q2 2026 operating data" }] }],
    } as Slide
    const { root } = render(<QuoteStageContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)
    const headings = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "800")
    expect(headings.length).toBeGreaterThanOrEqual(2)
    const last = headings[headings.length - 1]!
    const fs = Number(last.getAttribute("font-size"))
    const lastInk = Number(last.getAttribute("y")) + fs * 0.22
    const body = root.querySelector("g[data-audit-rect]")!
    const [, citY, , citH] = (body.getAttribute("data-audit-rect") ?? "").split(",").map(Number)
    expect(citY).toBeGreaterThan(lastInk + 24)
    expect(citY + citH).toBeLessThanOrEqual(640)
  })

  it("consulting tokens: no creative/insight baked hex leaks (token discipline)", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const out = renderSvgMarkup(
      <QuoteStageContent ir={ir("consulting", [zeroComponentSlide])} slide={zeroComponentSlide} index={0} ctx={ctx} />,
    )
    expect(out).toContain(ctx.colors.text)
    expect(out).not.toContain("#16202B") // insight primary
    expect(out).not.toContain("#2A3440") // insight border
  })
})
