/**
 * Solid-hex color blending shared by the "named-slot family" full-body
 * components (`swot.tsx`/`bmc.tsx`, structure-components wave task 1) — both
 * tint their own quadrant/block panels toward a theme token the same way
 * `matrix.tsx`'s `toneFill` already does (`mixHex(ctx.colors.surface,
 * ctx.colors.accent|primary|muted, t)`), so this extracts that file's private
 * `mixHex`/`parseHex` pair into a shared home instead of a third private
 * copy. `matrix.tsx` keeps its own pre-existing copy untouched (out of this
 * task's scope to refactor an already-shipped, already-tested component) —
 * this module is net-new, not a move.
 */

/** Blend hex `a` toward hex `b` by t∈[0,1] → solid #RRGGBB (no alpha, exports
 * cleanly + Chrome 103 safe). */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a)
  const pb = parseHex(b)
  if (!pa || !pb) return a
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t)
  const hex = (n: number) => n.toString(16).padStart(2, "0")
  return `#${hex(ch(pa[0], pb[0]))}${hex(ch(pa[1], pb[1]))}${hex(ch(pa[2], pb[2]))}`
}

function parseHex(h: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(h.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
