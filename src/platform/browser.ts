import { findRemoteAssetRef, type RasterizedImage } from "./registry"

/**
 * Browser default for `rasterizeSvg` (audit-v2 phase B, spec §4.3/§11.8) —
 * native `Image` + `OffscreenCanvas`/`<canvas>` only, zero new dependency.
 * Applied at the pixel-audit call site (`../svg/audit/pixel-audit.ts`) the
 * same way `domParser`'s `?? globalThis.DOMParser` fallback already works
 * (`deck-audit.ts`'s `parseSvg`) — nothing calls `installPlatform()`
 * automatically in a browser, so this is a plain fallback function, not
 * something wired through `installPlatform()` itself. Lives outside
 * `src/platform/node.ts` (which imports `linkedom`/`sharp`) so it can sit
 * inside `src/index.ts`'s own browser-safe dependency closure without
 * pulling in either.
 *
 * Two explicit-failure paths, both load-bearing per the audit-v2 controller
 * ruling on browser remote assets (own tests: `browser.test.ts`):
 *
 * 1. `findRemoteAssetRef` — scanned *before* ever touching `Image`/canvas.
 *    An `<img>`/`Image` load of an `http(s):` asset happens in a restricted
 *    context: the resource is silently dropped rather than reliably
 *    tainting the canvas, so without this guard a remote-image slide would
 *    rasterize to a *blank* region and get sampled as if that blank were
 *    the real background — exactly the "checked nothing, reported clean"
 *    failure this wave rules out. (`node.ts`'s Sharp implementation shares
 *    this same guard for a different reason — see `findRemoteAssetRef`'s own
 *    doc comment.)
 * 2. `getImageData`'s own `SecurityError` — kept as a fallback for
 *    whatever the markup scan didn't anticipate (a future asset kind, a
 *    same-origin-but-still-tainting edge case): caught and re-thrown as an
 *    explicit, readable error rather than left as a raw `DOMException` (or,
 *    worse, silently producing zeroed pixel data some engines return
 *    instead of throwing).
 */

interface Minimal2dContext {
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData
}

interface MinimalCanvas {
  getContext(id: "2d"): Minimal2dContext | null
}

/** `DOMException` is *not* an `Error` subclass per the WebIDL spec (real
 *  browsers: `new DOMException("x", "SecurityError") instanceof Error` is
 *  `false`) — duck-type on `.name` rather than `instanceof Error`. */
function isSecurityError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "SecurityError"
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("rasterizeSvg: the browser could not decode the rasterized SVG as an image"))
    img.src = url
  })
}

function createCanvas(width: number, height: number): MinimalCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height) as unknown as MinimalCanvas
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    return canvas as unknown as MinimalCanvas
  }
  throw new Error(
    'rasterizeSvg unavailable — in Node, call installNodePlatform() from "@liustack/pptfast/node" first (the pptfast CLI does this automatically); in a browser, OffscreenCanvas or a DOM canvas is required',
  )
}

export async function rasterizeSvgInBrowser(svgMarkup: string, width: number, height: number): Promise<RasterizedImage> {
  const remoteRef = findRemoteAssetRef(svgMarkup)
  if (remoteRef) {
    throw new Error(
      `rasterizeSvg: refusing to rasterize an SVG that references a remote image (${remoteRef}) — only data-URI (or other local) assets are supported (a remote asset would silently drop when loaded this way, not rasterize)`,
    )
  }
  if (typeof Image === "undefined") {
    throw new Error(
      'rasterizeSvg unavailable — in Node, call installNodePlatform() from "@liustack/pptfast/node" first (the pptfast CLI does this automatically); in a browser, the Image constructor is required',
    )
  }

  const blob = new Blob([svgMarkup], { type: "image/svg+xml" })
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImage(url)
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("rasterizeSvg: could not obtain a 2d canvas context")
    ctx.drawImage(img, 0, 0, width, height)
    let imageData: ImageData
    try {
      imageData = ctx.getImageData(0, 0, width, height)
    } catch (e) {
      if (isSecurityError(e)) {
        throw new Error(
          "rasterizeSvg: the canvas was tainted while reading back pixel data (a cross-origin or otherwise untrusted asset) — only data-URI (or other local) assets are supported",
        )
      }
      throw e
    }
    return { width: imageData.width, height: imageData.height, data: imageData.data }
  } finally {
    URL.revokeObjectURL(url)
  }
}
