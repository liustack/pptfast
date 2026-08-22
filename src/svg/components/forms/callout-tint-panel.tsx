import { Icon } from "../../icons"
import { renderEmphasisTspans } from "../../emphasis"
import { accessibleInk } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import {
  ICON_GAP,
  ICON_SIZE,
  PAD_X,
  accentColor,
  blockHeight,
  bodyIsBold,
  contentTop,
  iconName,
  layCalloutBody,
  panelRadius,
  tintPanelFill,
  type CalloutComponent,
} from "./callout-shared"

function layout(component: CalloutComponent, w: number, ctx: ComponentCtx, knobs: FormKnobs) {
  const textX = PAD_X + ICON_SIZE + ICON_GAP
  const bodyW = Math.max(1, w - textX - PAD_X)
  const laid = layCalloutBody(
    component.text,
    bodyW,
    ctx.bodyFontPx,
    ctx.fonts.body,
    bodyIsBold(knobs),
  )
  const h = blockHeight(laid.contentH)
  return { laid, textX, h, top: contentTop(h, laid.contentH) }
}

export function measureTintPanel(
  component: CalloutComponent,
  w: number,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): number {
  return layout(component, w, ctx, knobs).h
}

export function renderTintPanel(
  component: CalloutComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
) {
  const { laid, textX, h, top } = layout(component, box.w, ctx, knobs)
  const panel = tintPanelFill(ctx.colors)
  const ink = accessibleInk(ctx.colors.text, panel, laid.fontSize)
  const iconColor = accentColor(component.variant, ctx)
  const firstBaseline = top + laid.fontSize
  const iconY = firstBaseline - ICON_SIZE + 3
  const bold = bodyIsBold(knobs)
  return (
    <g transform={`translate(${box.x},${box.y})`}>
      <rect
        x={0}
        y={0}
        width={box.w}
        height={h}
        rx={panelRadius(knobs)}
        fill={panel}
      />
      <Icon name={iconName(component)} x={PAD_X} y={iconY} size={ICON_SIZE} color={iconColor} />
      {laid.lineSegments.map((segments, i) => (
        <text
          key={i}
          x={textX}
          y={top + i * laid.lineHeight + laid.fontSize}
          fontFamily={ctx.fonts.body}
          fontSize={laid.fontSize}
          fontWeight={bold ? "700" : undefined}
          fill={ink}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(segments, { accent: ctx.colors.accent, baseFill: ink })}
        </text>
      ))}
    </g>
  )
}
