// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chmodSync, existsSync, readFileSync } from "node:fs"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { installNodePlatform } from "@/platform/node"
import {
  buildDoctorReport,
  inspectDsh,
  MIN_NODE,
  readPinnedVersion,
  renderDoctorReport,
  runDoctor,
  runSelfTest,
  scanSkillCopies,
  SKILL_COPY_FILES,
} from "./doctor"

// The self-test render goes through the real pipeline, which needs the Node
// platform seams wired the same way `src/cli.ts` wires them at startup.
beforeAll(() => {
  installNodePlatform()
})

const CURRENT = "0.18.0"

const originalPptfastHome = process.env.PPTFAST_HOME
const originalPexels = process.env.PPTFAST_PEXELS_API_KEY
const originalPixabay = process.env.PPTFAST_PIXABAY_API_KEY
const originalOvId = process.env.PPTFAST_OPENVERSE_CLIENT_ID
const originalOvSecret = process.env.PPTFAST_OPENVERSE_CLIENT_SECRET

afterEach(() => {
  if (originalPptfastHome === undefined) delete process.env.PPTFAST_HOME
  else process.env.PPTFAST_HOME = originalPptfastHome
  if (originalPexels === undefined) delete process.env.PPTFAST_PEXELS_API_KEY
  else process.env.PPTFAST_PEXELS_API_KEY = originalPexels
  if (originalPixabay === undefined) delete process.env.PPTFAST_PIXABAY_API_KEY
  else process.env.PPTFAST_PIXABAY_API_KEY = originalPixabay
  if (originalOvId === undefined) delete process.env.PPTFAST_OPENVERSE_CLIENT_ID
  else process.env.PPTFAST_OPENVERSE_CLIENT_ID = originalOvId
  if (originalOvSecret === undefined) delete process.env.PPTFAST_OPENVERSE_CLIENT_SECRET
  else process.env.PPTFAST_OPENVERSE_CLIENT_SECRET = originalOvSecret
})

/** A fake home, so no test ever reads the machine's real `~` or `~/.pptfast`. */
async function makeHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pptfast-doctor-home-"))
  process.env.PPTFAST_HOME = dir
  delete process.env.PPTFAST_PEXELS_API_KEY
  delete process.env.PPTFAST_PIXABAY_API_KEY
  delete process.env.PPTFAST_OPENVERSE_CLIENT_ID
  delete process.env.PPTFAST_OPENVERSE_CLIENT_SECRET
  return dir
}

/** Write a skill copy into `<home>/<relative>/pptfast`, with `pinned` stamped
 *  into its launcher exactly the way `scripts/stamp.mts` stamps the real one.
 *  `pinned: null` writes a launcher with no PINNED line at all. */
async function writeSkillCopy(home: string, relative: string, pinned: string | null): Promise<string> {
  const copyDir = join(home, relative, "pptfast")
  await mkdir(join(copyDir, "scripts"), { recursive: true })
  const launcher = ["#!/bin/sh", 'PKG="@liustack/pptfast"', ...(pinned === null ? [] : [`PINNED="${pinned}"`]), ""].join("\n")
  await writeFile(join(copyDir, "scripts", "run.sh"), launcher)
  return copyDir
}

/** A skill copy directory with no `scripts/run.sh` in it at all. */
async function writePartialSkillCopy(home: string, relative: string): Promise<string> {
  const copyDir = join(home, relative, "pptfast")
  await mkdir(copyDir, { recursive: true })
  await writeFile(join(copyDir, "SKILL.md"), "# pptfast\n")
  return copyDir
}

/** A dsh profile directory: its own package.json, optionally with the plugin
 *  resolvable in its own node_modules (the layout `~/.dsh/profiles` really
 *  uses — one directory per profile, each with its own package.json). */
async function writeDshProfile(
  home: string,
  name: string,
  opts: { declared?: string; installed?: string } = {},
): Promise<void> {
  const profileDir = join(home, ".dsh", "profiles", name)
  await mkdir(profileDir, { recursive: true })
  await writeFile(
    join(profileDir, "package.json"),
    JSON.stringify({
      name: `dsh-profile-${name}`,
      private: true,
      dependencies: opts.declared === undefined ? {} : { "@liustack/pptfast": opts.declared },
    }),
  )
  if (opts.installed !== undefined) {
    const pkgDir = join(profileDir, "node_modules", "@liustack", "pptfast")
    await mkdir(pkgDir, { recursive: true })
    await writeFile(join(pkgDir, "package.json"), JSON.stringify({ name: "@liustack/pptfast", version: opts.installed }))
  }
}

