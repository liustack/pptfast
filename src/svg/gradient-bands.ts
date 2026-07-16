/**
 * Linear colour interpolation between two hex colours, producing `n` evenly
 * spaced band colours (including the endpoints). Used by the SVG background
 * renderer to approximate a gradient with solid-fill <rect> bands — every
 * output is a plain #RRGGBB hex string so the svg2pptx bridge can map each
 * band to a native DrawingML solid-fill rect.
 */

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).toUpperCase().padStart(2, "0"))
      .join("")
  )
}

/**
 * Return `n` hex colours linearly interpolated from `from` to `to`.
 * The first element equals `from` and the last equals `to`.
 * @param from  Start colour as #RRGGBB (case-insensitive).
 * @param to    End colour as #RRGGBB (case-insensitive).
 * @param n     Number of bands (must be >= 2).
 */
export function gradientBands(from: string, to: string, n: number): string[] {
  if (n < 2) throw new Error("gradientBands requires n >= 2")

  const [r1, g1, b1] = parseHex(from)
  const [r2, g2, b2] = parseHex(to)

  const result: string[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    result.push(toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t))
  }
  return result
}
