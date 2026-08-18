// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { svgToOps } from "./dispatch"
import { pxToIn, SLIDE_W_IN } from "../../constants"

function parseSvg(inner: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`,
    "image/svg+xml",
  )
  const svg = doc.querySelector("svg")
  if (!svg) throw new Error("no svg parsed")
  return svg
}

describe("svgToOps", () => {
  it("dispatches each leaf element to its converter in document order", () => {
    const ops = svgToOps(
      parseSvg(`
        <rect x="0" y="0" width="96" height="96" fill="#000"/>
        <circle cx="48" cy="48" r="48" fill="#fff"/>
        <ellipse cx="48" cy="48" rx="48" ry="24" fill="#fff"/>
        <text x="0" y="20" font-size="16">Hi</text>
        <line x1="0" y1="0" x2="96" y2="96" stroke="#000"/>
        <polygon points="0,0 96,0 48,96" fill="#000"/>
        <path d="M0,0 L96,0 L96,96 Z" fill="#000"/>
        <image x="0" y="0" width="96" height="96" href="data:image/png;base64,AAA"/>
      `),
    )
    expect(ops.map((o) => o.kind)).toEqual([
      "shape",
      "shape",
      "shape",
      "text",
      "line",
      "path",
      "path",
      "image",
    ])
  })

  it("flattens a translate transform on a <g> into the leaf coordinates", () => {
    const ops = svgToOps(
      parseSvg(
        `<g transform="translate(96,192)"><rect x="0" y="0" width="96" height="96" fill="#000"/></g>`,
      ),
    )
    expect(ops).toHaveLength(1)
    expect(ops[0].x).toBeCloseTo(1, 3) // 96px → 1in
    expect(ops[0].y).toBeCloseTo(2, 3) // 192px → 2in
  })

  it("accumulates nested translate transforms", () => {
    const ops = svgToOps(
      parseSvg(
        `<g transform="translate(96,0)"><g transform="translate(0,96)"><rect x="0" y="0" width="96" height="96"/></g></g>`,
      ),
    )
    expect(ops[0].x).toBeCloseTo(1, 3)
    expect(ops[0].y).toBeCloseTo(1, 3)
  })

  it("flattens a transform set directly on a leaf element", () => {
    const ops = svgToOps(
      parseSvg(`<rect x="0" y="0" width="96" height="96" transform="translate(96,96)"/>`),
    )
    expect(ops[0].x).toBeCloseTo(1, 3)
    expect(ops[0].y).toBeCloseTo(1, 3)
  })

  it("offsets a text op's anchor box by the inherited translate", () => {
    const ops = svgToOps(
      parseSvg(
        `<g transform="translate(96,0)"><text x="0" y="20" font-size="16">Hi</text></g>`,
      ),
    )
    expect(ops[0].kind).toBe("text")
    expect(ops[0].x).toBeCloseTo(1, 3)
  })

  // A text box's width is measured against the canvas, so it can only be
  // computed once the op is in canvas coordinates. Before `anchorTextBox`
  // ran here it was computed from the `<text>` element's own (local) x, and
  // a `<g>` centered on its own content — `svg/components/cycle.tsx` puts
  // the ring's center at 0,0, so its top node's label sits at local x=0 and
  // its left node's label at a negative one — produced a zero or negative
  // `w`, i.e. an `a:ext cx <= 0` that `package-audit.ts` rejects. Every
  // `cycle` ever exported failed this way; these three cases are that shape
  // of group, reduced.
  it("sizes a centered text at a group's own origin against the canvas, not the local zero", () => {
    const ops = svgToOps(
      parseSvg(
        `<g transform="translate(640,360)"><text x="0" y="0" text-anchor="middle" font-size="16">Detect</text></g>`,
      ),
    )
    expect(ops[0].w).toBeGreaterThan(0)
    // Centered on the canvas center it landed on, and as wide as the slide
    // can give on both sides of it.
    expect(ops[0].x + ops[0].w / 2).toBeCloseTo(SLIDE_W_IN / 2, 3)
    expect(ops[0].w).toBeCloseTo(SLIDE_W_IN, 3)
  })

  it("sizes a right-anchored text at a negative local x from its canvas anchor", () => {
    const ops = svgToOps(
      parseSvg(
        `<g transform="translate(640,360)"><text x="-100" y="0" text-anchor="end" font-size="16">Harden</text></g>`,
      ),
    )
    expect(ops[0].w).toBeGreaterThan(0)
    // Right edge on the anchor: 640 - 100 = 540px.
    expect(ops[0].x + ops[0].w).toBeCloseTo(pxToIn(540), 3)
    expect(ops[0].x).toBeCloseTo(0, 3)
  })

  it("still gives a positive-width box to an anchor sitting on a canvas edge", () => {
    for (const anchor of ["middle", "end"]) {
      const ops = svgToOps(
        parseSvg(`<text x="0" y="0" text-anchor="${anchor}" font-size="16">Bleed</text>`),
      )
      expect(ops[0].w).toBeGreaterThan(0)
    }
  })

  it("ignores <defs> and other definition subtrees", () => {
    const ops = svgToOps(
      parseSvg(
        `<defs><rect x="0" y="0" width="96" height="96"/></defs><rect x="0" y="0" width="96" height="96" fill="#000"/>`,
      ),
    )
    expect(ops).toHaveLength(1)
  })

  it("resolves a fill=url(#id) leaf against <defs> gradients regardless of document order", () => {
    const ops = svgToOps(
      parseSvg(
        `<rect x="0" y="0" width="96" height="96" fill="url(#g)"/>` +
          `<defs><linearGradient id="g"><stop offset="0" stop-color="#FFF"/></linearGradient></defs>`,
      ),
    )
    expect(ops).toHaveLength(1)
    const op = ops[0] as { gradientFill?: { kind: string } }
    expect(op.gradientFill?.kind).toBe("linear")
  })
})

describe("scale transform at leaves", () => {
  it("applies group scale to shape geometry", () => {
    const doc = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(96,96) scale(0.5)"><rect x="0" y="0" width="24" height="24" fill="#112233"/></g></svg>',
      "image/svg+xml",
    )
    const ops = svgToOps(doc.documentElement)
    expect(ops).toHaveLength(1)
    const op = ops[0] as { w: number; h: number; x: number }
    // 24px × 0.5 = 12px = 0.125in
    expect(op.w).toBeCloseTo(0.125, 3)
    expect(op.x).toBeCloseTo(1, 3)
  })

  it("carries gradientFill through a scaled/translated leaf untouched", () => {
    const doc = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#FF0000"/><stop offset="1" stop-color="#0000FF"/></linearGradient></defs>' +
        '<g transform="translate(96,96) scale(0.5)"><rect x="0" y="0" width="24" height="24" fill="url(#g)"/></g>' +
        "</svg>",
      "image/svg+xml",
    )
    const ops = svgToOps(doc.documentElement)
    expect(ops).toHaveLength(1)
    const op = ops[0] as { gradientFill?: { kind: string; angleDeg: number } }
    expect(op.gradientFill).toEqual({ kind: "linear", angleDeg: 0, stops: expect.any(Array) })
  })
})

// Wave-C S3: `components/index.tsx`'s `renderComponent` tags a component's output with
// `<g data-blk="N">` when `meta.animation.elements === "auto"`. This is the
// export-side half of that contract — every leaf under such a `<g>` must
// carry `blockIndex` on its op.
describe("data-blk propagation (wave-C S3)", () => {
  it("stamps blockIndex on every leaf op under a data-blk-tagged <g>", () => {
    const ops = svgToOps(
      parseSvg(`<g data-blk="2"><rect x="0" y="0" width="10" height="10"/><text x="0" y="0">Hi</text></g>`),
    )
    expect(ops).toHaveLength(2)
    expect(ops[0].blockIndex).toBe(2)
    expect(ops[1].blockIndex).toBe(2)
  })

  it("leaves blockIndex undefined for ops outside any data-blk group", () => {
    const ops = svgToOps(parseSvg(`<rect x="0" y="0" width="10" height="10"/>`))
    expect(ops[0].blockIndex).toBeUndefined()
  })

  it("does not leak a data-blk tag into siblings outside its own <g>", () => {
    const ops = svgToOps(
      parseSvg(
        `<g data-blk="0"><rect x="0" y="0" width="10" height="10"/></g><rect x="0" y="0" width="10" height="10"/>`,
      ),
    )
    expect(ops[0].blockIndex).toBe(0)
    expect(ops[1].blockIndex).toBeUndefined()
  })

  it("a nested data-blk overrides its parent's for its own subtree, then reverts for later siblings", () => {
    const ops = svgToOps(
      parseSvg(
        `<g data-blk="0">` +
          `<rect x="0" y="0" width="1" height="1"/>` +
          `<g data-blk="1"><rect x="0" y="0" width="1" height="1"/></g>` +
          `<rect x="0" y="0" width="1" height="1"/>` +
          `</g>`,
      ),
    )
    expect(ops.map((o) => o.blockIndex)).toEqual([0, 1, 0])
  })

  it("propagates through a plain (untagged) nested <g> without losing the ancestor's tag", () => {
    const ops = svgToOps(
      parseSvg(`<g data-blk="3"><g transform="translate(1,1)"><rect x="0" y="0" width="1" height="1"/></g></g>`),
    )
    expect(ops[0].blockIndex).toBe(3)
  })

  it("blockIndex 0 is stamped (loose-equality null check doesn't swallow a falsy-but-valid index)", () => {
    const ops = svgToOps(parseSvg(`<g data-blk="0"><rect x="0" y="0" width="1" height="1"/></g>`))
    expect(ops[0].blockIndex).toBe(0)
  })
})
