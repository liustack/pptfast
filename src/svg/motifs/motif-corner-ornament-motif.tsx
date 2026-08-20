import type { DecorProps } from "./types"
import { accessibleInk } from "../ink"

/**
 * corner-ornament-motif v2 —— 「报头双线」（2026-08-20 编辑组皮肤重设计，
 * 设计源 `.issues/2026-08-18-theme-redesign/skins/group5-editorial-boards
 * .dc.html` 的 `section#g5` journal 设计表，几何坐标逐条抄录，不派生）。
 *
 * **文件名与 motif id 未改，画的东西整个换了**——id 是注册表键
 * （`motifs/index.ts` 的 `MOTIFS`、`motif-selection.ts` 的
 * `MOTIF_CANDIDATES`、`definitions.ts` 的锚点），改名会牵动四家主题的候选
 * 集与一批测试；前四组换血时（rail/banner/poster/constellation/heritage…）
 * 一律留 id 换画，本轮照办。读这个 id 时请以本文件为准，不要按字面理解成
 * 「角花」。
 *
 * 换掉的东西：v1 是四角双线「L」形角花（三档 seed 变体：四角全饰 / 主对角
 * / 副对角，弱档单角）。角花本轮**整族退役并让给 heritage**：两家同属印刷
 * 品语域，角花与徽记是 heritage 的藏书票语汇（`motif-heritage-motif.tsx`），
 * journal 改走通栏报头，两家以线制分家——journal 全宽通栏，heritage 双线
 * 断口嵌章。v2 三件半，位置写死：
 *   - **顶缘文武双线**：x48→1232，粗线 y26（2px）+ 细线 y32（0.75px）。
 *     报头的规矩，中文书里叫「文武线」。
 *   - **底缘单线**：x96→1184、0.75px。板上写在 y640，实测后落到页缘 y712，
 *     见下。
 *   - **线上中点期号「№」**：赭红衬线，整个装饰件唯一的字符。
 * 「半件」是因为期号带月份时才印全（见下）。
 *
 * 期号的字样从 `ir.meta.date` 推，推不出就只印「№」
 *
 * 板上样例写的是「№ 07」，07 是那份样例自己的月份（2026 年 7 月）。写死
 * 一个刊号会在每一份 deck 上撒同一个谎，读 slide 内容又会踩确定性红线
 * （装饰不读内容）。所以沿用 `motif-poster-motif.tsx` 的 `quarterLabel` /
 * `motif-ink-motif.tsx` 的 `colophonDateGlyphs` 同一条纪律：只认「四位年 +
 * 非数字分隔 + 一到两位月」这一种能确定读懂的形状，读得懂就补两位月份，
 * 读不懂就只留「№」这一个符号——一个不声称任何事实的排印记号。
 *
 * chapter 完全退让（`return null`）：两条独立实测各自成立。
 *   1. **底缘那条线在 chapter 页上压字**。chapter 页型的排字外沿比其余三档
 *      低得多——`rail-chapter`/`banner-chapter` 的右下大章号墨迹一直到
 *      y715、x1224，实测底线在 y712 与 10 条这样的文字相交（其余三档同一
 *      位置 0 碰撞）。
 *   2. **借用方那边两条线直接消失**。本 motif 的线走 `ctx.colors.primary`：
 *      luxe 的 chapter 底是 `#0B0908`、primary 是 `#171310`，实测
 *      **1.08:1**；academic 的 chapter 底就是它自己的 primary，**1.00:1**。
 *      journal 自己（11.75:1）与 heritage（9.54:1）画得出，但同一 motif 在
 *      四家上必须是同一件东西，不按主题分叉。
 * 与 pulse/enterprise/rail/classroom/banner 本轮统一的 chapter 处理一致。
 *
 * 安全区：板上四条红虚线是「意图」，实测排字外沿是「事实」
 *
 * 工具 `.issues/2026-08-18-theme-redesign/skins/tools/text-margin-sweep.mts`
 * （柔和组建，本轮复用并自校验）。把 `LAYOUT_REGISTRY` 全部版式 + 主题十页
 * deck 在 journal / academic / luxe / heritage 四家上各渲一遍，非 chapter 页
 * 共 1833 条文字，真实空边是 **y<40 / y>709.5 / x<56 / x>1224**。逐条对账：
 *   1. 顶缘文武双线（墨迹 y25-27 与 y31.6-32.4）——实测 0 碰撞，一处未改。
 *      两条都在 y40 之上，从 x48 起，避开两个顶部 logo 盒（y48 起）。
 *   2. **底缘单线 y640 → y712**。板上那条线横穿共享脚注行
 *      （`FOOTNOTE_BASELINE_Y = 648`），实测 **86 条**文字与它相交。x96-1184
 *      一处未改，整条搬到 y712（墨迹 y711.6-712.4），非 chapter 页实测 0
 *      碰撞。
 *   3. **期号 y646 → 基线 y706**。板上那个位置实测 **44 条**碰撞。搬到
 *      y706 后墨迹盒 y690-710、x 居中约 617-663，实测 0 碰撞，并且刚好落在
 *      新底线的正上方——「线上中点期号」的读法比板上（字压在线上）更准。
 * 位置全部写死，不随 seed 变；v1 的三档 seed 变体因此删除，
 * `cachedDeckSeed`/`pickBySeed` 依赖退出本文件。
 *
 * 期号是装饰件里唯一的**文字**，所以它归 `deck-audit` 的对比度墙管（那道
 * 墙不看 `data-decor`，只看是不是 `<text>`）。四家的 accent 压各自的底色
 * 不一样，直接烤 `ctx.colors.accent` 会在借用方那边制造新的对比度违例，
 * 所以走 `accessibleInk(accent, bg, 16)`——对本来就过线的配对逐字节 no-op
 * （journal 自己 5.58:1，原样输出），过不了线的才最小步进抬一档。
 *
 * **画笔属性一律写在叶子上，不挂 `<g>`**（同 `motif-banner-motif.tsx`）。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（primary 铅字黑 / accent
 * 赭红），不读 `chartPalette`。
 */

