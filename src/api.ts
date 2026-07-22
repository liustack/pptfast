import { z } from "zod"
import { PptfastError } from "./errors"
import { PptxIRSchema, StyleOverrideSchema, type PptxIR } from "./ir"
import { normalizeComponentAliases } from "./ir/field-aliases"
import { generatePptxBlob } from "./pptx/generate"
import { resolveNarrative, type NarrativeProfile } from "./narrative"
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
   * ({@link checkLayoutApplicability}, {@link checkBoundaryPageContent},
   * the content-quality-gate translation in {@link validateIr},
   * {@link checkDuplicateSlideIds})
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
  /**
   * Backward-compatible addition (borrow wave, Task 2 — dual-threshold
   * severity recalibration): warn-severity {@link checkIrQuality} findings
   * (editorial-budget codes — `missing_heading`/`long_heading`/`density`/
   * `bullets_overflow`/`bullet_item_long`/`big_number_no_kpi`), formatted the
   * same shape {@link formatIssues} already prints for `errors` (page/id/path
   * all included). Present only when at least one warn-severity finding
   * exists, and never gates `ok` on its own — that is exactly what moved
   * these findings off `errors` and onto here. Can be present alongside a
   * failing (`ok:false`) result too, whenever `checkIrQuality` itself ran
   * (an *earlier* hard gate — schema, theme id, layout applicability,
   * full-body exclusivity, boundary-page content, duplicate ids, narrative —
   * short-circuits before `checkIrQuality` runs at all, so a deck rejected
   * by one of those never reaches this field either way, see `validateIr`'s
   * own body for the exact gate order). {@link formatWarnings} renders this
   * array as CLI-ready `"warning: ..."` lines.
   */
  warnings?: ValidationIssue[]
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
 * the effective threshold is now narrative-aware (pacing editorial budget,
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
      const { limit, pacing, pacingBudget, layoutId, layoutCapacity } = d
      if (layoutCapacity === undefined || layoutCapacity === pacingBudget) {
        // No geometric term (image-cover bypass or a takeover with no body
        // capacity), or it agrees with the editorial budget — nothing extra
        // to disambiguate, name the pacing alone.
        return `too many components on this slide (max ${limit} for ${pacing} pacing) — split into multiple slides`
      }
      return layoutCapacity > pacingBudget
        ? // Pacing is the binding side, but the layout itself allows more —
          // name both so a generous-looking layout (e.g. bento-panel's 6)
          // doesn't read as a bug.
          `too many components on this slide (max ${limit} — ${layoutId} fits ${layoutCapacity} but ${pacing} pacing caps at ${limit}) — split into multiple slides`
        : // The layout's own capacity is the binding side.
          `too many components on this slide (max ${limit} — ${layoutId} layout's capacity is tighter than ${pacing} pacing's ${pacingBudget}) — split into multiple slides`
    }
    case "bullets_overflow": {
      const b = issue.bulletsBudget
      return b
        ? `bullet list has too many items (max ${b.maxItems} for ${b.pacing} pacing) — trim it or split into multiple slides`
        : "bullet list has too many items — trim it or split into multiple slides"
    }
    case "bullets_count_overflow":
      // P0 hardening (robustness deep-review D1, borrow-wave Task 2's
      // dual-threshold machinery reused, not a new severity system): the
      // count-based escalation of "bullets_overflow" above — severity
      // "error", so this is the one bullets-count message that actually
      // blocks `ok`. Like `bullet_item_overflow`, `CAPACITY.bullets
      // .countOverflowItems` is a flat, pacing-independent ceiling (see its
      // own derivation comment, capacity.ts): past this many items, the
      // render-side box.h cap (bullets.tsx, same task) will still land the
      // file successfully, but "graceful truncation" stops describing the
      // outcome honestly — most of the content would silently vanish
      // behind a single "+N more" marker.
      return `bullet list has far too many items (over ${CAPACITY.bullets.countOverflowItems}) — most would silently drop behind a "+N more" marker rather than render; trim it substantially or split into multiple slides`
    case "bullet_item_long": {
      const b = issue.bulletsBudget
      return b
        ? `a bullet item is too long for ${b.pacing} pacing — keep it within about 2 lines`
        : "a bullet item is too long — keep it within about 2 lines"
    }
    case "bullet_item_overflow":
      // Task 2 (borrow wave, dual-threshold severity): the geometric
      // counterpart to `bullet_item_long` above — severity "error", not
      // "warn", so this is the one bullets message that actually blocks
      // `ok`. `CAPACITY.bullets.itemOverflowUnits` is a flat, pacing-
      // independent ceiling (see its own derivation comment, capacity.ts),
      // unlike `bullet_item_long`'s per-pacing `maxUnitsPerItem`.
      //
      // Wording (review fix round): "will be truncated" overstated it — the
      // ceiling carries a deliberate safety margin below every style's real
      // truncation edge (~56-60 units across all five bullet styles per the
      // truncation-visibility fix, 2026-07-22 — see capacity.ts's own
      // derivation comment — vs. this 50-unit ceiling), so an item past the
      // ceiling can still render with zero `data-truncated`. "can truncate"
      // covers that margin: crossing this ceiling is a real render-safety
      // risk worth fixing, not a guaranteed loss.
      return `a bullet item exceeds the render-safety limit (${CAPACITY.bullets.itemOverflowUnits} width units) and can truncate — shorten it substantially or split the point across two items`
    case "big_number_no_kpi":
      return "big_number arrangement is missing a kpi_cards component"
    case "chart_axes_ignored": {
      // chart-axes feature: `axes` (x_title/y_title/show_grid) only renders
      // for bar/line (chart.tsx's AXES_APPLICABLE_TYPES) — names the
      // offending chart_type via `issue.chartAxesIgnored`, same
      // structured-field convention as `density`/`bulletsBudget` above.
      const chartType = issue.chartAxesIgnored?.chartType
      return chartType
        ? `axes settings (x_title/y_title/show_grid) are not supported for "${chartType}" charts and are ignored — only bar and line charts render them`
        : "chart axes settings (x_title/y_title/show_grid) are not supported for this chart type and are ignored — only bar and line charts render them"
    }
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
 * Boundary-page render-surface hard gate (bench-driven fixes wave, defect
 * D): `cover`, `chapter`, and `ending` slides can never render `components`
 * or `footnote` — every archetype in all three families
 * (`src/svg/archetypes/index-{chapter,ending}.ts`'s registries, the 8 cover
 * archetypes `index.ts` re-exports, plus the background-asset
 * `ImageCoverPage` takeover that intercepts cover/chapter before any
 * archetype runs, `src/svg/ImagePages.tsx` — `FullSlideSvg.tsx`'s
 * `imageCoverTakeover` branch) was read to confirm zero exceptions before
 * this gate was written. A slide carrying either field on one of these
 * three types was previously silently dropped at render with no signal
 * anywhere — this makes it a validate error instead, naming exactly which
 * fields to move or remove. `docs/deck-projects.md`'s boundary-page render
 * surface table carries the full per-type accounting this gate's rule is
 * the "always dead, zero exceptions" subset of.
 *
 * `content` is deliberately never gated on any field: its own `footnote`
 * (dropped only by the `two-column` archetype) and `subheading` (dropped
 * only by the `image-top` takeover) are each a minority exception among
 * that type's full archetype set, not a universal "never" — the same
 * reason `subheading` is deliberately absent from `cover`/`chapter`/
 * `ending`'s rule below despite the benchmark evidence that first flagged
 * this defect suspecting it might belong: `subheading` renders
 * unconditionally on all 8 cover archetypes, on 5 of `chapter`'s 8 (all but
 * `fashion-chapter`/`poster-chapter`/`tone-adaptive-chapter`), and on 6 of
 * `ending`'s 7 (all but `tone-adaptive-ending`) — gating any of those at
 * the type level would be a false positive for the majority archetype that
 * does render it. A hard gate must be sound for every reachable render
 * path, not just the one the benchmark's four questions happened to hit.
 *
 * Placeholder pages (`slide.placeholder`) are exempt, same as
 * {@link checkIrQuality}'s content rules — an assemble-generated unfilled
 * stub has no real content to judge. `notes` (speaker notes, never
 * rendered onto the canvas by design — see its own docstring in
 * `ir/index.ts`) is never checked here or anywhere else in the render/audit
 * chain, by construction, not by an added exemption.
 */
