// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { assertSubset } from "../subset-validate"
import { parseSvgRoot } from "../serialize"
import { cycle } from "./cycle"
import { FORM_BODY_FLOOR, FORM_BODY_TITLE_CAP, capFormBody } from "./forms/legibility"
import { mixHex } from "./color-mix"
import { accessibleInk, readableOn } from "../ink"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import type { ComponentCtx } from "./types"

const four = {
  type: "cycle" as const,
  title: "闭环",
  items: [
    { label: "采集", description: "传感器接入" },
    { label: "清洗", description: "规则校验" },
    { label: "训练", description: "模型迭代" },
    { label: "回流", description: "误报回灌" },
  ],
}

const three = {
  type: "cycle" as const,
  items: [
    { label: "Plan", description: "Set goals" },
    { label: "Do", description: "Ship it" },
    { label: "Check", description: "Look back" },
  ],
}

const eight = {
  type: "cycle" as const,
  title: "Eight stages",
  items: Array.from({ length: 8 }, (_, i) => ({
    label: `S${i + 1}`,
    description: `Stage ${i + 1} note`,
  })),
}

const untitledFour = {
  type: "cycle" as const,
  items: four.items,
}

const FABRICATED_SLOGANS = ["数据底座", "中枢", "总目", "主场", "核心假设", "主题发布"]

function themed(id: string): ComponentCtx {
  return buildCtx(resolveStyle(id), {})
}

function svg(node: React.ReactElement) {
  return render(<svg viewBox="0 0 1280 720">{node}</svg>)
}

function markupOf(component: typeof four, box: { x: number; y: number; w: number }, ctx: ComponentCtx) {
  return renderToStaticMarkup(<svg viewBox="0 0 1280 720">{cycle.render(component, box, ctx)}</svg>)
}

function parseTranslate(el: Element): { dx: number; dy: number } {
  const t = el.getAttribute("transform") ?? ""
  const m = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(t)
  return { dx: m ? Number(m[1]) : 0, dy: m ? Number(m[2]) : 0 }
}

function assertShapesInBox(
  root: Element,
  box: { x: number; y: number; w: number; h: number },
) {
  const tol = 2
  const walk = (el: Element, ox: number, oy: number) => {
    const { dx, dy } = parseTranslate(el)
    const ax = ox + dx
    const ay = oy + dy
    const tag = el.tagName.toLowerCase()
    const hit = (x: number, y: number) => {
      expect(x).toBeGreaterThanOrEqual(box.x - tol)
      expect(x).toBeLessThanOrEqual(box.x + box.w + tol)
      expect(y).toBeGreaterThanOrEqual(box.y - tol)
      expect(y).toBeLessThanOrEqual(box.y + box.h + tol)
    }
    if (tag === "circle") {
      const cx = ax + Number(el.getAttribute("cx"))
      const cy = ay + Number(el.getAttribute("cy"))
      const r = Number(el.getAttribute("r"))
      hit(cx - r, cy - r)
      hit(cx + r, cy + r)
    } else if (tag === "rect") {
      const x = ax + Number(el.getAttribute("x"))
      const y = ay + Number(el.getAttribute("y"))
      hit(x, y)
      hit(x + Number(el.getAttribute("width")), y + Number(el.getAttribute("height")))
    } else if (tag === "line") {
      hit(ax + Number(el.getAttribute("x1")), ay + Number(el.getAttribute("y1")))
      hit(ax + Number(el.getAttribute("x2")), ay + Number(el.getAttribute("y2")))
    }
    for (const child of Array.from(el.children)) walk(child, ax, ay)
  }
  walk(root, 0, 0)
}

