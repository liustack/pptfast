import type { Component } from "@/ir"
import { resolveComponentForm } from "./form-assignments"
import { measureHangingBare, renderHangingBare } from "./forms/callout-hanging"
import { measureLeadWord, renderLeadWord } from "./forms/callout-lead-word"
import { measureTintPanel, renderTintPanel } from "./forms/callout-tint-panel"
import type { RenderDef, SvgComponent } from "./types"

type CalloutComponent = Extract<Component, { type: "callout" }>

/**
 * Callout is a theme-dispatched morph, never a left bar and never a top
 * hairline (gallery review r2 E0). Missing assignment (custom theme, or a
 * hand-built ctx with no themeId) falls through to TintPanel, the default
 * face. Built-in themes are all listed in `form-assignments.ts` and the
 * coverage test fails if one is missing.
 */
function assignmentOf(ctx: { themeId?: string }) {
  return resolveComponentForm("callout", ctx.themeId) ?? { form: "tint_panel" as const, knobs: {} }
}

export const callout: SvgComponent<CalloutComponent> = {
  measure(component, w, ctx) {
    const { form, knobs = {} } = assignmentOf(ctx)
    if (form === "hanging_bare") return measureHangingBare(component, w, ctx, knobs)
    if (form === "lead_word") return measureLeadWord(component, w, ctx, knobs)
    return measureTintPanel(component, w, ctx, knobs)
  },
  render(component, box, ctx) {
    const { form, knobs = {} } = assignmentOf(ctx)
    if (form === "hanging_bare") return renderHangingBare(component, box, ctx, knobs)
    if (form === "lead_word") return renderLeadWord(component, box, ctx, knobs)
    return renderTintPanel(component, box, ctx, knobs)
  },
}

export const renderDef: RenderDef<CalloutComponent> = {
  type: "callout",
  measure: callout.measure,
  render: callout.render,
}
