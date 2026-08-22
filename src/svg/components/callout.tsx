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
 * The variant accent is a dedicated hairline across the *top* of the card,
 * not a bar down its left edge (visual review 2026-08-15, restated
 * 2026-08-22). A stacked full-size accent rect behind the surface leaked
 * color around the left/right rounded corners and read as the leftover
 * left bar. The hairline is its own 3px rect sitting on the card's top
 * edge. The surface is a single card, never a second full-size fill.
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
 * card's top rule and icon follow it. All 17 built-in themes name their own
 * caution color (visual review round 4: "为啥这个提醒长卡片上边框总是红色啊，
 * 无论主题什么配色，这个总是红色"), so the top rule is ink's vermilion on
 * `ink`, marigold on `bloom`, stage gold on `campaign`. A theme that declares
 * neither token resolves to the same `#DC2626` this function used to return
 * outright — see `resolveSemanticColor`'s own doc comment for the fallback
 * order and for why the raw color, not an `accessibleInk`-calibrated one, is
 * what a painted shape wants.
 *
 * The three variants stay apart by color *and* by icon: `info` takes
 * `primary`, `tip` takes `accent`, `warn` takes the caution color, and each
 * theme's caution color is picked to sit clear of its own accent (see each
 * `themes/<id>.ts`'s inline note on the token).
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
        <rect
          x={0}
          y={0}
          width={box.w}
          height={h}
          rx={radius}
          fill={ctx.colors.surface}
          {...(ctx.colors.cardStroke
            ? { stroke: ctx.colors.cardStroke, strokeWidth: 1 }
            : {})}
        />
        <rect x={0} y={0} width={box.w} height={TOP_RULE_H} fill={accent} />
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
