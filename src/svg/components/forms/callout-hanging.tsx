import { Icon } from "../../icons"
import { renderEmphasisTspans } from "../../emphasis"
import { accessibleInk } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import {
  CALLOUT_STAMP,
  ICON_GAP,
  ICON_SIZE,
  MARK_GAP,
  STAMP_SIZE,
  STAMP_TRACKING,
  accentColor,
  blockHeight,
  contentTop,
  hangingIndent,
  iconName,
  layCalloutBody,
  type CalloutComponent,
} from "./callout-shared"

function stampLabel(component: CalloutComponent, knobs: FormKnobs): string | null {
  return knobs.stamp === true ? CALLOUT_STAMP[component.variant] : null
}

function layout(component: CalloutComponent, w: number, ctx: ComponentCtx, knobs: FormKnobs) {
  const stamp = stampLabel(component, knobs)
  const indent = stamp
    ? hangingIndent(stamp, STAMP_SIZE, {
        fontFamily: ctx.fonts.mono,
        letterSpacing: STAMP_TRACKING,
      }) + MARK_GAP
    : ICON_SIZE + ICON_GAP
  const laid = layCalloutBody(
    component.text,
    Math.max(1, w - indent),
    ctx.bodyFontPx,
    ctx.fonts.body,
  )
  const h = blockHeight(laid.contentH)
  return { laid, indent, stamp, h, top: contentTop(h, laid.contentH) }
}

export function measureHangingBare(
  component: CalloutComponent,
  w: number,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): number {
  return layout(component, w, ctx, knobs).h
}

export function renderHangingBare(
  component: CalloutComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
) {
  const { laid, indent, stamp, top } = layout(component, box.w, ctx, knobs)
  const page = ctx.defaultBg ?? ctx.colors.bg
  const ink = accessibleInk(ctx.colors.text, page, laid.fontSize)
  const markColor = accentColor(component.variant, ctx)
  const firstBaseline = top + laid.fontSize
  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {stamp ? (
        <text
          x={0}
          y={firstBaseline}
          fontFamily={ctx.fonts.mono}
          fontSize={STAMP_SIZE}
          letterSpacing={STAMP_TRACKING}
          fill={markColor}
          dominantBaseline="alphabetic"
        >
          {stamp}
        </text>
      ) : (
        <Icon
          name={iconName(component)}
          x={0}
          y={firstBaseline - ICON_SIZE + 3}
          size={ICON_SIZE}
          color={markColor}
        />
      )}
      {laid.lineSegments.map((segments, i) => (
        <text
          key={i}
          x={indent}
          y={top + i * laid.lineHeight + laid.fontSize}
          fontFamily={ctx.fonts.body}
          fontSize={laid.fontSize}
          fill={ink}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(segments, { accent: ctx.colors.accent, baseFill: ink })}
        </text>
      ))}
    </g>
  )
}
