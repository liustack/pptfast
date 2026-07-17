import type { ReactElement } from "react"
import type { ChartSeries } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"

/**
 * Chart renderers for the page-coordinate SVG pipeline.
 *
 * Each function receives an absolute region (x0, y0, w, h) and returns SVG
 * elements positioned in page coordinates (no nested <svg viewBox>).
 */

/** Label font size (px) for category/value labels on bar and line charts. */
const LABEL_FONT_SIZE = 11
const LABEL_MIN_FONT_SIZE = 8
/** Space (px) reserved at the top of `h` for value labels above the plot. */
const LABEL_TOP_PAD = 14
/** Space (px) reserved at the bottom of `h` for category labels below the plot. */
const LABEL_BOTTOM_PAD = 18

/** Bar gradient's lower stop keeps this fraction of the accent's original
 * per-channel brightness (0.7 → "70% 亮度变体" per the Task 8 brief). */
const BAR_GRADIENT_SHADE_FACTOR = 0.7
/** Count of horizontal reference lines dividing the plot's value range —
 * shared by bar and line, both of which already compute an identical
 * plotTop/plotH plot area. */
const GRIDLINE_COUNT = 3
/** Line chart endpoint-emphasis geometry: inner solid dot / outer soft ring. */
const ENDPOINT_DOT_R = 4
const ENDPOINT_RING_R = 8
const ENDPOINT_RING_OPACITY = 0.3
/** Line-under-curve area fill: alpha at the line (top) fading to fully
 * transparent at the baseline (bottom). */
const AREA_FILL_TOP_ALPHA = 0.2
const AREA_FILL_BOTTOM_ALPHA = 0

/**
 * A center-anchored label at a series' first/last point straddles the plot's
 * left/right edge and overflows it by half its own width. Anchor the first
 * point's label to grow rightward and the last point's leftward instead —
 * interior points keep the centered anchor.
 */
function edgeAnchor(i: number, n: number): "start" | "middle" | "end" {
  if (n <= 1) return "middle"
  if (i === 0) return "start"
  if (i === n - 1) return "end"
  return "middle"
}

/**
 * djb2 string hash — deterministic and platform-independent (same algorithm
 * as `@/shared/lib/color`'s private `hash()`, re-implemented locally since
 * that one isn't exported and this file has no reason to import from it).
 */
function stableHash(seed: string): number {
  let h = 5381
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * Deterministic id for a chart instance's gradient defs. `renderBar`/
 * `renderLine` never receive the block's page position — `chart.tsx` always
 * calls them with x0=y0=0 and translates the whole result via an outer `<g>`
 * — so there is no coordinate prop to key an id off. Hash the series data
 * actually in scope instead: stable for identical input (required for
 * preview/export to reproduce the exact same markup) and distinct whenever
 * two charts placed on the same page differ in data, which two
 * independently-authored charts always do (SVG ids are document-scoped, so
 * two chart instances on one slide must never collide).
 */
function chartGradientId(prefix: string, w: number, h: number, seed: unknown): string {
  return `${prefix}-${stableHash(`${w}x${h}:${JSON.stringify(seed)}`)}`
}

/**
 * Scale a `#RRGGBB` hex color's channels to `factor` of their original value
 * (e.g. 0.7 → a darker 70%-brightness shade). Theme tokens are always baked
 * hex by the time they reach block renderers (`themes/tokens.ts`'s
 * `StyleColors`), so no other CSS color syntax needs handling here.
 */
function scaleHexBrightness(hex: string, factor: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!match) return hex
  const value = parseInt(match[1], 16)
  const scale = (channel: number) => Math.round(Math.min(255, Math.max(0, channel * factor)))
  const r = scale((value >> 16) & 0xff)
  const g = scale((value >> 8) & 0xff)
  const b = scale(value & 0xff)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0").toUpperCase()}`
}

/**
 * Horizontal reference lines dividing the plot's value range into
 * GRIDLINE_COUNT+1 equal bands (3 lines → quarter/half/three-quarter of the
 * plot height). Skips any candidate that lands on the x-axis baseline — this
 * only actually fires when `plotH` has collapsed to 0 (h too small for the
 * label paddings), in which case every candidate coincides with plotTop and
 * the baseline alike.
 */
