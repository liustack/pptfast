/**
 * `pnpm gallery --bbox` — the real-geometry pass over the pages the gallery
 * just rendered.
 *
 * Every other automated check in this repo measures text with
 * `measureTextUnits`, the same estimator the layout code uses to decide how
 * much text fits a box. That shared source is a blind spot: when the estimate
 * is wrong, the layout and the audit are wrong together and agree with each
 * other. `src/svg/audit/browser-audit.ts` exists to break the tie by asking a
 * real browser for `getBBox()` — it was written for a consumer
 * (`scripts/pptx-browser-audit.mts`) that was never committed, so until now
 * nothing had ever run it against real pages.
 *
 * This is that consumer, attached to the gallery because the gallery already
 * renders the whole corpus through the real chain. It is opt-in: `pnpm check`
 * must never need a browser, so nothing here is imported unless `--bbox` is
 * passed, and Playwright is resolved at runtime rather than declared as a
 * dependency.
 *
 * Two caveats worth knowing before reading a finding:
 *
 * - Results depend on the fonts installed on the machine. A theme asking for
 *   a font this machine does not have gets a substitute with different
 *   metrics, so a finding is evidence about *this* machine's rendering — the
 *   same caveat the PowerPoint output carries.
 * - A designed bleed looks exactly like an overflow from here. Those are
 *   listed in `bbox-exemptions.ts` rather than suppressed by the renderer.
 */

import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { collectBBoxOverflows, serializePageFunction } from "@/svg/audit/browser-audit"
import { namespaceSvgIds, svgIdPrefix } from "@/lib/svg-ids"
import { bleedExemption, DESIGNED_BLEED, type BleedExemption } from "./bbox-exemptions"

/** The page the browser measures against, matching `collectBBoxOverflows`'s own constants. */
const PAGE_W = 1280
const PAGE_H = 720

/**
 * Smallest overflow that can mean anything, in px.
 *
 * `getBBox()` reports the *ink* box — it includes a glyph's side bearings and
 * whatever the rasterizer rounds — while the declared boxes are laid out
 * against advance widths. Sub-pixel disagreement between the two is not a
 * layout defect, and on the 461-page corpus it accounts for eight findings
 * that are all under 1px.
 */
export const DEFAULT_BBOX_FLOOR = 2

/**
 * How much of a line's own width the estimator is allowed to be wrong by
 * before it counts as a defect, and the cap on that allowance.
 *
 * Horizontal overflow is per-glyph error *accumulated along a line*, so it
 * scales with the line, and a flat px threshold reports the same underlying
 * disagreement as clean on a narrow box and as a defect on a wide one. The
 * corpus shows exactly that: a full-width Chinese serif line runs 3px past a
 * 435px column and 6px past a 1088px column — 0.69% and 0.55%, one cause,
 * two numbers.
 *
 * So the horizontal allowance is proportional. The cap keeps it from growing
 * into a blindfold on the widest boxes: 8px on a 1280px canvas is still
 * invisible, and anything past it gets reported whatever its ratio.
 *
 * None of this applies vertically. A baseline that sits too low is not an
 * accumulation of anything, so vertical overflow is judged against the flat
 * floor alone.
 */
const HORIZONTAL_SLACK_RATIO = 0.01
const HORIZONTAL_SLACK_CAP = 8

export type BBoxKind = "h-overflow" | "v-overflow" | "page-overflow"

/** Why a measured overflow is not being reported as a defect. */
export type BBoxVerdict =
  /** Past its box by more than measurement error explains. */
  | "defect"
  /** Inside the ink-versus-advance disagreement — see the slack constants above. */
  | "metric"
  /** `bbox-exemptions.ts` says the design asks for this bleed. */
  | "designed"

export interface BBoxFinding {
  /** Gallery page id — the same key the review page and its verdicts use. */
  readonly page: string
  /** `data-archetype` of the layout that drew the page, or "" for a takeover page. */
  readonly layout: string
  readonly kind: BBoxKind
  /** The text the finding names, as `collectBBoxOverflows` reported it. */
  readonly label: string
  /** The full finding line, measurements included. */
  readonly detail: string
  /** Which axis the ink broke out on — the two are judged differently. */
  readonly axis: "x" | "y"
  /** How far past the boundary the ink reached, in px. */
  readonly overrun: number
  /** The boundary's own size on that axis, so a ratio can be read off the report. */
  readonly extent: number
  readonly verdict: BBoxVerdict
  /** Set on a `designed` verdict — the exemption's rationale. */
  readonly why?: string
}

