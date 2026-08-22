// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { flowchart } from "./flowchart"
import { mixHex } from "./color-mix"
import { assignedThemeIds, resolveComponentForm } from "./form-assignments"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import type { ComponentCtx } from "./types"

const sample = {
  type: "flowchart" as const,
  direction: "TB" as const,
  nodes: [
    { id: "a", label: "Start", kind: "round" as const },
    { id: "b", label: "Process", kind: "rect" as const },
    { id: "c", label: "Decision", kind: "diamond" as const },
    { id: "d", label: "End", kind: "round" as const },
  ],
  edges: [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "d", label: "yes" },
  ],
}

const BOX = { x: 80, y: 100, w: 720 }

function themed(id: string): ComponentCtx {
  return buildCtx(resolveStyle(id), {})
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

function markupOf(ctx: ComponentCtx) {
  return renderToStaticMarkup(flowchart.render(sample, BOX, ctx))
}

function nodeShapes(container: HTMLElement) {
  return Array.from(container.querySelectorAll("g[data-flow-node]")).map((g) => {
    const diamond = g.querySelector(":scope > polygon")
    const rect = g.querySelector(":scope > rect")
    const shape = diamond ?? rect
    return {
      kind: diamond ? ("diamond" as const) : ("box" as const),
      fill: shape?.getAttribute("fill") ?? "",
      stroke: shape?.getAttribute("stroke") ?? "",
      rx: rect?.getAttribute("rx") ?? null,
    }
  })
}

describe("flowchart forms: unassigned", () => {
  it("consulting markup is byte-identical to the same ctx without themeId", () => {
    const consulting = themed("consulting")
    const synthetic: ComponentCtx = { ...consulting, themeId: undefined }
    expect(markupOf(consulting)).toBe(markupOf(synthetic))
  })

  it("every unassigned canonical theme stays on the default face", () => {
    const assigned = new Set(assignedThemeIds("flowchart"))
    const consulting = markupOf(themed("consulting"))
    for (const id of ["consulting", "enterprise", "lecture", "playbill", "runway"] as const) {
      expect(assigned.has(id), id).toBe(false)
      const ctx = themed(id)
      const synthetic: ComponentCtx = { ...ctx, themeId: undefined }
      expect(markupOf(ctx), id).toBe(markupOf(synthetic))
    }
    expect(consulting.length).toBeGreaterThan(0)
  })
})

describe("flowchart forms: typed_nodes", () => {
  it("swiss assigns typed_nodes and keeps consulting unassigned", () => {
    expect(resolveComponentForm("flowchart", "swiss")?.form).toBe("typed_nodes")
    expect(resolveComponentForm("flowchart", "consulting")).toBeUndefined()
  })

  it("swiss paints round, rect, and diamond with distinct kind fills from theme tokens", () => {
    const ctx = themed("swiss")
    const { container } = svg(flowchart.render(sample, BOX, ctx))
    const shapes = nodeShapes(container)
    expect(shapes.some((s) => s.kind === "diamond")).toBe(true)
    const fills = [...new Set(shapes.map((s) => s.fill))]
    expect(fills.length).toBeGreaterThan(1)
    const roundWash = mixHex(ctx.colors.surface, ctx.colors.muted ?? ctx.colors.primary, 0.14)
    const focalTint = mixHex(ctx.colors.surface, ctx.colors.accent, 0.22)
    for (const s of shapes) {
      expect([ctx.colors.surface, ctx.colors.bg, roundWash, focalTint]).toContain(s.fill)
    }
    expect(fills).toContain(roundWash)
  })

  it("tech puts accent on at most two painted node/edge parts, using the theme accent token", () => {
    const ctx = themed("tech")
    const { container } = svg(flowchart.render(sample, BOX, ctx))
    const accent = ctx.colors.accent
    const tint = mixHex(ctx.colors.surface, accent, 0.22)
    const hits: string[] = []
    for (const el of container.querySelectorAll("rect, polygon, path")) {
      for (const attr of ["fill", "stroke"] as const) {
        const v = el.getAttribute(attr)
        if (v === accent || v === tint) hits.push(`${el.tagName.toLowerCase()}:${attr}`)
      }
    }
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.length).toBeLessThanOrEqual(2)
    expect(hits.join("")).not.toContain("#eb6c36")
  })

  it("swiss rects are square-cornered, round nodes stay capsules", () => {
    const ctx = themed("swiss")
    const { container } = svg(flowchart.render(sample, BOX, ctx))
    const nodes = Array.from(container.querySelectorAll("g[data-flow-node]"))
    const start = nodes[0]!.querySelector("rect")
    const process = nodes[1]!.querySelector("rect")
    expect(start?.getAttribute("rx")).toBe("20")
    expect(process?.getAttribute("rx")).toBe("0")
  })

  it("assigned swiss markup is not byte-identical to an unassigned theme", () => {
    expect(markupOf(themed("swiss"))).not.toBe(markupOf(themed("consulting")))
  })
})
