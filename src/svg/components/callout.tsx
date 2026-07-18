import type { Component } from "@/ir"
import { Icon } from "../icons"
import { layoutSvgText } from "../../lib/svg-text-layout"
import { parseEmphasis, renderEmphasisTspans, sliceEmphasisForLines, stripEmphasis } from "../emphasis"
import type { SvgComponent } from "./types"

type CalloutComponent = Extract<Component, { type: "callout" }>

const LINE_RATIO = 1.4
const PAD_Y = 16
const BAR_WIDTH = 4
const RX = 6
const MIN_HEIGHT = 56

/** Icon rendering constants — icon lives inside the left padding zone. */
const ICON_SIZE = 20
const ICON_LEFT = BAR_WIDTH + 8
const TEXT_X = ICON_LEFT + ICON_SIZE + 8

/** Map callout variant to icon name. */
const VARIANT_ICON: Record<CalloutComponent["variant"], string> = {
  info: "info",
  warn: "triangle-alert",
  tip: "lightbulb",
}

/**
 * `fontSize` is `ctx.bodyFontPx` (W4 task 3, design decision 9) — the
 * delivery-tier body baseline, not a fixed constant. `ICON_SIZE` above is a
 * bespoke, unrelated pixel constant (icon glyph box) and stays untouched.
 */
function lay(text: string, w: number, fontSize: number) {
  return layoutSvgText(stripEmphasis(text), {
    maxWidth: w - 48,
    fontSize,
    maxLines: 99,
    lineHeightRatio: LINE_RATIO,
  })
}

function accentColor(variant: CalloutComponent["variant"], ctx: { colors: { primary: string; accent: string } }): string {
  if (variant === "warn") return "#DC2626"
  if (variant === "tip") return ctx.colors.accent
  return ctx.colors.primary
}

export const callout: SvgComponent<CalloutComponent> = {
  measure(component, w, ctx) {
    const l = lay(component.text, w, ctx.bodyFontPx)
    return Math.max(l.lines.length * l.lineHeight + 2 * PAD_Y, MIN_HEIGHT)
  },
  render(component, box, ctx) {
    const l = lay(component.text, box.w, ctx.bodyFontPx)
    const lineSegments = sliceEmphasisForLines(parseEmphasis(component.text), l.lines)
    const h = Math.max(l.lines.length * l.lineHeight + 2 * PAD_Y, MIN_HEIGHT)
    const accent = accentColor(component.variant, ctx)
    const iconY = (h - ICON_SIZE) / 2
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        <rect
          x={0}
          y={0}
          width={box.w}
          height={h}
          rx={ctx.shape?.radius ?? RX}
          fill={ctx.colors.surface}
          {...(ctx.colors.cardStroke
            ? { stroke: ctx.colors.cardStroke, strokeWidth: 1 }
            : {})}
        />
        <rect x={0} y={0} width={BAR_WIDTH} height={h} fill={accent} />
        <Icon name={component.icon ?? VARIANT_ICON[component.variant]} x={ICON_LEFT} y={iconY} size={ICON_SIZE} color={accent} />
        {lineSegments.map((segments, i) => (
          <text
            key={i}
            x={TEXT_X}
            y={PAD_Y + i * l.lineHeight + l.fontSize}
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
