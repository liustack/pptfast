// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { measureTextUnits } from "../../lib/svg-text-layout"
import { readableOn } from "../ink"
import { iconCards } from "./icon-cards"
import { resolveStyle } from "../../themes"
import { buildCtx } from "../full-slide-svg"
import type { ComponentCtx } from "./types"

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

function card(title: string, text: string, icon = "rocket") {
  return { icon, title, text }
}

const four = {
  type: "icon_cards" as const,
  items: [
    card("断言一", "简短说明一"),
    card("断言二", "简短说明二"),
    card("断言三", "简短说明三"),
    card("断言四", "简短说明四"),
  ],
}

const six = {
  type: "icon_cards" as const,
  items: [
    card("口径一", "说明一"),
    card("口径二", "说明二"),
    card("口径三", "说明三"),
    card("口径四", "说明四"),
    card("口径五", "说明五"),
    card("口径六", "说明六"),
  ],
}

const BOX = { x: 80, y: 100, w: 1088 }

function themeCtx(id: string): ComponentCtx {
  return buildCtx(resolveStyle(id), {})
}

function markupOf(node: React.ReactElement): string {
  return renderSvgMarkup(<svg xmlns="http://www.w3.org/2000/svg">{node}</svg>)
}

function isInsideScaledIcon(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const t = n.getAttribute("transform") ?? ""
    if (/scale\(/.test(t)) return true
  }
  return false
}

function formCircles(container: ParentNode): SVGCircleElement[] {
  return Array.from(container.querySelectorAll("circle")).filter(
    (c) => !isInsideScaledIcon(c) && Number(c.getAttribute("r") ?? 0) > 16,
  )
}

function cellRects(container: ParentNode): SVGRectElement[] {
  return Array.from(container.querySelectorAll("rect")).filter((r) => {
    if (isInsideScaledIcon(r)) return false
    return Number(r.getAttribute("width") ?? 0) > 100
  })
}

function accentBars(container: ParentNode): SVGRectElement[] {
  return Array.from(container.querySelectorAll("rect")).filter(
    (r) => r.getAttribute("height") === "3" && !isInsideScaledIcon(r),
  )
}

function assertInsideBox(container: HTMLElement, w: number, h: number, slack = 2) {
  for (const rect of Array.from(container.querySelectorAll("rect"))) {
    if (isInsideScaledIcon(rect)) continue
    const x = Number(rect.getAttribute("x") ?? 0)
    const y = Number(rect.getAttribute("y") ?? 0)
    const rw = Number(rect.getAttribute("width") ?? 0)
    const rh = Number(rect.getAttribute("height") ?? 0)
    expect(x).toBeGreaterThanOrEqual(-slack)
    expect(y).toBeGreaterThanOrEqual(-slack)
    expect(x + rw).toBeLessThanOrEqual(w + slack)
    expect(y + rh).toBeLessThanOrEqual(h + slack)
  }
  for (const c of Array.from(container.querySelectorAll("circle"))) {
    if (isInsideScaledIcon(c)) continue
    const cx = Number(c.getAttribute("cx") ?? 0)
    const cy = Number(c.getAttribute("cy") ?? 0)
    const r = Number(c.getAttribute("r") ?? 0)
    expect(cx - r).toBeGreaterThanOrEqual(-slack)
    expect(cy - r).toBeGreaterThanOrEqual(-slack)
    expect(cx + r).toBeLessThanOrEqual(w + slack)
    expect(cy + r).toBeLessThanOrEqual(h + slack)
  }
  for (const t of Array.from(container.querySelectorAll("text"))) {
    const x = Number(t.getAttribute("x") ?? 0)
    const y = Number(t.getAttribute("y") ?? 0)
    const fontSize = Number(t.getAttribute("font-size") ?? 0)
    const anchor = t.getAttribute("text-anchor")
    const tw = measureTextUnits(t.textContent ?? "") * fontSize
    const left = anchor === "middle" ? x - tw / 2 : x
    expect(left).toBeGreaterThanOrEqual(-slack)
    expect(left + tw).toBeLessThanOrEqual(w + slack)
    expect(y - fontSize).toBeGreaterThanOrEqual(-slack)
    expect(y).toBeLessThanOrEqual(h + slack)
  }
}

describe("icon_cards forms: icon_columns", () => {
  it("terra draws node circles and no full-size surface card with a height-3 accent bar", () => {
    const ctx = themeCtx("terra")
    const { container } = svg(iconCards.render(four, BOX, ctx))
    const nodes = formCircles(container)
    expect(nodes).toHaveLength(4)
    for (const node of nodes) {
      expect(node.getAttribute("fill")).toBe(ctx.colors.surface)
      expect(node.getAttribute("stroke")).toBe(ctx.colors.border)
    }
    expect(accentBars(container)).toHaveLength(0)
    const surfaceCards = cellRects(container).filter(
      (r) => r.getAttribute("fill") === ctx.colors.surface,
    )
    expect(surfaceCards).toHaveLength(0)
  })

  it("lecture draws a dashed unfilled circle node", () => {
    const ctx = themeCtx("lecture")
    const { container } = svg(iconCards.render(four, BOX, ctx))
    const nodes = formCircles(container)
    expect(nodes).toHaveLength(4)
    for (const node of nodes) {
      const fill = node.getAttribute("fill")
      expect(fill === "none" || fill === "transparent").toBe(true)
      expect(node.getAttribute("stroke-dasharray")).toBeTruthy()
    }
  })

  it("swiss draws a square node, not a circle", () => {
    const ctx = themeCtx("swiss")
    const { container } = svg(iconCards.render(four, BOX, ctx))
    expect(formCircles(container)).toHaveLength(0)
    const squares = Array.from(container.querySelectorAll("rect")).filter((r) => {
      if (isInsideScaledIcon(r)) return false
      const w = Number(r.getAttribute("width") ?? 0)
      const h = Number(r.getAttribute("height") ?? 0)
      return w > 40 && w < 120 && Math.abs(w - h) < 1
    })
    expect(squares).toHaveLength(4)
    for (const sq of squares) {
      expect(sq.getAttribute("fill")).toBe(ctx.colors.surface)
      expect(sq.getAttribute("stroke")).toBe(ctx.colors.border)
      expect(Number(sq.getAttribute("rx") ?? 0)).toBe(0)
    }
  })
})

