// `pptfast doctor`: diagnose this machine's install without a single network
// call. Rendering a PPTX is still zero-config and fully local. Optional
// stock-photo search reads Pexels/Pixabay/Openverse credentials from
// `$PPTFAST_HOME/config.json` or the env, and this report says whether those
// keys are present and where they came from — never the values. What can actually go wrong is: an
// installed skill copy frozen at an old version, a dsh plugin left behind, a
// Node below the floor, a missing optional capability, a broken render chain,
// or a user config file that is group/other-readable. Each of those gets its
// own check below.
//
// The split is deliberate (ported from modlens's own doctor): buildDoctorReport
// produces a structured report and never prints, renderDoctorReport turns that
// report into text. `--json` hands the structure straight through, and the
// tests assert against the structure instead of scraping formatted output.
import { lstatSync } from "node:fs"
import { access, readFile, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { formatIssues, generatePptx, renderSlideSvg, validateIr } from "../api"
import { isMissingModuleError } from "../platform/node"
import { VERSION } from "../version"
import { findConfig, findUserConfig } from "./config"
import { userConfigPath } from "./home"
import { resolveGenerators, resolveImageKeys, type GeneratorId, type ImageProviderId, type KeySource } from "./image-config"
import { probeGenerators, type ProcessRunner } from "./image-generators"
import { findOnPath } from "./path-lookup"
import { compareVersions, PACKAGE_NAME } from "./update"
import { inspectWorkspace, type GitIgnoreStatus, type GitRunner } from "./workspace"

/** The lowest Node this release supports — mirrors package.json `engines.node`
 *  (`doctor.test.ts` asserts the two stay in step, the same way
 *  `version-sync.test.ts` pins `VERSION` against package.json). */
export const MIN_NODE = "22.19"

/** The folder name a skill copy lands under, in every harness's skill root. */
export const SKILL_DIR_NAME = "pptfast"

/** Relative paths every current skill copy must contain, in this order.
 *  A copy that pins the running CLI but is missing `references/` is
 *  incomplete, not stale. */
export const SKILL_COPY_FILES: readonly string[] = [
  "SKILL.md",
  "SKILL.zh-CN.md",
  "scripts/run.sh",
  "scripts/run.ps1",
  "references/spec.md",
  "references/spec.zh-CN.md",
  "references/layouts.md",
  "references/layouts.zh-CN.md",
  "references/components.md",
  "references/components.zh-CN.md",
  "references/density.md",
  "references/density.zh-CN.md",
  "references/branding.md",
  "references/branding.zh-CN.md",
  "references/images.md",
  "references/images.zh-CN.md",
  "references/validate.md",
  "references/validate.zh-CN.md",
]

/** Where each harness reads global skills from — this table is exactly what
 *  INSTALL.md step 2 documents, `~/.agents/skills` serving Pi and OpenCode
 *  both. dsh is deliberately absent: there the CLI ships inside the plugin
 *  package, so drift shows up as a stale plugin, not a stale skill copy
 *  ({@link inspectDsh} below). */
const SKILL_ROOTS = [
  { harness: "Claude Code", relative: join(".claude", "skills") },
  { harness: "Codex", relative: join(".codex", "skills") },
  { harness: "Pi, OpenCode", relative: join(".agents", "skills") },
] as const

/** The tiny deck {@link runSelfTest} pushes through the real pipeline. Kept
 *  minimal on purpose — two pages is enough to exercise cover + content +
 *  a component, and the point is proving the chain runs, not covering it. */
const SELF_TEST_DECK = {
  version: "4",
  filename: "pptfast-doctor-self-test.pptx",
  theme: { id: "consulting" },
  slides: [
    { type: "cover", heading: "pptfast doctor", subheading: "self-test render" },
    {
      type: "content",
      heading: "Core chain",
      components: [{ type: "bullets", items: ["validate the IR", "render a slide to SVG", "generate the .pptx bytes"] }],
    },
  ],
} as const

/** One thing worth telling the user about, at either severity. `check` names
 *  the section it came from so a `--json` consumer can group without parsing
 *  prose, and `fix` is the concrete command or action when one exists. */
export interface DoctorFinding {
  check: string
  message: string
  fix?: string
}

export interface DoctorRuntime {
  node: string
  /** Bun's own version when running under Bun, else null. `process.version`
   *  above is Bun's Node-compatibility version either way, so the floor check
   *  applies unchanged — this only says which runtime is executing. */
  bun: string | null
  minimum: string
  meetsMinimum: boolean
}

export interface DoctorSkillCopy {
  /** The harness that reads this skill root (INSTALL.md's own labels). */
  harness: string
  /** The skill root scanned, e.g. `~/.claude/skills`. */
  root: string
  /** The copy directory itself, `<root>/pptfast`. */
  path: string
  /** The launcher the pin was read from, or null when the copy has no
   *  `scripts/run.sh` at all (a partial copy — reported, never a crash). */
  launcher: string | null
  /** The version this copy pins, or null when it cannot be determined. */
  pinned: string | null
  /** True when the pin is older than the CLI doing the reporting. */
  stale: boolean
  /** `SKILL_COPY_FILES` entries this copy does not have. Empty means the
   *  copy is complete for this CLI. Independent of {@link stale}. */
  missing: string[]
}

export interface DoctorSkills {
  /** Every root that was looked at, present or not — so "no copies found"
   *  can name where it looked instead of sounding like a failed search. */
  scanned: string[]
  copies: DoctorSkillCopy[]
}

export interface DoctorDshProfile {
  /** The profile directory name, i.e. what `--profile` takes. */
  name: string
  path: string
  installed: boolean
  version: string | null
  /** Where the version came from: the resolved package in the profile's own
   *  `node_modules` (authoritative — it is what actually loads), or the
   *  profile `package.json`'s dependency range (a fallback, used when the
   *  package is declared but not installed yet). */
  source: "node_modules" | "package.json" | null
  stale: boolean
}

export interface DoctorDsh {
  /** False when there is no `~/.dsh` at all — the check does not apply, which
   *  is not the same thing as failing it. */
  applicable: boolean
  home: string
  profiles: DoctorDshProfile[]
}

export interface DoctorCapability {
  name: string
  available: boolean
  detail: string
  fix?: string
}

export interface DoctorSelfTest {
  ok: boolean
  elapsedMs: number
  slides: number
  /** Byte length of the generated .pptx, on success. */
  bytes: number | null
  error?: string
}

/** Where `render`/`preview` write when `-o` is omitted, from the cwd doctor
 *  was invoked in. Informational only — never a warning or an error. */
export interface DoctorWorkspace {
  anchor: string
  root: string
  configured: boolean
  ignore: GitIgnoreStatus
}

export interface DoctorImageProvider {
  provider: ImageProviderId
  present: boolean
  source: KeySource | null
}

export interface DoctorImages {
  configPath: string
  configExists: boolean
  /** True when POSIX bits say group or other can read the file. Always false
   *  on Windows (`typeof process.getuid !== "function"`). */
  groupOrOtherReadable: boolean
  providers: DoctorImageProvider[]
}

export interface DoctorGenerator {
  id: GeneratorId
  found: boolean
  bin: string | null
  version: string | null
  enabled: boolean
}

export interface DoctorReport {
  /** The running CLI's version — every drift comparison below is against it. */
  version: string
  runtime: DoctorRuntime
  skills: DoctorSkills
  dsh: DoctorDsh
  capabilities: DoctorCapability[]
  selfTest: DoctorSelfTest
  workspace: DoctorWorkspace
  images: DoctorImages
  generators: DoctorGenerator[]
  /** Hard failures: the only thing that makes `pptfast doctor` exit non-zero. */
  errors: DoctorFinding[]
  /** Worth fixing, never fatal — a stale skill copy or a missing optional
   *  capability still leaves the main flow working, so exit stays 0. */
  warnings: DoctorFinding[]
}

export interface DoctorInput {
  /** The CLI version every pin is compared against. Defaults to `VERSION`. */
  version?: string
  /** Home directory the skill and dsh scans read from. Injectable so tests
   *  build a fake home in a temp directory and never touch the real `~`. */
  home?: string
  /** Environment the PATH probe reads. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv
  /** The Node version checked against the floor. Defaults to `process.version`
   *  — overridable so the below-the-floor path is testable on a machine that
   *  is, by definition, running a supported Node. */
  nodeVersion?: string
  /** Working directory the workspace-artifacts line is resolved from.
   *  Defaults to `process.cwd()`. Injectable so tests do not report the
   *  repository they happen to be running in. */
  cwd?: string
  /** Injectable git runner for the workspace ignore probe. */
  runGit?: GitRunner
  /** Injectable process runner for generator `--version` probes. */
  runProcess?: ProcessRunner
}

/** `PINNED="0.18.0"` out of a launcher's text — the exact line
 *  `scripts/stamp.mts` writes at release time. */
export function readPinnedVersion(launcher: string): string | null {
  return /^PINNED="([^"]+)"/m.exec(launcher)?.[1] ?? null
}

