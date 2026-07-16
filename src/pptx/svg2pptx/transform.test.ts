import { describe, expect, it } from "vitest"
import {
  IDENTITY,
  multiply,
  applyPoint,
  parseTransform,
  type Matrix,
} from "./transform"

describe("IDENTITY", () => {
  it("is the 2D identity matrix [1,0,0,1,0,0]", () => {
    expect(IDENTITY).toEqual([1, 0, 0, 1, 0, 0])
  })
})

describe("applyPoint", () => {
  it("identity leaves point unchanged", () => {
    expect(applyPoint(IDENTITY, 5, 7)).toEqual({ x: 5, y: 7 })
  })

  it("translate(10,20) moves (0,0) to (10,20)", () => {
    const m: Matrix = [1, 0, 0, 1, 10, 20]
    expect(applyPoint(m, 0, 0)).toEqual({ x: 10, y: 20 })
  })

  it("scale(2) doubles coordinates", () => {
    const m: Matrix = [2, 0, 0, 2, 0, 0]
    expect(applyPoint(m, 3, 4)).toEqual({ x: 6, y: 8 })
  })

  it("matrix(1,0,0,1,5,6) translates (0,0) to (5,6)", () => {
    const m: Matrix = [1, 0, 0, 1, 5, 6]
    expect(applyPoint(m, 0, 0)).toEqual({ x: 5, y: 6 })
  })
})

describe("multiply", () => {
  it("m * identity = m", () => {
    const m: Matrix = [2, 0, 0, 3, 10, 20]
    expect(multiply(m, IDENTITY)).toEqual(m)
  })

  it("identity * m = m", () => {
    const m: Matrix = [2, 0, 0, 3, 10, 20]
    expect(multiply(IDENTITY, m)).toEqual(m)
  })

  it("translate(10,0) * scale(2) applied to (1,1) gives (12,2)", () => {
    // translate(10,0): [1,0,0,1,10,0]
    // scale(2):        [2,0,0,2,0,0]
    // result matrix should map (1,1) -> scale first (2,2) then translate (12,2)
    const t: Matrix = [1, 0, 0, 1, 10, 0]
    const s: Matrix = [2, 0, 0, 2, 0, 0]
    const combined = multiply(t, s)
    expect(applyPoint(combined, 1, 1)).toEqual({ x: 12, y: 2 })
  })
})

describe("parseTransform", () => {
  it("returns identity for empty string", () => {
    expect(parseTransform("")).toEqual(IDENTITY)
  })

  it("parses translate(10,20)", () => {
    const m = parseTransform("translate(10,20)")
    expect(applyPoint(m, 0, 0)).toEqual({ x: 10, y: 20 })
  })

  it("parses translate with single parameter (ty defaults to 0)", () => {
    const m = parseTransform("translate(5)")
    expect(applyPoint(m, 0, 0)).toEqual({ x: 5, y: 0 })
  })

  it("parses scale(2)", () => {
    const m = parseTransform("scale(2)")
    expect(applyPoint(m, 3, 4)).toEqual({ x: 6, y: 8 })
  })

  it("parses scale with two parameters", () => {
    const m = parseTransform("scale(2,3)")
    expect(applyPoint(m, 1, 1)).toEqual({ x: 2, y: 3 })
  })

  it("parses rotate(90) around origin", () => {
    const m = parseTransform("rotate(90)")
    const p = applyPoint(m, 1, 0)
    // rotate 90° CCW: (1,0) -> (0,1)
    expect(p.x).toBeCloseTo(0, 10)
    expect(p.y).toBeCloseTo(1, 10)
  })

  it("parses rotate(90,2,2) around center (2,2)", () => {
    // rotate 90° around (2,2): (3,2) -> (2,3)
    const m = parseTransform("rotate(90,2,2)")
    const p = applyPoint(m, 3, 2)
    expect(p.x).toBeCloseTo(2, 10)
    expect(p.y).toBeCloseTo(3, 10)
  })

  it("parses matrix(a,b,c,d,e,f)", () => {
    const m = parseTransform("matrix(1,0,0,1,5,6)")
    expect(applyPoint(m, 0, 0)).toEqual({ x: 5, y: 6 })
  })

  it("parses concatenated transforms: translate(10,0) scale(2)", () => {
    // SVG spec: transform list is applied right-to-left on points.
    // "translate(10,0) scale(2)" means T_translate * T_scale,
    // so point (1,1) -> scale first -> (2,2) -> translate -> (12,2).
    const m = parseTransform("translate(10,0) scale(2)")
    expect(applyPoint(m, 1, 1)).toEqual({ x: 12, y: 2 })
  })

  it("handles whitespace and comma separators between transforms", () => {
    const m = parseTransform("  translate( 10 , 0 )  scale( 2 )  ")
    expect(applyPoint(m, 1, 1)).toEqual({ x: 12, y: 2 })
  })

  it("handles space-separated parameters", () => {
    const m = parseTransform("translate(10 20)")
    expect(applyPoint(m, 0, 0)).toEqual({ x: 10, y: 20 })
  })
})