// ── 顶缘文武双线 ────────────────────────────────────────────────────────
const RULE_X1 = 48
const RULE_X2 = 1232
const THICK_RULE_Y = 26
const THICK_RULE_STROKE = 2
const THIN_RULE_Y = 32
const THIN_RULE_STROKE = 0.75

// ── 底缘单线 ────────────────────────────────────────────────────────────
const FOOT_RULE_X1 = 96
const FOOT_RULE_X2 = 1184
/** 板上写的是 y640，那横穿共享脚注行（`FOOTNOTE_BASELINE_Y = 648`），实测
 * 86 条文字相交。搬到页缘，推导见文件头。 */
const FOOT_RULE_Y = 712
const FOOT_RULE_STROKE = 0.75

// ── 线上中点期号 ────────────────────────────────────────────────────────
const ISSUE_X = 640
/** 板上写的是 y646（实测 44 条碰撞）。搬到新底线正上方。 */
const ISSUE_BASELINE_Y = 706
const ISSUE_FONT_SIZE = 16

/**
 * `ir.meta.date` → 「№ 07」；推不出月份就只留「№」。纪律与推导见文件头。
 */
function issueLabel(date: string | undefined): string {
  const m = /^(\d{4})\D+(\d{1,2})(?:\D|$)/.exec(date ?? "")
  if (!m) return "№"
  const month = Number(m[2])
  if (month < 1 || month > 12) return "№"
  return `№ ${String(month).padStart(2, "0")}`
}

export function CornerOrnamentMotif({ ir, slide, ctx }: DecorProps) {
  // chapter 退让的两条实测依据见文件头。
  if (slide.type === "chapter") return null

  const rule = ctx.colors.primary
  const bg = ctx.defaultBg ?? ctx.colors.bg

  return (
    <>
      {/* 顶缘文武双线 */}
      <line
        x1={RULE_X1}
        y1={THICK_RULE_Y}
        x2={RULE_X2}
        y2={THICK_RULE_Y}
        stroke={rule}
        strokeWidth={THICK_RULE_STROKE}
      />
      <line
        x1={RULE_X1}
        y1={THIN_RULE_Y}
        x2={RULE_X2}
        y2={THIN_RULE_Y}
        stroke={rule}
        strokeWidth={THIN_RULE_STROKE}
      />
      {/* 底缘单线 */}
      <line
        x1={FOOT_RULE_X1}
        y1={FOOT_RULE_Y}
        x2={FOOT_RULE_X2}
        y2={FOOT_RULE_Y}
        stroke={rule}
        strokeWidth={FOOT_RULE_STROKE}
      />
      {/* 线上中点期号——装饰件唯一的字符 */}
      <text
        x={ISSUE_X}
        y={ISSUE_BASELINE_Y}
        fontFamily={ctx.fonts.heading}
        fontSize={ISSUE_FONT_SIZE}
        fill={accessibleInk(ctx.colors.accent, bg, ISSUE_FONT_SIZE)}
        textAnchor="middle"
        dominantBaseline="alphabetic"
      >
        {issueLabel(ir.meta.date)}
      </text>
    </>
  )
}
