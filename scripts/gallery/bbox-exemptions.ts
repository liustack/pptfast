/**
 * Overflows the real-geometry pass is expected to report, because the design
 * asks for them.
 *
 * A few layouts deliberately let a glyph run past the box that holds it — a
 * chapter page's oversized ordinal is drawn as a graphic element, sized to
 * bleed off its own type box on purpose. `collectBBoxOverflows` measures ink
 * against declared boxes and cannot tell a designed bleed from a defect, so
 * the distinction is kept here instead.
 *
 * Why here and not as a `data-bleed` attribute on the element: marking it in
 * the renderer would change rendered SVG bytes, and those bytes are pinned by
 * committed goldens and preview files. This list keeps the audit honest
 * without a render-side change. If a `data-bleed` attribute is ever added to
 * the renderer for its own reasons, these entries become redundant and should
 * go.
 *
 * Each entry is deliberately narrow — a layout id *plus* the text that is
 * allowed to bleed. A blanket per-layout exemption would hide the next real
 * defect that lands on the same page.
 */

export interface BleedExemption {
  /** `data-archetype` id of the layout that draws the bleeding element. */
  readonly layout: string
  /** Which of the three checks this exempts. */
  readonly kind: "h-overflow" | "v-overflow" | "page-overflow"
  /** Matched against the text the finding names (its first 24 characters). */
  readonly text: RegExp
  /** Why this is a design decision rather than a defect. */
  readonly why: string
}

export const DESIGNED_BLEED: readonly BleedExemption[] = [
  {
    layout: "rail-chapter",
    kind: "page-overflow",
    // The chapter ordinal only. Any other text bleeding off this layout is
    // still a defect.
    text: /^\d{1,3}$/,
    // `chapter-rail-chapter.tsx`: font-size 260 at 6% opacity, baseline 650,
    // right-anchored at x=1224. A watermark sized to run off the bottom edge,
    // not a label that failed to fit.
    why: "rail-chapter's oversized chapter ordinal is a 6%-opacity watermark, drawn to bleed past the bottom edge",
  },
]

/** The exemption matching this finding, if any. */
export function bleedExemption(
  finding: { readonly layout: string; readonly kind: string; readonly label: string },
  list: readonly BleedExemption[] = DESIGNED_BLEED,
): BleedExemption | undefined {
  return list.find((e) => e.layout === finding.layout && e.kind === finding.kind && e.text.test(finding.label))
}
