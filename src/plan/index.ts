/**
 * Deck spec schema + validation (spec §5 "plan artifact and hard gates", W5
 * task 2 — renamed to "Deck Spec" per the vocabulary-v4 rename, spec §6/§8.1;
 * "spec §N" citations throughout this file that predate this rename still
 * point at that original W5 design doc, not this rename's own spec — left
 * as historical citations, not renumbered).
 *
 * A deck spec is a workflow artifact, not a render prerequisite (spec §5's
 * "escape hatch": a bare IR v3 renders directly, `spec validate` is a
 * separate, optional gate for the spec-authoring stage of the six-phase
 * workflow). This module stays pure and Node-free — no `fs`, no CLI concerns
 * — so it can sit in `src/index.ts`'s dependency closure exactly like
 * `src/ir` and `src/narrative` already do (`AGENTS.md`'s layout rule).
 * `src/cli/commands.ts` owns the one Node-touching wrapper
 * (`runSpecValidate`: read file, call {@link validateSpec}, format the
 * result).
 *
 * Design mirrors `api.ts`'s `validateIr`/`ValidateResult` throughout
 * (structural zod pass first, then a sequential chain of hard-gate
 * categories, each short-circuiting the chain on its own failure — see
 * {@link validateSpec}'s own comment for why): same overall shape, adapted
 * for spec pages being keyed by an author-assigned `id` instead of IR's
 * positional slide index.
 */
import { z } from "zod"
import { PptfastError } from "../errors"
import { BEAT_VALUES, BrandSchema, COMPONENT_TYPES, MetaSchema, NarrativeProfileInputSchema } from "../ir"
import { STRATEGY_DEFINITIONS, resolveNarrative, type Pacing, type Strategy, type NarrativeProfile } from "../narrative"
import { CAPACITY } from "../svg/audit/capacity"
import { LAYOUT_REGISTRY, type SlideType } from "../svg/layouts/registry"
import { getInstalledThemeIds } from "../themes/definitions"

// ── schema ───────────────────────────────────────────────────────────────

/**
 * Mirrors `SlideSchema.type` / `SlideType` (`ir/index.ts`,
 * `svg/layouts/registry.ts`) exactly. Kept as an independent literal tuple
 * here (not imported from either) — a page spec's `type` is a 4-value enum
 * on its own schema, not a re-export of IR's — but the `satisfies` clause
 * makes any future drift between the two a compile error instead of a
 * silent mismatch.
 */
const PAGE_TYPES = ["cover", "chapter", "content", "ending"] as const satisfies readonly SlideType[]

export type PageSpecType = (typeof PAGE_TYPES)[number]
export type PageBeat = (typeof BEAT_VALUES)[number]

/**
 * A single page spec (spec §5, §6). `type`/`heading` are required — unlike
 * IR's own `SlideSchema` (where both default/omit for weak-model
 * friendliness), a deck spec is the authoring artifact those fields get
 * *locked* from at assemble time (W5 task 3), so leaving either implicit
 * here would defeat the point. `beat`/`focus`/`summary` stay optional per
 * spec §5's defaults chain ("beat omitted → auto-rotates by page position —
 * focus/summary/layout/slot can all be omitted").
 */
