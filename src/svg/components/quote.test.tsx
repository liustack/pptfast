// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { quote } from "./quote"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E", "#00A878"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

describe("quote component", () => {
  const componentNoAttr = { type: "quote" as const, text: "知识就是力量。" }
  const componentWithAttr = {
    type: "quote" as const,
    text: "知识就是力量。",
    attribution: "Francis Bacon",
  }

  it("measure with attribution is greater than without", () => {
    const hNoAttr = quote.measure(componentNoAttr, 1120, ctx)
    const hWithAttr = quote.measure(componentWithAttr, 1120, ctx)
    expect(hNoAttr).toBeGreaterThan(0)
    expect(hWithAttr).toBeGreaterThan(hNoAttr)
  })

  it("renders a translated group with correct transform", () => {
    const { container } = svg(
      quote.render(componentWithAttr, { x: 80, y: 200, w: 1120 }, ctx),
    )
    const g = container.querySelector("g")
    expect(g?.getAttribute("transform")).toBe("translate(80,200)")
  })

  it("renders body text with text color and italic style", () => {
    const { container } = svg(
      quote.render(componentNoAttr, { x: 0, y: 0, w: 1120 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    expect(texts.length).toBeGreaterThanOrEqual(1)

    // Find body text elements (not the decorative quote mark)
    const bodyTexts = Array.from(texts).filter(
      (t) => t.getAttribute("font-style") === "italic",
    )
    expect(bodyTexts.length).toBeGreaterThanOrEqual(1)
    for (const t of bodyTexts) {
      expect(t.getAttribute("fill")).toBe(ctx.colors.text)
      expect(t.getAttribute("font-style")).toBe("italic")
      expect(t.getAttribute("dominant-baseline")).toBe("alphabetic")
    }
  })

  it("renders attribution line with muted color when present", () => {
    const { container } = svg(
      quote.render(componentWithAttr, { x: 0, y: 0, w: 1120 }, ctx),
    )
    const texts = Array.from(container.querySelectorAll("text"))

    // Attribution is the last text element and contains the em-dash prefix
    const attrText = texts.find(
      (t) =>
        t.textContent?.includes("—") &&
        t.getAttribute("fill") === ctx.colors.muted,
    )
    expect(attrText).toBeDefined()
    expect(attrText?.getAttribute("fill")).toBe("#5D6B65")
    expect(attrText?.textContent).toContain("Francis Bacon")
  })
})
