/**
 * Replay the planted miss-class set. L1 is zero-model and always runs.
 * L2 is skipped when `skipL2` is set so `pnpm check` never spawns grok.
 */

import type { ProcessRunner } from "@/cli/image-generators"
import { auditL1, classifyL1 } from "../l1"
import { judgeL2, type GalleryPageMeta } from "../l2"
import { loadPlantedManifest, plantedSvg } from "./load"

export interface ReplayPlantedOpts {
  run?: ProcessRunner
  grokBin?: string
  skipL2?: string | null
}

export interface ReplayPlantedResult {
  l1: "ok"
  l2: "ok" | "skipped"
  reason?: string
  l1Hits: number
  l1Wanted: number
  l2Hits?: number
  l2Wanted?: number
}

function plantedPage(entry: { id: string; class: string }): GalleryPageMeta {
  return {
    id: entry.id,
    table: "planted",
    subject: entry.class,
    language: "en",
    theme: "planted",
    page: 1,
  }
}

export async function replayPlanted(opts: ReplayPlantedOpts = {}): Promise<ReplayPlantedResult> {
  const { entries } = loadPlantedManifest()
  const l1Wanted = entries.filter((entry) => entry.l1Expected.length > 0)
  const missedL1: string[] = []
  for (const entry of l1Wanted) {
    const got = classifyL1(auditL1(plantedSvg(entry)))
    const missing = entry.l1Expected.filter((code) => !got.includes(code))
    if (missing.length > 0) missedL1.push(`${entry.id} missing ${missing.join(",")}`)
  }
  if (missedL1.length > 0) {
    throw new Error(`planted L1 miss: ${missedL1.join(", ")}`)
  }

  if (opts.skipL2) {
    return {
      l1: "ok",
      l2: "skipped",
      reason: opts.skipL2,
      l1Hits: l1Wanted.length,
      l1Wanted: l1Wanted.length,
    }
  }

  const missedL2: string[] = []
  for (const entry of entries) {
    const svg = plantedSvg(entry)
    const verdict = await judgeL2({
      svg,
      page: plantedPage(entry),
      l1: auditL1(svg),
      run: opts.run,
      grokBin: opts.grokBin,
      playwright: false,
    })
    const hit = verdict.verdict === "rework" || verdict.verdict === "limit"
    if (!hit) missedL2.push(entry.id)
  }
  if (missedL2.length > 0) {
    throw new Error(`planted L2 miss: ${missedL2.join(", ")}`)
  }
  return {
    l1: "ok",
    l2: "ok",
    l1Hits: l1Wanted.length,
    l1Wanted: l1Wanted.length,
    l2Hits: entries.length,
    l2Wanted: entries.length,
  }
}
