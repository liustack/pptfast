/**
 * One-shot calibration: current L1+L2 against SHA 321748d SVGs, then L1
 * (and a small L2 sample) against the same 44 ids rendered by HEAD.
 *
 *   pnpm exec tsx evals/gallery/calibration/run.mts
 *
 * Old SVGs default to /tmp/pptfast-gallery-cal-svgs (render-44.mts at that
 * SHA). Writes /tmp/pptfast-gallery-cal-results.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { listThemes } from "@/api"
import { findOnPath } from "@/cli/image-generators"
import { installNodePlatform } from "@/platform/node"
import { corpusAssets, type CorpusAssets } from "../corpus/decks"
import { LANGUAGE_IDS, LEXICONS, type LanguageId } from "../corpus/lexicon"
import { auditL1, classifyL1 } from "../l1"
import { judgeL2, l2SkipReason, type GalleryPageMeta, type L2Verdict } from "../l2"
import { buildMatrix } from "../matrix"
import { renderMatrix } from "../render"

const OLD_SVG_DIR = process.env.PPTFAST_CAL_SVG_DIR ?? "/tmp/pptfast-gallery-cal-svgs"
const OUT = process.env.PPTFAST_CAL_OUT ?? "/tmp/pptfast-gallery-cal-results.json"
const DUAL_N = 3
const CURRENT_L2_SAMPLE = 5

const human = JSON.parse(
  readFileSync(new URL("./human-verdicts.json", import.meta.url), "utf8"),
) as {
  verdicts: (GalleryPageMeta & { verdict: string; note: string; findings: string[] })[]
}

await installNodePlatform()

function hit(verdict: string | undefined): boolean {
  return verdict === "rework" || verdict === "limit"
}

const grokBin = await findOnPath("grok", process.env)
const skip = l2SkipReason({
  ci: process.env.CI === "true",
  l1Only: process.argv.includes("--l1-only"),
  grokBin,
})
console.log(skip ? `calibration: skipping L2 (${skip})` : `calibration: L2 via ${grokBin}`)

const oldL1: Record<string, { codes: string[]; findingCount: number }> = {}
const oldL2: Record<string, L2Verdict | { error: string }> = {}

for (const page of human.verdicts) {
  const svgPath = join(OLD_SVG_DIR, `${page.id}.svg`)
  if (!existsSync(svgPath)) {
    oldL1[page.id] = { codes: ["missing-svg"], findingCount: 0 }
    console.log(`calibration: missing old svg ${page.id}`)
    continue
  }
  const svg = readFileSync(svgPath, "utf8")
  const l1 = auditL1(svg)
  oldL1[page.id] = { codes: classifyL1(l1), findingCount: l1.findings.length }
  process.stdout.write(`calibration: L1 ${page.id} [${oldL1[page.id].codes.join(",") || "clean"}]\n`)
  if (skip || !grokBin) continue
  try {
    const v = await judgeL2({ svg, page, l1, grokBin })
    oldL2[page.id] = v
    process.stdout.write(`calibration: L2 ${page.id} ${v.verdict}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    oldL2[page.id] = { error: message }
    process.stdout.write(`calibration: L2 ${page.id} ERROR ${message.slice(0, 200)}\n`)
  }
}

const dual: { id: string; a?: string; b?: string; drift: boolean; error?: string }[] = []
if (!skip && grokBin) {
  for (const page of human.verdicts.slice(0, DUAL_N)) {
    const svgPath = join(OLD_SVG_DIR, `${page.id}.svg`)
    if (!existsSync(svgPath)) continue
    const svg = readFileSync(svgPath, "utf8")
    const l1 = auditL1(svg)
    try {
      const a = await judgeL2({ svg, page, l1, grokBin })
      const b = await judgeL2({ svg, page, l1, grokBin })
      const classA = a.verdict === "pass" ? "pass" : "rework"
      const classB = b.verdict === "pass" ? "pass" : "rework"
      dual.push({ id: page.id, a: a.verdict, b: b.verdict, drift: classA !== classB })
      process.stdout.write(`calibration: dual ${page.id} ${a.verdict}/${b.verdict}\n`)
    } catch (error) {
      dual.push({ id: page.id, drift: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

const themeIds = listThemes()
  .map((t) => t.id)
  .sort()
const assets = Object.fromEntries(
  await Promise.all(LANGUAGE_IDS.map(async (id) => [id, await corpusAssets(LEXICONS[id])] as const)),
) as Record<LanguageId, CorpusAssets>
const wanted = new Set(human.verdicts.map((v) => v.id))
const jobs = buildMatrix(themeIds, assets).filter((j) => wanted.has(j.id))
const outDir = mkdtempSync(join(tmpdir(), "pptfast-cal-head-"))
mkdirSync(outDir, { recursive: true })
const { svgs } = renderMatrix(jobs, outDir, "head")

const currentL1: Record<string, { codes: string[]; findingCount: number }> = {}
for (const page of human.verdicts) {
  const svg = svgs.get(page.id)
  if (!svg) {
    currentL1[page.id] = { codes: ["missing-now"], findingCount: 0 }
    continue
  }
  const l1 = auditL1(svg)
  currentL1[page.id] = { codes: classifyL1(l1), findingCount: l1.findings.length }
}

const currentL2: Record<string, L2Verdict | { error: string }> = {}
if (!skip && grokBin) {
  const sample = human.verdicts.filter((p) => (currentL1[p.id]?.findingCount ?? 0) === 0).slice(0, CURRENT_L2_SAMPLE)
  for (const page of sample) {
    const svg = svgs.get(page.id)
    if (!svg) continue
    try {
      const v = await judgeL2({ svg, page, l1: auditL1(svg), grokBin })
      currentL2[page.id] = v
      process.stdout.write(`calibration: current L2 ${page.id} ${v.verdict}\n`)
    } catch (error) {
      currentL2[page.id] = { error: error instanceof Error ? error.message : String(error) }
    }
  }
}

const l2Hits = human.verdicts.filter((p) => {
  const v = oldL2[p.id]
  return v && "verdict" in v && hit(v.verdict)
}).length
const l1Hits = human.verdicts.filter((p) => (oldL1[p.id]?.findingCount ?? 0) > 0).length
const combinedHits = human.verdicts.filter((p) => {
  const v = oldL2[p.id]
  const l2hit = v && "verdict" in v && hit(v.verdict)
  const l1hit = (oldL1[p.id]?.findingCount ?? 0) > 0
  return Boolean(l2hit || l1hit)
}).length
const l2Ran = human.verdicts.filter((p) => oldL2[p.id] && "verdict" in oldL2[p.id]!).length

const payload = {
  sha: "321748d",
  oldSvgDir: OLD_SVG_DIR,
  skip,
  grokBin,
  wanted: human.verdicts.length,
  oldL1,
  oldL2,
  currentL1,
  currentL2,
  dual,
  l1Hits,
  l2Hits,
  combinedHits,
  l2Ran,
  mapping: "all 44 page ids exist exactly at 321748d",
}

writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`)
console.log(`calibration: L1 hits ${l1Hits}/44, L2 hits ${l2Hits}/${l2Ran || 0} ran, combined ${combinedHits}/44`)
console.log(`calibration: wrote ${OUT}`)
