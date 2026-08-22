/**
 * PPTX IR quality gate (E3): detect content-layout issues and return
 * structured warnings so the UI can surface them after generation.
 *
 * Pure function, no side-effects, never throws.
 */

import type { PptxIR, Slide } from "@/ir"
import { PACING_BUDGETS, resolveNarrative, type NarrativeProfile, type Pacing } from "@/narrative"
import { CAPACITY } from "./audit/capacity"
import { resolveEffectiveLayoutBodyCapacity } from "./layout-selection"
import { getLayout } from "./layouts/registry"
import { measureTextUnits } from "../lib/svg-text-layout"
// `fitHeadingLines` is a pure text-layout function (no React, no DOM — see
// its own file's imports), the same tier as `measureTextUnits` above, so
// importing it here doesn't touch the render chain this module (part of the
// light `./validate` SDK bundle, see `validate-core.ts`'s own file header)
// must stay clear of.
import { fitHeadingLines } from "./heading-fit"
import { buildChartModel } from "./components/chart-model"
import { resolveStyle } from "../themes"
import { effectiveRequestedLayout } from "../themes/definitions"

export type QualityIssue = {
  slide: number
  severity: "warn" | "error"
  code: string
  message: string
  /**
   * `code: "density"` only (W3 task 3, spec §5's dual-attribute capacity
   * split): the two `min()` candidates plus enough to name them, computed
   * once here via `resolveEffectiveLayoutBodyCapacity` — the same
   * selection path `FullSlideSvg` renders through — so `api.ts`'s English
   * translation layer (`describeQualityIssue`) can report which side bound
   * without re-resolving the slide's effective layout itself (there must be
   * exactly one place that does that resolution).
   */
  density?: {
    limit: number
    pacing: Pacing
    pacingBudget: number
    layoutId: string | null
    layoutCapacity: number | undefined
  }
  /** `code: "bullets_overflow"` / `"bullet_item_long"` only — the resolved
   * pacing's bullets budget (spec §5 pacing table), for the same
   * English-translation reason as `density` above. */
  bulletsBudget?: { pacing: Pacing; maxItems: number; maxUnitsPerItem: number }
  /** `code: "chart_axes_ignored"` only — the offending chart's `chart_type`,
   * for the same English-translation reason as `density`/`bulletsBudget`
   * above: `api.ts`'s `describeQualityIssue` names it without re-deriving
   * which component/chart_type triggered the finding. */
  chartAxesIgnored?: { chartType: string }
  /** `code: "chart_duplicate_category"` only (R1 evidence wave, Task T2) —
   * the offending series' name and the repeated category value, straight
   * off `chart-model.ts`'s own `ChartDuplicate` (one issue per duplicate
   * key per series — a key repeated 3x in one series still produces one
   * `ChartDuplicate`/one issue, see that type's own doc comment), for the
   * same English-translation reason as `chartAxesIgnored` above. */
  chartDuplicateCategory?: { seriesName: string; x: string | number }
  /** `code: "data_table_missing_cell"` only (R1 evidence wave, Task T3) —
   * the offending row's 0-based index and the declared column key its
   * `cells` object omits, for the same English-translation reason as
   * `chartDuplicateCategory` above. One issue per (row, missing key) pair —
   * a row missing 2 declared keys produces 2 issues, mirroring
   * `chart_duplicate_category`'s own "one per occurrence, not one per row"
   * granularity. */
  dataTableMissingCell?: { rowIndex: number; key: string }
  /** `code: "pin_only_over_capacity"` only (quote-stage wave, task T2,
   * 裁定 2) — the pinned `pinOnly` layout's id, its declared `body`-slot
   * capacity, and the slide's actual component count, for the same
   * English-translation reason as `density`/`bulletsBudget` above. */
  pinOnlyCapacity?: { layoutId: string; capacity: number; componentCount: number }
  /** `code: "pinned_heading_overflow"` only (quote-stage wave, task T2;
   * renamed from `quote_stage_heading_overflow` in task T3 once the check
   * went metadata-driven off `headingFit` — see that field's own doc
   * comment) — the pinned layout's id, for the same English-translation
   * reason as `pinOnlyCapacity` above. */
  pinnedHeadingOverflow?: { layoutId: string }
}

