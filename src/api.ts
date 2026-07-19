import { z } from "zod"
import { PptfastError } from "./errors"
import { PptxIRSchema, StyleOverrideSchema, type PptxIR } from "./ir"
import { normalizeComponentAliases } from "./ir/field-aliases"
import { generatePptxBlob } from "./pptx/generate"
import { resolveScenario, type ScenarioAxes } from "./scenario"
import { CAPACITY } from "./svg/audit/capacity"
import { FULL_BODY_TYPES } from "./svg/component-traits"
import { checkIrQuality, type QualityIssue } from "./svg/ir-quality"
import { getLayout, layoutsForSlideType } from "./svg/layouts/registry"
import { slideToSvgMarkup } from "./svg/render-slide"
import { CANONICAL_THEME_IDS, THEME_LABELS, THEME_STYLES } from "./themes"
import { getInstalledThemeIds } from "./themes/definitions"

export interface ValidationIssue {
  path: string
  message: string
  /** 1-based slide number when the issue is scoped to a slide. */
  page?: number
  /**
   * The offending slide's own `id` (`Slide.id`, `ir/index.ts`) — W5
   * whole-branch review finding 2: the README already claimed "validation
   * error messages reference [a slide] by [its] id"; this is what makes
   * that true. Set by every page-scoped issue producer
   * ({@link checkLayoutApplicability}, the content-quality-gate
   * translation in {@link validateIr}, {@link checkDuplicateSlideIds})
   * when the slide in question has an `id` — absent when the slide has
   * none (bare, pre-W5 IR) or the issue is deck-level, not scoped to any
   * single slide. {@link formatIssues} appends it in parens after the page
   * number.
   */
  slideId?: string
}

export interface ValidateResult {
  ok: boolean
  ir?: PptxIR
  errors: ValidationIssue[]
  /**
   * Human-readable "`path`: `alias` → `canonical`" entries for every
   * deterministic field-alias rewrite `validateIr` applied before parsing
   * (W5 task 4, `ir/field-aliases.ts`'s `normalizeComponentAliases`) — e.g. a
   * kpi item's `title` silently adopted as `label`. Present only when at
   * least one rewrite happened; informational, never gates `ok` on its own.
   */
  normalized?: string[]
}

/**
 * English rendering of a `checkIrQuality` finding. `ir-quality.ts` writes its
 * `message` field for a (Chinese-language) content-authoring UI; once wired
 * into `validateIr` those findings become part of the public CLI/API error
 * surface, which must stay English. Translate by `code` here instead of
 * changing `ir-quality.ts` itself (and its already-green test suite, which
 * asserts on the Chinese wording directly). Unknown/future codes fall back to
 * a generic English string rather than leaking the untranslated Chinese text.
 *
 * `density` / `bullets_overflow` / `bullet_item_long` (W3 task 3, spec §5):
 * the effective threshold is now scenario-aware (delivery editorial budget,
 * `density` additionally minned against the resolved layout's geometric
 * capacity — spec §5's dual-attribute capacity split), so the number can no
 * longer be read off a flat constant here. `checkIrQuality` resolves both
 * `min()` candidates once (the single place that runs the layout-selection
 * path render also uses) and attaches them to the issue via `density` /
 * `bulletsBudget` — this function only formats what it's handed.
 */
