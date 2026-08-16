/**
 * The machine-readable half of a preview bundle.
 *
 * `pptfast preview` has always written per-slide SVG files and a
 * self-contained `preview.html`. Both are for eyes: one needs a file browser
 * to make sense of, the other needs a browser window. Neither tells a
 * *program* what it is looking at — which page is which, what the slide
 * dimensions are, which pages the audit flagged — so every consumer that
 * wanted to show a deck had to either re-render it or scrape the HTML.
 *
 * `manifest.json` is that missing piece, and it is deliberately small: a
 * flat page list with stable ids, the file each page lives in, and the
 * audit findings already computed for it. A harness with its own UI reads
 * this and draws whatever it likes; a harness without one opens the HTML
 * next to it; nothing has to re-implement the renderer to do either. That
 * split — one producer, several consumers, no second rendering path — is
 * the whole point, and it is why this file describes files on disk rather
 * than embedding anything itself.
 *
 * Pure data assembly, no `fs`: `runPreview` (`./commands.ts`) writes it, the
 * same division of labour `./preview-html.ts` already keeps.
 */

/** Schema identifier, bumped when a consumer would need to change. */
export const PREVIEW_MANIFEST_VERSION = 1 as const

export interface PreviewManifestPage {
  /**
   * Stable, filename-safe page id.
   *
   * Derived from the deck's own slide id when it has one, else from the
   * page number — never from array position alone, so a consumer holding a
   * reference to a page (a selection, a comment, a scroll position) keeps
   * it across a re-render that did not change that page.
   */
  readonly id: string
  /** 1-based page number, matching the label the preview UI shows. */
  readonly page: number
  /** `slide.type` — cover / chapter / content / ending. */
  readonly type: string
  /** Path to this page's SVG, relative to the manifest. */
  readonly file: string
  /** `slide.id` when the deck sets one. */
  readonly slideId?: string
  /** True for an unfilled page — never let one pass for finished work. */
  readonly placeholder?: boolean
  /** What the deterministic auditor found on this page, if it ran. */
  readonly findings?: readonly { readonly code: string; readonly message: string }[]
}

export interface PreviewManifest {
  readonly manifestVersion: typeof PREVIEW_MANIFEST_VERSION
  readonly generator: "pptfast preview"
  readonly pptfastVersion: string
  readonly title: string
  /** Render canvas in px — every page shares it. */
  readonly slide: { readonly width: number; readonly height: number }
  /** Present only when the audit actually ran; absent is not "clean". */
  readonly checks?: { readonly svg: string; readonly pixels: string }
  /**
   * Why the audit was skipped, when it was. A consumer must be able to tell
   * "audited, found nothing" from "never audited" — showing the second as
   * the first is the misread this whole surface is built to avoid.
   */
  readonly auditNote?: string
  readonly pages: readonly PreviewManifestPage[]
}

export interface PreviewManifestSlideInput {
  readonly index: number
  readonly type: string
  readonly id?: string
  readonly placeholder?: boolean
  readonly file: string
}

export interface PreviewManifestInput {
  readonly title: string
  readonly pptfastVersion: string
  readonly width: number
  readonly height: number
  readonly slides: readonly PreviewManifestSlideInput[]
  readonly findings?: readonly { page: number; code: string; message: string }[]
  readonly checks?: { svg: string; pixels: string }
  readonly auditNote?: string
}

/** Filename-safe id from a slide id, falling back to the page number. */
function pageSlug(slide: PreviewManifestSlideInput): string {
  const raw = slide.id?.trim()
  if (raw) {
    const safe = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    if (safe) return safe
  }
  return `page-${String(slide.index + 1).padStart(3, "0")}`
}

/**
 * Page ids for a whole deck, guaranteed distinct.
 *
 * Slugging is lossy — `"Q2 Cover"` and `"q2-cover"` are two legal, distinct
 * slide ids that reduce to the same slug — and these ids are exactly what a
 * consumer anchors a selection, a comment or a scroll position to. Two pages
 * sharing one would send those to the wrong page, so a repeat falls back to
 * the page-number form, which cannot collide with anything.
 */
function pageIds(slides: readonly PreviewManifestSlideInput[]): string[] {
  const taken = new Set<string>()
  return slides.map((slide) => {
    const slug = pageSlug(slide)
    if (!taken.has(slug)) {
      taken.add(slug)
      return slug
    }
    const fallback = `page-${String(slide.index + 1).padStart(3, "0")}`
    taken.add(fallback)
    return fallback
  })
}

export function buildPreviewManifest(input: PreviewManifestInput): PreviewManifest {
  const byPage = new Map<number, { code: string; message: string }[]>()
  for (const f of input.findings ?? []) {
    const list = byPage.get(f.page) ?? []
    list.push({ code: f.code, message: f.message })
    byPage.set(f.page, list)
  }

  const ids = pageIds(input.slides)
  const pages: PreviewManifestPage[] = input.slides.map((slide, i) => {
    const findings = byPage.get(slide.index + 1) ?? []
    return {
      id: ids[i]!,
      page: slide.index + 1,
      type: slide.type,
      file: slide.file,
      ...(slide.id !== undefined ? { slideId: slide.id } : {}),
      ...(slide.placeholder ? { placeholder: true } : {}),
      ...(findings.length > 0 ? { findings } : {}),
    }
  })

  return {
    manifestVersion: PREVIEW_MANIFEST_VERSION,
    generator: "pptfast preview",
    pptfastVersion: input.pptfastVersion,
    title: input.title,
    slide: { width: input.width, height: input.height },
    ...(input.checks !== undefined ? { checks: input.checks } : {}),
    ...(input.auditNote !== undefined ? { auditNote: input.auditNote } : {}),
    pages,
  }
}
