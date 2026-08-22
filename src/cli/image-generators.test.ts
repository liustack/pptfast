// @vitest-environment node
import { chmodSync } from "node:fs"
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { persistUserConfigValue } from "./image-config"
import { runImagesGenerate, runImagesList, type ProcessRun, type ProcessRunner } from "./images"
import { pathExists } from "./deck-dir"

const originalHome = process.env.PPTFAST_HOME
const originalPath = process.env.PATH
const originalPexels = process.env.PPTFAST_PEXELS_API_KEY
const originalPixabay = process.env.PPTFAST_PIXABAY_API_KEY
const originalOvId = process.env.PPTFAST_OPENVERSE_CLIENT_ID
const originalOvSecret = process.env.PPTFAST_OPENVERSE_CLIENT_SECRET

afterEach(() => {
  if (originalHome === undefined) delete process.env.PPTFAST_HOME
  else process.env.PPTFAST_HOME = originalHome
  if (originalPath === undefined) delete process.env.PATH
  else process.env.PATH = originalPath
  if (originalPexels === undefined) delete process.env.PPTFAST_PEXELS_API_KEY
  else process.env.PPTFAST_PEXELS_API_KEY = originalPexels
  if (originalPixabay === undefined) delete process.env.PPTFAST_PIXABAY_API_KEY
  else process.env.PPTFAST_PIXABAY_API_KEY = originalPixabay
  if (originalOvId === undefined) delete process.env.PPTFAST_OPENVERSE_CLIENT_ID
  else process.env.PPTFAST_OPENVERSE_CLIENT_ID = originalOvId
  if (originalOvSecret === undefined) delete process.env.PPTFAST_OPENVERSE_CLIENT_SECRET
  else process.env.PPTFAST_OPENVERSE_CLIENT_SECRET = originalOvSecret
})

const JPEG_TINY = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

async function tmpHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pptfast-gen-home-"))
  process.env.PPTFAST_HOME = dir
  delete process.env.PPTFAST_PEXELS_API_KEY
  delete process.env.PPTFAST_PIXABAY_API_KEY
  delete process.env.PPTFAST_OPENVERSE_CLIENT_ID
  delete process.env.PPTFAST_OPENVERSE_CLIENT_SECRET
  return dir
}

async function fakeBin(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pptfast-gen-bin-"))
  const bin = join(dir, name)
  await writeFile(bin, "#!/bin/sh\nexit 0\n")
  chmodSync(bin, 0o755)
  process.env.PATH = dir
  return dir
}

function writesDest(runs: ProcessRun[]): ProcessRunner {
  return async (req) => {
    runs.push(req)
    if (req.args.includes("--version")) {
      return { code: 0, stdout: "grok 1.0.5 (5115b46bc909)\n", stderr: "" }
    }
    await writeFile(join(req.cwd ?? "", "generated.jpg"), JPEG_TINY)
    return { code: 0, stdout: "DONE\n", stderr: "" }
  }
}

