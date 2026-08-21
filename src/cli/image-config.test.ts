// @vitest-environment node
import { chmodSync } from "node:fs"
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { runConfigSet, runConfigShow } from "./config-cmd"
import {
  maskKey,
  persistImageApiKey,
  providerNamedInFile,
  resolveImageKeys,
} from "./image-config"

const originalHome = process.env.PPTFAST_HOME
const originalPexels = process.env.PPTFAST_PEXELS_API_KEY
const originalPixabay = process.env.PPTFAST_PIXABAY_API_KEY

afterEach(() => {
  if (originalHome === undefined) delete process.env.PPTFAST_HOME
  else process.env.PPTFAST_HOME = originalHome
  if (originalPexels === undefined) delete process.env.PPTFAST_PEXELS_API_KEY
  else process.env.PPTFAST_PEXELS_API_KEY = originalPexels
  if (originalPixabay === undefined) delete process.env.PPTFAST_PIXABAY_API_KEY
  else process.env.PPTFAST_PIXABAY_API_KEY = originalPixabay
})

async function tmpHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pptfast-imgcfg-"))
  process.env.PPTFAST_HOME = dir
  delete process.env.PPTFAST_PEXELS_API_KEY
  delete process.env.PPTFAST_PIXABAY_API_KEY
  return dir
}

describe("maskKey", () => {
  it("masks keys of length 8 or less as ****", () => {
    expect(maskKey("abcd")).toBe("****")
    expect(maskKey("12345678")).toBe("****")
  })

  it("masks longer keys as first 6 + ... + last 2", () => {
    expect(maskKey("TESTPEXELSKEY99")).toBe("TESTPE...99")
  })
})

describe("resolveImageKeys whole-source", () => {
  it("uses the env var when the file never names the provider", () => {
    process.env.PPTFAST_PEXELS_API_KEY = "ENVPEXELS99"
    const keys = resolveImageKeys({ file: null, env: process.env })
    expect(keys.pexels.apiKey).toBe("ENVPEXELS99")
    expect(keys.pexels.source).toBe("env")
    expect(keys.pexels.namedInFile).toBe(false)
  })

  it("ignores the env var when the file names images.pexels even as {}", () => {
    process.env.PPTFAST_PEXELS_API_KEY = "ENVPEXELS99"
    const file = { images: { pexels: {} } }
    expect(providerNamedInFile(file, "pexels")).toBe(true)
    const keys = resolveImageKeys({ file, env: process.env })
    expect(keys.pexels.apiKey).toBeUndefined()
    expect(keys.pexels.source).toBeNull()
    expect(keys.pexels.namedInFile).toBe(true)
  })

  it("uses the file key and ignores env when both are set", () => {
    process.env.PPTFAST_PEXELS_API_KEY = "ENVPEXELS99"
    const file = { images: { pexels: { apiKey: "FILEPEXELS99" } } }
    const keys = resolveImageKeys({ file, env: process.env })
    expect(keys.pexels.apiKey).toBe("FILEPEXELS99")
    expect(keys.pexels.source).toBe("file")
  })
})

describe("runConfigSet", () => {
  it("writes pexels.apiKey nested under images, mode 0600, and never echoes the value", async () => {
    const home = await tmpHome()
    const message = await runConfigSet("pexels.apiKey", "TESTPEXELSKEY99")
    const path = join(home, "config.json")
    expect(message).toBe(`Saved pexels.apiKey to ${path}`)
    expect(message).not.toContain("TESTPEXELSKEY99")
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      images: { pexels: { apiKey: string } }
    }
    expect(parsed.images.pexels.apiKey).toBe("TESTPEXELSKEY99")
    if (process.platform !== "win32") {
      const { stat } = await import("node:fs/promises")
      expect((await stat(path)).mode & 0o777).toBe(0o600)
    }
  })

  it("chmod 0600 even when overwriting a 0644 file", async () => {
    if (process.platform === "win32") return
    const home = await tmpHome()
    const path = join(home, "config.json")
    await writeFile(path, JSON.stringify({ theme: "consulting" }), { mode: 0o644 })
    chmodSync(path, 0o644)
    await runConfigSet("pexels.apiKey", "TESTPEXELSKEY99")
    const { stat } = await import("node:fs/promises")
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    const parsed = JSON.parse(await readFile(path, "utf8")) as { theme: string; images: { pexels: { apiKey: string } } }
    expect(parsed.theme).toBe("consulting")
    expect(parsed.images.pexels.apiKey).toBe("TESTPEXELSKEY99")
  })

  it("refuses to write when the config path is a symlink", async () => {
    const home = await tmpHome()
    const target = join(home, "elsewhere.json")
    await writeFile(target, "{}\n")
    const path = join(home, "config.json")
    try {
      await symlink(target, path)
    } catch {
      return
    }
    await expect(runConfigSet("pexels.apiKey", "TESTPEXELSKEY99")).rejects.toThrow(/symlink/)
  })

  it("refuses constructor.apiKey and __proto__.apiKey", async () => {
    await tmpHome()
    await expect(runConfigSet("constructor.apiKey", "TESTPEXELSKEY99")).rejects.toThrow(/constructor/)
    await expect(runConfigSet("__proto__.apiKey", "TESTPEXELSKEY99")).rejects.toThrow(/__proto__/)
  })

  it("errors with needs a value when a non-apiKey is missing its value", async () => {
    await tmpHome()
    await expect(runConfigSet("pexels.model", undefined)).rejects.toThrow(/needs a value/)
  })

  it("reads a hidden/non-TTY value when the argument is omitted", async () => {
    await tmpHome()
    const message = await runConfigSet("pexels.apiKey", undefined, {
      readSecret: async () => "PIPEPEXELS99",
    })
    expect(message).toContain("Saved pexels.apiKey")
    expect(message).not.toContain("PIPEPEXELS99")
    const parsed = JSON.parse(await readFile(join(process.env.PPTFAST_HOME!, "config.json"), "utf8")) as {
      images: { pexels: { apiKey: string } }
    }
    expect(parsed.images.pexels.apiKey).toBe("PIPEPEXELS99")
  })
})

describe("runConfigShow", () => {
  it("masks file keys and labels the source (file)", async () => {
    await tmpHome()
    await persistImageApiKey("pexels", "TESTPEXELSKEY99")
    const out = await runConfigShow()
    expect(out).toContain("TESTPE...99")
    expect(out).toContain("(file)")
    expect(out).not.toContain("TESTPEXELSKEY99")
    expect(out).toContain("pixabay.apiKey  missing")
  })

  it("masks env keys and labels the source (env)", async () => {
    await tmpHome()
    const out = await runConfigShow({ env: { PPTFAST_PIXABAY_API_KEY: "ENVPIXABAY99" } })
    expect(out).toContain("ENVPIX...99")
    expect(out).toContain("(env)")
    expect(out).not.toContain("ENVPIXABAY99")
  })
})

describe("persistImageApiKey", () => {
  it("creates the home directory when missing", async () => {
    const parent = await mkdtemp(join(tmpdir(), "pptfast-imgcfg-parent-"))
    const home = join(parent, "nested-home")
    process.env.PPTFAST_HOME = home
    await persistImageApiKey("pixabay", "TESTPIXABAY99")
    const parsed = JSON.parse(await readFile(join(home, "config.json"), "utf8")) as {
      images: { pixabay: { apiKey: string } }
    }
    expect(parsed.images.pixabay.apiKey).toBe("TESTPIXABAY99")
    await mkdir(home, { recursive: true })
  })
})
