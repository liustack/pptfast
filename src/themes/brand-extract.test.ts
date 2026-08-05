import { describe, expect, it } from "vitest"
import { contrastRatio } from "../svg/ink"
import { buildThemeXml, buildThmxBytes, DEFAULT_THMX_COLORS, PATHOLOGICAL_THMX_COLORS } from "./__fixtures__/thmx"
import { deriveMuted, extractBrandTheme, slugify } from "./brand-extract"

describe("extractBrandTheme — light theme (the common case)", () => {
  it("maps dk1/lt1/lt2/accent1-6 onto text/bg/surface/chartPalette", async () => {
    const bytes = await buildThmxBytes({ schemeName: "Acme Corp" })
    const theme = await extractBrandTheme(bytes)
    expect(theme.style.colors.text).toBe(`#${DEFAULT_THMX_COLORS.dk1}`)
    expect(theme.style.colors.bg).toBe(`#${DEFAULT_THMX_COLORS.lt1}`)
    expect(theme.style.colors.surface).toBe(`#${DEFAULT_THMX_COLORS.lt2}`)
    expect(theme.style.colors.primary).toBe(`#${DEFAULT_THMX_COLORS.accent1}`)
    expect(theme.style.colors.accent).toBe(`#${DEFAULT_THMX_COLORS.accent2}`)
    expect(theme.style.colors.chartPalette).toEqual([
      `#${DEFAULT_THMX_COLORS.accent1}`,
      `#${DEFAULT_THMX_COLORS.accent2}`,
      `#${DEFAULT_THMX_COLORS.accent3}`,
      `#${DEFAULT_THMX_COLORS.accent4}`,
      `#${DEFAULT_THMX_COLORS.accent5}`,
      `#${DEFAULT_THMX_COLORS.accent6}`,
    ])
    expect(theme.label).toBe("Acme Corp")
    expect(theme.id).toBe("acme-corp")
    expect(theme.brand).toEqual({})
    expect(theme.tags).toEqual([])
  })

  it("leads the font stack with the source theme's major/minor faces, sans fallback for a non-serif face", async () => {
    const bytes = await buildThmxBytes({ majorFont: "Calibri Light", minorFont: "Calibri" })
    const theme = await extractBrandTheme(bytes)
    expect(theme.style.fonts.heading[0]).toBe("Calibri Light")
    expect(theme.style.fonts.body[0]).toBe("Calibri")
    // A SAFE_FONTS member somewhere in the stack (../svg/fonts.ts) so
    // resolveFontFace never has to fall all the way back to ROLE_DEFAULT.
    expect(theme.style.fonts.heading).toContain("Calibri")
  })

  it("uses a serif SAFE_FONTS fallback chain for a serif-named source font", async () => {
    const bytes = await buildThmxBytes({ majorFont: "Sitka Display", minorFont: "Sitka Text" })
    const theme = await extractBrandTheme(bytes)
    expect(theme.style.fonts.heading).toEqual(["Sitka Display", "Georgia", "Source Han Serif SC", "serif"])
  })

  it("supports the real .thmx theme part path (theme/theme/theme1.xml) as well as .pptx/.potx's", async () => {
    const bytes = await buildThmxBytes({ themePartPath: "theme/theme/theme1.xml" })
    const theme = await extractBrandTheme(bytes)
    expect(theme.style.colors.text).toBe(`#${DEFAULT_THMX_COLORS.dk1}`)
  })

  it("picks the real theme part over a themeVariants sibling with different colors", async () => {
    const bytes = await buildThmxBytes({
      themePartPath: "theme/theme/theme1.xml",
      extraEntries: {
        "theme/themeVariants/variant1/theme/theme1.xml": buildThemeXml({
          colors: { ...DEFAULT_THMX_COLORS, dk1: "112233" },
        }),
      },
    })
    const theme = await extractBrandTheme(bytes)
    expect(theme.style.colors.text).toBe(`#${DEFAULT_THMX_COLORS.dk1}`)
  })

  it("recognizes the <a:sysClr lastClr> form (real Office themes' dk1/lt1 shape)", async () => {
    const bytes = await buildThmxBytes({ useSysClrForDkLt: true })
    const theme = await extractBrandTheme(bytes)
    expect(theme.style.colors.text).toBe(`#${DEFAULT_THMX_COLORS.dk1}`)
    expect(theme.style.colors.bg).toBe(`#${DEFAULT_THMX_COLORS.lt1}`)
  })

  it("is deterministic: the same bytes always extract to the same theme JSON", async () => {
    const bytes = await buildThmxBytes({ schemeName: "Acme Corp", majorFont: "Sitka Display" })
    const a = await extractBrandTheme(bytes)
    const b = await extractBrandTheme(bytes)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe("extractBrandTheme — swapped dk1/lt1 (measured-lightness assignment)", () => {
  it("assigns text/bg by which raw color actually measures darker, not by slot name", async () => {
    const bytes = await buildThmxBytes({
      colors: { ...DEFAULT_THMX_COLORS, dk1: "F5F5F5", lt1: "121212" },
    })
    const theme = await extractBrandTheme(bytes)
    expect(theme.style.colors.text).toBe("#121212")
    expect(theme.style.colors.bg).toBe("#F5F5F5")
  })
})

describe("extractBrandTheme — missing slots degrade gracefully", () => {
  it("falls back surface to bg when lt2 is absent", async () => {
    const { lt2: _lt2, ...rest } = DEFAULT_THMX_COLORS
    const bytes = await buildThmxBytes({ colors: rest })
    const theme = await extractBrandTheme(bytes)
    expect(theme.style.colors.surface).toBe(theme.style.colors.bg)
  })

  it("falls back primary to dk2 when accent1 is absent", async () => {
    const { accent1: _accent1, ...rest } = DEFAULT_THMX_COLORS
    const bytes = await buildThmxBytes({ colors: rest })
    const theme = await extractBrandTheme(bytes)
    expect(theme.style.colors.primary).toBe(`#${DEFAULT_THMX_COLORS.dk2}`)
  })

  it("falls back to a generic safe font stack when no <a:latin typeface> is declared", async () => {
    const bytes = await buildThmxBytes({ majorFont: undefined, minorFont: undefined })
    const theme = await extractBrandTheme(bytes)
    expect(theme.style.fonts.heading).toEqual(["Calibri", "Microsoft YaHei", "sans-serif"])
  })

  it("shrinks chartPalette to only the accent slots actually present", async () => {
    const { accent4: _a4, accent5: _a5, accent6: _a6, ...rest } = DEFAULT_THMX_COLORS
    const bytes = await buildThmxBytes({ colors: rest })
    const theme = await extractBrandTheme(bytes)
    expect(theme.style.colors.chartPalette).toHaveLength(3)
  })
})

describe("extractBrandTheme — structural failures", () => {
  it("throws when the package has no theme part at all", async () => {
    const JSZip = (await import("jszip")).default
    const zip = new JSZip()
    zip.file("some/other/part.xml", "<x/>")
    const bytes = await zip.generateAsync({ type: "uint8array" })
    await expect(extractBrandTheme(bytes)).rejects.toThrow(/no theme part found/)
  })

  it("throws when dk1/lt1 are both missing", async () => {
    const { dk1: _dk1, lt1: _lt1, ...rest } = DEFAULT_THMX_COLORS
    const bytes = await buildThmxBytes({ colors: rest })
    await expect(extractBrandTheme(bytes)).rejects.toThrow(/missing dk1\/lt1/)
  })

  it("throws when there are no accent colors at all", async () => {
    const bytes = await buildThmxBytes({ colors: { dk1: DEFAULT_THMX_COLORS.dk1, lt1: DEFAULT_THMX_COLORS.lt1 } })
    await expect(extractBrandTheme(bytes)).rejects.toThrow(/no accent colors/)
  })
})

describe("deriveMuted", () => {
  it("clears 4.5:1 against both bg and surface for a normal light palette", () => {
    const muted = deriveMuted(`#${DEFAULT_THMX_COLORS.dk1}`, `#${DEFAULT_THMX_COLORS.lt1}`, `#${DEFAULT_THMX_COLORS.lt2}`)
    expect(contrastRatio(muted, `#${DEFAULT_THMX_COLORS.lt1}`)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(muted, `#${DEFAULT_THMX_COLORS.lt2}`)).toBeGreaterThanOrEqual(4.5)
  })

  it("is a no-op fallback (returns text) when even text itself can't clear the floor against bg", () => {
    const muted = deriveMuted(`#${PATHOLOGICAL_THMX_COLORS.dk1}`, `#${PATHOLOGICAL_THMX_COLORS.lt1}`, `#${PATHOLOGICAL_THMX_COLORS.lt2}`)
    expect(muted).toBe(`#${PATHOLOGICAL_THMX_COLORS.dk1}`)
  })

  it("is deterministic across repeated calls", () => {
    const a = deriveMuted("#222222", "#F0F0F0", "#E5E5E5")
    const b = deriveMuted("#222222", "#F0F0F0", "#E5E5E5")
    expect(a).toBe(b)
  })
})

describe("slugify", () => {
  it("lower-cases and hyphenates non-alphanumeric runs", () => {
    expect(slugify("Acme Corp!!")).toBe("acme-corp")
    expect(slugify("  Über Brand  ")).toBe("ber-brand")
  })

  it("falls back to 'brand' for an empty/non-alphanumeric input", () => {
    expect(slugify("")).toBe("brand")
    expect(slugify("***")).toBe("brand")
  })
})
