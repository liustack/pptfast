// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { comparison } from "./comparison"
import type { ComponentCtx } from "./types"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { resolveStyle } from "../../themes"
import { buildCtx } from "../full-slide-svg"
import { readableOn } from "../ink"

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
      expect((dropped!.textContent ?? "").trim()).toBe("")
      expect(hiddenCount + dataRowLabelTexts.length).toBe(manyRowsComponent.rows.length)
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

describe("comparison 空首列表头归一化（2026-08-19 gallery 重渲：20 页表头整排右移一列）", () => {
  // 作者在 columns 里替标签列先塞了一个空表头，于是表头比数据列多出一格。
  // 归一化之前「冶金」压在「华东」那一列上，第一列数据头顶没有表头，
  // 「风电」悬在一个没有数据的第五列。
  const blankLeadComponent = {
    type: "comparison" as const,
    columns: ["", "冶金", "化工", "风电"],
    rows: [
      { label: "华东", cells: ["第一季度", "增长 12%", "第二季度"] },
      { label: "华南", cells: ["第三季度", "持平", "第四季度"] },
    ],
  }

  const xByText = (container: HTMLElement) => {
    const map = new Map<string, number>()
    for (const t of Array.from(container.querySelectorAll("text"))) {
      map.set(t.textContent ?? "", Number(t.getAttribute("x")))
    }
    return map
  }

  it("丢掉空的首个表头，每个表头回到自己那一列数据的正上方", () => {
    const { container } = render(
      <svg>{comparison.render(blankLeadComponent, { x: 96, y: 176, w: 1088 }, ctx)}</svg>,
    )
    const x = xByText(container)
    expect(x.get("冶金")).toBe(x.get("第一季度"))
    expect(x.get("化工")).toBe(x.get("增长 12%"))
    expect(x.get("风电")).toBe(x.get("第二季度"))
    // 最后一个表头不再悬在没有数据的空列上：它的 x 不超过最右一列数据
    expect(x.get("风电")!).toBeLessThanOrEqual(x.get("第四季度")!)
  })

  it("cells 与 columns 等长时不归一（作者真要的空表头，本来就对齐）", () => {
    const intentionalBlank = {
      type: "comparison" as const,
      columns: ["", "我们", "竞品"],
      rows: [{ label: "价格", cells: ["基准", "低 15%", "高 4%"] }],
    }
    const { container } = render(
      <svg>{comparison.render(intentionalBlank, { x: 0, y: 0, w: 1088 }, ctx)}</svg>,
    )
    const x = xByText(container)
    // 三列数据全部画出，表头压在后两列上
    expect(x.get("基准")).toBeDefined()
    expect(x.get("我们")).toBe(x.get("低 15%"))
    expect(x.get("竞品")).toBe(x.get("高 4%"))
  })

  it("两种笔误叠在一起时先丢空表头，再走首列重复归一化", () => {
    const both = {
      type: "comparison" as const,
      columns: ["", "维度", "我们", "竞品"],
      rows: [
        { label: "价格", cells: ["价格", "低 15%", "基准"] },
        { label: "性能", cells: ["性能", "提升 30%", "基准"] },
      ],
    }
    const { container } = render(
      <svg>{comparison.render(both, { x: 0, y: 0, w: 1120 }, ctx)}</svg>,
    )
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts.filter((t) => t === "价格")).toHaveLength(1)
    const x = xByText(container)
    expect(x.get("维度")).toBe(x.get("价格"))
    expect(x.get("我们")).toBe(x.get("低 15%"))
  })
})

function formMarkup(node: React.ReactElement) {
  return renderSvgMarkup(<svg xmlns="http://www.w3.org/2000/svg">{node}</svg>)
}

function assertRectImageInBox(root: Element, box: { w: number; h: number }) {
  const slack = 2
  for (const el of Array.from(root.querySelectorAll("rect, image"))) {
    const x = Number(el.getAttribute("x") ?? 0)
    const y = Number(el.getAttribute("y") ?? 0)
    const w = Number(el.getAttribute("width") ?? 0)
    const h = Number(el.getAttribute("height") ?? 0)
    expect(x).toBeGreaterThanOrEqual(-slack)
    expect(y).toBeGreaterThanOrEqual(-slack)
    expect(x + w).toBeLessThanOrEqual(box.w + slack)
    expect(y + h).toBeLessThanOrEqual(box.h + slack)
  }
}

