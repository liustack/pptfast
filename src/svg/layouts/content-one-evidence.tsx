import type { Component } from "@/ir"
import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import type { ComponentCtx } from "../components/types"
import type { ContentRect } from "../layout"
import { GOLDEN_TOP_SHARE } from "../layout"
import { pickEvidence } from "../component-traits"
import { measureComponent, renderComponent } from "../components"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"

/**
 * one-evidence content layout（演讲极简波）：整句断言 + 独占一张图或一个表。
 * `pinOnly` + `chrome: "none"`。容量 1，超过走既有 `pin_only_over_capacity`。
 * 证据挑选复用 `pickEvidence`（和 `assertion_evidence` 同一份优先级），没有
 * 命中证据类型时退回唯一组件。等比缩小以适配剩余框，不放大。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量，颜色 / 字体全部来自 ctx。
 */

const HEADING_X = 80
const HEADING_Y = 72
const HEADING_MAX_W = 1120
const EVIDENCE_X = 160
const EVIDENCE_TOP = 180
const EVIDENCE_W = 960
const EVIDENCE_BOTTOM = 640
const FOOTNOTE_Y = 656
const FOOTNOTE_SIZE = 12
const SCALE_CAP = 1

function renderFittedEvidence(
  component: Component,
  rect: ContentRect,
  ctx: ComponentCtx,
) {
  const measured = measureComponent(component, rect.w, ctx)
  const scale = measured > 0 ? Math.min(rect.h / measured, SCALE_CAP) : 1
  const scaledW = rect.w * scale
  const scaledH = measured * scale
  const offsetX = rect.x + (rect.w - scaledW) / 2
  const offsetY = rect.y + Math.max(0, rect.h - scaledH) * GOLDEN_TOP_SHARE
  return (
    <g data-audit-rect={`${rect.x},${rect.y},${rect.w},${rect.h}`}>
      <g data-audit-box={`${offsetX},${offsetY},${scaledW},${scaledH}`}>
        <g transform={`translate(${offsetX},${offsetY}) scale(${scale})`}>
          {renderComponent(component, { x: 0, y: 0, w: rect.w }, ctx)}
        </g>
      </g>
    </g>
  )
}

export function OneEvidenceContent({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const defaultBg = ctx.defaultBg ?? colors.bg

  const heading = fitHeadingLines(slide.heading, {
    ...layoutDef.headingFit,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })

  const evidence = pickEvidence(slide.components) ?? slide.components[0]
  const evidenceRect: ContentRect = {
    x: EVIDENCE_X,
    y: EVIDENCE_TOP,
    w: EVIDENCE_W,
    h: EVIDENCE_BOTTOM - EVIDENCE_TOP,
  }

  const footnoteSource = slide.footnote?.trim()
  const footnote = footnoteSource
    ? fitSvgLine(footnoteSource, {
        maxWidth: HEADING_MAX_W,
        fontSize: FOOTNOTE_SIZE,
        minFontSize: 10,
      })
    : null

  return (
    <>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={HEADING_X}
          y={HEADING_Y + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="600"
          fill={accessibleInk(colors.text, defaultBg, heading.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {evidence && renderFittedEvidence(evidence, evidenceRect, ctx)}

      {footnote && (
        <text
          data-truncated={footnote.truncated ? "1" : undefined}
          x={HEADING_X}
          y={FOOTNOTE_Y}
          fontFamily={fonts.body}
          fontSize={footnote.fontSize}
          fill={accessibleInk(colors.muted, defaultBg, footnote.fontSize)}
          dominantBaseline="alphabetic"
        >
          {footnote.text}
        </text>
      )}
    </>
  )
}

export const layoutDef = {
  // content-one-evidence.tsx: a pinOnly assertion + single evidence page.
  // Heading is a full-sentence claim. Body capacity 1 is the evidence
  // (chart / table / image / whatever pickEvidence returns, else the sole
  // component). chrome: "none" skips brand footer, logo, and the theme
  // motif. The fifth-band decoration safe-zone does not apply — the whole
  // canvas is the layout's.
  id: "one-evidence",
  kind: "archetype",
  pinOnly: true,
  chrome: "none",
  slideTypes: ["content"],
  slots: [
    { name: "heading", accepts: [] },
    { name: "body", accepts: "any", capacity: 1 },
    { name: "meta", accepts: [] },
  ],
  arrangements: ["single"],
  headingFit: {
    maxWidth: HEADING_MAX_W,
    fontSize: 36,
    maxLines: 3,
    minPt: 22,
    lineHeightRatio: 1.2,
  },
} satisfies LayoutDefinition
