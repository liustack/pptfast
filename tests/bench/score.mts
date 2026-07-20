#!/usr/bin/env -S pnpm exec tsx
/**
 * Model-agnostic pptfast benchmark scorer (benchmark wave, task 2). Walks
 * `tests/bench/results/<model-tag>/<question-id>/`, scores each answered question
 * against exactly the mechanical signals the render chain already exposes —
 * `validateIr`/`auditDeck`/`generatePptx` — and writes a per-model
 * `report.md` plus a cross-model `summary.md`. Zero model/API calls: this
 * script never talks to a model, it only reads artifact files a run already
 * produced (`tests/bench/README.md`'s run protocol).
 *
 * Every metric here is objective and mechanical by construction — no
 * subjective quality dimension is computed or scored (`AGENTS.md`'s "评审
 * 基调": a subjective dimension entering the score would be a Major finding).
 * `coverageHits` is the one exception worth calling out twice: it is
 * reporting-only, descriptive of which of a question's `expects_components`
 * showed up in the artifact, and is never read by any pass/fail decision in
 * this file.
 *
 * Usage: `pnpm bench:score [questionsDir] [resultsDir]` (defaults to
 * `tests/bench/questions` / `tests/bench/results`, both resolved against `cwd`).
 *
 * Design note: `runScoring` below is a pure read — it computes report
 * strings but never writes to disk, so the vitest suite (`score.test.ts`)
 * can call it directly against the checked-in `tests/bench/fixtures/` tree without
 * mutating the repo. Only `main()` (the CLI entry, guarded below) performs
 * the actual `writeFile`s.
 */
import { createHash } from "node:crypto"
import type { Dirent } from "node:fs"
import { readFile, readdir, writeFile } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"
import JSZip from "jszip"

import { auditDeck, generatePptx, validateIr, type PptxIR } from "../../src/index"
import { readDeckDir } from "../../src/cli/deck-dir"
import { resolveLocalAssets } from "../../src/cli/load-ir"
import { installNodePlatform } from "../../src/platform/node"

installNodePlatform()

/**
 * Repo root, derived from this file's own location (`tests/bench/score.mts` →
 * one level up) rather than `process.cwd()` — `main()` always resolves
 * `questionsDir`/`resultsDir` against `cwd`, but `score.test.ts` calls
 * `scoreQuestion`/`runScoring` directly with fixture paths built off
 * `import.meta.dirname`, and both land under the same repo checkout either
 * way. Used to relativize the absolute filesystem paths `loadArtifact`
 * below would otherwise embed in a `reason` — those paths end up in the
 * report's `notes` column (`renderModelReport`), and an absolute path
 * there is specific to whichever machine/checkout ran the scorer, breaking
 * report comparability across machines even though same-machine
 * byte-identical reproducibility (this file's actual contract, asserted by
 * `score.test.ts`'s double-run suite) never depended on it. Repo-root-
 * relative was chosen over results-dir-relative because it needs no extra
 * parameter threaded through `loadArtifact`/`scoreQuestion` (both already
 * take a raw `resultDir`, no root reference) and reads the same regardless
 * of which `resultsDir` a given run was pointed at.
 */
const REPO_ROOT = resolve(import.meta.dirname, "../..")

/**
 * Strips every occurrence of the repo-root absolute prefix out of `text`,
 * turning e.g. `/Users/x/pptfast/tests/bench/results/m/q1/a.json` into
 * `tests/bench/results/m/q1/a.json`. A plain prefix strip (not `path.relative`
 * called on the whole string) because some callers below pass through an
 * error message from `readDeckDir`/`assembleDeck` that already has an
 * absolute path baked into arbitrary surrounding prose — there is no
 * single path argument to hand `path.relative`, only text to scrub. A path
 * outside `REPO_ROOT` (a `resultsDir` pointed elsewhere entirely) is left
 * absolute rather than mangled — graceful degradation, not a hard
 * requirement this scorer can enforce on its caller.
 */
function relativizeToRepoRoot(text: string): string {
  return text.split(REPO_ROOT + sep).join("")
}

// ── question bank / self-reported meta shapes (tests/bench/README.md's schema) ──

export interface QuestionCoverage {
  strategy?: string
  pacing?: string
  expects_components?: string[]
  workflow?: string
  image_deck?: boolean
}

