import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import {
  formatIssues,
  generatePptx,
  irJsonSchema,
  listThemes,
  renderSlideSvg,
  validateIr,
} from "../api"
import { PptfastError } from "../errors"
import { loadIrFile, resolveLocalAssets } from "./load-ir"

export interface RenderOptions {
  output: string
  theme?: string
}

export async function runRender(irPath: string, opts: RenderOptions): Promise<string> {
  const raw = await loadIrFile(irPath)
  if (opts.theme && typeof raw === "object" && raw !== null) {
    ;(raw as Record<string, unknown>).theme = { id: opts.theme }
  }
  const v = validateIr(raw)
  if (!v.ok) throw new PptfastError(`invalid IR:\n${formatIssues(v.errors)}`)
  await resolveLocalAssets(v.ir!, dirname(resolve(irPath)))
  const bytes = await generatePptx(v.ir!)
  await mkdir(dirname(resolve(opts.output)), { recursive: true })
  await writeFile(opts.output, bytes)
  return `wrote ${opts.output} (${v.ir!.slides.length} slides, ${bytes.length} bytes)`
}

/** Returns human-readable report. Throws PptfastError when invalid (CLI exit 1). */
export async function runValidate(irPath: string): Promise<string> {
  const raw = await loadIrFile(irPath)
  const v = validateIr(raw)
  if (!v.ok) throw new PptfastError(`invalid IR (${v.errors.length} issues):\n${formatIssues(v.errors)}`)
  return `OK — ${v.ir!.slides.length} slides, theme "${v.ir!.theme.id}"`
}

export function runSchema(): string {
  return JSON.stringify(irJsonSchema(), null, 2)
}

export function runThemes(asJson: boolean): string {
  const themes = listThemes()
  if (asJson) return JSON.stringify(themes, null, 2)
  return themes.map((t) => `${t.id.padEnd(12)} ${t.label}`).join("\n")
}

export async function runPreview(irPath: string, outDir: string): Promise<string> {
  const raw = await loadIrFile(irPath)
  const v = validateIr(raw)
  if (!v.ok) throw new PptfastError(`invalid IR:\n${formatIssues(v.errors)}`)
  await mkdir(outDir, { recursive: true })
  const ir = v.ir!
  for (let i = 0; i < ir.slides.length; i++) {
    const name = `${String(i + 1).padStart(3, "0")}-${ir.slides[i]!.type}.svg`
    await writeFile(join(outDir, name), renderSlideSvg(ir, i))
  }
  return `wrote ${ir.slides.length} SVG files to ${outDir}`
}
