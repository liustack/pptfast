// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { circleToOp, ellipseToOp } from "./ellipse"

function circleEl(attrs: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg"><circle ${attrs}/></svg>`,
    "image/svg+xml",
  )
  const el = doc.querySelector("circle")
  if (!el) throw new Error("no circle parsed")
  return el
}

function ellipseEl(attrs: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg"><ellipse ${attrs}/></svg>`,
    "image/svg+xml",
  )
  const el = doc.querySelector("ellipse")
  if (!el) throw new Error("no ellipse parsed")
  return el
}

describe("circleToOp", () => {
  it("converts a filled circle to an ellipse shape op with correct bbox", () => {
    // cx=192 cy=96 r=96 → bbox x=96 y=0 w=192 h=192 → inches x=1 y=0 w=2 h=2
    const op = circleToOp(
      circleEl('cx="192" cy="96" r="96" fill="#FF0000"'),
    )
    expect(op).toEqual({
      kind: "shape",
      text: "",
      shape: "ellipse",
      x: 1,
      y: 0,
      w: 2,
      h: 2,
      fill: { color: "FF0000" },
    })
  })

  it("carries fill transparency from an rgba fill", () => {
    const op = circleToOp(
      circleEl('cx="96" cy="96" r="48" fill="rgba(0,0,255,0.8)"'),
    )
    expect(op.fill).toEqual({ color: "0000FF", transparency: 20 })
  })

  it("maps stroke to a line in points", () => {
    const op = circleToOp(
      circleEl('cx="96" cy="96" r="48" stroke="#00FF00" stroke-width="4"'),
    )
    expect(op.line).toEqual({ color: "00FF00", width: 3 }) // 4px × 0.75 = 3pt
  })

  it("omits fill and line when absent", () => {
    const op = circleToOp(circleEl('cx="96" cy="96" r="48"'))
    expect(op.fill).toBeUndefined()
    expect(op.line).toBeUndefined()
  })
})

describe("ellipseToOp", () => {
  it("converts an ellipse with rx≠ry to shape op with correct bbox", () => {
    // cx=480 cy=360 rx=192 ry=96 → bbox x=288 y=264 w=384 h=192
    // inches: x=3 y=2.75 w=4 h=2
    const op = ellipseToOp(
      ellipseEl('cx="480" cy="360" rx="192" ry="96" fill="#1A4A8A"'),
    )
    expect(op).toEqual({
      kind: "shape",
      text: "",
      shape: "ellipse",
      x: 3,
      y: 2.75,
      w: 4,
      h: 2,
      fill: { color: "1A4A8A" },
    })
  })

  it("maps stroke on ellipse", () => {
    const op = ellipseToOp(
      ellipseEl('cx="96" cy="96" rx="48" ry="48" stroke="#000000" stroke-width="2"'),
    )
    expect(op.line).toEqual({ color: "000000", width: 1.5 }) // 2px → 1.5pt
  })

  it("omits fill when the ellipse has fill=none", () => {
    const op = ellipseToOp(
      ellipseEl('cx="96" cy="96" rx="48" ry="48" fill="none" stroke="#000" stroke-width="1"'),
    )
    expect(op.fill).toBeUndefined()
  })
})