export const PageSpecSchema = z
  .object({
    id: z.string(),
    type: z.enum(PAGE_TYPES),
    heading: z.string(),
    /** One of the three beat values, or omitted entirely — an omitted
     *  beat is never a hard-gate violation on its own (see
     *  {@link checkBeatRotation}'s policy functions below). It gets
     *  auto-alternated at assemble time (W5 task 3, not this task — still
     *  unimplemented as of the P1 variety wave's task 1). Renamed
     *  from `rhythm` (vocabulary-v4 rename, spec §4.3/§6/§8.1) — same
     *  three values, same semantics, page-level term only, distinct from
     *  the deck-level `pacing` axis. A *declared* value here is no longer
     *  spec-only advisory material (P1 variety wave, task 1): `assembleDeck`
     *  (`./assemble.ts`) now carries it straight into the IR's own
     *  `Slide.beat` field, where it combines with a soft selection-weight
     *  onto layout picking (`Math.max`, not multiplication — see
     *  `SlideSchema.beat`'s own doc comment, `../ir/index.ts`, and
     *  `BEAT_TENDENCY_WEIGHT`'s in `../svg/effective-layout.ts` for why) —
     *  the checks below (rotation shape) and that downstream weighting
     *  (which archetypes a given beat favors) are two independent consumers
     *  of the same declared value, not two views of one mechanism. */
    beat: z.enum(BEAT_VALUES).optional(),
    /** Optional authoring hint pointing fill/select at a preferred
     *  component type or layout id — see {@link checkFocusVocabulary}. */
    focus: z.string().optional(),
    /** Free-text content anchor, "for the fill step's own reading only" (spec §5) — read by a later
     *  fill step, never validated or interpreted here. */
    summary: z.string().optional(),
  })
  .strict()

export type PageSpec = z.infer<typeof PageSpecSchema>

/**
 * Top-level deck spec shape (spec §5, §6). `narrative`/`theme` deliberately
 * have no schema-level `.default(...)` — same reasoning as `PptxIRSchema`'s
 * own `narrative` field (`ir/index.ts`): the resolved value is never baked
 * back into the parsed shape, {@link validateSpec} (here) and, later,
 * assemble (W5 task 3) each resolve it themselves. `seed` is accepted but
 * entirely unexamined by this module — "not validateSpec's concern" (spec's
 * own wording): assemble generates and suggests writing one back on first
 * materialization.
 *
 * `version` stays the literal `"1"` (unchanged value) but now carries an
 * independent Deck Spec versioning scheme (spec §6: "`deck.spec.json` 使用
 * 独立的 spec 版本 1。它是新工件，不继承 `deck.plan.json` 的版本号语义") —
 * this "1" is the Deck Spec artifact's own first version, not a continuation
 * of the old deck-plan artifact's version counter, even though the digit is
 * the same.
 */
export const DeckSpecSchema = z
  .object({
    version: z.literal("1").default("1"),
    // Same open-schema/closed-semantic split as PptxIRSchema's `narrative`
    // field — see `NarrativeProfileInputSchema`'s doc comment in `ir/index.ts`
    // for the full rationale (reused verbatim here, not redefined, so the
    // two can't drift apart). Field renamed from `scenario` to `narrative`
    // this task (spec §8.1's `DeckPlan`→`DeckSpec` rename, task 2) — its
    // *value* was already in the new strategy/pacing vocabulary as of task 1
    // (vocabulary-v4 rename) — `resolveNarrative` below is what actually
    // enforces that.
    narrative: z.union([z.string(), NarrativeProfileInputSchema]).optional(),
    theme: z.string().optional(),
    filename: z.string().optional(),
    seed: z.number().int().optional(),
    meta: MetaSchema.default({}),
    /** Deck logo placement — reused verbatim from the IR's own `brand` field
     *  (`BrandSchema`, `../ir`) so the deck spec and IR can't drift apart on
     *  shape, same pattern as `meta` just above. Unlike `meta`, no
     *  `.default({})`: IR's own `brand` field is a bare `.optional()` with no
     *  default either (`undefined` means "no brand", not "an empty brand
     *  object") — consumed by `BrandChrome` (`src/svg/BrandChrome.tsx`) for
     *  the deck's logo image and corner position. */
    brand: BrandSchema.optional(),
    pages: z.array(PageSpecSchema),
  })
  .strict()

export type DeckSpec = z.infer<typeof DeckSpecSchema>

/** JSON Schema for the deck spec — feed this to a model before it writes one (see `pptfast schema --spec`). */
export function specJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(DeckSpecSchema) as Record<string, unknown>
}

// ── result / issue types ────────────────────────────────────────────────

export interface SpecValidationIssue {
  path: string
  message: string
  /** The offending page's `id`, when the issue is scoped to one specific
   *  page and that page's `id` could be determined — absent for deck-level
   *  issues (e.g. "pages non-empty") and for structural issues on a page
   *  whose own `id` itself failed to parse. */
  pageId?: string
}

