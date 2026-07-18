/**
 * assembleDeck / disassembleDeck — plan + per-page content → IR, and back
 * (spec §5's "assemble is a pure SDK function", W5 task 3).
 *
 * `assembleDeck` is the pure-function half of the deck-project directory
 * concept (spec §7): a locked {@link DeckPlan} (§5's workflow artifact,
 * validated by `validatePlan` in `./index.ts`) plus a `pages` record keyed
 * by page id, materialized into a renderable {@link PptxIR}. The CLI's
 * directory wrapper (W5 task 5, not this file) is the only Node-touching
 * piece — it reads `deck.plan.json` + `pages/<id>.json` off disk and calls
 * straight through to {@link assembleDeck}, exactly like `src/cli/commands.ts`
 * already wraps `validateIr`/`validatePlan`. This module itself stays zero-fs
 * (no `node:*` imports, nothing from `src/cli*` or `src/platform/node.ts`) so
 * it can sit in `src/index.ts`'s dependency closure (`AGENTS.md`'s layout
 * rule) — the exact same posture `./index.ts` (this folder's schema/validate
 * module) already holds, documented in that file's own top comment.
 *
 * `assembleDeck` also materializes each page's effective layout id into its
 * own `layout` field when the page file omitted one (W4 design decision 10):
 * once the IR above is built and schema-validated, every slide whose
 * `layout` is still unset gets exactly what `resolveEffectiveLayoutId`
 * (`../svg/effective-layout.ts`) resolves for it — the same function the
 * render chain itself calls, so `deck.json` never carries a second,
 * independently-derived guess at what a page will render as (see this
 * module's own {@link materializeEffectiveLayouts} for the mechanics). A page
 * whose file already set `layout` is left untouched. `../svg/effective-layout.ts`
 * is a pure function with no Node-only import anywhere in its own closure and
 * nothing in that closure imports back from `src/plan`, so depending on it
 * from here adds a new edge, not a cycle, and does not pull anything
 * Node-only into `src/index.ts`'s dependency closure.
 *
 * `disassembleDeck` is the documented-lossy inverse (spec §7: "disassemble
 * — the inverse of assemble, an optional tail item for W5"): it reconstructs a plan + pages record from
 * an existing IR, well enough that re-`assembleDeck`-ing the result
 * reproduces the same slide content, but plan-only fields that never made it
 * into the IR in the first place (`rhythm`, `focus`, and `summary` on
 * anything but a placeholder page) cannot be recovered — see that function's
 * own doc comment for the full accounting.
 */
import { PptfastError } from "../errors"
import { PptxIRSchema, type BackgroundSpec, type Component, type PptxIR, type Slide } from "../ir"
import { resolveEffectiveLayoutId } from "../svg/effective-layout"
import { formatInvalidPlanError, validatePlan, type DeckPlan, type PlanPage } from "./index"

// ── PageContent (per-page authoring record, spec §7's `pages/<id>.json`) ──

/**
 * One page's fillable content — everything a plan page's `id` does *not*
 * already lock in. Deliberately excludes `type`/`heading` (plan-owned, see
 * {@link assembleDeck}'s locked-field gate) and `subheading`/`decor`
 * (legitimate `Slide` fields, but outside this record's shape by spec §7's
 * own layout — "pages/<id>.json contains only components" — a plan/pages deck can't
 * author either one — a hand-authored bare IR still can). Every field here is
 * a same-name, same-shape subset of `Slide`'s own optional fields
 * (`../ir`'s `SlideSchema`) — reused, not redeclared, so the two can't drift.
 */
export interface PageContent {
  components?: Component[]
  layout?: string
  arrangement?: NonNullable<Slide["arrangement"]>
  background?: BackgroundSpec
  image_side?: "left" | "right"
  footnote?: string
}

