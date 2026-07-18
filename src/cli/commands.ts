import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import {
  formatIssues,
  generatePptx,
  irJsonSchema,
  listThemes,
  renderSlideSvg,
  styleJsonSchema,
  validateIr,
} from "../api"
import { PptfastError } from "../errors"
import { StyleOverrideSchema, type StyleOverride } from "../ir"
import { formatPlanIssues, planJsonSchema, resolvePlanThemeId, validatePlan } from "../plan"
import { AUDIENCE_VALUES, DELIVERY_BUDGETS, MODE_DEFINITIONS, SCENARIO_PRESETS, resolveScenario, type ScenarioAxes } from "../scenario"
import { CONFIG_FILENAME, findConfig } from "./config"
import { loadIrFile, resolveLocalAssets } from "./load-ir"

async function loadStyleFile(path: string): Promise<StyleOverride> {
  const raw = await loadIrFile(path)
  const r = StyleOverrideSchema.safeParse(raw)
  if (!r.success) {
    const detail = r.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n")
    throw new PptfastError(`invalid style file ${path}:\n${detail}`)
  }
  return r.data
}

/**
 * Resolve deck defaults onto the raw (pre-validation) IR.
 * Precedence: CLI flag > pptfast.config.json (walked up from cwd) > IR.
 * `--theme` only swaps theme.id — IR-authored style survives.
 */
export async function applyDeckConfig(
  raw: unknown,
  opts: { theme?: string; stylePath?: string; cwd: string },
): Promise<void> {
  if (typeof raw !== "object" || raw === null) return // schema error surfaces in validateIr
  const deck = raw as Record<string, unknown>
  const irTheme =
    typeof deck.theme === "object" && deck.theme !== null
      ? (deck.theme as Record<string, unknown>)
      : {}
  const hit = await findConfig(opts.cwd)
  const theme = opts.theme ?? hit?.config.theme ?? irTheme.id
  const style = opts.stylePath
    ? await loadStyleFile(opts.stylePath)
    : (hit?.config.style ?? irTheme.style)
  if (theme === undefined && style === undefined) return
  deck.theme = { ...irTheme, id: theme, ...(style !== undefined ? { style } : {}) }
}

export interface RenderOptions {
  output: string
  theme?: string
  stylePath?: string
  cwd?: string
  /** Skip the unfilled-placeholder-pages gate (W5 task 1) — see `generatePptx` in `../api`. */
  draft?: boolean
}

export async function runRender(irPath: string, opts: RenderOptions): Promise<string> {
  const raw = await loadIrFile(irPath)
  await applyDeckConfig(raw, {
    theme: opts.theme,
    stylePath: opts.stylePath,
    cwd: opts.cwd ?? process.cwd(),
  })
  const v = validateIr(raw)
  if (!v.ok) throw new PptfastError(`invalid IR:\n${formatIssues(v.errors)}`)
  await resolveLocalAssets(v.ir!, dirname(resolve(irPath)))
  const bytes = await generatePptx(v.ir!, { draft: opts.draft })
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
  return `OK — ${v.ir!.slides.length} slides, theme "${v.ir!.theme.id}"`
}

/**
 * Validate a deck plan JSON file (W5 task 2: `pptfast plan validate`).
 * `loadIrFile` is a generic "read + JSON-parse with a readable failure
 * message" helper despite its IR-scoped name (`./load-ir.ts`) — reused as-is
 * rather than duplicated, same pattern `runValidate` above uses for IR.
 * Returns human-readable report. Throws PptfastError when invalid (CLI exit 1).
 */
export async function runPlanValidate(planPath: string): Promise<string> {
  const raw = await loadIrFile(planPath)
  const v = validatePlan(raw)
  if (!v.ok) {
    throw new PptfastError(
      `invalid plan (${v.errors.length} issue${v.errors.length === 1 ? "" : "s"}):\n${formatPlanIssues(v.errors)}`,
    )
  }
  const plan = v.plan!
  // Safe to call unguarded: validatePlan already resolved this same
  // expression successfully as part of its own hard-gate chain.
  const axes = resolveScenario(plan.scenario as string | Partial<ScenarioAxes> | undefined)
  return `OK — ${plan.pages.length} pages, scenario ${axes.mode}/${axes.delivery}/${axes.audience}, theme "${resolvePlanThemeId(plan)}"`
}

export function runSchema(mode?: "style" | "plan"): string {
  const schema = mode === "style" ? styleJsonSchema() : mode === "plan" ? planJsonSchema() : irJsonSchema()
  return JSON.stringify(schema, null, 2)
}

export function runThemes(asJson: boolean): string {
  const themes = listThemes()
  if (asJson) return JSON.stringify(themes, null, 2)
  return themes.map((t) => `${t.id.padEnd(12)} ${t.label}`).join("\n")
}

/**
 * List the named scenario presets (spec §5): mode/delivery/audience axes +
 * soft theme recommendations — never a hard constraint, see
 * `ScenarioPreset.themeRecommendations`'s own doc comment in `scenario/index.ts`.
 * `--json` hands back the full machine-readable payload an agent would want
 * before picking a scenario: every preset, plus the raw mode/delivery/audience
 * tables those presets are built from (`MODE_DEFINITIONS`/`DELIVERY_BUDGETS`
 * carry data this wave doesn't yet consume for selection — W4's job — but are
 * still useful for a caller inspecting what each axis value means).
 */
export function runScenarios(asJson: boolean): string {
  if (asJson) {
    return JSON.stringify(
      {
        presets: SCENARIO_PRESETS,
        modes: MODE_DEFINITIONS,
        deliveries: DELIVERY_BUDGETS,
        audiences: AUDIENCE_VALUES,
      },
      null,
      2,
    )
  }
  const rows = Object.values(SCENARIO_PRESETS).map((p) => ({
    id: p.id,
    axes: `${p.axes.mode}/${p.axes.delivery}/${p.axes.audience}`,
    themes: p.themeRecommendations.join(", "),
  }))
  const idWidth = Math.max(...rows.map((r) => r.id.length))
  const axesWidth = Math.max(...rows.map((r) => r.axes.length))
  return rows
    .map((r) => `${r.id.padEnd(idWidth + 2)}${r.axes.padEnd(axesWidth + 2)}${r.themes}`)
    .join("\n")
}

const CONFIG_TEMPLATE = {
  theme: "consulting",
  style: {
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
  return `wrote ${target} — themes: \`pptfast themes\`, style schema: \`pptfast schema --style\``
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
