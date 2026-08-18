import type { Component, PptxIR, Slide } from "@/ir"
import { renderSlideSvg } from "../api"
import { getPlatform } from "../platform/registry"
import { resolveStyle } from "../themes"
import { CANONICAL_THEME_IDS, THEME_LABELS, type CanonicalThemeId } from "../themes/index"
import { getThemeDefinition, type ThemeDefinition } from "../themes/definitions"
import type { StyleColors } from "../themes/tokens"
import { parseTransform } from "./audit/svg-audit"

type ImageComponent = Extract<Component, { type: "image" }>

/**
 * Real rendered frame for one image slot, in canvas px (0-1280 × 0-720 —
 * `../constants`'s `CANVAS_W_PX`/`CANVAS_H_PX`). This is the whole point of
 * this module (asset-brief plan, 裁定 1): it comes from parsing an actual
 * render pass's SVG output, never from hand-copying `image.tsx`'s
 * `w * 0.5`/`MAX_IMAGE_H` constants — those change independently of this
 * file, and a shadow copy would silently start lying the day they do.
 */
export interface AssetBriefFrame {
  x: number
  y: number
  w: number
  h: number
  /** e.g. "2:1" when w:h reduces to a small clean ratio, else "1.63:1". */
  aspect: string
}

export interface AssetBriefFit {
  mode: "cover" | "contain"
  /** One sentence: crop behavior + safe-zone guidance for a generator. */
  note: string
}

export interface AssetBriefPalette {
  /** Deduplicated theme hex values, in `StyleColors`' own field order. */
  hexes: string[]
  primary: string
  accent: string
}

export interface AssetBriefMood {
  /** `ThemeDefinition.tags` passed through as-is (empty for every one of
   *  the 13 builtins today — none has adopted this field yet — but a
   *  registered custom theme may set it). */
  tags: readonly string[]
  /** One sentence assembled from the theme's own label/motif — never a
   *  hand-written per-theme paragraph (asset-brief plan 裁定: "不新写 13 段
   *  文案"). */
  description: string
}

export interface AssetBriefPage {
  index: number
  id?: string
  type: Slide["type"]
  heading?: string
}

export interface AssetBriefItem {
  page: AssetBriefPage
  asset_id: string
  /** `ir.assets.images[asset_id].alt` passed straight through (A11Y-01 alt
   *  chain wave, task 1) — this is already a per-asset structure, so a
   *  generator agent filling in `missing`/`suggested_prompt` items sees
   *  right alongside them which ids already have an accessibility
   *  description written and which don't. Omitted (not an empty string)
   *  when the asset has no `alt` — same "don't fabricate a value that
   *  isn't there" discipline the rest of this file already follows for
   *  `frame`/`suggested_pixels`. */
  alt?: string
  /** Discriminant reserved for v2 (asset-brief plan 裁定 4): only `"image"`
   *  is produced today (one `AssetBriefItem` per `image` component, or per
   *  shared frame — see `shared` below). `"background"` is the documented
   *  extension slot for background asset specs, deliberately not built in
   *  v1 (no `background` geometry extraction exists yet) — this field lets
   *  a future v2 add it without a breaking shape change for consumers that
   *  already switch on `kind`. */
  kind: "image"
  /** No usable `src` in `ir.assets.images` for this `asset_id` — this is a
   *  generation to-do item, not a defect (asset-brief plan 裁定 2). */
  missing: boolean
  /** `false` when the selected layout dropped this image component
   *  entirely (e.g. an overflow guard) — still listed rather than silently
   *  dropped (task brief's explicit requirement). `frame`/`suggested_pixels`
   *  are omitted in that case; there is no real geometry to report. */
  rendered: boolean
  frame?: AssetBriefFrame
  /** 2× the frame's own pixel dimensions — omitted alongside `frame` when `rendered` is false. */
  suggested_pixels?: { w: number; h: number }
  fit: AssetBriefFit
  palette: AssetBriefPalette
  mood: AssetBriefMood
  /** One English paragraph, paste-ready for an image-generation tool. */
  suggested_prompt: string
  /** True when this item's `frame` cannot be attributed to one specific
   *  `image` component: `occurrenceCount` (>=2) `image` components on this
   *  same page share this `asset_id`. Because a shared `asset_id` resolves
   *  to the exact same dummy href in the render-only pass, every occurrence
   *  produces an *identical* `<image>` `href` in the rendered SVG — there is
   *  no signal left to tell which `<image>` element came from which
   *  component, in principle, not just in this implementation. Rather than
   *  guess (see `buildAssetBrief`'s own doc comment for the bug this
   *  replaced), every real rendered frame for the shared `asset_id` gets its
   *  own item, all flagged `shared: true`, none claiming a specific
   *  component. Omitted (not `false`) for the single-occurrence case — the
   *  overwhelmingly common one — so that path's output shape is byte-for-
   *  byte what it was before this field existed. */
  shared?: true
  /** Present iff `shared` is true: how many `image` components on this page
   *  reference this same `asset_id`. */
  occurrenceCount?: number
}

