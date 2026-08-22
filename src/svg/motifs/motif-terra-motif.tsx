import type { DecorProps } from "./types"
import { DecorPiece } from "./decor-piece"
import { leafRecessOpacity } from "./decor-budget"

/**
 * terra-motif v2 —— 「等高线」（2026-08-19 暖纸组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group2-warm-boards.dc.html` 的
 * terra 设计表，几何坐标逐条抄录，不派生）。
 *
 * 换掉的东西：v1 是三档 seed 变体，每档都在两个角上摆「扰动闭合贝塞尔环
 * 的嵌套簇」（`contourRing`/`contourCluster`，半径 170-210、4 层）+ 叶脉
 * + 种子点簇，content 弱档另有一套。三样词汇同时在场、位置随 seed 跳，
 * 读起来像三种装饰挤在一页上；那些大簇还是水彩晕染时代留下的满角构图。
 * v2 只留两件，位置写死：
 *   - **左下等高线簇**：三条不闭合的平缓等高线，x48→420，实际落在
 *     y634-658 带内（设计板标注 y624-658，控制点 622 不在曲线上），
 *     橄榄（primary）1.2px、整组 0.5 不透明。地形图的读法来自「几条平行
 *     推进的缓线」，不是「几个同心圈」——v1 的闭合环反而读成靶子。
 *   - **右缘种子点列**：x1252 上三枚 r2.5 的实心圆点，y64/96/128，
 *     橄榄（primary）。播种/根系的意象，收到页缘只占一条窄带。
 * 叶脉与水彩晕染一并退役（设计板 terra 的结构行是 light 档，「light 档
 * 仅此两件」是板上原话）。
 *
 * chapter 继续完全退让（`return null`，v1 起就是如此，理由本轮更硬）：
 * terra 的 chapter 默认底色是整版 primary 橄榄（`themes/terra.ts` 的
 * `defaultBackgrounds.chapter`），而本 motif 两件东西的颜色都是 primary
 * ——画上去就是橄榄压橄榄，不是「克制」而是「看不见」。八个 chapter
 * layout 又都在这块整版色上画巨幅居中标题，可用净空本就零碎。两条理由
 * 同向，chapter 不画。
 *
 * 安全区（设计板上四条红虚线禁区）：标题区 (96,48,1040×122)、正文区
 * (96,200,1040×420)、页脚 meta 带 (48,664,1184×44)、右下 logo 盒
 * (1120,630,96×40)。
 *   - 等高线的最高点 ≈y634（三条曲线各自的极值逐条算过，见
 *     `motif-terra-motif.test.tsx` 的实测断言），在正文区下沿 y620 之下；
 *     最低点 y658，在页脚 meta 带上沿 y664 之上。
 *   - 种子点 x1249.5-1254.5，在标题区右沿 x1136 与右上 logo 盒右沿 x1216
 *     之外；y61.5-130.5 与标题区纵向重叠，但横向完全不相交。
 *   - 设计板坐标一处未改。
 *
 * 已知且沿袭：`left-anchor` 封面在左侧画一块 512 宽的整幅 primary 色块
 * （`cover-left-anchor.tsx` 的 `COVER_BLOCK_W`），terra 声明了这个 cover
 * id，抽到它时左下等高线会落在同色块上而读不出来。这不是本轮引入的
 * ——v1 的 `contourCluster(90, 700, …, primary, 0.16)` 落在同一片区域、
 * 同样是 primary，行为一致。修它要么让 motif 知道当页选中了哪个 layout
 * （内容感知，`inventory.md` 的确定性红线禁止），要么改 layout（本轮
 * 「其余主题逐字节不变」的约束禁止），两条都越界，故照实记录、不改。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线。
 * v1 的三档 seed 变体因此删除，`cachedDeckSeed`/`pickBySeed` 依赖退出本文件。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（primary = 橄榄）。本 motif
 * 是 terra 独占的单成员候选集（`motif-selection.ts` 的 `MOTIF_CANDIDATES`），
 * 没有别的主题借用它。
 */

// ── 左下等高线簇（三条平缓推进的地形线） ────────────────────────────────
/**
 * 设计板逐条抄录的三条二次贝塞尔折线。控制点上的 622/630/632 不落在曲线
 * 上——曲线各自的实际最高点约 634/638/638（`motif-terra-motif.test.tsx`
 * 用采样把这三个数字锁死，改动任何一个控制点都会红）。
 */
const CONTOURS: readonly string[] = [
  "M48,658 Q160,622 300,640 Q380,650 420,646",
  "M48,650 Q150,630 270,644",
  "M48,642 Q120,632 200,644",
]
const CONTOUR_STROKE = 1.2
/**
 * 0.5 → 0.25（2026-08-21 变淡波）。几何一 px 不动，只降不透明度。
 *
 * y634-658 这条带不是空的：署名、脚注、页脚 meta 都落在这里。墨盒扫掠工具
 * （`.issues/2026-08-21-restore-design-decor/tools/decor-ink-sweep.mts`）扫
 * 三语料 153 页，三条曲线分别压中 49 / 41 / 40 页的正文墨盒，封面的
 * 「陈砚清 · 首席技术官」是其中一处。曾经有一波把整簇翻到页顶去躲，被设计
 * 裁定推翻：板上的位置是设计的一部分，装饰与文字抢主次时只许变淡。
 *
 * 0.25 是实测挑的：橄榄压米纸满不透明是 5.9:1，0.5 档 2.15:1 仍在正文的
 * 判读区间边上，0.25 落到 1.43:1，与本主题 border 细线压米纸的 1.27:1
 * 同一档——先读字、后读地形线，而 1.2px 的曲线在纸底上依然看得清。
 * 右缘种子点全语料零相交，原样不动。
 */
const CONTOUR_OPACITY = 0.25

// ── 右缘种子点列 ────────────────────────────────────────────────────────
const SEED_X = 1252
const SEED_R = 2.5
const SEED_YS: readonly number[] = [64, 96, 128]

export function TerraMotif({ slide, ctx }: DecorProps) {
  const olive = ctx.colors.primary
  const bg = ctx.defaultBg ?? ctx.colors.bg

  // chapter 是整版 primary 橄榄底，本 motif 两件东西也都是 primary——
  // 画上去看不见（见文件头）。
  if (slide.type === "chapter") return null

  return (
    <>
      <DecorPiece id="contours">
        {CONTOURS.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke={olive}
            strokeWidth={CONTOUR_STROKE}
            opacity={leafRecessOpacity(slide.type, olive, bg, CONTOUR_OPACITY)}
          />
        ))}
      </DecorPiece>
      <DecorPiece id="seeds">
        {SEED_YS.map((cy) => (
          <circle
            key={cy}
            cx={SEED_X}
            cy={cy}
            r={SEED_R}
            fill={olive}
            opacity={leafRecessOpacity(slide.type, olive, bg)}
          />
        ))}
      </DecorPiece>
    </>
  )
}
