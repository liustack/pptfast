/**
 * Workspace artifact root — where `pptfast render` / `pptfast preview` put
 * their output when the caller passes no `-o`.
 *
 * ```
 * <anchor>/.pptfast/
 *   <deck-slug>/
 *     preview.html        preview --html          (regenerable)
 *     manifest.json       preview --html          (regenerable)
 *     001-cover.svg       preview                 (regenerable)
 *     002-content.svg
 *     <deck-slug>.pptx    render                  (regenerable)
 *     assets/             pinned stock photos     (not regenerable)
 *       hero.jpg
 *       hero.json         sidecar
 * ```
 *
 * Three properties this module exists to hold:
 *
 * 1. **One anchor rule, two lines long.** The anchor is the directory of the
 *    nearest `pptfast.config.json` (`./config.ts`'s `findConfig` cwd walk-up
 *    — the project root is already a concept this CLI has), else cwd. No git
 *    root probing: a git root and a project root are not the same thing in a
 *    monorepo, and a third rule would only be a third thing to remember.
 * 2. **Two zones live here.** Render output (pptx, preview.html, `NNN-*.svg`,
 *    manifest.json) is regenerable: delete those files and re-run, they grow
 *    back. Stock-photo assets (`.pptfast/<deck>/assets/` plus sidecars) are
 *    pinned downloads, not garbage. Deleting the whole `.pptfast/` directory
 *    drops those photos. Deck sources (`deck.spec.json`, `pages/`, project
 *    `assets/`, `theme.json`) stay where the user put them.
 * 3. **The directory ignores itself, once.** The first time this CLI creates
 *    `.pptfast/` it appends the entry to the repository's *local* exclude
 *    file — never the shared `.gitignore`, which is the user's to write. See
 *    {@link ensureGitIgnored} for the four ways that can go sideways and what
 *    each one does instead.
 *
 * Everything here is fs- and process-facing, so it lives under `src/cli/`
 * (AGENTS.md's layout rule: Node-only code never enters `src/index.ts`'s
 * dependency closure).
 */
import { appendFile, mkdir, readFile, readdir, stat, unlink } from "node:fs/promises"
import { basename, dirname, extname, join, resolve } from "node:path"
import { PptfastError } from "../errors"
import { slugify } from "../themes/brand-extract"
import { runChild } from "./child"
import { ASSETS_DIRNAME, assertSafeFileSegment } from "./deck-dir"

/** The default artifact root's directory name, relative to the anchor. A
 *  project config's `outDir` (`./config.ts`) replaces it wholesale. */
export const WORKSPACE_DIRNAME = ".pptfast"

/** The line appended to the local exclude file — a trailing slash so it only
 *  ever matches a directory, and no leading slash so it matches at whatever
 *  depth below the repository root the anchor happens to sit (a monorepo's
 *  per-package project root is not the repository root). */
export const WORKSPACE_IGNORE_ENTRY = `${WORKSPACE_DIRNAME}/`

/**
 * `preview`'s own per-slide SVG filenames: `NNN-<slide type>.svg`
 * (`runPreview` in `./commands.ts`). Slide *type* is what the name carries,
 * not slide *id*, so inserting, deleting, or retyping a page renames files —
 * an 8-page deck cut to 5 leaves `006-*.svg`..`008-*.svg` behind. That was
 * invisible while `-o` was mandatory and every run got a fresh directory;
 * with a fixed default directory it would accumulate silently, so
 * {@link pruneRenderedSvgs} clears them before each default-path write.
 * Deliberately narrow: it matches only names this CLI itself produces, so a
 * file a human dropped in the same directory is never touched.
 */
export const RENDERED_SVG_PATTERN = /^\d{3}-[a-z-]+\.svg$/

/** Where a deck's artifacts go, fully resolved. {@link resolveWorkspaceLocation}
 *  is pure — nothing here has touched the filesystem yet. */
export interface WorkspaceLocation {
  /** The project root the artifact root hangs off: the nearest
   *  `pptfast.config.json`'s directory, else cwd. */
  anchor: string
  /** `<anchor>/.pptfast`, or the project config's `outDir` resolved against
   *  the config file's own directory. */
  root: string
  /** `<root>/<slug>` — this deck's own subdirectory. */
  dir: string
  /** The deck's directory/file name, slugified. */
  slug: string
  /** True when {@link root} came from a project config's `outDir`. An
   *  explicit `outDir` is the user having already said where artifacts go,
   *  so the git-ignore step stays out of it (see {@link prepareWorkspaceDir}). */
  configured: boolean
}