export interface AssetBrief {
  theme: string
  items: AssetBriefItem[]
}

/**
 * A 1×1 transparent PNG, reused as the dummy asset every referenced
 * `asset_id` gets overridden to for the render-only pass below (asset-brief
 * plan 裁定 2). Its own pixel content is never inspected — only the `<image>`
 * geometry the renderer places it into matters — so one shared constant
 * asset is enough regardless of how many image slots a deck has.
 */
const DUMMY_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

interface RawImageFrame {
  x: number
  y: number
  w: number
  h: number
  preserveAspectRatio: string
}

/**
 * Extract every `<image>` element's *absolute* canvas geometry out of one
 * rendered slide's SVG markup, keyed by the `#<asset_id>` fragment the
 * render-only override below appends to every dummy `href` (so this never
 * needs to guess which `<image>` belongs to which component — see
 * `buildAssetBrief`'s own comment on the override for why the fragment
 * always survives verbatim into the output).
 *
 * Parses via `DOMParser` behind the platform seam (`getPlatform().domParser
 * ?? globalThis.DOMParser`) — the exact same seam and the exact same
 * `parseTransform` accumulation `./audit/svg-audit.ts`'s `auditSvgMarkup`
 * already uses to walk a rendered slide's real transform stack. Iron rule 3
 * (`src/index.ts`'s dependency closure must stay Node-free) is why this
 * isn't a `linkedom` import: the platform seam is what keeps this file
 * usable in a browser (native `DOMParser`) and in Node (`installNodePlatform()`
 * registers linkedom's) alike, without this module ever importing either
 * directly. A hand-rolled regex tokenizer could also track `<g transform>`
 * nesting well enough for this renderer's own output shapes, but would be a
 * second, bespoke implementation of exactly what `parseTransform` already
 * does correctly for every existing consumer — reusing it is less code and
 * cannot drift from the audit path's own geometry truth.
 */
function extractImageFrames(markup: string): Map<string, RawImageFrame[]> {
  const Parser = getPlatform().domParser ?? globalThis.DOMParser
  if (!Parser) {
    throw new Error(
      'DOMParser unavailable — in Node, call installNodePlatform() from "@liustack/pptfast/node" first (the pptfast CLI does this automatically)',
    )
  }
  const doc = new Parser().parseFromString(markup, "image/svg+xml")
  const byAssetId = new Map<string, RawImageFrame[]>()

  const visit = (el: Element, ox: number, oy: number, os: number) => {
    const { dx, dy, scale } = parseTransform(el)
    const ax = ox + os * dx
    const ay = oy + os * dy
    const as = os * scale
    if (el.tagName.toLowerCase() === "image") {
      const href = el.getAttribute("href") ?? ""
      const hashAt = href.indexOf("#")
      if (hashAt !== -1) {
        const assetId = href.slice(hashAt + 1)
        const frame: RawImageFrame = {
          x: ax + as * Number(el.getAttribute("x") ?? 0),
          y: ay + as * Number(el.getAttribute("y") ?? 0),
          w: as * Number(el.getAttribute("width") ?? 0),
          h: as * Number(el.getAttribute("height") ?? 0),
          preserveAspectRatio: el.getAttribute("preserveAspectRatio") ?? "xMidYMid meet",
        }
        const list = byAssetId.get(assetId)
        if (list) list.push(frame)
        else byAssetId.set(assetId, [frame])
      }
    }
    for (const child of Array.from(el.children)) visit(child, ax, ay, as)
  }
  visit(doc.documentElement, 0, 0, 1)
  return byAssetId
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a))
  let y = Math.abs(Math.round(b))
  while (y !== 0) [x, y] = [y, x % y]
  return x || 1
}

