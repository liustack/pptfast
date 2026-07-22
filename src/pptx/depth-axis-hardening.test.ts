// @vitest-environment node
//
// P0 hardening, Task 1 (depth-axis hardening) — red-first permanent tests
// pinning the robustness deep-review's D1 finding: an unbounded text-
// stacking component (bullets/comparison and the family-sweep siblings
// citation/architecture/timeline-vertical) has no schema ceiling on its
// array field, and pre-fix its renderer stacked one item's worth of `y`
// per item with no cap against the component's own box — an extreme item
// count pushed `y` far enough off the 1280×720 canvas to cross pptxgenjs's
// undocumented `getSmartParseNumber()` ≥100in heuristic (same trap
// `chart-svg.tsx`'s `MAX_CHART_GEOMETRY_PX` already fences off on the
// chart side), producing a non-integer EMU that `package-audit`'s
// `invalid-shape-transform` rule rejected — loud, but via a message that
// scaled with the violation count (500 items → 621 violations, 20000
// items → 19776 violations / a 2.5MB error string).
//
// Two permanent scenarios, lifted directly from the investigation's own
// repro chain (scratchpad `dr/gen-deck.mts` buildPathologicalDeck / D1's
// pathological-content stress table):
//   - 500-item bullets + 300-row comparison: now a graceful landing — the
//     render-side box.h cap (bullets.tsx/comparison.tsx, same task) lands
//     the file with zero package-audit violations and honest
//     data-dropped markers, instead of a hard-blocked export.
//   - a bullets item count far past the pacing budget (this task's new
//     bullets_count_overflow error, ir-quality.ts): blocked at validate,
//     before ever reaching the renderer, with a bounded error message —
//     "graceful truncation" stops being an honest description of
//     rendering 0.1% of the content, so validate refuses instead.
//
// Review round 2 addition: the same defect class reaches a *horizontal*
// axis too — kpi_cards.items has no schema ceiling either, and
// `cardW = (box.w - GAP*(n-1)) / n` had no floor. At a realistic item
// count (50, with at least one `delta` set) `cardW` goes negative; the
// card's own background <rect> survives (rect.ts's floorAxis already
// floors a negative-extent rect), but the delta arrow's
// `<text textAnchor="end" x={cardX+cardW-20}>` does not — a genuinely
// negative-width text shape that package-audit's invalid-shape-transform
// rule rejects (`a:ext cx=-132588 ... needs cx and cy > 0`). Horizontal
// sweep of every other cardW/colW-style horizontal-stacking component
// (steps/icon_cards/roadmap/matrix/bmc/waterfall) found none reachable —
// all have a schema `.max()` bound (3-8) unlike kpi_cards, so a legal IR
// can never drive their divisor past a safe count. Fixed with the same
// idiom as the vertical family sweep: cap visible cards to what fits
// box.w at a sane minimum width, "+N more"/data-dropped marker.
//
// Runs the REAL generatePptx/generatePptxBlob/validateIr (src/api.ts) —
// never a mock — the same production entry points the investigation's own
// probe scripts called.
import { beforeAll, describe, expect, it } from "vitest"
import type { PptxIR } from "@/ir"
import { generatePptx, renderSlideSvg, validateIr } from "@/api"
import { installNodePlatform } from "../platform/node"
import { CAPACITY } from "../svg/audit/capacity"

beforeAll(() => {
  installNodePlatform()
})

// Test fixture helper: `slides` entries deliberately omit `components` on
// cover/ending slides (schema-legal — content-only slides carry no
// `components` field), same permissive-fixture convention
// `generate-chart-export.test.ts`'s own `makeIr` uses (a whole-object
// `as PptxIR` cast).
function baseIr(overrides: Record<string, any> = {}): PptxIR {
  return {
    version: "4",
    filename: "depth-axis-hardening-fixture",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides: [{ type: "cover", heading: "Cover" }, { type: "ending", heading: "Thanks" }],
    ...overrides,
  } as PptxIR
}

