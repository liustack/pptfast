// @vitest-environment node
//
// Chrome → branding migrate must not change SVG or PPTX bytes versus a
// deck authored with branding already. Layouts are pinned so auto-pick
// cannot drift. PPTX comparison skips docProps/core.xml (pptxgenjs timestamp).
import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { formatIssues, renderSlideSvg, validateIr } from "@/api"
import { generatePptxBlob } from "@/pptx/generate"
import { installNodePlatform } from "@/platform/node"
import { migrateChromeToBranding } from "./migrate"

const POSTURES = ["full", "cover-only", "minimal"] as const
type Posture = (typeof POSTURES)[number]

function pinnedDeck(field?: "chrome" | "branding", value?: Posture) {
  return {
    version: "4",
    filename: "branding-migrate-equiv",
    theme: { id: "consulting" },
    seed: 42,
    meta: {
      organization: "ACME",
      date: "2026-08-15",
      confidentiality: "internal" as const,
    },
    ...(field && value !== undefined ? { [field]: value } : {}),
    slides: [
      { type: "cover", heading: "Pitch", layout: "tone-adaptive-header" },
      {
        type: "content",
        heading: "The point",
        layout: "quiet-frame",
        components: [{ type: "paragraph", text: "Say it." }],
      },
      { type: "ending", heading: "Thanks", layout: "banner-ending" },
    ],
  }
}

function mustParse(raw: unknown) {
  const v = validateIr(raw)
  expect(v.ok, v.ok ? undefined : formatIssues(v.errors)).toBe(true)
  return v.ir!
}

async function normalizedZipMap(blob: Blob): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const entries = Object.keys(zip.files)
    .filter((p) => !zip.files[p]!.dir && p !== "docProps/core.xml")
    .sort()
  const out: Record<string, string> = {}
  for (const p of entries) out[p] = await zip.files[p]!.async("string")
  return out
}

describe("chrome → branding migrate equivalence", () => {
  installNodePlatform()

  it.each(POSTURES)(
    "migrated chrome:%s SVG and PPTX match a deck authored with the same branding",
    async (posture) => {
      const migrated = mustParse(migrateChromeToBranding(pinnedDeck("chrome", posture)))
      expect(migrated.branding).toBe(posture)
      expect(migrated).not.toHaveProperty("chrome")

      const authored = mustParse(pinnedDeck("branding", posture))
      expect(authored.branding).toBe(posture)

      const migratedSvgs = migrated.slides.map((_, i) => renderSlideSvg(migrated, i))
      const authoredSvgs = authored.slides.map((_, i) => renderSlideSvg(authored, i))
      expect(migratedSvgs).toEqual(authoredSvgs)

      const migratedZip = await normalizedZipMap(await generatePptxBlob(migrated))
      const authoredZip = await normalizedZipMap(await generatePptxBlob(authored))
      expect(migratedZip).toEqual(authoredZip)
    },
  )

  it("omitted field stays omitted: migrate does not bake a branding default", () => {
    const input = pinnedDeck()
    expect("chrome" in input).toBe(false)
    expect("branding" in input).toBe(false)
    const migrated = migrateChromeToBranding(input) as Record<string, unknown>
    expect("chrome" in migrated).toBe(false)
    expect("branding" in migrated).toBe(false)
  })
})