function renderGridlines(
  x0: number,
  w: number,
  plotTop: number,
  plotH: number,
  mutedColor: string,
): ReactElement {
  const baselineY = plotTop + plotH
  const ys: number[] = []
  for (let i = 1; i <= GRIDLINE_COUNT; i++) {
    const y = plotTop + (plotH * i) / (GRIDLINE_COUNT + 1)
    if (Math.abs(y - baselineY) > 0.01) ys.push(y)
  }
  return (
    <>
      {ys.map((y, i) => (
        <line
          key={i}
          x1={x0}
          y1={y}
          x2={x0 + w}
          y2={y}
          stroke={mutedColor}
          strokeOpacity={0.1}
          strokeWidth={1}
        />
      ))}
    </>
  )
}

export function renderBar(
  series: ChartSeries[],
  _palette: string[],
  x0: number,
  y0: number,
  w: number,
  h: number,
  mutedColor: string,
  textColor: string,
  accentColor: string,
): ReactElement {
  const all = series.flatMap((s) => s.data.map((d) => d.y))
  const max = Math.max(...all, 1)
  const points = series[0]?.data ?? []
  const groupW = w / Math.max(points.length, 1)
  const plotTop = y0 + LABEL_TOP_PAD
  const plotH = Math.max(0, h - LABEL_TOP_PAD - LABEL_BOTTOM_PAD)
  // One shared gradient per chart instance — every non-max bar reuses it via
  // the same `url(#…)` reference, so it's declared once, not per bar.
  const gradientId = chartGradientId("chart-bar-grad", w, h, series)
  const gradientShade = scaleHexBrightness(accentColor, BAR_GRADIENT_SHADE_FACTOR)
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1={0} y1={0} x2={0} y2={1}>
          <stop offset="0%" stopColor={accentColor} />
          <stop offset="100%" stopColor={gradientShade} />
        </linearGradient>
      </defs>
      {renderGridlines(x0, w, plotTop, plotH, mutedColor)}
      {points.map((d, i) => {
        const barH = (d.y / max) * plotH
        const barX = x0 + i * groupW + 4
        const barW = groupW - 8
        const barY = plotTop + plotH - barH
        // The tallest bar (or bars tied for tallest) stands out as a solid
        // accent fill instead of the gradient — "无渐变突出" per the brief.
        const isMax = d.y === max
        const category = fitSvgLine(String(d.x), {
          maxWidth: barW,
          fontSize: LABEL_FONT_SIZE,
          minFontSize: LABEL_MIN_FONT_SIZE,
        })
        return (
          <g key={i}>
            <rect
              x={barX}
              y={barY}
              width={barW}
              height={barH}
              fill={isMax ? accentColor : `url(#${gradientId})`}
              opacity={isMax ? 1 : 0.75}
            />
            <text
              x={barX + barW / 2}
              y={barY - 4}
              textAnchor="middle"
              fontSize={LABEL_FONT_SIZE}
              fill={textColor}
              dominantBaseline="alphabetic"
            >
              {d.y}
            </text>
            <text
              x={barX + barW / 2}
              y={y0 + h - 4}
              textAnchor="middle"
              fontSize={category.fontSize}
              fill={mutedColor}
              dominantBaseline="alphabetic"
            >
              {category.text}
            </text>
          </g>
        )
      })}
    </>
  )
}

