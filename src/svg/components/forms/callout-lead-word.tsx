import { renderEmphasisText } from "../../emphasis"
import { accessibleInk } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import {
  MARK_GAP,
  blockHeight,
  calloutLeadWord,
  contentTop,
  hangingIndent,
  layCalloutBody,
  leadFontWeight,
  leadInk,
  type CalloutComponent,
} from "./callout-shared"

function layout(component: CalloutComponent, w: number, ctx: ComponentCtx, _knobs: FormKnobs) {
  const lead = calloutLeadWord(component.variant, component.text)
  const indent =
    hangingIndent(lead, ctx.bodyFontPx, { bold: true, fontFamily: ctx.fonts.heading }) + MARK_GAP
  const laid = layCalloutBody(
    component.text,
    Math.max(1, w - indent),
    ctx.bodyFontPx,
    ctx.fonts.body,
  )
  const h = blockHeight(laid.contentH)
  return { laid, lead, indent, h, top: contentTop(h, laid.contentH) }
}

export function measureLeadWord(
  component: CalloutComponent,
  w: number,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): number {
  return layout(component, w, ctx, knobs).h
}

export function renderLeadWord(
  component: CalloutComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
) {
  const { laid, lead, indent, top } = layout(component, box.w, ctx, knobs)
  const page = ctx.defaultBg ?? ctx.colors.bg
  const ink = accessibleInk(ctx.colors.text, page, laid.fontSize)
  const mark = leadInk(component.variant, ctx, knobs)
  const firstBaseline = top + laid.fontSize
  return (
    <g transform={`translate(${box.x},${box.y})`}>
      <text
        x={0}
        y={firstBaseline}
        fontFamily={ctx.fonts.heading}
        fontSize={laid.fontSize}
        fontWeight={leadFontWeight(knobs)}
        fill={mark}
        dominantBaseline="alphabetic"
      >
        {lead}
      </text>
      {laid.lineSegments.map((segments, i) =>
        renderEmphasisText(
          segments,
          {
            accent: ctx.colors.accent,
            baseFill: ink,
            themeId: ctx.themeId,
            measureWeight: { fontFamily: ctx.fonts.body },
          },
          <text
            key={i}
            x={indent}
            y={top + i * laid.lineHeight + laid.fontSize}
            fontFamily={ctx.fonts.body}
            fontSize={laid.fontSize}
            fill={ink}
            dominantBaseline="alphabetic"
          />,
        ),
      )}
    </g>
  )
}
