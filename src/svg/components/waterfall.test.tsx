// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { waterfall } from "./waterfall"
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

function texts(container: HTMLElement | Element): (string | null)[] {
  return Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
}

const basic = {
  type: "waterfall" as const,
  items: [
    { label: "新签", value: 220 },
    { label: "流失", value: -150 },
    { label: "增购", value: 80 },
  ],
}

describe("waterfall component", () => {
  it("auto-appends a closing Total bar when the last item isn't kind:'total'", () => {
    const { container } = svg(waterfall.render(basic, { x: 0, y: 0, w: 1000, h: 400 }, ctx))
    // 3 authored bars + 1 auto total = 4 rects.
    expect(container.querySelectorAll("rect")).toHaveLength(4)
    const t = texts(container)
    expect(t).toContain("Total")
    // Running total: 220 - 150 + 80 = 150 (unsigned — a total bar shows the
    // absolute value, not a delta).
    expect(t).toContain("150")
  })

  it("does not append an extra bar when the last item is already kind:'total'", () => {
    const withExplicitTotal = {
      type: "waterfall" as const,
      items: [...basic.items, { label: "期末合计", value: 150, kind: "total" as const }],
    }
    const { container } = svg(waterfall.render(withExplicitTotal, { x: 0, y: 0, w: 1000, h: 400 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(4)
    expect(texts(container)).toContain("期末合计")
  })

  it("an explicit mid-sequence total resets the running total to its own declared value", () => {
    const component = {
      type: "waterfall" as const,
      items: [
        { label: "新签", value: 100 },
        { label: "季中盘点", value: 200, kind: "total" as const },
        { label: "流失", value: -50 },
      ],
    }
    const { container } = svg(waterfall.render(component, { x: 0, y: 0, w: 1000, h: 400 }, ctx))
    // 3 authored (one of which is already kind:"total") + 1 auto = 4 rects.
    expect(container.querySelectorAll("rect")).toHaveLength(4)
    const t = texts(container)
    // The checkpoint shows its own declared 200 (not 100, the naive running
    // sum ignoring the reset) — and the auto-total afterward is 200-50=150,
    // continuing from the checkpoint's value, not from 100.
    expect(t).toContain("200")
    expect(t).toContain("150")
    expect(t).toContain("-50")
  })

  it("a deck starting negative — the first bar's own delta already dips below the zero baseline", () => {
    const component = {
      type: "waterfall" as const,
      items: [
        { label: "开局亏损", value: -50 },
        { label: "回补", value: 30 },
        { label: "追加", value: 40 },
      ],
    }
    const { container } = svg(waterfall.render(component, { x: 0, y: 0, w: 1000, h: 400 }, ctx))
    const t = texts(container)
    expect(t).toContain("-50")
    expect(t).toContain("+30")
    expect(t).toContain("+40")
    // Running total: -50+30+40 = 20 — auto total bar shows the recovered
    // positive value even though the deck opened negative.
    expect(t).toContain("20")
  })

  it("an all-falls deck — running total ends up negative, the auto total bar reads negative too", () => {
    const component = {
      type: "waterfall" as const,
      items: [
        { label: "流失一", value: -10 },
        { label: "流失二", value: -20 },
        { label: "流失三", value: -30 },
      ],
    }
    const { container } = svg(waterfall.render(component, { x: 0, y: 0, w: 1000, h: 400 }, ctx))
    const t = texts(container)
    expect(t).toContain("-10")
    expect(t).toContain("-20")
    expect(t).toContain("-30")
    // Running total: -60, shown unsigned (no leading "+") same as any total.
    expect(t).toContain("-60")
    expect(t).not.toContain("+-60")
  })

  it("appends a unit suffix to every value label when `unit` is set", () => {
    const withUnit = { ...basic, unit: "万" }
    const { container } = svg(waterfall.render(withUnit, { x: 0, y: 0, w: 1000, h: 400 }, ctx))
    const t = texts(container)
    expect(t).toContain("+220万")
    expect(t).toContain("-150万")
  })

  it("box.h stretches the plot to fill the given height (no 1.7x cap)", () => {
    const shortRender = svg(waterfall.render(basic, { x: 0, y: 0, w: 1000, h: 420 }, ctx))
    const tallRender = svg(waterfall.render(basic, { x: 0, y: 0, w: 1000, h: 420 * 3 }, ctx))
    const shortBar = shortRender.container.querySelector("rect")!
    const tallBar = tallRender.container.querySelector("rect")!
    const shortH = Number(shortBar.getAttribute("height"))
    const tallH = Number(tallBar.getAttribute("height"))
    expect(tallH).toBeGreaterThan(shortH * 2)
  })

  it("renders the schema-max 8 items without throwing, all fitted within their column", () => {
    const eight = {
      type: "waterfall" as const,
      items: Array.from({ length: 8 }, (_, i) => ({ label: `项目${i}`, value: i % 2 === 0 ? 30 + i : -(10 + i) })),
    }
    const { container } = svg(waterfall.render(eight, { x: 0, y: 0, w: 900, h: 400 }, ctx))
    expect(container.querySelectorAll("rect").length).toBeGreaterThanOrEqual(8)
  })

  it("measure()/render() are deterministic — same input, same output", () => {
    const a = waterfall.measure(basic, 1000, ctx)
    const b = waterfall.measure(basic, 1000, ctx)
    expect(a).toBe(b)
    const markupA = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{waterfall.render(basic, { x: 0, y: 0, w: 1000, h: 400 }, ctx)}</svg>,
    )
    const markupB = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{waterfall.render(basic, { x: 0, y: 0, w: 1000, h: 400 }, ctx)}</svg>,
    )
    expect(markupA).toBe(markupB)
  })

  it("renders only svg2pptx-subset primitives", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{waterfall.render(basic, { x: 0, y: 0, w: 1000, h: 400 }, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })
})
