import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const PLANTED_DIR = dirname(fileURLToPath(import.meta.url))

export const PLANTED_CLASSES = [
  "strikethrough",
  "overflow",
  "overlap",
  "radius",
  "rotate",
  "depth-order",
  "depth-contrast",
  "mid-text-bleed",
  "isolated-mid-piece",
] as const
export type PlantedClass = (typeof PLANTED_CLASSES)[number]

export interface PlantedEntry {
  id: string
  class: PlantedClass
  sourcePageId: string
  svg: string
  png: string
  l1Expected: string[]
  l2Expected: "rework" | "limit"
  l2Findings: string[]
}

export interface PlantedManifest {
  note: string
  entries: PlantedEntry[]
}

export function loadPlantedManifest(): PlantedManifest {
  return JSON.parse(readFileSync(join(PLANTED_DIR, "manifest.json"), "utf8")) as PlantedManifest
}

export function plantedSvg(entry: PlantedEntry): string {
  return readFileSync(join(PLANTED_DIR, entry.svg), "utf8")
}
