/**
 * SVG `<linearGradient>`/`<radialGradient>` → DrawingML `a:gradFill`.
 *
 * Not used by slide backgrounds today: `svg/Background.tsx`'s
 * `kind:"gradient"` case approximates a gradient with 24 solid-fill `<rect>`
 * bands (`gradient-bands.ts`) instead of a real `<linearGradient>`, so it
 * never produces the `fill="url(#...)"` input this module looks for — the
 * two don't overlap or conflict. This module is separate, currently-unwired
 * infrastructure for arbitrary shapes (rect/circle/ellipse/polygon/polyline/
 * path) that *do* carry a real gradient `url(#...)` fill — groundwork for a
 * future theme decoration layer / chart gradients (see vc-task-6 brief), not
 * a replacement for the background band approximation.
 *
 * Scope (controlled subset, see vc-task-6 brief):
 * - `gradientUnits` only supports the SVG default `objectBoundingBox`.
 *   `userSpaceOnUse` has no meaningful 1:1 DrawingML mapping under this
 *   renderer's px→in flattening (no viewBox/user-space concept survives the
 *   conversion), so it throws. `svg/subset-validate.ts` already rejects
 *   it as an independent dev-time tripwire on the preview side — this throw
 *   is the converter's own defense so a direct/future caller that skips that
 *   tripwire still fails loud instead of silently mis-rendering.
 * - Radial gradients only carry stops. `cx`/`cy`/`r` are ignored: DrawingML's
 *   `<a:path path="circle">` + `fillToRect` model describes a *rectangle*
 *   collapsing to a focal point, which isn't a 1:1 match for SVG's focal-point
 *   circle model. Modeling that correctly is real work with no current
 *   consumer (YAGNI) — every radial gradient renders as a centered circle
 *   (`fillToRect l/t/r/b = 50000`, matching the SVG default cx=cy=r=50%).
 */

/** One color stop, already normalized to a 0–1 position. */
export interface GradientStop {
  pos: number
  /** Hash-less uppercase RRGGBB, matching this module's other hex conventions. */
  hex: string
  /** 0–1; absent means the SVG default of fully opaque (1). */
  alpha?: number
}

export type GradientDef =
  | { kind: "linear"; angleDeg: number; stops: GradientStop[] }
  | { kind: "radial"; stops: GradientStop[] }

