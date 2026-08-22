// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { svgToOps, type Op } from "./dispatch"
import { applyPoint, parseTransform } from "./transform"
import { pxToIn, pxToPt, PX_PER_IN, SLIDE_W_IN } from "../../constants"

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

// SVG paints by *inheritance*: `fill`/`stroke`/`stroke-width`/`fill-opacity`/
// `stroke-opacity`/`stroke-dasharray` set on a `<g>` apply to every descendant
// that does not set its own, and `opacity` on a `<g>` composites the whole
// subtree (so a child's own `opacity` multiplies with it rather than replacing
// it). `walk` used to compose only `transform`, so a motif that painted its
// group and left its shapes bare — pulse's cell rings, terra's contours,
// ember's sparks, enterprise's ticks, rail's corners, vermilion's rays — came
// out of the exporter colorless (or, for `<line>`, black, from `line.ts`'s own
// `#000000` stroke default) while the browser preview showed it painted.
describe("paint inheritance from containers", () => {
  /**
   * `Op` is a union and `TextOp` carries neither `fill` nor `line`, so these
   * assertions read the painted shape through one narrowing helper rather
   * than casting at every call site.
   */
  interface Painted {
    fill?: { color: string; transparency?: number }
    line?: { color: string; width: number; transparency?: number; dashType?: string }
    gradientFill?: { kind: string }
    color?: string
    runs?: { text: string; fontSize?: number }[]
  }
  const paint = (op: Op | undefined): Painted => op as unknown as Painted

  it("inherits a <g> fill onto a leaf that has none", () => {
    const ops = svgToOps(parseSvg(`<g fill="#BC4620"><circle cx="10" cy="10" r="5"/></g>`))
    expect(paint(ops[0]).fill).toEqual({ color: "BC4620" })
  })

  it("lets the leaf's own fill win over the inherited one", () => {
    const ops = svgToOps(
      parseSvg(`<g fill="#BC4620"><circle cx="10" cy="10" r="5" fill="#0A0B0C"/></g>`),
    )
    expect(paint(ops[0]).fill).toEqual({ color: "0A0B0C" })
  })

  it("inherits stroke and stroke-width onto a bare <circle>", () => {
    const ops = svgToOps(
      parseSvg(
        `<g fill="none" stroke="#3D9B82" stroke-width="1.2"><circle cx="50" cy="50" r="9"/></g>`,
      ),
    )
    expect(paint(ops[0]).line).toEqual({ color: "3D9B82", width: pxToPt(1.2) })
    // `fill="none"` inherits as "no fill", not as some black default.
    expect(paint(ops[0]).fill).toBeUndefined()
  })

  it("inherits stroke onto a bare <line> instead of falling back to black", () => {
    const ops = svgToOps(
      parseSvg(`<g stroke="#A8861D" stroke-width="1.5"><line x1="0" y1="0" x2="96" y2="0"/></g>`),
    )
    expect(paint(ops[0]).line?.color).toBe("A8861D")
    expect(paint(ops[0]).line?.width).toBeCloseTo(pxToPt(1.5), 6)
  })

  it("inherits stroke-dasharray onto a bare <line>", () => {
    const ops = svgToOps(
      parseSvg(
        `<g stroke="#A8861D" stroke-dasharray="6 4"><line x1="0" y1="0" x2="96" y2="0"/></g>`,
      ),
    )
    expect(paint(ops[0]).line?.dashType).toBe("dash")
  })

  it("inherits fill-opacity and stroke-opacity onto a bare leaf", () => {
    const filled = svgToOps(
      parseSvg(
        `<g fill="#E84F8A" fill-opacity="0.4"><rect x="0" y="0" width="10" height="10"/></g>`,
      ),
    )
    expect(paint(filled[0]).fill).toEqual({ color: "E84F8A", transparency: 60 })
    const stroked = svgToOps(
      parseSvg(
        `<g stroke="#E84F8A" stroke-opacity="0.4"><rect x="0" y="0" width="10" height="10"/></g>`,
      ),
    )
    expect(paint(stroked[0]).line?.transparency).toBe(60)
  })

  it("resolves an inherited fill=url(#id) against the collected gradients", () => {
    const ops = svgToOps(
      parseSvg(
        `<defs><linearGradient id="g"><stop offset="0" stop-color="#FFF"/></linearGradient></defs>` +
          `<g fill="url(#g)"><rect x="0" y="0" width="10" height="10"/></g>`,
      ),
    )
    expect(paint(ops[0]).gradientFill?.kind).toBe("linear")
  })

  it("overrides an outer <g>'s paint from an inner one, then reverts for later siblings", () => {
    const ops = svgToOps(
      parseSvg(
        `<g fill="#111111">` +
          `<rect x="0" y="0" width="1" height="1"/>` +
          `<g fill="#222222"><rect x="0" y="0" width="1" height="1"/></g>` +
          `<rect x="0" y="0" width="1" height="1"/>` +
          `</g>`,
      ),
    )
    expect(ops.map((o) => paint(o).fill?.color)).toEqual(["111111", "222222", "111111"])
  })

  it("does not leak a <g>'s paint to siblings outside it", () => {
    const ops = svgToOps(
      parseSvg(
        `<g fill="#111111"><rect x="0" y="0" width="1" height="1"/></g>` +
          `<rect x="0" y="0" width="1" height="1"/>`,
      ),
    )
    expect(paint(ops[0]).fill).toEqual({ color: "111111" })
    expect(paint(ops[1]).fill).toBeUndefined()
  })

  it("multiplies a group's opacity with the leaf's own rather than replacing it", () => {
    const both = svgToOps(
      parseSvg(`<g opacity="0.5"><circle cx="5" cy="5" r="5" fill="#000000" opacity="0.5"/></g>`),
    )
    expect(paint(both[0]).fill?.transparency).toBe(75)
    const groupOnly = svgToOps(
      parseSvg(`<g opacity="0.5"><circle cx="5" cy="5" r="5" fill="#000000"/></g>`),
    )
    expect(paint(groupOnly[0]).fill?.transparency).toBe(50)
  })

  it("compounds group opacity through nested containers", () => {
    const ops = svgToOps(
      parseSvg(
        `<g opacity="0.5"><g opacity="0.5"><circle cx="5" cy="5" r="5" fill="#000000"/></g></g>`,
      ),
    )
    expect(paint(ops[0]).fill?.transparency).toBe(75)
  })

  it("applies a group's opacity to a <line>'s stroke transparency", () => {
    const ops = svgToOps(
      parseSvg(`<g stroke="#A8861D" opacity="0.5"><line x1="0" y1="0" x2="96" y2="0"/></g>`),
    )
    expect(paint(ops[0]).line?.transparency).toBe(50)
  })

  it("seeds inheritance from the root element it is handed, not just from inner <g>s", () => {
    // `svgToOps` is handed a decoration subtree directly by the export probes,
    // so the root's own paint has to count too.
    const doc = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><g fill="#BC4620"><circle cx="5" cy="5" r="5"/></g></svg>`,
      "image/svg+xml",
    )
    const group = doc.querySelector("g")
    if (!group) throw new Error("no group parsed")
    expect(paint(svgToOps(group)[0]).fill).toEqual({ color: "BC4620" })
  })

  it("leaves the source element untouched — inheritance is resolved on a copy", () => {
    const root = parseSvg(`<g fill="#BC4620"><circle cx="5" cy="5" r="5"/></g>`)
    svgToOps(root)
    expect(root.querySelector("circle")?.hasAttribute("fill")).toBe(false)
  })

  it("still reads a <text>'s own fill when a container paints around it", () => {
    const ops = svgToOps(
      parseSvg(`<g fill="#BC4620"><text x="0" y="20" font-size="16" fill="#0A0B0C">Hi</text></g>`),
    )
    expect(paint(ops[0]).color).toBe("0A0B0C")
  })

  it("inherits a container fill as a <text>'s color when the text sets none", () => {
    const ops = svgToOps(
      parseSvg(`<g fill="#BC4620"><text x="0" y="20" font-size="16">Hi</text></g>`),
    )
    expect(paint(ops[0]).color).toBe("BC4620")
  })

  it("keeps a <text>'s tspan runs intact through the inheritance copy", () => {
    const ops = svgToOps(
      parseSvg(
        `<g fill="#BC4620"><text x="0" y="20" font-size="16">99.95<tspan font-size="10">%</tspan></text></g>`,
      ),
    )
    const runs = paint(ops[0]).runs ?? []
    expect(runs.map((r) => r.text)).toEqual(["99.95", "%"])
    expect(runs[1]?.fontSize).toBeCloseTo(pxToPt(10), 6)
  })
})

describe("rotated text leaves (cartesian y-title)", () => {
  it("keeps a rotate(-90) text as a positive-size box with a 270° pptx rotation, not a zeroed scale", () => {
    const ops = svgToOps(
      parseSvg(
        `<g transform="translate(96,52)"><text x="18" y="222" font-size="14" text-anchor="start" transform="rotate(-90 18 222)">Revenue</text></g>`,
      ),
    )
    expect(ops).toHaveLength(1)
    expect(ops[0].kind).toBe("text")
    const text = ops[0] as Extract<Op, { kind: "text" }>
    expect(text.w).toBeGreaterThan(0)
    expect(text.h).toBeGreaterThan(0)
    expect(text.rotate).toBe(270)
    expect(text.runs[0]?.text).toBe("Revenue")
  })

  it("places the 270° box so the SVG left-baseline lands on the canvas anchor", () => {
    const ops = svgToOps(
      parseSvg(
        `<g transform="translate(96,52)"><text x="18" y="222" font-size="14" text-anchor="start" transform="rotate(-90 18 222)">Revenue</text></g>`,
      ),
    )
    const text = ops[0] as Extract<Op, { kind: "text" }>
    expect(text.rotate).toBe(270)
    const cx = (text.x + text.w / 2) * PX_PER_IN
    const cy = (text.y + text.h / 2) * PX_PER_IN
    const wPx = text.w * PX_PER_IN
    const hPx = text.h * PX_PER_IN
    // Matches text.ts ASCENT_RATIO: alphabetic baseline is ~0.8em below the box top.
    const ascent = 0.8 * 14
    // pptxgenjs/OOXML rotate 270° clockwise around the box center: (dx, dy) → (dy, -dx).
    const left = -wPx / 2
    const baseline = -hPx / 2 + ascent
    expect(cx + baseline).toBeCloseTo(96 + 18, 5)
    expect(cy + -left).toBeCloseTo(52 + 222, 5)
  })
})

describe("rotated text leaves (arbitrary small angles)", () => {
  function rotatedBaseline(
    text: Extract<Op, { kind: "text" }>,
    fontSizePx: number,
    anchor: "start" | "middle" | "end",
  ): { x: number; y: number } {
    const cx = (text.x + text.w / 2) * PX_PER_IN
    const cy = (text.y + text.h / 2) * PX_PER_IN
    const wPx = text.w * PX_PER_IN
    const hPx = text.h * PX_PER_IN
    const ascent = 0.8 * fontSizePx
    const dx = anchor === "middle" ? 0 : anchor === "end" ? wPx / 2 : -wPx / 2
    const dy = -hPx / 2 + ascent
    const rad = ((text.rotate ?? 0) * Math.PI) / 180
    return {
      x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
      y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
    }
  }

  it("keeps rotate(4 CX CY) at 4° (not snapped to 0 or 90) with the middle-baseline on the SVG anchor", () => {
    const ops = svgToOps(
      parseSvg(
        `<text x="1136" y="32" font-size="20" font-weight="700" text-anchor="middle" transform="rotate(4 1136 25)">2026 年 7 月</text>`,
      ),
    )
    expect(ops).toHaveLength(1)
    const text = ops[0] as Extract<Op, { kind: "text" }>
    expect(text.rotate).toBeCloseTo(4, 5)
    expect(text.rotate).not.toBe(0)
    expect(text.rotate).not.toBe(90)
    expect(text.w * PX_PER_IN).toBeLessThan(400)

    const svgAnchor = applyPoint(parseTransform("rotate(4 1136 25)"), 1136, 32)
    const baseline = rotatedBaseline(text, 20, "middle")
    expect(baseline.x).toBeCloseTo(svgAnchor.x, 5)
    expect(baseline.y).toBeCloseTo(svgAnchor.y, 5)
  })

  it("places a start-anchored rotate(4) so the left-baseline lands on the SVG anchor", () => {
    const ops = svgToOps(
      parseSvg(
        `<text x="200" y="80" font-size="16" text-anchor="start" transform="rotate(4 200 80)">Tilt</text>`,
      ),
    )
    const text = ops[0] as Extract<Op, { kind: "text" }>
    expect(text.rotate).toBeCloseTo(4, 5)
    const svgAnchor = applyPoint(parseTransform("rotate(4 200 80)"), 200, 80)
    const baseline = rotatedBaseline(text, 16, "start")
    expect(baseline.x).toBeCloseTo(svgAnchor.x, 5)
    expect(baseline.y).toBeCloseTo(svgAnchor.y, 5)
  })

  it("places a rotate(90) start-anchored title with the same baseline construction as 270°", () => {
    const ops = svgToOps(
      parseSvg(
        `<g transform="translate(96,52)"><text x="18" y="222" font-size="14" text-anchor="start" transform="rotate(90 18 222)">Down</text></g>`,
      ),
    )
    const text = ops[0] as Extract<Op, { kind: "text" }>
    expect(text.rotate).toBe(90)
    expect(text.w).toBeGreaterThan(0)
    expect(text.h).toBeGreaterThan(0)
    const svgAnchor = applyPoint(parseTransform("translate(96,52) rotate(90 18 222)"), 18, 222)
    const baseline = rotatedBaseline(text, 14, "start")
    expect(baseline.x).toBeCloseTo(svgAnchor.x, 5)
    expect(baseline.y).toBeCloseTo(svgAnchor.y, 5)
  })
})
