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
import { FORM_BODY_FLOOR, FORM_TITLE_FLOOR } from "./forms/legibility"

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

/** Same gallery-length CJK copy as `forms/legibility.test.ts` `GALLERY_FOUR`. */
const GALLERY_PILL_ITEMS = [
  { title: "自建算力替换", text: "自建算力替换公有云推理，单台设备的月度成本下降三成一。" },
  { title: "行业场景复制", text: "华东区域的渗透率是华南的一半，销售覆盖密度是主要原因。" },
  { title: "现场服务自动化", text: "现场服务工程师的人均负荷已经接近上限，扩张速度受制于招聘。" },
  { title: "渠道伙伴培育", text: "两家竞品在中小客户市场以低于成本的价格投标，短期内难以正面应对。" },
]

const galleryFour = {
  type: "numbered_cards" as const,
  items: GALLERY_PILL_ITEMS,
}

const PILL_THEMES = ["pulse", "enterprise", "classroom"] as const
const BADGE_DIAMETER_RATIO = 0.8
const DISC_PILL_GAP = 12

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

function parseTranslate(el: Element): { dx: number; dy: number } {
  const t = el.getAttribute("transform") ?? ""
  const m = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(t)
  return { dx: m ? Number(m[1]) : 0, dy: m ? Number(m[2]) : 0 }
}

function assertPageSpaceInsideBox(
  container: HTMLElement,
  box: { x: number; y: number; w: number; h: number },
  slop = 2,
) {
  const root = container.querySelector("svg") ?? container
  const walk = (el: Element, ox: number, oy: number) => {
    const { dx, dy } = parseTranslate(el)
    const ax = ox + dx
    const ay = oy + dy
    const tag = el.tagName.toLowerCase()
    const hit = (x: number, y: number, label: string) => {
      expect(x, label).toBeGreaterThanOrEqual(box.x - slop)
      expect(x, label).toBeLessThanOrEqual(box.x + box.w + slop)
      expect(y, label).toBeGreaterThanOrEqual(box.y - slop)
      expect(y, label).toBeLessThanOrEqual(box.y + box.h + slop)
    }
    if (tag === "circle") {
      const cx = ax + Number(el.getAttribute("cx"))
      const cy = ay + Number(el.getAttribute("cy"))
      const r = Number(el.getAttribute("r"))
      hit(cx - r, cy - r, "page circle min")
      hit(cx + r, cy + r, "page circle max")
    } else if (tag === "rect") {
      const x = ax + Number(el.getAttribute("x"))
      const y = ay + Number(el.getAttribute("y"))
      hit(x, y, "page rect min")
      hit(
        x + Number(el.getAttribute("width")),
        y + Number(el.getAttribute("height")),
        "page rect max",
      )
    }
    for (const child of Array.from(el.children)) walk(child, ax, ay)
  }
  walk(root, 0, 0)
}

function leftDiscCircle(container: HTMLElement): SVGCircleElement {
  const circles = Array.from(container.querySelectorAll("circle"))
  expect(circles.length).toBeGreaterThan(0)
  return circles.reduce((a, b) => (Number(a.getAttribute("r")) > Number(b.getAttribute("r")) ? a : b))
}

function badgeCircles(container: HTMLElement): SVGCircleElement[] {
  const disc = leftDiscCircle(container)
  const discR = Number(disc.getAttribute("r"))
  return Array.from(container.querySelectorAll("circle")).filter(
    (c) => c !== disc && Number(c.getAttribute("r")) < discR - 0.5,
  )
}

function nonPillRects(container: HTMLElement): SVGRectElement[] {
  return Array.from(container.querySelectorAll("rect")).filter((r) => {
    const w = Number(r.getAttribute("width"))
    const h = Number(r.getAttribute("height"))
    return !(w > h * 1.6)
  })
}

