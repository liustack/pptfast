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
  persistUserConfigValue,
  providerNamedInFile,
  resolveImageKeys,
} from "./image-config"

const originalHome = process.env.PPTFAST_HOME
const originalPexels = process.env.PPTFAST_PEXELS_API_KEY
const originalPixabay = process.env.PPTFAST_PIXABAY_API_KEY
const originalOvId = process.env.PPTFAST_OPENVERSE_CLIENT_ID
const originalOvSecret = process.env.PPTFAST_OPENVERSE_CLIENT_SECRET

afterEach(() => {
  if (originalHome === undefined) delete process.env.PPTFAST_HOME
  else process.env.PPTFAST_HOME = originalHome
  if (originalPexels === undefined) delete process.env.PPTFAST_PEXELS_API_KEY
  else process.env.PPTFAST_PEXELS_API_KEY = originalPexels
  if (originalPixabay === undefined) delete process.env.PPTFAST_PIXABAY_API_KEY
  else process.env.PPTFAST_PIXABAY_API_KEY = originalPixabay
  if (originalOvId === undefined) delete process.env.PPTFAST_OPENVERSE_CLIENT_ID
  else process.env.PPTFAST_OPENVERSE_CLIENT_ID = originalOvId
  if (originalOvSecret === undefined) delete process.env.PPTFAST_OPENVERSE_CLIENT_SECRET
  else process.env.PPTFAST_OPENVERSE_CLIENT_SECRET = originalOvSecret
})

async function tmpHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pptfast-imgcfg-"))
  process.env.PPTFAST_HOME = dir
  delete process.env.PPTFAST_PEXELS_API_KEY
  delete process.env.PPTFAST_PIXABAY_API_KEY
  delete process.env.PPTFAST_OPENVERSE_CLIENT_ID
  delete process.env.PPTFAST_OPENVERSE_CLIENT_SECRET
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

  it("uses Openverse env vars when the file never names images.openverse", () => {
    process.env.PPTFAST_OPENVERSE_CLIENT_ID = "ENVCLIENT99"
    process.env.PPTFAST_OPENVERSE_CLIENT_SECRET = "ENVSECRET99"
    const keys = resolveImageKeys({ file: null, env: process.env })
    expect(keys.openverse.clientId).toBe("ENVCLIENT99")
    expect(keys.openverse.clientSecret).toBe("ENVSECRET99")
    expect(keys.openverse.source).toBe("env")
    expect(keys.openverse.ready).toBe(true)
  })

  it("ignores Openverse env when the file names images.openverse even as {}", () => {
    process.env.PPTFAST_OPENVERSE_CLIENT_ID = "ENVCLIENT99"
    process.env.PPTFAST_OPENVERSE_CLIENT_SECRET = "ENVSECRET99"
    const file = { images: { openverse: {} } }
    expect(providerNamedInFile(file, "openverse")).toBe(true)
    const keys = resolveImageKeys({ file, env: process.env })
    expect(keys.openverse.clientId).toBeUndefined()
    expect(keys.openverse.clientSecret).toBeUndefined()
    expect(keys.openverse.ready).toBe(false)
    expect(keys.openverse.namedInFile).toBe(true)
  })
})