// ── helpers ──

/** Count characters. CJK characters count as 1 each (same as .length). */
function charLen(s: string): number {
  return s.length
}

function hasKpiCardsComponent(slide: Slide): boolean {
  return slide.components.some((b) => b.type === "kpi_cards")
}

/**
 * Chart types `component.axes` (x_title/y_title/show_grid) actually renders
 * for — mirrors `chart.tsx`'s own `AXES_APPLICABLE_TYPES` (a local
 * duplicate, not a cross-import: this is a pure quality-check module, that
 * one a React SVG renderer — same "small local list + comment" precedent
 * `gantt.tsx`'s `vx` primitive already set for `chart-svg.tsx` rather than
 * coupling the two module kinds for two entries). See that file's own doc
 * comment for the per-type rationale (pie/donut/gauge are radial with no axes
 * at all — funnel/dumbbell have a value axis but no plot-box gridline surface
 * to anchor a title against; scatter/area are cartesian and DO render axes,
 * added in the chart-depth wave).
 */
const AXES_APPLICABLE_CHART_TYPES: ReadonlySet<string> = new Set(["bar", "line", "scatter", "area"])

/** True when `axes` carries at least one real setting — `axes: {}` (every
 * sub-field omitted, schema-legal since all three are optional) has nothing
 * for a non-applicable chart_type to actually ignore, so it shouldn't warn. */
function hasAnyAxesSetting(axes: { x_title?: string; y_title?: string; show_grid?: boolean }): boolean {
  return axes.x_title !== undefined || axes.y_title !== undefined || axes.show_grid !== undefined
}

/**
 * A slide is considered a "background-only image page" if it has exactly one
 * component of type `image` and no heading. We skip the missing-heading check for
 * these because the image IS the content.
 */
function isBackgroundImageOnly(slide: Slide): boolean {
  return (
    !slide.heading &&
    slide.components.length === 1 &&
    slide.components[0].type === "image"
  )
}

/**
 * Shared push-plumbing for the item-count dual-threshold checks the
 * carried-items wave adds for comparison/citation/architecture (mirrors
 * bullet_item_overflow/bullets_count_overflow's shape: a warn budget and a
 * separate, always-higher error ceiling, both flat/pacing-independent
 * `CAPACITY` constants — see each call site's own `CAPACITY.*` derivation
 * comment in capacity.ts for the actual numbers). Not shared with the
 * bullets loop above: bullets' two error-tier checks
 * (bullet_item_overflow/bullets_count_overflow) answer different questions
 * (per-item length vs. item count) and bullets_overflow/bullet_item_long
 * read PACING_BUDGETS, not CAPACITY, so folding all four bullets checks and
 * these three into one generic helper would blur that distinction rather
 * than clarify it. `errorThreshold` is never lower than `warnThreshold` for
 * any of the three call sites (capacity.ts pins the arithmetic that makes
 * that true) — this helper doesn't itself enforce the ordering, it just
 * fires each check independently, same as `bullet_item_long`/
 * `bullet_item_overflow` firing side by side above.
 */
function pushItemCountOverflow(
  issues: QualityIssue[],
  slideIndex: number,
  count: number,
  opts: {
    warnThreshold: number
    errorThreshold: number
    warnCode: string
    errorCode: string
    warnMessage: string
    errorMessage: string
  },
): void {
  if (count > opts.warnThreshold) {
    issues.push({ slide: slideIndex, severity: "warn", code: opts.warnCode, message: opts.warnMessage })
  }
  if (count > opts.errorThreshold) {
    issues.push({ slide: slideIndex, severity: "error", code: opts.errorCode, message: opts.errorMessage })
  }
}

// ── per-slide checks ──

