// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { timeline } from "./timeline"
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

    // Check that date texts use accent color and title texts use text color
    const dateTexts = Array.from(texts).filter(
      (t) => t.getAttribute("fill") === "#00A878",
    )
    expect(dateTexts.length).toBe(3)
    expect(dateTexts[0].textContent).toBe("2024-01")

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

      it("caps rendered rows to what box.h can hold and marks the drop with data-dropped", () => {
        const box = { x: 0, y: 0, w: 800, h: 300 }
        const { container } = svg(timeline.render(manyComponent, box, ctx))
        const circles = container.querySelectorAll("circle")
        expect(circles.length).toBeGreaterThan(0)
        expect(circles.length).toBeLessThan(manyMilestones.length)

        const dropped = container.querySelector("[data-dropped]")
        expect(dropped).toBeTruthy()
        const hiddenCount = Number(dropped!.getAttribute("data-dropped"))
        expect(hiddenCount + circles.length).toBe(manyMilestones.length)
        expect(dropped!.textContent).toBe(`+${hiddenCount} more`)
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