export interface BBoxReport {
  readonly floor: number
  readonly pagesChecked: number
  /** Text boxes the browser actually returned — see `countMeasured` in the harness. */
  readonly textsMeasured: number
  readonly defects: readonly BBoxFinding[]
  readonly designed: readonly BBoxFinding[]
  readonly metric: readonly BBoxFinding[]
}

/** `data-archetype` is the layout id in the rendered markup (see `full-slide-svg.tsx`). */
export function layoutOf(svg: string): string {
  return /data-archetype="([^"]*)"/.exec(svg)?.[1] ?? ""
}

const KINDS: readonly BBoxKind[] = ["h-overflow", "v-overflow", "page-overflow"]

export interface ParsedIssue {
  readonly kind: BBoxKind
  readonly label: string
  readonly axis: "x" | "y"
  readonly overrun: number
  readonly extent: number
}

/**
 * Turn one `collectBBoxOverflows` line back into measurements.
 *
 * That function builds its lines as `<kind> <label>: <numbers>` and is shipped
 * into the page verbatim, so parsing here is what keeps it that way — teaching
 * it to return structured objects would mean changing a function whose whole
 * contract is that its source survives `.toString()` unmodified.
 *
 * A label containing `": "` (the corpus has some) truncates at the first one.
 * That only affects display and exemption matching, never the numbers: those
 * are read from the tail, which is generated and has a fixed shape.
 */
export function parseIssue(issue: string): ParsedIssue | undefined {
  const kind = KINDS.find((k) => issue.startsWith(`${k} `))
  if (!kind) return undefined
  const rest = issue.slice(kind.length + 1)
  const colon = rest.indexOf(": ")
  const label = colon === -1 ? rest : rest.slice(0, colon)

  if (kind === "h-overflow") {
    const m = /\[(-?[\d.]+),(-?[\d.]+)\] exceeds box x=(-?[\d.]+) w=([\d.]+)$/.exec(rest)
    if (!m) return undefined
    const [left, right, x, w] = m.slice(1).map(Number) as [number, number, number, number]
    return { kind, label, axis: "x", overrun: Math.max(right - (x + w), x - left), extent: w }
  }
  if (kind === "v-overflow") {
    const m = /bottom ([\d.]+) below rect bottom (-?[\d.]+)$/.exec(rest)
    if (!m) return undefined
    const [bottom, limit] = m.slice(1).map(Number) as [number, number]
    return { kind, label, axis: "y", overrun: bottom - limit, extent: PAGE_H }
  }
  const m = /\[(-?[\d.]+),(-?[\d.]+)\] y=\[(-?[\d.]+),(-?[\d.]+)\] outside (\d+)x(\d+)$/.exec(rest)
  if (!m) return undefined
  const [left, right, top, bottom, w, h] = m.slice(1).map(Number) as [number, number, number, number, number, number]
  const overX = Math.max(right - w, -left)
  const overY = Math.max(bottom - h, -top)
  return overX >= overY
    ? { kind, label, axis: "x", overrun: overX, extent: w }
    : { kind, label, axis: "y", overrun: overY, extent: h }
}

/** The overflow this boundary can absorb before it means something — see the slack constants. */
export function slackFor(parsed: Pick<ParsedIssue, "axis" | "extent">, floor: number): number {
  if (parsed.axis === "y") return floor
  return Math.min(HORIZONTAL_SLACK_CAP, Math.max(floor, parsed.extent * HORIZONTAL_SLACK_RATIO))
}

/**
 * A page that does nothing but hold one batch of slides and run the audit
 * over them.
 *
 * The audit function is embedded by `serializePageFunction`, which strips the
 * `__name()` calls esbuild's `keepNames` injects around nested helpers — they
 * reference a Node-scope helper that does not exist here.
 *
 * The browser is asked for everything (`tol` 0) and all judgement happens in
 * Node. Filtering in two places would leave the report unable to say how many
 * findings it dismissed, which is the number that says whether the thresholds
 * are still the right ones.
 */
