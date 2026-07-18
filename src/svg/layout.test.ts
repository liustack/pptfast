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
    // render a slide with nothing but the "+N 项未展示" marker, which is
    // worse than showing the (overflowing) component itself.
    const mega = paragraphComponent(40)
    const tinyRect: ContentRect = { x: 0, y: 0, w: 400, h: 100 }
    const { placed, dropped } = layoutContentFit(undefined, [mega], tinyRect, ctx)
    expect(placed).toHaveLength(1)
    expect(dropped).toBe(0)
  })

  it("keeps at least one component even when the first of several overflows on its own", () => {
    const mega = paragraphComponent(40)
    const many = [mega, bulletsComponent(["甲"]), bulletsComponent(["乙"])]
    const tinyRect: ContentRect = { x: 0, y: 0, w: 400, h: 100 }
    const { placed } = layoutContentFit(undefined, many, tinyRect, ctx)
    expect(placed.length).toBeGreaterThanOrEqual(1)
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

  it("two components + large remaining: grows the single gap, caps the increment at 1.5x the original gap, sinks the rest to the bottom", () => {
    const components = [kpiComponent("a"), kpiComponent("b")]
    const fitRect: ContentRect = { x: 0, y: 0, w: 400, h: 500 }
    const { placed, dropped } = layoutContentFit(undefined, components, fitRect, ctx)
    expect(dropped).toBe(0)
    expect(placed[0].box.y).toBe(0) // first component in a column never shifts
    // Baseline: bottom = 136 + 120 = 256, remaining = 244. Stretch runs
    // first: per-component share 122 blows past the 0.7x cap (120 * 0.7 = 84),
    // so each kpi grows by exactly +84 (box.h 120 -> 204) and the second
    // component shifts down by the first's growth. Visual gap stays 16.
    expect(placed[0].box.h).toBe(204)
    expect(placed[1].box.h).toBe(204)
    expect(placed[1].box.y).toBe(220)
    // Leftover after stretch (500 - 424 = 76) is under the 80px surplus
    // threshold, so gap-growing is a no-op and 76px sinks to the bottom.
    expect(fitRect.h - (placed[1].box.y + 204)).toBe(76)
  })

  it("remaining <= 80px: byte-identical to the pre-surplus stack (regression lock)", () => {
    const components = [kpiComponent("a"), kpiComponent("b")]
    // stackBottom = 256; h=336 leaves remaining exactly at the 80px
    // boundary — the spec requires remaining > 80 to trigger, so this must
    // land exactly on the untouched (old) formula: 120 + BLOCK_GAP(16).
    const fitRect: ContentRect = { x: 0, y: 0, w: 400, h: 336 }
    const { placed } = layoutContentFit(undefined, components, fitRect, ctx)
    expect(placed[1].box.y).toBe(136)
  })

  it("single-component page: byte-identical (no gap exists to grow, however large the remaining space)", () => {
    const components = [kpiComponent("a")]
    const fitRect: ContentRect = { x: 40, y: 90, w: 400, h: 900 }
    const { placed, dropped } = layoutContentFit(undefined, components, fitRect, ctx)
    expect(dropped).toBe(0)
    expect(placed).toHaveLength(1)
    expect(placed[0].box.y).toBe(90) // rect.y, unmoved
  })

  it("three components: both internal gaps grow by the identical amount (uniform distribution)", () => {
    const components = [kpiComponent("a"), kpiComponent("b"), kpiComponent("c")]
    const fitRect: ContentRect = { x: 0, y: 0, w: 400, h: 480 }
    const { placed } = layoutContentFit(undefined, components, fitRect, ctx)
    // remaining = 480 - 392 = 88, stretch splits it evenly: +88/3 per card
    // (under the 84px cap), consuming the entire leftover — surplus no-ops.
    const grow = 88 / 3
    for (const p of placed) expect(p.box.h).toBeCloseTo(KPI_H + grow, 5)
    expect(placed[1].box.y).toBeCloseTo(136 + grow, 5)
    expect(placed[2].box.y).toBeCloseTo(272 + 2 * grow, 5)
  })

  it("four components with a moderate remaining: gaps grow by the even, un-capped share", () => {
    const components = [kpiComponent("a"), kpiComponent("b"), kpiComponent("c"), kpiComponent("d")]
    // Baseline stackBottom (gap=16 throughout): 3 * (120 + 16) + 120 = 528.
    const fitRect: ContentRect = { x: 0, y: 0, w: 400, h: 610 }
    const { placed } = layoutContentFit(undefined, components, fitRect, ctx)
    // remaining = 610 - 528 = 82, stretch splits it evenly: +82/4 per card
    // (under the 84px cap), consuming the entire leftover — surplus no-ops.
    const remaining = fitRect.h - 528
    const grow = remaining / 4
    expect(grow).toBeLessThan(KPI_H * 0.7) // sanity: genuinely un-capped here
    placed.forEach((p, i) => {
      expect(p.box.h).toBeCloseTo(KPI_H + grow, 5)
      expect(p.box.y).toBeCloseTo(i * (KPI_H + 16) + i * grow, 5)
    })
  })

  it("a footnote-shrunk rect (simulated by a smaller rect.h) is still respected — no overflow either way, and growth backs off once remaining drops under 80px", () => {
    const components = [kpiComponent("a"), kpiComponent("b")]
    const noFootnote: ContentRect = { x: 0, y: 0, w: 400, h: 500 }
    // A footnote carving ~170px off the bottom drops remaining to 74px —
    // under the threshold, so this stays on the untouched path.
    const withFootnote: ContentRect = { x: 0, y: 0, w: 400, h: 330 }
    const full = layoutContentFit(undefined, components, noFootnote, ctx)
    const shrunk = layoutContentFit(undefined, components, withFootnote, ctx)
    expect(full.placed[1].box.y).toBe(220) // grown (see first test in this component)
    expect(shrunk.placed[1].box.y).toBe(136) // untouched
    expect(shrunk.placed[1].box.y + KPI_H).toBeLessThanOrEqual(withFootnote.h)
  })

  it("two_column with one component per side: neither column has an internal gap, so nothing shifts despite a huge remaining", () => {
    const components = [kpiComponent("left"), kpiComponent("right")]
    const fitRect: ContentRect = { x: 0, y: 0, w: 1000, h: 600 }
    const { placed } = layoutContentFit("two_column", components, fitRect, ctx)
    expect(placed[0].box.y).toBe(0)
    expect(placed[1].box.y).toBe(0)
  })

  it("two_column with two components per side: each column's own gap grows by the same global increment", () => {
    const components = [kpiComponent("l1"), kpiComponent("l2"), kpiComponent("r1"), kpiComponent("r2")]
    const fitRect: ContentRect = { x: 0, y: 0, w: 1000, h: 500 }
    const { placed } = layoutContentFit("two_column", components, fitRect, ctx)
    const left = placed.filter((p) => p.box.x === placed[0].box.x)
    const right = placed.filter((p) => p.box.x !== placed[0].box.x)
    // Each column's remaining (244) stretches both its kpis by the capped
    // +84; the visual gap stays 16 while the second component lands at 220.
    expect(left[1].box.y).toBe(right[1].box.y)
    expect(left[1].box.y).toBe(220)
    for (const p of [...left, ...right]) expect(p.box.h).toBe(204)
  })

  it("kpi_focus: the hoisted kpi row and the rest-stack below it count as one column (the boundary gap grows too)", () => {
    const components = [kpiComponent("hero"), { type: "image", asset_id: "a", fit: "contain" } as Component]
    // w=200 keeps the image's measured height an exact, deterministic 100px
    // (`min(round(w * 0.5), 340)`, see components/image.tsx).
    const fitRect: ContentRect = { x: 0, y: 0, w: 200, h: 400 }
    const { placed } = layoutContentFit("kpi_focus", components, fitRect, ctx)
    expect(placed[0].box.y).toBe(0)
    // remaining = 400 - 236 = 164; only the kpi is stretchable — it takes
    // the capped +84 (h 120 -> 204), shifting the image down to 220. The
    // post-stretch leftover (400 - 320 = 80) is at the surplus threshold,
    // so gap-growing no-ops.
    expect(placed[0].box.h).toBe(204)
    expect(placed[1].box.y).toBe(220)
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
