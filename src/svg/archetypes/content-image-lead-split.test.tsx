// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { CANONICAL_THEME_IDS } from "../../themes"
import { auditDeck } from "../audit/deck-audit"
import { installNodePlatform } from "../../platform/node"
import { CJK_LONG, MIXED_LONG } from "../audit/stress-fixtures"
import { ImageLeadSplitContent } from "./content-image-lead-split"
import type { PptxIR, Slide } from "@/ir"

installNodePlatform()

/** Parse a `data-audit-rect`/`data-audit-box` attribute into a box. */
function parseAudit(attr: string | null | undefined): { x: number; y: number; w: number; h?: number } {
  const [x, y, w, h] = (attr ?? "").split(",").map(Number)
  return { x, y, w, h }
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

const zeroComponents: Slide = { type: "content", heading: "占位标题", components: [] } as Slide
const paragraphLead: Slide = {
  type: "content",
  heading: "首个组件非图表",
  components: [
    { type: "paragraph", text: "首个组件是段落，不是图表/图片。" },
    { type: "bullets", items: ["要点一", "要点二"] },
  ],
} as Slide
const imageLead: Slide = {
  type: "content",
  heading: "产品截图讲解",
  components: [
    { type: "image", asset_id: "shot-1", caption: "截图说明" },
    { type: "paragraph", text: "配文字解读。" },
  ],
} as Slide
const chartLead: Slide = {
  type: "content",
  heading: "数据图表配文字",
  components: [
    { type: "chart", chart_type: "bar", series: [{ name: "收入", data: [{ x: "Q1", y: 1 }] }] },
    { type: "paragraph", text: "解读文字。" },
  ],
} as Slide

const chartOnly: Slide = {
  type: "content",
  heading: "数据图表独占一页",
  components: [
    { type: "chart", chart_type: "bar", series: [{ name: "收入", data: [{ x: "Q1", y: 1 }] }] },
  ],
} as Slide

function ir(slides: Slide[], images: PptxIR["assets"]["images"] = {}): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "consulting" },
    meta: {},
    assets: { images },
    slides,
  } as PptxIR
}