export function harnessHtml(): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>pptfast bbox audit</title>
<style>html,body{margin:0;padding:0;background:#fff}.pg{width:${PAGE_W}px;height:${PAGE_H}px}</style>
<div id="stage"></div>
<script>
${serializePageFunction(collectBBoxOverflows)}

function auditBatch(batch) {
  var stage = document.getElementById("stage");
  stage.innerHTML = "";
  var mounted = [];
  for (var i = 0; i < batch.length; i++) {
    var holder = document.createElement("div");
    holder.className = "pg";
    holder.innerHTML = batch[i].svg;
    stage.appendChild(holder);
    mounted.push([batch[i].id, holder.querySelector("svg")]);
  }
  // Force layout before measuring: getBBox() on a subtree the browser has not
  // laid out yet reports zeros, which would read as a clean page.
  void stage.getBoundingClientRect();
  var out = [];
  for (var j = 0; j < mounted.length; j++) {
    var root = mounted[j][1];
    out.push({
      id: mounted[j][0],
      issues: root ? collectBBoxOverflows(root, 0) : ["render-lost: no <svg> root"],
      measured: root ? countMeasured(root) : 0
    });
  }
  stage.innerHTML = "";
  return out;
}

// A separate, deliberately dumb count of the text boxes the browser actually
// returned. collectBBoxOverflows skips any <text> whose bbox comes back
// zero-width, so a harness that mounts nothing — or mounts into a subtree with
// no layout — reports a clean sweep rather than an error. This is what tells
// those two apart.
function countMeasured(root) {
  var texts = root.querySelectorAll("text");
  var n = 0;
  for (var i = 0; i < texts.length; i++) {
    try {
      if (texts[i].getBBox().width > 0) n++;
    } catch (e) { /* same swallow collectBBoxOverflows does */ }
  }
  return n;
}
</script>`
}

/**
 * Load Playwright without declaring it.
 *
 * `pnpm check` runs the gallery matrix on every commit and must stay free of
 * browser downloads, so this is resolved when `--bbox` asks for it and not
 * before. A global install works, as does `PPTFAST_PLAYWRIGHT` pointing at
 * one.
 */
async function loadPlaywright(): Promise<any> {
  const specs = [process.env.PPTFAST_PLAYWRIGHT, "playwright", "playwright-core"].filter(Boolean) as string[]
  const tried: string[] = []
  for (const spec of specs) {
    try {
      const mod = await import(spec)
      // Playwright ships CommonJS; imported from ESM its exports land under
      // `default` rather than as named ones.
      return mod?.chromium ? mod : mod?.default
    } catch (error) {
      tried.push(`${spec}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`)
    }
  }
  throw new Error(
    "--bbox needs Playwright, which this repo deliberately does not depend on (`pnpm check` must not pull a browser).\n" +
      "  Install it for this checkout — `pnpm add -D playwright && pnpm exec playwright install chromium` —\n" +
      "  or point PPTFAST_PLAYWRIGHT at an existing install.\n" +
      `  Tried:\n    ${tried.join("\n    ")}`,
  )
}

export interface BBoxOptions {
  readonly floor?: number
  /** Slides per browser batch — bounds how much DOM is alive at once. */
  readonly batchSize?: number
  readonly exemptions?: readonly BleedExemption[]
  readonly log?: (message: string) => void
}

/** Sort the raw issue lines into the three verdicts. Exported for its own test. */
export function classify(
  raw: readonly { id: string; issues: readonly string[] }[],
  layouts: ReadonlyMap<string, string>,
  floor: number,
  exemptions: readonly BleedExemption[],
): Pick<BBoxReport, "defects" | "designed" | "metric"> {
  const defects: BBoxFinding[] = []
  const designed: BBoxFinding[] = []
  const metric: BBoxFinding[] = []

  for (const { id, issues } of raw) {
    for (const issue of issues) {
      const parsed = parseIssue(issue)
      const layout = layouts.get(id) ?? ""
      if (!parsed) {
        // An unparseable line is the harness reporting something that is not
        // an overflow at all (a page whose <svg> never mounted). It has to
        // reach the reader, so it goes in as a defect rather than being
        // dropped for not matching a regex.
        defects.push({
          page: id,
          layout,
          kind: "page-overflow",
          label: issue,
          detail: issue,
          axis: "x",
          overrun: Infinity,
          extent: PAGE_W,
          verdict: "defect",
        })
        continue
      }
      const base = { page: id, layout, ...parsed, detail: issue }
      if (parsed.overrun <= slackFor(parsed, floor)) {
        metric.push({ ...base, verdict: "metric" })
        continue
      }
      const hit = bleedExemption(base, exemptions)
      if (hit) designed.push({ ...base, verdict: "designed", why: hit.why })
      else defects.push({ ...base, verdict: "defect" })
    }
  }
  return { defects, designed, metric }
}

/**
 * Run every rendered page through a real browser and classify what comes out.
 *
 * The SVGs are handed to the page as evaluate arguments rather than baked into
 * the harness, so the harness stays a few KB no matter how large the corpus
 * grows, and ids are namespaced the same way the review page does it
 * (`src/lib/svg-ids.ts`) so slides sharing one document cannot cross-wire.
 */
export async function auditBBoxes(svgs: ReadonlyMap<string, string>, opts: BBoxOptions = {}): Promise<BBoxReport> {
  const floor = opts.floor ?? DEFAULT_BBOX_FLOOR
  const batchSize = opts.batchSize ?? 40
  const exemptions = opts.exemptions ?? DESIGNED_BLEED
  const log = opts.log ?? (() => {})

  const entries = [...svgs]
  const layouts = new Map(entries.map(([id, svg]) => [id, layoutOf(svg)]))
  const batches: { id: string; svg: string }[][] = []
  let seq = 0
  for (let i = 0; i < entries.length; i += batchSize) {
    batches.push(
      entries.slice(i, i + batchSize).map(([id, svg]) => ({ id, svg: namespaceSvgIds(svg, svgIdPrefix(seq++)) })),
    )
  }

  const playwright = await loadPlaywright()
  // `channel: "chrome"` first: this repo's browser target is Chromium 103-class,
  // and a machine with Chromium installed needs no Playwright browser download
  // at all. Bundled Chromium is the fallback.
  let browser: any
  try {
    browser = await playwright.chromium.launch({ channel: "chrome" })
  } catch {
    browser = await playwright.chromium.launch()
  }

  type PageResult = { id: string; issues: string[]; measured: number }
  const raw: PageResult[] = []
  try {
    const page = await browser.newPage({ viewport: { width: PAGE_W, height: PAGE_H } })
    await page.setContent(harnessHtml(), { waitUntil: "load" })
    let done = 0
    for (const batch of batches) {
      const result = (await page.evaluate(
        (b: { id: string; svg: string }[]) => (globalThis as any).auditBatch(b) as PageResult[],
        batch,
      )) as PageResult[]
      raw.push(...result)
      done += batch.length
      log(`gallery: bbox ${done}/${entries.length} pages measured`)
    }
  } finally {
    await browser.close()
  }

  const textsMeasured = raw.reduce((n, r) => n + r.measured, 0)
  if (entries.length > 0 && textsMeasured === 0) {
    // "Found nothing" and "measured nothing" look identical in the output, and
    // the second one silently retires the check. Refuse rather than report a
    // clean sweep this pass did not earn.
    throw new Error(
      `bbox: the browser returned no text geometry for any of ${entries.length} pages — the harness measured nothing, ` +
        "which is a broken pass, not a clean one",
    )
  }

  return { floor, pagesChecked: entries.length, textsMeasured, ...classify(raw, layouts, floor, exemptions) }
}

/** Human-readable summary, grouped by layout so one bad layout reads as one problem. */
export function formatBBoxReport(report: BBoxReport): string {
  const lines: string[] = []
  lines.push(
    `gallery: bbox — ${report.pagesChecked} pages / ${report.textsMeasured} text boxes measured in a real browser`,
  )
  lines.push(
    `gallery: bbox — ${report.metric.length} within measurement slack (${report.floor}px floor, ` +
      `${HORIZONTAL_SLACK_RATIO * 100}% of the box horizontally, ${HORIZONTAL_SLACK_CAP}px cap)`,
  )
  if (report.designed.length > 0) {
    const byWhy = new Map<string, number>()
    for (const f of report.designed) byWhy.set(f.why ?? "", (byWhy.get(f.why ?? "") ?? 0) + 1)
    lines.push(`gallery: bbox — ${report.designed.length} designed bleed(s) skipped:`)
    for (const [why, n] of byWhy) lines.push(`  · ${why} ×${n}`)
  }
  if (report.defects.length === 0) {
    lines.push("gallery: bbox — no unexplained overflows")
    return lines.join("\n")
  }
  lines.push(`gallery: bbox — ${report.defects.length} unexplained overflow(s):`)
  const byLayout = new Map<string, BBoxFinding[]>()
  for (const f of report.defects) {
    const key = f.layout || "(takeover page)"
    const list = byLayout.get(key) ?? []
    list.push(f)
    byLayout.set(key, list)
  }
  for (const [layout, list] of [...byLayout].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`  ${layout} (${list.length})`)
    for (const f of list) lines.push(`    - ${f.page}: +${f.overrun.toFixed(1)}px — ${f.detail}`)
  }
  return lines.join("\n")
}

/** Write the machine-readable half next to the gallery's own manifest. */
export function writeBBoxReport(report: BBoxReport, outDir: string): string {
  const file = join(outDir, "bbox.json")
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return file
}