describe("runImagesGenerate", () => {
  it("errors when none are enabled, lists found-but-disabled enable commands, and does not spawn", async () => {
    await tmpHome()
    await fakeBin("grok")
    const cwd = await mkdtemp(join(tmpdir(), "pptfast-gen-deck-"))
    const runs: ProcessRun[] = []
    await expect(
      runImagesGenerate({
        deck: join(cwd, "demo-deck"),
        as: "hero",
        cwd,
        prompt: "an office desk",
        run: async (req) => {
          runs.push(req)
          return { code: 0, stdout: "", stderr: "" }
        },
      }),
    ).rejects.toSatisfy((e: unknown) => {
      const message = (e as Error).message
      expect(message).toContain("pptfast config set images.generators.grok.enabled true")
      expect(message).toMatch(/disabled|enabled/i)
      return true
    })
    expect(runs).toEqual([])
  })

  it("pins a grok mock JPEG with a user-generated sidecar and no leftover temp", async () => {
    await tmpHome()
    await persistUserConfigValue(["images", "generators", "grok", "enabled"], true)
    await fakeBin("grok")
    const cwd = await mkdtemp(join(tmpdir(), "pptfast-gen-ok-"))
    const runs: ProcessRun[] = []
    const out = await runImagesGenerate({
      deck: join(cwd, "demo-deck"),
      as: "hero",
      cwd,
      prompt: "an office desk at dusk",
      run: writesDest(runs),
      resizeToJpeg: async (bytes) => bytes,
      now: () => new Date("2026-08-22T00:00:00.000Z"),
    })
    expect(out).toContain("pinned")
    expect(out).toContain("hero")
    const assets = join(cwd, ".pptfast", "demo-deck", "assets")
    expect(await readFile(join(assets, "hero.jpg"))).toEqual(JPEG_TINY)
    const sidecar = JSON.parse(await readFile(join(assets, "hero.json"), "utf8")) as Record<string, unknown>
    expect(sidecar.provider).toBe("grok")
    expect(sidecar.license).toBe("user-generated")
    expect(sidecar.prompt).toBe("an office desk at dusk")
    expect(sidecar.generated_at).toBe("2026-08-22T00:00:00.000Z")
    expect(sidecar).not.toHaveProperty("photo_id")
    const names = await readdir(assets)
    expect(names.sort()).toEqual(["hero.jpg", "hero.json"])
    expect(runs.some((r) => r.args.includes("-p") && r.args.includes("--permission-mode"))).toBe(true)
    const list = await runImagesList({ deck: join(cwd, "demo-deck"), cwd })
    expect(list).toContain("hero")
    expect(list).toContain("grok")
    expect(list).toContain("user-generated")
  })

  it("falls through to codex when grok fails", async () => {
    await tmpHome()
    await persistUserConfigValue(["images", "generators", "grok", "enabled"], true)
    await persistUserConfigValue(["images", "generators", "codex", "enabled"], true)
    const grokDir = await mkdtemp(join(tmpdir(), "pptfast-bin-grok-"))
    await writeFile(join(grokDir, "grok"), "#!/bin/sh\nexit 0\n")
    chmodSync(join(grokDir, "grok"), 0o755)
    const codexDir = await mkdtemp(join(tmpdir(), "pptfast-bin-codex-"))
    await writeFile(join(codexDir, "codex"), "#!/bin/sh\nexit 0\n")
    chmodSync(join(codexDir, "codex"), 0o755)
    process.env.PATH = `${grokDir}:${codexDir}`
    const cwd = await mkdtemp(join(tmpdir(), "pptfast-gen-fb-"))
    const out = await runImagesGenerate({
      deck: join(cwd, "demo-deck"),
      as: "hero",
      cwd,
      prompt: "a wind farm",
      run: async (req) => {
        if (req.command.endsWith("grok") && !req.args.includes("--version")) {
          return { code: 1, stdout: "", stderr: "grok boom" }
        }
        if (req.command.endsWith("codex") && !req.args.includes("--version")) {
          await writeFile(join(req.cwd ?? "", "generated.jpg"), JPEG_TINY)
          return { code: 0, stdout: "DONE\n", stderr: "" }
        }
        return { code: 0, stdout: "ok\n", stderr: "" }
      },
      resizeToJpeg: async (bytes) => bytes,
      now: () => new Date("2026-08-22T00:00:00.000Z"),
    })
    expect(out).toContain("hero")
    const sidecar = JSON.parse(
      await readFile(join(cwd, ".pptfast", "demo-deck", "assets", "hero.json"), "utf8"),
    ) as Record<string, unknown>
    expect(sidecar.provider).toBe("codex")
    expect(sidecar.license).toBe("user-generated")
  })

  it("names each failed attempt and leaves no workspace jpg", async () => {
    await tmpHome()
    await persistUserConfigValue(["images", "generators", "grok", "enabled"], true)
    await persistUserConfigValue(["images", "generators", "codex", "enabled"], true)
    await persistUserConfigValue(["images", "generators", "antigravity", "enabled"], true)
    const grokDir = await mkdtemp(join(tmpdir(), "pptfast-bin-all-"))
    for (const name of ["grok", "codex", "agy"]) {
      await writeFile(join(grokDir, name), "#!/bin/sh\nexit 0\n")
      chmodSync(join(grokDir, name), 0o755)
    }
    process.env.PATH = grokDir
    const cwd = await mkdtemp(join(tmpdir(), "pptfast-gen-fail-"))
    await expect(
      runImagesGenerate({
        deck: join(cwd, "demo-deck"),
        as: "hero",
        cwd,
        prompt: "a desk",
        run: async (req) => {
          if (req.args.includes("--version")) return { code: 0, stdout: "1.0.0\n", stderr: "" }
          return { code: 1, stdout: "", stderr: `${req.command} failed` }
        },
        resizeToJpeg: async (bytes) => bytes,
      }),
    ).rejects.toSatisfy((e: unknown) => {
      const message = (e as Error).message
      expect(message).toContain("grok")
      expect(message).toContain("codex")
      expect(message).toContain("antigravity")
      return true
    })
    expect(await pathExists(join(cwd, ".pptfast", "demo-deck", "assets", "hero.jpg"))).toBe(false)
  })

  it("does not delete a pre-existing pin when every generator fails", async () => {
    await tmpHome()
    await persistUserConfigValue(["images", "generators", "grok", "enabled"], true)
    await fakeBin("grok")
    const cwd = await mkdtemp(join(tmpdir(), "pptfast-gen-keep-"))
    const assets = join(cwd, ".pptfast", "demo-deck", "assets")
    await mkdir(assets, { recursive: true })
    await writeFile(join(assets, "hero.jpg"), JPEG_TINY)
    await writeFile(
      join(assets, "hero.json"),
      `${JSON.stringify({
        provider: "pexels",
        photo_id: "123",
        license: "Pexels License",
        author: "Jane",
        page_url: "https://www.pexels.com/photo/office-desk-123/",
      })}\n`,
    )
    await expect(
      runImagesGenerate({
        deck: join(cwd, "demo-deck"),
        as: "hero",
        cwd,
        prompt: "a desk",
        run: async (req) => {
          if (req.args.includes("--version")) return { code: 0, stdout: "1.0.0\n", stderr: "" }
          return { code: 1, stdout: "", stderr: "grok failed" }
        },
        resizeToJpeg: async (bytes) => bytes,
      }),
    ).rejects.toThrow(/All image generators failed/)
    expect(await readFile(join(assets, "hero.jpg"))).toEqual(JPEG_TINY)
    const sidecar = JSON.parse(await readFile(join(assets, "hero.json"), "utf8")) as { provider: string; photo_id: string }
    expect(sidecar.provider).toBe("pexels")
    expect(sidecar.photo_id).toBe("123")
  })

  it("uses the injected resolvePrompt when --prompt is omitted", async () => {
    await tmpHome()
    await persistUserConfigValue(["images", "generators", "grok", "enabled"], true)
    await fakeBin("grok")
    const cwd = await mkdtemp(join(tmpdir(), "pptfast-gen-brief-"))
    const out = await runImagesGenerate({
      deck: join(cwd, "demo-deck"),
      as: "hero",
      cwd,
      run: writesDest([]),
      resolvePrompt: async () => "brief prompt from asset-brief",
      resizeToJpeg: async (bytes) => bytes,
      now: () => new Date("2026-08-22T00:00:00.000Z"),
    })
    expect(out).toContain("hero")
    const sidecar = JSON.parse(
      await readFile(join(cwd, ".pptfast", "demo-deck", "assets", "hero.json"), "utf8"),
    ) as { prompt: string }
    expect(sidecar.prompt).toBe("brief prompt from asset-brief")
  })

  it("asks for --prompt when the resolver returns undefined", async () => {
    await tmpHome()
    await persistUserConfigValue(["images", "generators", "grok", "enabled"], true)
    await fakeBin("grok")
    const cwd = await mkdtemp(join(tmpdir(), "pptfast-gen-noprompt-"))
    await expect(
      runImagesGenerate({
        deck: join(cwd, "demo-deck"),
        as: "hero",
        cwd,
        resolvePrompt: async () => undefined,
        run: async () => {
          throw new Error("must not spawn")
        },
      }),
    ).rejects.toThrow(/--prompt/)
  })
})
