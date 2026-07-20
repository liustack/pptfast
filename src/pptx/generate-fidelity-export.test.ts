import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { generatePptxBlob } from "./generate"
import { COMPONENT_TYPES, type Component, type PptxIR, type Slide } from "@/ir"

/**
 * Regression guard for the "zero unexpected rasterization" fidelity
 * invariant (borrow-wave, task 1). Across the whole conversion chain
 * (`svg2pptx/dispatch.ts`'s `svgToOps`/`leafToOp` → `svg2pptx/render.ts`'s
 * `renderOp`), the only SVG leaf that can ever become a `<p:pic>` is
 * `<image>` backed by a real, resolvable asset (the `image` op case →
 * pptxgenjs `addImage`). Every other leaf — `<rect>`/`<circle>`/`<ellipse>`/
 * `<line>`/`<polygon>`/`<polyline>`/`<path>`/`<text>`, including every
 * lucide icon primitive in `src/svg/icons.tsx` — lands as a native shape,
 * connector, custGeom, or text run, never a picture. Every `<image>`-
 * emitting call site (`image.tsx`, `image-grid.tsx`, `image-compare.tsx`,
 * `Background.tsx`'s asset background, `BrandChrome.tsx`'s logo, and
 * `ImagePages.tsx`'s 4 `image-*` takeover layouts) resolves a real asset
 * first and falls back to a placeholder — a `<rect>` for content image
 * slots, or simply omits itself for the optional brand-chrome logo — when
 * one is missing, never to `<image>`. Until this file, that invariant had
 * no regression coverage: nothing would fail if a future change made some
 * decorative motif or a "screenshot fallback" start emitting a raster
 * image.
 *
 * Proven two ways against the real `generatePptxBlob` (never a mock, same
 * posture as this directory's `all-themes.test.ts` and
 * `generate-notes-export.test.ts`):
 *
 * 1. `noAssetIr()` — one deck covering every registered `COMPONENT_TYPES`
 *    entry (completeness self-checked below, same discipline
 *    `full-matrix-contrast.test.ts`'s `MUTED_SURFACE_CLASS` guard already
 *    uses — it fails the moment a 29th component type ships uncovered)
 *    with `assets.images` empty. The 3 image-family types
 *    (`image`/`image_grid`/`image_compare`) are deliberately included, each
 *    referencing an asset id that resolves to nothing, so the deck
 *    exercises their missing-asset fallback rather than just omitting them
 *    — exports with `ppt/media/` empty and zero `<p:pic>` on every slide.
 * 2. `withAssetIr()` — the same deck plus one appended slide holding one
 *    real `image` component backed by one real (1x1 PNG) asset — exports
 *    with the delta exactly +1 media part and +1 `<p:pic>`, landing on
 *    exactly that new slide. Every other slide, including the one carrying
 *    the 3 dangling-asset image-family components from (1), stays at zero
 *    — proving resolution is per-asset, not "some image exists in the IR
 *    somewhere."
 *
 * Sibling to `all-themes.test.ts` (same directory, same real-`generatePptxBlob`
 * posture). `svg2pptx/integration.test.ts` was the other candidate location
 * but is a single-file dispatch/render unit test (already covers one
 * `<image>` at the op-conversion level) rather than a whole-package
 * assertion, so it stays a narrower complement to this file, not a
 * replacement.
 */

const swot: Component = {
  type: "swot",
  strengths: ["Deep bench"],
  weaknesses: ["Slow procurement"],
  opportunities: ["New region"],
  threats: ["New entrant"],
}
const bmc: Component = {
  type: "bmc",
  key_partners: ["Partner"],
  key_activities: ["Activity"],
  key_resources: ["Resource"],
  value_propositions: ["Value"],
  customer_relationships: ["Relationship"],
  channels: ["Channel"],
  customer_segments: ["Segment"],
  cost_structure: ["Cost"],
  revenue_streams: ["Stream"],
}
const waterfall: Component = {
  type: "waterfall",
  items: [
    { label: "Start", value: 100, kind: "total" },
    { label: "Gain", value: 20 },
    { label: "Loss", value: -8 },
  ],
}
const gantt: Component = {
  type: "gantt",
  items: [
    { label: "Design", start: 0, end: 3 },
    { label: "Build", start: 2, end: 6 },
  ],
  axis_labels: ["W1", "W2", "W3"],
}

/** The 3 image-family types, each pointed at an asset id that is never
 *  present in `assets.images` — deliberately exercising the "asset missing
 *  → placeholder, never `<image>`" fallback rather than sidestepping it by
 *  omitting these types from the zero-asset deck. */
const imageDangling: Component = {
  type: "image",
  asset_id: "does-not-exist",
  caption: "missing asset",
  fit: "cover",
}
const imageGridDangling: Component = {
  type: "image_grid",
  items: [{ asset_id: "does-not-exist-1" }, { asset_id: "does-not-exist-2" }],
}
const imageCompareDangling: Component = {
  type: "image_compare",
  left: { asset_id: "does-not-exist-left", label: "Before" },
  right: { asset_id: "does-not-exist-right", label: "After" },
}

