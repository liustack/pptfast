// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { SvgContent } from "./SvgContent"
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
    chartPalette: ["#006A4E", "#00A878"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

const rect = { x: 80, y: 200, w: 1120, h: 460 }

function renderAE(b: Component[]) {
  return render(
    <svg viewBox="0 0 1280 720">
      <SvgContent
        arrangement="assertion_evidence"
        components={b}
        rect={rect}
        ctx={ctx}
      />
    </svg>,
  )
}

describe("assertion_evidence variant", () => {
  it("renders a chart component as the enlarged evidence (rect/path shapes present)", () => {
    const components: Component[] = [
      { type: "paragraph", text: "补充说明文字。" },
      {
        type: "chart",
        chart_type: "bar",
        series: [{ name: "Q1", data: [{ x: "A", y: 10 }, { x: "B", y: 20 }] }],
      },
    ]
    const { container } = renderAE(components)
    // Chart renders rect elements (bars) — should be present
    const rects = container.querySelectorAll("rect")
    expect(rects.length).toBeGreaterThanOrEqual(1)
    // The chart evidence component should be vertically centred: its g transform
    // y-offset should be greater than rect.y (pushed down to centre).
    const groups = Array.from(container.querySelectorAll("g[transform]"))
    const chartGroup = groups.find((g) => {
      const t = g.getAttribute("transform") ?? ""
      return t.includes("translate")
    })
    expect(chartGroup).toBeTruthy()
    // Supporting paragraph text is still rendered
    expect(container.textContent).toContain("补充说明文字")
  })

  it("picks chart over image when both are present (priority order)", () => {
    const components: Component[] = [
      { type: "image", asset_id: "img1", fit: "contain" },
      {
        type: "chart",
        chart_type: "pie",
        series: [{ name: "S", data: [{ x: "X", y: 50 }, { x: "Y", y: 50 }] }],
      },
    ]
    const { container } = renderAE(components)
    // Chart renders paths (pie slices) — should be present
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBeGreaterThanOrEqual(1)
  })

  it("falls back to normal single-column rendering when no evidence component type exists", () => {
    const components: Component[] = [
      { type: "paragraph", text: "纯文字断言页。" },
      { type: "bullets", items: ["要点一", "要点二"], style: "default" },
    ]
    const { container } = renderAE(components)
    // paragraph + bullets rendered normally
    expect(container.textContent).toContain("纯文字断言页")
    expect(container.textContent).toContain("要点一")
    // bullet markers present
    expect(container.querySelectorAll("circle").length).toBe(2)
  })

  it("renders empty content gracefully when components array is empty", () => {
    const { container } = renderAE([])
    // No crash, no text content
    expect(container.querySelectorAll("text").length).toBe(0)
  })

  it("centres a single chart evidence component vertically in the rect", () => {
    const components: Component[] = [
      {
        type: "chart",
        chart_type: "bar",
        series: [{ name: "Q1", data: [{ x: "A", y: 30 }] }],
      },
    ]
    const { container } = renderAE(components)
    // Chart has CHART_H = 240. Rect h = 460. Expected centred y = 200 + (460-240)/2 = 310.
    const groups = Array.from(container.querySelectorAll("g[transform]"))
    const transforms = groups.map((g) => g.getAttribute("transform") ?? "")
    // At least one translate should have y > rect.y (centred, not top-aligned)
    const yValues = transforms
      .map((t) => {
        const m = t.match(/translate\(\s*[\d.]+\s*,\s*([\d.]+)\s*\)/)
        return m ? parseFloat(m[1]) : null
      })
      .filter((v): v is number => v !== null)
    // The chart should be placed around y=310 (centred)
    const centredY = rect.y + (rect.h - 240) / 2 // 310
    expect(yValues.some((y) => Math.abs(y - centredY) < 1)).toBe(true)
  })
})