function checkBoundaryPageContent(ir: PptxIR): ValidationIssue[] {
  const errors: ValidationIssue[] = []
  ir.slides.forEach((slide, i) => {
    if (slide.placeholder) return
    if (slide.type !== "cover" && slide.type !== "chapter" && slide.type !== "ending") return
    const ignored: string[] = []
    if (slide.components.length > 0) ignored.push("components")
    if (slide.footnote) ignored.push("footnote")
    if (ignored.length === 0) return
    errors.push({
      path: `slides.${i}`,
      page: i + 1,
      ...(slide.id !== undefined ? { slideId: slide.id } : {}),
      message: `"${slide.type}" slides do not render ${ignored.join("/")} — move this content to a content slide or remove it`,
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
 * `narrative` (`resolveNarrative`, spec §5: an unrecognized preset name is a
 * `narrative`-path error, page-less) and run the content-quality gate
 * (`checkIrQuality`, passed the resolved axes) against the parsed IR. Every
 * hard-gate stage (schema, theme id, layout applicability, full-body
 * exclusivity, boundary-page content, duplicate ids, narrative) must pass for
 * `ok: true`, same as before. Quality findings are reported the same way as
 * schema errors (page-scoped, 1-based).
 *
 * Dual-threshold severity (borrow wave, Task 2 — recalibrated from the prior
 * "any finding blocks" design): `checkIrQuality`'s own "warn" vs "error" tag
 * is now respected, not flattened. Only "error"-severity findings
 * (`empty_deck`, `bullet_item_overflow` — content genuinely lost: an empty
 * deck, or a bullet item long enough to hit `bullets.tsx`'s MIN_FONT floor
 * and actually get truncated) gate `ok`. "warn"-severity findings — the
 * editorial-budget codes (`missing_heading`/`long_heading`/`density`/
 * `bullets_overflow`/`bullet_item_long`/`big_number_no_kpi`) — surface on
 * {@link ValidateResult.warnings} instead: visible to every caller (the SDK,
 * the CLI's `validate`/`render` pre-flight), never blocking. This reverses
 * the prior posture (this comment used to read "any finding blocks... not
 * only 'error'-severity ones") because the evidence behind it did not hold:
 * a boundary scan (borrow-wave fact-report, Q3) found the editorial bullets
 * threshold blocking content roughly 3.5x below where `bullets.tsx`'s own
 * render safety net (2-line wrap, shrink to a 14px floor) actually starts
 * losing characters — so the hard gate was rejecting deck content that
 * would have rendered with zero visible defect, and a tight hard gate on an
 * editorial (not geometric) threshold taught truncate-content-to-pass
 * workarounds rather than catching real loss. `generatePptx`'s default path
 * inherits this unchanged (`if (!v.ok) throw`) — it already only ever
 * blocked on `ok`, never inspected `errors`/`warnings` directly.
 *
 * Before any of that, one deterministic alias pass runs
 * ({@link normalizeComponentAliases}, W5 task 4) for the component
 * field-name synonym rescue only (kpi `title`→`label`, quote
 * `content`→`text`, …) — a weak-model rescue for schema-internal synonym
 * drift, scoped to `slides[]`. It only rewrites where the canonical key is
 * absent, so the schema parse below never sees an alias as an "unrecognized
 * key" in the first place. Purely informational: every rewrite is recorded
 * as a human-readable `path: alias → canonical` string and threaded onto
 * `ValidateResult.normalized` on *every* return path below via
 * `withNormalized`, success or failure alike — it never itself gates `ok`.
 *
 * There is deliberately no root/narrative-level alias pass (spec §16,
 * reversing the now-superseded §15.4): a v4 document that still spells its
 * pre-rename vocabulary — `scenario` instead of `narrative`, `mode`/
 * `delivery` instead of `strategy`/`pacing`, or the old enum values
 * `"text"`/`"presentation"`/`"narrative"` — is not old-vocabulary
 * *compatibility*, it is exactly the vocabulary this rename retired, so it
 * hard-errors like any other unknown key or value: `scenario` fails the
 * schema's `.strict()` parse below as an unrecognized key, and an old enum
 * value (or the axis-key names `mode`/`delivery` inside `narrative`, which
 * the schema itself leaves open) fails `resolveNarrative`'s own runtime
 * check, listing the current values. `pptfast migrate` (`ir/migrate.ts`)
 * remains the sanctioned bridge for a genuine v3 document — see the v3 hard
 * reject below, which points there.
 *
 * The component-alias pass only ever runs for a document already headed for
 * the v4 schema — an explicit `version: "2"` or `version: "3"` is
 * hard-rejected first, below, before the alias pass or any schema parse
 * (spec §9.3: a v2/v3 document is never silently reinterpreted as v4).
 */
export function validateIr(input: unknown): ValidateResult {
  const version = typeof input === "object" && input !== null ? (input as Record<string, unknown>).version : undefined

  // IR v2 hard reject (spec §15.3): a combined mapping straight to v4 — v2
  // has no real users, so there is no reason to route it through the v3
  // vocabulary as a stepping stone. `pptfast migrate` only accepts v3 input
  // (spec §15.3: "不接 v2"), so this message does not point to it — a v2
  // document must be rewritten by hand using the mapping below.
  if (version === "2") {
    return {
      ok: false,
      errors: [
        {
          path: "version",
          message:
            'IR v2 is not supported by pptfast — set version to "4" and rewrite by hand using this mapping: theme.override is now theme.style. variant is split into layout and arrangement. blocks are now components. scenario is now narrative, with mode renamed to strategy (the "narrative" strategy value is now "storytelling") and delivery renamed to pacing (the "text" pacing value is now "dense", "presentation" is now "spacious", "balanced" is unchanged)',
        },
      ],
    }
  }
  // IR v3 hard reject (spec §9.3): v3 is frozen — a v3 document is never
  // silently reinterpreted as v4, however it spells its axes. Full
  // field/value mapping (spec §9.1) plus the deterministic migration
  // command pointer (`migrateIrV3ToV4`, `ir/migrate.ts`, wrapped by the
  // `pptfast migrate` CLI command, task 2).
  if (version === "3") {
    return {
      ok: false,
      errors: [
        {
          path: "version",
          message:
            'IR v3 is not supported by pptfast 0.4 — set version to "4", or run `pptfast migrate <input> -o <output>` to convert automatically. Mapping: scenario is now narrative. scenario.mode is now narrative.strategy (mode "narrative" is now strategy "storytelling", every other mode value is unchanged). scenario.delivery is now narrative.pacing (delivery "text" is now pacing "dense", "balanced" is unchanged, "presentation" is now "spacious"). scenario.audience is now narrative.audience (unchanged). every other field is unchanged',
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
      let message = issue.message
      // The one retired key a hand-migrated v4 document most plausibly still
      // carries (spec §16 hard-rejects it, no rescue) — the bare zod
      // "Unrecognized key" line names the key but not its successor, so
      // point at the rename and the sanctioned bridge here. The axis keys
      // and old enum values inside `narrative` already self-document via
      // resolveNarrative's own errors.
      if (issue.code === "unrecognized_keys" && path === "" && /"scenario"/.test(message)) {
        message += ' — "scenario" was renamed to "narrative" in IR v4 (for a v3 file run: pptfast migrate <file> -o <out>)'
      }
      return { path, message, page: m ? Number(m[1]) + 1 : undefined }
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
  const boundaryPageErrors = checkBoundaryPageContent(r.data)
  if (boundaryPageErrors.length > 0) return withNormalized({ ok: false, errors: boundaryPageErrors })
  const duplicateIdErrors = checkDuplicateSlideIds(r.data)
  if (duplicateIdErrors.length > 0) return withNormalized({ ok: false, errors: duplicateIdErrors })
  // Narrative resolution (spec §5's defaults chain, W3 task 2; renamed from
  // "scenario resolution" spec §8.1). Both branches of the schema's
  // `narrative` union (NarrativeProfileInputSchema in ir/index.ts) are open
  // now — a preset-name string and an axes object alike — the same
  // open-schema/closed-semantic pattern as theme.id above, so
  // resolveNarrative is the *sole* place any narrative semantics
  // (unrecognized preset name, unrecognized axis key, unrecognized axis
  // value) get rejected. This one try/catch is therefore the only path that
  // can produce a `narrative` ValidationIssue, for all of those cases —
  // deliberate, per the W3 task-2 review finding: nesting a schema-closed
  // enum object inside a z.union meant a failing branch reported as one
  // opaque zod `invalid_union` issue ("Invalid input", no specifics), never
  // resolveNarrative's own available-values message. r.data.narrative's
  // inferred type (`string | Record<string, unknown> | undefined`) is wider
  // than resolveNarrative's declared parameter — safe to narrow here because
  // resolveNarrative validates every key and value itself at runtime
  // regardless of what the schema let through (its own test suite pins
  // that). The resolved axes are not written back onto r.data (see the
  // narrative field's docstring in ir/index.ts) — they are only threaded
  // into checkIrQuality below for task 3 to consume.
  let resolvedAxes: NarrativeProfile
  try {
    resolvedAxes = resolveNarrative(r.data.narrative as string | Partial<NarrativeProfile> | undefined)
  } catch (err) {
    if (!(err instanceof PptfastError)) throw err
    return withNormalized({ ok: false, errors: [{ path: "narrative", message: err.message }] })
  }
  const quality = checkIrQuality(r.data, resolvedAxes)
  if (quality.length === 0) return withNormalized({ ok: true, ir: r.data, errors: [] })
  // `issue.slide` indexes `r.data.slides` directly for every code but
  // "empty_deck" (that branch never reaches here, see its own `slide: 0`
  // bookkeeping in ir-quality.ts's checkIrQuality — an early return makes it
  // the sole issue whenever it fires) — safe to read `.id` off it unguarded.
  // `slideId` (W5 whole-branch review finding 2) set only when that slide
  // itself has one, same as checkLayoutApplicability's own producer above.
  const toIssue = (issue: QualityIssue): ValidationIssue =>
    issue.code === "empty_deck"
      ? { path: "slides", message: describeQualityIssue(issue) }
      : {
          path: `slides.${issue.slide}`,
          message: describeQualityIssue(issue),
          page: issue.slide + 1,
          ...(r.data.slides[issue.slide]!.id !== undefined ? { slideId: r.data.slides[issue.slide]!.id } : {}),
        }
  // Dual-threshold severity split (borrow wave, Task 2 — see this
  // function's own doc comment above for the evidence/rationale): only
  // "error"-severity findings gate `ok`. "warn"-severity findings surface on
  // `warnings` regardless of which branch fires below — a rejected
  // (`ok: false`) deck's warnings are still worth seeing, not just a clean
  // one's.
  const warnFindings = quality.filter((issue) => issue.severity === "warn")
  const warnings = warnFindings.length > 0 ? warnFindings.map(toIssue) : undefined
  const errorFindings = quality.filter((issue) => issue.severity === "error")
  if (errorFindings.length > 0) {
    return withNormalized({ ok: false, errors: errorFindings.map(toIssue), ...(warnings ? { warnings } : {}) })
  }
  return withNormalized({ ok: true, ir: r.data, errors: [], ...(warnings ? { warnings } : {}) })
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

/**
 * `"warning: page 2 (p-kpi) — path: message"` per {@link ValidateResult.warnings}
 * entry (borrow wave, Task 2) — the CLI warn-line convention: `pptfast
 * validate`/`render` print one of these per warn-severity finding, exit 0
 * regardless (only `errors` drives the exit code — see `cli/commands.ts`'s
 * `runValidate`/`runRender`). Formats each issue alone through
 * {@link formatIssues} and prefixes the result rather than duplicating its
 * page/id/path shape — a warning line is byte-identical to an error line
 * past the leading label.
 */
export function formatWarnings(warnings: ValidationIssue[]): string {
  return warnings.map((w) => `warning: ${formatIssues([w])}`).join("\n")
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
