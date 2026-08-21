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
   *
   * Kept alongside `fingerprint` so verdicts recorded before the two-part
   * split still have something to compare against — see `verdictFreshness`.
   */
  readonly hash: string
  /** The same page, hashed in two halves. See `splitPaint`. */
  readonly fingerprint: PageFingerprint
}

export interface ManifestTable {
  readonly id: TableId
  readonly label: string
  readonly question: string
  readonly pages: readonly string[]
}

export interface Manifest {
  /**
   * 2 since pages carry `fingerprint` alongside `hash`. A v1 reader still
   * works — the new field is additive and `hash` kept its meaning — but a
   * verdict recorded against a v1 manifest cannot tell a recolor from a
   * redraw, and `verdictFreshness` needs to know which kind it is holding.
   */
  readonly manifestVersion: 2
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
    question: "同一套十页 deck 跑遍每个主题——这个主题好不好看？",
  },
  layout: {
    label: "版式表",
    question:
      "普通版式钉在基准主题上三种语料各跑一遍，稀排版式按有资格的主题展开——这个版式在真实内容下站不站得住？",
  },
  component: {
    label: "组件表",
    question: "固定基准主题，每个组件一页，三种语料各跑一遍——这个组件画出来能不能看？",
  },
  density: {
    label: "满载表",
    question: "九个组件各一页，条目数打满容量上限但不超——这一页是满载、不溢出的状态。",
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

export interface PageFingerprint {
  /** The markup with every paint value blanked — shape, text and type only. */
  readonly geometry: string
  /** Only the paint values, in document order — exactly what the shape half drops. */
  readonly color: string
}

/** A page that never rendered has nothing to fingerprint. */
const EMPTY_FINGERPRINT: PageFingerprint = { geometry: "", color: "" }

/**
 * Attributes that carry paint rather than shape.
 *
 * Deliberately a list of what this renderer actually emits (`fill`, `stroke`,
 * `opacity`, `fill-opacity`, `stroke-opacity`, `stop-color`, plus
 * `data-contrast-tier`, which records which ink a contrast escalation picked)
 * with room for the obvious siblings. `stroke-width`, `stroke-dasharray` and
 * the whole font family stay out of it: a thicker rule moves ink, a redder one
 * does not.
 */
const PAINT_ATTR =
  /(\s)(fill-opacity|stroke-opacity|stop-opacity|flood-opacity|stop-color|flood-color|lighting-color|data-contrast-tier|fill|stroke|opacity|color)="([^"]*)"/g

/**
 * Split one page's markup into a shape half and a paint half.
 *
 * A theme redesign rewrites every color in the corpus and moves no layout,
 * which under a single whole-markup hash invalidated every verdict at once:
 * the 2026-08-19 round came back with seven of thirty judgements marked stale
 * that a human then re-made by hand, all of them about geometry that had not
 * moved. Hashing the two halves separately is what lets a re-run say "only
 * the paint changed" and keep those judgements alive.
 *
 * The attribute *name* stays in the shape half and only its value is blanked,
 * so a recolor that adds paint where there was none still reads as a shape
 * change — it is one.
 *
 * Known limit: this is a string transform over markup, so a slide whose own
 * *text* contains something shaped like `fill="red"` (a code component
 * quoting SVG) has that text counted as paint. Both halves still come from
 * the same bytes, so nothing can read as unchanged when it changed — the
 * worst case is a content edit reported as a recolor.
 */
export function splitPaint(markup: string): PageFingerprint {
  const paint: string[] = []
  const shape = markup.replace(PAINT_ATTR, (_m, space: string, name: string, value: string) => {
    paint.push(`${name}=${value}`)
    return `${space}${name}=""`
  })
  return { geometry: fingerprint(shape), color: fingerprint(paint.join(";")) }
}

/**
 * How much of a recorded verdict still applies to the page as it renders now.
 *
 * Self-contained on purpose: `html.ts` ships this function's own source into
 * the review page instead of restating the rule there, so what the reviewer
 * sees and what is tested here cannot drift apart. No module references, no
 * TS-only constructs — the same discipline `src/svg/audit/browser-audit.ts`
 * documents for its own in-page function.
 *
 * `entry` is a stored verdict, `page` is its manifest entry as rendered now.
 */
export function verdictFreshness(
  entry: { hash?: string; geo?: string; col?: string } | undefined,
  page: { hash?: string; fingerprint?: { geometry: string; color: string } } | undefined,
): "fresh" | "recolored" | "stale" {
  if (!entry || !page) return "fresh"
  const now = page.fingerprint
  // A verdict recorded before the split carries one whole-markup hash and no
  // way to tell a recolor from a redraw. It keeps the old all-or-nothing rule
  // rather than being quietly upgraded to a claim its data cannot support.
  if (!entry.geo || !now || !now.geometry) {
    if (!entry.hash || !page.hash) return "fresh"
    return entry.hash === page.hash ? "fresh" : "stale"
  }
  if (entry.geo !== now.geometry) return "stale"
  return entry.col === now.color ? "fresh" : "recolored"
}

export function renderMatrix(jobs: readonly Job[], outDir: string, pptfastVersion: string): RenderResult {
  const pagesDir = join(outDir, "pages")
  mkdirSync(pagesDir, { recursive: true })

  const pages: ManifestPage[] = []
  const svgs = new Map<string, string>()
  const auditCache = new Map<unknown, Map<number, { code: string; message: string }[]>>()
  const auditErrors: string[] = []

  for (const job of jobs) {
    const base: Omit<ManifestPage, "file" | "skipped" | "hash" | "fingerprint"> = {
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
      pages.push({
        ...base,
        hash: "",
        fingerprint: EMPTY_FINGERPRINT,
        skipped: `IR rejected: ${v.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
      })
      continue
    }

    let svg: string
    try {
      svg = renderSlideSvg(v.ir!, job.slideIndex)
    } catch (error) {
      pages.push({
        ...base,
        hash: "",
        fingerprint: EMPTY_FINGERPRINT,
        skipped: `render threw: ${error instanceof Error ? error.message : String(error)}`,
      })
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

    pages.push({
      ...base,
      file,
      hash: fingerprint(svg),
      fingerprint: splitPaint(svg),
      ...(findings.length > 0 ? { findings } : {}),
    })
  }

  const tables: ManifestTable[] = (["theme", "layout", "component", "density"] as const)
    .map((id) => ({
      id,
      label: TABLE_META[id].label,
      question: TABLE_META[id].question,
      pages: pages.filter((p) => p.table === id).map((p) => p.id),
    }))
    .filter((t) => t.pages.length > 0)

  const manifest: Manifest = {
    manifestVersion: 2,
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
