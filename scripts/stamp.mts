/**
 * Version stamping for the pinned install commands in the docs.
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
 * Files are discovered by scanning every markdown file rather than by a fixed
 * list, so a new doc with a pinned command is covered the day it appears.
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
  console.log(`stamped ${occurrences} pinned install command(s) to ${version}`)
}
