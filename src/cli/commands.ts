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
import { StyleOverrideSchema, type PptxIR, type StyleOverride } from "../ir"
import { disassembleDeck, type PageContent } from "../plan/assemble"
import { formatInvalidPlanError, planJsonSchema, resolvePlanThemeId, validatePlan } from "../plan"
import { AUDIENCE_VALUES, DELIVERY_BUDGETS, MODE_DEFINITIONS, SCENARIO_PRESETS, resolveScenario, type ScenarioAxes } from "../scenario"
import { CONFIG_FILENAME, findConfig, findUserConfig } from "./config"
import { isDeckDirectory, readDeckDir, resolveDeckTarget } from "./deck-dir"
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
 * Precedence (spec §7's four-layer chain, W5 task 5): CLI flag > project
 * `pptfast.config.json` (walked up from cwd) > user `~/.pptfast/config.json`
 * (`findUserConfig`, no cwd walk-up — a single fixed path, see `./config.ts`)
 * > whatever the artifact itself already carries (an authored IR's own
 * `theme`, or `PptxIRSchema`'s own "consulting" default when nothing
 * anywhere sets one — that bottom fallback is `irTheme.id`/`irTheme.style`
 * below, left `undefined` here for the schema to fill in). `--theme` only
 * swaps theme.id — IR-authored style survives.
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
  const projectHit = await findConfig(opts.cwd)
  const userHit = await findUserConfig()
  const theme = opts.theme ?? projectHit?.config.theme ?? userHit?.config.theme ?? irTheme.id
  const style = opts.stylePath
    ? await loadStyleFile(opts.stylePath)
    : (projectHit?.config.style ?? userHit?.config.style ?? irTheme.style)
  if (theme === undefined && style === undefined) return
  deck.theme = { ...irTheme, id: theme, ...(style !== undefined ? { style } : {}) }
}

/**
 * Shared "turn a CLI target argument into a raw IR-shaped object plus its
 * asset base directory" step for `runValidate`/`runRender`/`runPreview` (W5
 * task 5) — the one piece of logic those three commands would otherwise
 * triplicate. `arg` is resolved through `resolveDeckTarget` (path vs.
 * bare-name, spec §7) using the user config's `decksDir` when set, then
 * branches on whether the resolved target is a deck project directory:
 *
 * - directory → `readDeckDir` (assemble in memory — plan + pages/ + assets/,
 *   `./deck-dir.ts`), asset paths resolve against the deck directory itself.
 * - file → the pre-existing single-file path, byte-for-byte: `loadIrFile`
 *   then the same `dirname(resolve(...))` asset base every caller already
 *   used. When `arg` is an explicit path (has a separator, or exists
 *   locally — true of every pre-W5 caller, since every existing test passes
 *   a full path), `resolveDeckTarget` returns it completely unchanged with
 *   no `fs` call at all, so this branch degenerates to exactly the old
 *   inline code — single-file behavior stays byte-identical.
 *
 * `isDir` is threaded back so `runValidate` can gate its dir-only placeholder
 * note on it (single-file mode must never grow that note, even for a
 * hand-authored IR that happens to set `placeholder: true` itself).
 */
async function loadDeckTarget(
  arg: string,
  cwd: string,
): Promise<{ raw: unknown; baseDir: string; isDir: boolean }> {
  const userHit = await findUserConfig()
  const target = await resolveDeckTarget(arg, userHit?.config, cwd)
  if (await isDeckDirectory(target)) {
    const { ir, deckDir } = await readDeckDir(target)
    return { raw: ir, baseDir: deckDir, isDir: true }
  }
  const raw = await loadIrFile(target)
  return { raw, baseDir: dirname(resolve(target)), isDir: false }
}

export interface RenderOptions {
  output: string
  theme?: string
  stylePath?: string
  cwd?: string
  /** Skip the unfilled-placeholder-pages gate (W5 task 1) — see `generatePptx` in `../api`. */
  draft?: boolean
}

/**
 * `irPath` accepts a single IR/plan JSON file, a deck project directory, or
 * a bare deck name under `~/.pptfast/decks` (W5 task 5, `loadDeckTarget`
 * above) — directory/bare-name input is assembled in memory first, then
 * follows the exact same validate → resolve-assets → generate pipeline a
 * single file always has. `--draft` threads through unchanged either way
 * (`generatePptx`'s own gate, W5 task 1) — a deck project's own placeholder
 * pages are exactly what that gate exists to catch.
 */
