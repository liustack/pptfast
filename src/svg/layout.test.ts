import { describe, it, expect } from "vitest"
import { layoutContent, layoutContentFit, COLUMN_GAP, type ContentRect } from "./layout"
import { measureComponent } from "./components"
import type { ComponentCtx } from "./components/types"
import type { Component } from "@/ir"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFF",
    surface: "#EEE",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

const para: Component = { type: "paragraph", text: "测试段落，占据一定高度。" }
const list: Component = { type: "bullets", items: ["甲", "乙", "丙"] }
const kpi: Component = { type: "kpi_cards", items: [{ value: "9", label: "x" }] }
const img: Component = { type: "image", asset_id: "a", fit: "cover" }
const quote: Component = { type: "quote", text: "一句引言。" }
const verdict: Component = {
  type: "verdict_banner",
  tone: "warning",
  text: "问题不在生成，而在改不动",
}

const rect: ContentRect = { x: 80, y: 264, w: 1120, h: 400 }

describe("layoutContent variants", () => {
  it("single stacks vertically with a gap", () => {
    const placed = layoutContent("single", [para, list], rect, ctx)
    expect(placed[0].box).toEqual({ x: 80, y: 264, w: 1120 })
    expect(placed[1].box.y).toBe(264 + measureComponent(para, 1120, ctx) + 16)
  })

  it("two_column splits components across two half-width columns", () => {
    const placed = layoutContent("two_column", [para, list, para, list], rect, ctx)
    const colW = (1120 - COLUMN_GAP) / 2
    // first two on the left at rect.x, last two on the right
    expect(placed[0].box.x).toBe(80)
    expect(placed[0].box.w).toBe(colW)
    expect(placed[2].box.x).toBe(80 + colW + COLUMN_GAP)
    expect(placed[2].box.w).toBe(colW)
  })

  it("two_column lets a leading column-spanning verdict own the full row before laying out ordinary blocks in columns", () => {
    const contentRect: ContentRect = { x: 96, y: 228, w: 1088, h: 400 }
    const placed = layoutContent("two_column", [verdict, para, list], contentRect, ctx)
    const verdictHeight = measureComponent(verdict, 1088, ctx)
    const ordinaryY = contentRect.y + verdictHeight + 16
    const colW = (contentRect.w - COLUMN_GAP) / 2

    expect(placed.map((item) => item.component.type)).toEqual([
      "verdict_banner",
      "paragraph",
      "bullets",
    ])
    expect(placed[0].box).toEqual({ x: 96, y: 228, w: 1088 })
    expect(placed[1].box).toEqual({ x: 96, y: ordinaryY, w: colW })
    expect(placed[2].box).toEqual({
      x: 96 + colW + COLUMN_GAP,
      y: ordinaryY,
      w: colW,
    })
  })

  it("kpi_focus hoists kpi_cards to a full-width top row", () => {
    const placed = layoutContent("kpi_focus", [para, kpi, list], rect, ctx)
    expect(placed[0].component.type).toBe("kpi_cards")
    expect(placed[0].box.w).toBe(1120)
    // remaining components follow below
    expect(placed.map((p) => p.component.type)).toEqual(["kpi_cards", "paragraph", "bullets"])
  })

  it("image_focus puts images left and text right", () => {
    const placed = layoutContent("image_focus", [para, img], rect, ctx)
    const colW = (1120 - COLUMN_GAP) / 2
    const imagePlaced = placed.find((p) => p.component.type === "image")!
    const textPlaced = placed.find((p) => p.component.type === "paragraph")!
    expect(imagePlaced.box.x).toBe(80)
    expect(textPlaced.box.x).toBe(80 + colW + COLUMN_GAP)
  })

  it("quote centers the component group vertically in the rect", () => {
    const placed = layoutContent("quote", [quote], rect, ctx)
    const h = measureComponent(quote, 1120, ctx)
    expect(placed[0].box.y).toBeCloseTo(264 + (400 - h) / 2, 0)
  })
})

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

