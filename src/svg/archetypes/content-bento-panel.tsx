// GF/svg/archetypes/content-bento-panel.tsx
import type React from "react"
import type { SvgTemplateProps } from "./types"
import type { ContentRect } from "../layout"
import type { StyleColors } from "../../themes/tokens"
import type { ComponentCtx } from "../components/types"
import { SvgContent } from "../SvgContent"
import {
  layoutBento,
  explodeIntoUnits,
  sortUnitsByHeroWeight,
  type BentoCell,
  type KpiItem,
  type IconCardItem,
} from "../bento-layout"
import { PASSTHROUGH_SHELL_TYPES, SCALABLE_TYPES, SELF_VISUAL_TYPES } from "../component-traits"
import { measureComponent, renderComponent } from "../components"
import { sectionNameFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import {
  fitSvgLine,
  measureTextUnits,
  truncateToUnits,
} from "../../lib/svg-text-layout"
import { Icon } from "../icons"
import { dedupeKpiUnit, deltaProps, splitKpiValueWidths } from "../components/kpi"
import { iconCardContentHeight, renderIconCardBody } from "../components/icon-cards"
import { fitEmphasisLine, renderEmphasisTspans } from "../emphasis"
import { accessibleInk } from "../ink"

/**
 * bento-panel content archetype（spec §3.2，Wave 3 Task 22，本 wave 体量最大
 * 的一个）：tech 主题 content 页型的"换骨"语法——不是「kicker + 标题 + 分隔线 +
 * 满宽内容」，而是把 component 序列炸成一组不等宽的 bento 卡片网格（最多 6 格），
 * `kpi_cards`/`icon_cards` 先炸成逐 item 独立卡片，再按"英雄权重"重排进最大
 * 的网格位。自 templates/tech.tsx 的 `BentoTechContent`（959-1163 行，Step A
 * 用 `grep -n` 实测边界——与 brief 给出的 959-1173 略有出入：959-1163 是函数
 * 体本身，1165-1180 行是 Ending 页型的私有 helper `splitTrailingPeriod` 的头
 * 注释与实现，不属于 Content 函数，未随迁）提炼。
 *
 * **6 个私有 helper 整体随迁**（Step A 用 `grep -n` 实测边界，与 brief 给出的
 * 行号一致）：
 *   - `kpiContentHeight`（227-234 行）
 *   - `renderKpiCardBody`（252-417 行）
 *   - `renderKpiCard`（421-444 行）
 *   - `renderIconCard`（479-515 行）
 *   - `cellOverBudget`（525-551 行）
 *   - `renderCell`（560-672 行）
 * 连同这些 helper 与主函数共同消费的模块级私有常量（48-211 行，`BENTO_CYAN`
 * 除外——该常量只被 `BentoTechCover` 的 2x2 角标消费，Step A 复核 227-702 行
 * ∪ 959-1163 行区间内 grep 未命中 `BENTO_CYAN`，故不随迁，避免引入未使用的
 * 死代码）一并复制为本文件私有：`BENTO_CARD_RADIUS`/`BENTO_CARD_PAD`/
 * `BENTO_CARD_STROKE_OPACITY`/`BENTO_CARD_STROKE_WIDTH`/`BENTO_CARD_TOP_PAD`/
 * `BENTO_CARD_BOTTOM_PAD`/`SCALABLE_TYPES`/`PASSTHROUGH_SHELL_TYPES` 与全部
 * `BENTO_KPI_*`/`SINGLE_KPI_CARD_*`/`SINGLE_ICON_CARD_*`/
 * `BENTO_ICON_CARD_*` 尺寸常量。`SELF_VISUAL_TYPES` 本身已是 `../bento-layout`
 * 导出的公共模块（非 templates 私有），照常 import，不复制。（W2 任务 5 起，
 * `SCALABLE_TYPES`/`PASSTHROUGH_SHELL_TYPES` 同样迁出本文件、与
 * `SELF_VISUAL_TYPES` 一并并入 `../component-traits` 单一注册表，不再是本文件
 * 私有——三者现从该文件 import，成员逐一等值锁定，见
 * `component-traits.test.ts`。）
 *
 * 依赖公共模块核实（Step A 关键项）：Step A 对 227-702 行 ∪ 959-1163 行区间
 * 逐一核对每个引用标识符的定义来源——`layoutBento`/`explodeIntoUnits`/
 * `sortUnitsByHeroWeight`/`SELF_VISUAL_TYPES`/`BentoCell`/`KpiItem`/
 * `IconCardItem` 均定义于 `../bento-layout`（已导出的公共模块）；
 * `measureComponent`/`renderComponent` 定义于 `../components`；`sectionNameFor` 定义于
 * `../../lib/derive`（`chapterNumberFor` 未被本区间引用，未
 * import——那是 `BentoTechChapter` 专属）；`fitHeadingLines` 定义于
 * `../heading-fit`；`fitSvgLine`/`measureTextUnits`/`truncateToUnits` 定义于
 * `../../lib/svg-text-layout`；`Icon` 定义于 `../icons`；
 * `deltaProps`/`splitKpiValueWidths` 定义于 `../components/kpi`；
 * `iconCardContentHeight`/`renderIconCardBody` 定义于 `../components/icon-cards`；
 * `fitEmphasisLine`/`renderEmphasisTspans` 定义于 `../emphasis`——全部是已
 * 公开导出的模块，没有任何一个又回头依赖 `templates/tech.tsx` 文件私有的
 * 其它符号（`CONF_LABEL`/`chapterNumberFor` 等 Cover/Chapter 专属依赖均未
 * 被此区间引用）。本文件不 import `../templates/tech`。
 *
 * 替换表（Step B）：Step A 对 227-702 行 ∪ 959-1163 行区间执行 Global
 * Constraints 第 4 条给出的 hex/主题 id 字符串扫描（零命中，具体正则不抄进
 * 本注释——避免污染本文件自己的 grep 清零门，同 content-stacked-poster.tsx
 * 先例）——函数体与全部随迁 helper 已直接消费
 * `ctx.colors`/`colors`/`ctx.fonts`/`fonts`（`colors.surface`/
 * `colors.accent`/`colors.text`/`colors.muted`/`colors.primary`），无任何
 * 烤死颜色常量，无孤儿色。**档位一・逐字节等价**（tech 是零烤色主题，与 brief
 * 表格标注一致）。
 *
 * 对比度自适应修复（W4 fix round，Important I1「content archetype 的
 * subheading 出现同类回声」台账）：subheading 原样消费 `colors.accent`，同
 * content-narrow-column.tsx 先例——对 consulting/bloom/classroom/heritage/
 * academic 五个主题不达标（该 archetype 在这些主题 pre-W4 策展集里都不
 * 存在，全集放开新暴露）。改用 `accessibleInk(colors.accent, ctx.defaultBg,
 * fontSize)`，通过校验的主题（包括本文件原生 tech）原样返回、逐字节不变。
 *
 * 对比度自适应修复补漏（W8 fix round，0.3.0 发布前终态走查发现）：
 * `renderKpiCardBody` 的 KPI 数值文字同样原样消费 `colors.accent`，W4 那轮
 * 修复没有覆盖到——subheading 与 KPI 数值是同一文件里的两处独立回声，不是
 * 同一处遗漏。背景不同：subheading 画在页面背景上（`ctx.defaultBg`），KPI
 * 数值画在卡片自己的壳上（`renderKpiCard`/`onlyUnit` 单卡分支都先画
 * `colors.surface` 再调用本函数），所以改用
 * `accessibleInk(colors.accent, ctx.colors.surface, fittedValue.fontSize)`
 * ——背景参数是 `colors.surface`，不是 `ctx.defaultBg`。数值字号固定
 * >=24px（56/72 两档，仅在极端窄卡下可能收缩到 `BENTO_KPI_VALUE_MIN_SIZE`
 * =20），大字号 3:1 门槛下实测 consulting/bloom/classroom/heritage 四个
 * 主题不达标（`pptfast audit` 实测 consulting 1.56:1，见
 * `full-matrix-contrast.test.ts` 的同名回归网）——与 subheading 22px 走
 * 4.5:1 门槛时不达标的五主题集合不是同一批，纯粹是字号不同导致门槛不同，非
 * 主题名单不一致的疑点。卡壳描边、发光点缀（dot/ring）仍是纯装饰形状（非
 * `<text>`），不在 `auditDeck` 的文字对比度检查范围内，维持原样消费
 * `colors.accent`，不随本次修复变更——同一份「不改形状只改文字」纪律。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量。
 */

const BENTO_CARD_RADIUS = 6
const BENTO_CARD_PAD = 20
// Task 2's outline-card treatment: every bento shell (KPI/icon_cards
// exploded tile, ordinary component cell) shares this fill/stroke — no separate
// per-card-kind styling. `colors.panel` (bento's old distinct card-fill tier)
// was retired in Task 1, so this is a literal `colors.surface`, not a
// `colors.panel ?? colors.surface` fallback.
const BENTO_CARD_STROKE_OPACITY = "0.3"
const BENTO_CARD_STROKE_WIDTH = "1"
// Content budget inside a card: renderComponent starts at box.y + BENTO_CARD_TOP_PAD
// (clears the card's rounded top edge/stroke) and leaves BENTO_CARD_BOTTOM_PAD
// of breathing room at the bottom before the card's own rounded edge.
const BENTO_CARD_TOP_PAD = 24
const BENTO_CARD_BOTTOM_PAD = 16

// `SCALABLE_TYPES`/`SELF_VISUAL_TYPES`/`PASSTHROUGH_SHELL_TYPES` (imported
// above) now live in `../component-traits` (W2 task 5 unification of the 5
// component-classification sets scattered across layout.ts/bento-layout.ts/
// this file/content-stacked-poster.tsx/AssertionEvidence.tsx) — not
// redefined here. See that file for the full "why" on each set, including
// the "卡中卡" (card-in-a-card) and "双壳治理" (double-shell governance)
// rationale this file used to carry locally.

/* ── KPI single-card rendering (bento's own, not kpi.tsx's row layout) ──
 * kpi.tsx lays out N items side-by-side in one wide card — bento explodes
 * items into individual cards instead, so each needs its own compact
 * icon/value/unit/label/delta layout sized to a bento cell rather than a
 * fixed 120px-tall row card. Placement semantics (value+unit tspan split,
 * delta arrow, icon slot) intentionally mirror kpi.tsx's — `deltaProps` and
 * `splitKpiValueWidths` are imported straight from ../components/kpi.tsx (not
 * re-implemented here) so the two renderers can't drift on that math; only
 * the sizing constants below and the centered-in-cell layout are bento's own.
 */
const BENTO_KPI_ICON_SIZE = 18
const BENTO_KPI_ICON_GAP = 10
// Task 2 "display 级": 32 -> 56, plus the value's fill switches from
// colors.text to colors.accent (see renderKpiCardBody) — the value is now
// the card's visual lead, not just bold body text. unit/label sizes are
// untouched (label "muted 不变" per brief; unit stays proportional to the
// *fitted* value size via the 0.45 ratio below, so it auto-scales with this
// bump without a separate constant).
const BENTO_KPI_VALUE_SIZE = 56
const BENTO_KPI_VALUE_MIN_SIZE = 20
const BENTO_KPI_LABEL_SIZE = 16
const BENTO_KPI_LABEL_MIN_SIZE = 11
const BENTO_KPI_DELTA_SIZE = 16
// Baseline-to-baseline distance from the value to the label — a real
// line-gap, not the label's own font-size. Regression fix (pre-Task-2): the
// label baseline used to sit at valueBaselineY + BENTO_KPI_LABEL_SIZE (only
// 13px), which is barely more than the label's own ascent and left no room
// at all for the value's glyph height/descenders — soffice real-render
// exposed it as the label stamping over the value ("99.95%" over "可用率").
// The resulting 34px was tuned for a 32px value; Task 2 scales it
// proportionally (34 * 56/32 = 59.5, rounded to 60) alongside the value-size
// bump above so the two can't drift back out of sync — a taller value needs
// proportionally more clearance before the label, not the same fixed gap.
// 重设计（2026-07-09）：60px 的 value→label 空隙把卡内内容「上下拉散」
// （真机审计：label 贴卡底、中部空洞）——收紧成呼吸距离，label 提大与
// 56px value 建立合理对比。
const BENTO_KPI_VALUE_LABEL_GAP = 22
// Task 2 "发光点缀": a solid dot + two concentric stroked rings anchored just
// past the value (+unit) text's estimated right edge, simulating a glow
// without an actual SVG filter (Chrome 103 / the controlled subset has
// none) — see renderKpiCardBody's glowCx/glowCy math. Radii/opacities are
// brief-literal values, not derived from anything else.
const BENTO_KPI_GLOW_DOT_R = 3
const BENTO_KPI_GLOW_RING1_R = 7
const BENTO_KPI_GLOW_RING2_R = 11
const BENTO_KPI_GLOW_RING1_OPACITY = "0.18"
const BENTO_KPI_GLOW_RING2_OPACITY = "0.07"
// Gap from the value(+unit) text's estimated right edge to the glow
// cluster's center point (not its visible edge — the dot's own r=3 sits
// inside this gap, so the visible clearance from the last glyph is ~9px).
const BENTO_KPI_GLOW_GAP = 12
// vc-task-7 review (Important #1): the horizontal clamp below only kept the
// glow cluster inside the card's own right padding — it didn't know a delta
// arrow (drawn separately, right-anchored at the same padding edge, see the
// `dp &&` text below) also lives in that corner. With no icon, the value's
// row sits at the same height as the delta row (no icon component pushing it
// down), so a long value that shrinks to the clamp puts ring2 right where
// the delta arrow renders. Reserve extra clearance in the clamp whenever a
// delta is present (regardless of icon — icon presence only changes whether
// the *natural* (unclamped) position would ever reach the clamp in the
// first place, not whether the clamp itself is safe once reached).
const BENTO_KPI_GLOW_DELTA_RESERVE = 20

// Task 3 "视觉主角": a kpi-item exploded into a cell taller than this (the
// 2-unit tier's full-height cells, or the 3-unit tier's hero left cell —
// see bento-layout.ts's CELL_AREA_RANK) earns one more display step, on top
// of Task 2's 32->56 bump: 56->72, plus the glow rings grow +2/+3 in lockstep
// (dot stays r=3 — only the two *rings* are called out in the brief). The
// label/value gap is scaled by the same ratio Task 2 used to derive 60 from
// 34 (34*56/32=59.5->60): 60*72/56=77.14, rounded to 77 — the taller value's
// descenders need proportionally more clearance before the label baseline,
// or the Task 2 label-stamped-on-value regression (see
// BENTO_KPI_VALUE_LABEL_GAP's own comment) comes back at the new size.
// 重设计（2026-07-09）：300 的阈值让 2×2 布局（卡高 ~200）永远吃不到
// 72px 大数字档——KPI 的价值就是数字冲击力，降到 190。
const BENTO_KPI_HERO_MIN_CELL_H = 190
const BENTO_KPI_HERO_VALUE_SIZE = 72
const BENTO_KPI_HERO_VALUE_LABEL_GAP = 28
const BENTO_KPI_HERO_GLOW_RING1_R = 9
const BENTO_KPI_HERO_GLOW_RING2_R = 14

// A lone KPI item on an otherwise-empty Content page still reads as "one
// card", not a giant shell stretched to the full bento rect (that's exactly
// the empty-shell-card look this redesign removes for plain components) — fixed
// at a modest width and centered instead of filling the rect.
const SINGLE_KPI_CARD_W = 400
const SINGLE_KPI_CARD_H = 160

/**
 * The vertical space (px, from the card's inner top edge to the label's
 * baseline) a KPI item's content needs — icon (if any) + value line +
 * the fixed value→label gap, at each element's *unshrunk* font size. Used
 * both to position the value/label baselines (`renderKpiCardBody` derives
 * both baselines off this same offset math) and as the degrade-gate's
 * budget check (kept in one place so the two can never drift apart).
 *
 * `hero` (Task 3) selects the display-level 72px tier (see
 * `BENTO_KPI_HERO_MIN_CELL_H`'s own comment) — callers must derive it from
 * the *same* `box.h` the degrade gate and the render path both see, so the
 * budget check and the actual paint can never disagree about which size a
 * given cell renders at.
 */
function kpiContentHeight(hasIcon: boolean, hero: boolean): number {
  const iconComponentH = hasIcon ? BENTO_KPI_ICON_SIZE + BENTO_KPI_ICON_GAP : 0
  const valueSize = hero ? BENTO_KPI_HERO_VALUE_SIZE : BENTO_KPI_VALUE_SIZE
  const valueLabelGap = hero
    ? BENTO_KPI_HERO_VALUE_LABEL_GAP
    : BENTO_KPI_VALUE_LABEL_GAP
  return iconComponentH + valueSize + valueLabelGap
}

/**
 * Render one KPI item's content (icon/value/unit/label/delta/glow) inside
 * `box`, at bento card padding. Does not paint the card shell (surface fill +
 * accent stroke) — callers compose that separately, mirroring how ordinary
 * component cells separate "shell" from "content".
 *
 * The content component is vertically centered in the card's fit budget (not
 * anchored to the top) — a KPI item exploded into a 2/3-unit bento tier
 * lands in a tall cell (h up to ~454px) while its own content is a fixed
 * ~113px, so top-anchoring left a large dead gap below it. Centering shifts
 * icon/value/label together by one `offsetY` added into `innerY` — their
 * *relative* spacing is fixed regardless of offsetY: icon flush at the top,
 * value's baseline `BENTO_KPI_VALUE_SIZE` below that, label's baseline a
 * further `BENTO_KPI_VALUE_LABEL_GAP` (>=30px) below the value's — enough
 * clearance that the label never sits under the value's glyphs.
 */
function renderKpiCardBody(
  item: KpiItem,
  box: { x: number; y: number; w: number; h: number },
  ctx: ComponentCtx
): React.ReactElement {
  const innerX = box.x + BENTO_CARD_PAD
  const innerW = box.w - BENTO_CARD_PAD * 2
  const hasIcon = Boolean(item.icon)
  const iconComponentH = hasIcon ? BENTO_KPI_ICON_SIZE + BENTO_KPI_ICON_GAP : 0

  // Task 3 "视觉主角": a hero-sized cell (see BENTO_KPI_HERO_MIN_CELL_H's own
  // comment) bumps the value one more display step, 56->72, with the glow
  // rings and label gap scaling in lockstep — derived from `box.h` (the same
  // value `cellOverBudget` sees), never from `fittedValue.fontSize`, so the
  // degrade-gate budget check and this render can't disagree about which
  // tier a given cell is in.
  const hero = box.h > BENTO_KPI_HERO_MIN_CELL_H
  const valueSize = hero ? BENTO_KPI_HERO_VALUE_SIZE : BENTO_KPI_VALUE_SIZE
  const valueLabelGap = hero
    ? BENTO_KPI_HERO_VALUE_LABEL_GAP
    : BENTO_KPI_VALUE_LABEL_GAP
  const ring1R = hero ? BENTO_KPI_HERO_GLOW_RING1_R : BENTO_KPI_GLOW_RING1_R
  const ring2R = hero ? BENTO_KPI_HERO_GLOW_RING2_R : BENTO_KPI_GLOW_RING2_R

  // Same budget the degrade gate checks in `cellOverBudget` — centering off
  // it (rather than off raw box.h) keeps the content clear of the top
  // padding and the bottom breathing room in every case, including cells too
  // short to have any slack (offsetY floors at 0).
  const budgetH = box.h - BENTO_CARD_TOP_PAD - BENTO_CARD_BOTTOM_PAD
  const offsetY = Math.max(0, (budgetH - kpiContentHeight(hasIcon, hero)) / 2)
  const innerY = box.y + BENTO_CARD_TOP_PAD + offsetY

  const dp = item.delta ? deltaProps(item.delta) : null
  // Bench-driven fix round, defect B: same unguarded `dp.color` pattern as
  // kpi.tsx's own row-layout delta arrow (see that file's `deltaProps` doc
  // comment for the full defect — a real, theme-independent one, found
  // failing on all 13 themes across the two call sites combined) — this
  // cell's own `colors.surface` shell (painted by `renderCell` before this
  // function runs, same background `valueFill` above already checks
  // against) is the right reference, not `ctx.defaultBg`.
  const deltaColor = dp
    ? accessibleInk(dp.color || ctx.colors.muted, ctx.colors.surface, BENTO_KPI_DELTA_SIZE)
    : ctx.colors.muted

  // Same value/unit width-split technique as kpi.tsx (shared via
  // `splitKpiValueWidths`, see components/kpi.tsx): the overflow auditor
  // measures a <text>'s whole textContent at the outer element's font-size,
  // so the value's width budget is shrunk in proportion to the unit's share
  // of the combined text instead of a flat pixel reserve.
  const valueStr = String(item.value)
  // 冗余单位去重（同 components/kpi.tsx：value 已含 unit 结尾时丢弃，防 "35%%"）。
  const unit = dedupeKpiUnit(valueStr, item.unit)
  const { valueMaxWidth, unitMaxWidth } = splitKpiValueWidths(
    valueStr,
    unit,
    innerW
  )
  // bold-metrics fix (2026-07-24): same defect class as components/kpi.tsx's
  // own value text (see that file's identical fix and comment) — this text
  // renders `fontWeight="bold"` in `ctx.fonts.heading` below, and
  // `fittedUnit`'s tspan inherits that bold.
  const fittedValue = fitSvgLine(valueStr, {
    maxWidth: valueMaxWidth,
    fontSize: valueSize,
    minFontSize: BENTO_KPI_VALUE_MIN_SIZE,
    bold: true,
    fontFamily: ctx.fonts.heading,
  })
  const unitFontSize = Math.round(fittedValue.fontSize * 0.45)
  const fittedUnit = unit
    ? truncateToUnits(unit, unitMaxWidth / unitFontSize, { bold: true, fontFamily: ctx.fonts.heading })
    : null
  const fittedLabel = fitSvgLine(item.label, {
    maxWidth: innerW,
    fontSize: BENTO_KPI_LABEL_SIZE,
    minFontSize: BENTO_KPI_LABEL_MIN_SIZE,
  })

  // W8 fix round: same defect class as the subheading's own W4 fix (see
  // file header) — this value text baked ctx.colors.accent with no check
  // against the background it's actually painted on. Unlike the
  // subheading (painted straight on the page background), the value always
  // sits on *this card's own shell* — `renderKpiCard`/the `onlyUnit`
  // single-card branch both always paint that shell `colors.surface`
  // before calling this function — so that (not `ctx.defaultBg`) is the
  // right background to check against. Real-world catch: consulting's
  // accent `#FFC72C` on its own surface `#FFFFFF` measures ~1.56:1, well
  // under the 3:1 large-text floor (`pptfast audit` exit 1).
  const valueFill = accessibleInk(ctx.colors.accent, ctx.colors.surface, fittedValue.fontSize)

  const valueBaselineY = innerY + iconComponentH + valueSize
  const labelBaselineY = valueBaselineY + valueLabelGap

  // Glow cluster anchor: just past the value(+unit) text's estimated right
  // edge (same measureTextUnits-based width estimate the overflow auditor
  // itself uses elsewhere in this file — not real getBBox measurement, but
  // consistent with how every other width budget in this codebase is
  // computed), vertically at the value's own cap-height band (a fixed
  // fraction of the line's fixed slot, mirroring valueBaselineY/labelBaselineY
  // always deriving off the *unshrunk* value size rather than
  // fittedValue.fontSize). Clamped so the outer ring never crosses the card's
  // right padding — a very long value's estimated end would otherwise push
  // the glow past the card edge instead of just sitting near it. When a
  // delta arrow is also present, the clamp additionally reserves
  // `BENTO_KPI_GLOW_DELTA_RESERVE` px so a shrunk-to-the-clamp value's glow
  // can't visually collide with it (see that constant's own comment —
  // vc-task-7 review Important #1).
  const valueRenderedW =
    measureTextUnits(fittedValue.text) * fittedValue.fontSize
  const unitRenderedW =
    fittedUnit != null ? measureTextUnits(fittedUnit) * unitFontSize : 0
  const deltaReserve = dp ? BENTO_KPI_GLOW_DELTA_RESERVE : 0
  const glowMaxCx = box.x + box.w - BENTO_CARD_PAD - ring2R - deltaReserve
  const glowCx = Math.min(
    innerX + valueRenderedW + unitRenderedW + BENTO_KPI_GLOW_GAP,
    glowMaxCx
  )
  const glowCy = valueBaselineY - valueSize * 0.75

  return (
    <>
      {item.icon && (
        <Icon
          name={item.icon}
          x={innerX}
          y={innerY}
          size={BENTO_KPI_ICON_SIZE}
          color={ctx.colors.primary}
        />
      )}
      <text
        data-truncated={fittedValue.truncated ? "1" : undefined}
        x={innerX}
        y={valueBaselineY}
        fontSize={fittedValue.fontSize}
        fontWeight="bold"
        fill={valueFill}
        fontFamily={ctx.fonts.heading}
        dominantBaseline="alphabetic"
      >
        {fittedValue.text}
        {fittedUnit != null && (
          <tspan fontSize={unitFontSize} fill={ctx.colors.muted}>
            {fittedUnit}
          </tspan>
        )}
      </text>
      <circle
        cx={glowCx}
        cy={glowCy}
        r={BENTO_KPI_GLOW_DOT_R}
        fill={ctx.colors.accent}
      />
      <circle
        cx={glowCx}
        cy={glowCy}
        r={ring1R}
        fill="none"
        stroke={ctx.colors.accent}
        strokeOpacity={BENTO_KPI_GLOW_RING1_OPACITY}
        strokeWidth={BENTO_CARD_STROKE_WIDTH}
      />
      <circle
        cx={glowCx}
        cy={glowCy}
        r={ring2R}
        fill="none"
        stroke={ctx.colors.accent}
        strokeOpacity={BENTO_KPI_GLOW_RING2_OPACITY}
        strokeWidth={BENTO_CARD_STROKE_WIDTH}
      />
      {dp && (
        <text
          x={box.x + box.w - BENTO_CARD_PAD}
          y={innerY + BENTO_KPI_DELTA_SIZE}
          textAnchor="end"
          fontSize={BENTO_KPI_DELTA_SIZE}
          fill={deltaColor}
          dominantBaseline="alphabetic"
        >
          {dp.arrow}
        </text>
      )}
      <text
        data-truncated={fittedLabel.truncated ? "1" : undefined}
        x={innerX}
        y={labelBaselineY}
        fontSize={fittedLabel.fontSize}
        fill={ctx.colors.muted}
        fontFamily={ctx.fonts.body}
        dominantBaseline="alphabetic"
      >
        {fittedLabel.text}
      </text>
    </>
  )
}

/** Paint a KPI card's shell (Task 2 outline: surface fill + accent stroke, no
 * corner stripe) and its content. */
function renderKpiCard(
  item: KpiItem,
  box: { x: number; y: number; w: number; h: number },
  ctx: ComponentCtx,
  colors: StyleColors
): React.ReactElement {
  return (
    <>
      <rect
        data-bento-shell="true"
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx={BENTO_CARD_RADIUS}
        fill={colors.surface}
        stroke={colors.accent}
        strokeOpacity={BENTO_CARD_STROKE_OPACITY}
        strokeWidth={BENTO_CARD_STROKE_WIDTH}
      />
      {renderKpiCardBody(item, box, ctx)}
    </>
  )
}

/* ── icon_cards single-card rendering (bento's own shell around the shared
 * content renderer) ──
 * `icon_cards` items explode the same way `kpi_cards` items do (see
 * `explodeIntoUnits`) — each item earns its own bento tile. Unlike the KPI
 * path, the card's *content* drawing (icon/title/text placement + text-fit)
 * is genuinely shared with `components/icon-cards.tsx` via `renderIconCardBody`/
 * `iconCardContentHeight` rather than reimplemented here — only the shell
 * (Task 2 outline: surface fill + accent stroke, no corner stripe) and this
 * cell's own padding convention are bento's own, matching every other bento
 * card.
 */

// A lone icon-card item on an otherwise-empty Content page reads as one
// modest centered card, mirroring `SINGLE_KPI_CARD_W/H` above — schema
// enforces `icon_cards.items.length >= 2` so this is unreachable in
// practice, but the type union still needs an explicit branch (see the
// `onlyUnit` handling in `BentoPanelContent` below).
const SINGLE_ICON_CARD_W = 480
const SINGLE_ICON_CARD_H = 200

// Task 2 "层级拉开": bento's icon-card title bumps 20 -> 22px, bento-only —
// `components/icon-cards.tsx`'s own standalone row layout (used by the other 5
// themes) keeps its default 20px. Threaded through as an explicit
// `titleFontSize` opt (see `renderIconCardBody`/`iconCardContentHeight`'s
// signatures in that file) rather than changing that file's module-level
// `TITLE_FONT_SIZE` constant, so this is a bento-only parameter injection,
// not a shared-renderer behavior change.
const BENTO_ICON_CARD_TITLE_SIZE = 22
// 重设计（2026-07-09）：24px 共享图标在 200px 高的 bento 卡里存在感太弱
const BENTO_ICON_CARD_ICON_SIZE = 30

/** Paint an icon-card's shell (Task 2 outline: surface fill + accent stroke,
 * no corner stripe) and its shared content. */
function renderIconCard(
  item: IconCardItem,
  box: { x: number; y: number; w: number; h: number },
  ctx: ComponentCtx,
  colors: StyleColors
): React.ReactElement {
  const innerX = box.x + BENTO_CARD_PAD
  const innerW = box.w - BENTO_CARD_PAD * 2
  // 重设计（2026-07-09）：icon/title/text 组垂直居中（原顶锚让卡下半空洞）
  const budgetH = box.h - BENTO_CARD_TOP_PAD - BENTO_CARD_BOTTOM_PAD
  const contentH = iconCardContentHeight(item, innerW, {
    titleFontSize: BENTO_ICON_CARD_TITLE_SIZE,
    iconSize: BENTO_ICON_CARD_ICON_SIZE,
  })
  const innerY =
    box.y + BENTO_CARD_TOP_PAD + Math.max(0, (budgetH - contentH) / 2)
  return (
    <>
      <rect
        data-bento-shell="true"
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx={BENTO_CARD_RADIUS}
        fill={colors.surface}
        stroke={colors.accent}
        strokeOpacity={BENTO_CARD_STROKE_OPACITY}
        strokeWidth={BENTO_CARD_STROKE_WIDTH}
      />
      {renderIconCardBody(item, { x: innerX, y: innerY, w: innerW }, ctx, {
        titleFontSize: BENTO_ICON_CARD_TITLE_SIZE,
        iconSize: BENTO_ICON_CARD_ICON_SIZE,
      })}
    </>
  )
}

/** Whether a cell's content will overflow its box's fit budget — the same
 * degrade gate as before, generalized to `BentoUnit`s: a KPI item's budget
 * is its fixed content height (see `kpiContentHeight`); an icon-card item's
 * budget is `iconCardContentHeight` against the card's padded inner width
 * (shared with `components/icon-cards.tsx`, same split as the KPI case); a
 * self-visual component's budget is its own box (no shell padding to subtract,
 * since it renders bare — see `SELF_VISUAL_TYPES`); an ordinary component's
 * budget is `measureComponent` against the card's padded inner box. */
function cellOverBudget(cell: BentoCell, ctx: ComponentCtx): boolean {
  const { unit, box } = cell
  if (unit.kind === "kpi-item") {
    const budgetH = box.h - BENTO_CARD_TOP_PAD - BENTO_CARD_BOTTOM_PAD
    const hero = box.h > BENTO_KPI_HERO_MIN_CELL_H
    return kpiContentHeight(Boolean(unit.item.icon), hero) > budgetH
  }
  if (unit.kind === "icon-card-item") {
    const budgetH = box.h - BENTO_CARD_TOP_PAD - BENTO_CARD_BOTTOM_PAD
    // titleFontSize opt must match what renderIconCard actually paints
    // (BENTO_ICON_CARD_TITLE_SIZE) — otherwise this gate would measure
    // against the shared file's default 20px while the real render paints
    // 22px, letting a genuinely-overflowing card slip past the degrade check.
    return (
      iconCardContentHeight(unit.item, box.w - BENTO_CARD_PAD * 2, {
        titleFontSize: BENTO_ICON_CARD_TITLE_SIZE,
        iconSize: BENTO_ICON_CARD_ICON_SIZE,
      }) > budgetH
    )
  }
  if (SCALABLE_TYPES.has(unit.component.type)) return false
  if (SELF_VISUAL_TYPES.has(unit.component.type)) {
    return measureComponent(unit.component, box.w, ctx) > box.h
  }
  const budgetH = box.h - BENTO_CARD_TOP_PAD - BENTO_CARD_BOTTOM_PAD
  return measureComponent(unit.component, box.w - BENTO_CARD_PAD * 2, ctx) > budgetH
}

/** Render one bento cell — shell (Task 2 outline: surface fill + accent
 * stroke, no corner stripe) plus its unit's content. Non-scalable components that
 * are over budget never reach here (the `degraded` gate in
 * `BentoPanelContent` catches them first); scalable components (chart/image) are
 * uniformly shrunk to fit instead; `PASSTHROUGH_SHELL_TYPES` components
 * (steps/flowchart/architecture/timeline) skip the shell rect entirely (see
 * that set's own doc comment — "双壳治理"). */
function renderCell(
  cell: BentoCell,
  i: number,
  ctx: ComponentCtx,
  colors: StyleColors
): React.ReactElement {
  const { unit, box } = cell
  // Card-level rect (h = box.h) so svg-audit's v-overflow check treats each
  // card as its own bottom boundary instead of inheriting the whole bento
  // region's rect — box and rect are independent walker vars in
  // svg-audit.ts, so both attributes coexist on the same <g> without one
  // clobbering the other: data-audit-box still drives the h-overflow
  // (left/right) check.
  const auditAttrs = {
    "data-audit-box": `${box.x},${box.y},${box.w}`,
    "data-audit-rect": `${box.x},${box.y},${box.w},${box.h}`,
  }
  // Wave-C S3: every unit variant now carries its source `component` (see
  // `BentoUnit`'s doc comment). kpi-item/icon-card-item cells call
  // `renderKpiCard`/`renderIconCard` directly below instead of `renderComponent`
  // (the usual `data-blk` tagging chokepoint — see `components/index.tsx`), so
  // this cell's own wrapping `<g>` is their only tagging point. The plain
  // "component" branch further down does *not* need this: it calls `renderComponent`
  // itself, which already tags its own output — adding it here too would
  // just double-nest the identical marker.
  const blk = ctx.blockIndex?.get(unit.component)
  const blkAttr = blk != null ? { "data-blk": blk } : {}

  if (unit.kind === "kpi-item") {
    return (
      <g key={i} {...auditAttrs} {...blkAttr}>
        {renderKpiCard(unit.item, box, ctx, colors)}
      </g>
    )
  }

  if (unit.kind === "icon-card-item") {
    return (
      <g key={i} {...auditAttrs} {...blkAttr}>
        {renderIconCard(unit.item, box, ctx, colors)}
      </g>
    )
  }

  const { component } = unit
  if (SELF_VISUAL_TYPES.has(component.type)) {
    // These components already paint their own card/frame — stacking bento's own
    // outline shell underneath would be the exact "卡中卡" nesting this
    // redesign removes. `SvgContent` already knows how to center a lone
    // component in a rect (and carries its own overflow guard as a safety net),
    // so reuse it verbatim with the cell's box as the render rect instead of
    // hand-rolling a bare-render/centering path here.
    return (
      <SvgContent
        key={i}
        arrangement="single"
        components={[component]}
        rect={box}
        ctx={ctx}
      />
    )
  }

  const innerX = box.x + BENTO_CARD_PAD
  const innerW = box.w - BENTO_CARD_PAD * 2
  const budgetH = box.h - BENTO_CARD_TOP_PAD - BENTO_CARD_BOTTOM_PAD
  const measured = measureComponent(component, innerW, ctx)
  // 重设计（2026-07-09）：内容垂直居中（原顶锚让短内容下方大片空洞）
  const centerOffset = Math.max(0, (budgetH - measured) / 2)
  const innerY = box.y + BENTO_CARD_TOP_PAD + centerOffset
  const scale =
    SCALABLE_TYPES.has(component.type) && measured > budgetH && measured > 0
      ? budgetH / measured
      : 1
  // steps/flowchart/architecture/timeline already draw their own internal
  // chrome (numbered-badge cards, bordered nodes, filled layer bands,
  // axis/dots) — painting bento's own shell underneath would be a redundant
  // second shell around an already-carded diagram. The cell's box/padding/
  // audit annotations are otherwise identical to any other ordinary component.
  const passthroughShell = PASSTHROUGH_SHELL_TYPES.has(component.type)

  return (
    <g key={i} {...auditAttrs}>
      {!passthroughShell && (
        <rect
          data-bento-shell="true"
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          rx={BENTO_CARD_RADIUS}
          fill={colors.surface}
          stroke={colors.accent}
          strokeOpacity={BENTO_CARD_STROKE_OPACITY}
          strokeWidth={BENTO_CARD_STROKE_WIDTH}
        />
      )}
      {scale >= 1 ? (
        renderComponent(component, { x: innerX, y: innerY, w: innerW }, ctx)
      ) : (
        // Render the component at its natural (unscaled) width, then shrink the
        // whole group uniformly and re-center it horizontally in the card's
        // inner width — the scaled-down width (innerW * scale) is narrower
        // than innerW, so the gap is split evenly on both sides.
        <g
          transform={`translate(${innerX + (innerW - innerW * scale) / 2},${innerY}) scale(${scale})`}
        >
          {renderComponent(component, { x: 0, y: 0, w: innerW }, ctx)}
        </g>
      )}
    </g>
  )
}

export function BentoPanelContent({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const section = sectionNameFor(ir.slides, index)
  // CJK has no case distinction, so the "uppercase kicker" convention just
  // keeps the letter-spacing/size treatment and leaves the text as-is.
  const kicker = section
    ? fitSvgLine(section, {
        maxWidth: 1088,
        fontSize: 12,
        minFontSize: 9,
        letterSpacing: 4,
      })
    : null

  const HEADING_BASELINE = 150
  const heading = fitHeadingLines(slide.heading, {
    maxWidth: 1088,
    fontSize: 44,
    maxLines: 2,
    minPt: 24,
    fontFamily: fonts.heading,
  })
  const headingLastY =
    HEADING_BASELINE +
    Math.max(0, heading.lines.length - 1) * heading.lineHeight

  // Subheading (Task 5): a 22px accent so-what sentence below the heading.
  // Occupies a slot (22px line + gap) added to the bento grid's own y *only*
  // when `slide.subheading` is set, so a slide without one gets
  // byte-identical geometry to before this feature existed.
  //
  // S3b spacing fix (2026-07-07): the original generic +30 baseline left
  // only ~1px of clearance for this 44px title (titleLastY+round(0.12*44)=
  // titleLastY+5 vs. subheadingY-20=titleLastY+10 — nearly touching).
  // Unified formula: titleLastY + 22(ascent) + 14(target gap) +
  // round(0.12*44) = titleLastY + 36+6 = +42. Slot grows by the same +12
  // the baseline grew (30->42) so the subheading-to-grid gap doesn't shrink.
  const subheading = fitEmphasisLine(slide.subheading, {
    maxWidth: 1088,
    fontSize: 22,
    minFontSize: 16,
  })
  const subheadingY = headingLastY + 42
  const subheadingBudget = subheading ? 46 : 0
  // W4 fix round: keeps colors.accent when it already clears the
  // size-appropriate ratio, falls back to readableOn's neutral ink
  // otherwise (see file header). Fallback value is never rendered when
  // `subheading` is null. `ctx.defaultBg` is optional (`ComponentCtx`'s own
  // doc comment: a hand-built ctx in a test may omit it) — falls back to
  // the same `colors.bg` `buildCtx` itself defaults to.
  const subheadingFill = subheading
    ? accessibleInk(colors.accent, ctx.defaultBg ?? colors.bg, subheading.fontSize)
    : colors.accent

  const bentoRect: ContentRect = {
    x: 96,
    y: headingLastY + 36 + subheadingBudget,
    w: 1088,
    h: Math.max(0, 640 - (headingLastY + 36 + subheadingBudget)),
  }

  // Explode kpi_cards components into one bento tile per item *before* the grid
  // math runs — the grid's input is a mixed sequence of units (KPI items +
  // ordinary components), not raw `slide.components`.
  const units = explodeIntoUnits(slide.components)

  // A single-unit page never earns the bento *grid* grammar (there's
  // nothing to arrange into a grid), and a lone ordinary component additionally
  // drops the shell card entirely — rendering a full-bento-rect panel
  // around one component is exactly the "整页空壳巨卡" (page-filling empty-shell
  // card) this redesign removes. `SvgContent` already centers a lone component
  // in a rect, so this is the same degrade path used below, just not
  // labeled a degrade (nothing is overflowing). A lone KPI item is the one
  // exception: it keeps a card look, just a modest centered one instead of
  // a rect-filling shell (see `SINGLE_KPI_CARD_W/H`).
  let body: React.ReactElement
  const onlyUnit = units.length === 1 ? units[0] : null
  if (onlyUnit && onlyUnit.kind === "kpi-item") {
    const box = {
      x: bentoRect.x + (bentoRect.w - SINGLE_KPI_CARD_W) / 2,
      y: bentoRect.y + Math.max(0, (bentoRect.h - SINGLE_KPI_CARD_H) / 2),
      w: SINGLE_KPI_CARD_W,
      h: SINGLE_KPI_CARD_H,
    }
    body = renderCell({ unit: onlyUnit, box }, 0, ctx, colors)
  } else if (onlyUnit && onlyUnit.kind === "icon-card-item") {
    // Unreachable in practice — `icon_cards.items` schema-enforces >=2, so
    // an `icon_cards` component always explodes into >=2 units — but the type
    // union still needs an explicit branch (see `SINGLE_ICON_CARD_W/H`).
    const box = {
      x: bentoRect.x + (bentoRect.w - SINGLE_ICON_CARD_W) / 2,
      y: bentoRect.y + Math.max(0, (bentoRect.h - SINGLE_ICON_CARD_H) / 2),
      w: SINGLE_ICON_CARD_W,
      h: SINGLE_ICON_CARD_H,
    }
    body = renderCell({ unit: onlyUnit, box }, 0, ctx, colors)
  } else if (onlyUnit) {
    body = (
      <SvgContent
        arrangement="single"
        components={[onlyUnit.component]}
        rect={bentoRect}
        ctx={ctx}
      />
    )
  } else {
    // Task 3 "视觉主角": reorder units by hero weight (chart/kpi-item highest,
    // then icon-card-item, then a self-visual component, then a plain component)
    // *before* the grid math runs, so the highest-weight unit(s) land in
    // whichever cell(s) `layoutBento` makes largest for this unit count —
    // `layoutBento` itself stays kind-agnostic; only its input order changes.
    const heroOrdered = sortUnitsByHeroWeight(units)
    const { cells } = layoutBento(heroOrdered, bentoRect)
    // Two independent reasons a slide can't use the bento grammar, merged
    // into one mutually-exclusive degrade gate so a slide never partially
    // renders bento cards:
    //  - >6 units: the bento grid only ever has 6 cells. Rather than
    //    cramming the rest into the same rect (overlapping cards) or
    //    bolting on an ad-hoc "+N" card, abandon the bento grammar for this
    //    slide entirely.
    //  - any unit's content overflows its card's fit budget (see
    //    `cellOverBudget`) — a text component can't scroll or truncate, so an
    //    over-height component would either overflow the rounded card or get
    //    silently clipped. A scalable component (chart/image) instead gets
    //    uniformly shrunk to fit at render time below, so it never forces
    //    this degrade; a KPI item's fixed-height content practically never
    //    does either.
    // Both fall back to the same existing single-stack layout, which
    // already carries its own overflow guard — no overlap, guaranteed
    // either way.
    const degraded =
      units.length > 6 || cells.some((cell) => cellOverBudget(cell, ctx))
    body = degraded ? (
      <SvgContent
        arrangement="single"
        components={slide.components}
        rect={bentoRect}
        ctx={ctx}
      />
    ) : (
      <g
        data-audit-rect={`${bentoRect.x},${bentoRect.y},${bentoRect.w},${bentoRect.h}`}
      >
        {cells.map((cell, i) => renderCell(cell, i, ctx, colors))}
      </g>
    )
  }

  return (
    <>
      {kicker && (
        <text
          data-truncated={kicker.truncated ? "1" : undefined}
          x="96"
          y="104"
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={colors.muted}
          letterSpacing="4"
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x="96"
          y={HEADING_BASELINE + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Subheading: accent so-what sentence below the heading (Task 5) */}
      {subheading && (
        <text
          x="96"
          y={subheadingY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={subheadingFill}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(subheading.segments, {
            accent: colors.text,
            baseFill: subheadingFill,
            fontWeight: "700",
          })}
        </text>
      )}

      {body}

      {slide.footnote && (
        <text
          x="96"
          y="652"
          fontFamily={fonts.body}
          fontSize="20"
          fill={colors.muted}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {slide.footnote}
        </text>
      )}
    </>
  )
}
