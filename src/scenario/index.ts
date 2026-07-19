import { PptfastError } from "../errors"
// STRATEGY_VALUES / PACING_VALUES / AUDIENCE_VALUES (re-exported below, next
// to Strategy/Pacing/Audience's own spec-table-order doc comments) live in
// ../ir/narrative-values, not here — see that leaf module's docstring for why
// src/ir owns the shared tuples instead of src/scenario (short version: this
// module's own test suite already imports BUILTIN_THEME_IDS from src/ir, so
// src/ir importing these tuples back from here would risk a cycle).
import { AUDIENCE_VALUES, PACING_VALUES, STRATEGY_VALUES } from "../ir/narrative-values"

// ── Axes (spec §5, "narrative layer" — renamed from "scenario and plan
// layer" in the vocabulary-v4 rename, task 1: §4's vocabulary table and
// §8.1's rename table) ──────────────────────────────────────────────────
//
// A narrative profile is three independent axes. Nothing in this module
// touches rendering or selection yet — this wave (W3 task 1) only lays the
// axes types, the strategy/pacing data tables, the named presets, and the
// omission-defaults resolver described by spec §5. Weighted layout/component
// selection off `STRATEGY_DEFINITIONS.tendencies` is W4's job. Wiring
// `PACING_BUDGETS` into the content-quality gate is this wave's task 3.
// Putting `narrative` on the IR itself is a later task.
//
// vocabulary-v4 (task 1) renamed this module's public surface wholesale per
// spec §8.1's table: `ScenarioAxes`→`NarrativeProfile`,
// `SCENARIO_PRESETS`→`NARRATIVE_PRESETS`, `resolveScenario`→`resolveNarrative`,
// `Mode`→`Strategy`, `MODE_VALUES`→`STRATEGY_VALUES`,
// `MODE_DEFINITIONS`→`STRATEGY_DEFINITIONS`, `Delivery`→`Pacing`,
// `DELIVERY_VALUES`→`PACING_VALUES`, `DELIVERY_BUDGETS`→`PACING_BUDGETS`,
// `rhythmPolicy`→`beatPolicy` — plus spec §4's value renames: the `mode`
// value `"narrative"` is now the `strategy` value `"storytelling"` (the
// abstraction/instance name collision spec §1 flags as the reason for this
// whole rename), `delivery` value `"text"` is now `pacing` value `"dense"`,
// `"presentation"` is now `"spacious"` (`"balanced"` is unchanged). Every
// tendency set, budget number, preset id, and theme recommendation is
// byte-for-byte unchanged — this is a pure nomenclature rename (spec §10's
// "first-version boundary": no weight/budget/selection changes).

/**
 * Narrative argument style (spec §5's five-way strategy classification,
 * renamed from "mode" — spec §8.1). Each strategy carries a
 * component/layout tendency set (soft-weight material, consumed by W4's
 * weighted selection — nothing consumes it this wave) and a beat policy
 * (renamed from "rhythm policy" — spec §2.3's deck/page beat split; consumed
 * by W5's spec-validate rotation gate).
 */
export type Strategy = (typeof STRATEGY_VALUES)[number]

/**
 * Content density budget + typographic baseline (spec §5 pacing table,
 * renamed from "delivery" — spec §8.1). See {@link PacingBudget} for the
 * dual-attribute capacity split this axis is one half of.
 */
export type Pacing = (typeof PACING_VALUES)[number]

/**
 * Tone anchor only (spec §5: audience is tone-anchoring only, no rendering
 * effect on the IR yet). Reserved for a future lint pass (e.g. executive ×
 * long paragraphs → suggest kpi_cards/verdict_banner instead). The rule set
 * itself is explicitly out of scope this wave (spec §10 open questions).
 * Name unchanged by the vocabulary-v4 rename (spec §4.3: "audience 保持不变").
 */
export type Audience = (typeof AUDIENCE_VALUES)[number]

export interface NarrativeProfile {
  readonly strategy: Strategy
  readonly pacing: Pacing
  readonly audience: Audience
}

/**
 * All valid {@link Audience} values (no backing record — audience is
 * tone-only, spec §5). Re-exported from `../ir/narrative-values`, this
 * module's single source of truth for the three axes' value tuples (see the
 * import at the top of this file).
 */