function paragraphComponent(repeat: number): Component {
  return { type: "paragraph", text: Array.from({ length: repeat }, () => CJK_LONG).join("") }
}

function bulletsComponent(items: string[]): Component {
  return { type: "bullets", items }
}

describe("layoutContentFit", () => {
  it("compresses gaps then drops components that cannot fit the rect", () => {
    const many = Array.from({ length: 8 }, () => paragraphComponent(3))
    const fitRect: ContentRect = { x: 0, y: 0, w: 800, h: 400 }
    const { placed, dropped } = layoutContentFit(undefined, many, fitRect, ctx)
    const bottom = Math.max(...placed.map((p) => p.box.y + measureComponent(p.component, p.box.w, ctx)))
    expect(bottom).toBeLessThanOrEqual(400 + 1)
    expect(dropped).toBeGreaterThan(0)
  })

  it("keeps all components when they fit", () => {
    const { placed, dropped } = layoutContentFit(undefined, [bulletsComponent(["甲", "乙", "丙"])], rect, ctx)
    expect(dropped).toBe(0)
    expect(placed).toHaveLength(1)
  })

  it("never drops down to an empty content area when a single component overflows alone", () => {
    // One pathologically tall component and nothing else: dropping it would
    // render a slide with nothing but the "+N more" marker, which is
    // worse than showing the (overflowing) component itself.
    const mega = paragraphComponent(40)
    const tinyRect: ContentRect = { x: 0, y: 0, w: 400, h: 100 }
    const { placed, dropped } = layoutContentFit(undefined, [mega], tinyRect, ctx)
    expect(placed).toHaveLength(1)
    expect(dropped).toBe(0)
  })

  it("falls back to one full-width column rather than losing content to a split", () => {
    // Visual review 2026-08-15: a two-column page halves the width every
    // block gets, and blocks sized for a full-width rect routinely fail to
    // fit a half-width one. The page then rendered as one column of content
    // beside an empty one, with the rest silently dropped. A full-width
    // stack that keeps everything beats a split that loses some.
    // One block that only fits at full width plus a short one — the exact
    // pairing that produced "one column of content beside an empty one".
    const tall = [paragraphComponent(4), bulletsComponent(["甲"])]
    const splitRect: ContentRect = { x: 0, y: 0, w: 800, h: 400 }

    const split = layoutContentFit("two_column", tall, splitRect, ctx)
    expect(split.dropped).toBe(0)
    expect(split.placed).toHaveLength(2)
    // Both blocks now sit in one column at the rect's own full width, not
    // side by side at half of it.
    expect(new Set(split.placed.map((p) => p.box.x)).size).toBe(1)
    expect(split.placed[0].box.w).toBe(800)
  })

  it("keeps the split when one column alone cannot hold everything either", () => {
    // The fallback is about the arrangement costing content, not about
    // abandoning the theme's chosen layout whenever anything overflows: if
    // a single stack would drop something too, the split stands.
    const many = Array.from({ length: 8 }, () => paragraphComponent(3))
    const splitRect: ContentRect = { x: 0, y: 0, w: 800, h: 400 }
    const { dropped } = layoutContentFit("two_column", many, splitRect, ctx)
    expect(dropped).toBeGreaterThan(0)
  })

  it("keeps at least one component even when the first of several overflows on its own", () => {
    const mega = paragraphComponent(40)
    const many = [mega, bulletsComponent(["甲"]), bulletsComponent(["乙"])]
    const tinyRect: ContentRect = { x: 0, y: 0, w: 400, h: 100 }
    const { placed } = layoutContentFit(undefined, many, tinyRect, ctx)
    expect(placed.length).toBeGreaterThanOrEqual(1)
  })

  it("sets the degraded single column down at the golden position — 38% of the leftover above it, 62% below", () => {
    // The degrade branch has now been given all three answers. Splitting the
    // leftover evenly hung academic p06's first card 106px clear of the rule
    // line it belongs under; dropping the whole leftover to the bottom
    // welded that card to the same line ("99% 页面不能看"). The golden
    // position is the one the 2026-08-21 ruling keeps: gather the members
    // (the gap below is still the 24 its ceiling allows, not a share of the
    // leftover), then set the assembled block down 38% of the way into the
    // space that is left.
    const components = [paragraphComponent(4), bulletsComponent(["甲"])]
    const splitRect: ContentRect = { x: 0, y: 0, w: 800, h: 400 }
    const { placed, dropped } = layoutContentFit("two_column", components, splitRect, ctx)
    expect(dropped).toBe(0)
    // The single retry lands them at 0 and 228 (204 + a 16px gap grown by
    // the 8px its 1.5x ceiling allows), 112px short of the rect's bottom.
    // Both boxes then move down by the same 42.56 — 38% of that 112.
    expect(placed[0].box.y).toBeCloseTo(42.56, 5)
    expect(placed[1].box.y).toBeCloseTo(270.56, 5)
    expect(placed[1].box.y - placed[0].box.y).toBeCloseTo(228, 5) // one block, moved whole
    const top = placed[0].box.y
    const bottom = splitRect.h - (placed[1].box.y + measureComponent(placed[1].component, 800, ctx))
    expect(top / (top + bottom)).toBeCloseTo(0.38, 5)
  })

  it("puts the degraded and the non-degraded placement at the same coordinates", () => {
    // The same two blocks asked for `single` outright never reach the
    // degrade branch. Both paths settle the same way, so both agree — the
    // pin that keeps the degrade branch from growing a second, private
    // notion of where a stack belongs.
    const components = [paragraphComponent(4), bulletsComponent(["甲"])]
    const rect400: ContentRect = { x: 0, y: 0, w: 800, h: 400 }
    const { placed } = layoutContentFit("single", components, rect400, ctx)
    expect(placed[0].box.y).toBeCloseTo(42.56, 5)
    expect(placed[1].box.y).toBeCloseTo(270.56, 5)
    const degraded = layoutContentFit("two_column", components, rect400, ctx)
    expect(degraded.placed.map((p) => p.box.y)).toEqual(placed.map((p) => p.box.y))
  })

  it("restacks the survivors as one column when the drop pass empties a whole column", () => {
    // Visual review 2026-08-19 (D cluster, 5b): the `kept` filter only
    // sieves, so when both blocks assigned to the left column are the ones
    // that could not fit half the width, the survivor stays pinned to the
    // right column and the left half of the page renders empty. Nothing in
    // the audit names that shape — the reader is told two blocks are gone,
    // not that half the page is blank.
    const components = [paragraphComponent(6), paragraphComponent(6), bulletsComponent(["甲"])]
    const splitRect: ContentRect = { x: 0, y: 0, w: 800, h: 300 }
    const { placed, dropped } = layoutContentFit("two_column", components, splitRect, ctx)
    // Both paragraphs measure 612 at the 384px half width and 306 at the
    // full 800 — the single-column retry drops them too, so the split
    // stands and only the bullets survive.
    expect(dropped).toBe(2)
    expect(placed).toHaveLength(1)
    expect(placed[0].component.type).toBe("bullets")
    expect(placed[0].box.x).toBe(0) // was 416, the right column's own x
    expect(placed[0].box.w).toBe(800) // was 384, half the rect
    expect(placed[0].box.y).toBe(0)
  })

  it("declines the restack when the wider column would cost even more content", () => {
    // An `image` is the counter-example: its measured height grows with its
    // width (`min(round(w * 0.5), 340)`), so the full-width column it would
    // be restacked into is the one it does not fit. A better-looking page
    // is not worth another dropped block, so the split placement stands.
    const image = { type: "image", asset_id: "a", fit: "contain" } as Component
    const components = [paragraphComponent(6), paragraphComponent(6), image]
    const splitRect: ContentRect = { x: 0, y: 0, w: 800, h: 300 }
    const { placed, dropped } = layoutContentFit("two_column", components, splitRect, ctx)
    expect(dropped).toBe(2)
    expect(placed[0].component.type).toBe("image")
    expect(placed[0].box.x).toBe(416)
    expect(placed[0].box.w).toBe(384)
  })
})

