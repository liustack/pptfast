// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { timeline } from "./timeline"
import type { ComponentCtx } from "./types"
import { contrastRatio } from "../ink"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { resolveStyle } from "../../themes"
import { buildCtx } from "../full-slide-svg"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    border: "#CCCCCC",
    chartPalette: ["#006A4E", "#00A878"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const component = {
  type: "timeline" as const,
  milestones: [
    { date: "2024-01", title: "启动", desc: "项目启动阶段" },
    { date: "2024-06", title: "开发" },
    { date: "2024-12", title: "上线", desc: "正式发布" },
  ],
}

describe("timeline component", () => {
  it("renders main axis line", () => {
    const { container } = svg(
      timeline.render(component, { x: 0, y: 0, w: 1000 }, ctx),
    )
    const line = container.querySelector("line")
    expect(line).not.toBeNull()
    expect(line?.getAttribute("stroke")).toBe("#CCCCCC")
    expect(line?.getAttribute("stroke-width")).toBe("2")
  })

  it("renders 3 circle nodes with primary fill", () => {
    const { container } = svg(
      timeline.render(component, { x: 0, y: 0, w: 1000 }, ctx),
    )
    const circles = container.querySelectorAll("circle")
    expect(circles.length).toBe(3)
    circles.forEach((c) => {
      expect(c.getAttribute("fill")).toBe("#006A4E")
    })
  })

  it("renders date and title text elements with correct fills", () => {
    const { container } = svg(
      timeline.render(component, { x: 80, y: 100, w: 1120 }, ctx),
    )
    const g = container.querySelector("g")
    expect(g?.getAttribute("transform")).toBe("translate(80,100)")

    const texts = container.querySelectorAll("text")
    // 3 dates + 3 titles(单行) + 2 descs(可换行 ≥1 行) ≥ 8 text elements
    expect(texts.length).toBeGreaterThanOrEqual(8)

    // Dates are accent-colored *when the accent is readable on the page*.
    // This ctx's accent (#00A878 on white, ~2.6:1) is not, so `accessibleInk`
    // substitutes a readable ink — the 2026-08-15 visual review found the
    // unsubstituted version rendering date labels at 1.45:1 on consulting,
    // whose accent is a light yellow. The date is content a reader is meant
    // to read, not decoration, so it takes the content floor.
    const dateTexts = Array.from(texts).filter((t) => t.textContent === "2024-01" || t.textContent === "2024-06" || t.textContent === "2024-12")
    expect(dateTexts.length).toBe(3)
    expect(dateTexts[0].getAttribute("fill")).not.toBe("#00A878")
    expect(contrastRatio(dateTexts[0].getAttribute("fill")!, "#FFFFFF")).toBeGreaterThanOrEqual(4.5)

    const titleTexts = Array.from(texts).filter(
      (t) => t.getAttribute("fill") === "#1A2421",
    )
    expect(titleTexts.length).toBeGreaterThanOrEqual(3)
    expect(titleTexts[0].textContent).toBe("启动")
  })

  it("does not contain nested svg elements", () => {
    const { container } = svg(
      timeline.render(component, { x: 0, y: 0, w: 1000 }, ctx),
    )
    // The outer svg is the wrapper we add in the helper. There should be no svg inside the g.
    const innerSvgs = container.querySelectorAll("svg svg")
    expect(innerSvgs.length).toBe(0)
  })

  it("shrinks overlong milestone labels to fit the space between milestones", () => {
    const longTitle = "第一层：一个远比相邻里程碑间距更长的标题用于压力测试"
    const longDesc =
      "基于 Kubernetes Operator 的 StatefulSet 滚动升级与 PodDisruptionBudget 联动策略 v2.3.1-rc.4 说明"
    const longComponent = {
      type: "timeline" as const,
      milestones: [
        { date: "Q1", title: longTitle, desc: longDesc },
        { date: "Q2", title: longTitle, desc: longDesc },
        { date: "Q3", title: longTitle, desc: longDesc },
        { date: "Q4", title: longTitle, desc: longDesc },
        { date: "Q5", title: longTitle, desc: longDesc },
        { date: "Q6", title: longTitle, desc: longDesc },
      ],
    }
    const { container } = svg(
      timeline.render(longComponent, { x: 0, y: 0, w: 1120 }, ctx),
    )
    const texts = Array.from(container.querySelectorAll("text"))
    const titleTexts = texts.filter((t) => t.getAttribute("fill") === "#1A2421")
    const descTexts = texts.filter((t) => t.getAttribute("fill") === "#5D6B65")
    // 2026-07-09 改多行：长标题/描述换行（每 milestone title ≤2 行、desc ≤3 行）
    // 而不是缩到 10px 再省略号——text 元素数超过 milestone 数即证明换行生效
    expect(titleTexts.length).toBeGreaterThan(6)
    expect(descTexts.length).toBeGreaterThan(6)
    expect(titleTexts.length).toBeLessThanOrEqual(12)
    expect(descTexts.length).toBeLessThanOrEqual(18)
  })

  it("measure grows with wrapped lines", () => {
    const h = timeline.measure(component, 1000, ctx)
    expect(h).toBeGreaterThanOrEqual(180)
    expect(h).toBeLessThanOrEqual(320)
  })

  describe("layout: vertical", () => {
    const verticalComponent = {
      type: "timeline" as const,
      layout: "vertical" as const,
      milestones: component.milestones,
    }

    it("renders one row per milestone with a vertical axis line", () => {
      const { container } = svg(
        timeline.render(verticalComponent, { x: 0, y: 0, w: 800 }, ctx),
      )
      expect(container.querySelectorAll("circle").length).toBe(3)
      const line = container.querySelector("line")
      expect(line).not.toBeNull()
      expect(line?.getAttribute("x1")).toBe(line?.getAttribute("x2"))
    })

    // P0 hardening (robustness deep-review D1, family-sweep sibling of
    // bullets.tsx): `milestones` has no schema ceiling, and this layout
    // mode stacks one row per milestone with no cap of its own.
    describe("box.h-aware vertical cap (graceful landing)", () => {
      const manyMilestones = Array.from({ length: 150 }, (_, i) => ({
        date: `Q${i}`,
        title: `Milestone ${i}`,
      }))
      const manyComponent = {
        type: "timeline" as const,
        layout: "vertical" as const,
        milestones: manyMilestones,
      }

      it("caps rendered rows to what box.h can hold and marks the drop with data-dropped, keeping every node and the marker within box.h", () => {
        const box = { x: 0, y: 0, w: 800, h: 300 }
        const { container } = svg(timeline.render(manyComponent, box, ctx))
        const circles = Array.from(container.querySelectorAll("circle"))
        expect(circles.length).toBeGreaterThan(0)
        expect(circles.length).toBeLessThan(manyMilestones.length)

        // Every rendered node's circle stays within box.h.
        for (const c of circles) {
          const cy = Number(c.getAttribute("cy"))
          const r = Number(c.getAttribute("r"))
          expect(cy + r).toBeLessThanOrEqual(box.h)
        }

        const dropped = container.querySelector("[data-dropped]")
        expect(dropped).toBeTruthy()
        const hiddenCount = Number(dropped!.getAttribute("data-dropped"))
        expect(hiddenCount + circles.length).toBe(manyMilestones.length)
        expect((dropped!.textContent ?? "").trim()).toBe("")

        // Review fix (I1, sibling audit): the marker itself must stay
        // inside box.h too — a marker-excluding containment check is
        // exactly what let bullets.tsx's own marker overflow slip through
        // review.
        const markerY = Number(dropped!.getAttribute("y"))
        const markerFontSize = Number(dropped!.getAttribute("font-size"))
        expect(markerY + markerFontSize * 0.25).toBeLessThanOrEqual(box.h)
      })

      it("still renders at least one row even when box.h is far smaller than a single row", () => {
        const box = { x: 0, y: 0, w: 800, h: 5 }
        const { container } = svg(timeline.render(manyComponent, box, ctx))
        expect(container.querySelectorAll("circle").length).toBeGreaterThanOrEqual(1)
      })

      it("is a byte-identical no-op when box.h is omitted", () => {
        const withoutH = svg(
          timeline.render(verticalComponent, { x: 0, y: 0, w: 800 }, ctx),
        ).container.innerHTML
        const withGenerousH = svg(
          timeline.render(verticalComponent, { x: 0, y: 0, w: 800, h: 100000 }, ctx),
        ).container.innerHTML
        expect(withoutH).toBe(withGenerousH)
        expect(withoutH).not.toContain("data-dropped")
      })

      it("never shows a data-dropped marker when every row already fits box.h", () => {
        const measured = timeline.measure(verticalComponent, 800, ctx)
        const { container } = svg(
          timeline.render(verticalComponent, { x: 0, y: 0, w: 800, h: measured + 40 }, ctx),
        )
        expect(container.querySelector("[data-dropped]")).toBeNull()
      })
    })
  })
})

function timelineMarkup(node: React.ReactElement) {
  return renderSvgMarkup(<svg xmlns="http://www.w3.org/2000/svg">{node}</svg>)
}

describe("vert_timeline form", () => {
  const box = { x: 0, y: 0, w: 1088, h: 420 }
  const dated = {
    type: "timeline" as const,
    layout: "horizontal" as const,
    milestones: [
      { date: "2024-01", title: "接传感", desc: "两周布点，电工班只管接电走线。" },
      { date: "2024-06", title: "试运行", desc: "告警只进班组群，误报按周复盘。" },
      { date: "2024-12", title: "全接管", desc: "纸质周报表留档三个月后退役。", highlight: true },
    ],
  }

  it("stage: hairline vertical axis, outline circles, numbers, dates still render", () => {
    const themeCtx = buildCtx(resolveStyle("stage"), {})
    const { container } = svg(timeline.render(dated, box, themeCtx))
    const axis = container.querySelector("line")
    expect(axis).toBeTruthy()
    expect(axis?.getAttribute("x1")).toBe(axis?.getAttribute("x2"))
    expect(Number(axis?.getAttribute("stroke-width"))).toBeLessThanOrEqual(1.5)
    expect(axis?.getAttribute("stroke-dasharray")).toBeNull()
    const circles = Array.from(container.querySelectorAll("circle"))
    expect(circles).toHaveLength(3)
    circles.forEach((c) => {
      expect(c.getAttribute("fill")).toBe(themeCtx.colors.bg)
      expect(c.getAttribute("stroke")).toBeTruthy()
    })
    expect(container.textContent).toContain("2024-01")
    expect(container.textContent).toContain("接传感")
    expect(Array.from(container.querySelectorAll("text")).some((t) => t.textContent === "1")).toBe(true)
  })

  it("assigned themes use vert_timeline even when layout is horizontal", () => {
    const themeCtx = buildCtx(resolveStyle("stage"), {})
    const { container } = svg(timeline.render({ ...dated, layout: "horizontal" }, box, themeCtx))
    const line = container.querySelector("line")
    expect(line?.getAttribute("x1")).toBe(line?.getAttribute("x2"))
    expect(line?.getAttribute("y1")).not.toBe(line?.getAttribute("y2"))
  })

  it("memo: dashed axis, STEP stamp with letterSpacing, Chinese titles have none", () => {
    const themeCtx = buildCtx(resolveStyle("memo"), {})
    const { container } = svg(timeline.render(dated, box, themeCtx))
    const axis = container.querySelector("line")
    expect(axis?.getAttribute("stroke-dasharray")).toBeTruthy()
    const stamps = Array.from(container.querySelectorAll("rect"))
    expect(stamps).toHaveLength(3)
    const stepLabels = Array.from(container.querySelectorAll("text")).filter((t) => t.textContent === "STEP")
    expect(stepLabels).toHaveLength(3)
    stepLabels.forEach((t) => {
      expect(t.getAttribute("letter-spacing")).toBeTruthy()
      expect(t.getAttribute("font-family")).toBe(themeCtx.fonts.mono)
    })
    const zh = Array.from(container.querySelectorAll("text")).filter((t) => t.textContent === "接传感")
    expect(zh[0].getAttribute("letter-spacing")).toBeNull()
  })

  it("classroom: dashed axis, filled number circles, waveFirst under the first title", () => {
    const themeCtx = buildCtx(resolveStyle("classroom"), {})
    const { container } = svg(timeline.render(dated, box, themeCtx))
    const axis = container.querySelector("line")
    expect(axis?.getAttribute("stroke-dasharray")).toBeTruthy()
    const circles = Array.from(container.querySelectorAll("circle"))
    expect(circles).toHaveLength(3)
    expect(circles[0].getAttribute("fill")).toBe(themeCtx.colors.primary)
    const wave = container.querySelector("path")
    expect(wave).toBeTruthy()
    expect(wave?.getAttribute("stroke")).toBe(themeCtx.colors.accent)
    expect(wave?.getAttribute("d") ?? "").toMatch(/[Qq]/)
  })

  it("consulting with no layout stays the horizontal default face", () => {
    const themeCtx = buildCtx(resolveStyle("consulting"), {})
    const { container } = svg(timeline.render(component, box, themeCtx))
    const line = container.querySelector("line")
    expect(line?.getAttribute("y1")).toBe(line?.getAttribute("y2"))
    expect(line?.getAttribute("x1")).not.toBe(line?.getAttribute("x2"))
  })

  it("consulting + layout vertical keeps the existing renderVertical face", () => {
    const themeCtx = buildCtx(resolveStyle("consulting"), {})
    const vertical = { ...component, layout: "vertical" as const }
    const { container } = svg(timeline.render(vertical, { x: 0, y: 0, w: 800 }, themeCtx))
    const circles = Array.from(container.querySelectorAll("circle"))
    expect(circles).toHaveLength(3)
    circles.forEach((c) => {
      expect(c.getAttribute("fill")).toBe(themeCtx.colors.primary)
      expect(c.getAttribute("stroke")).toBeNull()
    })
    expect(container.querySelectorAll("rect")).toHaveLength(0)
    expect(container.textContent).not.toContain("STEP")
  })

  it("consulting (unassigned) markup is byte-identical to the default face", () => {
    const withId = buildCtx(resolveStyle("consulting"), {})
    const withoutId = { ...withId, themeId: undefined }
    expect(timelineMarkup(timeline.render(component, { x: 80, y: 100, w: 1000 }, withId))).toBe(
      timelineMarkup(timeline.render(component, { x: 80, y: 100, w: 1000 }, withoutId)),
    )
  })

  it("n min/max stay in box, subset-safe, and box.h reuses +N overflow", () => {
    const themeCtx = buildCtx(resolveStyle("stage"), {})
    const two = { type: "timeline" as const, milestones: dated.milestones.slice(0, 2) }
    const eight = {
      type: "timeline" as const,
      milestones: Array.from({ length: 8 }, (_, i) => ({
        date: `Q${i}`,
        title: `节点${i}`,
        desc: "说明",
      })),
    }
    for (const ir of [two, eight]) {
      const h = Math.max(timeline.measure(ir, box.w, themeCtx), 420)
      const markup = timelineMarkup(timeline.render(ir, { x: 0, y: 0, w: 1088, h }, themeCtx))
      const root = parseSvgRoot(markup)
      expect(() => assertSubset(root)).not.toThrow()
      for (const c of Array.from(root.querySelectorAll("circle"))) {
        const cy = Number(c.getAttribute("cy"))
        const r = Number(c.getAttribute("r"))
        expect(cy + r).toBeLessThanOrEqual(h + 2)
        expect(cy - r).toBeGreaterThanOrEqual(-2)
      }
    }
    const many = {
      type: "timeline" as const,
      milestones: Array.from({ length: 40 }, (_, i) => ({ date: `Q${i}`, title: `M${i}` })),
    }
    const { container } = svg(timeline.render(many, { x: 0, y: 0, w: 1088, h: 240 }, themeCtx))
    const dropped = container.querySelector("[data-dropped]")
    expect(dropped).toBeTruthy()
    expect((dropped!.textContent ?? "").trim()).toBe("")
  })
})
