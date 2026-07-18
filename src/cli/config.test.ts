// @vitest-environment node
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { __resetRegisteredThemes, registerTheme } from "../themes/definitions"
import { findConfig, findUserConfig } from "./config"

function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "pptfast-config-"))
}

describe("findConfig", () => {
  afterEach(() => {
    __resetRegisteredThemes()
  })

  it("returns null when no config exists up the tree", async () => {
    expect(await findConfig(await tmp())).toBeNull()
  })

  it("finds pptfast.config.json in a parent directory", async () => {
    const root = await tmp()
    await writeFile(join(root, "pptfast.config.json"), JSON.stringify({ theme: "tech" }))
    const nested = join(root, "a", "b")
    await mkdir(nested, { recursive: true })
    const hit = await findConfig(nested)
    expect(hit?.path).toBe(join(root, "pptfast.config.json"))
    expect(hit?.config.theme).toBe("tech")
  })

  it("rejects unknown keys with the config path in the message", async () => {
    const root = await tmp()
    await writeFile(join(root, "pptfast.config.json"), JSON.stringify({ them: "tech" }))
    await expect(findConfig(root)).rejects.toThrow(/pptfast\.config\.json/)
  })

  it("does not validate the theme id at read time (W5 review fix: moved to applyDeckConfig at resolution time — see commands.test.ts)", async () => {
    const root = await tmp()
    await writeFile(join(root, "pptfast.config.json"), JSON.stringify({ theme: "neon" }))
    const hit = await findConfig(root)
    expect(hit?.config.theme).toBe("neon")
  })

  it("accepts a registered theme id (W3 task 4: installed-check widened to getInstalledThemeIds)", async () => {
    registerTheme({
      id: "acme-config",
      style: {
        id: "acme-config",
        colors: {
          bg: "#FFFFFF",
          surface: "#F0F0F0",
          primary: "#112233",
          accent: "#AA00FF",
          text: "#000000",
          muted: "#888888",
          chartPalette: ["#112233", "#AA00FF"],
        },
        fonts: { heading: ["Arial"], body: ["Arial"] },
        defaultBackgrounds: {
          cover: { kind: "color", value: "#FFFFFF" },
          chapter: { kind: "color", value: "#FFFFFF" },
          content: { kind: "color", value: "#FFFFFF" },
          ending: { kind: "color", value: "#FFFFFF" },
        },
      },
      brand: {},
      tags: [],
      layouts: {
        cover: ["poster-center"],
        chapter: ["banner-chapter"],
        content: ["two-column"],
        ending: ["banner-ending"],
      },
    })
    const root = await tmp()
    await writeFile(join(root, "pptfast.config.json"), JSON.stringify({ theme: "acme-config" }))
    const hit = await findConfig(root)
    expect(hit?.config.theme).toBe("acme-config")
  })

  it("validates style with the shared schema", async () => {
    const root = await tmp()
    await writeFile(
      join(root, "pptfast.config.json"),
      JSON.stringify({ style: { colors: { primary: "blue" } } }),
    )
    await expect(findConfig(root)).rejects.toThrow(/primary/)
  })

  it("rejects a config that is not valid JSON", async () => {
    const root = await tmp()
    await writeFile(join(root, "pptfast.config.json"), "{ theme: tech }")
    await expect(findConfig(root)).rejects.toThrow(/not valid JSON/)
  })

  it("reads decksDir from a project pptfast.config.json (W5 task 6, controller addition A)", async () => {
    const root = await tmp()
    await writeFile(join(root, "pptfast.config.json"), JSON.stringify({ decksDir: "./team-decks" }))
    const hit = await findConfig(root)
    expect(hit?.config.decksDir).toBe("./team-decks")
  })

  it("accepts a project config with only decksDir set (theme/style both optional)", async () => {
    const root = await tmp()
    await writeFile(join(root, "pptfast.config.json"), JSON.stringify({ decksDir: "/team/decks" }))
    const hit = await findConfig(root)
    expect(hit?.config).toEqual({ decksDir: "/team/decks" })
  })
})

describe("findUserConfig (W5 task 5: four-layer chain, user layer)", () => {
  const originalHome = process.env.PPTFAST_HOME

  afterEach(() => {
    __resetRegisteredThemes()
    if (originalHome === undefined) delete process.env.PPTFAST_HOME
    else process.env.PPTFAST_HOME = originalHome
  })

  it("returns null when there is no user config file (missing = fine)", async () => {
    process.env.PPTFAST_HOME = await tmp()
    expect(await findUserConfig()).toBeNull()
  })

  it("reads theme/style/decksDir from $PPTFAST_HOME/config.json", async () => {
    const home = await tmp()
    process.env.PPTFAST_HOME = home
    await writeFile(
      join(home, "config.json"),
      JSON.stringify({ theme: "tech", style: { colors: { primary: "#123456" } }, decksDir: "/elsewhere/decks" }),
    )
    const hit = await findUserConfig()
    expect(hit?.path).toBe(join(home, "config.json"))
    expect(hit?.config.theme).toBe("tech")
    expect(hit?.config.style?.colors?.primary).toBe("#123456")
    expect(hit?.config.decksDir).toBe("/elsewhere/decks")
  })

  it("does not walk up directories (single fixed path, unlike project config)", async () => {
    const home = await tmp()
    process.env.PPTFAST_HOME = join(home, "nested", "deeper")
    // No config.json exists anywhere along this path — user config has no
    // walk-up behavior at all, so this must be null, not an error.
    expect(await findUserConfig()).toBeNull()
  })

  it("rejects unknown keys with the config path in the message", async () => {
    const home = await tmp()
    process.env.PPTFAST_HOME = home
    await writeFile(join(home, "config.json"), JSON.stringify({ them: "tech" }))
    await expect(findUserConfig()).rejects.toThrow(/config\.json/)
  })

  it("does not validate the theme id at read time (W5 review fix: moved to applyDeckConfig at resolution time — see commands.test.ts)", async () => {
    const home = await tmp()
    process.env.PPTFAST_HOME = home
    await writeFile(join(home, "config.json"), JSON.stringify({ theme: "neon" }))
    const hit = await findUserConfig()
    expect(hit?.config.theme).toBe("neon")
  })

  it("rejects a config that is not valid JSON", async () => {
    const home = await tmp()
    process.env.PPTFAST_HOME = home
    await writeFile(join(home, "config.json"), "{ theme: tech }")
    await expect(findUserConfig()).rejects.toThrow(/not valid JSON/)
  })

  it("accepts a config with only decksDir set (theme/style both optional)", async () => {
    const home = await tmp()
    process.env.PPTFAST_HOME = home
    await writeFile(join(home, "config.json"), JSON.stringify({ decksDir: "/team/decks" }))
    const hit = await findUserConfig()
    expect(hit?.config).toEqual({ decksDir: "/team/decks" })
  })
})
