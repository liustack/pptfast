/**
 * A rasterized page — RGBA, 4 bytes per pixel, row-major, top-to-bottom,
 * straight (non-premultiplied) alpha. Deliberately *not* the DOM `ImageData`
 * type: that interface only exists as an ambient global where a canvas
 * implementation provides it, and this shape must be constructible in Node
 * (from sharp's raw buffer) without depending on any DOM global actually
 * existing at runtime — only the browser implementation happens to be able
 * to hand back a real `ImageData` object, which satisfies this shape
 * structurally without either side needing to import the other's type.
 */
export interface RasterizedImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

/**
 * Scan SVG markup for a remote (`http://`/`https://`) image reference on
 * `href`/`xlink:href`, before any `rasterizeSvg` implementation touches it.
 * Shared by every implementation (`node.ts`'s sharp path, `browser.ts`'s
 * canvas path) rather than each reimplementing its own copy, because the
 * guarantee it enforces is a platform-wide one, not a browser-only one:
 * spec §3.1/§7 promise the default audit chain never starts a network
 * request, and `resolveLocalAssets` already inlines every *local* file to a
 * `data:` URI before render — the only way an `http(s)://` href survives
 * into rendered markup at all is a deck that deliberately keeps a remote URL
 * as its own asset `src`. Left there, a Node rasterizer could silently
 * attempt to fetch it (a real network request `pptfast audit` must never
 * make) and a browser canvas would silently drop it and taint the canvas
 * (the audit-v2 controller ruling this guard implements) — either way the
 * rasterized page would show *not what the text actually sits on*, which is
 * exactly the "checked nothing, reported clean" failure mode this whole
 * wave exists to rule out. Returns the offending URL for the caller's error
 * message, or `null` when the markup is clean.
 */
export function findRemoteAssetRef(svgMarkup: string): string | null {
  const m = /\s(?:xlink:href|href)\s*=\s*["'](https?:\/\/[^"']*)["']/i.exec(svgMarkup)
  return m ? m[1]! : null
}

/** Environment seams. The SDK entry stays browser-safe: Node implementations
 *  live in ./node and are installed explicitly (CLI does it automatically). */
export interface PptfastPlatform {
  /** DOMParser constructor used to parse rendered SVG markup. */
  domParser?: typeof DOMParser
  /** Re-encode an image data URL to PNG (Office rejects webp and friends). */
  recodeImageToPng?: (dataUrl: string) => Promise<string>
  /**
   * Rasterize SVG markup to a fixed-size pixel buffer (audit-v2 phase B,
   * spec §4.3/§11.7) — the one primitive the optional pixel-contrast audit
   * needs and the *only* one Sharp/canvas-shaped work is allowed to hide
   * behind (`src/svg/audit/pixel-audit.ts` never imports a rasterizer
   * itself). `installNodePlatform()` wires this to Sharp; a real browser
   * gets its own default (`./browser.ts`'s `rasterizeSvgInBrowser`) applied
   * at the call site the same way `domParser`'s `?? globalThis.DOMParser`
   * fallback already works — not through this seam, since nothing calls
   * `installPlatform()` automatically in a browser. Every implementation
   * must reject markup `findRemoteAssetRef` flags rather than touch the
   * network or a tainted canvas.
   */
  rasterizeSvg?: (svgMarkup: string, width: number, height: number) => Promise<RasterizedImage>
}

let current: PptfastPlatform = {}

export function installPlatform(p: PptfastPlatform): void {
  current = { ...current, ...p }
}

export function getPlatform(): PptfastPlatform {
  return current
}
