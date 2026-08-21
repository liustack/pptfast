/**
 * Turns the corpus into whole decks — the two tables `D2` settled on.
 *
 * Theme table: every theme runs a ten-page deck of the same shape, with
 * content leads rotating from a fixed assignment table. Layout/component table:
 * one page each, pinned, on a fixed baseline theme, so a reviewer comparing
 * two layouts is likewise looking at one variable. Nothing here picks a
 * layout implicitly — every page in the second table carries an explicit
 * `layout` pin, because auto-selection reshuffling between runs would make
 * the review non-reproducible.
 *
 * A third page shape was added later: the full-load table (`densityPage`),
 * which fills each of nine components to the largest count that still
 * fits. Every page in this file is sized so it does fit.
 */

import type { Component, PptxIR, Slide } from "@/ir"
import { FULL_BODY_TYPES } from "@/svg/component-traits"
import { LAYOUT_REGISTRY, type LayoutDefinition } from "@/svg/layouts/registry"
import { COMPONENT_BUILDERS, LOGO_ASSETS, PHOTO_ASSETS, SCREENSHOT_ASSET } from "./components"
import type { Lexicon } from "./lexicon"
import { placeholderImage, placeholderLogo, placeholderScreenshot } from "./placeholders"
import { THEME_CONTENT_SLOTS, buildThemeSlot } from "./theme-slots"

/** The theme held fixed while layouts and components are under review. */
export const BASELINE_THEME = "consulting"

export type CorpusAssets = PptxIR["assets"]

/**
 * Every asset id the corpus can reference, rasterized once per language
 * track. Async because the placeholders go through a real encoder — build
 * this once at startup and hand the result to the deck builders rather
 * than re-encoding the same twenty images for each of four hundred pages.
 */
export async function corpusAssets(lex: Lexicon): Promise<CorpusAssets> {
  const images: Record<string, { src: string; alt?: string }> = {}
  await Promise.all([
    ...PHOTO_ASSETS.map(async (id, i) => {
      images[id] = { src: await placeholderImage(id), alt: lex.captions[i % lex.captions.length]! }
    }),
    (async () => {
      images[SCREENSHOT_ASSET] = { src: await placeholderScreenshot(SCREENSHOT_ASSET), alt: lex.captions[2]! }
    })(),
    ...LOGO_ASSETS.map(async (id, i) => {
      const org = lex.orgs[i % lex.orgs.length]!
      images[id] = { src: await placeholderLogo(org), alt: org }
    }),
  ])
  return { images }
}

function deckShell(lex: Lexicon, assets: CorpusAssets, themeId: string, filename: string, slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename,
    theme: { id: themeId },
    // Meta drives the cover's own rows (organization line, author credits),
    // so it is filled rather than left default. Deck chrome stays omitted:
    // the gallery is the new default, so content and ending pages have no
    // footer rule, meta, or logo, and `date`/`confidentiality` below stay
    // off the canvas even though they are set — that is exactly what a
    // reviewer needs to see. `chrome: "full"` is the explicit declaration that
    // paints them (`src/svg/document-meta.ts`).
    meta: {
      organization: lex.author,
      authors: lex.people.slice(0, 2).map((p) => ({ name: p.name, role: p.role, org: p.org })),
      date: lex.date,
      confidentiality: "internal",
    },
    assets,
    // Pinned so layout selection, seed-dependent decor and any other
    // sampled choice reproduce byte-for-byte across runs. A gallery that
    // reshuffled between runs could not be diffed, and a reviewer could
    // not tell a real regression from a reroll.
    seed: 20260815,
    slides,
  } as PptxIR
}

// ─────────────────────────────────────────────────────────────────────────
// Theme table — one ten-page deck, rendered once per theme
// ─────────────────────────────────────────────────────────────────────────

/**
 * The ten pages a real deck actually contains, in the order it contains
 * them: an opening, a section break, seven content pages each led by a
 * different component (looked up in `THEME_CONTENT_SLOTS`), then a close.
 *
 * Layouts are left unpinned here on purpose. This table asks "does this
 * theme look good doing its own thing", and its own thing includes which
 * layout it reaches for. The `seed` on the deck keeps that choice stable.
 */
export function themeDeck(themeId: string, lex: Lexicon, assets: CorpusAssets): PptxIR {
  const slots = THEME_CONTENT_SLOTS[themeId]
  if (!slots || slots.length !== 7) {
    throw new Error(`theme table has no 7-slot assignment for ${themeId}`)
  }
  const content: Slide[] = slots.map((spec, i) => {
    const component = buildThemeSlot(spec, lex)
    return {
      type: "content" as const,
      heading: lex.headings[i]!,
      components: [component],
      ...(component.type === "data_table" ? { footnote: lex.sources[0]!.label } : {}),
    }
  })
  const slides: Slide[] = [
    { type: "cover", heading: lex.deckTitle, subheading: lex.deckSubtitle, components: [] },
    { type: "chapter", heading: lex.chapters[0]!, subheading: lex.kickers[0], components: [] },
    ...content,
    { type: "ending", heading: lex.chapters[5]!, subheading: lex.verdicts.positive, components: [] },
  ]
  return deckShell(lex, assets, themeId, `theme-${themeId}-${lex.id}`, slides)
}