function checkSlide(ir: PptxIR, slide: Slide, index: number, resolvedAxes: NarrativeProfile): QualityIssue[] {
  const issues: QualityIssue[] = []
  const budget = PACING_BUDGETS[resolvedAxes.pacing]

  // A1-reverse: heading too long. Stays warn-only — Task 2 (borrow wave,
  // dual-threshold severity) deliberately did not give headings an error-
  // level counterpart to bullet_item_overflow below. Evaluated and
  // rejected, not overlooked — one structural reason still blocks it:
  //   No clean geometric error derivation exists yet.
  //   `bullet_item_overflow` leans on one flat shrink floor
  //   (bullets.tsx's MIN_FONT=14) shared by every layout. Headings
  //   have no equivalent single floor — `fitHeadingLines`'s `minPt`
  //   ranges from 22 (content-banner-heading.tsx,
  //   content-tone-adaptive-content.tsx) to 72 (cover-fashion-
  //   masthead.tsx) depending on layout, so one global units ceiling
  //   would either under-protect the tightest layouts or
  //   false-positive on the roomiest ones. Deriving per-layout-family
  //   minPt buckets is the likely path, not attempted here.
  // The other reason this analysis originally cited — no render-time
  // visibility to back a threshold — is closed (truncation-visibility
  // wave, Task 2): `SvgTextLayout` (src/lib/svg-text-layout.ts) now
  // carries a `truncated` field, `fitHeadingLines` sets it `true` on its
  // `truncateToUnits` fallback, and every layout's heading `<text>`
  // stamps `data-truncated="1"` on its last line when it fires — the same
  // generic `[data-truncated="1"]` reader `deck-audit.ts`'s
  // `content-truncated` check already used for every `fitSvgLine`-based
  // role picks this up with zero audit-side changes. Revisit whether a
  // geometric error is derivable now that visibility exists — the minPt
  // spread above is the only remaining blocker.
  if (slide.heading && charLen(slide.heading) > CAPACITY.headingMaxChars) {
    issues.push({
      slide: index,
      severity: "warn",
      code: "long_heading",
      message: "标题偏长，建议精炼成断言式短句",
    })
  }

  // A2: density cap — only for content slides. W3 task 3 (spec §5's
  // dual-attribute capacity split): limit = min(this narrative's pacing
  // editorial budget, the resolved layout's body-slot geometric capacity).
  // The geometric half comes from `resolveEffectiveLayoutBodyCapacity`
  // (`./layout-selection`) — the exact selection path `FullSlideSvg` renders
  // through, never re-derived here, so what this gate flags is guaranteed to
  // match what render would actually overflow. `layoutCapacity: undefined`
  // (image-cover bypass, or a takeover with no `body` slot capacity — the 4
  // image-family layouts) means no geometric term: only the editorial budget
  // applies.
  if (slide.type === "content") {
    const { layoutId, capacity: layoutCapacity } = resolveEffectiveLayoutBodyCapacity(ir, slide, index)
    const limit = Math.min(budget.maxComponentsPerSlide, layoutCapacity ?? Infinity)
    if (slide.components.length > limit) {
      issues.push({
        slide: index,
        severity: "warn",
        code: "density",
        message: `每页至多 ~${limit} 个块，建议拆页`,
        density: {
          limit,
          pacing: resolvedAxes.pacing,
          pacingBudget: budget.maxComponentsPerSlide,
          layoutId,
          layoutCapacity,
        },
      })
    }
  }

  // Two pinned-layout hard errors below share one `getLayout` lookup
  // (T2 fix round — whole-branch review flagged the pre-fix version's
  // heading check as a shadow copy: it hardcoded `slide.layout ===
  // "quote-stage"` and hand-mirrored this layout's four fit constants
  // with no sync guard, the one place in this file that knew an individual
  // layout id — everything else here, including the capacity check right
  // below, is metadata-driven). Both checks only look at the pinned
  // layout's own declared `LayoutDefinition` fields now — no layout id
  // appears in either condition.
  const effectivePin = effectiveRequestedLayout(ir.theme.id, slide.layout)
  if (effectivePin !== undefined) {
    const pinnedDef = getLayout(effectivePin)

    // pin-only over-capacity hard error (quote-stage wave, task T2, 裁定 2):
    // an explicit pin onto a `pinOnly` layout (`registry.ts`'s
    // `LayoutDefinition.pinOnly` — reachable *only* through this exact path,
    // never auto-pick) already declares author intent, so the generic
    // degrade every other over-capacity slide gets today —
    // `layoutContentFit`'s "+N more" pill, flagged only as the `density`
    // *warn* above — would silently drop content the author explicitly
    // asked to keep. Scope strictly to `pinOnly` layouts: an ordinary
    // layout pinned over its own declared body capacity keeps today's
    // `density` warn above, completely unchanged (regression-tested in
    // ir-quality.test.tsx) — this is an *additional* error, not a
    // replacement for that warn (both fire together when a pinOnly layout
    // is over capacity, same "different questions, both fire" posture
    // `bullet_item_long`/`bullet_item_overflow` already established).
    const pinnedCapacity = pinnedDef?.slots.find((s) => s.name === "body")?.capacity
    if (pinnedDef?.pinOnly && pinnedCapacity !== undefined && slide.components.length > pinnedCapacity) {
      issues.push({
        slide: index,
        severity: "error",
        code: "pin_only_over_capacity",
        message: `钉住的版式 "${effectivePin}" 容量为 ${pinnedCapacity}，当前有 ${slide.components.length} 个组件，超出容量——请拆分内容或去掉钉住`,
        pinOnlyCapacity: {
          layoutId: effectivePin,
          capacity: pinnedCapacity,
          componentCount: slide.components.length,
        },
      })
    }

    // heading width-limit hard error (quote-stage wave, task T2; made
    // metadata-driven in the T2 fix round; code renamed from
    // `quote_stage_heading_overflow` to `pinned_heading_overflow` in task T3
    // to match — the check itself was already metadata-driven, the old code
    // name was the only thing still naming quote-stage specifically): fires
    // for *any* pinned layout that declares `headingFit` (`registry.ts`'s
    // `LayoutDefinition.headingFit` — see that field's own doc comment for
    // the full rationale and why it replaces a hardcoded layout-id
    // check), running the exact same `fitHeadingLines` call the layout's
    // own layout file uses to render — one declared source, not two
    // hand-mirrored copies. Only `quote-stage` sets `headingFit` as of this
    // task, so behavior is unchanged: unlike an ordinary layout's heading
    // — decorative relative to its own body content, hence `long_heading`'s
    // warn-only posture above (see that block's own comment on why a
    // *general* per-layout minPt-bucket error derivation was evaluated
    // and deferred, not overlooked) — a `headingFit`-declaring pinned
    // layout's heading *is* the page's entire content (裁定 3: heading as
    // the page's oversized main visual, quote-stage being the first such
    // member). `fitHeadingLines` truncating even at its own `minPt` floor is
    // real, silent content loss, the same class `bullet_item_overflow`
    // below already hard-blocks for bullets. A future `pinOnly` member can
    // opt into this same error tier simply by declaring its own
    // `headingFit` — no change needed here.
    if (pinnedDef?.headingFit && slide.heading) {
      const typeScale = resolveStyle(ir.theme.id, ir.theme.style).shape?.typeScale
      const fit = fitHeadingLines(slide.heading, { ...pinnedDef.headingFit, typeScale })
      if (fit.truncated) {
        issues.push({
          slide: index,
          severity: "error",
          code: "pinned_heading_overflow",
          message: `钉住的版式 "${effectivePin}" 正文过长，缩小到最低字号仍会被截断——请精简正文或拆分为多页`,
          pinnedHeadingOverflow: { layoutId: effectivePin },
        })
      }
    }
  }

  // bullets overflow + per-item length — W3 task 3: budget reads
  // PACING_BUDGETS (spec §5 pacing table), an editorial (warn) ceiling —
  // *not* the same `CAPACITY.bullets` the geometric check just below reads:
  // that old flat physical-ceiling entry was deleted in W3 (its number sat
  // above every pacing budget, so it was redundant at the time). This task
  // (borrow wave, Task 2) reintroduces `CAPACITY.bullets` under the same
  // name but a different, narrower meaning (an *error*-level render-safety
  // ceiling, not an editorial one) — see its own derivation comment.
  for (const component of slide.components) {
    if (component.type !== "bullets") continue
    if (component.items.length > budget.bullets.maxItems) {
      issues.push({
        slide: index,
        severity: "warn",
        code: "bullets_overflow",
        message: `要点列表条目过多（>${budget.bullets.maxItems}），建议精简或拆页`,
        bulletsBudget: { pacing: resolvedAxes.pacing, ...budget.bullets },
      })
    }
    // bullets_overflow 二级升级（P0 hardening, robustness deep-review D1,
    // 借 borrow 波 Task 2 的 dual-threshold 架构，与 bullet_item_overflow
    // 同款"扁平、与 pacing 无关的物理/合理性硬界"设计）：条目数超过
    // `CAPACITY.bullets.countOverflowItems` 时，"优雅截断"已经不是对结果
    // 的诚实描述——render 层（`bullets.tsx`，同任务）现在会把渲染项数钳制
    // 到 box.h 并标记 `data-dropped`，不会再崩溃，但极端条目数会让绝大多数
    // 内容悄悄消失在一行「+N …」里。阈值推导见 `capacity.ts`
    // `CAPACITY.bullets.countOverflowItems` 自己的注释。
    if (component.items.length > CAPACITY.bullets.countOverflowItems) {
      issues.push({
        slide: index,
        severity: "error",
        code: "bullets_count_overflow",
        message: `要点列表条目数远超合理上限（>${CAPACITY.bullets.countOverflowItems}），"优雅截断"已不再是诚实描述——请精简内容或拆分为多页`,
        bulletsBudget: { pacing: resolvedAxes.pacing, ...budget.bullets },
      })
    }
    for (const item of component.items) {
      const units = measureTextUnits(item)
      if (units > budget.bullets.maxUnitsPerItem) {
        issues.push({
          slide: index,
          severity: "warn",
          code: "bullet_item_long",
          message: "单条要点过长，建议精简至 2 行内",
          bulletsBudget: { pacing: resolvedAxes.pacing, ...budget.bullets },
        })
      }
      // Task 2 (borrow wave, dual-threshold severity): geometric hard
      // ceiling, independent of pacing — see CAPACITY.bullets
      // .itemOverflowUnits's own derivation comment (capacity.ts) for the
      // 2-line/MIN_FONT=14/narrowest-two-column-width formula and its
      // empirical confirmation. Fires *in addition to* bullet_item_long
      // above when both cross (an item can be simultaneously "over the
      // editorial budget" and "past the render-safety edge") — the two
      // codes answer different questions and neither supersedes the other.
      if (units > CAPACITY.bullets.itemOverflowUnits) {
        issues.push({
          slide: index,
          severity: "error",
          code: "bullet_item_overflow",
          message: "单条要点超出渲染安全上限，会被截断显示",
        })
      }
    }
  }

  // comparison_overflow/citation_overflow/architecture_overflow +
  // their _count_overflow error tiers. comparison/citation still fold at
  // render with a data-dropped marker. architecture no longer folds: the
  // count ceiling is a validate hard stop. Same dual-threshold shape as
  // bullets (warn at a budget, error at a ceiling). Thresholds come from
  // CAPACITY (capacity.ts).
  for (const component of slide.components) {
    if (component.type === "comparison") {
      pushItemCountOverflow(issues, index, component.rows.length, {
        warnThreshold: CAPACITY.comparison.warnRows,
        errorThreshold: CAPACITY.comparison.errorRows,
        warnCode: "comparison_overflow",
        errorCode: "comparison_count_overflow",
        warnMessage: `对比表行数过多（>${CAPACITY.comparison.warnRows}行），极端版式下可能被截断显示，建议精简或拆页`,
        errorMessage: `对比表行数远超合理上限（>${CAPACITY.comparison.errorRows}），"优雅截断"已不再是诚实描述——请精简内容或拆分为多页`,
      })
    } else if (component.type === "citation") {
      pushItemCountOverflow(issues, index, component.sources.length, {
        warnThreshold: CAPACITY.citation.warnSources,
        errorThreshold: CAPACITY.citation.errorSources,
        warnCode: "citation_overflow",
        errorCode: "citation_count_overflow",
        warnMessage: `引用来源数量过多（>${CAPACITY.citation.warnSources}条），极端版式下可能被截断显示，建议精简或拆页`,
        errorMessage: `引用来源数量远超合理上限（>${CAPACITY.citation.errorSources}），"优雅截断"已不再是诚实描述——请精简内容或拆分为多页`,
      })
    } else if (component.type === "architecture") {
      pushItemCountOverflow(issues, index, component.layers.length, {
        warnThreshold: CAPACITY.architecture.warnLayers,
        errorThreshold: CAPACITY.architecture.errorLayers,
        warnCode: "architecture_overflow",
        errorCode: "architecture_count_overflow",
        warnMessage: `架构层数过多（>${CAPACITY.architecture.warnLayers}层），建议精简或拆页`,
        errorMessage: `架构层数远超合理上限（>${CAPACITY.architecture.errorLayers}），请拆分为多页`,
      })
    }
  }

  // chart_axes_ignored (chart-axes feature, dual-threshold severity — Task 2's
  // machinery): `axes` is schema-accepted on every chart_type but only
  // bar/line actually render it (chart.tsx's AXES_APPLICABLE_TYPES) — a
  // model authoring axes on pie/funnel/dumbbell gets silent no-op geometry
  // rather than a validation error (axes is legal IR on every chart_type),
  // so this is a warn-severity advisory, not a hard rejection.
  for (const component of slide.components) {
    if (component.type !== "chart" || !component.axes) continue
    if (AXES_APPLICABLE_CHART_TYPES.has(component.chart_type)) continue
    if (!hasAnyAxesSetting(component.axes)) continue
    issues.push({
      slide: index,
      severity: "warn",
      code: "chart_axes_ignored",
      message: `图表类型 "${component.chart_type}" 不支持坐标轴标题/网格线，axes 字段将被忽略（仅 bar、line、scatter、area 支持）`,
      chartAxesIgnored: { chartType: component.chart_type },
    })
  }

  // chart_duplicate_category (R1 evidence wave, Task T2 — roadmap §6.1.2):
  // a data-authoring concern independent of chart_type/rendering, so this
  // runs for every chart_type, not just bar/line — `chart-model.ts`'s
  // `buildChartModel` flags any category value repeated within one series
  // (kept: first occurrence, dropped: the rest) as part of bar/line's own
  // dedup rule, but the underlying "did the author accidentally repeat a
  // category label" question is exactly as real for pie/funnel/dumbbell,
  // which don't dedupe at render time at all (e.g. two same-labeled pie
  // wedges silently split one category's value across two slices — an
  // even easier authoring slip to miss than bar/line's clean "first wins").
  // Global Constraint 2 (roadmap): duplicate x is a data-quality question,
  // not a structural one — warn, never a schema-level hard error, and never
  // blocks `ok` (severity "warn" only).
  for (const component of slide.components) {
    if (component.type !== "chart") continue
    const { duplicates } = buildChartModel(component.series)
    for (const dup of duplicates) {
      issues.push({
        slide: index,
        severity: "warn",
        code: "chart_duplicate_category",
        message: `图表系列 "${dup.seriesName}" 存在重复分类 "${dup.x}"，仅保留首次出现的取值，其余将被忽略`,
        chartDuplicateCategory: { seriesName: dup.seriesName, x: dup.x },
      })
    }
  }

  // chart_line_too_many_series: dataviz's 8-series ceiling
  // (`CAPACITY.chart.lineSeriesAdvisoryMax`). A line chart past that is
  // still legal IR and still renders — the legend's "+N …" drop is an
  // authoring problem, not a renderer rescue. Warn only, never a hard
  // error. Bar/area/scatter keep their own series count (grouped bars
  // and scatter groups do not share this hairball).
  for (const component of slide.components) {
    if (component.type !== "chart" || component.chart_type !== "line") continue
    if (component.series.length > CAPACITY.chart.lineSeriesAdvisoryMax) {
      issues.push({
        slide: index,
        severity: "warn",
        code: "chart_line_too_many_series",
        message: `折线图系列数过多（>${CAPACITY.chart.lineSeriesAdvisoryMax}），建议拆分或归并`,
      })
    }
  }

  // data_table_missing_cell (R1 evidence wave, Task T3 — the plan's
  // lenient-revision contract): `cells` has no length floor per row, so a
  // row omitting one of `columns`' declared keys is schema-legal —
  // data-table.tsx renders that cell empty rather than erroring (an *extra*
  // key not declared in any column, by contrast, is a schema-level hard
  // error — see data-table.ts's own superRefine, the strict-structural-
  // misunderstanding half of the same contract). This is the pre-render
  // advisory for the lenient half: name the exact row index and missing key
  // so the content gap is visible before the deck ships, the same
  // "structural leniency, editorial visibility" split chart_duplicate_category
  // (T2) established for a different component.
  for (const component of slide.components) {
    if (component.type !== "data_table") continue
    component.rows.forEach((row, ri) => {
      for (const col of component.columns) {
        if (row.cells[col.key] === undefined) {
          issues.push({
            slide: index,
            severity: "warn",
            code: "data_table_missing_cell",
            message: `数据表第 ${ri} 行缺少列 "${col.key}" 的取值，该单元格将渲染为空`,
            dataTableMissingCell: { rowIndex: ri, key: col.key },
          })
        }
      }
    })
  }

  // missing heading — cover / chapter / content (skip background-image-only pages)
  const needsHeading: Slide["type"][] = ["cover", "chapter", "content"]
  if (
    needsHeading.includes(slide.type) &&
    !slide.heading &&
    !isBackgroundImageOnly(slide)
  ) {
    issues.push({
      slide: index,
      severity: "warn",
      code: "missing_heading",
      message: "此页缺少标题",
    })
  }

  // big_number arrangement without kpi_cards component
  if (slide.arrangement === "big_number" && !hasKpiCardsComponent(slide)) {
    issues.push({
      slide: index,
      severity: "warn",
      code: "big_number_no_kpi",
      message: "big_number 版式缺少 kpi_cards 块",
    })
  }

  return issues
}

