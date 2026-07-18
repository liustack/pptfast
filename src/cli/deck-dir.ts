/**
 * Deck project directory fs shell (spec §7's "deck project directory"
 * scheme, W5 task 5). Everything here touches disk — the pure half
 * (locked-field injection, placeholder/orphan semantics) lives in
 * `../plan/assemble.ts`'s `assembleDeck`, zero-fs by design (`AGENTS.md`'s
 * layout rule: this module is the *only* place that reads `deck.plan.json`
 * / `pages/*.json` / `assets/*` off disk and calls straight through to it,
 * the same posture `./load-ir.ts` already holds for a single IR file). It
 * is also the only place that *writes* `assets/*`, on the disassemble side
 * ({@link writeDeckAssets}) — the mirror image of {@link scanAssets} below,
 * and the CLI-shell half of `disassembleDeck`'s otherwise-lossy asset
 * handling (see that function's own doc comment in `../plan/assemble.ts`).
 *
 * Directory layout (spec §7):
 * ```
 * my-deck/
 *   deck.plan.json        the locked plan — page order's sole source of truth
 *   pages/<page-id>.json  one file per filled page, content only (no type/heading)
 *   assets/                local images, auto-registered by filename
 * ```
 */
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { basename, extname, isAbsolute, join, resolve } from "node:path"
import { PptfastError } from "../errors"
import { assembleDeck, type AssembleResult, type PageContent } from "../plan/assemble"
import { decksRoot } from "./home"
import { EXT_BY_MIME, loadIrFile } from "./load-ir"

const PLAN_FILENAME = "deck.plan.json"
const PAGES_DIRNAME = "pages"
const ASSETS_DIRNAME = "assets"

// ── bare-name / path resolution ─────────────────────────────────────────

/**
 * Returns true when `stat(path)` succeeds and names a directory — the
 * single source of truth every deck-accepting CLI command (`assemble`,
 * `disassemble`'s input is always a file so it never calls this, `validate`/
 * `render`/`preview`) uses to branch between single-file IR and deck-project
 * directory mode. A missing path (`ENOENT`) reads as "not a directory"
 * rather than propagating — the caller's next step (`loadIrFile` for the
 * single-file branch) already has its own readable "cannot read" error for
 * a path that turns out not to exist at all, and re-deriving that
 * distinction here would just duplicate it. Any *other* `stat` failure
 * (`EACCES`, `ENOTDIR` via a non-directory path segment, ...) rethrows
 * wrapped in {@link PptfastError} instead — silently reading a real
 * permission or filesystem problem as "not a directory, try it as a single
 * IR file" produces a strictly more confusing downstream error than
 * surfacing the actual failure here.
 */
export async function isDeckDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false
    throw new PptfastError(`cannot check ${path}: ${(e as Error).message}`)
  }
}

/**
 * true when `stat(path)` succeeds (file or directory, no distinction) — the
 * same ENOENT-vs-everything-else posture as {@link isDeckDirectory} just
 * above, factored out because `resolveDeckTarget` below needs plain
 * existence (a candidate can legitimately be a file *or* a directory) at
 * two different points, and `runAssemble` (`../cli/commands.ts`) needs it
 * once more, to tell "target does not exist at all" (the existing, detailed
 * `readDeckDir` error, expected-layout hint included) apart from "target
 * exists but is not a directory" (a friendlier, immediate error — see that
 * function).
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false
    throw new PptfastError(`cannot check path ${path}: ${(e as Error).message}`)
  }
}

/**
 * Path-vs-bare-name resolution (spec §7's CLI bare-name resolution): an
 * `arg` that contains a path separator, or that exists locally relative to
 * `cwd` (file *or* directory — a same-directory `deck.json` has no
 * separator but must still resolve as the obviously-intended local file,
 * not get redirected to the deck home), resolves against `cwd` and comes
 * back as a fully-resolved path in both cases — an explicit or
 * locally-resolvable path always wins over the bare-name interpretation,
 * but is never handed back unresolved: every downstream fs call (Node's
 * `readFile` et al.) always resolves a relative path against the process's
 * *real* `process.cwd()`, which only coincides with this function's `cwd`
 * parameter in production (`commands.ts` never passes one explicitly, so it
 * defaults to the real thing) — a test that exercises a different `cwd`
 * without an actual `process.chdir()` needs the already-resolved path back,
 * not the bare `arg`, or the caller's next fs call would silently resolve
 * against a completely different, real cwd. An absolute `arg` is unaffected
 * either way — `path.resolve` returns an absolute later segment as-is.
 *
 * Otherwise `arg` is treated as a deck name under `decksRoot(config)`
 * (`./home.ts` — `$PPTFAST_HOME/decks/<name>`, or the user config's
 * `decksDir` override) — but only when that candidate actually exists. When
 * *neither* the local path nor the deck-home candidate exists, this returns
 * the local (cwd-resolved) path rather than the deck-home guess: a bare arg
 * that was actually a typo'd local filename (`pptfast validate typo.json`)
 * should have its eventual "cannot read" error name the file the user
 * typed, not an unrelated `~/.pptfast/decks/typo.json` path they never
 * meant. `config` is the *user*-config layer specifically (the only layer
 * `decksDir` lives on, `./config.ts`'s `UserPptfastConfig`) — the caller
 * (`commands.ts`) fetches it once via `findUserConfig()` and passes it in
 * rather than this function reaching for it itself, so a command that
 * already needs the user config for other reasons (theme/style resolution)
 * doesn't read the file twice.
 */
