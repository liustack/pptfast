// @vitest-environment node
//
// L2 unit tests inject ProcessRunner and never spawn grok.

import { mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { installNodePlatform } from "@/platform/node"
import type { ProcessRun, ProcessRunner } from "@/cli/image-generators"
import { l2SkipReason, judgeL2 } from "./l2"
import { parseEvalArgs } from "./args"
import { auditL1 } from "./l1"

await installNodePlatform()

const PAGE = {
  id: "component--callout--zh",
  table: "component",
  subject: "callout",
  language: "zh",
  theme: "consulting",
  page: 1,
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><text x="40" y="40" font-size="16">hello</text></svg>`

describe("l2SkipReason", () => {
  it("skips when CI=true", () => {
    expect(l2SkipReason({ ci: true, l1Only: false, grokBin: "/usr/bin/grok" })).toBe("CI=true")
  })

  it("skips when --l1-only", () => {
    expect(l2SkipReason({ ci: false, l1Only: true, grokBin: "/usr/bin/grok" })).toBe("--l1-only")
  })

  it("skips when grok is missing", () => {
    expect(l2SkipReason({ ci: false, l1Only: false, grokBin: null })).toBe("grok not on PATH")
  })

  it("does not skip when grok is present and L2 is requested", () => {
    expect(l2SkipReason({ ci: false, l1Only: false, grokBin: "/usr/bin/grok" })).toBeNull()
  })
})

describe("parseEvalArgs", () => {
  it("defaults to incremental L1+L2", () => {
    expect(parseEvalArgs([])).toMatchObject({ full: false, l1Only: false, help: false })
  })

  it("parses --full, --l1-only, --pages, --from, --out", () => {
    const args = parseEvalArgs([
      "--full",
      "--l1-only",
      "--pages=a,b",
      "--from=/tmp/g",
      "--out=/tmp/v.json",
    ])
    expect(args).toEqual({
      full: true,
      l1Only: true,
      pages: ["a", "b"],
      from: "/tmp/g",
      out: "/tmp/v.json",
      help: false,
    })
  })

  it("parses -h as help", () => {
    expect(parseEvalArgs(["-h"]).help).toBe(true)
    expect(parseEvalArgs(["--help"]).help).toBe(true)
  })
})

describe("judgeL2", () => {
  it("calls grok with the vision contract and never spawns a real process", async () => {
    const calls: ProcessRun[] = []
    const run: ProcessRunner = async (req) => {
      calls.push(req)
      return {
        code: 0,
        stdout: JSON.stringify({
          id: PAGE.id,
          table: PAGE.table,
          subject: PAGE.subject,
          language: PAGE.language,
          theme: PAGE.theme,
          page: PAGE.page,
          verdict: "rework",
          note: "planted",
          findings: ["taboo"],
          source: "l2",
          confidence: 0.9,
          rubricHits: ["taboo.md"],
        }),
        stderr: "",
      }
    }
    const workdir = mkdtempSync(join(tmpdir(), "pptfast-l2-"))
    const verdict = await judgeL2({
      svg: SVG,
      page: PAGE,
      l1: auditL1(SVG),
      workdir,
      run,
      grokBin: "grok",
    })
    expect(calls).toHaveLength(1)
    const args = calls[0]!.args
    expect(args).toContain("-p")
    expect(args).toContain("--cwd")
    expect(args).toContain("--permission-mode")
    expect(args).toContain("bypassPermissions")
    expect(args).toContain("--max-turns")
    expect(args).toContain("8")
    expect(args).toContain("--json-schema")
    expect(readFileSync(join(workdir, "page.png")).length).toBeGreaterThan(0)
    expect(readdirSync(join(workdir, "rubric")).some((f) => f.endsWith(".md"))).toBe(true)
    expect(verdict).toMatchObject({
      id: PAGE.id,
      verdict: "rework",
      source: "l2",
      findings: ["taboo"],
    })
  })
})
