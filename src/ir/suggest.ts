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
 * How many edits still count as "plausibly the same word, just mistyped",
 * relative to the *input*'s own length (review fix — a threshold keyed off
 * `max(input, candidate)` let a short-but-wrong candidate's own length pull
 * the bound up — keying off `input` alone is the tighter, more defensible
 * reading of "small relative to what the author actually typed"). `floor` not
 * `ceil` — a stricter cutoff than the pre-review version, deliberately, to
 * stop matching things like `"arrow"` (5 chars, threshold 2) against an
 * unrelated 6-8 edit candidate the way `ceil(len * 0.34)` used to permit;
 * {@link closestMatch}'s prefix pass below is what correctly resolves
 * `"arrow"` now, not a looser distance threshold.
 */
function typoThreshold(inputLength: number): number {
  return Math.max(2, Math.floor(inputLength / 3))
}

/**
 * Word-boundary-aware prefix match in either direction: `input` is a stem of
 * `candidate` (`"arrow"` → `"arrow-down"`) or `candidate` is a stem of
 * `input` (a model that appended an extra word). Boundary-aware so
 * `"arrow"` matches `"arrow-down"` but not an unrelated candidate that merely
 * happens to start with the same letters with no separator following. Among
 * every match, the shortest candidate wins (the least-elaborated, most
 * "base" concept a short/stem-like input most plausibly meant), ties broken
 * alphabetically for determinism.
 */
function prefixMatch(input: string, candidates: readonly string[]): string | undefined {
  const lower = input.toLowerCase()
  const matches = candidates.filter((c) => {
    const cl = c.toLowerCase()
    if (cl === lower) return false // exact match is handled by closestMatch's own early return, never reaches here
    if (cl.startsWith(lower) && (cl.length === lower.length || cl[lower.length] === "-")) return true
    if (lower.startsWith(cl) && (lower.length === cl.length || lower[cl.length] === "-")) return true
    return false
  })
  if (matches.length === 0) return undefined
  return matches.sort((a, b) => a.length - b.length || a.localeCompare(b))[0]
}

/**
 * Nearest match to `input` among `candidates`, or `undefined` when nothing is
 * close enough to be a plausible typo rather than an unrelated guess — or
 * when `input` doesn't carry enough signal to plausibly suggest anything
 * (empty/whitespace-only, or absurdly longer than every candidate). Passes,
 * cheapest/most-confident first:
 *
 * 0. **Bail-outs** (review fix — reviewer-supplied adversarial cases):
 *    whitespace-only `input` never gets a suggestion (an empty guess isn't a
 *    typo of anything in particular — the pre-fix code let `""` "match" a
 *    single-character candidate purely because the distance happened to
 *    clear the old, looser threshold). An `input` longer than 2x the longest
 *    candidate can never be a near-miss of anything in `candidates` — its
 *    Levenshtein distance to *any* candidate is at least
 *    `input.length - candidate.length`, already past any threshold this
 *    module would ever accept — so the whole search (including the O(n·m)
 *    distance pass below) is skipped outright rather than merely producing
 *    "no suggestion" the slow way. This is the fix for a reviewer-measured
 *    483ms call against a 5000-char garbage input.
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
 * 2. **Single-edit match** — a candidate at Levenshtein distance exactly 1
 *    wins outright. One slipped key is the strongest typo signal short of a
 *    word reorder: `"circle-chek"` must suggest `"circle-check"` (distance
 *    1), not its own stem `"circle"` — which is why this pass runs before
 *    the prefix pass, not after it.
 * 3. **Prefix match** ({@link prefixMatch}, review fix) — `input` is a
 *    plausible stem/truncation of a real candidate, or vice versa. Runs
 *    before the multi-edit distance pass because a clean word-boundary stem
 *    is a stronger signal than a distance of 2 or more: `"arrow"` is a stem
 *    of many real `arrow-*` icons, but its nearest candidate *by raw
 *    distance alone* is the unrelated `"carrot"` at distance 2 (the
 *    reviewer's case) — checking stems before multi-edit distance means
 *    that pass never gets a chance to make that mistake.
 * 4. **Edit-distance match** — the candidate with the smallest
 *    {@link levenshteinDistance} to `input`, accepted only when that distance
 *    is within {@link typoThreshold} of `input`'s own length.
 *
 * Deliberately a linear scan over `candidates` (no index/trie) for the
 * passes that do scan — this only ever runs once, after a value has already
 * failed validation, against at most a couple thousand short strings (once
 * bail-out 0 has ruled out the pathological-input-length case) — building and
 * maintaining an index would cost more than the scan it replaces.
 */
export function closestMatch(input: string, candidates: readonly string[]): string | undefined {
  if (input.trim().length === 0) return undefined
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
  if (best !== undefined && bestDistance === 1) return best

  const prefixed = prefixMatch(input, candidates)
  if (prefixed) return prefixed

  if (best === undefined) return undefined
  return bestDistance <= typoThreshold(input.length) ? best : undefined
}
