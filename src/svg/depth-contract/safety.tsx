import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react"
import type { StyleColors } from "../../themes/tokens"
import { CANVAS_H_PX, CANVAS_W_PX } from "../../constants"
import { blendOver } from "../ink"
import {
  capHexSaturation,
  contentRecessOpacity,
  midgroundSaturationCeiling,
} from "../motifs/decor-budget"
import {
  IDENTITY_MATRIX,
  boxesIntersect,
  localDelta,
  multiplyMatrices,
  parseSvgTransform,
  textInkBox,
  transformBox,
  type DepthBox,
  type SvgMatrix,
} from "./geometry"

type ElementProps = Record<string, unknown> & { children?: ReactNode }

interface PaintState {
  fill?: string
  stroke?: string
  fillOpacity: number
  strokeOpacity: number
  strokeWidth: number
  groupOpacity: number
}

export interface MidgroundContractOptions {
  midground: ReactNode
  foreground: ReactNode
  background: string
  colors: StyleColors
}

const INITIAL_PAINT: PaintState = {
  fill: undefined,
  stroke: undefined,
  fillOpacity: 1,
  strokeOpacity: 1,
  strokeWidth: 1,
  groupOpacity: 1,
}

const LEAF_TAGS = new Set(["circle", "ellipse", "image", "line", "path", "polygon", "polyline", "rect", "text"])
const FOREGROUND_BOX_TAGS = new Set(["image", "rect", "text"])
const DEFINITION_TAGS = new Set(["clippath", "defs", "lineargradient", "mask", "pattern", "radialgradient", "stop"])

function clamp01(value: unknown, fallback = 1): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(1, Math.max(0, parsed))
}

function numberProp(props: ElementProps, name: string, fallback = 0): number {
  const value = props[name]
  if (value === undefined || value === null || value === "") return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function stringProp(props: ElementProps, name: string): string | undefined {
  const value = props[name]
  return typeof value === "string" ? value : undefined
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (!isValidElement<ElementProps>(node)) return ""
  return Children.toArray(node.props.children).map(textContent).join("")
}

function executeFunctionElement(element: ReactElement<ElementProps>): { handled: boolean; node: ReactNode } {
  if (typeof element.type !== "function") return { handled: false, node: element }
  if ("isReactComponent" in (element.type.prototype ?? {})) return { handled: false, node: element }
  const component = element.type as unknown as (props: ElementProps) => ReactNode
  return { handled: true, node: component(element.props) }
}

function inheritedPaint(parent: PaintState, props: ElementProps, container: boolean): PaintState {
  return {
    fill: stringProp(props, "fill") ?? parent.fill,
    stroke: stringProp(props, "stroke") ?? parent.stroke,
    fillOpacity: props.fillOpacity === undefined ? parent.fillOpacity : clamp01(props.fillOpacity),
    strokeOpacity: props.strokeOpacity === undefined ? parent.strokeOpacity : clamp01(props.strokeOpacity),
    strokeWidth: props.strokeWidth === undefined ? parent.strokeWidth : Math.max(0, numberProp(props, "strokeWidth", 1)),
    groupOpacity: parent.groupOpacity * (container ? clamp01(props.opacity) : 1),
  }
}

function leafPaint(parent: PaintState, props: ElementProps): PaintState {
  return inheritedPaint(parent, props, false)
}

function pointsBox(raw: unknown): DepthBox | null {
  if (typeof raw !== "string") return null
  const points = raw
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number))
    .filter((pair) => pair.length >= 2 && pair.every(Number.isFinite))
  if (points.length === 0) return null
  const xs = points.map((point) => point[0]!)
  const ys = points.map((point) => point[1]!)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return { x: left, y: top, w: Math.max(...xs) - left, h: Math.max(...ys) - top }
}

