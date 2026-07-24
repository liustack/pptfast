/**
 * Chart palette phase rotation (P1 variety wave, task 2 — C4 in the
 * diversity deep-review: chart series color was "全库唯二完全不吃 seed 的
 * 视觉元素" alongside motif, see `./motif-selection.ts`'s own header for the
 * other half). Before this task, `ctx.colors.chartPalette` was always the
 * theme's own token array in its declared order — any two decks built in
 * the same theme drew series 0 in the exact same color, series 1 in the
 * exact same second color, forever (`chart-svg.tsx`'s renderers all index it
 * `palette[i % palette.length]`, `i` walking the series/category array
 * position, never seed-aware). This module rotates the *whole deck's*
 * starting point into that array by a seed-derived offset — a pure cyclic
 * shift, so series-to-series relative order (and therefore multi-series
 * readability — series 2 is always exactly two steps around the palette
 * from series 0, whichever color that lands on) is completely unaffected;
 * only which color a given series *index* lands on changes between decks.
 *
 * Deliberately deck-scoped, not page-scoped (unlike motif rotation in
 * `./motif-selection.ts`): the plan's own framing is "different decks
 * rotate series colors while one deck stays internally deterministic" —
 * every chart across one deck should agree on the same color assignment for
 * a given series index, so a reader can learn "series 2 is this color" once
 * on page 3 and have it still hold on page 7. `full-slide-svg.tsx` computes
 * the offset once per render off `cachedDeckSeed(ir)` alone (no pageKey), so
 * every chart on every page of one deck shares the identical rotated
 * palette — contrast this with motif's per-page pageKey salt.
 *
 * **Consumption seam (review fix round, Major finding — moved here from
 * `buildCtx` itself)**: `rotateChartPalette` is called from exactly one
 * place, `components/chart.tsx`'s own `render`, on `ctx.colors.chartPalette`
 * combined with `ctx.chartPaletteOffset` (`ComponentCtx.chartPaletteOffset`'s
 * own doc comment has the full story). `ctx.colors.chartPalette` itself is
 * **never** rotated — an earlier version of this task rotated it in place
 * inside `buildCtx`, which silently leaked into every other reader of that
 * same token: `campaign-motif`/`classroom-motif`/`bloom-motif` all
 * destructure `ctx.colors.chartPalette` by fixed position for their own
 * decorative fills (unrelated to any chart), so a motif's decoration color
 * drifted with the chart phase — campaign (a settled 1-member motif
 * candidate set that must render byte-identically across every seed)
 * differed across seeds purely from this leak. Only the chart component
 * opts into rotation; every other `ctx.colors.chartPalette` reader still
 * sees exactly the theme's own declared order, unconditionally.
 *
 * Contrast safety: no chart renderer in `chart-svg.tsx` derives any
 * `<text>` fill from `palette[i]` — every label reads a fixed theme token
 * (`ctx.colors.text`/`muted`/`accent`, never the palette array itself; the
 * one exception, `renderBar`'s tallest-bar highlight, reads `accentColor`
 * directly, also not the palette). Rotating the palette's phase therefore
 * cannot change any text-contrast decision — verified by inspection of
 * every `palette[...]` read site in `chart-svg.tsx`, not merely assumed
 * (P1 task 2 report records the file/line evidence).
 */
import { pickBySeed } from "./variety"

/**
 * Cyclic left-rotation: `result[0] === palette[offset % palette.length]`
 * (negative offsets wrap correctly too — `((offset % n) + n) % n`). An
 * `offset` that's a multiple of `palette.length` (including `0`) — or an
 * empty `palette` — returns a same-*values* copy: the identity rotation,
 * never the same array *reference*, so a caller can always safely treat the
 * return value as a fresh array without special-casing "did rotation
 * actually happen".
 */
export function rotateChartPalette(palette: readonly string[], offset: number): string[] {
  if (palette.length === 0) return [...palette]
  const n = ((offset % palette.length) + palette.length) % palette.length
  return [...palette.slice(n), ...palette.slice(0, n)]
}

/**
 * Seed-derived starting offset into a `paletteLength`-sized palette — a
 * uniform pick among `[0, paletteLength)` via `variety.ts`'s own
 * `pickBySeed` (avalanche-hashed, not a raw `seed % paletteLength` — see
 * that module's own header comment on why a raw modulo of an unhashed djb2
 * value can carry low-bit bias). Salt is a fixed literal, not
 * pageKey-scoped (see this module's own header) — the whole point is one
 * shared phase per deck, not a per-page value.
 */
export function resolveChartPaletteOffset(seed: number, paletteLength: number): number {
  if (paletteLength <= 0) return 0
  return pickBySeed(seed, "chart-palette-offset", Array.from({ length: paletteLength }, (_, i) => i))
}
