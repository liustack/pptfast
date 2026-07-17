import type { Block } from "@/ir"
import { Icon } from "../icons"
import { layoutSvgText } from "../../lib/svg-text-layout"
import { parseEmphasis, renderEmphasisTspans, sliceEmphasisForLines, stripEmphasis } from "../emphasis"
import type { SvgBlock } from "./types"

type CalloutBlock = Extract<Block, { type: "callout" }>

const FONT_SIZE = 20
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
const VARIANT_ICON: Record<CalloutBlock["variant"], string> = {
  info: "info",
  warn: "triangle-alert",
  tip: "lightbulb",
}

function lay(text: string, w: number) {
  return layoutSvgText(stripEmphasis(text), {
    maxWidth: w - 48,
    fontSize: FONT_SIZE,
    maxLines: 99,
    lineHeightRatio: LINE_RATIO,
  })
}

function accentColor(variant: CalloutBlock["variant"], ctx: { colors: { primary: string; accent: string } }): string {
  if (variant === "warn") return "#DC2626"
  if (variant === "tip") return ctx.colors.accent
  return ctx.colors.primary
}

export const callout: SvgBlock<CalloutBlock> = {
  measure(block, w) {
    const l = lay(block.text, w)
    return Math.max(l.lines.length * l.lineHeight + 2 * PAD_Y, MIN_HEIGHT)
  },
  render(block, box, ctx) {
    const l = lay(block.text, box.w)
    const lineSegments = sliceEmphasisForLines(parseEmphasis(block.text), l.lines)
    const h = Math.max(l.lines.length * l.lineHeight + 2 * PAD_Y, MIN_HEIGHT)
    const accent = accentColor(block.variant, ctx)
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
        <Icon name={block.icon ?? VARIANT_ICON[block.variant]} x={ICON_LEFT} y={iconY} size={ICON_SIZE} color={accent} />
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
