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
      type: "content",
      heading: lex.headings[0]!,
      components: [b.paragraph!(lex), b.bullets!(lex)],
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
  if (capacity <= 1) return [b.citation!(lex)]

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

  const pool: Component[] = wantsImage(def)
    ? [b.image!(lex), b.paragraph!(lex), b.bullets!(lex), b.callout!(lex)]
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
  const slide: Slide = {
    type: "content",
    heading: lex.headings[8]!,
    components: solo ? [component] : [COMPONENT_BUILDERS.paragraph!(lex), component],
    footnote: solo ? undefined : lex.sources[2]!.label,
  }
  const safeId = componentId.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")
  return deckShell(lex, assets, BASELINE_THEME, `component-${safeId}-${lex.id}`, [slide])
}
