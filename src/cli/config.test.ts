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

/**
 * The exact message `JSON.parse` throws for `text` on whatever JS engine
 * runs this test — used to build an exact-text expectation for config.ts's
 * `<path> is not valid JSON: <message>` template (backlog item 7a,
 * `.issues/notes/2026-07-18-post-v03-backlog.md` #7a) without hardcoding a
 * V8-version-specific wording: `readConfigFile` (config.ts:104-108) embeds
 * this exact same engine message verbatim, so deriving it live from the
 * same `text` this test itself writes to disk keeps the assertion exact
 * (not a loose substring) while staying correct across Node/V8 versions.
 */
function jsonParseErrorMessage(text: string): string {
  try {
    JSON.parse(text)
  } catch (e) {
    return (e as Error).message
  }
  throw new Error(`expected JSON.parse to throw for: ${text}`)
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
    const configPath = join(root, "pptfast.config.json")
    await writeFile(configPath, JSON.stringify({ them: "tech" }))
    // Exact text (backlog item 7a, `.issues/notes/2026-07-18-post-v03-backlog.md`
    // #7a): config.ts:110-114's real `invalid <path>:\n<field>: <message>`
    // template, `(root)` because zod's `.strict()` unrecognized-key issue
    // carries an empty `issue.path` (not scoped to the bad key itself).
    await expect(findConfig(root)).rejects.toThrow(new Error(`invalid ${configPath}:\n(root): Unrecognized key: "them"`))
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
    const configPath = join(root, "pptfast.config.json")
    await writeFile(configPath, JSON.stringify({ style: { colors: { primary: "blue" } } }))
    // Exact text (backlog item 7a): the shared StyleOverrideSchema's own
    // hex-color pattern message, surfaced through config.ts:110-114's
    // `invalid <path>:\n<field>: <message>` template with the real
    // dotted field path `style.colors.primary`.
    await expect(findConfig(root)).rejects.toThrow(
      new Error(`invalid ${configPath}:\nstyle.colors.primary: Invalid string: must match pattern /^#[0-9A-Fa-f]{3,8}$/`),
    )
  })

  it("rejects a config that is not valid JSON", async () => {
    const root = await tmp()
    const configPath = join(root, "pptfast.config.json")
    const badJson = "{ theme: tech }"
    await writeFile(configPath, badJson)
    // Exact text (backlog item 7a): config.ts:107's real
    // `<path> is not valid JSON: <message>` template — see
    // jsonParseErrorMessage's own doc comment for why the suffix is derived
    // live rather than hardcoded.
    await expect(findConfig(root)).rejects.toThrow(
      new Error(`${configPath} is not valid JSON: ${jsonParseErrorMessage(badJson)}`),
    )
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
    const configPath = join(home, "config.json")
    await writeFile(configPath, JSON.stringify({ them: "tech" }))
    // Exact text (backlog item 7a) — same template and unrecognized-key
    // message shape as the project-config case above, only the path differs.
    await expect(findUserConfig()).rejects.toThrow(new Error(`invalid ${configPath}:\n(root): Unrecognized key: "them"`))
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
    const configPath = join(home, "config.json")
    const badJson = "{ theme: tech }"
    await writeFile(configPath, badJson)
    // Exact text (backlog item 7a) — see jsonParseErrorMessage's own doc
    // comment for why the suffix is derived live rather than hardcoded.
    await expect(findUserConfig()).rejects.toThrow(
      new Error(`${configPath} is not valid JSON: ${jsonParseErrorMessage(badJson)}`),
    )
  })

  it("accepts a config with only decksDir set (theme/style both optional)", async () => {
    const home = await tmp()
    process.env.PPTFAST_HOME = home
    await writeFile(join(home, "config.json"), JSON.stringify({ decksDir: "/team/decks" }))
    const hit = await findUserConfig()
    expect(hit?.config).toEqual({ decksDir: "/team/decks" })
  })
})
