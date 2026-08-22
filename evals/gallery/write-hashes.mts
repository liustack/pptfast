/**
 * Refresh `evals/gallery/hashes.json` from a full `renderMatrix` run.
 *
 *   pnpm exec tsx evals/gallery/write-hashes.mts
 *
 * Pins each page's gallery-page-v2 content hash (whole markup) plus the
 * geometry/color split from `render.ts`. Incremental audit diffs against
 * this file.
 */

import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { listThemes } from "@/api"
import { installNodePlatform } from "@/platform/node"
import { corpusAssets } from "./corpus/decks"
import { LANGUAGE_IDS, LEXICONS, type LanguageId } from "./corpus/lexicon"
import { hashesFromManifest } from "./hashes"
import { buildMatrix } from "./matrix"
import { renderMatrix } from "./render"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, "hashes.json")

await installNodePlatform()
const themeIds = listThemes()
  .map((t) => t.id)
  .sort()
const assets = Object.fromEntries(
  await Promise.all(LANGUAGE_IDS.map(async (id) => [id, await corpusAssets(LEXICONS[id])] as const)),
) as Record<LanguageId, Awaited<ReturnType<typeof corpusAssets>>>
const jobs = buildMatrix(themeIds, assets)
const outDir = mkdtempSync(join(tmpdir(), "pptfast-hashes-"))
const { manifest } = renderMatrix(jobs, outDir, "pin")
const gold = hashesFromManifest(manifest)
writeFileSync(OUT, `${JSON.stringify(gold, null, 2)}\n`)
console.log(`wrote ${Object.keys(gold.pages).length} page hashes to ${OUT}`)