function describeQualityIssue(issue: QualityIssue): string {
  switch (issue.code) {
    case "empty_deck":
      return "deck has no slides"
    case "missing_heading":
      return "slide is missing a heading"
    case "long_heading":
      return `heading exceeds ${CAPACITY.headingMaxChars} characters — tighten it into a short, assertive phrase`
    case "density": {
      const d = issue.density
      // Defensive fallback only — checkIrQuality always attaches `density`
      // alongside a "density" code (same total-function posture as the rest
      // of this file's `?.`/`??` guards); never actually hit.
      if (!d) return "too many components on this slide — split into multiple slides"
      const { limit, delivery, deliveryBudget, layoutId, layoutCapacity } = d
      if (layoutCapacity === undefined || layoutCapacity === deliveryBudget) {
        // No geometric term (image-cover bypass or a takeover with no body
        // capacity), or it agrees with the editorial budget — nothing extra
        // to disambiguate, name the delivery alone.
        return `too many components on this slide (max ${limit} for ${delivery} delivery) — split into multiple slides`
      }
      return layoutCapacity > deliveryBudget
        ? // Delivery is the binding side, but the layout itself allows more —
          // name both so a generous-looking layout (e.g. bento-panel's 6)
          // doesn't read as a bug.
          `too many components on this slide (max ${limit} — ${layoutId} fits ${layoutCapacity} but ${delivery} delivery caps at ${limit}) — split into multiple slides`
        : // The layout's own capacity is the binding side.
          `too many components on this slide (max ${limit} — ${layoutId} layout's capacity is tighter than ${delivery} delivery's ${deliveryBudget}) — split into multiple slides`
    }
    case "bullets_overflow": {
      const b = issue.bulletsBudget
      return b
        ? `bullet list has too many items (max ${b.maxItems} for ${b.delivery} delivery) — trim it or split into multiple slides`
        : "bullet list has too many items — trim it or split into multiple slides"
    }
    case "bullet_item_long": {
      const b = issue.bulletsBudget
      return b
        ? `a bullet item is too long for ${b.delivery} delivery — keep it within about 2 lines`
        : "a bullet item is too long — keep it within about 2 lines"
    }
    case "big_number_no_kpi":
      return "big_number arrangement is missing a kpi_cards component"
    default:
      return `content quality issue (${issue.code})`
  }
}

/**
 * Layout applicability hard gate (W2 task 3, spec §6): when a slide names an
 * explicit `layout`, it must (a) exist in `LAYOUT_REGISTRY` and (b) declare
 * that slide's `type` in its `slideTypes`. (b) is what fixes the "cover
 * hijack" flaw the W2 pre-flight inventory flagged — before this task, a
 * cover slide could set `variant: "image_top"` (a content-only takeover) and
 * get silently hijacked by it at render time; now it's a validate error with
 * the slide's page number, same shape as every other validation issue.
 *
 * Deliberately does *not* check `arrangement` against the layout's declared
 * `arrangements` — that compatibility stays declarative metadata this wave
 * (W3 decides its gate semantics, spec §8 W2 row).
 */
function checkLayoutApplicability(ir: PptxIR): ValidationIssue[] {
  const errors: ValidationIssue[] = []
  ir.slides.forEach((slide, i) => {
    if (slide.layout === undefined) return
    const def = getLayout(slide.layout)
    const available = layoutsForSlideType(slide.type)
      .map((l) => l.id)
      .join(", ")
    if (!def) {
      errors.push({
        path: `slides.${i}.layout`,
        page: i + 1,
        ...(slide.id !== undefined ? { slideId: slide.id } : {}),
        message: `unknown layout "${slide.layout}" — available for "${slide.type}" slides: ${available}`,
      })
    } else if (!def.slideTypes.includes(slide.type)) {
      errors.push({
        path: `slides.${i}.layout`,
        page: i + 1,
        ...(slide.id !== undefined ? { slideId: slide.id } : {}),
        message: `layout "${slide.layout}" is not valid for "${slide.type}" slides — available: ${available}`,
      })
    }
  })
  return errors
}

/**
 * Full-body component exclusivity hard gate (structure-components wave task
 * 1, decision 2 — set extended by task 2, unchanged in shape): a
 * `FULL_BODY_TYPES` member (`swot`/`bmc`/`waterfall`/`gantt`,
 * `component-traits.ts`) is meant to own an entire slide's content rect by
 * itself (`SvgContent.tsx` hands it the whole rect verbatim) — a slide that
 * pairs one with *any* other component (another full-body type included)
 * has nowhere left to put that sibling, so this is a hard validation error,
 * not a silent "drop the extra component(s) and render anyway" degrade.
 * Same shape as {@link checkLayoutApplicability} right above: one
 * page-scoped `ValidationIssue` per offending slide, naming the offending
 * full-body type(s) so the message is actionable without needing to open
 * the slide's own JSON.
 */
function checkFullBodyExclusivity(ir: PptxIR): ValidationIssue[] {
  const errors: ValidationIssue[] = []
  ir.slides.forEach((slide, i) => {
    const fullBodyTypes = slide.components.filter((c) => FULL_BODY_TYPES.has(c.type))
    if (fullBodyTypes.length === 0 || slide.components.length === 1) return
    const names = [...new Set(fullBodyTypes.map((c) => c.type))].join(", ")
    errors.push({
      path: `slides.${i}.components`,
      page: i + 1,
      ...(slide.id !== undefined ? { slideId: slide.id } : {}),
      message: `"${names}" is a full-body component and must be the slide's only component (found ${slide.components.length} components)`,
    })
  })
  return errors
}