/**
 * `<deck target> → <directory name>`. A deck project directory contributes
 * its directory name, a single IR file its filename without the extension,
 * and a bare deck name resolves to one or the other before it ever gets here
 * (`resolveDeckTarget`, `./deck-dir.ts`), so this only ever sees a real path.
 *
 * `slugify` already strips every character that could mean anything to a path
 * (it keeps `[a-z0-9-]` and nothing else), which makes an escape impossible by
 * construction; {@link assertSafeFileSegment} runs anyway, as the same
 * belt-and-braces posture `./deck-dir.ts` applies to every other id it joins
 * into a write path — a future change to either function then fails loudly
 * here instead of quietly writing outside the workspace.
 */
export function deckSlug(target: string, isDir: boolean): string {
  const base = basename(target)
  const name = isDir ? base : base.slice(0, base.length - extname(base).length)
  const slug = slugify(name, "deck")
  assertSafeFileSegment(slug, "deck slug")
  return slug
}

/** The artifact root hanging off an anchor, before a deck slug is known.
 *  {@link inspectWorkspace} (doctor) uses this, because it reports the root
 *  rather than any one deck's subdirectory. */
export function resolveWorkspaceRoot(opts: {
  cwd: string
  /** The nearest `pptfast.config.json`'s path (`findConfig`'s hit), or null. */
  projectConfigPath?: string | null
  /** That config's `outDir`, if it set one. Relative values resolve against
   *  the config file's own directory — the same base `decksDir` already uses
   *  (`./config.ts`), never the CLI's cwd. */
  outDir?: string
}): Pick<WorkspaceLocation, "anchor" | "root" | "configured"> {
  const anchor = opts.projectConfigPath ? dirname(resolve(opts.projectConfigPath)) : resolve(opts.cwd)
  const configured = opts.outDir !== undefined
  const root = opts.outDir !== undefined ? resolve(anchor, opts.outDir) : join(anchor, WORKSPACE_DIRNAME)
  return { anchor, root, configured }
}

export function resolveWorkspaceLocation(opts: {
  cwd: string
  projectConfigPath?: string | null
  outDir?: string
  /** The deck's resolved path (`loadDeckTarget`'s `resolvedTarget`). */
  target: string
  isDir: boolean
}): WorkspaceLocation {
  const { anchor, root, configured } = resolveWorkspaceRoot(opts)
  const slug = deckSlug(opts.target, opts.isDir)
  return { anchor, root, dir: join(root, slug), slug, configured }
}

// ── git ignore ──────────────────────────────────────────────────────────

/** One `git` invocation's result, or `null` when git could not be spawned at
 *  all (no binary on PATH — a real possibility in a slim container). */
export interface GitResult {
  code: number
  stdout: string
}

export type GitRunner = (args: string[], cwd: string) => Promise<GitResult | null>

const runGitDefault: GitRunner = async (args, cwd) => {
  try {
    const { code, stdout } = await runChild("git", args, { cwd })
    return { code, stdout }
  } catch (error) {
    // A spawn failure's errno string (`"ENOENT"`) is "there is no git here",
    // which is not a failure — it is one of the four outcomes below.
    const code = (error as NodeJS.ErrnoException).code
    if (typeof code !== "number") return null
    throw error
  }
}

/**
 * What {@link ensureGitIgnored} did. Every variant is a normal outcome —
 * none of them ever stops a render.
 */
export type IgnoreOutcome =
  | { kind: "already-ignored" }
  /** Not a git repository (`check-ignore` exit 128), or no git binary. */
  | { kind: "no-repo" }
  | { kind: "appended"; path: string }
  /** The repository is real and the entry is not ignored, but the exclude
   *  file could not be written (read-only `.git`, permissions, ...). */
  | { kind: "failed"; path: string; reason: string }

/** What `git check-ignore` said, collapsed into the three outcomes doctor
 *  and the exclude writer both need. `"skipped"` is doctor-only: a project
 *  that set `outDir` opted out of this whole path, so we do not even ask. */
