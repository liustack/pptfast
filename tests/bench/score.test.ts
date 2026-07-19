// @vitest-environment node
import { join, resolve } from "node:path"
import JSZip from "jszip"
import { describe, expect, it } from "vitest"
import {
  loadQuestionMetas,
  normalizedPptxSha1,
  renderModelReport,
  renderSummaryReport,
  runScoring,
  scoreModel,
  scoreQuestion,
} from "./score.mts"

const FIXTURES = join(import.meta.dirname, "fixtures")
const QUESTIONS_DIR = join(FIXTURES, "questions")
const RESULTS_DIR = join(FIXTURES, "results")
// Mirrors score.mts's own REPO_ROOT (resolved off this file's own
// directory, one level up from tests/bench/) — used to assert the notes-column
// relativization actually strips the machine-specific absolute prefix.
const REPO_ROOT = resolve(import.meta.dirname, "../..")

// ── normalizedPptxSha1 — the determinism comparison method itself ──
//
// These three tests build synthetic zips directly (bypassing generatePptx)
// so the proof that this is a genuine byte comparison — not a vacuous
// always-equal or always-different check — never depends on real render
// timing or wall-clock behavior.

async function makeZipBytes(files: Record<string, string | Buffer>): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) zip.file(path, content)
  return zip.generateAsync({ type: "uint8array" })
}

describe("normalizedPptxSha1", () => {
  it("ignores a docProps/core.xml difference — the one known clock-dependent zip part", async () => {
    const a = await makeZipBytes({ "docProps/core.xml": "<t>2026-01-01</t>", "ppt/presentation.xml": "<p>x</p>" })
    const b = await makeZipBytes({ "docProps/core.xml": "<t>2099-12-31</t>", "ppt/presentation.xml": "<p>x</p>" })
    expect(await normalizedPptxSha1(a)).toBe(await normalizedPptxSha1(b))
  })

  it("is sensitive to a one-character difference anywhere outside docProps/core.xml — a genuine content comparison", async () => {
    const a = await makeZipBytes({ "docProps/core.xml": "<t>same</t>", "ppt/slides/slide1.xml": "<a>1</a>" })
    const b = await makeZipBytes({ "docProps/core.xml": "<t>same</t>", "ppt/slides/slide1.xml": "<a>2</a>" })
    expect(await normalizedPptxSha1(a)).not.toBe(await normalizedPptxSha1(b))
  })

  it("is sensitive to binary (non-UTF8) content, not just text parts — real decks embed binary image assets", async () => {
    const a = await makeZipBytes({
      "docProps/core.xml": "same",
      "ppt/media/image1.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]),
    })
    const b = await makeZipBytes({
      "docProps/core.xml": "same",
      "ppt/media/image1.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x02]), // one byte flipped
    })
    expect(await normalizedPptxSha1(a)).not.toBe(await normalizedPptxSha1(b))
  })
})

// ── loadQuestionMetas ──

describe("loadQuestionMetas", () => {
  it("reads the fixture question bank sorted by id", async () => {
    const metas = await loadQuestionMetas(QUESTIONS_DIR)
    expect(metas.map((m) => m.id)).toEqual(["fx01", "fx02", "fx03"])
    expect(metas[0]!.coverage?.expects_components).toEqual(["bullets", "kpi_cards"])
  })
})

// ── scoreQuestion — all-green fixtures ──