export interface QuestionMeta {
  id: string
  title?: string
  coverage?: QuestionCoverage
  lang?: string
}

/** `tests/bench/results/<model>/<qid>/meta.json` — optional, self-reported by
 *  whatever harness ran the model. Passed through into reports verbatim,
 *  never scored (README's "Run protocol", step 4). */
export interface SelfReportedMeta {
  tokens?: number
  duration_seconds?: number
  model?: string
}

export interface QuestionScore {
  id: string
  validatePass: boolean
  validateErrorCount: number
  auditFindingCount: number
  renderOk: boolean
  /** null when renderOk is false — determinism cannot be evaluated without
   *  two successful renders to compare. */
  deterministic: boolean | null
  coverageHits: string[]
  expectedComponents: string[]
  /** Set only for a missing/unparseable/crashing artifact — "never crash the
   *  run" (AGENTS.md): the question scores as a fail and this names why. */
  reason?: string
  /** Set only when `generatePptx` threw — the caught error's message. */
  renderError?: string
  self?: SelfReportedMeta
  coverage?: QuestionCoverage
}

export interface ModelReport {
  modelTag: string
  scores: QuestionScore[]
}

// ── artifact loading (tests/bench/README.md's two artifact shapes) ──

type ArtifactResult = { ir: unknown } | { error: string }

/**
 * Resolves one `tests/bench/results/<model>/<qid>/` directory into a raw IR
 * object. Two shapes, dispatched the same way the CLI does
 * (`isDeckDirectory` in `src/cli/deck-dir.ts`, restated here rather than
 * imported because the dispatch signal this scorer needs — "does this
 * directory contain a deck spec/plan artifact" — is cheaper than a second
 * `stat`): a bare IR `*.json` file, or a full deck-project directory
 * assembled via `readDeckDir` (the same seam `pptfast validate`/`render`
 * use, `AGENTS.md`'s "reuse, do not reimplement assembly"). Never throws —
 * every failure path (missing directory, missing/ambiguous artifact file,
 * malformed JSON, a `readDeckDir`/`assembleDeck` structural error) returns
 * `{ error }` instead.
 *
 * Checks for *either* `deck.spec.json` (current, vocabulary-v4 rename, spec
 * §6/§9.2) or the pre-rename `deck.plan.json` — not just the former — so a
 * not-yet-migrated result directory still routes into `readDeckDir` and gets
 * its own readable "no deck.spec.json ... run `pptfast migrate`" error
 * (`readSpecFile`, `src/cli/deck-dir.ts`) instead of silently falling through
 * to the bare-IR branch below and being mis-parsed as if `deck.plan.json`/
 * `deck.spec.json` itself were a bare `PptxIR` file.
 */
async function loadArtifact(resultDir: string): Promise<ArtifactResult> {
  let entries: Dirent[]
  try {
    entries = await readdir(resultDir, { withFileTypes: true })
  } catch {
    return { error: relativizeToRepoRoot(`no result directory found at ${resultDir}`) }
  }

  const isDeckProjectDir = entries.some(
    (e) => e.isFile() && (e.name === "deck.spec.json" || e.name === "deck.plan.json"),
  )
  if (isDeckProjectDir) {
    try {
      const { ir } = await readDeckDir(resultDir)
      return { ir }
    } catch (e) {
      return { error: relativizeToRepoRoot(`deck project directory failed to assemble: ${(e as Error).message}`) }
    }
  }

  // Bare IR: exactly one *.json file that isn't the self-reported meta.json.
  const candidates = entries
    .filter((e) => e.isFile() && e.name.endsWith(".json") && e.name !== "meta.json")
    .map((e) => e.name)
    .sort()
  if (candidates.length === 0) {
    return {
      error: relativizeToRepoRoot(
        `no artifact found in ${resultDir} — expected a bare IR *.json file or a deck.spec.json project`,
      ),
    }
  }
  if (candidates.length > 1) {
    return {
      error: relativizeToRepoRoot(
        `ambiguous artifact in ${resultDir}: multiple candidate json files (${candidates.join(", ")})`,
      ),
    }
  }

  const filePath = join(resultDir, candidates[0]!)
  let text: string
  try {
    text = await readFile(filePath, "utf8")
  } catch (e) {
    return { error: relativizeToRepoRoot(`cannot read ${filePath}: ${(e as Error).message}`) }
  }
  try {
    return { ir: JSON.parse(text) as unknown }
  } catch (e) {
    return { error: relativizeToRepoRoot(`malformed JSON in ${filePath}: ${(e as Error).message}`) }
  }
}