export type GitIgnoreStatus = "ignored" | "not-ignored" | "not-a-repo" | "skipped"

export async function gitIgnoreStatus(
  dir: string,
  entry: string,
  runGit: GitRunner = runGitDefault,
): Promise<Exclude<GitIgnoreStatus, "skipped">> {
  // Keep a trailing slash if the caller passed one. A directory-only
  // gitignore rule (`.pptfast/`) does not match a *non-existent* path
  // without the slash — git cannot know that name would be a directory —
  // so stripping it made the first-create probe always look unignored.
  const check = await runGit(["check-ignore", "-q", "--", entry], dir)
  if (check === null) return "not-a-repo"
  if (check.code === 0) return "ignored"
  if (check.code === 1) return "not-ignored"
  return "not-a-repo"
}

/**
 * The three facts `pptfast doctor` prints about the workspace: the anchor,
 * the resolved artifact root, and whether git already ignores it. Read-only
 * — never creates a directory, never writes an exclude line.
 */
export async function inspectWorkspace(
  opts: {
    cwd: string
    projectConfigPath?: string | null
    outDir?: string
    runGit?: GitRunner
  },
): Promise<{
  anchor: string
  root: string
  configured: boolean
  ignore: GitIgnoreStatus
}> {
  const { anchor, root, configured } = resolveWorkspaceRoot(opts)
  if (configured) return { anchor, root, configured, ignore: "skipped" }
  const ignore = await gitIgnoreStatus(anchor, WORKSPACE_IGNORE_ENTRY, opts.runGit)
  return { anchor, root, configured, ignore }
}

/**
 * Append `entry` to the repository's local exclude file, unless git already
 * ignores it. Runs exactly once per artifact root, at the moment this CLI
 * creates it — see {@link prepareWorkspaceDir}.
 *
 * The four edge cases, each with a decided answer rather than a crash:
 *
 * - **exit 0** — already ignored, from anywhere (`.gitignore`, a previous
 *   run's exclude line, `core.excludesFile`). Do nothing. This is also the
 *   opt-out: a user who wants the whole team to share the rule writes it into
 *   `.gitignore` themselves, and this code goes quiet forever after.
 * - **exit 1** — a repository, entry not ignored. Append.
 * - **exit 128, or no git binary** — not a repository (or no git at all).
 *   There is nothing to accidentally commit into, so write the artifacts and
 *   say nothing.
 * - **the append itself fails** — a read-only `.git`, a permissions problem.
 *   Report it as a note and keep going. Refusing to render because a courtesy
 *   ignore line could not be written would be the wrong trade by a mile.
 *
 * The exclude file's path comes from `git rev-parse --git-common-dir`, never
 * a hardcoded `.git/info/exclude`: inside a worktree or a submodule `.git` is
 * a *file* pointing elsewhere, and `--git-common-dir` is the one answer that
 * is right in all three shapes (plain clone, worktree, submodule). It can
 * come back relative to the cwd git ran in, hence the `resolve(dir, ...)`.
 */
export async function ensureGitIgnored(
  dir: string,
  entry: string,
  runGit: GitRunner = runGitDefault,
): Promise<IgnoreOutcome> {
  const status = await gitIgnoreStatus(dir, entry, runGit)
  if (status === "ignored") return { kind: "already-ignored" }
  if (status === "not-a-repo") return { kind: "no-repo" }

  const common = await runGit(["rev-parse", "--git-common-dir"], dir)
  if (common === null || common.code !== 0 || common.stdout.trim() === "") return { kind: "no-repo" }
  const excludePath = join(resolve(dir, common.stdout.trim()), "info", "exclude")

  try {
    await mkdir(dirname(excludePath), { recursive: true })
    // A file that does not end in a newline would otherwise get the entry
    // glued onto its last line, silently changing that rule instead of
    // adding one.
    let existing = ""
    try {
      existing = await readFile(excludePath, "utf8")
    } catch {
      existing = ""
    }
    const lead = existing === "" || existing.endsWith("\n") ? "" : "\n"
    await appendFile(excludePath, `${lead}${entry}\n`)
    return { kind: "appended", path: excludePath }
  } catch (e) {
    return { kind: "failed", path: excludePath, reason: (e as Error).message }
  }
}

