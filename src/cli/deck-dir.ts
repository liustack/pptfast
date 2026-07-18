/**
 * Deck project directory fs shell (spec §7's "deck 项目目录制", W5 task 5).
 * Everything here touches disk — the pure half (locked-field injection,
 * placeholder/orphan semantics) lives in `../plan/assemble.ts`'s
 * `assembleDeck`, zero-fs by design (`AGENTS.md`'s layout rule: this module
 * is the *only* place that reads `deck.plan.json` / `pages/*.json` /
 * `assets/*` off disk and calls straight through to it, the same posture
 * `./load-ir.ts` already holds for a single IR file).
 *
 * Directory layout (spec §7):
 * ```
 * my-deck/
 *   deck.plan.json        the locked plan — page order's sole source of truth
 *   pages/<page-id>.json  one file per filled page, content only (no type/heading)
 *   assets/                local images, auto-registered by filename
 * ```
 */
import { readFile, readdir, stat } from "node:fs/promises"
import { basename, extname, join, resolve } from "node:path"
import { PptfastError } from "../errors"
import { assembleDeck, type AssembleResult, type PageContent } from "../plan/assemble"
import { decksRoot } from "./home"
import { loadIrFile } from "./load-ir"

const PLAN_FILENAME = "deck.plan.json"
const PAGES_DIRNAME = "pages"
const ASSETS_DIRNAME = "assets"

// ── bare-name / path resolution ─────────────────────────────────────────

/**
 * Returns true when `stat(path)` succeeds and names a directory — the
 * single source of truth every deck-accepting CLI command (`assemble`,
 * `disassemble`'s input is always a file so it never calls this, `validate`/
 * `render`/`preview`) uses to branch between single-file IR and deck-project
 * directory mode. Any `stat` failure (missing path, permission error, ...)
 * reads as "not a directory" rather than propagating — the caller's next
 * step (`loadIrFile` for the single-file branch) already has its own
 * readable "cannot read" error for a path that turns out not to exist at
 * all, and re-deriving that distinction here would just duplicate it.
 */