export { AUDIENCE_VALUES }

// ── Strategy definitions (data only — W4 consumes for weighted selection) ─

export interface StrategyDefinition {
  id: Strategy
  /**
   * Layout/component tendency set (soft-weight material). Filled row-for-row
   * from spec §5's strategy table for W4's weighted selection step (spec §6
   * step 4: in-set candidates get ×3 weight, out-of-set ×1 floor — not
   * implemented yet, this module only stores the data).
   *
   * The set deliberately mixes two different vocabularies: component `type`
   * names (e.g. "kpi_cards", "chart" — see the `Component` discriminated
   * union in `ir/index.ts`) and layout `id`s (e.g. "image-split" — see
   * `LAYOUT_REGISTRY` in `svg/layouts/registry.ts`). This is intentional,
   * not an oversight: W4's weighting step resolves each entry against
   * whichever vocabulary it belongs to (component types when scoring a
   * candidate's components, layout ids when scoring the candidate layout
   * itself). Nothing in this wave (W3) reads this field.
   */
  tendencies: readonly string[]
  /**
   * Content-archetype soft-weight set for W4's weighted layout selection
   * (spec §6 step 4: in-set candidates get `TENDENCY_WEIGHT` (×3), out-of-set
   * get the `BASE_WEIGHT` floor (×1) — both named constants live in
   * `svg/effective-layout.ts`, next to `resolveArchetypeId`, the sole
   * consumer). Deliberately a separate field from {@link tendencies} above,
   * not a reinterpretation of it: `tendencies` mixes component-type names and
   * layout ids drawn from spec §5's strategy table verbatim and also feeds W5's
   * spec `focus` vocabulary gate, so narrowing its meaning here would be a
   * breaking change to an existing consumer. This field holds only
   * `LAYOUT_REGISTRY` content-archetype ids (`svg/layouts/registry.ts`'s
   * `CONTENT_LAYOUTS` keys) — cover/chapter/ending ids never appear in any
   * strategy's list here, which is exactly why `resolveArchetypeId`'s weighting
   * is a no-op for those three slide types (spec: "身份页个性来自 theme 不来自
   * strategy，均匀取样") without needing a slide-type special case — a weight
   * lookup against an id that can never match falls through to the ×1 floor
   * for every candidate, uniform by construction. `tone-adaptive-content`
   * appears in no strategy's list either (spec's "万金油" call-out: it is the
   * one content archetype meant to read as strategy-neutral, so it always
   * gets the ×1 floor too).
   */
  layoutTendencies: readonly string[]
  /**
   * Beat template descriptor (spec §5's per-strategy beat-default column,
   * renamed from "rhythm" — spec §2.3), parameterized by strategy for W5's
   * spec-validate rotation gate — e.g. briefing is exempt from a generic
   * "three same-beat pages in a row is an error" rule because uniform-dense
   * *is* briefing's correct default, not a violation of it (spec §5's
   * spec-gate section calls out that a generic same-beat-streak rule would
   * reject briefing's own default). Not consumed this wave.
   */
  beatPolicy: "anchor-open" | "alternate" | "repetition-ok" | "anchor-sparse" | "uniform-dense"
}

