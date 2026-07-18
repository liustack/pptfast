/**
 * Effective-layout resolution (W3 task 3, spec §5's dual-attribute capacity
 * split; selection mechanics upgraded in W4, spec §6 steps 4-5 — see below):
 * answers "which layout will `FullSlideSvg` actually draw this slide's body
 * with" — the geometric half of the density gate's `min(delivery editorial
 * budget, layout capacity)` formula. The other half (`DELIVERY_BUDGETS`)
 * lives in `@/scenario`; this module owns the layout side and nothing else.
 *
 * CRITICAL invariant (spec §5's W3 amendment note: "选型确定性保证 validate
 * 所见 = render 所用"): `resolveArchetypeId` below is the *only* place the
 * scenario-weighted seed-sampling + adjacent-anti-repetition
 * archetype-selection mechanics live. `FullSlideSvg.tsx`'s own
 * `resolveArchetype` calls it instead of reimplementing it — any drift
 * between a validate-time copy and the render-time original would silently
 * break the "what validate approved is what render draws" promise this gate
 * exists to keep. Do not duplicate this function's body elsewhere; extend or
 * call it.
 */
import type { PptxIR, Slide } from "@/ir"
import { MODE_DEFINITIONS, resolveScenario, type Mode, type ScenarioAxes } from "@/scenario"
import { resolveStyle } from "../themes"
import { getThemeDefinition, type ThemeDefinition } from "../themes/definitions"
import { findImageComponent } from "./layouts/find-image"
import { filterByScenariosOnly, getLayout } from "./layouts/registry"
import { cachedDeckSeed, weightedPickBySeed } from "./variety"

/**
 * Soft-weight multipliers for `MODE_DEFINITIONS[mode].layoutTendencies`
 * (spec §6 step 4, W4 design decision 1): a candidate whose id is in the
 * resolved mode's tendency set gets `TENDENCY_WEIGHT`, every other candidate
 * gets the `BASE_WEIGHT` floor — cover/chapter/ending candidates always fall
 * in the latter bucket since no mode's `layoutTendencies` ever names a
 * non-content id (that field's own doc comment, `@/scenario`). Initial
 * values, not yet tuned against a real corpus (spec §6: "权重初值...为待调
 * 参数，实现期以 audit baseline 全量渲染分布验证") — expect these two
 * constants, not the sampling mechanism itself, to move if a later wave's
 * audit finds the skew too strong or too weak.
 */
const TENDENCY_WEIGHT = 3
const BASE_WEIGHT = 1

/**
 * Resolve the archetype registry id for one page-type slot (spec §6 steps
 * 3-5, W4 final form). An explicit `requestedLayout` short-circuits every
 * step below when it names a registered `kind: "archetype"` layout
 * applicable to `slideType` (spec §3: "要版式完全不动就显式写 layout 字段" —
 * explicit pin bypasses `theme.layouts` curation, `scenariosOnly`, and
 * scenario weighting unconditionally, it is not a soft preference confined
 * to the curated family). Otherwise:
 *
 * 1. **theme.layouts curation** (step 3, already the caller's job — this
 *    function just reads `layouts[slideType]` as the starting pool).
 * 2. **`scenariosOnly` hard filter** (step 4's rare constraint,
 *    {@link filterByScenariosOnly}): drop any candidate whose allowlist is
 *    set and excludes the resolved `mode`. An empty result after this step
 *    folds into the same `null` defensive fallback as an empty curated pool
 *    (unreachable for the 13 built-in themes today — no built-in layout
 *    sets `scenariosOnly` yet).
 * 3. **scenario soft weighting** (step 4's ×3/×1, `TENDENCY_WEIGHT`/
 *    `BASE_WEIGHT` above) **+ weighted seed sampling** (step 5,
 *    `weightedPickBySeed` — salt is `` `${slideType}-archetype:${pageKey}` ``,
 *    W4 design decision 2: `pageKey` is the caller-resolved `slide.id ??
 *    String(index)`, replacing the retired same-type ordinal rotation so a
 *    mid-deck insert/reorder no longer reshuffles every other page's pick).
 * 4. **Adjacent anti-repetition** (W4 design decision 4, local
 *    post-process): if the step-3 pick equals `previousEffectiveLayoutId`
 *    (slide i-1's own final resolved id, any slide type — supplied by the
 *    caller, never re-derived here) and the pool has more than one member,
 *    redraw once against the same salt with that id removed (deterministic
 *    runner-up). A pool of exactly 1 never redraws — there is no
 *    alternative — and this step never runs for an explicit pin (returned
 *    already, above) or the first slide (`previousEffectiveLayoutId` is
 *    `null` there, which no real layout id ever equals).
 *
 * Returns `null` only for the allowed-set-empty defensive fallback
 * (unreachable for the 13 built-in themes — every one has a non-empty
 * allowed set for all four slide types — kept for future/custom themes,
 * same "total function, never crash" posture as `resolveThemeId`).
 *
 * Pulled out of `FullSlideSvg.tsx`'s old private `resolveArchetype` (W3 task
 * 3 extraction) so this exact selection logic has exactly one copy, callable
 * from both the render path and this module's own
 * `resolveEffectiveLayoutId` below.
 */
