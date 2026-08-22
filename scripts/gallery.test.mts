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
import { COMPONENT_TYPES, type Component } from "@/ir"
import { CHART_VARIANTS, COMPONENT_BUILDERS, DENSITY_BUILDERS, FORM_VARIANTS } from "../evals/gallery/corpus/components"
import { THEME_TABLE_REQUIRED_SURFACES } from "../evals/gallery/corpus/theme-slots"
import { COMPONENT_FORMS, resolveComponentForm } from "@/svg/components/form-assignments"
import { BASELINE_THEME, corpusAssets, type CorpusAssets } from "../evals/gallery/corpus/decks"
import { LANGUAGE_IDS, LEXICONS, type LanguageId } from "../evals/gallery/corpus/lexicon"
import { buildGalleryHtml } from "../evals/gallery/html"
import { assertFullCoverage, buildMatrix } from "../evals/gallery/matrix"
import { SPARSE_LAYOUT_IDS, THEME_DEFINITIONS, themeOffersSparse } from "@/themes/definitions"
import { installNodePlatform } from "@/platform/node"

// `renderMatrix` audits every page it renders, and the auditor parses SVG
// through the Node DOM seam. Without this the audit throws on every page
// and `renderMatrix` refuses to hand back a gallery whose findings column
// would be a misleadingly clean bill of health.
await installNodePlatform()

const themeIds = listThemes()
  .map((t) => t.id)
  .sort()

/** Built once — loading the committed JPEG fixtures is the slow part. */
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

  it("assigns each form-variant page a theme that actually owns that form", () => {
    for (const variant of FORM_VARIANTS) {
      const component = variant.build(LEXICONS.zh)
      const assignment = resolveComponentForm(component.type, variant.theme)
      expect(assignment, `${variant.id} on ${variant.theme}`).toBeTruthy()
    }
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

  it("layout table expands sparse layouts only on themes that offer them", async () => {
    const jobs = buildMatrix(themeIds, await assets(), { only: "layout" })
    const sparse = jobs.filter((j) => (SPARSE_LAYOUT_IDS as readonly string[]).includes(j.subject))
    const subjects = (themeId: string) => sparse.filter((j) => j.theme === themeId).map((j) => j.subject)

    expect(subjects("crayon")).toEqual([])
    expect(subjects("classroom")).toEqual([])

    const stage = subjects("stage")
    expect(stage).toContain("statement")
    expect(stage).not.toContain("one-evidence")

    expect([...new Set(subjects("consulting"))].sort()).toEqual([...THEME_DEFINITIONS.consulting.sparseLayouts!].sort())

    const derived = themeIds.reduce((n, themeId) => {
      const offered = SPARSE_LAYOUT_IDS.filter((layoutId) => themeOffersSparse(themeId, layoutId)).length
      return n + offered * (themeId === BASELINE_THEME ? LANGUAGE_IDS.length : 1)
    }, 0)
    expect(sparse).toHaveLength(derived)
  })

  it("emits only the theme, layout, component, and density tables", async () => {
    const jobs = buildMatrix(themeIds, await assets())
    expect([...new Set(jobs.map((j) => j.table))].sort()).toEqual(["component", "density", "layout", "theme"])
  })
})

const THEME_CHART_SURFACES = [
  "chart:bar",
  "chart:bar-horizontal",
  "chart:line",
  "chart:area",
  "chart:pie",
  "chart:donut",
  "chart:funnel",
  "chart:dumbbell",
  "chart:scatter",
  "chart:gauge",
] as const

function leadComponent(job: { ir: { slides: { components: Component[] }[] }; slideIndex: number }): Component | undefined {
  return job.ir.slides[job.slideIndex]!.components[0]
}

function chartSurfaceId(c: Extract<Component, { type: "chart" }>): string {
  if (c.chart_type === "bar" && c.direction === "horizontal") return "chart:bar-horizontal"
  return `chart:${c.chart_type}`
}

