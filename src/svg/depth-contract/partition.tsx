import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react"
import type { Slide } from "@/ir"
import { CANVAS_H_PX, CANVAS_W_PX } from "../../constants"

export type SvgDepth = "bg" | "mid" | "fg"

export interface SvgDepthLayers {
  bg: ReactNode[]
  mid: ReactNode[]
  fg: ReactNode[]
}

interface PartitionOptions {
  slideType: Slide["type"]
}

type ElementProps = Record<string, unknown> & { children?: ReactNode }

const CONTAINER_TAGS = new Set(["a", "g", "switch"])
const GHOST_LABEL = /^(?:0?\d{1,3}(?:\s*[/.]\s*\d{1,3})?|Q[1-4]|№\s*\d{1,3}|NO\.?\s*\d{1,3}|[IVXLCDM]{1,8})$/i

function emptyLayers(): SvgDepthLayers {
  return { bg: [], mid: [], fg: [] }
}

function append(target: SvgDepthLayers, source: SvgDepthLayers): void {
  target.bg.push(...source.bg)
  target.mid.push(...source.mid)
  target.fg.push(...source.fg)
}

function push(target: SvgDepthLayers, depth: SvgDepth, node: ReactNode): void {
  target[depth].push(node)
}

function numberProp(props: ElementProps, name: string, fallback = 0): number {
  const value = props[name]
  if (value === undefined || value === null || value === "") return fallback
  return Number(value)
}

function isFullCanvasPaint(type: string, props: ElementProps): boolean {
  if (type !== "rect" && type !== "image") return false
  return (
    numberProp(props, "x") <= 0 &&
    numberProp(props, "y") <= 0 &&
    numberProp(props, "width") >= CANVAS_W_PX &&
    numberProp(props, "height") >= CANVAS_H_PX
  )
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (!isValidElement<ElementProps>(node)) return ""
  return Children.toArray(node.props.children).map(textContent).join("")
}

function isGhostText(props: ElementProps, slideType: Slide["type"]): boolean {
  const fontSize = numberProp(props, "fontSize")
  if (fontSize < 140) return false
  const label = textContent(props.children).trim()
  if (!GHOST_LABEL.test(label)) return false

  const opacity = Math.min(numberProp(props, "opacity", 1), numberProp(props, "fillOpacity", 1))
  const declaredBleed = props["data-bleed"] !== undefined
  const ghostQuarter = fontSize >= 400 && /^Q[1-4]$/i.test(label)
  return declaredBleed || ghostQuarter || opacity <= 0.2 || slideType === "chapter"
}

function executeFunctionElement(element: ReactElement<ElementProps>): ReactNode | null {
  if (typeof element.type !== "function") return null
  if ("isReactComponent" in (element.type.prototype ?? {})) return null
  const component = element.type as unknown as (props: ElementProps) => ReactNode
  return component(element.props)
}

interface PaintClusterEvidence {
  hasFullCanvasPaint: boolean
  hasText: boolean
}

function inspectPaintCluster(node: ReactNode, evidence: PaintClusterEvidence): void {
  if (node === null || node === undefined || typeof node === "boolean") return
  if (typeof node === "string" || typeof node === "number") return
  if (!isValidElement<ElementProps>(node)) return

  if (node.type === Fragment) {
    Children.forEach(node.props.children, (child) => inspectPaintCluster(child, evidence))
    return
  }
  const executed = executeFunctionElement(node)
  if (executed !== null) {
    inspectPaintCluster(executed, evidence)
    return
  }
  if (typeof node.type !== "string") return
  if (node.type === "text") evidence.hasText = true
  if (isFullCanvasPaint(node.type, node.props)) evidence.hasFullCanvasPaint = true
  Children.forEach(node.props.children, (child) => inspectPaintCluster(child, evidence))
}

function isBackgroundPaintCluster(node: ReactNode): boolean {
  const evidence: PaintClusterEvidence = { hasFullCanvasPaint: false, hasText: false }
  inspectPaintCluster(node, evidence)
  return evidence.hasFullCanvasPaint && !evidence.hasText
}

function partitionChildren(children: ReactNode, options: PartitionOptions): SvgDepthLayers {
  const layers = emptyLayers()
  Children.forEach(children, (child) => append(layers, partitionNode(child, options)))
  return layers
}

function cloneContainerForDepth(
  element: ReactElement<ElementProps>,
  depth: SvgDepth,
  children: ReactNode[],
): ReactElement<ElementProps> {
  const key = element.key === null ? depth : `${String(element.key)}-${depth}`
  const keyedChildren = children.map((child, index) => (
    <Fragment key={`${depth}-${index}`}>{child}</Fragment>
  ))
  return cloneElement(element, { key }, keyedChildren)
}

function partitionNode(node: ReactNode, options: PartitionOptions): SvgDepthLayers {
  const layers = emptyLayers()
  if (node === null || node === undefined || typeof node === "boolean") return layers
  if (typeof node === "string" || typeof node === "number") {
    push(layers, "fg", node)
    return layers
  }
  if (!isValidElement<ElementProps>(node)) return layers

  if (node.type === Fragment) return partitionChildren(node.props.children, options)

  const executed = executeFunctionElement(node)
  if (executed !== null) {
    if (isBackgroundPaintCluster(executed)) push(layers, "bg", executed)
    else append(layers, partitionNode(executed, options))
    return layers
  }

  if (typeof node.type !== "string") {
    push(layers, "fg", node)
    return layers
  }

  const declaredDepth = node.props["data-depth"]
  if (declaredDepth === "bg" || declaredDepth === "mid" || declaredDepth === "fg") {
    push(layers, declaredDepth, node)
    return layers
  }
  if (node.props["data-decor"] !== undefined) {
    push(layers, "mid", node)
    return layers
  }
  if (isFullCanvasPaint(node.type, node.props)) {
    push(layers, "bg", node)
    return layers
  }
  if (node.type === "text" && isGhostText(node.props, options.slideType)) {
    push(layers, "mid", node)
    return layers
  }

  if (CONTAINER_TAGS.has(node.type)) {
    const children = partitionChildren(node.props.children, options)
    if (children.bg.length === 0 && children.mid.length === 0 && children.fg.length === 0) {
      push(layers, "fg", node)
      return layers
    }
    for (const depth of ["bg", "mid", "fg"] as const) {
      if (children[depth].length > 0) push(layers, depth, cloneContainerForDepth(node, depth, children[depth]))
    }
    return layers
  }

  push(layers, "fg", node)
  return layers
}

/**
 * Split one rendered page body into semantic SVG depth layers. Layouts only
 * describe their own visual tree. This function owns the cross-layout paint
 * order and is the only place that may route a node between depth groups.
 */
export function partitionSvgDepth(node: ReactNode, options: PartitionOptions): SvgDepthLayers {
  return partitionNode(node, options)
}
