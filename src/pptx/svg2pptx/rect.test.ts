// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
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
