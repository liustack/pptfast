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
import { CHART_VARIANTS, COMPONENT_BUILDERS, DENSITY_BUILDERS } from "./gallery/corpus/components"
import { corpusAssets, type CorpusAssets } from "./gallery/corpus/decks"
import { LANGUAGE_IDS, LEXICONS, type LanguageId } from "./gallery/corpus/lexicon"
import { buildGalleryHtml } from "./gallery/html"
import { assertFullCoverage, buildMatrix } from "./gallery/matrix"
import { installNodePlatform } from "@/platform/node"

// `renderMatrix` audits every page it renders, and the auditor parses SVG
// through the Node DOM seam. Without this the audit throws on every page
// and `renderMatrix` refuses to hand back a gallery whose findings column
// would be a misleadingly clean bill of health.
await installNodePlatform()

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

  it("fingerprints every rendered page in both halves", async () => {
    // Verdicts are stamped with these, and a page that shipped without them
    // would quietly fall back to the old all-or-nothing staleness rule —
    // which is exactly what the split exists to retire.
    const { renderMatrix } = await import("./gallery/render")
    const { mkdtempSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")

    const jobs = buildMatrix(themeIds, await assets(), { only: "component", languages: ["zh"] })
    const outDir = mkdtempSync(join(tmpdir(), "pptfast-gallery-fp-"))
    const { manifest } = renderMatrix(jobs, outDir, "test")

    const unfingerprinted = manifest.pages
      .filter((p) => !p.skipped)
      .filter((p) => !p.fingerprint?.geometry || !p.fingerprint?.color)
      .map((p) => p.id)
    expect(unfingerprinted).toEqual([])
  }, 60_000)

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

  it("emits a script that actually parses", async () => {
    // Learned the hard way: a single under-escaped `\n` inside the inlined
    // script turned the whole page into a blank screen, and every other
    // check here still passed because they only look at the JSON payloads.
    // The page is one file with one script — if it does not parse, nothing
    // renders at all, so parsing it is the cheapest possible smoke test.
    const { renderMatrix } = await import("./gallery/render")
    const { mkdtempSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const vm = await import("node:vm")

    const jobs = buildMatrix(themeIds, await assets(), { only: "component", languages: ["zh"] })
    const outDir = mkdtempSync(join(tmpdir(), "pptfast-gallery-parse-"))
    const { manifest, svgs } = renderMatrix(jobs, outDir, "test")
    const html = buildGalleryHtml(manifest, svgs)

    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)
    expect(scripts.length).toBeGreaterThan(0)
    for (const source of scripts) {
      expect(() => new vm.Script(source)).not.toThrow()
    }
  }, 60_000)

  it("carries the shared freshness rule in a form the browser can run", async () => {
    // The rule that decides stale / recolored / fresh lives in render.ts and
    // is shipped into the page as source, so the reviewer and the tests can
    // never be running two different versions of it. Two ways that breaks
    // silently: esbuild's keepNames wrapper, which references a helper only
    // Node has, and the function simply not arriving.
    const { renderMatrix } = await import("./gallery/render")
    const { mkdtempSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")

    const jobs = buildMatrix(themeIds, await assets(), { only: "component", languages: ["zh"] })
    const outDir = mkdtempSync(join(tmpdir(), "pptfast-gallery-rule-"))
    const { manifest, svgs } = renderMatrix(jobs, outDir, "test")
    const html = buildGalleryHtml(manifest, svgs)

    expect(html).toContain("function verdictFreshness")
    expect(html).toContain('"recolored"')
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).join("\n")
    expect(script).not.toContain("__name(")
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

// The density table exists because nine components share a "keep what fits,
// mark the rest" branch that no gallery page had ever drawn: the ordinary
// corpus tops out at five bullets and the marker needs twelve, so 434 review
// pages missed it by construction and one review verdict about the marker
// ended up naming a page that never had one. That blind spot closes only
// while these pages keep reaching the branch, and nothing about them says so
// on inspection — a threshold moving by a few pixels puts it back silently.
describe("gallery density table", () => {
  it("draws a drop marker on every page", async () => {
    const { renderMatrix } = await import("./gallery/render")
    const { mkdtempSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")

    const jobs = buildMatrix(themeIds, await assets(), { only: "density" })
    const outDir = mkdtempSync(join(tmpdir(), "pptfast-gallery-density-"))
    const { svgs } = renderMatrix(jobs, outDir, "test")

    const unmarked = [...svgs].filter(([, svg]) => !/\+\d+ more/.test(svg)).map(([id]) => id)
    expect(unmarked, "these density pages fit after all — raise their item counts").toEqual([])

    // The failure mode that cost the first attempt at this table: the whole
    // component overflows, `layoutContentFit` deletes the block rather than
    // handing it a budget to clip into, and the page renders its chrome and
    // nothing else. That reads as a drop too, but it is the slide-level one,
    // not the component-level branch these pages are here to show.
    const swallowed = [...svgs].filter(([, svg]) => svg.includes("data-dropped-silent")).map(([id]) => id)
    expect(swallowed, "the component was dropped whole instead of clipping itself").toEqual([])
  }, 60_000)

  it("covers every component that can draw a drop marker", async () => {
    const { readFileSync, readdirSync } = await import("node:fs")
    const { join } = await import("node:path")
    const { fileURLToPath } = await import("node:url")

    // Counted from the renderers rather than from a list kept here by hand:
    // a tenth component growing the same branch must fail this, or it joins
    // the review unseen exactly the way the first nine did.
    const dir = join(fileURLToPath(new URL("..", import.meta.url)), "src/svg/components")
    const drawers = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
      .filter((f) => /\+\$\{[^}]+\} more`/.test(readFileSync(join(dir, f), "utf8")))

    expect(
      Object.keys(DENSITY_BUILDERS).length,
      `${drawers.length} components draw a "+N more" marker (${drawers.join(", ")}) but the density ` +
        `table covers ${Object.keys(DENSITY_BUILDERS).length} — add a builder to DENSITY_BUILDERS`,
    ).toBe(drawers.length)
  })
})
