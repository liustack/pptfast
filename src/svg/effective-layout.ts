/**
 * Effective-layout resolution (W3 task 3, spec §5's dual-attribute capacity
 * split): answers "which layout will `FullSlideSvg` actually draw this
 * slide's body with" — the geometric half of the density gate's
 * `min(delivery editorial budget, layout capacity)` formula. The other half
 * (`DELIVERY_BUDGETS`) lives in `@/scenario`; this module owns the layout
 * side and nothing else.
 *
 * CRITICAL invariant (spec §5's W3 amendment note: "选型确定性保证 validate
 * 所见 = render 所用"): `resolveArchetypeId` below is the *only* place the
 * seed+ordinal archetype-selection mechanics live. `FullSlideSvg.tsx`'s own
 * `resolveArchetype` calls it instead of reimplementing it — any drift
 * between a validate-time copy and the render-time original would silently
 * break the "what validate approved is what render draws" promise this gate
 * exists to keep. Do not duplicate this function's body elsewhere; extend or
 * call it.
 */
import type { PptxIR, Slide } from "@/ir"
import { resolveStyle } from "../themes"
import { getThemeDefinition, type ThemeDefinition } from "../themes/definitions"
import { findImageComponent } from "./layouts/find-image"
import { getLayout } from "./layouts/registry"
import { cachedDeckSeed, pickBySeedRotating } from "./variety"

/**
 * Resolve the archetype registry id for one page-type slot: an explicit
 * `requestedLayout` short-circuits selection when it names a registered
 * `kind: "archetype"` layout applicable to `slideType` (spec §3: "要版式完全
 * 不动就显式写 layout 字段" — explicit pin bypasses `theme.layouts` curation
 * unconditionally, it is not a soft preference confined to the curated
 * family); otherwise a seed+ordinal weighted pick rotates within the theme's
 * curated `layouts[slideType]` allowed set (`pickBySeedRotating` — spec §3.4
 * "相邻页轮换"). Returns `null` only for the allowed-set-empty defensive
 * fallback (unreachable for the 13 built-in themes — every one has a
 * non-empty allowed set for all four slide types — kept for future/custom
 * themes, same "total function, never crash" posture as `resolveThemeId`).
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
  typeOrdinal: number,
  requestedLayout: string | undefined,
): string | null {
  if (requestedLayout) {
    const def = getLayout(requestedLayout)
    if (def?.kind === "archetype" && def.slideTypes.includes(slideType)) {
      return requestedLayout
    }
  }
  const allowed: readonly string[] = layouts[slideType]
  if (allowed.length === 0) return null
  return pickBySeedRotating(seed, `${slideType}-archetype`, allowed, typeOrdinal)
}

/**
 * Resolve the `LAYOUT_REGISTRY` id `FullSlideSvg` will actually render
 * `slide`'s body with, or `null` when render bypasses the registry entirely
 * (the background-image cover takeover — see below). Mirrors
 * `FullSlideSvg.tsx`'s own dispatch order exactly:
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
 *    above with this slide's `typeOrdinal` (its 0-based position among
 *    same-`type` slides earlier in the deck — P3 item ② rotation) and the
 *    deck's cached seed.
 */
export function resolveEffectiveLayoutId(ir: PptxIR, slide: Slide, index: number): string | null {
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
  let typeOrdinal = 0
  for (let i = 0; i < index && i < ir.slides.length; i++) {
    if (ir.slides[i].type === slide.type) typeOrdinal++
  }
  return resolveArchetypeId(slide.type, themeDef.layouts, cachedDeckSeed(ir), typeOrdinal, slide.layout)
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
