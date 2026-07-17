// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { citation } from "./citation"
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
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

describe("citation component", () => {
  const sources = [
    { label: "Wikipedia", url: "https://en.wikipedia.org" },
    { label: "RFC 2119" },
    { label: "MDN Docs", url: "https://developer.mozilla.org", ref: "CSS" },
  ]
  const component = { type: "citation" as const, sources }

  it("measure returns sources count times row height", () => {
    const ROW = 28
    expect(citation.measure(component, 1120, ctx)).toBe(sources.length * ROW)
    // proportional: more sources = taller
    const single = { type: "citation" as const, sources: [sources[0]] }
    expect(citation.measure(single, 1120, ctx)).toBe(1 * ROW)
  })

  it("renders one <text> per source with sequential numbering", () => {
    const { container } = svg(
      citation.render(component, { x: 80, y: 500, w: 1120 }, ctx),
    )
    const g = container.querySelector("g")
    expect(g?.getAttribute("transform")).toBe("translate(80,500)")

    const texts = container.querySelectorAll("text")
    expect(texts.length).toBe(sources.length)

    // check sequential numbering [1], [2], [3]
    expect(texts[0].textContent).toContain("[1]")
    expect(texts[1].textContent).toContain("[2]")
    expect(texts[2].textContent).toContain("[3]")
  })

  it("label text uses ctx.colors.text fill", () => {
    const { container } = svg(
      citation.render(component, { x: 0, y: 0, w: 1120 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    for (const text of texts) {
      expect(text.getAttribute("fill")).toBe(ctx.colors.text)
      expect(text.getAttribute("dominant-baseline")).toBe("alphabetic")
      expect(text.getAttribute("font-family")).toBe(ctx.fonts.body)
    }
  })

  it("source with url contains a tspan with muted color", () => {
    const { container } = svg(
      citation.render(component, { x: 0, y: 0, w: 1120 }, ctx),
    )
    const texts = container.querySelectorAll("text")

    // first source has url
    const tspan0 = texts[0].querySelector("tspan")
    expect(tspan0).not.toBeNull()
    expect(tspan0!.getAttribute("fill")).toBe(ctx.colors.muted)
    expect(tspan0!.textContent).toContain("https://en.wikipedia.org")

    // second source has no url, no tspan
    const tspan1 = texts[1].querySelector("tspan")
    expect(tspan1).toBeNull()

    // third source has url
    const tspan2 = texts[2].querySelector("tspan")
    expect(tspan2).not.toBeNull()
    expect(tspan2!.getAttribute("fill")).toBe(ctx.colors.muted)
  })

  it("shrinks the '[n] label' font-size when it would overflow 60% of the row width", () => {
    const longLabel =
      "非常非常非常非常非常非常非常非常非常非常非常非常长的引用来源标题文字说明超长"
    const narrowComponent = {
      type: "citation" as const,
      sources: [{ label: longLabel }],
    }
    const { container } = svg(
      citation.render(narrowComponent, { x: 0, y: 0, w: 300 }, ctx),
    )
    const text = container.querySelector("text")!
    expect(Number(text.getAttribute("font-size"))).toBeLessThan(18)
  })

  it("truncates the url tspan with an ellipsis when the row is too narrow for label + full url", () => {
    const longUrl = "https://example.com/" + "a".repeat(200)
    const narrowComponent = {
      type: "citation" as const,
      sources: [{ label: "简短标签", url: longUrl }],
    }
    const { container } = svg(
      citation.render(narrowComponent, { x: 0, y: 0, w: 300 }, ctx),
    )
    const tspan = container.querySelector("tspan")!
    expect(tspan.textContent).toMatch(/…$/)
    expect(tspan.textContent!.length).toBeLessThan(longUrl.length)
  })
})