/**
 * Duplicate slide id hard gate (W5 task 1): `slide.id` is a stable page
 * identity plan/assemble stamps on (spec-adjacent — see `ir/index.ts`'s
 * `id` docstring), so two slides sharing one within the same deck is always
 * an authoring/assemble bug, never legitimate input. One issue for the
 * whole deck (`path: "slides"`, no `page` — the problem spans multiple
 * slides, a single page number can't represent it), listing every
 * duplicated id and the 1-based pages it appears on. Slides that omit `id`
 * (bare, pre-W5 IR) are never compared — `undefined` is not a value that can
 * collide with itself.
 *
 * `slideId` (W5 whole-branch review finding 2) is set to the *first*
 * duplicated id, the same "representative id" shape `src/plan/index.ts`'s
 * own deck/plan-wide checks already use (e.g. `checkAlternatePolicy`) for an
 * issue that — unlike `checkLayoutApplicability`'s — is not itself scoped to
 * one single slide: this issue can list more than one distinct duplicated id
 * (`"a" (pages 1,2), "b" (pages 3,4)`), so a single `slideId` field is never
 * more than a representative pointer into that list, not a full account of
 * it — the `message` string remains the complete, authoritative accounting.
 * `page` deliberately stays unset regardless (see above): `formatIssues`
 * only appends `slideId` alongside a `page`, so this representative id does
 * not, on its own, change this issue's printed format.
 */
function checkDuplicateSlideIds(ir: PptxIR): ValidationIssue[] {
  const pagesById = new Map<string, number[]>()
  ir.slides.forEach((slide, i) => {
    if (slide.id === undefined) return
    const pages = pagesById.get(slide.id)
    if (pages) pages.push(i + 1)
    else pagesById.set(slide.id, [i + 1])
  })
  const duplicates = [...pagesById].filter(([, pages]) => pages.length > 1)
  if (duplicates.length === 0) return []
  const list = duplicates.map(([id, pages]) => `"${id}" (pages ${pages.join(", ")})`).join(", ")
  return [
    {
      path: "slides",
      slideId: duplicates[0]![0],
      message: `duplicate slide id(s): ${list} — slide ids must be unique within a deck`,
    },
  ]
}

/**
 * Validate raw JSON against the IR schema, then — once it parses — resolve
 * `scenario` (`resolveScenario`, spec §5: an unrecognized preset name is a
 * `scenario`-path error, page-less) and run the content-quality gate
 * (`checkIrQuality`, passed the resolved axes) against the parsed IR. All
 * stages must pass for `ok: true`. Quality findings are reported the same
 * way as schema errors (page-scoped, 1-based). `checkIrQuality` itself tags
 * findings "warn" vs "error", but that split was designed for its original
 * consumer (surfacing informational warnings in a UI after generation, per
 * its own docstring) — here it is the pre-generation hard gate, so any
 * finding blocks (`ok: false`), not only "error"-severity ones. Treating
 * "warn" findings (e.g. a cover with no heading) as advisory-only would
 * defeat the point of wiring this in: the spec's core principle is a hard
 * protocol gate, not hoped-for prompt compliance.
 *
 * Before any of that, `normalizeComponentAliases` (W5 task 4,
 * `ir/field-aliases.ts`) gets one deterministic pass at `input` — rewriting
 * a known synonym field name (kpi `title`→`label`, quote `content`→`text`,
 * …) only where the canonical key is absent, so the schema parse below never
 * sees the alias as an "unrecognized key" in the first place. Ordering
 * versus the v2 migration check right above it is unobservable (v2 IR uses
 * `blocks`, never `components`, so the normalizer's slide/component walk is
 * always a no-op on it) — it runs second here only so a doomed v2 input
 * skips the extra walk. Purely informational: every rewrite is recorded as a
 * human-readable `path: alias → canonical` string and threaded onto
 * `ValidateResult.normalized` on *every* return path below via
 * `withNormalized`, success or failure alike — it never itself gates `ok`.
 */
