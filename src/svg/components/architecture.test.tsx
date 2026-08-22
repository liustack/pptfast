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
    // Flush layer-stack: n * 64, no inter-layer gap.
    expect(h2).toBe(2 * 64)
    expect(h3).toBe(3 * 64)
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

  // direction (probe evidence-gate byproduct, 2026-07-26): `layers[0]`
  // painting topmost is a documented default, not the only reading —
  // `direction: "bottom_up"` lets a bottom-up-authored ladder (e.g. a
  // maturity model written low-to-high) render right-side up.
  describe("direction", () => {
    it("defaults to top_down: layers[0] paints at y=0 (topmost)", () => {
      const { container } = svg(
        architecture.render({ type: "architecture", layers }, { x: 0, y: 0, w: 1120 }, ctx),
      )
      const rects = Array.from(container.querySelectorAll("rect"))
      expect(rects[0].getAttribute("y")).toBe("0")
      expect(rects[rects.length - 1].getAttribute("y")).toBe(
        String((layers.length - 1) * 64),
      )
    })

    it("explicit direction: 'top_down' is byte-identical to omitting direction", () => {
      const omitted = svg(
        architecture.render({ type: "architecture", layers }, { x: 0, y: 0, w: 1120 }, ctx),
      ).container.innerHTML
      const explicit = svg(
        architecture.render(
          { type: "architecture", layers, direction: "top_down" },
          { x: 0, y: 0, w: 1120 },
          ctx,
        ),
      ).container.innerHTML
      expect(explicit).toBe(omitted)
    })

    it("direction: 'bottom_up' flips the y-order: layers[0] paints at the bottom", () => {
      const { container } = svg(
        architecture.render(
          { type: "architecture", layers, direction: "bottom_up" },
          { x: 0, y: 0, w: 1120 },
          ctx,
        ),
      )
      const rects = Array.from(container.querySelectorAll("rect"))
      // layers[0] ("Presentation") is the first rect emitted (DOM order
      // still follows array order), but its y must now be the bottom-most
      // slot instead of 0.
      expect(rects[0].getAttribute("y")).toBe(String((layers.length - 1) * 64))
      expect(rects[rects.length - 1].getAttribute("y")).toBe("0")
    })

    it("bottom_up still paints every layer, including the tail, with no data-dropped fold", () => {
      const manyLayers = Array.from({ length: 10 }, (_, i) => ({
        title: `Layer ${i}`,
        items: ["x"],
      }))
      const box = { x: 0, y: 0, w: 1120, h: 300 }
      const { container } = svg(
        architecture.render(
          { type: "architecture", layers: manyLayers, direction: "bottom_up" },
          box,
          ctx,
        ),
      )
      const texts = Array.from(container.querySelectorAll("text")).filter(
        (t) => t.getAttribute("fill") === ctx.colors.primary,
      )
      const titles = texts.map((t) => t.textContent)
      expect(titles).toContain("Layer 0")
      expect(titles).toContain("Layer 9")
      expect(container.querySelector("[data-dropped]")).toBeNull()
    })
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

  // Overflow is a validate gate, not a render-time fold. box.h no longer
  // slices layers or stamps data-dropped.
  describe("no render-time fold", () => {
    const manyLayers = Array.from({ length: 8 }, (_, i) => ({
      title: `Layer ${i}`,
      items: ["x"],
    }))
    const manyComponent = { type: "architecture" as const, layers: manyLayers }

    it("paints every layer even when box.h is smaller than the stack, with no data-dropped marker", () => {
      const box = { x: 0, y: 0, w: 1120, h: 120 }
      const { container } = svg(architecture.render(manyComponent, box, ctx))
      const rects = Array.from(container.querySelectorAll("rect"))
      expect(rects.length).toBe(manyLayers.length)
      expect(container.querySelector("[data-dropped]")).toBeNull()
      expect(container.innerHTML).not.toMatch(/\+\d+/)
    })

    it("still renders every layer even when box.h is far smaller than a single layer", () => {
      const box = { x: 0, y: 0, w: 1120, h: 5 }
      const { container } = svg(architecture.render(manyComponent, box, ctx))
      expect(container.querySelectorAll("rect").length).toBe(manyLayers.length)
    })

    it("is a byte-identical no-op when box.h is omitted", () => {
      const withoutH = svg(
        architecture.render({ type: "architecture", layers }, { x: 0, y: 0, w: 1120 }, ctx),
      ).container.innerHTML
      const withGenerousH = svg(
        architecture.render(
          { type: "architecture", layers },
          { x: 0, y: 0, w: 1120, h: 100000 },
          ctx,
        ),
      ).container.innerHTML
      expect(withoutH).toBe(withGenerousH)
      expect(withoutH).not.toContain("data-dropped")
    })

    it("never shows a data-dropped marker when every layer already fits box.h", () => {
      const component = { type: "architecture" as const, layers }
      const measured = architecture.measure(component, 1120, ctx)
      const { container } = svg(
        architecture.render(component, { x: 0, y: 0, w: 1120, h: measured + 40 }, ctx),
      )
      expect(container.querySelector("[data-dropped]")).toBeNull()
    })
  })
})

describe("architecture layer-stack", () => {
  it("labels each row L1, L2, L3 from the left in mono", () => {
    const { container } = svg(
      architecture.render({ type: "architecture", layers }, { x: 0, y: 0, w: 1120 }, ctx),
    )
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toEqual(expect.arrayContaining(["L1", "L2", "L3"]))
    const l1 = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "L1")
    expect(l1?.getAttribute("font-family")).toBe(ctx.fonts.mono)
    expect(Number(l1?.getAttribute("x"))).toBeLessThan(80)
  })

  it("puts the layer title in the middle band and items on the right", () => {
    const { container } = svg(
      architecture.render({ type: "architecture", layers }, { x: 0, y: 0, w: 1120 }, ctx),
    )
    const title = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "Presentation")
    const items = Array.from(container.querySelectorAll("text")).find((t) => t.textContent?.includes("React"))
    expect(title).toBeTruthy()
    expect(items).toBeTruthy()
    expect(Number(title!.getAttribute("x"))).toBeGreaterThan(Number(
      Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "L1")!.getAttribute("x"),
    ))
    expect(Number(items!.getAttribute("x"))).toBeGreaterThan(Number(title!.getAttribute("x")))
  })

  it("draws hairline separators between layers, not a leftover +N marker", () => {
    const { container } = svg(
      architecture.render({ type: "architecture", layers }, { x: 0, y: 0, w: 1120 }, ctx),
    )
    expect(container.querySelectorAll("line").length).toBe(2)
    expect(container.querySelector("[data-dropped]")).toBeNull()
    const markup = container.innerHTML
    expect(markup).not.toMatch(/\+\d+/)
  })
})

