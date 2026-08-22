// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../../serialize"
import { assertSubset } from "../../subset-validate"
import { buildCtx } from "../../full-slide-svg"
import { resolveStyle } from "../../../themes"
import { StatementContent } from "../content-statement"
import { PullQuoteContent } from "../content-pull-quote"
import { StatHeroContent } from "../content-stat-hero"
import type { PptxIR, Slide } from "@/ir"

const VERSE = "设备不会突然坏，只是没人听它说话。"
const QUOTE = "最贵的停机，是没人预料到的**那一次**。"
const QUOTE_PLAIN = "最贵的停机，是没人预料到的那一次。"
const MUSEUM_COPPER = "#BE7A28"

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "luxe" },
    meta: {},
    assets: { images: {} },
    slides,
  } as unknown as PptxIR
}

function render(body: React.ReactElement): { markup: string; root: Element } {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

describe("luxe sparse faces", () => {
  const ctx = buildCtx(resolveStyle("luxe"), {})

  it("statement is a single accent line with no decoration", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { markup, root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会突然坏"),
    )!
    expect(heading.getAttribute("x")).toBe("640")
    expect(heading.getAttribute("y")).toBe("380")
    expect(heading.getAttribute("text-anchor")).toBe("middle")
    expect(Number(heading.getAttribute("font-size"))).toBe(50)
    expect(heading.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(root.querySelector("rect")).toBeNull()
    expect(root.querySelector("line")).toBeNull()
    expect(root.querySelector("polygon")).toBeNull()
    expect(markup).not.toContain(MUSEUM_COPPER)
  })

  it("pull-quote opens with a baked gold diamond and accent type", () => {
    const slide: Slide = {
      type: "content",
      layout: "pull-quote",
      heading: QUOTE,
      subheading: "陈砚清 · 首席技术官",
      components: [],
    } as Slide
    const { root } = render(
      <PullQuoteContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    expect(root.querySelector("polygon")).not.toBeNull()
    expect(root.querySelector("rect[transform]")).toBeNull()
    const quote = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("最贵的停机"),
    )!
    expect(quote.getAttribute("x")).toBe("640")
    expect(quote.getAttribute("text-anchor")).toBe("middle")
    expect(Number(quote.getAttribute("font-size"))).toBe(48)
    expect(quote.getAttribute("fill")).toBe(ctx.colors.accent)
    const em = Array.from(root.querySelectorAll("tspan")).find((t) => t.textContent === "那一次")
    expect(em?.getAttribute("fill")).toBe(ctx.colors.accent)
  })

  it("pull-quote diamond is a 45° square matching the clockwise bake, not the negated angle", () => {
    const slide: Slide = {
      type: "content",
      layout: "pull-quote",
      heading: QUOTE,
      subheading: "陈砚清 · 首席技术官",
      components: [],
    } as Slide
    const { root } = render(
      <PullQuoteContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const points = root.querySelector("polygon")!.getAttribute("points")!
    const round1 = (v: number) => Math.round(v * 10) / 10
    const bake = (deg: number) => {
      const a = (deg * Math.PI) / 180
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const hw = 7
      const hh = 7
      return (
        [
          [-hw, -hh],
          [hw, -hh],
          [hw, hh],
          [-hw, hh],
        ] as [number, number][]
      )
        .map(([lx, ly]) => `${round1(640 + lx * ca - ly * sa)},${round1(180 + lx * sa + ly * ca)}`)
        .join(" ")
    }
    expect(points).toBe(bake(45))
    expect(points).not.toBe(bake(-45))
    const pts = points.split(/\s+/).map((p) => {
      const [x, y] = p.split(",").map(Number)
      return { x: x!, y: y! }
    })
    const dist = (p: { x: number; y: number }) => Math.hypot(p.x - 640, p.y - 180)
    const d0 = dist(pts[0]!)
    for (const p of pts) expect(dist(p)).toBeCloseTo(d0, 5)
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 5)
  })

  it("pull-quote without ** still uses accent as the face color, with no extra tspan", () => {
    const slide: Slide = { type: "content", layout: "pull-quote", heading: QUOTE_PLAIN, subheading: "陈砚清", components: [] } as Slide
    const { root } = render(
      <PullQuoteContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const quote = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("最贵的停机"),
    )!
    expect(quote.querySelector("tspan")).toBeNull()
    expect(quote.getAttribute("fill")).toBe(ctx.colors.accent)
  })

  it("stat-hero is a 270px accent numeral between two border hairlines", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "43%",
      subheading: "席位净流失 · 九十日",
      components: [],
    } as Slide
    const { root } = render(
      <StatHeroContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const lines = Array.from(root.querySelectorAll("line"))
    expect(lines[0]?.getAttribute("x1")).toBe("360")
    expect(lines[0]?.getAttribute("x2")).toBe("920")
    expect(lines[0]?.getAttribute("y1")).toBe("200")
    expect(lines[1]?.getAttribute("y1")).toBe("524")
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("y")).toBe("470")
    expect(Number(hero.getAttribute("font-size"))).toBe(270)
    expect(hero.getAttribute("font-weight")).toBe("400")
    expect(hero.getAttribute("fill")).toBe(ctx.colors.accent)
  })
})
