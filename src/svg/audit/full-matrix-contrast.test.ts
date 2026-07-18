// @vitest-environment node
//
// Durable regression net for the W4 fix round (contrast defect class fixed
// in this task: archetypes baking a text fill while assuming the theme's
// default background tone — see `../ink.ts`'s own header and the task
// report's "修复轮" section for the full defect family). Runs under the
// real Node platform (`installNodePlatform()`, same posture as
// `deck-audit.test.ts`) so `auditDeck`'s actual documented Node consumption
// path is exercised end-to-end.
//
// Scope: every canonical theme × every slide type × every archetype
// currently in that theme's curated set (now the full registered-archetype
// set for all four slide types on all but a small, explicitly-adjudicated
// handful of curation exclusions — see `themes/definitions.ts`). Each
// combination is rendered with `heading` populated on every slide type, plus
// `subheading` on `chapter`/`content` specifically — this task's defect
// class (and this task's own fix) lives on those two elements plus
// self-painted chapter-number watermarks/badges; `cover`/`ending`
// deliberately omit `subheading` — see below.
//
// Deliberately minimal otherwise — no `organization`/`date` meta, no
// `footnote`, no preceding chapter (so a content archetype's section-label
// kicker never renders), no `kpi_cards`(+delta)/`code`/`quote`/
// `architecture` components, no `cover`/`ending` subheading. Every one of
// those was tried while building this test and each surfaces a *different*,
// pre-existing, cross-cutting issue unrelated to this task's defect class:
//   - `colors.muted` (the org/meta/footnote/kicker token nearly every
//     archetype uses) is marginally under the 4.5:1 body floor against
//     several themes' own background — a theme-token-calibration gap, not
//     an archetype assuming the wrong background. Confirmed empirically:
//     the ratio is identical whether meta is sparse or rich, and shows up
//     on `colors.muted`-bearing text in nearly every cover/content/ending
//     archetype across ~8 of the 13 themes.
//   - every `cover`/`ending` archetype's *subheading/subtitle* also reads
//     `colors.muted` (unlike `chapter`/`content`, whose subheading uses
//     `colors.text`/`colors.accent`/`colors.primary` — the tokens this
//     task's own fix touches) — same token-calibration gap as the point
//     above, confirmed at the exact same ratios (2.31-2.61:1) against
//     bloom/classroom's own background.
//   - `cover-left-anchor.tsx`'s multi-`<tspan>` author/date/version line
//     gets mis-attributed by `findContrastIssues` to the left primary block
//     instead of the right white panel it actually sits on — a documented
//     `deck-audit.ts` blind spot (see that archetype's file header and the
//     task review's Important I1 "方法论说明"), not a rendering defect.
//   - the five sources `deck-audit.test.ts`'s own "understood pre-existing
//     low-contrast sources" block already documents and pins.
// Recalibrating `colors.muted` per theme, or fixing the tspan-attribution
// blind spot, are both out of this task's scope (the former is a
// theme-design call across 13 files, the latter touches `deck-audit.ts`,
// which the brief explicitly keeps hands off) — flagged in the task report
// as follow-up candidates rather than silently worked around here.
import { beforeAll, describe, expect, it } from "vitest"
import type { PptxIR, Slide } from "@/ir"
import { auditDeck, type AuditFinding } from "./deck-audit"
import { installNodePlatform } from "../../platform/node"
import { CANONICAL_THEME_IDS, type CanonicalThemeId } from "../../themes"
import { THEME_DEFINITIONS } from "../../themes/definitions"

beforeAll(() => {
  installNodePlatform()
})

const HEADING = "示例标题：验证对比度矩阵"
const SUBHEADING = "示例副标题：用于穷举扫描的所见即所得文案"

function deckFor(themeId: string, slide: Slide): PptxIR {
  return {
    version: "3",
    filename: "full-matrix-contrast-fixture",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides: [slide],
  }
}

/** A content-page body deliberately limited to plain paragraph/bullets — see
 * file header on why `kpi_cards`(+delta)/`code`/`quote`/`architecture` are
 * excluded from this fixture. */
const CONTENT_BODY: Slide["components"] = [
  { type: "paragraph", text: "示例正文段落，用于占满 body 插槽验证排版不崩。" },
  { type: "bullets", items: ["要点一", "要点二", "要点三"] },
]

/** Audit `ir` and keep only `low-contrast`/`overflow`/`out-of-bounds`
 * findings — `overlap` is a different, already-zero-asserted-everywhere
 * concern (`deck-audit.test.ts`'s own stress matrix), not this task's
 * defect class. Every fixture here is a single-slide deck, so there is
 * only ever page 1 to filter to. */
function auditFindings(ir: PptxIR): AuditFinding[] {
  return auditDeck(ir).findings.filter(
    (f) => f.code === "low-contrast" || f.code === "overflow" || f.code === "out-of-bounds",
  )
}

interface AllowlistEntry {
  theme: string
  layout: string
  /** Matches against `finding.detail.fill` (contrast) when set — omit to
   * allowlist every finding for this theme+layout pairing. */
  fill?: string
  rationale: string
}

/**
 * Named, adjudicated exceptions — every one of these is a real (if minor/
 * decorative/borderline) WCAG deviation an advisory audit is supposed to
 * surface, not an audit bug. Mirrors `deck-audit.test.ts`'s own "understood
 * pre-existing low-contrast sources" philosophy: pin *why*, don't silently
 * swallow.
 */