describe("pill_panels form", () => {
  const box = { x: 0, y: 0, w: 1088, h: 420 }
  const twoCol = {
    type: "comparison" as const,
    columns: ["稳妥线：单线试点", "进取线：全线并行"],
    rows: [
      { label: "节奏", cells: ["先押一家客户，九十天出对照数据", "三条线同月接入，共享一套模型底座"] },
      { label: "代价", cells: ["慢一个季度，但每一步都有数", "前期投入翻倍，回本提前两个月"] },
    ],
  }

  it("consulting: one pill per columns[] entry, pill sits on the frame top edge, first accent then primary", () => {
    const themeCtx = buildCtx(resolveStyle("consulting"), {})
    const { container } = svg(comparison.render(twoCol, box, themeCtx))
    const frames = Array.from(container.querySelectorAll("rect")).filter((r) => r.getAttribute("stroke-dasharray"))
    const pills = Array.from(container.querySelectorAll("rect")).filter((r) => {
      const fill = r.getAttribute("fill")
      return fill === themeCtx.colors.accent || fill === themeCtx.colors.primary
    })
    expect(pills).toHaveLength(2)
    expect(frames).toHaveLength(2)
    expect(pills[0].getAttribute("fill")).toBe(themeCtx.colors.accent)
    expect(pills[1].getAttribute("fill")).toBe(themeCtx.colors.primary)
    pills.forEach((pill, i) => {
      const py = Number(pill.getAttribute("y"))
      const ph = Number(pill.getAttribute("height"))
      const fy = Number(frames[i].getAttribute("y"))
      expect(py).toBeLessThan(fy)
      expect(py + ph).toBeGreaterThan(fy)
      expect(Number(pill.getAttribute("rx"))).toBe(themeCtx.shape?.radius ?? 2)
    })
    const title0 = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === twoCol.columns[0])
    expect(title0?.getAttribute("fill")).toBe(readableOn(themeCtx.colors.accent))
    expect(container.textContent).toContain("先押一家客户，九十天出对照数据")
    expect(container.textContent).toContain("节奏")
  })

  it("vermilion: solid frames, accent-all pills, L corner marks in accent", () => {
    const themeCtx = buildCtx(resolveStyle("vermilion"), {})
    const { container } = svg(comparison.render(twoCol, box, themeCtx))
    const pills = Array.from(container.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("fill") === themeCtx.colors.accent,
    )
    expect(pills).toHaveLength(2)
    const frames = Array.from(container.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("fill") === themeCtx.colors.surface,
    )
    expect(frames.length).toBeGreaterThanOrEqual(2)
    frames.forEach((f) => {
      expect(f.getAttribute("stroke")).toBe(themeCtx.colors.border)
      expect(f.getAttribute("stroke-dasharray")).toBeNull()
    })
    const marks = Array.from(container.querySelectorAll("path")).filter(
      (p) => p.getAttribute("stroke") === themeCtx.colors.accent,
    )
    expect(marks.length).toBeGreaterThanOrEqual(2)
    expect(marks[0].getAttribute("d") ?? "").toMatch(/L /)
    pills.forEach((p) => {
      expect(Number(p.getAttribute("rx"))).toBe(themeCtx.shape?.radius ?? 2)
    })
  })

  it("ember: no frame stroke, soft pill radius, accent-all fill from tokens", () => {
    const themeCtx = buildCtx(resolveStyle("ember"), {})
    const { container } = svg(comparison.render(twoCol, box, themeCtx))
    const pills = Array.from(container.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("fill") === themeCtx.colors.accent,
    )
    expect(pills).toHaveLength(2)
    pills.forEach((p) => {
      expect(Number(p.getAttribute("rx"))).toBe(themeCtx.shape?.radius ?? 10)
    })
    const frames = Array.from(container.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("fill") === themeCtx.colors.surface,
    )
    frames.forEach((f) => {
      expect(f.getAttribute("stroke")).toBeNull()
      expect(f.getAttribute("stroke-dasharray")).toBeNull()
    })
  })

  it("3+ columns stay a single row of panels sharing box.w", () => {
    const three = {
      type: "comparison" as const,
      columns: ["甲", "乙", "丙"],
      rows: [{ label: "项", cells: ["一", "二", "三"] }],
    }
    const themeCtx = buildCtx(resolveStyle("consulting"), {})
    const { container } = svg(comparison.render(three, box, themeCtx))
    const frames = Array.from(container.querySelectorAll("rect")).filter((r) => r.getAttribute("stroke-dasharray"))
    expect(frames).toHaveLength(3)
    const xs = frames.map((f) => Number(f.getAttribute("x"))).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(0, 0)
    const last = frames.reduce((a, b) =>
      Number(a.getAttribute("x")) > Number(b.getAttribute("x")) ? a : b,
    )
    expect(Number(last.getAttribute("x")) + Number(last.getAttribute("width"))).toBeCloseTo(box.w, 0)
    frames.forEach((f) => expect(Number(f.getAttribute("y"))).toBe(Number(frames[0].getAttribute("y"))))
  })

  it("tech (unassigned contrast) markup is byte-identical to the default face", () => {
    const withId = buildCtx(resolveStyle("tech"), {})
    const withoutId = { ...withId, themeId: undefined }
    expect(formMarkup(comparison.render(component, { x: 80, y: 100, w: 1000 }, withId))).toBe(
      formMarkup(comparison.render(component, { x: 80, y: 100, w: 1000 }, withoutId)),
    )
  })

  it("n=1 and n=4 panels stay inside the box, and the tree is subset-safe", () => {
    const themeCtx = buildCtx(resolveStyle("consulting"), {})
    for (const cols of [["只一列"], ["A", "B", "C", "D"]]) {
      const ir = {
        type: "comparison" as const,
        columns: cols,
        rows: [{ label: "行", cells: cols.map((_, i) => `cell${i}`) }],
      }
      const node = comparison.render(ir, box, themeCtx)
      const markup = formMarkup(node)
      const root = parseSvgRoot(markup)
      expect(() => assertSubset(root)).not.toThrow()
      assertRectImageInBox(root, box)
    }
  })

  it("box.h truncates body rows and marks the drop with data-dropped", () => {
    const many = {
      type: "comparison" as const,
      columns: ["甲", "乙"],
      rows: Array.from({ length: 20 }, (_, i) => ({
        label: `row ${i}`,
        cells: [`a${i}`, `b${i}`],
      })),
    }
    const themeCtx = buildCtx(resolveStyle("consulting"), {})
    const tight = { x: 0, y: 0, w: 1088, h: 220 }
    const { container } = svg(comparison.render(many, tight, themeCtx))
    const labels = Array.from(container.querySelectorAll("text")).filter((t) =>
      (t.textContent ?? "").startsWith("row "),
    )
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.length).toBeLessThan(20)
    const dropped = container.querySelector("[data-dropped]")
    expect(dropped).toBeTruthy()
    expect((dropped!.textContent ?? "").trim()).toBe("")
  })
})