export function renderLine(
  series: ChartSeries[],
  palette: string[],
  x0: number,
  y0: number,
  w: number,
  h: number,
  mutedColor: string,
  textColor: string,
  accentColor: string,
): ReactElement {
  const plotTop = y0 + LABEL_TOP_PAD
  const plotH = Math.max(0, h - LABEL_TOP_PAD - LABEL_BOTTOM_PAD)
  const baselineY = plotTop + plotH
  const categoryPoints = series[0]?.data ?? []
  const categoryMaxWidth = w / Math.max(categoryPoints.length - 1, 1)
  return (
    <>
      {renderGridlines(x0, w, plotTop, plotH, mutedColor)}
      {series.map((s, sIdx) => {
        const max = Math.max(...s.data.map((d) => d.y), 1)
        const coords = s.data.map((d, i) => ({
          x: x0 + (i / Math.max(s.data.length - 1, 1)) * w,
          y: plotTop + plotH - (d.y / max) * plotH,
          y_value: d.y,
        }))
        const pts = coords.map((c) => `${c.x},${c.y}`).join(" ")
        const first = coords[0]
        const last = coords[coords.length - 1]
        // Per-series area-under-curve gradient — each series gets its own
        // declared id (folding sIdx into the seed) since each traces a
        // different shape and must not share a def with another series.
        const areaId = chartGradientId(`chart-line-area-${sIdx}`, w, h, s)
        return (
          <g key={sIdx}>
            {first && last && (
              <>
                <defs>
                  <linearGradient id={areaId} x1={0} y1={0} x2={0} y2={1}>
                    <stop offset="0%" stopColor={accentColor} stopOpacity={AREA_FILL_TOP_ALPHA} />
                    <stop offset="100%" stopColor={accentColor} stopOpacity={AREA_FILL_BOTTOM_ALPHA} />
                  </linearGradient>
                </defs>
                <polygon
                  points={`${pts} ${last.x},${baselineY} ${first.x},${baselineY}`}
                  fill={`url(#${areaId})`}
                  stroke="none"
                />
              </>
            )}
            <polyline
              points={pts}
              fill="none"
              stroke={palette[sIdx % palette.length]}
              strokeWidth={2}
            />
            {/* Category labels sit under the x-axis once, off series[0]'s data
                points — repeating them per series would stack duplicate
                labels on the shared x-axis. */}
            {sIdx === 0 &&
              coords.map((c, i) => {
                const category = fitSvgLine(String(categoryPoints[i]?.x ?? ""), {
                  maxWidth: categoryMaxWidth,
                  fontSize: LABEL_FONT_SIZE,
                  minFontSize: LABEL_MIN_FONT_SIZE,
                })
                return (
                  <text
                    key={`cat-${i}`}
                    x={c.x}
                    y={y0 + h - 4}
                    textAnchor={edgeAnchor(i, coords.length)}
                    fontSize={category.fontSize}
                    fill={mutedColor}
                    dominantBaseline="alphabetic"
                  >
                    {category.text}
                  </text>
                )
              })}
            {/* Value labels only at each series' endpoints — every point would
                clutter a many-point line, unlike bar's one-label-per-bar. */}
            {first && (
              <text
                x={first.x}
                y={first.y - 6}
                textAnchor={edgeAnchor(0, coords.length)}
                fontSize={LABEL_FONT_SIZE}
                fill={textColor}
                dominantBaseline="alphabetic"
              >
                {first.y_value}
              </text>
            )}
            {last && last !== first && (
              <text
                x={last.x}
                y={last.y - 6}
                textAnchor={edgeAnchor(coords.length - 1, coords.length)}
                fontSize={LABEL_FONT_SIZE}
                fill={textColor}
                dominantBaseline="alphabetic"
              >
                {last.y_value}
              </text>
            )}
            {/* Endpoint emphasis: a soft outer ring plus a solid accent dot,
                always at the series' last point (even a single-point series,
                where it coincides with `first`). */}
            {last && (
              <>
                <circle
                  cx={last.x}
                  cy={last.y}
                  r={ENDPOINT_RING_R}
                  fill="none"
                  stroke={accentColor}
                  strokeOpacity={ENDPOINT_RING_OPACITY}
                />
                <circle cx={last.x} cy={last.y} r={ENDPOINT_DOT_R} fill={accentColor} />
              </>
            )}
          </g>
        )
      })}
    </>
  )
}

export function renderPie(
  series: ChartSeries[],
  palette: string[],
  x0: number,
  y0: number,
  w: number,
  h: number,
  _mutedColor?: string,
  _textColor?: string,
  _accentColor?: string,
): ReactElement {
  const data = series[0]?.data ?? []
  const total = data.reduce((s, d) => s + d.y, 0)
  if (total === 0) return <></>
  let acc = 0
  const cx = x0 + w / 2
  const cy = y0 + h / 2
  const r = Math.min(w, h) / 2 - 4
  return (
    <>
      {data.map((d, i) => {
        const startA = (acc / total) * Math.PI * 2 - Math.PI / 2
        acc += d.y
        const endA = (acc / total) * Math.PI * 2 - Math.PI / 2
        const large = endA - startA > Math.PI ? 1 : 0
        const x1 = cx + Math.cos(startA) * r
        const y1 = cy + Math.sin(startA) * r
        const x2 = cx + Math.cos(endA) * r
        const y2 = cy + Math.sin(endA) * r
        return (
          <path
            key={i}
            d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
            fill={palette[i % palette.length]}
          />
        )
      })}
    </>
  )
}

