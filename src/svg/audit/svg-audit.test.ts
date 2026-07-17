import { describe, expect, it } from "vitest"
import { auditSvgMarkup } from "./svg-audit"

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${inner}</svg>`

describe("auditSvgMarkup", () => {
  it("passes text that fits its box", () => {
    const issues = auditSvgMarkup(
      wrap(
        `<g data-audit-rect="0,0,1280,720"><g data-audit-box="100,100,400">` +
          `<g transform="translate(100,100)"><text x="0" y="20" font-size="20">短文本</text></g>` +
          `</g></g>`,
      ),
    )
    expect(issues).toEqual([])
  })

  it("flags unwrapped text wider than its box as h-overflow", () => {
    const long = "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范说明"
    const issues = auditSvgMarkup(
      wrap(
        `<g data-audit-rect="0,0,1280,720"><g data-audit-box="100,100,300">` +
          `<g transform="translate(100,100)"><text x="0" y="20" font-size="20">${long}</text></g>` +
          `</g></g>`,
      ),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe("h-overflow")
  })

  it("respects text-anchor=end", () => {
    const issues = auditSvgMarkup(
      wrap(
        `<g data-audit-rect="0,0,1280,720"><g data-audit-box="100,100,300">` +
          `<text x="400" y="20" text-anchor="end" font-size="16">right aligned</text>` +
          `</g></g>`,
      ),
    )
    expect(issues).toEqual([])
  })

  it("flags text below the content rect as v-overflow", () => {
    const issues = auditSvgMarkup(
      wrap(
        `<g data-audit-rect="96,176,1088,424">` +
          `<text x="96" y="700" font-size="20">stacked past bottom</text>` +
          `</g>`,
      ),
    )
    expect(issues.some((i) => i.kind === "v-overflow")).toBe(true)
  })

  it("flags text outside the 1280x720 page", () => {
    const issues = auditSvgMarkup(
      wrap(`<text x="1270" y="30" font-size="20">edge overflow text</text>`),
    )
    expect(issues.some((i) => i.kind === "page-overflow")).toBe(true)
  })

  // text-anchor="middle" straddles its x coordinate, so the auditor must
  // subtract width/2 (not width) from tx to find the left edge. "12345678"
  // is 8 digits, each weighed 0.56 by measureTextUnits (digits fall in the
  // lowercase/digit bucket), so units = 8 * 0.56 = 4.48 and, at font-size
  // 20, width = 89.6, half-width = 44.8.
  it("computes text-anchor=middle left/right edges from width/2 and fits inside the box", () => {
    // box spans x=[100,300] (TOL-padded to [94,306]); tx=200 is the box
    // center, so left = 200 - 44.8 = 155.2, right = 200 + 44.8 = 244.8.
    // Both stay inside the padded bounds with a 61.2px margin (> TOL=6).
    const issues = auditSvgMarkup(
      wrap(
        `<g data-audit-box="100,100,200">` +
          `<text x="200" y="20" text-anchor="middle" font-size="20">12345678</text>` +
          `</g>`,
      ),
    )
    expect(issues).toEqual([])
  })

  it("computes text-anchor=middle left/right edges from width/2 and flags an h-overflow past the box edge", () => {
    // Same box and text, but tx=280 shifts the (still 89.6-wide) text right:
    // left = 280 - 44.8 = 235.2, right = 280 + 44.8 = 324.8. The right edge
    // exceeds the padded box bound of 306 by 18.8px (> TOL=6), while the
    // left edge (235.2) stays well inside the padded bound of 94 — so this
    // must produce exactly one h-overflow, not a left-edge violation too.
    const issues = auditSvgMarkup(
      wrap(
        `<g data-audit-box="100,100,200">` +
          `<text x="280" y="20" text-anchor="middle" font-size="20">12345678</text>` +
          `</g>`,
      ),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe("h-overflow")
  })

  // The auditor's recursive `visit` must thread the accumulated translate
  // offset (ax = ox + dx) through every nested <g>, not just the innermost
  // one. Three levels translate by 50, 70, and 90, so the text's true x
  // offset is 50 + 70 + 90 = 210. "OVERFLOW" is 8 uppercase chars, each
  // weighed 0.66, so units = 8 * 0.66 = 5.28 and, at font-size 20,
  // width = 105.6.
  it("accumulates offsets across three nested translate() groups before overflow checks", () => {
    // box spans x=[100,250] (TOL-padded right bound = 100+150+6 = 256).
    // Correct accumulation: left = 210 + 0 = 210, right = 210 + 105.6 = 315.6,
    // which exceeds 256 by 59.6px (> TOL=6) — a single h-overflow.
    // Any partial accumulation (e.g. only the innermost translate, dx=90,
    // or only two of the three levels, dx<=120) would give right <= 225.6,
    // which stays under 256 and would wrongly report no overflow — so this
    // only fails if all three levels are summed.
    const issues = auditSvgMarkup(
      wrap(
        `<g data-audit-box="100,100,150">` +
          `<g transform="translate(50,0)">` +
          `<g transform="translate(70,0)">` +
          `<g transform="translate(90,0)">` +
          `<text x="0" y="20" font-size="20">OVERFLOW</text>` +
          `</g></g></g></g>`,
      ),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe("h-overflow")
  })
})