/** `compareVersions` throws on anything it cannot parse (`./update.ts`). A
 *  doctor run must never die on one weird version string, so every comparison
 *  goes through here: unparsable compares as "not older", i.e. never reported
 *  as drift we cannot actually prove. */
function isOlder(version: string, current: string): boolean {
  try {
    return compareVersions(version, current) < 0
  } catch {
    return false
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

/**
 * Every installed skill copy on this machine, with the version each one pins.
 *
 * An installed skill is a *copy*: `INSTALL.md` step 2 copies the folder into
 * the harness's skill root, and that copy keeps its install-time launcher
 * forever. Upgrading the CLI does not touch it, so a machine can sit on a
 * months-old pin while `pptfast --version` reports something much newer, and
 * nothing surfaces that gap until someone asks. This is that question.
 *
 * Finding zero copies is a perfectly normal state (dsh users have no skill
 * folder at all, and the CLI runs fine on its own), so it is reported as a
 * plain fact rather than a warning. A copy that exists but has no `run.sh`, or
 * a `run.sh` with no `PINNED` line, reports `pinned: null` — "version unknown"
 * is an answer, an exception is not.
 */
export async function scanSkillCopies(home: string, currentVersion: string): Promise<DoctorSkills> {
  const scanned: string[] = []
  const copies: DoctorSkillCopy[] = []
  for (const { harness, relative } of SKILL_ROOTS) {
    const root = join(home, relative)
    scanned.push(root)
    const copyDir = join(root, SKILL_DIR_NAME)
    if (!(await pathExists(copyDir))) continue
    const launcherPath = join(copyDir, "scripts", "run.sh")
    let pinned: string | null = null
    let launcher: string | null = null
    try {
      pinned = readPinnedVersion(await readFile(launcherPath, "utf8"))
      launcher = launcherPath
    } catch {
      // no launcher (or unreadable) — the copy still counts, version unknown
    }
    const missing: string[] = []
    for (const rel of SKILL_COPY_FILES) {
      if (!(await pathExists(join(copyDir, rel)))) missing.push(rel)
    }
    copies.push({
      harness,
      root,
      path: copyDir,
      launcher,
      pinned,
      stale: pinned !== null && isOlder(pinned, currentVersion),
      missing,
    })
  }
  return { scanned, copies }
}

/** The version of `@liustack/pptfast` actually resolvable inside a dsh
 *  profile's own `node_modules`, or null. This is the authoritative reading —
 *  it is the package that would really load — and it works through the `link:`
 *  symlink a locally-developed plugin uses, since the symlink target's own
 *  `package.json` is what gets read. */
async function readInstalledPluginVersion(profileDir: string): Promise<string | null> {
  const pkgPath = join(profileDir, "node_modules", ...PACKAGE_NAME.split("/"), "package.json")
  try {
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { version?: unknown }
    return typeof pkg.version === "string" ? pkg.version : null
  } catch {
    return null
  }
}

/**
 * dsh plugin status, per profile.
 *
 * On dsh, pptfast is not a skill folder but a native plugin: the deck skill and
 * the CLI both ship inside the installed package (INSTALL.md step 0), so the
 * question "which version is this machine actually running" is answered by the
 * profile's own installed package, not by a launcher pin.
 *
 * Profiles are directories under `~/.dsh/profiles` that carry their own
 * `package.json` (each one a tiny private package listing its bundles and
 * dependencies) plus their own `node_modules`. That `package.json` test is what
 * separates a real profile from the shared `node_modules` store sitting in the
 * same directory — an entry without one is not a profile.
 *
 * No `~/.dsh` means the check does not apply. That is reported as such, never
 * as a failure: the overwhelming majority of machines running this command are
 * not on dsh at all.
 */
export async function inspectDsh(home: string, currentVersion: string): Promise<DoctorDsh> {
  const dshHome = join(home, ".dsh")
  if (!(await pathExists(dshHome))) return { applicable: false, home: dshHome, profiles: [] }
  const profilesDir = join(dshHome, "profiles")
  let entries: string[]
  try {
    const dirents = await readdir(profilesDir, { withFileTypes: true })
    entries = dirents.filter((d) => d.isDirectory() && d.name !== "node_modules").map((d) => d.name)
  } catch {
    return { applicable: true, home: dshHome, profiles: [] }
  }
  const profiles: DoctorDshProfile[] = []
  for (const name of entries.sort()) {
    const profileDir = join(profilesDir, name)
    let declared: unknown
    try {
      const pkg = JSON.parse(await readFile(join(profileDir, "package.json"), "utf8")) as {
        dependencies?: Record<string, unknown>
      }
      declared = pkg.dependencies?.[PACKAGE_NAME]
    } catch {
      continue // not a profile directory — no package.json of its own
    }
    const installedVersion = await readInstalledPluginVersion(profileDir)
    // A declared range is only used when nothing is resolvable in node_modules,
    // and only when it is a bare version (`"0.18.0"`) — a `link:` or a range
    // like `^0.18.0` names no single installed version to compare against.
    const declaredVersion =
      typeof declared === "string" && /^\d+\.\d+\.\d+/.test(declared) ? declared.match(/^\d+\.\d+\.\d+/)![0] : null
    const version = installedVersion ?? declaredVersion
    const installed = installedVersion !== null || declared !== undefined
    profiles.push({
      name,
      path: profileDir,
      installed,
      version,
      source: installedVersion !== null ? "node_modules" : declaredVersion !== null ? "package.json" : null,
      stale: installed && version !== null && isOlder(version, currentVersion),
    })
  }
  return { applicable: true, home: dshHome, profiles }
}

/** `npx -y @deepseek-ai/dsh plugin --profile web add @liustack/pptfast@0.18.0`
 *  — the pinned form INSTALL.md step 0 insists on, because dsh installs through
 *  a pnpm that holds back fresh releases and silently resolves `@latest` to an
 *  older one. A named version is a deliberate request. */
function dshInstallCommand(profile: string, version: string): string {
  return `npx -y @deepseek-ai/dsh plugin --profile ${profile} add ${PACKAGE_NAME}@${version}`
}

/** Both optional capabilities, each with the exact consequence of not having
 *  it — and, just as important, what still works without it. Neither is ever an
 *  error: the main write-IR → validate → render flow needs neither. */
async function inspectCapabilities(env: NodeJS.ProcessEnv): Promise<DoctorCapability[]> {
  const capabilities: DoctorCapability[] = []

  let sharpAvailable = false
  let sharpError: string | null = null
  try {
    await import("sharp")
    sharpAvailable = true
  } catch (e) {
    sharpError = isMissingModuleError(e) ? "not installed" : e instanceof Error ? e.message : String(e)
  }
  capabilities.push({
    name: "sharp",
    available: sharpAvailable,
    detail: sharpAvailable
      ? "importable — preview rasterization and `audit --pixels` are available"
      : `${sharpError} — preview rasterization and \`audit --pixels\` are unavailable. Plain SVG preview and .pptx rendering are unaffected`,
    fix: sharpAvailable ? undefined : "npm i sharp (optional dependency — install it only if you want the pixel checks)",
  })

  const soffice = await findOnPath("soffice", env)
  capabilities.push({
    name: "soffice",
    available: soffice !== null,
    detail:
      soffice !== null
        ? `found at ${soffice} — the PDF export path is available`
        : "not on PATH — the PDF export path is unavailable. Rendering and validating .pptx files are unaffected",
    fix: soffice !== null ? undefined : "install LibreOffice (https://libreoffice.org) and make sure `soffice` is on PATH",
  })

  return capabilities
}

function posixBitsApply(): boolean {
  return typeof process.getuid === "function"
}

export async function inspectImages(env: NodeJS.ProcessEnv): Promise<DoctorImages> {
  const configPath = userConfigPath()
  let configExists = false
  let groupOrOtherReadable = false
  try {
    const st = lstatSync(configPath)
    configExists = true
    if (posixBitsApply() && !st.isSymbolicLink()) {
      groupOrOtherReadable = (st.mode & 0o077) !== 0
    }
  } catch {
    configExists = false
  }
  let file: Awaited<ReturnType<typeof findUserConfig>> = null
  try {
    file = await findUserConfig()
  } catch {
    file = null
  }
  const keys = resolveImageKeys({ file: file?.config ?? null, env })
  const providers: DoctorImageProvider[] = (["pexels", "pixabay"] as const).map((provider) => ({
    provider,
    present: Boolean(keys[provider].apiKey),
    source: keys[provider].source,
  }))
  providers.push({
    provider: "openverse",
    present: keys.openverse.ready,
    source: keys.openverse.ready ? keys.openverse.source : null,
  })
  return { configPath, configExists, groupOrOtherReadable, providers }
}

export async function inspectGenerators(env: NodeJS.ProcessEnv, run?: ProcessRunner): Promise<DoctorGenerator[]> {
  let file: Awaited<ReturnType<typeof findUserConfig>> = null
  try {
    file = await findUserConfig()
  } catch {
    file = null
  }
  const flags = resolveGenerators({ file: file?.config ?? null })
  return probeGenerators({ env, run, enabled: flags.enabled })
}

/**
 * Push a tiny built-in deck through the real pipeline — validate, render one
 * slide to SVG, generate the .pptx bytes — entirely in memory, nothing written
 * to disk. Everything else in this report is an observation about the
 * environment; this is the one check that proves the thing actually works.
 * A failure here is a hard error: if this deck cannot render, no deck can.
 */
export async function runSelfTest(): Promise<DoctorSelfTest> {
  const started = performance.now()
  const elapsed = () => Math.round(performance.now() - started)
  try {
    const v = validateIr(SELF_TEST_DECK)
    if (!v.ok) throw new Error(`the built-in self-test deck failed validation:\n${formatIssues(v.errors)}`)
    const svg = renderSlideSvg(v.ir!, 0)
    if (!svg.includes("<svg")) throw new Error("the SVG renderer produced no <svg> element")
    const bytes = await generatePptx(v.ir!)
    if (bytes.length === 0) throw new Error("the PPTX generator produced zero bytes")
    return { ok: true, elapsedMs: elapsed(), slides: v.ir!.slides.length, bytes: bytes.length }
  } catch (e) {
    return {
      ok: false,
      elapsedMs: elapsed(),
      slides: SELF_TEST_DECK.slides.length,
      bytes: null,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/** How to refresh a stale skill copy: exactly INSTALL.md step 2's clone and
 *  copy, aimed at the copy that is actually behind. Re-running it overwrites in
 *  place, which is the whole update procedure. The source is a fresh clone
 *  rather than the global npm root on purpose — installing the skill needs no
 *  global CLI install, so there may well be no npm root to copy from. */
function skillRefreshCommand(copyDir: string): string {
  return `rm -rf /tmp/pptfast-src && git clone --depth 1 https://github.com/liustack/pptfast.git /tmp/pptfast-src && cp -R /tmp/pptfast-src/skills/${SKILL_DIR_NAME}/. ${copyDir}/`
}

export async function buildDoctorReport(input: DoctorInput = {}): Promise<DoctorReport> {
  const version = input.version ?? VERSION
  const home = input.home ?? homedir()
  const env = input.env ?? process.env
  const nodeVersion = input.nodeVersion ?? process.version

  const cwd = input.cwd ?? process.cwd()
  const [skills, dsh, capabilities, selfTest, projectHit, images, generators] = await Promise.all([
    scanSkillCopies(home, version),
    inspectDsh(home, version),
    inspectCapabilities(env),
    runSelfTest(),
    findConfig(cwd),
    inspectImages(env),
    inspectGenerators(env, input.runProcess),
  ])
  const workspace = await inspectWorkspace({
    cwd,
    projectConfigPath: projectHit?.path,
    outDir: projectHit?.config.outDir,
    runGit: input.runGit,
  })

  // An unparsable version string can never prove the runtime is too old, so it
  // passes rather than hard-failing a run over a string this cannot read.
  let meetsMinimum = true
  try {
    meetsMinimum = compareVersions(nodeVersion, MIN_NODE) >= 0
  } catch {
    meetsMinimum = true
  }
  const runtime: DoctorRuntime = {
    node: nodeVersion,
    bun: process.versions.bun ?? null,
    minimum: MIN_NODE,
    meetsMinimum,
  }

  const errors: DoctorFinding[] = []
  const warnings: DoctorFinding[] = []

  if (!runtime.meetsMinimum) {
    errors.push({
      check: "runtime",
      message: `Node ${runtime.node} is below the ${MIN_NODE} floor pptfast needs`,
      fix: `install Node ${MIN_NODE}+ from https://nodejs.org (or \`nvm install 22\`), open a new shell, then re-run \`pptfast doctor\``,
    })
  }
  if (!selfTest.ok) {
    errors.push({
      check: "self-test",
      message: `the self-test render failed: ${selfTest.error}`,
      fix: `reinstall the CLI: npm install -g ${PACKAGE_NAME}`,
    })
  }

  for (const copy of skills.copies) {
    if (copy.stale) {
      warnings.push({
        check: "skill copy",
        message: `${copy.path} pins ${copy.pinned}, behind this CLI's ${version}`,
        fix: `re-run the install to overwrite the copy in place: ${skillRefreshCommand(copy.path)}`,
      })
    } else if (copy.pinned === null) {
      warnings.push({
        check: "skill copy",
        message: `${copy.path} has ${copy.launcher === null ? "no scripts/run.sh" : "a scripts/run.sh with no PINNED line"} — version unknown, so drift cannot be ruled out`,
        fix: `re-run the install to restore a complete copy: ${skillRefreshCommand(copy.path)}`,
      })
    }
    if (copy.missing.length > 0) {
      warnings.push({
        check: "skill copy",
        message: `${copy.path} is missing ${copy.missing.join(", ")}`,
        fix: `re-run the install to restore a complete copy: ${skillRefreshCommand(copy.path)}`,
      })
    }
  }

  for (const profile of dsh.profiles) {
    if (profile.stale) {
      warnings.push({
        check: "dsh plugin",
        message: `profile "${profile.name}" has ${PACKAGE_NAME} ${profile.version}, behind this CLI's ${version}`,
        fix: dshInstallCommand(profile.name, version),
      })
    }
  }

  for (const capability of capabilities) {
    if (!capability.available) {
      warnings.push({ check: "capability", message: `${capability.name}: ${capability.detail}`, fix: capability.fix })
    }
  }

  // Missing stock-photo keys stay in the Images section as `[-]`, not in
  // `warnings`. Rendering PPTX does not need them, so they must not steal
  // the "pptfast is healthy" line. A group/other-readable config file is
  // the one images finding that is a real warning.
  if (images.groupOrOtherReadable) {
    warnings.push({
      check: "images",
      message: `${images.configPath} is group/other-readable — API keys should be mode 0600`,
      fix: `chmod 600 ${images.configPath}`,
    })
  }

  return { version, runtime, skills, dsh, capabilities, selfTest, workspace, images, generators, errors, warnings }
}

function mark(state: "ok" | "warn" | "fail" | "n/a"): string {
  return state === "ok" ? "[ok]" : state === "warn" ? "[!]" : state === "fail" ? "[!!]" : "[-]"
}

export function renderDoctorReport(report: DoctorReport): string {
  const lines: string[] = []

  lines.push(`pptfast doctor — CLI ${report.version}`)
  lines.push("(local diagnostics only: nothing is written, no network call is made)")
  lines.push("")

  lines.push("Installed skill copies (a copy keeps its install-time version forever)")
  if (report.skills.copies.length === 0) {
    lines.push("  [-] no installed skill copy found — the CLI runs fine on its own, and dsh ships the")
    lines.push("      skill inside the plugin instead")
    lines.push(`      looked in: ${report.skills.scanned.join(", ")}`)
  } else {
    for (const copy of report.skills.copies) {
      const state = copy.stale || copy.pinned === null || copy.missing.length > 0 ? "warn" : "ok"
      const pin = copy.pinned === null ? "version unknown" : `pins ${copy.pinned}`
      lines.push(`  ${mark(state)} ${copy.harness}: ${copy.path} — ${pin}${copy.stale ? " (stale)" : ""}`)
      if (copy.stale) {
        lines.push(`      fix: ${skillRefreshCommand(copy.path)}`)
      } else if (copy.pinned === null) {
        lines.push(`      ${copy.launcher === null ? "no scripts/run.sh in this copy" : "scripts/run.sh carries no PINNED line"}`)
        lines.push(`      fix: ${skillRefreshCommand(copy.path)}`)
      }
      if (copy.missing.length > 0) {
        lines.push(`      missing: ${copy.missing.join(", ")}`)
        lines.push(`      fix: ${skillRefreshCommand(copy.path)}`)
      }
    }
  }
  lines.push("")

  lines.push("DSH plugin")
  if (!report.dsh.applicable) {
    lines.push(`  ${mark("n/a")} no ${report.dsh.home} — not a dsh machine, this check does not apply`)
  } else if (report.dsh.profiles.length === 0) {
    lines.push(`  ${mark("n/a")} ${report.dsh.home} exists but has no profiles to inspect`)
  } else {
    for (const profile of report.dsh.profiles) {
      if (!profile.installed) {
        lines.push(`  ${mark("n/a")} ${profile.name}: ${PACKAGE_NAME} not installed in this profile`)
        continue
      }
      const version = profile.version ?? "version unknown"
      lines.push(`  ${mark(profile.stale ? "warn" : "ok")} ${profile.name}: ${version}${profile.source ? ` (via ${profile.source})` : ""}${profile.stale ? " (behind this CLI)" : ""}`)
      if (profile.stale) {
        lines.push(`      fix: ${dshInstallCommand(profile.name, report.version)}`)
      }
    }
  }
  lines.push("")

  lines.push("Runtime")
  lines.push(`  ${mark(report.runtime.meetsMinimum ? "ok" : "fail")} Node ${report.runtime.node} (minimum ${report.runtime.minimum})`)
  if (report.runtime.bun !== null) {
    lines.push(`  ${mark("ok")} running under Bun ${report.runtime.bun}`)
  }
  lines.push("")

  lines.push("Optional capabilities (neither is needed by the main flow)")
  for (const capability of report.capabilities) {
    lines.push(`  ${mark(capability.available ? "ok" : "warn")} ${capability.name}: ${capability.detail}`)
    if (capability.fix) lines.push(`      fix: ${capability.fix}`)
  }
  lines.push("")

  lines.push("Self-test render (a built-in deck through the real pipeline, in memory)")
  lines.push(
    report.selfTest.ok
      ? `  ${mark("ok")} ${report.selfTest.slides} slides validated, rendered, and packed into ${report.selfTest.bytes} bytes in ${report.selfTest.elapsedMs}ms`
      : `  ${mark("fail")} failed after ${report.selfTest.elapsedMs}ms: ${report.selfTest.error}`,
  )
  lines.push("")

  lines.push("Workspace artifacts (where render/preview write when -o is omitted)")
  lines.push(`  ${mark("ok")} anchor ${report.workspace.anchor}`)
  lines.push(
    report.workspace.configured
      ? `  ${mark("ok")} output ${report.workspace.root} (from pptfast.config.json outDir)`
      : `  ${mark("ok")} output ${report.workspace.root}`,
  )
  if (report.workspace.ignore === "ignored") {
    lines.push(`  ${mark("ok")} git-ignored`)
  } else if (report.workspace.ignore === "not-ignored") {
    lines.push(`  ${mark("n/a")} not git-ignored — the first render will add a local exclude line`)
  } else if (report.workspace.ignore === "skipped") {
    lines.push(`  ${mark("n/a")} git-ignore skipped (outDir is set in pptfast.config.json)`)
  } else {
    lines.push(`  ${mark("n/a")} not a git repository`)
  }
  lines.push("")

  lines.push("Images (optional stock-photo search — rendering PPTX still needs no credentials)")
  lines.push(`  ${mark("ok")} config ${report.images.configPath}${report.images.configExists ? "" : " (missing)"}`)
  if (report.images.groupOrOtherReadable) {
    lines.push(`  ${mark("warn")} file is group/other-readable — chmod 600`)
  }
  for (const provider of report.images.providers) {
    if (provider.present) {
      lines.push(`  ${mark("ok")} ${provider.provider}: present (${provider.source})`)
    } else if (provider.provider === "openverse") {
      lines.push(`  ${mark("n/a")} openverse: missing — pptfast config set openverse.clientId`)
    } else {
      lines.push(`  ${mark("n/a")} ${provider.provider}: missing — pptfast config set ${provider.provider}.apiKey`)
    }
  }
  lines.push("")

  lines.push("Image generators (optional, off until enabled)")
  for (const gen of report.generators) {
    if (!gen.found) {
      lines.push(`  ${mark("n/a")} ${gen.id}: not found`)
      continue
    }
    const ver = gen.version ? `, ${gen.version}` : ""
    const state = gen.enabled ? "enabled" : "disabled"
    const hint = gen.enabled ? "" : ` — pptfast config set images.generators.${gen.id}.enabled true`
    lines.push(`  ${mark("ok")} ${gen.id}: found (${gen.bin}${ver}) ${state}${hint}`)
  }
  lines.push("")

  lines.push(
    `${report.errors.length} error${report.errors.length === 1 ? "" : "s"}, ${report.warnings.length} warning${report.warnings.length === 1 ? "" : "s"}`,
  )
  for (const error of report.errors) {
    lines.push(`  [!!] ${error.check}: ${error.message}`)
    if (error.fix) lines.push(`       fix: ${error.fix}`)
  }
  for (const warning of report.warnings) {
    lines.push(`  [!] ${warning.check}: ${warning.message}`)
  }
  if (report.errors.length === 0) {
    lines.push(report.warnings.length === 0 ? "pptfast is healthy on this machine" : "nothing blocking — the warnings above are worth fixing when convenient")
  }

  return lines.join("\n")
}

export interface DoctorOptions extends DoctorInput {
  json?: boolean
}

export interface DoctorCliResult {
  /** The human report ({@link renderDoctorReport}) or, with `opts.json`, the
   *  `JSON.stringify`'d {@link DoctorReport} verbatim. */
  output: string
  /** True only when a hard error was found (runtime below the floor, or a
   *  failed self-test render). The CLI prints `output` either way, then exits 1
   *  on this signal alone — a stale skill copy or a missing optional
   *  capability is a warning and still exits 0, same advisory posture
   *  `runValidate`'s own warnings already have. */
  hasErrors: boolean
}

export async function runDoctor(opts: DoctorOptions = {}): Promise<DoctorCliResult> {
  const report = await buildDoctorReport(opts)
  return {
    output: opts.json ? JSON.stringify(report, null, 2) : renderDoctorReport(report),
    hasErrors: report.errors.length > 0,
  }
}
