import { PptfastError } from "../errors"
// MODE_VALUES / DELIVERY_VALUES / AUDIENCE_VALUES (re-exported below, next to
// Mode/Delivery/Audience's own spec-table-order doc comments) live in
// ../ir/scenario-values, not here — see that leaf module's docstring for why
// src/ir owns the shared tuples instead of src/scenario (short version: this
// module's own test suite already imports BUILTIN_THEME_IDS from src/ir, so
// src/ir importing these tuples back from here would risk a cycle).
import { AUDIENCE_VALUES, DELIVERY_VALUES, MODE_VALUES } from "../ir/scenario-values"

// ── Axes (spec §5, "scenario and plan layer") ──────────────────────────
//
// A scenario is three independent axes. Nothing in this module touches
// rendering or selection yet — this wave (W3 task 1) only lays the axes
// types, the mode/delivery data tables, the named presets, and the
// omission-defaults resolver described by spec §5. Weighted layout/component
// selection off `MODE_DEFINITIONS.tendencies` is W4's job. Wiring
// `DELIVERY_BUDGETS` into the content-quality gate is this wave's task 3.
// Putting `scenario` on the IR itself is a later task.

/**
 * Narrative argument style (spec §5's five-way mode classification). Each
 * mode carries a component/layout tendency set (soft-weight material,
 * consumed by W4's weighted selection — nothing consumes it this wave) and
 * a rhythm policy (consumed by W5's plan-validate rotation gate).
 */
export type Mode = (typeof MODE_VALUES)[number]

/**
 * Content density budget + typographic baseline (spec §5 delivery table).
 * See {@link DeliveryBudget} for the dual-attribute capacity split this axis
 * is one half of.
 */
export type Delivery = (typeof DELIVERY_VALUES)[number]

/**
 * Tone anchor only (spec §5: audience is tone-anchoring only, no rendering
 * effect on the IR yet). Reserved for a future lint pass (e.g. executive ×
 * long paragraphs → suggest kpi_cards/verdict_banner instead). The rule set
 * itself is explicitly out of scope this wave (spec §10 open questions).
 */
export type Audience = (typeof AUDIENCE_VALUES)[number]

export interface ScenarioAxes {
  readonly mode: Mode
  readonly delivery: Delivery
  readonly audience: Audience
}

/**
 * All valid {@link Audience} values (no backing record — audience is
 * tone-only, spec §5). Re-exported from `../ir/scenario-values`, this
 * module's single source of truth for the three axes' value tuples (see the
 * import at the top of this file).
 */
export { AUDIENCE_VALUES }

// ── Mode definitions (data only — W4 consumes for weighted selection) ────

export interface ModeDefinition {
  id: Mode
  /**
   * Layout/component tendency set (soft-weight material). Filled row-for-row
   * from spec §5's mode table for W4's weighted selection step (spec §6
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
   * layout ids drawn from spec §5's mode table verbatim and also feeds W5's
   * plan `focus` vocabulary gate, so narrowing its meaning here would be a
   * breaking change to an existing consumer. This field holds only
   * `LAYOUT_REGISTRY` content-archetype ids (`svg/layouts/registry.ts`'s
   * `CONTENT_LAYOUTS` keys) — cover/chapter/ending ids never appear in any
   * mode's list here, which is exactly why `resolveArchetypeId`'s weighting
   * is a no-op for those three slide types (spec: "身份页个性来自 theme 不来自
   * mode，均匀取样") without needing a slide-type special case — a weight
   * lookup against an id that can never match falls through to the ×1 floor
   * for every candidate, uniform by construction. `tone-adaptive-content`
   * appears in no mode's list either (spec's "万金油" call-out: it is the one
   * content archetype meant to read as mode-neutral, so it always gets the
   * ×1 floor too).
   */
  layoutTendencies: readonly string[]
  /**
   * Rhythm template descriptor (spec §5's per-mode rhythm-default column),
   * parameterized by mode for W5's plan-validate rotation gate — e.g.
   * briefing is exempt from a generic "three same-rhythm pages in a row is
   * an error" rule because uniform-dense *is* briefing's correct default,
   * not a violation of it (spec §5's plan-gate section calls out that a
   * generic same-rhythm-streak rule would reject briefing's own default).
   * Not consumed this wave.
   */
  rhythmPolicy: "anchor-open" | "alternate" | "repetition-ok" | "anchor-sparse" | "uniform-dense"
}