export interface SpecValidateResult {
  ok: boolean
  spec?: DeckSpec
  errors: SpecValidationIssue[]
}

export function formatSpecIssues(errors: SpecValidationIssue[]): string {
  return errors.map((e) => (e.pageId ? `page "${e.pageId}" — ${e.path}: ${e.message}` : `${e.path}: ${e.message}`)).join("\n")
}

/**
 * `"invalid spec (N issue[s]):\n<formatted issues>"` — the exact
 * {@link PptfastError} message both `runSpecValidate` (`src/cli/commands.ts`)
 * and {@link assembleDeck}'s (`./assemble.ts`) step 1 throw on a failed
 * {@link validateSpec} call. Extracted here instead of duplicated verbatim at
 * each call site so the two can't drift on wording — reuses
 * {@link formatSpecIssues} for the per-issue body.
 */
export function formatInvalidSpecError(errors: SpecValidationIssue[]): string {
  return `invalid spec (${errors.length} issue${errors.length === 1 ? "" : "s"}):\n${formatSpecIssues(errors)}`
}

/**
 * Deck-spec-level theme default (spec §5's defaults chain: "theme omitted →
 * consulting") — the same default IR's own `theme.id` field carries
 * (`ThemeSchema` in `ir/index.ts`). Exported so a caller already holding a
 * validated {@link DeckSpec} (the CLI's OK-summary line) doesn't re-derive
 * the fallback itself.
 */
export function resolveSpecThemeId(spec: DeckSpec): string {
  return spec.theme ?? "consulting"
}

// ── hard gate: pages non-empty ──────────────────────────────────────────

function checkPagesNonEmpty(spec: DeckSpec): SpecValidationIssue[] {
  if (spec.pages.length > 0) return []
  return [{ path: "pages", message: "spec has no pages — a spec needs at least a cover page and an ending page" }]
}

// ── hard gate: boundary types ───────────────────────────────────────────

/**
 * Structural boundary gate (spec §5): the deck must open on a cover page and
 * close on an ending page, and no interior page may claim either type —
 * cover/ending are reserved for the two boundary positions. `content` and
 * `chapter` are both legal interior types (chapter divider pages are not
 * boundary types, and are excluded from the beat-rotation streak checks
 * below for that same reason). Called only when `spec.pages` is non-empty
 * (see {@link validateSpec}) — on a single-page spec `first`/`last` are the
 * same page and both checks run against it independently, so a lone page
 * that is neither cover nor ending reports both violations.
 */
function checkBoundaryTypes(spec: DeckSpec): SpecValidationIssue[] {
  const { pages } = spec
  const errors: SpecValidationIssue[] = []
  const first = pages[0]!
  const last = pages[pages.length - 1]!
  if (first.type !== "cover") {
    errors.push({
      path: "pages.0.type",
      pageId: first.id,
      message: `first page must be type "cover" (got "${first.type}") — a spec must open with a cover page`,
    })
  }
  if (last.type !== "ending") {
    errors.push({
      path: `pages.${pages.length - 1}.type`,
      pageId: last.id,
      message: `last page must be type "ending" (got "${last.type}") — a spec must close with an ending page`,
    })
  }
  for (let i = 1; i < pages.length - 1; i++) {
    const page = pages[i]!
    if (page.type === "cover" || page.type === "ending") {
      errors.push({
        path: `pages.${i}.type`,
        pageId: page.id,
        message: `page "${page.id}" is type "${page.type}", only allowed as the first (cover) or last (ending) page — use "content" or "chapter" for interior pages`,
      })
    }
  }
  return errors
}

// ── hard gate: page id required + unique ────────────────────────────────