/**
 * "2:1" when `w/h` lands within 1% of a small `n:d` ratio (`d` up to 12 —
 * covers every whole/half/thirds ratio this renderer's fixed slot math
 * produces, e.g. 613×307's 1.9967 ≈ 2/1), else a 2-decimal "1.63:1" fallback.
 * `w`/`h` are already-rounded canvas px, so false near-misses from float
 * noise (not real ratio ambiguity) are the only thing the tolerance guards
 * against.
 */
function formatAspect(w: number, h: number): string {
  if (h <= 0 || w <= 0) return `${w}:${h}`
  const ratio = w / h
  const TOL = 0.01
  for (let d = 1; d <= 12; d++) {
    const n = Math.round(ratio * d)
    if (n >= 1 && Math.abs(ratio - n / d) <= TOL) {
      const g = gcd(n, d)
      return `${n / g}:${d / g}`
    }
  }
  return `${ratio.toFixed(2)}:1`
}

function toFrame(raw: RawImageFrame): AssetBriefFrame {
  const w = Math.round(raw.w)
  const h = Math.round(raw.h)
  return { x: Math.round(raw.x), y: Math.round(raw.y), w, h, aspect: formatAspect(w, h) }
}

function buildFit(mode: ImageComponent["fit"], aspect: string | undefined): AssetBriefFit {
  if (mode === "cover") {
    return {
      mode,
      note: aspect
        ? `Cover crop (xMidYMid slice): generate close to ${aspect} to avoid any crop — otherwise the renderer center-crops to fill the frame, so keep essential subject matter within the center safe zone.`
        : `Cover crop (xMidYMid slice): the renderer center-crops to fill the frame — keep essential subject matter centered.`,
    }
  }
  return {
    mode,
    note: aspect
      ? `Contain fit (xMidYMid meet): the renderer letterboxes to show the whole image inside the frame with no crop — match ${aspect} to avoid empty margins.`
      : `Contain fit (xMidYMid meet): the renderer letterboxes to show the whole image inside the frame with no crop.`,
  }
}

/**
 * Dedupe theme identity colors into a flat hex list, in `StyleColors`' own
 * field order — deliberately excludes `chartPalette`/`accentPool` (data-viz
 * and multi-accent-cycling pools respectively, not the theme's core
 * identity a photo brief should pull from).
 */
function buildPalette(colors: StyleColors): AssetBriefPalette {
  const candidates = [colors.bg, colors.surface, colors.panel, colors.primary, colors.accent, colors.text, colors.muted, colors.border]
  const hexes = [...new Set(candidates.filter((c): c is string => Boolean(c)))]
  return { hexes, primary: colors.primary, accent: colors.accent }
}

function themeLabel(id: string): string {
  return (CANONICAL_THEME_IDS as readonly string[]).includes(id) ? THEME_LABELS[id as CanonicalThemeId] : id
}

function humanizeMotif(motif: string): string {
  return motif.replace(/-motif$/, "").replace(/-/g, " ")
}

/**
 * One assembled sentence from the theme's own already-declared label/tags/
 * motif — never a 13-theme hand-written paragraph set (asset-brief plan's
 * own explicit constraint). Every one of the 13 builtins has an empty
 * `tags` array today (none has adopted the field yet), so `tagPhrase` is a
 * no-op for all of them right now and only starts contributing once a theme
 * (builtin or registered) actually sets one.
 */
function buildMood(themeId: string, themeDef: ThemeDefinition): AssetBriefMood {
  const label = themeLabel(themeId)
  const tagPhrase = themeDef.tags.length > 0 ? ` (${themeDef.tags.join(", ")})` : ""
  const motifPhrase = themeDef.motif ? ` with a ${humanizeMotif(themeDef.motif)} decorative motif` : ""
  return { tags: themeDef.tags, description: `${label} theme${tagPhrase}${motifPhrase}.` }
}