export function renderFunnel(
  series: ChartSeries[],
  palette: string[],
  x0: number,
  y0: number,
  w: number,
  h: number,
  _mutedColor?: string,
  _textColor?: string,
  _accentColor?: string,
): ReactElement {
  const data = series[0]?.data ?? []
  const max = Math.max(...data.map((d) => d.y), 1)
  const stepH = h / Math.max(data.length, 1)
  return (
    <>
      {data.map((d, i) => {
        const ratio = d.y / max
        const barW = w * ratio
        const barX = x0 + (w - barW) / 2
        return (
          <rect
            key={i}
            x={barX}
            y={y0 + i * stepH + 2}
            width={barW}
            height={stepH - 4}
            fill={palette[i % palette.length]}
          />
        )
      })}
    </>
  )
}

/**
 * dumbbell 哑铃变化图（2026-07-12 借鉴财经简报）：series[0]=起点值、
 * series[1]=终点值（等长同 x），每行「muted 起点●——线——accent 终点●」+
 * 双端数值标签，行标签左侧右对齐。表达「从 A 到 B 的变化」。
 */
const DUMBBELL_LABEL_W = 96
const DUMBBELL_DOT_R = 5

export function renderDumbbell(
  series: ChartSeries[],
  _palette: string[],
  x0: number,
  y0: number,
  w: number,
  h: number,
  mutedColor: string,
  textColor: string,
  accentColor: string,
): ReactElement {
  const fromData = series[0]?.data ?? []
  const toData = series[1]?.data ?? []
  const rows = Math.min(fromData.length, toData.length)
  if (rows === 0) return <></>
  const all = [...fromData, ...toData].map((d) => d.y)
  const max = Math.max(...all, 1)
  const plotX = x0 + DUMBBELL_LABEL_W + 12
  const plotW = Math.max(1, w - DUMBBELL_LABEL_W - 12 - 56)
  const rowH = h / rows
  const vx = (v: number) => plotX + (v / max) * plotW
  return (
    <>
      {Array.from({ length: rows }, (_, i) => {
        const from = fromData[i]
        const to = toData[i]
        const cy = y0 + i * rowH + rowH / 2
        const label = fitSvgLine(String(from.x), {
          maxWidth: DUMBBELL_LABEL_W,
          fontSize: 13,
          minFontSize: 10,
        })
        const x1 = vx(from.y)
        const x2 = vx(to.y)
        return (
          <g key={i}>
            <text
              x={x0 + DUMBBELL_LABEL_W}
              y={cy + 4}
              textAnchor="end"
              fontSize={label.fontSize}
              fontWeight="600"
              fill={textColor}
              dominantBaseline="alphabetic"
            >
              {label.text}
            </text>
            <line x1={x1} y1={cy} x2={x2} y2={cy} stroke={mutedColor} strokeWidth={2} strokeOpacity={0.55} />
            <circle cx={x1} cy={cy} r={DUMBBELL_DOT_R} fill={mutedColor} />
            <circle cx={x2} cy={cy} r={DUMBBELL_DOT_R + 1.5} fill={accentColor} />
            <text
              x={x1}
              y={cy - 11}
              textAnchor="middle"
              fontSize={LABEL_FONT_SIZE}
              fill={mutedColor}
              dominantBaseline="alphabetic"
            >
              {from.y}
            </text>
            <text
              x={x2 + DUMBBELL_DOT_R + 8}
              y={cy + 4}
              fontSize={12.5}
              fontWeight="bold"
              fill={accentColor}
              dominantBaseline="alphabetic"
            >
              {to.y}
            </text>
          </g>
        )
      })}
    </>
  )
}

/**
 * bar 横向模式（2026-07-12 借鉴）：行式横条排名——类目标签左侧右对齐、
 * 条自左起、端值标签在条右。长标签（公司名/条目名）比竖柱友好。
 * 最大条实色 accent，其余同竖版走渐变（横向）。
 */
const BAR_H_LABEL_W = 110

