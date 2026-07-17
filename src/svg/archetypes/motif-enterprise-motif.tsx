import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"

/**
 * enterprise-motif archetype（2026-07-10 motif 全覆盖补齐）：瑞士网格
 * 语言的 IKB 几何点缀——小方块阵/细基线/方点散点，白墙上克制的企业
 * 秩序感。构图变体：a=右上 3×3 小方块阵、b=左缘竖细条+右下方块、
 * c=对角双方块。强档（仅 cover）全量，弱档单元素。
 * chapter 完全退让（2026-07-11 用户截图实锤：variant a 3×3 方阵叠在
 * poster-chapter 右上 org 文字与顶部 divider 上）——memphis 先例。
 * 纪律：零 theme id、零 hex，颜色来自 ctx（primary=IKB）。
 */
export function EnterpriseMotif({ ir, slide, ctx }: DecorProps) {
  const ikb = ctx.colors.primary
  if (slide.type === "chapter") return null
  const strong = slide.type === "cover"
  const variant = pickBySeed(cachedDeckSeed(ir), "enterprise-decor", ["a", "b", "c"] as const)

  if (!strong) {
    // 弱档：右上小方点
    return <rect x={1216} y={44} width={10} height={10} fill={ikb} opacity={0.85} />
  }

  if (variant === "b") {
    return (
      <>
        {/* 左缘竖细条 + 右下实心方块 */}
        <rect x={0} y={180} width={6} height={360} fill={ikb} />
        <rect x={1200} y={624} width={24} height={24} fill={ikb} />
      </>
    )
  }
  if (variant === "c") {
    return (
      <>
        {/* 对角双方块（左上大右下小，错位秩序） */}
        <rect x={56} y={56} width={28} height={28} fill={ikb} />
        <rect x={96} y={56} width={12} height={12} fill={ikb} opacity={0.45} />
        <rect x={1196} y={632} width={28} height={28} fill={ikb} />
        <rect x={1172} y={648} width={12} height={12} fill={ikb} opacity={0.45} />
      </>
    )
  }
  // a：右上 3×3 小方块阵（透明度渐次）
  return (
    <>
      {[0, 1, 2].map((i) =>
        [0, 1, 2].map((j) => (
          <rect
            key={`${i}${j}`}
            x={1140 + i * 30}
            y={52 + j * 30}
            width={14}
            height={14}
            fill={ikb}
            opacity={1 - (i + j) * 0.14}
          />
        )),
      )}
    </>
  )
}