describe("scoreQuestion — green-model (all clean)", () => {
  it("fx01: clean bare IR — validates clean, audits clean, renders deterministically, partial coverage hit", async () => {
    const metas = await loadQuestionMetas(QUESTIONS_DIR)
    const meta = metas.find((m) => m.id === "fx01")!
    const score = await scoreQuestion("fx01", join(RESULTS_DIR, "green-model", "fx01"), meta)
    expect(score.reason).toBeUndefined()
    expect(score.validatePass).toBe(true)
    expect(score.validateErrorCount).toBe(0)
    expect(score.auditFindingCount).toBe(0)
    expect(score.renderOk).toBe(true)
    expect(score.renderError).toBeUndefined()
    expect(score.deterministic).toBe(true)
    // fx01's artifact uses "bullets" only — "kpi_cards" is expected but absent.
    expect(score.coverageHits).toEqual(["bullets"])
    expect(score.self).toEqual({ tokens: 1234, duration_seconds: 42.5, model: "fixture-green" })
  })

  it("fx02: clean deck-project artifact assembles via readDeckDir and scores clean", async () => {
    const metas = await loadQuestionMetas(QUESTIONS_DIR)
    const meta = metas.find((m) => m.id === "fx02")!
    const score = await scoreQuestion("fx02", join(RESULTS_DIR, "green-model", "fx02"), meta)
    expect(score.reason).toBeUndefined()
    expect(score.validatePass).toBe(true)
    expect(score.validateErrorCount).toBe(0)
    expect(score.auditFindingCount).toBe(0)
    expect(score.renderOk).toBe(true)
    expect(score.deterministic).toBe(true)
    // "kpi_cards" is used and expected — "chart" is expected but absent.
    expect(score.coverageHits).toEqual(["kpi_cards"])
    expect(score.self).toEqual({ tokens: 900, duration_seconds: 30, model: "fixture-green" })
  })

  it("fx03 (green): clean bare IR using row_cards, no self-reported meta present", async () => {
    const metas = await loadQuestionMetas(QUESTIONS_DIR)
    const meta = metas.find((m) => m.id === "fx03")!
    const score = await scoreQuestion("fx03", join(RESULTS_DIR, "green-model", "fx03"), meta)
    expect(score.validatePass).toBe(true)
    expect(score.auditFindingCount).toBe(0)
    expect(score.renderOk).toBe(true)
    expect(score.deterministic).toBe(true)
    expect(score.coverageHits).toEqual(["row_cards"])
    expect(score.self).toBeUndefined()
  })
})

// ── scoreQuestion — degraded fixtures ──

describe("scoreQuestion — degraded-model (validate-failing / audit-positive / broken JSON)", () => {
  it("fx01 (degraded): malformed JSON scores a fail with a reason, never throws", async () => {
    const metas = await loadQuestionMetas(QUESTIONS_DIR)
    const meta = metas.find((m) => m.id === "fx01")!
    const score = await scoreQuestion("fx01", join(RESULTS_DIR, "degraded-model", "fx01"), meta)
    expect(score.reason).toMatch(/malformed JSON/)
    expect(score.validatePass).toBe(false)
    expect(score.renderOk).toBe(false)
    expect(score.deterministic).toBeNull()
    expect(score.coverageHits).toEqual([])
    // notes-column reproducibility across machines: the embedded path is
    // repo-root-relative, not the machine-specific absolute path.
    expect(score.reason).not.toContain(REPO_ROOT)
    expect(score.reason).toContain("tests/bench/fixtures/results/degraded-model/fx01/broken.json")
  })

  it("fx02 (degraded): unknown theme id fails validateIr — validatePass false, errors > 0, render also fails", async () => {
    const metas = await loadQuestionMetas(QUESTIONS_DIR)
    const meta = metas.find((m) => m.id === "fx02")!
    const score = await scoreQuestion("fx02", join(RESULTS_DIR, "degraded-model", "fx02"), meta)
    expect(score.reason).toBeUndefined()
    expect(score.validatePass).toBe(false)
    expect(score.validateErrorCount).toBeGreaterThan(0)
    expect(score.auditFindingCount).toBe(0)
    expect(score.renderOk).toBe(false)
    expect(score.renderError).toBeDefined()
    expect(score.deterministic).toBeNull()
  })

  it("fx03 (degraded): validates clean but auditDeck flags a real low-contrast finding (luxe + kpi delta:down)", async () => {
    const metas = await loadQuestionMetas(QUESTIONS_DIR)
    const meta = metas.find((m) => m.id === "fx03")!
    const score = await scoreQuestion("fx03", join(RESULTS_DIR, "degraded-model", "fx03"), meta)
    expect(score.validatePass).toBe(true)
    expect(score.auditFindingCount).toBeGreaterThan(0)
    expect(score.renderOk).toBe(true)
    expect(score.coverageHits).toEqual(["kpi_cards"])
  })
})

