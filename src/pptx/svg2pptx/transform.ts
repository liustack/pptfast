/**
 * SVG 2D affine transform utilities.
 *
 * Represents the SVG `matrix(a,b,c,d,e,f)` as a 6-tuple:
 *
 *   | a c e |
 *   | b d f |
 *   | 0 0 1 |
 *
 * Point mapping: x' = a*x + c*y + e, y' = b*x + d*y + f.
 *
 * SVG transform-list composition direction (per SVG 1.1 §7.6):
 *   "translate(10,0) scale(2)" compiles to T_translate · T_scale.
 *   When applied to a point p, this equals T_translate(T_scale(p)),
 *   i.e. scale is applied first, translate second.
 *   Implementation: left-fold the list with `multiply`.
 */

/** A 2D affine matrix stored as [a, b, c, d, e, f]. */
export type Matrix = [number, number, number, number, number, number]

/** The identity matrix — leaves every point unchanged. */
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/**
 * Multiply two affine matrices: result = m1 · m2.
 *
 * For point application this means m2 acts first, then m1:
 *   applyPoint(multiply(m1, m2), x, y) === applyPoint(m1, ...applyPoint(m2, x, y))
 */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1
  const [a2, b2, c2, d2, e2, f2] = m2
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

/** Apply an affine matrix to a 2D point. */
export function applyPoint(
  m: Matrix,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  }
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

const DEG_TO_RAD = Math.PI / 180

/**
 * Regex that matches a single SVG transform function.
 * Captures: (1) function name, (2) the raw parameter string inside parens.
 */
const TRANSFORM_RE = /\b(translate|scale|rotate|matrix)\s*\(([^)]*)\)/g

/** Split the parameter string on commas and/or whitespace, returning numbers. */
function parseArgs(raw: string): number[] {
  return raw
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
}

/**
 * Parse an SVG `transform` attribute string into a single affine Matrix.
 *
 * Supports: translate, scale, rotate, matrix.
 *
 * **Composition direction** (SVG 1.1 §7.6, also SVG 2 §8.8):
 * > "The individual transform definitions are separated by whitespace and/or
 * > a comma. … the net effect is as if each transform had been specified
 * > separately in the order given."
 *
 * Concretely, `transform="T1 T2 T3"` is equivalent to the matrix product
 * T1 · T2 · T3. When this product is applied to a point p, T3 acts first
 * (innermost), then T2, then T1 (outermost). We build the result by
 * left-folding with `multiply`: result = ((I · T1) · T2) · T3.
 */
export function parseTransform(attr: string): Matrix {
  let result: Matrix = [...IDENTITY]

  // Reset lastIndex because the regex is global and reused.
  TRANSFORM_RE.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = TRANSFORM_RE.exec(attr)) !== null) {
    const fn = match[1]
    const args = parseArgs(match[2])
    let m: Matrix

    switch (fn) {
      case "translate": {
        const tx = args[0] ?? 0
        const ty = args[1] ?? 0
        m = [1, 0, 0, 1, tx, ty]
        break
      }
      case "scale": {
        const sx = args[0] ?? 1
        const sy = args[1] ?? sx
        m = [sx, 0, 0, sy, 0, 0]
        break
      }
      case "rotate": {
        const deg = args[0] ?? 0
        const rad = deg * DEG_TO_RAD
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        if (args.length >= 3) {
          // rotate(deg, cx, cy) = translate(cx,cy) · rotate(deg) · translate(-cx,-cy)
          const cx = args[1]
          const cy = args[2]
          m = multiply(
            multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]),
            [1, 0, 0, 1, -cx, -cy],
          )
        } else {
          m = [cos, sin, -sin, cos, 0, 0]
        }
        break
      }
      case "matrix": {
        m = [
          args[0] ?? 1,
          args[1] ?? 0,
          args[2] ?? 0,
          args[3] ?? 1,
          args[4] ?? 0,
          args[5] ?? 0,
        ]
        break
      }
      default:
        continue
    }

    result = multiply(result, m)
  }

  return result
}