/** One minimal-valid instance per registered component type. */
const COMPONENT_BY_TYPE: Record<Component["type"], Component> = {
  kpi_cards: { type: "kpi_cards", items: [{ value: "42", label: "widgets", icon: "star" }] },
  chart: {
    type: "chart",
    chart_type: "bar",
    series: [{ name: "Revenue", data: [{ x: "Q1", y: 10 }, { x: "Q2", y: 14 }] }],
  },
  icon_cards: {
    type: "icon_cards",
    items: [
      { icon: "check", title: "Fast", text: "very fast indeed" },
      { icon: "star", title: "Good", text: "very good indeed" },
    ],
  },
  callout: { type: "callout", variant: "info", text: "note this", icon: "info" },
  swot,
  bmc,
  waterfall,
  gantt,
  flowchart: {
    type: "flowchart",
    nodes: [
      { id: "a", label: "Start", kind: "round" },
      { id: "b", label: "Decide", kind: "diamond" },
    ],
    edges: [{ from: "a", to: "b", label: "go" }],
  },
  architecture: { type: "architecture", layers: [{ title: "Frontend", items: ["React", "SVG"] }] },
  timeline: {
    type: "timeline",
    milestones: [
      { date: "2026-01", title: "Kickoff", highlight: true },
      { date: "2026-06", title: "GA" },
    ],
  },
  comparison: {
    type: "comparison",
    columns: ["A", "B"],
    rows: [{ label: "Speed", cells: ["fast", "slow"] }],
  },
  row_cards: {
    type: "row_cards",
    items: [
      { icon: "check", title: "Item one", text: "detail", sub: "sub" },
      { icon: "star", title: "Item two", text: "detail" },
      { title: "Item three", text: "detail" },
    ],
  },
  steps: {
    type: "steps",
    items: [
      { title: "Step 1", text: "do this" },
      { title: "Step 2", text: "do that" },
    ],
  },
  rings: {
    type: "rings",
    items: [
      { label: "Core", desc: "center" },
      { label: "Shell", desc: "outer" },
    ],
  },
  numbered_cards: {
    type: "numbered_cards",
    items: [
      { title: "One", text: "first" },
      { title: "Two", text: "second" },
      { title: "Three", text: "third" },
    ],
  },
  roadmap: {
    type: "roadmap",
    items: [
      { title: "Phase 1", period: "0-3mo", rows: [{ label: "Goal", value: "Launch" }] },
      { title: "Phase 2", period: "3-6mo" },
    ],
  },
  matrix: {
    type: "matrix",
    x_title: "Effort",
    y_title: "Impact",
    cols: 2,
    items: [
      { title: "Quick win", tone: "accent" },
      { title: "Big bet", tone: "info" },
    ],
  },
  insight_panel: {
    type: "insight_panel",
    title: "Takeaway",
    rows: [{ label: "Signal", text: "trending up" }],
    footnote: "n=42",
  },
  verdict_banner: { type: "verdict_banner", text: "Ship it.", tone: "positive", icon: "check" },
  quote: { type: "quote", text: "Simplicity is the ultimate sophistication.", attribution: "da Vinci" },
  paragraph: { type: "paragraph", text: "This is a plain paragraph of body text for the probe deck." },
  bullets: { type: "bullets", items: ["one", "two", "three"] },
  code: { type: "code", language: "ts", code: "const x = 1" },
  citation: { type: "citation", sources: [{ label: "Source A", url: "https://example.com" }] },
  image: imageDangling,
  image_grid: imageGridDangling,
  image_compare: imageCompareDangling,
}

const ONE_PX_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

function contentSlide(heading: string, components: Component[]): Slide {
  return { type: "content", heading, components }
}

/** A rich deck covering every registered component type, with
 *  `assets.images` empty — the "zero real assets anywhere" baseline. */