function themeTableSurfaces(
  jobs: Array<{
    slideType: string
    theme: string
    ir: { slides: { components: Component[] }[] }
    slideIndex: number
  }>,
): string[] {
  const surfaces = new Set<string>()
  for (const job of jobs) {
    const slide = job.ir.slides[job.slideIndex]!
    if (JSON.stringify(slide).includes("**")) {
      const emphasisForm = resolveComponentForm("emphasis", job.theme)?.form
      if (emphasisForm) surfaces.add(`form:${emphasisForm}`)
    }
    if (job.slideType !== "content") continue
    const c = leadComponent(job)
    if (!c) continue
    surfaces.add(c.type)
    if (c.type === "chart") surfaces.add(chartSurfaceId(c))
    const form = resolveComponentForm(c.type, job.theme)?.form
    if (form) surfaces.add(`form:${form}`)
  }
  return [...surfaces].sort()
}

describe("gallery theme table corpus", () => {
  it("keeps the coverage list aligned with IR types, chart surfaces, and forms", () => {
    const expected = [
      ...COMPONENT_TYPES,
      ...THEME_CHART_SURFACES,
      ...COMPONENT_FORMS.map((f) => `form:${f}`),
    ].sort()
    const listed = [...THEME_TABLE_REQUIRED_SURFACES].sort()
    expect(listed).toEqual(expected)
    expect(new Set(THEME_TABLE_REQUIRED_SURFACES).size).toBe(THEME_TABLE_REQUIRED_SURFACES.length)
  })

  it("runs a ten-page deck on every theme, with seven unique content leads", async () => {
    const jobs = buildMatrix(themeIds, await assets(), { only: "theme" })

    for (const themeId of themeIds) {
      const pages = jobs.filter((j) => j.subject === themeId).sort((a, b) => a.page - b.page)
      expect(pages, themeId).toHaveLength(10)
      expect(pages.map((p) => p.slideType)).toEqual([
        "cover",
        "chapter",
        "content",
        "content",
        "content",
        "content",
        "content",
        "content",
        "content",
        "ending",
      ])

      const content = pages.filter((p) => p.slideType === "content")
      const types = content.map((p) => leadComponent(p)!.type)
      expect(new Set(types).size, themeId).toBe(7)
    }
  })

  it("covers every required surface at least once across the 24×7 union", async () => {
    const jobs = buildMatrix(themeIds, await assets(), { only: "theme" })
    const drawn = themeTableSurfaces(jobs)
    const required = [...THEME_TABLE_REQUIRED_SURFACES].sort()
    const missing = required.filter((s) => !drawn.includes(s))
    const extra = drawn.filter((s) => !(THEME_TABLE_REQUIRED_SURFACES as readonly string[]).includes(s))
    expect(missing, `missing surfaces: ${missing.join(", ")}`).toEqual([])
    expect(extra, `stale surfaces: ${extra.join(", ")}`).toEqual([])
    expect(drawn).toEqual(required)

    const types = new Set<string>(jobs.filter((j) => j.slideType === "content").map((j) => leadComponent(j)!.type))
    for (const type of COMPONENT_TYPES) {
      expect(types.has(type), type).toBe(true)
    }

    const charts = new Set(
      jobs
        .filter((j) => j.slideType === "content")
        .map((j) => leadComponent(j))
        .filter((c): c is Extract<Component, { type: "chart" }> => c?.type === "chart")
        .map(chartSurfaceId),
    )
    for (const surface of THEME_CHART_SURFACES) {
      expect(charts.has(surface), surface).toBe(true)
    }

    const forms = new Set(
      themeTableSurfaces(jobs)
        .filter((surface) => surface.startsWith("form:"))
        .map((surface) => surface.slice("form:".length)),
    )
    for (const form of COMPONENT_FORMS) {
      expect(forms.has(form), form).toBe(true)
    }
  })

  it("assigns the same lead types on a second buildMatrix call", async () => {
    const first = buildMatrix(themeIds, await assets(), { only: "theme" })
    const second = buildMatrix(themeIds, await assets(), { only: "theme" })
    const typesOf = (jobs: typeof first) =>
      jobs
        .filter((j) => j.slideType === "content")
        .map((j) => `${j.subject}:${j.page}:${leadComponent(j)!.type}`)
    expect(typesOf(second)).toEqual(typesOf(first))
  })
})