export interface AssembleResult {
  ir: PptxIR
  /**
   * Set only when `plan.seed` was absent and {@link assembleDeck} generated
   * one deterministically (see the seed section of this function's doc
   * comment) — `undefined` when `plan.seed` was already present and simply
   * passed through. The CLI shell (W5 task 5) is the one that acts on this:
   * suggest writing the value back into the plan file, never rewrite it
   * itself (assemble stays a pure function, no fs side effects here).
   */
  generatedSeed?: number
  /**
   * Count of pages whose `layout` field this call filled in via
   * {@link materializeEffectiveLayouts} (W4 design decision 10) —
   * `undefined` when zero, same "absent means nothing to report" posture as
   * {@link generatedSeed} just above (a page with an explicit pin already in
   * its page file, or every omitted page landing on the image-cover
   * takeover's `null` bypass, both leave this unset). Purely informational:
   * the CLI shell (`runAssemble`, `../cli/commands.ts`) surfaces it as a
   * one-line note, nothing here or downstream acts on the number itself.
   */
  materializedLayoutCount?: number
}

// ── deterministic seed generation ───────────────────────────────────────

/**
 * djb2 string hash. The exact same five-line algorithm as
 * `svg/variety.ts`'s `stableHash` (and `svg/components/chart-svg.tsx`'s own
 * private copy of it) — reimplemented locally here for the same reason
 * those two already give each other in `variety.ts`'s doc comment: it is a
 * five-line primitive, and importing it from `svg/variety.ts` would pull a
 * `plan → svg` dependency this module has no business taking. `src/plan`
 * sits beside `src/ir` (an IR-adjacent, pre-render authoring concern).
 * `src/svg` is a *consumer* of IR (the render chain), not a neighbor of
 * `plan` — reaching "up" into it here would point the dependency arrow the
 * wrong way for what is conceptually a lower-level module. The two hashes
 * are also semantically independent on purpose (see {@link generateSeed}):
 * this one intentionally excludes heading text that `deckSeed` intentionally
 * includes, so sharing an implementation would invite sharing behavior that
 * must not be shared.
 */
