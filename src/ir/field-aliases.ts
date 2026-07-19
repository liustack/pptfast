/**
 * Deterministic field-alias normalization — a rescue layer for weak-model
 * synonym field-name drift (a model writing kpi `title` when the schema
 * wants `label`, quote `content` when it wants `text`, and so on). Ported
 * from ops-kb's `field_aliases.py` (`_BLOCK_FIELD_ALIASES` /
 * `_ITEM_FIELD_ALIASES`, the production system pptfast was extracted from):
 * a 2026-07-12 failure-sample bucketing there found ~90% of weak-model
 * `fill` failures were exactly this shape — a pair of "unrecognized field"
 * + "field required" errors for a synonym pair (kpi `title`→`label` alone
 * was 13 of that day's failures) that salvage-style extra-key stripping
 * cannot fix, because stripping the wrong-named key still leaves the
 * canonical one missing. The table must be *carried*, not dropped.
 *
 * Every ops-kb table entry was cross-checked against this repo's own
 * `ComponentSchema` (`./index.ts`): the port needed zero drops — every
 * ops-kb target field still exists post block→component rename (see the W5
 * task-4 report for the row-by-row check). Two deliberate departures from
 * the ops-kb original, both driven by this repo's own "omission gets a
 * default, a wrong value is a hard error" posture (not ops-kb's — a
 * same-thread retry-avoidance system with different incentives):
 *  - both canonical and alias present here → left untouched (ops-kb instead
 *    always discards the alias and keeps the canonical value); zod strict
 *    then reports the leftover alias key as unrecognized. Two conflicting
 *    keys is a wrong value, not an omission — it should hard-block, not
 *    silently resolve in the canonical key's favor.
 *  - no value coercion (ops-kb's `_coerce_str`, an int/float→string rescue
 *    for a pattern like timeline `year: 2024`) — out of scope for a table
 *    that normalizes field *names*; a type mismatch surviving a correct
 *    rename is still a legitimate zod error, not a naming problem.
 */

/** One component type's `{ aliasKey: canonicalKey }` map. */
export type FieldAliasMap = Readonly<Record<string, string>>

/**
 * Top-level field aliases: component type → alias map applied to the
 * component object's own keys. Ported verbatim from ops-kb's
 * `_BLOCK_FIELD_ALIASES` (its "block" is pptfast's "component" post-rename).
 */
export const COMPONENT_FIELD_ALIASES: Readonly<Record<string, FieldAliasMap>> = {
  quote: { content: "text", author: "attribution", by: "attribution" },
  // Mental model overlap with "code snippet" / "code text" / "source code".
  code: { content: "code", source: "code", snippet: "code", text: "code" },
  paragraph: { content: "text", body: "text" },
  // callout and verdict_banner's semantic fields commonly cross-wire
  // (tone/variant) — each direction is this pair's own inverse alias below.
  callout: { tone: "variant" },
  verdict_banner: { variant: "tone" },
  // Named-slot full-body family (structure-components wave task 1, decision
  // 8): every slot is its own top-level field (not an item-array element),
  // so these belong in this top-level table, not
  // `COMPONENT_ITEM_FIELD_ALIASES` below. Singular-for-plural is the
  // predictable weak-model slip for a 4-named-array schema like `swot`'s —
  // a model reaching for "strength" when the field holds a *list* of
  // strengths.
  swot: {
    strength: "strengths",
    weakness: "weaknesses",
    opportunity: "opportunities",
    threat: "threats",
  },
  // bmc's canonical keys are the Osterwalder canvas's own compound names
  // (`key_partners`, `customer_segments`, …) — a model that knows the
  // business-model-canvas vocabulary but not this schema's exact key
  // spelling reaches for the shorter/bare noun instead.
  bmc: {
    partners: "key_partners",
    activities: "key_activities",
    resources: "key_resources",
    value_proposition: "value_propositions",
    relationships: "customer_relationships",
    segments: "customer_segments",
    costs: "cost_structure",
    revenue: "revenue_streams",
  },
}

/** One component type's item-array field aliases: which array to walk, and the alias map applied to each item object in it. */
export interface ItemFieldAliasSpec {
  /** The component's own field name holding the item array (e.g. "items", "layers", "milestones"). */
  itemsKey: string
  aliases: FieldAliasMap
}

