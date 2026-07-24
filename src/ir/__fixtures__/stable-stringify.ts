/**
 * Deterministic JSON serialization for the wave-2 migration-guard fixtures
 * (`.issues/2026-07-24-src-domain-reorg/wave2-spec.md` §5) — recursively
 * sorts every plain object's own keys before `JSON.stringify`, so a
 * pre/post-migration comparison stays byte-identical even if some
 * intermediate structure (zod's own `$defs` traversal order, a `Record`
 * built by iterating component-domain-file imports in a different order)
 * happens to insert keys in a different sequence once components move to
 * `src/ir/components/*.ts`. The migration must not change *content* — this
 * guards against a false failure from key-order alone masking that signal.
 * Arrays keep their own element order — order inside an array is semantic
 * (e.g. `errors[]`, a discriminated union's member order), never incidental
 * the way a plain object's key insertion order can be.
 *
 * Shared by both wave-2 migration guards (`../ir-json-schema.migration-guard.
 * test.ts`, `../validate-corpus.migration-guard.test.ts`) and their one-time
 * fixture-dump scripts (deleted after each fixture was captured) — one
 * implementation so a dump and its later replay can never disagree about
 * what "byte-identical" means.
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

/** `JSON.stringify(value, null, 2)` with every plain object's own keys sorted, recursively — see this module's own doc comment for why. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value), null, 2)
}
