/**
 * SVG color → pptxgenjs color helpers.
 *
 * pptxgenjs wants a hash-less uppercase hex for `color` / `fill.color`, and a
 * separate `transparency` percent (0–100) for alpha — it has no rgba() concept
 * (see `ShapeFillProps`). These two helpers split an SVG color string into
 * those two pieces.
 */

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function toHexByte(n: number): string {
  return clampByte(n).toString(16).padStart(2, "0").toUpperCase()
}

interface Rgb {
  r: number
  g: number
  b: number
  a: number | null
}

/** Parse "rgb(...)" / "rgba(...)" into channel numbers, or null. */
function parseRgb(color: string): Rgb | null {
  const m = color.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i,
  )
  if (!m) return null
  return {
    r: parseFloat(m[1]),
    g: parseFloat(m[2]),
    b: parseFloat(m[3]),
    a: m[4] !== undefined ? parseFloat(m[4]) : null,
  }
}

/** SVG color string → uppercase hash-less hex (e.g. "1A4A8A"). */
export function svgColorToHex(color: string): string {
  const c = color.trim()
  if (c.startsWith("#")) {
    const hex = c.slice(1)
    if (hex.length === 3) {
      return hex
        .split("")
        .map((ch) => ch + ch)
        .join("")
        .toUpperCase()
    }
    return hex.toUpperCase()
  }
  const rgb = parseRgb(c)
  if (rgb) return toHexByte(rgb.r) + toHexByte(rgb.g) + toHexByte(rgb.b)
  // Unknown format: fall back to black so the export never crashes.
  return "000000"
}

/** rgba alpha → pptxgenjs transparency percent, or null when fully opaque. */
export function svgColorTransparency(color: string): number | null {
  const rgb = parseRgb(color.trim())
  if (!rgb || rgb.a === null || rgb.a >= 1) return null
  return Math.round((1 - rgb.a) * 100)
}
