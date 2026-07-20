import { Fragment } from "react"
import type { Component } from "@/ir"
import type { ComponentCtx } from "./components/types"
import { renderComponent } from "./components"
import { layoutContentFit, type ContentRect } from "./layout"
import {
  fitSvgLine,
  measureTextUnits,
  truncateToUnits,
} from "../lib/svg-text-layout"

type KpiCardsComponent = Extract<Component, { type: "kpi_cards" }>

const HERO_SIZE = 200
const HERO_MIN_FONT_SIZE = 48
const LABEL_FONT_SIZE = 28
const LABEL_MIN_FONT_SIZE = 14

/**
 * `big_number` arrangement — a "giant metric stage": the first KPI's value fills the
 * top as a hero number, with its label beneath and the remaining components stacked
 * below as supporting context. Gives a deck visual rhythm (a breather page that
 * lands one number hard) instead of every content page looking the same.
 */
export function BigNumber({
  components,
  rect,
  ctx,
}: {
  components: Component[]
  rect: ContentRect
  ctx: ComponentCtx
}) {
  const kpi = components.find(
    (b): b is KpiCardsComponent => b.type === "kpi_cards" && b.items.length > 0,
  )
  const hero = kpi?.items[0]
  const others = components.filter((b) => b !== kpi)

  // Supporting components sit below the hero component.
  const heroComponentH = Math.round(HERO_SIZE * 1.25)
  const supportRect: ContentRect = {
    x: rect.x,
    y: rect.y + (hero ? heroComponentH : 0),
    w: rect.w,
    h: Math.max(0, rect.h - (hero ? heroComponentH : 0)),
  }
  const { placed, dropped } = layoutContentFit("single", others, supportRect, ctx)
  const valueBaseline = rect.y + HERO_SIZE * 0.85

  // The hero value and its unit tspan share one budget (see kpi.tsx for the
  // same reasoning): the auditor measures the whole `<text>`'s textContent
  // (value + unit tspan concatenated) at the OUTER element's font-size — it
  // can't see that the unit tspan renders smaller. So the value's width share
  // is proportioned by how much of the combined text the unit accounts for,
  // and the unit is truncated against its width share measured at the OUTER
  // (value) font-size too, not its own smaller rendered size — otherwise a
  // disproportionately long unit renders small enough to fit visually while
  // still making the auditor's concatenated-at-outer-size estimate exceed
  // rect.w.
  let fittedValue: { text: string; fontSize: number } | null = null
  let unitFontSize = 0
  let fittedUnit: string | null = null
  if (hero) {
    const valueStr = String(hero.value)
    const valueUnits = measureTextUnits(valueStr)
    const unitUnits = hero.unit ? measureTextUnits(hero.unit) : 0
    const valueMaxWidth =
      unitUnits > 0 && valueUnits > 0
        ? Math.floor((rect.w * valueUnits) / (valueUnits + unitUnits))
        : rect.w
    fittedValue = fitSvgLine(valueStr, {
      maxWidth: valueMaxWidth,
      fontSize: HERO_SIZE,
      minFontSize: HERO_MIN_FONT_SIZE,
    })
    unitFontSize = Math.round(fittedValue.fontSize * 0.4)
    const unitMaxWidth = rect.w - valueMaxWidth
    fittedUnit = hero.unit
      ? truncateToUnits(hero.unit, unitMaxWidth / fittedValue.fontSize)
      : null
  }
  const fittedLabel = hero
    ? fitSvgLine(hero.label, {
        maxWidth: rect.w,
        fontSize: LABEL_FONT_SIZE,
        minFontSize: LABEL_MIN_FONT_SIZE,
      })
    : null

  return (
    <>
      {hero && fittedValue && (
        <g>
          <text
            x={rect.x}
            y={valueBaseline}
            fontFamily={ctx.fonts.heading}
            fontSize={fittedValue.fontSize}
            fontWeight="bold"
            fill={ctx.colors.primary}
            dominantBaseline="alphabetic"
          >
            {fittedValue.text}
            {fittedUnit != null && (
              <tspan fontSize={unitFontSize} fill={ctx.colors.accent}>
                {fittedUnit}
              </tspan>
            )}
          </text>
          <text
            x={rect.x}
            y={valueBaseline + 44}
            fontFamily={ctx.fonts.body}
            fontSize={fittedLabel!.fontSize}
            fill={ctx.colors.muted}
            dominantBaseline="alphabetic"
          >
            {fittedLabel!.text}
          </text>
        </g>
      )}
      {placed.map((p, i) => (
        <Fragment key={i}>{renderComponent(p.component, p.box, ctx)}</Fragment>
      ))}
      {dropped > 0 && (
        <text
          x={supportRect.x + supportRect.w}
          y={supportRect.y + supportRect.h - 6}
          textAnchor="end"
          fontSize={14}
          fill={ctx.colors.muted}
          fontFamily={ctx.fonts.body}
          dominantBaseline="alphabetic"
        >
          {`+${dropped} more`}
        </text>
      )}
    </>
  )
}