/**
 * Path-traversal-safety check (CWE-22 defense-in-depth, W5 whole-branch
 * review finding 1) on a spec-authored page id — this id becomes `slide.id`
 * at assemble time ({@link buildSlide} in `./assemble.ts`, step 5) and, from
 * there, a `pages/<id>.json` / `assets/<id><ext>` file name if the resulting
 * IR is ever disassembled again (`runDisassemble`'s page write and
 * `writeOneAsset`, both via `assertSafeFileSegment` in `../cli/deck-dir.ts`
 * — the actual write-time gates, and the only checks that matter for
 * *every* id regardless of provenance, since a hand-authored bare IR skips
 * this module entirely). Rejecting an unsafe id here too, at spec-validation
 * time, is pure defense-in-depth: it means a spec-authored id is already
 * safe by the time it could ever reach either sink.
 *
 * This module stays Node-free (`AGENTS.md`'s layout rule, this file's own
 * top comment), so the check is duplicated as plain string logic instead of
 * importing `assertSafeFileSegment` itself (which needs `node:path`'s
 * `resolve`/`relative`) — same "duplicate a few lines rather than pull a
 * Node-touching module into this closure" call {@link specHeadingLength}'s
 * own doc comment makes just above. A single trailing path segment can only
 * ever escape whatever directory it is joined under if it is itself
 * absolute, contains a `/`/`\` separator, or is exactly `".."` —
 * `assertSafeFileSegment`'s own doc comment walks through why those lexical
 * checks alone are already sufficient (it additionally cross-checks via
 * `resolve`/`relative` as belt-and-suspenders, not because the lexical
 * checks alone fall short). Keep in sync with `assertSafeFileSegment` if
 * either check's rules ever change.
 */
function isUnsafePageId(id: string): boolean {
  return id.includes("/") || id.includes("\\") || id === ".."
}

/**
 * `id` is required at the schema level (`PageSpecSchema.id: z.string()`, no
 * `.optional()`) so a missing key is already a structural error by the time
 * this runs — what remains to check here is (a) an empty/whitespace-only
 * string, which the schema's plain `z.string()` lets through, (b) a value
 * unsafe to use as a page/asset file name ({@link isUnsafePageId}, W5
 * whole-branch review finding 1), and (c) cross-page uniqueness, which no
 * per-page schema can express. Kebab-case is suggested by spec §5 but never
 * enforced ("kebab-case suggested, not required") — neither (a) nor (b)
 * narrows that: spaces, underscores, and uppercase all stay legal, only path
 * separators and a bare `".."` are not.
 */
function checkPageIds(spec: DeckSpec): SpecValidationIssue[] {
  const errors: SpecValidationIssue[] = []
  const seen = new Map<string, number[]>()
  spec.pages.forEach((page, i) => {
    if (page.id.trim() === "") {
      errors.push({ path: `pages.${i}.id`, message: `page ${i + 1} has an empty id — every page needs a non-empty, unique id` })
      return
    }
    if (isUnsafePageId(page.id)) {
      errors.push({
        path: `pages.${i}.id`,
        pageId: page.id,
        message: `page id "${page.id}" is not a safe file name — ids used as page/asset file names must not contain path separators or ".."`,
      })
      return
    }
    const indices = seen.get(page.id)
    if (indices) indices.push(i)
    else seen.set(page.id, [i])
  })
  for (const [id, indices] of seen) {
    if (indices.length < 2) continue
    errors.push({
      path: "pages",
      pageId: id,
      message: `duplicate page id "${id}" used by ${indices.length} pages (positions ${indices.map((i) => i + 1).join(", ")}) — page ids must be unique within a spec`,
    })
  }
  return errors
}

// ── hard gate: heading required + length ────────────────────────────────

/**
 * `CAPACITY.headingMaxChars` (`svg/audit/capacity.ts`) — the exact same 48
 * numeric source `ir-quality.ts`'s long-heading warning reads (see that
 * constant's own derivation comment there). Not re-derived here.
 */
const HEADING_MAX_CHARS = CAPACITY.headingMaxChars

/**
 * Character count for the heading-length gate — deliberately plain
 * `.length` (CJK characters count as 1 each), matching `ir-quality.ts`'s own
 * `charLen` helper's semantics exactly (that function's doc comment: "Count
 * characters. CJK characters count as 1 each (same as .length)") — not
 * `measureTextUnits`'s visual-width weighting, a different unit system used
 * elsewhere in this codebase for a different purpose (bullets budgets).
 * Duplicated rather than imported: `charLen` is a one-line function and
 * importing it would pull `ir-quality.ts`'s whole module graph
 * (`effective-layout.ts`, `svg-text-layout.ts`, ...) into this Node-free
 * package for a single line of logic. Keep in sync with `ir-quality.ts`'s
 * `charLen` if that one ever changes.
 */
