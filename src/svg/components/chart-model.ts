import type { ChartSeries } from "@/ir"

/**
 * Chart data normalization layer (R1 evidence wave, Task T1 — roadmap
 * §6.1.2). Pure data module: no React, no rendering, no coordinates, no
 * imports from `chart-svg.tsx` (that file imports FROM this one, not the
 * other way — wired in Task T2). This module exists to fix two confirmed
 * multi-series defects without touching a single pixel:
 *
 *  - `chart-svg.tsx`'s `renderBar` reads only `series[0]?.data` — every
 *    other series is silently dropped from the drawn output (though its
 *    values already leak into the domain's `max`, since that line's own
 *    `series.flatMap(...)` already scans every series — see this module's
 *    "single-series identity" doc block below for why that particular
 *    asymmetry doesn't affect single-series callers).
 *  - `renderLine` computes a *per-series* max (`Math.max(...s.data.map(...),
 *    1)` inside its own `series.map` callback) — multi-series lines have no
 *    shared comparison scale, so two series' magnitudes aren't visually
 *    comparable.
 *
 * `buildChartModel` below is the single entry point: category union,
 * per-series aligned value arrays, a shared value domain, a duplicate-x
 * report, and a legend entry list. Every other export is a small, focused
 * piece of that (a key builder, a domain-derived helper) kept public
 * because Task T2 (and `ir-quality.ts`'s future duplicate-category warning)
 * needs it directly, not because this module wants a wide surface.
 *
 * **Byte-compat contract (Global Constraint 1)**: a single positive series
 * (no negative values, one series only) must produce a domain numerically
 * identical to what `renderBar`/`renderLine` compute today. See
 * `chart-model.test.ts`'s "single-series identity" suite for the exact
 * source lines replicated and why the replication is exact, not
 * approximate.
 */

// ── category keys ──

/**
 * Opaque, stable identity for one chart x value. Two x's are the "same
 * category" iff they produce the same key.
 *
 * Encodes both the value and its original JS type: `x: "1"` (string) and
 * `x: 1` (number) are legal sibling inputs under the IR schema
 * (`src/ir/components/chart.ts`'s `z.union([z.string(), z.number()])`) and
 * must NOT collapse into one category — a deck author who mixes numeric
 * codes and free-text labels across series would otherwise see their data
 * silently merged. The type tag is a fixed prefix (`"s:"` / `"n:"`) that the
 * raw value can never reproduce across the type boundary — a string can
 * begin with literally any text, including `"n:5"`, but `categoryKeyOf("n:5")`
 * still differs from `categoryKeyOf(5)` (`"s:n:5"` vs `"n:5"`) because the
 * prefix each starts with is what's compared, not a substring search.
 *
 * `-0` and `0` intentionally collapse to the same key (`String(-0) ===
 * "0"`) — no chart author distinguishes negative zero as its own category.
 */
export type CategoryKey = string

/**
 * Builds a category's {@link CategoryKey} from a raw chart x value. Pure and
 * deterministic: same `(value, type)` pair always yields the same string.
 */
export function categoryKeyOf(x: string | number): CategoryKey {
  return typeof x === "number" ? `n:${x}` : `s:${x}`
}

/**
 * One category in the union's established order, alongside the original x
 * value it was first seen with (verbatim — same runtime type as the source
 * data point, so a renderer can `String(x)` it for a label exactly as
 * `chart-svg.tsx`'s own `fitSvgLine(String(d.x), ...)` call sites do today).
 */
export type ChartCategory = {
  key: CategoryKey
  x: string | number
}

// ── per-series alignment ──

/**
 * One input series, re-expressed against the shared category union:
 * `values[i]` is this series' value for `categories[i]` (same index, same
 * length as `ChartModel.categories`).
 *
 * `null` is the explicit missing-cell marker for a category this series has
 * no data point for — a deliberate sentinel, not `undefined`, so it
 * survives a JSON round-trip and reads as "no value here" rather than
 * "field omitted". This model does not decide how a missing cell renders
 * (bar leaves a gap, line breaks the polyline) — that interpretation is
 * `chart-svg.tsx`'s (Task T2), this layer only marks the gap.
 */