function leftDiscSquare(container: HTMLElement): SVGRectElement {
  const rects = nonPillRects(container)
  expect(rects.length).toBeGreaterThan(0)
  return rects.reduce((a, b) =>
    Number(a.getAttribute("width")) * Number(a.getAttribute("height")) >
    Number(b.getAttribute("width")) * Number(b.getAttribute("height"))
      ? a
      : b,
  )
}

function badgeSquares(container: HTMLElement): SVGRectElement[] {
  const disc = leftDiscSquare(container)
  return nonPillRects(container).filter((r) => r !== disc)
}

function circleInsideRect(circle: Element, pill: Element, slop = 1) {
  const cx = Number(circle.getAttribute("cx"))
  const cy = Number(circle.getAttribute("cy"))
  const r = Number(circle.getAttribute("r"))
  const x = Number(pill.getAttribute("x"))
  const y = Number(pill.getAttribute("y"))
  const w = Number(pill.getAttribute("width"))
  const h = Number(pill.getAttribute("height"))
  expect(cx - r, "badge left in pill").toBeGreaterThanOrEqual(x - slop)
  expect(cy - r, "badge top in pill").toBeGreaterThanOrEqual(y - slop)
  expect(cx + r, "badge right in pill").toBeLessThanOrEqual(x + w + slop)
  expect(cy + r, "badge bottom in pill").toBeLessThanOrEqual(y + h + slop)
}

function rectInsideRect(inner: Element, outer: Element, slop = 1) {
  const x = Number(inner.getAttribute("x"))
  const y = Number(inner.getAttribute("y"))
  const w = Number(inner.getAttribute("width"))
  const h = Number(inner.getAttribute("height"))
  const ox = Number(outer.getAttribute("x"))
  const oy = Number(outer.getAttribute("y"))
  const ow = Number(outer.getAttribute("width"))
  const oh = Number(outer.getAttribute("height"))
  expect(x, "square left in pill").toBeGreaterThanOrEqual(ox - slop)
  expect(y, "square top in pill").toBeGreaterThanOrEqual(oy - slop)
  expect(x + w, "square right in pill").toBeLessThanOrEqual(ox + ow + slop)
  expect(y + h, "square bottom in pill").toBeLessThanOrEqual(oy + oh + slop)
}

function pillForShape(pills: Element[], shape: Element, kind: "circle" | "rect") {
  const sx =
    kind === "circle" ? Number(shape.getAttribute("cx")) : Number(shape.getAttribute("x"))
  const sy =
    kind === "circle" ? Number(shape.getAttribute("cy")) : Number(shape.getAttribute("y"))
  const sw = kind === "rect" ? Number(shape.getAttribute("width")) : 0
  const sh = kind === "rect" ? Number(shape.getAttribute("height")) : 0
  const sr = kind === "circle" ? Number(shape.getAttribute("r")) : 0
  const cx = kind === "circle" ? sx : sx + sw / 2
  const cy = kind === "circle" ? sy : sy + sh / 2
  const hit = pills.find((p) => {
    const x = Number(p.getAttribute("x"))
    const y = Number(p.getAttribute("y"))
    const w = Number(p.getAttribute("width"))
    const h = Number(p.getAttribute("height"))
    return cx >= x - sr && cx <= x + w + sr && cy >= y && cy <= y + h
  })
  expect(hit, "badge belongs to a pill").toBeTruthy()
  return hit!
}

function discExtent(container: HTMLElement, themeId: string) {
  if (themeId === "enterprise") {
    const sq = leftDiscSquare(container)
    const x = Number(sq.getAttribute("x"))
    const y = Number(sq.getAttribute("y"))
    const w = Number(sq.getAttribute("width"))
    const h = Number(sq.getAttribute("height"))
    return { left: x, right: x + w, top: y, bottom: y + h, cx: x + w / 2, cy: y + h / 2, r: w / 2 }
  }
  const c = leftDiscCircle(container)
  const cx = Number(c.getAttribute("cx"))
  const cy = Number(c.getAttribute("cy"))
  const r = Number(c.getAttribute("r"))
  return { left: cx - r, right: cx + r, top: cy - r, bottom: cy + r, cx, cy, r }
}