export const STRATEGY_DEFINITIONS: Record<Strategy, StrategyDefinition> = {
  pyramid: {
    id: "pyramid",
    // swot/bmc/waterfall/gantt (structure-components wave task 3, decision
    // 9) all join pyramid's tendency set — every one of the four full-body
    // types is itself a "conclusion-first, dense-evidence" shape (a 2x2
    // assessment, a nine-block canvas, a running-total bridge, a shared-axis
    // schedule), the same MECE-first argument style pyramid already favors.
    tendencies: [
      "kpi_cards",
      "verdict_banner",
      "chart",
      "comparison",
      "matrix",
      "roadmap",
      "swot",
      "bmc",
      "waterfall",
      "gantt",
    ],
    // MECE 结论先行——密集数据型 body（bento 卡片拼盘/横幅断言）+ 两栏对比。
    layoutTendencies: ["bento-panel", "banner-heading", "two-column"],
    beatPolicy: "anchor-open",
  },
  storytelling: {
    id: "storytelling",
    // Spec's "image family" entry normalizes to the four kebab image-family
    // layout ids (W2 promoted them from a `variant` value to first-class
    // layouts — see the "image-split"/"image-top"/"image-bottom"/
    // "image-annotate" entries in `LAYOUT_REGISTRY`). image_grid is a
    // distinct component type, not part of this family — it only shows up
    // in showcase's row below, matching the spec table.
    tendencies: ["quote", "image-split", "image-top", "image-bottom", "image-annotate", "timeline", "callout"],
    // 情境→张力→解决——单栏行文（narrow-column）+ 海报式单点强调（stacked-poster）。
    layoutTendencies: ["narrow-column", "stacked-poster"],
    beatPolicy: "alternate",
  },
  instructional: {
    id: "instructional",
    // gantt also joins instructional's tendency set (decision 9) — a shared-
    // axis schedule is itself a step-by-step breakdown (phase 1, phase 2, …
    // laid end to end), the same "分步拆解" shape instructional already
    // favors, on top of already belonging to pyramid's evidence-dense set.
    tendencies: ["steps", "numbered_cards", "flowchart", "architecture", "code", "gantt"],
    // 分步拆解——编号导轨（rail-numbered）+ 两栏步骤对照。
    layoutTendencies: ["rail-numbered", "two-column"],
    beatPolicy: "repetition-ok",
  },
  showcase: {
    id: "showcase",
    // Spec's giant-number-kpi entry normalizes to the kpi_cards component
    // type — the "giant" sizing itself is an arrangement-level concern (the
    // "big_number" arrangement value on content slides, see `ir/index.ts`),
    // a third vocabulary outside this field's documented two-vocabulary
    // scope (component types + layout ids). W4's weighting step only
    // resolves tendencies against those two, so a bare "big_number" entry
    // here would be unresolvable — kpi_cards is the correct, resolvable
    // normalization.
    tendencies: ["image-split", "image-top", "image-bottom", "image-annotate", "image_grid", "kpi_cards"],
    // 视觉冲击——海报式单点强调（stacked-poster）+ 卡片拼盘（bento-panel）。
    layoutTendencies: ["stacked-poster", "bento-panel"],
    beatPolicy: "anchor-sparse",
  },
  briefing: {
    id: "briefing",
    tendencies: ["bullets", "row_cards", "timeline", "citation"],
    // 中性通报可扫读——横幅断言 + 卡片拼盘 + 两栏，三种扫读友好排布并重。
    layoutTendencies: ["banner-heading", "bento-panel", "two-column"],
    beatPolicy: "uniform-dense",
  },
}

/**
 * All valid {@link Strategy} values, in spec §5 table order. Re-exported from
 * `../ir/narrative-values` — this module's `Strategy` type derives from that
 * same tuple, and {@link STRATEGY_DEFINITIONS} above is typed
 * `Record<Strategy, ...>`, so TypeScript itself enforces that it has exactly
 * these keys.
 */
export { STRATEGY_VALUES }

// ── Pacing budgets (editorial half of the dual-attribute capacity split) ──

export interface PacingBudget {
  /**
   * Body-text baseline, in px, at 1280×720 slide geometry (spec §5 pacing
   * table's body-baseline column). Wired into rendering as of W4 task 3
   * (design decision 9): `src/svg/FullSlideSvg.tsx` resolves
   * `PACING_BUDGETS[resolveNarrative(ir.narrative).pacing].bodyBaselinePx`
   * once and passes it into `buildCtx`, which stores it as
   * `ComponentCtx.bodyFontPx` — the sole font-size input for the
   * paragraph/bullets/callout trio ("正文" = continuous running text).
   * Every other component's own bespoke type scale, the heading system, and
   * quote's fixed 26px attribution line don't read this field. Since
   * `balanced` (24px) is the narrative default, an omitted-narrative deck
   * now renders body text at 24px, not the previous fixed 20px — the
   * one-time, spec-sanctioned snapshot re-pin that landed alongside this
   * wiring (W4 task 3, unchanged since — vocabulary-v4 only renames this
   * table, it doesn't touch any of its numbers, spec §10).
   */
  bodyBaselinePx: number
  /**
   * Per-slide editorial budget (component count) — content discipline
   * ("how many things belong on this slide"), not geometry. Spec §5's
   * dual-attribute capacity split keeps *physical* capacity ("how many
   * things fit in this layout's slots") on the layout registry's body-slot
   * `capacity` metadata (`svg/layouts/registry.ts`). The W3 quality gate
   * takes `min(this budget, the resolved layout's body capacity)`.
   */
  maxComponentsPerSlide: number
  bullets: {
    maxItems: number
    /**
     * Same "unit" concept the deleted `CAPACITY.bullets` used
     * (`measureTextUnits`, CJK weight = 1.0) — a visual-width-weighted
     * character count, not a raw `.length`. The old physical ceiling (53,
     * derived from render geometry) was deleted in W3 without a replacement
     * check because every pacing's editorial budget here (30/40/48) is
     * already strictly tighter than it — the quality gate now applies
     * exactly this one number per pacing.
     */
    maxUnitsPerItem: number
  }
}