function buildPrompt(mood: AssetBriefMood, palette: AssetBriefPalette, frame: AssetBriefFrame | undefined, fit: AssetBriefFit): string {
  const supporting = palette.hexes.filter((h) => h !== palette.primary && h !== palette.accent)
  const paletteText = `Color palette: primary ${palette.primary}, accent ${palette.accent}${supporting.length > 0 ? `, supporting tones ${supporting.join(", ")}` : ""}.`
  const compositionText = frame
    ? `Compose for a ${frame.aspect} frame. ${fit.note}`
    : `Frame geometry unavailable — this image slot was not rendered under the deck's currently selected layout; generate at a versatile aspect ratio and verify placement once a layout renders it.`
  return `${mood.description} ${paletteText} ${compositionText}`
}

/**
 * Build an image-generation brief for every `image` component in a deck: the
 * real rendered frame (from an actual render pass — see `extractImageFrames`),
 * fit/crop mode with a safe-zone note, suggested generation pixels (2× the
 * frame), the resolved theme's palette/mood, and a paste-ready English
 * `suggested_prompt`. Pure function of `ir` (same input → same output, proven
 * by `asset-brief.test.ts`'s double-call check) — like `auditDeck`, it never
 * mutates its argument and never touches the filesystem or network.
 *
 * v1 scope (asset-brief plan 裁定 4): only `image`-typed components — not
 * `image_grid`/`image_compare` (separate component types with their own
 * asset_id arrays), and not `background` asset specs. Both are natural v2
 * extensions of this same shape and are deliberately left off `AssetBrief`
 * rather than bolted on half-done.
 *
 * Missing-asset handling (裁定 2): every `image` component's `asset_id`,
 * present or not, gets overridden to the same dummy 1×1 PNG (tagged with a
 * `#<asset_id>` fragment) in an in-memory copy of `ir` used *only* for this
 * function's own extraction render pass — `ir` itself, and the real render/
 * export path, never see this override. `missing` below is decided from the
 * real `ir.assets.images` (before the override), so it still accurately
 * reports "nothing usable was ever supplied here" even though the
 * extraction render always has *something* to draw. Overriding every
 * asset_id uniformly (not just the missing ones) is what makes the fragment
 * a reliable identifier regardless of whether the real asset was already
 * resolved — the alternative (leaving resolved assets' real `src` alone)
 * would have no way to tell two different real images' hrefs apart when a
 * page has more than one.
 *
 * Known limitation: an `asset_id` shared between an `image` component and a
 * `background` asset spec on the same page would get the same dummy
 * fragment on both, which could ambiguate which rendered `<image>` this
 * function attributes to the component — rare in practice (v1 doesn't cover
 * background geometry at all, see above) and left as a documented gap
 * rather than engineered around.
 *
 * Shared-`asset_id` handling (task reviewer finding, fixed after v1's first
 * pass): the IR schema places no uniqueness constraint on `asset_id`
 * (`src/ir/index.ts`) — two different `image` components on the same page
 * legally reference the same one. Because the override above (deliberately)
 * maps a shared `asset_id` to one shared dummy href, both occurrences render
 * an *identical* `<image href>` — the rendered SVG carries no signal left to
 * tell them apart. (v1's first pass tried anyway: a FIFO queue keyed by
 * `asset_id`, drained in `slide.components` order under the assumption that
 * extraction order would match — it doesn't in general, e.g.
 * `content-image-lead-split.tsx` renders its narrow-column body *before*
 * its visual-lead column in the JSX it returns, so the queue was backwards
 * and every frame ended up attributed to the wrong occurrence. Not a fixable
 * ordering bug: no ordering convention could be relied on across every
 * layout's own JSX emission order, present and future.) The honest fix:
 * per page, group `image` components by `asset_id` first. A group of size 1
 * (the overwhelmingly common case) keeps the exact single-item shape this
 * function always produced. A group of size >1 abandons per-component
 * attribution entirely — it emits one item per *real rendered frame* for
 * that `asset_id` (not per component), each flagged `shared: true` with the
 * group's `occurrenceCount`, so every real frame is still reported (nothing
 * silently dropped) without asserting a specific component<->frame pairing
 * that cannot be known. If fewer frames render than there are occurrences
 * (e.g. the layout dropped one), the shortfall is padded with `rendered:
 * false` shared items so the count of components sharing the id is still
 * fully visible to a reader of the brief.
 */
