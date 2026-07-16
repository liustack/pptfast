import type { PptxIR, Slide } from "@/ir"
import type { BlockCtx } from "./blocks/types"
import { CANVAS_W_PX, CANVAS_H_PX } from "../constants"

/**
 * 受控装饰原语（图片排版 P4）。模型只有选择权（kind + intensity +
 * corner_tag 的 text），绘制全部在这里手写、按主题 token 着色——不存在
 * 「模型直出 SVG path」的通道。仅 slide.decor 显式声明时渲染，画在
 * Background 之上、Body 之下（不遮字），位置固定在角部/边缘。
 */
const W = CANVAS_W_PX
const H = CANVAS_H_PX

function alpha(intensity: "subtle" | "normal" | undefined, subtle: number, normal: number): number {
  return (intensity ?? "normal") === "subtle" ? subtle : normal
}

/** 本页在全 deck 里的章节序（第 N 个 chapter；非 chapter 页取所在章节）。 */
function chapterNumber(ir: PptxIR, index: number): number {
  let n = 0
  for (let i = 0; i <= index && i < ir.slides.length; i++) {
    if (ir.slides[i].type === "chapter") n++
  }
  return Math.max(1, n)
}

export function SlideDecor({
  ir,
  slide,
  index,
  ctx,
}: {
  ir: PptxIR
  slide: Slide
  index: number
  ctx: BlockCtx
}) {
  const decor = slide.decor
  if (!decor) return null
  const { colors, fonts } = ctx

  switch (decor.kind) {
    case "big_number": {
      // 章节大序号 + 细线（建筑 deck「01/04」形态）：右下角超大编号
      const num = String(chapterNumber(ir, index)).padStart(2, "0")
      return (
        <g>
          <text
            x={W - 72}
            y={H - 92}
            textAnchor="end"
            fontSize={140}
            fontWeight={700}
            fontFamily={fonts.heading}
            fill={colors.primary}
            fillOpacity={alpha(decor.intensity, 0.08, 0.14)}
            dominantBaseline="alphabetic"
          >
            {num}
          </text>
          <rect
            x={W - 210}
            y={H - 78}
            width={138}
            height={2}
            fill={colors.accent}
            fillOpacity={alpha(decor.intensity, 0.5, 0.85)}
          />
        </g>
      )
    }
    case "corner_tag": {
      // 页角色块小标签（text 由模型给，如栏目名/kicker）
      const label = (decor.text ?? "").slice(0, 12)
      if (!label) return null
      const w = 24 + label.length * 15
      return (
        <g>
          <rect
            x={W - 96 - w}
            y={64}
            width={w}
            height={30}
            fill={colors.accent}
            fillOpacity={alpha(decor.intensity, 0.75, 1)}
          />
          <text
            x={W - 96 - w / 2}
            y={84}
            textAnchor="middle"
            fontSize={14}
            fontWeight={600}
            fontFamily={fonts.body}
            fill={colors.primary}
            dominantBaseline="alphabetic"
          >
            {label}
          </text>
        </g>
      )
    }
    case "rule_line": {
      // booktabs 风格分隔线组：顶部粗+细双线
      const o = alpha(decor.intensity, 0.35, 0.7)
      return (
        <g>
          <rect x={96} y={56} width={W - 192} height={3} fill={colors.primary} fillOpacity={o} />
          <rect x={96} y={64} width={W - 192} height={1} fill={colors.border} fillOpacity={o} />
        </g>
      )
    }
    case "quote_marks": {
      // 大引号饰（家居 #9 引言页形态）：左上巨型引号
      return (
        <text
          x={72}
          y={230}
          fontSize={220}
          fontFamily={fonts.heading}
          fill={colors.accent}
          fillOpacity={alpha(decor.intensity, 0.14, 0.24)}
          dominantBaseline="alphabetic"
        >
          “
        </text>
      )
    }
    case "geo_dots": {
      // 几何点缀：右上角 4×4 圆点网格
      const o = alpha(decor.intensity, 0.18, 0.35)
      const dots = []
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          dots.push(
            <circle
              key={`${r}-${c}`}
              cx={W - 150 + c * 22}
              cy={70 + r * 22}
              r={3}
              fill={colors.primary}
              fillOpacity={o}
            />,
          )
        }
      }
      return <g>{dots}</g>
    }
    default: {
      void (decor.kind satisfies never)
      return null
    }
  }
}