describe("degenerate column variants", () => {
  it("lays out a single-component two_column slide at full width", () => {
    const components = [
      { type: "comparison", columns: ["A", "B"], rows: [{ label: "r", cells: ["1", "2"] }] },
    ] as Component[]
    const placed = layoutContent("two_column", components, { x: 96, y: 176, w: 1088, h: 400 }, ctx)
    expect(placed).toHaveLength(1)
    expect(placed[0].box.w).toBe(1088)
    expect(placed[0].box.x).toBe(96)
  })

  it("lays out a single-component image_focus slide at full width", () => {
    const components = [
      { type: "comparison", columns: ["A", "B"], rows: [{ label: "r", cells: ["1", "2"] }] },
    ] as Component[]
    const placed = layoutContent("image_focus", components, { x: 96, y: 176, w: 1088, h: 400 }, ctx)
    expect(placed[0].box.w).toBe(1088)
  })

  it("keeps two-component two_column as real columns", () => {
    const components = [
      { type: "paragraph", text: "左" },
      { type: "paragraph", text: "右" },
    ] as Component[]
    const placed = layoutContent("two_column", components, { x: 0, y: 0, w: 1088, h: 400 }, ctx)
    expect(placed[0].box.w).toBeLessThan(600)
  })
})

// Wave-B S4: once `layoutContentFit` finds a working gap tier, leftover
// space below a short stack is spent growing the gaps between components
// instead of sitting dead at the bottom. `kpi_cards` measures a fixed 120px
// regardless of width/content (see `components/kpi.tsx`'s `CARD_H`), so it's used
// here in place of paragraph/bullets to make the expected numbers exact and
// hand-verifiable rather than dependent on text-measurement internals.
describe("layoutContentFit surplus distribution", () => {
  const KPI_H = 120

  function kpiComponent(label: string): Component {
    return { type: "kpi_cards", items: [{ value: "1", label }] }
  }

  it("two components + large remaining: the stretch pass takes its 60% share, the gap pass then grows the single gap to its 1.5x ceiling, and only what neither could spend sinks to the bottom", () => {
    const components = [kpiComponent("a"), kpiComponent("b")]
    const fitRect: ContentRect = { x: 0, y: 0, w: 400, h: 500 }
    const { placed, dropped } = layoutContentFit(undefined, components, fitRect, ctx)
    expect(dropped).toBe(0)
    // Baseline: bottom = 136 + 120 = 256, remaining = 244. The stretch pass
    // spends STRETCH_SHARE of that and no more (244 * 0.6 = 146.4), so each
    // kpi grows by 73.2 (box.h 120 -> 193.2). The 0.7x per-card cap (84) is
    // no longer what limits it — the share is. The second component shifts
    // down by the first's growth: 136 + 73.2 = 209.2.
    expect(placed[0].box.h).toBeCloseTo(193.2, 5)
    expect(placed[1].box.h).toBeCloseTo(193.2, 5)
    // The 97.6 the stretch pass deliberately left behind is over the 80px
    // surplus threshold, so the gap pass now has something to do instead of
    // being handed a remaining of zero. Its share (97.6 * 0.6 = 58.56) is
    // far more than the ceiling allows: a gap ends up at most 1.5x its
    // original size, so this one grows by 8 to 24 and the second component
    // sits 217.2 below the rect's top. Two components 24px apart still read
    // as one block, where the 40px the old 2.5x ceiling produced read as two.
    expect(placed[1].box.y - placed[0].box.y).toBeCloseTo(217.2, 5)
    expect(placed[1].box.y - (placed[0].box.y + 193.2)).toBeCloseTo(24, 5)
    // What neither pass could spend — 89.6 — is the space the assembled
    // block is then set down into: 38% of it above (34.048), 62% below.
    expect(placed[0].box.y).toBeCloseTo(34.048, 5)
    expect(placed[1].box.y).toBeCloseTo(251.248, 5)
    expect(fitRect.h - (placed[1].box.y + 193.2)).toBeCloseTo(89.6 * 0.62, 5)
  })

  it("remaining <= 80px: the spacing passes both no-op and the block is placed by the golden share alone", () => {
    const components = [kpiComponent("a"), kpiComponent("b")]
    // stackBottom = 256; h=336 leaves remaining exactly at the 80px
    // boundary — both spacing passes require remaining > 80 to trigger, so
    // the gap stays at BLOCK_GAP(16) and the cards stay unstretched.
    const fitRect: ContentRect = { x: 0, y: 0, w: 400, h: 336 }
    const { placed } = layoutContentFit(undefined, components, fitRect, ctx)
    expect(placed[1].box.y - placed[0].box.y).toBe(136)
    expect(placed[0].box.h).toBeUndefined()
    // Placement has no such threshold: 38% of the 80px goes above the pair.
    // A block does not belong at the rect's top edge merely because the page
    // is tight, and no threshold means no jump at the boundary.
    expect(placed[0].box.y).toBeCloseTo(30.4, 5)
  })

  it("single-component page: the stacking pass leaves a lone block where it is — its page places it (SvgContent)", () => {
    const components = [kpiComponent("a")]
    const fitRect: ContentRect = { x: 40, y: 90, w: 400, h: 900 }
    const { placed, dropped } = layoutContentFit(undefined, components, fitRect, ctx)
    expect(dropped).toBe(0)
    expect(placed).toHaveLength(1)
    // rect.y, unmoved. `settleToGolden` is deliberately not applied to a
    // one-block result here: the same call also fills a page's sub-regions
    // (an image takeover's caption column, `big_number`'s support stack),
    // and settling each of those by its own leftover would tilt regions
    // that are meant to share a top edge. A page whose whole content rect
    // holds one block is settled by `SvgContent` instead.
    expect(placed[0].box.y).toBe(90)
  })

  it("three components: the stretch share divides evenly across all three cards, and what it leaves is too little for the gap pass to spend", () => {
    const components = [kpiComponent("a"), kpiComponent("b"), kpiComponent("c")]
    const fitRect: ContentRect = { x: 0, y: 0, w: 400, h: 480 }
    const { placed } = layoutContentFit(undefined, components, fitRect, ctx)
    // remaining = 480 - 392 = 88. The stretch pass takes 60% of it (52.8)
    // and splits that evenly: +17.6 per card, under the 84px per-card cap.
    // Its 35.2 leftover is under the 80px surplus threshold, so the gap
    // pass no-ops here and every gap stays at the original 16. The block
    // then takes 38% of that same 35.2 (13.376) as its top margin.
    const grow = (88 * 0.6) / 3
    const settle = 88 * 0.4 * 0.38
    for (const p of placed) expect(p.box.h).toBeCloseTo(KPI_H + grow, 5)
    expect(placed[0].box.y).toBeCloseTo(settle, 5)
    expect(placed[1].box.y).toBeCloseTo(136 + grow + settle, 5)
    expect(placed[2].box.y).toBeCloseTo(272 + 2 * grow + settle, 5)
    expect(placed[1].box.y - (placed[0].box.y + placed[0].box.h!)).toBeCloseTo(16, 5)
  })

  it("four components with a moderate remaining: the stretch share divides evenly and stays well under the per-card cap", () => {
    const components = [kpiComponent("a"), kpiComponent("b"), kpiComponent("c"), kpiComponent("d")]
    // Baseline stackBottom (gap=16 throughout): 3 * (120 + 16) + 120 = 528.
    const fitRect: ContentRect = { x: 0, y: 0, w: 400, h: 610 }
    const { placed } = layoutContentFit(undefined, components, fitRect, ctx)
    // remaining = 610 - 528 = 82. The stretch pass takes 60% (49.2) and
    // splits it evenly: +12.3 per card, under the 84px cap. Its 32.8
    // leftover is under the 80px surplus threshold, so the gap pass no-ops
    // and 38% of it (12.464) becomes the whole block's top margin.
    const remaining = fitRect.h - 528
    const grow = (remaining * 0.6) / 4
    const settle = remaining * 0.4 * 0.38
    expect(grow).toBeLessThan(KPI_H * 0.7) // sanity: genuinely un-capped here
    placed.forEach((p, i) => {
      expect(p.box.h).toBeCloseTo(KPI_H + grow, 5)
      expect(p.box.y).toBeCloseTo(settle + i * (KPI_H + 16) + i * grow, 5)
    })
  })

  it("a footnote-shrunk rect (simulated by a smaller rect.h) is still respected — no overflow either way, and growth backs off once remaining drops under 80px", () => {
    const components = [kpiComponent("a"), kpiComponent("b")]
    const noFootnote: ContentRect = { x: 0, y: 0, w: 400, h: 500 }
    // A footnote carving ~170px off the bottom drops remaining to 74px —
    // under the threshold, so neither spacing pass runs and the pair keeps
    // its designed 16px gap; only the golden placement moves it (74 * 0.38).
    const withFootnote: ContentRect = { x: 0, y: 0, w: 400, h: 330 }
    const full = layoutContentFit(undefined, components, noFootnote, ctx)
    const shrunk = layoutContentFit(undefined, components, withFootnote, ctx)
    expect(full.placed[1].box.y).toBeCloseTo(251.248, 5) // grown (see first test in this component)
    expect(shrunk.placed[1].box.y - shrunk.placed[0].box.y).toBe(136) // gap untouched
    expect(shrunk.placed[0].box.y).toBeCloseTo(74 * 0.38, 5)
    // The point of the test: the block cannot be settled past the bottom it
    // was measured against, footnote or no footnote.
    expect(shrunk.placed[1].box.y + KPI_H).toBeLessThanOrEqual(withFootnote.h)
  })

  it("two_column with one component per side: neither column has an internal gap, so the pair only moves as one", () => {
    const components = [kpiComponent("left"), kpiComponent("right")]
    const fitRect: ContentRect = { x: 0, y: 0, w: 1000, h: 600 }
    const { placed } = layoutContentFit("two_column", components, fitRect, ctx)
    // Each card takes its capped stretch (120 -> 204); with no gap to grow,
    // the 396 still left is spent by the placement alone — 38% of it above
    // both cards. Level with each other before and after, which is the
    // property that matters: the settle is one shift for the whole page,
    // not a number each column works out for itself.
    expect(placed[0].box.y).toBe(placed[1].box.y)
    expect(placed[0].box.y).toBeCloseTo(150.48, 5)
  })

  it("two_column with two components per side: each column's own gap grows by the same global increment", () => {
    const components = [kpiComponent("l1"), kpiComponent("l2"), kpiComponent("r1"), kpiComponent("r2")]
    const fitRect: ContentRect = { x: 0, y: 0, w: 1000, h: 500 }
    const { placed } = layoutContentFit("two_column", components, fitRect, ctx)
    const left = placed.filter((p) => p.box.x === placed[0].box.x)
    const right = placed.filter((p) => p.box.x !== placed[0].box.x)
    // Each column's own remaining (244) hands its two kpis the 60% share
    // (+73.2 each, box.h 193.2). The gap pass then works off the global
    // post-stretch remaining (97.6) over both columns' gaps (2): its share
    // per gap, 29.28, is over the 1.5x ceiling, so both gaps grow by the
    // same 8, and the 89.6 nobody spent puts 34.048 above the whole thing:
    // both second components land at 251.248 — the point of the test is
    // that the two columns stay level, which they do at either number.
    expect(left[1].box.y).toBe(right[1].box.y)
    expect(left[0].box.y).toBe(right[0].box.y)
    expect(left[1].box.y).toBeCloseTo(251.248, 5)
    for (const p of [...left, ...right]) expect(p.box.h).toBeCloseTo(193.2, 5)
  })

  it("two_column with a spanning verdict keeps the following columns aligned during fit post-processing", () => {
    const components = [
      verdict,
      kpiComponent("l1"),
      kpiComponent("l2"),
      kpiComponent("r1"),
      kpiComponent("r2"),
    ]
    const fitRect: ContentRect = { x: 0, y: 0, w: 1000, h: 700 }
    const { placed } = layoutContentFit("two_column", components, fitRect, ctx)
    const ordinary = placed.slice(1)
    const left = ordinary.filter((p) => p.box.x === ordinary[0].box.x)
    const right = ordinary.filter((p) => p.box.x !== ordinary[0].box.x)

    expect(left.map((p) => p.box.y)).toEqual(right.map((p) => p.box.y))
    expect(left.every((p) => p.box.h == null)).toBe(true)
    expect(right.every((p) => p.box.h == null)).toBe(true)
  })

  it("single layout keeps its existing stretch and surplus behavior when it contains a verdict", () => {
    const fitRect: ContentRect = { x: 0, y: 0, w: 1000, h: 500 }
    const { placed } = layoutContentFit(undefined, [verdict, kpiComponent("body")], fitRect, ctx)

    // The verdict measures 70, so the kpi's untouched coordinate is 86. The
    // stretch pass grows the kpi to its 1.7x per-card ceiling (204) without
    // moving it, then the gap pass adds the 8px the 1.5x gap ceiling allows,
    // putting the kpi 94 below the verdict. The 202 left under the pair is
    // then split 38/62 around it.
    expect(placed[1].box.h).toBe(204)
    expect(placed[1].box.y - placed[0].box.y).toBeCloseTo(94, 5)
    expect(placed[0].box.y).toBeCloseTo(202 * 0.38, 5)
  })

  it("kpi_focus: the hoisted kpi row and the rest-stack below it count as one column (the boundary gap grows too)", () => {
    const components = [kpiComponent("hero"), { type: "image", asset_id: "a", fit: "contain" } as Component]
    // w=200 keeps the image's measured height an exact, deterministic 100px
    // (`min(round(w * 0.5), 340)`, see components/image.tsx).
    const fitRect: ContentRect = { x: 0, y: 0, w: 200, h: 400 }
    const { placed } = layoutContentFit("kpi_focus", components, fitRect, ctx)
    // remaining = 400 - 236 = 164; only the kpi is stretchable — it takes
    // the capped +84 (h 120 -> 204), putting the image 220 below it. The
    // post-stretch leftover (400 - 320 = 80) is at the surplus threshold,
    // so gap-growing no-ops and the placement spends it: 30.4 above.
    expect(placed[0].box.h).toBe(204)
    expect(placed[0].box.y).toBeCloseTo(30.4, 5)
    expect(placed[1].box.y - placed[0].box.y).toBe(220)
  })

  it("quote variant is excluded: its already-centered offset is untouched regardless of remaining", () => {
    const components = [kpiComponent("a"), kpiComponent("b")]
    const fitRect: ContentRect = { x: 0, y: 0, w: 400, h: 500 }
    const { placed } = layoutContentFit("quote", components, fitRect, ctx)
    // quote centers the *whole* stack (offset 122, not flush with rect.y=0)
    // — distributeSurplus only grows gaps in columns flush with the rect's
    // top edge, so this column is left alone even though remaining (122) is
    // well over the 80px threshold.
    expect(placed[0].box.y).toBe(122)
    const gap = placed[1].box.y - (placed[0].box.y + KPI_H)
    expect(gap).toBe(16)
  })
})
