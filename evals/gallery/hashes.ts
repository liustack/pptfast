/**
 * Gold per-page content hashes for incremental gallery audit.
 *
 * The algorithm is `gallery-page-v2`: reuse `ManifestPage.hash` (whole-page
 * markup fingerprint) plus `fingerprint.{geometry,color}` from `./render.ts`.
 * Do not invent a second hasher. Refresh `hashes.json` with `write-hashes.mts`.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Manifest } from "./render"

export interface GoldPageHash {
  hash: string
  geometry: string
  color: string
}

export interface GoldHashes {
  algorithm: "gallery-page-v2"
  pages: Record<string, GoldPageHash>
}

export const GOLD_HASH_ALGORITHM = "gallery-page-v2" as const

const DEFAULT_GOLD_PATH = join(dirname(fileURLToPath(import.meta.url)), "hashes.json")

export function loadGoldHashes(path: string = DEFAULT_GOLD_PATH): GoldHashes {
  const raw = JSON.parse(readFileSync(path, "utf8")) as GoldHashes
  if (raw.algorithm !== GOLD_HASH_ALGORITHM) {
    throw new Error(`gold hashes algorithm is "${String(raw.algorithm)}", expected "${GOLD_HASH_ALGORITHM}"`)
  }
  if (!raw.pages || typeof raw.pages !== "object") {
    throw new Error("gold hashes file is missing pages")
  }
  return raw
}

export function hashesFromManifest(manifest: Manifest): GoldHashes {
  const pages: Record<string, GoldPageHash> = {}
  for (const page of manifest.pages) {
    pages[page.id] = {
      hash: page.hash,
      geometry: page.fingerprint.geometry,
      color: page.fingerprint.color,
    }
  }
  return { algorithm: GOLD_HASH_ALGORITHM, pages }
}

export function diffAffectedPages(
  gold: GoldHashes,
  current: GoldHashes,
): {
  changed: string[]
  added: string[]
  removed: string[]
} {
  const changed: string[] = []
  const added: string[] = []
  const removed: string[] = []
  for (const id of Object.keys(current.pages)) {
    const before = gold.pages[id]
    if (!before) {
      added.push(id)
      continue
    }
    if (before.hash !== current.pages[id]!.hash) changed.push(id)
  }
  for (const id of Object.keys(gold.pages)) {
    if (!(id in current.pages)) removed.push(id)
  }
  changed.sort()
  added.sort()
  removed.sort()
  return { changed, added, removed }
}
