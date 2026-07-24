// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { lineToOp } from "./line"

function lineEl(attrs: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg"><line ${attrs}/></svg>`,
    "image/svg+xml",
  )
  const el = doc.querySelector("line")
  if (!el) throw new Error("no line parsed")
  return el
}

describe("lineToOp", () => {
  it("converts a basic line (top-left → bottom-right) without flip", () => {
    // dx > 0, dy > 0 → same sign → default diagonal, no flip needed
    const op = lineToOp(
      lineEl('x1="96" y1="48" x2="288" y2="144" stroke="#FF0000" stroke-width="2"'),
    )
    expect(op).toEqual({
      kind: "line",
      x: 1, // min(96,288)/96
      y: 0.5, // min(48,144)/96
      w: 2, // |288-96|/96
      h: 1, // |144-48|/96
      line: { color: "FF0000", width: 1.5 }, // 2px * 0.75
    })
  })

  it("sets flipV when line goes bottom-left → top-right (dx>0, dy<0)", () => {
    // x1<x2 but y1>y2 → dx>0, dy<0 → opposite signs → flipV
    const op = lineToOp(
      lineEl('x1="96" y1="192" x2="288" y2="96" stroke="#00FF00" stroke-width="1"'),
    )
    expect(op).toEqual({
      kind: "line",
      x: 1,
      y: 1, // min(192,96)/96
      w: 2,
      h: 1,
      line: { color: "00FF00", width: 0.75 },
      flipV: true,
    })
  })

  it("sets flipV when line goes top-right → bottom-left (dx<0, dy>0)", () => {
    // x1>x2 but y1<y2 → dx<0, dy>0 → opposite signs → flipV
    const op = lineToOp(
      lineEl('x1="288" y1="96" x2="96" y2="192" stroke="#0000FF" stroke-width="4"'),
    )
    expect(op).toEqual({
      kind: "line",
      x: 1,
      y: 1,
      w: 2,
      h: 1,
      line: { color: "0000FF", width: 3 }, // 4px * 0.75
      flipV: true,
    })
  })

  it("does not flip when line goes bottom-right → top-left (dx<0, dy<0)", () => {
    // Both negative → same sign → default diagonal, no flip
    const op = lineToOp(
      lineEl('x1="288" y1="192" x2="96" y2="96" stroke="#000000"'),
    )
    expect(op).toEqual({
      kind: "line",
      x: 1,
      y: 1,
      w: 2,
      h: 1,
      line: { color: "000000", width: 0.75 }, // default 1px
    })
  })

  it("handles a horizontal line (h=0)", () => {
    const op = lineToOp(
      lineEl('x1="0" y1="96" x2="192" y2="96" stroke="#333333" stroke-width="2"'),
    )
    expect(op).toEqual({
      kind: "line",
      x: 0,
      y: 1,
      w: 2,
      h: 0,
      line: { color: "333333", width: 1.5 },
    })
  })

  it("handles a vertical line (w=0)", () => {
    const op = lineToOp(
      lineEl('x1="96" y1="0" x2="96" y2="192" stroke="#333333" stroke-width="3"'),
    )
    expect(op).toEqual({
      kind: "line",
      x: 1,
      y: 0,
      w: 0,
      h: 2,
      line: { color: "333333", width: 2.25 },
    })
  })

  it("uses default stroke-width of 1 when omitted", () => {
    const op = lineToOp(
      lineEl('x1="0" y1="0" x2="96" y2="96" stroke="#AABBCC"'),
    )
    expect(op.line.width).toBe(0.75) // 1px * 0.75
  })

  it("maps stroke-dasharray to dashType 'dash'", () => {
    const op = lineToOp(
      lineEl('x1="0" y1="0" x2="96" y2="96" stroke="#000" stroke-dasharray="5,3"'),
    )
    expect(op.line.dashType).toBe("dash")
  })

  it("maps dot-like stroke-dasharray (small on, larger gap) to 'sysDot'", () => {
    const op = lineToOp(
      lineEl('x1="0" y1="0" x2="96" y2="96" stroke="#000" stroke-dasharray="1,3"'),
    )
    expect(op.line.dashType).toBe("sysDot")
  })

  it("omits dashType when stroke-dasharray is absent (solid line)", () => {
    const op = lineToOp(
      lineEl('x1="0" y1="0" x2="96" y2="96" stroke="#000"'),
    )
    expect(op.line.dashType).toBeUndefined()
  })
})