/** Optional self-reported run stats — absent, unparseable, or wrong-shaped
 *  reads as "no self-reported meta" rather than a scoring failure (it is
 *  pass-through only, never scored, per the README's own schema note). */
async function loadSelfReportedMeta(resultDir: string): Promise<SelfReportedMeta | undefined> {
  let text: string
  try {
    text = await readFile(join(resultDir, "meta.json"), "utf8")
  } catch {
    return undefined
  }
  try {
    const parsed = JSON.parse(text) as unknown
    if (typeof parsed !== "object" || parsed === null) return undefined
    const { tokens, duration_seconds, model } = parsed as Record<string, unknown>
    const out: SelfReportedMeta = {}
    if (typeof tokens === "number") out.tokens = tokens
    if (typeof duration_seconds === "number") out.duration_seconds = duration_seconds
    if (typeof model === "string") out.model = model
    return out
  } catch {
    return undefined
  }
}

// ── coverage (reporting only, never scored — see file header) ──

function extractComponentTypes(rawIr: unknown): Set<string> {
  const types = new Set<string>()
  try {
    const slides = (rawIr as { slides?: unknown })?.slides
    if (!Array.isArray(slides)) return types
    for (const slide of slides) {
      const components = (slide as { components?: unknown })?.components
      if (!Array.isArray(components)) continue
      for (const component of components) {
        const t = (component as { type?: unknown })?.type
        if (typeof t === "string") types.add(t)
      }
    }
  } catch {
    // best-effort — coverage is descriptive reporting, never allowed to
    // crash the run over a malformed artifact validateIr will flag anyway.
  }
  return types
}

function computeCoverageHits(rawIr: unknown, expects: string[]): string[] {
  const present = extractComponentTypes(rawIr)
  return expects.filter((c) => present.has(c))
}

// ── determinism: byte-for-byte pptx comparison ──

/**
 * Every zip part's decompressed content, hashed together in sorted-path
 * order — except `docProps/core.xml`, the one known clock-dependent part
 * (pptxgenjs bakes `new Date().toISOString()` into it on every call; same
 * exclusion `normalizedZipMap` in `src/pptx/generate-notes-export.test.ts`
 * establishes). Reads every entry as a binary buffer (`"nodebuffer"`, not
 * `"string"`) so an embedded binary image asset is hashed correctly rather
 * than corrupted by a UTF-8 decode — a real risk this benchmark's
 * image-deck questions actually exercise, unlike the all-text fixture the
 * existing precedent was written against. This is a genuine byte
 * comparison: `score.test.ts`'s "normalizedPptxSha1" suite proves both that
 * a docProps/core.xml-only difference is ignored and that a one-byte change
 * anywhere else (text or binary) changes the hash.
 */
export async function normalizedPptxSha1(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  const paths = Object.keys(zip.files)
    .filter((p) => !zip.files[p]!.dir && p !== "docProps/core.xml")
    .sort()
  const hash = createHash("sha1")
  for (const p of paths) {
    const buf = await zip.files[p]!.async("nodebuffer")
    hash.update(p)
    hash.update(" ")
    hash.update(buf)
  }
  return hash.digest("hex")
}

// ── local asset resolution (defect H, 2026-07-20 bench-driven fixes wave) ──

/**
 * Loose shape check for "`ir` has an `assets.images` map to resolve" —
 * `rawIr` here is the artifact's parsed-but-not-yet-validated JSON (`unknown`),
 * so this can't just assume `PptxIR`'s shape: a bare IR that omits `assets`
 * entirely (schema-legal — `PptxIRSchema` defaults it) would otherwise crash
 * {@link resolveLocalAssets} on `ir.assets.images` before `generatePptx`'s own
 * validate step ever gets a chance to run. Returning `false` here just skips
 * the resolution attempt and falls through to the unchanged pre-fix behavior
 * (`generatePptx` handles/rejects `rawIr` exactly as it always did) — never a
 * scoring crash either way, "never crash the run" (AGENTS.md).
 */
