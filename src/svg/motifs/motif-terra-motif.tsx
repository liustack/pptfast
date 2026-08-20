import type { DecorProps } from "./types"

/**
 * terra-motif v3 —— 「等高线」（2026-08-19 暖纸组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group2-warm-boards.dc.html` 的
 * terra 设计表；v3 是 2026-08-20 第四轮评审「装饰归背景」的返工）。
 *
 * v2 换掉的东西：v1 是三档 seed 变体，每档都在两个角上摆「扰动闭合贝塞尔环
 * 的嵌套簇」（`contourRing`/`contourCluster`，半径 170-210、4 层）+ 叶脉
 * + 种子点簇，content 弱档另有一套。三样词汇同时在场、位置随 seed 跳，
 * 读起来像三种装饰挤在一页上；那些大簇还是水彩晕染时代留下的满角构图。
 * v2 只留两件，位置写死：左下等高线簇 + 右缘种子点列。叶脉与水彩晕染一并
 * 退役（设计板 terra 的结构行是 light 档，「light 档仅此两件」是板上原话）。
 *
 * ## v3 返工：等高线从左下搬到左上
 *
 * 用户对 terra p01 的原话是「左下角的装饰覆盖到了前景的文本，分不清主次」。
 * 属实，而且不止封面一页：v2 把等高线放在 y634-658，理由是「正文区下沿
 * y620 与页脚 meta 带上沿 y664 之间」——那两个数字是**设计意图**，而版式
 * 们真实的排字外沿另有其数。用 `text-margin-sweep` 把 terra 的全部 41 个
 * 版式 + 主题十页（跳过 chapter，本 motif 在 chapter 不画）逐条量文字墨迹盒
 * （453 条），y634-658 这条带压中 **16 条**：封面与 tone-adaptive 的署名行
 * 「陈砚清 · 首席技术官」、colophon 的日期串、十来个版式的脚注
 * 「中国工业设备运维市场规模测算」。y620-664 那段空隙根本不空——它是
 * 署名与脚注的地盘（`chrome-geometry.ts` 的 `FOOTNOTE_BASELINE_Y = 648`）。
 *
 * 同一次扫掠给出页面真正空着的四条边：**y<40 / x<56 / x>1224 / y>709.5**
 * （跳过 chapter 后的数字；全表口径是 y<34，本文件按更严的 34 立规矩，
 * 见 {@link DECOR_CEILING}）。两条竖带只有几十像素宽，装不下一组横向推进
 * 的地形线；底边只剩十来个像素。于是等高线整组搬到**左上**：几何一处未改，
 * 只沿一条水平轴镜像翻转（`y' = 663 - y`），原来向上隆起的山形因此
 * 变成自页面上缘垂下的谷形，地形读法不变。左端仍起于 **x48** ——页面自己
 * 的左边距（页脚 meta 带 48,664,1184×44 的左缘），这是它对齐的那条网格线。
 *
 * v3 画的两件东西：
 *   - **左上等高线簇**：三条不闭合的平缓等高线，x48→420，曲线落在 y5-29
 *     带内（控制点上的 41/33/31 不在曲线上），橄榄（primary）1.2px、
 *     整组 0.5 不透明。
 *   - **右缘种子点列**：x1252 上三枚 r2.5 的实心圆点，y64/96/128，
 *     橄榄（primary）。播种/根系的意象，收到页缘只占一条窄带——它落在
 *     x>1224 那条空带里，实测零碰撞，v3 一处未动。
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
 *   - 等高线的着墨落在 y4.4-29.6（三条曲线各自的极值逐条采样算过，见
 *     `motif-terra-motif.test.tsx` 的实测断言），在 {@link DECOR_CEILING}
 *     之上，四个内容区与 `brand-chrome.tsx` 的四只 logo 盒（y48 起）全部
 *     在它之下。
 *   - 种子点 x1249.5-1254.5，在实测排字右沿 x1224 与右上 logo 盒右沿
 *     x1216 之外。
 *
 * 已知且沿袭：`left-anchor` 封面在左侧画一块 512 宽的整幅 primary 色块
 * （`cover-left-anchor.tsx` 的 `COVER_BLOCK_W`），terra 声明了这个 cover
 * id，抽到它时等高线会落在同色块上而读不出来（v2 在左下、v3 在左上，那块
 * 色块通高，两处一样）。这不是本轮引入的——v1 的
 * `contourCluster(90, 700, …, primary, 0.16)` 落在同一片区域、同样是
 * primary，行为一致。修它要么让 motif 知道当页选中了哪个 layout（内容感知，
 * `inventory.md` 的确定性红线禁止），要么改 layout（本文件不动版式），
 * 两条都越界，故照实记录、不改。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线。
 * v1 的三档 seed 变体因此删除，`cachedDeckSeed`/`pickBySeed` 依赖退出本文件。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（primary = 橄榄）。本 motif
 * 是 terra 独占的单成员候选集（`motif-selection.ts` 的 `MOTIF_CANDIDATES`），
 * 没有别的主题借用它。
 */

/**
 * 线状装饰的着墨下限：等高线的每一笔（含描边半宽）都必须在此之上。
 *
 * 34 是全表口径的实测值——`text-margin-sweep` 量到的最高一行字顶在 y34
 * （poster-chapter / roman-chapter 的右上引首）。terra 自己跳过 chapter，
 * 只按它自己的页型算是 y40；这里取更严的那个数，免得哪天 chapter 分支
 * 回来时这条守卫悄悄失效。测试读这个常量，不复述字面量。
 */
export const DECOR_CEILING = 34

// ── 左上等高线簇（三条平缓推进的地形线） ────────────────────────────────
/**
 * 设计板那三条二次贝塞尔折线，镜像到页面上缘（`y' = 663 - y`，见文件头）。
 * 那个 663 是把整组 24px 高的曲线摆在 0-34 这条空带正中算出来的：上距页缘
 * 4.4px、下距 {@link DECOR_CEILING} 4.4px。控制点上的 41/33/31 不落在曲线
 * 上——曲线各自的实际极值约 29/25/25（`motif-terra-motif.test.tsx` 用采样
 * 把这三个数字锁死，改动任何一个控制点都会红）。
 */
const CONTOURS: readonly string[] = [
  "M48,5 Q160,41 300,23 Q380,13 420,17",
  "M48,13 Q150,33 270,19",
  "M48,21 Q120,31 200,19",
]
const CONTOUR_STROKE = 1.2
const CONTOUR_OPACITY = 0.5

// ── 右缘种子点列 ────────────────────────────────────────────────────────
const SEED_X = 1252
const SEED_R = 2.5
const SEED_YS: readonly number[] = [64, 96, 128]

export function TerraMotif({ slide, ctx }: DecorProps) {
  const olive = ctx.colors.primary

  // chapter 是整版 primary 橄榄底，本 motif 两件东西也都是 primary——
  // 画上去看不见（见文件头）。
  if (slide.type === "chapter") return null

  return (
    <>
      {/* 左上等高线簇 */}
      <g fill="none" stroke={olive} strokeWidth={CONTOUR_STROKE} opacity={CONTOUR_OPACITY}>
        {CONTOURS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {/* 右缘种子点列 */}
      <g fill={olive}>
        {SEED_YS.map((cy) => (
          <circle key={cy} cx={SEED_X} cy={cy} r={SEED_R} />
        ))}
      </g>
    </>
  )
}
