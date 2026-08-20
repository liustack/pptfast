/**
 * Page-level content loss: `layoutContentFit` could not fit `count` blocks
 * into the content area and left them out entirely.
 *
 * Recorded, never painted. The visible "+N more" this used to draw was a
 * maintainer's debug affordance that reached customer slides (visual review
 * 2026-08-15) and nobody outside this repo can read it — so the drop is now
 * invisible on the page, which is exactly why the export refuses to ship it
 * (`checkContentDropGate`, `../pptx/generate.ts`).
 *
 * `data-dropped-silent` is what tells this apart from a component's own
 * "+N …" line (`components/bullets.tsx`, `data-table.tsx`,
 * `timeline.tsx`): those still say on the slide that something was cut, so a
 * reader is not misled and they stay an advisory `audit` finding. Both kinds
 * carry `data-dropped`, which is what `deck-audit.ts` reports on — one
 * attribute for "content was lost", one for "and the slide does not say so".
 *
 * That line is a bare sign: the count and an ellipsis, no word. A deck can be
 * in any language, and an English word printed on a Chinese slide is the same
 * "maintainer's vocabulary reached the customer" failure that made the
 * page-level marker silent (visual review 2026-08-19, G cluster). A sign needs
 * no translation and adds no per-language string, so all nine component sites
 * keep one shape. Do not put a word back into any of them, and do not branch
 * the text on the deck's language instead.
 */
export function DroppedContentMarker({ count }: { count: number }) {
  if (count <= 0) return null
  return <g data-dropped={count} data-dropped-silent={count} />
}
