/**
 * Recalibrate the 44 human rework pages: new L1+L2 on SHA 321748d SVGs,
 * then L1+L2 on the same ids rendered by HEAD. Planted replay runs first.
 *
 *   CI= pnpm exec tsx evals/gallery/calibration/post-fix.mts
 *
 * Writes PPTFAST_CAL_POST (default /tmp/pptfast-gallery-cal-post.json).
 * Incremental L2 stores:
 *   evals/gallery/calibration/pre-fix-l2-replay.json
 *   evals/gallery/calibration/post-fix-l2.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { listThemes } from "@/api"
import { findOnPath } from "@/cli/image-generators"
import { installNodePlatform } from "@/platform/node"
import { corpusAssets, type CorpusAssets } from "../corpus/decks"
import { LANGUAGE_IDS, LEXICONS, type LanguageId } from "../corpus/lexicon"
import { auditL1, classifyL1 } from "../l1"
import { judgeL2, l2SkipReason, type GalleryPageMeta, type L2Verdict } from "../l2"
import { buildMatrix } from "../matrix"
import { replayPlanted } from "../planted/replay"
import { renderMatrix } from "../render"

const DIR = dirname(fileURLToPath(import.meta.url))
const OLD_SVG_DIR = process.env.PPTFAST_CAL_SVG_DIR ?? "/tmp/pptfast-gallery-cal-svgs"
const OUT = process.env.PPTFAST_CAL_POST ?? "/tmp/pptfast-gallery-cal-post.json"
const PRE_L2 = join(DIR, "pre-fix-l2-replay.json")
const POST_L2 = join(DIR, "post-fix-l2.json")
const HEAD_SHA = "8b4c001"
const PRE_SHA = "321748d"

type Store = Record<string, L2Verdict | { error: string }>

const human = JSON.parse(
  readFileSync(new URL("./human-verdicts.json", import.meta.url), "utf8"),
) as {
  verdicts: (GalleryPageMeta & { verdict: string; note: string; findings: string[] })[]
}

await installNodePlatform()

function hit(verdict: string | undefined): boolean {
  return verdict === "rework" || verdict === "limit"
}

function loadStore(path: string): Store {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Store) : {}
}

function saveStore(path: string, store: Store): void {
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`)
}

function trusted(store: Store, id: string): boolean {
  const v = store[id]
  if (!v || !("verdict" in v)) return false
  const note = v.note ?? ""
  if (note.includes("seeded from first L2 pass")) return false
  if (note.includes("Placeholder while inspecting")) return false
  if (note.toLowerCase().includes("awaiting visual inspection")) return false
  return true
}

const grokBin = await findOnPath("grok", process.env)
const skip = l2SkipReason({
  ci: process.env.CI === "true",
  l1Only: process.argv.includes("--l1-only"),
  grokBin,
})
const force = process.argv.includes("--force")
const concurrency = Math.max(1, Number(process.env.PPTFAST_L2_CONCURRENCY ?? 3))

console.log(skip ? `post-fix: skipping L2 (${skip})` : `post-fix: L2 via ${grokBin}`)

const planted = await replayPlanted({
  skipL2: skip,
  grokBin: grokBin ?? undefined,
})
if (planted.l2 === "skipped") {
  console.log(`post-fix: planted L1 ${planted.l1Hits}/${planted.l1Wanted}, L2 skipped (${planted.reason})`)
} else {
  console.log(`post-fix: planted L1 ${planted.l1Hits}/${planted.l1Wanted}, L2 ${planted.l2Hits}/${planted.l2Wanted}`)
}

const preL1: Record<string, { codes: string[]; findingCount: number; messages: string[] }> = {}
for (const page of human.verdicts) {
  const svgPath = join(OLD_SVG_DIR, `${page.id}.svg`)
  if (!existsSync(svgPath)) {
    preL1[page.id] = { codes: ["missing-svg"], findingCount: 0, messages: [] }
    console.log(`post-fix: missing old svg ${page.id}`)
    continue
  }
  const l1 = auditL1(readFileSync(svgPath, "utf8"))
  preL1[page.id] = {
    codes: classifyL1(l1),
    findingCount: l1.findings.length,
    messages: l1.findings.map((f) => `${f.code}: ${f.message}`),
  }
  process.stdout.write(`post-fix: pre L1 ${page.id} [${preL1[page.id].codes.join(",") || "clean"}]\n`)
}

async function runL2Pool(
  label: string,
  storePath: string,
  pages: typeof human.verdicts,
  svgOf: (id: string) => string | null,
): Promise<Store> {
  const store = loadStore(storePath)
  if (skip || !grokBin) return store
  const queue = pages.filter((page) => {
    if (!force && trusted(store, page.id)) {
      const v = store[page.id] as L2Verdict
      console.log(`post-fix: ${label} skip ${page.id} (have ${v.verdict})`)
      return false
    }
    return svgOf(page.id) !== null
  })
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      const page = queue[cursor]!
      cursor += 1
      const svg = svgOf(page.id)
      if (!svg) continue
      const started = Date.now()
      try {
        const v = await judgeL2({ svg, page, l1: auditL1(svg), grokBin: grokBin! })
        store[page.id] = v
        saveStore(storePath, store)
        console.log(`post-fix: ${label} ${page.id} ${v.verdict} ${((Date.now() - started) / 1000).toFixed(0)}s`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        store[page.id] = { error: message }
        saveStore(storePath, store)
        console.log(`post-fix: ${label} ${page.id} ERROR ${message.slice(0, 180)}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()))
  return store
}

const preL2 = await runL2Pool("pre L2", PRE_L2, human.verdicts, (id) => {
  const svgPath = join(OLD_SVG_DIR, `${id}.svg`)
  return existsSync(svgPath) ? readFileSync(svgPath, "utf8") : null
})

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
console.log(`post-fix: rendered ${svgs.size} HEAD pages into ${outDir}`)

const postL1: Record<string, { codes: string[]; findingCount: number; messages: string[] }> = {}
for (const page of human.verdicts) {
  const svg = svgs.get(page.id)
  if (!svg) {
    postL1[page.id] = { codes: ["missing-now"], findingCount: 0, messages: [] }
    continue
  }
  const l1 = auditL1(svg)
  postL1[page.id] = {
    codes: classifyL1(l1),
    findingCount: l1.findings.length,
    messages: l1.findings.map((f) => `${f.code}: ${f.message}`),
  }
  process.stdout.write(`post-fix: head L1 ${page.id} [${postL1[page.id].codes.join(",") || "clean"}]\n`)
}

const postL2 = await runL2Pool("head L2", POST_L2, human.verdicts, (id) => svgs.get(id) ?? null)

function combined(l1: { findingCount: number } | undefined, l2: L2Verdict | { error: string } | undefined): boolean {
  const l1hit = (l1?.findingCount ?? 0) > 0
  const l2hit = Boolean(l2 && "verdict" in l2 && hit(l2.verdict))
  return l1hit || l2hit
}

const preL1Hits = human.verdicts.filter((p) => (preL1[p.id]?.findingCount ?? 0) > 0).length
const preL2Hits = human.verdicts.filter((p) => {
  const v = preL2[p.id]
  return v && "verdict" in v && hit(v.verdict)
}).length
const preCombined = human.verdicts.filter((p) => combined(preL1[p.id], preL2[p.id])).length
const postL1Hits = human.verdicts.filter((p) => (postL1[p.id]?.findingCount ?? 0) > 0).length
const postL2Hits = human.verdicts.filter((p) => {
  const v = postL2[p.id]
  return v && "verdict" in v && hit(v.verdict)
}).length
const postCombined = human.verdicts.filter((p) => combined(postL1[p.id], postL2[p.id])).length

const payload = {
  preSha: PRE_SHA,
  headSha: HEAD_SHA,
  r1Merged: true,
  r2Merged: false,
  oldSvgDir: OLD_SVG_DIR,
  skip,
  grokBin,
  planted,
  wanted: human.verdicts.length,
  preL1,
  preL2,
  postL1,
  postL2,
  preL1Hits,
  preL2Hits,
  preCombined,
  postL1Hits,
  postL2Hits,
  postCombined,
}

writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`)
console.log(
  `post-fix: pre L1 ${preL1Hits}/44, L2 ${preL2Hits}/44, combined ${preCombined}/44 (80% bar is 35)`,
)
console.log(`post-fix: head L1 ${postL1Hits}/44, L2 ${postL2Hits}/44, combined ${postCombined}/44`)
console.log(`post-fix: wrote ${OUT}`)
