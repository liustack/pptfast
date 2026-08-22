import { describe, expect, it } from "vitest"
import { rotateRectPolygon } from "./shared"

const round1 = (v: number) => Math.round(v * 10) / 10

/** Independent CSS/SVG clockwise bake. Does not import the helper under test. */
function bakeClockwise(cx: number, cy: number, width: number, height: number, cssDeg: number): string {
  const a = (cssDeg * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const hw = width / 2
  const hh = height / 2
  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]
  return corners
    .map(([lx, ly]) => `${round1(cx + lx * ca - ly * sa)},${round1(cy + lx * sa + ly * ca)}`)
    .join(" ")
}

function parsePoints(points: string): { x: number; y: number }[] {
  return points
    .trim()
    .split(/\s+/)
    .map((p) => {
      const [x, y] = p.split(",").map(Number)
      return { x: x!, y: y! }
    })
}

describe("rotateRectPolygon", () => {
  it("bakes a clockwise 4° playbill chip (top-right corner drops in y-down)", () => {
    const points = rotateRectPolygon(1100, 152, 180, 64, 4)
    expect(points).toBe(bakeClockwise(1100, 152, 180, 64, 4))
    expect(points).not.toBe(bakeClockwise(1100, 152, 180, 64, -4))

    const pts = parsePoints(points)
    const tr = pts[1]!
    const unrotatedTr = { x: 1100 + 180 / 2, y: 152 - 64 / 2 }
    expect(tr.y).toBeGreaterThan(unrotatedTr.y)
    expect(tr.x).toBeGreaterThan(unrotatedTr.x)
  })

  it("does not negate a 45° luxe diamond: the helper matches the clockwise bake", () => {
    const points = rotateRectPolygon(640, 180, 14, 14, 45)
    expect(points).toBe(bakeClockwise(640, 180, 14, 14, 45))
    expect(points).not.toBe(bakeClockwise(640, 180, 14, 14, -45))

    const pts = parsePoints(points)
    expect(pts).toHaveLength(4)
    const dist = (p: { x: number; y: number }) => Math.hypot(p.x - 640, p.y - 180)
    const d0 = dist(pts[0]!)
    for (const p of pts) expect(dist(p)).toBeCloseTo(d0, 5)
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 5)
  })
})
