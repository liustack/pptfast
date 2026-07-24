/**
 * PPTX 幻灯片图标渲染。目录数据来自共享单源 `@/icons/catalog`
 * （lucide 提取，zod 枚举同源），本文件只负责把原语渲染进受控 SVG 子集：
 * path（含贝塞尔）/circle/ellipse/rect/line/polyline/polygon + g(translate/scale)。
 * 不产出嵌套 svg、foreignObject、渐变或 var()。
 */
import type React from "react"
import {
  PPTX_ICONS,
  type PptxIconPrimitive,
} from "@/icons/catalog"

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
  //
  // `key` is passed directly at each JSX call site below (`key={i}`), never
  // inside this spread object (post-v0.3 W8 fix round, backlog item 11,
  // `.issues/notes/2026-07-18-post-v03-backlog.md` #11): React 19 warns
  // ("A props object containing a 'key' prop is being spread into JSX") the
  // moment an object carrying an own `key` field is spread into an element,
  // which every one of the 7 tag branches below did before this fix —
  // confirmed via a real `renderToStaticMarkup` call
  // (`icons.key-spread.test.tsx`, kept in its own file rather than folded
  // into `icons.test.tsx` — see that file's header for why) firing the
  // warning once per distinct tag pre-fix. Purely a prop-shape change —
  // `key` was never read as a rendered attribute (React special-cases it
  // out of the DOM regardless of where it's read from), so every case's
  // rendered markup is byte-identical before and after.
  const common = {
    stroke: color,
    ...STROKE_PROPS,
    ...(attrs.fill === "currentColor" ? { fill: color } : {}),
  }
  switch (tag) {
    case "path":
      return <path key={i} {...common} d={attrs.d} />
    case "circle":
      return <circle key={i} {...common} cx={attrs.cx} cy={attrs.cy} r={attrs.r} />
    case "ellipse":
      return (
        <ellipse key={i} {...common} cx={attrs.cx} cy={attrs.cy} rx={attrs.rx} ry={attrs.ry} />
      )
    case "rect":
      return (
        <rect
          key={i}
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
      return <line key={i} {...common} x1={attrs.x1} y1={attrs.y1} x2={attrs.x2} y2={attrs.y2} />
    case "polyline":
      return <polyline key={i} {...common} points={attrs.points} />
    case "polygon":
      return <polygon key={i} {...common} points={attrs.points} />
    default:
      throw new Error(`Icon: catalogue contains an unsupported primitive <${tag}>`)
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
