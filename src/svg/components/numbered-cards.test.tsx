// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { numberedCards } from "./numbered-cards"
import type { ComponentCtx } from "./types"
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
    chartPalette: ["#006A4E", "#00A878"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24,
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

function cards(n: number, extra?: { text?: string; sub?: string }) {
  return {
    type: "numbered_cards" as const,
    items: Array.from({ length: n }, (_, i) => ({
      title: `要点${i + 1}`,
      text: extra?.text,
      sub: extra?.sub,
    })),
  }
}

const four = cards(4)

function themeCtx(id: string): ComponentCtx {
  return buildCtx(resolveStyle(id), {})
}

function markupOf(component: Parameters<typeof numberedCards.render>[0], box: { x: number; y: number; w: number; h?: number }, c: ComponentCtx) {
  return renderToStaticMarkup(<svg>{numberedCards.render(component, box, c)}</svg>)
}

function pillRects(container: HTMLElement) {
  return Array.from(container.querySelectorAll("rect")).filter((r) => {
    const w = Number(r.getAttribute("width"))
    const h = Number(r.getAttribute("height"))
    return w > h * 1.6
  })
}

function assertInsideBox(container: HTMLElement, w: number, h: number, slop = 2) {
  for (const c of Array.from(container.querySelectorAll("circle"))) {
    const cx = Number(c.getAttribute("cx"))
    const cy = Number(c.getAttribute("cy"))
    const r = Number(c.getAttribute("r"))
    expect(cx - r, "circle left").toBeGreaterThanOrEqual(-slop)
    expect(cx + r, "circle right").toBeLessThanOrEqual(w + slop)
    expect(cy - r, "circle top").toBeGreaterThanOrEqual(-slop)
    expect(cy + r, "circle bottom").toBeLessThanOrEqual(h + slop)
  }
  for (const r of Array.from(container.querySelectorAll("rect"))) {
    const x = Number(r.getAttribute("x"))
    const y = Number(r.getAttribute("y"))
    const rw = Number(r.getAttribute("width"))
    const rh = Number(r.getAttribute("height"))
    expect(x, "rect x").toBeGreaterThanOrEqual(-slop)
    expect(y, "rect y").toBeGreaterThanOrEqual(-slop)
    expect(x + rw, "rect right").toBeLessThanOrEqual(w + slop)
    expect(y + rh, "rect bottom").toBeLessThanOrEqual(h + slop)
  }
  for (const p of Array.from(container.querySelectorAll("polygon"))) {
    const raw = (p.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number)
    for (let i = 0; i + 1 < raw.length; i += 2) {
      expect(raw[i], "polygon x").toBeGreaterThanOrEqual(-slop)
      expect(raw[i], "polygon x max").toBeLessThanOrEqual(w + slop)
      expect(raw[i + 1], "polygon y").toBeGreaterThanOrEqual(-slop)
      expect(raw[i + 1], "polygon y max").toBeLessThanOrEqual(h + slop)
    }
  }
}

describe("numbered_cards default face (no themeId)", () => {
  it("paints an accent left rule and padded 01 numbers", () => {
    const { container } = svg(numberedCards.render(four, { x: 80, y: 100, w: 1088 }, ctx))
    const lines = container.querySelectorAll("line")
    expect(lines).toHaveLength(4)
    lines.forEach((line) => {
      expect(line.getAttribute("stroke")).toBe(ctx.colors.accent)
    })
    const nums = Array.from(container.querySelectorAll("text")).filter((t) =>
      /^\d{2}$/.test(t.textContent ?? ""),
    )
    expect(nums.map((t) => t.textContent)).toEqual(["01", "02", "03", "04"])
    nums.forEach((t) => {
      expect(t.getAttribute("font-style")).toBe("italic")
      expect(t.getAttribute("font-weight")).toBe("bold")
    })
  })

  it("stays within the controlled SVG subset (assertSubset)", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {numberedCards.render(four, { x: 80, y: 100, w: 1088 }, ctx)}
      </svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })
})

