/**
 * Shared KPI value parsing for donut_trio (ratio → arc) and bubble_row
 * (magnitude → radius and sort). No IR fields are added: both forms read
 * the existing `value` / `unit` strings.
 */

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

/** Strip grouping commas, then parseFloat. `%` is left in place so
 *  parseFloat still reads the leading number (`"86%" → 86`). */
export function parseKpiNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, "").trim()
  if (cleaned === "") return null
  const n = Number.parseFloat(cleaned)
  if (Number.isFinite(n)) return n
  const m = cleaned.match(/[-+]?\d+(?:\.\d+)?/)
  if (!m) return null
  const fallback = Number.parseFloat(m[0])
  return Number.isFinite(fallback) ? fallback : null
}

/**
 * Completion ratio in `[0, 1]`, or `null` when this value is not a rate
 * (so the donut draws the track and the raw value, but no progress arc).
 *
 * 1. parseFloat after stripping commas.
 * 2. `value` contains `%` or `unit` is `%` → n/100, clamp 0..1.
 * 3. else 0≤n≤1 → n, 1<n≤100 → n/100, n>100 → null (`"128 台"` is a count).
 */
export function parseKpiRatio(value: string, unit?: string): number | null {
  const n = parseKpiNumber(value)
  if (n === null) return null
  const percent = value.includes("%") || unit?.trim() === "%"
  if (percent) return clamp01(n / 100)
  if (n >= 0 && n <= 1) return n
  if (n > 1 && n <= 100) return n / 100
  return null
}

/** Sort/radius magnitude. `"92%" → 92`, `"128" → 128`. Unparseable → null. */
export function parseKpiMagnitude(value: string): number | null {
  return parseKpiNumber(value)
}
