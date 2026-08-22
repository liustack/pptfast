import type { DecorProps } from "./types"
import { DecorPiece } from "./decor-piece"
import { leafRecessOpacity } from "./decor-budget"

/**
 * classroom-motif v2 —— 「拍纸簿」（2026-08-20 柔和组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group4-soft-boards.dc.html` 的
 * `section#g4` classroom 设计表，几何坐标逐条抄录，不派生）。
 *
 * 换掉的东西：v1 是三档 seed 变体（a 四角斑块群 / b 对角大斑 / c 顶部斑块
 * 带），每档在页面四角摆 6-8 团「平滑有机 blob」，再撒点阵、速写短线、手绘
 * 波浪线、空心圈——一页最多 15 件装饰，四个角全占满。那是「莫兰迪贴纸」，
 * 不是课堂。v2 只留三件，位置写死，全是一本拍纸簿上真有的东西：
 *   - **顶缘装订孔排**：12 枚空心圆，`cx = 118 + i*96`、`cy24`、`r6`，
 *     铅笔灰线描。活页夹打的孔，页面因此像是从本子上撕下来的一张。
 *   - **底缘铅笔虚线**：x96→420 的一段虚线（`10 8` 虚实），横线簿最后一行
 *     没写完的那道。板上写在 y640，实测后落到页缘 y712，见下。**只在没有
 *     页脚的页上画**（2026-08-20 第四轮评审，见下）。
 *   - ~~右上回形针弧~~：2026-08-20 第四轮评审删除，见下。
 * 斑块/点阵/波浪线/短线组整族退役——设计板 classroom 那格的原话是「恒位；
 * 现状斑块水彩退役」，同一句也判了 bloom 的水彩（`motif-bloom-motif.tsx`
 * 本轮整个删除，bloom 的 motif 锚点改指本文件）。
 *
 * ## 第四轮评审的两处返工（2026-08-20，bloom p01 / p03）
 *
 * 1. **回形针删除**。用户原话：「顶部那个绿色别针一样的是什么东西，跟空心
 *    圆挤在一起干什么，非常难看。」两件东西确实是贴着的：最后一枚装订孔
 *    的墨迹右缘在 x1180.6，回形针的左缘在 x1180.25——它们在同一条顶带上
 *    重叠着排，读起来不是「别在打孔边上的一枚针」，而是两个零件挤在一角。
 *    位置写死不能内容感知，挪去别处又只是把同一个问题换个角落，所以整件
 *    删掉：留下的十二枚孔本来就是一条完整的节奏，少一枚针不缺什么。
 *    accent（陶土红/bloom 的绿）因此退出本 motif，全件只剩铅笔灰一色。
 * 2. **铅笔虚线只在无页脚的页上画**。用户原话：「底部那个虚线是干什么用
 *    的，放这里太拥挤了，空的页面放放还差不多，这个有 footer 的页面还放，
 *    太拥挤不好看了。」页脚 meta 行的基线在 y700（`branding.tsx`），
 *    虚线在 y712，两者只隔七八个 px——有页脚的页上它就是贴着字排的第二条
 *    横线。本轮按 `slide.type` 分档：只有 cover / ending 画（chapter 本来
 *    就整档退让）。`branding.tsx` 的 `showFooter` 是
 *    `slide.type === "content"` 再减去几种整页抑制页脚的通栏图版式，所以
 *    「非 content」是「无页脚」的一个保守子集——被减掉的那几种恰好是底部
 *    铺满图的页，虚线画上去只会更糟。这是页型分档，不是内容感知：同一
 *    页型永远同一张，`slide.type` 与 seed 无关（同 `motif-rail-motif.tsx`
 *    按 cover 二选一锚点的先例）。
 *
 * chapter 完全退让（`return null`，v1 起就是如此，理由本轮补上实测）：
 * classroom 的 chapter 默认底色是整版 primary 雾蓝（`themes/classroom.ts`
 * 的 `defaultBackgrounds.chapter`），本 motif 三件东西走 muted（铅笔灰）与
 * accent（陶土红）——压 primary 实测 1.08:1 与 1.41:1，画上去不是「克制」
 * 而是「看不见」。bloom 作为色板 preset 同理：1.04:1 与 1.55:1。
 *
 * 安全区：板上四条红虚线是「意图」，实测排字外沿是「事实」
 *
 * 板上的四条红虚线禁区是标题区 (96,48,1040×122)、正文区 (96,200,1040×420)、
 * 页脚 meta 带 (48,664,1184×44)、右下 logo 盒 (1120,630,96×40)。但把
 * `LAYOUT_REGISTRY` 全部 41 个版式 + 主题 deck 十页在 classroom 上渲一遍逐条
 * 量文字墨迹盒（工具：`.issues/2026-08-18-theme-redesign/skins/tools/
 * text-margin-sweep.mts`，486 条文字、51 页），版式们真实的排字外沿比那四条
 * 线宽得多——页面真正空着的四条边是 **y<34 / y>708.6 / x<56 / x>1224**：
 *   - 最高的一行字顶在 y34（poster-chapter/roman-chapter 的右上引首）
 *   - 最低的一行字底在 y708.6（image-bottom 的遮罩页脚）
 *   - 最左 x56、最右 x1224（fashion 家族的 meta 行与 `branding.tsx`
 *     自己的页脚两行）
 * 于是板上三件东西里有两件要挪，逐条记（第 2 条随回形针一并作废，留档）：
 *   1. **铅笔虚线 y640 → y712**。板上那条线正落在页脚注的行高里：`branding-
 *      geometry.ts` 的 `FOOTNOTE_BASELINE_Y = 648`，实测 13 个版式的脚注墨迹
 *      盒（y628-664 一带）与它相交，等于拿铅笔把脚注划掉。x96-420 一处未改，
 *      整条搬到 y712（墨迹 y711.25-712.75），在最低一行字之下、页缘之上——
 *      「横线簿最后一行」的读法反而更准。同一条先例冷调组踩过：设计板把
 *      academic 的点轨画在 y648，实测后整条搬去顶带。
 *   2. ~~回形针上移 12px~~（板上 y18-44 → y6-32）。件已删除，见上。上移
 *      的原因留档：板上位置与 poster-chapter/roman-chapter 的右上引首
 *      （x1092-1224、y34-60）重叠 44px 宽的一块。
 *   3. 装订孔排一处未改：墨迹 y17.4-30.6（含 0.6 半线宽）、x111.4-1180.6，
 *      实测零碰撞。
 * 两件东西对板上四条红虚线与 `branding.tsx` **四个** logo 位
 * （tl/tr/bl/br，各 96×40）也全部清空，`motif-classroom-motif.test.tsx`
 * 逐件量。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线。
 * v1 的三档 seed 变体因此删除，`cachedDeckSeed`/`pickBySeed` 依赖退出本文件。
 *
 * **画笔属性一律写在叶子上，不挂 `<g>`**：导出侧 `svg2pptx/dispatch.ts` 的
 * `walk` 只把 `transform` 往下合，`leafToOp` 只读叶子自己的 `fill`/`stroke`/
 * `opacity`——挂在 `<g>` 上的画笔属性预览看得见、导出全丢。本轮实测过
 * （`.issues/2026-08-18-theme-redesign/skins/tools/probe-group-inherit.mts`），
 * 所以这里 12 枚孔各自带 `fill`/`stroke`/`stroke-width`，宁可啰嗦。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（muted 铅笔灰；回形针删除后
 * accent 不再出现在本 motif 里）。**本轮起不再读 `chartPalette`**——v1 按固定下标解构那四格，图表
 * 调色板一轮转就会悄悄改掉装饰色（`motif-chart-palette-isolation.test.tsx`
 * 的文件头记着那次 Major，campaign/classroom/bloom 三家同时中招）。
 * 本 motif 现在是 classroom 与 bloom 共用的唯一候选（`motif-selection.ts`
 * 的 `MOTIF_CANDIDATES`），两家渲的是同一张几何、各自的色板。
 */

