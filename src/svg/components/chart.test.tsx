// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import type { PptxIR } from "@/ir"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { auditSvgMarkup } from "../audit/svg-audit"
import { auditDeck } from "../audit/deck-audit"
import { chart } from "./chart"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E", "#00A878", "#FF6B35", "#FFD166"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const box = { x: 80, y: 100, w: 1120 }

describe("chart component", () => {
  it("measure returns 240", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [{ name: "S1", data: [{ x: "A", y: 10 }] }],
    }
    expect(chart.measure(component, 1120, ctx)).toBe(240)
  })

  it("bar chart renders at least one rect per data point", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [
        {
          name: "Revenue",
          data: [
            { x: "Q1", y: 100 },
            { x: "Q2", y: 200 },
            { x: "Q3", y: 150 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const rects = container.querySelectorAll("rect")
    expect(rects.length).toBeGreaterThanOrEqual(3)
  })

  it("pie chart renders one path per data sector", () => {
    const component = {
      type: "chart" as const,
      chart_type: "pie" as const,
      series: [
        {
          name: "Market",
          data: [
            { x: "A", y: 40 },
            { x: "B", y: 30 },
            { x: "C", y: 20 },
            { x: "D", y: 10 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBe(4)
  })

  it("line chart renders polyline elements", () => {
    const component = {
      type: "chart" as const,
      chart_type: "line" as const,
      series: [
        {
          name: "Trend",
          data: [
            { x: 1, y: 10 },
            { x: 2, y: 30 },
            { x: 3, y: 20 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const polylines = container.querySelectorAll("polyline")
    expect(polylines.length).toBeGreaterThanOrEqual(1)
  })

  it("does not contain nested svg elements", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [
        {
          name: "S1",
          data: [
            { x: "A", y: 10 },
            { x: "B", y: 20 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const nested = container.querySelectorAll("svg svg")
    expect(nested.length).toBe(0)
  })

  it("wraps output in a translated g element", () => {
    const component = {
      type: "chart" as const,
      chart_type: "funnel" as const,
      series: [
        {
          name: "Funnel",
          data: [
            { x: "Step1", y: 100 },
            { x: "Step2", y: 60 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const g = container.querySelector("g")
    expect(g?.getAttribute("transform")).toBe("translate(80,100)")
  })

  it("bar chart renders a muted category label and a value label per bar", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [
        {
          name: "Revenue",
          data: [
            { x: "Q1", y: 100 },
            { x: "Q2", y: 200 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    expect(texts).toHaveLength(4) // 2 bars * (category + value)

    const categories = texts.filter((t) => t.getAttribute("fill") === ctx.colors.muted)
    const values = texts.filter((t) => t.getAttribute("fill") === ctx.colors.text)
    expect(categories.map((t) => t.textContent)).toEqual(["Q1", "Q2"])
    expect(values.map((t) => t.textContent)).toEqual(["100", "200"])
    for (const t of texts) {
      expect(t.getAttribute("text-anchor")).toBe("middle")
    }
  })

  it("bar chart shrinks (fitSvgLine) a category label longer than the bar's width", () => {
    const longLabel = "微服务架构下的分布式事务一致性保障机制与补偿策略".repeat(2).slice(0, 24)
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [{ name: "S1", data: [{ x: longLabel, y: 10 }] }],
    }
    // A single bar spans the whole 1120px box — a 24-char CJK label at the
    // default 11px would be far wider than that, so fitSvgLine must shrink
    // it down to (or truncate it at) the configured minimum font size.
    const { container } = svg(chart.render(component, box, ctx))
    const category = Array.from(container.querySelectorAll("text")).find(
      (t) => t.getAttribute("fill") === ctx.colors.muted,
    )!
    expect(Number(category.getAttribute("font-size"))).toBeLessThanOrEqual(11)
    expect(Number(category.getAttribute("font-size"))).toBeGreaterThanOrEqual(8)
  })

  it("line chart renders a category label per point and value labels only at the endpoints", () => {
    const component = {
      type: "chart" as const,
      chart_type: "line" as const,
      series: [
        {
          name: "Trend",
          data: [
            { x: "Jan", y: 10 },
            { x: "Feb", y: 30 },
            { x: "Mar", y: 20 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    const categories = texts.filter((t) => t.getAttribute("fill") === ctx.colors.muted)
    const values = texts.filter((t) => t.getAttribute("fill") === ctx.colors.text)
    expect(categories.map((t) => t.textContent)).toEqual(["Jan", "Feb", "Mar"])
    expect(values.map((t) => t.textContent)).toEqual(["10", "20"]) // first + last only
  })

  // Task 8: chart.tsx must thread ctx.colors.accent through to the renderer
  // for the gradient/emphasis work in chart-svg.tsx to use the real theme
  // accent (not a stand-in) — see chart-svg.test.tsx for the full behavior.
  it("wires ctx.colors.accent through to the bar renderer's max-bar highlight", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [
        {
          name: "Revenue",
          data: [
            { x: "Q1", y: 100 },
            { x: "Q2", y: 200 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    const maxBar = rects.find((r) => r.getAttribute("fill") === ctx.colors.accent)
    expect(maxBar).toBeTruthy()
  })

  it("wires ctx.colors.accent through to the line renderer's endpoint marker", () => {
    const component = {
      type: "chart" as const,
      chart_type: "line" as const,
      series: [{ name: "Trend", data: [{ x: 1, y: 10 }, { x: 2, y: 30 }] }],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const dot = Array.from(container.querySelectorAll("circle")).find(
      (c) => c.getAttribute("r") === "4",
    )
    expect(dot?.getAttribute("fill")).toBe(ctx.colors.accent)
  })
})

// `component.axes` (x_title/y_title/show_grid — src/ir/index.ts) was
// schema-accepted but never read by this file: a model emitting `axes` got
// silence, discovered during the matrix.tsx y_title work and recorded as a
// dead field. This block makes it real for the applicable chart types
// (bar, including direction="horizontal", and line) and pins that every other
// chart_type (pie, funnel, dumbbell) renders byte-identically whether or not
// `axes` is present — the applicability matrix lives in chart.tsx's own
// `AXES_APPLICABLE_TYPES` doc comment.
describe("chart component — axes (x_title/y_title/show_grid)", () => {
  const barSeries = [
    { name: "Revenue", data: [{ x: "Q1", y: 100 }, { x: "Q2", y: 200 }] },
  ]

  it("measure() grows by a fixed extra amount when x_title is present on an applicable type (bar)", () => {
    const base = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const withTitle = { ...base, axes: { x_title: "Quarter" } }
    const withLongerTitle = { ...base, axes: { x_title: "A Much Longer Quarter Axis Title" } }
    const baseH = chart.measure(base, 1120, ctx)
    const withTitleH = chart.measure(withTitle, 1120, ctx)
    const withLongerTitleH = chart.measure(withLongerTitle, 1120, ctx)
    expect(withTitleH).toBeGreaterThan(baseH)
    // The reserved band is a fixed height, not proportional to title length —
    // fitSvgLine shrinks/truncates the title to fit inside it instead.
    expect(withLongerTitleH).toBe(withTitleH)
  })

  it("measure() does not grow for a stacked y_title alone (it reserves width inside box.w, not height)", () => {
    // CJK, the script that still earns the stacked character column — a
    // Latin y_title takes a horizontal band above the plot instead and does
    // grow measure(), pinned in the "Latin y_title" block below.
    const base = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const withYTitle = { ...base, axes: { y_title: "营业收入" } }
    expect(chart.measure(withYTitle, 1120, ctx)).toBe(chart.measure(base, 1120, ctx))
  })

  it("measure() ignores axes on a non-applicable chart_type (pie)", () => {
    const pieSeries = [{ name: "Market", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }]
    const base = { type: "chart" as const, chart_type: "pie" as const, series: pieSeries }
    const withAxes = { ...base, axes: { x_title: "Segment", y_title: "Share" } }
    expect(chart.measure(withAxes, 1120, ctx)).toBe(chart.measure(base, 1120, ctx))
  })

  it("renders x_title fitted below the plot and y_title stacked beside it, for a bar chart", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { x_title: "Quarter", y_title: "美元" },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    const xTitle = texts.find((t) => t.textContent === "Quarter")
    expect(xTitle).toBeTruthy()
    expect(xTitle?.getAttribute("data-truncated")).toBeNull()

    // y_title is stacked one character per <text> node (matrix.tsx's own
    // vertical-title idiom, adapted) — every character of "美元" must appear.
    const yChars = texts.filter((t) => ["美", "元"].includes(t.textContent ?? ""))
    expect(yChars.length).toBeGreaterThanOrEqual(2)
  })

  it("renders x_title for bar direction=horizontal too (bar-horizontal is AXES_APPLICABLE via chart_type 'bar')", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      direction: "horizontal" as const,
      series: barSeries,
      axes: { x_title: "Amount" },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("Amount")
  })

  it("renders x_title/y_title for a line chart", () => {
    const component = {
      type: "chart" as const,
      chart_type: "line" as const,
      series: [{ name: "Trend", data: [{ x: 1, y: 10 }, { x: 2, y: 30 }] }],
      axes: { x_title: "Month", y_title: "数值" },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("Month")
    expect(texts.filter((t) => ["数", "值"].includes(t ?? "")).length).toBeGreaterThanOrEqual(2)
  })

  // F1 (review round, moderate defect): a line chart's first-point value
  // label could render with its ink flush against the y_title band — a real
  // render measured only ~10px between the y_title's own character center
  // and the plot's x0 (roughly half a glyph-width of true clearance),
  // reproduced by a first point landing near CHART_H's vertical midband
  // (data y:[50,100] — first=50 is exactly half of max=100). Fixed
  // structurally: the plot's x-origin now shifts right by the y_title band
  // width *plus* a dedicated gap, not just the band width alone, so the two
  // regions cannot become geometrically adjacent regardless of content.
  it("reserves a real horizontal gap between the y_title band and the plot — line chart, reviewer's exact repro (low-but-midband first point)", () => {
    const component = {
      type: "chart" as const,
      chart_type: "line" as const,
      series: [{ name: "Trend", data: [{ x: "Jan", y: 50 }, { x: "Feb", y: 100 }] }],
      // CJK: the side band this test is about only exists for a stacked
      // y_title now — a Latin one takes a horizontal band above the plot and
      // has no side gutter to keep clear of anything.
      axes: { y_title: "数值" },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    const yTitleXs = texts
      .filter((t) => ["数", "值"].includes(t.textContent ?? ""))
      .map((t) => Number(t.getAttribute("x")))
    expect(new Set(yTitleXs).size).toBe(1) // all stacked chars share one column x
    const yTitleX = yTitleXs[0]!

    // The first point's own value label ("50", text-anchor="start") sits at
    // the plot's x0 — the tightest point any plotted content ever gets to
    // the y_title band.
    const firstValueLabel = texts.find((t) => t.textContent === "50")!
    const plotX0 = Number(firstValueLabel.getAttribute("x"))

    // A single glyph at AXES_TITLE_SIZE (11px) is at most ~11px wide, so a
    // centered character's own ink never reaches past yTitleX + 5.5px — a
    // >=15px gap from yTitleX to plotX0 leaves real, content-independent
    // clearance rather than a coincidental non-overlap for this one string.
    // (Pre-fix this measured exactly 10px on a real render — this threshold
    // fails against the pre-fix reservation and passes post-fix.)
    expect(plotX0 - yTitleX).toBeGreaterThanOrEqual(15)
  })

  it("x_title-only decks do not gain the y_title gutter — the plot stays flush at box.x (byte-identical to no-axes)", () => {
    const noAxes = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const xTitleOnly = { ...noAxes, axes: { x_title: "Quarter" } }
    const rectsBase = svg(chart.render(noAxes, box, ctx)).container.querySelectorAll("rect")
    const rectsXTitle = svg(chart.render(xTitleOnly, box, ctx)).container.querySelectorAll("rect")
    // Same bar geometry (x/width) in both — the x_title band only adds
    // height below the plot, it must not shift or narrow the plot itself.
    expect(rectsXTitle[0]!.getAttribute("x")).toBe(rectsBase[0]!.getAttribute("x"))
    expect(rectsXTitle[0]!.getAttribute("width")).toBe(rectsBase[0]!.getAttribute("width"))
  })

  it("reserves the same real gap for bar-horizontal's row labels against the y_title band (F1 — verified for bar-horizontal too)", () => {
    const longLabel = "A Very Long Row Label That Forces The Full Fitted Width Budget"
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      direction: "horizontal" as const,
      series: [{ name: "Revenue", data: [{ x: longLabel, y: 100 }, { x: "Short", y: 50 }] }],
      axes: { y_title: "类别" }, // CJK — see the sibling F1 test's own note
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    const yTitleX = Number(
      texts.find((t) => t.textContent === "类" && t.getAttribute("text-anchor") === "middle")!.getAttribute("x"),
    )
    const rowLabel = texts.find((t) => t.getAttribute("font-weight") === "600")!
    expect(rowLabel.getAttribute("data-truncated")).toBe("1") // confirms it hit the full-width fit budget
    // BAR_H_LABEL_W is 110 (chart-svg.tsx) — the label's text-anchor="end"
    // point sits at x0 + 110, so x0 = anchorX - 110 regardless of the gap's
    // value — this infers the real plot x0 the same way the label's own
    // worst-case (maximally fitted) left edge would land on it.
    const anchorX = Number(rowLabel.getAttribute("x"))
    const inferredX0 = anchorX - 110
    expect(inferredX0 - yTitleX).toBeGreaterThanOrEqual(15)
  })

  // 2026-08-20 review ruled Latin words may not be split into a letter
  // column (`component--heatmap--mixed`, `component--matrix--en`). chart.tsx
  // carried the same idiom — the English corpus page rendered its y_title
  // "Connected equipment" as a column of single letters, truncated to a
  // "…" halfway down. It now takes one horizontal line above the plot, the
  // placement charts in Latin-script publications use for a y-axis caption.
  describe("Latin y_title renders horizontally above the plot, never as a letter column", () => {
    const latin = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { x_title: "Quarter", y_title: "Connected equipment" },
    }

    function stackedChars(container: Element) {
      return Array.from(container.querySelectorAll("text")).filter(
        (t) => t.getAttribute("text-anchor") === "middle" && (t.textContent ?? "").length === 1,
      )
    }

    it("renders the whole phrase on one <text>, with no letter split anywhere", () => {
      const { container } = svg(chart.render(latin, box, ctx))
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      expect(texts).toContain("Connected equipment")
      expect(stackedChars(container)).toHaveLength(0)
    })

    it("gives the plot the side gutter back — bars start where they would with no y_title", () => {
      const noYTitle = { ...latin, axes: { x_title: "Quarter" } }
      const barX = (component: typeof latin | typeof noYTitle) =>
        svg(chart.render(component, box, ctx)).container.querySelector("rect")!.getAttribute("x")
      expect(barX(latin)).toBe(barX(noYTitle))
      // ...while a CJK y_title still buys the side band, unchanged.
      const cjk = { ...latin, axes: { x_title: "Quarter", y_title: "设备联网量" } }
      expect(Number(barX(cjk))).toBeGreaterThan(Number(barX(latin)))
    })

    it("measure() grows by the horizontal band — the one case a y_title costs height", () => {
      const noYTitle = { ...latin, axes: { x_title: "Quarter" } }
      expect(chart.measure(latin, 1120, ctx) - chart.measure(noYTitle, 1120, ctx)).toBe(22)
      // Fixed band, not proportional to the title's own length.
      expect(
        chart.measure({ ...latin, axes: { x_title: "Quarter", y_title: "A".repeat(80) } }, 1120, ctx),
      ).toBe(chart.measure(latin, 1120, ctx))
    })

    it("pushes the plot and every band below it down by exactly that band", () => {
      const noYTitle = { ...latin, axes: { x_title: "Quarter" } }
      const bandTop = (component: typeof latin | typeof noYTitle, selector: string) =>
        Number(
          Array.from(svg(chart.render(component, box, ctx)).container.querySelectorAll(selector))
            .map((el) => Number(el.getAttribute("y")))
            .reduce((a, b) => Math.min(a, b)),
        )
      // The bars' own top edge and the x_title's baseline both shift by the
      // band, so nothing below the plot silently overlaps what is above it.
      expect(bandTop(latin, "rect") - bandTop(noYTitle, "rect")).toBe(22)
      const xTitleY = (component: typeof latin | typeof noYTitle) =>
        Number(
          Array.from(svg(chart.render(component, box, ctx)).container.querySelectorAll("text"))
            .find((t) => t.textContent === "Quarter")!
            .getAttribute("y"),
        )
      expect(xTitleY(latin) - xTitleY(noYTitle)).toBe(22)
      // And the y_title's own baseline sits above the plot, not in it.
      const yTitle = Array.from(
        svg(chart.render(latin, box, ctx)).container.querySelectorAll("text"),
      ).find((t) => t.textContent === "Connected equipment")!
      expect(Number(yTitle.getAttribute("y"))).toBeLessThan(bandTop(latin, "rect"))
    })

    it("fits an egregiously long Latin y_title, truncation-marked rather than overflowing", () => {
      const egregious = {
        ...latin,
        axes: { y_title: "Connected equipment across every validated industry setting ".repeat(4) },
      }
      const { container } = svg(chart.render(egregious, box, ctx))
      const yTitle = Array.from(container.querySelectorAll("text")).find((t) =>
        t.textContent?.startsWith("Connected equipment"),
      )!
      expect(yTitle.getAttribute("data-truncated")).toBe("1")
      expect(yTitle.textContent?.endsWith("…")).toBe(true)
    })

    it("still reserves nothing at all on a non-applicable chart_type (pie)", () => {
      const pie = {
        type: "chart" as const,
        chart_type: "pie" as const,
        series: [{ name: "Market", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }],
      }
      expect(chart.measure({ ...pie, axes: { y_title: "Share" } }, 1120, ctx)).toBe(
        chart.measure(pie, 1120, ctx),
      )
    })
  })

  it("does not render axes titles on a non-applicable chart_type (pie) even when axes is set — field is honestly ignored, not silently accepted", () => {
    const pieSeries = [{ name: "Market", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }]
    const component = {
      type: "chart" as const,
      chart_type: "pie" as const,
      series: pieSeries,
      axes: { x_title: "Segment", y_title: "Share", show_grid: true },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).not.toContain("Segment")
    expect(texts).not.toContain("Share")
  })

  it("does not render axes titles for funnel or dumbbell (not AXES_APPLICABLE_TYPES)", () => {
    const funnelComponent = {
      type: "chart" as const,
      chart_type: "funnel" as const,
      series: [{ name: "Funnel", data: [{ x: "Step1", y: 100 }, { x: "Step2", y: 50 }] }],
      axes: { x_title: "Stage", y_title: "Count" },
    }
    const dumbbellComponent = {
      type: "chart" as const,
      chart_type: "dumbbell" as const,
      series: [
        { name: "From", data: [{ x: "A", y: 10 }] },
        { name: "To", data: [{ x: "A", y: 20 }] },
      ],
      axes: { x_title: "Stage", y_title: "Count" },
    }
    for (const component of [funnelComponent, dumbbellComponent]) {
      const { container } = svg(chart.render(component, box, ctx))
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      expect(texts).not.toContain("Stage")
      expect(texts).not.toContain("Count")
    }
  })

  // Round-4 review (`journal p05`): a bar chart draws no gridlines unless the
  // author asks for them. `renderBar`'s own `showGrid` doc comment carries
  // the reasoning — every bar already prints its value, so the reference
  // lines were duplicate ink cutting across the bars.
  it("a bar chart draws no gridlines by default, with or without an axes key", () => {
    const bare = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const withOtherAxes = { ...bare, axes: { x_title: "Quarter" } }
    const withFalse = { ...bare, axes: { show_grid: false } }
    for (const component of [bare, withOtherAxes, withFalse]) {
      expect(svg(chart.render(component, box, ctx)).container.querySelectorAll("line")).toHaveLength(
        0,
      )
    }
  })

  it("show_grid=true opts a bar chart's gridlines back in (a live toggle, not a dead one)", () => {
    const withTrue = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { show_grid: true },
    }
    expect(svg(chart.render(withTrue, box, ctx)).container.querySelectorAll("line")).toHaveLength(3)
  })

  it("a line chart keeps its gridlines by default — only bar lost them", () => {
    const lineComponent = {
      type: "chart" as const,
      chart_type: "line" as const,
      series: barSeries,
    }
    expect(svg(chart.render(lineComponent, box, ctx)).container.querySelectorAll("line")).toHaveLength(
      3,
    )
    const suppressed = { ...lineComponent, axes: { show_grid: false } }
    expect(svg(chart.render(suppressed, box, ctx)).container.querySelectorAll("line")).toHaveLength(0)
  })

  it("show_grid=true renders new vertical gridlines on bar-horizontal (a real opt-in, not a dead toggle)", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      direction: "horizontal" as const,
      series: barSeries,
      axes: { show_grid: true },
    }
    const { container } = svg(chart.render(component, box, ctx))
    expect(container.querySelectorAll("line")).toHaveLength(3)
  })

  it("axes absent renders byte-identical markup to axes explicitly set to an empty object", () => {
    const withoutAxesKey = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const withEmptyAxes = { ...withoutAxesKey, axes: {} }
    const a = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{chart.render(withoutAxesKey, box, ctx)}</svg>,
    )
    const b = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{chart.render(withEmptyAxes, box, ctx)}</svg>,
    )
    expect(a).toBe(b)
    expect(chart.measure(withoutAxesKey, 1120, ctx)).toBe(chart.measure(withEmptyAxes, 1120, ctx))
  })

  it("fits an egregiously long x_title within its declared box instead of overflowing it, truncating with data-truncated (real-render h-overflow oracle)", () => {
    const egregious = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { x_title: "超长坐标轴标题".repeat(12) },
    }
    // A narrow 300px box (vs. the shared 1120px `box`) — 84 CJK chars at
    // fontSize 11 fits comfortably inside 1120px with room to spare, so it
    // wouldn't actually exercise the truncate branch there.
    const narrowBox = { x: 60, y: 200, w: 300 }
    const h = chart.measure(egregious, narrowBox.w, ctx)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <g
          data-audit-box={`${narrowBox.x},${narrowBox.y},${narrowBox.w}`}
          data-audit-rect={`${narrowBox.x},${narrowBox.y},${narrowBox.w},${h}`}
        >
          {chart.render(egregious, narrowBox, ctx)}
        </g>
      </svg>,
    )
    const overflow = auditSvgMarkup(markup).filter((i) => i.kind === "h-overflow" || i.kind === "v-overflow")
    expect(overflow).toEqual([])

    const root = parseSvgRoot(markup)
    const xTitleText = Array.from(root.querySelectorAll("text")).find((t) =>
      t.textContent?.includes("超长坐标轴标题"),
    )
    expect(xTitleText).toBeTruthy()
    expect(xTitleText?.getAttribute("data-truncated")).toBe("1")
  })

  it("caps an egregiously long y_title's stacked-character column within its available height, truncating with data-truncated", () => {
    const egregious = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { y_title: "超长坐标轴标题".repeat(12) },
    }
    const h = chart.measure(egregious, box.w, ctx)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <g data-audit-box={`${box.x},${box.y},${box.w}`} data-audit-rect={`${box.x},${box.y},${box.w},${h}`}>
          {chart.render(egregious, box, ctx)}
        </g>
      </svg>,
    )
    const overflow = auditSvgMarkup(markup).filter((i) => i.kind === "h-overflow" || i.kind === "v-overflow")
    expect(overflow).toEqual([])

    const root = parseSvgRoot(markup)
    const truncatedNodes = Array.from(root.querySelectorAll('text[data-truncated="1"]'))
    expect(truncatedNodes.length).toBeGreaterThanOrEqual(1)
    expect(truncatedNodes.some((t) => t.textContent === "…")).toBe(true)
  })

  it("renders only svg2pptx-subset primitives with axes present", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { x_title: "Quarter", y_title: "USD", show_grid: true },
    }
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{chart.render(component, box, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })
})

// Legend (R1 evidence wave, Task T2 — roadmap §6.1.2's legend model,
// rendering half). `n==1` byte-compat is already proven bit-for-bit by
// chart-svg.golden.test.ts's own "chart component golden markup" describe
// block (measure() stays 240, full render() output unchanged) — these tests
// cover the new n>=2 behavior only: legend swatches/names, name/count
// overflow markers, and the pie/funnel/dumbbell exclusion.
describe("chart component — legend (n>=2 series)", () => {
  // Only chart.tsx itself sets `font-family` on a `<text>` node (x_title/
  // y_title/legend) — chart-svg.tsx's own bar/line/etc. text elements never
  // do (see chart-svg.tsx's text nodes) — so for an axes-free component,
  // every `text[font-family]` is unambiguously legend content.
  function legendTexts(container: HTMLElement): Element[] {
    return Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-family") === ctx.fonts.body,
    )
  }

  const twoSeriesBar = {
    type: "chart" as const,
    chart_type: "bar" as const,
    series: [
      { name: "North America", data: [{ x: "Q1", y: 120 }, { x: "Q2", y: 180 }] },
      { name: "Europe", data: [{ x: "Q1", y: 90 }, { x: "Q2", y: 140 }] },
    ],
  }

  it("measure() grows by a fixed extra amount for a multi-series bar chart (never proportional to series count)", () => {
    const oneSeries = { type: "chart" as const, chart_type: "bar" as const, series: [twoSeriesBar.series[0]!] }
    const fiveSeries = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: Array.from({ length: 5 }, (_, i) => ({ name: `S${i}`, data: [{ x: "A", y: i + 1 }] })),
    }
    const h1 = chart.measure(oneSeries, 1120, ctx)
    const h2 = chart.measure(twoSeriesBar, 1120, ctx)
    const h5 = chart.measure(fiveSeries, 1120, ctx)
    expect(h2).toBeGreaterThan(h1)
    expect(h5).toBe(h2) // fixed band, not proportional to series count
  })

  it("measure() does not grow for a multi-series pie/funnel/dumbbell chart (legend never applies — dispatch untouched)", () => {
    const pie2 = {
      type: "chart" as const,
      chart_type: "pie" as const,
      series: [{ name: "A", data: [{ x: "x", y: 1 }] }, { name: "B", data: [{ x: "y", y: 2 }] }],
    }
    const pie1 = { ...pie2, series: [pie2.series[0]!] }
    expect(chart.measure(pie2, 1120, ctx)).toBe(chart.measure(pie1, 1120, ctx))

    const funnel2 = {
      type: "chart" as const,
      chart_type: "funnel" as const,
      series: [{ name: "A", data: [{ x: "x", y: 1 }] }, { name: "B", data: [{ x: "y", y: 2 }] }],
    }
    const funnel1 = { ...funnel2, series: [funnel2.series[0]!] }
    expect(chart.measure(funnel2, 1120, ctx)).toBe(chart.measure(funnel1, 1120, ctx))

    // dumbbell is *always* exactly 2 series (from/to) by construction — the
    // most direct possible proof that series.length alone never triggers a
    // legend; chart_type applicability (`legendApplicable`) gates it too.
    const dumbbell = {
      type: "chart" as const,
      chart_type: "dumbbell" as const,
      series: [{ name: "From", data: [{ x: "A", y: 10 }] }, { name: "To", data: [{ x: "A", y: 20 }] }],
    }
    expect(chart.measure(dumbbell, 1120, ctx)).toBe(240)
  })

  it("renders one swatch + name per series for a multi-series bar chart", () => {
    const { container } = svg(chart.render(twoSeriesBar, box, ctx))
    const texts = legendTexts(container)
    expect(texts.map((t) => t.textContent)).toEqual(["North America", "Europe"])
    for (const t of texts) {
      expect(t.getAttribute("data-truncated")).toBeNull()
      expect(t.hasAttribute("data-dropped")).toBe(false)
    }
  })

  it("legend swatch colors follow the rotated palette in series order (colorIndex === seriesIndex)", () => {
    const { container } = svg(chart.render(twoSeriesBar, box, ctx))
    const swatches = Array.from(container.querySelectorAll("rect")).filter(
      (r) => Number(r.getAttribute("width")) === 10 && Number(r.getAttribute("height")) === 10,
    )
    expect(swatches).toHaveLength(2)
    expect(swatches[0]!.getAttribute("fill")).toBe(ctx.colors.chartPalette[0])
    expect(swatches[1]!.getAttribute("fill")).toBe(ctx.colors.chartPalette[1])
  })

  it("renders no legend swatches/text for a single-series bar chart (byte-compat boundary)", () => {
    const oneSeries = { type: "chart" as const, chart_type: "bar" as const, series: [twoSeriesBar.series[0]!] }
    const { container } = svg(chart.render(oneSeries, box, ctx))
    expect(legendTexts(container)).toHaveLength(0)
  })

  it("renders no legend for a multi-series pie/funnel/dumbbell chart even though series.length >= 2", () => {
    const pie = {
      type: "chart" as const,
      chart_type: "pie" as const,
      series: [{ name: "A", data: [{ x: "x", y: 1 }] }, { name: "B", data: [{ x: "y", y: 2 }] }],
    }
    const dumbbell = {
      type: "chart" as const,
      chart_type: "dumbbell" as const,
      series: [{ name: "From", data: [{ x: "A", y: 10 }] }, { name: "To", data: [{ x: "A", y: 20 }] }],
    }
    for (const component of [pie, dumbbell]) {
      const { container } = svg(chart.render(component, box, ctx))
      expect(legendTexts(container)).toHaveLength(0)
    }
  })

  it("name overflow: a series name longer than its slot truncates via fitSvgLine, marked data-truncated", () => {
    const longName = "A Very Long Series Name That Overflows The Legend Slot Width Budget Easily"
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [
        { name: longName, data: [{ x: "A", y: 1 }] },
        { name: "Short", data: [{ x: "A", y: 2 }] },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const truncated = legendTexts(container).find((t) => t.getAttribute("data-truncated") === "1")
    expect(truncated).toBeTruthy()
    expect(truncated!.textContent!.length).toBeLessThan(longName.length)
  })

  it("count overflow: more series than fit in one row drop the tail into a '+N …' marker, marked data-dropped", () => {
    const manySeries = Array.from({ length: 12 }, (_, i) => ({
      name: `S${i + 1}`,
      data: [{ x: "A", y: i + 1 }],
    }))
    const component = { type: "chart" as const, chart_type: "bar" as const, series: manySeries }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = legendTexts(container)
    const dropped = texts.find((t) => t.hasAttribute("data-dropped"))
    expect(dropped).toBeTruthy()
    expect(dropped!.textContent).toMatch(/^\+\d+ …$/)
    const droppedCount = Number(dropped!.getAttribute("data-dropped"))
    expect(droppedCount).toBeGreaterThan(0)
    const nameEntries = texts.filter((t) => !t.hasAttribute("data-dropped"))
    expect(nameEntries.length).toBeLessThan(manySeries.length)
    expect(nameEntries.length + droppedCount).toBe(manySeries.length)
  })

  it("audit-visibility: deck-audit reads both the truncated name and the dropped-count marker as content-truncated/content-dropped findings", () => {
    const longName = "A Very Long Series Name That Overflows The Legend Slot Width Budget Easily And Then Some"
    const manySeries = Array.from({ length: 12 }, (_, i) => ({
      name: i === 0 ? longName : `S${i + 1}`,
      data: [{ x: "A", y: i + 1 }],
    }))
    const ir: PptxIR = {
      version: "4",
      filename: "legend-audit-fixture",
      theme: { id: "consulting" },
      meta: {},
      assets: { images: {} },
      slides: [
        {
          type: "content",
          heading: "Legend audit fixture",
          components: [{ type: "chart", chart_type: "bar", series: manySeries }],
        },
      ],
    } as PptxIR
    const report = auditDeck(ir)
    const truncated = report.findings.filter((f) => f.code === "content-truncated")
    const dropped = report.findings.filter((f) => f.code === "content-dropped")
    expect(truncated.length).toBeGreaterThan(0)
    expect(dropped.length).toBeGreaterThan(0)
  })

  it("renders only svg2pptx-subset primitives with a multi-series legend (swatches + truncated name + dropped marker)", () => {
    const manySeries = Array.from({ length: 10 }, (_, i) => ({
      name: `A Fairly Long Series Name Number ${i + 1}`,
      data: [{ x: "A", y: i + 1 }],
    }))
    const component = { type: "chart" as const, chart_type: "bar" as const, series: manySeries }
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{chart.render(component, box, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })
})

describe("chart component — chart-depth subtypes (scatter / area / donut / gauge dispatch)", () => {
  it("dispatches scatter to the point renderer (one circle per numeric point)", () => {
    const component = {
      type: "chart" as const,
      chart_type: "scatter" as const,
      series: [{ name: "S", data: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 1 }] }],
    }
    const { container } = svg(chart.render(component, box, ctx))
    expect(container.querySelectorAll("circle").length).toBe(3)
  })

  it("dispatches area to the filled-line renderer (a polygon fill under the stroke)", () => {
    const component = {
      type: "chart" as const,
      chart_type: "area" as const,
      series: [{ name: "S", data: [{ x: "Q1", y: 10 }, { x: "Q2", y: 20 }] }],
    }
    const { container } = svg(chart.render(component, box, ctx))
    expect(container.querySelectorAll("polygon").length).toBeGreaterThanOrEqual(1)
    expect(container.querySelectorAll("polyline").length).toBeGreaterThanOrEqual(1)
  })

  it("dispatches the dedicated donut subtype to renderDonut, center empty by default", () => {
    const component = {
      type: "chart" as const,
      chart_type: "donut" as const,
      series: [{ name: "S", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }],
    }
    const { container } = svg(chart.render(component, box, ctx))
    // wedges present, no center total text
    expect(container.querySelectorAll("path").length).toBe(2)
    expect(container.querySelectorAll("text").length).toBe(0)
  })

  it("donut center_total: true prints the total through the full render", () => {
    const component = {
      type: "chart" as const,
      chart_type: "donut" as const,
      center_total: true,
      series: [{ name: "S", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }],
    }
    const { container } = svg(chart.render(component, box, ctx))
    expect(Array.from(container.querySelectorAll("text")).map((t) => t.textContent)).toContain("100")
  })

  it("dispatches gauge to the half-ring renderer (track + arc paths and the centered value)", () => {
    const component = {
      type: "chart" as const,
      chart_type: "gauge" as const,
      series: [{ name: "G", data: [{ x: "Completion", y: 62 }] }],
    }
    const { container } = svg(chart.render(component, box, ctx))
    expect(container.querySelectorAll("path").length).toBe(2)
    expect(Array.from(container.querySelectorAll("text")).some((t) => t.textContent === "62")).toBe(true)
  })

  it("scatter and area are axes-applicable: measure() grows for an x_title (like bar/line)", () => {
    for (const chart_type of ["scatter", "area"] as const) {
      const series =
        chart_type === "scatter"
          ? [{ name: "S", data: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }]
          : [{ name: "S", data: [{ x: "Q1", y: 2 }, { x: "Q2", y: 4 }] }]
      const base = { type: "chart" as const, chart_type, series }
      const withTitle = { ...base, axes: { x_title: "Axis" } }
      expect(chart.measure(withTitle, 1120, ctx), chart_type).toBeGreaterThan(chart.measure(base, 1120, ctx))
    }
  })

  it("gauge and donut are NOT axes-applicable: measure() ignores axes (radial, no plot box)", () => {
    const gauge = { type: "chart" as const, chart_type: "gauge" as const, series: [{ name: "G", data: [{ x: "x", y: 5 }] }] }
    const donut = { type: "chart" as const, chart_type: "donut" as const, series: [{ name: "S", data: [{ x: "A", y: 5 }] }] }
    for (const base of [gauge, donut]) {
      const withAxes = { ...base, axes: { x_title: "X", y_title: "Y" } }
      expect(chart.measure(withAxes, 1120, ctx)).toBe(chart.measure(base, 1120, ctx))
    }
  })

  it("a multi-series scatter/area gains a legend; gauge/donut never do", () => {
    const scatter2 = {
      type: "chart" as const,
      chart_type: "scatter" as const,
      series: [
        { name: "Group A", data: [{ x: 1, y: 2 }] },
        { name: "Group B", data: [{ x: 3, y: 4 }] },
      ],
    }
    const area2 = {
      type: "chart" as const,
      chart_type: "area" as const,
      series: [
        { name: "North", data: [{ x: "Q1", y: 2 }, { x: "Q2", y: 4 }] },
        { name: "South", data: [{ x: "Q1", y: 1 }, { x: "Q2", y: 3 }] },
      ],
    }
    const scatter1 = { ...scatter2, series: [scatter2.series[0]!] }
    const area1 = { ...area2, series: [area2.series[0]!] }
    expect(chart.measure(scatter2, 1120, ctx)).toBeGreaterThan(chart.measure(scatter1, 1120, ctx))
    expect(chart.measure(area2, 1120, ctx)).toBeGreaterThan(chart.measure(area1, 1120, ctx))
  })

  it("renders only svg2pptx-subset primitives for every new subtype", () => {
    const components = [
      { type: "chart" as const, chart_type: "scatter" as const, series: [{ name: "S", data: [{ x: 1, y: 2, size: 4 }, { x: 3, y: 8 }] }] },
      { type: "chart" as const, chart_type: "area" as const, series: [{ name: "S", data: [{ x: "Q1", y: 10 }, { x: "Q2", y: -4 }] }] },
      { type: "chart" as const, chart_type: "donut" as const, center_total: true, series: [{ name: "S", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }] },
      { type: "chart" as const, chart_type: "gauge" as const, gauge: { min: 0, max: 200 }, series: [{ name: "G", data: [{ x: "x", y: 150 }] }] },
    ]
    for (const component of components) {
      const markup = renderSvgMarkup(<svg xmlns="http://www.w3.org/2000/svg">{chart.render(component, box, ctx)}</svg>)
      expect(() => assertSubset(parseSvgRoot(markup)), component.chart_type).not.toThrow()
    }
  })
})
