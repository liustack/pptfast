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
//     archetype uses) used to be marginally under the 4.5:1 body floor
//     against several themes' own backgrounds — a theme-token-calibration
//     gap, not an archetype assuming the wrong background. **Fixed** in a
//     later task (post-v0.3 W8 fix round, backlog item 5a —
//     `.issues/notes/2026-07-18-post-v03-backlog.md` #5 — a minimal
//     hue/saturation-preserving lightness recalibration across the 7
//     affected themes' `colors.muted`, see each `themes/<id>.ts`'s own
//     inline comment on that token) and locked in by the dedicated
//     `colors.muted contrast` describe block below, which measures the
//     real backgrounds this token actually renders against instead of this
//     file's own deliberately meta-free fixtures. Kept out of *this* sweep's
//     fixtures regardless, even post-fix — this sweep's own job is the W4
//     defect class (an archetype assuming the wrong background for a token
//     it bakes), and adding meta/footnote content here would just
//     duplicate the dedicated block's coverage through a second, noisier
//     path instead of adding any.
//   - every `cover`/`ending` archetype's *subheading/subtitle* also reads
//     `colors.muted` (unlike `chapter`/`content`, whose subheading uses
//     `colors.text`/`colors.accent`/`colors.primary` — the tokens this
//     task's own fix touches) — same token now covered by the fix and
//     dedicated block above, not a second gap.
//   - `cover-left-anchor.tsx`'s (and `cover-banner-title.tsx`'s)
//     multi-`<tspan>` author/date/version line: attribution **fixed** in a
//     later task (post-v0.3 backlog item 5b —
//     `.issues/notes/2026-07-18-post-v03-backlog.md` #5 — `findContrastIssues`
//     no longer drops a `<tspan>`'s owning `<text>`'s own x/y when the
//     tspan carries none of its own; see that function's own doc comment in
//     `deck-audit.ts` and the two dedicated regression tests in
//     `deck-audit.test.ts`); the `colors.muted` values that line renders
//     with are covered by the same fix/block as the two bullets above.
//     Still left out of *this* fixture regardless, to keep this sweep's own
//     scope narrow to the W4 defect class.
//   - the five sources `deck-audit.test.ts`'s own "understood pre-existing
//     low-contrast sources" block already documents and pins.
import { beforeAll, describe, expect, it } from "vitest"
import type { PptxIR, Slide } from "@/ir"
import { auditDeck, type AuditFinding } from "./deck-audit"
import { installNodePlatform } from "../../platform/node"
import { CANONICAL_THEME_IDS, type CanonicalThemeId } from "../../themes"
import { THEME_DEFINITIONS } from "../../themes/definitions"
import { resolveBackgroundHex } from "../FullSlideSvg"
import { contrastRatio } from "../ink"

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
  /**
   * Matches against `finding.detail.ratio` (contrast findings only) when
   * set — both bounds are inclusive, and *both* must be provided together
   * (a one-sided band isn't a meaningful "historically adjudicated range").
   * Omit to allowlist by theme/layout/shape alone regardless of ratio, same
   * as before this field existed (backlog item 6,
   * `.issues/notes/2026-07-18-post-v03-backlog.md` #6).
   *
   * A finding without a numeric `ratio` (i.e. `overflow`/`out-of-bounds`,
   * which this same allowlist also filters — see `auditFindings`) never
   * matches an entry that sets these, even if its `text`/theme/layout would
   * otherwise qualify — a deliberate side effect: a text-shape guard alone
   * (e.g. `TEXT_SHAPE_GUARD`'s "1-2 digits") can't tell a contrast finding
   * apart from an overflow finding on the same glyph, so a ratio band is
   * also the only thing that scopes this entry to contrast specifically.
   */
  ratioMin?: number
  ratioMax?: number
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
    // Band derivation (backlog item 6,
    // `.issues/notes/2026-07-18-post-v03-backlog.md` #6): the text-shape
    // guard alone (`TEXT_SHAPE_GUARD["fashion-chapter"]`, "1-2 digits")
    // would silently wave through *any* future 1-2-digit finding under this
    // layout regardless of how far its ratio has drifted — this band closes
    // that gap. Originally measured (2026-07-19, `pnpm exec tsx` against a
    // real render of every theme whose curated chapter set then included
    // fashion-chapter — 10 of 13; bloom/classroom/heritage excluded it via
    // `CHAPTER_WITHOUT_FASHION`) and **re-measured all 13/13** the same day
    // after the post-v0.3 W8 fix round (backlog item 2) revoked that
    // exclusion (`readableOn` moved from a fixed 0.4 luminance threshold to
    // a real two-ink contrast comparison, which flips the archetype's own
    // `fg = readableOn(ctx.colors.accent)` for academic/heritage — same
    // fix also cleared the *heading* text that used to fail on
    // bloom/classroom/heritage, the actual reason those three were
    // curation-excluded — see `themes/definitions.ts`'s own history there).
    // The watermark blend itself (`mixHex(accent, fg, 0.22)`) depends on
    // `fg`, so every theme whose `fg` flipped got a new ratio too; every
    // theme's ratio still lands inside the existing band. Current 13-theme
    // spread: runway 1.242 (lowest), ink 1.424, luxe 1.448, journal 1.459,
    // academic 1.498, heritage 1.498, classroom 1.537, bloom 1.537,
    // insight 1.539, tech 1.583, campaign 1.600, consulting 1.601,
    // enterprise 1.752 (highest). `ratioMin`/`ratioMax` round the original
    // 10-theme extremes outward by a small margin (~0.04-0.05, absorbing
    // harmless token-value drift) without moving the ceiling anywhere close
    // to the 3:1 floor this whole entry is about staying under — both the
    // original and the re-measured 13-theme spread fit inside it unchanged,
    // so the numeric bounds themselves needed no adjustment. A finding
    // whose ratio lands outside [1.2, 1.8] no longer matches the
    // historically adjudicated band and fails the net as a real
    // regression, even with matching theme/layout/text-shape.
    ratioMin: 1.2,
    ratioMax: 1.8,
    rationale:
      "the chapter-number watermark digit (mixHex(accent, fg, 0.22) — chapter-fashion-chapter.tsx's own header calls it decorative by design) measures under 3:1 against every theme's accent (runway's ~1.24:1 is the current lowest, enterprise's ~1.75:1 the current highest — see the ratioMin/ratioMax comment above for the full 13-theme spread) — a deliberately faint blend, not body text, blanket-allowlisted by content (a bare 1-2 digit chapter number) rather than enumerated per theme since the blend's whole point is to be faint everywhere it's used. Unlike when this entry was first written, no theme curation-excludes fashion-chapter any more (post-v0.3 W8 fix round revoked the last three exclusions once their *heading* text — the actual failure — cleared 3:1 under the fixed `readableOn`) — this entry now covers all 13 themes' watermark uniformly. It never matches non-numeric text, so a real heading failure under this layout still fails the net. The added ratio band is a second, independent guard on top of that shape match, not a replacement for it.",
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
  const ratio = (finding.detail as { ratio?: number } | undefined)?.ratio
  const guard = TEXT_SHAPE_GUARD[layout]
  if (guard && !guard.test(text ?? "")) return false
  return ALLOWLIST.some((entry) => {
    if (entry.layout !== layout) return false
    if (entry.theme !== "*" && entry.theme !== theme) return false
    if (entry.fill !== undefined && entry.fill !== fill) return false
    // Both bounds are set together (see AllowlistEntry's own doc comment) —
    // a finding with no numeric ratio (overflow/out-of-bounds) can never
    // satisfy either, so a ratio-bounded entry only ever exempts contrast
    // findings, regardless of how permissive its shape guard is.
    if (entry.ratioMin !== undefined && (ratio === undefined || ratio < entry.ratioMin)) return false
    if (entry.ratioMax !== undefined && (ratio === undefined || ratio > entry.ratioMax)) return false
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

// Targeted addition (W8 fix round): kpi_cards flowing through bento-panel
// specifically — deliberately *not* folded into `CONTENT_BODY` above.
// `CONTENT_BODY` is shared by every content archetype across all 13 themes;
// the file header already documents that kpi_cards was tried there once and
// reverted because it drags in kpi.tsx's own unrelated, already-pinned
// defect (`deck-audit.test.ts`'s "kpi.tsx's hardcoded delta-arrow red") into
// every archetype that renders it via the shared row-layout component. This
// defect is narrower: it lives only in `content-bento-panel.tsx`'s own
// `renderKpiCardBody` (bento's per-item card renderer — a different code
// path from kpi.tsx's row layout), reachable only when a kpi_cards
// component explodes into bento-panel's own cards. A fixture scoped to
// exactly that combination is sufficient and avoids reintroducing the noise
// the shared fixture already proved unrelated.
describe("bento-panel kpi_cards contrast (W8 fix round, targeted — see comment above)", () => {
  // Values match the live repro that surfaced this defect (`pptfast audit`
  // on a hand-built deck, W8 walkthrough): two kpi_cards items so the grid
  // path (not the single-card degrade) renders both through renderKpiCard.
  const KPI_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "bento-panel",
    components: [
      {
        type: "kpi_cards",
        items: [
          { value: "13", label: "一号指标" },
          { value: "24", label: "二号指标" },
        ],
      },
    ],
  } as Slide

  // Sweep all 13 canonical themes rather than hand-picking the ones known to
  // fail — this both proves the defect on the affected themes (red before
  // the fix: bloom/classroom/consulting/heritage measure <3:1 between
  // colors.accent and colors.surface at the kpi value's real render size,
  // independently confirmed against each theme's own token file) and proves
  // accessibleInk is a no-op everywhere else (the other 9 already clear the
  // ratio), in one net.
  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: kpi value text clears the required contrast ratio against its own card surface`, () => {
      const findings = auditFindings(deckFor(themeId, KPI_SLIDE))
      // Structural findings (overflow/out-of-bounds) would be a real bug on
      // this trivial 2-item slide — asserted with zero exceptions.
      expect(findings.filter((f) => f.code !== "low-contrast")).toEqual([])
      // low-contrast: scoped to the kpi *value* text only (its detail.text
      // is exactly the item's numeric value string, "13"/"24"). A
      // same-slide low-contrast finding on the *label* text instead
      // ("一号指标"/"二号指标", colors.muted) used to be the file header's
      // own documented, pre-existing colors.muted theme-calibration gap —
      // **fixed** post-v0.3 W8 fix round (backlog item 5a, see the dedicated
      // `colors.muted contrast` describe block below for the full 13-theme
      // lock), so this now asserts zero exceptions too instead of leaving
      // the gap undocumented-away.
      const valueFindings = findings.filter(
        (f) =>
          f.code === "low-contrast" &&
          ["13", "24"].includes((f.detail as { text?: string } | undefined)?.text ?? ""),
      )
      expect(valueFindings).toEqual([])
      expect(findings.filter((f) => f.code === "low-contrast")).toEqual([])
    })
  }
})

// Dedicated 13-theme colors.muted contrast lock (post-v0.3 W8 fix round,
// backlog item 5a — `.issues/notes/2026-07-18-post-v03-backlog.md` #5, the
// other half of item 2 — see also task-1's handoff report for the 7
// concrete combos this replaces). Unlike the sweep above (deliberately
// meta-free, see the file header), this block deliberately populates the
// content that reads `colors.muted` as a raw, unconditional fill — never
// wrapped in `accessibleInk`, so it never self-heals the way e.g.
// `chapter-masthead-chapter.tsx`'s subheading does — against every real
// background this renderer actually paints behind it:
//   - each theme's own cover/content/ending page background (its
//     `defaultBackgrounds`, reduced the same way `FullSlideSvg.tsx` does).
//     `chapter` is deliberately excluded: every chapter archetype either
//     never reads `colors.muted` at all, or reads it through
//     `accessibleInk` (`chapter-masthead-chapter.tsx`/`chapter-poster-
//     chapter.tsx`/`chapter-constellation-chapter.tsx`/`chapter-roman-
//     chapter.tsx` — confirmed by reading every chapter archetype file),
//     which self-heals independently of this token's own calibration — so
//     there is no real raw-fill surface to lock there.
//   - the bento-panel kpi card's own real rendered surface, via an actual
//     render (not a hand-coded hex) since that surface is
//     `content-bento-panel.tsx`'s own internal implementation detail
//     (its card fill), not a theme token this test should assume the shape
//     of.
describe("colors.muted contrast (post-v0.3 W8 fix round, backlog item 5a)", () => {
  for (const themeId of CANONICAL_THEME_IDS) {
    const style = THEME_DEFINITIONS[themeId].style
    const muted = style.colors.muted

    it(`${themeId}: colors.muted clears 4.5:1 against every real cover/content/ending page background`, () => {
      for (const slideType of ["cover", "content", "ending"] as const) {
        const bg = resolveBackgroundHex(style.defaultBackgrounds[slideType], style.colors.surface)
        expect(contrastRatio(muted, bg), `${themeId} ${slideType} default bg ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`${themeId}: colors.muted clears the required ratio against the bento-panel kpi card's own rendered surface (value+unit and label)`, () => {
      const slide: Slide = {
        type: "content",
        heading: HEADING,
        layout: "bento-panel",
        components: [
          {
            type: "kpi_cards",
            items: [
              { value: "13", unit: "次/秒", label: "一号指标" },
              { value: "24", unit: "次/秒", label: "二号指标" },
            ],
          },
        ],
      } as Slide
      const findings = auditFindings(deckFor(themeId, slide))
      const mutedFindings = findings.filter(
        (f) => f.code === "low-contrast" && (f.detail as { fill?: string } | undefined)?.fill === muted,
      )
      expect(mutedFindings).toEqual([])
    })
  }
})