export function buildAssetBrief(ir: PptxIR): AssetBrief {
  const themeDef = getThemeDefinition(ir.theme.id)
  const tokens = resolveStyle(ir.theme.id, ir.theme.style)
  const palette = buildPalette(tokens.colors)
  const mood = buildMood(ir.theme.id, themeDef)

  const occurrences: { slideIndex: number; component: ImageComponent }[] = []
  ir.slides.forEach((slide, slideIndex) => {
    for (const component of slide.components) {
      if (component.type === "image") occurrences.push({ slideIndex, component })
    }
  })

  const overrides: PptxIR["assets"]["images"] = {}
  for (const { component } of occurrences) {
    overrides[component.asset_id] = { src: `${DUMMY_PNG_DATA_URI}#${component.asset_id}` }
  }
  const renderIr: PptxIR = { ...ir, assets: { images: { ...ir.assets.images, ...overrides } } }

  const framesBySlide = new Map<number, Map<string, RawImageFrame[]>>()
  for (const slideIndex of new Set(occurrences.map((o) => o.slideIndex))) {
    framesBySlide.set(slideIndex, extractImageFrames(renderSlideSvg(renderIr, slideIndex)))
  }

  const items: AssetBriefItem[] = []
  ir.slides.forEach((slide, slideIndex) => {
    // Group this page's `image` components by `asset_id`, preserving each
    // id's first-encounter order — same overall item ordering the old flat
    // `occurrences.map` produced for the (overwhelmingly common)
    // one-component-per-asset_id case.
    const groups = new Map<string, ImageComponent[]>()
    for (const component of slide.components) {
      if (component.type !== "image") continue
      const list = groups.get(component.asset_id)
      if (list) list.push(component)
      else groups.set(component.asset_id, [component])
    }
    if (groups.size === 0) return

    const page: AssetBriefPage = { index: slideIndex, id: slide.id, type: slide.type, heading: slide.heading }
    const frameMap = framesBySlide.get(slideIndex)
    const isMissing = (assetId: string) => !ir.assets.images[assetId]?.src
    const altOf = (assetId: string) => ir.assets.images[assetId]?.alt

    for (const [assetId, group] of groups) {
      const frames = frameMap?.get(assetId) ?? []

      if (group.length === 1) {
        // Unchanged single-occurrence path — exact same output as before
        // this fix (task requirement).
        const raw = frames[0]
        const frame = raw ? toFrame(raw) : undefined
        const fit = buildFit(group[0]!.fit, frame?.aspect)
        items.push({
          page,
          asset_id: assetId,
          alt: altOf(assetId),
          kind: "image",
          missing: isMissing(assetId),
          rendered: frame !== undefined,
          frame,
          suggested_pixels: frame ? { w: frame.w * 2, h: frame.h * 2 } : undefined,
          fit,
          palette,
          mood,
          suggested_prompt: buildPrompt(mood, palette, frame, fit),
        })
        continue
      }

      // Shared asset_id, >1 occurrence on this page — see this function's
      // own doc comment ("Shared-asset_id handling") for why per-component
      // attribution is skipped rather than guessed. `fit` mode is read off
      // the group's first component; if occurrences disagree on `fit` that
      // choice is a documented simplification, not a claim about which
      // occurrence any one frame belongs to.
      const occurrenceCount = group.length
      const sharedFit = group[0]!.fit
      const missing = isMissing(assetId)
      for (const raw of frames) {
        const frame = toFrame(raw)
        const fit = buildFit(sharedFit, frame.aspect)
        items.push({
          page,
          asset_id: assetId,
          alt: altOf(assetId),
          kind: "image",
          missing,
          rendered: true,
          frame,
          suggested_pixels: { w: frame.w * 2, h: frame.h * 2 },
          fit,
          palette,
          mood,
          shared: true,
          occurrenceCount,
          suggested_prompt: buildPrompt(mood, palette, frame, fit),
        })
      }
      // Fewer real frames than occurrences: pad with `rendered: false`
      // shared items so the full occurrenceCount stays visible rather than
      // silently under-reporting how many components reference this id.
      for (let i = frames.length; i < occurrenceCount; i++) {
        const fit = buildFit(sharedFit, undefined)
        items.push({
          page,
          asset_id: assetId,
          alt: altOf(assetId),
          kind: "image",
          missing,
          rendered: false,
          fit,
          palette,
          mood,
          shared: true,
          occurrenceCount,
          suggested_prompt: buildPrompt(mood, palette, undefined, fit),
        })
      }
    }
  })

  return { theme: ir.theme.id, items }
}
