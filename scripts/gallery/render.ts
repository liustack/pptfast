/**
 * Runs the matrix through the real render chain and writes the page files
 * plus `manifest.json`.
 *
 * "Real render chain" is load-bearing, not a nicety. The promotional images
 * for this project are meant to be taken from whatever passes review here,
 * so the moment these pages come from a simplified or prettified path, both
 * the review conclusions and the promotional images stop meaning anything.
 * Hence: `validateIr` then `renderSlideSvg`, the same two calls the CLI's
 * own `render`/`preview` make, with no gallery-specific rendering branch
 * anywhere.
 *
 * A page that fails to render is recorded as a skipped entry carrying its
 * error, never dropped. A silent gap in a coverage table is how a review
 * ends up signing off on something nobody saw.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { renderSlideSvg, validateIr } from "@/api"
import { CANVAS_H_PX, CANVAS_W_PX } from "@/constants"
import { auditDeck } from "@/svg/audit/deck-audit"
import type { Job, TableId } from "./matrix"

export interface ManifestPage {
  readonly id: string
  readonly table: TableId
  readonly subject: string
  readonly language: string
  readonly languageLabel: string
  readonly theme: string
  readonly page: number
  readonly pageCount: number
  readonly slideType: string
  readonly heading: string
  /** Path to this page's SVG, relative to the manifest. Absent when skipped. */
  readonly file?: string
  readonly width: number
  readonly height: number
  /** Set when the page could not be produced — the reason is shown in the gallery. */
  readonly skipped?: string
  /**
   * What the deterministic auditor already knows about this page.
   *
   * Carried into the gallery so a human pass is spent on taste rather than
   * on re-deriving things the machine measured better — nobody should be
   * eyeballing a contrast ratio. The first review round produced several
   * notes the auditor could have supplied verbatim.
   */
  readonly findings?: readonly { code: string; message: string }[]
  /**
   * Fingerprint of this page's rendered markup.
   *
   * Verdicts are keyed by page id and persist across runs, which is what
   * lets a review span several sittings. The cost is that a page whose
   * defect has since been fixed keeps its old "rework" and its old note,
   * and nothing said so — the 2026-08-16 round handed back eight verdicts
   * describing bugs that had already been fixed, and reading them cost a
   * full round of re-diagnosis before the pages themselves were checked.
   * Comparing this against the hash recorded alongside the verdict is what
   * tells a live judgement from a stale one.
   */
  readonly hash: string
}

export interface ManifestTable {
  readonly id: TableId
  readonly label: string
  readonly question: string
  readonly pages: readonly string[]
}

export interface Manifest {
  readonly manifestVersion: 1
  readonly generator: string
  readonly pptfastVersion: string
  readonly generatedAt: string
  readonly slide: { readonly width: number; readonly height: number }
  readonly tables: readonly ManifestTable[]
  readonly pages: readonly ManifestPage[]
}

const TABLE_META: Record<TableId, { label: string; question: string }> = {
  theme: {
    label: "主题表",
    question: "同一套九页 deck 跑遍每个主题——这个主题好不好看？",
  },
  layout: {
    label: "版式表",
    question: "固定基准主题，每个版式一页，三种语料各跑一遍——这个版式在真实内容下站不站得住？",
  },
  component: {
    label: "组件表",
    question: "固定基准主题，每个组件一页，三种语料各跑一遍——这个组件画出来能不能看？",
  },
}

export interface RenderResult {
  readonly manifest: Manifest
  /** Page id → SVG markup, kept in memory for the HTML builder to inline. */
  readonly svgs: ReadonlyMap<string, string>
}

/** Small, stable, non-cryptographic fingerprint — this detects change, not tampering. */
function fingerprint(markup: string): string {
  let h = 2166136261
  for (let i = 0; i < markup.length; i++) {
    h ^= markup.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export function renderMatrix(jobs: readonly Job[], outDir: string, pptfastVersion: string): RenderResult {
  const pagesDir = join(outDir, "pages")
  mkdirSync(pagesDir, { recursive: true })

  const pages: ManifestPage[] = []
  const svgs = new Map<string, string>()
  const auditCache = new Map<unknown, Map<number, { code: string; message: string }[]>>()
  const auditErrors: string[] = []

  for (const job of jobs) {
    const base: Omit<ManifestPage, "file" | "skipped" | "hash"> = {
      id: job.id,
      table: job.table,
      subject: job.subject,
      language: job.language,
      languageLabel: job.languageLabel,
      theme: job.theme,
      page: job.page,
      pageCount: job.pageCount,
      slideType: job.slideType,
      heading: job.heading,
      width: CANVAS_W_PX,
      height: CANVAS_H_PX,
    }

    // Validate through the public entry point, exactly as the CLI does — a
    // corpus page that the product would reject must not reach the review
    // as if it were a legitimate render.
    const v = validateIr(job.ir)
    if (!v.ok) {
      pages.push({ ...base, hash: "", skipped: `IR rejected: ${v.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}` })
      continue
    }

    let svg: string
    try {
      svg = renderSlideSvg(v.ir!, job.slideIndex)
    } catch (error) {
      pages.push({ ...base, hash: "", skipped: `render threw: ${error instanceof Error ? error.message : String(error)}` })
      continue
    }

    const file = `pages/${job.id}.svg`
    writeFileSync(join(outDir, file), svg, "utf8")
    svgs.set(job.id, svg)

    // `auditDeck` works per deck, so audit each one once and index its
    // findings by page rather than re-auditing for every slide.
    let deckFindings = auditCache.get(job.ir)
    if (!deckFindings) {
      deckFindings = new Map<number, { code: string; message: string }[]>()
      try {
        for (const f of auditDeck(v.ir!).findings) {
          const list = deckFindings.get(f.page) ?? []
          list.push({ code: f.code, message: f.message })
          deckFindings.set(f.page, list)
        }
      } catch (error) {
        // An auditor failure must not cost the reviewer the page itself —
        // but it must not pass for a clean bill of health either. A silently
        // empty findings column is worse than none at all, because it reads
        // as "the machine checked and found nothing".
        auditErrors.push(`${job.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
      auditCache.set(job.ir, deckFindings)
    }
    const findings = deckFindings.get(job.slideIndex + 1) ?? []

    pages.push({ ...base, file, hash: fingerprint(svg), ...(findings.length > 0 ? { findings } : {}) })
  }

  const tables: ManifestTable[] = (["theme", "layout", "component"] as const)
    .map((id) => ({
      id,
      label: TABLE_META[id].label,
      question: TABLE_META[id].question,
      pages: pages.filter((p) => p.table === id).map((p) => p.id),
    }))
    .filter((t) => t.pages.length > 0)

  const manifest: Manifest = {
    manifestVersion: 1,
    generator: "pptfast gallery",
    pptfastVersion,
    generatedAt: new Date().toISOString(),
    slide: { width: CANVAS_W_PX, height: CANVAS_H_PX },
    tables,
    pages,
  }

  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")

  if (auditErrors.length > 0) {
    throw new Error(
      `the deck auditor failed on ${auditErrors.length} page(s), so the gallery's findings column would be misleadingly empty:\n  ${auditErrors.slice(0, 5).join("\n  ")}`,
    )
  }

  return { manifest, svgs }
}