describe("scoreQuestion — missing artifact", () => {
  it("a question directory that was never created scores a fail with a reason, never throws", async () => {
    const score = await scoreQuestion("fx99", join(RESULTS_DIR, "green-model", "fx99"), undefined)
    expect(score.reason).toMatch(/no result directory/)
    expect(score.validatePass).toBe(false)
    expect(score.renderOk).toBe(false)
    expect(score.deterministic).toBeNull()
  })
})

// ── loadArtifact's two remaining unexercised failure branches (task-2
// review, Minor finding 2): a readDeckDir/assembleDeck structural-assembly
// error, and the "ambiguous artifact" (>1 candidate *.json) case. Both
// fixtures use standalone fx97/fx98 ids that are not part of the
// tests/bench/fixtures/questions bank (same pattern as fx99 above) so they don't
// perturb the green/degraded-model aggregate counts asserted elsewhere.

describe("scoreQuestion — deck-project structural-assembly failure", () => {
  it("a page file that redeclares a plan-locked field fails readDeckDir's assembleDeck step, scores a fail with a reason, never throws", async () => {
    const score = await scoreQuestion("fx98", join(RESULTS_DIR, "degraded-model", "fx98"), undefined)
    expect(score.reason).toMatch(/deck project directory failed to assemble/)
    expect(score.reason).toMatch(/"heading" is locked by the spec/)
    expect(score.validatePass).toBe(false)
    expect(score.validateErrorCount).toBe(0)
    expect(score.auditFindingCount).toBe(0)
    expect(score.renderOk).toBe(false)
    expect(score.deterministic).toBeNull()
    expect(score.coverageHits).toEqual([])
    // relativized, not the machine-specific absolute path
    expect(score.reason).not.toContain(REPO_ROOT)
  })
})

describe("scoreQuestion — ambiguous artifact", () => {
  it("a result directory with more than one candidate *.json file scores a fail with a reason naming both, never throws", async () => {
    const score = await scoreQuestion("fx97", join(RESULTS_DIR, "degraded-model", "fx97"), undefined)
    expect(score.reason).toMatch(/ambiguous artifact/)
    expect(score.reason).toContain("alt.json")
    expect(score.reason).toContain("answer.json")
    expect(score.validatePass).toBe(false)
    expect(score.renderOk).toBe(false)
    expect(score.deterministic).toBeNull()
    expect(score.coverageHits).toEqual([])
    // relativized, not the machine-specific absolute path
    expect(score.reason).not.toContain(REPO_ROOT)
    expect(score.reason).toContain("tests/bench/fixtures/results/degraded-model/fx97")
  })
})

// ── scoreQuestion — local asset resolution (defect H, 2026-07-20 bench-driven
// fixes wave): a relative assets.images[id].src must resolve against the
// artifact's own directory, the same way real CLI `render` resolves it
// (`resolveLocalAssets`, `../../src/cli/load-ir.ts`, called with `baseDir`
// = the IR file's directory for a bare IR, or `readDeckDir`'s own `deckDir`
// for a deck-project directory — both equal `resultDir` here). Before this
// fix, `generatePptx` received the unresolved relative src untouched,
// `inlinePptxAssets` tried to `fetch()` it as a URL, and the render failed —
// misscoring a renderable artifact as `renderOk: false`. Both artifact
// shapes get their own standalone fixture (fx96 bare IR, fx95 deck-project)
// since `loadArtifact` dispatches between two entirely different code paths
// (a raw `*.json` parse vs. `readDeckDir`) that both needed the fix.

describe("scoreQuestion — bare IR with a relative local asset path resolves and renders (defect H)", () => {
  it("fx96: assets.images.pic.src is a relative 'assets/pic.png' — resolves against resultDir and renders deterministically", async () => {
    const score = await scoreQuestion("fx96", join(RESULTS_DIR, "green-model", "fx96"), undefined)
    expect(score.reason).toBeUndefined()
    expect(score.validatePass).toBe(true)
    expect(score.renderOk).toBe(true)
    expect(score.renderError).toBeUndefined()
    expect(score.deterministic).toBe(true)
  })
})

