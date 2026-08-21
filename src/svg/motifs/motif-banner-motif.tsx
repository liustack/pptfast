import type { DecorProps } from "./types"

/**
 * banner-motif v2 —— 「批注线」（2026-08-20 编辑组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group5-editorial-boards.dc.html`
 * 的 `section#g5` consulting 设计表，几何坐标逐条抄录，不派生）。
 *
 * 换掉的东西：v1 是三档 seed 变体（a 五竖线网格、b 稀疏三线、c 右移半格）
 * 加两条通栏横线的「网格底纹」，一页最多七条线横贯整版，读起来是方格纸
 * 不是咨询报告。v2 只留三件，位置写死。第四轮评审（2026-08-20）又砍掉
 * 两件、改写一件，现在只剩顶缘一条通栏规矩线：
 *   - **顶缘藏青细线**：x116→1232、y32、1.5px。报告页眉那条规矩线。
 *   - **同线起手的黄色一段**：x48→116，同一条 y32、同一个线宽，把规矩线
 *     的头一小段染成 accent。它与细线首尾相接（butt cap，无缝无叠），
 *     读起来是一条线的起手，不是压在线上的第二件东西。
 *   - ~~左上黄色高亮块~~ 与 ~~底缘页码线~~：第四轮评审删除，见下。
 *
 * ## 第四轮评审砍掉的两件（2026-08-20，academic p01/p09）
 *
 * 本 motif 的锚点主题是 consulting，enterprise 借用（academic 已在
 * board-cover-restore wave 2 钉成 `rail-motif` 单成员）。用户在
 * academic 上逐条点名（academic 的 primary 是祖母绿，所以原话说的是绿线）：
 *   - p01：「底部那个无意义的装饰绿色横线是什么，很奇怪，不仅没起到装饰
 *     作用，反而让人奇怪。顶部那个绿色横线也是。」
 *   - p09：「底部绿色装饰横线，如果你要高亮文字，就画在要高亮的具体文字
 *     底部，画在这里不伦不类。」
 * 两件东西因此退役：
 *   1. **底缘页码线（x96→160）删除**。一条 64px 的短横线吊在页面左下角，
 *      下面没有页码、上面没有文字——它长得像一条划线，却什么都没划到。
 *      「不落在关键词上的短划线一律不要」是本轮定下的审美禁忌之一，这条
 *      是它的典型。整件删除，不改长度也不换位置：换个地方它还是同一条
 *      划不到东西的划线。
 *   2. **左上黄色高亮块（x48-116、y26-38）改写成同线的一段**。原件是
 *      12px 高的实心块压在规矩线上，语义是「荧光笔扫过 kicker」——可是
 *      装饰位置写死、不读内容，它永远扫不到任何一个真的关键词，扫到的
 *      只是那一块空白。装饰做不到关键词感知，就不装高亮：色块压平成
 *      规矩线自己的头一段，只当一个排印记号，不再声称在强调什么。
 * 顶缘那条规矩线留着：它从 x48 通栏到 x1232，是页眉的横线，不是吊在半空
 * 的短划——journal 的报头文武双线、heritage 的双线加菱形同在顶带通栏，
 * 这一轮都没被点名。留它也是为了 consulting（本 motif 的锚点主题，本轮
 * 零条返工）不会只剩一张白纸。
 *
 * chapter 完全退让（`return null`）：consulting 的 chapter 默认底色就是
 * 整版 `primary` 藏青（`themes/consulting.ts` 的 `defaultBackgrounds
 * .chapter`），两条线走的也是 `primary`，同色压同色实测 **1.00:1**；借用
 * 本 motif 的 academic 同构（chapter 底色 = 自己的 primary，同样 1.00:1）。
 * 三件里两件在两家上直接消失，剩一枚孤零零的黄块不成语汇，所以整档退让
 * ——与 pulse/enterprise/rail/classroom 本轮统一的 chapter 处理一致。
 * enterprise 借用时 chapter 底色是浅灰（primary 压它 9.96:1，本来画得出），
 * 一并退让是为了「同一 motif 在四家上是同一件东西」，不按主题分叉。
 * v1 chapter 分支里那条 `readableOn(defaultBg)` 反白网格随之退役，
 * `../ink.ts` 依赖退出本文件。
 *
 * 安全区：板上四条红虚线是「意图」，实测排字外沿是「事实」
 *
 * 工具 `.issues/2026-08-18-theme-redesign/skins/tools/text-margin-sweep.mts`
 * （柔和组建，本轮复用并自校验：classroom 那次的 486 条文字 / 顶沿 y34 /
 * 左沿 x56 / 右沿 x1224 逐个复现）。把 `LAYOUT_REGISTRY` 全部版式 + 主题
 * 十页 deck 在 consulting / academic / enterprise 三家上各渲一遍，非 chapter
 * 页共 1376 条文字，真实空边是 **y<40 / y>709.5 / x<56 / x>1224**。逐条
 * 对账（第 2 条随页码线一并作废，留档）：
 *   1. 顶缘细线与黄色起手段（墨迹同为 y31.25-32.75）——实测 0 处碰撞。
 *      两段都在 y40 之上，整条从 x48 起，避开 `brand-chrome.tsx` 四个
 *      96×40 logo 盒里的两个顶盒（y48 起）。改写前的黄色高亮块是
 *      y26-38，同样 0 碰撞；压平成线之后墨迹只会更小。
 *   2. ~~页码线 y648 → y712~~。件已删除，见上。搬位的原因留档：板上那条
 *      线正落在共享脚注行上（`chrome-geometry.ts` 的
 *      `FOOTNOTE_BASELINE_Y = 648`），实测 36 条文字与它相交（三家的 deck
 *      封面 meta 行、12 个版式的脚注行）；它同时整条落在左下 logo 盒
 *      （x64-160、y630-670）里。同一条先例冷调组与柔和组各踩过一次
 *      （academic 的点轨、classroom 的铅笔虚线，都是板上写 y640/y648
 *      实测后搬走）。
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线。
 * v1 的三档 seed 变体因此删除，`cachedDeckSeed`/`pickBySeed` 依赖退出本文件。
 *
 * **画笔属性一律写在叶子上，不挂 `<g>`**：导出侧 `svg2pptx/dispatch.ts` 的
 * `walk` 现在会把画笔沿组下传（`ba28f83`），但本仓库既有惯例仍是「写叶子
 * + 守卫」，本文件照办——两段线各自带全 `stroke`/`stroke-width`。
 * 顺带记一笔：v1 网格线那批 480 个导出字段的复色，是那次转换层修复的实测
 * 证据，不因这批网格线本轮退役而失效。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（primary 藏青 / accent 一线
 * 黄），也不读 `chartPalette`——图表调色板一轮转不得改动装饰色
 * （`motif-chart-palette-isolation.test.tsx` 记着那次 Major）。
 */

