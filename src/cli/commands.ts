import { mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
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
import { AUDIENCE_VALUES, PACING_BUDGETS, STRATEGY_DEFINITIONS, NARRATIVE_PRESETS, resolveNarrative, type NarrativeProfile } from "../scenario"
import { auditDeck, type AuditFinding, type AuditReport } from "../svg/audit/deck-audit"
import { getInstalledThemeIds } from "../themes/definitions"
import { CONFIG_FILENAME, findConfig, findUserConfig } from "./config"
import { assertSafeFileSegment, isDeckDirectory, pathExists, readDeckDir, resolveDeckTarget, writeDeckAssets } from "./deck-dir"
import { loadIrFile, resolveLocalAssets } from "./load-ir"
import { buildPreviewHtml } from "./preview-html"

/** `findUserConfig()`'s own return shape, named here so it can be threaded as
 *  a parameter (`loadDeckTarget`/`applyDeckConfig` below) instead of each
 *  callee re-fetching it — see `applyDeckConfig`'s own doc comment for why. */
type UserConfigHit = Awaited<ReturnType<typeof findUserConfig>>

/** `findConfig()`'s own return shape — the project-layer counterpart to
 *  {@link UserConfigHit}, threaded the same way and for the same reason
 *  (W5 task 6: `loadDeckTarget` now needs the project layer too, for
 *  `decksDir` — see {@link resolveDecksDirSource}). */
type ProjectConfigHit = Awaited<ReturnType<typeof findConfig>>

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

/** Names which of the four precedence layers the (invalid) resolved `theme`
 *  value came from, for {@link applyDeckConfig}'s unknown-theme error — a
 *  config-file layer names its own path, `--theme` names itself, and the
 *  IR's own default has no path to name at all. */
function describeThemeSource(
  opts: { theme?: string },
  projectHit: { path: string; config: { theme?: string } } | null,
  userHit: UserConfigHit,
): string {
  if (opts.theme !== undefined) return "--theme"
  if (projectHit?.config.theme !== undefined) return projectHit.path
  if (userHit?.config.theme !== undefined) return userHit.path
  return "the deck's own theme"
}

/**
 * The `config` argument `resolveDeckTarget` (`./deck-dir.ts`) and its
 * `decksRoot` (`./home.ts`) expect: an object exposing `decksDir`, resolved
 * against whichever base that value's own layer implies. Project
 * `pptfast.config.json`'s own `decksDir` (spec §7's project-level escape
 * hatch, `ConfigSchema` in `./config.ts`, W5 task 6) wins over the user
 * config's (`UserConfigSchema`) when both are set — same project-beats-user
 * precedence as `theme`/`style` (see `applyDeckConfig` below) — but the two
 * layers resolve against different bases (project against the config file's
 * own directory, user against `pptfastHome()`, `decksRoot`'s one fixed
 * base), so a winning project value is resolved to an absolute path *here*,
 * before being handed down: `decksRoot`'s own
 * `resolve(pptfastHome(), config?.decksDir ?? "decks")` then returns that
 * absolute path unchanged (`path.resolve`'s own semantics for an absolute
 * later segment) — the same "already-absolute short-circuits the base"
 * behavior `decksRoot({ decksDir: "/elsewhere/decks" })` already exercises
 * for the user layer, reused rather than reimplemented. Falls through to
 * `userHit?.config` untouched when the project layer has no `decksDir` of
 * its own — including when there is no project config at all — so the user
 * layer (or, absent that too, `decksRoot`'s own built-in default) keeps
 * working exactly as before this function existed.
 */
function resolveDecksDirSource(
  projectHit: ProjectConfigHit,
  userHit: UserConfigHit,
): { decksDir?: string } | undefined {
  if (projectHit?.config.decksDir !== undefined) {
    return { decksDir: resolve(dirname(projectHit.path), projectHit.config.decksDir) }
  }
  return userHit?.config
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
 *
 * `opts.projectHit`/`opts.userHit` are the caller's own already-fetched
 * `findConfig(cwd)`/`findUserConfig()` results (`undefined` when the caller
 * has not fetched one — this function fetches whichever is missing itself,
 * so it stays usable standalone). Every real caller (`runRender`/
 * `runValidate`/`runPreview` below) fetches both exactly once — `loadDeckTarget`
 * needs the project layer too now, for `decksDir` (W5 task 6,
 * {@link resolveDecksDirSource}) — and passes them to both this function and
 * `loadDeckTarget`, so a command reads either config file at most once per
 * invocation instead of once per helper that happens to need it.
 *
 * The installed-theme check used to run at config *read* time
 * (`readConfigFile`, `./config.ts`) — eagerly, against every layer's value,
 * whether or not it would ever actually apply. It now runs here instead,
 * once, against `theme` (the value that actually wins the four-layer
 * chain): a stale/unknown theme sitting in a config layer that a `--theme`
 * flag (or a higher-precedence config layer) overrides anyway must not
 * hard-fail a command over a value nothing was ever going to use.
 */
export async function applyDeckConfig(
  raw: unknown,
  opts: { theme?: string; stylePath?: string; cwd: string; projectHit?: ProjectConfigHit; userHit?: UserConfigHit },
): Promise<void> {
  if (typeof raw !== "object" || raw === null) return // schema error surfaces in validateIr
  const deck = raw as Record<string, unknown>
  const irTheme =
    typeof deck.theme === "object" && deck.theme !== null
      ? (deck.theme as Record<string, unknown>)
      : {}
  const [projectHit, userHit] = await Promise.all([
    opts.projectHit !== undefined ? Promise.resolve(opts.projectHit) : findConfig(opts.cwd),
    opts.userHit !== undefined ? Promise.resolve(opts.userHit) : findUserConfig(),
  ])
  const theme = opts.theme ?? projectHit?.config.theme ?? userHit?.config.theme ?? (irTheme.id as string | undefined)
  const style = opts.stylePath
    ? await loadStyleFile(opts.stylePath)
    : (projectHit?.config.style ?? userHit?.config.style ?? irTheme.style)
  if (theme !== undefined) {
    const installedThemeIds = getInstalledThemeIds()
    if (!installedThemeIds.includes(theme)) {
      throw new PptfastError(
        `unknown theme "${theme}" (from ${describeThemeSource(opts, projectHit, userHit)}) — available: ${installedThemeIds.join(", ")} (see \`pptfast themes\`)`,
      )
    }
  }
  if (theme === undefined && style === undefined) return
  deck.theme = { ...irTheme, id: theme, ...(style !== undefined ? { style } : {}) }
}

/**
 * Shared "turn a CLI target argument into a raw IR-shaped object plus its
 * asset base directory" step for `runValidate`/`runRender`/`runPreview` (W5
 * task 5) — the one piece of logic those three commands would otherwise
 * triplicate. `arg` is resolved through `resolveDeckTarget` (path vs.
 * bare-name, spec §7) using the effective `decksDir` source — project config
 * when it sets one, else the user config's, else `resolveDeckTarget`'s own
 * built-in default (W5 task 6, {@link resolveDecksDirSource}) — then
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
 *
 * `projectHit`/`userHit` are the caller's own already-fetched
 * `findConfig(cwd)`/`findUserConfig()` results (see `applyDeckConfig`'s doc
 * comment above for why both are threaded rather than fetched here too).
 */
async function loadDeckTarget(
  arg: string,
  cwd: string,
  projectHit: ProjectConfigHit,
  userHit: UserConfigHit,
): Promise<{ raw: unknown; baseDir: string; isDir: boolean }> {
  const target = await resolveDeckTarget(arg, resolveDecksDirSource(projectHit, userHit), cwd)
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
 *
 * Appends the same field-alias {@link normalizedNote} `runValidate` below
 * prints (W5 whole-branch review finding 3 — the README already claimed
 * `render` did this; it never actually threaded `v.normalized` through
 * until now).
 */
export async function runRender(irPath: string, opts: RenderOptions): Promise<string> {
  const cwd = opts.cwd ?? process.cwd()
  const [projectHit, userHit] = await Promise.all([findConfig(cwd), findUserConfig()])
  const { raw, baseDir } = await loadDeckTarget(irPath, cwd, projectHit, userHit)
  await applyDeckConfig(raw, { theme: opts.theme, stylePath: opts.stylePath, cwd, projectHit, userHit })
  const v = validateIr(raw)
  if (!v.ok) throw new PptfastError(`invalid IR:\n${formatIssues(v.errors)}`)
  await resolveLocalAssets(v.ir!, baseDir)
  const bytes = await generatePptx(v.ir!, { draft: opts.draft })
  await mkdir(dirname(resolve(opts.output)), { recursive: true })
  await writeFile(opts.output, bytes)
  const ok = `wrote ${opts.output} (${v.ir!.slides.length} slides, ${bytes.length} bytes)`
  const note = normalizedNote(v.normalized)
  return note ? `${ok}\n${note}` : ok
}

/**
 * `"note: N field alias(es) normalized\n  path: alias → canonical\n..."` —
 * the note line every one of `validateIr`'s callers appends after its own
 * success line when `ValidateResult.normalized` (`../api.ts`) is non-empty,
 * i.e. `validateIr` deterministically rewrote at least one synonym field
 * name before parsing (W5 task 4 — kpi `title`→`label` and friends,
 * `../ir/field-aliases.ts`). Extracted so `runRender`/`runPreview` (W5
 * whole-branch review finding 3 — the README already claimed `validate`
 * *and* `render` both printed this note — `render` never actually did, and
 * `preview` is folded in here too for the same reason) can append the exact
 * same note `runValidate` below has always printed, instead of each
 * re-deriving the formatting a second and third time. `undefined` when
 * nothing was normalized, the same "let the caller skip the line entirely"
 * shape {@link placeholderNote} below already uses.
 */
function normalizedNote(normalized: string[] | undefined): string | undefined {
  if (!normalized || normalized.length === 0) return undefined
  const n = normalized.length
  return `note: ${n} field alias${n === 1 ? "" : "es"} normalized\n${normalized.map((line) => `  ${line}`).join("\n")}`
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
  const [projectHit, userHit] = await Promise.all([findConfig(cwd), findUserConfig()])
  const { raw, isDir } = await loadDeckTarget(irPath, cwd, projectHit, userHit)
  await applyDeckConfig(raw, { cwd, projectHit, userHit })
  const v = validateIr(raw)
  if (!v.ok)
    throw new PptfastError(
      `invalid IR (${v.errors.length} issue${v.errors.length === 1 ? "" : "s"}):\n${formatIssues(v.errors)}`,
    )
  const ok = `OK — ${v.ir!.slides.length} slides, theme "${v.ir!.theme.id}"`
  const notes: string[] = []
  const aliasNote = normalizedNote(v.normalized)
  if (aliasNote) notes.push(aliasNote)
  if (isDir) {
    const note = placeholderNote(v.ir!)
    if (note) notes.push(note)
  }
  return notes.length > 0 ? `${ok}\n${notes.join("\n")}` : ok
}

/**
 * `"page 3 (p-kpi): [low-contrast] ..."` — one line per {@link AuditFinding},
 * echoing `formatIssues`' own `"page N (id) — path: message"` convention
 * (`../api.ts`) with a bracketed `[code]` standing in for `path` — an
 * `AuditFinding` has no `path` (it is not a schema-location error, see that
 * interface's own doc comment in `../svg/audit/deck-audit.ts`), and `code`
 * is the closest equivalent "what kind of problem" tag. The bracket keeps an
 * audit-finding line visually distinct from a validate-error line at a
 * glance, per the plan's own worked example.
 */
function formatAuditFinding(f: AuditFinding): string {
  const idSuffix = f.slideId !== undefined ? ` (${f.slideId})` : ""
  return `page ${f.page}${idSuffix}: [${f.code}] ${f.message}`
}

/**
 * Human-readable `pptfast audit` report (W6 task 2, spec §7 workflow ④):
 * every finding as its own {@link formatAuditFinding} line — already
 * naturally grouped by page, since `auditDeck` pushes findings in slide
 * order (`../svg/audit/deck-audit.ts`) — followed by a trailing summary line
 * in the plan's own literal wording ("audited N pages, M skipped, K
 * findings") so an agent can read just the last line to decide whether to
 * keep iterating, instead of counting findings itself. {@link placeholderNote}
 * runs unconditionally (unlike `runValidate`'s dir-mode-only gating on that
 * same helper below) — audit has no pre-existing single-file-mode output to
 * keep byte-identical the way `runValidate` did when that gating was added,
 * so there is no reason to withhold a genuinely useful note from a
 * hand-authored IR that happens to carry placeholders too.
 */
function formatAuditReport(report: AuditReport, ir: PptxIR): string {
  const lines = report.findings.map(formatAuditFinding)
  lines.push(
    `audited ${report.pagesAudited} page${report.pagesAudited === 1 ? "" : "s"}, ${report.pagesSkipped} skipped, ${report.findings.length} finding${report.findings.length === 1 ? "" : "s"}`,
  )
  const note = placeholderNote(ir)
  if (note) lines.push(note)
  return lines.join("\n")
}

export interface AuditOptions {
  json?: boolean
  cwd?: string
}

export interface AuditCliResult {
  /** Human report ({@link formatAuditReport}) or, with `opts.json`, the raw
   *  `JSON.stringify`'d {@link AuditReport} verbatim — the plan's own "the
   *  full AuditReport" requirement, unmodified by any CLI-side enrichment. */
  output: string
  /** `true` when `report.findings.length > 0`. The CLI (`../cli.ts`) prints
   *  `output` either way, then exits 1 on this signal alone — clean exits 0
   *  (spec §7 workflow ④: advisory, not a hard gate, but still
   *  agent-judgeable purely from the exit code without parsing output). */
  hasFindings: boolean
}

/**
 * `pptfast audit <target> [--json]` (W6 task 2, spec §7 workflow ④): resolve
 * `target` through the exact same `loadDeckTarget` path `runValidate`/
 * `runRender`/`runPreview` already use (IR file / deck project directory /
 * bare name under `~/.pptfast/decks`), validate first, then hand the
 * validated IR to `auditDeck` (`../svg/audit/deck-audit.ts`, pure, no I/O).
 *
 * An invalid deck fails exactly like `pptfast validate` — same message
 * shape, same `PptfastError` → CLI exit-1 path — and never reaches
 * `auditDeck` at all: the geometry/contrast/overlap checks only mean
 * anything over a schema-valid, already-quality-gated deck (`auditDeck`'s
 * own "advisory, not a hard gate" doc comment — `validateIr` is the hard
 * gate this command leans on rather than re-implements).
 *
 * `resolveLocalAssets` runs after validation, same as `runRender`/
 * `runPreview` — a deck referencing local (non-`data:`/non-`http(s)`) image
 * files must have them inlined before `auditDeck`'s internal `renderSlideSvg`
 * calls, otherwise a local asset's `src` would still be its raw relative
 * path when the contrast checker's background-region walk inspects it,
 * auditing a slide shape that doesn't match what `render`/`preview` actually
 * produce for the same deck.
 *
 * No `--theme`/`--style` flags (unlike `runRender`) — the plan's CLI surface
 * for this command is deliberately just `<target> [--json]` — but
 * `applyDeckConfig` still runs (with no CLI-flag overrides) so a project/user
 * config's own theme/style default still applies, the same "config layers
 * apply even with no flag passed" behavior `runValidate` already has.
 */
export async function runAudit(target: string, opts: AuditOptions = {}): Promise<AuditCliResult> {
  const cwd = opts.cwd ?? process.cwd()
  const [projectHit, userHit] = await Promise.all([findConfig(cwd), findUserConfig()])
  const { raw, baseDir } = await loadDeckTarget(target, cwd, projectHit, userHit)
  await applyDeckConfig(raw, { cwd, projectHit, userHit })
  const v = validateIr(raw)
  if (!v.ok) {
    throw new PptfastError(
      `invalid IR (${v.errors.length} issue${v.errors.length === 1 ? "" : "s"}):\n${formatIssues(v.errors)}`,
    )
  }
  await resolveLocalAssets(v.ir!, baseDir)
  const report = auditDeck(v.ir!)
  const hasFindings = report.findings.length > 0
  const output = opts.json ? JSON.stringify(report, null, 2) : formatAuditReport(report, v.ir!)
  return { output, hasFindings }
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
  const axes = resolveNarrative(plan.scenario as string | Partial<NarrativeProfile> | undefined)
  return `OK — ${plan.pages.length} pages, scenario ${axes.strategy}/${axes.pacing}/${axes.audience}, theme "${resolvePlanThemeId(plan)}"`
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
 * List the named scenario presets (spec §5): strategy/pacing/audience axes +
 * soft theme recommendations — never a hard constraint, see
 * `NarrativePreset.themeRecommendations`'s own doc comment in `scenario/index.ts`.
 * `--json` hands back the full machine-readable payload an agent would want
 * before picking a scenario: every preset, plus the raw strategy/pacing/audience
 * tables those presets are built from (`STRATEGY_DEFINITIONS`/`PACING_BUDGETS`
 * carry data this wave doesn't yet consume for selection — W4's job — but are
 * still useful for a caller inspecting what each axis value means).
 *
 * CLI surface (command name `scenarios`, output field names `modes`/
 * `deliveries`) is unchanged this task — spec §8.2's `scenarios`→`narratives`
 * rename is task 2's job. Only the underlying data this command reads
 * switched to the new vocabulary (spec §8.1).
 */
export function runScenarios(asJson: boolean): string {
  if (asJson) {
    return JSON.stringify(
      {
        presets: NARRATIVE_PRESETS,
        modes: STRATEGY_DEFINITIONS,
        deliveries: PACING_BUDGETS,
        audiences: AUDIENCE_VALUES,
      },
      null,
      2,
    )
  }
  const rows = Object.values(NARRATIVE_PRESETS).map((p) => ({
    id: p.id,
    axes: `${p.axes.strategy}/${p.axes.pacing}/${p.axes.audience}`,
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

export interface PreviewOptions {
  cwd?: string
  /** `--html` (v0.3 W7 task 1, spec §7 workflow ⑤): also write a
   *  self-contained `preview.html` alongside the per-slide SVG files —
   *  every slide's already-rendered SVG inlined into one file (thumbnail
   *  filmstrip + keyboard/click navigation, `buildPreviewHtml`,
   *  `./preview-html.ts`) for a human (or an agent that can view HTML) to
   *  flip through the whole deck at once instead of opening N separate SVG
   *  files. Named `htmlOut` rather than `html` so `RenderOptions.draft`-style
   *  option objects in this file all read as "what to produce", not
   *  "whether this is HTML" (there is nothing else this bundle could be).
   *  Known limitation (see `buildPreviewHtml`'s own doc comment,
   *  `./preview-html.ts`): self-containment assumes every image asset is
   *  local or already a `data:` URI — a remote `http(s):` asset src passes
   *  through `resolveLocalAssets` untouched and lands in the bundle as a
   *  live network reference, not an inlined file.
   *
   *  Also gates the audit overlay (notes+preview wave, task 2): when set
   *  and the deck has no placeholder page, `runPreview` runs `auditDeck`
   *  (`../svg/audit/deck-audit.ts`) and embeds its findings into
   *  `preview.html` (per-page badges + a findings panel, `buildPreviewHtml`).
   *  A deck with any placeholder page skips the audit entirely instead of
   *  running it partially — see `runPreview`'s own doc comment for why. */
  htmlOut?: boolean
}

/**
 * `irPath` accepts a single IR/plan JSON file, a deck project directory, or
 * a bare deck name (same `loadDeckTarget` resolution `runRender` uses).
 * Preview never gates on placeholder pages either way (single-file or
 * dir-mode) — `renderSlideSvg` itself never calls the draft gate, spec §7:
 * preview always lets everything through — an agent iterating on a
 * partially-filled deck needs to see whatever page it just wrote without
 * every other still-empty page blocking it.
 *
 * Appends the same field-alias {@link normalizedNote} `runValidate`/
 * `runRender` print (W5 whole-branch review finding 3).
 *
 * `opts.htmlOut` reuses each slide's already-rendered SVG string
 * ({@link buildPreviewHtml}'s `slides[].svg`) rather than calling
 * `renderSlideSvg` a second time — the `.svg` file on disk and the copy
 * embedded in `preview.html` are then guaranteed byte-identical by
 * construction, not just by the renderer being deterministic.
 *
 * `opts.htmlOut` additionally runs `auditDeck` (notes+preview wave, task 2)
 * — but only when the deck has no placeholder page. `auditDeck` itself
 * silently skips a placeholder (`AuditReport.pagesSkipped`, nothing to audit
 * on an unfilled page) — running it over a deck that has some would produce
 * a *partial* report that still looks complete (zero findings reads as
 * "clean", not "some pages were never checked"), which is worse than not
 * running it at all. The plan's contract is the simpler "any placeholder
 * present → skip the whole overlay, one-line notice instead" — implemented
 * here as `hasPlaceholder`, and threaded into `buildPreviewHtml` as either
 * `findings` (clean run) or `auditNote` (skipped), never both.
 */
export async function runPreview(irPath: string, outDir: string, opts: PreviewOptions = {}): Promise<string> {
  const cwd = opts.cwd ?? process.cwd()
  const [projectHit, userHit] = await Promise.all([findConfig(cwd), findUserConfig()])
  const { raw, baseDir } = await loadDeckTarget(irPath, cwd, projectHit, userHit)
  await applyDeckConfig(raw, { cwd, projectHit, userHit })
  const v = validateIr(raw)
  if (!v.ok) throw new PptfastError(`invalid IR:\n${formatIssues(v.errors)}`)
  await resolveLocalAssets(v.ir!, baseDir)
  await mkdir(outDir, { recursive: true })
  const ir = v.ir!
  const svgs: string[] = []
  for (let i = 0; i < ir.slides.length; i++) {
    const svg = renderSlideSvg(ir, i)
    svgs.push(svg)
    const name = `${String(i + 1).padStart(3, "0")}-${ir.slides[i]!.type}.svg`
    await writeFile(join(outDir, name), svg)
  }
  const ok = `wrote ${ir.slides.length} SVG files to ${outDir}`
  const notes: string[] = []
  const aliasNote = normalizedNote(v.normalized)
  if (aliasNote) notes.push(aliasNote)
  if (opts.htmlOut) {
    const htmlPath = join(outDir, "preview.html")
    const hasPlaceholder = ir.slides.some((slide) => slide.placeholder)
    const auditFindings = hasPlaceholder ? [] : auditDeck(ir).findings
    const html = buildPreviewHtml({
      title: ir.filename,
      slides: ir.slides.map((slide, i) => ({
        index: i,
        id: slide.id,
        type: slide.type,
        svg: svgs[i]!,
        placeholder: slide.placeholder,
      })),
      findings: auditFindings.map((f) => ({ page: f.page, slideId: f.slideId, code: f.code, message: f.message })),
      auditNote: hasPlaceholder
        ? "audit overlay skipped — deck has unfilled placeholder pages; fill every page and re-run `pptfast preview --html` to see audit findings"
        : undefined,
    })
    await writeFile(htmlPath, html)
    notes.push(`note: wrote self-contained preview to ${htmlPath}`)
    if (auditFindings.length > 0) {
      notes.push(`note: audit found ${auditFindings.length} finding${auditFindings.length === 1 ? "" : "s"} — see preview.html`)
    }
  }
  return notes.length > 0 ? `${ok}\n${notes.join("\n")}` : ok
}

export interface AssembleOptions {
  output?: string
  cwd?: string
}

/**
 * Rewrites every local (non-`data:`/non-`http(s)`) asset src so it keeps
 * resolving correctly when the assembled IR is written to `outDir`, a
 * different directory than the `deckDir` it was assembled from (`-o`
 * pointing outside the deck project, `runAssemble` below). `readDeckDir`'s
 * asset scan always produces a `deckDir`-relative src (`./deck-dir.ts`'s
 * `scanAssets` — always `assets/<file>`), so writing the IR anywhere else
 * unchanged would leave that src resolving against the *wrong* base the
 * next time this file is loaded (`loadDeckTarget`'s single-file branch
 * resolves relative asset srcs against the IR file's own directory, not
 * where it happened to be assembled from). Rebuilds `assets.images` rather
 * than mutating entries in place — the same "never mutate a live IR's asset
 * map" caution `readDeckDir` itself documents (`./deck-dir.ts`).
 */
function withRewrittenAssetPaths(ir: PptxIR, deckDir: string, outDir: string): PptxIR {
  const images = Object.fromEntries(
    Object.entries(ir.assets.images).map(([id, asset]) => {
      if (asset.src.startsWith("data:") || /^https?:\/\//.test(asset.src)) return [id, asset] as const
      return [id, { ...asset, src: relative(outDir, join(deckDir, asset.src)) }] as const
    }),
  )
  return { ...ir, assets: { images } }
}

/**
 * `pptfast assemble <dir|name>` (W5 task 5): resolve `target` (path or bare
 * deck name, `resolveDeckTarget`) → `readDeckDir` (plan + pages/ + assets/ →
 * IR, `./deck-dir.ts`) → write the assembled IR as pretty-printed JSON,
 * default `<deckDir>/deck.json` when `-o` is omitted. Deliberately does
 * *not* call `applyDeckConfig` — `assemble` materializes exactly what the
 * plan says plus each page's own auto-selected `layout` where the page file
 * left it implicit (`assembleDeck`'s own doc comment, W4 design decision
 * 10) — a portable IR file, self-contained down to which archetype each page
 * will render with. Theme/style overrides are `validate`/`render`/
 * `preview`'s job (each already applies the four-layer chain whether given
 * this same directory or the `deck.json` this command just wrote).
 *
 * `target` must resolve to an actual directory: a target that exists but
 * names a file gets a friendly `expected a deck project directory` error
 * right here rather than reaching `readDeckDir` and failing deeper, with a
 * confusing `ENOTDIR` message, trying to read `<file>/deck.plan.json`. A
 * target that does not exist *at all* is deliberately let through to
 * `readDeckDir` unchanged — its own missing-plan-file error already names
 * the expected layout, strictly more helpful than this shorter message.
 *
 * `-o` resolves against `cwd` (the same fix `resolveDeckTarget` already
 * needed — see that function's own doc comment) rather than the real
 * `process.cwd()`, so a caller that threads a custom `cwd` gets the output
 * where it actually asked for it. When the resolved output directory is not
 * `deckDir` itself, every local asset src is rewritten
 * ({@link withRewrittenAssetPaths}) to stay correct from the new location —
 * otherwise `assets/logo.png` (correct relative to `deckDir`) would silently
 * fail to resolve from wherever `-o` actually put the file.
 *
 * When the plan omitted `seed`, `readDeckDir` (via `assembleDeck`) generates
 * one deterministically and reports it as `generatedSeed` — surfaced here as
 * a suggestion to add it back to `deck.plan.json` for revision stability
 * (spec §5's seed-generation semantics). Never written automatically:
 * `assembleDeck` stays a pure function with no fs side effects, and silently
 * rewriting a file the user did not ask this command to touch would be a
 * worse surprise than asking them to paste one line in.
 *
 * `materializedLayoutCount` (also from `assembleDeck`, unset when every page
 * already named its own `layout` or landed on the image-cover bypass) gets
 * its own one-line note the same way, listed after the seed note when both
 * apply — purely informational, telling the caller how many pages just had
 * an auto-pick baked into `deck.json` rather than leaving them to notice by
 * diffing the file. The base summary line's `(N slides, M placeholders)`
 * parenthetical itself stays untouched by either note (`scripts/e2e.mts`
 * checks it by exact substring) — both notes are strictly additional lines.
 */
export async function runAssemble(target: string, opts: AssembleOptions = {}): Promise<string> {
  const cwd = opts.cwd ?? process.cwd()
  const [projectHit, userHit] = await Promise.all([findConfig(cwd), findUserConfig()])
  const dir = await resolveDeckTarget(target, resolveDecksDirSource(projectHit, userHit), cwd)
  if ((await pathExists(dir)) && !(await isDeckDirectory(dir))) {
    throw new PptfastError(`expected a deck project directory: ${dir}`)
  }
  const { ir, generatedSeed, materializedLayoutCount, deckDir } = await readDeckDir(dir)
  const outPath = opts.output ? resolve(cwd, opts.output) : join(deckDir, "deck.json")
  const outDir = dirname(outPath)
  const outIr = outDir === deckDir ? ir : withRewrittenAssetPaths(ir, deckDir, outDir)
  await mkdir(outDir, { recursive: true })
  await writeFile(outPath, JSON.stringify(outIr, null, 2) + "\n")
  const placeholderCount = outIr.slides.filter((s) => s.placeholder).length
  const summary = `wrote ${outPath} (${outIr.slides.length} slides, ${placeholderCount} placeholder${placeholderCount === 1 ? "" : "s"})`
  const notes: string[] = []
  if (generatedSeed !== undefined) {
    notes.push(`note: generated seed ${generatedSeed} — add "seed": ${generatedSeed} to deck.plan.json for revision stability`)
  }
  if (materializedLayoutCount !== undefined) {
    notes.push(
      `note: ${materializedLayoutCount} layout${materializedLayoutCount === 1 ? "" : "s"} auto-selected into deck.json — pin "layout" in a page file to lock one`,
    )
  }
  return [summary, ...notes].join("\n")
}

/**
 * `pptfast disassemble <deck.json> -o <dir>` (W5 task 5): the CLI shell for
 * `disassembleDeck` (`../plan/assemble.ts`) — read + validate an IR file the
 * same way `runRender`/`runValidate` do, then write `deck.plan.json` +
 * `pages/<id>.json` for every non-placeholder page. Pretty-printed. Key
 * order is already stable because `disassembleDeck` builds every object
 * with the same fixed field order on every call, not by iterating the
 * input, so there is no separate "stable stringify" step to write. Refuses
 * to overwrite an existing `deck.plan.json` — same `wx`-flag EEXIST guard as
 * `runInit`'s config scaffold — so re-running this command never silently
 * clobbers a deck project someone has since started filling in. Page files
 * are freely (re)written since they only exist because this same command
 * produced them, and written concurrently (`Promise.all`) since each is an
 * independent file.
 *
 * Also materializes `assets/` ({@link writeDeckAssets}, `./deck-dir.ts`) —
 * `disassembleDeck` itself never touches `ir.assets.images` (see that
 * function's own doc comment for the full accounting), so this is the step
 * that actually closes the loop: without it, an image deck disassembles
 * with every `asset_id` reference intact but no bytes behind it, then
 * re-assembles and renders with the image silently missing.
 *
 * The summary never claims to have written a directory it did not create:
 * `pagesDir`/`assetsDir` are only named when at least one page/asset file
 * actually landed there (a plan-only deck with every slide a placeholder,
 * or an assetless deck, leaves either directory unwritten).
 *
 * Every page id is checked with {@link assertSafeFileSegment} (`./deck-dir.ts`)
 * before *any* file is written — not just ahead of `pages/<id>.json` (W5
 * whole-branch review finding 1, CRITICAL — CWE-22), but ahead of
 * `deck.plan.json` too (post-v0.3 W8 fix round, backlog item 8,
 * `.issues/notes/2026-07-18-post-v03-backlog.md` #8 — the check originally
 * ran after the plan write): `slide.id` is an unrestricted string at the
 * schema layer, so a hand-authored IR could otherwise set one to
 * `"../../../../escape"` and write outside `outDir`. `writeDeckAssets` below
 * (`./deck-dir.ts`) carries the matching check for asset keys, inside
 * `writeOneAsset` — that check stays per-asset rather than also moving
 * ahead of the plan write, since an unsafe id is only one of several ways
 * `writeOneAsset` can fail (malformed data URI, URL asset, unreadable local
 * file) and the others can't be front-loaded without doing the write itself.
 *
 * Failure rollback (post-v0.3 W8 fix round, backlog item 8): once
 * `deck.plan.json` is written, this call is the sole owner of that file for
 * the rest of its own execution, so any failure in the page/asset writes
 * below deletes it before rethrowing — a failed run never leaves a
 * `deck.plan.json` behind that doesn't match what actually landed in
 * `pages/`/`assets/`. The `wx` no-overwrite guard above still runs first and
 * throws before this rollback scope is ever entered, so a pre-existing
 * `deck.plan.json` this call did not itself create is never at risk of
 * being deleted — deleting only ever targets the file this same invocation
 * just wrote.
 */
export async function runDisassemble(irPath: string, outDir: string): Promise<string> {
  const raw = await loadIrFile(irPath)
  const v = validateIr(raw)
  if (!v.ok) throw new PptfastError(`invalid IR:\n${formatIssues(v.errors)}`)
  const { plan, pages } = disassembleDeck(v.ir!)

  // W5 whole-branch review finding 1 (CRITICAL, CWE-22): `id` is `slide.id`
  // off the parsed input IR (`disassembleDeck` passes a bare `slide.id`
  // through unchanged when present, `../plan/assemble.ts`) — unrestricted at
  // the schema layer, so an id like `"../../../../escape"` would otherwise
  // write outside `outDir`. Post-v0.3 W8 fix round (backlog item 8): checked
  // here, ahead of every write including `deck.plan.json` itself, so a
  // single unsafe id fails the whole call with nothing written at all,
  // rather than leaving a `deck.plan.json` that then needs rolling back.
  const ids = Object.keys(pages)
  for (const id of ids) assertSafeFileSegment(id, "slide id")

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

  // From here on `planPath` is a file this call just created (the `wx` flag
  // above guarantees no pre-existing file survived to this point), so it is
  // safe to delete on any failure below — backlog item 8: a mid-way failure
  // used to leave `deck.plan.json` on disk with no matching pages/assets,
  // misrepresenting the deck project as already, successfully disassembled.
  const pagesDir = join(outDir, "pages")
  try {
    if (ids.length > 0) {
      await mkdir(pagesDir, { recursive: true })
      await Promise.all(
        ids.map((id) => {
          const content: PageContent = pages[id]!
          return writeFile(join(pagesDir, `${id}.json`), JSON.stringify(content, null, 2) + "\n")
        }),
      )
    }

    const { count: assetCount, assetsDir } = await writeDeckAssets(
      v.ir!.assets.images,
      outDir,
      dirname(resolve(irPath)),
    )

    const pagesNote =
      ids.length > 0
        ? `${ids.length} page file${ids.length === 1 ? "" : "s"} to ${pagesDir}`
        : "no pages (every slide was a placeholder)"
    const assetsNote = assetCount > 0 ? `, and ${assetCount} asset file${assetCount === 1 ? "" : "s"} to ${assetsDir}` : ""
    return `wrote ${planPath}, ${pagesNote}${assetsNote}`
  } catch (e) {
    // Best-effort cleanup: a failure to delete the plan file must never mask
    // the real failure `e` below, so its own error is swallowed, not thrown.
    await rm(planPath, { force: true }).catch(() => {})
    throw e
  }
}
