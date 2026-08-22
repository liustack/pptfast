/**
 * Incremental L2 pass over SHA 321748d SVGs. Writes after every page so a
 * timeout does not wipe earlier verdicts.
 *
 *   CI= pnpm exec tsx evals/gallery/calibration/l2-pass.mts
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { findOnPath } from "@/cli/image-generators"
import { installNodePlatform } from "@/platform/node"
import { auditL1 } from "../l1"
import { judgeL2, l2SkipReason, type GalleryPageMeta, type L2Verdict } from "../l2"

const OLD_SVG_DIR = process.env.PPTFAST_CAL_SVG_DIR ?? "/tmp/pptfast-gallery-cal-svgs"
const OUT = process.env.PPTFAST_CAL_L2 ?? "/tmp/pptfast-gallery-cal-l2.json"

type Store = Record<string, L2Verdict | { error: string }>

const human = JSON.parse(
  readFileSync(new URL("./human-verdicts.json", import.meta.url), "utf8"),
) as { verdicts: (GalleryPageMeta & { verdict: string })[] }

await installNodePlatform()

const grokBin = await findOnPath("grok", process.env)
const skip = l2SkipReason({
  ci: process.env.CI === "true",
  l1Only: process.argv.includes("--l1-only"),
  grokBin,
})
if (skip || !grokBin) {
  console.log(`l2-pass: skipping (${skip ?? "no grok"})`)
  process.exit(0)
}

const onlyIds = new Set(
  process.argv
    .filter((a) => a.startsWith("--only="))
    .flatMap((a) => a.slice("--only=".length).split(","))
    .filter(Boolean),
)

const store: Store = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as Store) : {}
const force = process.argv.includes("--force")
const concurrency = Math.max(1, Number(process.env.PPTFAST_L2_CONCURRENCY ?? 3))

function save(): void {
  writeFileSync(OUT, `${JSON.stringify(store, null, 2)}\n`)
}

function trusted(id: string): boolean {
  const v = store[id]
  if (!v || !("verdict" in v)) return false
  const note = v.note ?? ""
  if (note.includes("seeded from first L2 pass")) return false
  if (note.includes("Placeholder while inspecting")) return false
  return true
}

console.log(`l2-pass: grok ${grokBin}, trusted ${human.verdicts.filter((p) => trusted(p.id)).length} ok, concurrency ${concurrency}`)

const queue = human.verdicts.filter((page) => {
  if (onlyIds.size > 0 && !onlyIds.has(page.id)) return false
  if (!force && trusted(page.id)) {
    const v = store[page.id] as L2Verdict
    console.log(`l2-pass: skip ${page.id} (have ${v.verdict})`)
    return false
  }
  return true
})

async function judgeOne(page: (typeof human.verdicts)[number]): Promise<void> {
  const svgPath = join(OLD_SVG_DIR, `${page.id}.svg`)
  if (!existsSync(svgPath)) {
    store[page.id] = { error: "missing-svg" }
    save()
    return
  }
  const svg = readFileSync(svgPath, "utf8")
  const l1 = auditL1(svg)
  const started = Date.now()
  try {
    const v = await judgeL2({ svg, page, l1, grokBin: grokBin! })
    store[page.id] = v
    save()
    console.log(`l2-pass: ${page.id} ${v.verdict} ${((Date.now() - started) / 1000).toFixed(0)}s`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    store[page.id] = { error: message }
    save()
    console.log(`l2-pass: ${page.id} ERROR ${message.slice(0, 180)} ${((Date.now() - started) / 1000).toFixed(0)}s`)
  }
}

let cursor = 0
async function worker(): Promise<void> {
  while (cursor < queue.length) {
    const page = queue[cursor]!
    cursor += 1
    await judgeOne(page)
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()))

const ok = human.verdicts.filter((p) => trusted(p.id))
const hits = ok.filter((p) => {
  const v = store[p.id] as L2Verdict
  return v.verdict === "rework" || v.verdict === "limit"
})
console.log(`l2-pass: ${hits.length} hits / ${ok.length} ok / ${human.verdicts.length} wanted`)
console.log(`l2-pass: wrote ${OUT}`)