function allowedPaints(ctx: ComponentCtx): Set<string> {
  const c = ctx.colors
  const hexes = [
    c.bg,
    c.surface,
    c.primary,
    c.accent,
    c.text,
    c.muted,
    c.border,
    c.danger,
    c.warning,
    c.success,
    ...(c.chartPalette ?? []),
    "#FFFFFF",
    "#0A0E14",
    "none",
    mixHex(c.surface, c.primary, 0.22),
    mixHex(c.surface, c.primary, 0.35),
    mixHex(c.surface, c.accent, 0.35),
    mixHex(c.surface, c.primary, 0.72),
    mixHex(c.surface, c.accent, 0.45),
    readableOn(c.surface),
    readableOn(c.primary),
    readableOn(c.accent),
    readableOn(c.bg),
    accessibleInk(c.accent, c.surface, 12),
    accessibleInk(c.accent, c.surface, 16),
    accessibleInk(c.accent, c.surface, 22),
    accessibleInk(c.accent, c.primary, 16),
    accessibleInk(c.muted, c.surface, 12),
    accessibleInk(c.muted, c.surface, 13),
    accessibleInk(c.text, c.surface, 16),
    accessibleInk(c.primary, c.surface, 16),
    accessibleInk(c.accent, c.bg, 16),
  ]
  return new Set(hexes.filter((h): h is string => !!h))
}

function paintsOf(container: HTMLElement): string[] {
  const out: string[] = []
  for (const el of container.querySelectorAll("circle, rect, path, line, text, polygon")) {
    for (const attr of ["fill", "stroke"]) {
      const v = el.getAttribute(attr)
      if (v) out.push(v)
    }
  }
  return out
}

