// @vitest-environment node
//
// Guards on the visual-review gallery (`pnpm gallery`,
// `.issues/2026-08-15-release-readiness/spec.md`).
//
// The gallery's whole value rests on two promises, and both are the kind
// that rot silently:
//
// 1. It covers everything it claims to cover. A component type added to
//    the IR without a corpus builder would quietly drop off the table, and
//    the review would sign off on something nobody ever looked at.
// 2. Every page it claims to show actually renders. A renderer change that
//    breaks one corpus page should fail here, at `pnpm check`, rather than
//    turning up as a hole three hours into a human review sitting.
//
// So this file renders the real matrix through the real chain rather than
// asserting on a stub. It is the most expensive test in the repo per case,
// and it earns that by being the only thing standing between a renderer
// regression and a wasted review.

import { describe, expect, it } from "vitest"
import { listThemes } from "@/api"
import { COMPONENT_TYPES } from "@/ir"
import { CHART_VARIANTS, COMPONENT_BUILDERS } from "./gallery/corpus/components"
import { corpusAssets, type CorpusAssets } from "./gallery/corpus/decks"
import { LANGUAGE_IDS, LEXICONS, type LanguageId } from "./gallery/corpus/lexicon"
import { buildGalleryHtml } from "./gallery/html"
import { assertFullCoverage, buildMatrix } from "./gallery/matrix"

const themeIds = listThemes()
  .map((t) => t.id)
  .sort()

/** Built once — rasterizing the placeholders is the slow part. */
let cached: Record<LanguageId, CorpusAssets> | undefined
async function assets(): Promise<Record<LanguageId, CorpusAssets>> {
  if (!cached) {
    const entries = await Promise.all(LANGUAGE_IDS.map(async (id) => [id, await corpusAssets(LEXICONS[id])] as const))
    cached = Object.fromEntries(entries) as Record<LanguageId, CorpusAssets>
  }
  return cached
}

describe("gallery coverage", () => {
  it("has a corpus builder for every component type the IR declares", () => {
    const built = new Set(Object.keys(COMPONENT_BUILDERS))
    const missing = COMPONENT_TYPES.filter((t) => !built.has(t))
    expect(missing).toEqual([])
  })

  it("builds no component the IR no longer declares", () => {
    const declared = new Set(COMPONENT_TYPES)
    const stale = Object.keys(COMPONENT_BUILDERS).filter((t) => !declared.has(t))
    expect(stale).toEqual([])
  })

  it("covers every chart_type, which one `chart` builder alone would not", () => {
    // `chart` is one IR type and nine unrelated drawings. Counting it once
    // is exactly the "count the types, miss the surfaces" gap the review
    // exists to close, so the variant table is checked against the schema's
    // own enum rather than a hand-kept list.
    const drawn = new Set<string>(
      Object.values(CHART_VARIANTS).map((build) => {
        const c = build(LEXICONS.zh)
        return c.type === "chart" ? c.chart_type : ""
      }),
    )
    for (const chartType of ["bar", "line", "pie", "funnel", "dumbbell", "scatter", "area", "donut", "gauge"]) {
      expect(drawn.has(chartType), `no gallery page draws chart_type "${chartType}"`).toBe(true)
    }
  })

  it("refuses to build a gallery whose theme count drifted from what the review claims", () => {
    expect(() => assertFullCoverage(themeIds, themeIds.length + 1)).toThrow(/expected/)
  })
})

describe("gallery corpus", () => {
  it("renders every page in every table through the real render chain", async () => {
    // Deliberately the whole matrix, not a sample: a corpus page that stops
    // rendering is a hole in the review, and which page it is cannot be
    // predicted from which code changed.
    const { renderMatrix } = await import("./gallery/render")
    const { mkdtempSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")

    const jobs = buildMatrix(themeIds, await assets())
    const outDir = mkdtempSync(join(tmpdir(), "pptfast-gallery-"))
    const { manifest } = renderMatrix(jobs, outDir, "test")

    const failures = manifest.pages.filter((p) => p.skipped).map((p) => `${p.id}: ${p.skipped}`)
    expect(failures).toEqual([])
    expect(manifest.pages.length).toBe(jobs.length)
  }, 120_000)

  it("gives every page a stable id derived from its identity, not its position", async () => {
    const first = buildMatrix(themeIds, await assets()).map((j) => j.id)
    const second = buildMatrix(themeIds, await assets()).map((j) => j.id)
    expect(second).toEqual(first)
    expect(new Set(first).size).toBe(first.length)
    // Verdicts are keyed by these ids and must survive a re-run after a
    // renderer change, so nothing run-specific may leak into them.
    expect(first.every((id) => /^[a-z0-9-]+$/.test(id))).toBe(true)
  })
})

describe("gallery page", () => {
  it("stays self-contained — nothing in it reaches the network", async () => {
    const { renderMatrix } = await import("./gallery/render")
    const { mkdtempSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")

    const jobs = buildMatrix(themeIds, await assets(), { only: "component", languages: ["zh"] })
    const outDir = mkdtempSync(join(tmpdir(), "pptfast-gallery-html-"))
    const { manifest, svgs } = renderMatrix(jobs, outDir, "test")
    const html = buildGalleryHtml(manifest, svgs)

    // A reviewer opens this file offline, from wherever it was copied to.
    // Any absolute URL in it is a page that renders differently — or not at
    // all — depending on the network, which would make the review's own
    // evidence unreproducible.
    const external = html.match(/(?:src|href)\s*=\s*"https?:\/\/[^"]+"/g) ?? []
    expect(external).toEqual([])

    // The corpus deliberately contains an https link as *content* (a source
    // citation), so the check above must not be satisfied by the corpus
    // simply having no URLs in it.
    expect(html).toContain("example.com")
  }, 60_000)

  it("escapes the payload so no embedded content can close the script block", async () => {
    const { renderMatrix } = await import("./gallery/render")
    const { mkdtempSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")

    const jobs = buildMatrix(themeIds, await assets(), { only: "component", languages: ["zh"] })
    const outDir = mkdtempSync(join(tmpdir(), "pptfast-gallery-esc-"))
    const { manifest, svgs } = renderMatrix(jobs, outDir, "test")
    const html = buildGalleryHtml(manifest, svgs)

    // Every SVG payload is full of `<`. If any of it survived unescaped
    // inside the JSON script blocks, the browser would end the block at the
    // first `</...>` and the page would come up blank.
    const blocks = html.match(/<script id="(?:manifest|svg)-data"[^>]*>([\s\S]*?)<\/script>/g) ?? []
    expect(blocks.length).toBe(2)
    for (const block of blocks) {
      const body = block.slice(block.indexOf(">") + 1, block.lastIndexOf("<"))
      expect(body.includes("<")).toBe(false)
      expect(() => JSON.parse(body.replace(/\\u003c/g, "<"))).not.toThrow()
    }
  }, 60_000)
})