export function validateIr(input: unknown): ValidateResult {
  // IR v2 friendly migration message (dev-channel scope, spec §8: W1 started
  // it with the theme.override→theme.style mapping, W2 task 3 appended the
  // second — variant split into layout + arrangement — and W2 task 4 appends
  // the third and last one for this wave here: blocks are now components).
  if (typeof input === "object" && input !== null && (input as Record<string, unknown>).version === "2") {
    return {
      ok: false,
      errors: [
        {
          path: "version",
          message:
            'IR v2 is not supported by pptfast 0.3 — set version to "3" (theme.override is gone, use theme.style. variant is split into layout and arrangement. blocks are now components)',
        },
      ],
    }
  }
  const { value: normalizedInput, normalized } = normalizeComponentAliases(input)
  const withNormalized = (result: ValidateResult): ValidateResult =>
    normalized.length > 0 ? { ...result, normalized } : result

  const r = PptxIRSchema.safeParse(normalizedInput)
  if (!r.success) {
    const errors = r.error.issues.map((issue) => {
      const path = issue.path.join(".")
      const m = /^slides\.(\d+)/.exec(path)
      return { path, message: issue.message, page: m ? Number(m[1]) + 1 : undefined }
    })
    return withNormalized({ ok: false, errors })
  }
  // Installed-theme check (schema layer keeps theme.id open — see ThemeSchema
  // in ir/index.ts — so this hard gate is the only place an unknown id is
  // actually rejected, with the available list in the message). Installed =
  // the 13 builtins + anything registered via themes/definitions.ts's
  // registerTheme (W3 task 4's SDK seam) — a strict superset of the old
  // BUILTIN_THEME_IDS-only check, same error shape.
  const installedThemeIds = getInstalledThemeIds()
  if (!installedThemeIds.includes(r.data.theme.id)) {
    return withNormalized({
      ok: false,
      errors: [
        {
          path: "theme.id",
          message: `unknown theme "${r.data.theme.id}" — available: ${installedThemeIds.join(", ")} (see \`pptfast themes\`)`,
        },
      ],
    })
  }
  const layoutErrors = checkLayoutApplicability(r.data)
  if (layoutErrors.length > 0) return withNormalized({ ok: false, errors: layoutErrors })
  const fullBodyErrors = checkFullBodyExclusivity(r.data)
  if (fullBodyErrors.length > 0) return withNormalized({ ok: false, errors: fullBodyErrors })
  const duplicateIdErrors = checkDuplicateSlideIds(r.data)
  if (duplicateIdErrors.length > 0) return withNormalized({ ok: false, errors: duplicateIdErrors })
  // Scenario resolution (spec §5's defaults chain, W3 task 2). Both branches
  // of the schema's `scenario` union (ScenarioAxesInputSchema in ir/index.ts)
  // are open now — a preset-name string and an axes object alike — the same
  // open-schema/closed-semantic pattern as theme.id above, so resolveScenario
  // is the *sole* place any scenario semantics (unrecognized preset name,
  // unrecognized axis key, unrecognized axis value) get rejected. This one
  // try/catch is therefore the only path that can produce a `scenario`
  // ValidationIssue, for all of those cases — deliberate, per the W3 task-2
  // review finding: nesting a schema-closed enum object inside a z.union
  // meant a failing branch reported as one opaque zod `invalid_union` issue
  // ("Invalid input", no specifics), never resolveScenario's own
  // available-values message. r.data.scenario's inferred type
  // (`string | Record<string, unknown> | undefined`) is wider than
  // resolveScenario's declared parameter — safe to narrow here because
  // resolveScenario validates every key and value itself at runtime
  // regardless of what the schema let through (its own test suite pins
  // that). The resolved axes are not written back onto r.data (see the
  // scenario field's docstring in ir/index.ts) — they are only threaded into
  // checkIrQuality below for task 3 to consume.
  let resolvedAxes: ScenarioAxes
  try {
    resolvedAxes = resolveScenario(r.data.scenario as string | Partial<ScenarioAxes> | undefined)
  } catch (err) {
    if (!(err instanceof PptfastError)) throw err
    return withNormalized({ ok: false, errors: [{ path: "scenario", message: err.message }] })
  }
  const quality = checkIrQuality(r.data, resolvedAxes)
  if (quality.length === 0) return withNormalized({ ok: true, ir: r.data, errors: [] })
  // `issue.slide` indexes `r.data.slides` directly for every code but
  // "empty_deck" (that branch never reaches here, see its own `slide: 0`
  // bookkeeping in ir-quality.ts's checkIrQuality — an early return makes it
  // the sole issue whenever it fires) — safe to read `.id` off it unguarded.
  // `slideId` (W5 whole-branch review finding 2) set only when that slide
  // itself has one, same as checkLayoutApplicability's own producer above.
  const errors: ValidationIssue[] = quality.map((issue) =>
    issue.code === "empty_deck"
      ? { path: "slides", message: describeQualityIssue(issue) }
      : {
          path: `slides.${issue.slide}`,
          message: describeQualityIssue(issue),
          page: issue.slide + 1,
          ...(r.data.slides[issue.slide]!.id !== undefined ? { slideId: r.data.slides[issue.slide]!.id } : {}),
        },
  )
  return withNormalized({ ok: false, errors })
}