describe("cycle forms: CycleLoop", () => {
  it("museum: dashed ring path and a larger first node", () => {
    const ctx = themed("museum")
    const { container } = svg(cycle.render(four, { x: 80, y: 80, w: 1088 }, ctx))
    const ring = Array.from(container.querySelectorAll("path")).find(
      (p) => (p.getAttribute("fill") ?? "none") === "none",
    )
    expect(ring).toBeTruthy()
    expect(ring!.getAttribute("d") ?? "").toMatch(/A /)
    const dash = ring!.getAttribute("stroke-dasharray") ?? ""
    expect(dash.length).toBeGreaterThan(0)
    const dashOn = Number(dash.trim().split(/[\s,]+/)[0])
    expect(dashOn).toBeGreaterThan(2)

    const circles = Array.from(container.querySelectorAll("circle"))
    expect(circles.length).toBe(4)
    const r0 = Number(circles[0]!.getAttribute("r"))
    for (const c of circles.slice(1)) {
      expect(r0).toBeGreaterThan(Number(c.getAttribute("r")))
    }
    expect(container.querySelectorAll("marker").length).toBe(0)
  })

  it("museum 3–4 char CJK node labels wrap instead of ellipsizing 试运行", () => {
    const ctx = themed("museum")
    const ir = {
      type: "cycle" as const,
      title: "产品进展",
      items: [
        { label: "需求确认", description: "对齐范围与验收口径" },
        { label: "现场勘测", description: "核对安装点位" },
        { label: "设备接入", description: "完成现场接线" },
        { label: "模型调优", description: "压低误报占比" },
        { label: "试运行", description: "小流量观察误报" },
      ],
    }
    const box = { x: 96, y: 186, w: 632 }
    const { container } = svg(cycle.render(ir, box, ctx))
    const nodeTexts = Array.from(container.querySelectorAll("[data-audit-box] text"))
    const runHits = nodeTexts.filter((t) => /试|运|行/.test(t.textContent ?? ""))
    expect(runHits.length).toBeGreaterThan(0)
    const joined = runHits.map((t) => t.textContent ?? "").join("")
    expect(joined).toContain("试")
    expect(joined).toContain("运")
    expect(joined).toContain("行")
    expect(joined).not.toMatch(/试…/)
    for (const t of runHits) {
      expect(Number(t.getAttribute("font-size")), `"${t.textContent}"`).toBeGreaterThanOrEqual(FORM_BODY_FLOOR)
    }
    const descHits = Array.from(container.querySelectorAll("text")).filter((t) =>
      (t.textContent ?? "").includes("小流量"),
    )
    for (const t of descHits) {
      expect(Number(t.getAttribute("font-size")), `"${t.textContent}"`).toBeGreaterThanOrEqual(FORM_BODY_FLOOR)
    }
  })

  it("museum loop scales into a 640×392 slot, stays centered, and caps in-circle type", () => {
    const ctx = themed("museum")
    const ir = {
      type: "cycle" as const,
      title: "产品进展",
      items: [
        { label: "需求确认", description: "对齐范围与验收口径" },
        { label: "现场勘测", description: "核对安装点位" },
        { label: "设备接入", description: "完成现场接线" },
        { label: "模型调优", description: "压低误报占比" },
        { label: "试运行", description: "小流量观察误报" },
      ],
    }
    const box = { x: 96, y: 186, w: 640, h: 392 }
    const { container } = svg(cycle.render(ir, box, ctx))
    const root = container.querySelector("svg") ?? container
    const g = root.querySelector("g")!
    const { dx, dy } = parseTranslate(g)
    const circles = Array.from(container.querySelectorAll("circle"))
    expect(circles.length).toBe(5)
    const nodes = circles.map((c) => ({
      cx: dx + Number(c.getAttribute("cx")),
      cy: dy + Number(c.getAttribute("cy")),
      r: Number(c.getAttribute("r")),
    }))
    const minX = Math.min(...nodes.map((n) => n.cx - n.r))
    const maxX = Math.max(...nodes.map((n) => n.cx + n.r))
    const minY = Math.min(...nodes.map((n) => n.cy - n.r))
    const maxY = Math.max(...nodes.map((n) => n.cy + n.r))
    expect(minX).toBeGreaterThanOrEqual(box.x - 2)
    expect(maxX).toBeLessThanOrEqual(box.x + box.w + 2)
    expect(minY).toBeGreaterThanOrEqual(box.y - 2)
    expect(maxY).toBeLessThanOrEqual(box.y + box.h + 2)
    expect(Math.abs((minX + maxX) / 2 - (box.x + box.w / 2))).toBeLessThanOrEqual(8)
    const nodeTexts = Array.from(container.querySelectorAll("[data-audit-box] text"))
    expect(nodeTexts.length).toBeGreaterThan(0)
    for (const t of nodeTexts) {
      const fs = Number(t.getAttribute("font-size"))
      expect(fs).toBeGreaterThanOrEqual(FORM_BODY_FLOOR)
      const boxAttr = t.closest("[data-audit-box]")?.getAttribute("data-audit-box") ?? ""
      const r = Number(boxAttr.split(",")[2] ?? 0) / 2
      expect(fs).toBeLessThanOrEqual(Math.max(FORM_BODY_FLOOR, r * 0.55) + 0.5)
    }
    const titleFs = Math.max(...nodeTexts.map((t) => Number(t.getAttribute("font-size"))))
    const descHits = Array.from(container.querySelectorAll("text")).filter((t) =>
      (t.textContent ?? "").includes("小流量"),
    )
    for (const t of descHits) {
      const fs = Number(t.getAttribute("font-size"))
      expect(fs).toBeLessThanOrEqual(capFormBody(titleFs, 99) + 0.05)
      expect(fs).toBeLessThanOrEqual(titleFs * FORM_BODY_TITLE_CAP + FORM_BODY_FLOOR)
    }
  })

  it("journal: dotted ring path", () => {
    const ctx = themed("journal")
    const { container } = svg(cycle.render(four, { x: 80, y: 80, w: 1088 }, ctx))
    const ring = Array.from(container.querySelectorAll("path")).find(
      (p) => (p.getAttribute("fill") ?? "none") === "none",
    )
    const dash = ring!.getAttribute("stroke-dasharray") ?? ""
    const dashOn = Number(dash.trim().split(/[\s,]+/)[0])
    expect(dashOn).toBeGreaterThan(0)
    expect(dashOn).toBeLessThanOrEqual(2)
  })
})

describe("cycle forms: unassigned default face", () => {
  it("consulting markup equals the default renderer (no themeId)", () => {
    const consulting = themed("consulting")
    const noThemeId: ComponentCtx = { ...consulting, themeId: undefined }
    const box = { x: 80, y: 100, w: 900 }
    expect(markupOf(four, box, consulting)).toBe(markupOf(four, box, noThemeId))
  })
})

