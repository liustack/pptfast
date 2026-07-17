import { z } from "zod"
import { PptfastError } from "./errors"
import { BUILTIN_STYLE_IDS, PptxIRSchema, TokensOverrideSchema, type PptxIR } from "./ir"
import { generatePptxBlob } from "./pptx/generate"
import { CAPACITY } from "./svg/audit/capacity"
import { checkIrQuality, type QualityIssue } from "./svg/ir-quality"
import { slideToSvgMarkup } from "./svg/render-slide"
import { CANONICAL_THEME_IDS, THEME_LABELS, THEME_TOKENS } from "./themes"

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
 */
function describeQualityIssue(issue: QualityIssue, styleId: string): string {
  switch (issue.code) {
    case "empty_deck":
      return "deck has no slides"
    case "missing_heading":
      return "slide is missing a heading"
    case "long_heading":
      return `heading exceeds ${CAPACITY.headingMaxChars} characters — tighten it into a short, assertive phrase`
    case "density": {
      const limit = CAPACITY.maxBlocksPerSlideOverrides[styleId] ?? CAPACITY.maxBlocksPerSlide
      return `too many blocks on this slide (max ~${limit}) — split into multiple slides`
    }
    case "bullets_overflow":
      return `bullet list has too many items (max ${CAPACITY.bullets.maxItems}) — trim it or split into multiple slides`
    case "bullet_item_long":
      return "a bullet item is too long — keep it within about 2 lines"
    case "big_number_no_kpi":
      return "big_number variant is missing a kpi_cards block"
    default:
      return `content quality issue (${issue.code})`
  }
}

/**
 * Validate raw JSON against the IR schema, then — once it parses — run the
 * content-quality gate (`checkIrQuality`) against the parsed IR. Both stages
 * must pass for `ok: true`. Quality findings are reported the same way as
 * schema errors (page-scoped, 1-based). `checkIrQuality` itself tags findings
 * "warn" vs "error", but that split was designed for its original consumer
 * (surfacing informational warnings in a UI after generation, per its own
 * docstring) — here it is the pre-generation hard gate, so any finding blocks
 * (`ok: false`), not only "error"-severity ones. Treating "warn" findings
 * (e.g. a cover with no heading) as advisory-only would defeat the point of
 * wiring this in: the spec's core principle is a hard protocol gate, not
 * hoped-for prompt compliance.
 */
export function validateIr(input: unknown): ValidateResult {
  // IR v2 friendly migration message (dev-channel scope, spec §8 W1 row: only
  // the mapping this wave completed — theme→style. Later waves append their
  // own mapping to this same message as blocks→components / variant→block land).
  if (typeof input === "object" && input !== null && (input as Record<string, unknown>).version === "2") {
    return {
      ok: false,
      errors: [
        {
          path: "version",
          message:
            'IR v2 is not supported by pptfast 0.3 — set version to "3" and rename theme to style (theme.override is gone, use style.tokens)',
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
  // Installed-style check (schema layer keeps style.id open — see StyleSchema
  // in ir/index.ts — so this hard gate is the only place an unknown id is
  // actually rejected, with the available list in the message).
  if (!(BUILTIN_STYLE_IDS as readonly string[]).includes(r.data.style.id)) {
    return {
      ok: false,
      errors: [
        {
          path: "style.id",
          message: `unknown style "${r.data.style.id}" — available: ${BUILTIN_STYLE_IDS.join(", ")} (see \`pptfast styles\`)`,
        },
      ],
    }
  }
  const quality = checkIrQuality(r.data)
  if (quality.length === 0) return { ok: true, ir: r.data, errors: [] }
  const errors: ValidationIssue[] = quality.map((issue) =>
    issue.code === "empty_deck"
      ? { path: "slides", message: describeQualityIssue(issue, r.data.style.id) }
      : {
          path: `slides.${issue.slide}`,
          message: describeQualityIssue(issue, r.data.style.id),
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

export interface StyleInfo {
  id: string
  label: string
  colors: Record<string, unknown>
}

/** Built-in style catalog with labels and theme color tokens. */
export function listStyles(): StyleInfo[] {
  return CANONICAL_THEME_IDS.map((id) => ({
    id,
    label: THEME_LABELS[id],
    colors: { ...THEME_TOKENS[id].colors } as Record<string, unknown>,
  }))
}

/** JSON Schema for the IR — feed this to a model before it writes IR. */
export function irJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(PptxIRSchema) as Record<string, unknown>
}

/** JSON Schema for brand-token overrides (IR theme.tokens, --tokens files, config "tokens"). */
export function tokensJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(TokensOverrideSchema) as Record<string, unknown>
}