// ─────────────────────────────────────────────────────────────────────────
// Layout table — one pinned page per layout
// ─────────────────────────────────────────────────────────────────────────

/** The body slot's declared capacity, or a safe default when it has none. */
function bodyCapacity(def: LayoutDefinition): number {
  const counted = def.slots.filter((s) => typeof s.capacity === "number")
  if (counted.length === 0) return 2
  // A declared 0 is a real value (mono-bleed's body slot accepts nothing) —
  // clamping it up to 1 authors a page validate-core rejects outright.
  return Math.max(0, Math.min(...counted.map((s) => s.capacity!)))
}

function wantsImage(def: LayoutDefinition): boolean {
  return def.slots.some((s) => s.name === "image" || s.name === "hero" || s.name === "lead")
}

/**
 * Body components for a content page under a given layout, filled up to the
 * layout's declared capacity and no further. Overfilling would make the
 * density gate silently drop components, and a reviewer would be judging a
 * page the renderer never intended to draw.
 */
function bodyFor(def: LayoutDefinition, lex: Lexicon): Component[] {
  const b = COMPONENT_BUILDERS
  const capacity = bodyCapacity(def)

  // A capacity-1 body is an annotation position, not a content region —
  // quote-stage's own registry entry calls it "a small attribution/footnote
  // annotation slot below an oversized heading". Feeding it a full
  // paragraph is authoring the page wrong, and the first review round spent
  // three findings on the resulting mess rather than on the layout itself.
  // One source, not the corpus' full three: the slot is ~80px tall and a
  // three-entry citation does not fit, which showed up as dropped content
  // on every quote-stage page.
  if (capacity === 0) return []

  // stat-hero's one slot is the hero itself: fed a citation, the heading has
  // to carry the 180px hero figure and the corpus' long English heading
  // overruns the render-safety floor. Author the page as intended — a KPI
  // whose value is the hero — so the heading drops to the caption row.
  if (def.id === "stat-hero") {
    const kpi = b.kpi_cards!(lex) as Component & { items?: unknown[] }
    if (Array.isArray(kpi.items)) kpi.items = kpi.items.slice(0, 1)
    return [kpi]
  }

  // Sparse and a few ordinary layouts have a body slot whose declared
  // capacity is the wrong signal: citation is the capacity-1 default, but
  // these pages draw a quote, a chart, a bento grid, or a hero+strip. Match
  // the layout's own comments rather than broadening the default.
  if (def.id === "pull-quote") return [b.quote!(lex)]
  if (def.id === "one-evidence") return [b.chart!(lex)]
  if (def.id === "bento-panel") {
    const kpi = b.kpi_cards!(lex)
    const icons = b.icon_cards!(lex)
    if (kpi.type === "kpi_cards") kpi.items = kpi.items.slice(0, 3)
    if (icons.type === "icon_cards") icons.items = icons.items.slice(0, 3)
    return [kpi, icons]
  }
  if (def.id === "stacked-poster") {
    return [b.image!(lex), { type: "paragraph", text: lex.shortParagraph }]
  }

  if (capacity <= 1) {
    const s = lex.sources[0]!
    return [{ type: "citation", sources: [{ label: s.label, ref: s.ref }] }]
  }

  // Two-column layouts split the body's height between columns but declare
  // capacity per slot, so a block sized for a full-width rect does not fit
  // a half-width one. When it doesn't, `layoutContentFit` drops it whole
  // (its truncation budget only applies when nothing at all fits), and the
  // page renders as one column of content beside an empty one — which is
  // what the first review round saw. Compact blocks, and only two of them,
  // are what a two-column page actually holds.
  const splitsColumns =
    def.arrangements === "all" || (Array.isArray(def.arrangements) && def.arrangements.includes("two_column"))
  if (splitsColumns && !wantsImage(def)) {
    return [b.bullets!(lex), b.kpi_cards!(lex)]
  }

  // Same lesson as the two-column branch above, one slot shape further on.
  // An image takeover spends most of the page on the picture and leaves the
  // prose a narrow column — `image-split` gives it 564x238, seven lines.
  // `lex.paragraph` is written for a full content rect and runs thirteen
  // lines in English, so the renderer truncated it and covered the page in
  // an ellipsis: `image-split--{en,mixed}`, `image-top--en` and
  // `image-bottom--en` were all showing the degrade path rather than the
  // layout. `lex.shortParagraph` is the same argument at the length the
  // narrow column holds.
  const pool: Component[] = wantsImage(def)
    ? [b.image!(lex), { type: "paragraph", text: lex.shortParagraph }, b.bullets!(lex), b.callout!(lex)]
    : [b.paragraph!(lex), b.bullets!(lex), b.kpi_cards!(lex), b.callout!(lex)]
  return pool.slice(0, Math.min(capacity, 3))
}

