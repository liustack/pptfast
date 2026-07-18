import { readFile } from "node:fs/promises"
import { extname, isAbsolute, resolve } from "node:path"
import { PptfastError } from "../errors"
import type { PptxIR } from "../ir"
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
 *  what the file is expected to hold (e.g. "plan") for both failure
 *  messages — defaults to "IR" for this function's original, still most
 *  common caller (`runRender`/`runValidate`/`runPreview`, `./commands.ts`);
 *  `runPlanValidate` passes "plan" so its own errors read correctly instead
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

/** Rewrite local file paths in assets.images to data URIs (CLI-only concern).
 *  data: and http(s): sources pass through — the export pipeline inlines URLs itself. */
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
    const mime = MIME_BY_EXT[extname(abs).toLowerCase()]
    if (mime) {
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
