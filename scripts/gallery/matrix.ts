/**
 * Expands the two review tables into a flat, ordered list of render jobs.
 *
 * Also the place the coverage promise is enforced: if the IR grows a
 * component type or the registry grows a layout and nobody teaches this
 * corpus about it, `assertFullCoverage` throws rather than quietly
 * shipping a gallery that is missing a page. A review that silently skips
 * what it claims to cover is worse than no review, because it produces a
 * sign-off.
 */

import { COMPONENT_TYPES, type PptxIR } from "@/ir"
import { LAYOUT_REGISTRY } from "@/svg/layouts/registry"
import { CHART_VARIANTS, COMPONENT_BUILDERS } from "./corpus/components"
import { BASELINE_THEME, componentPage, layoutPage, themeDeck, type CorpusAssets } from "./corpus/decks"
import { LANGUAGE_IDS, LEXICONS, type LanguageId } from "./corpus/lexicon"

export type TableId = "theme" | "layout" | "component"

export interface Job {
  /** Stable, filename-safe page id — also the key verdicts are recorded against. */
  readonly id: string
  readonly table: TableId
  /** Theme id, layout id, or component label — what this page is here to show. */
  readonly subject: string
  readonly language: LanguageId
  /** Human-readable language name, for the gallery's own chrome. */
  readonly languageLabel: string
  /** Which theme actually rendered — the subject for the theme table, the baseline elsewhere. */
  readonly theme: string
  /** Page position inside its deck (1-based) and the deck's own length. */
  readonly page: number
  readonly pageCount: number
  /** Slide type, so the reviewer can tell a cover from a content page at a glance. */
  readonly slideType: string
  readonly heading: string
  readonly ir: PptxIR
  readonly slideIndex: number
}

function safe(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export interface MatrixOptions {
  /** Languages for the layout and component tables. */
  readonly languages?: readonly LanguageId[]
  /**
   * Language for the theme table. The source issue attaches the
   * three-script requirement to layouts and components, not to themes —
   * a theme is judged once, on one coherent body of text, so that two
   * themes differ by exactly one variable.
   */
  readonly themeLanguage?: LanguageId
  /** Restrict to one table — for a quick pass over just what changed. */
  readonly only?: TableId
}

/** Themes the gallery renders, in registry order. */
export function galleryThemes(listThemeIds: readonly string[]): readonly string[] {
  return [...listThemeIds].sort()
}

export function buildMatrix(
  themeIds: readonly string[],
  assets: Readonly<Record<LanguageId, CorpusAssets>>,
  opts: MatrixOptions = {},
): Job[] {
  const languages = opts.languages ?? LANGUAGE_IDS
  const themeLanguage = opts.themeLanguage ?? "zh"
  const jobs: Job[] = []

  const push = (job: Omit<Job, "languageLabel">) => {
    jobs.push({ ...job, languageLabel: LEXICONS[job.language].display })
  }

  // ── Theme table ────────────────────────────────────────────────────────
  if (!opts.only || opts.only === "theme") {
    const lex = LEXICONS[themeLanguage]
    for (const themeId of themeIds) {
      const ir = themeDeck(themeId, lex, assets[themeLanguage])
      ir.slides.forEach((slide, i) => {
        push({
          id: `theme--${safe(themeId)}--${themeLanguage}--p${String(i + 1).padStart(2, "0")}`,
          table: "theme",
          subject: themeId,
          language: themeLanguage,
          theme: themeId,
          page: i + 1,
          pageCount: ir.slides.length,
          slideType: slide.type ?? "content",
          heading: slide.heading ?? "",
          ir,
          slideIndex: i,
        })
      })
    }
  }

  // ── Layout table ───────────────────────────────────────────────────────
  if (!opts.only || opts.only === "layout") {
    for (const layoutId of Object.keys(LAYOUT_REGISTRY).sort()) {
      for (const language of languages) {
        const lex = LEXICONS[language]
        const ir = layoutPage(layoutId, lex, assets[language])
        push({
          id: `layout--${safe(layoutId)}--${language}`,
          table: "layout",
          subject: layoutId,
          language,
          theme: BASELINE_THEME,
          page: 1,
          pageCount: 1,
          slideType: ir.slides[0]!.type ?? "content",
          heading: ir.slides[0]!.heading ?? "",
          ir,
          slideIndex: 0,
        })
      }
    }
  }

  // ── Component table ────────────────────────────────────────────────────
  if (!opts.only || opts.only === "component") {
    // `chart` renders nine unrelated drawings behind one type name, so the
    // variants replace the bare `chart` entry rather than sitting next to it.
    const entries: [string, (typeof COMPONENT_BUILDERS)[string]][] = [
      ...Object.entries(COMPONENT_BUILDERS).filter(([id]) => id !== "chart"),
      ...Object.entries(CHART_VARIANTS),
    ].sort(([a], [b]) => a.localeCompare(b))

    for (const [componentId, build] of entries) {
      for (const language of languages) {
        const lex = LEXICONS[language]
        const ir = componentPage(componentId, build!, lex, assets[language])
        push({
          id: `component--${safe(componentId)}--${language}`,
          table: "component",
          subject: componentId,
          language,
          theme: BASELINE_THEME,
          page: 1,
          pageCount: 1,
          slideType: "content",
          heading: ir.slides[0]!.heading ?? "",
          ir,
          slideIndex: 0,
        })
      }
    }
  }

  return jobs
}

/**
 * Refuses to build a gallery that silently under-covers. Both directions
 * matter: a missing builder means a component ships unreviewed, and a
 * stale builder means the review spends pages on something the IR no
 * longer has.
 */
export function assertFullCoverage(themeIds: readonly string[], expectedThemeCount: number): void {
  const problems: string[] = []

  const built = new Set(Object.keys(COMPONENT_BUILDERS))
  const declared = new Set(COMPONENT_TYPES)
  const missing = [...declared].filter((t) => !built.has(t)).sort()
  const stale = [...built].filter((t) => !declared.has(t)).sort()
  if (missing.length > 0) {
    problems.push(
      `no corpus builder for component type${missing.length === 1 ? "" : "s"}: ${missing.join(", ")} — ` +
        `add one to scripts/gallery/corpus/components.ts, or the visual review signs off on a component nobody looked at`,
    )
  }
  if (stale.length > 0) {
    problems.push(`corpus builds component type${stale.length === 1 ? "" : "s"} the IR no longer has: ${stale.join(", ")}`)
  }

  if (themeIds.length !== expectedThemeCount) {
    problems.push(`expected ${expectedThemeCount} themes, registry reports ${themeIds.length}`)
  }

  if (problems.length > 0) {
    throw new Error(`gallery coverage check failed:\n  - ${problems.join("\n  - ")}`)
  }
}
