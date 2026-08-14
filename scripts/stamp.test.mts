import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  PIN_PATTERN,
  PKG_NAME,
  launcherTargets,
  markdownFiles,
  readLauncherVersions,
  readPackageVersion,
  readStampedVersions,
} from "./stamp.mts"

describe("skill launcher version stamping", () => {
  it("keeps both launcher constants stamped to the package version", () => {
    // The launcher pin outranks every doc line: it is the version that
    // actually runs when a harness invokes the skill on a machine with no
    // `pptfast` on PATH. A drifted constant ships a skill that fetches a
    // release this repo never cut.
    const version = readPackageVersion()
    for (const launcher of readLauncherVersions()) {
      expect(launcher.version, `${launcher.name} (${launcher.file}) is not stamped to ${version}`).toBe(version)
    }
  })

  it("rewrites only the version value and leaves the constant line intact", () => {
    for (const target of launcherTargets()) {
      const original = target.format("0.0.0")
      const restamped = original.replace(target.pattern, target.format("9.9.9"))
      expect(restamped).toBe(target.format("9.9.9"))
      expect(restamped).not.toBe(original)
    }
  })

  it("keeps the two launchers on the same pinned version", () => {
    // run.sh and run.ps1 are the same launcher in two shells. One stamped and
    // one missed would give a Windows user a different pptfast than everyone
    // else, silently.
    const versions = readLauncherVersions().map((launcher) => launcher.version)
    expect(new Set(versions).size, `launchers disagree: ${versions.join(" vs ")}`).toBe(1)
  })
})

describe("install-command version stamping", () => {
  it("keeps every pinned install command stamped to the package version", () => {
    const version = readPackageVersion()
    const stamped = readStampedVersions()
    // The pattern matching nothing would pass the loop below vacuously, so
    // pin the floor: the two READMEs and INSTALL.md each carry at least one.
    expect(stamped.length).toBeGreaterThanOrEqual(3)
    for (const [index, entry] of stamped.entries()) {
      expect(entry.version, `${entry.file} #${index + 1} is not stamped to ${version}`).toBe(
        version,
      )
    }
  })

  it("pins every dsh install command rather than leaving it on @latest", () => {
    // dsh installs plugins through pnpm 11, whose release-age gate resolves
    // `@latest` to whatever shipped a day ago. Whatever else the docs say,
    // the command they print has to install the current release. Every
    // markdown file is scanned, not a fixed list: a new doc nobody added to
    // the stamp flow is exactly where a stale command would hide. And the
    // check is per command, not per file: a file carrying both a pinned
    // command and a deliberate gate-lifting one must not shield the former.
    for (const file of markdownFiles()) {
      // Continuations are joined first, since a command split across lines
      // with a trailing backslash carries its spec and flags on different lines.
      const content = readFileSync(file, "utf8").replace(/\\\n\s*/g, " ")
      for (const line of content.split("\n")) {
        // The whole spec, up to whitespace or the closing quote of a command
        // cited in prose: a partial read would accept `0.18.0+local` by
        // matching only the part that looks pinned.
        const install = line.match(/add @liustack\/pptfast(@[^\s`'")]*)?/)
        if (install === null) continue
        const spec = (install[1] ?? "").slice(1)
        const lifted = line.includes("--config.minimumReleaseAge=0")
        expect(
          /^\d+\.\d+\.\d+$/.test(spec) || lifted,
          `${file}: "${line.trim()}" installs whatever survived the release-age gate`,
        ).toBe(true)
      }
    }
  })

  it("rewrites only the version value and leaves the command shape intact", () => {
    const original = `npx -y @deepseek-ai/dsh plugin --profile web add ${PKG_NAME}@0.0.0`
    const restamped = original.replace(PIN_PATTERN, `${PKG_NAME}@9.9.9`)
    expect(restamped).toBe(`npx -y @deepseek-ai/dsh plugin --profile web add ${PKG_NAME}@9.9.9`)
  })
})
