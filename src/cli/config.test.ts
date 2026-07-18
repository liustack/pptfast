// @vitest-environment node
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { __resetRegisteredThemes, registerTheme } from "../themes/definitions"
import { findConfig } from "./config"

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

  it("rejects an unknown theme id", async () => {
    const root = await tmp()
    await writeFile(join(root, "pptfast.config.json"), JSON.stringify({ theme: "neon" }))
    await expect(findConfig(root)).rejects.toThrow(/theme/)
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
})
