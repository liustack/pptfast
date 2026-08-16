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
 * "+N more" line (`components/bullets.tsx`, `data-table.tsx`,
 * `timeline.tsx`): those still say on the slide that something was cut, so a
 * reader is not misled and they stay an advisory `audit` finding. Both kinds
 * carry `data-dropped`, which is what `deck-audit.ts` reports on — one
 * attribute for "content was lost", one for "and the slide does not say so".
 */
export function DroppedContentMarker({ count }: { count: number }) {
  if (count <= 0) return null
  return <g data-dropped={count} data-dropped-silent={count} />
}
