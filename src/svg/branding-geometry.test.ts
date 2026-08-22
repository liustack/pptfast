import { describe, expect, it } from "vitest"
import { FOOTER_DIVIDER_Y, FOOTNOTE_CLEARANCE, footnoteBaselineFor } from "./branding-geometry"

/**
 * Real ink drop below the baseline for the footnote sizes the ten layouts
 * actually render, measured off a 4x raster of the gallery's own pages
 * (`layout--banner-heading--zh` at 14, `--quote-stage--zh` at 16,
 * `--narrow-column--zh` at 20) rather than estimated. CJK glyphs, which
 * reach lower than Latin at the same size, so these are the worst case.
 *
 * The byte-exact layout archives pin the resulting coordinates. This file
 * pins the *reason* those coordinates are what they are, so a future edit to
 * `FOOTNOTE_CLEARANCE` or the descent ratio has to be a deliberate act rather
 * than a number nudged until four archives went green again.
 */
const MEASURED_DESCENT: ReadonlyArray<readonly [size: number, descent: number]> = [
  [14, 2.75],
  [16, 3.0],
  [20, 3.75],
]

/** Every size a footnote can render at: `fitSvgLine` floors at 11, tops out at 20. */
const ALL_SIZES = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

describe("footnoteBaselineFor", () => {
  it("leaves the same optical gap above the divider at every measured size", () => {
    const gaps = MEASURED_DESCENT.map(
      ([size, descent]) => FOOTER_DIVIDER_Y - (footnoteBaselineFor(size) + descent),
    )
    // The flat 648 this replaced gave 16.00 / 16.00 / 15.25 by the same
    // arithmetic — but measured against the divider's own ink it delivered
    // 12.50 / 12.25 / 11.50, a 1px spread that read as the 20px footnote
    // being the most cramped. Now the spread is under half a pixel.
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(FOOTNOTE_CLEARANCE)
      expect(gap).toBeLessThanOrEqual(FOOTNOTE_CLEARANCE + 0.5)
    }
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(0.5)
  })

  it("never puts a footnote on or below the divider", () => {
    // The defect this helper exists to make unrepresentable: two layouts
    // carried a hardcoded y=688, painting a 20px line under the y=664 rule
    // and across the footer's own text row.
    for (const size of ALL_SIZES) {
      expect(footnoteBaselineFor(size), `size ${size}`).toBeLessThan(FOOTER_DIVIDER_Y - FOOTNOTE_CLEARANCE)
    }
  })

  it("lifts the baseline as the type grows, never drops it", () => {
    for (let i = 1; i < ALL_SIZES.length; i++) {
      expect(footnoteBaselineFor(ALL_SIZES[i]!)).toBeLessThanOrEqual(footnoteBaselineFor(ALL_SIZES[i - 1]!))
    }
  })
})
