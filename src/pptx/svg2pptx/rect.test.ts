// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { pxToIn } from "../../constants"
import { rectToOp } from "./rect"

function rectEl(attrs: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg"><rect ${attrs}/></svg>`,
    "image/svg+xml",
  )
  const el = doc.querySelector("rect")
  if (!el) throw new Error("no rect parsed")
  return el
}

describe("rectToOp", () => {
  it("converts a filled rect to a shape op in inches", () => {
    const op = rectToOp(
      rectEl('x="96" y="48" width="192" height="96" fill="#1A4A8A"'),
    )
    expect(op).toEqual({
      kind: "shape",
      text: "",
      shape: "rect",
      x: 1,
      y: 0.5,
      w: 2,
      h: 1,
      fill: { color: "1A4A8A" },
    })
  })

  it("carries fill transparency from an rgba fill", () => {
    const op = rectToOp(
      rectEl('x="0" y="0" width="96" height="96" fill="rgba(0,0,0,0.5)"'),
    )
    expect(op.fill).toEqual({ color: "000000", transparency: 50 })
  })

  it("maps rx to roundRect with rectRadius in inches", () => {
    const op = rectToOp(
      rectEl('x="0" y="0" width="192" height="96" fill="#ffffff" rx="48"'),
    )
    expect(op.shape).toBe("roundRect")
    expect(op.rectRadius).toBeCloseTo(0.5, 3) // 48px → 0.5in
  })

  it("maps stroke to a line in points", () => {
    const op = rectToOp(
      rectEl('x="0" y="0" width="96" height="96" stroke="#000000" stroke-width="2"'),
    )
    expect(op.line).toEqual({ color: "000000", width: 1.5 }) // 2px → 1.5pt
  })

  it("omits fill when the rect has no fill", () => {
    const op = rectToOp(
      rectEl('x="0" y="0" width="96" height="96" stroke="#000" stroke-width="1"'),
    )
    expect(op.fill).toBeUndefined()
  })
})

describe("rect opacity", () => {
  it("maps element opacity into fill transparency", () => {
    const el = rectEl('x="0" y="0" width="100" height="50" fill="#FFFFFF" opacity="0.12"')
    const op = rectToOp(el)
    expect(op.fill?.transparency).toBe(88)
  })
})

describe("zero/negative-extent floor (deep-acceptance review finding 1)", () => {
  // chart-svg.tsx's ratio-based bar/funnel geometry (renderBar/
  // renderBarHorizontal/renderFunnel) computes a bar's pixel width/height as
  // a bare `(d.y / max) * plotSize` ratio with no floor of its own — a zero
  // or negative data value (both schema-valid: `y: z.number()` carries no
  // `.positive()`/`.nonnegative()` constraint, and "0 incidents"/"-12% YoY"
  // are both legitimate business data) collapses to a zero or negative
  // `<rect>` width/height. rectToOp was the one svg2pptx converter left in
  // this defect class after this wave's own floor pass: path.ts's
  // buildOp/segsToOp and line.ts's lineToOp already got the same 0.75px
  // floor (see those files' own "zero-extent floor" tests) — this mirrors
  // the exact constant and the same "keep the true min edge fixed, extend
  // the true max edge" per-axis pattern, generalized to a rect's x/width and
  // y/height pairs instead of a point cloud's bbox.
  it("floors a zero-height rect (vertical bar, d.y=0) on its zero axis only, leaving width untouched", () => {
    const op = rectToOp(rectEl('x="100" y="200" width="80" height="0" fill="#1A4A8A"'))
    expect(op.h).toBeGreaterThan(0)
    expect(op.h).toBeCloseTo(pxToIn(0.75), 5)
    expect(op.w).toBeCloseTo(pxToIn(80), 5) // real axis — unfloored, unchanged
    expect(op.y).toBeCloseTo(pxToIn(200), 5) // origin unmoved — floor extends downward from y
  })

  it("floors a zero-width rect (horizontal bar / funnel, d.y=0) on its zero axis only, leaving height untouched", () => {
    const op = rectToOp(rectEl('x="150" y="50" width="0" height="40" fill="#1A4A8A"'))
    expect(op.w).toBeGreaterThan(0)
    expect(op.w).toBeCloseTo(pxToIn(0.75), 5)
    expect(op.h).toBeCloseTo(pxToIn(40), 5)
    expect(op.x).toBeCloseTo(pxToIn(150), 5)
  })

  it("normalizes a negative height (chart-svg.tsx's own emitted form for a negative data value) to a positive rect instead of leaving a negative h", () => {
    // e.g. renderBar's `barY = plotTop + plotH - barH` with a negative barH:
    // the rect's own y attribute sits at the *bottom* of the true visual
    // span and height is negative. Canonicalize to (true top, positive
    // height) — same min/max canonicalization buildOp/segsToOp already do
    // for a point cloud, not just a naive abs() that would leave y pointing
    // at the wrong edge.
    const op = rectToOp(rectEl('x="100" y="300" width="80" height="-50" fill="#1A4A8A"'))
    expect(op.h).toBeCloseTo(pxToIn(50), 5) // real 50px extent — unfloored
    expect(op.y).toBeCloseTo(pxToIn(250), 5) // shifted up to the true top edge (300-50)
  })

  it("normalizes a negative width the same way", () => {
    const op = rectToOp(rectEl('x="200" y="50" width="-30" height="40" fill="#1A4A8A"'))
    expect(op.w).toBeCloseTo(pxToIn(30), 5)
    expect(op.x).toBeCloseTo(pxToIn(170), 5) // true left edge (200-30)
  })

  it("floors a negative height too small in magnitude to clear the floor even after taking its true extent", () => {
    const op = rectToOp(rectEl('x="100" y="300" width="80" height="-0.2" fill="#1A4A8A"'))
    expect(op.h).toBeCloseTo(pxToIn(0.75), 5)
    // True top edge (y+height=299.8) stays fixed; the floor extends the
    // bottom edge outward from there — same "extend the max, keep the min"
    // shape as the zero-height case above, just with a negative starting h.
    expect(op.y).toBeCloseTo(pxToIn(299.8), 5)
  })

  it("does not touch a rect that already clears the floor on both axes (byte-inertness regression guard)", () => {
    // Same fixture as this file's very first test, pinned again here
    // specifically as a floor-non-interference guard.
    const op = rectToOp(rectEl('x="96" y="48" width="192" height="96" fill="#1A4A8A"'))
    expect(op.x).toBe(1)
    expect(op.y).toBe(0.5)
    expect(op.w).toBe(2)
    expect(op.h).toBe(1)
  })
})
