import type { DecorProps } from "./types"
import { DecorPiece } from "./decor-piece"
import { leafRecessOpacity } from "./decor-budget"

/**
 * constellation-motif —— tech 的细规线（第八波，星座链退役）。
 *
 * 删掉的三件，逐条交代去向：
 *   - **右缘节点链**（主链七折点 + accent/冷序列节点 + 辉光）：删。用户否决
 *     星座碎点（kickoff 退役表）。封面板「不要星座」。
 *   - **双轨道弧**（圆心页外右上 r430/r310）：删。同属星座语汇。
 *   - **顶带疏星 / 支链碎点**：r2 已裁，本波不再加回。
 *
 * 现在画的一件：顶缘细规线（`colors.border`，永不亮色）。内容页在线上落
 * 两枚 accent 青点，点必须骑在线上，不许单点漂角落（孤立小件禁令）。
 * 封面 / ending 只画线，青光留给版式里的 `**强调**` 与收束青段。
 * chapter 完全退让：章节版式自己画空心序号 + 底规线青段，装饰计数 = 2，
 * motif 再画就是第三件。
 *
 * 安全区：标题区 (96,48,1040×122)、正文区 (96,200,1040×420)、页脚 meta
 * 带 (48,664,1184×44)、右下 logo 盒 (1120,630,96×40)、右上 logo 带
 * (1120,48,96×40)。规线 y36，在标题区上沿 y48 之上。横向 96→1104，让开
 * 右上 logo 左沿 1120。
 *
 * 位置全部写死，不读内容、不随 seed 变。纪律：零 theme id、零 hex。
 * 叶子走 `leafRecessOpacity`，内容页中景对比低于 3:1。
 */

const RULE_Y = 36
const RULE_X1 = 96
const RULE_X2 = 1104
const RULE_STROKE = 1.5
/** 内容页点睛：两枚，圆心就在规线上。 */
const MARKS: readonly { x: number; r: number }[] = [
  { x: 96, r: 2.5 },
  { x: 160, r: 2.5 },
]

export function ConstellationMotif({ slide, ctx }: DecorProps) {
  if (slide.type === "chapter") return null

  const { colors } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const track = colors.border ?? colors.muted
  const showMarks = slide.type === "content"

  return (
    <DecorPiece id="rule-marks">
      <polyline
        points={`${RULE_X1},${RULE_Y} ${RULE_X2},${RULE_Y}`}
        fill="none"
        stroke={track}
        strokeWidth={RULE_STROKE}
        opacity={leafRecessOpacity(slide.type, track, bg)}
      />
      {showMarks &&
        MARKS.map((mark) => (
          <circle
            key={mark.x}
            cx={mark.x}
            cy={RULE_Y}
            r={mark.r}
            fill={colors.accent}
            opacity={leafRecessOpacity(slide.type, colors.accent, bg)}
          />
        ))}
    </DecorPiece>
  )
}