function specHeadingLength(heading: string): number {
  return heading.length
}

function checkHeadings(spec: DeckSpec): SpecValidationIssue[] {
  const errors: SpecValidationIssue[] = []
  spec.pages.forEach((page, i) => {
    if (page.heading.trim() === "") {
      errors.push({ path: `pages.${i}.heading`, pageId: page.id, message: `page "${page.id}" is missing a required heading` })
      return
    }
    const length = specHeadingLength(page.heading)
    if (length > HEADING_MAX_CHARS) {
      errors.push({
        path: `pages.${i}.heading`,
        pageId: page.id,
        message: `page "${page.id}" heading is ${length} characters, exceeds the ${HEADING_MAX_CHARS}-character limit — tighten it into a short, assertive phrase`,
      })
    }
  })
  return errors
}

// ── hard gate: theme resolution ─────────────────────────────────────────

/**
 * Installed-theme check, same shape as `validateIr`'s own (`api.ts`) —
 * `theme` stays an open string at the schema layer (like IR's `theme.id`),
 * this hard gate is where an unknown id is actually rejected.
 */
function checkTheme(spec: DeckSpec): SpecValidationIssue[] {
  const themeId = resolveSpecThemeId(spec)
  const installed = getInstalledThemeIds()
  if (installed.includes(themeId)) return []
  return [{ path: "theme", message: `unknown theme "${themeId}" — available: ${installed.join(", ")} (see \`pptfast themes\`)` }]
}

// ── hard gate: focus vocabulary ─────────────────────────────────────────

const LAYOUT_IDS: readonly string[] = Object.keys(LAYOUT_REGISTRY)

/**
 * Focus vocabulary gate (spec §5): `focus` is optional authoring guidance
 * pointing a later fill/select step at a preferred component or layout —
 * when present it must resolve against one of three vocabularies: the
 * resolved strategy's own tendency set (`STRATEGY_DEFINITIONS[strategy].tendencies`, W3
 * data), the full component-type vocabulary ({@link COMPONENT_TYPES}, 28
 * names), or the full layout-id vocabulary ({@link LAYOUT_IDS},
 * `LAYOUT_REGISTRY`'s keys).
 *
 * The strategy tendency set is currently always a subset of the other two
 * (every entry in every `StrategyDefinition.tendencies` array already resolves
 * against either component types or layout ids — see that field's own doc
 * comment in `narrative/index.ts`) — checked explicitly anyway, both because
 * the brief's wording keeps it a first-class term of the union (a future
 * tendency value from some other vocabulary would still resolve correctly
 * without touching this function) and because the strategy-specific list is the
 * one most useful to show first in the error message, ahead of the two much
 * longer global lists.
 */
function checkFocusVocabulary(spec: DeckSpec, strategy: Strategy): SpecValidationIssue[] {
  const tendencies = STRATEGY_DEFINITIONS[strategy].tendencies
  const errors: SpecValidationIssue[] = []
  spec.pages.forEach((page, i) => {
    if (page.focus === undefined) return
    if (tendencies.includes(page.focus) || COMPONENT_TYPES.includes(page.focus) || LAYOUT_IDS.includes(page.focus)) {
      return
    }
    errors.push({
      path: `pages.${i}.focus`,
      pageId: page.id,
      message:
        `unknown focus "${page.focus}" for strategy "${strategy}" — expected one of this strategy's tendencies ` +
        `(${tendencies.join(", ")}), a component type (${COMPONENT_TYPES.join(", ")}), ` +
        `or a layout id (${LAYOUT_IDS.join(", ")})`,
    })
  })
  return errors
}

// ── hard gate: beat rotation (parameterized by strategy's beatPolicy) ──

