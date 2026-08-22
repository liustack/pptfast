// @vitest-environment node
//
// Calibration corpus is pinned. L2 dual-run lives in calibration/run.mts
// (CI skips grok). These tests never spawn grok.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { l2SkipReason } from "./l2"

const DIR = dirname(fileURLToPath(import.meta.url))

describe("human-verdicts calibration set", () => {
  it("pins 44 rework page ids restored from the 2026-08-22 fix-list", () => {
    const raw = JSON.parse(readFileSync(join(DIR, "calibration/human-verdicts.json"), "utf8")) as {
      note: string
      total: number
      verdicts: { id: string; verdict: string }[]
    }
    expect(raw.note).toMatch(/不是 localStorage 原件/)
    expect(raw.total).toBe(44)
    expect(raw.verdicts).toHaveLength(44)
    expect(raw.verdicts.every((v) => v.verdict === "rework")).toBe(true)
    expect(new Set(raw.verdicts.map((v) => v.id)).size).toBe(44)
  })

  it("keeps a pre-fix L2 replay with one entry per human page", () => {
    const human = JSON.parse(readFileSync(join(DIR, "calibration/human-verdicts.json"), "utf8")) as {
      verdicts: { id: string }[]
    }
    const replay = JSON.parse(readFileSync(join(DIR, "calibration/pre-fix-l2.json"), "utf8")) as {
      sha: string
      pages: Record<string, { verdict?: string }>
    }
    expect(replay.sha).toBe("321748d")
    expect(Object.keys(replay.pages).sort()).toEqual(human.verdicts.map((v) => v.id).sort())
  })
})

describe("L2 dual-run skip", () => {
  it("skips on CI so pnpm check never calls grok", () => {
    expect(l2SkipReason({ ci: true, l1Only: false, grokBin: "/usr/bin/grok" })).toBe("CI=true")
  })
})