describe("icon_cards forms: unassigned", () => {
  it("consulting markup is byte-identical to the same ctx without themeId", () => {
    const consulting = themeCtx("consulting")
    const synthetic: ComponentCtx = { ...consulting, themeId: undefined }
    const a = markupOf(iconCards.render(four, BOX, consulting))
    const b = markupOf(iconCards.render(four, BOX, synthetic))
    expect(a).toBe(b)
  })
})

describe("icon_cards forms: badge_cards", () => {
  it("tech badge circle cy equals the card rect y (bites the top edge)", () => {
    const ctx = themeCtx("tech")
    const { container } = svg(iconCards.render(four, BOX, ctx))
    const cards = cellRects(container)
    const badges = formCircles(container)
    expect(cards.length).toBe(4)
    expect(badges.length).toBe(4)
    cards.forEach((cardEl, i) => {
      expect(Number(badges[i]!.getAttribute("cy"))).toBeCloseTo(
        Number(cardEl.getAttribute("y")),
      )
    })
    const tokenFills = new Set(
      [ctx.colors.primary, ctx.colors.surface, ctx.colors.bg, ctx.defaultBg].filter(
        Boolean,
      ),
    )
    for (const badge of badges) {
      expect(tokenFills.has(badge.getAttribute("fill") ?? "")).toBe(true)
      expect(badge.getAttribute("stroke")).toBe(ctx.colors.accent)
    }
  })

  it("vermilion paints a solid primary badge with readableOn icon ink", () => {
    const ctx = themeCtx("vermilion")
    const { container } = svg(iconCards.render(four, BOX, ctx))
    const badges = formCircles(container)
    expect(badges).toHaveLength(4)
    for (const badge of badges) {
      expect(badge.getAttribute("fill")).toBe(ctx.colors.primary)
      expect(badge.getAttribute("stroke")).toBeNull()
    }
    const iconGroups = Array.from(container.querySelectorAll("g[transform]")).filter(
      (g) => /scale\(/.test(g.getAttribute("transform") ?? ""),
    )
    expect(iconGroups.length).toBeGreaterThanOrEqual(4)
    const ink = readableOn(ctx.colors.primary)
    const stroked = Array.from(container.querySelectorAll("path,circle,rect,line")).filter(
      (el) => el.getAttribute("stroke") === ink,
    )
    expect(stroked.length).toBeGreaterThan(0)
  })

  it("luxe card radius is 0", () => {
    const ctx = themeCtx("luxe")
    const { container } = svg(iconCards.render(four, BOX, ctx))
    const cards = cellRects(container)
    expect(cards.length).toBe(4)
    for (const cardEl of cards) {
      expect(Number(cardEl.getAttribute("rx") ?? 0)).toBe(0)
    }
  })
})

describe("icon_cards forms: outline_grid", () => {
  it("academic cells are stroke with fill none or transparent", () => {
    const ctx = themeCtx("academic")
    const { container } = svg(iconCards.render(four, BOX, ctx))
    const cells = cellRects(container)
    expect(cells.length).toBe(4)
    for (const cell of cells) {
      const fill = cell.getAttribute("fill")
      expect(fill === "none" || fill === "transparent").toBe(true)
      expect(cell.getAttribute("stroke")).toBe(ctx.colors.primary)
    }
  })

  it("crayon cell stroke walks chartPalette", () => {
    const ctx = themeCtx("crayon")
    const { container } = svg(iconCards.render(four, BOX, ctx))
    const cells = cellRects(container)
    expect(cells.length).toBe(4)
    const palette = ctx.colors.chartPalette
    cells.forEach((cell, i) => {
      expect(cell.getAttribute("fill")).toBe(ctx.colors.surface)
      expect(cell.getAttribute("stroke")).toBe(palette[i % palette.length])
    })
  })
})

describe("icon_cards forms: subset and bounds", () => {
  it("terra assigned form stays within the controlled SVG subset", () => {
    const ctx = themeCtx("terra")
    const markup = markupOf(iconCards.render(four, BOX, ctx))
    expect(markup).not.toContain("foreignObject")
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("6 items on terra, tech, and academic stay inside the box", () => {
    for (const id of ["terra", "tech", "academic"] as const) {
      const ctx = themeCtx(id)
      const h = iconCards.measure(six, BOX.w, ctx)
      const { container } = svg(iconCards.render(six, { ...BOX, h }, ctx))
      assertInsideBox(container, BOX.w, h)
    }
  })

  it("empty icon string degrades without throwing", () => {
    const ctx = themeCtx("terra")
    const emptyIcon = {
      type: "icon_cards" as const,
      items: [
        { icon: "", title: "空图标", text: "降级" },
        { icon: "rocket", title: "有图标", text: "正常" },
      ],
    }
    expect(() =>
      svg(iconCards.render(emptyIcon, BOX, ctx)),
    ).not.toThrow()
    const { container } = svg(iconCards.render(emptyIcon, BOX, ctx))
    expect(formCircles(container).length).toBeGreaterThanOrEqual(2)
  })
})