describe("cycle forms: HubSpoke", () => {
  it("insight: center circle + n capsules + n spoke lines, no marker", () => {
    const ctx = themed("insight")
    const { container } = svg(cycle.render(four, { x: 80, y: 80, w: 1088 }, ctx))
    expect(container.querySelectorAll("circle").length).toBeGreaterThanOrEqual(5)
    expect(container.querySelectorAll("rect").length).toBe(4)
    expect(container.querySelectorAll("line").length).toBe(4)
    expect(container.querySelectorAll("marker").length).toBe(0)
    const hub = container.querySelector("circle")
    expect(hub).toBeTruthy()
    expect(hub!.getAttribute("fill")).toBe(ctx.colors.surface)
    expect(hub!.getAttribute("stroke")).toBe(ctx.colors.accent)
  })

  it("academic hub is solid primary with letter badges", () => {
    const ctx = themed("academic")
    const { container } = svg(cycle.render(four, { x: 80, y: 80, w: 1088 }, ctx))
    const hub = container.querySelector("circle")
    expect(hub!.getAttribute("fill")).toBe(ctx.colors.primary)
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toEqual(expect.arrayContaining(["A", "B", "C", "D"]))
  })

  it("spoke endpoints sit on the hub circle and the capsule rect", () => {
    const ctx = themed("insight")
    const box = { x: 80, y: 80, w: 1088 }
    const { container } = svg(cycle.render(four, box, ctx))
    const root = container.querySelector("svg") ?? container
    const { dx, dy } = parseTranslate(root.querySelector("g")!)
    const hub = Array.from(container.querySelectorAll("circle")).reduce((best, c) =>
      Number(c.getAttribute("r")) > Number(best.getAttribute("r")) ? c : best,
    )
    const hx = dx + Number(hub.getAttribute("cx"))
    const hy = dy + Number(hub.getAttribute("cy"))
    const hr = Number(hub.getAttribute("r"))
    const caps = Array.from(container.querySelectorAll("rect")).map((r) => ({
      x: dx + Number(r.getAttribute("x")),
      y: dy + Number(r.getAttribute("y")),
      w: Number(r.getAttribute("width")),
      h: Number(r.getAttribute("height")),
    }))
    const lines = Array.from(container.querySelectorAll("line"))
    expect(lines).toHaveLength(caps.length)
    const onHub = (x: number, y: number) => Math.abs(Math.hypot(x - hx, y - hy) - hr) <= 1
    const onCap = (x: number, y: number, cap: (typeof caps)[number]) =>
      x >= cap.x - 1 && x <= cap.x + cap.w + 1 && y >= cap.y - 1 && y <= cap.y + cap.h + 1
    for (const line of lines) {
      const x1 = dx + Number(line.getAttribute("x1"))
      const y1 = dy + Number(line.getAttribute("y1"))
      const x2 = dx + Number(line.getAttribute("x2"))
      const y2 = dy + Number(line.getAttribute("y2"))
      const hubEnd = onHub(x1, y1) || onHub(x2, y2)
      const capEnd = caps.some((cap) => onCap(x1, y1, cap) || onCap(x2, y2, cap))
      expect(hubEnd).toBe(true)
      expect(capEnd).toBe(true)
    }
  })

  it("campaign stays hub_spoke (capsules, not petals)", () => {
    const ctx = themed("campaign")
    const { container } = svg(cycle.render(four, { x: 80, y: 80, w: 1088 }, ctx))
    expect(container.querySelectorAll("rect").length).toBe(4)
    expect(container.querySelectorAll("line").length).toBe(4)
    const filledPetals = Array.from(container.querySelectorAll("path")).filter((p) => {
      const fill = p.getAttribute("fill")
      return !!fill && fill !== "none"
    })
    expect(filledPetals.length).toBe(0)
    const badges = Array.from(container.querySelectorAll("circle")).slice(1)
    expect(badges.some((c) => c.getAttribute("fill") === ctx.colors.accent)).toBe(true)
  })

  function cycleN(n: number) {
    return {
      type: "cycle" as const,
      title: "闭环",
      items: Array.from({ length: n }, (_, i) => ({
        label: `Item ${i + 1}`,
        description: `Note ${i + 1}`,
      })),
    }
  }

  function hubCapsules(n: number, theme = "campaign") {
    const ctx = themed(theme)
    const box = { x: 80, y: 80, w: 1088 }
    const { container } = svg(cycle.render(cycleN(n), box, ctx))
    const root = container.querySelector("svg") ?? container
    const { dx, dy } = parseTranslate(root.querySelector("g")!)
    const caps = Array.from(container.querySelectorAll("rect")).map((r) => ({
      x: dx + Number(r.getAttribute("x")),
      y: dy + Number(r.getAttribute("y")),
      w: Number(r.getAttribute("width")),
      h: Number(r.getAttribute("height")),
    }))
    return { box, caps }
  }

  it("n=3,5,7 capsule group bbox midpoint matches the box midline", () => {
    for (const n of [3, 5, 7]) {
      const { box, caps } = hubCapsules(n)
      expect(caps, `n=${n}`).toHaveLength(n)
      const minX = Math.min(...caps.map((c) => c.x))
      const maxX = Math.max(...caps.map((c) => c.x + c.w))
      const mid = (minX + maxX) / 2
      expect(Math.abs(mid - (box.x + box.w / 2)), `n=${n} mid ${mid}`).toBeLessThanOrEqual(2)
    }
  })

  it("n=5 and n=7 leftover is on the midline and side capsules share a column x", () => {
    for (const n of [5, 7]) {
      const { box, caps } = hubCapsules(n)
      const boxMid = box.x + box.w / 2
      const top = caps.reduce((a, b) => (a.y < b.y ? a : b))
      expect(Math.abs(top.x + top.w / 2 - boxMid), `n=${n} leftover`).toBeLessThanOrEqual(2)
      const sides = caps.filter((c) => Math.abs(c.y - top.y) > 2)
      const leftX = [...new Set(sides.filter((c) => c.x + c.w / 2 < boxMid).map((c) => Math.round(c.x)))]
      const rightX = [...new Set(sides.filter((c) => c.x + c.w / 2 > boxMid).map((c) => Math.round(c.x)))]
      expect(leftX, `n=${n} left column`).toHaveLength(1)
      expect(rightX, `n=${n} right column`).toHaveLength(1)
    }
  })
})