describe("500-item bullets + 300-row comparison: graceful landing (D1 pathological-deck repro)", () => {
  // Exact shape of the investigation's own `buildPathologicalDeck` bullets/
  // comparison slides (scratchpad `dr/gen-deck.mts`) — the fixture that
  // measured 621 package-audit violations pre-fix.
  const bigBullets = Array.from({ length: 500 }, (_, i) => `item ${i}: ${"x".repeat(50)}`)
  const bigComparisonRows = Array.from({ length: 300 }, (_, i) => ({
    label: `row ${i}`,
    cells: [`cell ${i}a`, `cell ${i}b`],
  }))
  const ir = baseIr({
    slides: [
      { type: "cover", heading: "Cover" },
      {
        type: "content",
        heading: "500-item bullets stress",
        components: [{ type: "bullets", items: bigBullets }],
      },
      {
        type: "content",
        heading: "300-row comparison stress",
        components: [{ type: "comparison", columns: ["A", "B"], rows: bigComparisonRows }],
      },
      { type: "ending", heading: "Thanks" },
    ],
  })

  it("generatePptx succeeds — no package-audit rejection (pre-fix: 621 invariant violations)", async () => {
    const bytes = await generatePptx(ir)
    // A real zip (magic "PK"), not a thrown PptfastError.
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
  })

  it("the rendered bullets slide caps to what its box can hold and marks the drop honestly", () => {
    const svg = renderSlideSvg(ir, 1) // slide index 1 = "500-item bullets stress"
    const dropped = svg.match(/data-dropped="(\d+)"/)
    expect(dropped).not.toBeNull()
    expect(Number(dropped![1])).toBeGreaterThan(0)
    expect(Number(dropped![1])).toBeLessThan(bigBullets.length)
    // Far fewer than 500 <text> lines actually got drawn.
    expect((svg.match(/<text/g) ?? []).length).toBeLessThan(bigBullets.length)
  })

  it("the rendered comparison slide caps to what its box can hold and marks the drop honestly", () => {
    const svg = renderSlideSvg(ir, 2) // slide index 2 = "300-row comparison stress"
    const dropped = svg.match(/data-dropped="(\d+)"/)
    expect(dropped).not.toBeNull()
    expect(Number(dropped![1])).toBeGreaterThan(0)
    expect(Number(dropped![1])).toBeLessThan(bigComparisonRows.length)
  })
})

describe("extreme bullets item count: bullets_count_overflow blocks at validate (D1's 20000-item repro)", () => {
  const threshold = CAPACITY.bullets.countOverflowItems
  // Matches the investigation's own 20000-item single-component repro
  // (scratchpad `dr/big-bullets.mts`) — comfortably past the escalation
  // threshold, pointing at the same "render would silently drop nearly
  // everything" outcome this gate exists to refuse instead of paper over.
  const extremeCount = Math.max(20_000, threshold + 1)

  function extremeIr(n: number): PptxIR {
    return baseIr({
      slides: [
        { type: "cover", heading: "Cover" },
        {
          type: "content",
          heading: "extreme bullets",
          components: [{ type: "bullets", items: Array.from({ length: n }, (_, i) => `item ${i}`) }],
        },
        { type: "ending", heading: "Thanks" },
      ],
    })
  }

  it(`validateIr rejects ${extremeCount} items with bullets_count_overflow (ok:false)`, () => {
    const v = validateIr(extremeIr(extremeCount))
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.message.includes("far too many items"))).toBe(true)
  })

  it("generatePptx rejects the same deck before ever reaching the renderer/package-audit", async () => {
    await expect(generatePptx(extremeIr(extremeCount))).rejects.toThrow(/invalid IR/)
  })

  it("the rejection message stays bounded regardless of item count (the '2.5MB error string' class of bug, closed at its source: validate blocks before package-audit ever sees this content)", async () => {
    let caught: Error | undefined
    try {
      await generatePptx(extremeIr(extremeCount))
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeTruthy()
    // Generous upper bound: a validate-time rejection names the rule and a
    // handful of numbers, never one line per item — many orders of
    // magnitude below the 2.5MB baseline this exact item count produced
    // pre-fix (when it instead reached package-audit's formatViolations).
    expect(caught!.message.length).toBeLessThan(2_000)
  })

  it(`does NOT report bullets_count_overflow at exactly the threshold (${threshold} items) — still ok:true`, () => {
    const v = validateIr(extremeIr(threshold))
    expect(v.ok).toBe(true)
  })
})

