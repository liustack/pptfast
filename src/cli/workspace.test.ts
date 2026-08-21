// @vitest-environment node
import { execFile as execFileCb } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import { PptfastError } from "../errors"
import {
  RENDERED_SVG_PATTERN,
  WORKSPACE_DIRNAME,
  WORKSPACE_IGNORE_ENTRY,
  deckSlug,
  ensureGitIgnored,
  inspectWorkspace,
  prepareWorkspaceDir,
  pruneRenderedSvgs,
  resolveWorkspaceLocation,
  type GitRunner,
  type WorkspaceLocation,
} from "./workspace"

const execFile = promisify(execFileCb)

function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "pptfast-ws-"))
}

const dirs: string[] = []
async function trackedTmp(): Promise<string> {
  const dir = await tmp()
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

function scriptedGit(handlers: {
  checkIgnore?: Awaited<ReturnType<GitRunner>>
  commonDir?: Awaited<ReturnType<GitRunner>>
}): GitRunner {
  return async (args) => {
    if (args[0] === "check-ignore") {
      return handlers.checkIgnore !== undefined ? handlers.checkIgnore : { code: 1, stdout: "" }
    }
    if (args[0] === "rev-parse" && args.includes("--git-common-dir")) {
      return handlers.commonDir !== undefined ? handlers.commonDir : { code: 0, stdout: ".git\n" }
    }
    throw new Error(`unexpected git ${args.join(" ")}`)
  }
}

function location(partial: Partial<WorkspaceLocation> & Pick<WorkspaceLocation, "anchor" | "root" | "dir">): WorkspaceLocation {
  return {
    slug: "deck",
    configured: false,
    ...partial,
  }
}

describe("deckSlug", () => {
  it("uses the directory name for a deck project", () => {
    expect(deckSlug("/tmp/launch-deck", true)).toBe("launch-deck")
  })

  it("strips the last extension from a single IR file", () => {
    expect(deckSlug("/tmp/q3-review.json", false)).toBe("q3-review")
  })

  it("falls back to 'deck' for a CJK-only name that slugify would empty", () => {
    expect(deckSlug("/tmp/季度回顾", true)).toBe("deck")
  })

  it("hyphenates mixed names the same way brand extract does", () => {
    expect(deckSlug("/tmp/Acme Corp", true)).toBe("acme-corp")
  })
})

describe("resolveWorkspaceLocation (anchor rules)", () => {
  it("anchors at cwd when there is no project config", () => {
    const loc = resolveWorkspaceLocation({
      cwd: "/tmp/bare",
      target: "/tmp/bare/hello.json",
      isDir: false,
    })
    expect(loc.anchor).toBe("/tmp/bare")
    expect(loc.root).toBe("/tmp/bare/.pptfast")
    expect(loc.dir).toBe("/tmp/bare/.pptfast/hello")
    expect(loc.slug).toBe("hello")
    expect(loc.configured).toBe(false)
  })

  it("anchors at the project config's directory, even when cwd is nested", () => {
    const loc = resolveWorkspaceLocation({
      cwd: "/tmp/proj/nested",
      projectConfigPath: "/tmp/proj/pptfast.config.json",
      target: "/tmp/proj/nested/hello.json",
      isDir: false,
    })
    expect(loc.anchor).toBe("/tmp/proj")
    expect(loc.root).toBe("/tmp/proj/.pptfast")
    expect(loc.dir).toBe("/tmp/proj/.pptfast/hello")
  })

  it("resolves a relative outDir against the config file's directory, not cwd", () => {
    const loc = resolveWorkspaceLocation({
      cwd: "/tmp/proj/nested",
      projectConfigPath: "/tmp/proj/pptfast.config.json",
      outDir: "artifacts",
      target: "/tmp/proj/team-deck",
      isDir: true,
    })
    expect(loc.root).toBe("/tmp/proj/artifacts")
    expect(loc.dir).toBe("/tmp/proj/artifacts/team-deck")
    expect(loc.configured).toBe(true)
  })

  it("passes an absolute outDir through", () => {
    const loc = resolveWorkspaceLocation({
      cwd: "/tmp/proj",
      projectConfigPath: "/tmp/proj/pptfast.config.json",
      outDir: "/var/out",
      target: "/tmp/proj/hello.json",
      isDir: false,
    })
    expect(loc.root).toBe("/var/out")
    expect(loc.configured).toBe(true)
  })
})

describe("RENDERED_SVG_PATTERN", () => {
  it("matches the names runPreview writes and nothing else", () => {
    expect(RENDERED_SVG_PATTERN.test("001-cover.svg")).toBe(true)
    expect(RENDERED_SVG_PATTERN.test("012-content.svg")).toBe(true)
    expect(RENDERED_SVG_PATTERN.test("notes.txt")).toBe(false)
    expect(RENDERED_SVG_PATTERN.test("preview.html")).toBe(false)
    expect(RENDERED_SVG_PATTERN.test("logo.svg")).toBe(false)
    expect(RENDERED_SVG_PATTERN.test("001-Cover.svg")).toBe(false)
  })
})

describe("pruneRenderedSvgs", () => {
  it("deletes matching SVGs and leaves everything else", async () => {
    const dir = await trackedTmp()
    await writeFile(join(dir, "001-cover.svg"), "<svg/>")
    await writeFile(join(dir, "006-content.svg"), "<svg/>")
    await writeFile(join(dir, "notes.txt"), "keep")
    await writeFile(join(dir, "logo.svg"), "<svg/>")
    expect(await pruneRenderedSvgs(dir)).toBe(2)
    expect((await readdir(dir)).sort()).toEqual(["logo.svg", "notes.txt"])
  })

  it("returns 0 for a missing directory", async () => {
    expect(await pruneRenderedSvgs(join(await trackedTmp(), "nope"))).toBe(0)
  })

  it("leaves workspace stock assets (jpg + sidecar) in place", async () => {
    const dir = await trackedTmp()
    await mkdir(join(dir, "assets"), { recursive: true })
    await writeFile(join(dir, "001-cover.svg"), "<svg/>")
    await writeFile(join(dir, "assets", "foo.jpg"), "jpeg-bytes")
    await writeFile(join(dir, "assets", "foo.json"), "{}")
    expect(await pruneRenderedSvgs(dir)).toBe(1)
    expect((await readdir(join(dir, "assets"))).sort()).toEqual(["foo.jpg", "foo.json"])
  })
})

describe("ensureGitIgnored (the four holes)", () => {
  it("exit 128 (not a repository): does nothing, no exclude file appears", async () => {
    const dir = await trackedTmp()
    const outcome = await ensureGitIgnored(dir, WORKSPACE_IGNORE_ENTRY)
    expect(outcome).toEqual({ kind: "no-repo" })
    await expect(stat(join(dir, ".git"))).rejects.toThrow()
  })

  it("no git binary (spawn failure): same as not a repository", async () => {
    const dir = await trackedTmp()
    const outcome = await ensureGitIgnored(dir, WORKSPACE_IGNORE_ENTRY, async () => null)
    expect(outcome).toEqual({ kind: "no-repo" })
  })

  it("exit 0 (already ignored): does not touch the exclude file", async () => {
    const dir = await trackedTmp()
    const runGit: GitRunner = async (args) => {
      if (args[0] === "check-ignore") return { code: 0, stdout: "" }
      throw new Error(`should not spawn ${args.join(" ")} after a hit`)
    }
    const outcome = await ensureGitIgnored(dir, WORKSPACE_IGNORE_ENTRY, runGit)
    expect(outcome).toEqual({ kind: "already-ignored" })
  })

  it("exit 1 then append: writes .pptfast/ via git-common-dir, never .gitignore", async () => {
    const repo = await trackedTmp()
    await execFile("git", ["init", "-q"], { cwd: repo })
    await writeFile(join(repo, ".gitignore"), "# shared\n")
    const outcome = await ensureGitIgnored(repo, WORKSPACE_IGNORE_ENTRY)
    expect(outcome.kind).toBe("appended")
    if (outcome.kind !== "appended") return
    expect(outcome.path).toContain(join(".git", "info", "exclude"))
    const exclude = await readFile(outcome.path, "utf8")
    expect(exclude).toMatch(/(^|\n)\.pptfast\/\n/)
    expect(await readFile(join(repo, ".gitignore"), "utf8")).toBe("# shared\n")
    const again = await ensureGitIgnored(repo, WORKSPACE_IGNORE_ENTRY)
    expect(again).toEqual({ kind: "already-ignored" })
    expect((await readFile(outcome.path, "utf8")).match(/^\.pptfast\/$/gm)).toHaveLength(1)
  })

  it("worktree shape: writes to whatever --git-common-dir returns, not dir/.git", async () => {
    const dir = await trackedTmp()
    const common = await trackedTmp()
    const outcome = await ensureGitIgnored(
      dir,
      WORKSPACE_IGNORE_ENTRY,
      scriptedGit({
        checkIgnore: { code: 1, stdout: "" },
        commonDir: { code: 0, stdout: `${common}\n` },
      }),
    )
    expect(outcome).toEqual({ kind: "appended", path: join(common, "info", "exclude") })
    expect(await readFile(join(common, "info", "exclude"), "utf8")).toBe(`${WORKSPACE_IGNORE_ENTRY}\n`)
    await expect(stat(join(dir, ".git"))).rejects.toThrow()
  })

  it("read-only .git / append failure: degrades to failed, does not throw", async () => {
    const repo = await trackedTmp()
    await execFile("git", ["init", "-q"], { cwd: repo })
    // git init already created info/exclude. Writing an existing file needs
    // the file itself to be unwritable. chmod on `.git` is not enough: the
    // nested `info/` directory keeps its own mode.
    const excludeFile = join(repo, ".git", "info", "exclude")
    await chmod(excludeFile, 0o444)
    try {
      const outcome = await ensureGitIgnored(repo, WORKSPACE_IGNORE_ENTRY)
      expect(outcome.kind).toBe("failed")
      if (outcome.kind !== "failed") return
      expect(outcome.reason.length).toBeGreaterThan(0)
    } finally {
      await chmod(excludeFile, 0o644)
    }
  })

  it("append failure via a non-directory common-dir: same failed kind, still no throw", async () => {
    const dir = await trackedTmp()
    const common = await trackedTmp()
    await writeFile(join(common, "info"), "i am a file, not a directory")
    const outcome = await ensureGitIgnored(
      dir,
      WORKSPACE_IGNORE_ENTRY,
      scriptedGit({
        checkIgnore: { code: 1, stdout: "" },
        commonDir: { code: 0, stdout: `${common}\n` },
      }),
    )
    expect(outcome.kind).toBe("failed")
    if (outcome.kind !== "failed") return
    expect(outcome.path).toBe(join(common, "info", "exclude"))
  })
})

describe("prepareWorkspaceDir", () => {
  it("creates the deck subdirectory and, on first create, asks git to ignore the root", async () => {
    const cwd = await trackedTmp()
    const loc = location({
      anchor: cwd,
      root: join(cwd, WORKSPACE_DIRNAME),
      dir: join(cwd, WORKSPACE_DIRNAME, "hello"),
      slug: "hello",
    })
    const notes = await prepareWorkspaceDir(loc, {
      runGit: scriptedGit({
        checkIgnore: { code: 1, stdout: "" },
        commonDir: { code: 0, stdout: join(cwd, "git-common") + "\n" },
      }),
    })
    await expect(stat(loc.dir)).resolves.toBeDefined()
    expect(notes[0]).toMatch(/note: added \.pptfast\//)
    expect(await readFile(join(cwd, "git-common", "info", "exclude"), "utf8")).toContain(WORKSPACE_IGNORE_ENTRY)
  })

  it("skips the ignore step when the artifact root already exists", async () => {
    const cwd = await trackedTmp()
    const loc = location({
      anchor: cwd,
      root: join(cwd, WORKSPACE_DIRNAME),
      dir: join(cwd, WORKSPACE_DIRNAME, "hello"),
    })
    await mkdir(loc.root, { recursive: true })
    const notes = await prepareWorkspaceDir(loc, {
      runGit: async () => {
        throw new Error("git should not run when the root already exists")
      },
    })
    expect(notes).toEqual([])
  })

  it("skips the ignore step when outDir was configured, even on first create", async () => {
    const cwd = await trackedTmp()
    const loc = location({
      anchor: cwd,
      root: join(cwd, "artifacts"),
      dir: join(cwd, "artifacts", "hello"),
      configured: true,
    })
    const notes = await prepareWorkspaceDir(loc, {
      runGit: async () => {
        throw new Error("git should not run when outDir is configured")
      },
    })
    expect(notes).toEqual([])
    await expect(stat(loc.dir)).resolves.toBeDefined()
  })

  it("skips the ignore step when --no-git-ignore was passed", async () => {
    const cwd = await trackedTmp()
    const loc = location({
      anchor: cwd,
      root: join(cwd, WORKSPACE_DIRNAME),
      dir: join(cwd, WORKSPACE_DIRNAME, "hello"),
    })
    const notes = await prepareWorkspaceDir(loc, {
      gitIgnore: false,
      runGit: async () => {
        throw new Error("git should not run under --no-git-ignore")
      },
    })
    expect(notes).toEqual([])
  })

  it("turns a read-only workspace into a PptfastError that names the three ways out", async () => {
    const cwd = await trackedTmp()
    await chmod(cwd, 0o555)
    const loc = location({
      anchor: cwd,
      root: join(cwd, WORKSPACE_DIRNAME),
      dir: join(cwd, WORKSPACE_DIRNAME, "hello"),
    })
    try {
      await expect(prepareWorkspaceDir(loc)).rejects.toThrow(PptfastError)
      await expect(prepareWorkspaceDir(loc)).rejects.toThrow(/pass -o <path>/)
      await expect(prepareWorkspaceDir(loc)).rejects.toThrow(/outDir/)
    } finally {
      await chmod(cwd, 0o755)
    }
  })
})

describe("inspectWorkspace", () => {
  it("reports cwd as the anchor when there is no project config, and not-a-repo outside git", async () => {
    const cwd = await trackedTmp()
    const report = await inspectWorkspace({ cwd })
    expect(report.anchor).toBe(cwd)
    expect(report.root).toBe(join(cwd, WORKSPACE_DIRNAME))
    expect(report.configured).toBe(false)
    expect(report.ignore).toBe("not-a-repo")
  })

  it("skips the git probe when outDir is configured", async () => {
    const cwd = await trackedTmp()
    const report = await inspectWorkspace({
      cwd,
      projectConfigPath: join(cwd, "pptfast.config.json"),
      outDir: "out",
      runGit: async () => {
        throw new Error("git should not run when outDir is configured")
      },
    })
    expect(report.configured).toBe(true)
    expect(report.root).toBe(join(cwd, "out"))
    expect(report.ignore).toBe("skipped")
  })
})