function stableHash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * Deterministic seed for a plan that omits `seed` (spec §5's "seed mechanism
 * revision": modification stability requires an *explicit*, persisted seed —
 * this is the one-time generation `assembleDeck` performs on first
 * materialization, spec's own words: "generated once at creation time,
 * stable thereafter"). Hashes `filename + the plan's own
 * ordered page-id sequence` — deliberately *not* heading text or any
 * per-page content, unlike `svg/variety.ts`'s `deckSeed` (pre-v0.3 content
 * hash, still used when a bare IR omits `seed` entirely): editing an
 * existing page's heading or components must not reshuffle every other
 * page's auto-selected layout (the exact regression spec §6 calls out this
 * seed field to fix), so this hash is a function of deck *shape* — which
 * pages exist, in what order — not deck *content*. Reordering, adding, or
 * removing pages does change it (page identity plus position both feed the
 * hash: two decks with the same id set in a different order still hash
 * differently — join with a separator no id can itself contain, `"\n"`, so
 * `["ab", "c"]` and `["a", "bc"]` can never collide).
 */
function generateSeed(filename: string | undefined, pageIds: readonly string[]): number {
  return stableHash([filename ?? "", ...pageIds].join("\n"))
}

// ── assembleDeck ────────────────────────────────────────────────────────

const LOCKED_KEYS = ["type", "heading"] as const

/**
 * Assemble a validated plan plus a per-page content record into a renderable
 * IR. See this module's own top comment for the overall shape. Step numbers
 * below match the W5 task-3 brief's own numbered "inject semantics" list verbatim —
 * kept in that exact order because two of them (locked-field vs. orphan)
 * both throw and their relative order is otherwise unobservable from either
 * doc comment alone.
 *
 * 1. `plan` is `unknown` (same boundary `validatePlan` itself has — a plan
 *    is almost always freshly `JSON.parse`d off disk by the caller) —
 *    invalid shape or a failed hard gate throws {@link PptfastError} with
 *    `validatePlan`'s own formatted issue list, not a re-derived message.
 * 2. Shape guard + locked-field protection: a `pages[id]` entry must first be
 *    a plain object — not `null`, an array, or a primitive — else throws.
 *    `pages` is `unknown`-shaped off disk same as `plan` itself (step 1), so
 *    a JSON `null`/string/array content value is a real possibility, not
 *    just a type-system hole, and `Object.hasOwn` throws its own
 *    uninformative native `TypeError` on `null` (and silently no-ops on a
 *    string/array/number) rather than this gate's own readable message.
 *    Once that holds, a `pages[id]` entry that carries a `type` or `heading`
 *    *key* — even set to `undefined` — throws. `Object.hasOwn`, not a
 *    `!== undefined` read, is what makes that "even `undefined`" case
 *    catchable: `PageContent` itself never declares either field, but a
 *    page file freshly parsed off disk is `unknown` before it reaches this
 *    function's declared `PageContent` parameter type, so a stray
 *    `"heading": null`-turned-`undefined` or a copy-pasted empty key is
 *    exactly the drift this gate exists to catch instead of silently
 *    ignoring.
 * 3. Orphan keys: a `pages` entry whose id isn't any plan page's id. Listed
 *    together with a fix suggestion, checked only after every present page
 *    has cleared the locked-field gate (step 2) — an orphan file that
 *    *also* happens to redeclare `heading` reports as locked-field first.
 * 4. Missing pages (a plan id with no `pages` entry) become a placeholder
 *    slide — never an error. Spec §7's own words: "assemble's precise
 *    semantics — a missing page always succeeds (placeholder), a structural
 *    contradiction (orphan file / bad plan / id conflict) errors". A
 *    declared `summary` becomes the placeholder's `subheading` (the one spot
 *    `summary` — otherwise a plan-only anchor, see step 5 — does reach the
 *    IR) so a `--draft` preview of an unfilled deck still reads as more than
 *    a bare "Untitled".
 * 5. Present pages become a full slide: `id`/`type`/`heading` from the plan
 *    page (never the content record — see step 2), plus whichever of
 *    {@link PageContent}'s six fields the content record actually set.
 *    `rhythm`/`focus`/`summary` never reach the IR for a present page —
 *    they are plan-only authoring anchors (rhythm/focus steer a future
 *    fill/select step, summary is "for the fill step's own reading only"), not slide content.
 * 6. Top-level: `version` is always the literal `"3"` (IR's own version,
 *    unrelated to the plan's own `version: "1"`). `scenario`/`theme`/
 *    `filename`/`brand`/`meta`/`seed` (step 7) carry over from the plan when
 *    present. When absent, this function omits the field from the raw
 *    object it hands to {@link PptxIRSchema} rather than re-deriving IR's
 *    own default value a second time — one default source of truth, the
 *    schema itself (e.g. `theme` omitted here becomes `{ id: "consulting" }`,
 *    exactly like a bare hand-authored IR that never mentions theme at all —
 *    not a value this function needs to know).
 * 7. Seed: `plan.seed` present → passed through, `generatedSeed` stays
 *    `undefined` on the result. Absent → {@link generateSeed} derives one
 *    from `filename` + the plan's own ordered page-id list (never page
 *    *content* — see that function's own doc comment for why), written to
 *    `ir.seed` *and* returned as `generatedSeed` so a CLI shell can suggest
 *    writing it back into the plan file (this function never touches disk
 *    itself).
 * 8. Idempotence: every step above is a pure function of its inputs (no
 *    randomness, no wall-clock, no reliance on unordered iteration) — two
 *    calls with structurally-equal `plan`/`pages` produce deep-equal
 *    results, `generatedSeed` included. Exercised directly by this module's
 *    test suite rather than asserted here.
 */
export function assembleDeck(plan: unknown, pages: Record<string, PageContent>): AssembleResult {
  // Step 1
  const validated = validatePlan(plan)
  if (!validated.ok) {
    throw new PptfastError(formatInvalidPlanError(validated.errors))
  }
  const deckPlan = validated.plan!

  // Step 2 — shape guard + locked-field protection, scanned before orphan
  // detection (see this function's own doc comment for why the order is
  // observable).
  for (const page of deckPlan.pages) {
    const raw = pages[page.id]
    if (raw === undefined) continue
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new PptfastError(`page "${page.id}": page content must be an object`)
    }
    for (const key of LOCKED_KEYS) {
      if (Object.hasOwn(raw, key)) {
        throw new PptfastError(`page "${page.id}": "${key}" is locked by the plan — remove it from the page file`)
      }
    }
  }

  // Step 3 — orphan pages keys
  const planIds = new Set(deckPlan.pages.map((page) => page.id))
  const orphanIds = Object.keys(pages).filter((id) => !planIds.has(id))
  if (orphanIds.length > 0) {
    throw new PptfastError(
      `orphan page id${orphanIds.length === 1 ? "" : "s"} ${orphanIds.map((id) => `"${id}"`).join(", ")} — not in the plan, delete the page file or add the page to the plan`,
    )
  }

  // Steps 4 + 5 — build each slide
  const slides = deckPlan.pages.map((page) => buildSlide(page, pages[page.id]))

  // Step 7 — seed (computed before step 6's raw object so it can be spliced
  // straight in — plan-only, never reads `pages`, see generateSeed's own doc).
  const generatedSeed =
    deckPlan.seed === undefined ? generateSeed(deckPlan.filename, deckPlan.pages.map((page) => page.id)) : undefined
  const seed = deckPlan.seed ?? generatedSeed!

  // Step 6 — top-level IR fields
  const rawIr = {
    version: "3" as const,
    ...(deckPlan.scenario !== undefined ? { scenario: deckPlan.scenario } : {}),
    ...(deckPlan.theme !== undefined ? { theme: { id: deckPlan.theme } } : {}),
    ...(deckPlan.filename !== undefined ? { filename: deckPlan.filename } : {}),
    ...(deckPlan.brand !== undefined ? { brand: deckPlan.brand } : {}),
    meta: deckPlan.meta,
    seed,
    slides,
  }

  const parsed = PptxIRSchema.safeParse(rawIr)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n")
    throw new PptfastError(`assembled deck did not produce valid IR:\n${detail}`)
  }

  // Materialization (W4 design decision 10) — must run after the schema
  // parse above, not on `rawIr`: `resolveEffectiveLayoutId` needs the fully
  // *defaulted* IR (a plan that omits `theme`, for instance, needs
  // `parsed.data.theme.id === "consulting"` already filled in by the schema,
  // not the bare `rawIr` that simply omits the key).
  const { ir, materializedCount } = materializeEffectiveLayouts(parsed.data)

  return {
    ir,
    ...(generatedSeed !== undefined ? { generatedSeed } : {}),
    ...(materializedCount > 0 ? { materializedLayoutCount: materializedCount } : {}),
  }
}

/**
 * Writes each page's auto-selected layout id into its own `layout` field
 * (W4 design decision 10: once `assembleDeck` has built the IR, run the same
 * `resolveEffectiveLayoutId` selection over it and write the auto-picked
 * result into each page's own `layout` field) — so `deck.json`, the artifact
 * {@link assembleDeck}'s caller actually writes to disk, always names an
 * explicit layout per page instead of leaving a downstream reader (or a
 * future re-`assembleDeck` call with a different seed) to re-derive one.
 * Runs exactly once per {@link assembleDeck} call, after {@link PptxIRSchema}
 * has already produced `ir` — every input `resolveEffectiveLayoutId` needs
 * (resolved theme id, resolved scenario mode, the final `seed`) is only
 * available on that fully-defaulted object, never on the raw pre-parse shape.
 *
 * Two cases leave a slide untouched:
 *
 * - `slide.layout` already set (the page file wrote one explicitly, `step 5`
 *   of {@link assembleDeck}'s own doc comment) — skipped without even calling
 *   the resolver. `resolveEffectiveLayoutId` would just echo a valid
 *   archetype pin straight back anyway (its own explicit-pin short-circuit),
 *   but skipping the call keeps "an explicit page file value survives
 *   untouched" true by construction, not by coincidence of what the resolver
 *   happens to do with it.
 * - The resolver returns `null` — the image-cover takeover
 *   (`ImageCoverPage`'s bespoke chrome, no `LAYOUT_REGISTRY` id to name, see
 *   `resolveEffectiveLayoutId`'s own doc comment). `null` has no home in
 *   `layout`'s `string | undefined` shape, and this function's job is to
 *   materialize *exactly* what the resolver already means by its return
 *   value, never invent a representation the resolver itself doesn't have.
 *
 * Every other omitted-`layout` slide gets `resolveEffectiveLayoutId`'s
 * return value spliced in — always a real `LAYOUT_REGISTRY` id for the 13
 * built-in themes (their curated pools are never empty for any slide type).
 *
 * Reads every slide off the *same* `ir` object across the whole pass, and
 * builds a fresh `slides` array instead of mutating one in place — required
 * by `resolveEffectiveLayoutId`'s own adjacent-anti-repetition fold
 * (`../svg/effective-layout.ts`'s `resolveDeckEffectiveLayoutIds`), which
 * walks the deck once against `ir.slides` exactly as given and caches by
 * `ir` object identity: feeding it a slide whose `layout` this function's
 * own earlier iteration had already overwritten would corrupt "slide i-1's
 * final effective id" into "slide i-1's materialized id" for every later
 * slide — the same value for an auto-picked neighbor, but silently wrong the
 * moment a plan pins one page's layout explicitly next to an auto-picked one
 * (the pin would then read back as slide i-1's own "effective id" a second
 * time, double-counting it as a repetition risk it was never actually a
 * candidate for).
 *
 * Round-trip note: `disassembleDeck` (below) reads whatever this function
 * wrote the exact same way it reads a hand-authored pin — see that
 * function's own doc comment for why that is an accepted consequence, not a
 * bug.
 */
function materializeEffectiveLayouts(ir: PptxIR): { ir: PptxIR; materializedCount: number } {
  let materializedCount = 0
  const slides = ir.slides.map((slide, index) => {
    if (slide.layout !== undefined) return slide
    const effectiveLayoutId = resolveEffectiveLayoutId(ir, slide, index)
    if (effectiveLayoutId === null) return slide
    materializedCount++
    return { ...slide, layout: effectiveLayoutId }
  })
  return materializedCount === 0 ? { ir, materializedCount } : { ir: { ...ir, slides }, materializedCount }
}

/** Step 4 (no content record → placeholder) / step 5 (content record → full slide). */
function buildSlide(page: PlanPage, raw: PageContent | undefined): Record<string, unknown> {
  if (raw === undefined) {
    return {
      id: page.id,
      type: page.type,
      heading: page.heading,
      placeholder: true,
      ...(page.summary !== undefined ? { subheading: page.summary } : {}),
    }
  }
  return {
    id: page.id,
    type: page.type,
    heading: page.heading,
    ...(raw.components !== undefined ? { components: raw.components } : {}),
    ...(raw.layout !== undefined ? { layout: raw.layout } : {}),
    ...(raw.arrangement !== undefined ? { arrangement: raw.arrangement } : {}),
    ...(raw.background !== undefined ? { background: raw.background } : {}),
    ...(raw.image_side !== undefined ? { image_side: raw.image_side } : {}),
    ...(raw.footnote !== undefined ? { footnote: raw.footnote } : {}),
  }
}

// ── disassembleDeck ─────────────────────────────────────────────────────

/** Heading synthesized for a bare IR slide whose own `heading` is missing or
 *  blank (`SlideSchema.heading` is optional with no default — a hand-authored
 *  IR is free to omit it entirely — but `PlanPageSchema.heading` is
 *  required, non-empty, spec §5: a plan page without a heading has no
 *  reasonable default). Adjudication (W5 task-3 brief flags this as an open
 *  call): a fixed, deterministic placeholder was picked over synthesizing
 *  from the slide's first text-bearing component, because there frequently
 *  isn't one to find — a `kpi_cards`-only or `chart`-only content slide has
 *  no paragraph/bullets/quote text at all, so a "first text content"
 *  heuristic would need its own silent fallback for exactly the slides most
 *  likely to hit this path, plus ad-hoc truncation to clear the 48-char plan
 *  heading gate (`CAPACITY.headingMaxChars`, `./index.ts`). A single fixed
 *  string is total, deterministic, always legal against that gate, and — as
 *  a visibly-fake title — a much louder signal to fill in a real heading
 *  than a truncated content fragment that might accidentally read as
 *  intentional. */
const UNTITLED_HEADING = "Untitled"

/**
 * Inverse of {@link assembleDeck}: reconstructs `{ plan, pages }` from an
 * existing IR well enough that `assembleDeck(...disassembleDeck(ir))`
 * reproduces every slide's content — but the map is not lossless in both
 * directions, only in the direction the round trip actually exercises
 * (IR → plan/pages → IR). Fields with no IR-side home never survive being
 * written *to* the IR in the first place, so there is nothing here to read
 * back:
 *
 * - `rhythm` and `focus` never appear on any produced {@link PlanPage} —
 *   both are plan-only authoring anchors with no corresponding `Slide`
 *   field at all (see {@link assembleDeck} step 5's doc comment). Nothing
 *   here could recover a value that was never written anywhere.
 * - `summary` is recovered *only* for a placeholder slide, by reversing
 *   step 4's `summary` → `subheading` injection (`slide.subheading` back to
 *   `planPage.summary`). A non-placeholder slide's own `subheading` — a
 *   legitimate, independent `Slide` field a hand-authored bare IR is free to
 *   set — has no {@link PageContent} field to land in (spec §7's pages/
 *   record is deliberately narrower than `Slide` itself, see that
 *   interface's own doc comment) and no `summary` semantics either (`summary`
 *   only ever flows to a *placeholder*'s `subheading`, never the reverse for
 *   a filled page) — so it is dropped. Same for `decor`: a real `Slide`
 *   field, absent from `PageContent`'s shape entirely.
 * - `theme.style` / `theme.brand` overrides collapse to a bare theme-id
 *   string (`DeckPlanSchema.theme` has no shape for either) — only `theme.id`
 *   survives. That `theme.brand` is `ThemeSchema.brand` (`BrandConfigSchema`
 *   — `suppressFooterOnCardContent`/`suppressFooterRule`, footer-chrome
 *   flags owned by the *theme*) — not to be confused with the deck-level
 *   `brand` field below, a different, unrelated schema despite the shared
 *   name.
 * - `ir.assets.images` is not part of this function's return value at all —
 *   `{ plan, pages }` has no `assets` field, and this module stays zero-fs
 *   by design (this file's own top comment), so it has no way to write an
 *   `assets/` directory itself. Any `asset_id` reference inside a copied
 *   `components`/`background` survives untouched ({@link extractPageContent}
 *   copies both as-is), but the underlying image bytes are deliberately left
 *   for the caller: the CLI shell closes that gap. `runDisassemble`
 *   (`../cli/commands.ts`) walks the *input* IR's `ir.assets.images` itself
 *   and materializes every entry into `<outDir>/assets/<id>.<ext>`
 *   (`writeDeckAssets`, `../cli/deck-dir.ts`) so a later `readDeckDir`'s
 *   `scanAssets` re-registers them exactly like any other deck-directory
 *   asset. Skipping that shell-side step is not a doc-comment nuance — it
 *   reproduces as a real bug: an image deck disassembles with every
 *   `asset_id` left dangling, then re-assembles and renders with the image
 *   silently missing.
 *
 * Round-trip-safe despite the above, worth calling out because of that name
 * collision: the top-level `brand` field (`BrandSchema` — `logo_asset_id` /
 * `position`, the deck logo/position `BrandChrome` reads,
 * `src/svg/BrandChrome.tsx`) is a plain passthrough on both sides
 * ({@link assembleDeck} step 6 reads `plan.brand` into `ir.brand` — this
 * function reads `ir.brand` back into `plan.brand` below) — carried through
 * unmodified, same as `scenario`/`filename`/`seed`, never synthesized or
 * dropped.
 *
 * `layout` deserves a different kind of callout: it round-trips as plain
 * content like any other field ({@link extractPageContent} copies
 * `slide.layout` into `PageContent.layout` whenever the slide has one, no
 * special case) — but a `deck.json` produced by {@link assembleDeck} now
 * carries a `layout` on nearly every slide (W4 design decision 10's
 * materialization, see that function's own doc comment), even on pages whose
 * *original page file* never set one. Nothing on `Slide` marks which is
 * which — `layout` is just a string either way — so disassembling an
 * already-assembled `deck.json` writes every materialized pick into the
 * regenerated page file as if it had been an explicit pin all along, and a
 * later re-`assembleDeck` call skips materialization for that page from then
 * on, same as any hand-authored pin. Accepted, not a bug: `disassembleDeck`
 * is a one-time bare-IR importer into an editable project directory, not a
 * round-trip channel for `deck.json` itself. A deck project's own
 * `pages/<id>.json` files are the durable, edit-in-place artifacts —
 * `deck.json` is downstream output, and feeding it back through
 * `disassembleDeck` (instead of editing the project directory that produced
 * it) is what actually costs those pages their revision-stability
 * re-selection eligibility going forward. A real, user-visible narrowing,
 * worth knowing about here, not worth adding code to guard against for a
 * usage pattern nothing in this codebase actually exercises.
 *
 * Two structural fields are synthesized rather than copied when the source
 * slide omits them, each documented where it is generated:
 * {@link UNTITLED_HEADING} for a missing/blank `heading`, and a positional
 * `p-<1-based-ordinal>-<type>` scheme for a missing `id` (stable across
 * repeated calls on the same IR — it is a pure function of slide position
 * and type — but, unlike a plan-assigned id, *not* stable across inserting
 * or reordering slides — out of scope here, since a bare IR with no `id` at
 * all has no stabler identity to fall back to in the first place).
 *
 * That generated `p-<ordinal>-<type>` id is safe by construction as a
 * page/asset file-name segment (W5 whole-branch review finding 1, verified
 * — not just asserted — rather than also routing it through
 * `assertSafeFileSegment`, `../cli/deck-dir.ts`): `<ordinal>` is
 * `index + 1`, always a plain non-negative integer, and `<type>` is a
 * `Slide["type"]`, a closed schema enum (`"cover" | "chapter" | "content" |
 * "ending"`, `SlideSchema.type` in `../ir/index.ts`) — neither half can ever
 * contain a `/`, a `\`, or resolve to `".."`, so the joined id can't either.
 * A carried-over `slide.id` (the `??` branch's other side) has no such
 * guarantee — that is the one this function passes straight through
 * unchecked, same as every other field {@link extractPageContent} copies —
 * which is exactly why the write-time gate in `../cli/deck-dir.ts` (not this
 * function) is what actually closes the vulnerability.
 */
export function disassembleDeck(ir: PptxIR): { plan: DeckPlan; pages: Record<string, PageContent> } {
  const pages: Record<string, PageContent> = {}
  const planPages: PlanPage[] = ir.slides.map((slide, index) => {
    const id = slide.id ?? `p-${index + 1}-${slide.type}`
    const heading = slide.heading !== undefined && slide.heading.trim() !== "" ? slide.heading : UNTITLED_HEADING
    const planPage: PlanPage = {
      id,
      type: slide.type,
      heading,
      ...(slide.placeholder === true && slide.subheading !== undefined ? { summary: slide.subheading } : {}),
    }
    if (slide.placeholder !== true) pages[id] = extractPageContent(slide)
    return planPage
  })

  const plan: DeckPlan = {
    version: "1",
    ...(ir.scenario !== undefined ? { scenario: ir.scenario } : {}),
    theme: ir.theme.id,
    filename: ir.filename,
    ...(ir.seed !== undefined ? { seed: ir.seed } : {}),
    ...(ir.brand !== undefined ? { brand: ir.brand } : {}),
    meta: ir.meta,
    pages: planPages,
  }

  return { plan, pages }
}

/** Non-placeholder-slide half of {@link disassembleDeck} — the same six
 *  fields {@link buildSlide} injects, read back off the slide. `components`
 *  is included only when non-empty: `Slide.components` always defaults to
 *  `[]` (never `undefined`, `SlideSchema` in `../ir`), but that default and
 *  an author explicitly wanting an empty list are indistinguishable, so an
 *  empty array is treated the same as "omitted" — round-trips to the exact
 *  same `[]` either way once re-defaulted by `assembleDeck`. */
function extractPageContent(slide: Slide): PageContent {
  const content: PageContent = {}
  if (slide.components.length > 0) content.components = slide.components
  if (slide.layout !== undefined) content.layout = slide.layout
  if (slide.arrangement !== undefined) content.arrangement = slide.arrangement
  if (slide.background !== undefined) content.background = slide.background
  if (slide.image_side !== undefined) content.image_side = slide.image_side
  if (slide.footnote !== undefined) content.footnote = slide.footnote
  return content
}
