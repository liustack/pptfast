// @vitest-environment node
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, beforeAll } from "vitest"
import { installNodePlatform } from "@/platform/node"
import { applyDeckConfig, runInit, runPreview, runRender, runSchema, runThemes, runValidate } from "./commands"

// 1x1 红色 PNG
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

const VALID_IR = {
  version: "2",
  filename: "cli-test",
  theme: { id: "tech" },
  slides: [
    { type: "cover", heading: "CLI" },
    { type: "content", heading: "Body", blocks: [{ type: "paragraph", text: "hello from the CLI test" }] },
  ],
}

const IR_WITH_LOCAL_ASSET = {
  version: "2",
  filename: "cli-test-asset",
  theme: { id: "tech" },
  assets: { images: { logo: { src: "logo.png" } } },
  slides: [
    { type: "cover", heading: "CLI" },
    { type: "content", heading: "Body", blocks: [{ type: "image", asset_id: "logo" }] },
  ],
}

let dir: string
beforeAll(async () => {
  installNodePlatform()
  dir = await mkdtemp(join(tmpdir(), "pptfast-cli-"))
  await writeFile(join(dir, "deck.json"), JSON.stringify(VALID_IR))
  await writeFile(join(dir, "bad.json"), JSON.stringify({ version: "2" }))
  await writeFile(join(dir, "logo.png"), PNG_1PX)
  await writeFile(join(dir, "deck-with-asset.json"), JSON.stringify(IR_WITH_LOCAL_ASSET))
})

describe("runValidate", () => {
  it("reports OK with slide count for valid IR", async () => {
    await expect(runValidate(join(dir, "deck.json"))).resolves.toMatch(/OK — 2 slides/)
  })
  it("throws with issue list for invalid IR", async () => {
    await expect(runValidate(join(dir, "bad.json"))).rejects.toThrow(/invalid IR/)
  })
})

describe("runRender", () => {
  it("writes a pptx file and honors --theme override", async () => {
    const out = join(dir, "out.pptx")
    const msg = await runRender(join(dir, "deck.json"), { output: out, theme: "consulting" })
    expect(msg).toContain("2 slides")
    const bytes = await readFile(out)
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK")
  })
})

describe("runSchema / runThemes", () => {
  it("prints JSON Schema", () => {
    expect(JSON.parse(runSchema())).toHaveProperty("$schema")
  })
  it("prints 13 themes, json mode parses", () => {
    expect(runThemes(false).split("\n")).toHaveLength(13)
    expect(JSON.parse(runThemes(true))).toHaveLength(13)
  })
})

describe("runPreview", () => {
  it("writes one SVG per slide", async () => {
    const out = join(dir, "svgs")
    await runPreview(join(dir, "deck.json"), out)
    const files = await readdir(out)
    expect(files.sort()).toEqual(["001-cover.svg", "002-content.svg"])
    const svg = await readFile(join(out, "002-content.svg"), "utf8")
    expect(svg).toContain("hello from the CLI test")
  })

  it("inlines local image assets as data URIs", async () => {
    const out = join(dir, "svgs-asset")
    await runPreview(join(dir, "deck-with-asset.json"), out)
    const svg = await readFile(join(out, "002-content.svg"), "utf8")
    expect(svg).toContain("data:image/png;base64")
  })
})

describe("runSchema --tokens", () => {
  it("prints the TokensOverride schema", () => {
    const s = JSON.parse(runSchema(true)) as { properties?: Record<string, unknown> }
    expect(Object.keys(s.properties ?? {})).toEqual(
      expect.arrayContaining(["colors", "fonts", "shape"]),
    )
  })
})

describe("applyDeckConfig resolution (flag > config > IR)", () => {
  const freshDir = () => mkdtemp(join(tmpdir(), "pptfast-deckcfg-"))

  it("--tokens file wins over config tokens", async () => {
    const d = await freshDir()
    await writeFile(
      join(d, "pptfast.config.json"),
      JSON.stringify({ tokens: { colors: { primary: "#111111" } } }),
    )
    await writeFile(join(d, "brand.json"), JSON.stringify({ colors: { primary: "#0B5FFF" } }))
    const raw: any = structuredClone(VALID_IR)
    await applyDeckConfig(raw, { tokensPath: join(d, "brand.json"), cwd: d })
    expect(raw.theme.tokens.colors.primary).toBe("#0B5FFF")
  })

  it("config tokens and theme apply when no flags are given", async () => {
    const d = await freshDir()
    await writeFile(
      join(d, "pptfast.config.json"),
      JSON.stringify({ theme: "ink", tokens: { colors: { primary: "#111111" } } }),
    )
    const raw: any = structuredClone(VALID_IR)
    await applyDeckConfig(raw, { cwd: d })
    expect(raw.theme.id).toBe("ink")
    expect(raw.theme.tokens.colors.primary).toBe("#111111")
  })

  it("--theme flag beats config and keeps IR-authored tokens", async () => {
    const d = await freshDir()
    await writeFile(join(d, "pptfast.config.json"), JSON.stringify({ theme: "ink" }))
    const raw: any = structuredClone(VALID_IR)
    raw.theme = { id: "tech", tokens: { colors: { primary: "#ABCDEF" } } }
    await applyDeckConfig(raw, { theme: "consulting", cwd: d })
    expect(raw.theme.id).toBe("consulting")
    expect(raw.theme.tokens.colors.primary).toBe("#ABCDEF")
  })

  it("leaves the IR untouched when there is no flag and no config", async () => {
    const d = await freshDir()
    const raw: any = structuredClone(VALID_IR)
    await applyDeckConfig(raw, { cwd: d })
    expect(raw).toEqual(VALID_IR)
  })

  it("rejects an invalid --tokens file with the file path in the message", async () => {
    const d = await freshDir()
    await writeFile(join(d, "brand.json"), JSON.stringify({ colors: { primary: "nope" } }))
    const raw: any = structuredClone(VALID_IR)
    await expect(
      applyDeckConfig(raw, { tokensPath: join(d, "brand.json"), cwd: d }),
    ).rejects.toThrow(/brand\.json/)
  })

  it("runValidate reports the config-resolved theme", async () => {
    const d = await freshDir()
    await writeFile(join(d, "pptfast.config.json"), JSON.stringify({ theme: "ink" }))
    await writeFile(join(d, "deck.json"), JSON.stringify(VALID_IR))
    await expect(runValidate(join(d, "deck.json"), d)).resolves.toMatch(/theme "ink"/)
  })
})

describe("runInit", () => {
  it("writes a config template into cwd", async () => {
    const d = await mkdtemp(join(tmpdir(), "pptfast-init-"))
    const msg = await runInit(d)
    expect(msg).toContain("pptfast.config.json")
    const written = JSON.parse(await readFile(join(d, "pptfast.config.json"), "utf8"))
    expect(written.theme).toBe("consulting")
    expect(written.tokens.colors.primary).toMatch(/^#/)
  })

  it("refuses to overwrite an existing config", async () => {
    const d = await mkdtemp(join(tmpdir(), "pptfast-init-"))
    await runInit(d)
    await expect(runInit(d)).rejects.toThrow(/exists/)
  })
})