function pillGroups(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll("g")).filter((g) =>
    Array.from(g.children).some((child) => {
      if (child.tagName.toLowerCase() !== "rect") return false
      const w = Number(child.getAttribute("width"))
      const h = Number(child.getAttribute("height"))
      return w > h * 1.6
    }),
  )
}

function isNumLabel(text: string | null): boolean {
  return /^\d{2}$/.test(text ?? "")
}

describe("numbered_cards default face (no themeId)", () => {
  it("paints padded 01 numbers with no top hairline and no left-edge bar", () => {
    const { container } = svg(numberedCards.render(four, { x: 80, y: 100, w: 1088 }, ctx))
    expect(container.querySelectorAll("line")).toHaveLength(0)
    const hairlines = [...container.querySelectorAll("rect")].filter(
      (r) => Number(r.getAttribute("height")) <= 3,
    )
    expect(hairlines).toHaveLength(0)
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
    pills.forEach((p) => {
      expect(p.getAttribute("fill")).toBe(pulse.colors.surface)
      expect(Number(p.getAttribute("rx"))).toBe(pulse.shape?.radius ?? 8)
    })
    const xs = pills.map((p) => Number(p.getAttribute("x")))
    expect(xs[0]).not.toBe(xs[xs.length - 1])
    expect(container.textContent).toContain("04")
    expect(container.textContent).not.toContain("四件要事")
    const discR = Number(large.getAttribute("r"))
    expect(discR).toBeLessThanOrEqual(56)
    const discCx = Number(large.getAttribute("cx"))
    const pillLeft = Math.min(...pills.map((p) => Number(p.getAttribute("x"))))
    expect(pillLeft - (discCx + discR)).toBeGreaterThanOrEqual(16)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {numberedCards.render(four, { x: 0, y: 0, w: 1088 }, pulse)}
      </svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })

  it("pulse left count disc fits a 640-wide slot, stays vertically centered, and leaves air to the pills", () => {
    const pulse = themeCtx("pulse")
    const box = { x: 0, y: 0, w: 640, h: 392 }
    const { container } = svg(numberedCards.render(four, box, pulse))
    const large = Array.from(container.querySelectorAll("circle")).reduce((a, b) =>
      Number(a.getAttribute("r")) > Number(b.getAttribute("r")) ? a : b,
    )
    const r = Number(large.getAttribute("r"))
    const cx = Number(large.getAttribute("cx"))
    const cy = Number(large.getAttribute("cy"))
    expect(r).toBeGreaterThan(32)
    expect(r).toBeLessThanOrEqual(56)
    expect(cx - r).toBeGreaterThanOrEqual(-2)
    expect(cx + r).toBeLessThanOrEqual(box.w + 2)
    expect(Math.abs(cy - box.h / 2)).toBeLessThanOrEqual(8)
    const pills = pillRects(container)
    const pillLeft = Math.min(...pills.map((p) => Number(p.getAttribute("x"))))
    expect(pillLeft - (cx + r)).toBeGreaterThanOrEqual(16)
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

  it("pulse and classroom number badges stay at ≤0.8 of pill height and sit inside the pill", () => {
    for (const themeId of ["pulse", "classroom"] as const) {
      const theme = themeCtx(themeId)
      const { container } = svg(numberedCards.render(four, { x: 0, y: 0, w: 1088 }, theme))
      const pills = pillRects(container)
      const badges = badgeCircles(container)
      expect(badges.length).toBe(4)
      for (const badge of badges) {
        const pill = pillForShape(pills, badge, "circle")
        const pillH = Number(pill.getAttribute("height"))
        const r = Number(badge.getAttribute("r"))
        const stroke = Number(badge.getAttribute("stroke-width") ?? 0)
        expect(2 * r + stroke).toBeLessThanOrEqual(BADGE_DIAMETER_RATIO * pillH + 0.5)
        circleInsideRect(badge, pill)
      }
    }
  })

  it("enterprise square badges stay at ≤0.8 of pill height and sit inside the pill", () => {
    const theme = themeCtx("enterprise")
    const { container } = svg(numberedCards.render(four, { x: 0, y: 0, w: 1088 }, theme))
    const pills = pillRects(container)
    const badges = badgeSquares(container)
    expect(badges.length).toBe(4)
    for (const badge of badges) {
      const pill = pillForShape(pills, badge, "rect")
      const pillH = Number(pill.getAttribute("height"))
      const side = Math.max(
        Number(badge.getAttribute("width")),
        Number(badge.getAttribute("height")),
      )
      expect(side).toBeLessThanOrEqual(BADGE_DIAMETER_RATIO * pillH + 0.5)
      rectInsideRect(badge, pill)
    }
  })

  it.each([
    ["pulse", { x: 96, y: 186, w: 640, h: 280 }],
    ["pulse", { x: 8, y: 80, w: 400, h: 320 }],
    ["enterprise", { x: 96, y: 186, w: 640, h: 280 }],
    ["enterprise", { x: 8, y: 80, w: 400, h: 320 }],
    ["classroom", { x: 96, y: 186, w: 640, h: 280 }],
    ["classroom", { x: 8, y: 80, w: 400, h: 320 }],
  ] as const)("%s left disc fits remaining column in %j", (themeId, box) => {
    const theme = themeCtx(themeId)
    const { container } = svg(numberedCards.render(four, box, theme))
    assertPageSpaceInsideBox(container, box)
    const origin = parseTranslate(
      (container.querySelector("svg") ?? container).querySelector("g")!,
    )
    const local = discExtent(container, themeId)
    expect(local.left + origin.dx).toBeGreaterThanOrEqual(box.x - 2)
    expect(local.top + origin.dy).toBeGreaterThanOrEqual(box.y - 2)
    expect(local.right + origin.dx).toBeLessThanOrEqual(box.x + box.w + 2)
    expect(local.bottom + origin.dy).toBeLessThanOrEqual(box.y + box.h + 2)
    const pills = pillRects(container)
    const pillLeft = Math.min(...pills.map((p) => Number(p.getAttribute("x"))))
    expect(pillLeft - local.right).toBeGreaterThanOrEqual(DISC_PILL_GAP)
  })

  it.each(PILL_THEMES)("%s n=4 and n=8 stay inside a 1088 box and a 640×392 slot", (themeId) => {
    const theme = themeCtx(themeId)
    for (const n of [4, 8] as const) {
      const component = cards(n)
      const wideH = numberedCards.measure(component, 1088, theme)
      const boxes = [
        { x: 0, y: 0, w: 1088, h: wideH },
        { x: 96, y: 186, w: 640, h: 392 },
      ]
      for (const box of boxes) {
        const { container } = svg(numberedCards.render(component, box, theme))
        assertInsideBox(container, box.w, box.h)
        assertPageSpaceInsideBox(container, box)
      }
    }
  })

  it.each(PILL_THEMES)("%s gallery-length copy wraps in full with no ellipsis", (themeId) => {
    const theme = themeCtx(themeId)
    const boxes = [
      { x: 0, y: 0, w: 1088, h: numberedCards.measure(galleryFour, 1088, theme) },
      { x: 96, y: 186, w: 640, h: 392 },
    ]
    for (const box of boxes) {
      const markup = markupOf(galleryFour, box, theme)
      expect(markup, `${themeId} ${box.w}×${box.h}`).not.toContain("…")
      expect(markup, `${themeId} ${box.w}×${box.h}`).not.toContain("...")
      const { container } = svg(numberedCards.render(galleryFour, box, theme))
      expect(container.querySelector("[data-truncated]")).toBeNull()
      const painted = container.textContent ?? ""
      for (const item of GALLERY_PILL_ITEMS) {
        expect(painted).toContain(item.title)
        const titleNodes = Array.from(container.querySelectorAll("text")).filter((t) => {
          const s = t.textContent ?? ""
          return s.length > 0 && !isNumLabel(s) && item.title.includes(s)
        })
        expect(titleNodes.length, item.title).toBeGreaterThan(0)
        for (const t of titleNodes) {
          expect(Number(t.getAttribute("font-size")), item.title).toBeGreaterThanOrEqual(
            FORM_TITLE_FLOOR,
          )
        }
        const bodyNodes = Array.from(container.querySelectorAll("text")).filter((t) => {
          const s = t.textContent ?? ""
          return s.length > 0 && !isNumLabel(s) && !item.title.includes(s) && item.text.includes(s)
        })
        for (const t of bodyNodes) {
          expect(Number(t.getAttribute("font-size")), item.text).toBeGreaterThanOrEqual(
            FORM_BODY_FLOOR,
          )
        }
      }
    }
  })

  it("pathological overflow uses data-truncated, not an ellipsis", () => {
    const theme = themeCtx("pulse")
    const component = {
      type: "numbered_cards" as const,
      items: [{ title: "字".repeat(80), text: "短句" }],
    }
    const box = { x: 0, y: 0, w: 400, h: 320 }
    const markup = markupOf(component, box, theme)
    expect(markup).not.toContain("…")
    expect(markup).not.toContain("...")
    const { container } = svg(numberedCards.render(component, box, theme))
    const truncated = Array.from(container.querySelectorAll('text[data-truncated="1"]')).filter(
      (t) => !isNumLabel(t.textContent),
    )
    expect(truncated.length).toBeGreaterThan(0)
  })

  it("paints an author ellipsis that sits inside the title", () => {
    const theme = themeCtx("pulse")
    const component = {
      type: "numbered_cards" as const,
      items: [{ title: "区间 A…B", text: "短句" }],
    }
    const box = { x: 0, y: 0, w: 1088 }
    const { container } = svg(numberedCards.render(component, box, theme))
    expect(container.textContent).toContain("区间 A…B")
    expect(container.querySelector("[data-truncated]")).toBeNull()
  })

  it.each(PILL_THEMES)("%s title x yields to the shrunk badge", (themeId) => {
    const theme = themeCtx(themeId)
    const { container } = svg(numberedCards.render(four, { x: 0, y: 0, w: 1088 }, theme))
    const groups = pillGroups(container)
    expect(groups.length).toBe(4)
    for (const group of groups) {
      const pill = Array.from(group.querySelectorAll("rect")).find((r) => {
        const w = Number(r.getAttribute("width"))
        const h = Number(r.getAttribute("height"))
        return w > h * 1.6
      })
      expect(pill).toBeTruthy()
      const title = Array.from(group.querySelectorAll("text")).find((t) => !isNumLabel(t.textContent))
      expect(title).toBeTruthy()
      const textX = Number(title!.getAttribute("x"))
      if (themeId === "enterprise") {
        const badge = Array.from(group.querySelectorAll("rect")).find((r) => r !== pill)
        expect(badge).toBeTruthy()
        const right =
          Number(badge!.getAttribute("x")) + Number(badge!.getAttribute("width"))
        expect(textX).toBeGreaterThanOrEqual(right + 8)
      } else {
        const badge =
          themeId === "classroom"
            ? Array.from(group.querySelectorAll("circle")).find(
                (c) => c.getAttribute("fill") === "none",
              )
            : group.querySelector("circle")
        expect(badge).toBeTruthy()
        const badgeRight =
          Number(badge!.getAttribute("cx")) + Number(badge!.getAttribute("r"))
        expect(textX).toBeGreaterThanOrEqual(badgeRight + 8)
      }
    }
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
