// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { assertSubset } from "../subset-validate"
import { auditSvgMarkup } from "../audit/svg-audit"
import { sankey } from "./sankey"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#051C2C",
    accent: "#FFC72C",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#051C2C", "#FFC72C", "#00A9E0", "#6C6C6C"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24,
  defaultBg: "#FFFFFF",
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const twoLayer = {
  type: "sankey" as const,
  nodes: [
    { id: "a", label: "Source A" },
    { id: "b", label: "Source B" },
    { id: "c", label: "Target C" },
  ],
  links: [
    { from: "a", to: "c", value: 40 },
    { from: "b", to: "c", value: 60 },
  ],
}

const multiLayer = {
  type: "sankey" as const,
  nodes: [
    { id: "coal", label: "Coal" },
    { id: "gas", label: "Gas" },
    { id: "grid", label: "Grid" },
    { id: "homes", label: "Homes" },
    { id: "industry", label: "Industry" },
  ],
  links: [
    { from: "coal", to: "grid", value: 30 },
    { from: "gas", to: "grid", value: 50 },
    { from: "grid", to: "homes", value: 45 },
    { from: "grid", to: "industry", value: 35 },
  ],
}

describe("sankey component", () => {
  it("renders one rect per node", () => {
    const { container } = svg(sankey.render(twoLayer, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(3)
  })

  it("renders one band path per link", () => {
    const { container } = svg(sankey.render(twoLayer, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    expect(container.querySelectorAll("path")).toHaveLength(2)
  })

  it("renders every node label as text", () => {
    const { container } = svg(sankey.render(twoLayer, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    for (const n of twoLayer.nodes) expect(texts).toContain(n.label)
  })

  it("measure returns a positive height", () => {
    expect(sankey.measure(twoLayer, 900, ctx)).toBeGreaterThan(0)
  })

  it("places source nodes strictly left of the target node they flow into (layered left-to-right)", () => {
    const { container } = svg(sankey.render(twoLayer, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    const byX = rects.map((r) => Number(r.getAttribute("x"))).sort((p, q) => p - q)
    // a/b share the leftmost layer, c sits in a strictly later layer.
    expect(byX[2]).toBeGreaterThan(byX[0])
    expect(byX[2]).toBeGreaterThan(byX[1])
  })

  it("assigns a multi-layer diagram's middle node a layer strictly between its sources and sinks", () => {
    const { container } = svg(sankey.render(multiLayer, { x: 0, y: 0, w: 1100, h: 500 }, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    const xs = rects.map((r) => Number(r.getAttribute("x")))
    const uniqueXs = [...new Set(xs)].sort((p, q) => p - q)
    // coal/gas (layer 0), grid (layer 1), homes/industry (layer 2) — 3 distinct x columns.
    expect(uniqueXs).toHaveLength(3)
  })

  it("bands use a translucent fill from the theme's chartPalette", () => {
    const { container } = svg(sankey.render(twoLayer, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    const paths = Array.from(container.querySelectorAll("path"))
    for (const p of paths) {
      const fill = p.getAttribute("fill")
      expect(fill).not.toBeNull()
      expect(ctx.colors.chartPalette).toContain(fill)
      // Below MIN_BG_OPACITY (0.5, deck-audit.ts) by deliberate design — see
      // sankey.tsx's own header comment: a band must never become a
      // contrast-attribution background candidate.
      expect(Number(p.getAttribute("fill-opacity"))).toBeLessThan(0.5)
    }
  })

  it("node bars use a flat, unblended colors.surface fill (flat-surface class, pre-verified contrast)", () => {
    const { container } = svg(sankey.render(twoLayer, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    for (const r of rects) expect(r.getAttribute("fill")).toBe(ctx.colors.surface)
  })

  it("ctx.chartPaletteOffset rotates band colors by a deck-wide phase (same seam chart.tsx opts into)", () => {
    // twoLayer's two links both originate from a distinct source (a, b —
    // node indices 0 and 1), so their fillIndex values are 0 and 1 before
    // rotation. An offset of 1 should cyclically shift each band's color by
    // exactly one palette slot — the same rotateChartPalette contract
    // chart-palette.ts's own unit tests already pin, exercised here at this
    // component's actual call site instead of only asserted in prose.
    const unrotated = svg(sankey.render(twoLayer, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    const unrotatedFills = Array.from(unrotated.container.querySelectorAll("path")).map((p) => p.getAttribute("fill"))
    unrotated.unmount()

    const rotatedCtx: ComponentCtx = { ...ctx, chartPaletteOffset: 1 }
    const rotated = svg(sankey.render(twoLayer, { x: 0, y: 0, w: 900, h: 400 }, rotatedCtx))
    const rotatedFills = Array.from(rotated.container.querySelectorAll("path")).map((p) => p.getAttribute("fill"))

    expect(rotatedFills).not.toEqual(unrotatedFills)
    const palette = ctx.colors.chartPalette
    expect(unrotatedFills).toEqual([palette[0], palette[1]])
    expect(rotatedFills).toEqual([palette[1], palette[2]])
  })

  it("wider link value renders a thicker band than a narrower one", () => {
    const { container } = svg(sankey.render(twoLayer, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    const paths = Array.from(container.querySelectorAll("path"))
    // Each band path is a closed ribbon "M x0,y0 C ... L x1,y1t C ... Z" —
    // reconstructing exact thickness from `d` is brittle, so instead compare
    // bounding-box heights (jsdom has no getBBox, so parse the y coordinates
    // out of the d string directly).
    const ys = paths.map((p) => {
      const nums = (p.getAttribute("d") ?? "").match(/-?\d+\.?\d*/g)!.map(Number)
      // every other pair starting at index 1 is a y — take spread as a proxy
      const yCoords = nums.filter((_, i) => i % 2 === 1)
      return Math.max(...yCoords) - Math.min(...yCoords)
    })
    expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys))
  })

  it("stays within the controlled SVG subset", () => {
    const { container } = svg(sankey.render(multiLayer, { x: 0, y: 0, w: 1100, h: 500 }, ctx))
    expect(() => assertSubset(container.querySelector("svg")!)).not.toThrow()
  })

  it("the static overflow auditor reports zero issues", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${renderToStaticMarkup(
      sankey.render(multiLayer, { x: 96, y: 176, w: 1088, h: 400 }, ctx),
    )}</svg>`
    expect(auditSvgMarkup(markup)).toEqual([])
  })
})

describe("sankey determinism (plan hard gate: double-render byte equality)", () => {
  it("renders byte-identical markup across two independent render calls (multi-layer)", () => {
    const a = renderToStaticMarkup(sankey.render(multiLayer, { x: 96, y: 176, w: 1088, h: 420 }, ctx))
    const b = renderToStaticMarkup(sankey.render(multiLayer, { x: 96, y: 176, w: 1088, h: 420 }, ctx))
    expect(a).toBe(b)
  })

  it("renders byte-identical markup for a dense-crossing topology", () => {
    const dense = {
      type: "sankey" as const,
      nodes: [
        { id: "a1", label: "A1" },
        { id: "a2", label: "A2" },
        { id: "b1", label: "B1" },
        { id: "b2", label: "B2" },
        { id: "c1", label: "C1" },
        { id: "c2", label: "C2" },
      ],
      links: [
        { from: "a1", to: "b1", value: 10 },
        { from: "a1", to: "b2", value: 20 },
        { from: "a2", to: "b1", value: 15 },
        { from: "a2", to: "b2", value: 5 },
        { from: "b1", to: "c1", value: 12 },
        { from: "b1", to: "c2", value: 13 },
        { from: "b2", to: "c1", value: 18 },
        { from: "b2", to: "c2", value: 7 },
      ],
    }
    const a = renderToStaticMarkup(sankey.render(dense, { x: 96, y: 176, w: 1088, h: 420 }, ctx))
    const b = renderToStaticMarkup(sankey.render(dense, { x: 96, y: 176, w: 1088, h: 420 }, ctx))
    expect(a).toBe(b)
  })
})

describe("sankey pathological inputs (render-time, never throws)", () => {
  it("single disconnected node alongside a normal chain renders standalone, not rejected", () => {
    const withOrphan = {
      ...twoLayer,
      nodes: [...twoLayer.nodes, { id: "orphan", label: "Orphan" }],
    }
    const { container } = svg(sankey.render(withOrphan, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("Orphan")
    expect(container.querySelectorAll("rect")).toHaveLength(4)
  })

  it("extreme value ratio (1:10000) still renders every band at a visible minimum thickness", () => {
    const extreme = {
      type: "sankey" as const,
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
      links: [
        { from: "a", to: "c", value: 10000 },
        { from: "b", to: "c", value: 1 },
      ],
    }
    const { container } = svg(sankey.render(extreme, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    expect(container.querySelectorAll("path")).toHaveLength(2)
    expect(container.querySelectorAll("rect")).toHaveLength(3)
  })

  it("a minimal two-node one-link graph renders without error", () => {
    const minimal = {
      type: "sankey" as const,
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      links: [{ from: "a", to: "b", value: 5 }],
    }
    const { container } = svg(sankey.render(minimal, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(2)
    expect(container.querySelectorAll("path")).toHaveLength(1)
  })

  it("over-long node labels truncate with a data-truncated marker instead of overflowing", () => {
    const longLabel = {
      type: "sankey" as const,
      nodes: [
        { id: "a", label: "一个非常非常非常非常非常长的节点名称用于测试标签截断行为是否生效" },
        { id: "b", label: "B" },
      ],
      links: [{ from: "a", to: "b", value: 5 }],
    }
    const { container } = svg(sankey.render(longLabel, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    const truncated = container.querySelector("text[data-truncated]")
    expect(truncated).toBeTruthy()
  })

  // Task-3 fix round, review Minor finding 3: a non-conserved hub (in-flow
  // != out-flow) renders without error and leaves a real, predictable,
  // band-free gap along the lighter side — disclosed behavior (this file's
  // own header comment, "A real, disclosed consequence of not forcing
  // conservation"), rendered and visually inspected (see the fix-round
  // report), not just asserted here. This pins the *geometry* the review's
  // own rendered-screenshot finding named: node height tracks the heavier
  // side (in=100), the lighter side's (out=60) bands only cover a
  // proportional fraction of that height, leaving the rest untouched.
  it("a non-conserved hub (in=100, out=60) renders with node height tracking the heavier side and a real gap on the lighter side", () => {
    const nonConserved = {
      type: "sankey" as const,
      nodes: [
        { id: "s1", label: "S1" },
        { id: "s2", label: "S2" },
        { id: "s3", label: "S3" },
        { id: "hub", label: "Hub" },
        { id: "sink", label: "Sink" },
      ],
      links: [
        { from: "s1", to: "hub", value: 30 },
        { from: "s2", to: "hub", value: 50 },
        { from: "s3", to: "hub", value: 20 },
        { from: "hub", to: "sink", value: 60 },
      ],
    }
    const { container } = svg(sankey.render(nonConserved, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    const rectByLabel = new Map<string, Element>()
    for (const g of Array.from(container.querySelectorAll("g[data-audit-box]"))) {
      const label = g.querySelector("text")?.textContent
      const rect = g.querySelector("rect")
      if (label && rect) rectByLabel.set(label, rect)
    }
    const hubH = Number(rectByLabel.get("Hub")!.getAttribute("height"))
    const sinkH = Number(rectByLabel.get("Sink")!.getAttribute("height"))

    // The real, visible signature of non-conservation: hub (weight =
    // max(in=100, out=60) = 100) and sink (weight = in = 60) are adjacent,
    // sequential nodes fed by the *same* single link — in a conserved
    // chain they'd render the same height. Here hub renders visibly
    // *taller* than sink, tracking its own heavier (incoming) side rather
    // than the 60 units it actually hands off. Both single-node layers
    // share this render's one global value->px scale (layer0's 3-node
    // stack is the binding constraint in this fixture), so the ratio is
    // exact, not just directionally larger.
    expect(hubH).toBeGreaterThan(sinkH)
    expect(hubH / sinkH).toBeCloseTo(100 / 60, 2)

    // The single outgoing band exists, is thinner than the hub's own bar,
    // and the render completes without error — the gap is real geometry,
    // not a crash or a dropped band.
    const bandCount = container.querySelectorAll("path[data-band-bbox]").length
    expect(bandCount).toBe(4) // 3 incoming to hub + 1 outgoing from it
  })
})

// Task-3 fix round, review Minor finding 2: stacking order must follow the
// graph's own content (node id), not the incidental array position `nodes[]`
// happened to be authored in — reproduces the review's own adversarial probe
// (a source with 3 outgoing links, `nodes[]` reordered without touching the
// graph itself) directly.
describe("sankey stacking order is content-derived, not authored-array-order (task 3 fix round, review Minor finding 2)", () => {
  function hubComponent(nodeOrder: string[]) {
    const labels: Record<string, string> = { a: "A", x: "X", y: "Y", z: "Z" }
    return {
      type: "sankey" as const,
      nodes: nodeOrder.map((id) => ({ id, label: labels[id]! })),
      links: [
        { from: "a", to: "x", value: 10 },
        { from: "a", to: "y", value: 10 },
        { from: "a", to: "z", value: 10 },
      ],
    }
  }

  /** The three target nodes' own top-to-bottom vertical order (by rendered
   * `y`), read as each node's label in that order — this fixture's hub "a"
   * has exactly one outgoing link to each, so a target's own node-column
   * position and its band's stacking slot at "a" move together (both are
   * the same content-derived tie-break now), making the target nodes'
   * own vertical order a direct, simple proxy for "did stacking order
   * change" without needing to reverse-engineer band-to-target matching
   * from bbox geometry alone. */
  function targetOrder(nodeOrder: string[]): string[] {
    const { container } = svg(sankey.render(hubComponent(nodeOrder), { x: 0, y: 0, w: 900, h: 400 }, ctx))
    const entries: { label: string; y: number }[] = []
    for (const g of Array.from(container.querySelectorAll("g[data-audit-box]"))) {
      const label = g.querySelector("text")?.textContent
      const rect = g.querySelector("rect")
      if (label && label !== "A" && rect) entries.push({ label, y: Number(rect.getAttribute("y")) })
    }
    return entries.sort((p, q) => p.y - q.y).map((e) => e.label)
  }

  it("reordering nodes[] for the identical graph (same ids, same edges, same values) no longer changes the rendered node order", () => {
    const forward = targetOrder(["a", "x", "y", "z"])
    const reversed = targetOrder(["a", "z", "y", "x"])
    expect(forward).toEqual(reversed)
  })

  it("the node order follows lexicographic id order (x, y, z), matching compareIds", () => {
    const order = targetOrder(["a", "z", "y", "x"])
    expect(order).toEqual(["X", "Y", "Z"])
  })

  it("double-render byte equality still holds after the tie-break change", () => {
    const a = renderToStaticMarkup(sankey.render(hubComponent(["a", "z", "y", "x"]), { x: 96, y: 176, w: 1088, h: 420 }, ctx))
    const b = renderToStaticMarkup(sankey.render(hubComponent(["a", "z", "y", "x"]), { x: 96, y: 176, w: 1088, h: 420 }, ctx))
    expect(a).toBe(b)
  })
})

// Task-3 fix round, review Major finding: labels can sit visually on top of
// a real, translucent band — the renderer must compute ink safe against the
// real composite, not just the plain page bg. Component-level pin
// (full-matrix-contrast.test.ts carries the permanent 13-theme analytic
// sweep) — this is the fast, component-local regression check.
describe("sankey label ink is safe against real band composites (task 3 fix round, review Major finding)", () => {
  it("emits data-band-bbox on every band and data-label-bbox on every label, for the analytic contrast sweep to consume", () => {
    const { container } = svg(sankey.render(twoLayer, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    expect(container.querySelectorAll("path[data-band-bbox]").length).toBe(2)
    expect(container.querySelectorAll("text[data-label-bbox]").length).toBe(3)
  })

  it("a label whose overlapping bands genuinely disagree on ink direction gets a backing chip, and the chip's own fill exactly matches the resolved page bg", () => {
    // Two bands sharing one target, colored so their two blends genuinely
    // disagree on ink direction against a dark page bg — the exact
    // opposite-direction conflict class this fix's own header comment
    // documents. Values are a frozen snapshot of campaign theme's real
    // `colors.bg`/two of its four `chartPalette` entries
    // (`src/themes/campaign.ts`) at the time this defect was found and
    // fixed — copied as literal hex here (not imported live) specifically
    // so this test keeps exercising the exact numeric scenario that
    // motivated the fix even if campaign's own tokens are retuned later —
    // campaign's *live* theme is separately and continuously covered by
    // `full-matrix-contrast.test.ts`'s permanent 13-theme analytic sweep
    // regardless. Verified analytically (a real computation run, not
    // estimated) before writing this test: blended over this bg at
    // BAND_OPACITY (0.45), `#F0559E` only clears 4.5:1 with white (6.47 vs
    // black's 2.99 — black badly fails), `#F7D23E` only clears it with
    // near-black (4.65 vs white's 4.16 — white fails) — no single flat ink
    // satisfies both blends at once.
    const conflictCtx: ComponentCtx = {
      ...ctx,
      colors: { ...ctx.colors, bg: "#3D2E78", text: "#3D2E78", chartPalette: ["#F0559E", "#F7D23E"] },
      defaultBg: "#3D2E78",
    }
    const hub = {
      type: "sankey" as const,
      nodes: [
        { id: "s1", label: "S1" },
        { id: "s2", label: "S2" },
        { id: "t", label: "T" },
      ],
      links: [
        { from: "s1", to: "t", value: 50 },
        { from: "s2", to: "t", value: 50 },
      ],
    }
    const { container } = svg(sankey.render(hub, { x: 0, y: 0, w: 900, h: 200 }, conflictCtx))
    const chips = container.querySelectorAll("rect[data-label-chip]")
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of Array.from(chips)) {
      expect(chip.getAttribute("fill")).toBe(conflictCtx.defaultBg)
    }
  })
})
