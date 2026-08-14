/**
 * Version stamping for every place that names a version: the skill launchers
 * and the pinned install commands in the docs.
 *
 * The dsh install command must name a version: dsh installs plugins through
 * pnpm 11, which holds back anything published in the last 24 hours and
 * silently resolves `@latest` against what survives that filter, so `@latest`
 * hands a new reader an old release. A pinned version goes stale instead, and
 * this module is the fix: `pnpm release:version` rewrites every pinned
 * `@liustack/pptfast@x.y.z` occurrence in the repo's markdown to the current
 * package.json version, and the drift test (scripts/stamp.test.mts) reads the
 * same occurrences back and asserts each one matches. Keeping the read and
 * the write in one module is what keeps the two in step.
 *
 * Markdown files are discovered by scanning rather than by a fixed list, so a
 * new doc with a pinned command is covered the day it appears. The launchers
 * (`skills/pptfast/scripts/run.sh` and `run.ps1`) carry the same version in a
 * shell and a PowerShell constant, and matter more than any doc line: the
 * pinned version there is what actually runs when a harness invokes the skill
 * without a `pptfast` on PATH. They are stamped by exact line pattern.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

export const PKG_NAME = "@liustack/pptfast"

/** One pinned occurrence: the whole spec, with the version in group 1. */
export const PIN_PATTERN = /@liustack\/pptfast@(\d+\.\d+\.\d+)/g

/** The version this repo currently ships, from package.json. */
export function readPackageVersion(root = repoRoot): string {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }
  return pkg.version
}

/** Every markdown file in the repo, so a new doc cannot escape the stamp. */
export function markdownFiles(
  root = repoRoot,
  // .superpowers holds untracked session-tool state whose version mentions
  // are historical, not commands a reader would copy.
  skip = new Set(["node_modules", ".git", ".issues", ".superpowers", "dist", "out"]),
): string[] {
  const found: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      found.push(...markdownFiles(full, skip))
    } else if (entry.name.endsWith(".md")) {
      found.push(full)
    }
  }
  return found
}

/**
 * Every pinned occurrence in the repo's markdown, one entry each: a file
 * carrying two install commands can drift in only one of them.
 */
export function readStampedVersions(root = repoRoot): { file: string; version: string }[] {
  const entries: { file: string; version: string }[] = []
  for (const file of markdownFiles(root)) {
    for (const match of readFileSync(file, "utf8").matchAll(PIN_PATTERN)) {
      entries.push({ file, version: match[1] })
    }
  }
  return entries
}

/**
 * The launcher constants: one line each, the version captured in group 1.
 * `skills/pptfast/scripts/run.sh` and `run.ps1` must agree with package.json
 * or the skill runs a version this repo never shipped.
 */
export function launcherTargets(root = repoRoot): {
  name: string
  file: string
  pattern: RegExp
  format: (version: string) => string
}[] {
  const scripts = join(root, "skills", "pptfast", "scripts")
  return [
    {
      name: "run.sh PINNED",
      file: join(scripts, "run.sh"),
      pattern: /^PINNED="(\d+\.\d+\.\d+)"$/m,
      format: (version) => `PINNED="${version}"`,
    },
    {
      name: "run.ps1 $Pinned",
      file: join(scripts, "run.ps1"),
      pattern: /^\$Pinned = '(\d+\.\d+\.\d+)'$/m,
      format: (version) => `$Pinned = '${version}'`,
    },
  ]
}

/** The version each launcher currently carries, for the drift test. */
export function readLauncherVersions(root = repoRoot): { name: string; file: string; version: string | null }[] {
  return launcherTargets(root).map((target) => ({
    name: target.name,
    file: target.file,
    version: readFileSync(target.file, "utf8").match(target.pattern)?.[1] ?? null,
  }))
}

/** Rewrite both launcher constants to the package version. */
export function stampLaunchers(root = repoRoot): { version: string; stamped: string[] } {
  const version = readPackageVersion(root)
  const stamped: string[] = []
  for (const target of launcherTargets(root)) {
    const before = readFileSync(target.file, "utf8")
    if (!target.pattern.test(before)) {
      // A launcher whose constant line changed shape would otherwise ship
      // silently unstamped, which is the one failure this module exists to
      // prevent.
      throw new Error(`no version line to stamp in ${target.file} — check ${target.name}`)
    }
    const after = before.replace(target.pattern, target.format(version))
    if (after !== before) writeFileSync(target.file, after)
    stamped.push(target.name)
  }
  return { version, stamped }
}

/** Rewrite every pinned occurrence to the package version. */
export function stampDocs(root = repoRoot): { version: string; occurrences: number } {
  const version = readPackageVersion(root)
  let occurrences = 0
  for (const file of markdownFiles(root)) {
    const before = readFileSync(file, "utf8")
    const matches = [...before.matchAll(PIN_PATTERN)]
    if (matches.length === 0) continue
    occurrences += matches.length
    const after = before.replace(PIN_PATTERN, `${PKG_NAME}@${version}`)
    if (after !== before) writeFileSync(file, after)
  }
  if (occurrences === 0) {
    // The pattern matching nothing means it rotted, not that the docs are
    // clean: the README always carries at least the dsh install command.
    throw new Error("no pinned install command found to stamp — check PIN_PATTERN")
  }
  return { version, occurrences }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version, occurrences } = stampDocs()
  const { stamped } = stampLaunchers()
  console.log(`stamped ${occurrences} pinned install command(s) and ${stamped.length} launcher constant(s) to ${version}`)
}
