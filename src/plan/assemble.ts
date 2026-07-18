/**
 * assembleDeck / disassembleDeck — plan + per-page content → IR, and back
 * (spec §5's "assemble 是 SDK 纯函数", W5 task 3).
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
 * `disassembleDeck` is the documented-lossy inverse (spec §7: "disassemble
 * — assemble 逆函数，W5 可选尾巴"): it reconstructs a plan + pages record from
 * an existing IR, well enough that re-`assembleDeck`-ing the result
 * reproduces the same slide content, but plan-only fields that never made it
 * into the IR in the first place (`rhythm`, `focus`, and `summary` on
 * anything but a placeholder page) cannot be recovered — see that function's
 * own doc comment for the full accounting.
 */
import { PptfastError } from "../errors"
import { PptxIRSchema, type BackgroundSpec, type Component, type PptxIR, type Slide } from "../ir"
import { formatInvalidPlanError, validatePlan, type DeckPlan, type PlanPage } from "./index"

// ── PageContent (per-page authoring record, spec §7's `pages/<id>.json`) ──

/**
 * One page's fillable content — everything a plan page's `id` does *not*
 * already lock in. Deliberately excludes `type`/`heading` (plan-owned, see
 * {@link assembleDeck}'s locked-field gate) and `subheading`/`decor`
 * (legitimate `Slide` fields, but outside this record's shape by spec §7's
 * own layout — "pages/<id>.json，只含 components" — a plan/pages deck can't
 * author either one; a hand-authored bare IR still can). Every field here is
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
}

// ── deterministic seed generation ───────────────────────────────────────

/**
 * djb2 string hash. The exact same five-line algorithm as
 * `svg/variety.ts`'s `stableHash` (and `svg/components/chart-svg.tsx`'s own
 * private copy of it) — reimplemented locally here for the same reason
 * those two already give each other in `variety.ts`'s doc comment: it is a
 * five-line primitive, and importing it from `svg/variety.ts` would pull a
 * `plan → svg` dependency this module has no business taking. `src/plan`
 * sits beside `src/ir` (an IR-adjacent, pre-render authoring concern);
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
 * Deterministic seed for a plan that omits `seed` (spec §5's "seed 机制修订":
 * modification stability requires an *explicit*, persisted seed — this is
 * the one-time generation `assembleDeck` performs on first materialization,
 * spec's "创建时生成一次，此后稳定"). Hashes `filename + the plan's own
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
 * IR. See this module's own top comment for the overall shape; step numbers
 * below match the W5 task-3 brief's own numbered "注入语义" list verbatim —
 * kept in that exact order because two of them (locked-field vs. orphan)
 * both throw and their relative order is otherwise unobservable from either
 * doc comment alone.
 *
 * 1. `plan` is `unknown` (same boundary `validatePlan` itself has — a plan
 *    is almost always freshly `JSON.parse`d off disk by the caller) —
 *    invalid shape or a failed hard gate throws {@link PptfastError} with
 *    `validatePlan`'s own formatted issue list, not a re-derived message.
 * 2. Shape guard + locked-field protection: a `pages[id]` entry must first be
 *    a plain object — not `null`, an array, or a primitive — else throws;
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
 *    slide — never an error; spec §7's own words, "assemble 的精确语义：对
 *    缺页永远成功（占位），对结构矛盾（孤儿文件/坏 plan/id 冲突）报错". A
 *    declared `summary` becomes the placeholder's `subheading` (the one spot
 *    `summary` — otherwise a plan-only anchor, see step 5 — does reach the
 *    IR) so a `--draft` preview of an unfilled deck still reads as more than
 *    a bare "Untitled".
 * 5. Present pages become a full slide: `id`/`type`/`heading` from the plan
 *    page (never the content record — see step 2), plus whichever of
 *    {@link PageContent}'s six fields the content record actually set.
 *    `rhythm`/`focus`/`summary` never reach the IR for a present page —
 *    they are plan-only authoring anchors (rhythm/focus steer a future
 *    fill/select step, summary is "仅供填页自读"), not slide content.
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
  // straight in; plan-only, never reads `pages`, see generateSeed's own doc).
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

  return { ir: parsed.data, ...(generatedSeed !== undefined ? { generatedSeed } : {}) }
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
 *   field at all (see {@link assembleDeck} step 5's doc comment); nothing
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
 *
 * Round-trip-safe despite the above, worth calling out because of that name
 * collision: the top-level `brand` field (`BrandSchema` — `logo_asset_id` /
 * `position`, the deck logo/position `BrandChrome` reads,
 * `src/svg/BrandChrome.tsx`) is a plain passthrough on both sides
 * ({@link assembleDeck} step 6 reads `plan.brand` into `ir.brand`; this
 * function reads `ir.brand` back into `plan.brand` below) — carried through
 * unmodified, same as `scenario`/`filename`/`seed`, never synthesized or
 * dropped.
 *
 * Two structural fields are synthesized rather than copied when the source
 * slide omits them, each documented where it is generated:
 * {@link UNTITLED_HEADING} for a missing/blank `heading`, and a positional
 * `p-<1-based-ordinal>-<type>` scheme for a missing `id` (stable across
 * repeated calls on the same IR — it is a pure function of slide position
 * and type — but, unlike a plan-assigned id, *not* stable across inserting
 * or reordering slides; out of scope here, since a bare IR with no `id` at
 * all has no stabler identity to fall back to in the first place).
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
