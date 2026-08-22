import type { Component } from "@/ir"
import { isCjk } from "../../../lib/text-script"
import { layoutSvgText, measureTextUnits } from "../../../lib/svg-text-layout"
import {
  parseEmphasis,
  sliceEmphasisForLines,
  stripEmphasis,
  type EmphasisSegment,
} from "../../emphasis"
import { resolveSemanticColor, type SemanticColorTokens } from "../../ink"
import { mixHex } from "../color-mix"
import type { FormKnobs } from "../form-assignments"

export type CalloutComponent = Extract<Component, { type: "callout" }>

export const LINE_RATIO = 1.4
export const PAD_Y = 16
export const PAD_X = 20
export const ICON_SIZE = 22
export const ICON_GAP = 14
export const MIN_HEIGHT = 56
export const STAMP_SIZE = 18
export const STAMP_TRACKING = 3
export const MARK_GAP = 16

export const VARIANT_ICON: Record<CalloutComponent["variant"], string> = {
  info: "info",
  warn: "triangle-alert",
  tip: "lightbulb",
}

export const CALLOUT_LEAD_WORD = {
  warn: { zh: "风险", en: "Risk" },
  info: { zh: "注意", en: "Note" },
  tip: { zh: "提示", en: "Tip" },
} as const

export const CALLOUT_STAMP: Record<CalloutComponent["variant"], string> = {
  warn: "WARN:",
  info: "NOTE:",
  tip: "TIP:",
}

export function calloutLeadWord(variant: CalloutComponent["variant"], text: string): string {
  const pair = CALLOUT_LEAD_WORD[variant]
  return isCjk(stripEmphasis(text)) ? pair.zh : pair.en
}

export function accentColor(
  variant: CalloutComponent["variant"],
  ctx: { colors: SemanticColorTokens & { primary: string; accent: string } },
): string {
  if (variant === "warn") return resolveSemanticColor("warning", ctx.colors)
  if (variant === "tip") return ctx.colors.accent
  return ctx.colors.primary
}

export function leadInk(
  variant: CalloutComponent["variant"],
  ctx: { colors: SemanticColorTokens & { primary: string; accent: string } },
  knobs: FormKnobs,
): string {
  if (knobs.iconInk === "accent") return ctx.colors.accent
  return accentColor(variant, ctx)
}

export function iconName(component: CalloutComponent): string {
  return component.icon ?? VARIANT_ICON[component.variant]
}

export function panelRadius(knobs: FormKnobs): number {
  if (knobs.radius === "square") return 0
  if (knobs.radius === "round") return 8
  return 2
}

export function tintPanelFill(colors: { bg: string; muted: string }): string {
  return mixHex(colors.bg, colors.muted, 0.08)
}

export function bodyIsBold(knobs: FormKnobs): boolean {
  return knobs.weight === "bold" || knobs.weight === "black"
}

export function leadFontWeight(knobs: FormKnobs): "700" | "800" {
  return knobs.weight === "black" ? "800" : "700"
}

export interface CalloutLaid {
  fontSize: number
  lineHeight: number
  lineSegments: EmphasisSegment[][]
  contentH: number
}

export function layCalloutBody(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily?: string,
  bold?: boolean,
): CalloutLaid {
  const l = layoutSvgText(stripEmphasis(text), {
    maxWidth,
    fontSize,
    maxLines: 99,
    lineHeightRatio: LINE_RATIO,
    fontFamily,
    bold,
  })
  return {
    fontSize: l.fontSize,
    lineHeight: l.lineHeight,
    lineSegments: sliceEmphasisForLines(parseEmphasis(text), l.lines),
    contentH: l.lines.length * l.lineHeight,
  }
}

export function hangingIndent(
  label: string,
  fontSize: number,
  opts?: { bold?: boolean; fontFamily?: string; letterSpacing?: number },
): number {
  const units = measureTextUnits(label, { bold: opts?.bold, fontFamily: opts?.fontFamily })
  const tracking = Math.max(0, Array.from(label).length - 1) * (opts?.letterSpacing ?? 0)
  return Math.ceil(units * fontSize + tracking)
}

export function blockHeight(contentH: number): number {
  return Math.max(contentH + 2 * PAD_Y, MIN_HEIGHT)
}

export function contentTop(blockH: number, contentH: number): number {
  return (blockH - contentH) / 2
}
