// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { comparison } from "./comparison"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    border: "#CCCCCC",
    chartPalette: ["#006A4E"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const component = {
  type: "comparison" as const,
  columns: ["方案A", "方案B"],
  rows: [
    { label: "价格", cells: ["100元", "200元"] },
    { label: "性能", cells: ["快", "慢"] },
    { label: "稳定性", cells: ["高", "中"] },
  ],
}

describe("comparison component", () => {
  // 用户复验（2026-07-08）：表头 surface 填充条在米色/深色页面上都是一块
  // 割裂的色带（所有主题共用本渲染器，全部中招）。改为编辑排版惯例
  // （booktabs）：零填充融入任意主题底色，层级由加粗表头 + 表头下重规则线
  // 表达。
  it("renders no background fills at all (blends into any theme bg)", () => {
    const { container } = svg(
      comparison.render(component, { x: 80, y: 100, w: 1000 }, ctx),
    )
    expect(container.querySelectorAll("rect").length).toBe(0)
  })

  it("sets the header off with a heavier text-colored rule instead of a fill", () => {
    const { container } = svg(
      comparison.render(component, { x: 0, y: 0, w: 1000 }, ctx),
    )
    const lines = Array.from(container.querySelectorAll("line"))
    const headerRule = lines.find((l) => l.getAttribute("y1") === "44")
    expect(headerRule).toBeTruthy()
    expect(headerRule?.getAttribute("stroke")).toBe(ctx.colors.text)
    expect(Number(headerRule?.getAttribute("stroke-width"))).toBeGreaterThanOrEqual(2)
    // 表头上方不再有顶线（旧实现 y=0 有一条）——表头直接坐在页面底色上
    expect(lines.some((l) => l.getAttribute("y1") === "0")).toBe(false)
  })

  it("closes the table with a light bottom rule", () => {
    const { container } = svg(
      comparison.render(component, { x: 0, y: 0, w: 1000 }, ctx),
    )
    const lines = Array.from(container.querySelectorAll("line"))
    const bottomY = String((component.rows.length + 1) * 44)
    const bottom = lines.find((l) => l.getAttribute("y1") === bottomY)
    expect(bottom).toBeTruthy()
    expect(bottom?.getAttribute("stroke")).toBe("#CCCCCC")
    expect(Number(bottom?.getAttribute("stroke-width"))).toBe(1)
  })

  it("renders correct number of text elements for headers and cells", () => {
    const { container } = svg(
      comparison.render(component, { x: 0, y: 0, w: 1000 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    // Headers: 2 visible (first column header is empty so skipped) = 2
    // Data cells: 3 rows * 3 columns (label + 2 cells) = 9
    // Total >= columns.length + rows * (columns.length + 1)
    const minExpected = component.columns.length + component.rows.length * (component.columns.length + 1)
    expect(texts.length).toBeGreaterThanOrEqual(minExpected)
  })

  it("renders separator lines between rows", () => {
    const { container } = svg(
      comparison.render(component, { x: 0, y: 0, w: 1000 }, ctx),
    )
    const lines = container.querySelectorAll("line")
    // 表头规则线 + 数据行间细线 (rows-1) + 收尾底线 = rows+1 条；无顶线。
    expect(lines.length).toBe(component.rows.length + 1)
    // 首线是表头规则线（y=44，正文色重线），行间细线用 border 色
    expect(lines[0].getAttribute("y1")).toBe("44")
    expect(lines[1].getAttribute("stroke")).toBe("#CCCCCC")
  })

  it("measure returns (rows + 1) * 44", () => {
    const h = comparison.measure(component, 1000, ctx)
    expect(h).toBe((component.rows.length + 1) * 44)
  })

  it("allocates wider column to longer text content", () => {
    const wideComponent = {
      type: "comparison" as const,
      columns: ["短", "这是一个非常非常非常非常长的列标题用来测试列宽分配算法"],
      rows: [
        { label: "行", cells: ["A", "这也是超长文本内容用于验证列宽"] },
      ],
    }
    const { container } = svg(
      comparison.render(wideComponent, { x: 0, y: 0, w: 1200 }, ctx),
    )
    // Find header text elements (skip empty first column header)
    const headerTexts = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "bold" && t.getAttribute("font-size") === "18",
    )
    // The second header (long text) should start at a larger x than the first
    // which means the x gap between them indicates column width distribution
    expect(headerTexts.length).toBeGreaterThanOrEqual(2)
    const x0 = Number(headerTexts[0].getAttribute("x"))
    const x1 = Number(headerTexts[1].getAttribute("x"))
    // The gap from col1 start to col2 start (= col1 width) should be smaller
    // than the gap from col2 start to total width (= col2 width)
    const col1Width = x1 - x0
    const col2Width = 1200 - x1
    expect(col2Width).toBeGreaterThan(col1Width)
  })

  it("wraps in a translated group", () => {
    const { container } = svg(
      comparison.render(component, { x: 120, y: 300, w: 800 }, ctx),
    )
    const g = container.querySelector("g")
    expect(g?.getAttribute("transform")).toBe("translate(120,300)")
  })

  it("uses border color from ctx when available", () => {
    const { container } = svg(
      comparison.render(component, { x: 0, y: 0, w: 1000 }, ctx),
    )
    // 首线是表头规则线（正文色）——行间细线从第二条起
    const line = container.querySelectorAll("line")[1]
    expect(line?.getAttribute("stroke")).toBe("#CCCCCC")
  })

  // backlog#5：列头/单元格「对比…」「落后 27…」式截断——先全表统一缩字号
  // （地板 12px），字号到地板仍放不下才截断。
  describe("shrink-before-truncate", () => {
    const longHeaders = {
      type: "comparison" as const,
      columns: ["对比维度总览与说明列表甲", "对比维度总览与说明列表乙"],
      rows: [{ label: "行", cells: ["A", "B"] }],
    }

    it("renders a moderately long header in full at a reduced font size", () => {
      const { container } = svg(
        comparison.render(longHeaders, { x: 0, y: 0, w: 500 }, ctx),
      )
      const headerTexts = Array.from(container.querySelectorAll("text")).filter(
        (t) => t.getAttribute("font-weight") === "bold" && t.textContent?.startsWith("对比"),
      )
      expect(headerTexts.length).toBe(2)
      for (const t of headerTexts) {
        expect(t.textContent).toMatch(/^对比维度总览与说明列表[甲乙]$/)
        expect(t.textContent).not.toContain("…")
        const size = Number(t.getAttribute("font-size"))
        expect(size).toBeLessThan(18)
        expect(size).toBeGreaterThanOrEqual(12)
      }
    })

    it("still truncates at the 12px floor for pathologically long headers", () => {
      const extreme = {
        ...longHeaders,
        columns: [
          "对比维度总览与说明列表甲对比维度总览与说明列表甲对比维度总览与说明列表甲",
          "乙",
        ],
      }
      const { container } = svg(
        comparison.render(extreme, { x: 0, y: 0, w: 500 }, ctx),
      )
      const long = Array.from(container.querySelectorAll("text")).find((t) =>
        t.textContent?.startsWith("对比"),
      )
      expect(long?.textContent).toContain("…")
      expect(long?.getAttribute("font-size")).toBe("12")
    })

    it("renders a moderately long cell in full at a reduced font size", () => {
      const cellComponent = {
        type: "comparison" as const,
        columns: ["方案A", "方案B"],
        rows: [
          { label: "结论", cells: ["落后 27 个百分点且持续扩大中", "领先"] },
        ],
      }
      // 480px 时按权重分到的列宽足够 16px 完整渲染（无需缩）；400px 才真正
      // 触发缩字号路径（fit=15），且缩后仍完整、不出省略号。
      const { container } = svg(
        comparison.render(cellComponent, { x: 0, y: 0, w: 400 }, ctx),
      )
      const cell = Array.from(container.querySelectorAll("text")).find((t) =>
        t.textContent?.startsWith("落后"),
      )
      expect(cell?.textContent).toBe("落后 27 个百分点且持续扩大中")
      const size = Number(cell?.getAttribute("font-size"))
      expect(size).toBeLessThan(16)
      expect(size).toBeGreaterThanOrEqual(12)
    })

    it("keeps default sizes when content is short", () => {
      const { container } = svg(
        comparison.render(component, { x: 0, y: 0, w: 1000 }, ctx),
      )
      const header = Array.from(container.querySelectorAll("text")).find(
        (t) => t.textContent === "方案A",
      )
      const cell = Array.from(container.querySelectorAll("text")).find(
        (t) => t.textContent === "100元",
      )
      expect(header?.getAttribute("font-size")).toBe("18")
      expect(cell?.getAttribute("font-size")).toBe("16")
    })
  })

  it("falls back to muted color when border is not set", () => {
    const noBorderCtx: ComponentCtx = {
      ...ctx,
      colors: { ...ctx.colors, border: undefined },
    }
    const { container } = svg(
      comparison.render(component, { x: 0, y: 0, w: 1000 }, noBorderCtx),
    )
    const line = container.querySelectorAll("line")[1]
    expect(line?.getAttribute("stroke")).toBe("#5D6B65")
  })
})

describe("comparison 首列重复归一化（2026-07-10 无图矩阵真机病型：模型把 label 又抄进 cells[0]）", () => {
  it("全部行 cells[0]===label 且 cells 长度等于 columns 长度时：丢 cells[0]，columns[0] 移作标签列表头", () => {
    const dupComponent = {
      type: "comparison" as const,
      columns: ["维度", "我们", "竞品"],
      rows: [
        { label: "价格", cells: ["价格", "低 15%", "基准"] },
        { label: "性能", cells: ["性能", "提升 30%", "基准"] },
      ],
    }
    const { container } = render(
      <svg>{comparison.render(dupComponent, { x: 80, y: 200, w: 1120 }, ctx)}</svg>,
    )
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    // 「价格」只出现一次（标签列），不再双渲
    expect(texts.filter((t) => t === "价格")).toHaveLength(1)
    expect(texts.filter((t) => t === "性能")).toHaveLength(1)
    // columns[0]「维度」成为标签列表头
    expect(texts).toContain("维度")
    expect(texts).toContain("低 15%")
  })

  it("非全行命中（真实数据巧合）不归一", () => {
    const okComponent = {
      type: "comparison" as const,
      columns: ["项目", "数值"],
      rows: [
        { label: "甲", cells: ["甲", "1"] },
        { label: "乙", cells: ["丙", "2"] },
      ],
    }
    const { container } = render(
      <svg>{comparison.render(okComponent, { x: 80, y: 200, w: 1120 }, ctx)}</svg>,
    )
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts.filter((t) => t === "甲")).toHaveLength(2)
  })

  // P0 hardening (robustness deep-review D1, family-sweep sibling of
  // bullets.tsx): `rows` has no schema ceiling and each row costs a fixed
  // ROW px regardless of content — pre-fix, render() drew every row
  // unconditionally, pushing an extreme row count (D1's repro used 300)
  // arbitrarily far past the canvas.
  describe("box.h-aware vertical cap (graceful landing)", () => {
    const manyRowsComponent = {
      type: "comparison" as const,
      columns: ["A", "B"],
      rows: Array.from({ length: 300 }, (_, i) => ({
        label: `row ${i}`,
        cells: [`cell ${i}a`, `cell ${i}b`],
      })),
    }

    it("caps rendered rows to what box.h can hold and marks the drop with data-dropped, never drawing a rule line past the box", () => {
      const box = { x: 96, y: 176, w: 1088, h: 300 }
      const { container } = render(<svg>{comparison.render(manyRowsComponent, box, ctx)}</svg>)
      // Far fewer than the full 300 rows got rendered.
      const dataRowLabelTexts = Array.from(container.querySelectorAll("text")).filter((t) =>
        (t.textContent ?? "").startsWith("row "),
      )
      expect(dataRowLabelTexts.length).toBeGreaterThan(0)
      expect(dataRowLabelTexts.length).toBeLessThan(manyRowsComponent.rows.length)

      // No rule line (header/separator/bottom) lands past box.h.
      for (const line of Array.from(container.querySelectorAll("line"))) {
        expect(Number(line.getAttribute("y1"))).toBeLessThanOrEqual(box.h)
      }

      const dropped = container.querySelector("[data-dropped]")
      expect(dropped).toBeTruthy()
      const hiddenCount = Number(dropped!.getAttribute("data-dropped"))
      expect(hiddenCount).toBeGreaterThan(0)
      expect(dropped!.textContent).toBe(`+${hiddenCount} more`)
      expect(hiddenCount + dataRowLabelTexts.length).toBe(manyRowsComponent.rows.length)

      // Review fix (I1, sibling audit): the marker itself must stay inside
      // box.h too, not just the rule lines — a marker-excluding containment
      // check is exactly what let bullets.tsx's own marker overflow slip
      // through review.
      const markerY = Number(dropped!.getAttribute("y"))
      const markerFontSize = Number(dropped!.getAttribute("font-size"))
      expect(markerY + markerFontSize * 0.25).toBeLessThanOrEqual(box.h)
    })

    it("still renders at least one row even when box.h is far smaller than a single row's height", () => {
      const box = { x: 0, y: 0, w: 1088, h: 5 }
      const { container } = render(<svg>{comparison.render(manyRowsComponent, box, ctx)}</svg>)
      const dataRowLabelTexts = Array.from(container.querySelectorAll("text")).filter((t) =>
        (t.textContent ?? "").startsWith("row "),
      )
      expect(dataRowLabelTexts.length).toBeGreaterThanOrEqual(1)
    })

    it("is a byte-identical no-op when box.h is omitted (the ordinary/common render path)", () => {
      const withoutH = render(
        <svg>{comparison.render(component, { x: 0, y: 0, w: 1120 }, ctx)}</svg>,
      ).container.innerHTML
      const withGenerousH = render(
        <svg>{comparison.render(component, { x: 0, y: 0, w: 1120, h: 100000 }, ctx)}</svg>,
      ).container.innerHTML
      expect(withoutH).toBe(withGenerousH)
      expect(withoutH).not.toContain("data-dropped")
    })

    it("never shows a data-dropped marker when every row already fits box.h", () => {
      const measured = comparison.measure(component, 1120, ctx)
      const { container } = render(
        <svg>{comparison.render(component, { x: 0, y: 0, w: 1120, h: measured + 40 }, ctx)}</svg>,
      )
      expect(container.querySelector("[data-dropped]")).toBeNull()
    })
  })
})