describe("cycle forms: PetalWheel", () => {
  it("tech: more than 2 filled petal paths and a hub circle", () => {
    const six = {
      type: "cycle" as const,
      title: "能力面",
      items: four.items.concat([
        { label: "告警", description: "分级推送" },
        { label: "复盘", description: "回流训练" },
      ]),
    }
    const ctx = themed("tech")
    const { container } = svg(cycle.render(six, { x: 80, y: 80, w: 1088 }, ctx))
    const filled = Array.from(container.querySelectorAll("path")).filter((p) => {
      const fill = p.getAttribute("fill")
      return !!fill && fill !== "none"
    })
    expect(filled.length).toBeGreaterThan(2)
    expect(filled.length).toBe(6)
    expect(container.querySelectorAll("circle").length).toBeGreaterThanOrEqual(1)
    const hub = Array.from(container.querySelectorAll("circle")).reduce((best, c) =>
      Number(c.getAttribute("r")) > Number(best.getAttribute("r")) ? c : best,
    )
    expect(Number(hub.getAttribute("r"))).toBeGreaterThan(20)
    expect(container.querySelectorAll("marker").length).toBe(0)
  })

  it("paints an icon on a petal when the item names one", () => {
    const withIcon = {
      type: "cycle" as const,
      title: "能力面",
      items: [
        { label: "采集", description: "传感器接入", icon: "rocket" },
        { label: "清洗", description: "规则校验" },
        { label: "训练", description: "模型迭代" },
        { label: "回流", description: "误报回灌" },
      ],
    }
    const ctx = themed("tech")
    const markup = markupOf(withIcon as typeof four, { x: 80, y: 80, w: 1088 }, ctx)
    expect(markup).toContain("M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2")
  })

  it("distinguishes petals by token fills when no icon is set", () => {
    const ctx = themed("tech")
    const { container } = svg(cycle.render(four, { x: 80, y: 80, w: 1088 }, ctx))
    const fills = Array.from(container.querySelectorAll("path"))
      .map((p) => p.getAttribute("fill"))
      .filter((f): f is string => !!f && f !== "none")
    expect(new Set(fills).size).toBeGreaterThan(1)
    const allowed = allowedPaints(ctx)
    for (const fill of fills) expect(allowed.has(fill)).toBe(true)
  })

  it("spoke lines meet the petal outer edge and the callout column", () => {
    const ctx = themed("tech")
    const { container } = svg(cycle.render(four, { x: 80, y: 80, w: 1088 }, ctx))
    const hub = Array.from(container.querySelectorAll("circle")).reduce((best, c) =>
      Number(c.getAttribute("r")) > Number(best.getAttribute("r")) ? c : best,
    )
    const hx = Number(hub.getAttribute("cx"))
    const hy = Number(hub.getAttribute("cy"))
    const hubR = Number(hub.getAttribute("r"))
    const nears = Array.from(container.querySelectorAll("line")).map((line) => {
      const x1 = Number(line.getAttribute("x1"))
      const y1 = Number(line.getAttribute("y1"))
      const x2 = Number(line.getAttribute("x2"))
      const y2 = Number(line.getAttribute("y2"))
      return Math.min(Math.hypot(x1 - hx, y1 - hy), Math.hypot(x2 - hx, y2 - hy))
    })
    expect(nears.length).toBeGreaterThan(0)
    for (const d of nears) expect(d).toBeGreaterThan(hubR + 8)
    expect(Math.max(...nears) - Math.min(...nears)).toBeLessThanOrEqual(1)
  })
})

