/**
 * PPTX 幻灯片图标渲染。目录数据来自共享单源 `@/icons`
 * （lucide 提取，zod 枚举同源），本文件只负责把原语渲染进受控 SVG 子集：
 * path（含贝塞尔）/circle/ellipse/rect/line/polyline/polygon + g(translate/scale)。
 * 不产出嵌套 svg、foreignObject、渐变或 var()。
 */
import type React from "react"
import {
  PPTX_ICONS,
  type PptxIconPrimitive,
} from "@/icons"

export interface IconProps {
  /** Logical icon name (must exist in the shared catalogue). */
  name: string
  /** Translate-x in the parent coordinate space. */
  x: number
  /** Translate-y in the parent coordinate space. */
  y: number
  /** Rendered size in px (the 24×24 viewbox is uniformly scaled to this). */
  size: number
  /** Stroke colour — must be a hex string (no CSS var / gradient). */
  color: string
}

const STROKE_PROPS = {
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const

function renderPrimitive(
  prim: PptxIconPrimitive,
  i: number,
  color: string,
): React.ReactElement {
  const [tag, attrs] = prim
  // 目录里 fill 只会是 "currentColor"（codegen 逐值校验）：散点类图标的
  // 实心小圆点，映射成图标颜色实心填充；其余原语保持 stroke-only。
  const common = {
    key: i,
    stroke: color,
    ...STROKE_PROPS,
    ...(attrs.fill === "currentColor" ? { fill: color } : {}),
  }
  switch (tag) {
    case "path":
      return <path {...common} d={attrs.d} />
    case "circle":
      return <circle {...common} cx={attrs.cx} cy={attrs.cy} r={attrs.r} />
    case "ellipse":
      return (
        <ellipse {...common} cx={attrs.cx} cy={attrs.cy} rx={attrs.rx} ry={attrs.ry} />
      )
    case "rect":
      return (
        <rect
          {...common}
          x={attrs.x}
          y={attrs.y}
          width={attrs.width}
          height={attrs.height}
          rx={attrs.rx}
          ry={attrs.ry}
        />
      )
    case "line":
      return <line {...common} x1={attrs.x1} y1={attrs.y1} x2={attrs.x2} y2={attrs.y2} />
    case "polyline":
      return <polyline {...common} points={attrs.points} />
    case "polygon":
      return <polygon {...common} points={attrs.points} />
    default:
      throw new Error(`Icon: 目录含不支持的原语 <${tag}>`)
  }
}

/**
 * Render a lucide-style stroke icon as a `<g>` suitable for the controlled
 * SVG subset. The icon is scaled from its native 24px coordinate space to
 * `size` and placed at `(x, y)`.
 */
export function Icon({ name, x, y, size, color }: IconProps): React.ReactElement {
  const primitives = PPTX_ICONS[name]
  if (!primitives) {
    throw new Error(`Icon: unknown icon name "${name}"`)
  }
  const scale = size / 24
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      {primitives.map((prim, i) => renderPrimitive(prim, i, color))}
    </g>
  )
}
