/**
 * Magic-byte sniffing for the four raster image formats pptfast's asset
 * pipeline actually supports downstream (`platform/inline-assets.ts`'s
 * `OFFICE_SAFE_MIME` — png/jpeg/gif — plus webp, the one format that
 * pipeline always recodes away before export). Pure, dependency-free, and
 * shared from two ingestion seams that must each stay on their own side of
 * the browser/Node line (borrow wave, Task 2 — D3):
 * - `api.ts`'s `validateIr` (browser-safe — part of `src/index.ts`'s
 *   dependency closure) sniffs inline `data:` URIs already sitting in
 *   `assets.images`.
 * - `cli/load-ir.ts`'s `resolveLocalAssets` (Node-only) sniffs bytes read
 *   off a local file path before it ever becomes a data URI.
 *
 * Deliberately does not attempt to identify any format outside this set
 * (BMP, TIFF, AVIF, …): {@link sniffImageFormat} returns `null` for those the
 * same as for a zero-byte or truncated header, which is the correct verdict
 * here — nothing downstream of asset ingestion (Office-safe MIME
 * normalization, sharp recode) knows what to do with a format this pipeline
 * was never built to carry, so "unrecognized" and "broken" are the same
 * failure for either caller's purposes.
 */

export type SniffedImageFormat = "png" | "jpeg" | "gif" | "webp"

/** Canonical MIME for a sniffed format — what the byte content itself
 *  supports, independent of whatever extension/MIME the caller declared. */
export const MIME_BY_SNIFFED_FORMAT: Record<SniffedImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
}

/** The inverse of the map above — used to decide whether a declared
 *  MIME/extension is even checkable against sniffed bytes. A declared type
 *  outside this table (an unrelated MIME, or a format this module doesn't
 *  sniff at all) is left alone by the mismatch check in `api.ts`/
 *  `cli/load-ir.ts`: only a claim this table knows how to verify gets
 *  verified. */
export const FORMAT_BY_MIME: Record<string, SniffedImageFormat> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/gif": "gif",
  "image/webp": "webp",
}

/**
 * Identify an image's real format straight from its magic bytes, ignoring
 * any filename/MIME the caller supplied. Returns `null` for a zero-byte
 * buffer, a truncated/corrupt header, or any format outside the four this
 * pipeline supports (see this module's own top comment) — callers
 * distinguish "zero bytes" from "corrupt/unrecognized" themselves by
 * checking `bytes.length` first, since both come back `null` here alike.
 */
export function sniffImageFormat(bytes: Uint8Array): SniffedImageFormat | null {
  // PNG: 8-byte fixed signature.
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png"
  }
  // JPEG: SOI marker (0xFFD8) followed by another marker byte 0xFF.
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg"
  }
  // GIF: "GIF87a" or "GIF89a".
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "gif"
  }
  // WebP: "RIFF" + 4-byte chunk size (unchecked — only the two fixed fourCC
  // tags matter for identification) + "WEBP".
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp"
  }
  return null
}

/**
 * Decode a `data:<mime>;base64,<payload>` URI straight to bytes, or `null`
 * when it isn't a base64 data URI at all (pptfast never produces or expects
 * any other encoding for an image asset — `AssetSchema`'s `src` is a plain
 * string, and every producer in this repo — `resolveLocalAssets`,
 * `inline-assets.ts` — always base64-encodes). Relies on the global `atob`
 * (available in every browser and in Node ≥ 16 with no import) rather than
 * `Buffer`, so this stays callable from `validateIr`'s browser-safe closure
 * — the same reasoning `svg2pptx/image.ts`'s `dataUriDimensions` already
 * documents for its own `atob` use.
 */
export function decodeDataUriBytes(dataUri: string): Uint8Array | null {
  const comma = dataUri.indexOf(",")
  if (comma === -1 || !dataUri.startsWith("data:") || !dataUri.slice(0, comma).endsWith(";base64")) return null
  try {
    const bin = atob(dataUri.slice(comma + 1))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

/** The declared MIME of a `data:<mime>;base64,...` URI, or `""` when it
 *  isn't a `data:` URI at all. */
export function dataUriMime(dataUri: string): string {
  if (!dataUri.startsWith("data:")) return ""
  const comma = dataUri.indexOf(",")
  if (comma === -1) return ""
  return dataUri.slice(5, comma).split(";")[0] ?? ""
}