/**
 * Pinned to spec §5's pacing table (`bodyBaselinePx` / editorial budget /
 * bullets budget columns): dense 20/5/6×48, balanced 24/4/5×40, spacious
 * 32/3/4×30 — same three rows as the pre-rename `text`/`balanced`/
 * `presentation` delivery table, values byte-for-byte unchanged (spec §10).
 */
export const PACING_BUDGETS: Record<Pacing, PacingBudget> = {
  dense: { bodyBaselinePx: 20, maxComponentsPerSlide: 5, bullets: { maxItems: 6, maxUnitsPerItem: 48 } },
  balanced: { bodyBaselinePx: 24, maxComponentsPerSlide: 4, bullets: { maxItems: 5, maxUnitsPerItem: 40 } },
  spacious: { bodyBaselinePx: 32, maxComponentsPerSlide: 3, bullets: { maxItems: 4, maxUnitsPerItem: 30 } },
}

/**
 * All valid {@link Pacing} values, in spec §5 table order. Re-exported
 * from `../ir/narrative-values` — this module's `Pacing` type derives from
 * that same tuple, and {@link PACING_BUDGETS} above is typed
 * `Record<Pacing, ...>`, so TypeScript itself enforces that it has exactly
 * these keys.
 */
export { PACING_VALUES }

// ── Named presets (spec §5, "named presets") ────────────────────────────

export interface NarrativePreset {
  id: string
  axes: NarrativeProfile
  /**
   * Soft theme recommendations — a suggestion, never a hard constraint
   * (spec §5). Surfaced in workflow step ① so an agent can open with a
   * themed proposal — the user may still pick any theme. Every entry here
   * must be a real `BUILTIN_THEME_IDS` member (`ir/index.ts`) — enforced by
   * this module's test suite, which imports and tests against it.
   */
  themeRecommendations: readonly string[]
}

/**
 * Pinned to spec §5's 7 named presets and their theme recommendation table.
 * Preset ids are unchanged by the vocabulary-v4 rename (spec §5: "预设 ID
 * 保持不变") — only each preset's internal axes keys/values follow the
 * strategy/pacing rename (e.g. `annual-review`'s `mode: "narrative"` is now
 * `strategy: "storytelling"`, spec §5's own worked example).
 */
export const NARRATIVE_PRESETS: Record<string, NarrativePreset> = {
  general: {
    id: "general",
    axes: Object.freeze({ strategy: "briefing", pacing: "balanced", audience: "public" }),
    themeRecommendations: ["consulting"],
  },
  "boardroom-report": {
    id: "boardroom-report",
    axes: Object.freeze({ strategy: "pyramid", pacing: "spacious", audience: "executive" }),
    themeRecommendations: ["consulting", "enterprise", "insight"],
  },
  pitch: {
    id: "pitch",
    axes: Object.freeze({ strategy: "pyramid", pacing: "spacious", audience: "customer" }),
    themeRecommendations: ["consulting", "tech", "campaign"],
  },
  training: {
    id: "training",
    axes: Object.freeze({ strategy: "instructional", pacing: "balanced", audience: "technical" }),
    themeRecommendations: ["classroom", "academic", "tech"],
  },
  "product-launch": {
    id: "product-launch",
    axes: Object.freeze({ strategy: "showcase", pacing: "spacious", audience: "customer" }),
    themeRecommendations: ["campaign", "runway", "tech"],
  },
  "weekly-brief": {
    id: "weekly-brief",
    axes: Object.freeze({ strategy: "briefing", pacing: "dense", audience: "technical" }),
    themeRecommendations: ["enterprise", "consulting"],
  },
  "annual-review": {
    id: "annual-review",
    axes: Object.freeze({ strategy: "storytelling", pacing: "balanced", audience: "public" }),
    themeRecommendations: ["journal", "heritage", "insight"],
  },
}

