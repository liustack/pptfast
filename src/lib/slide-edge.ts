/**
 * The paint a preview surface must put *behind* a mounted slide.
 *
 * Every surface that shows a slide in HTML — `../cli/preview-html.ts`, the
 * review gallery, the DSH panel — drops the standalone `<svg viewBox="0 0
 * 1280 720">` into a 16:9 box and stretches it to fill (`width:100%;
 * height:100%`). That box almost never lands on whole device pixels: its
 * width comes out of a grid track, a `min()` against the viewport, or a
 * container query, so the slide's own left and right edges routinely sit at,
 * say, x=53.33 and x=1386.67.
 *
 * A browser paints that boundary column twice. First the box's own
 * background, at partial coverage; then the SVG on top of it, at the same
 * partial coverage. What survives is `(1-a)*a` of the box's background —
 * roughly a fifth to a quarter of it — in a one-to-two pixel strip down the
 * slide's edge. When the box is painted in a neutral light grey and the
 * slide is dark, that strip reads as a pale vertical line hugging the page,
 * which is exactly what the 2026-08-20 review reported on campaign p01/p02,
 * ink p01/p03 and insight p07. Measured, not reasoned about: setting the
 * gallery's stage colour to magenta turned the line magenta, and setting it
 * to the slide's own background made the line disappear.
 *
 * There is no way to stop the double-paint from the slide's side. The SVG
 * cannot paint outside its own viewBox, an outset plus `overflow:hidden`
 * just moves the same antialiased boundary onto the clip, and forcing a
 * compositing layer makes it worse. What does work is giving that boundary
 * nothing foreign to blend with: paint the box in the slide's own edge
 * colour, and the surviving fraction is the colour that was already there.
 *
 * The exported PPTX has no equivalent defect — the slide is 13.33in wide and
 * the background shape converts to 13.3333in, so it overhangs rather than
 * falls short.
 */

import { CANVAS_H_PX, CANVAS_W_PX } from "../constants"

/** Runs of `<g …>`, `</g>` and `<rect …>`, in paint order. */
const TAG = /<(\/?)(g|rect)\b([^>]*?)(\/?)>/g

const ATTR_CACHE = new Map<string, RegExp>()

function attr(attrs: string, name: string): string | undefined {
  let re = ATTR_CACHE.get(name)
  if (!re) {
    re = new RegExp(`\\b${name}="([^"]*)"`)
    ATTR_CACHE.set(name, re)
  }
  const m = re.exec(attrs)
  return m ? m[1] : undefined
}

function num(attrs: string, name: string, fallback: number): number {
  const raw = attr(attrs, name)
  if (raw === undefined) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/**
 * `\bopacity="` also matches the tail of `fill-opacity="…"`, which is
 * harmless here: both attributes disqualify a rect the same way, and the
 * worst a mixed-up read can do is skip a rect that was in fact opaque.
 */
function isOpaque(attrs: string): boolean {
  for (const name of ["opacity", "fill-opacity"]) {
    const raw = attr(attrs, name)
    if (raw !== undefined && Number(raw) < 1) return false
  }
  return true
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/**
 * The CSS `background` value to paint behind this slide, or `null` when the
 * slide's edge has no single answer (a photo background, most obviously) and
 * the caller should keep whatever neutral it already uses.
 *
 * Reads the markup rather than the IR on purpose: what the reader sees at the
 * page edge is whatever was painted last there, which is not always the
 * theme's background token. `ink`'s cover paints a full-bleed near-black
 * masthead over a cream page, and its `split-band` content pages paint a
 * 224px-tall dark band over the same cream — the token would be wrong for
 * both, the markup is right for both.
 *
 * Only full-width, fully opaque `<rect>`s outside any transformed group
 * count, so the result is a top-to-bottom profile of the page edge: one
 * colour when the page is one colour, and a hard-stop `linear-gradient` when
 * it is not (a gradient background's bands, or a band layout's header).
 */
export function slideEdgeFill(svg: string): string | null {
  // One entry per canvas row, so overpainting is just assignment in paint
  // order — no interval arithmetic, and a later band wins exactly the rows it
  // actually covers.
  const rows: (string | undefined)[] = new Array<string | undefined>(CANVAS_H_PX)
  // Depth of `<g>` nesting that moves its children, so their rect
  // coordinates are no longer canvas coordinates and must be ignored.
  let moved = 0
  const open: boolean[] = []
  let painted = false

  TAG.lastIndex = 0
  for (let m = TAG.exec(svg); m; m = TAG.exec(svg)) {
    const [, closing, tag, attrs, selfClosing] = m
    if (tag === "g") {
      if (closing) {
        if (open.pop()) moved--
        continue
      }
      const movesChildren = /\btransform="/.test(attrs!)
      if (selfClosing) continue
      open.push(movesChildren)
      if (movesChildren) moved++
      continue
    }
    if (closing || moved > 0) continue

    const fill = attr(attrs!, "fill")
    if (!fill || !HEX.test(fill) || !isOpaque(attrs!)) continue
    const x = num(attrs!, "x", 0)
    const width = num(attrs!, "width", 0)
    if (x > 0 || x + width < CANVAS_W_PX) continue
    const y = num(attrs!, "y", 0)
    const height = num(attrs!, "height", 0)
    const top = Math.max(0, Math.round(y))
    const bottom = Math.min(CANVAS_H_PX, Math.round(y + height))
    for (let r = top; r < bottom; r++) rows[r] = fill
    if (bottom > top) painted = true
  }

  if (!painted) return null

  // Rows nothing covered take the nearest painted colour, so a background
  // that stops a pixel short of the canvas cannot punch a hole in the answer.
  let last: string | undefined
  for (let r = 0; r < CANVAS_H_PX; r++) {
    if (rows[r]) last = rows[r]
    else rows[r] = last
  }
  for (let r = CANVAS_H_PX - 1; r >= 0; r--) {
    if (rows[r]) last = rows[r]
    else rows[r] = last
  }

  const stops: { fill: string; top: number; bottom: number }[] = []
  for (let r = 0; r < CANVAS_H_PX; r++) {
    const fill = rows[r]!
    const run = stops[stops.length - 1]
    if (run && run.fill === fill) run.bottom = r + 1
    else stops.push({ fill, top: r, bottom: r + 1 })
  }

  if (stops.length === 1) return stops[0]!.fill
  const pct = (row: number) => `${((row / CANVAS_H_PX) * 100).toFixed(3).replace(/\.?0+$/, "")}%`
  const body = stops.map((s) => `${s.fill} ${pct(s.top)} ${pct(s.bottom)}`).join(",")
  return `linear-gradient(180deg,${body})`
}
