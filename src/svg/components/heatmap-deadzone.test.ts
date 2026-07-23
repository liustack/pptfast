// @vitest-environment node
//
// Regression pin for the review-round finding on `heatmap.tsx`'s `safeEased`
// (structure-components wave 2 task 2, post-approval fix round): a theme
// whose entire `colors.surface`→`colors.primary` interpolation path is
// *confined* inside the ~0.183-0.194 relative-luminance dead zone (see
// `heatmap.tsx`'s own `hasSafeInk` doc comment) has no `eased` value the
// 100-step search can escape to — `safeEased` degrades to "best-available
// ink" rather than a guaranteed-safe one. No canonical theme does this
// today (`full-matrix-contrast.test.ts` covers all 13 green), and
// `registerTheme` (`themes/definitions.ts`) performs zero color/contrast
// validation on a caller-supplied `style` — a real, if currently
// hypothetical, extensibility gap the rest of this codebase's contrast
// machinery shares (not heatmap-specific).
//
// This file answers the question the review protocol asked first:
// **is the confined case audit-visible?** Runs the reviewer's own two
// synthetic constructions (adjacent-but-both-confined, and flat) through a
// real `registerTheme` + `renderSlideSvg` + `auditDeck` — never a mock —
// with a *realistic* `colors.text` token (a real theme's own value,
// `consulting`'s `#051C2C` — not literally `#000000`, which is darker than
// this codebase's own `DARK_INK` and would silently mask the exact defect
// this pin exists to catch, a mistake this fix round's own investigation
// made and corrected before writing this file). Answer: **yes** —
// `findContrastIssues` correctly attributes each cell's value text to that
// cell's own real fill (not the page background) and reports it as
// `low-contrast` at the expected ~4.38-4.44 ratio, below the 4.5 floor.
// The confinement case is therefore already deterministic and
// audit-visible, not silent — `pptfast audit` (and this suite) both catch
// it every time, on every value, with no escape. A third control case
// (endpoints straddling the band) confirms this isn't a general
// over-triggering — it passes clean.
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { PptxIR, Slide } from "@/ir"
import { auditDeck } from "../audit/deck-audit"
import { installNodePlatform } from "../../platform/node"
import { registerTheme, __resetRegisteredThemes } from "../../themes/definitions"

beforeAll(() => {
  installNodePlatform()
})

afterEach(() => {
  __resetRegisteredThemes()
})

/** A minimal registerable theme whose (surface, primary) pair is the only
 * thing that varies across the cases below — every other token is a
 * realistic value borrowed from a real shipped theme (`consulting`'s own
 * `text`), not an artificially extreme one, so the reconstruction is
 * faithful to what a real `registerTheme` caller's token set would
 * actually look like. */
function confinedTheme(id: string, surface: string, primary: string) {
  return {
    id,
    style: {
      id,
      colors: {
        bg: "#FFFFFF",
        surface,
        primary,
        accent: "#AA00FF",
        text: "#051C2C", // consulting's own colors.text — a realistic dark ink, not pure #000000
        muted: "#888888",
        chartPalette: [primary, "#AA00FF"],
      },
      fonts: { heading: ["Arial"], body: ["Arial"] },
      defaultBackgrounds: {
        cover: { kind: "color" as const, value: "#FFFFFF" },
        chapter: { kind: "color" as const, value: "#FFFFFF" },
        content: { kind: "color" as const, value: "#FFFFFF" },
        ending: { kind: "color" as const, value: "#FFFFFF" },
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
  }
}

const HEATMAP_SLIDE: Slide = {
  type: "content",
  heading: "Deadzone probe",
  layout: "narrow-column",
  components: [
    {
      type: "heatmap",
      x_labels: ["a", "b", "c", "d", "e"],
      y_labels: ["row"],
      values: [[0, 25, 50, 75, 100]],
      show_values: true,
    },
  ],
} as Slide

function deckFor(themeId: string): PptxIR {
  return {
    version: "4",
    filename: "heatmap-deadzone-fixture",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides: [HEATMAP_SLIDE],
  } as PptxIR
}

describe("heatmap cell-ink dead-zone confinement — audit-visibility pin (review fix round)", () => {
  it("a theme confined to the dead zone (surface/primary 1 hex unit apart, both inside the band) is caught by auditDeck as low-contrast on every value cell — not silent", () => {
    registerTheme(confinedTheme("deadzone-adjacent", "#787878", "#797979"))
    const report = auditDeck(deckFor("deadzone-adjacent")) as { findings: { code: string; detail?: { text?: string } }[] }
    const cellFindings = report.findings.filter(
      (f) => f.code === "low-contrast" && ["0", "25", "50", "75", "100"].includes(f.detail?.text ?? ""),
    )
    // Every one of the 5 value cells is flagged — full coverage, not a
    // partial/lucky catch.
    expect(cellFindings.map((f) => f.detail!.text).sort()).toEqual(["0", "100", "25", "50", "75"])
    for (const f of cellFindings) {
      const detail = f.detail as unknown as { ratio: number; required: number }
      expect(detail.ratio).toBeLessThan(4.5)
      expect(detail.ratio).toBeGreaterThan(4.3) // matches the reviewer's own measured ~4.38-4.44 band, not some unrelated failure
      expect(detail.required).toBe(4.5)
    }
  })

  it("a theme flat-confined to the dead zone (surface === primary, exactly in-band) is equally caught, every value cell", () => {
    registerTheme(confinedTheme("deadzone-flat", "#787878", "#787878"))
    const report = auditDeck(deckFor("deadzone-flat")) as { findings: { code: string; detail?: { text?: string } }[] }
    const cellFindings = report.findings.filter(
      (f) => f.code === "low-contrast" && ["0", "25", "50", "75", "100"].includes(f.detail?.text ?? ""),
    )
    expect(cellFindings.map((f) => f.detail!.text).sort()).toEqual(["0", "100", "25", "50", "75"])
  })

  it("control: a theme whose ramp straddles (rather than is confined to) the dead zone passes clean — this isn't a general over-trigger", () => {
    registerTheme(confinedTheme("deadzone-control", "#767676", "#7b7b7b"))
    const report = auditDeck(deckFor("deadzone-control")) as { findings: { code: string; detail?: { text?: string } }[] }
    const cellFindings = report.findings.filter(
      (f) => f.code === "low-contrast" && ["0", "25", "50", "75", "100"].includes(f.detail?.text ?? ""),
    )
    expect(cellFindings).toEqual([])
  })
})
