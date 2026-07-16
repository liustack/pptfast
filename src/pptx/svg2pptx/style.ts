import { pxToPt } from "../../constants"
import { svgColorToHex, svgColorTransparency } from "./color"
import { gradientMidpointHex, withElementOpacity, type GradientDef } from "./gradient"

/** A pptxgenjs fill spec (hash-less hex + optional transparency percent). */
export interface FillSpec {
  color: string
  transparency?: number
}

/**
 * Result of resolving an SVG `fill`: either a plain solid, or a gradient
 * reference — carrying both the real `GradientDef` (for the post-write
 * `a:gradFill` patch, see `render.ts`'s `applyGradientFills`) and a solid
 * placeholder `fill` (the fallback midpoint color) so the op always has a
 * real, renderable fill even before that patch runs.
 */
export interface ResolvedFill {
  fill: FillSpec
  gradient?: GradientDef
}

/** Anything an op can carry a resolved fill onto (shape/ellipse/path ops). */
interface FillableOp {
  fill?: FillSpec
  gradientFill?: GradientDef
}

/** Match `fill="url(#id)"` (with or without quotes around the fragment). */
function matchUrlId(value: string): string | null {
  const m = value.trim().match(/^url\((["']?)#([^"')]+)\1\)$/)
  return m ? m[2] : null
}

/** A pptxgenjs line/stroke spec (hash-less hex + width in points). */
export interface LineSpec {
  color: string
  width: number
  transparency?: number
}

function num(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name)
  if (v == null) return fallback
  return parseFloat(v) || fallback
}

/**
 * Element opacity in [0,1]: `opacity` × `fill-opacity`（各自缺省 1）。
 * 模板水印（如章节巨号数字 opacity=0.06）依赖它——预览由浏览器合成，
 * 导出必须译成 DrawingML 透明度，否则实心覆盖正文。
 */
export function elementOpacity(el: Element, extra = "fill-opacity"): number {
  const o = clamp01(num(el, "opacity", 1))
  const fo = clamp01(num(el, extra, 1))
  return o * fo
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/** Combine an rgba-derived transparency percent with element opacity. */
function combineTransparency(
  rgbaTransparency: number | null,
  opacity: number,
): number | undefined {
  const alpha = (rgbaTransparency !== null ? 1 - rgbaTransparency / 100 : 1) * opacity
  const t = Math.round((1 - alpha) * 100)
  return t > 0 ? t : undefined
}

/**
 * Read an SVG `fill` (undefined when none/absent). Plain colors resolve to a
 * solid `FillSpec`. `url(#id)` resolves through `gradients` (from
 * `collectGradients`) to a `GradientDef` — with a solid midpoint placeholder
 * fill alongside it, since pptxgenjs itself cannot render a gradient (see
 * `render.ts`'s `applyGradientFills` for the post-write patch that swaps it
 * in). A `url(#id)` that doesn't resolve fails loud: `svg/subset-validate.ts`
 * is supposed to catch this earlier, so reaching here means that guard was
 * skipped or out of sync with this converter.
 */
export function extractFill(
  el: Element,
  gradients?: ReadonlyMap<string, GradientDef>,
): ResolvedFill | undefined {
  const fill = el.getAttribute("fill")
  if (!fill || fill === "none") return undefined

  const urlId = matchUrlId(fill)
  if (urlId !== null) {
    const gradientDef = gradients?.get(urlId)
    if (!gradientDef) {
      throw new Error(`svg2pptx: fill="${fill}" does not match any collected gradient`)
    }
    const opacity = elementOpacity(el)
    // DrawingML gradFill has no whole-fill alpha — fold this element's own
    // opacity into every stop now, so it survives render.ts's JSZip patch
    // (which replaces the whole placeholder <a:solidFill> wholesale and
    // otherwise has no other way to see this element's opacity).
    const gradient = withElementOpacity(gradientDef, opacity)
    const out: FillSpec = { color: gradientMidpointHex(gradient) }
    const transparency = combineTransparency(null, opacity)
    if (transparency !== undefined) out.transparency = transparency
    return { fill: out, gradient }
  }

  const out: FillSpec = { color: svgColorToHex(fill) }
  const transparency = combineTransparency(
    svgColorTransparency(fill),
    elementOpacity(el),
  )
  if (transparency !== undefined) out.transparency = transparency
  return { fill: out }
}

/** Resolve `el`'s `fill` and apply it (plus any gradient) onto `op`. No-op when absent. */
export function applyFill<T extends FillableOp>(
  op: T,
  el: Element,
  gradients?: ReadonlyMap<string, GradientDef>,
): void {
  const resolved = extractFill(el, gradients)
  if (!resolved) return
  op.fill = resolved.fill
  if (resolved.gradient) op.gradientFill = resolved.gradient
}

/** Read an SVG `stroke` into a pptxgenjs line spec (undefined when none/absent). */
export function extractStroke(el: Element): LineSpec | undefined {
  const stroke = el.getAttribute("stroke")
  if (!stroke || stroke === "none") return undefined
  const out: LineSpec = {
    color: svgColorToHex(stroke),
    width: pxToPt(num(el, "stroke-width", 1) || 1),
  }
  const transparency = combineTransparency(
    svgColorTransparency(stroke),
    elementOpacity(el, "stroke-opacity"),
  )
  if (transparency !== undefined) out.transparency = transparency
  return out
}