describe("zero-length point line (Lucide dot idiom, e.g. circle-divide/square-divide)", () => {
  // Lucide draws the "÷" division dots as zero-length <line x1=x2 y1=y2>
  // elements (a "point"), not <path>. Same degenerate-geometry family as
  // path.ts's segsToOp fix (task 1 blocking review finding), different
  // converter: pre-fix this produced w=0 AND h=0 simultaneously, which even
  // the audit's own connector exception rejects ("connector 允许其中一轴为零，
  // 但不能两轴同时为零") — correctly, since a *single*-axis-zero line is a
  // legitimate horizontal/vertical connector (see the two tests above this
  // one, both still asserting an exact 0 on their zero axis — untouched by
  // this fix), but a *both*-axes-zero line is a true point with nothing left
  // to distinguish it from a genuine gate defect.
  it("floors a true zero-length point (x1===x2 and y1===y2) to a positive bbox on both axes", () => {
    const op = lineToOp(lineEl('x1="12" y1="16" x2="12" y2="16" stroke="#111111"'))
    expect(op.w).toBeGreaterThan(0)
    expect(op.h).toBeGreaterThan(0)
    expect(op.w).toBeCloseTo(0.75 / 96, 5)
    expect(op.h).toBeCloseTo(0.75 / 96, 5)
  })

  it("does not floor a real single-axis-zero connector (horizontal/vertical line stay exactly 0)", () => {
    // Regression guard: the point-only floor must never leak into the
    // ordinary horizontal/vertical connector case above.
    const horizontal = lineToOp(lineEl('x1="0" y1="96" x2="192" y2="96" stroke="#333"'))
    expect(horizontal.h).toBe(0)
    const vertical = lineToOp(lineEl('x1="96" y1="0" x2="96" y2="192" stroke="#333"'))
    expect(vertical.w).toBe(0)
  })
})

describe("sub-EMU near-equal endpoints (dumbbell horizontal-connector edge case)", () => {
  // dumbbell's connector is always horizontal by construction (both
  // endpoints share one `cy`, chart-svg.tsx's renderDumbbell) — dy is
  // exactly 0, never near-zero. A near-equal-but-not-bit-exact `from`/`to`
  // pair at large magnitude (e.g. from=1e9, to=1e9+1, `vx()`'s ratio-scaled
  // x mapping) produces a dx on the order of 1e-7px: nonzero in strict
  // IEEE-754 terms (so the old `dx === 0` half of isPoint never fired), but
  // it rounds to 0 EMU once pptxgenjs's own `inch2Emu`
  // (`Math.round(EMU_PER_IN * inches)`, node_modules/pptxgenjs) quantizes
  // it — same degenerate end state as a bit-exact point, just reached via
  // float drift instead of equal inputs.
  it("floors a near-equal (not bit-exact) horizontal connector whose dx rounds to 0 EMU, same as a true point", () => {
    const x1 = 100
    const dxPx = 4e-7 // sub-EMU: 4e-7/96*914400 ≈ 0.0038 EMU, rounds to 0
    const op = lineToOp(lineEl(`x1="${x1}" y1="50" x2="${x1 + dxPx}" y2="50" stroke="#111111"`))
    expect(op.w).toBeGreaterThan(0)
    expect(op.h).toBeGreaterThan(0)
    expect(op.w).toBeCloseTo(0.75 / 96, 5)
    expect(op.h).toBeCloseTo(0.75 / 96, 5)
  })

  it("does not floor a legitimately thin-but-visible line (0.5px is ~4762 EMU, nowhere near the 0-EMU threshold)", () => {
    // Regression guard for the widened predicate: it must only fire when
    // BOTH axes round to zero EMU, never merely because a line is thin.
    const op = lineToOp(lineEl('x1="0" y1="0" x2="0.5" y2="0" stroke="#111111"'))
    expect(op.w).toBeCloseTo(0.5 / 96, 5)
    expect(op.h).toBe(0)
  })
})

describe("stroke opacity", () => {
  it("maps element opacity into line transparency", () => {
    const el = lineEl('x1="560" y1="500" x2="720" y2="500" stroke="#00A878" stroke-width="1.6" opacity="0.6"')
    const op = lineToOp(el)
    expect(op.line?.transparency).toBe(40)
  })
})