export async function runRender(irPath: string, opts: RenderOptions): Promise<string> {
  const cwd = opts.cwd ?? process.cwd()
  const { raw, baseDir } = await loadDeckTarget(irPath, cwd)
  await applyDeckConfig(raw, { theme: opts.theme, stylePath: opts.stylePath, cwd })
  const v = validateIr(raw)
  if (!v.ok) throw new PptfastError(`invalid IR:\n${formatIssues(v.errors)}`)
  await resolveLocalAssets(v.ir!, baseDir)
  const bytes = await generatePptx(v.ir!, { draft: opts.draft })
  await mkdir(dirname(resolve(opts.output)), { recursive: true })
  await writeFile(opts.output, bytes)
  return `wrote ${opts.output} (${v.ir!.slides.length} slides, ${bytes.length} bytes)`
}

/**
 * Dir-mode-only informational note (W5 task 5, `runValidate` below): unlike
 * `generatePptx`'s draft gate (a hard error) or the content-quality gate
 * (which skips a placeholder's content rules entirely, `ir-quality.ts`), a
 * placeholder page is schema-valid and produces no validation issue on its
 * own — without this, a deck project with pages still unfilled would
 * validate silently "OK" with no signal anything is left to do. `undefined`
 * when there are none, so the caller can skip the note line entirely rather
 * than test its own string for emptiness.
 */
function placeholderNote(ir: PptxIR): string | undefined {
  const placeholders = ir.slides
    .map((slide, i) => ({ slide, page: i + 1 }))
    .filter(({ slide }) => slide.placeholder)
  if (placeholders.length === 0) return undefined
  const refs = placeholders
    .map(({ slide, page }) => (slide.id ? `${slide.id} (page ${page})` : `page ${page}`))
    .join(", ")
  return `note: ${placeholders.length} unfilled placeholder page${placeholders.length === 1 ? "" : "s"}: ${refs}`
}

/**
 * `irPath` accepts a single IR/plan JSON file, a deck project directory, or
 * a bare deck name (same `loadDeckTarget` resolution `runRender` uses).
 * Directory/bare-name input additionally gets a {@link placeholderNote} —
 * gated on `isDir` specifically so single-file mode (including a
 * hand-authored IR that sets `placeholder: true` itself) never grows one,
 * keeping that path's output byte-identical to before this task.
 *
 * Returns human-readable report. Throws PptfastError when invalid (CLI exit 1).
 * When `validateIr` deterministically rewrote any synonym field names before
 * parsing (W5 task 4 — kpi `title`→`label` and friends, `ir/field-aliases.ts`),
 * appends them as a "note" line after the OK summary: visible so the caller
 * knows their input got silently massaged, but never a reason to fail — a
 * fixed alias never makes it into `v.errors`.
 */
export async function runValidate(irPath: string, cwd = process.cwd()): Promise<string> {
  const { raw, isDir } = await loadDeckTarget(irPath, cwd)
  await applyDeckConfig(raw, { cwd })
  const v = validateIr(raw)
  if (!v.ok)
    throw new PptfastError(
      `invalid IR (${v.errors.length} issue${v.errors.length === 1 ? "" : "s"}):\n${formatIssues(v.errors)}`,
    )
  const ok = `OK — ${v.ir!.slides.length} slides, theme "${v.ir!.theme.id}"`
  const notes: string[] = []
  if (v.normalized && v.normalized.length > 0) {
    const n = v.normalized.length
    notes.push(
      `note: ${n} field alias${n === 1 ? "" : "es"} normalized\n${v.normalized.map((line) => `  ${line}`).join("\n")}`,
    )
  }
  if (isDir) {
    const note = placeholderNote(v.ir!)
    if (note) notes.push(note)
  }
  return notes.length > 0 ? `${ok}\n${notes.join("\n")}` : ok
}

/**
 * Validate a deck plan JSON file (W5 task 2: `pptfast plan validate`).
 * `loadIrFile` is a generic "read + JSON-parse with a readable failure
 * message" helper despite its IR-scoped name (`./load-ir.ts`) — reused as-is
 * rather than duplicated, same pattern `runValidate` above uses for IR.
 * Returns human-readable report. Throws PptfastError when invalid (CLI exit 1).
 */
