// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { measureTextUnits } from "../../lib/svg-text-layout"
import { assertSubset } from "../subset-validate"
import { auditSvgMarkup } from "../audit/svg-audit"
import { flowchart } from "./flowchart"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E", "#00A878"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

function nodeGeom(g: Element): { x: number; y: number; w: number } {
  const rect = g.querySelector(":scope > rect")
  if (rect) {
    return {
      x: Number(rect.getAttribute("x")),
      y: Number(rect.getAttribute("y")),
      w: Number(rect.getAttribute("width")),
    }
  }
  const pts = (g.querySelector(":scope > polygon")?.getAttribute("points") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  const xs = pts.filter((_, i) => i % 2 === 0)
  const ys = pts.filter((_, i) => i % 2 === 1)
  const x = Math.min(...xs)
  return { x, y: Math.min(...ys), w: Math.max(...xs) - x }
}

const component = {
  type: "flowchart" as const,
  nodes: [
    { id: "a", label: "Start", kind: "round" as const },
    { id: "b", label: "Process", kind: "rect" as const },
    { id: "c", label: "Decision", kind: "diamond" as const },
  ],
  edges: [
    { from: "a", to: "b", label: "next" },
    { from: "b", to: "c" },
  ],
  direction: "TB" as const,
}

describe("flowchart component", () => {
  it("renders at least 3 node shapes (rect + polygon combined)", () => {
    const { container } = svg(
      flowchart.render(component, { x: 80, y: 100, w: 600 }, ctx),
    )
    const rects = container.querySelectorAll("rect")
    const polygons = container.querySelectorAll("polygon")
    // round -> rect, rect -> rect, diamond -> polygon = 2 rects + 1 polygon
    // plus arrow polygons (2 edges = 2 arrow polygons)
    expect(rects.length + polygons.length).toBeGreaterThanOrEqual(3)
  })

  it("renders edge lines as path elements", () => {
    const { container } = svg(
      flowchart.render(component, { x: 80, y: 100, w: 600 }, ctx),
    )
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBeGreaterThanOrEqual(2)
  })

  it("renders arrowheads as polygon (no marker elements)", () => {
    const { container } = svg(
      flowchart.render(component, { x: 80, y: 100, w: 600 }, ctx),
    )
    const markers = container.querySelectorAll("marker")
    expect(markers.length).toBe(0)

    // Arrow polygons: at least one for each edge
    const polygons = container.querySelectorAll("polygon")
    // diamond polygon (1) + arrow polygons (2) = at least 3
    expect(polygons.length).toBeGreaterThanOrEqual(2)
  })

  it("renders at least 3 node label text elements", () => {
    const { container } = svg(
      flowchart.render(component, { x: 80, y: 100, w: 600 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    // 3 node labels + possibly 1 edge label = at least 3
    expect(texts.length).toBeGreaterThanOrEqual(3)
  })

  it("wraps everything in a translated group", () => {
    const { container } = svg(
      flowchart.render(component, { x: 80, y: 100, w: 600 }, ctx),
    )
    const g = container.querySelector("g")
    // 水平居中会在 box.x 基础上加 dx，因此只断言平移存在且不早于 box.x、y 精确
    const m = /translate\(([\d.]+),(\d+)\)/.exec(g?.getAttribute("transform") ?? "")
    expect(m).not.toBeNull()
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(80)
    expect(m?.[2]).toBe("100")
  })

  it("measure returns a positive height", () => {
    const h = flowchart.measure(component, 600, ctx)
    expect(h).toBeGreaterThan(0)
  })

  it("node labels use text color and body font", () => {
    const { container } = svg(
      flowchart.render(component, { x: 0, y: 0, w: 600 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    const nodeText = Array.from(texts).find((t) => t.textContent === "Start")
    expect(nodeText).toBeTruthy()
    expect(nodeText?.getAttribute("fill")).toBe("#1A2421")
    expect(nodeText?.getAttribute("font-family")).toBe("Microsoft YaHei")
  })

  it("edge strokes use muted color", () => {
    const { container } = svg(
      flowchart.render(component, { x: 0, y: 0, w: 600 }, ctx),
    )
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBeGreaterThan(0)
    expect(paths[0].getAttribute("stroke")).toBe("#5D6B65")
  })

  it("bounds height so a tall TB flowchart never overflows the slide", () => {
    // A 6-node vertical chain: dagre lays this out tall-and-narrow. Width-only
    // scaling would blow it up to thousands of px (overflowing the 720px slide).
    const tall = {
      type: "flowchart" as const,
      direction: "TB" as const,
      nodes: [
        { id: "a", label: "甲" },
        { id: "b", label: "乙" },
        { id: "c", label: "丙" },
        { id: "d", label: "丁" },
        { id: "e", label: "戊" },
        { id: "f", label: "己" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "d" },
        { from: "d", to: "e" },
        { from: "e", to: "f" },
      ],
    }
    const h = flowchart.measure(tall, 1120, ctx)
    expect(h).toBeLessThanOrEqual(360)
    // and every rendered node stays within that bounded height
    const { container } = svg(flowchart.render(tall, { x: 80, y: 264, w: 1120 }, ctx))
    const maxNodeBottom = Math.max(
      ...Array.from(container.querySelectorAll("rect")).map(
        (r) => parseFloat(r.getAttribute("y") ?? "0") + parseFloat(r.getAttribute("height") ?? "0"),
      ),
    )
    expect(maxNodeBottom).toBeLessThanOrEqual(360)
  })

  it("handles LR direction without errors", () => {
    const lrComponent = { ...component, direction: "LR" as const }
    const h = flowchart.measure(lrComponent, 600, ctx)
    expect(h).toBeGreaterThan(0)
    const { container } = svg(
      flowchart.render(lrComponent, { x: 0, y: 0, w: 600 }, ctx),
    )
    expect(container.querySelectorAll("text").length).toBeGreaterThanOrEqual(3)
  })
})

const MIXED_LONG_LABEL = "定位瓶颈 (网络/IO/大事务)"

describe("flowchart label fitting and orientation", () => {
  const longChain = {
    type: "flowchart" as const,
    nodes: [
      { id: "n1", label: "告警触发", kind: "round" as const },
      { id: "n2", label: "主从延迟?", kind: "diamond" as const },
      { id: "n3", label: MIXED_LONG_LABEL, kind: "rect" as const },
      { id: "n4", label: "检查复制线程 跳过异常事务", kind: "rect" as const },
      { id: "n5", label: "故障恢复", kind: "round" as const },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3", label: "是" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
    ],
  }

  it("annotates every node with a page-coordinate data-audit-box", () => {
    const { container } = svg(
      flowchart.render(longChain, { x: 96, y: 176, w: 1088 }, ctx),
    )
    // Scoped to `g` — a labeled edge's chip (`n2`->`n3`, label "是") also
    // carries `data-audit-box` (on its `<rect>`, see flowchart.tsx), which
    // the generic attribute selector would double-count against this
    // node-only assertion.
    const boxes = container.querySelectorAll("g[data-flow-node]")
    expect(boxes.length).toBe(longChain.nodes.length)
  })

  it("keeps mixed CJK/ascii labels within their node box per the shared estimator", () => {
    const { container } = svg(
      flowchart.render(longChain, { x: 0, y: 0, w: 1088 }, ctx),
    )
    for (const g of Array.from(container.querySelectorAll("g[data-flow-node]"))) {
      const shape = g.querySelector("rect, polygon")
      if (!shape) continue
      const text = g.querySelector("text")
      if (!text) continue
      const fontSize = Number(text.getAttribute("font-size"))
      const units = measureTextUnits(text.textContent ?? "")
      const cx = Number(text.getAttribute("x"))
      const left = cx - (units * fontSize) / 2
      const right = cx + (units * fontSize) / 2
      const bx = Number(shape.getAttribute("x") ?? cx - 40)
      const bw = Number(shape.getAttribute("width") ?? 80)
      expect(left).toBeGreaterThanOrEqual(bx - 6)
      expect(right).toBeLessThanOrEqual(bx + bw + 6)
    }
  })

  it("auto-picks LR for an unspecified-direction chain on a wide box", () => {
    const { container } = svg(
      flowchart.render(longChain, { x: 0, y: 0, w: 1088 }, ctx),
    )
    // LR 布局下图的包围盒应明显宽于高（用节点 audit-box 的分布近似判断）
    // Scoped to `g` so a labeled edge's chip (a `<rect data-audit-box>`, see
    // flowchart.tsx) doesn't get folded into the node-position spread this
    // is measuring.
    const xs: number[] = []
    const ys: number[] = []
    for (const g of Array.from(container.querySelectorAll("g[data-flow-node]"))) {
      const { x, y } = nodeGeom(g)
      xs.push(x)
      ys.push(y)
    }
    const spanX = Math.max(...xs) - Math.min(...xs)
    const spanY = Math.max(...ys) - Math.min(...ys)
    expect(spanX).toBeGreaterThan(spanY)
  })

  it("respects a deliberate vertical direction (TD alias)", () => {
    const { container } = svg(
      flowchart.render({ ...longChain, direction: "TD" as const }, { x: 0, y: 0, w: 1088 }, ctx),
    )
    const xs: number[] = []
    const ys: number[] = []
    for (const g of Array.from(container.querySelectorAll("g[data-flow-node]"))) {
      const { x, y } = nodeGeom(g)
      xs.push(x)
      ys.push(y)
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(
      Math.max(...xs) - Math.min(...xs),
    )
  })

  it("centers the chart horizontally within the box", () => {
    const { container } = svg(
      flowchart.render(component, { x: 0, y: 0, w: 1000 }, ctx),
    )
    // Scoped to `g` — `component`'s "next"-labeled edge also renders a chip
    // `<rect data-audit-box>`; this assertion is about node centering only.
    const outer = container.querySelector("g")?.getAttribute("transform") ?? ""
    const dx = Number(/translate\(([^,]+)/.exec(outer)?.[1] ?? 0)
    const xs: number[] = []
    for (const g of Array.from(container.querySelectorAll("g[data-flow-node]"))) {
      const { x, w } = nodeGeom(g)
      xs.push(x + dx, x + dx + w)
    }
    const left = Math.min(...xs)
    const right = Math.max(...xs)
    // 左右留白应大致对称（容差 40px），不允许整图贴左
    expect(Math.abs(left - (1000 - right))).toBeLessThanOrEqual(40)
    expect(left).toBeGreaterThan(40)
  })

  it("measure reflects the auto-picked orientation height", () => {
    const h = flowchart.measure(longChain, 1088, ctx)
    expect(h).toBeGreaterThan(0)
    expect(h).toBeLessThanOrEqual(360)
  })
})

// Regression coverage for the reported bug: a long edge label (e.g. "创建 /
// 维护同步状态") in a horizontal flowchart rendered past its node-to-node gap
// and got covered by the neighboring node card, because (a) labels painted
// before nodes and (b) the label text had no width fit at all.
describe("flowchart edge label clearance (layer order + fit + backing chip)", () => {
  const LONG_EDGE_LABEL = "创建 / 维护同步状态"

  // Two NODE_MIN_W (80px) nodes with a single RANK_SEP (48px) gap between
  // them — at w=208 (== the layout's own width) scale resolves to exactly 1,
  // so the gap is deterministic and narrow enough to force the long label
  // through the shrink-then-truncate path.
  const twoNodeLR = {
    type: "flowchart" as const,
    direction: "LR" as const,
    nodes: [
      { id: "a", label: "A", kind: "rect" as const },
      { id: "b", label: "B", kind: "rect" as const },
    ],
    edges: [{ from: "a", to: "b", label: LONG_EDGE_LABEL }],
  }

  it("renders edge labels in their own layer after every node group (DOM order)", () => {
    const { container } = svg(
      flowchart.render(twoNodeLR, { x: 0, y: 0, w: 208 }, ctx),
    )
    const outerG = container.querySelector("g")
    const children = Array.from(outerG?.children ?? [])
    // Node groups are `<g data-audit-box>`; the label's chip is now also
    // `data-audit-box`-tagged but on a `<rect>` (see flowchart.tsx) — scope
    // by tag so this stays a node-only DOM-order check.
    const nodeGroupIdxs = children
      .map((el, i) =>
        el.tagName.toLowerCase() === "g" && el.hasAttribute("data-flow-node")
          ? i
          : -1,
      )
      .filter((i) => i >= 0)
    expect(nodeGroupIdxs.length).toBe(2)
    const lastNodeIdx = Math.max(...nodeGroupIdxs)

    // The chip rect is the one filled with the theme's `bg` color (node
    // cards fill with `surface`), so it's unambiguous among top-level rects.
    const chipIdx = children.findIndex(
      (el) =>
        el.tagName.toLowerCase() === "rect" &&
        el.getAttribute("fill") === ctx.colors.bg,
    )
    expect(chipIdx).toBeGreaterThan(lastNodeIdx)
  })

  it("shrinks a long edge label to the min font size then truncates in a narrow gap, staying clear of both node boxes", () => {
    const { container } = svg(
      flowchart.render(twoNodeLR, { x: 0, y: 0, w: 208 }, ctx),
    )
    // Scoped to `g` — the label chip's own `data-audit-box` (a `<rect>`)
    // describes the gap it sits in, not a third node; this assertion wants
    // just the two flanking node boxes.
    const boxes = Array.from(container.querySelectorAll("g[data-flow-node]"))
      .map((g) => {
        const { x, w } = nodeGeom(g)
        return { x, w }
      })
      .sort((p, q) => p.x - q.x)
    expect(boxes.length).toBe(2)
    const gapLeft = boxes[0].x + boxes[0].w
    const gapRight = boxes[1].x

    const labelText = Array.from(container.querySelectorAll("text")).find(
      (t) => t.textContent !== "A" && t.textContent !== "B",
    )
    expect(labelText).toBeTruthy()

    const fontSize = Number(labelText!.getAttribute("font-size"))
    expect(fontSize).toBe(9) // shrunk all the way to the floor
    expect(labelText!.textContent!.length).toBeLessThan(LONG_EDGE_LABEL.length) // ...then truncated

    // Rendered width (by the same estimator the audit gate uses) must not
    // spill past either neighboring node's box — this is the reported bug.
    const cx = Number(labelText!.getAttribute("x"))
    const units = measureTextUnits(labelText!.textContent ?? "")
    const half = (units * fontSize) / 2
    const TOL = 6
    expect(cx - half).toBeGreaterThanOrEqual(gapLeft - TOL)
    expect(cx + half).toBeLessThanOrEqual(gapRight + TOL)
  })

  it("backs the edge label with a chip rect sized to the fitted text and centered on it", () => {
    const { container } = svg(
      flowchart.render(component, { x: 0, y: 0, w: 600 }, ctx),
    )
    const text = Array.from(container.querySelectorAll("text")).find(
      (t) => t.textContent === "next",
    )
    expect(text).toBeTruthy()
    const chip = text!.previousElementSibling
    expect(chip?.tagName.toLowerCase()).toBe("rect")
    expect(chip?.getAttribute("fill")).toBe(ctx.colors.bg)

    const fontSize = Number(text!.getAttribute("font-size"))
    const expectedW = measureTextUnits("next") * fontSize + 4 * 2 // 4px pad each side
    const expectedH = fontSize + 2 * 2 // 2px pad top/bottom
    expect(Number(chip!.getAttribute("width"))).toBeCloseTo(expectedW, 5)
    expect(Number(chip!.getAttribute("height"))).toBeCloseTo(expectedH, 5)

    // Chip and text share the same center point (text uses dominant-baseline
    // "middle", so this is what keeps the chip from drifting off the glyphs).
    const chipX = Number(chip!.getAttribute("x"))
    const chipW = Number(chip!.getAttribute("width"))
    const chipY = Number(chip!.getAttribute("y"))
    const chipH = Number(chip!.getAttribute("height"))
    expect(chipX + chipW / 2).toBeCloseTo(Number(text!.getAttribute("x")), 5)
    expect(chipY + chipH / 2).toBeCloseTo(Number(text!.getAttribute("y")), 5)
  })

  it("stays within the controlled SVG subset with a labeled edge (LR)", () => {
    const { container } = svg(
      flowchart.render(twoNodeLR, { x: 0, y: 0, w: 208 }, ctx),
    )
    expect(() => assertSubset(container.querySelector("svg")!)).not.toThrow()
  })

  it("stays within the controlled SVG subset with a labeled edge (TB) and keeps a sane font size", () => {
    const tbComponent = { ...twoNodeLR, direction: "TB" as const }
    const { container } = svg(flowchart.render(tbComponent, { x: 0, y: 0, w: 208 }, ctx))
    expect(() => assertSubset(container.querySelector("svg")!)).not.toThrow()

    const labelText = Array.from(container.querySelectorAll("text")).find(
      (t) => t.textContent !== "A" && t.textContent !== "B",
    )
    expect(labelText).toBeTruthy()
    const fontSize = Number(labelText!.getAttribute("font-size"))
    expect(fontSize).toBeGreaterThanOrEqual(9)
    expect(fontSize).toBeLessThanOrEqual(16)
  })
})

// Regression coverage for a second reviewed bug in the same fix: the label's
// available-width formula subtracted its fit margin *after* scaling
// (`spanLocal * scale - 16`), a page-space pixel amount independent of
// `scale`. That only matches a local-space margin at scale=1 — any diagram
// large enough to shrink `scale` (empirically: a straight chain does this by
// 6 TB nodes or 8 LR nodes, since `fitScale` bounds scale by both
// MAX_FLOW_HEIGHT and the box width) let the flat 16px margin eat most or
// all of `availableWidth`, so *every* edge label — regardless of how short —
// degraded to fitSvgLine's floor: a bare "…", or once the budget went
// negative, "". Confirmed against the pre-fix code with the exact harness
// below (git-stash the fix, same assertions fail with literal "…" content).
describe("flowchart edge label scale-aware budget (never a bare ellipsis or empty string)", () => {
  // Mirrors audit/stress-fixtures.ts's DIAGRAM_LABEL (MIXED_LONG.slice(0, 20))
  // without importing across the audit/component boundary — this file exercises
  // the component in isolation from the slide/deck layer.
  const REPRO_NODE_LABEL = "基于 Kubernetes Operat"
  const REPRO_EDGE_LABEL = "确认"

  function chain(nodeCount: number, direction: "TB" | "LR") {
    return {
      type: "flowchart" as const,
      direction,
      nodes: Array.from({ length: nodeCount }, (_, i) => ({
        id: `n${i}`,
        label: `${REPRO_NODE_LABEL}${i}`,
      })),
      edges: Array.from({ length: nodeCount - 1 }, (_, i) => ({
        from: `n${i}`,
        to: `n${i + 1}`,
        label: REPRO_EDGE_LABEL,
      })),
    }
  }

  // Edge labels render with `ctx.colors.muted`; node labels use
  // `ctx.colors.text` — an unambiguous way to isolate edge-label <text>
  // nodes regardless of whether the node label itself got truncated too.
  function edgeLabelTexts(container: HTMLElement) {
    return Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("fill") === ctx.colors.muted,
    )
  }

  // The real per-theme "single" content-component width (see templates/*.tsx):
  // 880 (magazine) .. 1152 (custom, no background). Sweeping this
  // range pins the fix across every theme the audit gate actually renders,
  // not one cherry-picked box width.
  const THEME_CONTENT_WIDTHS = [880, 900, 1088, 1152]

  it("keeps a 6-node TB chain's edge labels fully readable at every theme content width", () => {
    for (const w of THEME_CONTENT_WIDTHS) {
      const { container } = svg(
        flowchart.render(chain(6, "TB"), { x: 0, y: 0, w }, ctx),
      )
      const texts = edgeLabelTexts(container)
      expect(texts.length).toBe(5) // one per edge — this repro stays fully readable, never omitted
      for (const t of texts) {
        expect(t.textContent).toBe(REPRO_EDGE_LABEL) // "确认" fits whole, no truncation needed
      }
    }
  })

  it("never renders a bare ellipsis or empty label for an 8-node LR chain at any theme content width — reads readable or is cleanly omitted, with no dangling chip", () => {
    for (const w of THEME_CONTENT_WIDTHS) {
      const { container } = svg(
        flowchart.render(chain(8, "LR"), { x: 0, y: 0, w }, ctx),
      )
      const texts = edgeLabelTexts(container)
      for (const t of texts) {
        const content = t.textContent ?? ""
        expect(content).not.toBe("")
        expect(content).not.toBe("…")
      }
      // A chip must never outlive its text (or vice versa): exactly one
      // bg-filled chip per rendered edge label, none left dangling empty.
      const chips = Array.from(container.querySelectorAll("rect")).filter(
        (r) => r.getAttribute("fill") === ctx.colors.bg,
      )
      expect(chips.length).toBe(texts.length)
    }
  })

  it("omits the label (text and chip both absent) instead of fitting one when the gap is narrower than one character can survive", () => {
    // A 20-node TB chain pushes `scale` well past the point where even one
    // CJK character survives fitSvgLine's floor (see MIN_LABEL_WIDTH).
    const { container } = svg(
      flowchart.render(chain(20, "TB"), { x: 0, y: 0, w: 880 }, ctx),
    )
    expect(edgeLabelTexts(container).length).toBe(0)
    const chips = Array.from(container.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("fill") === ctx.colors.bg,
    )
    expect(chips.length).toBe(0)
  })

  it("the static overflow auditor reports zero issues for the repro chains at every theme content width", () => {
    for (const [direction, nodeCount] of [
      ["TB", 6],
      ["LR", 8],
    ] as const) {
      for (const w of THEME_CONTENT_WIDTHS) {
        const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${renderToStaticMarkup(
          flowchart.render(chain(nodeCount, direction), { x: 96, y: 176, w }, ctx),
        )}</svg>`
        expect(auditSvgMarkup(markup)).toEqual([])
      }
    }
  })
})

describe("flowchart edge label data-audit-box (gap geometry, not the chip's own tautological size)", () => {
  it("tags the label chip with a data-audit-box sized to the physical gap, centered on the label, in absolute page coordinates", () => {
    const boxArg = { x: 96, y: 176, w: 600 }
    const { container } = svg(flowchart.render(component, boxArg, ctx))

    const text = Array.from(container.querySelectorAll("text")).find(
      (t) => t.textContent === "next",
    )
    expect(text).toBeTruthy()
    const chip = text!.previousElementSibling!
    expect(chip.tagName.toLowerCase()).toBe("rect")
    expect(chip.hasAttribute("data-audit-box")).toBe(true)

    const [boxX, boxY, boxW] = (chip.getAttribute("data-audit-box") ?? "")
      .split(",")
      .map(Number)
    const chipW = Number(chip.getAttribute("width"))
    // The gap box must be strictly wider than the chip's own fitted width —
    // otherwise this would just re-assert fitSvgLine's own fit-within-budget
    // contract (a tautology, since the chip is sized *from* the already-
    // fitted text) instead of checking the label against independent gap
    // geometry, the same way a node's own data-audit-box (nw) is looser than
    // its usableW fitting budget.
    expect(boxW).toBeGreaterThan(chipW)

    // Absolute page coordinates: read the actual translate the renderer
    // applied (box.x + dx) rather than assuming dx=0, then confirm the box
    // is centered on the same point as the text (mirrors the chip/text
    // centering already asserted above the flowchart-block describe).
    const outerG = container.querySelector("g")!
    const m = /translate\(([\d.]+),([\d.]+)\)/.exec(
      outerG.getAttribute("transform") ?? "",
    )
    const tdx = Number(m?.[1])
    const localX = Number(text!.getAttribute("x"))
    expect(boxX + boxW / 2).toBeCloseTo(tdx + localX, 5)
    expect(boxY).toBeGreaterThanOrEqual(boxArg.y)
  })
})

// 用户复验（2026-07-08 截图）：模型把 mermaid 的 <br/> 习惯带进 flowchart
// label（提示词 mermaid 段教的），渲染端单行原样画出字面 "<br/>"；且节点文本
// 与边框之间只剩固定 6px 有效边距（NODE_PAD_X×0.6 不随缩放 + 字号 ×1.15
// 放大与盒宽预算脱钩，fit 机制把留白吃光）——毫无呼吸感。
describe("flowchart node label lines and breathing room", () => {
  const brComponent = {
    type: "flowchart" as const,
    nodes: [
      { id: "a", label: "小模型起草<br/>一口气猜出后续一连串字", kind: "rect" as const },
      { id: "b", label: "大模型并行批改<br/>把整串草稿批量核对", kind: "rect" as const },
      { id: "c", label: "接受最长正确前缀<br/>再补一个字", kind: "round" as const },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ],
    direction: "TD" as const,
  }

  it("never renders a literal <br/> in node text", () => {
    const { container } = svg(flowchart.render(brComponent, { x: 0, y: 0, w: 1088 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent ?? "")
    for (const t of texts) {
      expect(t).not.toMatch(/<br\s*\/?>/i)
    }
  })

  it("splits <br/> into stacked lines (two text elements per node)", () => {
    const { container } = svg(flowchart.render(brComponent, { x: 0, y: 0, w: 1088 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent ?? "")
    expect(texts).toContain("小模型起草")
    expect(texts.some((t) => t.startsWith("一口气猜出"))).toBe(true)
    expect(texts).toContain("接受最长正确前缀")
  })

  it("splits \\n the same way", () => {
    const nlComponent = {
      ...brComponent,
      nodes: [
        { id: "a", label: "第一行\n第二行", kind: "rect" as const },
        { id: "b", label: "单行", kind: "rect" as const },
      ],
      edges: [{ from: "a", to: "b" }],
    }
    const { container } = svg(flowchart.render(nlComponent, { x: 0, y: 0, w: 1088 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent ?? "")
    expect(texts).toContain("第一行")
    expect(texts).toContain("第二行")
  })

  it("keeps scaled NODE_PAD_X of clear space between node text and the card edge", () => {
    // 长 label 顶满盒宽预算的最坏情况：文本估算宽必须 ≤ 盒宽 - 2×留白，
    // 留白随整图 scale 缩放（scale = 渲染盒宽 / 局部盒宽，从 rect 宽反推）。
    const longComponent = {
      ...brComponent,
      nodes: [
        { id: "a", label: "这是一个非常非常长的处理步骤描述文本", kind: "rect" as const },
        { id: "b", label: "短", kind: "rect" as const },
      ],
      edges: [{ from: "a", to: "b" }],
    }
    const { container } = svg(flowchart.render(longComponent, { x: 0, y: 0, w: 1088 }, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    const texts = Array.from(container.querySelectorAll("text"))
    // 最宽的 rect 就是长 label 节点
    const widest = rects.reduce((a, b) =>
      Number(a.getAttribute("width")) > Number(b.getAttribute("width")) ? a : b,
    )
    const nodeText = texts.find((t) => t.textContent?.startsWith("这是一个"))
    expect(nodeText).toBeTruthy()
    const rectW = Number(widest.getAttribute("width"))
    const fontSize = Number(nodeText!.getAttribute("font-size"))
    const textW = measureTextUnits(nodeText!.textContent ?? "") * fontSize
    // NODE_PAD_X=16（局部），scale 未知但 rect 宽与文本宽同尺度：要求每侧
    // 至少 rectW 的 8%（16/最大局部盒宽 260 ≈ 6.2%，留 8% 校验呼吸感下限，
    // 因为该节点盒宽必然 < 260——12px 预算字号下 19 字 ≈ 234+32 > 260 截到 260）
    expect(textW).toBeLessThanOrEqual(rectW - 2 * rectW * 0.08)
  })
})

// Gallery r2 leftover (ember p05): the decision diamond is sized like a
// rectangle, then render subtracts another 40% + padding from the usable
// chord, so 「设备接入」 shrinks to 9px and truncates to 「设…」. Edge labels
// on the in/out connectors sit on that diamond. Do not "fix" either by
// shrinking type further.
describe("flowchart diamond label and edge-label clearance (ember p05 leftover)", () => {
  const emberZh = {
    type: "flowchart" as const,
    direction: "LR" as const,
    nodes: [
      { id: "a", label: "需求确认", kind: "round" as const },
      { id: "b", label: "现场勘测" },
      { id: "c", label: "设备接入", kind: "diamond" as const },
      { id: "d", label: "模型调优" },
      { id: "e", label: "验收交付", kind: "round" as const },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "d", label: "设备接入" },
      { from: "c", to: "b", label: "数据采集" },
      { from: "d", to: "e" },
    ],
  }

  const emberEn = {
    type: "flowchart" as const,
    direction: "LR" as const,
    nodes: [
      { id: "a", label: "Scoping", kind: "round" as const },
      { id: "b", label: "Site survey" },
      { id: "c", label: "Onboarding", kind: "diamond" as const },
      { id: "d", label: "Model tuning" },
      { id: "e", label: "Acceptance", kind: "round" as const },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "d", label: "Onboarding" },
      { from: "c", to: "b", label: "Collection" },
      { from: "d", to: "e" },
    ],
  }

  function polygonBox(polygon: Element) {
    const nums = (polygon.getAttribute("points") ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n))
    const xs = nums.filter((_, i) => i % 2 === 0)
    const ys = nums.filter((_, i) => i % 2 === 1)
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    }
  }

  function rectBox(el: Element) {
    return {
      x: Number(el.getAttribute("x")),
      y: Number(el.getAttribute("y")),
      w: Number(el.getAttribute("width")),
      h: Number(el.getAttribute("height")),
    }
  }

  function intersects(
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  }

  function diamondGroup(container: HTMLElement) {
    return Array.from(container.querySelectorAll("g[data-flow-node]")).find((g) =>
      g.querySelector("polygon"),
    )
  }

  it("keeps diamond text 设备接入 complete at a readable size (no ellipsis, fontSize >= 12)", () => {
    const { container } = svg(flowchart.render(emberZh, { x: 96, y: 228, w: 1088 }, ctx))
    const group = diamondGroup(container)
    expect(group).toBeTruthy()
    const texts = Array.from(group!.querySelectorAll("text"))
    expect(texts.length).toBeGreaterThanOrEqual(1)
    const joined = texts.map((t) => t.textContent ?? "").join("")
    expect(joined.replace(/\s/g, "")).toBe("设备接入")
    expect(joined).not.toContain("…")
    for (const t of texts) {
      expect(t.getAttribute("data-truncated")).not.toBe("1")
      expect(Number(t.getAttribute("font-size"))).toBeGreaterThanOrEqual(12)
    }
  })

  it("keeps diamond text Onboarding complete at a readable size (no ellipsis, fontSize >= 12)", () => {
    const { container } = svg(flowchart.render(emberEn, { x: 96, y: 228, w: 1088 }, ctx))
    const group = diamondGroup(container)
    expect(group).toBeTruthy()
    const texts = Array.from(group!.querySelectorAll("text"))
    const joined = texts.map((t) => t.textContent ?? "").join("")
    expect(joined.replace(/\s/g, "")).toBe("Onboarding")
    expect(joined).not.toContain("…")
    for (const t of texts) {
      expect(t.getAttribute("data-truncated")).not.toBe("1")
      expect(Number(t.getAttribute("font-size"))).toBeGreaterThanOrEqual(12)
    }
  })

  it("parks 数据采集 off the diamond bbox and drops the 设备接入 edge label as a node-name duplicate", () => {
    const { container } = svg(flowchart.render(emberZh, { x: 96, y: 228, w: 1088 }, ctx))
    const diamond = Array.from(container.querySelectorAll("polygon")).find(
      (p) => p.getAttribute("fill") === ctx.colors.surface,
    )
    expect(diamond).toBeTruthy()
    const dBox = polygonBox(diamond!)

    const edgeLabels = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("fill") === ctx.colors.muted,
    )
    const contents = edgeLabels.map((t) => t.textContent ?? "")
    expect(contents).toContain("数据采集")
    expect(contents).not.toContain("设备接入")

    for (const t of edgeLabels) {
      const chip = t.previousElementSibling
      expect(chip?.tagName.toLowerCase()).toBe("rect")
      const chipBox = rectBox(chip!)
      expect(intersects(chipBox, dBox)).toBe(false)
    }
  })
})

// 2026-08-23 用户裁定：推翻 2026-07-14「连线一律曲线」，flowchart 连线改
// 正交圆角肘（禁斜线，圆角半径小，箭头继续 polygon）。层序仍走 dagre，
// 同边多出边扇口，标签离描边 6-10px，先线后盒。
describe("flowchart orthogonal rounded routing", () => {
  const fork = {
    type: "flowchart" as const,
    direction: "TB" as const,
    nodes: [
      { id: "a", label: "Start", kind: "round" as const },
      { id: "b", label: "Left" },
      { id: "c", label: "Right" },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "a", to: "c" },
    ],
  }

  const diamondFork = {
    type: "flowchart" as const,
    direction: "TB" as const,
    nodes: [
      { id: "s", label: "Begin", kind: "round" as const },
      { id: "d", label: "If", kind: "diamond" as const },
      { id: "y", label: "Yes" },
      { id: "n", label: "No" },
    ],
    edges: [
      { from: "s", to: "d" },
      { from: "d", to: "y", label: "YES" },
      { from: "d", to: "n", label: "NO" },
    ],
  }

  function parsePath(d: string): { cmd: string; nums: number[] }[] {
    const out: { cmd: string; nums: number[] }[] = []
    const re = /([MLHVQCSTAZ])([^MLHVQCSTAZ]*)/gi
    for (const m of d.matchAll(re)) {
      const nums = m[2]
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number)
      out.push({ cmd: m[1]!.toUpperCase(), nums })
    }
    return out
  }

  function assertOrthogonal(d: string) {
    const cmds = parsePath(d)
    expect(cmds.length).toBeGreaterThan(0)
    for (const c of cmds) {
      expect(["M", "L", "H", "V", "Q"]).toContain(c.cmd)
    }
    let x = 0
    let y = 0
    for (const c of cmds) {
      if (c.cmd === "M" || c.cmd === "L") {
        const nx = c.nums[0]!
        const ny = c.nums[1]!
        if (c.cmd === "L") {
          expect(Math.abs(nx - x) < 0.05 || Math.abs(ny - y) < 0.05).toBe(true)
        }
        x = nx
        y = ny
      } else if (c.cmd === "H") {
        x = c.nums[0]!
      } else if (c.cmd === "V") {
        y = c.nums[0]!
      } else if (c.cmd === "Q") {
        x = c.nums[2]!
        y = c.nums[3]!
      }
    }
  }

  function edgePaths(container: HTMLElement): SVGPathElement[] {
    return Array.from(container.querySelectorAll("path"))
  }

  it("draws connectors as orthogonal rounded elbows (H/V/Q, never cubic, never diagonal L)", () => {
    const { container } = svg(flowchart.render(component, { x: 0, y: 0, w: 600 }, ctx))
    const paths = edgePaths(container)
    expect(paths.length).toBe(component.edges.length)
    for (const p of paths) {
      const d = p.getAttribute("d") ?? ""
      expect(d).not.toMatch(/\b[CS]\b/)
      assertOrthogonal(d)
    }
  })

  it("fans same-side attachments so two outgoing edges do not share a start point", () => {
    const { container } = svg(flowchart.render(fork, { x: 0, y: 0, w: 800 }, ctx))
    const starts = edgePaths(container).map((p) => {
      const d = p.getAttribute("d") ?? ""
      const m = /M\s+([\d.-]+)[\s,]+([\d.-]+)/.exec(d)
      return { x: Number(m?.[1]), y: Number(m?.[2]) }
    })
    expect(starts).toHaveLength(2)
    const dx = Math.abs(starts[0]!.x - starts[1]!.x)
    const dy = Math.abs(starts[0]!.y - starts[1]!.y)
    expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(12)
  })

  it("fans a diamond's two outgoing edges off the same vertex", () => {
    const { container } = svg(flowchart.render(diamondFork, { x: 0, y: 0, w: 800 }, ctx))
    const paths = edgePaths(container)
    expect(paths.length).toBe(3)
    const labeled = Array.from(container.querySelectorAll("text"))
      .filter((t) => t.getAttribute("fill") === ctx.colors.muted)
      .map((t) => t.textContent)
    expect(labeled).toEqual(expect.arrayContaining(["YES", "NO"]))
    const ds = paths.map((p) => p.getAttribute("d") ?? "")
    expect(new Set(ds).size).toBe(ds.length)
    expect(ds.some((d) => d.includes("Q "))).toBe(true)
    for (const d of ds) assertOrthogonal(d)
  })

  it("keeps an edge-label chip 6-10px off the connector stroke when the gap is open", () => {
    const two = {
      type: "flowchart" as const,
      direction: "LR" as const,
      nodes: [
        { id: "a", label: "From", kind: "rect" as const },
        { id: "b", label: "To", kind: "rect" as const },
      ],
      edges: [{ from: "a", to: "b", label: "go" }],
    }
    const { container } = svg(flowchart.render(two, { x: 0, y: 0, w: 600 }, ctx))
    const text = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "go")
    expect(text).toBeTruthy()
    const chip = text!.previousElementSibling!
    const chipBox = {
      x: Number(chip.getAttribute("x")),
      y: Number(chip.getAttribute("y")),
      w: Number(chip.getAttribute("width")),
      h: Number(chip.getAttribute("height")),
    }
    const d = edgePaths(container)[0]!.getAttribute("d") ?? ""
    const cmds = parsePath(d)
    const pts: { x: number; y: number }[] = []
    let x = 0
    let y = 0
    for (const c of cmds) {
      if (c.cmd === "M" || c.cmd === "L") {
        x = c.nums[0]!
        y = c.nums[1]!
        pts.push({ x, y })
      } else if (c.cmd === "H") {
        x = c.nums[0]!
        pts.push({ x, y })
      } else if (c.cmd === "V") {
        y = c.nums[0]!
        pts.push({ x, y })
      } else if (c.cmd === "Q") {
        x = c.nums[2]!
        y = c.nums[3]!
        pts.push({ x, y })
      }
    }
    function distToSeg(
      p: { x: number; y: number },
      a: { x: number; y: number },
      b: { x: number; y: number },
    ) {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len2 = dx * dx + dy * dy
      if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
      t = Math.max(0, Math.min(1, t))
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    }
    const corners = [
      { x: chipBox.x, y: chipBox.y },
      { x: chipBox.x + chipBox.w, y: chipBox.y },
      { x: chipBox.x, y: chipBox.y + chipBox.h },
      { x: chipBox.x + chipBox.w, y: chipBox.y + chipBox.h },
    ]
    let gap = Infinity
    for (const corner of corners) {
      for (let i = 0; i < pts.length - 1; i++) {
        gap = Math.min(gap, distToSeg(corner, pts[i]!, pts[i + 1]!))
      }
    }
    expect(gap).toBeGreaterThanOrEqual(6)
    expect(gap).toBeLessThanOrEqual(10.5)
  })

  it("paints every edge path before any node group (line under box)", () => {
    const { container } = svg(flowchart.render(fork, { x: 0, y: 0, w: 800 }, ctx))
    const outer = container.querySelector("g")
    const children = Array.from(outer?.children ?? [])
    const lastPath = Math.max(
      ...children.map((el, i) => (el.tagName.toLowerCase() === "path" ? i : -1)),
    )
    const firstNode = Math.min(
      ...children.map((el, i) =>
        el.tagName.toLowerCase() === "g" && el.hasAttribute("data-flow-node") ? i : 999,
      ),
    )
    expect(lastPath).toBeGreaterThanOrEqual(0)
    expect(firstNode).toBeLessThan(999)
    expect(lastPath).toBeLessThan(firstNode)
  })

  it("keeps arrows as polygons and never emits a marker", () => {
    const { container } = svg(flowchart.render(fork, { x: 0, y: 0, w: 800 }, ctx))
    expect(container.querySelectorAll("marker")).toHaveLength(0)
    expect(container.querySelectorAll("polygon").length).toBeGreaterThanOrEqual(2)
  })

  it("is deterministic: the same IR renders byte-identical markup twice", () => {
    const a = renderToStaticMarkup(flowchart.render(diamondFork, { x: 16, y: 24, w: 720 }, ctx))
    const b = renderToStaticMarkup(flowchart.render(diamondFork, { x: 16, y: 24, w: 720 }, ctx))
    expect(a).toBe(b)
  })
})

// Gallery component--flowchart--zh: labels[0] reuses the diamond node name
// 「席位开通」, so the c→d chip parked below the rhombus with no nearby
// stroke. labels[1] 「用量采集」 sits on the bidirectional pair and covers
// the arrowheads. Edge labels now omit node-name duplicates, draw only
// when the edge has a real polyline, and stay 6-10px off their own stroke
// clear of arrow tips.
describe("flowchart edge labels: omit duplicates, stay off strokes and arrows", () => {
  const galleryZh = {
    type: "flowchart" as const,
    direction: "LR" as const,
    nodes: [
      { id: "a", label: "需求确认", kind: "round" as const },
      { id: "b", label: "方案设计" },
      { id: "c", label: "席位开通", kind: "diamond" as const },
      { id: "d", label: "权限配置" },
      { id: "e", label: "验收交付", kind: "round" as const },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "d", label: "席位开通" },
      { from: "c", to: "b", label: "用量采集" },
      { from: "d", to: "e" },
    ],
  }

  const BOX = { x: 96, y: 176, w: 1088 }

  function mutedLabels(container: HTMLElement) {
    return Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("fill") === ctx.colors.muted,
    )
  }

  function parsePath(d: string): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = []
    let x = 0
    let y = 0
    const re = /([MLHVQCSTAZ])([^MLHVQCSTAZ]*)/gi
    for (const m of d.matchAll(re)) {
      const cmd = m[1]!.toUpperCase()
      const nums = m[2]!
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number)
      if (cmd === "M" || cmd === "L") {
        x = nums[0]!
        y = nums[1]!
        pts.push({ x, y })
      } else if (cmd === "H") {
        x = nums[0]!
        pts.push({ x, y })
      } else if (cmd === "V") {
        y = nums[0]!
        pts.push({ x, y })
      } else if (cmd === "Q") {
        x = nums[2]!
        y = nums[3]!
        pts.push({ x, y })
      }
    }
    return pts
  }

  function distToSeg(
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
  }

  function chipNearEdgeDist(
    chip: { x: number; y: number; w: number; h: number },
    pts: { x: number; y: number }[],
  ) {
    const corners = [
      { x: chip.x, y: chip.y },
      { x: chip.x + chip.w, y: chip.y },
      { x: chip.x, y: chip.y + chip.h },
      { x: chip.x + chip.w, y: chip.y + chip.h },
    ]
    let gap = Infinity
    for (const corner of corners) {
      for (let i = 0; i < pts.length - 1; i++) {
        gap = Math.min(gap, distToSeg(corner, pts[i]!, pts[i + 1]!))
      }
    }
    return gap
  }

  function aabbOverlap(
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  }

  it("omits an edge label that repeats a node name (gallery zh 席位开通)", () => {
    const { container } = svg(flowchart.render(galleryZh, BOX, ctx))
    const muted = mutedLabels(container).map((t) => t.textContent ?? "")
    expect(muted).not.toContain("席位开通")
    const nodeTexts = Array.from(container.querySelectorAll("g[data-flow-node] text")).map(
      (t) => t.textContent ?? "",
    )
    expect(nodeTexts.join("")).toContain("席位开通")
  })

  it("keeps a distinct branch label on the reverse edge (用量采集)", () => {
    const { container } = svg(flowchart.render(galleryZh, BOX, ctx))
    const muted = mutedLabels(container).map((t) => t.textContent ?? "")
    expect(muted).toContain("用量采集")
  })

  it("sits 6-10px off its own stroke and misses every arrowhead", () => {
    const { container } = svg(flowchart.render(galleryZh, BOX, ctx))
    const label = mutedLabels(container).find((t) => t.textContent === "用量采集")
    expect(label).toBeTruthy()
    const chipEl = label!.previousElementSibling!
    const chip = {
      x: Number(chipEl.getAttribute("x")),
      y: Number(chipEl.getAttribute("y")),
      w: Number(chipEl.getAttribute("width")),
      h: Number(chipEl.getAttribute("height")),
    }
    const paths = Array.from(container.querySelectorAll("path")).map((p) =>
      parsePath(p.getAttribute("d") ?? ""),
    )
    const own = paths
      .map((pts) => ({ pts, gap: chipNearEdgeDist(chip, pts) }))
      .sort((a, b) => a.gap - b.gap)
    expect(own[0]!.gap).toBeGreaterThanOrEqual(6)
    expect(own[0]!.gap).toBeLessThanOrEqual(10.5)
    for (const other of own.slice(1)) {
      expect(other.gap).toBeGreaterThanOrEqual(6)
    }
    const arrows = Array.from(container.querySelectorAll("polygon")).filter(
      (p) => p.getAttribute("fill") === ctx.colors.muted,
    )
    for (const arrow of arrows) {
      const nums = (arrow.getAttribute("points") ?? "")
        .trim()
        .split(/[\s,]+/)
        .map(Number)
      const xs = nums.filter((_, i) => i % 2 === 0)
      const ys = nums.filter((_, i) => i % 2 === 1)
      const box = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      }
      expect(aabbOverlap(chip, box)).toBe(false)
    }
  })

  it("does not paint a label when the edge has no drawable polyline", () => {
    const dangling = {
      type: "flowchart" as const,
      direction: "LR" as const,
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "missing", label: "ghost" },
      ],
    }
    const { container } = svg(flowchart.render(dangling, { x: 0, y: 0, w: 600 }, ctx))
    const muted = mutedLabels(container).map((t) => t.textContent ?? "")
    expect(muted).not.toContain("ghost")
    expect(container.querySelectorAll("path").length).toBe(1)
  })
})