describe("cycle forms: subset, box, title, tokens", () => {
  it("assertSubset on assigned forms", () => {
    const cases = [
      { theme: "museum", ir: four },
      { theme: "insight", ir: four },
      { theme: "tech", ir: eight },
    ] as const
    for (const { theme, ir } of cases) {
      const markup = markupOf(ir, { x: 40, y: 40, w: 1200 }, themed(theme))
      expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
    }
  })

  it("n=3 and n=8 stay in the component box for each form", () => {
    const cases: Array<{ theme: string; ir: typeof three | typeof eight }> = [
      { theme: "museum", ir: three },
      { theme: "museum", ir: eight },
      { theme: "insight", ir: three },
      { theme: "insight", ir: eight },
      { theme: "tech", ir: three },
      { theme: "tech", ir: eight },
    ]
    for (const { theme, ir } of cases) {
      const ctx = themed(theme)
      const box = { x: 80, y: 60, w: 1088 }
      const h = cycle.measure(ir, box.w, ctx)
      expect(h).toBeGreaterThan(0)
      expect(h).toBeLessThan(500)
      const { container } = svg(cycle.render(ir, box, ctx))
      const root = container.querySelector("svg") ?? container
      assertShapesInBox(root, { ...box, h })
    }
  })

  it("missing title: hub has no fabricated Chinese slogan", () => {
    for (const theme of ["insight", "academic", "campaign", "tech", "heritage"]) {
      const ctx = themed(theme)
      const { container } = svg(cycle.render(untitledFour, { x: 80, y: 80, w: 1088 }, ctx))
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent ?? "")
      for (const slogan of FABRICATED_SLOGANS) {
        expect(texts.some((t) => t.includes(slogan))).toBe(false)
      }
      expect(texts.join("")).not.toMatch(/数据底座|中枢|总目|主场/)
    }
  })

  it("paints use theme tokens, not board hex literals", () => {
    const cases = ["museum", "insight", "academic", "campaign", "tech", "heritage"] as const
    for (const theme of cases) {
      const ctx = themed(theme)
      const { container } = svg(cycle.render(four, { x: 80, y: 80, w: 1088 }, ctx))
      const allowed = allowedPaints(ctx)
      for (const paint of paintsOf(container)) {
        expect(allowed.has(paint), `${theme} unexpected paint ${paint}`).toBe(true)
      }
    }
  })
})
