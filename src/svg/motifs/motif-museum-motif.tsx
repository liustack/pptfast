import type { DecorProps } from "./types"

/**
 * museum-motif —— 「展签与标本针」（2026-08-21 博物主题。几何写死在本文件，
 * 不派生、不读内容、不随 seed 变）。
 *
 * 博物馆标签牌语汇，light 档，三件东西全部走页缘：
 *   - **左上展签**：针点 (40,18) r=2，短茎接到细框 x24 y26 w56 h14。
 *     标本号牌，不是 luxe 那种满页金框。
 *   - **右上角标**：针点 (1240,18) r=2，外加 12px 的 L 形细 tick
 *     （横 1228→1240 @ y26，竖 1240 @ y26→38）。目录角标。竖边只有
 *     12px，不是左竖条。
 *   - **底缘两枚针点**：(40,712) 与 (1240,712)，r=2。y=712 在页脚带
 *     (48,664,1184×44) 之下，x 在带外。
 *
 * 四页型都画同一张。不按组件数降档（那是 heavy 主题的事）。chapter 底与
 * 内容同色（`themes/museum.ts` 的 `defaultBackgrounds.chapter` 不是
 * primary 满版），纹饰压在棕黑上读得出来，不退让。
 *
 * 安全区（`docs/designing-themes.md` 第 5 条五个保护区）：
 *   - 标题区 (96,48,1040×122)：展签底沿 y=40，右 tick 止于 y=38，都在
 *     y48 之上。
 *   - 正文区 (96,200,1040×420)：零件全在页缘，x≤80 或 x≥1228。
 *   - 页脚 meta (48,664,1184×44)：底针 y=712、x=40 / 1240，带外。
 *   - 右下 logo 盒 (1120,630,96×40)：右底针 (1240,712) 在盒右下外侧。
 *   - 第五带 y620-664：一件不进。
 *
 * 红线：任何形态的粗平左竖条禁止出现。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（accent = 展签铜金）。
 * 画笔属性一律写在叶子上不挂 `<g>`。横竖线走 `<line>`（`svg2pptx` 对
 * 零高度 path 会拒）。本 motif 是 museum 独占的单成员候选集
 * （`motif-selection.ts` 的 `MOTIF_CANDIDATES`），没有别的主题借用它。
 *
 * 可拉伸性：铜金即参数。换 token 即换装，针点与展签几何不动。
 */

const PIN_R = 2
const PIN_OPACITY = 1
const HAIRLINE = 0.75
const HAIRLINE_OPACITY = 0.75

const PIN_TL = { cx: 40, cy: 18 } as const
const PIN_TR = { cx: 1240, cy: 18 } as const
const PIN_BL = { cx: 40, cy: 712 } as const
const PIN_BR = { cx: 1240, cy: 712 } as const

const LABEL = { x: 24, y: 26, w: 56, h: 14 } as const
const STEM = { x1: 40, y1: 20, x2: 40, y2: 26 } as const

const TICK_H = { x1: 1228, y1: 26, x2: 1240, y2: 26 } as const
const TICK_V = { x1: 1240, y1: 26, x2: 1240, y2: 38 } as const

const PINS = [PIN_TL, PIN_TR, PIN_BL, PIN_BR] as const

export function MuseumMotif({ ctx }: DecorProps) {
  const gold = ctx.colors.accent

  return (
    <>
      {PINS.map((p) => (
        <circle key={`${p.cx},${p.cy}`} cx={p.cx} cy={p.cy} r={PIN_R} fill={gold} opacity={PIN_OPACITY} />
      ))}
      <line
        x1={STEM.x1}
        y1={STEM.y1}
        x2={STEM.x2}
        y2={STEM.y2}
        stroke={gold}
        strokeWidth={HAIRLINE}
        opacity={HAIRLINE_OPACITY}
      />
      <rect
        x={LABEL.x}
        y={LABEL.y}
        width={LABEL.w}
        height={LABEL.h}
        fill="none"
        stroke={gold}
        strokeWidth={HAIRLINE}
        opacity={HAIRLINE_OPACITY}
      />
      <line
        x1={TICK_H.x1}
        y1={TICK_H.y1}
        x2={TICK_H.x2}
        y2={TICK_H.y2}
        stroke={gold}
        strokeWidth={HAIRLINE}
        opacity={HAIRLINE_OPACITY}
      />
      <line
        x1={TICK_V.x1}
        y1={TICK_V.y1}
        x2={TICK_V.x2}
        y2={TICK_V.y2}
        stroke={gold}
        strokeWidth={HAIRLINE}
        opacity={HAIRLINE_OPACITY}
      />
    </>
  )
}
