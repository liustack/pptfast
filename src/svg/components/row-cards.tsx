import type { Component } from "@/ir"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { Icon } from "../icons"
import type { SvgComponent } from "./types"

type RowCardsComponent = Extract<Component, { type: "row_cards" }>

/**
 * 全宽横向长卡列表（2026-07-11 用户借鉴学术贡献一览页）：每项一张全宽
 * 卡——左编号圆圈 + 可选图标 + 标题 + 主/次两级描述，highlight 项 accent
 * 描边强调。3-6 项纵向堆叠，适合每项信息量较大的枚举（成果一览/贡献
 * 清单/议题列表）。可拉伸（box.h 均分给各卡，内容居中）。
 */
const CARD_GAP = 14
const PAD_Y = 16
const NUM_CX = 46
const NUM_R = 19
const TEXT_X = 88
const TITLE_SIZE = 19
const TEXT_SIZE = 15
const SUB_SIZE = 13.5
const TITLE_LH = 26
const ICON_SIZE = 20

function cardLayout(item: RowCardsComponent["items"][number], w: number) {
  const contentW = Math.max(1, w - TEXT_X - 24)
  const titleW = item.icon ? contentW - ICON_SIZE - 10 : contentW
  const title = fitSvgLine(item.title, {
    maxWidth: titleW,
    fontSize: TITLE_SIZE,
    minFontSize: 14,
  })
  const text = item.text
    ? layoutSvgText(item.text, {
        maxWidth: contentW,
        fontSize: TEXT_SIZE,
        maxLines: 2,
        lineHeightRatio: 1.4,
      })
    : null
  const sub = item.sub
    ? fitSvgLine(item.sub, { maxWidth: contentW, fontSize: SUB_SIZE, minFontSize: 10 })
    : null
  const contentH =
    TITLE_LH +
    (text ? text.lines.length * text.lineHeight + 2 : 0) +
    (sub ? Math.round(SUB_SIZE * 1.5) : 0)
  const cardH = PAD_Y * 2 + Math.max(NUM_R * 2, contentH)
  return { title, text, sub, contentH, cardH }
}

export const rowCards: SvgComponent<RowCardsComponent> = {
  measure(component, w) {
    return (
      component.items.reduce((sum, item) => sum + cardLayout(item, w).cardH, 0) +
      (component.items.length - 1) * CARD_GAP
    )
  },
  render(component, box, ctx) {
    const layouts = component.items.map((item) => cardLayout(item, box.w))
    const measuredH =
      layouts.reduce((s, l) => s + l.cardH, 0) + (layouts.length - 1) * CARD_GAP
    // 密度拉伸：box.h 增量均分给各卡，内容组卡内垂直居中
    const perCardGrow = Math.max(0, ((box.h ?? measuredH) - measuredH) / layouts.length)
    // 截断预算（box.h < 测量高，layoutContentFit 单块超高兜底）：只画放
    // 得下的卡，尾部自画「+N 项未展示」——存量超预算 deck 不再画出页外。
    const truncBudget =
      box.h != null && box.h < measuredH ? box.h - 20 : Number.POSITIVE_INFINITY
    let visible = component.items.length
    if (truncBudget !== Number.POSITIVE_INFINITY) {
      let acc = 0
      visible = 0
      for (const l of layouts) {
        const next = acc + (visible > 0 ? CARD_GAP : 0) + l.cardH
        if (next > truncBudget) break
        acc = next
        visible++
      }
      visible = Math.max(1, visible)
    }
    const hidden = component.items.length - visible
    let cursor = 0
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {component.items.slice(0, visible).map((item, i) => {
          const { title, text, sub, contentH, cardH } = layouts[i]
          const shellH = cardH + perCardGrow
          const cardY = cursor
          cursor += shellH + CARD_GAP
          const hl = Boolean(item.highlight)
          const contentTop = cardY + (shellH - contentH) / 2
          const numCy = cardY + shellH / 2
          const titleBaseline = contentTop + TITLE_SIZE
          const textTop = contentTop + TITLE_LH
          return (
            <g key={i} data-audit-box={`${box.x},${box.y + cardY},${box.w}`}>
              <rect
                x={0}
                y={cardY}
                width={box.w}
                height={shellH}
                rx={ctx.shape?.radius ?? 8}
                fill={ctx.colors.surface}
                stroke={hl ? ctx.colors.accent : (ctx.colors.cardStroke ?? "none")}
                strokeWidth={hl ? 1.5 : 1}
              />
              <circle
                cx={NUM_CX}
                cy={numCy}
                r={NUM_R}
                fill="none"
                stroke={hl ? ctx.colors.accent : ctx.colors.muted}
                strokeWidth={1.5}
              />
              <text
                x={NUM_CX}
                y={numCy + 6}
                textAnchor="middle"
                fontSize={16}
                fontWeight="bold"
                fill={hl ? ctx.colors.accent : ctx.colors.text}
                fontFamily={ctx.fonts.heading}
                dominantBaseline="alphabetic"
              >
                {i + 1}
              </text>
              {item.icon && (
                <Icon
                  name={item.icon}
                  x={TEXT_X}
                  y={titleBaseline - ICON_SIZE + 3}
                  size={ICON_SIZE}
                  color={ctx.colors.accent}
                />
              )}
              <text
                x={item.icon ? TEXT_X + ICON_SIZE + 10 : TEXT_X}
                y={titleBaseline}
                fontSize={title.fontSize}
                fontWeight="bold"
                fill={hl ? ctx.colors.accent : ctx.colors.text}
                fontFamily={ctx.fonts.heading}
                dominantBaseline="alphabetic"
              >
                {title.text}
              </text>
              {text
                ? text.lines.map((line, li) => (
                    <text
                      key={li}
                      x={TEXT_X}
                      y={textTop + (li + 1) * text.lineHeight - 4}
                      fontSize={text.fontSize}
                      fill={ctx.colors.text}
                      fillOpacity={0.85}
                      fontFamily={ctx.fonts.body}
                      dominantBaseline="alphabetic"
                    >
                      {line}
                    </text>
                  ))
                : null}
              {sub ? (
                <text
                  x={TEXT_X}
                  y={
                    textTop +
                    (text ? text.lines.length * text.lineHeight + 2 : 0) +
                    Math.round(SUB_SIZE * 1.3)
                  }
                  fontSize={sub.fontSize}
                  fill={ctx.colors.muted}
                  fontFamily={ctx.fonts.body}
                  dominantBaseline="alphabetic"
                >
                  {sub.text}
                </text>
              ) : null}
            </g>
          )
        })}
        {hidden > 0 && (
          <text
            x={box.w}
            y={cursor + 14}
            textAnchor="end"
            fontSize={13}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            dominantBaseline="alphabetic"
          >
            {`+${hidden} 项未展示`}
          </text>
        )}
      </g>
    )
  },
}
