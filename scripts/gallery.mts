/**
 * `pnpm gallery` — renders the visual-review tables and builds the review
 * page. A maintainer's quality tool, deliberately not a public CLI command:
 * it produces the material a human taste review is done against, which is
 * a step in this repo's own release process, not a capability the product
 * offers its users.
 *
 * See `.issues/2026-08-15-release-readiness/spec.md` for what the two
 * tables are and why the matrix is cut the way it is.
 *
 *   pnpm gallery                        # everything, into .gallery/
 *   pnpm gallery --only=theme           # one table
 *   pnpm gallery --languages=zh,en      # narrow the language axis
 *   pnpm gallery --out=/tmp/g           # somewhere else
 *   pnpm gallery --bbox                 # + a real-browser geometry pass
 *
 * `--bbox` is the only flag that needs anything outside this repo (a
 * Playwright install — see `gallery/bbox.ts`). It is opt-in precisely so
 * `pnpm check`, which runs this same matrix on every commit, never needs a
 * browser.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { listThemes } from "../src/api"
import { installNodePlatform } from "../src/platform/node"
import { corpusAssets, type CorpusAssets } from "./gallery/corpus/decks"
import { LANGUAGE_IDS, LEXICONS, type LanguageId } from "./gallery/corpus/lexicon"
import { buildGalleryHtml, summarize } from "./gallery/html"
import { assertFullCoverage, buildMatrix, type TableId } from "./gallery/matrix"
import { renderMatrix } from "./gallery/render"

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))

/** The theme count the review claims to cover — a guard, not a lookup. */
const EXPECTED_THEMES = 20

function flag(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return undefined
  const eq = hit.indexOf("=")
  return eq === -1 ? "" : hit.slice(eq + 1)
}

function fail(message: string): never {
  console.error(`gallery: ${message}`)
  process.exit(1)
}

const outDir = resolve(ROOT, flag("out") || ".gallery")

const onlyRaw = flag("only")
const only = onlyRaw as TableId | undefined
if (onlyRaw !== undefined && !["theme", "layout", "component", "density"].includes(onlyRaw)) {
  fail(`--only must be one of theme, layout, component, density (got "${onlyRaw}")`)
}

const languagesRaw = flag("languages")
const languages = languagesRaw ? (languagesRaw.split(",").map((s) => s.trim()) as LanguageId[]) : LANGUAGE_IDS
for (const lang of languages) {
  if (!LANGUAGE_IDS.includes(lang)) fail(`unknown language "${lang}" — expected one of ${LANGUAGE_IDS.join(", ")}`)
}

const bboxRaw = flag("bbox")
const bboxFloorRaw = flag("bbox-floor")
const bboxFloor = bboxFloorRaw ? Number(bboxFloorRaw) : undefined
if (bboxFloorRaw !== undefined && (!Number.isFinite(bboxFloor) || bboxFloor! < 0)) {
  fail(`--bbox-floor must be a non-negative number of px (got "${bboxFloorRaw}")`)
}

const themeLanguageRaw = flag("theme-language")
const themeLanguage = (themeLanguageRaw || "zh") as LanguageId
if (!LANGUAGE_IDS.includes(themeLanguage)) {
  fail(`unknown --theme-language "${themeLanguageRaw}" — expected one of ${LANGUAGE_IDS.join(", ")}`)
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }
const themeIds = listThemes()
  .map((t) => t.id)
  .sort()

assertFullCoverage(themeIds, EXPECTED_THEMES)

// `auditDeck` parses the rendered SVG, which needs the Node DOM/raster seam.
// Without it every audit call throws and the gallery would ship with an
// empty findings column that looks like a clean bill of health.
await installNodePlatform()

const started = Date.now()

// Rasterized once per language track, then shared by every page that
// references them — the same twenty images re-encoded per page would
// dominate the run time and bloat the output with identical bytes.
const usedLanguages = [...new Set<LanguageId>([...languages, themeLanguage])]
const assets = Object.fromEntries(
  await Promise.all(usedLanguages.map(async (id) => [id, await corpusAssets(LEXICONS[id])] as const)),
) as Record<LanguageId, CorpusAssets>

const jobs = buildMatrix(themeIds, assets, { languages, themeLanguage, only })
console.log(`gallery: rendering ${jobs.length} pages through the real render chain…`)

mkdirSync(outDir, { recursive: true })
const { manifest, svgs } = renderMatrix(jobs, outDir, pkg.version)

const htmlPath = join(outDir, "index.html")
writeFileSync(htmlPath, buildGalleryHtml(manifest, svgs), "utf8")

const elapsed = ((Date.now() - started) / 1000).toFixed(1)
console.log(`gallery: ${summarize(manifest)} in ${elapsed}s`)
console.log(`gallery: open ${htmlPath}`)

const failures = manifest.pages.filter((p) => p.skipped)
if (failures.length > 0) {
  console.error(`gallery: ${failures.length} page(s) could not be rendered:`)
  for (const p of failures.slice(0, 20)) console.error(`  - ${p.id}: ${p.skipped}`)
  if (failures.length > 20) console.error(`  … and ${failures.length - 20} more (see manifest.json)`)
  process.exitCode = 1
}

// Imported here rather than at the top of the file: this module pulls in a
// browser driver, and the ordinary `pnpm gallery` run — the one `pnpm check`
// exercises through `gallery.test.mts` — must not touch it at all.
if (bboxRaw !== undefined) {
  const { auditBBoxes, formatBBoxReport, writeBBoxReport } = await import("./gallery/bbox")
  let progress = ""
  const report = await auditBBoxes(svgs, {
    floor: bboxFloor,
    log: (m) => {
      // One rewritten line, not one line per batch — the useful output is the
      // findings, and a dozen progress lines would push them off the screen.
      progress = m
      if (process.stdout.isTTY) process.stdout.write(`\r${m}`)
    },
  })
  if (process.stdout.isTTY && progress) process.stdout.write("\n")
  console.log(formatBBoxReport(report))
  console.log(`gallery: bbox report written to ${writeBBoxReport(report, outDir)}`)
  if (report.defects.length > 0) process.exitCode = 1
}
