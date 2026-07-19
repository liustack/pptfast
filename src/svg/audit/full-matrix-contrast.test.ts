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
import { COMPONENT_TYPES, type PptxIR, type Slide } from "@/ir"
import { renderSlideSvg } from "../../api"
import { auditDeck, type AuditFinding } from "./deck-audit"
import { installNodePlatform } from "../../platform/node"
import { CANONICAL_THEME_IDS, type CanonicalThemeId } from "../../themes"
import { THEME_DEFINITIONS } from "../../themes/definitions"
import { resolveBackgroundHex } from "../FullSlideSvg"
import { contrastRatio } from "../ink"
import { parseSvgRoot } from "../serialize"

beforeAll(() => {
  installNodePlatform()
})

const HEADING = "示例标题：验证对比度矩阵"
const SUBHEADING = "示例副标题：用于穷举扫描的**所见即所得**文案"

function deckFor(themeId: string, slide: Slide): PptxIR {
  return {
    version: "4",
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

// rail-numbered allowlist precondition guard (task-1 routed follow-up,
// `.issues/notes/2026-07-18-post-v03-backlog.md` #6/#7): item 6 added a
// ratioMin/ratioMax band to the fashion-chapter entry above so a shape-only
// match can no longer silently wave through a future ratio regression.
// Verified before doing the same here: the rail-numbered entry's own
// rationale (above) is a tool-false-positive claim — the badge rect never
// registers as its own background region because its area sits below
// deck-audit.ts's MIN_BG_REGION_AREA, so `findContrastIssues` falls back to
// comparing the badge's ink against the *wrong* (page) background —  not an
// adjudicated faint-by-design color pairing like fashion-chapter's
// watermark. `isAllowlisted` (above) never reads `finding.detail.ratio` for
// this entry (no `ratioMin`/`ratioMax` fields on it), so a ratio band here
// would have nothing to bound: the finding's actual ratio is an accident of
// which ink `readableOn` happens to pick per theme against the wrong
// background, not a stable, intentional blend — pinning its current
// numeric spread would pin noise, not harden anything.
//
// The exemption's real precondition is structural instead: the badge
// rect's rendered area must stay below MIN_BG_REGION_AREA (8000px^2,
// deck-audit.ts's own constant — private/unexported, so re-derived here
// from a real render rather than imported, same "derive from current
// measured values" discipline the fashion-chapter band above documents).
// If a future change ever grows the badge past that threshold, the audit
// would then correctly attribute the badge's own real background instead of
// falling back to the page background, and this allowlist entry's
// shape-only match would start silently swallowing a then-legitimate
// finding instead of a tool artifact. Pinning the precondition itself makes
// that scenario fail loudly here, at its actual source, instead of
// surfacing as a confusing unrelated-looking failure inside the swept
// describe block below.
describe("rail-numbered allowlist precondition (task-1 routed follow-up)", () => {
  it("the number badge's real rendered area stays below deck-audit.ts's MIN_BG_REGION_AREA (8000px^2) — the allowlist entry's actual justification", () => {
    const slide: Slide = {
      type: "content",
      heading: HEADING,
      subheading: SUBHEADING,
      layout: "rail-numbered",
      components: CONTENT_BODY,
    } as Slide
    // Theme is arbitrary — content-rail-numbered.tsx's badge geometry
    // (BADGE_W/BADGE_H) is a fixed pixel constant, not driven by any theme
    // token, so this precondition holds or breaks identically for all 13.
    const ir = deckFor("consulting", slide)
    const markup = renderSlideSvg(ir, 0)
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${markup}</svg>`)

    // Locate the badge without hardcoding its position: it's the <rect>
    // immediately preceding the "{chapter}.{content}" label text — the same
    // shape TEXT_SHAPE_GUARD["rail-numbered"] itself matches findings
    // against, so this reuses the one guard already defined rather than
    // re-deriving a second description of the same shape.
    const badgeText = Array.from(root.querySelectorAll("text")).find((t) =>
      TEXT_SHAPE_GUARD["rail-numbered"].test(t.textContent ?? ""),
    )
    expect(badgeText).toBeTruthy()
    const badgeRect = badgeText!.previousElementSibling
    expect(badgeRect?.tagName.toLowerCase()).toBe("rect")

    const width = Number(badgeRect!.getAttribute("width"))
    const height = Number(badgeRect!.getAttribute("height"))
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
    expect(width * height).toBeLessThan(8000) // MIN_BG_REGION_AREA, deck-audit.ts
  })
})

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

// Coverage-class completeness guard (task-2 fix round, backlog 5a review
// finding — see task-2-review.md's Major finding and task-2-report.md's
// "修复轮" section). The "colors.muted contrast" block above only ever
// probes two backgrounds — each theme's own page background, and
// content-bento-panel.tsx's kpi card surface — because those were the only
// two real surfaces the original W8 recalibration's own probe methodology
// happened to walk. `content-matrix`'s per-cell tone-blended background
// (`mixHex(colors.surface, colors.muted|accent|primary, 0.08-0.16)`,
// matrix.tsx's own `toneFill`) is a real, distinct third surface that probe
// never rendered — confirmed independently: a real `matrix` component
// through the real `auditDeck` pipeline reports genuine low-contrast
// findings on 9/13 themes' `colors.muted`-filled tag text pre-fix,
// including `consulting`, which the original recalibration never even
// considered.
//
// The root defect wasn't "matrix specifically" — it was that the
// validation net only ever exercises whichever backgrounds its own
// hand-picked probe happened to walk, with nothing catching a component
// (present or future) that paints a background the probe doesn't know
// about. Recalibrating for matrix alone would close the *instance* and
// leave the exact same blind spot open for the next component that paints
// its own background. `MUTED_SURFACE_CLASS` below is the *class* closure:
// every one of `COMPONENT_TYPES`' 28 entries — the schema's own source of
// truth (`src/ir/index.ts`), never hand-copied — gets an explicit,
// human-reviewed classification of *where* its `colors.muted` text (if
// any) actually renders, backed by reading that component's real source.
// A completeness assertion below fails the moment a future component type
// ships without a classification decision — the honest version of "can't
// silently escape": no clever auto-detection of `colors.muted` usage (an
// AST/regex scan would be fragile and wouldn't know *which background* the
// text lands on anyway), just an explicit map a human must extend, exactly
// like this file's own `ALLOWLIST`/`TEXT_SHAPE_GUARD` above.
type MutedSurfaceClass =
  | "no-muted-fill"
  | "page-bg"
  | "flat-surface"
  | "needs-fixture"
  | "known-gap"

/**
 * Per-classification meaning (each backed by reading the component's real
 * source — see the fix report for the full per-file audit trail):
 *
 * - `"no-muted-fill"`: never renders `colors.muted` as a `<text>`/`<tspan>`
 *   fill. Some of these *do* reference `colors.muted` in their source, but
 *   only as a `stroke` (e.g. `bullets.tsx`/`rings.tsx`/`comparison.tsx`'s
 *   own `colors.border ?? colors.muted` divider/rule fallback) —
 *   `findContrastIssues` only ever inspects `<text>`/`<tspan>` `fill`
 *   (`deck-audit.ts`'s `runContrastWalk`), so a stroke-only or wholly
 *   absent usage can never itself produce a `low-contrast` finding,
 *   regardless of calibration.
 * - `"page-bg"`: renders `colors.muted` text, but always directly over the
 *   ambient slide background (no component-painted rect/path sits behind
 *   it) — already covered by the "clears 4.5:1 against every real
 *   cover/content/ending page background" check above, which is a pure
 *   function of the two hex values and doesn't care which component
 *   painted the text on top.
 * - `"flat-surface"`: renders `colors.muted` text over a card/panel whose
 *   fill is the *same*, unblended `colors.surface` token the bento-panel
 *   check above already locks (`icon-cards.tsx`/`kpi.tsx`'s card shell/
 *   `roadmap.tsx`'s card/`insight_panel.tsx`'s panel/`row-cards.tsx`'s
 *   card/`steps.tsx`'s horizontal-mode card/`image*.tsx`'s missing-asset
 *   placeholder rect all use `fill={ctx.colors.surface}` verbatim, grepped
 *   and read individually) — re-rendering would just re-verify the
 *   identical (muted, surface) hex pair the bento-panel block already
 *   exercises, since contrast is a pure function of the two colors, not of
 *   which component drew them.
 * - `"needs-fixture"`: a real, distinct (fill, background) pair not
 *   covered by either of the above — has its own dedicated probe below.
 * - `"known-gap"`: a real, `auditDeck`-confirmed low-contrast finding this
 *   task's token-calibration discipline cannot close — recorded (pinned),
 *   not silently exempted, in its own dedicated describe block (a future
 *   instance needs a new one — the two `kpi_cards`/`numbered_cards` cases
 *   that originally justified this category were fixed post-v0.3 W8, see
 *   the "colors.muted opacity-blend fix" describe block below, which pins
 *   their resolved, zero-affected-themes state rather than the shortfall,
 *   and reclassified out of `"known-gap"`, so no current entry uses this
 *   value — see commit c523994 for the shape a from-scratch pin took).
 */
const MUTED_SURFACE_CLASS: Record<string, MutedSurfaceClass> = {
  bullets: "no-muted-fill", // stroke-only divider fallback (bullets.tsx)
  paragraph: "no-muted-fill", // no colors.muted reference at all
  quote: "page-bg", // attribution line (quote.tsx), no card
  callout: "no-muted-fill", // no colors.muted reference at all
  code: "no-muted-fill", // no colors.muted reference at all
  // kpi.tsx's row-card unit/label/delta-flat-fallback text is flat-surface
  // (same colors.surface pair as bento-panel) — its `source` line used to be
  // a real, separate known-gap (fillOpacity=0.7 raw, pinned by commit
  // c523994) — **fixed** post-v0.3 W8 fix round (task-2 review routed): the
  // line now renders `accessibleOpacity(colors.muted, colors.surface, 11,
  // 0.7)` (`kpi.tsx`'s own comment at that call site), which falls back to
  // full opacity on all 13 themes (the 0.7-blended ratio never clears
  // 4.5:1) — same (muted, surface) pair the bento-panel check below already
  // locks at full opacity, so no longer a distinct surface to track. Locked
  // by the "colors.muted opacity-blend fix" describe block below.
  kpi_cards: "flat-surface",
  chart: "page-bg", // category/value/donut-center labels never sit on a component-painted rect (chart.tsx/chart-svg.tsx)
  // Edge-label chip (`fill={colors.bg}`, flowchart.tsx) is real geometry,
  // but every realistic label (including STRESS_DECKS's own
  // flowchart_edge_labels deck) keeps chipW*chipH far below
  // deck-audit.ts's MIN_BG_REGION_AREA (8000px^2) — verified empirically,
  // zero muted-attributable findings across all 13 themes — so it never
  // registers as its own region and the audit resolves the edge label's
  // background to the ambient page bg in practice, same as every other
  // page-bg entry.
  flowchart: "page-bg",
  architecture: "no-muted-fill", // no colors.muted reference at all
  timeline: "page-bg", // desc/date text, no card in either horizontal or vertical mode
  comparison: "page-bg", // row-label (col 0) text; table body is deliberately unfilled (comparison.tsx's own comment)
  icon_cards: "flat-surface", // description text on the card's colors.surface shell
  row_cards: "flat-surface", // sub text on the card's colors.surface shell
  steps: "flat-surface", // description text on the card's colors.surface shell (horizontal mode); vertical mode has no card at all (page-bg, also covered)
  rings: "page-bg", // desc text, no card
  // numbered-cards.tsx's `text` field is page-bg (covered) — its `sub` field
  // used to be a real, separate known-gap (opacity=0.75 raw, pinned by
  // commit c523994) — **fixed** post-v0.3 W8 fix round (task-2 review
  // routed): `sub` now renders `accessibleOpacity(colors.muted,
  // ctx.defaultBg ?? ctx.colors.bg, sub.fontSize, 0.75)`
  // (`numbered-cards.tsx`'s own comment at that call site), which falls back
  // to full opacity on 12/13 themes and keeps 0.75 on campaign (already
  // clears 4.5:1 there) — same page background `text` above it already sits
  // on, so no longer a distinct surface to track. Locked by the
  // "colors.muted opacity-blend fix" describe block below.
  numbered_cards: "page-bg",
  // roadmap.tsx's row-label text sits on the card's colors.surface shell
  // (flat-surface) — but `renderCard`'s own accent bar
  // (`roundedTopBarPath`, an SVG arc `<path>`) triggers a pre-existing,
  // documented `pathBoundingBox` limitation in deck-audit.ts (see that
  // function's own doc comment): extracting every numeric token from the
  // arc's `d` string and taking min/max mis-reads the arc's radius/flag
  // parameters as coordinates, inflating the accent bar's computed bbox
  // from ~8px tall to ~the whole card — which then wins the background
  // lookup for the row-label text underneath it (confirmed by dumping the
  // real rendered markup: the row-label's true painted background is the
  // card's white/`colors.surface` rect, not the accent bar's fill).
  // Pre-existing, out of this task's scope to touch deck-audit.ts (matches
  // this file's own `rail-numbered` ALLOWLIST entry's precedent of
  // documenting rather than fixing an audit-tool limitation) — not a
  // colors.muted defect, so not folded into calibration or into a
  // "known-gap" pinned finding either.
  roadmap: "flat-surface",
  // The one real "needs-fixture" gap this fix round closes — see the
  // dedicated describe block below.
  matrix: "needs-fixture",
  // insight_panel.tsx's footnote text sits on the panel's colors.surface
  // shell (flat-surface) — same roundedTopBarPath phantom-background caveat
  // as roadmap above (insight_panel.tsx uses the identical helper).
  insight_panel: "flat-surface",
  // The neutral-tone tint rect (`fill={tone}` where tone===colors.muted,
  // verdict-banner.tsx) renders at fillOpacity=0.08 — below deck-audit.ts's
  // MIN_BG_OPACITY (0.5) — so it never registers as a background region at
  // all; muted-filled `**emphasis**` runs inside a neutral banner resolve
  // against whatever the audit already sees as the ambient page background,
  // verified empirically (zero muted-attributable findings, all 13 themes).
  verdict_banner: "page-bg",
  citation: "page-bg", // URL tspan, no card
  image: "flat-surface", // missing-asset placeholder text on a colors.surface rect
  image_grid: "flat-surface", // same missing-asset placeholder pattern
  image_compare: "flat-surface", // same missing-asset placeholder pattern
  // Structure-components wave task 1: bmc.tsx never references
  // `colors.muted` at all. swot.tsx does — `badgeFill`'s "weaknesses" case
  // returns `colors.muted` and its "threats" case blends it — but never as a
  // text fill: `badgeFill`'s return value only ever feeds `panelFill`'s
  // `mixHex` tint source and `accessibleInk`'s own *candidate* ink argument,
  // and `accessibleInk` only actually renders that candidate when it clears
  // contrast against the panel it's tinted from (self-referential and, by
  // construction, unlikely to) — every title/item line still renders
  // `colors.text` (routed through `accessibleInk` against each panel's own
  // real fill, tinted or flat). So there is no *unconditional* raw-muted-fill
  // surface for this completeness guard to track, only a blend source /
  // rejected-candidate use — a real distinction from "never touches the
  // token at all" (bmc's case), worth spelling out honestly rather than
  // flattening both to one blanket "never renders" claim. Both DO tint a
  // panel background (swot's 4 quadrants, bmc's `value_propositions` block)
  // — decision 7's "any tinted background needs a dedicated probe" mandate
  // is honored below regardless of the muted-specific classification being a
  // no-op here, in the "tinted-panel contrast" describe block (matrix-shaped
  // 13-theme sweep, but asserting zero low-contrast findings outright rather
  // than filtering to a `colors.muted` fill, since neither component ever
  // produces one as an actually-rendered finding).
  swot: "no-muted-fill",
  bmc: "no-muted-fill",
  // Structure-components wave task 2: waterfall.tsx touches `colors.muted`
  // only as a stroke (the zero-baseline reference line and inter-bar dashed
  // connectors) — the same stroke-only carve-out `bullets.tsx`/`rings.tsx`/
  // `comparison.tsx` already rely on (never a `<text>`/`<tspan>` fill, so
  // `findContrastIssues` can never attribute a finding to it). Its three bar
  // colors (rise/fall/total — the total color is a real `mixHex` blend) are a
  // tinted *background*, not muted text, covered by decision 7's mandate in
  // the dedicated "waterfall tinted-bar contrast" describe block below.
  waterfall: "no-muted-fill",
  // gantt.tsx renders `colors.muted` as its optional axis-tick-label text —
  // always directly on the ambient page background (no card/rect sits behind
  // it, same as chart.tsx's own category labels), so already covered by the
  // "clears 4.5:1 against every real page background" check above.
  gantt: "page-bg",
}

describe("colors.muted component-type coverage (task-2 fix round, backlog 5a completeness sweep)", () => {
  it("every COMPONENT_TYPES entry has a documented colors.muted surface classification", () => {
    // Fails the moment the schema grows a 25th component type without a
    // human deciding where (if anywhere) it paints colors.muted — the
    // completeness guard the review asked for, deliberately dumb: a plain
    // membership check against a hand-maintained map, not an attempt to
    // auto-infer rendering behavior from source. `Object.hasOwn`, not the
    // `in` operator (post-v0.3 W8 fix round, reviewer nitpick —
    // prototype-key hygiene, same precedent as `resolveNarrative`'s own
    // `Object.hasOwn(NARRATIVE_PRESETS, input)` check, `src/scenario/
    // index.ts`): `in` also matches inherited/prototype-chain keys (e.g.
    // `"toString" in {}` is `true`), which a component type named the same
    // as an `Object.prototype` member would silently satisfy without ever
    // getting its own entry in `MUTED_SURFACE_CLASS`.
    const undocumented = COMPONENT_TYPES.filter((type) => !Object.hasOwn(MUTED_SURFACE_CLASS, type))
    expect(undocumented).toEqual([])
  })

  // The one "needs-fixture" entry: content-matrix's per-cell tone-blended
  // background. Exercises all 3 `tone` branches (`toneFill`'s neutral/
  // accent/info switch, matrix.tsx) with a `tag` on every item — `tag` is
  // the only muted-filled text that lands on the tone-blended cell rect
  // itself (`x_title`/`y_title` also read colors.muted, but sit on the
  // ambient page background, already covered by the page-bg check above).
  const MATRIX_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "matrix",
        cols: 2,
        items: [
          { title: "现金牛", tag: "稳定现金流", tone: "neutral" },
          { title: "明星", tag: "高增长高份额", tone: "accent" },
          { title: "问号", tag: "待验证方向", tone: "info" },
          { title: "瘦狗", tag: "考虑退出", tone: "neutral" },
        ],
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: matrix tag text clears 4.5:1 against every tone-blended cell background`, () => {
      const style = THEME_DEFINITIONS[themeId].style
      const findings = auditFindings(deckFor(themeId, MATRIX_SLIDE))
      const mutedFindings = findings.filter(
        (f) => f.code === "low-contrast" && (f.detail as { fill?: string } | undefined)?.fill === style.colors.muted,
      )
      expect(mutedFindings).toEqual([])
    })
  }
})

// Structure-components wave task 1, decision 7: swot.tsx/bmc.tsx each tint
// at least one panel background (`mixHex(colors.surface, <token>, t)`, the
// same primitive matrix.tsx's `toneFill` uses) — swot's 4 quadrants, bmc's
// `value_propositions` block. Neither component ever renders `colors.muted`
// (see MUTED_SURFACE_CLASS's "no-muted-fill" entries above), so unlike
// matrix's own dedicated block this sweep can't scope its assertion to a
// `colors.muted` fill specifically — it asserts zero `low-contrast` findings
// outright, which is the stronger, more honest claim anyway (every text
// element these two components render — title and item alike — routes
// through `accessibleInk` against its own panel's real fill, so this should
// hold by construction; the sweep locks that empirically rather than only
// trusting the construction).
describe("swot/bmc tinted-panel contrast (structure-components wave task 1, decision 7)", () => {
  // Exercises all 4 quadrant tone branches (accent/primary/muted/
  // primary-muted-blend — swot.tsx's `badgeFill` switch) with 2 items per
  // quadrant so both the header and the item-list ink paths render.
  const SWOT_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "swot",
        strengths: ["强大的品牌认知度", "稳定的现金流"],
        weaknesses: ["产品线相对单一", "对单一渠道依赖度高"],
        opportunities: ["新兴市场快速增长", "政策利好窗口期"],
        threats: ["新进入者价格战风险", "关键原材料成本上升"],
      },
    ],
  } as Slide

  // Exercises all 9 named blocks, including the one tinted block
  // (`value_propositions`) alongside the 8 flat-surface ones.
  const BMC_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "bmc",
        key_partners: ["核心供应商", "渠道伙伴"],
        key_activities: ["产品研发"],
        key_resources: ["工程团队"],
        value_propositions: ["一站式解决方案", "更低的总拥有成本"],
        customer_relationships: ["专属客户成功经理"],
        channels: ["直销团队", "合作伙伴分销"],
        customer_segments: ["中型企业客户"],
        cost_structure: ["研发投入", "云基础设施"],
        revenue_streams: ["订阅费", "实施服务费"],
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    // Zero findings outright (not just zero low-contrast) — task 1's own
    // "visual sanity" bar: a full-body component filling the whole content
    // rect at real deck geometry must not overflow/out-of-bounds either, on
    // any of the 13 themes.
    it(`${themeId}: swot renders with zero auditDeck findings (contrast, overflow, out-of-bounds)`, () => {
      expect(auditFindings(deckFor(themeId, SWOT_SLIDE))).toEqual([])
    })

    it(`${themeId}: bmc renders with zero auditDeck findings (contrast, overflow, out-of-bounds)`, () => {
      expect(auditFindings(deckFor(themeId, BMC_SLIDE))).toEqual([])
    })
  }
})

// Structure-components wave task 2, decision 7: waterfall.tsx paints three
// theme-derived bar colors (rise=`colors.accent`, fall=`colors.primary`,
// total=`mixHex(colors.primary, colors.accent, 0.5)` — the one real tint in
// this component, decision 7's own named example). gantt.tsx paints no
// mixed/tinted surface (its bar fill is flat `colors.accent`), so it isn't
// one of decision 7's named surfaces, but gets the same "visual sanity" zero-
// findings bar task 1 already applied to swot/bmc, at real deck geometry
// across all 13 themes — no exemptions.
describe("waterfall/gantt contrast (structure-components wave task 2, decision 7)", () => {
  // Exercises all three bar kinds: an explicit opening `total` (grounded),
  // two rises, two falls, and — since the last item isn't itself `kind:
  // "total"` — an auto-appended closing total bar (waterfall.tsx's own
  // `computeBars`). Six bars total, well inside the 3-8 item schema range
  // (5 authored + 1 auto).
  const WATERFALL_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "waterfall",
        unit: "万",
        items: [
          { label: "期初", value: 500, kind: "total" },
          { label: "新签", value: 220 },
          { label: "流失", value: -150 },
          { label: "增购", value: 80 },
          { label: "退款", value: -40 },
        ],
      },
    ],
  } as Slide

  // Exercises the `axis_labels` branch (evenly distributed tick text,
  // including the first/last edge-anchored labels) alongside 4 ordinary bars.
  const GANTT_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "gantt",
        axis_labels: ["W1", "W4", "W7", "W10"],
        items: [
          { label: "设计", start: 0, end: 3 },
          { label: "开发", start: 2, end: 7 },
          { label: "测试", start: 6, end: 9 },
          { label: "上线", start: 9, end: 10 },
        ],
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: waterfall renders with zero auditDeck findings (contrast, overflow, out-of-bounds)`, () => {
      expect(auditFindings(deckFor(themeId, WATERFALL_SLIDE))).toEqual([])
    })

    it(`${themeId}: gantt renders with zero auditDeck findings (contrast, overflow, out-of-bounds)`, () => {
      expect(auditFindings(deckFor(themeId, GANTT_SLIDE))).toEqual([])
    })
  }
})

// colors.muted opacity-blend fix (post-v0.3 W8 fix round, task-2 review
// routed — `.issues/notes/2026-07-18-post-v03-backlog.md`'s "9. task-2 覆盖
// 小项" area). Two colors.muted call sites rendered at a reduced opacity
// WITHOUT routing through `accessibleOpacity` (`src/svg/ink.ts`) — the
// helper this codebase already built for exactly this shape of problem
// ("a dimmed ink tier can drop under the floor even when the same ink at
// full opacity clears it comfortably", that function's own doc comment)
// and already wired up at its two existing call sites
// (`chapter-banner-chapter.tsx`/`chapter-rail-chapter.tsx`) — but, until
// this fix, never at these two:
//   - kpi.tsx's row-card `source` line: `fill={colors.muted}
//     fillOpacity={0.7}`. Every raw (fill, background) pair this file
//     checks already clears 4.5:1 post-recalibration, but blending muted at
//     0.7 alpha toward `colors.surface` pulled the *effective* color close
//     enough to the background that all 13 themes failed.
//   - numbered-cards.tsx's `sub` line: `fill={colors.muted}
//     opacity={0.75}`. Same mechanism, 12/13 themes failed (campaign's
//     post-matrix-recalibration muted had already moved light enough to
//     clear even the 0.75-blended case, a side effect, not a targeted fix).
// This was first recorded rather than fixed (commit c523994) after
// evaluating and rejecting a recalibrate-the-hex-instead approach:
// independently computed, the 4 themes with *no other* colors.muted issue
// at all (academic/classroom/tech/journal) would still need to darken
// ~16-19 percentage points of lightness to clear kpi.tsx's source line at
// 0.7 alpha — an order of magnitude past every adjustment either
// recalibration round made (max 8.7pp, campaign) — landing muted's own raw
// contrast around 11:1 against its card surface, next to colors.text's own
// ~16-17:1 there. That stops reading as a *softer* secondary tier at all —
// the exact invariant this token's calibration exists to protect.
//
// Fixed here instead: both call sites now route through
// `accessibleOpacity(colors.muted, <real background>, <real rendered
// fontSize>, <preferred opacity>)` — `colors.surface` for kpi.tsx (the
// row-card's own shell), `ctx.defaultBg ?? ctx.colors.bg` for
// numbered-cards.tsx (no card, sits on the page background like its `text`
// field). Confirmed by measurement, not assumed: `accessibleOpacity` falls
// back to full opacity for every theme whose blended ratio missed 4.5:1 —
// all 13/13 for kpi.tsx, 12/13 for numbered-cards.tsx (campaign keeps its
// preferred 0.75, already clearing the floor there without falling back) —
// exactly the blast radius this comment's predecessor predicted when it
// deferred the fix. `findsMuted` below (unchanged) now finds zero affected
// themes for either call site. The two assertions were flipped from pinning
// the pre-fix shortfall to locking the post-fix floor, not deleted, so a
// future regression on either call site's opacity or on colors.muted itself
// still fails this net instead of silently drifting past it.
describe("colors.muted opacity-blend fix (post-v0.3 W8 fix round, task-2 review routed)", () => {
  function findsMuted(themeId: (typeof CANONICAL_THEME_IDS)[number], slide: Slide): boolean {
    const style = THEME_DEFINITIONS[themeId].style
    return auditFindings(deckFor(themeId, slide)).some(
      (f) => f.code === "low-contrast" && (f.detail as { fill?: string } | undefined)?.fill === style.colors.muted,
    )
  }

  it("kpi.tsx row-card source line (fillOpacity via accessibleOpacity): clears 4.5:1 on all 13 themes", () => {
    const slide: Slide = {
      type: "content",
      heading: HEADING,
      layout: "narrow-column",
      components: [
        {
          type: "kpi_cards",
          items: [{ value: "128", unit: "万", label: "季度营收", source: "来源: 内部财报" }],
        },
      ],
    } as Slide
    const affected = CANONICAL_THEME_IDS.filter((themeId) => findsMuted(themeId, slide))
    expect(affected).toEqual([])
  })

  it("numbered-cards.tsx sub line (opacity via accessibleOpacity): clears 4.5:1 on all 13 themes", () => {
    const slide: Slide = {
      type: "content",
      heading: HEADING,
      layout: "narrow-column",
      components: [
        {
          type: "numbered_cards",
          items: [{ title: "要点一", text: "说明文字", sub: "补充信息" }],
        },
      ],
    } as Slide
    const affected = CANONICAL_THEME_IDS.filter((themeId) => findsMuted(themeId, slide))
    expect(affected).toEqual([])
  })
})

// Coverage-completeness addition (final-review Major finding, whole-branch
// review of `fix/post-v03-backlog` — independently discovered, not caught by
// task 2's own review, resolved as this same backlog item 1's own sub-branch
// fix, `.issues/notes/2026-07-18-post-v03-backlog.md` #1): the review's own
// words were "`full-matrix-contrast.test.ts` (the wave's own dedicated
// regression net for exactly this defect class) — grepped for `"asset"` —
// zero matches; its sweep never constructs a content/ending slide with an
// asset background." `resolveOverrideBackgroundHex`'s asset branch used to
// return `tokens.colors.surface` for a per-slide asset-background override —
// unrelated to what a content slide actually paints behind text in that case
// (`Background.tsx`'s auto-scrim, colored `themeDefaultBg` — see
// `FullSlideSvg.tsx`'s own `autoScrimColor` assignment and
// `resolveOverrideBackgroundHex`'s "Asset policy rationale" doc comment).
// This sweep closes exactly that gap: every content archetype, every theme,
// with a real asset background (a data-URI `<image>`, not the missing-asset
// placeholder rect) through the real `auditDeck` pipeline.
//
// Scoped to `content` only, not `ending` (though the underlying mechanism —
// a non-takeover asset background's auto-scrim — applies identically to
// both slide types, see `FullSlideSvg.tsx`'s own "content/ending 的 asset
// 背景维持 P1 雾面 scrim" comment): grepping every `ctx.defaultBg`/
// `defaultBg` reference under `src/svg/archetypes/` (same methodology the
// review itself used) finds zero `ending-*.tsx` consumers today, so an
// `ending` sweep here would render successfully but could never actually
// exercise the fixed code path — indistinguishable from a vacuous check.
// `resolveOverrideBackgroundHex`'s own direct unit tests
// (`FullSlideSvg.test.tsx`) cover the `asset` branch regardless of which
// slide type calls it, so the fix itself is not undertested for `ending` —
// only this particular real-render net is narrowed to where it can actually
// discriminate today. A future `ending` archetype that starts reading
// `ctx.defaultBg` should extend this block, not silently rely on it.
//
// Expected to stay green both before and after the fix, by the review's own
// quantified analysis (independently reproduced while building this fix, via
// a throwaway probe script computing `contrastRatio` for every theme's
// `colors.accent`/`colors.primary` against both `colors.surface` and the
// real `themeDefaultBg`): today's real flips are either latent
// (academic/campaign's dangerous-direction flip needs a >=24px subheading no
// current content archetype requests — every real subheading call site is
// 20-22px) or cosmetic-safe (insight/luxe's flip swaps *which* ink renders,
// from the theme's own accent/primary token to `readableOn`'s neutral pick,
// never producing a sub-threshold pairing either way). This sweep's job is
// durable regression coverage against a *future* archetype/theme combination
// crossing into the dangerous direction, not red-then-green proof for *this*
// fix — see `FullSlideSvg.test.tsx`'s dedicated
// `resolveOverrideBackgroundHex`/`ctx.defaultBg` tests for that (independently
// verified red pre-fix, green post-fix, by temporarily reverting the source
// change and re-running).
describe("asset-background content contrast (final-review Major finding, backlog item 1 sub-branch)", () => {
  const ASSET_BG: Slide["background"] = { kind: "asset", asset_id: "bg" }
  const ASSET_IMAGES: PptxIR["assets"] = { images: { bg: { src: "data:image/png;base64,AAAA" } } }

  // `tone-adaptive-content` used to be excluded here — real,
  // `auditDeck`-confirmed defect found while building this sweep,
  // independently root-caused, but unrelated to this task's own fix (this
  // file's own header documents the same "exclude, don't silently absorb"
  // methodology for exactly this situation — see "kpi_cards... dragged in
  // kpi.tsx's own unrelated, already-pinned defect" above).
  // `content-tone-adaptive-content.tsx`'s `withBg` branch (real asset
  // present, `hasBgImage(ir, slide)` true) painted a hardcoded-opaque
  // `fill="#FFFFFF"` card and then, unlike its own subheading two lines
  // below (correctly wrapped in `accessibleInk(colors.accent, "#FFFFFF",
  // ...)`), filled its heading directly with the bare theme token
  // `colors.text` (no `accessibleInk` wrap at all) and threaded
  // `colors.text`/`colors.muted` into `SvgContent` (body/footer) the same
  // unguarded way. Safe for the 9/13 themes whose `colors.text` is a dark
  // token (correct for *their own* page backgrounds) — broke for the 4 whose
  // `colors.text` is light because *their* own surface is dark
  // (`campaign`/`insight`/`luxe`/`tech`, confirmed by grepping every theme's
  // own `text:` token): a light token painted on this archetype's own
  // hardcoded-white card measured ~1:1, not a near-miss. Reproduced directly
  // (`campaign`, real render): heading/paragraph/bullets all rendered
  // `fill="#FFFFFF"` on the `fill="#FFFFFF"` card.
  //
  // Resolved (post-v0.3 backlog closure,
  // `.issues/notes/2026-07-18-post-v03-backlog.md` 新发现 (d)): heading,
  // `SvgContent`'s body/bullets (via a locally-derived `cardCtx`), and the
  // footer meta all now route through the same `accessibleInk` guard the
  // subheading already used, against the same card `"#FFFFFF"` reference —
  // see `content-tone-adaptive-content.tsx`'s own "白卡分支墨色修复" file-header
  // paragraph. Exclusion removed; this sweep now exercises every content
  // archetype including this one, for all 13 themes, with zero exceptions.

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: content archetypes clear contrast against the real painted auto-scrim, not colors.surface`, () => {
      const failures: string[] = []
      for (const layout of THEME_DEFINITIONS[themeId].layouts.content) {
        const slide: Slide = {
          type: "content",
          heading: HEADING,
          subheading: SUBHEADING,
          layout,
          components: CONTENT_BODY,
          background: ASSET_BG,
        } as Slide
        const ir: PptxIR = { ...deckFor(themeId, slide), assets: ASSET_IMAGES }
        const findings = auditFindings(ir).filter((f) => !isAllowlisted(themeId, layout, f))
        for (const f of findings) failures.push(`${layout}: ${findingSummary(f)}`)
      }
      expect(failures).toEqual([])
    })
  }
})