describe("scoreQuestion — deck-project directory with a relative local asset path resolves and renders (defect H)", () => {
  it("fx95: assets/pic.png scanned by readDeckDir stays relative until the scorer resolves it against deckDir (== resultDir)", async () => {
    const score = await scoreQuestion("fx95", join(RESULTS_DIR, "green-model", "fx95"), undefined)
    expect(score.reason).toBeUndefined()
    expect(score.validatePass).toBe(true)
    expect(score.renderOk).toBe(true)
    expect(score.renderError).toBeUndefined()
    expect(score.deterministic).toBe(true)
  })
})

// ── report generation shape ──

describe("renderModelReport / renderSummaryReport", () => {
  it("produces a per-model report with one row per question and an aggregates section", async () => {
    const metas = await loadQuestionMetas(QUESTIONS_DIR)
    const report = await scoreModel("green-model", join(RESULTS_DIR, "green-model"), metas)
    const md = renderModelReport(report.modelTag, report.scores)
    expect(md).toContain("# pptfast benchmark report — green-model")
    expect(md).toContain("| fx01 |")
    expect(md).toContain("| fx02 |")
    expect(md).toContain("| fx03 |")
    expect(md).toContain("## Aggregates")
    expect(md).toContain("questions scored: 3")
    // no timestamp in the report body (reproducibility, AGENTS.md)
    expect(md).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
  })

  it("produces a cross-model summary with one row per model, sorted", async () => {
    const metas = await loadQuestionMetas(QUESTIONS_DIR)
    const green = await scoreModel("green-model", join(RESULTS_DIR, "green-model"), metas)
    const degraded = await scoreModel("degraded-model", join(RESULTS_DIR, "degraded-model"), metas)
    const md = renderSummaryReport([green, degraded])
    expect(md).toContain("# pptfast benchmark — cross-model summary")
    const degradedLine = md.split("\n").find((l) => l.startsWith("| degraded-model"))!
    const greenLine = md.split("\n").find((l) => l.startsWith("| green-model"))!
    expect(degradedLine).toBeDefined()
    expect(greenLine).toBeDefined()
    // degraded-model's validate pass rate must be strictly lower than green-model's
    const rate = (line: string) => Number(line.split("|")[3]!.trim().replace("%", ""))
    expect(rate(degradedLine)).toBeLessThan(rate(greenLine))
    // alphabetical: "degraded-model" < "green-model"
    expect(md.indexOf(degradedLine)).toBeLessThan(md.indexOf(greenLine))
    expect(md).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
  })
})

// ── scorer reproducibility: the double-run byte assertion ──

describe("runScoring — reproducibility", () => {
  it("two independent runs over the same fixtures produce byte-identical report content", async () => {
    const runA = await runScoring(QUESTIONS_DIR, RESULTS_DIR)
    const runB = await runScoring(QUESTIONS_DIR, RESULTS_DIR)
    expect(runA.writes.map((w) => w.path)).toEqual(runB.writes.map((w) => w.path))
    expect(runA.writes.length).toBeGreaterThan(0)
    for (let i = 0; i < runA.writes.length; i++) {
      expect(runB.writes[i]!.content).toBe(runA.writes[i]!.content)
    }
  })

  it("walks both fixture models and writes a report.md path per model plus one summary.md", async () => {
    const run = await runScoring(QUESTIONS_DIR, RESULTS_DIR)
    const paths = run.writes.map((w) => w.path).sort()
    expect(paths).toEqual(
      [
        join(RESULTS_DIR, "degraded-model", "report.md"),
        join(RESULTS_DIR, "green-model", "report.md"),
        join(RESULTS_DIR, "summary.md"),
      ].sort(),
    )
  })

  it("no report body contains an ISO timestamp or other clock-derived text", async () => {
    const run = await runScoring(QUESTIONS_DIR, RESULTS_DIR)
    for (const w of run.writes) {
      expect(w.content).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
    }
  })
})