export function resolveArchetypeId(
  slideType: Slide["type"],
  layouts: ThemeDefinition["layouts"],
  seed: number,
  pageKey: string,
  requestedLayout: string | undefined,
  mode: Mode,
  previousEffectiveLayoutId: string | null,
): string | null {
  if (requestedLayout) {
    const pinnedDef = getLayout(requestedLayout)
    if (pinnedDef?.kind === "archetype" && pinnedDef.slideTypes.includes(slideType)) {
      return requestedLayout
    }
  }

  const curated: readonly string[] = layouts[slideType]
  const curatedDefs = curated
    .map((id) => getLayout(id))
    .filter((def): def is NonNullable<typeof def> => def !== undefined)
  const pool = filterByScenariosOnly(curatedDefs, mode).map((def) => def.id)
  if (pool.length === 0) return null

  const tendencies = MODE_DEFINITIONS[mode].layoutTendencies
  const weightOf = (id: string): number => (tendencies.includes(id) ? TENDENCY_WEIGHT : BASE_WEIGHT)
  const salt = `${slideType}-archetype:${pageKey}`
  const picked = weightedPickBySeed(seed, salt, pool, weightOf)

  if (picked === previousEffectiveLayoutId && pool.length > 1) {
    const remainder = pool.filter((id) => id !== previousEffectiveLayoutId)
    return weightedPickBySeed(seed, salt, remainder, weightOf)
  }
  return picked
}

/**
 * Resolve the resolved scenario `mode` for `ir` (spec §6 step 4's input) —
 * a plain, uncached call to the shared `resolveScenario` (`@/scenario`),
 * same posture as every other call site (`ir-quality.ts`, `plan/index.ts`,
 * `cli/commands.ts`): cheap (no hashing, just object/string comparisons),
 * so unlike `deckSeed` it doesn't warrant its own memoization. The IR
 * schema's `scenario` field is open at the type layer (`string |
 * Record<string, unknown> | undefined` — see `ir/index.ts`'s own doc
 * comment on why); `resolveScenario` is the sole semantic authority that
 * narrows and validates it, so the cast here is the same one every other
 * caller already performs.
 */
function resolveIrMode(ir: PptxIR): Mode {
  return resolveScenario(ir.scenario as string | Partial<ScenarioAxes> | undefined).mode
}

/**
 * Single per-slide resolution step, shared by the deck-wide fold below —
 * mirrors `FullSlideSvg.tsx`'s own dispatch order exactly:
 *
 * 1. **Image-cover takeover** (cover/chapter with an asset background —
 *    `ImageCoverPage`): bespoke full-page chrome with no `LAYOUT_REGISTRY`
 *    entry to cite, so this returns `null`. Content/ending asset backgrounds
 *    stay on the normal archetype path (P1 frosted scrim, not a takeover —
 *    unaffected).
 * 2. **Image-family takeover** (`image-split`/`image-top`/`image-bottom`/
 *    `image-annotate` — `slide.layout` pinned to one of these *and* an
 *    `image` component present, `ImagePages.tsx`): returns that takeover id
 *    itself. A pinned takeover id with no image component does **not**
 *    count — render's own `splitTakeover` check requires both, and falls
 *    through to the archetype path below when only the id is set (see
 *    `FullSlideSvg.test.tsx`'s "falls back to seed-pick... kind takeover not
 *    archetype" case) — replicated here via the same `findImageComponent`
 *    helper render itself calls, not a re-derived condition.
 * 3. **Archetype** (the common case): delegates to `resolveArchetypeId`
 *    above with this slide's salt `pageKey` and `previousEffectiveLayoutId`
 *    (both supplied by the caller — this function never re-derives them, so
 *    there is exactly one place that walks the deck to produce them, see
 *    `resolveDeckEffectiveLayoutIds` below).
 */
function resolveOneEffectiveLayoutId(
  ir: PptxIR,
  slide: Slide,
  seed: number,
  mode: Mode,
  pageKey: string,
  previousEffectiveLayoutId: string | null,
): string | null {
  const tokens = resolveStyle(ir.theme.id, ir.theme.style)
  const bgSpec = slide.background ?? tokens.defaultBackgrounds[slide.type]
  const imageCoverTakeover = bgSpec.kind === "asset" && (slide.type === "cover" || slide.type === "chapter")
  if (imageCoverTakeover) return null

  if (slide.layout) {
    const requestedLayoutDef = getLayout(slide.layout)
    if (requestedLayoutDef?.kind === "takeover" && findImageComponent(slide) != null) {
      return slide.layout
    }
  }

  const themeDef = getThemeDefinition(ir.theme.id)
  return resolveArchetypeId(
    slide.type,
    themeDef.layouts,
    seed,
    pageKey,
    slide.layout,
    mode,
    previousEffectiveLayoutId,
  )
}

