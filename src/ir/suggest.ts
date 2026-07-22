/**
 * Nearest-neighbor "did you mean" string suggestion — a small, dependency-free
 * edit-distance utility used only by schema error messages (borrow wave, task
 * 3: `./schema-error-hints.ts`) to turn a large zod enum/discriminator
 * mismatch into a pointed suggestion instead of the full candidate list
 * flattened into the message (a 1750-icon enum's default zod error is 24,910
 * chars for one real typo — see the borrow-wave B report §3.3 #1). Never used
 * on a render/validate hot path — only when a value has already failed
 * validation, so there is no performance budget to protect here beyond "does
 * not noticeably slow down an already-failing parse" — see
 * {@link closestMatch}'s own doc comment for the one place that budget still
 * needs an explicit guard (an adversarial/garbage-length input value).
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
 * close enough to be a plausible typo rather than an unrelated guess, or when
 * `input` is absurdly longer than every candidate (review fix — High:
 * reviewer measured 483ms for a 5000-char garbage `input` against the real
 * icon list, because the old code ran the full O(n·m) distance search
 * against every candidate regardless of how implausible a match already was
 * from the length alone). Passes, cheapest/most-confident first:
 *
 * 0. **Adversarial-length bail-out** — an `input` longer than 2x the longest
 *    candidate can never be a near-miss of anything in `candidates`: its
 *    Levenshtein distance to *any* candidate is at least
 *    `input.length - candidate.length`, already past any threshold this
 *    module would ever accept. This is a pure performance optimization, not
 *    a behavior change — the full search below could never have returned a
 *    match past this length anyway — but skipping it outright avoids the
 *    O(n·m) cost entirely rather than paying it just to conclude "no match".
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
 * Deliberately a linear scan over `candidates` (no index/trie) for the passes
 * that do scan — this only ever runs once, after a value has already failed
 * validation, against at most a couple thousand short strings (once the
 * adversarial-length bail-out has ruled out the pathological case); building
 * and maintaining an index would cost more than the scan it replaces.
 */
export function closestMatch(input: string, candidates: readonly string[]): string | undefined {
  const longestCandidateLength = candidates.reduce((max, c) => Math.max(max, c.length), 0)
  // A length this far past every candidate can never equal one (skips the
  // exact-match check below too) and can never land within any distance
  // threshold this module would accept — bail before any O(n) or O(n·m) pass
  // runs at all.
  if (input.length > longestCandidateLength * 2) return undefined
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
