import { pxToIn, pxToPt, SLIDE_W_IN } from "../../constants"
import { isBold } from "../../svg/fonts"
import { svgColorToHex } from "./color"
import { elementOpacity } from "./style"

/** One styled run inside a text op (maps to a pptxgenjs TextProps entry). */
export interface TextRunData {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  fontSize?: number
}

/**
 * A pptxgenjs text draw from an SVG `<text>`. Rendered via
 * `slide.addText(runs, { x, y, w, h, fontFace, fontSize, color, align, valign:"top", inset:0 })`.
 * Positions are inches, font sizes are points.
 */
export interface TextOp {
  kind: "text"
  runs: TextRunData[]
  x: number
  y: number
  w: number
  h: number
  fontFace?: string
  fontSize: number
  color?: string
  transparency?: number
  align: "left" | "center" | "right"
  /** Set by `svg2pptx/dispatch.ts` when this leaf lives under a `data-blk`-tagged `<g>` (wave-C S3, `elements === "auto"` only). */
  blockIndex?: number
}

// SVG `dominant-baseline:alphabetic` puts y at the text baseline; the box top
// sits roughly one ascent (≈0.8em) above it. Approximate — calibrate against a
// real PPT render during stage 4 (whole-slide assembly).
const ASCENT_RATIO = 0.8

/**
 * Floor on a text box's width. Only ever reached by an anchor sitting on (or
 * outside) a canvas edge — a bleed/decor line, which has no room on one side
 * by definition. A shape needs `a:ext cx > 0` to be a legal shape at all
 * (`package-audit.ts`'s `invalid-shape-transform`), so `anchorTextBox` has to
 * be total: every anchor, on-canvas or not, gets a box. The line itself is
 * unaffected either way — `render.ts` exports text with `wrap:false`, so the
 * box neither clips nor re-wraps it.
 */
const MIN_BOX_W_IN = 0.05

/**
 * The anchor a text box was built around: the point `align` pins the line to
 * (its left edge, its center, or its right edge). Exact inverse of
 * `anchorTextBox` below, which makes that function idempotent — and lets
 * `svg2pptx/dispatch.ts` re-derive the box after it has flattened the
 * element's inherited transforms onto it.
 */
function anchorOf(op: TextOp): number {
  if (op.align === "right") return op.x + op.w
  if (op.align === "center") return op.x + op.w / 2
  return op.x
}

/**
 * Give a text op the box its anchor deserves *in the frame it now sits in*:
 * as much room as the slide can give on the side the line grows, with the
 * anchoring edge (or center) exactly on the anchor.
 *
 * Why this is a separate step rather than part of `textToOp`: the width above
 * is measured against the *canvas*, but a `<text>` element's own `x` is in
 * whatever local space its ancestor `<g transform>`s define. `dispatch.ts`
 * flattens those transforms by translating the finished op, which moves the
 * anchor correctly but leaves the width measured against the wrong origin —
 * and a group centered on its own content (`svg/components/cycle.tsx` puts
 * the ring's center at 0,0, so half its labels sit at a *negative* local x)
 * then produced `w <= 0` and a package-audit rejection of the whole export.
 * The same failure reached the dumbbell chart once before by a different
 * route (a mixed-sign series ran `vx()` off-canvas, see `chart-svg.tsx`'s
 * domain comment) and was patched there, component-side; this is the second
 * component to hit it, so the frame confusion is fixed here instead —
 * `dispatch.ts` calls this once the op is in canvas coordinates, which is the
 * only place that knows they are canvas coordinates.
 */
export function anchorTextBox(op: TextOp): TextOp {
  const anchor = anchorOf(op)
  if (op.align === "right") {
    const w = Math.max(MIN_BOX_W_IN, anchor)
    return { ...op, x: anchor - w, w }
  }
  if (op.align === "center") {
    const half = Math.max(MIN_BOX_W_IN / 2, Math.min(anchor, SLIDE_W_IN - anchor))
    return { ...op, x: anchor - half, w: 2 * half }
  }
  return { ...op, x: anchor, w: Math.max(MIN_BOX_W_IN, SLIDE_W_IN - anchor) }
}

function num(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name)
  if (v == null) return fallback
  return parseFloat(v) || fallback
}

/** font-style italic/oblique → italic（2026-07-12 导出审计抓漏：TextRunData
 * 与 render.ts 消费端一直就绪，此前从未解析该属性——全仓 23 处斜体导出
 * 后静默变正体）。 */
function isItalic(style: string | null): boolean {
  return style === "italic" || style === "oblique"
}