export const MODE_DEFINITIONS: Record<Mode, ModeDefinition> = {
  pyramid: {
    id: "pyramid",
    tendencies: ["kpi_cards", "verdict_banner", "chart", "comparison", "matrix", "roadmap"],
    // MECE 结论先行——密集数据型 body（bento 卡片拼盘/横幅断言）+ 两栏对比。
    layoutTendencies: ["bento-panel", "banner-heading", "two-column"],
    rhythmPolicy: "anchor-open",
  },
  narrative: {
    id: "narrative",
    // Spec's "image family" entry normalizes to the four kebab image-family
    // layout ids (W2 promoted them from a `variant` value to first-class
    // layouts — see the "image-split"/"image-top"/"image-bottom"/
    // "image-annotate" entries in `LAYOUT_REGISTRY`). image_grid is a
    // distinct component type, not part of this family — it only shows up
    // in showcase's row below, matching the spec table.
    tendencies: ["quote", "image-split", "image-top", "image-bottom", "image-annotate", "timeline", "callout"],
    // 情境→张力→解决——单栏行文（narrow-column）+ 海报式单点强调（stacked-poster）。
    layoutTendencies: ["narrow-column", "stacked-poster"],
    rhythmPolicy: "alternate",
  },
  instructional: {
    id: "instructional",
    tendencies: ["steps", "numbered_cards", "flowchart", "architecture", "code"],
    // 分步拆解——编号导轨（rail-numbered）+ 两栏步骤对照。
    layoutTendencies: ["rail-numbered", "two-column"],
    rhythmPolicy: "repetition-ok",
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
    rhythmPolicy: "anchor-sparse",
  },
  briefing: {
    id: "briefing",
    tendencies: ["bullets", "row_cards", "timeline", "citation"],
    // 中性通报可扫读——横幅断言 + 卡片拼盘 + 两栏，三种扫读友好排布并重。
    layoutTendencies: ["banner-heading", "bento-panel", "two-column"],
    rhythmPolicy: "uniform-dense",
  },
}

/**
 * All valid {@link Mode} values, in spec §5 table order. Re-exported from
 * `../ir/scenario-values` — this module's `Mode` type derives from that same
 * tuple, and {@link MODE_DEFINITIONS} above is typed `Record<Mode, ...>`, so
 * TypeScript itself enforces that it has exactly these keys.
 */
export { MODE_VALUES }

// ── Delivery budgets (editorial half of the dual-attribute capacity split) ─

export interface DeliveryBudget {
  /**
   * Body-text baseline, in px, at 1280×720 slide geometry (spec §5
   * delivery table's body-baseline column). Declarative until W4 wires
   * rendering: this wave (W3) only stores the number, no template reads it
   * yet, and the current fixed-size rendering geometry (and its pinned
   * snapshot tests) is unaffected. Spec §5's W3-decomposition amendment
   * note is explicit that the body-baseline column is a render-level
   * change, deferred to W4 alongside the theme.layouts full-set rollout
   * (both land together as one controlled snapshot-baseline re-pin).
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
     * check because every delivery's editorial budget here (30/40/48) is
     * already strictly tighter than it — the quality gate now applies
     * exactly this one number per delivery.
     */
    maxUnitsPerItem: number
  }
}

/**
 * Pinned to spec §5's delivery table (`bodyBaselinePx` / editorial budget /
 * bullets budget columns): text 20/5/6×48, balanced 24/4/5×40,
 * presentation 32/3/4×30.
 */
export const DELIVERY_BUDGETS: Record<Delivery, DeliveryBudget> = {
  text: { bodyBaselinePx: 20, maxComponentsPerSlide: 5, bullets: { maxItems: 6, maxUnitsPerItem: 48 } },
  balanced: { bodyBaselinePx: 24, maxComponentsPerSlide: 4, bullets: { maxItems: 5, maxUnitsPerItem: 40 } },
  presentation: { bodyBaselinePx: 32, maxComponentsPerSlide: 3, bullets: { maxItems: 4, maxUnitsPerItem: 30 } },
}

/**
 * All valid {@link Delivery} values, in spec §5 table order. Re-exported
 * from `../ir/scenario-values` — this module's `Delivery` type derives from
 * that same tuple, and {@link DELIVERY_BUDGETS} above is typed
 * `Record<Delivery, ...>`, so TypeScript itself enforces that it has exactly
 * these keys.
 */
export { DELIVERY_VALUES }

// ── Named presets (spec §5, "named presets") ────────────────────────────

export interface ScenarioPreset {
  id: string
  axes: ScenarioAxes
  /**
   * Soft theme recommendations — a suggestion, never a hard constraint
   * (spec §5). Surfaced in workflow step ① so an agent can open with a
   * themed proposal — the user may still pick any theme. Every entry here
   * must be a real `BUILTIN_THEME_IDS` member (`ir/index.ts`) — enforced by
   * this module's test suite, which imports and tests against it.
   */
  themeRecommendations: readonly string[]
}

