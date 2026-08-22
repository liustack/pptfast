import { describe, it, expect } from "vitest"
import {
  layoutFlowchart,
  type LayoutEdge,
  type PlacedNode,
  type SizedNode,
} from "./flowchart-layout"

const BOX: SizedNode = { id: "A", w: 80, h: 56 }

function node(id: string, w = 80, h = 56): SizedNode {
  return { id, w, h }
}

function byId(nodes: readonly PlacedNode[], id: string): PlacedNode {
  const found = nodes.find((n) => n.id === id)
  expect(found, id).toBeTruthy()
  return found!
}

describe("layoutFlowchart", () => {
  it("is deterministic for the same nodes, edges, and rankdir", () => {
    const nodes = [node("a"), node("b"), node("c"), node("d")]
    const edges: LayoutEdge[] = [
      { from: "a", to: "b" },
      { from: "a", to: "c" },
      { from: "b", to: "d" },
      { from: "c", to: "d" },
    ]
    const a = layoutFlowchart(nodes, edges, "TB")
    const b = layoutFlowchart(nodes, edges, "TB")
    expect(a).toEqual(b)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("places two equal LR nodes with ranksep as the box gap (width 208)", () => {
    const nodes = [node("A"), node("B")]
    const edges: LayoutEdge[] = [{ from: "A", to: "B" }]
    const layout = layoutFlowchart(nodes, edges, "LR", { nodesep: 30, ranksep: 48 })
    expect(layout.width).toBe(208)
    expect(layout.height).toBe(56)
    expect(byId(layout.nodes, "A")).toEqual({ id: "A", x: 0, y: 0, w: 80, h: 56 })
    expect(byId(layout.nodes, "B")).toEqual({ id: "B", x: 128, y: 0, w: 80, h: 56 })
  })

  it("stacks a TB chain on increasing y with shared x", () => {
    const nodes = [node("A"), node("B"), node("C")]
    const edges: LayoutEdge[] = [
      { from: "A", to: "B" },
      { from: "B", to: "C" },
    ]
    const layout = layoutFlowchart(nodes, edges, "TB", { nodesep: 30, ranksep: 48 })
    const a = byId(layout.nodes, "A")
    const b = byId(layout.nodes, "B")
    const c = byId(layout.nodes, "C")
    expect(b.y).toBeGreaterThan(a.y)
    expect(c.y).toBeGreaterThan(b.y)
    expect(a.x).toBe(b.x)
    expect(b.x).toBe(c.x)
    expect(b.y).toBe(a.y + a.h + 48)
    expect(c.y).toBe(b.y + b.h + 48)
  })

  it("places fork children in the same rank with a nodesep gap and a centered parent", () => {
    const nodes = [node("A"), node("B"), node("C")]
    const edges: LayoutEdge[] = [
      { from: "A", to: "B" },
      { from: "A", to: "C" },
    ]
    const layout = layoutFlowchart(nodes, edges, "TB", { nodesep: 30, ranksep: 48 })
    const a = byId(layout.nodes, "A")
    const b = byId(layout.nodes, "B")
    const c = byId(layout.nodes, "C")
    expect(b.y).toBe(c.y)
    expect(b.y).toBeGreaterThan(a.y)
    const left = b.x <= c.x ? b : c
    const right = b.x <= c.x ? c : b
    expect(right.x - (left.x + left.w)).toBeGreaterThanOrEqual(30)
    const parentCx = a.x + a.w / 2
    const pairLeft = Math.min(b.x, c.x)
    const pairRight = Math.max(b.x + b.w, c.x + c.w)
    expect(parentCx).toBe((pairLeft + pairRight) / 2)
  })

  it("reorders a rank with one barycenter pass (D under A, C under B)", () => {
    const nodes = [node("A"), node("B"), node("C"), node("D")]
    const edges: LayoutEdge[] = [
      { from: "A", to: "D" },
      { from: "B", to: "C" },
    ]
    const layout = layoutFlowchart(nodes, edges, "TB", { nodesep: 30, ranksep: 48 })
    const a = byId(layout.nodes, "A")
    const b = byId(layout.nodes, "B")
    const c = byId(layout.nodes, "C")
    const d = byId(layout.nodes, "D")
    expect(c.y).toBe(d.y)
    expect(d.x).toBeLessThan(c.x)
    expect(a.x).toBe(d.x)
    expect(b.x).toBe(c.x)
  })

  it("places a gallery-like back-edge graph without hanging", () => {
    const nodes = [node("a"), node("b"), node("c"), node("d"), node("e")]
    const edges: LayoutEdge[] = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "d" },
      { from: "d", to: "e" },
      { from: "c", to: "b" },
    ]
    const layout = layoutFlowchart(nodes, edges, "LR", { nodesep: 30, ranksep: 48 })
    expect(layout.nodes).toHaveLength(5)
    for (const n of layout.nodes) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
    const a = byId(layout.nodes, "a")
    const b = byId(layout.nodes, "b")
    const c = byId(layout.nodes, "c")
    const d = byId(layout.nodes, "d")
    const e = byId(layout.nodes, "e")
    expect(a.x).toBeLessThan(b.x)
    expect(b.x).toBeLessThan(c.x)
    expect(c.x).toBeLessThan(d.x)
    expect(d.x).toBeLessThan(e.x)
  })

  it("places a disconnected node on rank 0 with the source, in authored order", () => {
    const nodes = [node("A"), node("B"), node("C")]
    const edges: LayoutEdge[] = [{ from: "A", to: "B" }]
    const layout = layoutFlowchart(nodes, edges, "TB", { nodesep: 30, ranksep: 48 })
    const a = byId(layout.nodes, "A")
    const b = byId(layout.nodes, "B")
    const c = byId(layout.nodes, "C")
    expect(c.y).toBe(a.y)
    expect(c.x).toBeGreaterThan(a.x)
    expect(b.y).toBeGreaterThan(a.y)
  })

  it("ignores an edge to a missing endpoint without inventing a node", () => {
    const nodes = [node("A"), node("B")]
    const edges: LayoutEdge[] = [
      { from: "A", to: "B" },
      { from: "B", to: "missing" },
    ]
    expect(() => layoutFlowchart(nodes, edges, "LR")).not.toThrow()
    const layout = layoutFlowchart(nodes, edges, "LR")
    expect(layout.nodes.map((n) => n.id)).toEqual(["A", "B"])
    expect(layout.nodes.some((n) => n.id === "missing")).toBe(false)
  })

  it("flips BT vs TB on y and RL vs LR on x without changing size", () => {
    const nodes: SizedNode[] = [BOX, { id: "B", w: 80, h: 56 }]
    const edges: LayoutEdge[] = [{ from: "A", to: "B" }]
    const tb = layoutFlowchart(nodes, edges, "TB")
    const bt = layoutFlowchart(nodes, edges, "BT")
    expect(bt.width).toBe(tb.width)
    expect(bt.height).toBe(tb.height)
    const tbA = byId(tb.nodes, "A")
    const tbB = byId(tb.nodes, "B")
    const btA = byId(bt.nodes, "A")
    const btB = byId(bt.nodes, "B")
    expect(btA.y).toBe(tb.height - tbA.y - tbA.h)
    expect(btB.y).toBe(tb.height - tbB.y - tbB.h)
    expect(btA.x).toBe(tbA.x)
    expect(btB.x).toBe(tbB.x)

    const lr = layoutFlowchart(nodes, edges, "LR")
    const rl = layoutFlowchart(nodes, edges, "RL")
    expect(rl.width).toBe(lr.width)
    expect(rl.height).toBe(lr.height)
    const lrA = byId(lr.nodes, "A")
    const lrB = byId(lr.nodes, "B")
    const rlA = byId(rl.nodes, "A")
    const rlB = byId(rl.nodes, "B")
    expect(rlA.x).toBe(lr.width - lrA.x - lrA.w)
    expect(rlB.x).toBe(lr.width - lrB.x - lrB.w)
    expect(rlA.y).toBe(lrA.y)
    expect(rlB.y).toBe(lrB.y)
  })
})