// ── directory preparation ───────────────────────────────────────────────

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Create `location.dir`, and — only on the run that first creates the
 * artifact root itself — make git ignore that root. Returns the note lines
 * the command should print after its summary; an empty array is the normal,
 * quiet case (the root already existed, or it was already ignored).
 *
 * The ignore step is skipped entirely when the root came from a project
 * config's `outDir` ({@link WorkspaceLocation.configured}) or when the caller
 * passed `--no-git-ignore`: both are the user having already stated where
 * artifacts go and who manages them.
 *
 * A root that cannot be created (a read-only checkout, a container mount)
 * throws a {@link PptfastError} naming all three ways out instead of quietly
 * relocating to a temp directory — output the caller cannot find is worse
 * than output that refused to be written.
 */
export async function prepareWorkspaceDir(
  location: WorkspaceLocation,
  opts: { gitIgnore?: boolean; runGit?: GitRunner } = {},
): Promise<string[]> {
  const rootExisted = await exists(location.root)
  try {
    await mkdir(location.dir, { recursive: true })
  } catch (e) {
    throw new PptfastError(
      `cannot create the output directory ${location.dir}: ${(e as Error).message}\n` +
        `  pass -o <path> to write somewhere writable, set "outDir" in pptfast.config.json, or run from a writable workspace`,
    )
  }
  if (rootExisted || location.configured || opts.gitIgnore === false) return []

  const outcome = await ensureGitIgnored(location.anchor, WORKSPACE_IGNORE_ENTRY, opts.runGit)
  if (outcome.kind === "appended") {
    return [
      `note: added ${WORKSPACE_IGNORE_ENTRY} to ${outcome.path} — a local ignore, your shared .gitignore is untouched`,
    ]
  }
  if (outcome.kind === "failed") {
    return [
      `note: could not write ${outcome.path} (${outcome.reason}) — add ${WORKSPACE_IGNORE_ENTRY} to your ignore rules yourself`,
    ]
  }
  return []
}

/**
 * Delete every `NNN-<type>.svg` file in `dir` ({@link RENDERED_SVG_PATTERN}).
 * Called only on the default-path write — a directory the user named with
 * `-o` could be anything at all, and this CLI has no business deleting files
 * out of it. Returns how many went, for the caller's note line. A missing
 * directory counts as zero.
 */
export async function pruneRenderedSvgs(dir: string): Promise<number> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return 0
  }
  const stale = entries.filter((name) => RENDERED_SVG_PATTERN.test(name))
  await Promise.all(stale.map((name) => unlink(join(dir, name))))
  return stale.length
}

const WORKSPACE_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"])

/** Directory under a deck workspace that holds pinned stock photos + sidecars. */
export function workspaceStockAssetsDir(location: WorkspaceLocation): string {
  return join(location.dir, ASSETS_DIRNAME)
}

/**
 * Scan `.pptfast/<deck>/assets/` for image files. Skips `.json` sidecars and
 * dotfiles. `src` is the absolute path so {@link resolveLocalAssets} can
 * inline it without guessing. Duplicate ids (logo.png + logo.jpg) error,
 * same posture as the deck-project `assets/` scan.
 */
export async function scanWorkspaceAssets(assetsDir: string): Promise<Record<string, { src: string }>> {
  let names: string[]
  try {
    names = (await readdir(assetsDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw new PptfastError(`cannot read workspace assets directory ${assetsDir}: ${(e as Error).message}`)
  }
  const images: Record<string, { src: string }> = {}
  const sourceFile = new Map<string, string>()
  for (const name of names) {
    const ext = extname(name).toLowerCase()
    if (ext === ".json" || !WORKSPACE_IMAGE_EXTS.has(ext)) continue
    const id = basename(name, extname(name))
    const previous = sourceFile.get(id)
    if (previous !== undefined) {
      throw new PptfastError(
        `workspace ${ASSETS_DIRNAME}/${previous} and ${ASSETS_DIRNAME}/${name} both register image id "${id}" — rename one of the files`,
      )
    }
    sourceFile.set(id, name)
    images[id] = { src: join(assetsDir, name) }
  }
  return images
}