/**
 * Item-array field aliases: component type → { itemsKey, aliases }. Ported
 * verbatim from ops-kb's `_ITEM_FIELD_ALIASES` (its 2-tuple
 * `(list_key, aliases)` becomes this named shape here — same data, more
 * readable than an indexed tuple).
 */
export const COMPONENT_ITEM_FIELD_ALIASES: Readonly<Record<string, ItemFieldAliasSpec>> = {
  kpi_cards: { itemsKey: "items", aliases: { title: "label", name: "label" } },
  // Numeric-axis family (structure-components wave task 2, decision 8):
  // waterfall's per-item signed delta is commonly reached for as "amount" in
  // finance-deck vocabulary (a waterfall/bridge chart is itself a finance-
  // reporting convention). gantt's start/end pair is the one field name a
  // model that knows "Gantt chart" but not this schema's numeric-axis-only
  // shape (decision 6: no date parsing) reaches for by analogy to a
  // calendar's own "from"/"to" range vocabulary.
  waterfall: { itemsKey: "items", aliases: { amount: "value" } },
  gantt: { itemsKey: "items", aliases: { from: "start", to: "end" } },
  // Real-world tech-deck mental model: layers have a "name" and hold
  // "components" or "nodes" — pptfast's own top-level components array
  // shares the word "components" by coincidence only; this alias is scoped
  // to one architecture layer's own item shape, never the deck-level array.
  architecture: { itemsKey: "layers", aliases: { name: "title", components: "items", nodes: "items" } },
  steps: { itemsKey: "items", aliases: { description: "text", desc: "text" } },
  timeline: { itemsKey: "milestones", aliases: { year: "date", text: "desc", description: "desc" } },
  numbered_cards: { itemsKey: "items", aliases: { description: "text", desc: "text" } },
  row_cards: { itemsKey: "items", aliases: { description: "text", desc: "text" } },
}

/**
 * Slide-level (not component) field aliases — applied to a slide object's
 * own keys, before this file's per-component normalization runs on that same
 * slide. New for the speaker-notes field (`SlideSchema.notes`, `../ir/index.ts`):
 * the singular "note", and PowerPoint's own vocabulary "speaker_notes" /
 * "speakerNotes", are the same synonym drift this module exists to rescue —
 * one level up the tree from every other row in this file, since `notes` is a
 * slide field, not a component field. Same rename semantics as
 * {@link renameAliases} everywhere else in this module: canonical-present
 * wins, alias-and-canonical both present is left untouched for zod strict to
 * reject.
 */
export const SLIDE_FIELD_ALIASES: FieldAliasMap = {
  note: "notes",
  speaker_notes: "notes",
  speakerNotes: "notes",
}