type DeclaredBeatPage = { index: number; id: string; beat: PageBeat }

/**
 * Content-type pages (cover/chapter/ending excluded, per the brief's streak
 * rule) that declared an explicit `beat` — the exact population every
 * beat-policy check below reasons over. A content page that leaves
 * `beat` unset is filtered out here too, not treated as a streak-breaker —
 * see {@link checkAlternatePolicy}'s doc comment for why that matters.
 */
function declaredBeatContentPages(spec: DeckSpec): DeclaredBeatPage[] {
  const result: DeclaredBeatPage[] = []
  spec.pages.forEach((page, index) => {
    if (page.type === "content" && page.beat !== undefined) {
      result.push({ index, id: page.id, beat: page.beat })
    }
  })
  return result
}

/**
 * `alternate` policy (storytelling strategy): no run of 3 or more consecutive
 * content pages may declare the *same* beat. "Consecutive" is evaluated
 * on the declared-beat content-page subsequence
 * ({@link declaredBeatContentPages}), not on raw array adjacency —
 * cover/chapter/ending pages are excluded per the brief, and a content page
 * that leaves `beat` unset is *also* transparent to this scan (filtered
 * out, neither breaking nor extending a run) rather than treated as a
 * guaranteed streak-breaker: nothing at validate time knows what an unset
 * beat will resolve to (assemble's later auto-alternation step decides
 * that), so a run of declared "anchor" pages either side of one undeclared
 * page is still a real 3-in-a-row risk once that gap gets filled, and
 * treating it as already-safe would let the loudest form of the violation
 * (every visible declaration identical) through silently. A maximal run
 * reports exactly one error naming every member, not one error per
 * overlapping triple within it.
 */
function checkAlternatePolicy(spec: DeckSpec, strategy: Strategy): SpecValidationIssue[] {
  const seq = declaredBeatContentPages(spec)
  const errors: SpecValidationIssue[] = []
  let i = 0
  while (i < seq.length) {
    let j = i + 1
    while (j < seq.length && seq[j]!.beat === seq[i]!.beat) j++
    const runLength = j - i
    if (runLength >= 3) {
      const members = seq.slice(i, j)
      errors.push({
        path: "pages",
        pageId: members[0]!.id,
        message:
          `${runLength} consecutive content pages declare beat "${seq[i]!.beat}" ` +
          `(${members.map((m) => m.id).join(", ")}) — strategy "${strategy}" requires beat to alternate, ` +
          `vary at least one of them`,
      })
    }
    i = j
  }
  return errors
}

/**
 * `anchor-open` policy (pyramid strategy): only the deck's *first* content page
 * is checked — it must declare beat "anchor" if it declares a beat at
 * all. An unset beat on that first content page is not a violation (spec:
 * omission always defers to the later auto-fill step). Every other content
 * page's beat is left alone by this policy, by design (spec's own words:
 * "only checks the opening"). Vacuously fine when the spec has no content
 * pages at all (e.g. cover → chapter → ending).
 */
function checkAnchorOpenPolicy(spec: DeckSpec, strategy: Strategy): SpecValidationIssue[] {
  const firstContentIndex = spec.pages.findIndex((page) => page.type === "content")
  if (firstContentIndex === -1) return []
  const firstContent = spec.pages[firstContentIndex]!
  if (firstContent.beat === undefined || firstContent.beat === "anchor") return []
  return [
    {
      path: `pages.${firstContentIndex}.beat`,
      pageId: firstContent.id,
      message: `first content page declares beat "${firstContent.beat}" — strategy "${strategy}" requires the deck to open its first content page on "anchor" beat when a beat is declared`,
    },
  ]
}

/**
 * `anchor-sparse` policy (showcase strategy): among content pages that declare a
 * beat, "anchor" must stay a minority (at most half). Showcase's own
 * beat *default* leans anchor-heavy (spec §5's beat-default column:
 * "anchor-dominant" — applied by the later auto-alternation step when beat is
 * omitted), but this gate only ever looks at pages the author explicitly
 * marked — its job is guarding against an agent mechanically stamping
 * "anchor" on every page it writes. An anchor page is meant to read as a
 * deliberate, occasional high-impact beat. If every page claims that beat,
 * none of them keep it. Zero declared-beat content pages is not a
 * violation — there is nothing to compute a ratio over (same "absence never
 * violates" posture as every other policy here).
 */
