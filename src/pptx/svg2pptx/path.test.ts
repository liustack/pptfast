// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { polygonToOp, polylineToOp, pathToOp, type PathArc } from "./path"
import { pxToIn } from "../../constants"

function svgEl(tag: string, attrs: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg"><${tag} ${attrs}/></svg>`,
    "image/svg+xml",
  )
  const el = doc.querySelector(tag)
  if (!el) throw new Error("no element parsed")
  return el
}

describe("polygonToOp", () => {
  it("builds a closed custGeom with a tight bbox and bbox-relative points", () => {
    const op = polygonToOp(
      svgEl("polygon", 'points="96,48 288,48 192,144" fill="#1A4A8A"'),
    )
    expect(op.kind).toBe("path")
    // bbox spans x 96..288 (192px=2in), y 48..144 (96px=1in)
    expect(op.x).toBeCloseTo(1, 3)
    expect(op.y).toBeCloseTo(0.5, 3)
    expect(op.w).toBeCloseTo(2, 3)
    expect(op.h).toBeCloseTo(1, 3)
    // points are inches relative to the bbox origin (96,48)
    expect(op.points).toEqual([
      { x: 0, y: 0, moveTo: true },
      { x: pxToIn(192), y: 0 },
      { x: pxToIn(96), y: pxToIn(96) },
      { close: true },
    ])
    expect(op.fill).toEqual({ color: "1A4A8A" })
  })

  it("accepts space-separated coordinate pairs too", () => {
    const op = polygonToOp(svgEl("polygon", 'points="0 0 96 0 96 96" fill="#000"'))
    expect(op.points).toEqual([
      { x: 0, y: 0, moveTo: true },
      { x: pxToIn(96), y: 0 },
      { x: pxToIn(96), y: pxToIn(96) },
      { close: true },
    ])
  })
})

describe("polylineToOp", () => {
  it("builds an open custGeom (no close) and carries stroke as a line in points", () => {
    const op = polylineToOp(
      svgEl(
        "polyline",
        'points="0,0 96,0 96,96" fill="none" stroke="#FF0000" stroke-width="2"',
      ),
    )
    expect(op.points).toEqual([
      { x: 0, y: 0, moveTo: true },
      { x: pxToIn(96), y: 0 },
      { x: pxToIn(96), y: pxToIn(96) },
    ])
    expect(op.line).toEqual({ color: "FF0000", width: 1.5 })
    expect(op.fill).toBeUndefined()
  })
})

