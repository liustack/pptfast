import type { DecorProps } from "./types"

/**
 * banner-motif v2 —— 「批注线」（2026-08-20 编辑组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group5-editorial-boards.dc.html`
 * 的 `section#g5` consulting 设计表，几何坐标逐条抄录，不派生）。
 *
 * 换掉的东西：v1 是三档 seed 变体（a 五竖线网格、b 稀疏三线、c 右移半格）
 * 加两条通栏横线的「网格底纹」，一页最多七条线横贯整版，读起来是方格纸
 * 不是咨询报告。v2 只留三件，位置写死，全是一份被人读过、划过的报告上
 * 真有的东西：
 *   - **顶缘藏青细线**：x48→1232、y32、1.5px。报告页眉那条规矩线。
 *   - **左上黄色高亮块**：x48-116、y26-38，像荧光笔从 kicker 上扫过去
 *     一道。全页唯一一件 accent，「只出现一次的高亮尺」。
 *   - **底缘页码线**：x96→160、2px。板上写在 y648，实测后落到页缘 y712，
 *     见下。
 * 线序照板：先画顶线、黄块压在它上面——荧光笔盖住规矩线，不是并排。
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
 * 页共 1376 条文字，真实空边是 **y<40 / y>709.5 / x<56 / x>1224**。三件
 * 东西逐条对账：
 *   1. 顶缘细线（墨迹 y31.25-32.75）、黄色高亮块（y26-38）——实测各 0 处
 *      碰撞，一处未改。两件都在 y40 之上，且都从 x48 起，避开
 *      `brand-chrome.tsx` 四个 96×40 logo 盒里的两个顶盒（y48 起）。
 *   2. **页码线 y648 → y712**。板上那条线正落在共享脚注行上
 *      （`chrome-geometry.ts` 的 `FOOTNOTE_BASELINE_Y = 648`），实测 36 条
 *      文字与它相交（三家的 deck 封面 meta 行、12 个版式的脚注行）；它同时
 *      整条落在左下 logo 盒（x64-160、y630-670）里。x96-160 一处未改，整条
 *      搬到 y712（墨迹 y711-713），实测 0 碰撞——在最低一行字之下、页缘
 *      之上。同一条先例冷调组与柔和组各踩过一次（academic 的点轨、
 *      classroom 的铅笔虚线，都是板上写 y640/y648 实测后搬走）。
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线。
 * v1 的三档 seed 变体因此删除，`cachedDeckSeed`/`pickBySeed` 依赖退出本文件。
 *
 * **画笔属性一律写在叶子上，不挂 `<g>`**：导出侧 `svg2pptx/dispatch.ts` 的
 * `walk` 现在会把画笔沿组下传（`ba28f83`），但本仓库既有惯例仍是「写叶子
 * + 守卫」，本文件照办——三件东西各自带全 `stroke`/`stroke-width`/`fill`。
 * 顺带记一笔：v1 网格线那批 480 个导出字段的复色，是那次转换层修复的实测
 * 证据，不因这批网格线本轮退役而失效。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（primary 藏青 / accent 一线
 * 黄），也不读 `chartPalette`——图表调色板一轮转不得改动装饰色
 * （`motif-chart-palette-isolation.test.tsx` 记着那次 Major）。
 */

// ── 顶缘细线 ────────────────────────────────────────────────────────────
const TOP_RULE_X1 = 48
const TOP_RULE_X2 = 1232
const TOP_RULE_Y = 32
const TOP_RULE_STROKE = 1.5

// ── 左上黄色高亮块 ──────────────────────────────────────────────────────
const HIGHLIGHT_X = 48
const HIGHLIGHT_Y = 26
const HIGHLIGHT_W = 68
const HIGHLIGHT_H = 12

// ── 底缘页码线 ──────────────────────────────────────────────────────────
const PAGE_RULE_X1 = 96
const PAGE_RULE_X2 = 160
/** 板上写的是 y648，那正是共享脚注基线（`chrome-geometry.ts` 的
 * `FOOTNOTE_BASELINE_Y`），且整条落在左下 logo 盒里。实测后搬到页缘，
 * 推导见文件头。 */
const PAGE_RULE_Y = 712
const PAGE_RULE_STROKE = 2

export function BannerMotif({ slide, ctx }: DecorProps) {
  // chapter 是整版 primary 底（consulting/academic 同构），两条线同色压同色
  // 1.00:1——见文件头。
  if (slide.type === "chapter") return null

  const rule = ctx.colors.primary
  const highlighter = ctx.colors.accent

  return (
    <>
      {/* 顶缘细线 */}
      <line
        x1={TOP_RULE_X1}
        y1={TOP_RULE_Y}
        x2={TOP_RULE_X2}
        y2={TOP_RULE_Y}
        stroke={rule}
        strokeWidth={TOP_RULE_STROKE}
      />
      {/* 左上黄色高亮块（压在顶线上，像荧光笔扫过 kicker） */}
      <rect
        x={HIGHLIGHT_X}
        y={HIGHLIGHT_Y}
        width={HIGHLIGHT_W}
        height={HIGHLIGHT_H}
        fill={highlighter}
      />
      {/* 底缘页码线 */}
      <line
        x1={PAGE_RULE_X1}
        y1={PAGE_RULE_Y}
        x2={PAGE_RULE_X2}
        y2={PAGE_RULE_Y}
        stroke={rule}
        strokeWidth={PAGE_RULE_STROKE}
      />
    </>
  )
}