function checkAnchorSparsePolicy(spec: DeckSpec, strategy: Strategy): SpecValidationIssue[] {
  const declared = declaredBeatContentPages(spec)
  if (declared.length === 0) return []
  const anchorPages = declared.filter((page) => page.beat === "anchor")
  if (anchorPages.length / declared.length <= 0.5) return []
  const pct = Math.round((anchorPages.length / declared.length) * 100)
  return [
    {
      path: "pages",
      // First offending anchor page, same "representative pageId" shape
      // checkAlternatePolicy's own issue carries (members[0]!.id there) —
      // this gate's violation is deck-wide (a ratio, not one page), but a
      // representative id still gives a CLI/agent caller something to jump
      // to rather than only a bare "pages" path.
      pageId: anchorPages[0]!.id,
      message:
        `${anchorPages.length} of ${declared.length} content pages with a declared beat are "anchor" ` +
        `(${pct}%: ${anchorPages.map((page) => page.id).join(", ")}) — strategy "${strategy}" requires "anchor" to ` +
        `stay a minority of declared beats, vary some to "dense" or "breathing"`,
    },
  ]
}

/**
 * Dispatches to the resolved strategy's beat-rotation rule (spec §5's spec
 * hard-gate section, "beat-rotation rule parameterized by strategy" — a single universal "no 3
 * same-beat pages in a row" rule would reject e.g. briefing's own correct
 * default, the exact self-contradiction the spec's codex-review pass
 * flagged, hence a per-`beatPolicy` rule set instead of one rule for
 * everyone). See `StrategyDefinition.beatPolicy`'s own doc comment
 * (`narrative/index.ts`) for which of the five strategies maps to which policy.
 */
function checkBeatRotation(spec: DeckSpec, strategy: Strategy): SpecValidationIssue[] {
  const policy = STRATEGY_DEFINITIONS[strategy].beatPolicy
  switch (policy) {
    case "uniform-dense":
    case "repetition-ok":
      // Exempt entirely — uniform/repeated beat across content pages is
      // these strategies' own correct default (briefing's "uniform dense",
      // instructional's "dense tolerated, structure repeats across pages"), not a violation of
      // anything a generic streak rule would otherwise flag.
      return []
    case "alternate":
      return checkAlternatePolicy(spec, strategy)
    case "anchor-open":
      return checkAnchorOpenPolicy(spec, strategy)
    case "anchor-sparse":
      return checkAnchorSparsePolicy(spec, strategy)
    default: {
      const exhaustive: never = policy
      throw new Error(`unhandled beat policy: ${String(exhaustive)}`)
    }
  }
}

// ── hard gate: page count vs pacing ─────────────────────────────────────

/**
 * Deck-level page-count range per pacing (spec §5's pacing table,
 * initial values — "dense 8-30 / balanced 6-24 / spacious 4-16", not yet
 * tuned against real usage). Independent of `PACING_BUDGETS`
 * (`narrative/index.ts`, per-slide component-count/bullets editorial
 * budget) — this is a separate, deck-wide page-count concern the spec calls
 * out as its own hard gate ("page count vs. pacing recommended range").
 * Message wording renamed from "delivery" to "pacing" (vocabulary-v4
 * residual, routed from the task 1 review) — the axis itself was already
 * `Pacing` at the type level, this closes the last stale word in the
 * error text.
 */
export const SPEC_PAGE_COUNT_RANGE: Record<Pacing, { min: number; max: number }> = {
  dense: { min: 8, max: 30 },
  balanced: { min: 6, max: 24 },
  spacious: { min: 4, max: 16 },
}