export async function isDeckDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Path-vs-bare-name resolution (spec §7's CLI 裸名解析): an `arg` that
 * contains a path separator, or that exists locally relative to `cwd`
 * (file *or* directory — a same-directory `deck.json` has no separator but
 * must still resolve as the obviously-intended local file, not get
 * redirected to the deck home), is returned unchanged — an explicit or
 * locally-resolvable path always wins over the bare-name interpretation.
 * Otherwise `arg` is treated as a deck name under `decksRoot(config)`
 * (`./home.ts` — `$PPTFAST_HOME/decks/<name>`, or the user config's
 * `decksDir` override). `config` is the *user*-config layer specifically
 * (the only layer `decksDir` lives on, `./config.ts`'s `UserPptfastConfig`)
 * — the caller (`commands.ts`) fetches it once via `findUserConfig()` and
 * passes it in rather than this function reaching for it itself, so a
 * command that already needs the user config for other reasons (theme/style
 * resolution) doesn't read the file twice.
 */
export async function resolveDeckTarget(
  arg: string,
  config?: { decksDir?: string },
  cwd: string = process.cwd(),
): Promise<string> {
  if (arg.includes("/") || arg.includes("\\")) return arg
  const local = resolve(cwd, arg)
  try {
    await stat(local)
    // Exists locally — a path, not a bare name. Returned fully resolved
    // (not the bare `arg`) deliberately: every downstream fs call (Node's
    // `readFile` et al.) always resolves a relative path against the
    // process's *real* `process.cwd()`, which only coincides with this
    // function's `cwd` parameter in production (`commands.ts` never passes
    // one explicitly, so it defaults to the real thing) — a test that
    // exercises a different `cwd` without an actual `process.chdir()` would
    // otherwise pass this existence check against the intended directory
    // and then have the caller's `readFile("deck.json")` silently resolve
    // against a completely different, real cwd.
    return local
  } catch {
    return join(decksRoot(config), arg)
  }
}

// ── deck.plan.json ──────────────────────────────────────────────────────

/** The expected-layout block of {@link readPlanFile}'s missing-file error —
 *  `padEnd`-aligned programmatically (not hand-counted spaces in a template
 *  literal) so the three column widths can't silently drift out of line
 *  when one of the three filename/`*_DIRNAME` constants above changes. */
function expectedLayoutHint(): string {
  const rows: [string, string][] = [
    [PLAN_FILENAME, "the locked plan (see `pptfast plan validate`)"],
    [`${PAGES_DIRNAME}/<page-id>.json`, "one file per filled page (missing pages become placeholders)"],
    [`${ASSETS_DIRNAME}/`, "optional local images"],
  ]
  const width = Math.max(...rows.map(([name]) => name.length)) + 2
  return rows.map(([name, desc]) => `  ${name.padEnd(width)}${desc}`).join("\n")
}

/**
 * Reads `deck.plan.json` out of `dir`. A missing file gets its own,
 * friendlier message over `loadIrFile`'s generic "cannot read" — this is
 * the one failure a deck-directory caller is most likely to hit by typo or
 * by pointing at a directory that was never a deck project in the first
 * place, so the error spells out the expected layout and points at
 * `pptfast plan validate` rather than leaving the caller to guess.
 */
async function readPlanFile(dir: string): Promise<unknown> {
  const planPath = join(dir, PLAN_FILENAME)
  let text: string
  try {
    text = await readFile(planPath, "utf8")
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new PptfastError(
        `no ${PLAN_FILENAME} in ${dir} — expected a deck project directory:\n${expectedLayoutHint()}`,
      )
    }
    throw new PptfastError(`cannot read plan file: ${planPath}`)
  }
  try {
    return JSON.parse(text) as unknown
  } catch (e) {
    throw new PptfastError(`plan file ${planPath} is not valid JSON: ${(e as Error).message}`)
  }
}

// ── pages/<id>.json ──────────────────────────────────────────────────────

/**
 * Reads every `pages/<id>.json` file into a `{ id: parsedContent }` record —
 * `id` is the filename sans `.json` (spec §7: "每页一文件按稳定 id 命名").
 * A missing `pages/` directory is not an error, just an empty record (a
 * brand-new deck project with a plan and no filled pages yet is exactly
 * `assembleDeck`'s "every page becomes a placeholder" case). Non-`.json`
 * entries (a stray `.DS_Store`, an editor swap file, a subdirectory) are
 * silently skipped rather than fed to `JSON.parse` — `.json` is the only
 * declared file shape for this directory, so anything else was never a page
 * file to begin with, not a malformed one. `pages` is deliberately typed
 * `Record<string, unknown>` here (not `Record<string, PageContent>`) — each
 * value's actual shape is checked by `assembleDeck` itself, the same
 * `unknown`-until-validated boundary its own doc comment describes.
 */
async function readPages(dir: string): Promise<Record<string, unknown>> {
  const pagesDir = join(dir, PAGES_DIRNAME)
  let entries: string[]
  try {
    entries = (await readdir(pagesDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && extname(entry.name) === ".json")
      .map((entry) => entry.name)
  } catch {
    return {}
  }
  const pages: Record<string, unknown> = {}
  for (const entry of entries) {
    const id = basename(entry, ".json")
    pages[id] = await loadIrFile(join(pagesDir, entry), `page "${id}"`)
  }
  return pages
}

// ── assets/ ──────────────────────────────────────────────────────────────

/**
 * Scans `assets/` and maps each file to an `assets.images` entry (spec §7's
 * assets 映射规则): `id` is the filename sans extension, `src` is the
 * `assets/<filename>` path *relative to the deck directory* — resolved to
 * actual bytes later by the existing `resolveLocalAssets` (`./load-ir.ts`),
 * called with the deck directory as its base (see `commands.ts`). Dotfiles
 * (`.DS_Store` and friends — `extname` returns `""` for these, so their
 * "id" would otherwise be the whole filename) are skipped: they are never a
 * legitimate image, and `resolveLocalAssets` inlines *every* registered
 * entry unconditionally, so a stray metadata file left registered would
 * fail the whole render with a confusing "unsupported image format" error
 * for an asset nothing in the deck ever references. Two files that
 * normalize to the same id (`logo.png` and `logo.jpg`) is a genuine
 * authoring ambiguity — same "structural mismatch always errors" posture as
 * `assembleDeck`'s orphan-page check — reported with both filenames so the
 * fix (rename one) is obvious.
 */
async function scanAssets(dir: string): Promise<Record<string, { src: string }>> {
  const assetsDir = join(dir, ASSETS_DIRNAME)
  let entries: string[]
  try {
    entries = (await readdir(assetsDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
  } catch {
    return {}
  }
  const images: Record<string, { src: string }> = {}
  const sourceFile = new Map<string, string>()
  for (const entry of entries) {
    const id = basename(entry, extname(entry))
    const previous = sourceFile.get(id)
    if (previous !== undefined) {
      throw new PptfastError(
        `${ASSETS_DIRNAME}/${previous} and ${ASSETS_DIRNAME}/${entry} both register image id "${id}" — rename one of the files`,
      )
    }
    sourceFile.set(id, entry)
    images[id] = { src: `${ASSETS_DIRNAME}/${entry}` }
  }
  return images
}

// ── readDeckDir ──────────────────────────────────────────────────────────

export interface DeckDirResult extends AssembleResult {
  /** Absolute path to the deck directory — the base `resolveLocalAssets`
   *  should resolve this IR's (relative) asset paths against. */
  deckDir: string
}

/**
 * Reads a deck project directory end to end: plan + pages → `assembleDeck`
 * (locked-field injection, placeholder/orphan semantics — see that
 * function's own doc comment) → assets/ scan merged into the assembled IR's
 * `assets.images` (assemble first, then inject — a plan has no `assets`
 * field of its own, so there is never a pre-existing id for a scanned asset
 * to collide with, only the intra-`assets/`-directory collision
 * {@link scanAssets} itself guards against).
 *
 * The merge rebuilds `ir.assets` as a fresh object (`{ images: { ...,
 * ...images } }`) rather than assigning into `ir.assets.images` in place —
 * deliberately, not just style: `PptxIRSchema`'s `assets` field defaults to
 * a *static* object literal (`AssetsSchema.default({ images: {} })`,
 * `../ir/index.ts`), and a plan never sets its own `assets` (assembleDeck's
 * raw object omits the key entirely, same as every other field it lets the
 * schema default), so *every* assembled deck's `ir.assets.images` starts out
 * as that one schema-default object — zod does not deep-clone a static
 * default per parse, only the immediately-defaulted field itself, so nested
 * defaults below it (`images: {}` inside `AssetsSchema`'s own default) keep
 * one shared identity across unrelated parses. Mutating that shared object
 * in place (`ir.assets.images[id] = asset`, the first version of this
 * function) would silently register one deck project's local images onto
 * every other deck assembled in the same process — confirmed with a
 * standalone repro against this exact schema shape before writing this
 * comment. Rebuilding the object sidesteps the shared reference without
 * needing to touch the schema itself.
 */
export async function readDeckDir(dir: string): Promise<DeckDirResult> {
  const deckDir = resolve(dir)
  const plan = await readPlanFile(deckDir)
  const pages = await readPages(deckDir)
  const { ir, generatedSeed } = assembleDeck(plan, pages as Record<string, PageContent>)
  const images = await scanAssets(deckDir)
  ir.assets = { images: { ...ir.assets.images, ...images } }
  return { ir, generatedSeed, deckDir }
}