/**
 * `"page 2 (p-kpi) — path: message"` when the issue carries both a `page`
 * and a `slideId` (W5 whole-branch review finding 2 — the README's own
 * claim that a validation error "references [a slide] by [its] id", made
 * true) — the parenthesized id is appended only alongside a `page` number,
 * never on its own: a deck-level issue that happens to set a representative
 * `slideId` with no `page` ({@link checkDuplicateSlideIds} above) keeps its
 * pre-existing, unchanged format. Every other combination — `page` with no
 * `slideId` (an id-less slide), or neither — is byte-identical to before
 * this task.
 */
export function formatIssues(errors: ValidationIssue[]): string {
  return errors
    .map((e) => {
      if (!e.page) return `${e.path}: ${e.message}`
      const idSuffix = e.slideId !== undefined ? ` (${e.slideId})` : ""
      return `page ${e.page}${idSuffix} — ${e.path}: ${e.message}`
    })
    .join("\n")
}

/** Render a single slide to standalone SVG markup (preview / self-check). */
export function renderSlideSvg(ir: PptxIR, slideIndex: number): string {
  const slide = ir.slides[slideIndex]
  if (!slide) {
    throw new PptfastError(`slide index ${slideIndex} out of range — deck has ${ir.slides.length} slides`)
  }
  return slideToSvgMarkup(ir, slide, slideIndex)
}

/**
 * Draft gate (W5 task 1): `generatePptx` refuses to export a deck that still
 * has unfilled `placeholder` pages unless the caller opts in with
 * `{ draft: true }` — a placeholder page is assemble's stand-in for content
 * nobody has written yet, so a plain export silently shipping it would be a
 * worse failure mode than a loud one. `renderSlideSvg` (single-slide
 * preview) deliberately never calls this — an agent iterating on a
 * partially-filled deck needs to preview whatever page it just wrote without
 * every other still-empty page blocking it.
 */
function checkDraftGate(ir: PptxIR): void {
  const placeholders = ir.slides
    .map((slide, i) => ({ slide, page: i + 1 }))
    .filter(({ slide }) => slide.placeholder)
  if (placeholders.length === 0) return
  const refs = placeholders
    .map(({ slide, page }) => (slide.id ? `${slide.id} (page ${page})` : `page ${page}`))
    .join(", ")
  throw new PptfastError(
    `deck has ${placeholders.length} unfilled placeholder page${placeholders.length === 1 ? "" : "s"}: ${refs} — fill them or pass --draft`,
  )
}

/** Full pipeline: validate → SVG → DrawingML → animation patches → pptx bytes. */
export async function generatePptx(input: unknown, opts?: { draft?: boolean }): Promise<Uint8Array> {
  const v = validateIr(input)
  if (!v.ok) throw new PptfastError(`invalid IR:\n${formatIssues(v.errors)}`)
  if (!opts?.draft) checkDraftGate(v.ir!)
  const blob = await generatePptxBlob(v.ir!)
  return new Uint8Array(await blob.arrayBuffer())
}

export interface ThemeInfo {
  id: string
  label: string
  colors: Record<string, unknown>
}

/** Built-in theme catalog with labels and style color tokens. */
export function listThemes(): ThemeInfo[] {
  return CANONICAL_THEME_IDS.map((id) => ({
    id,
    label: THEME_LABELS[id],
    colors: { ...THEME_STYLES[id].colors } as Record<string, unknown>,
  }))
}

/** JSON Schema for the IR — feed this to a model before it writes IR. */
export function irJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(PptxIRSchema) as Record<string, unknown>
}

/** JSON Schema for style-token overrides (IR theme.style, --style files, config "style"). */
export function styleJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(StyleOverrideSchema) as Record<string, unknown>
}
