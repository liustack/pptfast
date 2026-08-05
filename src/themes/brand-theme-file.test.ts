import { afterEach, describe, expect, it } from "vitest"
import { __resetRegisteredThemes, getInstalledThemeIds, getThemeDefinition } from "./definitions"
import { buildThmxBytes, PATHOLOGICAL_THMX_COLORS } from "./__fixtures__/thmx"
import { extractBrandTheme, type BrandThemeFile } from "./brand-extract"
import { parseBrandThemeFile, registerBrandThemeFile } from "./brand-theme-file"

afterEach(() => {
  __resetRegisteredThemes()
})

async function extractFixtureTheme(id = "acme"): Promise<BrandThemeFile> {
  const bytes = await buildThmxBytes({ schemeName: "Acme" })
  return extractBrandTheme(bytes, { id })
}

describe("parseBrandThemeFile", () => {
  it("round-trips extractBrandTheme's own output (schema and interface stay in sync)", async () => {
    const theme = await extractFixtureTheme()
    const parsed = parseBrandThemeFile(JSON.parse(JSON.stringify(theme)), "acme.theme.json")
    expect(parsed).toEqual(theme)
  })

  it("rejects a malformed file with the path and field in the message", () => {
    expect(() => parseBrandThemeFile({ id: "x", style: { colors: {} } }, "bad.theme.json")).toThrow(
      /invalid theme file bad\.theme\.json/,
    )
  })

  it("rejects a non-hex color value", async () => {
    const theme = JSON.parse(JSON.stringify(await extractFixtureTheme())) as Record<string, unknown>
    ;(theme.style as { colors: Record<string, unknown> }).colors.text = "red"
    expect(() => parseBrandThemeFile(theme, "bad.theme.json")).toThrow(/hex color/)
  })
})

describe("registerBrandThemeFile", () => {
  it("registers through registerTheme — theme becomes installed with full default layouts", async () => {
    const theme = await extractFixtureTheme()
    const id = registerBrandThemeFile(theme)
    expect(id).toBe("acme")
    expect(getInstalledThemeIds()).toContain("acme")
    const def = getThemeDefinition("acme")
    expect(def.style.colors.text).toBe(theme.style.colors.text)
    // 裁定 3: pure data — layouts default to the full archetype set.
    expect(def.layouts.cover.length).toBeGreaterThan(0)
    expect(def.layouts.content.length).toBeGreaterThan(0)
  })

  it("refuses to shadow a builtin id, naming the fix", async () => {
    const theme = await extractFixtureTheme("consulting")
    expect(() => registerBrandThemeFile(theme)).toThrow(/collides with a built-in pptfast theme.*--id/)
  })

  it("is idempotent for the same already-registered id (serve rebuild loop)", async () => {
    const theme = await extractFixtureTheme()
    registerBrandThemeFile(theme)
    expect(() => registerBrandThemeFile(theme)).not.toThrow()
    expect(getInstalledThemeIds().filter((id) => id === "acme")).toHaveLength(1)
  })

  it("contrast floor blocks a pathological palette with an actionable message", async () => {
    const bytes = await buildThmxBytes({ colors: PATHOLOGICAL_THMX_COLORS })
    const theme = await extractBrandTheme(bytes, { id: "gray-soup" })
    // The message names the token, the measured ratio, the background, and
    // the floor — error quality is part of this wave's acceptance.
    expect(() => registerBrandThemeFile(theme)).toThrow(
      /theme "gray-soup" colors\.(text|muted) has a contrast ratio of \d+\.\d+:1 against its "(cover|content|ending)" background \(#[0-9A-Fa-f]{6}\) — must be at least 3\.0:1/,
    )
    expect(getInstalledThemeIds()).not.toContain("gray-soup")
  })
})
