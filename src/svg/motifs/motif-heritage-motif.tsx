import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"

/**
 * heritage-motif archetype v2（2026-07-11 用户裁决重设计：v1 四角单弧
 * 「不好看」像随手括号，且与 chapter chrome / footer 多处碰撞）：典藏
 * 书籍装帧语言——扉页徽记 / 扉页双线框 / 书页缘竖线。
 * 构图变体（仅 cover）：a=顶部中央菱形双线徽记+两侧延伸线、b=四角
 * 焦糖角钉小菱形（v2.1：整框与 seed 随机的 split-diagonal 封面互斥——
 * 左半框被色块吞掉、框线穿斜切缘，渲染实拍裁掉。小型角元素对任何
 * 封面版式都安全）、c=左右页缘竖双线。
 * chapter 完全退让（memphis 先例：org + 上下 divider + 巨号数字已满）。
 * 弱档（content/ending）：右上小菱形双线（呼应徽记）——v1 底部中央线
 * y=690 漂在 content footer meta 带正中（用户截图实锤），废弃。
 * 纪律：零 theme id、零 hex，颜色来自 ctx（primary=勃艮第/accent=焦糖）。
 */
export function HeritageMotif({ ir, slide, ctx }: DecorProps) {
  const wine = ctx.colors.primary
  const caramel = ctx.colors.accent
  if (slide.type === "chapter") return null
  const variant = pickBySeed(cachedDeckSeed(ir), "heritage-decor", ["a", "b", "c"] as const)

  if (slide.type !== "cover") {
    // 弱档：右上小菱形双线徽记
    return (
      <>
        <path d="M 1216 44 L 1230 58 L 1216 72 L 1202 58 Z" fill="none" stroke={wine} strokeWidth={1.2} opacity={0.55} />
        <path d="M 1216 51 L 1223 58 L 1216 65 L 1209 58 Z" fill="none" stroke={caramel} strokeWidth={0.9} opacity={0.5} />
      </>
    )
  }

  if (variant === "b") {
    // 四角焦糖角钉小菱形——焦糖在勃艮第色块和米底上都可见
    const stud = (cx: number, cy: number) => `M ${cx} ${cy - 9} L ${cx + 9} ${cy} L ${cx} ${cy + 9} L ${cx - 9} ${cy} Z`
    return (
      <>
        <path d={stud(56, 56)} fill={caramel} opacity={0.7} />
        <path d={stud(1224, 56)} fill={caramel} opacity={0.7} />
        <path d={stud(56, 664)} fill={caramel} opacity={0.7} />
        <path d={stud(1224, 664)} fill={caramel} opacity={0.7} />
      </>
    )
  }
  if (variant === "c") {
    return (
      <>
        {/* 左右缘竖双线（典籍页缘） */}
        <path d="M 40 96 V 624 M 48 96 V 624" stroke={caramel} strokeWidth={1} fill="none" opacity={0.5} />
        <path d="M 1232 96 V 624 M 1240 96 V 624" stroke={caramel} strokeWidth={1} fill="none" opacity={0.5} />
      </>
    )
  }
  // a：顶部中央菱形双线徽记 + 两侧延伸线
  return (
    <>
      <path d="M 640 36 L 664 58 L 640 80 L 616 58 Z" fill="none" stroke={wine} strokeWidth={1.4} opacity={0.6} />
      <path d="M 640 46 L 654 58 L 640 70 L 626 58 Z" fill="none" stroke={caramel} strokeWidth={1} opacity={0.5} />
      {/* 两侧延伸线：两条 <line>，不用只走一根轴的 <path> — svg2pptx 会把
          <path>（哪怕纯水平）转成 custGeom，包围盒零高度会被 package-audit
          硬门的 invalid-shape-transform 规则拒绝（建这道门时发现，spec
          §4.4）。真正的 <line> 走 svg2pptx/line.ts 的 prstGeom="line"，该
          规则明确允许一根轴为零。 */}
      <line x1={480} y1={58} x2={600} y2={58} stroke={caramel} strokeWidth={1} opacity={0.4} />
      <line x1={680} y1={58} x2={800} y2={58} stroke={caramel} strokeWidth={1} opacity={0.4} />
    </>
  )
}