describe("runConfigSet", () => {
  it.skipIf(process.platform === "win32")("writes the config file as mode 0600", async () => {
    // Windows has no POSIX permission bits, so chmod 0600 is not a product bug.
    const home = await tmpHome()
    await runConfigSet("pexels.apiKey", "TESTPEXELSKEY99")
    const { stat } = await import("node:fs/promises")
    expect((await stat(join(home, "config.json"))).mode & 0o777).toBe(0o600)
  })

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
  })

  it.skipIf(process.platform === "win32")("chmod 0600 even when overwriting a 0644 file", async () => {
    // Windows has no POSIX permission bits, so chmod 0600 is not a product bug.
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

  it("reads a hidden value when openverse.clientSecret omits the argument", async () => {
    await tmpHome()
    const message = await runConfigSet("openverse.clientSecret", undefined, {
      readSecret: async () => "PIPEOVSECRET99",
    })
    expect(message).toContain("Saved openverse.clientSecret")
    expect(message).not.toContain("PIPEOVSECRET99")
    const parsed = JSON.parse(await readFile(join(process.env.PPTFAST_HOME!, "config.json"), "utf8")) as {
      images: { openverse: { clientSecret: string } }
    }
    expect(parsed.images.openverse.clientSecret).toBe("PIPEOVSECRET99")
  })

  it("errors with needs a value when openverse.clientId omits the argument", async () => {
    await tmpHome()
    await expect(runConfigSet("openverse.clientId", undefined)).rejects.toThrow(/needs a value/)
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

  it("masks Openverse credentials and lists them after pexels/pixabay", async () => {
    await tmpHome()
    await persistUserConfigValue(["images", "openverse", "clientId"], "OVCLIENTID99")
    await persistUserConfigValue(["images", "openverse", "clientSecret"], "OVSECRETKEY99")
    const out = await runConfigShow()
    expect(out).toContain("openverse.clientId")
    expect(out).toContain("openverse.clientSecret")
    expect(out).toContain("OVCLIE...99")
    expect(out).toContain("OVSECR...99")
    expect(out).not.toContain("OVCLIENTID99")
    expect(out).not.toContain("OVSECRETKEY99")
    const idIndex = out.indexOf("openverse.clientId")
    const pexelsIndex = out.indexOf("pexels.apiKey")
    expect(pexelsIndex).toBeGreaterThanOrEqual(0)
    expect(idIndex).toBeGreaterThan(pexelsIndex)
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

describe("generator config keys", () => {
  it("writes images.generators.grok.enabled as a JSON boolean, show prints true unmasked, file 0600", async () => {
    const home = await tmpHome()
    const message = await runConfigSet("images.generators.grok.enabled", "true")
    expect(message).toContain("Saved images.generators.grok.enabled")
    const path = join(home, "config.json")
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      images: { generators: { grok: { enabled: boolean } } }
    }
    expect(parsed.images.generators.grok.enabled).toBe(true)
    expect(typeof parsed.images.generators.grok.enabled).toBe("boolean")
    const out = await runConfigShow()
    expect(out).toContain("images.generators.grok.enabled  true")
    expect(out).not.toContain("****")
  })

  it("stores order as a string array and rejects unknown names", async () => {
    const home = await tmpHome()
    await runConfigSet("images.generators.order", "codex,grok")
    const parsed = JSON.parse(await readFile(join(home, "config.json"), "utf8")) as {
      images: { generators: { order: string[] } }
    }
    expect(parsed.images.generators.order).toEqual(["codex", "grok"])
    const out = await runConfigShow()
    expect(out).toContain("images.generators.order  codex,grok")
    await expect(runConfigSet("images.generators.order", "codex,nope")).rejects.toThrow(/unknown/)
  })

  it("stores timeoutMs as a positive integer", async () => {
    const home = await tmpHome()
    await runConfigSet("images.generators.timeoutMs", "120000")
    const parsed = JSON.parse(await readFile(join(home, "config.json"), "utf8")) as {
      images: { generators: { timeoutMs: number } }
    }
    expect(parsed.images.generators.timeoutMs).toBe(120000)
    await expect(runConfigSet("images.generators.timeoutMs", "0")).rejects.toThrow(/positive/)
  })
})

describe("persistUserConfigValue", () => {
  it("writes a nested Openverse clientId and clears it with an empty string", async () => {
    const home = await tmpHome()
    await persistUserConfigValue(["images", "openverse", "clientId"], "OVCLIENTID99")
    const path = join(home, "config.json")
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      images: { openverse: { clientId?: string } }
    }
    expect(parsed.images.openverse.clientId).toBe("OVCLIENTID99")
    await persistUserConfigValue(["images", "openverse", "clientId"], "")
    const cleared = JSON.parse(await readFile(path, "utf8")) as {
      images: { openverse: { clientId?: string } }
    }
    expect(cleared.images.openverse.clientId).toBeUndefined()
  })
})
