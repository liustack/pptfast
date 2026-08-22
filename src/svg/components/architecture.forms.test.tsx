// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { architecture } from "./architecture"
import { mixHex } from "./color-mix"
import { resolveComponentForm } from "./form-assignments"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import type { ComponentCtx } from "./types"

const sample = {
  type: "architecture" as const,
  layers: [
    { title: "Edge", items: ["CDN"] },
    { title: "App", items: ["API"] },
    { title: "Data", items: ["DB"] },
  ],
}

const BOX = { x: 80, y: 100, w: 1088 }

function themed(id: string): ComponentCtx {
  return buildCtx(resolveStyle(id), {})
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

describe("architecture forms: unassigned", () => {
  it("campaign markup is byte-identical to the same ctx without themeId", () => {
    const campaign = themed("campaign")
    const synthetic: ComponentCtx = { ...campaign, themeId: undefined }
    const a = renderToStaticMarkup(architecture.render(sample, BOX, campaign))
    const b = renderToStaticMarkup(architecture.render(sample, BOX, synthetic))
    expect(a).toBe(b)
  })

  it("consulting is assigned layer_stack, campaign is not", () => {
    expect(resolveComponentForm("architecture", "consulting")?.form).toBe("layer_stack")
    expect(resolveComponentForm("architecture", "campaign")).toBeUndefined()
  })
})

describe("architecture forms: layer_stack knobs", () => {
  it("consulting tints the first layer with the theme accent", () => {
    const ctx = themed("consulting")
    const { container } = svg(architecture.render(sample, BOX, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    expect(rects.length).toBe(3)
    const tint = mixHex(ctx.colors.surface, ctx.colors.accent, 0.2)
    expect(rects[0]!.getAttribute("fill")).toBe(tint)
    expect(rects[1]!.getAttribute("fill")).not.toBe(tint)
  })

  it("swiss draws hairlines without band fills", () => {
    const ctx = themed("swiss")
    const { container } = svg(architecture.render(sample, BOX, ctx))
    expect(container.querySelectorAll("rect").length).toBe(0)
    expect(container.querySelectorAll("line").length).toBe(2)
  })
})