function checkPageCount(spec: DeckSpec, pacing: Pacing): SpecValidationIssue[] {
  const { min, max } = SPEC_PAGE_COUNT_RANGE[pacing]
  const n = spec.pages.length
  if (n >= min && n <= max) return []
  return [
    {
      path: "pages",
      message: `spec has ${n} pages — "${pacing}" pacing expects ${min}-${max} pages, change pacing or add/remove pages`,
    },
  ]
}

// ── entry point ──────────────────────────────────────────────────────────

/** Best-effort page id lookup straight off the *raw* (pre-parse) input, used
 *  only for structural (zod) issues — the page that failed to parse may
 *  still have a readable `id` sitting right next to whatever field failed. */
function pageIdFromRawInput(input: unknown, index: number): string | undefined {
  if (typeof input !== "object" || input === null) return undefined
  const pages = (input as Record<string, unknown>).pages
  if (!Array.isArray(pages)) return undefined
  const page = pages[index] as unknown
  if (typeof page !== "object" || page === null) return undefined
  const id = (page as Record<string, unknown>).id
  return typeof id === "string" ? id : undefined
}

/**
 * Validate raw JSON against the spec schema, then — once it parses — run the
 * spec §5 hard-gate chain. Mirrors `validateIr`'s (`api.ts`) overall shape: a
 * structural zod pass first, then a sequence of isolated hard-gate
 * categories, each short-circuiting the whole chain on its own failure
 * (rather than accumulating errors across categories) so a later category
 * never has to guess at what an earlier, already-broken one would have
 * meant — e.g. beat-rotation and page-count both need a resolved
 * narrative, so nothing past the narrative/theme stage runs until that
 * resolves cleanly. Every spec-gate philosophy here is "hard block, no soft
 * warning" (spec §5's "escape hatch" section — a spec that doesn't fit this shape
 * should be authored as bare IR instead, not warned-and-shipped).
 */
export function validateSpec(input: unknown): SpecValidateResult {
  const r = DeckSpecSchema.safeParse(input)
  if (!r.success) {
    const errors = r.error.issues.map((issue) => {
      const path = issue.path.join(".")
      const m = /^pages\.(\d+)/.exec(path)
      return { path, message: issue.message, pageId: m ? pageIdFromRawInput(input, Number(m[1])) : undefined }
    })
    return { ok: false, errors }
  }
  const spec = r.data

  const emptyErrors = checkPagesNonEmpty(spec)
  if (emptyErrors.length > 0) return { ok: false, errors: emptyErrors }

  const boundaryErrors = checkBoundaryTypes(spec)
  if (boundaryErrors.length > 0) return { ok: false, errors: boundaryErrors }

  const idErrors = checkPageIds(spec)
  if (idErrors.length > 0) return { ok: false, errors: idErrors }

  const headingErrors = checkHeadings(spec)
  if (headingErrors.length > 0) return { ok: false, errors: headingErrors }

  const themeErrors = checkTheme(spec)
  if (themeErrors.length > 0) return { ok: false, errors: themeErrors }

  // Narrative resolution (spec §5's defaults chain), same open-schema/
  // closed-semantic split as validateIr's own (api.ts) — see that
  // function's comment for the full rationale. `spec.narrative`'s inferred
  // type is wider than `resolveNarrative`'s parameter — safe to narrow here
  // because `resolveNarrative` validates every key/value itself at runtime.
  let resolvedAxes: NarrativeProfile
  try {
    resolvedAxes = resolveNarrative(spec.narrative as string | Partial<NarrativeProfile> | undefined)
  } catch (err) {
    if (!(err instanceof PptfastError)) throw err
    return { ok: false, errors: [{ path: "narrative", message: err.message }] }
  }

  const beatErrors = checkBeatRotation(spec, resolvedAxes.strategy)
  if (beatErrors.length > 0) return { ok: false, errors: beatErrors }

  const focusErrors = checkFocusVocabulary(spec, resolvedAxes.strategy)
  if (focusErrors.length > 0) return { ok: false, errors: focusErrors }

  const pageCountErrors = checkPageCount(spec, resolvedAxes.pacing)
  if (pageCountErrors.length > 0) return { ok: false, errors: pageCountErrors }

  return { ok: true, spec, errors: [] }
}
