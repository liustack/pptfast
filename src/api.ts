import { z } from "zod"
import { PptfastError } from "./errors"
import { PptxIRSchema, type PptxIR } from "./ir"
import { generatePptxBlob } from "./pptx/generate"
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

/** Validate raw JSON against the IR schema. Returns readable, page-scoped issues. */
export function validateIr(input: unknown): ValidateResult {
  const r = PptxIRSchema.safeParse(input)
  if (r.success) return { ok: true, ir: r.data, errors: [] }
  const errors = r.error.issues.map((issue) => {
    const path = issue.path.join(".")
    const m = /^slides\.(\d+)/.exec(path)
    return { path, message: issue.message, page: m ? Number(m[1]) + 1 : undefined }
  })
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

/** Built-in theme catalog with labels and color tokens. */
export function listThemes(): ThemeInfo[] {
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