export async function resolveDeckTarget(
  arg: string,
  config?: { decksDir?: string },
  cwd: string = process.cwd(),
): Promise<string> {
  if (arg.includes("/") || arg.includes("\\")) return resolve(cwd, arg)
  const local = resolve(cwd, arg)
  if (await pathExists(local)) return local
  const fallback = join(decksRoot(config), arg)
  return (await pathExists(fallback)) ? fallback : local
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
 * `id` is the filename sans `.json` (spec §7: one file per page, named by a
 * stable id). A missing `pages/` directory (`ENOENT`) is not an error, just
 * an empty record (a brand-new deck project with a plan and no filled pages
 * yet is exactly `assembleDeck`'s "every page becomes a placeholder" case)
 * — but `pages/` existing as something that cannot be read as a directory
 * (e.g. a file sitting where a directory was expected, `ENOTDIR`) is a real
 * problem and throws {@link PptfastError} naming the path, not silently
 * "zero pages" (same ENOENT-vs-everything-else posture as
 * {@link isDeckDirectory} above). Non-`.json` entries (a stray `.DS_Store`,
 * an editor swap file, a subdirectory) are silently skipped rather than fed
 * to `JSON.parse` — `.json` is the only declared file shape for this
 * directory, so anything else was never a page file to begin with, not a
 * malformed one. `pages` is deliberately typed `Record<string, unknown>`
 * here (not `Record<string, PageContent>`) — each value's actual shape is
 * checked by `assembleDeck` itself, the same `unknown`-until-validated
 * boundary its own doc comment describes. Entries are read concurrently
 * (`Promise.all`) — independent files, each writing its own `pages[id]` key,
 * nothing to race on.
 */
async function readPages(dir: string): Promise<Record<string, unknown>> {
  const pagesDir = join(dir, PAGES_DIRNAME)
  let entries: string[]
  try {
    entries = (await readdir(pagesDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && extname(entry.name) === ".json")
      .map((entry) => entry.name)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw new PptfastError(`cannot read ${PAGES_DIRNAME}/ directory ${pagesDir}: ${(e as Error).message}`)
  }
  const pages: Record<string, unknown> = {}
  await Promise.all(
    entries.map(async (entry) => {
      const id = basename(entry, ".json")
      pages[id] = await loadIrFile(join(pagesDir, entry), `page "${id}"`)
    }),
  )
  return pages
}

// ── assets/ ──────────────────────────────────────────────────────────────

/**
 * Scans `assets/` and maps each file to an `assets.images` entry (spec §7's
 * assets-mapping rule): `id` is the filename sans extension, `src` is the
 * `assets/<filename>` path *relative to the deck directory* — resolved to
 * actual bytes later by the existing `resolveLocalAssets` (`./load-ir.ts`),
 * called with the deck directory as its base (see `commands.ts`). A missing
 * `assets/` directory (`ENOENT`) is zero assets, same as a missing `pages/`
 * above — anything else (`ENOTDIR`, a permission error, ...) throws
 * {@link PptfastError} naming the path rather than silently reading as "no
 * assets here" (see {@link readPages}'s own note on this). Dotfiles
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
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw new PptfastError(`cannot read ${ASSETS_DIRNAME}/ directory ${assetsDir}: ${(e as Error).message}`)
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

// ── assets/ (write direction — disassemble) ─────────────────────────────

export interface WriteDeckAssetsResult {
  /** Number of `ir.assets.images` entries materialized into `assets/`. */
  count: number
  /** Absolute path to the `assets/` directory written into — never created
   *  (and this path never exists) when `count` is 0. */
  assetsDir: string
}

/**
 * Write direction of the assets/ concept — the mirror image of
 * {@link scanAssets} above, and the CLI-shell half of `disassembleDeck`'s
 * documented-lossy `assets` handling (`../plan/assemble.ts`'s own doc
 * comment on that function): that pure function never touches
 * `ir.assets.images` at all (its `{ plan, pages }` return has no `assets`
 * field), so without this step a disassembled directory would carry
 * `asset_id` references inside `pages/*.json` with nothing under `assets/`
 * backing them — exactly the "image deck round-trips to a missing image"
 * bug this function exists to close. Called by `runDisassemble`
 * (`../cli/commands.ts`) with the source IR's own `assets.images` map and
 * `sourceBaseDir` (the *input* IR file's own directory — the same base
 * `resolveLocalAssets`, `./load-ir.ts`, would resolve a relative local src
 * against at render time).
 *
 * Three source shapes, three outcomes (per entry, all independent —
 * written concurrently via `Promise.all`):
 * - `data:<mime>;base64,<payload>` → decoded and written to
 *   `assets/<id><ext>`, `ext` looked up from `mime` via `EXT_BY_MIME`
 *   (`./load-ir.ts`). An unrecognized mime or a non-base64 data URI is a
 *   hard {@link PptfastError} naming the asset, not a silent skip.
 * - a local file path (relative resolves against `sourceBaseDir`, the same
 *   `isAbsolute(src) ? src : resolve(base, src)` rule `resolveLocalAssets`
 *   itself uses) → copied byte-for-byte into `assets/<id><origExt>`. An
 *   unreadable source (moved/deleted/permission-denied since the IR was
 *   generated) is a hard {@link PptfastError} naming the asset and the path
 *   that could not be read.
 * - `http(s)://` → always a hard {@link PptfastError} — a URL asset has no
 *   local bytes to write at all. The fix is on the deck author's side
 *   (inline it as a data URI, or download it first), not something this
 *   function can paper over.
 *
 * Written entries need no plan or page record of their own: `readDeckDir`'s
 * own {@link scanAssets} re-registers every file under `assets/` purely by
 * scanning the directory, the same way it would for a hand-added image —
 * this function's only job is making sure the bytes are there.
 */
export async function writeDeckAssets(
  images: Record<string, { src: string }>,
  outDir: string,
  sourceBaseDir: string,
): Promise<WriteDeckAssetsResult> {
  const entries = Object.entries(images)
  const assetsDir = join(outDir, ASSETS_DIRNAME)
  if (entries.length === 0) return { count: 0, assetsDir }
  await mkdir(assetsDir, { recursive: true })
  await Promise.all(entries.map(([id, asset]) => writeOneAsset(id, asset.src, assetsDir, sourceBaseDir)))
  return { count: entries.length, assetsDir }
}

/** `data:<mime>;base64,<payload>` — the only data-URI shape any producer in
 *  this codebase ever writes (`resolveLocalAssets`, `./load-ir.ts`, and the
 *  sharp/canvas recode paths in `../platform/`) — matched strictly rather
 *  than handling arbitrary charset params or non-base64 payloads nothing
 *  here produces. */
const DATA_URI_RE = /^data:([^;,]+);base64,(.*)$/s

async function writeOneAsset(id: string, src: string, assetsDir: string, sourceBaseDir: string): Promise<void> {
  if (src.startsWith("data:")) {
    const match = DATA_URI_RE.exec(src)
    if (!match) {
      throw new PptfastError(`asset "${id}": only base64-encoded data URIs can be disassembled (malformed data URI)`)
    }
    const mime = match[1]
    const payload = match[2]
    const ext = EXT_BY_MIME[mime]
    if (!ext) {
      throw new PptfastError(
        `asset "${id}": cannot disassemble a data URI with mime "${mime}" — expected one of ${Object.keys(EXT_BY_MIME).join(", ")}`,
      )
    }
    await writeFile(join(assetsDir, `${id}${ext}`), Buffer.from(payload, "base64"))
    return
  }
  if (/^https?:\/\//.test(src)) {
    throw new PptfastError(
      `asset "${id}": URL assets cannot be disassembled into a deck directory — inline it as a data URI or download it first`,
    )
  }
  const abs = isAbsolute(src) ? src : resolve(sourceBaseDir, src)
  try {
    await copyFile(abs, join(assetsDir, `${id}${extname(abs)}`))
  } catch {
    throw new PptfastError(`asset "${id}": cannot read source image ${abs} (from src "${src}") — cannot disassemble`)
  }
}
