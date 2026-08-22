/**
 * Dual-run three pre-fix pages. Classification drift is pass vs rework/limit.
 *
 *   CI= pnpm exec tsx evals/gallery/calibration/dual.mts
 */

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { findOnPath } from "@/cli/image-generators"
import { installNodePlatform } from "@/platform/node"
import { auditL1 } from "../l1"
import { judgeL2, l2SkipReason, type GalleryPageMeta } from "../l2"

const OLD_SVG_DIR = process.env.PPTFAST_CAL_SVG_DIR ?? "/tmp/pptfast-gallery-cal-svgs"
const OUT = process.env.PPTFAST_CAL_DUAL ?? "/tmp/pptfast-gallery-cal-dual.json"
const ids = ["layout--two-column--en", "component--cycle-petal-wheel--zh", "component--people-cards--zh"]

await installNodePlatform()
const grokBin = await findOnPath("grok", process.env)
const skip = l2SkipReason({
  ci: process.env.CI === "true",
  l1Only: false,
  grokBin,
})
if (skip || !grokBin) {
  console.log(`dual: skipping (${skip ?? "no grok"})`)
  process.exit(0)
}

const human = JSON.parse(readFileSync(new URL("./human-verdicts.json", import.meta.url), "utf8")) as {
  verdicts: GalleryPageMeta[]
}
const by = Object.fromEntries(human.verdicts.map((v) => [v.id, v]))
const dual: { id: string; a: string; b: string; drift: boolean }[] = []

for (const id of ids) {
  const svg = readFileSync(join(OLD_SVG_DIR, `${id}.svg`), "utf8")
  const page = by[id]!
  const l1 = auditL1(svg)
  const a = await judgeL2({ svg, page, l1, grokBin })
  const b = await judgeL2({ svg, page, l1, grokBin })
  const classA = a.verdict === "pass" ? "pass" : "rework"
  const classB = b.verdict === "pass" ? "pass" : "rework"
  dual.push({ id, a: a.verdict, b: b.verdict, drift: classA !== classB })
  console.log(`dual ${id} ${a.verdict}/${b.verdict}${classA !== classB ? " DRIFT" : ""}`)
}

writeFileSync(OUT, `${JSON.stringify(dual, null, 2)}\n`)
const drifted = dual.filter((d) => d.drift).length
console.log(`dual: ${drifted}/${dual.length} drifted, wrote ${OUT}`)
