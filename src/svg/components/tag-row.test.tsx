// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { assertSubset } from "../subset-validate"
import { parseSvgRoot } from "../serialize"
import { auditSvgMarkup } from "../audit/svg-audit"
import { readableOn } from "../ink"
import { tagRow } from "./tag-row"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#FFFFFF",
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

const tags = (n: number) => Array.from({ length: n }, (_, i) => `Tag${i + 1}`)
const comp = (items: string[], overrides: Record<string, unknown> = {}) => ({
  type: "tag_row" as const,
  items,
  ...overrides,
})

describe("tag_row component", () => {
  it("renders one capsule pill (rect) and one label (text) per tag", () => {
    const { container } = svg(tagRow.render(comp(tags(6)), { x: 20, y: 20, w: 1000 }, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    const texts = Array.from(container.querySelectorAll("text"))
    expect(rects.length).toBe(6)
    expect(texts.length).toBe(6) // no title → text count == pill count
    // Capsule: rx is half the pill height (rounds into a pill, not a card corner).
    for (const r of rects) {
      const rx = Number(r.getAttribute("rx"))
      const h = Number(r.getAttribute("height"))
      expect(rx).toBeCloseTo(h / 2, 5)
    }
  })

  it("default (no emphasis): every pill is the low-key surface fill + text ink", () => {
    const { container } = svg(tagRow.render(comp(tags(4)), { x: 0, y: 0, w: 1000 }, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    const texts = Array.from(container.querySelectorAll("text"))
    for (const r of rects) expect(r.getAttribute("fill")).toBe(ctx.colors.surface)
    for (const t of texts) expect(t.getAttribute("fill")).toBe(ctx.colors.text)
    // No pill is drawn in the accent (nothing is emphasized).
    expect(rects.some((r) => r.getAttribute("fill") === ctx.colors.accent)).toBe(false)
  })

  it('emphasis "first": only the first pill gets the accent fill + a readable ink, the rest stay low-key', () => {
    const { container } = svg(
      tagRow.render(comp(tags(4), { emphasis: "first" }), { x: 0, y: 0, w: 1000 }, ctx),
    )
    const rects = Array.from(container.querySelectorAll("rect"))
    const texts = Array.from(container.querySelectorAll("text"))
    // Pill 0 = accent fill + readableOn(accent) ink.
    expect(rects[0].getAttribute("fill")).toBe(ctx.colors.accent)
    expect(texts[0].getAttribute("fill")).toBe(readableOn(ctx.colors.accent))
    // Pills 1..n = surface fill + text ink.
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i].getAttribute("fill")).toBe(ctx.colors.surface)
      expect(texts[i].getAttribute("fill")).toBe(ctx.colors.text)
    }
    // Exactly one accent pill.
    expect(rects.filter((r) => r.getAttribute("fill") === ctx.colors.accent).length).toBe(1)
  })

  it("flow-wraps: a fixed set of tags needs more height in a narrow column than a wide one", () => {
    const wide = tagRow.measure(comp(tags(12)), 1200, ctx)
    const narrow = tagRow.measure(comp(tags(12)), 360, ctx)
    // More rows fit fewer pills each → the narrow column is taller.
    expect(narrow).toBeGreaterThan(wide)
    // And a single row of a couple of tags is shorter than 12 wrapped ones.
    expect(tagRow.measure(comp(tags(2)), 1200, ctx)).toBeLessThan(narrow)
  })

  it("measures a CJK/Latin-mixed tag with real per-character width (no under/over-estimate wrap crash)", () => {
    const mixed = ["基于 Kubernetes", "分布式事务", "StatefulSet v2.3", "灰度发布"]
    const { container } = svg(tagRow.render(comp(mixed), { x: 0, y: 0, w: 1000 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    // Wide row → nothing truncated, each label survives intact.
    expect(texts).toEqual(mixed)
    expect(Array.from(container.querySelectorAll("text")).every((t) => !t.getAttribute("data-truncated"))).toBe(true)
  })

  it("truncates a single tag wider than the whole row instead of overflowing it", () => {
    const long = "abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz"
    const { container } = svg(tagRow.render(comp([long, "ok"]), { x: 0, y: 0, w: 160 }, ctx))
    const truncated = Array.from(container.querySelectorAll("text")).find((t) => t.getAttribute("data-truncated") === "1")
    expect(truncated).toBeTruthy()
    expect(truncated!.textContent!.endsWith("…")).toBe(true)
  })

  it("renders an optional overall title above the row, omitting it entirely when unset", () => {
    const withTitle = svg(tagRow.render(comp(tags(4), { title: "Tech stack" }), { x: 0, y: 0, w: 1000 }, ctx))
    expect(Array.from(withTitle.container.querySelectorAll("text")).some((t) => t.textContent === "Tech stack")).toBe(true)
    // With a title, text count = pills + 1.
    expect(withTitle.container.querySelectorAll("text").length).toBe(5)
    const noTitle = svg(tagRow.render(comp(tags(4)), { x: 0, y: 0, w: 1000 }, ctx))
    expect(noTitle.container.querySelectorAll("text").length).toBe(4)
  })

  it("is deterministic — the same IR renders byte-identical SVG markup on repeat calls", () => {
    const c = comp(tags(16), { title: "标签", emphasis: "first" })
    const box = { x: 60, y: 60, w: 900 }
    const a = renderToStaticMarkup(<svg>{tagRow.render(c, box, ctx)}</svg>)
    const b = renderToStaticMarkup(<svg>{tagRow.render(c, box, ctx)}</svg>)
    expect(a).toBe(b)
  })

  it("stays inside the controlled SVG element subset (no foreignObject/nested svg/gradient)", () => {
    const markup = renderToStaticMarkup(
      <svg viewBox="0 0 1280 720">{tagRow.render(comp(tags(16)), { x: 40, y: 40, w: 1200 }, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })

  it("passes the overflow auditor at the schema min (2) and max (16) tag counts", () => {
    for (const n of [2, 16]) {
      const markup = renderToStaticMarkup(
        <svg viewBox="0 0 1280 720">{tagRow.render(comp(tags(n)), { x: 40, y: 40, w: 1200 }, ctx)}</svg>,
      )
      expect(auditSvgMarkup(markup)).toEqual([])
    }
  })
})