describe("readPinnedVersion", () => {
  it("reads the exact PINNED line the launcher carries", () => {
    expect(readPinnedVersion('PKG="@liustack/pptfast"\nPINNED="0.17.2"\nBIN="pptfast"\n')).toBe("0.17.2")
  })

  it("returns null when there is no PINNED line", () => {
    expect(readPinnedVersion("#!/bin/sh\necho hi\n")).toBeNull()
  })

  it("ignores a PINNED that is not at the start of a line", () => {
    expect(readPinnedVersion('# do not edit PINNED="9.9.9" by hand\n')).toBeNull()
  })
})

describe("scanSkillCopies", () => {
  it("every SKILL_COPY_FILES path exists in the repo skill folder", () => {
    const root = join(process.cwd(), "skills", "pptfast")
    for (const rel of SKILL_COPY_FILES) {
      expect(existsSync(join(root, rel)), `missing skills/pptfast/${rel}`).toBe(true)
    }
  })

  it("finds a copy in every documented skill root and reads its pin", async () => {
    const home = await makeHome()
    try {
      await writeSkillCopy(home, ".claude/skills", CURRENT)
      await writeSkillCopy(home, ".codex/skills", CURRENT)
      await writeSkillCopy(home, ".agents/skills", CURRENT)
      const skills = await scanSkillCopies(home, CURRENT)
      expect(skills.copies.map((c) => c.harness)).toEqual(["Claude Code", "Codex", "Pi, OpenCode"])
      expect(skills.copies.every((c) => c.pinned === CURRENT)).toBe(true)
      expect(skills.copies.every((c) => c.stale === false)).toBe(true)
      expect(skills.scanned).toHaveLength(3)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("marks a copy pinned below the running CLI as stale", async () => {
    const home = await makeHome()
    try {
      await writeSkillCopy(home, ".claude/skills", "0.14.0")
      await writeSkillCopy(home, ".codex/skills", CURRENT)
      const skills = await scanSkillCopies(home, CURRENT)
      expect(skills.copies).toHaveLength(2)
      expect(skills.copies[0]).toMatchObject({ harness: "Claude Code", pinned: "0.14.0", stale: true })
      expect(skills.copies[1]).toMatchObject({ harness: "Codex", pinned: CURRENT, stale: false })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("never calls a copy ahead of the CLI stale", async () => {
    const home = await makeHome()
    try {
      await writeSkillCopy(home, ".claude/skills", "0.19.0")
      const [copy] = (await scanSkillCopies(home, CURRENT)).copies
      expect(copy).toMatchObject({ pinned: "0.19.0", stale: false })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("reports a launcher with no PINNED line as version unknown, not a crash", async () => {
    const home = await makeHome()
    try {
      const copyDir = await writeSkillCopy(home, ".codex/skills", null)
      const [copy] = (await scanSkillCopies(home, CURRENT)).copies
      expect(copy).toMatchObject({ path: copyDir, pinned: null, stale: false })
      expect(copy!.launcher).toContain("run.sh")
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("reports a copy with no run.sh at all as version unknown, not a crash", async () => {
    const home = await makeHome()
    try {
      const copyDir = await writePartialSkillCopy(home, ".agents/skills")
      const [copy] = (await scanSkillCopies(home, CURRENT)).copies
      expect(copy).toMatchObject({ path: copyDir, launcher: null, pinned: null, stale: false })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("finds nothing on a machine with no skill copies, and still names where it looked", async () => {
    const home = await makeHome()
    try {
      const skills = await scanSkillCopies(home, CURRENT)
      expect(skills.copies).toEqual([])
      expect(skills.scanned).toHaveLength(3)
      expect(skills.scanned[0]).toContain(".claude")
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("warns when a current pin is missing the references booklets, without calling it stale", async () => {
    const home = await makeHome()
    try {
      const copyDir = await writeSkillCopy(home, ".claude/skills", CURRENT)
      await writeFile(join(copyDir, "SKILL.md"), "# pptfast\n")
      await writeFile(join(copyDir, "SKILL.zh-CN.md"), "# pptfast\n")
      await writeFile(join(copyDir, "scripts", "run.ps1"), "# stub\n")
      const [copy] = (await scanSkillCopies(home, CURRENT)).copies
      expect(copy).toMatchObject({ pinned: CURRENT, stale: false })
      expect(copy!.missing.length).toBeGreaterThan(0)
      expect(copy!.missing.every((rel) => rel.startsWith("references/"))).toBe(true)
      expect(copy!.missing).toContain("references/spec.md")
      expect(copy!.missing).not.toContain("SKILL.md")
      expect(copy!.missing).not.toContain("scripts/run.sh")
      expect(copy!.missing).not.toContain("scripts/run.ps1")

      const report = await buildDoctorReport({ home, env: { PATH: "" }, version: CURRENT })
      const warning = report.warnings.find((w) => w.check === "skill copy")
      expect(warning?.message).toContain(copyDir)
      expect(warning?.message).toMatch(/references/)
      expect(copy.stale).toBe(false)

      const rendered = renderDoctorReport(report)
      expect(rendered).toContain("[!]")
      expect(rendered).toContain("references/spec.md")
      expect(rendered).toContain(
        "git clone --depth 1 https://github.com/liustack/pptfast.git /tmp/pptfast-src && cp -R /tmp/pptfast-src/skills/pptfast/. ",
      )
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})

describe("inspectDsh", () => {
  it("is not applicable when there is no ~/.dsh", async () => {
    const home = await makeHome()
    try {
      expect(await inspectDsh(home, CURRENT)).toMatchObject({ applicable: false, profiles: [] })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("reads the installed version out of each profile's own node_modules", async () => {
    const home = await makeHome()
    try {
      await writeDshProfile(home, "web", { declared: "0.14.0", installed: "0.14.0" })
      await writeDshProfile(home, "headless", { declared: CURRENT, installed: CURRENT })
      await writeDshProfile(home, "bare")
      // The shared package store sitting alongside the profiles is not one.
      await mkdir(join(home, ".dsh", "profiles", "node_modules", "@liustack"), { recursive: true })
      const dsh = await inspectDsh(home, CURRENT)
      expect(dsh.applicable).toBe(true)
      expect(dsh.profiles.map((p) => p.name)).toEqual(["bare", "headless", "web"])
      expect(dsh.profiles.find((p) => p.name === "web")).toMatchObject({
        installed: true,
        version: "0.14.0",
        source: "node_modules",
        stale: true,
      })
      expect(dsh.profiles.find((p) => p.name === "headless")).toMatchObject({ version: CURRENT, stale: false })
      expect(dsh.profiles.find((p) => p.name === "bare")).toMatchObject({ installed: false, version: null, stale: false })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("falls back to the declared dependency when nothing is installed yet", async () => {
    const home = await makeHome()
    try {
      await writeDshProfile(home, "web", { declared: "0.15.1" })
      const [profile] = (await inspectDsh(home, CURRENT)).profiles
      expect(profile).toMatchObject({ installed: true, version: "0.15.1", source: "package.json", stale: true })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("reports a link: dependency as installed with no comparable version", async () => {
    const home = await makeHome()
    try {
      await writeDshProfile(home, "dev", { declared: "link:/Users/someone/projects/pptfast" })
      const [profile] = (await inspectDsh(home, CURRENT)).profiles
      expect(profile).toMatchObject({ installed: true, version: null, source: null, stale: false })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})

describe("runSelfTest", () => {
  it("renders the built-in deck through the real pipeline and times it", async () => {
    const result = await runSelfTest()
    expect(result.ok).toBe(true)
    expect(result.slides).toBe(2)
    expect(result.bytes).toBeGreaterThan(0)
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(result.error).toBeUndefined()
  })
})

describe("buildDoctorReport", () => {
  it("pins MIN_NODE to package.json's engines floor", () => {
    // vitest cwd = repo root, same convention version-sync.test.ts relies on.
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      engines: { node: string }
    }
    expect(pkg.engines.node).toBe(`>=${MIN_NODE}`)
  })

  it("checks the running Node against the floor", async () => {
    const home = await makeHome()
    try {
      const report = await buildDoctorReport({ home, env: { PATH: "" }, version: CURRENT })
      expect(report.runtime).toMatchObject({ node: process.version, minimum: MIN_NODE, meetsMinimum: true })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("turns skill drift and a missing capability into warnings, never errors", async () => {
    const home = await makeHome()
    try {
      await writeSkillCopy(home, ".claude/skills", "0.9.0")
      const report = await buildDoctorReport({ home, env: { PATH: "" }, version: CURRENT })
      expect(report.errors).toEqual([])
      const drift = report.warnings.find((w) => w.check === "skill copy")
      expect(drift?.message).toContain("0.9.0")
      expect(drift?.fix).toContain("cp -R")
      // PATH is empty, so soffice can never be found: its warning is pinned.
      const soffice = report.warnings.find((w) => w.message.startsWith("soffice"))
      expect(soffice?.message).toContain("PDF export path is unavailable")
      expect(report.capabilities.map((c) => c.name)).toEqual(["sharp", "soffice"])
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("warns about a dsh profile behind the CLI with the pinned install command", async () => {
    const home = await makeHome()
    try {
      await writeDshProfile(home, "web", { declared: "0.14.0", installed: "0.14.0" })
      const report = await buildDoctorReport({ home, env: { PATH: "" }, version: CURRENT })
      expect(report.errors).toEqual([])
      const warning = report.warnings.find((w) => w.check === "dsh plugin")
      expect(warning?.fix).toBe(`npx -y @deepseek-ai/dsh plugin --profile web add @liustack/pptfast@${CURRENT}`)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("makes a Node below the floor a hard error with an upgrade instruction", async () => {
    const home = await makeHome()
    try {
      const report = await buildDoctorReport({ home, env: { PATH: "" }, version: CURRENT, nodeVersion: "v20.11.0" })
      expect(report.runtime.meetsMinimum).toBe(false)
      const error = report.errors.find((e) => e.check === "runtime")
      expect(error?.message).toContain(MIN_NODE)
      expect(error?.fix).toContain("nodejs.org")
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})

describe("renderDoctorReport", () => {
  it("says plainly that no skill copy was found, and where it looked", async () => {
    const home = await makeHome()
    try {
      const rendered = renderDoctorReport(await buildDoctorReport({ home, env: { PATH: "" }, version: CURRENT }))
      expect(rendered).toContain("no installed skill copy found")
      expect(rendered).toContain(".claude")
      expect(rendered).toContain("not a dsh machine")
      expect(rendered).toContain("Self-test render")
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("names each copy's path, its pin, and the fix for a stale one", async () => {
    const home = await makeHome()
    try {
      const copyDir = await writeSkillCopy(home, ".codex/skills", "0.9.0")
      const rendered = renderDoctorReport(await buildDoctorReport({ home, env: { PATH: "" }, version: CURRENT }))
      expect(rendered).toContain(copyDir)
      expect(rendered).toContain("pins 0.9.0")
      expect(rendered).toContain("(stale)")
      expect(rendered).toContain(`git clone --depth 1 https://github.com/liustack/pptfast.git /tmp/pptfast-src && cp -R /tmp/pptfast-src/skills/pptfast/. ${copyDir}/`)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("calls a copy of unknown version exactly that", async () => {
    const home = await makeHome()
    try {
      await writeSkillCopy(home, ".agents/skills", null)
      const rendered = renderDoctorReport(await buildDoctorReport({ home, env: { PATH: "" }, version: CURRENT }))
      expect(rendered).toContain("version unknown")
      expect(rendered).toContain("no PINNED line")
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})

describe("runDoctor: exit-code policy", () => {
  it("exits 0 with warnings only — drift and missing capabilities never fail the run", async () => {
    const home = await makeHome()
    try {
      await writeSkillCopy(home, ".claude/skills", "0.9.0")
      await writeDshProfile(home, "web", { declared: "0.9.0", installed: "0.9.0" })
      const { output, hasErrors } = await runDoctor({ home, env: { PATH: "" }, version: CURRENT })
      expect(hasErrors).toBe(false)
      expect(output).toContain("nothing blocking")
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("exits non-zero on a runtime below the floor", async () => {
    const home = await makeHome()
    try {
      const { hasErrors } = await runDoctor({ home, env: { PATH: "" }, version: CURRENT, nodeVersion: "v18.20.0" })
      expect(hasErrors).toBe(true)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("emits the structured report with --json, and the rendering without it", async () => {
    const home = await makeHome()
    try {
      await writeSkillCopy(home, ".claude/skills", "0.9.0")
      const json = await runDoctor({ home, env: { PATH: "" }, version: CURRENT, json: true })
      const parsed = JSON.parse(json.output) as {
        version: string
        skills: { copies: { pinned: string; stale: boolean }[] }
        errors: unknown[]
      }
      expect(parsed.version).toBe(CURRENT)
      expect(parsed.skills.copies[0]).toMatchObject({ pinned: "0.9.0", stale: true })
      expect(parsed.errors).toEqual([])

      const human = await runDoctor({ home, env: { PATH: "" }, version: CURRENT })
      expect(human.output.startsWith("pptfast doctor")).toBe(true)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})

describe("runDoctor: workspace artifacts line", () => {
  it("reports the cwd as the anchor when there is no project config", async () => {
    const home = await makeHome()
    const cwd = await mkdtemp(join(tmpdir(), "pptfast-doctor-ws-"))
    try {
      const { output } = await runDoctor({
        home,
        env: { PATH: "" },
        version: CURRENT,
        cwd,
        json: true,
        runGit: async () => null,
      })
      const parsed = JSON.parse(output) as {
        workspace: { anchor: string; root: string; configured: boolean; ignore: string }
      }
      expect(parsed.workspace.anchor).toBe(cwd)
      expect(parsed.workspace.root).toBe(join(cwd, ".pptfast"))
      expect(parsed.workspace.configured).toBe(false)
      expect(parsed.workspace.ignore).toBe("not-a-repo")

      const human = await runDoctor({ home, env: { PATH: "" }, version: CURRENT, cwd, runGit: async () => null })
      expect(human.output).toContain("Workspace artifacts")
      expect(human.output).toContain(cwd)
      expect(human.output).toContain(join(cwd, ".pptfast"))
      expect(human.output).toContain("not a git repository")
    } finally {
      await rm(home, { recursive: true, force: true })
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it("names a configured outDir and skips the git probe", async () => {
    const home = await makeHome()
    const cwd = await mkdtemp(join(tmpdir(), "pptfast-doctor-ws-"))
    try {
      await writeFile(join(cwd, "pptfast.config.json"), JSON.stringify({ outDir: "artifacts" }))
      const json = await runDoctor({
        home,
        env: { PATH: "" },
        version: CURRENT,
        cwd,
        json: true,
        runGit: async () => {
          throw new Error("git should not run when outDir is configured")
        },
      })
      const parsed = JSON.parse(json.output) as {
        workspace: { root: string; configured: boolean; ignore: string }
      }
      expect(parsed.workspace.root).toBe(join(cwd, "artifacts"))
      expect(parsed.workspace.configured).toBe(true)
      expect(parsed.workspace.ignore).toBe("skipped")
    } finally {
      await rm(home, { recursive: true, force: true })
      await rm(cwd, { recursive: true, force: true })
    }
  })
})

describe("runDoctor: images", () => {
  it("treats missing keys as info, never errors, and never prints a key value", async () => {
    const home = await makeHome()
    try {
      const configPath = join(home, "config.json")
      await writeFile(configPath, JSON.stringify({ images: { pexels: { apiKey: "FILESECRET99" } } }))
      if (typeof process.getuid === "function") chmodSync(configPath, 0o600)
      const report = await buildDoctorReport({ home, env: { PATH: "" }, version: CURRENT })
      expect(report.errors).toEqual([])
      expect(report.warnings.some((w) => w.check === "images")).toBe(false)
      const { output, hasErrors } = await runDoctor({ home, env: { PATH: "" }, version: CURRENT })
      expect(hasErrors).toBe(false)
      expect(output).toContain("Images")
      expect(output).toContain("pexels: present (file)")
      expect(output).toContain("pixabay: missing")
      expect(output).toContain("openverse: missing")
      expect(output).not.toContain("FILESECRET99")
      expect(JSON.stringify(report.images)).not.toContain("FILESECRET99")
      expect(report.images.providers.find((p) => p.provider === "pexels")?.present).toBe(true)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it.skipIf(process.platform === "win32")("probes a fake grok on PATH as found and disabled by default, without leaking secrets", async () => {
    // Windows: findOnPath only tries PATHEXT, so an extensionless `grok` plus chmod 0755 is not a product bug.
    const home = await makeHome()
    const binDir = await mkdtemp(join(tmpdir(), "pptfast-doctor-bin-"))
    await writeFile(join(binDir, "grok"), "#!/bin/sh\nexit 0\n")
    chmodSync(join(binDir, "grok"), 0o755)
    const versionRuns: string[] = []
    try {
      const report = await buildDoctorReport({
        home,
        env: { PATH: binDir },
        version: CURRENT,
        runProcess: async (req) => {
          versionRuns.push(`${req.command} ${req.args.join(" ")}`)
          expect(req.timeoutMs).toBe(2000)
          return { code: 0, stdout: "grok 1.0.5 (5115b46bc909)\n", stderr: "" }
        },
      })
      const grok = report.generators.find((g) => g.id === "grok")
      expect(grok?.found).toBe(true)
      expect(grok?.enabled).toBe(false)
      expect(grok?.version).toBe("1.0.5")
      expect(grok?.bin).toContain("grok")
      expect(report.warnings.some((w) => w.check === "generators")).toBe(false)
      expect(report.errors).toEqual([])
      const { output, hasErrors } = await runDoctor({
        home,
        env: { PATH: binDir },
        version: CURRENT,
        json: true,
        runProcess: async () => ({ code: 0, stdout: "grok 1.0.5 (5115b46bc909)\n", stderr: "" }),
      })
      expect(hasErrors).toBe(false)
      expect(output).toContain("generators")
      expect(output).not.toContain("FILESECRET99")
      const rendered = renderDoctorReport(report)
      expect(rendered).toContain("Image generators")
      expect(rendered).toContain("disabled")
      expect(rendered).toContain("pptfast config set images.generators.grok.enabled true")
      expect(versionRuns.some((l) => l.endsWith("--version"))).toBe(true)
    } finally {
      await rm(home, { recursive: true, force: true })
      await rm(binDir, { recursive: true, force: true })
    }
  })

  it("reports Openverse present only when both clientId and clientSecret resolve", async () => {
    const home = await makeHome()
    try {
      const configPath = join(home, "config.json")
      await writeFile(
        configPath,
        JSON.stringify({ images: { openverse: { clientId: "OVCLIENTID99", clientSecret: "OVSECRETKEY99" } } }),
      )
      if (typeof process.getuid === "function") chmodSync(configPath, 0o600)
      const report = await buildDoctorReport({ home, env: { PATH: "" }, version: CURRENT })
      expect(report.images.providers.find((p) => p.provider === "openverse")?.present).toBe(true)
      expect(report.images.providers.find((p) => p.provider === "openverse")?.source).toBe("file")
      expect(report.errors).toEqual([])
      expect(report.warnings.some((w) => w.check === "images")).toBe(false)
      const { output, hasErrors } = await runDoctor({ home, env: { PATH: "" }, version: CURRENT })
      expect(hasErrors).toBe(false)
      expect(output).toContain("openverse: present (file)")
      expect(output).not.toContain("OVCLIENTID99")
      expect(output).not.toContain("OVSECRETKEY99")
      expect(JSON.stringify(report.images)).not.toContain("OVSECRETKEY99")
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it.skipIf(process.platform === "win32")("warns when the config file is group/other-readable on POSIX", async () => {
    // Windows has no POSIX permission bits, so chmod 0600 assertions are not a product bug.
    const home = await makeHome()
    try {
      const path = join(home, "config.json")
      await writeFile(path, JSON.stringify({ images: { pexels: { apiKey: "FILESECRET99" } } }), { mode: 0o644 })
      chmodSync(path, 0o644)
      const report = await buildDoctorReport({ home, env: { PATH: "" }, version: CURRENT })
      expect(report.images.groupOrOtherReadable).toBe(true)
      expect(report.errors).toEqual([])
      const rendered = renderDoctorReport(report)
      expect(rendered).toContain("group/other-readable")
      expect(rendered).not.toContain("FILESECRET99")
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})