// ── 顶缘装订孔排 ────────────────────────────────────────────────────────
const HOLE_COUNT = 12
const HOLE_X0 = 118
const HOLE_STEP = 96
const HOLE_Y = 24
const HOLE_R = 6
const HOLE_STROKE = 1.2

// ── 底缘铅笔虚线 ────────────────────────────────────────────────────────
const PENCIL_X1 = 96
const PENCIL_X2 = 420
/** 板上写的是 y640，那正压在共享脚注行上（`FOOTNOTE_BASELINE_Y = 648`）。
 * 实测后整条搬到页缘，推导见文件头。 */
const PENCIL_Y = 712
const PENCIL_STROKE = 1.5
/** 虚实节奏照板（`10 8`）。走 `<line>` 而不是同轴 `<path>`：svg2pptx 把
 * `<path>` 转成 custGeom，包围盒零高度会被 package-audit 的
 * `invalid-shape-transform` 硬门拒收；真正的 `<line>` 走 `svg2pptx/line.ts`
 * 的 `prstGeom="line"`，并且把 `stroke-dasharray` 映射成原生 `dashType`。 */
const PENCIL_DASH = "10 8"

export function ClassroomMotif({ slide, ctx }: DecorProps) {
  // chapter 是整版 primary 雾蓝底，本 motif 的孔与虚线压上去 1.08-1.41:1
  // ——看不见（见文件头）。
  if (slide.type === "chapter") return null

  const pencil = ctx.colors.muted
  const bg = ctx.defaultBg ?? ctx.colors.bg
  // 有页脚的页（content）不画底缘虚线：它会贴着页脚 meta 行排成第二条
  // 横线（第四轮评审 bloom p03，推导见文件头）。
  const drawPencil = slide.type !== "content"

  return (
    <>
      <DecorPiece id="holes">
        {Array.from({ length: HOLE_COUNT }, (_, i) => (
          <circle
            key={i}
            cx={HOLE_X0 + i * HOLE_STEP}
            cy={HOLE_Y}
            r={HOLE_R}
            fill="none"
            stroke={pencil}
            strokeWidth={HOLE_STROKE}
            opacity={leafRecessOpacity(slide.type, pencil, bg)}
          />
        ))}
      </DecorPiece>
      {drawPencil && (
        <DecorPiece id="pencil">
          <line
            x1={PENCIL_X1}
            y1={PENCIL_Y}
            x2={PENCIL_X2}
            y2={PENCIL_Y}
            stroke={pencil}
            strokeWidth={PENCIL_STROKE}
            strokeDasharray={PENCIL_DASH}
            opacity={leafRecessOpacity(slide.type, pencil, bg)}
          />
        </DecorPiece>
      )}
    </>
  )
}
