// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { architecture } from "./architecture"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    panel: "#E8E8E8",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const layers = [
  { title: "Presentation", items: ["React", "Tailwind", "shadcn/ui"] },
  { title: "Logic", items: ["Zustand", "React Query"] },
  { title: "Infrastructure", items: ["Docker", "Nginx", "PostgreSQL"] },
]

describe("architecture component", () => {
  it("renders one rect per layer", () => {
    const { container } = svg(
      architecture.render(
        { type: "architecture", layers },
        { x: 80, y: 100, w: 1120 },
        ctx,
      ),
    )
    const rects = container.querySelectorAll("rect")
    expect(rects.length).toBe(3)
    // Each rect should span the full width
    for (const rect of rects) {
      expect(rect.getAttribute("width")).toBe("1120")
    }
  })

  it("renders layer title text with primary fill", () => {
    const { container } = svg(
      architecture.render(
        { type: "architecture", layers },
        { x: 80, y: 100, w: 1120 },
        ctx,
      ),
    )
    const texts = Array.from(container.querySelectorAll("text"))
    const titleTexts = texts.filter(
      (t) => t.getAttribute("fill") === ctx.colors.primary,
    )
    expect(titleTexts.length).toBe(3)
    const titles = titleTexts.map((t) => t.textContent)
    expect(titles).toContain("Presentation")
    expect(titles).toContain("Logic")
    expect(titles).toContain("Infrastructure")
  })

  it("renders items text containing all item strings", () => {
    const { container } = svg(
      architecture.render(
        { type: "architecture", layers },
        { x: 80, y: 100, w: 1120 },
        ctx,
      ),
    )
    const texts = Array.from(container.querySelectorAll("text"))
    const itemTexts = texts.filter(
      (t) => t.getAttribute("fill") === ctx.colors.text,
    )
    // One items text per layer
    expect(itemTexts.length).toBe(3)
    // First layer items joined with separator
    expect(itemTexts[0].textContent).toContain("React")
    expect(itemTexts[0].textContent).toContain("Tailwind")
    expect(itemTexts[0].textContent).toContain("shadcn/ui")
  })

  it("measure returns height proportional to layer count", () => {
    const h2 = architecture.measure(
      { type: "architecture", layers: layers.slice(0, 2) },
      1120,
      ctx,
    )
    const h3 = architecture.measure(
      { type: "architecture", layers },
      1120,
      ctx,
    )
    expect(h3).toBeGreaterThan(h2)
    // 3 layers should be exactly 50% more height than 2 layers
    // measure = n*(72+12) - 12 => 2 layers = 156, 3 layers = 240
    expect(h2).toBe(2 * (72 + 12) - 12)
    expect(h3).toBe(3 * (72 + 12) - 12)
  })

  it("shrinks an overlong layer title to fit the reserved title column", () => {
    const longLayers = [
      {
        title: "第一层：一个远比标题栏位更长的层名用于压力测试",
        items: ["React"],
      },
    ]
    const { container } = svg(
      architecture.render(
        { type: "architecture", layers: longLayers },
        { x: 80, y: 100, w: 1120 },
        ctx,
      ),
    )
    const texts = Array.from(container.querySelectorAll("text"))
    const titleText = texts.find((t) => t.getAttribute("fill") === ctx.colors.primary)!
    const fontSize = Number(titleText.getAttribute("font-size"))
    // Title column is reserved width ITEMS_X(180) - TITLE_X(16) minus padding.
    expect(fontSize).toBeLessThan(18)
    expect(fontSize).toBeGreaterThanOrEqual(10)
  })

  it("shrinks an overlong items line to fit the remaining layer width", () => {
    const longItem =
      "基于 Kubernetes Operator 的 StatefulSet 滚动升级与 PodDisruptionBudget 联动策略 v2.3.1-rc.4 说明"
    const longLayers = [
      { title: "L", items: [longItem, longItem, longItem, longItem] },
    ]
    const { container } = svg(
      architecture.render(
        { type: "architecture", layers: longLayers },
        { x: 80, y: 100, w: 1120 },
        ctx,
      ),
    )
    const texts = Array.from(container.querySelectorAll("text"))
    const itemsText = texts.find((t) => t.getAttribute("fill") === ctx.colors.text)!
    const fontSize = Number(itemsText.getAttribute("font-size"))
    expect(fontSize).toBeLessThan(16)
    expect(fontSize).toBeGreaterThanOrEqual(10)
    // Rendered width (auditor's model) must stay within the layer box.
    const rendered = itemsText.textContent ?? ""
    const units = Array.from(rendered).reduce((sum, ch) => {
      if (/\s/.test(ch)) return sum + 0.35
      if (/[⺀-鿿＀-￯]/.test(ch)) return sum + 1
      if (/[A-Z]/.test(ch)) return sum + 0.66
      if (/[a-z0-9]/.test(ch)) return sum + 0.56
      return sum + 0.46
    }, 0)
    expect(units * fontSize).toBeLessThanOrEqual(1120 - 180 - 6 + 1)
  })

  it("wraps content in a translated group", () => {
    const { container } = svg(
      architecture.render(
        { type: "architecture", layers },
        { x: 80, y: 100, w: 1120 },
        ctx,
      ),
    )
    const g = container.querySelector("g")
    expect(g?.getAttribute("transform")).toBe("translate(80,100)")
  })
})