/** One page pinned onto one layout, typed to whatever that layout accepts. */
export function layoutPage(layoutId: string, lex: Lexicon, assets: CorpusAssets, themeId: string = BASELINE_THEME): PptxIR {
  const def = LAYOUT_REGISTRY[layoutId]
  if (!def) throw new Error(`unknown layout id: ${layoutId}`)
  const slideType = def.slideTypes[0]!

  const slide: Slide =
    slideType === "cover"
      ? { type: "cover", layout: layoutId, heading: lex.deckTitle, subheading: lex.deckSubtitle, components: [] }
      : slideType === "chapter"
        ? { type: "chapter", layout: layoutId, heading: lex.chapters[1]!, subheading: lex.kickers[1], components: [] }
        : slideType === "ending"
          ? { type: "ending", layout: layoutId, heading: lex.chapters[5]!, subheading: lex.verdicts.positive, components: [] }
          : {
              type: "content",
              layout: layoutId,
              // stat-hero's heading is a hero caption capped at two short
              // lines — the corpus' default row overruns its render-safety
              // floor in English. headings[11] is each lexicon's shortest.
              heading: def.id === "stat-hero" ? lex.headings[11]! : lex.headings[7]!,
              components: bodyFor(def, lex),
              footnote: lex.sources[1]!.label,
              ...(def.kind === "takeover" ? { image_side: "right" as const } : {}),
            }

  // A takeover layout draws the picture itself from the slide's own image
  // component, so it needs one present whatever its body capacity says.
  if (def.kind === "takeover" && slide.components.every((c) => c.type !== "image")) {
    slide.components = [COMPONENT_BUILDERS.image!(lex), ...slide.components].slice(0, 2)
  }

  return deckShell(lex, assets, themeId, `layout-${layoutId}-${themeId === BASELINE_THEME ? lex.id : `${themeId}-${lex.id}`}`, [slide])
}

// ─────────────────────────────────────────────────────────────────────────
// Component table — one page per component (and per chart variant)
// ─────────────────────────────────────────────────────────────────────────

/**
 * One component on one page, on the baseline theme. Full-body components
 * (swot, bmc, waterfall and the rest) must be the slide's only component —
 * that is their contract, not an accident — so nothing is added alongside.
 * Everything else gets a short lead-in paragraph, because a component is
 * almost never alone on a real slide and its spacing against neighbouring
 * text is part of what is being judged.
 */
export function componentPage(
  componentId: string,
  build: (lex: Lexicon) => Component,
  lex: Lexicon,
  assets: CorpusAssets,
  themeId: string = BASELINE_THEME,
  opts: { solo?: boolean } = {},
): PptxIR {
  const component = build(lex)
  const solo = opts.solo ?? FULL_BODY_TYPES.has(component.type)

  // A one-sentence lead-in, not the full corpus paragraph. The paragraph
  // runs long enough in English that it consumed the content rect and the
  // component under review got dropped — the review table was showing the
  // lead-in instead of the thing it exists to show, on 40 pages.
  const leadIn: Component = { type: "paragraph", text: lex.sentences[0]! }

  const slide: Slide = {
    type: "content",
    heading: lex.headings[8]!,
    components: solo ? [component] : [leadIn, component],
    footnote: solo ? undefined : lex.sources[2]!.label,
  }
  const safeId = componentId.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")
  return deckShell(lex, assets, themeId, `component-${safeId}-${lex.id}`, [slide])
}

// ─────────────────────────────────────────────────────────────────────────
// Full-load table — one component filled to its geometric ceiling per page
// ─────────────────────────────────────────────────────────────────────────

/**
 * One full-load component (`DENSITY_BUILDERS`), alone on the page.
 *
 * Alone is the whole trick. `layoutContentFit` drops a block whole when it
 * does not fit alongside its neighbours, so sharing a page with the
 * component table's lead-in paragraph would delete the component at the
 * slide level. Solo hands it the entire content rect. The counts in
 * `DENSITY_BUILDERS` are the largest that still fit that rect.
 *
 * The footnote stays because a real slide has one, and because it is part
 * of what squeezes the rect.
 */
export function densityPage(
  componentId: string,
  build: (lex: Lexicon) => Component,
  lex: Lexicon,
  assets: CorpusAssets,
): PptxIR {
  const slide: Slide = {
    type: "content",
    heading: lex.headings[9]!,
    components: [build(lex)],
    footnote: lex.sources[2]!.label,
  }
  const safeId = componentId.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")
  return deckShell(lex, assets, BASELINE_THEME, `density-${safeId}-${lex.id}`, [slide])
}