const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    theme: "tech",
    layout: "fashion-masthead",
    rationale:
      "reviewer-adjudicated borderline: the org/date meta line measures ~4.16:1 against tech's bright-cyan primary block (needs 4.5:1 body) — a rounding distance under the floor, deferred to a future theme-polish pass rather than this fix round's scope.",
  },
  {
    theme: "*",
    layout: "fashion-chapter",
    rationale:
      "the chapter-number watermark digit (mixHex(accent, fg, 0.22) — chapter-fashion-chapter.tsx's own header calls it decorative by design) measures under 3:1 against most themes' accent (runway's own ~1.58:1 is the reviewer-adjudicated reference case) — a deliberately faint blend, not body text, blanket-allowlisted by content (a bare 1-2 digit chapter number) rather than enumerated per theme since the blend's whole point is to be faint everywhere it's used. The three themes whose fashion-chapter *heading*/label text (not just the watermark) also fails are curation-excluded in themes/definitions.ts instead (CHAPTER_WITHOUT_FASHION) — this entry never matches non-numeric text, so a real heading failure under this layout still fails the net.",
  },
  {
    theme: "*",
    layout: "rail-numbered",
    rationale:
      "audit-tool false positive, not a rendering defect: content-rail-numbered.tsx's own self-painted \"{chapter}.{content}\" badge rect is 64x32=2048px^2, below deck-audit.ts's MIN_BG_REGION_AREA (8000px^2 — that constant's own doc comment explicitly calibrates against 'the largest badge/dot circle found' as something that should NOT register as a background region), so findContrastIssues falls back to comparing the badge's readableOn(colors.primary) ink against the *page* background instead of the badge's own primary fill it's actually rendered on (confirmed by hand-checking real rendered markup). deck-audit.ts is out of this task's scope to touch — matched by the badge's own \"N.N\" text shape, not by which ink readableOn happened to pick, since that's theme-dependent.",
  },
]

/** Per-layout text-shape guards, keyed by layout id — a finding under that
 * layout only counts as allowlisted when its text also looks like the
 * specific decorative/chrome element the entry names, not any other text
 * that archetype might someday draw badly. */
const TEXT_SHAPE_GUARD: Readonly<Record<string, RegExp>> = {
  // fashion-chapter's giant watermark digit ("01", "12", ...) — never its
  // heading or "CHAPTER NN" label.
  "fashion-chapter": /^\d{1,2}$/,
  // rail-numbered's "{chapter}.{content}" badge ("1.1", "2.3", ...) — never
  // its heading/subheading/footnote.
  "rail-numbered": /^\d+\.\d+$/,
}

function isAllowlisted(theme: string, layout: string, finding: AuditFinding): boolean {
  const fill = (finding.detail as { fill?: string } | undefined)?.fill
  const text = (finding.detail as { text?: string } | undefined)?.text
  const guard = TEXT_SHAPE_GUARD[layout]
  if (guard && !guard.test(text ?? "")) return false
  return ALLOWLIST.some((entry) => {
    if (entry.layout !== layout) return false
    if (entry.theme !== "*" && entry.theme !== theme) return false
    if (entry.fill !== undefined && entry.fill !== fill) return false
    return true
  })
}

function findingSummary(f: AuditFinding): string {
  return `${f.code}: ${f.message}`
}

describe("full-matrix contrast/overflow regression net (W4 fix round)", () => {
  for (const themeId of CANONICAL_THEME_IDS) {
    describe(themeId, () => {
      const layouts = THEME_DEFINITIONS[themeId as CanonicalThemeId].layouts

      it("cover archetypes", () => {
        const failures: string[] = []
        for (const layout of layouts.cover) {
          // No subheading — see file header on colors.muted's subtitle gap.
          const slide: Slide = { type: "cover", heading: HEADING, layout, components: [] } as Slide
          const findings = auditFindings(deckFor(themeId, slide)).filter((f) => !isAllowlisted(themeId, layout, f))
          for (const f of findings) failures.push(`${layout}: ${findingSummary(f)}`)
        }
        expect(failures).toEqual([])
      })

      it("chapter archetypes", () => {
        const failures: string[] = []
        for (const layout of layouts.chapter) {
          const slide: Slide = { type: "chapter", heading: HEADING, subheading: SUBHEADING, layout, components: [] } as Slide
          const findings = auditFindings(deckFor(themeId, slide)).filter((f) => !isAllowlisted(themeId, layout, f))
          for (const f of findings) failures.push(`${layout}: ${findingSummary(f)}`)
        }
        expect(failures).toEqual([])
      })

      it("content archetypes", () => {
        const failures: string[] = []
        for (const layout of layouts.content) {
          const slide: Slide = {
            type: "content",
            heading: HEADING,
            subheading: SUBHEADING,
            layout,
            components: CONTENT_BODY,
          } as Slide
          const findings = auditFindings(deckFor(themeId, slide)).filter((f) => !isAllowlisted(themeId, layout, f))
          for (const f of findings) failures.push(`${layout}: ${findingSummary(f)}`)
        }
        expect(failures).toEqual([])
      })

      it("ending archetypes", () => {
        const failures: string[] = []
        for (const layout of layouts.ending) {
          // No subheading — see file header on colors.muted's subtitle gap.
          const slide: Slide = { type: "ending", heading: HEADING, layout, components: [] } as Slide
          const findings = auditFindings(deckFor(themeId, slide)).filter((f) => !isAllowlisted(themeId, layout, f))
          for (const f of findings) failures.push(`${layout}: ${findingSummary(f)}`)
        }
        expect(failures).toEqual([])
      })
    })
  }
})
