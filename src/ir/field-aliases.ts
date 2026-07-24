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
  // PEST macro-environment scan (structure-components wave 2 task 4): each
  // of the 4 named slots is already a single common English adjective
  // (unlike bmc's compound canonical names above), so the predictable slip
  // is reaching for its noun form instead — a model that glosses the
  // acronym as "Politics, Economics, Society, Technology" (a common
  // informal expansion) writes the noun, not this schema's adjective.
  pest: {
    politics: "political",
    economy: "economic",
    society: "social",
    technology: "technological",
  },
  // Porter's Five Forces (structure-components wave 2 task 4): the same
  // bare-noun-for-compound-key slip bmc's table documents above —
  // `rivalry`/`substitutes` are already bare nouns matching their own
  // canonical spelling (no alias possible there), but the three qualified
  // names invite dropping the qualifier.
  five_forces: {
    entrants: "new_entrants",
    suppliers: "supplier_power",
    buyers: "buyer_power",
  },
  // Heatmap (structure-components wave 2 task 4): `x_labels`/`y_labels`/
  // `values` are chart-vocabulary names a model describing a plain "rows x
  // columns" grid casually reaches past — `rows`/`columns` are the natural
  // table words for the same two axes, `data` the generic noun for "the
  // numbers." `range` is the natural word for `domain`'s `{min,max}`
  // value-scale override.
  heatmap: {
    rows: "y_labels",
    columns: "x_labels",
    data: "values",
    range: "domain",
  },
}

/** One component type's item-array field aliases: which array to walk, and the alias map applied to each item object in it. */
export interface ItemFieldAliasSpec {
  /** The component's own field name holding the item array (e.g. "items", "layers", "milestones"). */
  itemsKey: string
  aliases: FieldAliasMap
}

/**
 * Item-array field aliases: component type → one `{ itemsKey, aliases }`
 * spec *per item array* that type has. Ported verbatim from ops-kb's
 * `_ITEM_FIELD_ALIASES` (its 2-tuple `(list_key, aliases)` becomes this
 * named shape here — same data, more readable than an indexed tuple), then
 * widened from one spec per component type to a list of specs (field-alias
 * sweep task I1) so a component type with more than one item array (sankey's
 * `nodes[]` alongside `links[]`) can alias each independently — see sankey's
 * own two-entry row below for the shape this widening unlocked.
 */
export const COMPONENT_ITEM_FIELD_ALIASES: Readonly<Record<string, readonly ItemFieldAliasSpec[]>> = {
  kpi_cards: [{ itemsKey: "items", aliases: { title: "label", name: "label" } }],
  // Numeric-axis family (structure-components wave task 2, decision 8):
  // waterfall's per-item signed delta is commonly reached for as "amount" in
  // finance-deck vocabulary (a waterfall/bridge chart is itself a finance-
  // reporting convention). gantt's start/end pair is the one field name a
  // model that knows "Gantt chart" but not this schema's numeric-axis-only
  // shape (decision 6: no date parsing) reaches for by analogy to a
  // calendar's own "from"/"to" range vocabulary.
  waterfall: [{ itemsKey: "items", aliases: { amount: "value" } }],
  gantt: [{ itemsKey: "items", aliases: { from: "start", to: "end" } }],
  // Sankey (structure-components wave 2 task 4, `links`; field-alias sweep
  // task I1, `nodes`): `links`' `source`/`target` is the exact field-name
  // convention D3-sankey and Plotly's own Sankey trace both use for a
  // link's two endpoints — a model that has ever produced a sankey spec for
  // either of those two (the dominant JS/Python charting libraries for this
  // diagram type) reaches for that vocabulary over this schema's
  // `from`/`to`. `nodes[].label` carried no alias until task I1 widened this
  // table's value type to a list of specs — rescuing it needed a *second*
  // item-array entry for the same component type (`nodes` alongside
  // `links`), which the original one-`itemsKey`-per-component-type shape
  // did not support (a real, scoped-out gap, not a silent drop). Now that a
  // component type can list one spec per item array, `nodes` gets its own:
  // `name` is D3's own classic node-label convention (the same
  // "reaches for the charting library's vocabulary" logic as `links`'
  // `source`/`target` above), `title` mirrors kpi_cards' own
  // `title`→`label` alias above — the same generic title-for-label slip on
  // any labeled-card-like item shape.
  sankey: [
    { itemsKey: "links", aliases: { source: "from", target: "to" } },
    { itemsKey: "nodes", aliases: { name: "label", title: "label" } },
  ],
  // Real-world tech-deck mental model: layers have a "name" and hold
  // "components" or "nodes" — pptfast's own top-level components array
  // shares the word "components" by coincidence only; this alias is scoped
  // to one architecture layer's own item shape, never the deck-level array.
  architecture: [{ itemsKey: "layers", aliases: { name: "title", components: "items", nodes: "items" } }],
  steps: [{ itemsKey: "items", aliases: { description: "text", desc: "text" } }],
  timeline: [{ itemsKey: "milestones", aliases: { year: "date", text: "desc", description: "desc" } }],
  numbered_cards: [{ itemsKey: "items", aliases: { description: "text", desc: "text" } }],
  row_cards: [{ itemsKey: "items", aliases: { description: "text", desc: "text" } }],
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

  const itemSpecs = COMPONENT_ITEM_FIELD_ALIASES[component.type]
  if (itemSpecs) {
    // One component type can list more than one item array (sankey: `links`
    // then `nodes`) — walked in table order, each iteration reading/writing
    // `next` so a rewrite in an earlier spec's array is visible to (and
    // never clobbered by) a later spec's own `{ ...next, ... }` clone.
    for (const itemSpec of itemSpecs) {
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

// ── No root/narrative-level *old-vocabulary* alias layer (spec §16) ───────
//
// A v4-track rescue for the IR root's pre-rename `scenario` field name, and
// the pre-rename `mode`/`delivery` field names and enum values one level
// down inside `narrative`, briefly lived here (vocabulary-v4 rename, task 1,
// spec §15.4's "v4 内旧字段走别名不走硬拦"). The user-issued spec §16 revoked
// that call: old vocabulary is not a weak-model synonym slip the way
// `kpi.title`→`label` above is — it is the exact vocabulary this rename
// retired, so it must hard-error like any other unknown key or value, not be
// silently rewritten. `scenario` now fails `PptxIRSchema`'s own `.strict()`
// parse as an unrecognized key; `mode`/`delivery` inside `narrative` and the
// old enum values (`"text"`, `"presentation"`, the `mode`/`strategy` value
// `"narrative"`) fail `resolveNarrative`'s own runtime axis/value check
// (`src/narrative`), listing the current values. `pptfast migrate`
// (`ir/migrate.ts`) remains the sanctioned bridge for a genuine v3 document —
// v3 documents carry this exact old vocabulary by definition, and migration
// is a distinct, declared operation from silent in-place rescue.
//
// This absence is scoped to *old vocabulary* specifically, not to "no
// narrative-level rewrite of any kind" — `src/narrative/index.ts`'s
// `normalizeNarrativeShape` (T0b, added after this paragraph was written)
// does rewrite `narrative` pre-parse, but for an unrelated reason: a
// `{id: <preset>}` wrapper shape weak models invent by analogy to
// `theme: {id: ...}`, never a shape the pre-rename `scenario` vocabulary
// spoke. Same "weak-model synonym rescue" class this file's own
// `COMPONENT_FIELD_ALIASES` table is, just for a shape instead of a field
// name — see that function's own doc comment for the full boundary against
// this section's old-vocabulary rule.
