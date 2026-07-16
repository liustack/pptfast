// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { assertSubset } from "./subset-validate"

function parse(svg: string): Element {
  return new DOMParser().parseFromString(svg, "image/svg+xml").documentElement
}

const NS = 'xmlns="http://www.w3.org/2000/svg"'

describe("assertSubset", () => {
  it("accepts a clean controlled-subset svg", () => {
    const el = parse(
      `<svg ${NS}><g transform="translate(1,2)"><rect x="0" y="0" width="10" height="10" fill="#FFF"/><text x="0" y="9" font-size="12">hi</text></g></svg>`,
    )
    expect(() => assertSubset(el)).not.toThrow()
  })

  it("rejects a foreignObject", () => {
    const el = parse(`<svg ${NS}><foreignObject x="0" y="0" width="10" height="10"></foreignObject></svg>`)
    expect(() => assertSubset(el)).toThrow(/foreignObject/i)
  })

  it("rejects an undeclared fill url() reference", () => {
    const el = parse(`<svg ${NS}><rect x="0" y="0" width="10" height="10" fill="url(#g)"/></svg>`)
    expect(() => assertSubset(el)).toThrow(/url\(/i)
  })

  it("rejects a nested svg", () => {
    const el = parse(`<svg ${NS}><svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg></svg>`)
    expect(() => assertSubset(el)).toThrow(/nested svg/i)
  })

  it("rejects filter / clipPath / use / pattern", () => {
    expect(() => assertSubset(parse(`<svg ${NS}><filter id="f"></filter></svg>`))).toThrow(/filter/i)
    expect(() => assertSubset(parse(`<svg ${NS}><use href="#x"/></svg>`))).toThrow(/use/i)
    expect(() => assertSubset(parse(`<svg ${NS}><pattern id="p"></pattern></svg>`))).toThrow(/pattern/i)
  })
})

describe("assertSubset gradients", () => {
  it("allows a fill url() that resolves to a declared linearGradient", () => {
    const el = parse(
      `<svg ${NS}><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>` +
        `<rect x="0" y="0" width="10" height="10" fill="url(#g)"/></svg>`,
    )
    expect(() => assertSubset(el)).not.toThrow()
  })

  it("allows a fill url() that resolves to a declared radialGradient", () => {
    const el = parse(
      `<svg ${NS}><defs><radialGradient id="g"><stop offset="0" stop-color="#fff"/></radialGradient></defs>` +
        `<circle cx="5" cy="5" r="5" fill="url(#g)"/></svg>`,
    )
    expect(() => assertSubset(el)).not.toThrow()
  })

  it("rejects a fill url() that references an undeclared id, even when other gradients exist", () => {
    const el = parse(
      `<svg ${NS}><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>` +
        `<rect x="0" y="0" width="10" height="10" fill="url(#missing)"/></svg>`,
    )
    expect(() => assertSubset(el)).toThrow(/does not reference a declared/i)
  })

  it("rejects a stroke url() reference even when the gradient is declared", () => {
    const el = parse(
      `<svg ${NS}><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>` +
        `<rect x="0" y="0" width="10" height="10" stroke="url(#g)"/></svg>`,
    )
    expect(() => assertSubset(el)).toThrow(/stroke="url\(#g\)"/)
  })

  it("rejects a declared gradient using gradientUnits=userSpaceOnUse", () => {
    const el = parse(
      `<svg ${NS}><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="10" y2="0">` +
        `<stop offset="0" stop-color="#fff"/></linearGradient></defs></svg>`,
    )
    expect(() => assertSubset(el)).toThrow(/userSpaceOnUse/)
  })
})