describe("gallery layout table corpus", () => {
  it("authors bodies that match what those layouts actually draw", async () => {
    const jobs = buildMatrix(themeIds, await assets(), { only: "layout", languages: ["zh"] })
    const typesOf = (layoutId: string): string[] => {
      const job = jobs.find((j) => j.subject === layoutId && j.language === "zh")
      expect(job, layoutId).toBeTruthy()
      return job!.ir.slides[0]!.components.map((c) => c.type)
    }

    expect(typesOf("pull-quote")).toContain("quote")
    expect(typesOf("one-evidence")).toContain("chart")
    expect(typesOf("bento-panel")).toEqual(expect.arrayContaining(["kpi_cards", "icon_cards"]))
    expect(typesOf("stacked-poster")).toContain("image")
  })

  it("varies the first body type across the two-compact layout family", async () => {
    const jobs = buildMatrix(themeIds, await assets(), { only: "layout", languages: ["zh"] })
    const twoCompact = [
      "two-column",
      "narrow-column",
      "rail-numbered",
      "banner-heading",
      "tone-adaptive-content",
      "quiet-frame",
      "split-band",
    ]
    const leads = twoCompact.map((layoutId) => {
      const job = jobs.find((j) => j.subject === layoutId && j.language === "zh")
      expect(job, layoutId).toBeTruthy()
      return job!.ir.slides[0]!.components[0]!.type
    })
    expect(new Set(leads).size, `leads: ${leads.join(", ")}`).toBeGreaterThanOrEqual(4)
  })

  it("gives image-split, image-top, and image-bottom different secondary types", async () => {
    const jobs = buildMatrix(themeIds, await assets(), { only: "layout", languages: ["zh"] })
    const secondaries = (["image-split", "image-top", "image-bottom"] as const).map((layoutId) => {
      const job = jobs.find((j) => j.subject === layoutId && j.language === "zh")
      expect(job, layoutId).toBeTruthy()
      const types = job!.ir.slides[0]!.components.map((c) => c.type)
      expect(types[0], layoutId).toBe("image")
      return types[1]
    })
    expect(new Set(secondaries).size, `secondaries: ${secondaries.join(", ")}`).toBe(3)
  })
})

