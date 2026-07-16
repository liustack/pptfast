// GF/svg/archetypes/motif-poster-motif.tsx
import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"

/**
 * poster-motif archetype（spec §3.2，Wave 3 Task 20）：一个共享的角落
 * 径向渐变光晕（不透明中心 → 透明边缘的单一 gradient def，强弱两档全靠
 * `<circle>` 自身的 `opacity` 承载——svg2pptx 的 `withElementOpacity` 会在
 * 导出时把元素自身 opacity 折进每个 stop，等价于直接把 12%/6% 烤进 stop，
 * 省一份要保持同步的 gradient 定义）：
 *   - cover/chapter（"强"）：右上角，cx=1150 cy=80 r=420，opacity 0.12。
 *   - content/ending（"弱"，ending 与 content 同款）：同一 gradient 镜像到
 *     右下角，cx=1150 cy=640 r=300，opacity 0.06（cy 80→640 是跨页面纵向
 *     中心的镜像）。
 *   - Cover 额外（"另加"）在左下角叠一个小光点装饰——一个实心圆点 + 两圈
 *     纯描边的同心环；chapter 没有这个额外装饰，因为它只是 cover 专属的
 *     叠加物，不是第二档"强"元素。
 * 自 templates/creative.tsx 的 `EditorialDarkDecor`（846-885 行，Step A 用
 * `grep -n` 实测边界——比 brief 给出的 846-894（EOF）短，888-894 行是文件尾
 * `creativeTemplate` 导出对象，已按任务要求排除，不属于本函数体）提炼。
 * 随迁 helper：模块级私有常量 `GLOW_GRADIENT_ID`/`GLOW_MOTIF_CX`/
 * `GLOW_MOTIF_CY`（源文件 841-844 行，只被本函数消费，随函数体一并复制为
 * 本文件私有常量，不建公共 util）——纯几何/id 值，不是颜色，不进替换表。
 *
 * 替换表（Step B，逐行核对函数体）：**无**——函数体内没有任何烤死的
 * 十六进制颜色常量，唯一出现的颜色表达式是 `ctx.colors.accent`，本就是
 * 直接消费 token（径向渐变的两个 stop 色、Cover 专属光点装饰的圆点/描边色
 * 均如此），从未烤死过。故无孤儿色，也没有需要做映射决策的替换。
 *
 * **档位一・逐字节等价**（函数区间内无烤死主题常量需要映射）。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量。
 */
const GLOW_MOTIF_CX = 200
const GLOW_MOTIF_CY = 560

/**
 * 构图变体（2026-07-10 装饰多样性推广；2026-07-12 用户裁决**径向光晕
 * 全部移除**——预览里 0.06-0.12 透明度几乎不可见，导出后渐变在 Office
 * 渲染变实变硬非常难看，预览/导出观感不一致的装饰不留）：仅保留 cover
 * 同心光点签名（清晰的小元素，两端一致），a/c=左下、b=右下镜像。
 * chapter 的装饰由 roman-chapter 版式自带的圆弧承担，content/ending
 * 不画（正文页克制）。
 */
export function PosterMotif({ ir, slide, ctx }: DecorProps) {
  const { colors } = ctx
  const variant = pickBySeed(cachedDeckSeed(ir), "poster-decor", ["a", "b", "c"] as const)
  const dotCx = variant === "b" ? 1280 - GLOW_MOTIF_CX : GLOW_MOTIF_CX

  if (slide.type !== "cover") return null
  return (
    <>
      <circle cx={dotCx} cy={GLOW_MOTIF_CY} r="6" fill={colors.accent} />
      <circle
        cx={dotCx}
        cy={GLOW_MOTIF_CY}
        r="12"
        fill="none"
        stroke={colors.accent}
        strokeOpacity="0.2"
      />
      <circle
        cx={dotCx}
        cy={GLOW_MOTIF_CY}
        r="18"
        fill="none"
        stroke={colors.accent}
        strokeOpacity="0.08"
      />
    </>
  )
}
