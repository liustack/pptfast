/**
 * PPTX IR quality gate (E3): detect content-layout issues and return
 * structured warnings so the UI can surface them after generation.
 *
 * Pure function, no side-effects, never throws.
 */

import type { PptxIR, Slide } from "@/ir"
import { PACING_BUDGETS, resolveNarrative, type NarrativeProfile, type Pacing } from "@/narrative"
import { CAPACITY } from "./audit/capacity"
import { resolveEffectiveLayoutBodyCapacity } from "./effective-layout"
import { measureTextUnits } from "../lib/svg-text-layout"

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
 * comment for the per-type rationale (pie is radial with no axes at all —
 * funnel/dumbbell have a value axis but no plot-box gridline surface to
 * anchor a title against).
 */
const AXES_APPLICABLE_CHART_TYPES: ReadonlySet<string> = new Set(["bar", "line"])

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
  //   (bullets.tsx's MIN_FONT=14) shared by every archetype. Headings
  //   have no equivalent single floor — `fitHeadingLines`'s `minPt`
  //   ranges from 22 (content-banner-heading.tsx,
  //   content-tone-adaptive-content.tsx) to 72 (cover-fashion-
  //   masthead.tsx) depending on archetype, so one global units ceiling
  //   would either under-protect the tightest archetypes or
  //   false-positive on the roomiest ones. Deriving per-archetype-family
  //   minPt buckets is the likely path, not attempted here.
  // The other reason this analysis originally cited — no render-time
  // visibility to back a threshold — is closed (truncation-visibility
  // wave, Task 2): `SvgTextLayout` (src/lib/svg-text-layout.ts) now
  // carries a `truncated` field, `fitHeadingLines` sets it `true` on its
  // `truncateToUnits` fallback, and every archetype's heading `<text>`
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
  // (`./effective-layout`) — the exact selection path `FullSlideSvg` renders
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
      message: `图表类型 "${component.chart_type}" 不支持坐标轴标题/网格线，axes 字段将被忽略（仅 bar 与 line 支持）`,
      chartAxesIgnored: { chartType: component.chart_type },
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
