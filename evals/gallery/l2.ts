/**
 * L2 gallery audit: grok vision against the Chinese rubric, after L1.
 * ProcessRunner is injectable so unit tests never spawn grok.
 */

import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultProcessRunner } from "@/cli/image-generators"
import type { ProcessRunner } from "@/cli/image-generators"
import type { L1Result } from "./l1"
import { maybePlaywrightPng, rasterSvgToPng } from "./raster"

export const VERDICT_SCHEMA_NAME = "pptfast-gallery-verdicts/3"

export const L2_JSON_SCHEMA = {
  type: "object",
  additionalProperties: true,
  required: ["id", "table", "subject", "language", "theme", "page", "verdict", "note", "findings"],
  properties: {
    id: { type: "string" },
    table: { type: "string" },
    subject: { type: "string" },
    language: { type: "string" },
    theme: { type: "string" },
    page: { type: "number" },
    verdict: { type: "string", enum: ["pass", "limit", "rework"] },
    note: { type: "string" },
    findings: { type: "array", items: { type: "string" } },
    source: { type: "string" },
    confidence: { type: "number" },
    rubricHits: { type: "array", items: { type: "string" } },
  },
} as const

export interface GalleryPageMeta {
  id: string
  table: string
  subject: string
  language: string
  theme: string
  page: number
}

export interface L2Verdict extends GalleryPageMeta {
  verdict: "pass" | "limit" | "rework"
  note: string
  findings: string[]
  source: "l2"
  confidence?: number
  rubricHits?: string[]
  playwrightSkip?: string
}

const DEFAULT_RUBRIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "rubric")
const GROK_TIMEOUT_MS = 180_000
const CROWDED = new Set(["overflow", "overlap"])

export function l2SkipReason(opts: { ci: boolean; l1Only: boolean; grokBin: string | null }): string | null {
  if (opts.ci) return "CI=true"
  if (opts.l1Only) return "--l1-only"
  if (!opts.grokBin) return "grok not on PATH"
  return null
}

function copyRubric(srcDir: string, destDir: string): string[] {
  mkdirSync(destDir, { recursive: true })
  const names = readdirSync(srcDir).filter((f) => f.endsWith(".md"))
  for (const name of names) copyFileSync(join(srcDir, name), join(destDir, name))
  return names
}

function buildPrompt(page: GalleryPageMeta, l1: L1Result, rubricFiles: string[], hasBrowserPng: boolean): string {
  const l1Lines =
    l1.findings.length === 0
      ? "L1 reported no geometry findings."
      : `L1 findings:\n${l1.findings.map((f) => `- ${f.code}: ${f.message}`).join("\n")}`
  return [
    "You are auditing one pptfast gallery slide against a written rubric.",
    "Read page.png in this working directory.",
    hasBrowserPng ? "Also read page-browser.png (a real-browser screenshot of the same SVG)." : "",
    `Read every markdown file in rubric/ (${rubricFiles.join(", ")}). Rules are in Chinese. Decide in structured JSON.`,
    `Page id: ${page.id}`,
    `table=${page.table} subject=${page.subject} language=${page.language} theme=${page.theme} page=${page.page}`,
    l1Lines,
    "verdict must be pass, limit, or rework.",
    "Hit = rework or limit. Use rework when a rubric rule is clearly broken.",
    "Use limit when the page is suspicious but not a clear break.",
    "findings: short English codes (taboo, gravity, text, breathing, theme-independence, or L1 codes).",
    "note: one or two sentences naming the broken rule.",
    'source must be "l2". Extra fields confidence and rubricHits are allowed.',
  ]
    .filter(Boolean)
    .join("\n")
}

function asVerdict(value: unknown, fallback: GalleryPageMeta): L2Verdict | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  const verdict = v.verdict
  if (verdict === "pass" || verdict === "limit" || verdict === "rework") {
    const findings = Array.isArray(v.findings) ? v.findings.map((x) => String(x)) : []
    const out: L2Verdict = {
      id: String(v.id ?? fallback.id),
      table: String(v.table ?? fallback.table),
      subject: String(v.subject ?? fallback.subject),
      language: String(v.language ?? fallback.language),
      theme: String(v.theme ?? fallback.theme),
      page: typeof v.page === "number" ? v.page : fallback.page,
      verdict,
      note: String(v.note ?? ""),
      findings,
      source: "l2",
    }
    if (typeof v.confidence === "number") out.confidence = v.confidence
    if (Array.isArray(v.rubricHits)) out.rubricHits = v.rubricHits.map((x) => String(x))
    return out
  }
  for (const key of ["result", "output", "data", "message"]) {
    const inner = v[key]
    if (typeof inner === "string") {
      try {
        return asVerdict(JSON.parse(inner), fallback)
      } catch {
        // not JSON
      }
    } else {
      const hit = asVerdict(inner, fallback)
      if (hit) return hit
    }
  }
  return null
}

export function parseL2Stdout(stdout: string, fallback: GalleryPageMeta): L2Verdict {
  const trimmed = stdout.trim()
  const attempts: unknown[] = []
  try {
    attempts.push(JSON.parse(trimmed))
  } catch {
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        attempts.push(JSON.parse(trimmed.slice(start, end + 1)))
      } catch {
        // fall through
      }
    }
  }
  for (const a of attempts) {
    const hit = asVerdict(a, fallback)
    if (hit) return hit
  }
  throw new Error(`L2 grok returned no verdict JSON: ${trimmed.slice(0, 400)}`)
}

export interface JudgeL2Input {
  svg: string
  page: GalleryPageMeta
  l1: L1Result
  workdir?: string
  run?: ProcessRunner
  grokBin?: string
  rubricDir?: string
}

export async function judgeL2(input: JudgeL2Input): Promise<L2Verdict> {
  const workdir = input.workdir ?? mkdtempSync(join(tmpdir(), "pptfast-l2-"))
  const rubricDir = input.rubricDir ?? DEFAULT_RUBRIC_DIR
  const run = input.run ?? defaultProcessRunner
  const grokBin = input.grokBin ?? "grok"

  mkdirSync(workdir, { recursive: true })
  const png = await rasterSvgToPng(input.svg)
  writeFileSync(join(workdir, "page.png"), png)

  let playwrightSkip: string | undefined
  const crowded = input.l1.findings.some((f) => CROWDED.has(f.code))
  if (crowded) {
    const browser = await maybePlaywrightPng(input.svg)
    if (browser.png) writeFileSync(join(workdir, "page-browser.png"), browser.png)
    else playwrightSkip = browser.skipReason
  }

  const rubricFiles = copyRubric(rubricDir, join(workdir, "rubric"))
  const prompt = buildPrompt(input.page, input.l1, rubricFiles, crowded && !playwrightSkip)
  const result = await run({
    command: grokBin,
    args: [
      "-p",
      prompt,
      "--cwd",
      workdir,
      "--permission-mode",
      "bypassPermissions",
      "--max-turns",
      "8",
      "--json-schema",
      JSON.stringify(L2_JSON_SCHEMA),
    ],
    cwd: workdir,
    timeoutMs: GROK_TIMEOUT_MS,
  })
  if (result.code !== 0) {
    throw new Error(`grok exited ${result.code}: ${(result.stderr || result.stdout).trim().slice(0, 400)}`)
  }
  const verdict = parseL2Stdout(result.stdout, input.page)
  if (playwrightSkip) verdict.playwrightSkip = playwrightSkip
  return verdict
}