function pathBox(raw: unknown): DepthBox | null {
  if (typeof raw !== "string") return null
  const values = Array.from(raw.matchAll(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi), (match) => Number(match[0]))
  if (values.length < 2) return null
  const xs: number[] = []
  const ys: number[] = []
  for (let index = 0; index + 1 < values.length; index += 2) {
    xs.push(values[index]!)
    ys.push(values[index + 1]!)
  }
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return { x: left, y: top, w: Math.max(...xs) - left, h: Math.max(...ys) - top }
}

function expandForStroke(box: DepthBox, stroke: string | undefined, strokeWidth: number): DepthBox {
  if (!stroke || stroke === "none" || strokeWidth <= 0) return box
  const inset = strokeWidth / 2
  return { x: box.x - inset, y: box.y - inset, w: box.w + strokeWidth, h: box.h + strokeWidth }
}

function localLeafBox(tag: string, props: ElementProps, paint: PaintState): DepthBox | null {
  if (tag === "text") {
    const content = textContent(props.children).trim()
    if (!content) return null
    return textInkBox({
      content,
      x: numberProp(props, "x"),
      y: numberProp(props, "y"),
      fontSize: numberProp(props, "fontSize", 16),
      fontFamily: stringProp(props, "fontFamily") ?? "",
      fontWeight: (props.fontWeight as string | number | null | undefined) ?? null,
      textAnchor: stringProp(props, "textAnchor") ?? "start",
    })
  }

  let box: DepthBox | null = null
  if (tag === "rect" || tag === "image") {
    box = {
      x: numberProp(props, "x"),
      y: numberProp(props, "y"),
      w: Math.max(0, numberProp(props, "width")),
      h: Math.max(0, numberProp(props, "height")),
    }
  } else if (tag === "circle") {
    const radius = Math.max(0, numberProp(props, "r"))
    box = { x: numberProp(props, "cx") - radius, y: numberProp(props, "cy") - radius, w: radius * 2, h: radius * 2 }
  } else if (tag === "ellipse") {
    const rx = Math.max(0, numberProp(props, "rx"))
    const ry = Math.max(0, numberProp(props, "ry"))
    box = { x: numberProp(props, "cx") - rx, y: numberProp(props, "cy") - ry, w: rx * 2, h: ry * 2 }
  } else if (tag === "line") {
    const x1 = numberProp(props, "x1")
    const x2 = numberProp(props, "x2")
    const y1 = numberProp(props, "y1")
    const y2 = numberProp(props, "y2")
    box = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
  } else if (tag === "polygon" || tag === "polyline") {
    box = pointsBox(props.points)
  } else if (tag === "path") {
    box = pathBox(props.d)
  }
  return box ? expandForStroke(box, paint.stroke, paint.strokeWidth) : null
}

function globalLeafBox(tag: string, props: ElementProps, paint: PaintState, matrix: SvgMatrix): DepthBox | null {
  const local = localLeafBox(tag, props, paint)
  return local ? transformBox(local, matrix) : null
}

function paintsLeaf(tag: string, paint: PaintState): boolean {
  if (tag === "image") return true
  if (tag === "line" || tag === "polyline") return Boolean(paint.stroke && paint.stroke !== "none")
  return Boolean((paint.fill && paint.fill !== "none") || (paint.stroke && paint.stroke !== "none") || tag === "text")
}