// ── entry ──

/**
 * `resolvedAxes` (threaded W3 task 2, consumed by task 3) carries the
 * caller's already-resolved {@link NarrativeProfile} (spec §5) for the
 * narrative-aware density/bullets thresholds in {@link checkSlide} — density
 * reads `resolvedAxes.pacing`'s editorial budget and mixes in the
 * resolved layout's geometric capacity (spec §5's dual-attribute capacity
 * split), bullets reads the same pacing's bullets budget. `api.ts`'s
 * `validateIr` resolves narrative for its own error handling and passes the
 * result through here so there is exactly one `resolveNarrative` call per
 * validate pass. Defaults to the `general` preset's axes so this file's own
 * single-argument test call sites keep compiling and behave the same as
 * every other caller that hasn't resolved a narrative of its own.
 */
export function checkIrQuality(
  ir: PptxIR,
  resolvedAxes: NarrativeProfile = resolveNarrative(undefined),
): QualityIssue[] {
  const issues: QualityIssue[] = []

  // empty deck
  if (ir.slides.length === 0) {
    issues.push({
      slide: 0,
      severity: "error",
      code: "empty_deck",
      message: "演示文稿不包含任何页面",
    })
    return issues
  }

  for (let i = 0; i < ir.slides.length; i++) {
    // placeholder 页（W5 assemble 对未填充页生成）无内容可判——跳过全部
    // 内容规则（missing_heading/density/bullets_overflow 等），schema 校验
    // 仍照常在 validateIr 里跑。
    if (ir.slides[i].placeholder) continue
    issues.push(...checkSlide(ir, ir.slides[i], i, resolvedAxes))
  }

  return issues
}
