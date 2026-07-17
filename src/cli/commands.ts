import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import {
  formatIssues,
  generatePptx,
  irJsonSchema,
  listThemes,
  renderSlideSvg,
  tokensJsonSchema,
  validateIr,
} from "../api"
import { PptfastError } from "../errors"
import { TokensOverrideSchema, type TokensOverride } from "../ir"
import { CONFIG_FILENAME, findConfig } from "./config"
import { loadIrFile, resolveLocalAssets } from "./load-ir"

async function loadTokensFile(path: string): Promise<TokensOverride> {
  const raw = await loadIrFile(path)
  const r = TokensOverrideSchema.safeParse(raw)
  if (!r.success) {
    const detail = r.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n")
    throw new PptfastError(`invalid tokens file ${path}:\n${detail}`)
  }
  return r.data
}

/**
 * Resolve deck defaults onto the raw (pre-validation) IR.
 * Precedence: CLI flag > pptfast.config.json (walked up from cwd) > IR.
 * `--theme` only swaps style.id — IR-authored tokens survive.
 */
export async function applyDeckConfig(
  raw: unknown,
  opts: { theme?: string; tokensPath?: string; cwd: string },
): Promise<void> {
  if (typeof raw !== "object" || raw === null) return // schema error surfaces in validateIr
  const deck = raw as Record<string, unknown>
  const irStyle =
    typeof deck.style === "object" && deck.style !== null
      ? (deck.style as Record<string, unknown>)
      : {}
  const hit = await findConfig(opts.cwd)
  const theme = opts.theme ?? hit?.config.theme ?? irStyle.id
  const tokens = opts.tokensPath
    ? await loadTokensFile(opts.tokensPath)
    : (hit?.config.tokens ?? irStyle.tokens)
  if (theme === undefined && tokens === undefined) return
  deck.style = { ...irStyle, id: theme, ...(tokens !== undefined ? { tokens } : {}) }
}

export interface RenderOptions {
  output: string
  theme?: string
  tokensPath?: string
  cwd?: string
}

export async function runRender(irPath: string, opts: RenderOptions): Promise<string> {
  const raw = await loadIrFile(irPath)
  await applyDeckConfig(raw, {
    theme: opts.theme,
    tokensPath: opts.tokensPath,
    cwd: opts.cwd ?? process.cwd(),
  })
  const v = validateIr(raw)
  if (!v.ok) throw new PptfastError(`invalid IR:\n${formatIssues(v.errors)}`)
  await resolveLocalAssets(v.ir!, dirname(resolve(irPath)))
  const bytes = await generatePptx(v.ir!)
  await mkdir(dirname(resolve(opts.output)), { recursive: true })
  await writeFile(opts.output, bytes)
  return `wrote ${opts.output} (${v.ir!.slides.length} slides, ${bytes.length} bytes)`
}

/** Returns human-readable report. Throws PptfastError when invalid (CLI exit 1). */
export async function runValidate(irPath: string, cwd = process.cwd()): Promise<string> {
  const raw = await loadIrFile(irPath)
  await applyDeckConfig(raw, { cwd })
  const v = validateIr(raw)
  if (!v.ok)
    throw new PptfastError(
      `invalid IR (${v.errors.length} issue${v.errors.length === 1 ? "" : "s"}):\n${formatIssues(v.errors)}`,
    )
  return `OK — ${v.ir!.slides.length} slides, style "${v.ir!.style.id}"`
}

export function runSchema(tokens = false): string {
  return JSON.stringify(tokens ? tokensJsonSchema() : irJsonSchema(), null, 2)
}

export function runThemes(asJson: boolean): string {
  const themes = listThemes()
  if (asJson) return JSON.stringify(themes, null, 2)
  return themes.map((t) => `${t.id.padEnd(12)} ${t.label}`).join("\n")
}

const CONFIG_TEMPLATE = {
  theme: "consulting",
  tokens: {
    colors: { primary: "#0B5FFF", accent: "#FF6A00" },
  },
} as const

/** Scaffold pptfast.config.json in cwd. Never overwrites. */
export async function runInit(cwd = process.cwd()): Promise<string> {
  const target = join(cwd, CONFIG_FILENAME)
  try {
    await writeFile(target, JSON.stringify(CONFIG_TEMPLATE, null, 2) + "\n", { flag: "wx" })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") {
      throw new PptfastError(`${target} already exists — edit it instead`)
    }
    throw e
  }
  return `wrote ${target} — themes: \`pptfast themes\`, tokens schema: \`pptfast schema --tokens\``
}

export async function runPreview(irPath: string, outDir: string, cwd = process.cwd()): Promise<string> {
  const raw = await loadIrFile(irPath)
  await applyDeckConfig(raw, { cwd })
  const v = validateIr(raw)
  if (!v.ok) throw new PptfastError(`invalid IR:\n${formatIssues(v.errors)}`)
  await resolveLocalAssets(v.ir!, dirname(resolve(irPath)))
  await mkdir(outDir, { recursive: true })
  const ir = v.ir!
  for (let i = 0; i < ir.slides.length; i++) {
    const name = `${String(i + 1).padStart(3, "0")}-${ir.slides[i]!.type}.svg`
    await writeFile(join(outDir, name), renderSlideSvg(ir, i))
  }
  return `wrote ${ir.slides.length} SVG files to ${outDir}`
}