function hasAssetImages(ir: unknown): ir is { assets: { images: Record<string, { src?: unknown }> } } {
  const assets = (ir as { assets?: unknown } | null)?.assets
  if (typeof assets !== "object" || assets === null) return false
  const images = (assets as { images?: unknown }).images
  return typeof images === "object" && images !== null
}

// ── per-question scoring ──

export async function scoreQuestion(
  qid: string,
  resultDir: string,
  meta: QuestionMeta | undefined,
): Promise<QuestionScore> {
  const expected = meta?.coverage?.expects_components ?? []
  const self = await loadSelfReportedMeta(resultDir)
  const loaded = await loadArtifact(resultDir)

  if ("error" in loaded) {
    return {
      id: qid,
      validatePass: false,
      validateErrorCount: 0,
      auditFindingCount: 0,
      renderOk: false,
      deterministic: null,
      coverageHits: [],
      expectedComponents: expected,
      reason: loaded.error,
      self,
      coverage: meta?.coverage,
    }
  }

  const rawIr = loaded.ir
  const v = validateIr(rawIr)
  const coverageHits = computeCoverageHits(rawIr, expected)

  let auditFindingCount = 0
  if (v.ok) {
    try {
      auditFindingCount = auditDeck(v.ir!).findings.length
    } catch (e) {
      // auditDeck should never throw on a schema-valid IR — guarded anyway,
      // "never crash the run" (AGENTS.md), surfaced as a reason.
      return {
        id: qid,
        validatePass: v.ok,
        validateErrorCount: v.errors.length,
        auditFindingCount: 0,
        renderOk: false,
        deterministic: null,
        coverageHits,
        expectedComponents: expected,
        reason: `audit crashed: ${(e as Error).message}`,
        self,
        coverage: meta?.coverage,
      }
    }
  }

  let renderOk = false
  let deterministic: boolean | null = null
  let renderError: string | undefined
  try {
    // Real CLI semantics (`runRender`, `../../src/cli/commands.ts`): a
    // relative `assets.images[id].src` (e.g. "assets/case.png") resolves
    // against the IR's own directory — `dirname(resolve(irPath))` for a bare
    // IR file, or `readDeckDir`'s own `deckDir` for a deck-project directory
    // (see that function's `DeckDirResult.deckDir` doc comment). Both cases
    // reduce to the same value here: `resultDir` is either the directory the
    // bare IR file lives directly inside, or the exact directory
    // `readDeckDir(resultDir)` was called with above (`loadArtifact`) — so
    // one `resolveLocalAssets(rawIr, resultDir)` call mirrors the CLI for
    // both artifact shapes. Before this fix (defect H, 2026-07-20
    // bench-driven fixes wave), this scorer never called it at all: a
    // relative asset path reached `generatePptx` → `inlinePptxAssets`
    // untouched, which treats anything not already a `data:`/`http(s):` src
    // as a fetch URL — `fetch("assets/case.png")` rejects with "Failed to
    // parse URL", misrecording a renderable artifact as `renderOk: false`.
    // Mutates `rawIr` in place and is idempotent (a resolved src already
    // starts with `data:`, so the second `generatePptx` call below is a
    // no-op here) — matches `resolveLocalAssets`'s own contract, `../../src/cli/load-ir.ts`.
    if (hasAssetImages(rawIr)) await resolveLocalAssets(rawIr as PptxIR, resultDir)
    const bytesA = await generatePptx(rawIr)
    const bytesB = await generatePptx(rawIr)
    renderOk = true
    const [hashA, hashB] = await Promise.all([normalizedPptxSha1(bytesA), normalizedPptxSha1(bytesB)])
    deterministic = hashA === hashB
  } catch (e) {
    renderError = (e as Error).message
  }

  return {
    id: qid,
    validatePass: v.ok,
    validateErrorCount: v.errors.length,
    auditFindingCount,
    renderOk,
    deterministic,
    coverageHits,
    expectedComponents: expected,
    renderError,
    self,
    coverage: meta?.coverage,
  }
}

// ── model / question-bank walking ──

