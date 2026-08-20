// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { auditSvgMarkup } from "../audit/svg-audit"
import { contrastRatio } from "../ink"
import { heatmap } from "./heatmap"
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
  type: "heatmap" as const,
  x_labels: ["Q1", "Q2", "Q3"],
  y_labels: ["North", "South"],
  values: [
    [10, 20, 30],
    [5, 15, 25],
  ],
}

describe("heatmap component", () => {
  it("renders one cell rect per value (rows x cols)", () => {
    const { container } = svg(heatmap.render(basic, { x: 0, y: 0, w: 900, h: 300 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(6)
  })

  it("renders x_labels and y_labels as header text", () => {
    const { container } = svg(heatmap.render(basic, { x: 0, y: 0, w: 900, h: 300 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    for (const label of [...basic.x_labels, ...basic.y_labels]) expect(texts).toContain(label)
  })

  it("higher values map to a more saturated fill (monotonic ramp, single hue toward colors.primary)", () => {
    const { container } = svg(heatmap.render(basic, { x: 0, y: 0, w: 900, h: 300 }, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    // basic.values flattened in row-major order: [10,20,30,5,15,25] — domain
    // defaults to [5,30], so the lowest (5, index 3) and highest (30, index
    // 2) fills must differ, and the highest must sit strictly closer to
    // colors.primary (lower contrast against it) than the lowest.
    const lowFill = rects[3].getAttribute("fill")!
    const highFill = rects[2].getAttribute("fill")!
    expect(lowFill).not.toBe(highFill)
    expect(contrastRatio(highFill, ctx.colors.primary)).toBeLessThan(contrastRatio(lowFill, ctx.colors.primary))
  })

  it("degenerate domain (all values equal) renders every cell the same flat mid-tone fill, no NaN/Infinity", () => {
    const flat = { ...basic, values: [[7, 7, 7], [7, 7, 7]] }
    const { container } = svg(heatmap.render(flat, { x: 0, y: 0, w: 900, h: 300 }, ctx))
    const fills = Array.from(container.querySelectorAll("rect")).map((r) => r.getAttribute("fill"))
    expect(new Set(fills).size).toBe(1)
    for (const f of fills) {
      expect(f).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it("an explicit degenerate domain override (min === max) also renders a flat fill, not a crash", () => {
    const withDomain = { ...basic, domain: { min: 5, max: 5 } }
    expect(() => svg(heatmap.render(withDomain, { x: 0, y: 0, w: 900, h: 300 }, ctx))).not.toThrow()
    const { container } = svg(heatmap.render(withDomain, { x: 0, y: 0, w: 900, h: 300 }, ctx))
    const fills = Array.from(container.querySelectorAll("rect")).map((r) => r.getAttribute("fill"))
    expect(new Set(fills).size).toBe(1)
  })

  it("renders a single-row grid (1 y_label) without throwing", () => {
    const singleRow = { type: "heatmap" as const, x_labels: ["a", "b", "c"], y_labels: ["only"], values: [[1, 2, 3]] }
    const { container } = svg(heatmap.render(singleRow, { x: 0, y: 0, w: 900, h: 200 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(3)
  })

  it("renders a single-column grid (1 x_label) without throwing", () => {
    const singleCol = { type: "heatmap" as const, x_labels: ["only"], y_labels: ["a", "b", "c"], values: [[1], [2], [3]] }
    const { container } = svg(heatmap.render(singleCol, { x: 0, y: 0, w: 900, h: 300 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(3)
  })

  it("renders a single 1x1 cell without throwing", () => {
    const one = { type: "heatmap" as const, x_labels: ["x"], y_labels: ["y"], values: [[42]] }
    const { container } = svg(heatmap.render(one, { x: 0, y: 0, w: 900, h: 200 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(1)
  })

  it("accepts negative values and still produces valid, in-range fills", () => {
    const negative = { ...basic, values: [[-100, -50, 0], [-75, -25, 25]] }
    const { container } = svg(heatmap.render(negative, { x: 0, y: 0, w: 900, h: 300 }, ctx))
    const fills = Array.from(container.querySelectorAll("rect")).map((r) => r.getAttribute("fill"))
    for (const f of fills) expect(f).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  describe("show_values cell ink", () => {
    it("renders no value text when show_values is unset", () => {
      const { container } = svg(heatmap.render(basic, { x: 0, y: 0, w: 900, h: 300 }, ctx))
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      expect(texts).not.toContain("30")
    })

    it("renders one value text per cell when show_values is set", () => {
      const withValues = { ...basic, show_values: true }
      const { container } = svg(heatmap.render(withValues, { x: 0, y: 0, w: 900, h: 300 }, ctx))
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      for (const v of basic.values.flat()) expect(texts).toContain(String(v))
    })

    it("every cell's value text clears 4.5:1 against that cell's own computed fill (accessibleInk, self-painted-surface discipline) across a wide value spread", () => {
      const spread = {
        type: "heatmap" as const,
        x_labels: ["a", "b", "c", "d", "e"],
        y_labels: ["r"],
        values: [[0, 25, 50, 75, 100]],
        show_values: true,
      }
      const { container } = svg(heatmap.render(spread, { x: 0, y: 0, w: 900, h: 200 }, ctx))
      const rects = Array.from(container.querySelectorAll("rect"))
      const valueTexts = Array.from(container.querySelectorAll("text")).filter((t) =>
        ["0", "25", "50", "75", "100"].includes(t.textContent ?? ""),
      )
      expect(valueTexts).toHaveLength(5)
      for (let i = 0; i < valueTexts.length; i++) {
        const fill = rects[i].getAttribute("fill")!
        const ink = valueTexts[i].getAttribute("fill")!
        const fontSize = Number(valueTexts[i].getAttribute("font-size"))
        const ratio = contrastRatio(ink, fill)
        const required = fontSize >= 24 ? 3 : 4.5
        expect(ratio).toBeGreaterThanOrEqual(required)
      }
    })
  })

  describe("x_title/y_title (chart.axes fitting idiom reused)", () => {
    // y_title is CJK here, the one script that still earns the stacked
    // character column — see the "Latin y_title" block below and
    // `lib/text-script.ts` for the rule.
    const withTitles = { ...basic, x_title: "Quarter", y_title: "区域" }

    it("renders x_title and a per-char stacked y_title", () => {
      const { container } = svg(heatmap.render(withTitles, { x: 0, y: 0, w: 900, h: 300 }, ctx))
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      expect(texts.some((t) => t?.includes("Quarter") && t?.includes("→"))).toBe(true)
      expect(texts.filter((t) => "区域".includes(t ?? "\x00")).length).toBeGreaterThanOrEqual(2)
    })

    it("measure() grows when x_title/y_title are present vs absent", () => {
      const withT = heatmap.measure(withTitles, 900, ctx)
      const without = heatmap.measure(basic, 900, ctx)
      expect(withT).toBeGreaterThan(without)
    })

    it("fits an egregiously long x_title within its declared box (real-render h-overflow oracle), truncation-marked", () => {
      const egregious = { ...withTitles, x_title: "超长坐标轴标题".repeat(12) }
      const box = { x: 60, y: 200, w: 560 }
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
          <g data-audit-box={`${box.x},${box.y},${box.w}`}>{heatmap.render(egregious, box, ctx)}</g>
        </svg>,
      )
      const hOverflow = auditSvgMarkup(markup).filter((i) => i.kind === "h-overflow")
      expect(hOverflow).toEqual([])
      const root = parseSvgRoot(markup)
      const xTitleText = Array.from(root.querySelectorAll("text")).find((t) =>
        t.textContent?.includes("超长坐标轴标题"),
      )
      expect(xTitleText?.getAttribute("data-truncated")).toBe("1")
    })
  })

  // 2026-08-20 review, `component--heatmap--mixed`: the mixed-language corpus
  // page's y_title is "Tempo", and it rendered as T/e/m/p/o stacked down the
  // left band — "非常难看", and unreadable as a word. Latin y_titles now take
  // one horizontal line in a band above x_title's instead; CJK keeps the
  // column (the block above pins that half).
  describe("Latin y_title renders horizontally, never as a letter column", () => {
    const reported = { ...basic, x_title: "Q3 第 1 月", y_title: "Tempo" }

    function stackedChars(container: Element) {
      // The character column is the only thing in this component that renders
      // one glyph per centered <text> — column headers are centered too, so
      // match on single-character content as well.
      return Array.from(container.querySelectorAll("text")).filter(
        (t) => t.getAttribute("text-anchor") === "middle" && (t.textContent ?? "").length === 1,
      )
    }

    it("renders the whole word on one <text>, with no character split anywhere", () => {
      const { container } = svg(heatmap.render(reported, { x: 0, y: 0, w: 900, h: 300 }, ctx))
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      expect(texts.some((t) => t?.includes("Tempo"))).toBe(true)
      // Not one of "T"/"e"/"m"/"p"/"o" appears as a standalone text node.
      expect(stackedChars(container).map((t) => t.textContent)).not.toContain("T")
      expect(stackedChars(container).map((t) => t.textContent)).not.toContain("o")
    })

    it("gives the grid the left band back — the row-label column starts at box.x", () => {
      const withLatin = svg(heatmap.render(reported, { x: 40, y: 0, w: 900, h: 300 }, ctx))
      const noYTitle = svg(
        heatmap.render({ ...reported, y_title: undefined }, { x: 40, y: 0, w: 900, h: 300 }, ctx),
      )
      const firstCellX = (r: ReturnType<typeof svg>) =>
        r.container.querySelector("rect")!.getAttribute("x")
      // Horizontal placement costs height, not width: the grid lands exactly
      // where it would with no y_title at all.
      expect(firstCellX(withLatin)).toBe(firstCellX(noYTitle))
    })

    it("keeps the left band for a CJK y_title — the grid shifts right", () => {
      const cjk = { ...reported, y_title: "区域" }
      const withCjk = svg(heatmap.render(cjk, { x: 40, y: 0, w: 900, h: 300 }, ctx))
      const noYTitle = svg(
        heatmap.render({ ...cjk, y_title: undefined }, { x: 40, y: 0, w: 900, h: 300 }, ctx),
      )
      const cellX = (r: ReturnType<typeof svg>) =>
        Number(r.container.querySelector("rect")!.getAttribute("x"))
      expect(cellX(withCjk)).toBeGreaterThan(cellX(noYTitle))
    })

    it("measure() reports the horizontal band it actually renders, and render() stays inside it", () => {
      const box = { x: 0, y: 0, w: 900 }
      const measured = heatmap.measure(reported, box.w, ctx)
      const noYTitle = heatmap.measure({ ...reported, y_title: undefined }, box.w, ctx)
      // The band is a fixed height, so the growth is the band and nothing
      // else — and it does not depend on how long the title is.
      expect(measured - noYTitle).toBe(24)
      expect(heatmap.measure({ ...reported, y_title: "A far longer axis name" }, box.w, ctx)).toBe(
        measured,
      )

      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">{heatmap.render(reported, box, ctx)}</svg>,
      )
      const root = parseSvgRoot(markup)
      const texts = Array.from(root.querySelectorAll("text"))
      const yTitle = texts.find((t) => t.textContent?.includes("Tempo"))!
      const xTitle = texts.find((t) => t.textContent?.includes("Q3 第 1 月"))!
      // The two captions sit in their own bands, y above x — not sharing one
      // line and not overlapping.
      expect(Number(yTitle.getAttribute("y"))).toBeLessThan(Number(xTitle.getAttribute("y")))
      // The grid's own first cell starts below both.
      const firstCellY = Number(root.querySelector("rect")!.getAttribute("y"))
      expect(firstCellY).toBeGreaterThan(Number(xTitle.getAttribute("y")))
    })

    it("fits an egregiously long Latin y_title inside its declared box, truncation-marked", () => {
      const egregious = { ...reported, y_title: "Rolling twelve-month ".repeat(8) }
      const box = { x: 60, y: 200, w: 560 }
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
          <g data-audit-box={`${box.x},${box.y},${box.w}`}>{heatmap.render(egregious, box, ctx)}</g>
        </svg>,
      )
      expect(auditSvgMarkup(markup).filter((i) => i.kind === "h-overflow")).toEqual([])
      const root = parseSvgRoot(markup)
      const yTitleText = Array.from(root.querySelectorAll("text")).find((t) =>
        t.textContent?.includes("Rolling twelve-month"),
      )
      expect(yTitleText?.getAttribute("data-truncated")).toBe("1")
    })

    it("sends a mixed-script y_title horizontal too — no majority vote", () => {
      const mixed = { ...reported, y_title: "K8s 托管" }
      const { container } = svg(heatmap.render(mixed, { x: 0, y: 0, w: 900, h: 300 }, ctx))
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      expect(texts.some((t) => t?.includes("K8s 托管"))).toBe(true)
      expect(stackedChars(container).map((t) => t.textContent)).not.toContain("K")
    })
  })

  it("truncates an over-long column/row label with the data-truncated marker", () => {
    const longLabels = {
      type: "heatmap" as const,
      x_labels: ["一个非常非常非常非常长的列标签名称用于测试截断行为", "b"],
      y_labels: ["一个非常非常非常非常长的行标签名称用于测试截断行为", "b"],
      values: [
        [1, 2],
        [3, 4],
      ],
    }
    const { container } = svg(heatmap.render(longLabels, { x: 0, y: 0, w: 500, h: 300 }, ctx))
    const truncated = Array.from(container.querySelectorAll("text[data-truncated='1']"))
    expect(truncated.length).toBeGreaterThan(0)
  })

  it("box.h stretches row height to fill the given height (no cap, full-body idiom)", () => {
    const natural = heatmap.measure(basic, 900, ctx)
    const shortRender = svg(heatmap.render(basic, { x: 0, y: 0, w: 900, h: natural }, ctx))
    const tallRender = svg(heatmap.render(basic, { x: 0, y: 0, w: 900, h: natural * 3 }, ctx))
    const shortH = Number(shortRender.container.querySelector("rect")!.getAttribute("height"))
    const tallH = Number(tallRender.container.querySelector("rect")!.getAttribute("height"))
    expect(tallH).toBeGreaterThan(shortH * 2)
  })

  it("renders the schema-max 10x10 grid without throwing", () => {
    const big = {
      type: "heatmap" as const,
      x_labels: Array.from({ length: 10 }, (_, i) => `x${i}`),
      y_labels: Array.from({ length: 10 }, (_, i) => `y${i}`),
      values: Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => r * 10 + c)),
      show_values: true,
    }
    const { container } = svg(heatmap.render(big, { x: 0, y: 0, w: 880, h: 400 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(100)
  })

  it("measure()/render() are deterministic — same input, same output", () => {
    const a = heatmap.measure(basic, 900, ctx)
    const b = heatmap.measure(basic, 900, ctx)
    expect(a).toBe(b)
    const markupA = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{heatmap.render(basic, { x: 0, y: 0, w: 900, h: 300 }, ctx)}</svg>,
    )
    const markupB = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{heatmap.render(basic, { x: 0, y: 0, w: 900, h: 300 }, ctx)}</svg>,
    )
    expect(markupA).toBe(markupB)
  })

  it("renders only svg2pptx-subset primitives", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{heatmap.render(basic, { x: 0, y: 0, w: 900, h: 300 }, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })
})