function render(deck: PptxIR, slide: Slide, index = 0): { markup: string; root: Element } {
  const ctx = buildCtx(resolveStyle(deck.theme.id), deck.assets.images)
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <ImageLeadSplitContent ir={deck} slide={slide} index={index} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

describe("ImageLeadSplitContent geometry", () => {
  it("unconditional 60/40 split: narrow (435px) text column and a wider visual column, never overlapping — when a real scalable component leads", () => {
    const deck = ir([imageLead], { "shot-1": { src: "data:image/png;base64,AAAA" } })
    const { root } = render(deck, imageLead)
    const rects = Array.from(root.querySelectorAll("g[data-audit-rect]")).map((g) =>
      parseAudit(g.getAttribute("data-audit-rect")),
    )
    // Text column body rect (x=96) and visual column rect (the wider one).
    const textRect = rects.find((r) => r.x === 96)!
    const visualRect = rects.find((r) => r.x !== 96)!
    expect(textRect).toBeTruthy()
    expect(visualRect).toBeTruthy()
    expect(textRect.w).toBe(435)
    expect(visualRect.w).toBeGreaterThan(textRect.w) // visual column is the wider one (~60%)
    expect(textRect.w).toBeLessThan(632) // narrower than the pool's previous single-stack minimum
    // Never touch: text column's right edge stays left of visual column's left edge.
    expect(textRect.x + textRect.w).toBeLessThanOrEqual(visualRect.x)
    expect(rectsOverlap(textRect as { x: number; y: number; w: number; h: number }, visualRect as { x: number; y: number; w: number; h: number })).toBe(false)
  })

  // Controller-probed defect (content-archetype expansion wave, follow-up
  // fix round): with NO scalable (image/chart) lead component at all — 0
  // components, or every component non-scalable (e.g. a kpi_cards-only
  // page) — the visual column has nothing real to show, only a decorative
  // placeholder. Keeping the text column pinned at 435px in that case
  // squeezes real content into a narrow column purely to make room for a
  // drawn accent shape, which is exactly what caused `annualReviewPreset`'s
  // kpi_cards-only page to truncate a label at 435px. Mirrors
  // `content-asymmetric-triptych.tsx`'s own `bottomStarved` precedent (T1
  // commit e067256): when the thing that would justify a narrow column is
  // absent, the column reclaims the freed space instead of staying narrow
  // beside a void.
  describe("starved (no scalable lead component): the text column reclaims the freed width", () => {
    it("a zero-component page widens the text column past 435px", () => {
      const { root } = render(ir([zeroComponents]), zeroComponents)
      const rects = Array.from(root.querySelectorAll("g[data-audit-rect]")).map((g) =>
        parseAudit(g.getAttribute("data-audit-rect")),
      )
      const textRect = rects.find((r) => r.x === 96)!
      expect(textRect).toBeTruthy()
      expect(textRect.w).toBeGreaterThan(435)
    })

    it("a non-scalable lead (paragraph) also widens the text column past 435px", () => {
      const { root } = render(ir([paragraphLead]), paragraphLead)
      const rects = Array.from(root.querySelectorAll("g[data-audit-rect]")).map((g) =>
        parseAudit(g.getAttribute("data-audit-rect")),
      )
      const textRect = rects.find((r) => r.x === 96)!
      expect(textRect).toBeTruthy()
      expect(textRect.w).toBeGreaterThan(435)
    })

    it("the widened text column never overlaps the (now smaller) decorative visual column", () => {
      const { root } = render(ir([zeroComponents]), zeroComponents)
      const rects = Array.from(root.querySelectorAll("g[data-audit-rect]")).map((g) =>
        parseAudit(g.getAttribute("data-audit-rect")),
      )
      const textRect = rects.find((r) => r.x === 96)! as { x: number; y: number; w: number; h: number }
      const visualRect = rects.find((r) => r.x !== 96)! as { x: number; y: number; w: number; h: number }
      expect(textRect.x + textRect.w).toBeLessThanOrEqual(visualRect.x)
      expect(rectsOverlap(textRect, visualRect)).toBe(false)
    })

    // Skeleton-diversity guard (audit/content-skeleton-diversity.test.tsx):
    // the widened starved-case text column must not collapse into an
    // existing archetype's own (x, width) class — `narrow-column`/
    // `side-highlight`'s shared (96, 880) class, `two-column`'s (96, 528)/
    // (656, 528) pair, or `asymmetric-triptych`'s (96, 632) lead column —
    // which would quietly erase this wave's earned skeleton diversity for
    // the (common) imageless case.
    it("the widened width does not collide with narrow-column's (880) or two-column's (528) or asymmetric-triptych's (632) region widths", () => {
      const { root } = render(ir([zeroComponents]), zeroComponents)
      const rects = Array.from(root.querySelectorAll("g[data-audit-rect]")).map((g) =>
        parseAudit(g.getAttribute("data-audit-rect")),
      )
      const textRect = rects.find((r) => r.x === 96)!
      for (const collidingWidth of [632, 880, 528, 1088]) {
        expect(Math.abs(textRect.w - collidingWidth)).toBeGreaterThan(20)
      }
    })

    it("still starved, does not enlarge all the way to the pool's full 1088px content width (would collide with banner-heading/rail-numbered)", () => {
      const { root } = render(ir([zeroComponents]), zeroComponents)
      const rects = Array.from(root.querySelectorAll("g[data-audit-rect]")).map((g) =>
        parseAudit(g.getAttribute("data-audit-rect")),
      )
      const textRect = rects.find((r) => r.x === 96)!
      expect(textRect.w).toBeLessThan(1000)
    })
  })

  it("visual column renders even with zero components — a drawn placeholder, not an empty hole", () => {
    const { markup, root } = render(ir([zeroComponents]), zeroComponents)
    expect(markup).not.toContain("<image")
    // The placeholder draws a rounded card + accent circle + accent bar —
    // at least one filled rect and one circle beyond the text column.
    const circles = root.querySelectorAll("circle")
    expect(circles.length).toBeGreaterThanOrEqual(1)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("a non-scalable first component (paragraph) doesn't get orphaned — it stays in the text column, visual column still shows a placeholder", () => {
    const { markup, root } = render(ir([paragraphLead]), paragraphLead)
    expect(markup).not.toContain("<image")
    expect(markup).toContain("首个组件是段落")
    expect(markup).toContain("要点一")
    // Placeholder circle still present (decorative composition, not empty).
    expect(root.querySelectorAll("circle").length).toBeGreaterThanOrEqual(1)
  })
})

describe("ImageLeadSplitContent visual column — scalable lead component", () => {
  it("an image lead with a resolved asset renders a real <image>, letterboxed within the visual column", () => {
    const deck = ir([imageLead], { "shot-1": { src: "data:image/png;base64,AAAA" } })
    const { markup, root } = render(deck, imageLead)
    const img = root.querySelector("image")
    expect(img).not.toBeNull()
    expect(markup).toContain("截图说明") // caption still renders (image.tsx's own caption band)
    // The scaled box must stay inside the visual column's own rect.
    const rects = Array.from(root.querySelectorAll("g[data-audit-rect]")).map((g) =>
      parseAudit(g.getAttribute("data-audit-rect")),
    )
    const visualRect = rects.find((r) => r.x !== 96)!
    const visualRectGroup = Array.from(root.querySelectorAll("g[data-audit-rect]")).find(
      (g) => parseAudit(g.getAttribute("data-audit-rect")).x !== 96,
    )!
    const box = visualRectGroup.querySelector("g[data-audit-box]")
    // The visual rect's own data-audit-box (the scaled image), not the text
    // column's (SvgContent renders its own data-audit-box at x=96 too).
    expect(box).not.toBeNull()
    const boxParsed = parseAudit(box!.getAttribute("data-audit-box"))
    expect(boxParsed.x).toBeGreaterThanOrEqual(visualRect.x - 0.01)
    expect(boxParsed.x + (boxParsed.w ?? 0)).toBeLessThanOrEqual(visualRect.x + visualRect.w + 0.01)
  })

  it("iron rule: an image lead with an unresolved asset degrades to a drawn placeholder, never an <image> element", () => {
    const deck = ir([imageLead], {}) // no resolved src for "shot-1"
    const { markup, root } = render(deck, imageLead)
    expect(markup).not.toContain("<image")
    expect(markup).toContain("Image missing") // image.tsx's own missing-asset placeholder text
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("a chart lead scales uniformly to fit the visual column, no <image> involved", () => {
    const { markup, root } = render(ir([chartLead]), chartLead)
    expect(markup).not.toContain("<image")
    const scaledGroup = root.querySelector('g[transform*="scale("]')
    expect(scaledGroup).not.toBeNull()
    // The remaining paragraph still renders in the text column.
    expect(markup).toContain("解读文字")
  })

  it("the scaled component never enlarges beyond the visual column's own rect (shrink-to-fit cap, not stacked-poster's 1.3x bleed)", () => {
    const { root } = render(ir([chartLead]), chartLead)
    const scaledGroup = root.querySelector('g[transform*="scale("]')!
    const scaleMatch = /scale\(([\d.]+)\)/.exec(scaledGroup.getAttribute("transform") ?? "")!
    const scale = Number(scaleMatch[1])
    expect(scale).toBeLessThanOrEqual(1)
  })
})

describe("ImageLeadSplitContent pathological content", () => {
  it("a pathologically long CJK heading shrinks/wraps in the 435px column, never rendering the raw string in one <text>", () => {
    const slide: Slide = { ...zeroComponents, heading: CJK_LONG }
    const { markup, root } = render(ir([slide]), slide)
    expect(() => assertSubset(root)).not.toThrow()
    const headingTexts = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "700")
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    expect(headingTexts.length).toBeLessThanOrEqual(3) // maxLines: 3
    expect(headingTexts.every((t) => t.textContent !== CJK_LONG)).toBe(true)
    expect(markup).toContain("微服务架构")
  })

  it("a pathologically long mixed-script heading (MIXED_LONG) also shrinks/wraps safely", () => {
    const slide: Slide = { ...zeroComponents, heading: MIXED_LONG }
    const { root } = render(ir([slide]), slide)
    expect(() => assertSubset(root)).not.toThrow()
    const headingTexts = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "700")
    expect(headingTexts.every((t) => t.textContent !== MIXED_LONG)).toBe(true)
  })

  // Zero overflow/out-of-bounds/overlap findings, swept across every canonical
  // theme, with the layout explicitly pinned (`slide.layout`) so the
  // narrow-column/pathological-content combination is exercised deterministically
  // rather than left to auto-selection's seeded sampling to maybe hit it.
  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: zero overflow/out-of-bounds/overlap findings on a pathological CJK_LONG + MIXED_LONG deck`, () => {
      const slide: Slide = {
        type: "content",
        layout: "image-lead-split",
        heading: CJK_LONG,
        subheading: MIXED_LONG,
        components: [
          { type: "bullets", items: [MIXED_LONG, CJK_LONG, MIXED_LONG] },
          { type: "paragraph", text: CJK_LONG },
        ],
      } as Slide
      const deck: PptxIR = { ...ir([slide]), theme: { id: themeId } }
      const findings = auditDeck(deck).findings.filter(
        (f) => f.code === "overflow" || f.code === "out-of-bounds" || f.code === "overlap",
      )
      expect(findings).toEqual([])
    })

    it(`${themeId}: zero overflow/out-of-bounds/overlap findings on a pathological chart-lead deck`, () => {
      const slide: Slide = {
        type: "content",
        layout: "image-lead-split",
        heading: CJK_LONG,
        components: [
          { type: "chart", chart_type: "bar", series: [{ name: MIXED_LONG.slice(0, 24), data: [{ x: "Q1", y: 1 }] }] },
          { type: "bullets", items: [MIXED_LONG, CJK_LONG] },
        ],
      } as Slide
      const deck: PptxIR = { ...ir([slide]), theme: { id: themeId } }
      const findings = auditDeck(deck).findings.filter(
        (f) => f.code === "overflow" || f.code === "out-of-bounds" || f.code === "overlap",
      )
      expect(findings).toEqual([])
    })
  }
})

// Content-archetype expansion wave, task T3 — coverage gap T2's review
// found: this archetype's text column was never stress-tested against
// `kpi_cards`, whose own card-width math (`kpi.tsx`'s `naturalCardW =
// (box.w - GAP*(n-1)) / n`) divides the box width by item count.
//
// **Superseded by the controller-probed follow-up fix**: a kpi_cards-only
// slide has no scalable lead component, so it now hits the "starved"
// branch (see content-image-lead-split.tsx's file header) and gets the
// widened 788px column, not the old unconditional 435px. At 435px this
// suite used to pin `naturalCardW` ≈ 134px/card with an 94px text budget
// narrow enough to truncate every label — plan.md's own controller ruling
// at the time called that "adjudicated correct behavior". It wasn't: that
// exact truncation is what showed up for real in `annualReviewPreset`'s
// kpi_cards-only page, and is the defect this fix addresses. At the
// widened 788px column, `naturalCardW` ≈ 252px/card (212px text budget) —
// comfortably enough for these realistic labels to render without
// truncating. This suite now pins the *fixed* behavior (zero truncation,
// all cards visible) so a future regression is caught the same way the old
// truncation used to be pinned.
describe("ImageLeadSplitContent — kpi_cards in the widened starved column (T3 coverage gap, re-pinned post-fix)", () => {
  const kpiSlide: Slide = {
    type: "content",
    layout: "image-lead-split",
    heading: "KPI coverage in the narrow column",
    components: [
      {
        type: "kpi_cards",
        items: [
          { value: "128", unit: "%", label: "Revenue growth YoY", delta: "up" },
          { value: "42", unit: "ms", label: "P95 latency improvement", delta: "down" },
          { value: "99.9", unit: "%", label: "Uptime SLA compliance", delta: "flat" },
        ],
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: a realistic 3-item kpi_cards row renders with zero overflow/out-of-bounds/overlap findings`, () => {
      const deck: PptxIR = { ...ir([kpiSlide]), theme: { id: themeId } }
      const findings = auditDeck(deck).findings.filter(
        (f) => f.code === "overflow" || f.code === "out-of-bounds" || f.code === "overlap",
      )
      expect(findings).toEqual([])
    })
  }

  it("fixed: all 3 cards stay visible and the label text no longer needs to truncate at the widened width", () => {
    const { markup, root } = render(ir([kpiSlide]), kpiSlide)
    const cardRects = Array.from(root.querySelectorAll("rect")).filter((r) => r.getAttribute("rx") !== null)
    // 3 kpi card shells, none dropped — the capacity gate (how many cards
    // fit) is unaffected by this fix; still working correctly.
    expect(cardRects.length).toBeGreaterThanOrEqual(3)
    // The fix: at 788px (252px/card, 212px text budget) none of these
    // realistic labels need `fitSvgLine`'s truncation anymore — the exact
    // interaction that used to truncate `annualReviewPreset`'s kpi label.
    expect(markup).not.toContain('data-truncated="1"')
    expect(markup).toContain("Revenue growth YoY")
    expect(markup).toContain("P95 latency improvement")
    expect(markup).toContain("Uptime SLA compliance")
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("every kpi card stays within the widened (788px) text column's own bounds — no card right-edge crosses into the visual column's x=924 start", () => {
    const { root } = render(ir([kpiSlide]), kpiSlide)
    const bodyGroup = root.querySelector('g[data-audit-box^="96,"]')
    expect(bodyGroup).not.toBeNull()
    const cardRects = Array.from(bodyGroup!.querySelectorAll("rect")).filter((r) => r.getAttribute("rx") !== null)
    expect(cardRects.length).toBe(3)
    for (const r of cardRects) {
      const x = Number(r.getAttribute("x"))
      const w = Number(r.getAttribute("width"))
      // Card x is local to the kpi component's own translated <g> (relative
      // to the 788px starved-case body rect, not the page) — asserting
      // against 788 (not 96+788) matches kpi.tsx's own coordinate space.
      expect(x + w).toBeLessThanOrEqual(788 + 0.01)
    }
  })
})

describe("ImageLeadSplitContent determinism", () => {
  it("renders byte-identical markup across two independent renders of the same slide", () => {
    const a = render(ir([imageLead], { "shot-1": { src: "data:image/png;base64,AAAA" } }), imageLead)
    const b = render(ir([imageLead], { "shot-1": { src: "data:image/png;base64,AAAA" } }), imageLead)
    expect(a.markup).toBe(b.markup)
  })

  it("renders byte-identical markup for the zero-component placeholder path across two renders", () => {
    const a = render(ir([zeroComponents]), zeroComponents)
    const b = render(ir([zeroComponents]), zeroComponents)
    expect(a.markup).toBe(b.markup)
  })
})

describe("ImageLeadSplitContent header-only balance", () => {
  it("centers the text block against the visual column when the body is empty", () => {
    // Visual review 2026-08-15: a single-chart page kept the 60/40 split but
    // top-aligned a two-line heading in the 435px column, leaving ~450px of
    // dead space under it beside a full-height chart — read as content
    // having gone missing ("这个页面为什么左侧全空白" / "主体为什么不居中").
    // The fix moves the text down to share a center line with the visual;
    // no width changes, so the archetype keeps its own skeleton.
    const deck = ir([chartOnly])
    const { root } = render(deck, chartOnly)
    const headings = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.textContent && chartOnly.heading!.includes(t.textContent.slice(0, 4)),
    )
    expect(headings.length).toBeGreaterThan(0)
    const firstBaseline = Number(headings[0]!.getAttribute("y"))
    // The visual column spans y=72..640, so its center is 356. A top-aligned
    // heading would sit at the 150 baseline; the centered one sits well
    // below that and near the column's own middle.
    expect(firstBaseline).toBeGreaterThan(250)
    expect(firstBaseline).toBeLessThan(430)
  })

  it("leaves the text block top-aligned as soon as the body carries anything", () => {
    // With body content the stack must keep the full column height to grow
    // into, so the centering is strictly the empty-body case.
    const deck = ir([chartLead])
    const { root } = render(deck, chartLead)
    const headings = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.textContent && chartLead.heading!.includes(t.textContent.slice(0, 4)),
    )
    expect(Number(headings[0]!.getAttribute("y"))).toBe(150)
  })
})
