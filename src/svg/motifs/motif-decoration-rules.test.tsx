// @vitest-environment jsdom
/**
 * Gallery review r2 group B. Constitutional decoration rules.
 *
 * Piece (B1): see `decor-budget.ts`. The counter is the definition. A
 * family must live in one `[data-decor-piece]` group. Unwrapped painted
 * leaves each count, so a new mark that is not wrapped fails the budget.
 *
 * Background (B2): on a content page, composited motif ink against the
 * page ground stays below 3:1. Text that labels a piece is not ink under
 * this rule (it has to stay readable). Gradient `url()` fills are a field,
 * not a mark, and are skipped.
 *
 * Slanted tile (B3): at most one chip-sized 1°–20° tile per page. Motif
 * count is the lock. Playbill content yields the date chip so a layout
 * that already paints a unit chip (stat-hero) does not get a second one.
 */
import { describe, expect, it } from "vitest"
import type { PptxIR, Slide } from "@/ir"
import { blendOver, contrastRatio } from "../ink"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { renderSlideSvg } from "../../api"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { resolveStyle } from "../../themes"
import { MOTIF_CANDIDATES } from "../motif-selection"
import { MOTIFS } from "./index"
import type { MotifId } from "./types"
import {
  CONTENT_DECOR_CONTRAST_CEILING,
  CONTENT_DECOR_CONTRAST_FLOOR,
  MAX_DECOR_PIECES,
  countDecorPieces,
  countSlantedTiles,
  leafOpacity,
  leafPaint,
  paintedLeaves,
} from "./decor-budget"

const TYPES: Slide["type"][] = ["cover", "chapter", "content", "ending"]

function themeForMotif(id: MotifId): string {
  for (const [theme, ids] of Object.entries(MOTIF_CANDIDATES)) {
    if (ids?.includes(id)) return theme
  }
  return "consulting"
}

function slideOf(type: Slide["type"]): Slide {
  return { type, heading: "Heading", components: [] } as Slide
}

function irOf(theme: string, slide: Slide): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: theme },
    meta: { date: "2026-07-15", organization: "CloudSeek" },
    assets: { images: {} },
    slides: [slide],
  } as unknown as PptxIR
}

function drawMotif(id: MotifId, type: Slide["type"]) {
  const theme = themeForMotif(id)
  const tokens = resolveStyle(theme)
  const slide = slideOf(type)
  const defaultBg = resolveBackgroundHex(tokens.defaultBackgrounds[type], tokens.colors.surface)
  const ctx = buildCtx(tokens, {}, undefined, defaultBg)
  const Motif = MOTIFS[id]
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <Motif ir={irOf(theme, slide)} slide={slide} ctx={ctx} />
    </svg>,
  )
  return { root: parseSvgRoot(markup), tokens, defaultBg, theme, slide }
}

describe("B1 decoration budget: at most 3 pieces per page", () => {
  it(`every registered motif stays at ≤${MAX_DECOR_PIECES} pieces on cover, chapter, content, and ending`, () => {
    const over: string[] = []
    for (const id of Object.keys(MOTIFS) as MotifId[]) {
      for (const type of TYPES) {
        const { root } = drawMotif(id, type)
        const n = countDecorPieces(root)
        if (n > MAX_DECOR_PIECES) over.push(`${id} ${type}: ${n}`)
      }
    }
    expect(over, over.join(" | ")).toEqual([])
  })

  it("tech cover (the named offender) does not paint sparse stars or branch tracks", () => {
    const { root } = drawMotif("constellation-motif", "cover")
    expect(countDecorPieces(root)).toBeLessThanOrEqual(MAX_DECOR_PIECES)
    expect(root.querySelectorAll("polyline")).toHaveLength(1)
    const muted = resolveStyle("tech").colors.muted
    const stars = Array.from(root.querySelectorAll("circle")).filter((c) => c.getAttribute("fill") === muted)
    expect(stars).toHaveLength(0)
  })
})

describe("B2 decoration is always background on content pages", () => {
  it("content-page motif paints recede below the 3:1 large-text floor against the page ground", () => {
    const loud: string[] = []
    for (const id of Object.keys(MOTIFS) as MotifId[]) {
      const { root, defaultBg } = drawMotif(id, "content")
      for (const el of paintedLeaves(root)) {
        const paint = leafPaint(el)
        if (!paint) continue
        const opacity = leafOpacity(el)
        const composite = blendOver(paint.color, defaultBg, opacity)
        const ratio = contrastRatio(composite, defaultBg)
        if (ratio >= CONTENT_DECOR_CONTRAST_CEILING) {
          loud.push(`${id} ${el.tagName.toLowerCase()} ${paint.color} @${opacity} → ${ratio.toFixed(2)}:1`)
        }
      }
    }
    expect(loud, loud.join(" | ")).toEqual([])
  })

  it("content-page motif paints stay visible (not deleted by the fade)", () => {
    for (const id of ["constellation-motif"] as const) {
      const { root, defaultBg } = drawMotif(id, "content")
      const leaves = paintedLeaves(root)
      expect(leaves.length, `${id} vanished on content`).toBeGreaterThan(0)
      const ratios = leaves
        .map((el) => {
          const paint = leafPaint(el)
          if (!paint) return 0
          return contrastRatio(blendOver(paint.color, defaultBg, leafOpacity(el)), defaultBg)
        })
        .filter((n) => n > 0)
      expect(Math.max(...ratios), `${id} faded to nothing`).toBeGreaterThanOrEqual(CONTENT_DECOR_CONTRAST_FLOOR)
    }
  })
})

describe("B3 at most one slanted tile per page", () => {
  it("every registered motif paints at most one slanted tile", () => {
    const over: string[] = []
    for (const id of Object.keys(MOTIFS) as MotifId[]) {
      for (const type of TYPES) {
        const { root } = drawMotif(id, type)
        const n = countSlantedTiles(root)
        if (n > 1) over.push(`${id} ${type}: ${n}`)
      }
    }
    expect(over, over.join(" | ")).toEqual([])
  })

  it("playbill motif paints the date chip on cover and ending only", () => {
    expect(countSlantedTiles(drawMotif("playbill-motif", "cover").root)).toBe(1)
    expect(countSlantedTiles(drawMotif("playbill-motif", "ending").root)).toBe(1)
    expect(countSlantedTiles(drawMotif("playbill-motif", "content").root)).toBe(0)
    expect(countSlantedTiles(drawMotif("playbill-motif", "chapter").root)).toBe(0)
  })

  it("playbill stat-hero page paints at most one slanted tile (layout chip, not a second date chip)", () => {
    const ir = {
      version: "4",
      filename: "playbill-stat.pptx",
      theme: { id: "playbill" },
      meta: { date: "2026-07-15" },
      assets: { images: {} },
      seed: 20260815,
      slides: [
        {
          type: "content",
          layout: "stat-hero",
          heading: "-43%",
          subheading: "unplanned downtime, 90-day pilot",
          components: [],
        },
      ],
    } as unknown as PptxIR
    const svg = renderSlideSvg(ir, 0)
    const root = parseSvgRoot(svg)
    expect(countSlantedTiles(root)).toBeLessThanOrEqual(1)
  })
})