describe("numbered_pills", () => {
  it("pulse: a large left circle plus n pill rects, first/last x differ when stagger", () => {
    const pulse = themeCtx("pulse")
    const { container } = svg(numberedCards.render(four, { x: 0, y: 0, w: 1088 }, pulse))
    const circles = Array.from(container.querySelectorAll("circle"))
    expect(circles.length).toBeGreaterThanOrEqual(1)
    const large = circles.reduce((a, b) =>
      Number(a.getAttribute("r")) > Number(b.getAttribute("r")) ? a : b,
    )
    expect(Number(large.getAttribute("r"))).toBeGreaterThan(40)
    expect(large.getAttribute("fill")).toBe(pulse.colors.primary)
    const pills = pillRects(container)
    expect(pills).toHaveLength(4)
    pills.forEach((p) => expect(p.getAttribute("fill")).toBe(pulse.colors.surface))
    const xs = pills.map((p) => Number(p.getAttribute("x")))
    expect(xs[0]).not.toBe(xs[xs.length - 1])
    expect(container.textContent).toContain("04")
    expect(container.textContent).not.toContain("四件要事")
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {numberedCards.render(four, { x: 0, y: 0, w: 1088 }, pulse)}
      </svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })

  it("enterprise: aligned squares, pill x equal", () => {
    const enterprise = themeCtx("enterprise")
    const { container } = svg(numberedCards.render(four, { x: 0, y: 0, w: 1088 }, enterprise))
    expect(container.querySelector("circle")).toBeNull()
    const pills = pillRects(container)
    expect(pills).toHaveLength(4)
    const xs = new Set(pills.map((p) => p.getAttribute("x")))
    expect(xs.size).toBe(1)
  })

  it("classroom: outline number badges and a quadratic wave under the first title", () => {
    const classroom = themeCtx("classroom")
    const { container } = svg(numberedCards.render(four, { x: 0, y: 0, w: 1088 }, classroom))
    const outline = Array.from(container.querySelectorAll("circle")).filter(
      (c) => c.getAttribute("fill") === "none" && c.getAttribute("stroke") === classroom.colors.accent,
    )
    expect(outline.length).toBeGreaterThanOrEqual(4)
    const wave = Array.from(container.querySelectorAll("path")).find((p) =>
      /[Qq]/.test(p.getAttribute("d") ?? ""),
    )
    expect(wave).toBeTruthy()
    expect(wave!.getAttribute("stroke")).toBe(classroom.colors.accent)
  })
})

describe("numbered_cards unassigned theme equals the default face", () => {
  it("consulting (unassigned) markup equals the same tokens with themeId omitted", () => {
    const consulting = themeCtx("consulting")
    const noId: ComponentCtx = { ...consulting, themeId: undefined }
    const box = { x: 80, y: 100, w: 1088 }
    expect(markupOf(four, box, consulting)).toBe(markupOf(four, box, noId))
  })
})

describe("hex_cluster", () => {
  function hexShapes(container: HTMLElement) {
    const polygons = Array.from(container.querySelectorAll("polygon"))
    const paths = Array.from(container.querySelectorAll("path")).filter((p) => {
      const d = p.getAttribute("d") ?? ""
      return d.includes("Z") || d.includes("z")
    })
    return { polygons, paths, count: polygons.length + paths.length }
  }

  it("tech: n hex polygons, fills from the palette, no invented left essay", () => {
    const tech = themeCtx("tech")
    const three = cards(3)
    const { container } = svg(numberedCards.render(three, { x: 0, y: 0, w: 1088 }, tech))
    const shapes = hexShapes(container)
    expect(shapes.count).toBe(3)
    const fills = shapes.polygons.map((p) => p.getAttribute("fill"))
    for (const fill of fills) {
      expect(tech.colors.chartPalette).toContain(fill)
    }
    shapes.polygons.forEach((p) => {
      expect(p.getAttribute("stroke")).toBe(tech.colors.bg)
    })
    expect(container.textContent).toContain("01")
    expect(container.textContent).toContain("要点1")
    expect(container.textContent).not.toContain("为什么是三层")
    expect(container.textContent).not.toContain("单一告警会漏")
    expect(container.textContent).not.toContain("四件要事")
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {numberedCards.render(three, { x: 0, y: 0, w: 1088 }, tech)}
      </svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })

  it("n=3 is 品字: one hex on top, two below", () => {
    const tech = themeCtx("tech")
    const { container } = svg(numberedCards.render(cards(3), { x: 0, y: 0, w: 1088 }, tech))
    const centroids = Array.from(container.querySelectorAll("polygon")).map((p) => {
      const raw = (p.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number)
      let sx = 0
      let sy = 0
      let n = 0
      for (let i = 0; i + 1 < raw.length; i += 2) {
        sx += raw[i]!
        sy += raw[i + 1]!
        n++
      }
      return { x: sx / n, y: sy / n }
    })
    expect(centroids).toHaveLength(3)
    centroids.sort((a, b) => a.y - b.y)
    expect(centroids[0]!.y).toBeLessThan(centroids[1]!.y)
    expect(Math.abs(centroids[1]!.y - centroids[2]!.y)).toBeLessThan(2)
  })

  it("ember accent-ramp starts at accent and ends at primary", () => {
    const ember = themeCtx("ember")
    const { container } = svg(numberedCards.render(cards(3), { x: 0, y: 0, w: 1088 }, ember))
    const fills = Array.from(container.querySelectorAll("polygon")).map((p) => p.getAttribute("fill"))
    expect(fills[0]).toBe(ember.colors.accent)
    expect(fills[fills.length - 1]).toBe(ember.colors.primary)
  })
})

describe("numbered_cards n=3 and n=8 stay in box", () => {
  it.each([
    ["pulse", 3],
    ["pulse", 8],
    ["tech", 3],
    ["tech", 8],
  ] as const)("%s n=%s stays inside the box", (themeId, n) => {
    const theme = themeCtx(themeId)
    const component = cards(n)
    const w = 1088
    const h = numberedCards.measure(component, w, theme)
    const { container } = svg(numberedCards.render(component, { x: 0, y: 0, w, h }, theme))
    assertInsideBox(container, w, h)
  })
})
