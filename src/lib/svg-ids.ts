/**
 * Namespacing for SVG-internal ids, for the case where several standalone
 * slide SVGs are inlined into one HTML document.
 *
 * Each slide is rendered as its own standalone document, so ids only have to
 * be unique *within* a slide — and they are. Put two of those documents in
 * one page, though, and their id spaces merge: a `url(#decor-tech-field)` on
 * slide 6 resolves against slide 3's definition, because that one came
 * first. The paint the reader sees is whichever slide happened to be earlier
 * in the document, which is not a rule anybody intended.
 *
 * Today the collisions that actually occur are between byte-identical
 * definitions (a theme's decor gradient repeated per slide), so nothing
 * renders wrong yet — this is a latent defect, found by diffing the ids
 * across a real deck's slides rather than by anything going visibly wrong.
 * The moment a definition varies per slide (a decor gradient tinted by slide
 * type, a chart gradient keyed on its own series) the later slide silently
 * takes the earlier one's paint, and the failure looks like a theme bug
 * rather than an id bug.
 *
 * Applied at build time, in the two places that inline slides into one
 * document: `../cli/preview-html.ts` and the review gallery.
 */

/**
 * Rewrite every id definition and reference inside one SVG document so it
 * cannot collide with another document inlined beside it.
 *
 * Deliberately narrow: this only touches `id="…"`, `url(#…)` and
 * `href`/`xlink:href="#…"`, the three forms this renderer actually emits.
 * It is a string transform over self-produced markup, not a general SVG
 * rewriter — an arbitrary document could reference an id in ways this misses
 * (`begin="a.click"`, `style="fill:url(#a)"` inside a CSS string), and none
 * of those forms appear in anything `renderSlideSvg` produces.
 */
export function namespaceSvgIds(svg: string, prefix: string): string {
  if (!prefix) return svg
  return svg
    .replace(/\bid="([^"]*)"/g, (_m, id: string) => `id="${prefix}${id}"`)
    .replace(/url\(#([^)"']*)\)/g, (_m, id: string) => `url(#${prefix}${id})`)
    .replace(/\b(xlink:href|href)="#([^"]*)"/g, (_m, attr: string, id: string) => `${attr}="#${prefix}${id}"`)
}

/**
 * A short, stable, collision-free prefix for the slide at `index`.
 *
 * Positional rather than content-derived on purpose: two slides that render
 * byte-identical markup still need distinct id spaces, and a content hash
 * would hand them the same one.
 */
export function svgIdPrefix(index: number): string {
  return `s${index}-`
}
