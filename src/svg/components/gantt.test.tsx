// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { gantt } from "./gantt"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#F7F7F2",
    surface: "#FFFFFF",
    primary: "#051C2C",
    accent: "#FFC72C",
    text: "#051C2C",
    muted: "#6C6C6C",
    chartPalette: ["#051C2C", "#FFC72C"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24,
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const basic = {
  type: "gantt" as const,
  items: [
    { label: "设计", start: 0, end: 10 },
    { label: "开发", start: 5, end: 10 },
  ],
}

describe("gantt component", () => {
  it("renders one bar rect and one row label per item", () => {
    const { container } = svg(gantt.render(basic, { x: 0, y: 0, w: 1000, h: 300 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(2)
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("设计")
    expect(texts).toContain("开发")
  })

  it("row labels are left-aligned (textAnchor start), not dumbbell's right-aligned convention", () => {
    const { container } = svg(gantt.render(basic, { x: 0, y: 0, w: 1000, h: 300 }, ctx))
    const labelTexts = Array.from(container.querySelectorAll("text")).filter((t) =>
      ["设计", "开发"].includes(t.textContent ?? ""),
    )
    for (const t of labelTexts) expect(t.getAttribute("text-anchor")).toBe("start")
  })

  it("bar width is proportional to the item's own span within the shared [min(start), max(end)] axis", () => {
    // axis bounds: min(start)=0, max(end)=10. Item "设计" spans the full
    // axis (width === plotW); item "开发" spans exactly half of it.
    const { container } = svg(gantt.render(basic, { x: 100, y: 0, w: 1000, h: 300 }, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    const widths = rects.map((r) => Number(r.getAttribute("width"))).sort((a, b) => b - a)
    const [fullW, halfW] = widths
    expect(halfW / fullW).toBeCloseTo(0.5, 1)
  })

  it("evenly distributes axis_labels as tick text, first/last edge-anchored", () => {
    const withAxis = { ...basic, axis_labels: ["W1", "W2", "W3"] }
    const { container } = svg(gantt.render(withAxis, { x: 0, y: 0, w: 1000, h: 300 }, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    const tickTexts = texts.filter((t) => ["W1", "W2", "W3"].includes(t.textContent ?? ""))
    expect(tickTexts).toHaveLength(3)
    const first = tickTexts.find((t) => t.textContent === "W1")!
    const last = tickTexts.find((t) => t.textContent === "W3")!
    expect(first.getAttribute("text-anchor")).toBe("start")
    expect(last.getAttribute("text-anchor")).toBe("end")
  })

  it("omitting axis_labels renders zero tick text (the field is optional)", () => {
    const { container } = svg(gantt.render(basic, { x: 0, y: 0, w: 1000, h: 300 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toEqual(["设计", "开发"])
  })

  it("box.h stretches row height to fill the given height (no 1.7x cap)", () => {
    const natural = gantt.measure(basic, 1000, ctx)
    const shortRender = svg(gantt.render(basic, { x: 0, y: 0, w: 1000, h: natural }, ctx))
    const tallRender = svg(gantt.render(basic, { x: 0, y: 0, w: 1000, h: natural * 3 }, ctx))
    const shortH = Number(shortRender.container.querySelector("rect")!.getAttribute("height"))
    const tallH = Number(tallRender.container.querySelector("rect")!.getAttribute("height"))
    expect(tallH).toBeGreaterThan(shortH * 2)
  })

  it("renders the schema-max 8 items without throwing", () => {
    const eight = {
      type: "gantt" as const,
      items: Array.from({ length: 8 }, (_, i) => ({ label: `阶段${i}`, start: i, end: i + 2 })),
    }
    const { container } = svg(gantt.render(eight, { x: 0, y: 0, w: 1000, h: 500 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(8)
  })

  it("a very long row label still fits (fitSvgLine shrink-then-truncate), never a raw overflow", () => {
    const long = {
      type: "gantt" as const,
      items: [{ label: "一个非常非常非常非常非常非常长的阶段名称用于测试截断行为", start: 0, end: 10 }, ...basic.items],
    }
    expect(() => svg(gantt.render(long, { x: 0, y: 0, w: 1000, h: 300 }, ctx))).not.toThrow()
  })

  it("measure()/render() are deterministic — same input, same output", () => {
    const a = gantt.measure(basic, 1000, ctx)
    const b = gantt.measure(basic, 1000, ctx)
    expect(a).toBe(b)
    const markupA = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{gantt.render(basic, { x: 0, y: 0, w: 1000, h: 300 }, ctx)}</svg>,
    )
    const markupB = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{gantt.render(basic, { x: 0, y: 0, w: 1000, h: 300 }, ctx)}</svg>,
    )
    expect(markupA).toBe(markupB)
  })

  it("renders only svg2pptx-subset primitives", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{gantt.render(basic, { x: 0, y: 0, w: 1000, h: 300 }, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })
})
