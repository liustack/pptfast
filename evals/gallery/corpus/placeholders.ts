/**
 * Stand-in artwork for the review corpus' image slots, as base64 `data:`
 * URIs so the whole gallery stays self-contained (no sidecar asset files,
 * no network, double-click-to-open works).
 *
 * These are stand-ins for *content*, not for the render chain: the slide
 * around them is the real renderer's real output, and every crop, frame,
 * caption band and aspect decision the reviewer is judging is computed by
 * production code. What the stand-in has to do is carry enough structure —
 * a subject that is off-center, a horizon, a foreground mass — that a
 * `cover` crop visibly differs from a `contain` fit and a bad frame looks
 * bad. A flat grey rectangle would hide exactly the defects this table
 * exists to find.
 *
 * Deterministic by construction: same id in, same bytes out, so re-running
 * the gallery produces a byte-identical diff except where the renderer
 * actually changed.
 */

import sharp from "sharp"

/**
 * Rasterize to PNG rather than shipping the SVG source directly: the IR's
 * asset validator only accepts PNG/JPEG/WebP/GIF bytes, and rightly so —
 * that is the same gate a user's own artwork passes through, and a review
 * corpus that slipped past it would be exercising a path production never
 * takes. Drawing in SVG and rasterizing here keeps the artwork readable in
 * source while the deck sees exactly the kind of bytes it will see in real
 * use.
 */
async function pngDataUri(svg: string): Promise<string> {
  const png = await sharp(Buffer.from(svg, "utf8")).png({ compressionLevel: 9 }).toBuffer()
  return `data:image/png;base64,${png.toString("base64")}`
}

/**
 * Small deterministic hash — picks palette and composition per id so the
 * corpus' images differ from each other without a random seed.
 */
function hash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/**
 * Muted, photographic-ish duotones. Deliberately desaturated: the image is
 * not what is under review, and a saturated stand-in would fight every one
 * of the 17 themes for attention and make the theme's own palette hard to
 * judge.
 */
const PALETTES: readonly (readonly [string, string, string])[] = [
  ["#2b3a4a", "#5b7185", "#c8d3dc"],
  ["#3a3330", "#7a6a5d", "#d8cec4"],
  ["#26332e", "#5c7a6a", "#c9d8cf"],
  ["#332b3a", "#6b5b7a", "#d2c8dc"],
  ["#3a2f2b", "#856454", "#dccdc4"],
  ["#2b3540", "#647c8e", "#cdd7de"],
]

/**
 * One stand-in photo. `w`/`h` set the intrinsic aspect ratio — the point of
 * shipping a non-square default is that `cover`-cropping a 3:2 source into
 * a wide slot is where framing defects actually show up.
 */
export async function placeholderImage(id: string, w = 1200, h = 800): Promise<string> {
  const n = hash(id)
  const [dark, mid, light] = PALETTES[n % PALETTES.length]!
  // Subject sits off-center by a deterministic amount so a centered crop
  // and an edge-biased crop are visibly different results.
  const cx = w * (0.34 + ((n >> 3) % 32) / 100)
  const horizon = h * (0.52 + ((n >> 8) % 20) / 100)
  const r = Math.min(w, h) * (0.16 + ((n >> 11) % 10) / 100)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${mid}"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#sky)"/>
<rect y="${horizon.toFixed(1)}" width="${w}" height="${(h - horizon).toFixed(1)}" fill="${dark}"/>
<circle cx="${cx.toFixed(1)}" cy="${(horizon - r * 0.7).toFixed(1)}" r="${r.toFixed(1)}" fill="${dark}" opacity="0.88"/>
<rect x="${(cx + r * 1.4).toFixed(1)}" y="${(horizon - r * 1.9).toFixed(1)}" width="${(r * 0.8).toFixed(1)}" height="${(r * 1.9).toFixed(1)}" fill="${dark}" opacity="0.7"/>
<rect x="${(cx - r * 2.6).toFixed(1)}" y="${(horizon - r * 1.1).toFixed(1)}" width="${(r * 0.5).toFixed(1)}" height="${(r * 1.1).toFixed(1)}" fill="${dark}" opacity="0.55"/>
</svg>`
  return pngDataUri(svg)
}

/**
 * A screenshot-shaped stand-in for `device_mockup`: UI chrome rather than a
 * scene, because a device frame wrapped around a landscape photo tells the
 * reviewer nothing about whether the frame reads as a screen.
 */
export async function placeholderScreenshot(id: string, w = 1280, h = 800): Promise<string> {
  const n = hash(id)
  const [dark, mid, light] = PALETTES[n % PALETTES.length]!
  const rows = Array.from({ length: 7 }, (_, i) => {
    const y = h * 0.26 + i * (h * 0.085)
    const width = w * (0.34 + (((n >> (i + 2)) % 40) / 100))
    return `<rect x="${(w * 0.1).toFixed(0)}" y="${y.toFixed(0)}" width="${width.toFixed(0)}" height="${(h * 0.032).toFixed(0)}" rx="4" fill="${mid}" opacity="${i === 0 ? 0.9 : 0.42}"/>`
  }).join("")

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="${light}"/>
<rect width="${w}" height="${(h * 0.14).toFixed(0)}" fill="${dark}"/>
<rect x="${(w * 0.06).toFixed(0)}" y="${(h * 0.05).toFixed(0)}" width="${(w * 0.22).toFixed(0)}" height="${(h * 0.04).toFixed(0)}" rx="4" fill="${light}" opacity="0.75"/>
<rect x="${(w * 0.62).toFixed(0)}" y="${(h * 0.2).toFixed(0)}" width="${(w * 0.28).toFixed(0)}" height="${(h * 0.62).toFixed(0)}" rx="8" fill="${mid}" opacity="0.28"/>
${rows}
</svg>`
  return pngDataUri(svg)
}

/**
 * Single-ink transparent wordmark, the shape press kits actually ship — the
 * case `logo_wall`'s neutral backing panel exists to handle. Drawn in one
 * near-black ink so the panel's job (keeping a dark logo legible on a dark
 * theme) is genuinely exercised rather than sidestepped by a logo that
 * happens to carry its own background.
 */
export async function placeholderLogo(name: string): Promise<string> {
  const n = hash(name)
  const initials = name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!)
    .join("")
  const mark = n % 3

  const glyph =
    mark === 0
      ? `<circle cx="34" cy="40" r="17" fill="none" stroke="#111111" stroke-width="7"/>`
      : mark === 1
        ? `<path d="M17 57 L34 23 L51 57 Z" fill="none" stroke="#111111" stroke-width="7" stroke-linejoin="round"/>`
        : `<rect x="18" y="24" width="32" height="32" rx="6" fill="none" stroke="#111111" stroke-width="7"/>`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80">
${glyph}
<text x="72" y="52" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="600" letter-spacing="1.5" fill="#111111">${initials.toUpperCase()}</text>
<text x="72" y="68" font-family="Helvetica, Arial, sans-serif" font-size="11" letter-spacing="2.4" fill="#111111" opacity="0.72">GROUP</text>
</svg>`
  return pngDataUri(svg)
}
