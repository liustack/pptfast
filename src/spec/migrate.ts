/**
 * Deterministic, pure `deck.plan.json` → `deck.spec.json` migration (spec
 * §9.2, vocabulary-v4 rename, task 2). Mirrors `../ir/migrate.ts`'s
 * `migrateIrV3ToV4` in spirit — mechanical field rename only, no schema
 * validation, no model call, no content rewrite (same posture spec §9.3
 * states for the IR v3→v4 primitive: "只做已声明的结构映射，不运行模型，
 * 不重写内容，不重新选择 layout" — this function is that same contract
 * applied to the other artifact this rename touches). A caller should run
 * `validateSpec` (`./index.ts`) against the result to confirm it lands as a
 * legal deck spec, exactly as it would for a `deck.spec.json` authored by
 * hand — this function itself never parses against `DeckSpecSchema`.
 *
 * Field-for-field, value-for-value per spec §9.2's table:
 *
 * ```text
 * deck.plan.json                       → deck.spec.json
 * scenario                             → narrative
 * pages[].rhythm                       → pages[].beat
 * 其余字段                              → 原样保留
 * ```
 *
 * Takes the raw, `JSON.parse`d `deck.plan.json` contents (`unknown`) rather
 * than an already-validated shape — unlike `migrateIrV3ToV4` (which takes an
 * already-`PptxIRV3Schema.parse`d object), there is no schema left in this
 * codebase a pre-rename plan file could validate against: `DeckSpecSchema`
 * (`./index.ts`) already requires the *post*-rename field names (`narrative`,
 * `beat`), so parsing a plan-shaped document against it would just fail on
 * the very keys this function exists to rename. Non-object input, or a
 * `pages` value that isn't an array, passes through completely unchanged —
 * reporting a malformed source file is `runMigrate`'s job
 * (`../cli/commands.ts`), not this mechanical rename step's.
 */
export function migrateDeckPlanToSpec(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw
  const { scenario, pages, ...rest } = raw as Record<string, unknown>
  const result: Record<string, unknown> = { ...rest }
  if (scenario !== undefined) result.narrative = scenario
  if (Array.isArray(pages)) {
    result.pages = pages.map(migratePageRhythmToBeat)
  } else if (pages !== undefined) {
    // Not an array — structurally invalid either way, left untouched for
    // `validateSpec` to report on its own terms (same "mechanical, not
    // validating" posture as the rest of this function).
    result.pages = pages
  }
  return result
}

/** `pages[].rhythm` → `pages[].beat` (spec §9.2) — applied per page so a
 *  mix of already-migrated and not-yet-migrated page objects (unlikely in
 *  practice, but not this function's job to rule out) still converts
 *  correctly: a page with no `rhythm` key passes through unchanged. */
function migratePageRhythmToBeat(page: unknown): unknown {
  if (typeof page !== "object" || page === null || Array.isArray(page)) return page
  const { rhythm, ...rest } = page as Record<string, unknown>
  const next: Record<string, unknown> = { ...rest }
  if (rhythm !== undefined) next.beat = rhythm
  return next
}
