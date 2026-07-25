import { describe, expect, it } from "vitest"
import type { Component } from "@/ir"
import { PptfastError } from "../../errors"
import { measureComponent, renderComponent } from "./index"
import type { ComponentBox, ComponentCtx } from "./types"

// A component whose `type` isn't a member of `ComponentType` — the shape a
// type assertion (`as Component`) can produce despite `RENDER_DEFS` being a
// statically-total `Record<ComponentType, RenderDef>`: the totality guarantee
// only binds against TypeScript's own literal union, not against an arbitrary
// runtime string that bypassed `validateIr` (e.g. a hand-built IR, or a bug
// upstream of the schema gate). `RENDER_DEFS[component.type]` on this input
// used to be `undefined`, so both dispatch call sites threw a bare
// "Cannot read properties of undefined" TypeError instead of a named,
// actionable error (wave-2 final review, Minor 2).
const violatingComponent = { type: "not_a_real_component_type" } as unknown as Component

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFF",
    surface: "#EEE",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24,
}

const box: ComponentBox = { x: 0, y: 0, w: 1120, h: 100 }

describe("component dispatch guard against an invalid component.type (wave-2 sweep, T3)", () => {
  it("measureComponent throws PptfastError (not a bare TypeError) naming the invalid type and pointing at validateIr", () => {
    expect(() => measureComponent(violatingComponent, 1120, ctx)).toThrow(PptfastError)
    expect(() => measureComponent(violatingComponent, 1120, ctx)).toThrow(/not_a_real_component_type/)
    expect(() => measureComponent(violatingComponent, 1120, ctx)).toThrow(/validateIr/)
  })

  it("renderComponent throws PptfastError (not a bare TypeError) naming the invalid type and pointing at validateIr", () => {
    expect(() => renderComponent(violatingComponent, box, ctx)).toThrow(PptfastError)
    expect(() => renderComponent(violatingComponent, box, ctx)).toThrow(/not_a_real_component_type/)
    expect(() => renderComponent(violatingComponent, box, ctx)).toThrow(/validateIr/)
  })
})
