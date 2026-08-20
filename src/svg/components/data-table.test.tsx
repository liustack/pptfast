// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { contrastRatio } from "../ink"
import { dataTable } from "./data-table"
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
  type: "data_table" as const,
  columns: [
    { key: "metric", label: "Metric" },
    { key: "q1", label: "Q1", align: "right" as const },
  ],
  rows: [
    { cells: { metric: "Revenue", q1: "120" } },
    { cells: { metric: "Costs", q1: "80" } },
  ],
}

describe("data_table component", () => {
  it("renders one header text per column", () => {
    const { container } = svg(dataTable.render(basic, { x: 0, y: 0, w: 900 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("Metric")
    expect(texts).toContain("Q1")
  })

  it("renders one cell text per (row, column) pair", () => {
    const { container } = svg(dataTable.render(basic, { x: 0, y: 0, w: 900 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    for (const t of ["Revenue", "120", "Costs", "80"]) expect(texts).toContain(t)
  })

  describe("align (explicit-only, default left — no content-based heuristic)", () => {
    it("left/unset align renders text-anchor start", () => {
      const { container } = svg(dataTable.render(basic, { x: 0, y: 0, w: 900 }, ctx))
      const metricHeader = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "Metric")
      expect(metricHeader?.getAttribute("text-anchor")).toBe("start")
    })

    it("right align renders text-anchor end", () => {
      const { container } = svg(dataTable.render(basic, { x: 0, y: 0, w: 900 }, ctx))
      const q1Header = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "Q1")
      expect(q1Header?.getAttribute("text-anchor")).toBe("end")
    })

    it("center align renders text-anchor middle", () => {
      const centered = {
        ...basic,
        columns: [{ key: "metric", label: "Metric", align: "center" as const }, basic.columns[1]],
      }
      const { container } = svg(dataTable.render(centered, { x: 0, y: 0, w: 900 }, ctx))
      const metricHeader = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "Metric")
      expect(metricHeader?.getAttribute("text-anchor")).toBe("middle")
    })

    it("a numeric-looking cell value does NOT auto-right-align when align is unset (no invented heuristic)", () => {
      const unaligned = { ...basic, columns: [basic.columns[0], { key: "q1", label: "Q1" }] }
      const { container } = svg(dataTable.render(unaligned, { x: 0, y: 0, w: 900 }, ctx))
      const cell = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "120")
      expect(cell?.getAttribute("text-anchor")).not.toBe("end")
    })
  })

  describe("emphasis rows (highlight/total)", () => {
    const withEmphasis = {
      ...basic,
      rows: [
        { cells: { metric: "Revenue", q1: "120" }, emphasis: "highlight" as const },
        { cells: { metric: "Total", q1: "200" }, emphasis: "total" as const },
        { cells: { metric: "Plain", q1: "0" } },
      ],
    }

    it("a normal row (no emphasis) paints no background rect", () => {
      const { container } = svg(dataTable.render(basic, { x: 0, y: 0, w: 900 }, ctx))
      expect(container.querySelectorAll("rect")).toHaveLength(0)
    })

    it("highlight and total rows each paint exactly one background rect, plain rows none", () => {
      const { container } = svg(dataTable.render(withEmphasis, { x: 0, y: 0, w: 900 }, ctx))
      expect(container.querySelectorAll("rect")).toHaveLength(2)
    })

    it("total row text renders bold, highlight and plain rows do not", () => {
      const { container } = svg(dataTable.render(withEmphasis, { x: 0, y: 0, w: 900 }, ctx))
      const totalCell = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "Total")
      const highlightCell = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "Revenue")
      const plainCell = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "Plain")
      expect(totalCell?.getAttribute("font-weight")).toBe("bold")
      expect(highlightCell?.getAttribute("font-weight")).toBe("normal")
      expect(plainCell?.getAttribute("font-weight")).toBe("normal")
    })

    it("every emphasis-row cell's text clears contrast against that row's own painted fill (self-painted-surface discipline)", () => {
      const { container } = svg(dataTable.render(withEmphasis, { x: 0, y: 0, w: 900 }, ctx))
      const rects = Array.from(container.querySelectorAll("rect"))
      // Two emphasis rows -> two fills: highlight (accent tint) then total (muted tint), paint order.
      const fills = rects.map((r) => r.getAttribute("fill")!)
      const cellTexts = ["Revenue", "120", "Total", "200"]
      for (const label of cellTexts) {
        const el = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === label)
        expect(el).toBeTruthy()
        const ink = el!.getAttribute("fill")!
        const fontSize = Number(el!.getAttribute("font-size"))
        const isHighlightRow = label === "Revenue" || label === "120"
        const fill = isHighlightRow ? fills[0] : fills[1]
        const ratio = contrastRatio(ink, fill)
        const required = fontSize >= 24 ? 3 : 4.5
        expect(ratio).toBeGreaterThanOrEqual(required)
      }
    })
  })

  describe("missing cell keys (lenient contract — renders empty, never throws)", () => {
    it("a row missing a declared column's key renders no text node for that cell", () => {
      const sparse = { ...basic, rows: [{ cells: { metric: "Revenue" } }] }
      expect(() => svg(dataTable.render(sparse, { x: 0, y: 0, w: 900 }, ctx))).not.toThrow()
      const { container } = svg(dataTable.render(sparse, { x: 0, y: 0, w: 900 }, ctx))
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      expect(texts).toContain("Revenue")
      expect(texts).not.toContain("undefined")
    })

    it("a row with completely empty cells renders without throwing", () => {
      const empty = { ...basic, rows: [{ cells: {} }] }
      expect(() => svg(dataTable.render(empty, { x: 0, y: 0, w: 900 }, ctx))).not.toThrow()
    })
  })

  describe("box.h-aware row truncation (comparison.tsx's graceful-landing pattern)", () => {
    const manyRows = {
      ...basic,
      rows: Array.from({ length: 12 }, (_, i) => ({ cells: { metric: `Row ${i}`, q1: String(i) } })),
    }

    it("renders every row and no dropped marker when box.h covers the natural height", () => {
      const natural = dataTable.measure(manyRows, 900, ctx)
      const { container } = svg(dataTable.render(manyRows, { x: 0, y: 0, w: 900, h: natural }, ctx))
      expect(container.querySelectorAll("[data-dropped]")).toHaveLength(0)
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      expect(texts).toContain("Row 11")
    })

    it("truncates rows and renders a data-dropped '+N …' marker when box.h is smaller than natural height", () => {
      const { container } = svg(dataTable.render(manyRows, { x: 0, y: 0, w: 900, h: 150 }, ctx))
      const marker = container.querySelector("[data-dropped]")
      expect(marker).toBeTruthy()
      expect(Number(marker!.getAttribute("data-dropped"))).toBeGreaterThan(0)
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      expect(texts).not.toContain("Row 11")
    })

    it("never drops to zero visible rows even under an extremely tight box.h", () => {
      const { container } = svg(dataTable.render(manyRows, { x: 0, y: 0, w: 900, h: 20 }, ctx))
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      expect(texts).toContain("Row 0")
    })

    it("box.h larger than natural height does not stretch rows (capped = no growth, unlike a full-body component)", () => {
      const natural = dataTable.measure(basic, 900, ctx)
      const { container: shortRender } = svg(dataTable.render(basic, { x: 0, y: 0, w: 900, h: natural }, ctx))
      const { container: tallRender } = svg(dataTable.render(basic, { x: 0, y: 0, w: 900, h: natural * 3 }, ctx))
      const shortLine = shortRender.querySelector("line")!.getAttribute("y1")
      const tallLine = tallRender.querySelector("line")!.getAttribute("y1")
      expect(shortLine).toBe(tallLine)
    })
  })

  describe("measure()", () => {
    it("is a pure, linear function of row count (constant per-row delta, header counted as +1 row)", () => {
      const withRows = (n: number) => ({
        ...basic,
        rows: Array.from({ length: n }, (_, i) => ({ cells: { metric: `r${i}`, q1: String(i) } })),
      })
      const h1 = dataTable.measure(withRows(1), 900, ctx)
      const h2 = dataTable.measure(withRows(2), 900, ctx)
      const h3 = dataTable.measure(withRows(3), 900, ctx)
      expect(h2 - h1).toBe(h3 - h2) // constant per-row delta -> linear in row count
      expect(h2).toBeGreaterThan(h1)
    })

    it("grows when source is present vs absent", () => {
      const withSource = { ...basic, source: "Internal finance system" }
      expect(dataTable.measure(withSource, 900, ctx)).toBeGreaterThan(dataTable.measure(basic, 900, ctx))
    })

    it("is independent of box width (deterministic per row count)", () => {
      expect(dataTable.measure(basic, 400, ctx)).toBe(dataTable.measure(basic, 1200, ctx))
    })
  })

  describe("source footnote", () => {
    it("renders the source text (colors.muted) when present", () => {
      const withSource = { ...basic, source: "Internal finance system, FY26" }
      const { container } = svg(dataTable.render(withSource, { x: 0, y: 0, w: 900 }, ctx))
      const sourceEl = Array.from(container.querySelectorAll("text")).find((t) =>
        t.textContent?.includes("Internal finance system"),
      )
      expect(sourceEl).toBeTruthy()
      expect(sourceEl?.getAttribute("fill")).toBe(ctx.colors.muted)
    })

    it("renders no extra footnote text when source is absent", () => {
      const { container } = svg(dataTable.render(basic, { x: 0, y: 0, w: 900 }, ctx))
      const mutedTexts = Array.from(container.querySelectorAll("text")).filter(
        (t) => t.getAttribute("fill") === ctx.colors.muted,
      )
      expect(mutedTexts).toHaveLength(0)
    })
  })

  it("truncates an over-long header/cell with the data-truncated marker", () => {
    const longContent = {
      type: "data_table" as const,
      columns: [
        { key: "a", label: "一个非常非常非常非常长的列标题名称用于测试截断行为是否生效" },
        { key: "b", label: "B" },
      ],
      rows: [{ cells: { a: "一个非常非常非常非常长的单元格内容用于测试截断行为是否生效", b: "x" } }],
    }
    const { container } = svg(dataTable.render(longContent, { x: 0, y: 0, w: 300 }, ctx))
    const truncated = Array.from(container.querySelectorAll("text[data-truncated='1']"))
    expect(truncated.length).toBeGreaterThan(0)
  })

  it("renders the schema-max shape (8 columns x 12 rows) without throwing", () => {
    const columns = Array.from({ length: 8 }, (_, i) => ({ key: `c${i}`, label: `Col ${i}` }))
    const rows = Array.from({ length: 12 }, (_, r) => ({
      cells: Object.fromEntries(columns.map((c) => [c.key, r])),
    }))
    const big = { type: "data_table" as const, columns, rows }
    expect(() => svg(dataTable.render(big, { x: 0, y: 0, w: 1100 }, ctx))).not.toThrow()
  })

  it("measure()/render() are deterministic — same input, same output", () => {
    const a = dataTable.measure(basic, 900, ctx)
    const b = dataTable.measure(basic, 900, ctx)
    expect(a).toBe(b)
    const markupA = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{dataTable.render(basic, { x: 0, y: 0, w: 900 }, ctx)}</svg>,
    )
    const markupB = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{dataTable.render(basic, { x: 0, y: 0, w: 900 }, ctx)}</svg>,
    )
    expect(markupA).toBe(markupB)
  })

  it("renders only svg2pptx-subset primitives", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{dataTable.render(basic, { x: 0, y: 0, w: 900 }, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })
})