describe("gallery corpus", () => {
  it("renders every page in every table through the real render chain", async () => {
    // Deliberately the whole matrix, not a sample: a corpus page that stops
    // rendering is a hole in the review, and which page it is cannot be
    // predicted from which code changed.
    const { renderMatrix } = await import("../evals/gallery/render")
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
    const { renderMatrix } = await import("../evals/gallery/render")
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

// Review round 4, J's re-check finding 5: `theme--ember--zh--p05` labelled
// its x axis "第一季度" — the name of the first bar, not the name of the
// dimension. The corpus was feeding a tick where an axis title belongs, on
// every chart that declared one, in all three language tracks. A reviewer
// looking at that page cannot tell a corpus mistake from a renderer one,
// which is exactly the confusion this corpus exists to remove.
describe("gallery corpus content", () => {
  /** Axis titles a component declares — the name of a dimension. */
  function axisTitles(c: Component): string[] {
    const out: (string | undefined)[] = []
    if (c.type === "chart") out.push(c.axes?.x_title, c.axes?.y_title)
    if (c.type === "heatmap" || c.type === "matrix") out.push(c.x_title, c.y_title)
    return out.filter((s): s is string => !!s)
  }

  /** Every value that gets drawn *on* those axes — ticks and series names. */
  function tickLabels(c: Component): string[] {
    if (c.type === "chart") {
      return c.series.flatMap((s) => [s.name ?? "", ...s.data.map((d) => String(d.x))])
    }
    if (c.type === "heatmap") return [...(c.x_labels ?? []), ...(c.y_labels ?? [])]
    if (c.type === "matrix") return c.items.flatMap((i) => [i.title, i.tag ?? ""])
    return []
  }

  it("names the dimension in an axis title, never repeats one of that axis's own ticks", () => {
    // Prefixed rather than merged: the three tables key several builders by
    // the same name ("chart"), and a plain spread would silently drop two of
    // the three from the sweep.
    const builders = [
      ...Object.entries(COMPONENT_BUILDERS).map(([k, v]) => [`component/${k}`, v] as const),
      ...Object.entries(CHART_VARIANTS).map(([k, v]) => [`variant/${k}`, v] as const),
      ...Object.entries(DENSITY_BUILDERS).map(([k, v]) => [`density/${k}`, v] as const),
    ]
    const clashes: string[] = []
    for (const language of LANGUAGE_IDS) {
      for (const [name, build] of builders) {
        const component = build(LEXICONS[language])
        const ticks = new Set(tickLabels(component).filter(Boolean))
        for (const title of axisTitles(component)) {
          if (ticks.has(title)) clashes.push(`${name} (${language}): axis title "${title}" is also a tick`)
        }
      }
    }
    expect(clashes).toEqual([])
  })
})

describe("gallery page", () => {
  it("stays self-contained — nothing in it reaches the network", async () => {
    const { renderMatrix } = await import("../evals/gallery/render")
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
    const { renderMatrix } = await import("../evals/gallery/render")
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
    const { renderMatrix } = await import("../evals/gallery/render")
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
    const { renderMatrix } = await import("../evals/gallery/render")
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
    const blocks = html.match(/<script id="(?:manifest|svg|edge)-data"[^>]*>([\s\S]*?)<\/script>/g) ?? []
    expect(blocks.length).toBe(3)
    for (const block of blocks) {
      const body = block.slice(block.indexOf(">") + 1, block.lastIndexOf("<"))
      expect(body.includes("<")).toBe(false)
      expect(() => JSON.parse(body.replace(/\\u003c/g, "<"))).not.toThrow()
    }
  }, 60_000)

  it("carries a paint for the box under every page it can name one for", async () => {
    // A stage left its own neutral grey survives in the slide's antialiased
    // edge column and reads as a pale line down the page — see
    // `src/lib/slide-edge.ts`. Reported against five pages of the 2026-08-20
    // review, on three unrelated themes.
    const { renderMatrix } = await import("../evals/gallery/render")
    const { mkdtempSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")

    const jobs = buildMatrix(themeIds, await assets(), { only: "theme", themeLanguage: "zh" })
    const outDir = mkdtempSync(join(tmpdir(), "pptfast-gallery-edge-"))
    const { manifest, svgs } = renderMatrix(jobs, outDir, "test")
    const html = buildGalleryHtml(manifest, svgs)

    const block = /<script id="edge-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)![1]!
    const edges = JSON.parse(block.replace(/\\u003c/g, "<")) as Record<string, string>
    // Every theme page has a colour or a gradient behind it; none is a photo.
    expect(Object.keys(edges).sort()).toEqual(manifest.pages.map((p) => p.id).sort())
    for (const [id, value] of Object.entries(edges)) {
      expect(value, id).toMatch(/^(#[0-9A-Fa-f]{6}|linear-gradient\()/)
    }
    // The stage is repainted on mount, not left on the stylesheet's neutral.
    expect(html).toContain('container.style.background = EDGES[id] || ""')
  }, 60_000)
})

// The full-load table (满载表) fills each of nine components to the largest
// count that still fits the consulting density page. Authoring cuts or
// splits content. These pages must not stamp a silent `data-dropped`
// overflow attribute or drop the block whole. Gallery review r1 retired
// the painted "+N …" copy. The drop path is now the attribute, and a
// full-load page should not reach it. A tenth component that grows a

// drop branch still fails the coverage test below until a builder is added.
describe("gallery density table", () => {
  it("renders every page at full load, with no drop marker and no silent drop", async () => {
    const { renderMatrix } = await import("../evals/gallery/render")
    const { mkdtempSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")

    const jobs = buildMatrix(themeIds, await assets(), { only: "density" })
    const outDir = mkdtempSync(join(tmpdir(), "pptfast-gallery-density-"))
    const { svgs } = renderMatrix(jobs, outDir, "test")

    const marked = [...svgs].filter(([, svg]) => /data-dropped="[1-9]/.test(svg)).map(([id]) => id)
    expect(marked, "these full-load pages still stamp data-dropped. lower their item counts").toEqual([])

    const painted = [...svgs].filter(([, svg]) => /\+\d+ …/.test(svg)).map(([id]) => id)
    expect(painted, "painted +N copy must stay gone").toEqual([])

    const swallowed = [...svgs].filter(([, svg]) => svg.includes("data-dropped-silent")).map(([id]) => id)
    expect(swallowed, "the component was dropped whole instead of fitting").toEqual([])
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
      .filter((f) => /data-dropped=\{/.test(readFileSync(join(dir, f), "utf8")))

    expect(
      Object.keys(DENSITY_BUILDERS).length,
      `${drawers.length} components draw a data-dropped marker (${drawers.join(", ")}) but the density ` +
        `table covers ${Object.keys(DENSITY_BUILDERS).length} — add a builder to DENSITY_BUILDERS`,
    ).toBe(drawers.length)
  })
})