/**
 * Deck-wide fold cache (W4 design decision 4: "对 ir 的一次左折叠 + WeakMap
 * 缓存（同 cachedDeckSeed 模式）"): adjacent anti-repetition needs slide
 * i-1's *final* effective layout id before slide i can resolve, so the
 * whole deck is walked once, in order, on first access for a given `ir`;
 * every later lookup (any index) is an O(1) array read instead of a re-fold.
 * `ir` object identity is the cache key — same lifetime reasoning as
 * `variety.ts`'s `cachedDeckSeed`: stable within one render/validate pass,
 * naturally invalidated the moment a caller builds a new IR object.
 */
const deckEffectiveLayoutIdsCache = new WeakMap<PptxIR, readonly (string | null)[]>()

function resolveDeckEffectiveLayoutIds(ir: PptxIR): readonly (string | null)[] {
  const cached = deckEffectiveLayoutIdsCache.get(ir)
  if (cached) return cached

  const seed = cachedDeckSeed(ir)
  const mode = resolveIrMode(ir)
  const deckIds: (string | null)[] = []
  for (let i = 0; i < ir.slides.length; i++) {
    const slide = ir.slides[i]
    const previous = i > 0 ? deckIds[i - 1] : null
    deckIds.push(resolveOneEffectiveLayoutId(ir, slide, seed, mode, slide.id ?? String(i), previous))
  }
  deckEffectiveLayoutIdsCache.set(ir, deckIds)
  return deckIds
}

/**
 * Resolve the `LAYOUT_REGISTRY` id `FullSlideSvg` will actually render
 * `slide`'s body with, or `null` when render bypasses the registry entirely
 * (the background-image cover takeover). Public signature unchanged since
 * W3 (`ir`, `slide`, `index`), but the implementation now answers from the
 * memoized whole-deck fold above (`resolveDeckEffectiveLayoutIds`) — every
 * real caller passes `slide === ir.slides[index]` (render's `FullSlideSvg`,
 * `ir-quality.ts`'s per-slide loop, every SDK entry point), so that fold's
 * own per-index resolution already *is* the answer for `slide`. The
 * fallback branch below only exists for the (untested-in-practice, never
 * hit by any real call site) case of a caller passing an `index` outside
 * `ir.slides` or a `slide` that isn't that exact array element — it still
 * resolves correctly by calling the same single-slide step directly,
 * reusing the fold only for `previousEffectiveLayoutId` (adjacent
 * anti-repetition's one cross-slide input), so even that path can never
 * drift from the canonical mechanics in `resolveArchetypeId`.
 */
export function resolveEffectiveLayoutId(ir: PptxIR, slide: Slide, index: number): string | null {
  const deckIds = resolveDeckEffectiveLayoutIds(ir)
  if (index >= 0 && index < ir.slides.length && ir.slides[index] === slide) {
    return deckIds[index]
  }
  const seed = cachedDeckSeed(ir)
  const mode = resolveIrMode(ir)
  const previous = index > 0 ? (deckIds[index - 1] ?? null) : null
  return resolveOneEffectiveLayoutId(ir, slide, seed, mode, slide.id ?? String(index), previous)
}

export interface EffectiveLayoutBodyCapacity {
  /** The id `resolveEffectiveLayoutId` returned — `null` for the image-cover bypass. */
  layoutId: string | null
  /**
   * The resolved layout's `body`-slot declarative capacity (`registry.ts`'s
   * `LayoutDefinition.slots`), or `undefined` when there is no geometric
   * term to apply: the image-cover bypass (`layoutId === null`), any of the
   * 4 image-family takeovers (their `body` slot — or no slot at all, for
   * `image-annotate` — carries no `capacity`), or a (defensive,
   * unreachable-today) unregistered id. Callers must treat `undefined` as
   * "no ceiling" (`?? Infinity`), never as zero.
   */
  capacity: number | undefined
}

/**
 * The geometric half of W3's density gate (spec §5: `min(delivery editorial
 * budget, resolved layout's block capacity)`) — `src/svg/ir-quality.ts`'s
 * sole consumer. Looks up the `body` slot on whatever
 * `resolveEffectiveLayoutId` resolved; every non-bypass path (explicit
 * archetype pin, auto-pick, or a pinned takeover) funnels through the same
 * `LAYOUT_REGISTRY` lookup, so bento-panel's declared capacity 6 (vs. the
 * other 6 content archetypes' flat 4) and the 4 takeovers' "no capacity"
 * fall out of this one lookup without a separate case per layout kind.
 */
export function resolveEffectiveLayoutBodyCapacity(
  ir: PptxIR,
  slide: Slide,
  index: number,
): EffectiveLayoutBodyCapacity {
  const layoutId = resolveEffectiveLayoutId(ir, slide, index)
  const capacity = layoutId === null ? undefined : getLayout(layoutId)?.slots.find((s) => s.name === "body")?.capacity
  return { layoutId, capacity }
}
