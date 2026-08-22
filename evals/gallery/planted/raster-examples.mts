/**
 * Raster planted SVGs into compact few-shot PNGs under rubric/examples/.
 *
 *   pnpm exec tsx evals/gallery/planted/raster-examples.mts
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import sharp from "sharp"
import { installNodePlatform } from "@/platform/node"
import { rasterSvgToPng } from "../raster"
import { loadPlantedManifest, plantedSvg, PLANTED_DIR } from "./load"

await installNodePlatform()

const manifest = loadPlantedManifest()
for (const entry of manifest.entries) {
  const png = await rasterSvgToPng(plantedSvg(entry))
  const compact = await sharp(png).png({ compressionLevel: 9, palette: true }).toBuffer()
  const out = join(PLANTED_DIR, entry.png)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, compact)
  process.stdout.write(`${entry.id} ${(compact.length / 1024).toFixed(1)}KB -> ${entry.png}\n`)
}
