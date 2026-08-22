import { measureMonoTextUnits, measureTextUnits } from "../../lib/svg-text-layout"
import { isBold, isMonoFontFamily } from "../fonts"

export interface DepthBox {
  x: number
  y: number
  w: number
  h: number
}

export interface TextInkInput {
  content: string
  x: number
  y: number
  fontSize: number
  fontFamily: string
  fontWeight: string | number | null | undefined
  textAnchor: string
}

export interface SvgMatrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const IDENTITY_MATRIX: SvgMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
export const TEXT_INK_ASCENT = 0.72
export const TEXT_INK_DESCENT = 0.12

export function textInkBox(input: TextInkInput): DepthBox {
  const units = isMonoFontFamily(input.fontFamily)
    ? measureMonoTextUnits(input.content)
    : measureTextUnits(input.content, {
        bold: isBold(input.fontWeight === null || input.fontWeight === undefined ? null : String(input.fontWeight)),
        fontFamily: input.fontFamily,
      })
  const width = units * input.fontSize
  const x = input.textAnchor === "end" ? input.x - width : input.textAnchor === "middle" ? input.x - width / 2 : input.x
  const y = input.y - input.fontSize * TEXT_INK_ASCENT
  return { x, y, w: width, h: input.fontSize * (TEXT_INK_ASCENT + TEXT_INK_DESCENT) }
}

export function boxesIntersect(a: DepthBox, b: DepthBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function unionBoxes(boxes: readonly DepthBox[]): DepthBox | null {
  if (boxes.length === 0) return null
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.w))
  const bottom = Math.max(...boxes.map((box) => box.y + box.h))
  return { x: left, y: top, w: right - left, h: bottom - top }
}

export function multiplyMatrices(left: SvgMatrix, right: SvgMatrix): SvgMatrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  }
}

function transformCommand(name: string, values: number[]): SvgMatrix {
  if (name === "translate") return { a: 1, b: 0, c: 0, d: 1, e: values[0] ?? 0, f: values[1] ?? 0 }
  if (name === "scale") {
    const sx = values[0] ?? 1
    return { a: sx, b: 0, c: 0, d: values[1] ?? sx, e: 0, f: 0 }
  }
  if (name === "matrix" && values.length >= 6) {
    return { a: values[0]!, b: values[1]!, c: values[2]!, d: values[3]!, e: values[4]!, f: values[5]! }
  }
  if (name === "rotate") {
    const radians = ((values[0] ?? 0) * Math.PI) / 180
    const rotation = {
      a: Math.cos(radians),
      b: Math.sin(radians),
      c: -Math.sin(radians),
      d: Math.cos(radians),
      e: 0,
      f: 0,
    }
    if (values.length < 3) return rotation
    const [cx, cy] = [values[1]!, values[2]!]
    return multiplyMatrices(
      multiplyMatrices({ a: 1, b: 0, c: 0, d: 1, e: cx, f: cy }, rotation),
      { a: 1, b: 0, c: 0, d: 1, e: -cx, f: -cy },
    )
  }
  return IDENTITY_MATRIX
}

export function parseSvgTransform(transform: unknown): SvgMatrix {
  if (typeof transform !== "string" || transform.trim() === "") return IDENTITY_MATRIX
  let matrix = IDENTITY_MATRIX
  for (const match of transform.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)) {
    const values = match[2]!.trim().split(/[\s,]+/).filter(Boolean).map(Number)
    matrix = multiplyMatrices(matrix, transformCommand(match[1]!.toLowerCase(), values))
  }
  return matrix
}

export function transformBox(box: DepthBox, matrix: SvgMatrix): DepthBox {
  const points = [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x, box.y + box.h],
    [box.x + box.w, box.y + box.h],
  ].map(([x, y]) => ({ x: matrix.a * x! + matrix.c * y! + matrix.e, y: matrix.b * x! + matrix.d * y! + matrix.f }))
  const left = Math.min(...points.map((point) => point.x))
  const top = Math.min(...points.map((point) => point.y))
  const right = Math.max(...points.map((point) => point.x))
  const bottom = Math.max(...points.map((point) => point.y))
  return { x: left, y: top, w: right - left, h: bottom - top }
}

export function localDelta(matrix: SvgMatrix, dx: number, dy: number): { dx: number; dy: number } | null {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (Math.abs(determinant) < 1e-9) return null
  return {
    dx: (matrix.d * dx - matrix.c * dy) / determinant,
    dy: (-matrix.b * dx + matrix.a * dy) / determinant,
  }
}
