// @vitest-environment node
//
// Gold-hash diff is the incremental-audit selector. Tests use fake pages so
// a recolor story does not wait on a full matrix render.

import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { listThemes } from "@/api"
import { installNodePlatform } from "@/platform/node"
import { corpusAssets } from "./corpus/decks"
import { LEXICONS } from "./corpus/lexicon"
import {
  diffAffectedPages,
  hashesFromManifest,
  loadGoldHashes,
  type GoldHashes,
  type GoldPageHash,
} from "./hashes"
import { buildMatrix } from "./matrix"
import { renderMatrix, type Manifest } from "./render"

await installNodePlatform()

function page(hash: string, geometry = "geo", color = "col"): GoldPageHash {
  return { hash, geometry, color }
}

function gold(pages: Record<string, GoldPageHash>): GoldHashes {
  return { algorithm: "gallery-page-v2", pages }
}

describe("diffAffectedPages", () => {
  it("circles only the recolored theme's pages when one theme's hash moves", () => {
    const before = gold({
      "theme--academic--zh--p01": page("h-acad", "g-acad", "c-acad"),
      "theme--consulting--zh--p01": page("h-cons", "g-cons", "c-cons"),
      "layout--two-column--zh": page("h-layout", "g-layout", "c-layout"),
    })
    const after = gold({
      "theme--academic--zh--p01": page("h-acad-recolor", "g-acad", "c-acad-recolor"),
      "theme--consulting--zh--p01": page("h-cons", "g-cons", "c-cons"),
      "layout--two-column--zh": page("h-layout", "g-layout", "c-layout"),
    })
    expect(diffAffectedPages(before, after)).toEqual({
      changed: ["theme--academic--zh--p01"],
      added: [],
      removed: [],
    })
  })

  it("reports no change when every page hash is identical", () => {
    const same = gold({
      "theme--academic--zh--p01": page("h1"),
      "component--callout--zh": page("h2"),
    })
    expect(diffAffectedPages(same, structuredClone(same))).toEqual({
      changed: [],
      added: [],
      removed: [],
    })
  })

  it("puts a new pageId in added and a deleted pageId in removed", () => {
    const before = gold({
      "component--callout--zh": page("h-callout"),
      "component--quote--zh": page("h-quote"),
    })
    const after = gold({
      "component--callout--zh": page("h-callout"),
      "component--row-cards--zh": page("h-row"),
    })
    expect(diffAffectedPages(before, after)).toEqual({
      changed: [],
      added: ["component--row-cards--zh"],
      removed: ["component--quote--zh"],
    })
  })
})

describe("loadGoldHashes", () => {
  it("reads algorithm and pages from disk", () => {
    const file = join(mkdtempSync(join(tmpdir(), "pptfast-gold-")), "hashes.json")
    const payload = gold({ "component--callout--zh": page("h1", "g1", "c1") })
    writeFileSync(file, JSON.stringify(payload))
    expect(loadGoldHashes(file)).toEqual(payload)
  })
})

describe("hashesFromManifest", () => {
  it("copies each page's content hash and split fingerprint", () => {
    const manifest = {
      pages: [
        {
          id: "component--callout--zh",
          hash: "abc",
          fingerprint: { geometry: "g1", color: "c1" },
        },
        {
          id: "layout--two-column--en",
          hash: "def",
          fingerprint: { geometry: "g2", color: "c2" },
        },
      ],
    } as Manifest
    expect(hashesFromManifest(manifest)).toEqual({
      algorithm: "gallery-page-v2",
      pages: {
        "component--callout--zh": { hash: "abc", geometry: "g1", color: "c1" },
        "layout--two-column--en": { hash: "def", geometry: "g2", color: "c2" },
      },
    })
  })
})

describe("gold sample against a live render", () => {
  it("matches hashes.json for component/zh page ids", async () => {
    const goldFile = loadGoldHashes()
    const themeIds = listThemes()
      .map((t) => t.id)
      .sort()
    const jobs = buildMatrix(themeIds, { zh: await corpusAssets(LEXICONS.zh) }, { only: "component", languages: ["zh"] })
    const outDir = mkdtempSync(join(tmpdir(), "pptfast-gold-sample-"))
    const current = hashesFromManifest(renderMatrix(jobs, outDir, "pin").manifest)
    const subset: GoldHashes = {
      algorithm: "gallery-page-v2",
      pages: Object.fromEntries(jobs.map((job) => [job.id, goldFile.pages[job.id]!])),
    }
    expect(jobs.every((job) => goldFile.pages[job.id])).toBe(true)
    expect(diffAffectedPages(subset, current)).toEqual({ changed: [], added: [], removed: [] })
  })
})
