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

describe("stroke opacity", () => {
  it("maps element opacity into line transparency", () => {
    const el = lineEl('x1="560" y1="500" x2="720" y2="500" stroke="#00A878" stroke-width="1.6" opacity="0.6"')
    const op = lineToOp(el)
    expect(op.line?.transparency).toBe(40)
  })
})
