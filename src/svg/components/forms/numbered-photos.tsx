import type React from "react"
import type { Component } from "@/ir"
import { fitSvgLine } from "../../../lib/svg-text-layout"
import { readableOn } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"

type ImageGridComponent = Extract<Component, { type: "image_grid" }>

const GAP = 16
const CAPTION_H = 36
const MAX_IMAGE_H = 300

function gridShape(n: number): { cols: number; rows: number } {
  if (n === 4) return { cols: 2, rows: 2 }
  return { cols: n, rows: 1 }
}

function captionBand(component: ImageGridComponent): number {
  return component.items.some((it) => it.caption) ? CAPTION_H : 0
}

export function measureNumberedPhotos(
  component: ImageGridComponent,
  w: number,
  _ctx: ComponentCtx,
  _knobs: FormKnobs,
): number {
  const n = component.items.length
  const { cols, rows } = gridShape(n)
  const cellW = (w - GAP * (cols - 1)) / cols
  const imageH = Math.min(Math.round(cellW * 0.72), MAX_IMAGE_H)
  const band = captionBand(component)
  return rows * (imageH + band) + GAP * (rows - 1)
}

function badgeLabel(index: number, kind: FormKnobs["numberBadge"]): string {
  const n = String(index + 1).padStart(2, "0")
  if (kind === "specimen") return `№ ${n}`
  if (kind === "invert") return `${n}.`
  return n
}

function renderMissing(cellW: number, imageH: number, ctx: ComponentCtx): React.ReactElement {
  return (
    <>
      <rect x={0} y={0} width={cellW} height={imageH} fill={ctx.colors.surface} />
      <text
        textAnchor="middle"
        x={cellW / 2}
        y={imageH / 2}
        fontSize={14}
        fill={ctx.colors.muted}
        fontFamily={ctx.fonts.body}
        dominantBaseline="alphabetic"
      >
        Image missing
      </text>
    </>
  )
}

export function renderNumberedPhotos(
  component: ImageGridComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): React.ReactElement {
  const n = component.items.length
  const { cols, rows } = gridShape(n)
  const cellW = (box.w - GAP * (cols - 1)) / cols
  const band = captionBand(component)
  const natural = measureNumberedPhotos(component, box.w, ctx, knobs)
  const totalH = box.h ?? natural
  const rowH = (totalH - GAP * (rows - 1)) / rows
  const imageH = Math.max(40, rowH - band)
  const captionAbove = knobs.caption === "above"
  const kind = knobs.numberBadge
  const badgeW = kind === "specimen" ? 88 : kind === "invert" ? 56 : 48
  const badgeH = kind === "invert" ? 32 : 28

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {component.items.map((item, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const cellX = col * (cellW + GAP)
        const cellY = row * (rowH + GAP)
        const imageY = captionAbove ? cellY + band : cellY
        const src = ctx.images?.[item.asset_id]?.src
        const alt = ctx.images?.[item.asset_id]?.alt
        const caption = item.caption
          ? fitSvgLine(item.caption, {
              maxWidth: cellW - 4,
              fontSize: 16,
              minFontSize: 11,
              bold: true,
              fontFamily: ctx.fonts.body,
            })
          : null
        const captionY = captionAbove
          ? cellY + 22
          : imageY + imageH + 22
        const badgeFill = kind === "invert" ? ctx.colors.bg : ctx.colors.accent
        const badgeStroke = kind === "invert" ? ctx.colors.primary : undefined
        return (
          <g key={i}>
            {src ? (
              <image
                href={src}
                x={cellX}
                y={imageY}
                width={cellW}
                height={imageH}
                preserveAspectRatio="xMidYMid slice"
                aria-label={alt || undefined}
              />
            ) : (
              <g transform={`translate(${cellX},${imageY})`}>{renderMissing(cellW, imageH, ctx)}</g>
            )}
            <rect
              x={cellX}
              y={imageY}
              width={badgeW}
              height={badgeH}
              fill={badgeFill}
              stroke={badgeStroke}
              strokeWidth={badgeStroke ? 3 : undefined}
            />
            <text
              x={cellX + badgeW / 2}
              y={imageY + badgeH / 2 + 6}
              textAnchor="middle"
              fontSize={kind === "specimen" ? 16 : 15}
              fontWeight="700"
              fill={readableOn(badgeFill)}
              fontFamily={kind === "specimen" ? ctx.fonts.heading : ctx.fonts.body}
              dominantBaseline="alphabetic"
            >
              {badgeLabel(i, kind)}
            </text>
            {caption ? (
              <text
                data-truncated={caption.truncated ? "1" : undefined}
                x={cellX}
                y={captionY}
                fontSize={caption.fontSize}
                fontWeight="700"
                fill={ctx.colors.text}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {caption.text}
              </text>
            ) : null}
          </g>
        )
      })}
    </g>
  )
}
