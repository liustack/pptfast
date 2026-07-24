import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"

/**
 * ink-motif archetype v2（2026-07-10 精髓返工，检索背书）：水墨的精髓是
 * **墨而非线**——「墨分五色」的大面积淡墨晕染（多层 fill 大形叠不同
 * opacity，消除边界感的气韵）+ 留白对比（疏可走马密不透风）+ **竖排
 * 落款**（竖字+印章是水墨画的完整落款语言）。v1 全是细线条（版框/线描
 * 远山/孤立印章）没有墨韵，被用户裁「还没到精髓」。
 *   - cover/chapter（"强"）：左下三层淡墨晕染远山（fill 叠加）+ 右侧
 *     竖排落款（org 逐字竖排 + 朱砂印章收尾）。
 *   - content/ending（"弱"）：仅保留顶/底细版框（正文页克制，少即是多）。
 * 竖排用逐字 text（不依赖 writing-mode，导出安全）。全部 path/rect/line/
 * text 基础原语。
 * 纪律：零 theme id、零 hex，颜色全部来自 ctx。
 */
export function InkMotif({ slide, ir, ctx }: DecorProps) {
  const { colors } = ctx
  const strong = slide.type === "cover" || slide.type === "chapter"
  const variant = pickBySeed(cachedDeckSeed(ir), "ink-decor", ["a", "b", "c"] as const)
  // 落款竖排：org 前 6 字（落款贵短，克制）
  const sealText = (ir.meta.organization ?? "").slice(0, 6)

  return (
    <>
      {/* 顶/底细版框（chapter 页除外——poster-chapter 自带上下 divider，
          叠加成双线，2026-07-10 用户截图指出） */}
      {slide.type !== "chapter" && (
        <>
          <line x1={48} y1={34} x2={1232} y2={34} stroke={colors.border} strokeWidth={1.5} />
          {/* 底线放 BrandChrome 分隔线的语义位（y=664）——meta 文字 baseline
              在 700，底线再低会穿字（2026-07-10 用户截图：688 时字线融在一起） */}
          <line x1={48} y1={664} x2={1232} y2={664} stroke={colors.border} strokeWidth={1.5} />
        </>
      )}

      {strong && (
        <>
          {/* 淡墨晕染远山（墨分五色 fill 叠加）。构图变体（2026-07-10
              装饰多样性推广）：a=左下（原构图）、b=右下镜像、c=低平远山横贯 */}
          {variant === "a" && (
            <>
              <path d="M -60 720 Q 150 545 380 630 Q 560 692 700 720 Z" fill={colors.primary} opacity={0.1} />
              <path d="M -60 720 Q 110 590 300 655 Q 440 700 540 720 Z" fill={colors.primary} opacity={0.14} />
              <path d="M 180 720 Q 430 585 660 665 Q 800 710 900 720 Z" fill={colors.primary} opacity={0.06} />
            </>
          )}
          {variant === "b" && (
            <>
              <path d="M 1340 720 Q 1130 545 900 630 Q 720 692 580 720 Z" fill={colors.primary} opacity={0.1} />
              <path d="M 1340 720 Q 1170 590 980 655 Q 840 700 740 720 Z" fill={colors.primary} opacity={0.14} />
              <path d="M 1100 720 Q 850 585 620 665 Q 480 710 380 720 Z" fill={colors.primary} opacity={0.06} />
            </>
          )}
          {variant === "c" && (
            <>
              <path d="M -60 720 Q 320 618 720 668 Q 1040 704 1340 690 L 1340 720 Z" fill={colors.primary} opacity={0.09} />
              <path d="M -60 720 Q 240 650 560 690 Q 800 716 980 720 Z" fill={colors.primary} opacity={0.13} />
            </>
          )}

          {/* 右侧竖排落款：org 逐字竖排（楷体小字） + 朱砂印章收尾。
              仅 cover——水墨作品落款一处即可，chapter 右上已有 org 会重复。 */}
          {/* 底部锚定（2026-07-13 用户截图：org 满 6 字时印章底 664 正好
              压版框底线 y=664）——印章底固定在线上方 24px，字列向上反推，
              字数多少都不碰线（poster-ending last-anchored 同思路）。 */}
          {slide.type === "cover" && sealText.split("").map((ch, i) => (
            <text
              key={i}
              x={1186}
              y={598 - (sealText.length - 1 - i) * 32}
              fontFamily={ctx.fonts.heading}
              fontSize={21}
              fill={colors.muted}
              textAnchor="middle"
              dominantBaseline="alphabetic"
            >
              {ch}
            </text>
          ))}
          {slide.type === "cover" && (
            <>
              <rect x={1170} y={608} width={32} height={32} rx={3} fill={colors.accent} />
              <rect
                x={1176}
                y={614}
                width={20}
                height={20}
                fill="none"
                stroke={colors.surface}
                strokeWidth={1.6}
              />
            </>
          )}
        </>
      )}
    </>
  )
}