describe("byte-inertness for normal decks (hard requirement)", () => {
  // Method: box.h is only ever attached to a bullets/comparison/citation/
  // architecture/timeline component by `layoutContentFit`'s overflow-
  // defense branch (`layout.ts`) — the sole-surviving-component-still-
  // doesn't-fit last resort. An ordinary deck's components never reach
  // that branch (they fit their column normally), so `box.h` stays
  // `undefined` for every one of these components on every ordinary
  // render, and each touched component's own `truncBudget = box.h ??
  // Number.POSITIVE_INFINITY` guard makes the new cap logic a total
  // no-op on that path — pinned per-component in
  // bullets/comparison/citation/architecture/timeline's own test suites
  // ("byte-identical no-op when box.h is omitted"). This test re-pins the
  // same guarantee at the full generatePptx level: a realistic, non-
  // abusive deck's output is unaffected by this task's changes.
  it("a realistic mixed-content deck (small bullets + small comparison, well within pacing budgets) renders without any data-dropped marker", async () => {
    const ir = baseIr({
      slides: [
        { type: "cover", heading: "Cover" },
        {
          type: "content",
          heading: "Ordinary content",
          components: [
            { type: "bullets", items: ["first point", "second point", "third point"] },
            {
              type: "comparison",
              columns: ["A", "B"],
              rows: [
                { label: "price", cells: ["$10", "$20"] },
                { label: "speed", cells: ["fast", "slow"] },
              ],
            },
          ],
          arrangement: "two_column",
        },
        { type: "ending", heading: "Thanks" },
      ],
    })
    const bytes = await generatePptx(ir)
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    const svg = renderSlideSvg(ir, 1)
    expect(svg).not.toContain("data-dropped")
  })
})

describe("kpi_cards horizontal-axis sibling: 50-item deck with delta (review round 2 repro)", () => {
  // Reviewer's exact repro: a realistic (not pathological-scale) item
  // count, with at least one `delta` set — that's what puts the delta
  // arrow's negative-width text shape on the page. No arrangement tricks
  // needed; a plain single-column full-width slide already reaches it.
  const fiftyKpis = Array.from({ length: 50 }, (_, i) => ({
    value: String(i),
    label: `metric ${i}`,
    delta: "up" as const,
  }))
  const ir = baseIr({
    slides: [
      { type: "cover", heading: "Cover" },
      { type: "content", heading: "50 KPI cards", components: [{ type: "kpi_cards", items: fiftyKpis }] },
      { type: "ending", heading: "Thanks" },
    ],
  })

  it("validateIr passes with zero warnings (kpi_cards has no ir-quality count gate — matches the reviewer's own finding)", () => {
    const v = validateIr(ir)
    expect(v.ok).toBe(true)
    expect(v.warnings ?? []).toHaveLength(0)
  })

  it("generatePptx succeeds — no package-audit rejection (pre-fix: invalid-shape-transform, negative-width delta-arrow text shape)", async () => {
    const bytes = await generatePptx(ir)
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
  })

  it("the rendered slide caps cards to what box.w can hold and marks the drop honestly", () => {
    const svg = renderSlideSvg(ir, 1)
    const dropped = svg.match(/data-dropped="(\d+)"/)
    expect(dropped).not.toBeNull()
    expect(Number(dropped![1])).toBeGreaterThan(0)
    expect(Number(dropped![1])).toBeLessThan(fiftyKpis.length)
    // Far fewer than 50 card <rect>s actually got drawn.
    expect((svg.match(/<rect/g) ?? []).length).toBeLessThan(fiftyKpis.length)
  })

  it("byte-inertness: a small (3-item) kpi_cards deck with delta is unaffected", async () => {
    const smallIr = baseIr({
      slides: [
        { type: "cover", heading: "Cover" },
        {
          type: "content",
          heading: "3 KPI cards",
          components: [{ type: "kpi_cards", items: fiftyKpis.slice(0, 3) }],
        },
        { type: "ending", heading: "Thanks" },
      ],
    })
    const bytes = await generatePptx(smallIr)
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    const svg = renderSlideSvg(smallIr, 1)
    expect(svg).not.toContain("data-dropped")
  })
})