export type AlignedSeries = {
  /** Verbatim `ChartSeries.name`. */
  name: string
  /** 0-based position in the original `series` array passed to
   * {@link buildChartModel} — the join key back to that source series and
   * to this series' own entry in `ChartModel.legend`. */
  seriesIndex: number
  /** Aligned to `ChartModel.categories`, same order, same length. */
  values: (number | null)[]
}

// ── duplicates ──

/**
 * One run of repeated x-keys inside a single series' own `data` array.
 * There is exactly one `ChartDuplicate` per `(seriesIndex, key)` pair that
 * recurred — never one per repeat occurrence — so a key repeated 3x in one
 * series produces one entry with `droppedAt.length === 2`.
 *
 * This is pure surfaced data: {@link buildChartModel} itself never warns or
 * throws on a duplicate (Global Constraint 2 — a parseable input must never
 * become a hard error here). Task T2 wires this list into `ir-quality.ts`
 * as an editorial-severity warning.
 */
export type ChartDuplicate = {
  seriesIndex: number
  seriesName: string
  key: CategoryKey
  /** The category's x value, exactly as first seen (same value the kept
   * occurrence carries — by construction every occurrence sharing `key`
   * has this same value and type). */
  x: string | number
  /** 0-based index into this series' own `data` array of the occurrence
   * that was kept — always the first, matching current render semantics
   * (`chart-svg.tsx` already just walks `data` positionally; "first wins"
   * is what that iteration order already implies). */
  keptAt: number
  /** 0-based indices into this series' own `data` array of every
   * occurrence after the first. These values were dropped from
   * `AlignedSeries.values`. */
  droppedAt: number[]
}

// ── shared domain ──

/**
 * The value-axis domain shared by every series (bar and line both use this
 * same rule — roadmap §6.1.2). `min`/`max` always satisfy `min <= 0 <= max`
 * ("the domain always includes zero") and `max > min` strictly (never
 * degenerate as *numbers* — see `degenerate` below for what that flag
 * means instead).
 */
export type ChartDomain = {
  min: number
  max: number
  /**
   * `true` exactly when every contributing value (across all series, after
   * duplicate-x dedup) is exactly `0`, or no series carries any data at all.
   * In that case `[min, max]` is `[0, 1]` — a deterministic expansion, not
   * data-derived — so a renderer dividing by `(max - min)` never divides by
   * zero and never draws a zero-height plot. `false` means `[min, max]`
   * reflects real data range (the deterministic `max >= 1` floor may still
   * be active — see {@link buildChartModel}'s doc comment on
   * `computeChartDomain` — but at least one real value was non-zero).
   */
  degenerate: boolean
}

/**
 * Fractional position of the value-`0` baseline within `[domain.min,
 * domain.max]`, e.g. `0` when the domain is positive-only (baseline sits at
 * the domain's own low edge) and `1` when it's negative-only (baseline sits
 * at the high edge). Always finite and well-defined for any `ChartDomain`
 * {@link buildChartModel} can produce, since that domain always satisfies
 * `min <= 0 <= max` and `max > min` strictly (no divide-by-zero).
 *
 * Purely a convenience — every input needed is already on `ChartDomain`, so
 * a caller could compute this inline. Exported because Task T2 needs this
 * exact fraction for both bar (baseline y for mixed-sign bars) and line
 * (baseline y for the area-fill polygon) and re-deriving the same formula
 * twice invites drift.
 */
export function zeroAxisRatio(domain: ChartDomain): number {
  return (0 - domain.min) / (domain.max - domain.min)
}

// ── legend ──