export async function runPlanValidate(planPath: string): Promise<string> {
  const raw = await loadIrFile(planPath, "plan")
  const v = validatePlan(raw)
  if (!v.ok) {
    throw new PptfastError(formatInvalidPlanError(v.errors))
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

/**
 * `irPath` accepts a single IR/plan JSON file, a deck project directory, or
 * a bare deck name (same `loadDeckTarget` resolution `runRender` uses).
 * Preview never gates on placeholder pages either way (single-file or
 * dir-mode) — `renderSlideSvg` itself never calls the draft gate, spec §7:
 * "preview 永远放行", an agent iterating on a partially-filled deck needs to
 * see whatever page it just wrote without every other still-empty page
 * blocking it.
 */
export async function runPreview(irPath: string, outDir: string, cwd = process.cwd()): Promise<string> {
  const { raw, baseDir } = await loadDeckTarget(irPath, cwd)
  await applyDeckConfig(raw, { cwd })
  const v = validateIr(raw)
  if (!v.ok) throw new PptfastError(`invalid IR:\n${formatIssues(v.errors)}`)
  await resolveLocalAssets(v.ir!, baseDir)
  await mkdir(outDir, { recursive: true })
  const ir = v.ir!
  for (let i = 0; i < ir.slides.length; i++) {
    const name = `${String(i + 1).padStart(3, "0")}-${ir.slides[i]!.type}.svg`
    await writeFile(join(outDir, name), renderSlideSvg(ir, i))
  }
  return `wrote ${ir.slides.length} SVG files to ${outDir}`
}

export interface AssembleOptions {
  output?: string
  cwd?: string
}

/**
 * `pptfast assemble <dir|name>` (W5 task 5): resolve `target` (path or bare
 * deck name, `resolveDeckTarget`) → `readDeckDir` (plan + pages/ + assets/ →
 * IR, `./deck-dir.ts`) → write the assembled IR as pretty-printed JSON,
 * default `<deckDir>/deck.json` when `-o` is omitted. Deliberately does
 * *not* call `applyDeckConfig` — `assemble` materializes exactly what the
 * plan says (a portable IR file), theme/style overrides are `validate`/
 * `render`/`preview`'s job (each already applies the four-layer chain
 * whether given this same directory or the `deck.json` this command just
 * wrote).
 *
 * When the plan omitted `seed`, `readDeckDir` (via `assembleDeck`) generates
 * one deterministically and reports it as `generatedSeed` — surfaced here as
 * a suggestion to add it back to `deck.plan.json` for revision stability
 * (spec §5's seed-generation semantics). Never written automatically:
 * `assembleDeck` stays a pure function with no fs side effects, and silently
 * rewriting a file the user did not ask this command to touch would be a
 * worse surprise than asking them to paste one line in.
 */
export async function runAssemble(target: string, opts: AssembleOptions = {}): Promise<string> {
  const cwd = opts.cwd ?? process.cwd()
  const userHit = await findUserConfig()
  const dir = await resolveDeckTarget(target, userHit?.config, cwd)
  const { ir, generatedSeed, deckDir } = await readDeckDir(dir)
  const outPath = opts.output ?? join(deckDir, "deck.json")
  await mkdir(dirname(resolve(outPath)), { recursive: true })
  await writeFile(outPath, JSON.stringify(ir, null, 2) + "\n")
  const placeholderCount = ir.slides.filter((s) => s.placeholder).length
  const summary = `wrote ${outPath} (${ir.slides.length} slides, ${placeholderCount} placeholder${placeholderCount === 1 ? "" : "s"})`
  if (generatedSeed === undefined) return summary
  return `${summary}\nnote: generated seed ${generatedSeed} — add "seed": ${generatedSeed} to deck.plan.json for revision stability`
}

/**
 * `pptfast disassemble <deck.json> -o <dir>` (W5 task 5): the CLI shell for
 * `disassembleDeck` (`../plan/assemble.ts`) — read + validate an IR file the
 * same way `runRender`/`runValidate` do, then write `deck.plan.json` +
 * `pages/<id>.json` for every non-placeholder page (pretty-printed; key
 * order is already stable because `disassembleDeck` builds every object
 * with the same fixed field order on every call, not by iterating the
 * input, so there is no separate "stable stringify" step to write). Refuses
 * to overwrite an existing `deck.plan.json` — same `wx`-flag EEXIST guard as
 * `runInit`'s config scaffold — so re-running this command never silently
 * clobbers a deck project someone has since started filling in; page files
 * are freely (re)written since they only exist because this same command
 * produced them.
 */
export async function runDisassemble(irPath: string, outDir: string): Promise<string> {
  const raw = await loadIrFile(irPath)
  const v = validateIr(raw)
  if (!v.ok) throw new PptfastError(`invalid IR:\n${formatIssues(v.errors)}`)
  const { plan, pages } = disassembleDeck(v.ir!)

  const planPath = join(outDir, "deck.plan.json")
  await mkdir(outDir, { recursive: true })
  try {
    await writeFile(planPath, JSON.stringify(plan, null, 2) + "\n", { flag: "wx" })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") {
      throw new PptfastError(`${planPath} already exists — refusing to overwrite an existing deck project`)
    }
    throw e
  }

  const ids = Object.keys(pages)
  const pagesDir = join(outDir, "pages")
  if (ids.length > 0) {
    await mkdir(pagesDir, { recursive: true })
    for (const id of ids) {
      const content: PageContent = pages[id]!
      await writeFile(join(pagesDir, `${id}.json`), JSON.stringify(content, null, 2) + "\n")
    }
  }
  return `wrote ${planPath} and ${ids.length} page file${ids.length === 1 ? "" : "s"} to ${pagesDir}`
}
