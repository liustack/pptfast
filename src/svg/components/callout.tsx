import type { Component } from "@/ir"
import { Icon } from "../icons"
import { layoutSvgText } from "../../lib/svg-text-layout"
import { parseEmphasis, renderEmphasisTspans, sliceEmphasisForLines, stripEmphasis } from "../emphasis"
import { resolveSemanticColor, type SemanticColorTokens } from "../ink"
import type { RenderDef, SvgComponent } from "./types"

type CalloutComponent = Extract<Component, { type: "callout" }>

const LINE_RATIO = 1.4
const PAD_Y = 16
const RX = 6
const MIN_HEIGHT = 56

/**
 * The variant accent is a rule across the *top* of the card, not a bar down
 * its left edge (visual review 2026-08-15: a left-edge bar was rejected on
 * every callout in every theme and language). A card may carry a horizontal
 * edge; a vertical one down the side reads as a quoted-text marker bolted
 * onto a panel, and it fights the card's own rounded corner.
 *
 * Drawn by layering rather than by insetting: the accent rect sits behind
 * the surface rect with the same corner radius, so the visible sliver is a
 * true top border that follows the corner curve instead of a floating dash
 * with gaps at both ends. On a square-cornered theme (radius 0) the same
 * two rects degrade to a plain full-width rule.
 */
const TOP_RULE_H = 3

/** Icon rendering constants — icon lives inside the left padding zone. */
const PAD_X = 14
const ICON_SIZE = 20
const ICON_LEFT = PAD_X
const TEXT_X = ICON_LEFT + ICON_SIZE + 10

/** Map callout variant to icon name. */
const VARIANT_ICON: Record<CalloutComponent["variant"], string> = {
  info: "info",
  warn: "triangle-alert",
  tip: "lightbulb",
}

/**
 * `fontSize` is `ctx.bodyFontPx` (W4 task 3, design decision 9) — the
 * pacing-tier body baseline, not a fixed constant. `ICON_SIZE` above is a
 * bespoke, unrelated pixel constant (icon glyph box) and stays untouched.
 */
function lay(text: string, w: number, fontSize: number) {
  return layoutSvgText(stripEmphasis(text), {
    maxWidth: w - TEXT_X - PAD_X,
    fontSize,
    maxLines: 99,
    lineHeightRatio: LINE_RATIO,
  })
}

/**
 * The `warn` variant's red is a theme token, not a baked hex: a theme sets
 * `colors.warning` (or `colors.danger` for the whole alert family) and this
 * card's top rule and icon follow it. A theme that declares neither resolves
 * to the same `#DC2626` this function used to return outright — see
 * `resolveSemanticColor`'s own doc comment for the fallback order and for why
 * the raw color, not an `accessibleInk`-calibrated one, is what a painted
 * shape wants.
 */
function accentColor(
  variant: CalloutComponent["variant"],
  ctx: { colors: SemanticColorTokens & { primary: string; accent: string } },
): string {
  if (variant === "warn") return resolveSemanticColor("warning", ctx.colors)
  if (variant === "tip") return ctx.colors.accent
  return ctx.colors.primary
}

export const callout: SvgComponent<CalloutComponent> = {
  measure(component, w, ctx) {
    const l = lay(component.text, w, ctx.bodyFontPx)
    return Math.max(l.lines.length * l.lineHeight + 2 * PAD_Y + TOP_RULE_H, MIN_HEIGHT)
  },
  render(component, box, ctx) {
    const l = lay(component.text, box.w, ctx.bodyFontPx)
    const lineSegments = sliceEmphasisForLines(parseEmphasis(component.text), l.lines)
    const h = Math.max(l.lines.length * l.lineHeight + 2 * PAD_Y + TOP_RULE_H, MIN_HEIGHT)
    const accent = accentColor(component.variant, ctx)
    const radius = ctx.shape?.radius ?? RX
    // Icon centers on the text block, not on the card, so the top rule does
    // not drag it off-center against the copy it belongs to.
    const iconY = TOP_RULE_H + (h - TOP_RULE_H - ICON_SIZE) / 2
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        <rect x={0} y={0} width={box.w} height={h} rx={radius} fill={accent} />
        <rect
          x={0}
          y={TOP_RULE_H}
          width={box.w}
          height={h - TOP_RULE_H}
          rx={radius}
          fill={ctx.colors.surface}
          {...(ctx.colors.cardStroke
            ? { stroke: ctx.colors.cardStroke, strokeWidth: 1 }
            : {})}
        />
        <Icon name={component.icon ?? VARIANT_ICON[component.variant]} x={ICON_LEFT} y={iconY} size={ICON_SIZE} color={accent} />
        {lineSegments.map((segments, i) => (
          <text
            key={i}
            x={TEXT_X}
            y={TOP_RULE_H + PAD_Y + i * l.lineHeight + l.fontSize}
            fontFamily={ctx.fonts.body}
            fontSize={l.fontSize}
            fill={ctx.colors.text}
            dominantBaseline="alphabetic"
          >
            {renderEmphasisTspans(segments, { accent: ctx.colors.accent, baseFill: ctx.colors.text })}
          </text>
        ))}
      </g>
    )
  },
}

export const renderDef: RenderDef<CalloutComponent> = { type: "callout", measure: callout.measure, render: callout.render }