/**
 * One legend entry per input series, in input order — the legend does not
 * reorder, dedup, or drop series; it is a direct mirror of `ChartModel.series`
 * restricted to what a legend UI needs (name + color).
 *
 * **Render-time boundary (documented per Task T1's contract)**: this model
 * deliberately does NOT decide per-entry truncation or an overload "+N
 * more" drop. Both require knowing the legend's available pixel width,
 * which this pure data module never receives (no `w`/`h`, no theme, no
 * font metrics) — `chart.tsx` lays the list out as a right-aligned header
 * row (label-tuning A, 2026-08), measuring each `name` with `fitSvgLine`
 * against its own slot. This module's contribution is only the ordered,
 * complete list to fit against.
 */
export type LegendEntry = {
  seriesIndex: number
  name: string
  /**
   * Pre-modulo palette position — always equal to `seriesIndex`. Mirrors
   * `chart-svg.tsx`'s existing legend-adjacent color pick,
   * `palette[sIdx % palette.length]` (`renderLine`, current source
   * ~line 360), and `chart-palette.ts`'s `rotateChartPalette`/
   * `chartPaletteOffset` mechanism that already produces the `palette`
   * array `chart.tsx`'s `render()` passes down. This module never sees a
   * palette (no color/theme concept at all — pure series data), so the
   * modulo-by-length step stays with whichever caller actually holds
   * `palette.length`, precisely as it does today.
   */
  colorIndex: number
}

// ── the model ──

/**
 * Full normalized shape for one chart's `series` array. See this file's
 * header comment for the two defects this exists to fix, and
 * `chart-model.test.ts` for the byte-compat evidence.
 */
export type ChartModel = {
  categories: ChartCategory[]
  series: AlignedSeries[]
  domain: ChartDomain
  duplicates: ChartDuplicate[]
  legend: LegendEntry[]
}

/**
 * `[min, max]` for a flat list of already-deduped, already-aligned values
 * (i.e. `AlignedSeries.values` with `null`s filtered out, across every
 * series) — the "kept" values, matching exactly what a renderer will
 * actually draw. A dropped duplicate's value never reaches this function,
 * so it can never inflate or shrink the domain (see `chart-model.test.ts`'s
 * "a dropped duplicate's value does not inflate the domain" case).
 *
 * `max` is unconditionally floored at `1` — not only when the domain would
 * otherwise be degenerate. This isn't a simplification of "expand only
 * when needed"; it's an exact replication of the current renderers' own
 * `Math.max(...values, 1)` formula (`chart-svg.tsx` `renderBar`/`renderLine`,
 * see `chart-model.test.ts`'s cited lines), which floors the divisor at 1
 * even when the real max is a positive value below 1 (e.g. a series of
 * `[0.5, 0.3]` shares — real max 0.5, but the renderer already divides by
 * 1 today, not 0.5). Diverging from that here would silently rescale every
 * sub-1-max single-series chart the moment Task T2 wires this in.
 *
 * `min` is `Math.min(0, ...values)` — never floored — so an all-negative
 * or mixed-sign input still gets its true low edge. Because `max`'s floor
 * is unconditional, `max >= 1 > 0 >= min` always holds: `[min, max]` can
 * never collapse to a single point, so no caller of this module needs its
 * own divide-by-zero guard downstream.
 */
function computeChartDomain(values: readonly number[]): ChartDomain {
  const rawMax = Math.max(0, ...values)
  const rawMin = Math.min(0, ...values)
  return { min: rawMin, max: Math.max(rawMax, 1), degenerate: rawMax === 0 && rawMin === 0 }
}

