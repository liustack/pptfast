import type { Component } from "@/ir"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { Icon } from "../icons"
import type { RenderDef, SvgComponent } from "./types"
import { accessibleInk } from "../ink"

type RowCardsComponent = Extract<Component, { type: "row_cards" }>

/**
 * 全宽横向长卡列表（2026-07-11 用户借鉴学术贡献一览页）：每项一张全宽
 * 卡——左编号圆圈 + 可选图标 + 标题 + 主/次两级描述，highlight 项 accent
 * 描边强调。3-6 项纵向堆叠，适合每项信息量较大的枚举（成果一览/贡献
 * 清单/议题列表）。可拉伸（box.h 增量先分一份给卡间距，其余均分给各卡，
 * 内容居中）。
 */
const CARD_GAP = 14
/** Share of the density-stretch increment spent widening the gaps *between*
 * cards rather than the card shells. The shells split their share into top
 * and bottom padding, so growth that all goes there makes every card emptier
 * inside while the cards stay exactly as close to each other as before — the
 * 2026-08-19 review read that as "太拥挤" on a page where each 133px card
 * held 69px of content and 99px of blank separated two card edges only 14px
 * apart. Eyes read the edges, not the text. */
const CARD_GAP_GROW_SHARE = 0.3
/** …and no gap grows past this multiple of its own natural size, so the list
 * never falls apart into unrelated cards. */
const CARD_GAP_GROW_CAP_RATIO = 0.6
const PAD_Y = 16
const NUM_CX = 46
const NUM_R = 19
const TEXT_X = 88
const TITLE_SIZE = 19
const TEXT_SIZE = 15
const SUB_SIZE = 13.5
const TITLE_LH = 26
/** Extra air under the title before text/source, so the source line is
 * not glued to the title (gallery review 2026-08-22). */
const GAP_TITLE_NEXT = 8
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
    GAP_TITLE_NEXT +
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
    // 密度拉伸：box.h 增量按比例分成两份——一份长卡间距，其余均分给各卡壳
    //（内容组卡内垂直居中）。截断路径上 box.h < measuredH，grow = 0，
    // gapGrow = 0，卡间距原样是 CARD_GAP，下面那条验收循环的账不变。
    const grow = Math.max(0, (box.h ?? measuredH) - measuredH)
    const gaps = Math.max(1, layouts.length - 1)
    const gapGrow =
      layouts.length > 1
        ? Math.min((grow * CARD_GAP_GROW_SHARE) / gaps, CARD_GAP * CARD_GAP_GROW_CAP_RATIO)
        : 0
    const cardGap = CARD_GAP + gapGrow
    const perCardGrow = (grow - gapGrow * (layouts.length - 1)) / layouts.length
    // 截断预算（box.h < 测量高，layoutContentFit 单块超高兜底）：只画放
    // 得下的卡，尾部自画「+N …」——存量超预算 deck 不再画出页外。
    const truncBudget =
      box.h != null && box.h < measuredH ? box.h : Number.POSITIVE_INFINITY
    let visible = component.items.length
    if (truncBudget !== Number.POSITIVE_INFINITY) {
      let acc = 0
      visible = 0
      for (const l of layouts) {
        const next = acc + (visible > 0 ? cardGap : 0) + l.cardH
        if (next > truncBudget) break
        acc = next
        visible++
      }
      visible = Math.max(1, visible)
    }
    const hidden = component.items.length - visible
    // A highlighted card paints its number and title in the accent, on the
    // card's own surface — a self-painted surface, so the ink is measured
    // against what this component painted rather than the page. Consulting's
    // accent is a light yellow that measures 1.56:1 on its near-white card,
    // i.e. the highlighted row (the one meant to stand out most) was the
    // least readable thing on the slide. Found once the 2026-08-15 review
    // corpus stopped over-filling this component, which had been truncating
    // the highlighted card out of the render entirely.
    const highlightInk = accessibleInk(ctx.colors.accent, ctx.colors.surface, TITLE_SIZE)

    let cursor = 0
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {component.items.slice(0, visible).map((item, i, visibleItems) => {
          const { title, text, sub, contentH, cardH } = layouts[i]
          const shellH = cardH + perCardGrow
          const cardY = cursor
          // The gap goes only *between* cards (N-1 gaps for N cards) — matches
          // the acceptance loop above and measure()'s own formula exactly.
          // A fix-round bug (R1 evidence wave, Task T3 review — a real,
          // production-reachable defect a stress-fixture reshuffle exposed,
          // fixed here per Global Constraint 6/the I3 precedent rather than
          // routed around) used to add this gap unconditionally, including
          // after the *last* visible card — the acceptance loop never
          // budgeted for that extra 14px, so the "+N …" marker below
          // (placed at `cursor + 14`) could land up to 8px past `box.h`,
          // outside the real overflow auditor's own tolerance. The marker
          // is meant to sit 14px below the last card's own shell, not
          // 14px below "last card + one more unnecessary gap" — see
          // row-cards.test.tsx's sweep for the regression pin.
          cursor += shellH + (i < visibleItems.length - 1 ? cardGap : 0)
          const hl = Boolean(item.highlight)
          const contentTop = cardY + (shellH - contentH) / 2
          const numCy = cardY + shellH / 2
          const titleBaseline = contentTop + TITLE_SIZE
          const textTop = contentTop + TITLE_LH + GAP_TITLE_NEXT
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
                fill={hl ? highlightInk : ctx.colors.text}
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
                data-truncated={title.truncated ? "1" : undefined}
                x={item.icon ? TEXT_X + ICON_SIZE + 10 : TEXT_X}
                y={titleBaseline}
                fontSize={title.fontSize}
                fontWeight="bold"
                fill={hl ? highlightInk : ctx.colors.text}
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
                  data-truncated={sub.truncated ? "1" : undefined}
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
        {hidden > 0 && <g data-dropped={hidden} />}
      </g>
    )
  },
}

export const renderDef: RenderDef<RowCardsComponent> = { type: "row_cards", measure: rowCards.measure, render: rowCards.render }
