import { readFile } from "node:fs/promises"
import { extname, isAbsolute, resolve } from "node:path"
import { PptfastError } from "../errors"
import type { PptxIR } from "../ir"
import { FORMAT_BY_MIME, MIME_BY_SNIFFED_FORMAT, sniffImageFormat } from "../ir/asset-sniff"
import { getPlatform } from "../platform/registry"

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
}

/**
 * Mime → extension (with leading dot), one canonical extension per mime
 * ("image/jpeg" → ".jpg", not ".jpeg") — the reverse direction of
 * {@link MIME_BY_EXT} above, plus `image/webp`, which that table
 * deliberately omits: a local `.webp` file must keep taking the sharp
 * recode-to-png path in {@link resolveLocalAssets} below (see the e2e
 * "webp asset regression leg", `scripts/e2e.mts` — adding webp to
 * `MIME_BY_EXT` would silently skip that path for local files). This table
 * only serves the opposite direction — naming a file already decoded from a
 * `data:` URI (`writeDeckAssets`, `./deck-dir.ts`'s disassemble asset
 * materialization) — where a webp *payload* is a real possibility (e.g. an
 * upload-derived asset already embedded as webp) with no local file or
 * recode step involved at all.
 */
export const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
}

/** Read and JSON-parse a file with readable failure messages. `kind` names
 *  what the file is expected to hold (e.g. "spec") for both failure
 *  messages — defaults to "IR" for this function's original, still most
 *  common caller (`runRender`/`runValidate`/`runPreview`, `./commands.ts`);
 *  `runSpecValidate` passes "spec" so its own errors read correctly instead
 *  of borrowing IR's wording for a file that was never one. */
export async function loadIrFile(irPath: string, kind = "IR"): Promise<unknown> {
  let text: string
  try {
    text = await readFile(irPath, "utf8")
  } catch {
    throw new PptfastError(`cannot read ${kind} file: ${irPath}`)
  }
  try {
    return JSON.parse(text) as unknown
  } catch (e) {
    throw new PptfastError(`${kind} file ${irPath} is not valid JSON: ${(e as Error).message}`)
  }
}

/**
 * Rewrite local file paths in assets.images to data URIs (CLI-only concern).
 * data: and http(s): sources pass through — the export pipeline inlines URLs
 * itself.
 *
 * Byte-level validation (borrow wave, Task 2 — D3, the local-file half of
 * `api.ts`'s `checkAssetBytes` doc comment — read that one for the full
 * rationale, this is its Node-only counterpart for the ingestion form
 * `validateIr` itself can't reach): every file's bytes are read once here
 * regardless of extension, then a zero-byte file is rejected loud
 * immediately (`dr/d-robustness.md`'s zero-byte-PNG probe — previously this
 * silently produced a 0-byte media part in the exported .pptx). For the four
 * extensions {@link MIME_BY_EXT} recognizes, the bytes are additionally
 * magic-byte-sniffed ({@link sniffImageFormat}) and checked against what the
 * extension claims: a corrupt/unrecognized header is rejected
 * (garbage-bytes-PNG probe), and so is a mismatch — a real PNG saved as
 * `.jpg` (the third D3 probe) — same reject-not-silently-relabel disposition
 * `checkAssetBytes` documents, for the same reason: an extension/content
 * mismatch would otherwise land in the exported package as a media part
 * whose declared type and actual bytes disagree, which `package-audit.ts`'s
 * structural rules never check. A file whose extension isn't one of those
 * four (webp and friends) skips the sniff/mismatch check and keeps taking
 * the `recodeImageToPng` path below unconditionally — sharp decodes by
 * content, not extension, so a mislabeled-but-decodable file there is
 * already harmless, and a genuinely corrupt one surfaces as sharp's own
 * decode error.
 */
export async function resolveLocalAssets(ir: PptxIR, baseDir: string): Promise<void> {
  for (const [name, asset] of Object.entries(ir.assets.images)) {
    const src = asset.src
    if (src.startsWith("data:") || /^https?:\/\//.test(src)) continue
    const abs = isAbsolute(src) ? src : resolve(baseDir, src)
    let bytes: Buffer
    try {
      bytes = await readFile(abs)
    } catch {
      throw new PptfastError(`asset "${name}": cannot read image file ${abs} (from src "${src}")`)
    }
    if (bytes.length === 0) {
      throw new PptfastError(`asset "${name}": image file ${abs} is zero bytes — re-export or re-select the file`)
    }
    const ext = extname(abs).toLowerCase()
    const mime = MIME_BY_EXT[ext]
    if (mime) {
      const sniffed = sniffImageFormat(bytes)
      if (sniffed === null) {
        throw new PptfastError(
          `asset "${name}": image file ${abs} has a corrupt or unrecognized header (extension claims ${mime}) — re-export or re-select the file`,
        )
      }
      const expected = FORMAT_BY_MIME[mime]
      if (expected && sniffed !== expected) {
        throw new PptfastError(
          `asset "${name}": image file ${abs} is named "${ext}" but its bytes are actually ${MIME_BY_SNIFFED_FORMAT[sniffed]} — rename the file to match its real format, or re-export/re-save it as a genuine ${mime}`,
        )
      }
      asset.src = `data:${mime};base64,${bytes.toString("base64")}`
      continue
    }
    const recode = getPlatform().recodeImageToPng
    if (!recode) {
      throw new PptfastError(
        `asset "${name}": unsupported image format "${extname(abs)}" — install sharp or convert to png/jpeg/gif`
      )
    }
    asset.src = await recode(`data:application/octet-stream;base64,${bytes.toString("base64")}`)
  }
}