function collectForegroundBoxes(
  node: ReactNode,
  boxes: DepthBox[],
  parentMatrix: SvgMatrix = IDENTITY_MATRIX,
  parentPaint: PaintState = INITIAL_PAINT,
): void {
  if (node === null || node === undefined || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return
  if (!isValidElement<ElementProps>(node)) return
  if (node.type === Fragment) {
    Children.forEach(node.props.children, (child) => collectForegroundBoxes(child, boxes, parentMatrix, parentPaint))
    return
  }
  const executed = executeFunctionElement(node)
  if (executed.handled) {
    collectForegroundBoxes(executed.node, boxes, parentMatrix, parentPaint)
    return
  }
  if (typeof node.type !== "string") return

  const tag = node.type.toLowerCase()
  if (DEFINITION_TAGS.has(tag)) return
  const matrix = multiplyMatrices(parentMatrix, parseSvgTransform(node.props.transform))
  if (LEAF_TAGS.has(tag)) {
    const paint = leafPaint(parentPaint, node.props)
    if (FOREGROUND_BOX_TAGS.has(tag) && paintsLeaf(tag, paint)) {
      const box = globalLeafBox(tag, node.props, paint, matrix)
      if (box && box.w >= 0 && box.h >= 0) boxes.push(box)
    }
    return
  }

  const paint = inheritedPaint(parentPaint, node.props, true)
  Children.forEach(node.props.children, (child) => collectForegroundBoxes(child, boxes, matrix, paint))
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000
}

function clampTextToCanvas(
  element: ReactElement<ElementProps>,
  props: ElementProps,
  paint: PaintState,
  matrix: SvgMatrix,
): { element: ReactElement<ElementProps>; props: ElementProps; box: DepthBox } | null {
  const initial = globalLeafBox("text", props, paint, matrix)
  if (!initial) return null
  if (initial.w > CANVAS_W_PX || initial.h > CANVAS_H_PX) return null
  let dx = 0
  let dy = 0
  if (initial.x < 0) dx = -initial.x
  else if (initial.x + initial.w > CANVAS_W_PX) dx = CANVAS_W_PX - initial.x - initial.w
  if (initial.y < 0) dy = -initial.y
  else if (initial.y + initial.h > CANVAS_H_PX) dy = CANVAS_H_PX - initial.y - initial.h
  if (dx === 0 && dy === 0) return { element, props, box: initial }

  const local = localDelta(matrix, dx, dy)
  if (!local) return null
  const nextProps: ElementProps = {
    ...props,
    x: roundCoordinate(numberProp(props, "x") + local.dx),
    y: roundCoordinate(numberProp(props, "y") + local.dy),
    "data-bleed": undefined,
  }
  const nextElement = cloneElement(element, nextProps)
  const box = globalLeafBox("text", nextProps, paint, matrix)
  return box ? { element: nextElement, props: nextProps, box } : null
}

function applyPaintBudget(
  element: ReactElement<ElementProps>,
  props: ElementProps,
  paint: PaintState,
  parentPaint: PaintState,
  background: string,
  saturationCeiling: number,
): ReactElement<ElementProps> {
  const nextProps: ElementProps = { ...props }
  const ownOpacity = clamp01(props.opacity)
  const commonOpacity = parentPaint.groupOpacity * ownOpacity

  const capPaint = (kind: "fill" | "stroke") => {
    const color = paint[kind]
    if (!color || color === "none" || color.startsWith("url(")) return
    const cappedColor = capHexSaturation(color, saturationCeiling)
    if (cappedColor !== color) nextProps[kind] = cappedColor

    const opacityKey = kind === "fill" ? "fillOpacity" : "strokeOpacity"
    const specificOpacity = paint[opacityKey]
    const effectiveOpacity = commonOpacity * specificOpacity
    const cappedOpacity = contentRecessOpacity(cappedColor, background, effectiveOpacity)
    if (cappedOpacity < effectiveOpacity && commonOpacity > 0) {
      nextProps[opacityKey] = Math.floor((cappedOpacity / commonOpacity) * 1000) / 1000
    } else {
      nextProps[opacityKey] = specificOpacity
    }
  }

  capPaint("fill")
  capPaint("stroke")
  return cloneElement(element, nextProps)
}

function processMidgroundNode(
  node: ReactNode,
  foregroundBoxes: readonly DepthBox[],
  background: string,
  saturationCeiling: number,
  parentMatrix: SvgMatrix = IDENTITY_MATRIX,
  parentPaint: PaintState = INITIAL_PAINT,
): ReactNode {
  if (node === null || node === undefined || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return node
  if (!isValidElement<ElementProps>(node)) return node
  if (node.type === Fragment) {
    return (
      <>
        {Children.toArray(node.props.children).map((child, index) => (
          <Fragment key={`mid-fragment-${index}`}>
            {processMidgroundNode(child, foregroundBoxes, background, saturationCeiling, parentMatrix, parentPaint)}
          </Fragment>
        ))}
      </>
    )
  }
  const executed = executeFunctionElement(node)
  if (executed.handled) {
    return processMidgroundNode(executed.node, foregroundBoxes, background, saturationCeiling, parentMatrix, parentPaint)
  }
  if (typeof node.type !== "string") return node

  const tag = node.type.toLowerCase()
  if (DEFINITION_TAGS.has(tag)) return node
  const matrix = multiplyMatrices(parentMatrix, parseSvgTransform(node.props.transform))
  if (LEAF_TAGS.has(tag)) {
    const paint = leafPaint(parentPaint, node.props)
    let element = node
    let props = node.props
    let box = globalLeafBox(tag, props, paint, matrix)
    if (tag === "text") {
      const clamped = clampTextToCanvas(element, props, paint, matrix)
      if (!clamped) return null
      element = clamped.element
      props = clamped.props
      box = clamped.box
    }
    if (box && foregroundBoxes.some((foreground) => boxesIntersect(box!, foreground))) return null
    return applyPaintBudget(element, props, paint, parentPaint, background, saturationCeiling)
  }

  const paint = inheritedPaint(parentPaint, node.props, true)
  const originalChildren = Children.toArray(node.props.children)
  const processedChildren = originalChildren
    .map((child) => processMidgroundNode(child, foregroundBoxes, background, saturationCeiling, matrix, paint))
    .filter((child) => child !== null && child !== undefined && child !== false)
    .map((child, index) => <Fragment key={`mid-${index}`}>{child}</Fragment>)
  if (
    originalChildren.length > 0 &&
    processedChildren.length === 0 &&
    node.props["data-decor"] === undefined
  ) return null
  return cloneElement(node, undefined, processedChildren)
}

export function enforceMidgroundContract(options: MidgroundContractOptions): ReactNode {
  const foregroundBoxes: DepthBox[] = []
  collectForegroundBoxes(options.foreground, foregroundBoxes)
  return processMidgroundNode(
    options.midground,
    foregroundBoxes,
    options.background,
    midgroundSaturationCeiling(options.colors),
  )
}

function isFullCanvasRect(props: ElementProps): boolean {
  return (
    numberProp(props, "x") <= 0 &&
    numberProp(props, "y") <= 0 &&
    numberProp(props, "width") >= CANVAS_W_PX &&
    numberProp(props, "height") >= CANVAS_H_PX
  )
}

/** Resolve the last full-canvas layout field into the ground seen by mid. */
export function resolveMidgroundBackground(node: ReactNode, fallback: string): string {
  let ground = fallback
  const visit = (current: ReactNode, groupOpacity: number) => {
    if (current === null || current === undefined || typeof current === "boolean" || typeof current === "string" || typeof current === "number") return
    if (Array.isArray(current)) {
      Children.forEach(current, (child) => visit(child, groupOpacity))
      return
    }
    if (!isValidElement<ElementProps>(current)) return
    if (current.type === Fragment) {
      Children.forEach(current.props.children, (child) => visit(child, groupOpacity))
      return
    }
    const executed = executeFunctionElement(current)
    if (executed.handled) {
      visit(executed.node, groupOpacity)
      return
    }
    if (typeof current.type !== "string") return
    const tag = current.type.toLowerCase()
    const ownOpacity = clamp01(current.props.opacity)
    if (tag === "rect" && isFullCanvasRect(current.props)) {
      const fill = stringProp(current.props, "fill")
      if (fill && /^#[0-9a-fA-F]{3,6}$/.test(fill)) {
        const alpha = groupOpacity * ownOpacity * clamp01(current.props.fillOpacity)
        ground = alpha >= 1 ? fill : blendOver(fill, ground, alpha)
      }
    }
    const childOpacity = groupOpacity * ownOpacity
    Children.forEach(current.props.children, (child) => visit(child, childOpacity))
  }
  visit(node, 1)
  return ground
}
