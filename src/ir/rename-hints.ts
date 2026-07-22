/**
 * Unrecognized-key rescue hints (borrow-wave task 3, generalizing the
 * `scenario` → `narrative` rescue that already lived inline in
 * `../api.ts`'s `validateIr`). Two independent, table-driven mechanisms:
 *
 * 1. {@link RENAME_HINTS} — the rest of the documented v2/v3 → v4 field
 *    renames (the same mapping `validateIr`'s own v2/v3 hard-reject messages
 *    already spell out in full) get the same "this was renamed, here's the
 *    new name" treatment `scenario` already had, instead of a bare zod
 *    "Unrecognized key" that gives a weak model no path to self-correct
 *    (borrow-wave B report §3.3 #4). Scoped by *where* the rename happened
 *    (`at`), not just the bare key name, so an unrelated field that happens
 *    to reuse one of these names elsewhere in the tree is never
 *    mis-diagnosed as this rename — e.g. a component-level field named
 *    `override` (none exists today, but the table's shape guards against it)
 *    would not collide with `theme.override`.
 * 2. {@link slideLevelUnknownKeyHint} — a generic, non-field-specific hint
 *    for an unrecognized key directly on a `Slide` object that *isn't* one of
 *    the known renames: content fields almost always belong inside one of
 *    the slide's `components[]` entries, not at slide level (borrow-wave B
 *    report §3.3 #3, the `items`-on-slide probe). Deliberately generic
 *    (one hint, not a per-field table) — the plan's own scope line: "keep it
 *    generic/table-driven, not per-field hardcoding beyond what the rename
 *    map already gives".
 */

interface RenameHint {
  /** Whether this rename hint applies at the unrecognized-key issue's own `path` (the *parent* object's path, per zod's `unrecognized_keys` issue shape — not the offending key itself). */
  at: (path: string) => boolean
  /** Appended verbatim after the zod message, prefixed with " — " by the caller. */
  hint: string
}

const SLIDE_LEVEL = (path: string): boolean => /^slides\.\d+$/.test(path)

/**
 * Old key name → where it can appear → what to say. Every entry here mirrors
 * a line already present in `validateIr`'s own v2 (`version: "2"`) hard-reject
 * message — this table exists because that message only fires for an
 * *explicit* `version: "2"` document, while a hand-edited `version: "4"`
 * document can still carry the same stale field names as plain schema
 * violations. `scenario` is the one exception: it stays inline in
 * `validateIr` rather than here, because its hint also carries the
 * `pptfast migrate` pointer for genuine v3 documents (a distinction that
 * doesn't apply to the v2-only renames below — `blocks`/`variant`/`override`
 * are not valid under v3 either, so pointing at a v3-only migration tool for
 * them would be misleading).
 */
const RENAME_HINTS: Readonly<Record<string, RenameHint>> = {
  blocks: {
    at: SLIDE_LEVEL,
    hint: '"blocks" was renamed to "components" in IR v4',
  },
  variant: {
    at: SLIDE_LEVEL,
    hint: '"variant" was split into "layout" and "arrangement" in IR v4',
  },
  override: {
    at: (path) => path === "theme",
    hint: '"theme.override" was renamed to "theme.style" in IR v4',
  },
}

/**
 * Rename-hint suffixes for every key in `keys` (a zod `unrecognized_keys`
 * issue's own `.keys`) whose rename applies at `path` — empty when none
 * match. Each suffix already carries its own leading " — " separator so
 * callers can simply concatenate.
 */
export function renameHintsFor(keys: readonly string[], path: string): string[] {
  return keys
    .map((key) => RENAME_HINTS[key])
    .filter((hint): hint is RenameHint => hint !== undefined && hint.at(path))
    .map((hint) => ` — ${hint.hint}`)
}

/**
 * Generic "content belongs inside components[]" hint for an unrecognized key
 * found directly on a slide object, only ever offered when none of `keys`
 * matched a documented rename (a rename hint is always more specific and
 * takes priority — see {@link renameHintsFor}'s caller in `../api.ts`).
 */
export const SLIDE_LEVEL_UNKNOWN_KEY_HINT =
  " — unexpected fields at slide level usually belong inside one of the slide's components[] entries, not the slide itself (see `pptfast schema`)"

export function isSlideLevelPath(path: string): boolean {
  return SLIDE_LEVEL(path)
}