// ── 顶缘规矩线 ──────────────────────────────────────────────────────────
const TOP_RULE_X1 = 48
const TOP_RULE_X2 = 1232
const TOP_RULE_Y = 32
const TOP_RULE_STROKE = 1.5
/**
 * 起手那一段的收尾横坐标：x48→116 走 accent，其后到 x1232 走 primary。
 * 68px 是原来那枚黄色高亮块的宽度——件从「压在线上的块」压平成「线自己
 * 的头一段」，长度照搬，推导见文件头。
 */
const LEAD_RULE_X2 = 116

export function BannerMotif({ slide, ctx }: DecorProps) {
  // chapter 是整版 primary 底（consulting/academic 同构），线同色压同色
  // 1.00:1——见文件头。
  if (slide.type === "chapter") return null

  const rule = ctx.colors.primary
  const highlighter = ctx.colors.accent

  return (
    <>
      {/* 顶缘规矩线：起手一段 accent，其后通栏到页缘右侧 */}
      <line
        x1={LEAD_RULE_X2}
        y1={TOP_RULE_Y}
        x2={TOP_RULE_X2}
        y2={TOP_RULE_Y}
        stroke={rule}
        strokeWidth={TOP_RULE_STROKE}
      />
      <line
        x1={TOP_RULE_X1}
        y1={TOP_RULE_Y}
        x2={LEAD_RULE_X2}
        y2={TOP_RULE_Y}
        stroke={highlighter}
        strokeWidth={TOP_RULE_STROKE}
      />
    </>
  )
}
