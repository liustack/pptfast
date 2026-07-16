// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import {
  collectGradients,
  gradientFillXml,
  gradientMidpointHex,
  withElementOpacity,
  type GradientDef,
} from "./gradient"

function parseSvg(inner: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`,
    "image/svg+xml",
  )
  const svg = doc.querySelector("svg")
  if (!svg) throw new Error("no svg parsed")
  return svg
}

describe("collectGradients", () => {
  it("parses a linear gradient with the default vector (0,0)→(1,0)", () => {
    const svg = parseSvg(
      `<defs><linearGradient id="g1">
        <stop offset="0" stop-color="#FF0000"/>
        <stop offset="1" stop-color="#0000FF"/>
      </linearGradient></defs>`,
    )
    const map = collectGradients(svg)
    expect(map.get("g1")).toEqual({
      kind: "linear",
      angleDeg: 0,
      stops: [
        { pos: 0, hex: "FF0000" },
        { pos: 1, hex: "0000FF" },
      ],
    })
  })

  it("parses percentage offsets", () => {
    const svg = parseSvg(
      `<defs><linearGradient id="g1">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="50%" stop-color="#888888"/>
        <stop offset="100%" stop-color="#000000"/>
      </linearGradient></defs>`,
    )
    const def = collectGradients(svg).get("g1")
    expect(def?.stops.map((s) => s.pos)).toEqual([0, 0.5, 1])
  })

  it("defaults a stop's alpha to undefined (fully opaque) when stop-opacity is absent", () => {
    const svg = parseSvg(
      `<defs><linearGradient id="g1">
        <stop offset="0" stop-color="#FFFFFF"/>
      </linearGradient></defs>`,
    )
    const def = collectGradients(svg).get("g1")
    expect(def?.stops[0].alpha).toBeUndefined()
  })

  it("carries an explicit stop-opacity as a 0-1 alpha", () => {
    const svg = parseSvg(
      `<defs><linearGradient id="g1">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.4"/>
      </linearGradient></defs>`,
    )
    const def = collectGradients(svg).get("g1")
    expect(def?.stops[0].alpha).toBe(0.4)
  })

  it("throws on gradientUnits=userSpaceOnUse", () => {
    const svg = parseSvg(
      `<defs><linearGradient id="g1" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">
        <stop offset="0" stop-color="#FFF"/>
      </linearGradient></defs>`,
    )
    expect(() => collectGradients(svg)).toThrow(/userSpaceOnUse/)
  })

  it("collects multiple gradients into one Map keyed by id", () => {
    const svg = parseSvg(
      `<defs>
        <linearGradient id="a"><stop offset="0" stop-color="#FFF"/></linearGradient>
        <radialGradient id="b"><stop offset="0" stop-color="#000"/></radialGradient>
      </defs>`,
    )
    const map = collectGradients(svg)
    expect(Array.from(map.keys()).sort()).toEqual(["a", "b"])
    expect(map.get("a")?.kind).toBe("linear")
    expect(map.get("b")?.kind).toBe("radial")
  })

  it("parses a radial gradient's stops and ignores cx/cy/r", () => {
    const svg = parseSvg(
      `<defs><radialGradient id="g1" cx="0.2" cy="0.8" r="0.3">
        <stop offset="0" stop-color="#FFFFFF"/>
        <stop offset="1" stop-color="#000000"/>
      </radialGradient></defs>`,
    )
    expect(collectGradients(svg).get("g1")).toEqual({
      kind: "radial",
      stops: [
        { pos: 0, hex: "FFFFFF" },
        { pos: 1, hex: "000000" },
      ],
    })
  })

  it("throws on a gradient with no <stop> children", () => {
    const svg = parseSvg(`<defs><linearGradient id="empty"></linearGradient></defs>`)
    expect(() => collectGradients(svg)).toThrow(/no <stop>/)
  })

  it("throws on a stop-color that isn't hex", () => {
    const svg = parseSvg(
      `<defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient></defs>`,
    )
    expect(() => collectGradients(svg)).toThrow(/not a hex color/)
  })
})

describe("linear angle conversion (locked to the brief's table)", () => {
  const angleOf = (x1: number, y1: number, x2: number, y2: number): number => {
    const svg = parseSvg(
      `<defs><linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
        <stop offset="0" stop-color="#FFF"/>
      </linearGradient></defs>`,
    )
    const def = collectGradients(svg).get("g")
    if (def?.kind !== "linear") throw new Error("expected linear")
    return def.angleDeg
  }

  it("(0,0)→(1,0) horizontal → 0deg", () => {
    expect(angleOf(0, 0, 1, 0)).toBe(0)
  })

  it("(0,0)→(0,1) vertical down → 90deg", () => {
    expect(angleOf(0, 0, 0, 1)).toBe(90)
  })

  it("(0,0)→(-1,0) → 180deg", () => {
    expect(angleOf(0, 0, -1, 0)).toBe(180)
  })

  it("(0,0)→(0,-1) → 270deg", () => {
    expect(angleOf(0, 0, 0, -1)).toBe(270)
  })
})

describe("gradientFillXml", () => {
  it("emits a:lin with the DrawingML angle units (1/60000 degree) for the locked-down table", () => {
    const linearAt = (angleDeg: number): GradientDef => ({
      kind: "linear",
      angleDeg,
      stops: [
        { pos: 0, hex: "FF0000" },
        { pos: 1, hex: "0000FF" },
      ],
    })
    expect(gradientFillXml(linearAt(0))).toContain('<a:lin ang="0"')
    expect(gradientFillXml(linearAt(90))).toContain('<a:lin ang="5400000"')
    expect(gradientFillXml(linearAt(180))).toContain('<a:lin ang="10800000"')
    expect(gradientFillXml(linearAt(270))).toContain('<a:lin ang="16200000"')
  })

  it("emits gsLst stops with pos scaled to 0-100000 and srgbClr", () => {
    const xml = gradientFillXml({
      kind: "linear",
      angleDeg: 0,
      stops: [
        { pos: 0, hex: "FF0000" },
        { pos: 0.5, hex: "00FF00" },
        { pos: 1, hex: "0000FF" },
      ],
    })
    expect(xml).toContain('<a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs>')
    expect(xml).toContain('<a:gs pos="50000"><a:srgbClr val="00FF00"/></a:gs>')
    expect(xml).toContain('<a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs>')
  })

  it("emits an a:alpha element for a stop with alpha < 1, and omits it otherwise", () => {
    const xml = gradientFillXml({
      kind: "linear",
      angleDeg: 0,
      stops: [
        { pos: 0, hex: "FF0000", alpha: 0.5 },
        { pos: 1, hex: "0000FF" },
      ],
    })
    expect(xml).toContain(
      '<a:gs pos="0"><a:srgbClr val="FF0000"><a:alpha val="50000"/></a:srgbClr></a:gs>',
    )
    expect(xml).toContain('<a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs>')
  })

  it("emits a:path path=circle with a centered fillToRect for radial gradients", () => {
    const xml = gradientFillXml({
      kind: "radial",
      stops: [
        { pos: 0, hex: "FFFFFF" },
        { pos: 1, hex: "000000" },
      ],
    })
    expect(xml).toContain('<a:path path="circle">')
    expect(xml).toContain('<a:fillToRect l="50000" t="50000" r="50000" b="50000"/>')
  })
})

describe("withElementOpacity", () => {
  const twoStops = (): GradientDef => ({
    kind: "linear",
    angleDeg: 0,
    stops: [
      { pos: 0, hex: "FF0000" },
      { pos: 1, hex: "0000FF", alpha: 0.5 },
    ],
  })

  it("returns the same def unchanged (by reference) when opacity is 1", () => {
    const def = twoStops()
    expect(withElementOpacity(def, 1)).toBe(def)
  })

  it("multiplies a stop's implicit full alpha (undefined) by the element opacity", () => {
    const out = withElementOpacity(twoStops(), 0.06)
    expect(out.stops[0].alpha).toBeCloseTo(0.06)
  })

  it("multiplies an explicit stop alpha by the element opacity (stopAlpha × elementAlpha)", () => {
    const out = withElementOpacity(twoStops(), 0.06)
    expect(out.stops[1].alpha).toBeCloseTo(0.5 * 0.06)
  })

  it("never mutates the input def, since it may be shared across elements", () => {
    const def = twoStops()
    withElementOpacity(def, 0.06)
    expect(def.stops[0].alpha).toBeUndefined()
    expect(def.stops[1].alpha).toBe(0.5)
  })

  it("clamps a combined alpha into [0,1]", () => {
    const out = withElementOpacity(twoStops(), 0)
    expect(out.stops[0].alpha).toBe(0)
    expect(out.stops[1].alpha).toBe(0)
  })
})

describe("gradientMidpointHex", () => {
  it("blends the first and last stop", () => {
    expect(
      gradientMidpointHex({
        kind: "linear",
        angleDeg: 0,
        stops: [
          { pos: 0, hex: "000000" },
          { pos: 1, hex: "FFFFFF" },
        ],
      }),
    ).toBe("808080")
  })

  it("ignores intermediate stops (first/last only)", () => {
    expect(
      gradientMidpointHex({
        kind: "linear",
        angleDeg: 0,
        stops: [
          { pos: 0, hex: "000000" },
          { pos: 0.5, hex: "00FF00" },
          { pos: 1, hex: "000000" },
        ],
      }),
    ).toBe("000000")
  })
})