function firstFontFamily(family: string | null): string | undefined {
  if (!family) return undefined
  return family.split(",")[0].replace(/['"]/g, "").trim() || undefined
}

function anchorToAlign(anchor: string | null): "left" | "center" | "right" {
  if (anchor === "middle") return "center"
  if (anchor === "end") return "right"
  return "left"
}

function buildRuns(el: Element, baseBold: boolean, baseItalic: boolean): TextRunData[] {
  const tspans = el.querySelectorAll("tspan")
  if (tspans.length === 0) {
    const run: TextRunData = { text: (el.textContent ?? "").trim() }
    if (baseBold) run.bold = true
    if (baseItalic) run.italic = true
    return [run]
  }
  // 按 childNodes 顺序遍历：直接文本节点是基础 run（如 KPI 的
  // "99.95<tspan>%</tspan>"——丢掉文本节点会导出成只剩单位）。
  const runs: TextRunData[] = []
  el.childNodes.forEach((node) => {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? "").trim()
      if (!text) return
      const run: TextRunData = { text }
      if (baseBold) run.bold = true
      if (baseItalic) run.italic = true
      runs.push(run)
      return
    }
    if (node.nodeType !== 1) return
    const child = node as Element
    if (child.tagName.toLowerCase() !== "tspan") return
    const run: TextRunData = { text: child.textContent ?? "" }
    if (isBold(child.getAttribute("font-weight")) || baseBold) run.bold = true
    if (isItalic(child.getAttribute("font-style")) || baseItalic) run.italic = true
    const fill = child.getAttribute("fill")
    if (fill && fill !== "none") run.color = svgColorToHex(fill)
    const fs = child.getAttribute("font-size")
    if (fs) run.fontSize = pxToPt(parseFloat(fs))
    runs.push(run)
  })
  return runs
}

/**
 * `yPx`/`xPx` are trusted as-is, no ceiling of their own (P0 hardening,
 * robustness deep-review D1 — evaluated and deliberately rejected here, not
 * overlooked): a text-stacking SVG component (bullets/comparison/etc, this
 * task's fix) that lets `y` run far enough off-canvas would eventually cross
 * pptxgenjs's own undocumented `getSmartParseNumber()` ≥100in heuristic —
 * the exact same trap `chart-svg.tsx`'s `MAX_CHART_GEOMETRY_PX` fences off
 * on the chart side. This module is *not* where that fence belongs, for the
 * same reason the chart fix put its own ceiling in the SVG renderer
 * (`chart-svg.tsx`) rather than in this converter layer: "the engine owns
 * geometry" (dumbbell adjudication) — `svg2pptx` is a faithful px→in/pt
 * transform used by every shape kind (`rect.ts`/`ellipse.ts`/`line.ts`/
 * `path.ts`/`image.ts` all share the same unclamped `pxToIn`), with no
 * per-callsite knowledge of what a "reasonable" coordinate looks like for
 * its caller. An opinionated ceiling in `pxToIn` itself would risk silently
 * mangling a deliberately-large-but-legitimate coordinate (a full-bleed
 * background, an intentional off-canvas bleed element) into a wrong value
 * instead of the loud rejection `package-audit`'s `invalid-shape-transform`
 * rule already provides when geometry genuinely breaks — this codebase's
 * "never silently pass" posture (Audit v2 spec §4.4) favors that loud
 * failure over a converter-level guess. The actual fix is upstream, at the
 * component that emits the coordinate: every text-stacking component this
 * task's family sweep found (bullets/comparison/citation/architecture/
 * timeline-vertical) now caps its own rendered item count to its box, so
 * `y` never runs away in the first place — see each component's own doc
 * comment. `formatViolations`' dedup+truncation fix (same task,
 * `package-audit.ts`) is the safety net for the case a future component
 * misses this and the rejection fires anyway: the message stays readable
 * instead of a multi-MB dump, regardless of how many shapes overflow.
 *
 * `anchorTextBox` above does not overturn any of that. Everything this
 * paragraph refuses is a *judgment* about what coordinate a caller ought to
 * have sent — which this layer cannot make, and which stays the component's
 * to make. Which coordinate space the number it did send is written in is
 * not a judgment: this layer is the only one that knows, since it is the one
 * folding the transforms in.
 */
export function textToOp(el: Element): TextOp {
  const fontSizePx = num(el, "font-size", 16)
  const align = anchorToAlign(el.getAttribute("text-anchor"))
  const xPx = num(el, "x")
  const yPx = num(el, "y")

  // Box placement: trust the SVG's pre-laid-out text — give a wide-enough box
  // and let `align` anchor it, instead of measuring text width here. `xPx` is
  // this element's own (possibly local) x, so the box below is only final for
  // an untransformed element; `dispatch.ts` re-runs `anchorTextBox` once the
  // op is in canvas coordinates.
  const op: TextOp = anchorTextBox({
    kind: "text",
    runs: buildRuns(
      el,
      isBold(el.getAttribute("font-weight")),
      isItalic(el.getAttribute("font-style")),
    ),
    x: pxToIn(xPx),
    y: pxToIn(yPx - ASCENT_RATIO * fontSizePx),
    w: 0,
    h: pxToIn(fontSizePx * 1.2),
    fontSize: pxToPt(fontSizePx),
    align,
  })
  const fontFace = firstFontFamily(el.getAttribute("font-family"))
  if (fontFace) op.fontFace = fontFace
  const fill = el.getAttribute("fill")
  if (fill && fill !== "none") op.color = svgColorToHex(fill)
  const opacity = elementOpacity(el)
  if (opacity < 1) op.transparency = Math.round((1 - opacity) * 100)
  // letter-spacing 故意不映射（2026-07-10 全主题导出审计定案）：曾映射为
  // charSpacing（spc），但 LibreOffice 对 spc+CJK 的宽度计算与渲染不一致，
  // **裁掉每段文字的尾字符**（runway 6 处丢字实锤，A/B 剥离 spc 后全部
  // 复原）。丢字是内容事故、字距只是排印细节——导出端不发 spc，预览保留
  // letter-spacing。若未来确认真实 Office/WPS 无此 bug 可再评估。

  return op
}
