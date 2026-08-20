/**
 * Fixed y coordinates of the slide's bottom chrome.
 *
 * A leaf module on purpose: it imports nothing. These constants are needed
 * by `./brand-chrome.tsx` (which draws the divider) *and* by every layout
 * that places a footnote above it, and `brand-chrome` itself reaches the
 * theme registry, which reaches the layout registry, which reaches the
 * layouts — so a layout importing back into `brand-chrome` closes a
 * cycle that leaves the layout registry half-built at module-init time.
 * Shared geometry with no behaviour lives here instead.
 */

/** The hairline `BrandChrome` draws across the bottom of every slide. */
export const FOOTER_DIVIDER_Y = 664

/**
 * Blank space between a footnote's lowest ink and the divider under it.
 *
 * The number the old fixed baseline only claimed to deliver. `y = 648` was
 * described as "clears the divider by 16px", but 16px was the gap between
 * the *baseline* and the rule — descenders eat into it, and how much they
 * eat depends on the font size, which ranges from 11 to 20 across the ten
 * layouts that place a footnote. Measured in a real render (4x raster,
 * `layout--banner-heading--zh` / `--quote-stage--zh` / `--narrow-column--zh`):
 * 12.50px at 14px type, 12.25px at 16px, 11.50px at 20px. The 2026-08-19
 * review read the widest of those three as "掉在线上" — sitting on the rule
 * rather than above it.
 *
 * 16 measured against the ink instead of the baseline holds the gap at
 * ~15.4px at every size, and reads a touch tighter above the rule than the
 * 19.25px the footer's own text row leaves below it — which is the way
 * round it should be, since the ink above ends in italic descenders.
 */
export const FOOTNOTE_CLEARANCE = 16

/**
 * How far a footnote's ink falls below its own baseline, per unit of font
 * size. Measured (same rasters): 0.196 at 14px, 0.188 at 16px and 20px, on
 * CJK glyphs, which reach lower than Latin ones at the same size. 0.21
 * rounds that up so the clearance above is a floor rather than an average.
 */
const FOOTNOTE_DESCENT_RATIO = 0.21

/**
 * The baseline a footnote of `fontSize` sits on.
 *
 * One divider deserves one answer, and this is the answer stated as a
 * relationship to the divider rather than as a coordinate. Before the
 * shared constant existed, ten layouts each carried their own number — 648,
 * 652, 656, and a 676 that placed the footnote *below* the divider,
 * painting it through the rule and into the footer's own text row. Folding
 * them into one 648 fixed the spread but kept the flaw underneath: a fixed
 * baseline gives a different optical gap to every font size, so the biggest
 * footnotes ended up the most cramped.
 *
 * Pass the *fitted* size (`fitSvgLine` shrinks a long footnote toward its
 * `minFontSize`), not the nominal one — a line that shrank should keep the
 * same gap, not inherit the gap of a size it no longer renders at.
 */
export function footnoteBaselineFor(fontSize: number): number {
  return FOOTER_DIVIDER_Y - FOOTNOTE_CLEARANCE - Math.round(fontSize * FOOTNOTE_DESCENT_RATIO)
}