/**
 * Normalizes a chart's raw `series` (IR `ChartSeries[]`, e.g.
 * `component.series` off the `chart` IR component) into a {@link ChartModel}:
 * a shared category union, per-series value arrays aligned to that union,
 * a shared value domain, a duplicate-x report, and a legend entry list.
 *
 * Pure function of its input — same `series` (by value, not by reference)
 * always produces a deep-equal `ChartModel`, and `series` is never mutated.
 * Ordering is fully determined by input order (series order, then each
 * series' own `data` order); the one internal `Map` (`categoryIndexByKey`)
 * is only ever inserted into in that same deterministic order and iterated
 * via a parallel `categories` array, not via `Map` iteration, so there is
 * no reliance on `Map`/object key reordering hazards (see `categoryKeyOf`'s
 * doc comment — even if iterated directly, a `Map`'s insertion order is
 * spec-guaranteed, unlike a plain object's integer-like string keys).
 *
 * Rules implemented (roadmap §6.1.2):
 * 1. **Category union** — the first series' x order establishes the
 *    category order; each later series appends only the x's it introduces
 *    that no earlier series (or its own earlier points) already did, in
 *    that series' own encounter order.
 * 2. **Duplicate x within one series** — the first occurrence's value is
 *    kept (matches `chart-svg.tsx`'s current positional-walk render
 *    semantics); every later occurrence in that same series is dropped
 *    from `AlignedSeries.values` and reported in `duplicates`.
 * 3. **Shared domain** — one `[min, max]` across every series' kept values,
 *    always including zero; see {@link computeChartDomain}'s own doc
 *    comment for the exact formula and its byte-compat rationale.
 * 4. **Legend** — one entry per input series, in input order; see
 *    {@link LegendEntry}'s doc comment for the render-time boundary this
 *    deliberately stays on the near side of.
 */
export function buildChartModel(series: ChartSeries[]): ChartModel {
  const categories: ChartCategory[] = []
  const categoryIndexByKey = new Map<CategoryKey, number>()
  const duplicates: ChartDuplicate[] = []
  // Index-aligned with `series` — perSeriesFirstValue[sIdx] holds series
  // sIdx's own first-occurrence-per-key values, consulted below once the
  // full category union (across every series) is final.
  const perSeriesFirstValue: Map<CategoryKey, number>[] = []

  for (let sIdx = 0; sIdx < series.length; sIdx++) {
    const s = series[sIdx]!
    const firstValueByKey = new Map<CategoryKey, number>()
    const keptAtByKey = new Map<CategoryKey, number>()
    const droppedAtByKey = new Map<CategoryKey, number[]>()

    for (let i = 0; i < s.data.length; i++) {
      const point = s.data[i]!
      const key = categoryKeyOf(point.x)
      if (!categoryIndexByKey.has(key)) {
        categoryIndexByKey.set(key, categories.length)
        categories.push({ key, x: point.x })
      }
      if (firstValueByKey.has(key)) {
        const dropped = droppedAtByKey.get(key)
        if (dropped) dropped.push(i)
        else droppedAtByKey.set(key, [i])
      } else {
        firstValueByKey.set(key, point.y)
        keptAtByKey.set(key, i)
      }
    }

    perSeriesFirstValue.push(firstValueByKey)

    for (const [key, droppedAt] of droppedAtByKey) {
      const keptAt = keptAtByKey.get(key)!
      duplicates.push({
        seriesIndex: sIdx,
        seriesName: s.name,
        key,
        x: s.data[keptAt]!.x,
        keptAt,
        droppedAt,
      })
    }
  }

  const alignedSeries: AlignedSeries[] = series.map((s, sIdx) => ({
    name: s.name,
    seriesIndex: sIdx,
    values: categories.map((c) => perSeriesFirstValue[sIdx]!.get(c.key) ?? null),
  }))

  const legend: LegendEntry[] = series.map((s, sIdx) => ({
    seriesIndex: sIdx,
    name: s.name,
    colorIndex: sIdx,
  }))

  const kept: number[] = []
  for (const aligned of alignedSeries) {
    for (const v of aligned.values) {
      if (v !== null) kept.push(v)
    }
  }

  return { categories, series: alignedSeries, domain: computeChartDomain(kept), duplicates, legend }
}