function noAssetIr(): PptxIR {
  return {
    version: "4",
    filename: "fidelity-no-asset",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides: [
      { type: "cover", heading: "Fidelity Probe", subheading: "no image assets anywhere", components: [] },
      { type: "chapter", heading: "Body", components: [] },
      contentSlide("Chart + KPI", [COMPONENT_BY_TYPE.chart, COMPONENT_BY_TYPE.kpi_cards]),
      contentSlide("Icons + Callout", [COMPONENT_BY_TYPE.icon_cards, COMPONENT_BY_TYPE.callout]),
      // Full-body types (component-traits.ts's FULL_BODY_TYPES) are each
      // required to be the sole component on their slide.
      contentSlide("SWOT", [COMPONENT_BY_TYPE.swot]),
      contentSlide("BMC", [COMPONENT_BY_TYPE.bmc]),
      contentSlide("Waterfall", [COMPONENT_BY_TYPE.waterfall]),
      contentSlide("Gantt", [COMPONENT_BY_TYPE.gantt]),
      contentSlide("Flow + Architecture", [COMPONENT_BY_TYPE.flowchart, COMPONENT_BY_TYPE.architecture]),
      contentSlide("Timeline + Comparison", [COMPONENT_BY_TYPE.timeline, COMPONENT_BY_TYPE.comparison]),
      contentSlide("RowCards + Steps", [COMPONENT_BY_TYPE.row_cards, COMPONENT_BY_TYPE.steps]),
      contentSlide("Rings + Numbered", [COMPONENT_BY_TYPE.rings, COMPONENT_BY_TYPE.numbered_cards]),
      contentSlide("Roadmap + Matrix", [COMPONENT_BY_TYPE.roadmap, COMPONENT_BY_TYPE.matrix]),
      contentSlide("Insight + Verdict", [COMPONENT_BY_TYPE.insight_panel, COMPONENT_BY_TYPE.verdict_banner]),
      contentSlide("Quote + Paragraph", [COMPONENT_BY_TYPE.quote, COMPONENT_BY_TYPE.paragraph]),
      contentSlide("Bullets + Code", [COMPONENT_BY_TYPE.bullets, COMPONENT_BY_TYPE.code]),
      contentSlide("Citation", [COMPONENT_BY_TYPE.citation]),
      // The 3 image-family types, all pointed at unresolvable asset ids —
      // must fall back to a placeholder, never emit `<image>`.
      contentSlide("Image family (no resolvable asset)", [
        COMPONENT_BY_TYPE.image,
        COMPONENT_BY_TYPE.image_grid,
        COMPONENT_BY_TYPE.image_compare,
      ]),
      { type: "ending", heading: "Thanks", components: [] },
    ],
  }
}

/** `noAssetIr()` plus one appended slide holding one real `image` component
 *  backed by one real asset, inserted right before the ending slide so its
 *  slide index (and therefore its `ppt/slides/slideN.xml` part) is
 *  deterministic. */
function withAssetIr(): PptxIR {
  const base = noAssetIr()
  const endingIndex = base.slides.length - 1
  const realImageSlide = contentSlide("One Real Image", [
    { type: "image", asset_id: "photo1", caption: "a real user photo", fit: "cover" },
  ])
  return {
    ...base,
    filename: "fidelity-with-asset",
    assets: { images: { photo1: { src: ONE_PX_PNG } } },
    slides: [...base.slides.slice(0, endingIndex), realImageSlide, base.slides[endingIndex]!],
  }
}

async function mediaFiles(zip: JSZip): Promise<string[]> {
  return Object.keys(zip.files).filter((p) => p.startsWith("ppt/media/") && !zip.files[p]!.dir)
}

function slideParts(zip: JSZip): string[] {
  return Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
}

describe("component-type fixture completeness", () => {
  it("COMPONENT_BY_TYPE covers every entry in COMPONENT_TYPES — fails the moment a new component type ships uncovered", () => {
    expect(Object.keys(COMPONENT_BY_TYPE).sort()).toEqual([...COMPONENT_TYPES].sort())
  })
})

describe("zero unexpected rasterization — real generatePptxBlob, no mocks", () => {
  it("a deck covering every component type with zero real assets exports with ppt/media/ empty and zero <p:pic> on any slide", async () => {
    const blob = await generatePptxBlob(noAssetIr())
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())

    expect(await mediaFiles(zip)).toEqual([])

    const parts = slideParts(zip)
    expect(parts.length).toBeGreaterThan(0)
    for (const path of parts) {
      const xml = await zip.files[path]!.async("string")
      expect(xml, `${path} should hold zero <p:pic>`).not.toContain("<p:pic>")
    }
  })

  it("adding exactly one real image asset adds exactly +1 media file and +1 <p:pic>, landing on exactly the new slide", async () => {
    const baseZip = await JSZip.loadAsync(await (await generatePptxBlob(noAssetIr())).arrayBuffer())
    const baseMediaCount = (await mediaFiles(baseZip)).length

    const withAsset = withAssetIr()
    const newSlideIndex = withAsset.slides.findIndex((s) =>
      s.components?.some((c) => c.type === "image" && c.asset_id === "photo1"),
    )
    expect(newSlideIndex).toBeGreaterThanOrEqual(0)
    const newSlidePath = `ppt/slides/slide${newSlideIndex + 1}.xml`

    const zip = await JSZip.loadAsync(await (await generatePptxBlob(withAsset)).arrayBuffer())
    const media = await mediaFiles(zip)
    expect(media.length - baseMediaCount).toBe(1)

    const parts = slideParts(zip)
    expect(parts).toContain(newSlidePath)
    let totalPics = 0
    for (const path of parts) {
      const xml = await zip.files[path]!.async("string")
      const count = xml.match(/<p:pic>/g)?.length ?? 0
      totalPics += count
      if (path === newSlidePath) {
        expect(count, `${path} (the new real-image slide) should hold exactly one <p:pic>`).toBe(1)
      } else {
        expect(
          count,
          `${path} should hold zero <p:pic> — includes the dangling image/image_grid/image_compare slide`,
        ).toBe(0)
      }
    }
    expect(totalPics).toBe(1)
  })
})
