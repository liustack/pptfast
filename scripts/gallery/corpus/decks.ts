/**
 * Turns the corpus into whole decks — the two tables `D2` settled on.
 *
 * Theme table: every theme runs the same nine-page deck, so a reviewer
 * comparing two themes is looking at one variable. Layout/component table:
 * one page each, pinned, on a fixed baseline theme, so a reviewer comparing
 * two layouts is likewise looking at one variable. Nothing here picks a
 * layout implicitly — every page in the second table carries an explicit
 * `layout` pin, because auto-selection reshuffling between runs would make
 * the review non-reproducible.
 *
 * A third page shape was added later: the density table (`densityPage`),
 * which asks what the nine drop-capable components look like once the
 * content does not fit. Every other page in this file is sized so it does
 * fit — that is the whole point of the two tables above, and the reason
 * the degrade path needed a table of its own to be seen at all.
 */

import type { Component, PptxIR, Slide } from "@/ir"
import { FULL_BODY_TYPES } from "@/svg/component-traits"
import { LAYOUT_REGISTRY, type LayoutDefinition } from "@/svg/layouts/registry"
import { COMPONENT_BUILDERS, LOGO_ASSETS, PHOTO_ASSETS, SCREENSHOT_ASSET } from "./components"
import type { Lexicon } from "./lexicon"
import { placeholderImage, placeholderLogo, placeholderScreenshot } from "./placeholders"

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
    // Meta drives the cover/ending chrome (organization line, author
    // credits, date, confidentiality mark), so it is filled rather than
    // left default — that chrome is part of what is under review.
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
// Theme table — one nine-page deck, rendered once per theme
// ─────────────────────────────────────────────────────────────────────────

/**
 * The nine pages a real deck actually contains, in the order it contains
 * them: an opening, a section break, and the body shapes that carry most
 * of the weight in practice — an argument in prose, headline numbers, a
 * chart, a comparison, a picture, a pull quote — then a close.
 *
 * Layouts are left unpinned here on purpose. This table asks "does this
 * theme look good doing its own thing", and its own thing includes which
 * layout it reaches for. The `seed` on the deck keeps that choice stable.
 */
export function themeDeck(themeId: string, lex: Lexicon, assets: CorpusAssets): PptxIR {
  const b = COMPONENT_BUILDERS
  const slides: Slide[] = [
    { type: "cover", heading: lex.deckTitle, subheading: lex.deckSubtitle, components: [] },
    { type: "chapter", heading: lex.chapters[0]!, subheading: lex.kickers[0], components: [] },
    {
      // A full paragraph *and* five bullets is more than one content rect
      // holds, and the deck audit reported the overflow on all 17 themes —
      // the corpus authoring the page badly, not the themes failing. Three
      // bullets under the paragraph is what a real page of this shape
      // carries.
      type: "content",
      heading: lex.headings[0]!,
      components: [b.paragraph!(lex), { type: "bullets", items: lex.bullets.slice(0, 3), style: "default" }],
      footnote: lex.sources[0]!.label,
    },
    { type: "content", heading: lex.headings[1]!, components: [b.kpi_cards!(lex)] },
    { type: "content", heading: lex.headings[2]!, components: [b.chart!(lex)] },
    { type: "content", heading: lex.headings[3]!, components: [b.steps!(lex), b.callout!(lex)] },
    { type: "content", heading: lex.headings[4]!, components: [b.comparison!(lex)] },
    { type: "content", heading: lex.headings[5]!, components: [b.image!(lex), b.paragraph!(lex)] },
    { type: "content", heading: lex.headings[6]!, components: [b.quote!(lex)] },
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
  return Math.max(1, Math.min(...counted.map((s) => s.capacity!)))
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
export function layoutPage(layoutId: string, lex: Lexicon, assets: CorpusAssets): PptxIR {
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
              heading: lex.headings[7]!,
              components: bodyFor(def, lex),
              footnote: lex.sources[1]!.label,
              ...(def.kind === "takeover" ? { image_side: "right" as const } : {}),
            }

  // A takeover layout draws the picture itself from the slide's own image
  // component, so it needs one present whatever its body capacity says.
  if (def.kind === "takeover" && slide.components.every((c) => c.type !== "image")) {
    slide.components = [COMPONENT_BUILDERS.image!(lex), ...slide.components].slice(0, 2)
  }

  return deckShell(lex, assets, BASELINE_THEME, `layout-${layoutId}-${lex.id}`, [slide])
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
): PptxIR {
  const component = build(lex)
  const solo = FULL_BODY_TYPES.has(component.type)

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
  return deckShell(lex, assets, BASELINE_THEME, `component-${safeId}-${lex.id}`, [slide])
}

// ─────────────────────────────────────────────────────────────────────────
// Density table — one deliberately over-capacity component per page
// ─────────────────────────────────────────────────────────────────────────

/**
 * One overfilled component (`DENSITY_BUILDERS`), alone on the page.
 *
 * Alone is the whole trick. `layoutContentFit` drops a block whole when it
 * does not fit alongside its neighbours, and a component's own truncation
 * budget only applies once nothing at all fits — so an overfilled component
 * sharing a page with the component table's lead-in paragraph gets deleted
 * at the slide level and never reaches its own "+N …" branch. Measured
 * with the lead-in in place: every component that overflows vertically was
 * deleted whole, and 15 of these 27 pages rendered the lead-in and nothing
 * else. Solo hands the component the entire content rect, and the only way
 * left to fit is the one this table exists to show.
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
