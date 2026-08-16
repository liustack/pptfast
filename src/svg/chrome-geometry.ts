/**
 * Fixed y coordinates of the slide's bottom chrome.
 *
 * A leaf module on purpose: it imports nothing. These constants are needed
 * by `./brand-chrome.tsx` (which draws the divider) *and* by every archetype
 * that places a footnote above it, and `brand-chrome` itself reaches the
 * theme registry, which reaches the layout registry, which reaches the
 * archetypes — so an archetype importing back into `brand-chrome` closes a
 * cycle that leaves the layout registry half-built at module-init time.
 * Shared geometry with no behaviour lives here instead.
 */

/** The hairline `BrandChrome` draws across the bottom of every slide. */
export const FOOTER_DIVIDER_Y = 664

/**
 * The baseline every archetype's footnote sits on.
 *
 * One divider deserves one answer. Before this constant existed, ten
 * archetypes each carried their own number — 648, 652, 656, and a 676 that
 * placed the footnote *below* the divider, painting it through the rule and
 * into the footer's own text row. The 656 ones left 8px between a 14px
 * italic line and a hairline, which the 2026-08-16 visual review read as
 * "挤在一起". 648 clears the divider by 16px, which is the version that
 * looked deliberate rather than accidental in a real render.
 */
export const FOOTNOTE_BASELINE_Y = 648