export interface NormalizeAliasesResult {
  /** The (possibly rewritten) input, structurally cloned — the original `input` is never mutated. */
  value: unknown
  /** Human-readable "`path`: `alias` → `canonical`" entry per rewrite performed, in walk order. */
  normalized: string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Rewrite `obj`'s own keys per `aliases` (alias → canonical) — only when the
 * canonical key is absent *and* the alias key is present. Both present is
 * left untouched: the caller's subsequent zod strict parse reports the
 * leftover alias key as unrecognized (the deliberate ambiguity gate, see
 * this module's top comment). Returns `obj` itself, unmodified, when nothing
 * changes — never mutates it — so callers can cheaply detect "no change" via
 * reference equality and skip cloning their own parent frame.
 */
function renameAliases(
  obj: Record<string, unknown>,
  aliases: FieldAliasMap,
  path: string,
  normalized: string[],
): Record<string, unknown> {
  let next = obj
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (!Object.hasOwn(next, alias) || Object.hasOwn(next, canonical)) continue
    if (next === obj) next = { ...obj } // clone lazily, once, on the first actual rewrite
    next[canonical] = next[alias]
    delete next[alias]
    normalized.push(`${path}: ${alias} → ${canonical}`)
  }
  return next
}

function normalizeComponent(component: unknown, si: number, ci: number, normalized: string[]): unknown {
  if (!isPlainObject(component) || typeof component.type !== "string") return component
  const path = `slides[${si}].components[${ci}]`
  let next = component

  const blockAliases = COMPONENT_FIELD_ALIASES[component.type]
  if (blockAliases) next = renameAliases(next, blockAliases, path, normalized)

  const itemSpec = COMPONENT_ITEM_FIELD_ALIASES[component.type]
  if (itemSpec) {
    const items = next[itemSpec.itemsKey]
    if (Array.isArray(items)) {
      let itemsChanged = false
      const nextItems = items.map((item, ii) => {
        if (!isPlainObject(item)) return item
        const renamed = renameAliases(item, itemSpec.aliases, `${path}.${itemSpec.itemsKey}[${ii}]`, normalized)
        if (renamed !== item) itemsChanged = true
        return renamed
      })
      if (itemsChanged) next = { ...next, [itemSpec.itemsKey]: nextItems }
    }
  }

  return next
}

function normalizeSlide(slide: unknown, si: number, normalized: string[]): unknown {
  if (!isPlainObject(slide)) return slide
  const path = `slides[${si}]`
  // Slide-level rename first (e.g. speaker_notes → notes) — independent of
  // whether this slide has a valid components array at all.
  let next = renameAliases(slide, SLIDE_FIELD_ALIASES, path, normalized)

  const components = next.components
  if (Array.isArray(components)) {
    let componentsChanged = false
    const nextComponents = components.map((component, ci) => {
      const renamed = normalizeComponent(component, si, ci, normalized)
      if (renamed !== component) componentsChanged = true
      return renamed
    })
    if (componentsChanged) {
      next = next === slide ? { ...slide, components: nextComponents } : { ...next, components: nextComponents }
    }
  }

  return next
}

/**
 * Deep-walk an unknown (pre-zod) IR shape — each slide's own top-level keys
 * (per {@link SLIDE_FIELD_ALIASES}), plus `slides[].components[]` and their
 * item arrays — rewriting synonym field names per
 * {@link COMPONENT_FIELD_ALIASES} / {@link COMPONENT_ITEM_FIELD_ALIASES}.
 * Structural-share, never mutates `input`: any slide/component/item
 * subtree with nothing to rewrite is returned by the same reference it came
 * in with, so a fully-canonical input comes back as `value === input` and
 * `normalized: []`.
 *
 * Shape-defensive by construction, not by special-casing: a missing/non-array
 * `slides`, a non-object slide, a non-array `components`, a non-object
 * component, or a missing/non-string `type` all fall through untouched at
 * the point they stop matching the expected shape — the point of this
 * function is a deterministic rescue for a known field-name typo, not a
 * general validator, so anything it doesn't recognize is left for the zod
 * parse that runs right after it to report on its own terms.
 */
export function normalizeComponentAliases(input: unknown): NormalizeAliasesResult {
  const normalized: string[] = []
  if (!isPlainObject(input) || !Array.isArray(input.slides)) {
    return { value: input, normalized }
  }
  let changed = false
  const slides = input.slides.map((slide, si) => {
    const next = normalizeSlide(slide, si, normalized)
    if (next !== slide) changed = true
    return next
  })
  return { value: changed ? { ...input, slides } : input, normalized }
}

// ── v4 narrative alias layer (vocabulary-v4 rename, spec §15.4) ──────────
//
// A separate rescue layer from everything above this comment: the alias
// tables above all normalize *inside* `slides[]` (component field names and
// their item-array entries). This one instead normalizes the IR *root* —
// the pre-rename `scenario` field name, and the pre-rename `mode`/`delivery`
// field names and enum values one level down, inside that field's own
// object shape. Same rescue posture as every alias above (deterministic,
// printed, never a silent accept, both-present-is-ambiguous-and-untouched)
// but a distinct walk because it operates above `slides[]`, a level
// `normalizeComponentAliases` never visits.
//
// Scope, per spec §15.4 ("v4 内旧字段走别名不走硬拦"): only applies to a
// document already headed for the v4 schema — `validateIr` (`src/api.ts`)
// hard-rejects an explicit `version: "2"` or `version: "3"` *before* this
// ever runs, so by the time `normalizeNarrativeAliases` sees an input, its
// `version` is either omitted (v4's own default, spec §15.1) or explicitly
// `"4"`. A v3 document that also happens to spell its axes the old way is
// never silently reinterpreted as v4 through this rescue — it is caught by
// the hard version check first, every time.

/** Root-level (IR-document) field alias for the v4 IR (spec §15.4): `scenario` → `narrative`. */
export const IR_ROOT_FIELD_ALIASES: FieldAliasMap = { scenario: "narrative" }

/** `narrative` object field aliases (spec §15.4): `mode` → `strategy`, `delivery` → `pacing`. */
export const NARRATIVE_FIELD_ALIASES: FieldAliasMap = { mode: "strategy", delivery: "pacing" }

/**
 * Old narrative-axis enum value → new enum value, keyed by the *canonical*
 * (post-rename) axis key it applies to — spec §15.4's "旧枚举值" plus spec
 * §9.1's value-mapping table: the `strategy` axis's old `"narrative"` value
 * is now `"storytelling"`; the `pacing` axis's old `"text"` value is now
 * `"dense"` and old `"presentation"` is now `"spacious"` (`"balanced"` is
 * unchanged, so it needs no entry). Applied regardless of whether the value
 * arrived under the old field name or was already written under the new one
 * (e.g. a document that writes `strategy: "narrative"`, mixing the new field
 * name with the old value, still gets rescued) — field-name aliasing and
 * value aliasing are independent normalizations, not required to co-occur.
 */
export const NARRATIVE_VALUE_ALIASES: Readonly<Record<string, FieldAliasMap>> = {
  strategy: { narrative: "storytelling" },
  pacing: { text: "dense", presentation: "spacious" },
}

/**
 * Rewrite any old-vocabulary values found at `narrative`'s own top-level
 * axis keys, per {@link NARRATIVE_VALUE_ALIASES}. Same "clone lazily once,
 * only on an actual rewrite" discipline as {@link renameAliases}, and
 * intentionally *not* built on top of it — that helper renames *keys*, this
 * rewrites the *value* already sitting at a fixed (canonical) key, a
 * different operation with no ambiguity case to guard (a single key can only
 * hold one value, so there is no "both present" conflict to detect here).
 */
function normalizeNarrativeValues(
  narrative: Record<string, unknown>,
  path: string,
  normalized: string[],
): Record<string, unknown> {
  let next = narrative
  for (const [axis, valueAliases] of Object.entries(NARRATIVE_VALUE_ALIASES)) {
    const current = next[axis]
    if (typeof current !== "string") continue
    const canonicalValue = valueAliases[current]
    if (canonicalValue === undefined) continue
    if (next === narrative) next = { ...narrative } // clone lazily, once, on the first actual rewrite
    next[axis] = canonicalValue
    normalized.push(`${path}.${axis}: ${current} → ${canonicalValue}`)
  }
  return next
}

/**
 * Root-level alias normalization for the v4 IR document (spec §15.4): a
 * document parsed as v4 that still writes the pre-rename field name
 * (`scenario`), or writes `narrative` but with the pre-rename axis field
 * names (`mode`/`delivery`) or pre-rename enum values (`mode: "narrative"`,
 * `delivery: "text"` / `"presentation"`), gets rescued the same way
 * {@link normalizeComponentAliases} rescues a component field-name typo —
 * rewritten to the canonical v4 spelling, with a printed `path: alias →
 * canonical` note, never a silent accept and never a hard reject.
 *
 * Same ambiguity rule as {@link renameAliases} throughout this module: both
 * the alias and the canonical key present at the same level is left
 * untouched (a real conflict, not an omission) for the zod strict parse (or,
 * one level down inside `narrative`, `resolveNarrative`'s own runtime axis-
 * key check — `narrative` is an open record at the schema layer, not
 * `.strict()`, see `NarrativeProfileInputSchema`'s docstring in `ir/index.ts`)
 * to report on its own terms.
 *
 * `validateIr` (`src/api.ts`) runs this before {@link normalizeComponentAliases}
 * and before the schema parse — see this section's own header comment for
 * why a v3/v2 document never reaches this rescue at all.
 */
export function normalizeNarrativeAliases(input: unknown): NormalizeAliasesResult {
  const normalized: string[] = []
  if (!isPlainObject(input)) return { value: input, normalized }

  const next = renameAliases(input, IR_ROOT_FIELD_ALIASES, "(root)", normalized)

  const narrative = next.narrative
  if (!isPlainObject(narrative)) return { value: next, normalized }

  let nextNarrative = renameAliases(narrative, NARRATIVE_FIELD_ALIASES, "(root).narrative", normalized)
  nextNarrative = normalizeNarrativeValues(nextNarrative, "(root).narrative", normalized)
  if (nextNarrative === narrative) return { value: next, normalized }

  return {
    value: next === input ? { ...input, narrative: nextNarrative } : { ...next, narrative: nextNarrative },
    normalized,
  }
}
