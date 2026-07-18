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
    const boxes = container.querySelectorAll("g[data-audit-box]")
    expect(boxes.length).toBe(longChain.nodes.length)
  })

  it("keeps mixed CJK/ascii labels within their node box per the shared estimator", () => {
    const { container } = svg(
      flowchart.render(longChain, { x: 0, y: 0, w: 1088 }, ctx),
    )
    for (const g of Array.from(container.querySelectorAll("g[data-audit-box]"))) {
      const [bx, , bw] = (g.getAttribute("data-audit-box") ?? "").split(",").map(Number)
      const text = g.querySelector("text")
      if (!text) continue
      const fontSize = Number(text.getAttribute("font-size"))
      const units = measureTextUnits(text.textContent ?? "")
      const cx = Number(text.getAttribute("x"))
      const left = cx - (units * fontSize) / 2
      const right = cx + (units * fontSize) / 2
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
    for (const g of Array.from(container.querySelectorAll("g[data-audit-box]"))) {
      const [bx, by] = (g.getAttribute("data-audit-box") ?? "").split(",").map(Number)
      xs.push(bx)
      ys.push(by)
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
    for (const g of Array.from(container.querySelectorAll("g[data-audit-box]"))) {
      const [bx, by] = (g.getAttribute("data-audit-box") ?? "").split(",").map(Number)
      xs.push(bx)
      ys.push(by)
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
    const xs: number[] = []
    for (const g of Array.from(container.querySelectorAll("g[data-audit-box]"))) {
      const parts = (g.getAttribute("data-audit-box") ?? "").split(",").map(Number)
      xs.push(parts[0], parts[0] + parts[2])
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
        el.tagName.toLowerCase() === "g" && el.hasAttribute("data-audit-box")
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
    const boxes = Array.from(container.querySelectorAll("g[data-audit-box]"))
      .map((g) => {
        const [x, , w] = (g.getAttribute("data-audit-box") ?? "").split(",").map(Number)
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