describe("pathToOp", () => {
  it("parses an absolute M/L/Z scrim into a closed, bbox-relative custGeom", () => {
    const op = pathToOp(
      svgEl("path", 'd="M 880,720 L 880,560 L 1280,320 L 1280,720 Z" fill="#000"'),
    )
    expect(op.kind).toBe("path")
    // bbox: x 880..1280, y 320..720 → 400px square
    expect(op.x).toBeCloseTo(pxToIn(880), 3)
    expect(op.y).toBeCloseTo(pxToIn(320), 3)
    expect(op.w).toBeCloseTo(pxToIn(400), 3)
    expect(op.h).toBeCloseTo(pxToIn(400), 3)
    expect(op.points).toEqual([
      { x: 0, y: pxToIn(400), moveTo: true },
      { x: 0, y: pxToIn(240) },
      { x: pxToIn(400), y: 0 },
      { x: pxToIn(400), y: pxToIn(400) },
      { close: true },
    ])
    expect(op.fill).toEqual({ color: "000000" })
  })

  it("supports relative m/l/h/v/z commands", () => {
    const op = pathToOp(svgEl("path", 'd="M10,10 h20 v20 z" fill="#fff"'))
    // anchors: (10,10) (30,10) (30,30); bbox 10..30 square (20px=in)
    expect(op.x).toBeCloseTo(pxToIn(10), 3)
    expect(op.y).toBeCloseTo(pxToIn(10), 3)
    expect(op.w).toBeCloseTo(pxToIn(20), 3)
    expect(op.h).toBeCloseTo(pxToIn(20), 3)
    expect(op.points).toEqual([
      { x: 0, y: 0, moveTo: true },
      { x: pxToIn(20), y: 0 },
      { x: pxToIn(20), y: pxToIn(20) },
      { close: true },
    ])
  })

  it("treats extra coordinate pairs after M as implicit lineTo", () => {
    const op = pathToOp(svgEl("path", 'd="M0,0 96,0 96,96" fill="none" stroke="#000"'))
    expect(op.points).toEqual([
      { x: 0, y: 0, moveTo: true },
      { x: pxToIn(96), y: 0 },
      { x: pxToIn(96), y: pxToIn(96) },
    ])
  })

  it("converts an SVG arc (A) into a center-parameterized arcTo curve", () => {
    // Quarter pie: center (640,360), r=200, from 3 o'clock to 6 o'clock clockwise.
    const op = pathToOp(
      svgEl(
        "path",
        'd="M 640,360 L 840,360 A 200,200 0 0 1 640,560 Z" fill="#3366CC"',
      ),
    )
    // anchors (640,360)(840,360)(640,560) → bbox x 640..840, y 360..560 (200px each)
    expect(op.x).toBeCloseTo(pxToIn(640), 3)
    expect(op.y).toBeCloseTo(pxToIn(360), 3)
    expect(op.w).toBeCloseTo(pxToIn(200), 3)
    expect(op.h).toBeCloseTo(pxToIn(200), 3)
    expect(op.points[0]).toEqual({ x: 0, y: 0, moveTo: true })
    expect(op.points[1]).toEqual({ x: pxToIn(200), y: 0 })
    const arc = op.points[2] as { x: number; y: number; curve: PathArc }
    expect(arc.x).toBeCloseTo(0, 3)
    expect(arc.y).toBeCloseTo(pxToIn(200), 3)
    expect(arc.curve.type).toBe("arc")
    expect(arc.curve.wR).toBeCloseTo(pxToIn(200), 3)
    expect(arc.curve.hR).toBeCloseTo(pxToIn(200), 3)
    expect(arc.curve.stAng).toBeCloseTo(0, 1)
    expect(arc.curve.swAng).toBeCloseTo(90, 1)
    expect(op.points[3]).toEqual({ close: true })
    expect(op.fill).toEqual({ color: "3366CC" })
  })
})

describe("cubic and quadratic bezier commands", () => {
  it("parses C/c into cubic curve points", () => {
    const el = svgEl('path', 'd="M0 0 C 10 0 20 10 20 20" stroke="#111111"')
    const op = pathToOp(el)
    const curved = op.points.find((p) => "curve" in p && p.curve?.type === "cubic")
    expect(curved).toBeDefined()
  })

  it("parses S (smooth cubic) reflecting the previous control point", () => {
    const el = svgEl('path', 'd="M0 0 C 10 0 20 10 20 20 S 30 40 40 40" stroke="#111111"')
    const op = pathToOp(el)
    const cubics = op.points.filter((p) => "curve" in p && p.curve?.type === "cubic")
    expect(cubics.length).toBe(2)
  })

  it("parses Q/T quadratic commands", () => {
    const el = svgEl('path', 'd="M0 0 Q 10 0 20 20 T 40 40" stroke="#111111"')
    const op = pathToOp(el)
    const quads = op.points.filter((p) => "curve" in p && p.curve?.type === "quadratic")
    expect(quads.length).toBe(2)
  })

  it("keeps a lucide-style mixed path lossless in anchor count", () => {
    // lucide lightbulb 首段：M + c 曲线混合
    const el = svgEl('path', 'd="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" stroke="#111111"')
    const op = pathToOp(el)
    // 4 段 c/A 曲线全部保留（旧实现会静默丢弃 c 段）
    const curveCount = op.points.filter((p) => "curve" in p || "arc" in p).length
    expect(curveCount).toBeGreaterThanOrEqual(4)
  })
})

describe("arc-aware bbox", () => {
  it("gives a flat arc path a non-zero height covering the bulge", () => {
    const el = svgEl('path', 'd="M3 12A9 3 0 0 0 21 12" stroke="#111111"')
    const op = pathToOp(el)
    expect(op.h).toBeGreaterThan(0)
  })
})
