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
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
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

  // P0 hardening (robustness deep-review D1, family-sweep sibling of
  // bullets.tsx): `sources` has no schema ceiling and each source costs a
  // fixed ROW px regardless of content.
  describe("box.h-aware vertical cap (graceful landing)", () => {
    const manySources = Array.from({ length: 200 }, (_, i) => ({ label: `source ${i}` }))
    const manyComponent = { type: "citation" as const, sources: manySources }

    it("caps rendered sources to what box.h can hold and marks the drop with data-dropped", () => {
      const box = { x: 0, y: 0, w: 1120, h: 200 }
      const { container } = svg(citation.render(manyComponent, box, ctx))
      const texts = Array.from(container.querySelectorAll("text"))
      const nonMarker = texts.filter((t) => !t.hasAttribute("data-dropped"))
      expect(nonMarker.length).toBeGreaterThan(0)
      expect(nonMarker.length).toBeLessThan(manySources.length)

      // Review fix (I1, sibling audit): containment now covers every
      // rendered <text>, including the marker — a marker-excluding
      // containment check is exactly what let bullets.tsx's own marker
      // overflow slip through review.
      for (const t of texts) {
        expect(Number(t.getAttribute("y"))).toBeLessThanOrEqual(box.h)
      }

      const dropped = container.querySelector("[data-dropped]")
      expect(dropped).toBeTruthy()
      const hiddenCount = Number(dropped!.getAttribute("data-dropped"))
      expect(hiddenCount + nonMarker.length).toBe(manySources.length)
      expect(dropped!.textContent).toBe(`+${hiddenCount} more`)
    })

    it("still renders at least one source even when box.h is far smaller than a single row", () => {
      const box = { x: 0, y: 0, w: 1120, h: 2 }
      const { container } = svg(citation.render(manyComponent, box, ctx))
      const nonMarker = Array.from(container.querySelectorAll("text")).filter(
        (t) => !t.hasAttribute("data-dropped"),
      )
      expect(nonMarker.length).toBeGreaterThanOrEqual(1)
    })

    it("is a byte-identical no-op when box.h is omitted", () => {
      const withoutH = svg(citation.render(component, { x: 0, y: 0, w: 1120 }, ctx)).container.innerHTML
      const withGenerousH = svg(
        citation.render(component, { x: 0, y: 0, w: 1120, h: 100000 }, ctx),
      ).container.innerHTML
      expect(withoutH).toBe(withGenerousH)
      expect(withoutH).not.toContain("data-dropped")
    })

    it("never shows a data-dropped marker when every source already fits box.h", () => {
      const measured = citation.measure(component, 1120, ctx)
      const { container } = svg(
        citation.render(component, { x: 0, y: 0, w: 1120, h: measured + 40 }, ctx),
      )
      expect(container.querySelector("[data-dropped]")).toBeNull()
    })
  })
})