function num(el: Element, name: string, fallback: number): number {
  const v = el.getAttribute(name)
  if (v == null) return fallback
  const n = parseFloat(v)
  return Number.isNaN(n) ? fallback : n
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/** Parse a gradient `<stop>`'s `offset` ("0–1" or "N%") into a 0–1 fraction. */
function parseOffset(raw: string | null): number {
  if (!raw) return 0
  const v = raw.trim()
  const isPct = v.endsWith("%")
  const n = parseFloat(isPct ? v.slice(0, -1) : v)
  if (Number.isNaN(n)) return 0
  return clamp01(isPct ? n / 100 : n)
}

/**
 * Parse a `<stop>`'s `stop-color`. Scoped to hex per the brief (this feature
 * serves generated/template SVG, not arbitrary author input) — deliberately
 * stricter than `./color`'s `svgColorToHex`, which silently falls back to
 * black on an unrecognized format. A gradient stop silently going black is a
 * much easier bug to ship unnoticed than a whole shape going black, so this
 * fails loud instead.
 */
function parseStopColor(raw: string | null, gradientId: string): string {
  if (!raw) {
    throw new Error(`svg2pptx: gradient "${gradientId}" has a <stop> with no stop-color`)
  }
  const v = raw.trim()
  if (!v.startsWith("#")) {
    throw new Error(
      `svg2pptx: gradient "${gradientId}" stop-color "${raw}" is not a hex color`,
    )
  }
  const hex = v.slice(1)
  if (hex.length === 3) {
    return hex
      .split("")
      .map((c) => c + c)
      .join("")
      .toUpperCase()
  }
  return hex.toUpperCase()
}

function parseStops(gradEl: Element, gradientId: string): GradientStop[] {
  const stops: GradientStop[] = []
  for (const child of Array.from(gradEl.children)) {
    if (child.tagName.toLowerCase() !== "stop") continue
    const pos = parseOffset(child.getAttribute("offset"))
    const hex = parseStopColor(child.getAttribute("stop-color"), gradientId)
    const alphaRaw = child.getAttribute("stop-opacity")
    const stop: GradientStop = { pos, hex }
    if (alphaRaw != null) {
      const alpha = parseFloat(alphaRaw)
      if (!Number.isNaN(alpha)) stop.alpha = clamp01(alpha)
    }
    stops.push(stop)
  }
  if (stops.length === 0) {
    throw new Error(`svg2pptx: gradient "${gradientId}" has no <stop> children`)
  }
  return stops
}

function assertObjectBoundingBox(el: Element, gradientId: string): void {
  const units = el.getAttribute("gradientUnits")
  if (units && units !== "objectBoundingBox") {
    throw new Error(
      `svg2pptx: gradient "${gradientId}" uses gradientUnits="${units}" — only the default objectBoundingBox is supported`,
    )
  }
}

/** SVG (x1,y1)→(x2,y2) vector to a DrawingML angle in degrees, 0–360, clockwise from 3 o'clock. */
function linearAngleDeg(el: Element): number {
  const x1 = num(el, "x1", 0)
  const y1 = num(el, "y1", 0)
  const x2 = num(el, "x2", 1)
  const y2 = num(el, "y2", 0)
  const dx = x2 - x1
  const dy = y2 - y1
  return ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
}

/** Parse every `<linearGradient>`/`<radialGradient>` inside a `<defs>`, keyed by id. */
export function collectGradients(svgRoot: Element): Map<string, GradientDef> {
  const out = new Map<string, GradientDef>()
  for (const defs of Array.from(svgRoot.querySelectorAll("defs"))) {
    for (const el of Array.from(defs.querySelectorAll("*"))) {
      const tag = el.tagName.toLowerCase()
      if (tag !== "lineargradient" && tag !== "radialgradient") continue
      const id = el.getAttribute("id")
      if (!id) continue // unreferenceable — nothing keys it, so nothing can use it

      assertObjectBoundingBox(el, id)
      const stops = parseStops(el, id)
      out.set(
        id,
        tag === "lineargradient"
          ? { kind: "linear", angleDeg: linearAngleDeg(el), stops }
          : { kind: "radial", stops },
      )
    }
  }
  return out
}

/**
 * Fold an element-level opacity (SVG `opacity` × `fill-opacity`, 0–1 — see
 * `style.ts`'s `elementOpacity`) into every stop's own alpha.
 *
 * DrawingML's `<a:gradFill>` has no whole-fill alpha, only per-stop
 * `<a:alpha>` — so an element's own opacity (e.g. a template watermark's
 * `opacity="0.06"`) has to be multiplied into each stop individually.
 * Without this, that opacity is silently dropped: it lives on the placeholder
 * `<a:solidFill>` that `style.ts` computes for the pre-patch shape, but
 * `render.ts`'s `applyGradientFills` replaces that *entire* element with this
 * module's `<a:gradFill>` output, which never looked at element opacity.
 *
 * Returns a new `GradientDef` (or `def` itself when `opacity` is 1, since
 * there's nothing to fold in) — never mutates `def` in place, because it's
 * the shared, parsed-once-per-document object from `collectGradients`'s Map,
 * and two different elements can reference the same gradient id with two
 * different opacities.
 */
export function withElementOpacity(def: GradientDef, opacity: number): GradientDef {
  if (opacity >= 1) return def
  return {
    ...def,
    stops: def.stops.map((s) => ({ ...s, alpha: clamp01((s.alpha ?? 1) * opacity) })),
  }
}

function gsXml(stop: GradientStop): string {
  const pos = Math.round(stop.pos * 100000)
  const hasAlpha = stop.alpha !== undefined && stop.alpha < 1
  if (!hasAlpha) {
    return `<a:gs pos="${pos}"><a:srgbClr val="${stop.hex}"/></a:gs>`
  }
  const alphaVal = Math.round((stop.alpha as number) * 100000)
  return `<a:gs pos="${pos}"><a:srgbClr val="${stop.hex}"><a:alpha val="${alphaVal}"/></a:srgbClr></a:gs>`
}

/**
 * Serialize a `GradientDef` to a DrawingML `<a:gradFill>` fragment.
 *
 * `rotWithShape="1"` and `scaled="1"` mirror SVG `objectBoundingBox` semantics,
 * where the gradient vector/circle is defined relative to the shape's own
 * bounding box regardless of the shape's own transform.
 */
export function gradientFillXml(def: GradientDef): string {
  const gsLst = `<a:gsLst>${def.stops.map(gsXml).join("")}</a:gsLst>`
  if (def.kind === "linear") {
    const ang = Math.round(def.angleDeg * 60000) % 21600000
    return `<a:gradFill rotWithShape="1">${gsLst}<a:lin ang="${ang}" scaled="1"/></a:gradFill>`
  }
  return `<a:gradFill rotWithShape="1">${gsLst}<a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>`
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ]
}

function toHexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0").toUpperCase()
}

/**
 * Blend a gradient's first and last stop into one solid hex color.
 *
 * Used as the shape's placeholder `fill` until the post-write JSZip pass
 * (`render.ts`'s `applyGradientFills`) swaps in the real `<a:gradFill>` — see
 * that function's doc comment and the vc-task-6 report's pre-check A for why
 * pptxgenjs needs a real solid fill up front. Also doubles as the "first/last
 * stop midpoint" YAGNI fallback the brief calls for if a shape's gradFill
 * patch is ever skipped.
 */
export function gradientMidpointHex(def: GradientDef): string {
  const first = def.stops[0]
  const last = def.stops[def.stops.length - 1]
  const [r1, g1, b1] = hexToRgb(first.hex)
  const [r2, g2, b2] = hexToRgb(last.hex)
  return toHexByte((r1 + r2) / 2) + toHexByte((g1 + g2) / 2) + toHexByte((b1 + b2) / 2)
}
