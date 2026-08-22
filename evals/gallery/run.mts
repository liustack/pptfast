/**
 * `pnpm evals:gallery`: L1 geometry plus optional L2 vision audit.
 *
 * Default is incremental: render (or --from), diff hashes.json, audit
 * changed ∪ added. Live corpus findings are reported, not a process failure.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { listThemes } from "@/api"
import { findOnPath } from "@/cli/image-generators"
import { installNodePlatform } from "@/platform/node"
import { HELP, parseEvalArgs } from "./args"
import { corpusAssets, type CorpusAssets } from "./corpus/decks"
import { LANGUAGE_IDS, LEXICONS, type LanguageId } from "./corpus/lexicon"
import { diffAffectedPages, hashesFromManifest, loadGoldHashes } from "./hashes"
import { auditL1 } from "./l1"
import { judgeL2, l2SkipReason, VERDICT_SCHEMA_NAME } from "./l2"
import type { GalleryPageMeta, L2Verdict } from "./l2"
import { buildMatrix } from "./matrix"
import { renderMatrix, type Manifest, type ManifestPage } from "./render"

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)))
const VERDICTS_DIR = join(ROOT, "evals/gallery/verdicts")

function runId(): string {
  const iso = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")
  const rand = Math.random().toString(36).slice(2, 8)
  return `${iso}-${rand}`
}

function loadFromGallery(dir: string): { manifest: Manifest; svgs: Map<string, string> } {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Manifest
  const svgs = new Map<string, string>()
  for (const page of manifest.pages) {
    if (!page.file) continue
    svgs.set(page.id, readFileSync(join(dir, page.file), "utf8"))
  }
  return { manifest, svgs }
}

function metaOf(page: ManifestPage): GalleryPageMeta {
  return {
    id: page.id,
    table: page.table,
    subject: page.subject,
    language: page.language,
    theme: page.theme,
    page: page.page,
  }
}

function mergeVerdict(page: ManifestPage, l1: ReturnType<typeof auditL1>, l2: L2Verdict | undefined) {
  if (l2) {
    return {
      ...l2,
      findings: [...new Set([...l1.findings.map((f) => f.code), ...l2.findings])],
    }
  }
  return {
    id: page.id,
    table: page.table,
    subject: page.subject,
    language: page.language,
    theme: page.theme,
    page: page.page,
    verdict: l1.findings.length > 0 ? "rework" : "pass",
    note: l1.findings.map((f) => f.message).join(" ") || "",
    findings: l1.findings.map((f) => f.code),
    source: "l1" as const,
  }
}

async function main(): Promise<void> {
  const args = parseEvalArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP)
    return
  }

  await installNodePlatform()

  let manifest: Manifest
  let svgs: Map<string, string>
  if (args.from) {
    const loaded = loadFromGallery(resolve(args.from))
    manifest = loaded.manifest
    svgs = loaded.svgs
  } else {
    const themeIds = listThemes()
      .map((t) => t.id)
      .sort()
    const assets = Object.fromEntries(
      await Promise.all(LANGUAGE_IDS.map(async (id) => [id, await corpusAssets(LEXICONS[id])] as const)),
    ) as Record<LanguageId, CorpusAssets>
    const jobs = buildMatrix(themeIds, assets)
    const outDir = mkdtempSync(join(tmpdir(), "pptfast-evals-gallery-"))
    const rendered = renderMatrix(jobs, outDir, "eval")
    manifest = rendered.manifest
    svgs = new Map(rendered.svgs)
  }

  const current = hashesFromManifest(manifest)
  const gold = loadGoldHashes()
  const affected = diffAffectedPages(gold, current)

  let selected: ManifestPage[]
  let mode: "incremental" | "full" | "pages"
  if (args.pages) {
    mode = "pages"
    const want = new Set(args.pages)
    selected = manifest.pages.filter((p) => want.has(p.id) && svgs.has(p.id))
    const missing = args.pages.filter((id) => !svgs.has(id))
    if (missing.length > 0) console.log(`evals:gallery: missing pages: ${missing.join(", ")}`)
  } else if (args.full) {
    mode = "full"
    selected = manifest.pages.filter((p) => svgs.has(p.id))
  } else {
    mode = "incremental"
    const want = new Set([...affected.changed, ...affected.added])
    selected = manifest.pages.filter((p) => want.has(p.id) && svgs.has(p.id))
  }

  const grokBin = await findOnPath("grok", process.env)
  const skip = l2SkipReason({
    ci: process.env.CI === "true",
    l1Only: args.l1Only,
    grokBin,
  })
  if (skip) console.log(`evals:gallery: skipping L2 (${skip})`)
  else console.log(`evals:gallery: L2 via ${grokBin}`)

  console.log(`evals:gallery: auditing ${selected.length} page(s) (${mode})`)

  const verdicts = []
  for (const page of selected) {
    const svg = svgs.get(page.id)!
    const l1 = auditL1(svg)
    let l2: L2Verdict | undefined
    if (!skip && grokBin) {
      l2 = await judgeL2({ svg, page: metaOf(page), l1, grokBin })
    }
    verdicts.push(mergeVerdict(page, l1, l2))
  }

  const id = runId()
  const outPath = resolve(args.out || join(VERDICTS_DIR, `${id}.json`))
  mkdirSync(dirname(outPath), { recursive: true })
  const payload = {
    schema: VERDICT_SCHEMA_NAME,
    runId: id,
    generatedAt: new Date().toISOString(),
    mode,
    l2: skip ? { ran: false, skipReason: skip } : { ran: true },
    affected,
    total: verdicts.length,
    verdicts,
  }
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`)
  const rework = verdicts.filter((v) => v.verdict === "rework").length
  const limit = verdicts.filter((v) => v.verdict === "limit").length
  console.log(`evals:gallery: ${verdicts.length} verdicts (${rework} rework, ${limit} limit)`)
  console.log(`evals:gallery: wrote ${outPath}`)
}

await main()
