import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import type { ComponentCtx, SvgComponent } from "./types"

type ImageGridComponent = Extract<Component, { type: "image_grid" }>

/** 网格总高上限（px），与单图块的 MAX_IMAGE_H 同一预算量级。 */
const MAX_GRID_H = 340
const GAP = 10
const CAPTION_H = 26

/**
 * 每格的几何布局（box 相对坐标）。布局形态：
 * - 2 图：双列一行；3 图：三列一行
 * - 4 图：2×2
 * - emphasis="first" 且 3-4 图：首图独占左半、其余纵排右半（1 大 N 小）
 */
function gridCells(
  n: number,
  emphasis: ImageGridComponent["emphasis"],
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number }[] {
  if (emphasis === "first" && n >= 3) {
    const heroW = Math.round((w - GAP) * 0.56)
    const sideW = w - GAP - heroW
    const rest = n - 1
    const sideH = (h - GAP * (rest - 1)) / rest
    return [
      { x: 0, y: 0, w: heroW, h },
      ...Array.from({ length: rest }, (_, i) => ({
        x: heroW + GAP,
        y: Math.round((sideH + GAP) * i),
        w: sideW,
        h: Math.floor(sideH),
      })),
    ]
  }
  if (n === 4) {
    const cw = (w - GAP) / 2
    const ch = (h - GAP) / 2
    return [0, 1, 2, 3].map((i) => ({
      x: Math.round((cw + GAP) * (i % 2)),
      y: Math.round((ch + GAP) * Math.floor(i / 2)),
      w: Math.floor(cw),
      h: Math.floor(ch),
    }))
  }
  const cw = (w - GAP * (n - 1)) / n
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round((cw + GAP) * i),
    y: 0,
    w: Math.floor(cw),
    h,
  }))
}

function gridImageAreaH(component: ImageGridComponent, w: number): number {
  const n = component.items.length
  if (component.emphasis === "first" && n >= 3) return MAX_GRID_H
  if (n === 4) return MAX_GRID_H
  // 单行：按格宽 16:10 比例，封顶 MAX_GRID_H
  const cw = (w - GAP * (n - 1)) / n
  return Math.min(Math.round(cw * 0.62), MAX_GRID_H)
}

/**
 * caption 仅在单行网格显示：多行形态（4 图 2×2、emphasis=first 的 1 大
 * N 小）里格下 caption 会与下一行图重叠，直接忽略（measure 同步不留白）。
 */
function captionsVisible(component: ImageGridComponent): boolean {
  const multiRow = component.items.length === 4 || (component.emphasis === "first" && component.items.length >= 3)
  return !multiRow && component.items.some((it) => it.caption)
}

function renderCell({
  src,
  cell,
  ctx,
}: {
  src: string | undefined
  cell: { x: number; y: number; w: number; h: number }
  ctx: ComponentCtx
}) {
  return (
    <g transform={`translate(${cell.x},${cell.y})`}>
      {src ? (
        <image
          href={src}
          x={0}
          y={0}
          width={cell.w}
          height={cell.h}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <>
          <rect x={0} y={0} width={cell.w} height={cell.h} fill={ctx.colors.surface} />
          <text
            textAnchor="middle"
            x={cell.w / 2}
            y={cell.h / 2}
            fontSize={14}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            dominantBaseline="alphabetic"
          >
            Image missing
          </text>
        </>
      )}
      <rect
        x={0.5}
        y={0.5}
        width={cell.w - 1}
        height={cell.h - 1}
        fill="none"
        stroke={ctx.colors.border}
        strokeWidth={1}
      />
    </g>
  )
}

export const imageGrid: SvgComponent<ImageGridComponent> = {
  measure(component, w) {
    return gridImageAreaH(component, w) + (captionsVisible(component) ? CAPTION_H : 0)
  },
  render(component, box, ctx) {
    const areaH = gridImageAreaH(component, box.w)
    const cells = gridCells(component.items.length, component.emphasis, box.w, areaH)
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {component.items.map((item, i) => {
          const cell = cells[i]
          const src = ctx.images?.[item.asset_id]?.src
          return (
            <g key={i}>
              {renderCell({ src, cell, ctx })}
              {captionsVisible(component) && item.caption &&
                (() => {
                  const fitted = fitSvgLine(item.caption, {
                    maxWidth: cell.w - 26,
                    fontSize: 14,
                    minFontSize: 11,
                  })
                  return (
                    // caption 左对齐 + accent 短线前缀（杂志图注惯例），
                    // 弃居中 muted 的"占位感"
                    <>
                      <rect
                        x={cell.x}
                        y={cell.y + cell.h + 10}
                        width={16}
                        height={3}
                        fill={ctx.colors.accent}
                      />
                      <text
                        x={cell.x + 24}
                        y={cell.y + cell.h + 20}
                        fontSize={fitted.fontSize}
                        fill={ctx.colors.text}
                        fontFamily={ctx.fonts.body}
                        dominantBaseline="alphabetic"
                      >
                        {fitted.text}
                      </text>
                    </>
                  )
                })()}
            </g>
          )
        })}
      </g>
    )
  },
}