/** Pinned to spec §5's 7 named presets and their theme recommendation table. */
export const SCENARIO_PRESETS: Record<string, ScenarioPreset> = {
  general: {
    id: "general",
    axes: Object.freeze({ mode: "briefing", delivery: "balanced", audience: "public" }),
    themeRecommendations: ["consulting"],
  },
  "boardroom-report": {
    id: "boardroom-report",
    axes: Object.freeze({ mode: "pyramid", delivery: "presentation", audience: "executive" }),
    themeRecommendations: ["consulting", "enterprise", "insight"],
  },
  pitch: {
    id: "pitch",
    axes: Object.freeze({ mode: "pyramid", delivery: "presentation", audience: "customer" }),
    themeRecommendations: ["consulting", "tech", "campaign"],
  },
  training: {
    id: "training",
    axes: Object.freeze({ mode: "instructional", delivery: "balanced", audience: "technical" }),
    themeRecommendations: ["classroom", "academic", "tech"],
  },
  "product-launch": {
    id: "product-launch",
    axes: Object.freeze({ mode: "showcase", delivery: "presentation", audience: "customer" }),
    themeRecommendations: ["campaign", "runway", "tech"],
  },
  "weekly-brief": {
    id: "weekly-brief",
    axes: Object.freeze({ mode: "briefing", delivery: "text", audience: "technical" }),
    themeRecommendations: ["enterprise", "consulting"],
  },
  "annual-review": {
    id: "annual-review",
    axes: Object.freeze({ mode: "narrative", delivery: "balanced", audience: "public" }),
    themeRecommendations: ["journal", "heritage", "insight"],
  },
}

/**
 * = `SCENARIO_PRESETS.general.axes` (briefing × balanced × public) — the
 * global default when scenario is omitted entirely (spec §5's defaults
 * chain).
 */
export const DEFAULT_SCENARIO: ScenarioAxes = Object.freeze(SCENARIO_PRESETS.general.axes)

// ── resolveScenario (spec §5's defaults chain) ──────────────────────────

const AXIS_KEYS = ["mode", "delivery", "audience"] as const

/**
 * Resolve a scenario input down to concrete axes, per spec §5's design
 * principle "omission gets the default, a typo is a hard error" (weak-model
 * friendly: a model that leaves a field out gets a sane deck, a model that
 * misspells a value gets a loud, actionable error instead of a silently
 * wrong deck):
 *
 * - `undefined` → {@link DEFAULT_SCENARIO} (the `general` preset's axes)
 * - a preset id string → that preset's axes (unknown id throws
 *   {@link PptfastError}, listing the available preset ids)
 * - a partial axes object → each axis defaults independently
 *   (mode → "briefing", delivery → "balanced", audience → "public" — these
 *   happen to equal `DEFAULT_SCENARIO`'s values because `general` *is* that
 *   exact combination, but the fallback here is per-axis, not "any omitted
 *   axis falls back to the whole default object")
 *
 * An unknown axis value, or an unknown key on the partial axes object,
 * always throws {@link PptfastError} (never silently ignored or dropped) —
 * omission and a typo are different intents, and only the former has a
 * reasonable default.
 */
export function resolveScenario(input: string | Partial<ScenarioAxes> | undefined): ScenarioAxes {
  if (input === undefined) return DEFAULT_SCENARIO

  if (typeof input === "string") {
    if (!Object.hasOwn(SCENARIO_PRESETS, input)) {
      throw new PptfastError(
        `unknown scenario preset "${input}" — available: ${Object.keys(SCENARIO_PRESETS).join(", ")}`,
      )
    }
    return SCENARIO_PRESETS[input].axes
  }

  for (const key of Object.keys(input)) {
    if (!(AXIS_KEYS as readonly string[]).includes(key)) {
      throw new PptfastError(`unknown scenario axis "${key}" — available: ${AXIS_KEYS.join(", ")}`)
    }
  }

  // `=== undefined` (not `??`): omission gets the default, but an explicit
  // `null` is a written-wrong value and must hard-error like any other typo.
  const mode = input.mode === undefined ? DEFAULT_SCENARIO.mode : input.mode
  if (!MODE_VALUES.includes(mode)) {
    throw new PptfastError(`unknown mode "${mode}" — available: ${MODE_VALUES.join(", ")}`)
  }
  const delivery = input.delivery === undefined ? DEFAULT_SCENARIO.delivery : input.delivery
  if (!DELIVERY_VALUES.includes(delivery)) {
    throw new PptfastError(`unknown delivery "${delivery}" — available: ${DELIVERY_VALUES.join(", ")}`)
  }
  const audience = input.audience === undefined ? DEFAULT_SCENARIO.audience : input.audience
  if (!AUDIENCE_VALUES.includes(audience)) {
    throw new PptfastError(`unknown audience "${audience}" — available: ${AUDIENCE_VALUES.join(", ")}`)
  }

  return { mode, delivery, audience }
}