export function renderBarHorizontal(
  series: ChartSeries[],
  _palette: string[],
  x0: number,
  y0: number,
  w: number,
  h: number,
  mutedColor: string,
  textColor: string,
  accentColor: string,
): ReactElement {
  const points = series[0]?.data ?? []
  if (points.length === 0) return <></>
  const max = Math.max(...points.map((d) => d.y), 1)
  const rowH = h / points.length
  const plotX = x0 + BAR_H_LABEL_W + 12
  const plotW = Math.max(1, w - BAR_H_LABEL_W - 12 - 64)
  const gradientId = chartGradientId("chart-barh-grad", w, h, series)
  const gradientShade = scaleHexBrightness(accentColor, BAR_GRADIENT_SHADE_FACTOR)
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1={0} y1={0} x2={1} y2={0}>
          <stop offset="0%" stopColor={gradientShade} />
          <stop offset="100%" stopColor={accentColor} />
        </linearGradient>
      </defs>
      {points.map((d, i) => {
        const barW = (d.y / max) * plotW
        const barY = y0 + i * rowH + 5
        const barH = Math.max(4, rowH - 10)
        const isMax = d.y === max
        const label = fitSvgLine(String(d.x), {
          maxWidth: BAR_H_LABEL_W,
          fontSize: 13,
          minFontSize: 10,
        })
        return (
          <g key={i}>
            <text
              x={x0 + BAR_H_LABEL_W}
              y={barY + barH / 2 + 4}
              textAnchor="end"
              fontSize={label.fontSize}
              fontWeight="600"
              fill={textColor}
              dominantBaseline="alphabetic"
            >
              {label.text}
            </text>
            <rect
              x={plotX}
              y={barY}
              width={barW}
              height={barH}
              fill={isMax ? accentColor : `url(#${gradientId})`}
              opacity={isMax ? 1 : 0.75}
            />
            <text
              x={plotX + barW + 8}
              y={barY + barH / 2 + 4}
              fontSize={12.5}
              fontWeight="bold"
              fill={isMax ? accentColor : mutedColor}
              dominantBaseline="alphabetic"
            >
              {d.y}
            </text>
          </g>
        )
      })}
    </>
  )
}

/**
 * donut 环形图（2026-07-12 借鉴）：pie 的环形变体——环形扇区 path
 * （外弧+内弧，不依赖背景色圆覆盖）+ 中心总值大字 +「总计」小字。
 */
const DONUT_HOLE_RATIO = 0.62

export function renderDonut(
  series: ChartSeries[],
  palette: string[],
  x0: number,
  y0: number,
  w: number,
  h: number,
  mutedColor?: string,
  textColor?: string,
  _accentColor?: string,
): ReactElement {
  const data = series[0]?.data ?? []
  const total = data.reduce((s, d) => s + d.y, 0)
  if (total === 0) return <></>
  let acc = 0
  const cx = x0 + w / 2
  const cy = y0 + h / 2
  const r = Math.min(w, h) / 2 - 4
  const ri = r * DONUT_HOLE_RATIO
  const totalLabel = Number.isInteger(total) ? String(total) : total.toFixed(1)
  const fitted = fitSvgLine(totalLabel, { maxWidth: ri * 1.5, fontSize: 30, minFontSize: 16 })
  return (
    <>
      {data.map((d, i) => {
        const startA = (acc / total) * Math.PI * 2 - Math.PI / 2
        acc += d.y
        const endA = (acc / total) * Math.PI * 2 - Math.PI / 2
        const large = endA - startA > Math.PI ? 1 : 0
        const ox1 = cx + Math.cos(startA) * r
        const oy1 = cy + Math.sin(startA) * r
        const ox2 = cx + Math.cos(endA) * r
        const oy2 = cy + Math.sin(endA) * r
        const ix1 = cx + Math.cos(endA) * ri
        const iy1 = cy + Math.sin(endA) * ri
        const ix2 = cx + Math.cos(startA) * ri
        const iy2 = cy + Math.sin(startA) * ri
        return (
          <path
            key={i}
            d={`M ${ox1} ${oy1} A ${r} ${r} 0 ${large} 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${ri} ${ri} 0 ${large} 0 ${ix2} ${iy2} Z`}
            fill={palette[i % palette.length]}
          />
        )
      })}
      <text
        x={cx}
        y={cy + fitted.fontSize * 0.15}
        textAnchor="middle"
        fontSize={fitted.fontSize}
        fontWeight="bold"
        fill={textColor}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
      <text
        x={cx}
        y={cy + fitted.fontSize * 0.15 + 18}
        textAnchor="middle"
        fontSize={12}
        fill={mutedColor}
        dominantBaseline="alphabetic"
      >
        总计
      </text>
    </>
  )
}