/**
 * = `NARRATIVE_PRESETS.general.axes` (briefing × balanced × public) — the
 * global default when narrative is omitted entirely (spec §5's defaults
 * chain).
 */
export const DEFAULT_NARRATIVE: NarrativeProfile = Object.freeze(NARRATIVE_PRESETS.general.axes)

// ── resolveNarrative (spec §5's defaults chain) ─────────────────────────

const AXIS_KEYS = ["strategy", "pacing", "audience"] as const

/**
 * Resolve a narrative input down to concrete axes, per spec §5's design
 * principle "omission gets the default, a typo is a hard error" (weak-model
 * friendly: a model that leaves a field out gets a sane deck, a model that
 * misspells a value gets a loud, actionable error instead of a silently
 * wrong deck):
 *
 * - `undefined` → {@link DEFAULT_NARRATIVE} (the `general` preset's axes)
 * - a preset id string → that preset's axes (unknown id throws
 *   {@link PptfastError}, listing the available preset ids)
 * - a partial axes object → each axis defaults independently
 *   (strategy → "briefing", pacing → "balanced", audience → "public" — these
 *   happen to equal `DEFAULT_NARRATIVE`'s values because `general` *is* that
 *   exact combination, but the fallback here is per-axis, not "any omitted
 *   axis falls back to the whole default object")
 *
 * An unknown axis value, or an unknown key on the partial axes object,
 * always throws {@link PptfastError} (never silently ignored or dropped) —
 * omission and a typo are different intents, and only the former has a
 * reasonable default.
 *
 * Renamed from `resolveScenario` (spec §8.1). Callers that still hold a
 * pre-rename `mode`/`delivery` shaped input (e.g. a v3 IR's `scenario`
 * field) must migrate it first — see `migrateIrV3ToV4`
 * (`src/ir/migrate.ts`) for the deterministic field/value mapping, or the
 * v4 alias-normalization layer (`src/ir/field-aliases.ts`'s
 * `normalizeNarrativeAliases`) for the same rescue applied automatically to
 * a v4-track document that still writes the old field/value spelling (spec
 * §15.4).
 */
export function resolveNarrative(input: string | Partial<NarrativeProfile> | undefined): NarrativeProfile {
  if (input === undefined) return DEFAULT_NARRATIVE

  if (typeof input === "string") {
    if (!Object.hasOwn(NARRATIVE_PRESETS, input)) {
      throw new PptfastError(
        `unknown narrative preset "${input}" — available: ${Object.keys(NARRATIVE_PRESETS).join(", ")}`,
      )
    }
    return NARRATIVE_PRESETS[input].axes
  }

  for (const key of Object.keys(input)) {
    if (!(AXIS_KEYS as readonly string[]).includes(key)) {
      throw new PptfastError(`unknown narrative axis "${key}" — available: ${AXIS_KEYS.join(", ")}`)
    }
  }

  // `=== undefined` (not `??`): omission gets the default, but an explicit
  // `null` is a written-wrong value and must hard-error like any other typo.
  const strategy = input.strategy === undefined ? DEFAULT_NARRATIVE.strategy : input.strategy
  if (!STRATEGY_VALUES.includes(strategy)) {
    throw new PptfastError(`unknown strategy "${strategy}" — available: ${STRATEGY_VALUES.join(", ")}`)
  }
  const pacing = input.pacing === undefined ? DEFAULT_NARRATIVE.pacing : input.pacing
  if (!PACING_VALUES.includes(pacing)) {
    throw new PptfastError(`unknown pacing "${pacing}" — available: ${PACING_VALUES.join(", ")}`)
  }
  const audience = input.audience === undefined ? DEFAULT_NARRATIVE.audience : input.audience
  if (!AUDIENCE_VALUES.includes(audience)) {
    throw new PptfastError(`unknown audience "${audience}" — available: ${AUDIENCE_VALUES.join(", ")}`)
  }

  return { strategy, pacing, audience }
}