export async function loadQuestionMetas(questionsDir: string): Promise<QuestionMeta[]> {
  let ids: string[]
  try {
    ids = (await readdir(questionsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
  const metas: QuestionMeta[] = []
  for (const id of ids) {
    try {
      const text = await readFile(join(questionsDir, id, "meta.json"), "utf8")
      metas.push(JSON.parse(text) as QuestionMeta)
    } catch {
      // A question directory with no readable meta.json is a question-bank
      // integrity problem, not a scorer crash — score it with empty
      // coverage so it still shows up in the report as "not attempted" for
      // every model rather than silently vanishing from the walk.
      metas.push({ id })
    }
  }
  return metas
}

export async function listModelTags(resultsDir: string): Promise<string[]> {
  try {
    return (await readdir(resultsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

export async function scoreModel(
  modelTag: string,
  modelDir: string,
  questionMetas: QuestionMeta[],
): Promise<ModelReport> {
  const scores: QuestionScore[] = []
  for (const meta of questionMetas) {
    scores.push(await scoreQuestion(meta.id, join(modelDir, meta.id), meta))
  }
  return { modelTag, scores }
}

// ── aggregates ──

interface Aggregates {
  total: number
  validatePassRate: number
  meanValidateErrorCount: number
  meanAuditFindingCount: number
  renderPassRate: number
  /** Over renderOk questions only — the denominator that can be evaluated. */
  determinismRate: number
  /** Reporting only, never scored — see file header. */
  coverageHitRate: number
}

function computeAggregates(scores: QuestionScore[]): Aggregates {
  const total = scores.length
  const validatePassCount = scores.filter((s) => s.validatePass).length
  const renderOkScores = scores.filter((s) => s.renderOk)
  const determinismEligible = renderOkScores.filter((s) => s.deterministic !== null)
  const determinismPassCount = determinismEligible.filter((s) => s.deterministic === true).length
  const totalExpected = scores.reduce((n, s) => n + s.expectedComponents.length, 0)
  const totalHits = scores.reduce((n, s) => n + s.coverageHits.length, 0)
  return {
    total,
    validatePassRate: total === 0 ? 0 : validatePassCount / total,
    meanValidateErrorCount: total === 0 ? 0 : scores.reduce((n, s) => n + s.validateErrorCount, 0) / total,
    meanAuditFindingCount: total === 0 ? 0 : scores.reduce((n, s) => n + s.auditFindingCount, 0) / total,
    renderPassRate: total === 0 ? 0 : renderOkScores.length / total,
    determinismRate: determinismEligible.length === 0 ? 0 : determinismPassCount / determinismEligible.length,
    coverageHitRate: totalExpected === 0 ? 0 : totalHits / totalExpected,
  }
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

/** Markdown table cell escape — pipes and newlines are the only characters
 *  that can break a GFM table row (a `renderError` from a validate-error
 *  list, `formatIssues`'s output, is genuinely multi-line). */
function mdCell(value: string | number | boolean | undefined): string {
  if (value === undefined) return ""
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ⏎ ")
}

// ── report rendering (no timestamps — reproducibility, AGENTS.md) ──

export function renderModelReport(modelTag: string, scores: QuestionScore[]): string {
  const agg = computeAggregates(scores)
  const lines: string[] = []
  lines.push(`# pptfast benchmark report — ${modelTag}`)
  lines.push("")
  lines.push(
    "Mechanical scoring only — no subjective quality dimension. See `tests/bench/README.md` for the run protocol and " +
      "`tests/bench/score.mts` for the exact metric definitions.",
  )
  lines.push("")
  lines.push(
    "| id | strategy | pacing | workflow | validatePass | validateErrors | auditFindings | renderOk | deterministic | coverageHits | tokens | duration_s | notes |",
  )
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
  for (const s of scores) {
    const notes = [s.reason, s.renderError].filter((x): x is string => !!x).join(" / ")
    lines.push(
      `| ${mdCell(s.id)} | ${mdCell(s.coverage?.strategy)} | ${mdCell(s.coverage?.pacing)} | ${mdCell(s.coverage?.workflow)} | ` +
        `${s.validatePass} | ${s.validateErrorCount} | ${s.auditFindingCount} | ${s.renderOk} | ` +
        `${s.deterministic === null ? "n/a" : s.deterministic} | ${mdCell(s.coverageHits.join(", "))} | ` +
        `${mdCell(s.self?.tokens)} | ${mdCell(s.self?.duration_seconds)} | ${mdCell(notes)} |`,
    )
  }
  lines.push("")
  lines.push("## Aggregates")
  lines.push("")
  lines.push(`- questions scored: ${agg.total}`)
  lines.push(
    `- validate first-pass rate: ${pct(agg.validatePassRate)} (mean ${agg.meanValidateErrorCount.toFixed(2)} errors/question)`,
  )
  lines.push(`- mean audit findings: ${agg.meanAuditFindingCount.toFixed(2)}`)
  lines.push(`- render success rate: ${pct(agg.renderPassRate)}`)
  lines.push(`- determinism rate (of successful renders): ${pct(agg.determinismRate)}`)
  lines.push(`- coverage hit rate (reporting only, never scored): ${pct(agg.coverageHitRate)}`)
  lines.push("")
  return lines.join("\n")
}

export function renderSummaryReport(reports: ModelReport[]): string {
  const lines: string[] = []
  lines.push("# pptfast benchmark — cross-model summary")
  lines.push("")
  lines.push(
    "One row per model. Mechanical scoring only — see `tests/bench/README.md`. Per-question detail lives in each " +
      "model's own `report.md`.",
  )
  lines.push("")
  lines.push(
    "| model | questions | validate pass rate | mean audit findings | render pass rate | determinism rate | coverage hit rate |",
  )
  lines.push("|---|---|---|---|---|---|---|")
  const sorted = [...reports].sort((a, b) => a.modelTag.localeCompare(b.modelTag))
  for (const r of sorted) {
    const agg = computeAggregates(r.scores)
    lines.push(
      `| ${mdCell(r.modelTag)} | ${agg.total} | ${pct(agg.validatePassRate)} | ${agg.meanAuditFindingCount.toFixed(2)} | ` +
        `${pct(agg.renderPassRate)} | ${pct(agg.determinismRate)} | ${pct(agg.coverageHitRate)} |`,
    )
  }
  lines.push("")
  return lines.join("\n")
}

// ── orchestration ──

export interface ReportWrite {
  path: string
  content: string
}

export interface ScoringRun {
  reports: ModelReport[]
  writes: ReportWrite[]
}

/**
 * Pure read: scores every model found under `resultsDir` against every
 * question found under `questionsDir` and returns the report content that
 * would be written, without touching disk. Kept side-effect-free
 * deliberately — `score.test.ts` calls this directly against
 * `tests/bench/fixtures/` to assert on report shape and to double-run it for the
 * scorer-reproducibility byte assertion, neither of which should leave
 * generated files inside a checked-in fixtures tree.
 */
export async function runScoring(questionsDir: string, resultsDir: string): Promise<ScoringRun> {
  const questionMetas = await loadQuestionMetas(questionsDir)
  const modelTags = await listModelTags(resultsDir)
  const reports: ModelReport[] = []
  for (const modelTag of modelTags) {
    reports.push(await scoreModel(modelTag, join(resultsDir, modelTag), questionMetas))
  }
  const writes: ReportWrite[] = reports.map((report) => ({
    path: join(resultsDir, report.modelTag, "report.md"),
    content: renderModelReport(report.modelTag, report.scores),
  }))
  if (reports.length > 0) {
    writes.push({ path: join(resultsDir, "summary.md"), content: renderSummaryReport(reports) })
  }
  return { reports, writes }
}

// ── CLI entry ──

async function main(): Promise<void> {
  const questionsDir = resolve(process.argv[2] ?? "tests/bench/questions")
  const resultsDir = resolve(process.argv[3] ?? "tests/bench/results")
  const { reports, writes } = await runScoring(questionsDir, resultsDir)

  if (reports.length === 0) {
    console.log(`no model result directories found under ${resultsDir} — nothing to score`)
    return
  }

  for (const w of writes) {
    await writeFile(w.path, w.content, "utf8")
    console.log(`wrote ${w.path}`)
  }
  for (const r of reports) {
    const agg = computeAggregates(r.scores)
    console.log(
      `${r.modelTag}: ${r.scores.length} questions — validate ${pct(agg.validatePassRate)}, ` +
        `render ${pct(agg.renderPassRate)}, determinism ${pct(agg.determinismRate)}`,
    )
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
