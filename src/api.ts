import { z } from "zod"
import { PptfastError } from "./errors"
import { BUILTIN_THEME_IDS, PptxIRSchema, StyleOverrideSchema, type PptxIR } from "./ir"
import { generatePptxBlob } from "./pptx/generate"
import { resolveScenario, type ScenarioAxes } from "./scenario"
import { CAPACITY } from "./svg/audit/capacity"
import { checkIrQuality, type QualityIssue } from "./svg/ir-quality"
import { getLayout, layoutsForSlideType } from "./svg/layouts/registry"
import { slideToSvgMarkup } from "./svg/render-slide"
import { CANONICAL_THEME_IDS, THEME_LABELS, THEME_STYLES } from "./themes"

export interface ValidationIssue {
  path: string
  message: string
  /** 1-based slide number when the issue is scoped to a slide. */
  page?: number
}

export interface ValidateResult {
  ok: boolean
  ir?: PptxIR
  errors: ValidationIssue[]
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
        message: `unknown layout "${slide.layout}" — available for "${slide.type}" slides: ${available}`,
      })
    } else if (!def.slideTypes.includes(slide.type)) {
      errors.push({
        path: `slides.${i}.layout`,
        page: i + 1,
        message: `layout "${slide.layout}" is not valid for "${slide.type}" slides — available: ${available}`,
      })
    }
  })
  return errors
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
  const r = PptxIRSchema.safeParse(input)
  if (!r.success) {
    const errors = r.error.issues.map((issue) => {
      const path = issue.path.join(".")
      const m = /^slides\.(\d+)/.exec(path)
      return { path, message: issue.message, page: m ? Number(m[1]) + 1 : undefined }
    })
    return { ok: false, errors }
  }
  // Installed-theme check (schema layer keeps theme.id open — see ThemeSchema
  // in ir/index.ts — so this hard gate is the only place an unknown id is
  // actually rejected, with the available list in the message).
  if (!(BUILTIN_THEME_IDS as readonly string[]).includes(r.data.theme.id)) {
    return {
      ok: false,
      errors: [
        {
          path: "theme.id",
          message: `unknown theme "${r.data.theme.id}" — available: ${BUILTIN_THEME_IDS.join(", ")} (see \`pptfast themes\`)`,
        },
      ],
    }
  }
  const layoutErrors = checkLayoutApplicability(r.data)
  if (layoutErrors.length > 0) return { ok: false, errors: layoutErrors }
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
    return { ok: false, errors: [{ path: "scenario", message: err.message }] }
  }
  const quality = checkIrQuality(r.data, resolvedAxes)
  if (quality.length === 0) return { ok: true, ir: r.data, errors: [] }
  const errors: ValidationIssue[] = quality.map((issue) =>
    issue.code === "empty_deck"
      ? { path: "slides", message: describeQualityIssue(issue) }
      : {
          path: `slides.${issue.slide}`,
          message: describeQualityIssue(issue),
          page: issue.slide + 1,
        },
  )
  return { ok: false, errors }
}

export function formatIssues(errors: ValidationIssue[]): string {
  return errors
    .map((e) => (e.page ? `page ${e.page} — ${e.path}: ${e.message}` : `${e.path}: ${e.message}`))
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

/** Full pipeline: validate → SVG → DrawingML → animation patches → pptx bytes. */
export async function generatePptx(input: unknown): Promise<Uint8Array> {
  const v = validateIr(input)
  if (!v.ok) throw new PptfastError(`invalid IR:\n${formatIssues(v.errors)}`)
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
