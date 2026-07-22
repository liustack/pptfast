/**
 * Nearest-neighbor "did you mean" string suggestion — a small, dependency-free
 * edit-distance utility used only by schema error messages (borrow wave, task
 * 3: `./schema-error-hints.ts`) to turn a large zod enum/discriminator
 * mismatch into a pointed suggestion instead of the full candidate list
 * flattened into the message (a 1750-icon enum's default zod error is 24,910
 * chars for one real typo — see the borrow-wave B report §3.3 #1). Never used
 * on a render/validate hot path — only when a value has already failed
 * validation, so there is no performance budget to protect here beyond "does
 * not noticeably slow down an already-failing parse".
 */

/**
 * Classic Levenshtein (insert/delete/substitute, each cost 1) edit distance.
 * Iterative two-row DP: O(a.length * b.length) time, O(b.length) space.
 * Intentionally the plain metric, not Damerau-Levenshtein (adjacent
 * transposition as a single edit) — {@link closestMatch}'s separate
 * token-reorder pass below already covers the one transposition shape that
 * matters for this codebase's kebab/snake-case enum values (whole words
 * swapped, not adjacent letters), so a fancier per-character metric would
 * add cost without covering a case this module actually needs.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prevRow: number[] = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prevRow[j] = j
  for (let i = 1; i <= a.length; i++) {
    const currRow: number[] = new Array(b.length + 1)
    currRow[0] = i
    for (let j = 1; j <= b.length; j++) {
      currRow[j] =
        a[i - 1] === b[j - 1]
          ? prevRow[j - 1]!
          : 1 + Math.min(prevRow[j]!, currRow[j - 1]!, prevRow[j - 1]!)
    }
    prevRow = currRow
  }
  return prevRow[b.length]!
}

/** Split a kebab/snake-case identifier into its lowercase word tokens, sorted for order-independent comparison. */
function sortedTokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[-_]/)
    .filter(Boolean)
    .sort()
}

function sameTokens(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i])
}

/**
 * How many edits still count as "plausibly the same word, just mistyped" —
 * scales with the longer string so a short candidate doesn't get suggested
 * for a wildly different short input, and a long candidate still tolerates a
 * couple of real typos.
 */
function typoThreshold(len: number): number {
  return Math.max(2, Math.ceil(len * 0.34))
}

/**
 * Nearest match to `input` among `candidates`, or `undefined` when nothing is
 * close enough to be a plausible typo rather than an unrelated guess. Two
 * passes, cheapest/most-confident first:
 *
 * 1. **Word-reorder match** — `input`'s hyphen/underscore-separated words,
 *    sorted, exactly match a candidate's own sorted words. Catches the
 *    canonical weak-model icon slip this was written for: guessing
 *    `"check-circle"` for the real lucide name `"circle-check"` — a 12/12
 *    character pair with Levenshtein distance 8 (see this module's test
 *    file), too far apart for {@link levenshteinDistance} alone to catch, but
 *    an exact same-words-reordered match is an even stronger typo signal
 *    than a raw edit-distance threshold would be. Accepted unconditionally
 *    (no distance gate) — reordering the exact same words is essentially
 *    never a coincidence at this candidate-list scale.
 * 2. **Edit-distance match** — the candidate with the smallest
 *    {@link levenshteinDistance} to `input`, accepted only when that distance
 *    is within {@link typoThreshold} of the longer string's length (catches
 *    e.g. `"kpi_card"` for `"kpi_cards"`, distance 1).
 *
 * Deliberately a linear scan over `candidates` (no index/trie) — this only
 * ever runs once, after a value has already failed validation, against at
 * most a couple thousand short strings; building and maintaining an index
 * would cost more than the scan it replaces.
 */
export function closestMatch(input: string, candidates: readonly string[]): string | undefined {
  if (candidates.includes(input)) return input // exact match is never the caller's actual failure mode, but stay correct if it happens
  const inputTokens = sortedTokens(input)
  if (inputTokens.length > 1) {
    const reordered = candidates.find((c) => sameTokens(sortedTokens(c), inputTokens))
    if (reordered) return reordered
  }
  let best: string | undefined
  let bestDistance = Infinity
  for (const candidate of candidates) {
    const distance = levenshteinDistance(input, candidate)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  if (best === undefined) return undefined
  return bestDistance <= typoThreshold(Math.max(input.length, best.length)) ? best : undefined
}
