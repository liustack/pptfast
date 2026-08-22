// @vitest-environment node
//
// Planted replay injects ProcessRunner and never spawns grok.

import { describe, expect, it } from "vitest"
import { installNodePlatform } from "@/platform/node"
import type { ProcessRunner } from "@/cli/image-generators"
import { replayPlanted } from "./replay"

await installNodePlatform()

function fakeRunner(verdictFor: (prompt: string) => "pass" | "limit" | "rework"): ProcessRunner {
  return async (req) => {
    const prompt = String(req.args[req.args.indexOf("-p") + 1] ?? "")
    const idMatch = /Page id: (\S+)/.exec(prompt)
    const id = idMatch?.[1] ?? "unknown"
    const verdict = verdictFor(prompt)
    return {
      code: 0,
      stdout: JSON.stringify({
        id,
        table: "planted",
        subject: "planted",
        language: "en",
        theme: "planted",
        page: 1,
        verdict,
        note: `fake ${verdict}`,
        findings: verdict === "pass" ? [] : ["strikethrough"],
        source: "l2",
      }),
      stderr: "",
    }
  }
}

describe("replayPlanted", () => {
  it("succeeds when the fake runner returns rework for every plant", async () => {
    const result = await replayPlanted({
      run: fakeRunner(() => "rework"),
      grokBin: "grok",
    })
    expect(result).toMatchObject({ l1: "ok", l2: "ok" })
    expect(result.l2Hits).toBe(result.l2Wanted)
    expect(result.l2Wanted).toBeGreaterThanOrEqual(10)
  })

  it("throws when the fake runner returns pass for one plant", async () => {
    const run = fakeRunner((prompt) => (prompt.includes("Page id: rotate-1") ? "pass" : "rework"))
    await expect(replayPlanted({ run, grokBin: "grok" })).rejects.toThrow(/planted L2 miss: rotate-1/)
  })

  it("skips L2 when skipL2 is set and still checks L1", async () => {
    const result = await replayPlanted({ skipL2: "CI=true" })
    expect(result).toMatchObject({ l1: "ok", l2: "skipped", reason: "CI=true" })
    expect(result.l1Hits).toBe(result.l1Wanted)
    expect(result.l1Wanted).toBeGreaterThan(0)
  })
})
