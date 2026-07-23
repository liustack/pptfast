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
import { contrastRatio, requiredContrastRatio } from "../ink"
import { parseSvgRoot } from "../serialize"
import { mixHex } from "../components/color-mix"
import { BAND_OPACITY } from "../components/sankey"

beforeAll(() => {
  installNodePlatform()
})

const HEADING = "示例标题：验证对比度矩阵"
const SUBHEADING = "示例副标题：用于穷举扫描的**所见即所得**文案"

function deckFor(themeId: string, slide: Slide, images: PptxIR["assets"]["images"] = {}): PptxIR {
  return {
    version: "4",
    filename: "full-matrix-contrast-fixture",
    theme: { id: themeId },
    meta: {},
    assets: { images },
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
  // The rail-numbered entry that used to live here (audit-tool false
  // positive: the badge rect's 2,048px^2 area sitting below
  // MIN_BG_REGION_AREA made findContrastIssues fall back to the *page*
  // background instead of the badge's own primary fill) is gone — reclaimed
  // by the bench-driven fix round (defect A): `findContrastIssues` no longer
  // gates text-background *attribution* by that area floor at all (see its
  // own doc comment in deck-audit.ts), so the badge's self-painted rect is
  // now correctly found regardless of size, and the false positive this
  // entry existed to suppress no longer fires. See the dedicated
  // "rail-numbered badge attribution" describe block below (replaces this
  // entry's own former structural-precondition regression test) for the
  // real-render proof, swept across all 13 themes.
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
  // its heading/subheading/footnote. No longer paired with an ALLOWLIST
  // entry (the bench-driven fix round reclaimed it, see ALLOWLIST's own
  // comment above) — kept as a shape matcher, reused by the dedicated
  // "rail-numbered badge attribution" describe block below to locate the
  // badge finding/text without hardcoding its position.
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

// rail-numbered badge attribution (bench-driven fix round, defect A —
// reclaims the allowlist entry the task-1-routed-follow-up precondition
// guard this block replaces used to protect). That precondition guard
// pinned a *structural proxy* ("the badge rect's rendered area stays below
// MIN_BG_REGION_AREA") for why the allowlist entry was a tool artifact, not
// a real defect — true at the time, but the proxy's whole reason for
// existing was that `findContrastIssues` gated text-background attribution
// by that same area floor, so a badge below it fell through to the *wrong*
// background. That gate is gone (see MIN_BG_REGION_AREA's and
// `PaintedShape`'s own doc comments in deck-audit.ts): attribution now finds
// the badge's own self-painted rect regardless of its area, and the false
// positive the allowlist entry existed to suppress no longer fires — so
// there is nothing left to allowlist, and the entry itself was removed
// above. This block asserts the thing that actually matters now: a real
// render, swept across every canonical theme, produces zero low-contrast
// findings on the badge text.
describe("rail-numbered badge attribution (bench-driven fix round, defect A)", () => {
  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: the "{chapter}.{content}" badge text clears contrast against its own self-painted background`, () => {
      const slide: Slide = {
        type: "content",
        heading: HEADING,
        subheading: SUBHEADING,
        layout: "rail-numbered",
        components: CONTENT_BODY,
      } as Slide
      const findings = auditFindings(deckFor(themeId, slide))
      // Scoped to the badge's own text shape (not the whole finding set) —
      // this block's job is exactly the one thing that used to need an
      // allowlist entry; any other low-contrast finding under this layout
      // is still caught by the swept describe block below, unfiltered.
      const badgeFindings = findings.filter(
        (f) =>
          f.code === "low-contrast" &&
          TEXT_SHAPE_GUARD["rail-numbered"].test((f.detail as { text?: string } | undefined)?.text ?? ""),
      )
      expect(badgeFindings).toEqual([])
    })
  }
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
// reverted because it used to drag kpi.tsx's own row-layout delta-arrow
// defect into every archetype that renders it via the shared row-layout
// component — historically a *different, already-pinned* defect from this
// block's own (both are now fixed, see the "defect B real contrast fixes"
// describe block below; this block's own targeted fixture below predates
// that fix and stays as its own dedicated regression regardless). This
// defect was narrower: it lived only in `content-bento-panel.tsx`'s own
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

// Bench-driven fix round, defect A handoff (Task 3): the five B-group call
// sites `deck-audit.test.ts`'s own "B-group ink fixes" describe block pins
// against one representative theme each — swept here across all 13 themes
// for the full regression net, same targeted-fixture idiom as the
// bento-panel kpi_cards block above (a component-level defect, not an
// archetype one, so a single fixed layout is the right scope, not a
// per-theme layout sweep). All five hardcoded an unwrapped ink with no
// `accessibleInk`/`readableOn` call — `steps.tsx`/`roadmap.tsx`'s
// `fill="#FFFFFF"` badge digit, `rings.tsx`/`image-compare.tsx`'s "VS"
// badge `fill={ctx.colors.surface}`, `image-compare.tsx`'s "AFTER" chip
// (`before_after` style) `fill={ctx.colors.surface}` — now all routed
// through `accessibleInk` against the badge/chip's own painted fill. A
// byte-for-byte render diff (old vs. new component code, all 13 themes,
// task report) confirms the fix changes rendered output on *exactly* the
// themes below and leaves every other theme byte-identical — the "dark-
// badge themes where the old ink already passed stay byte-identical"
// invariant, verified, not assumed.
describe("B-group ink fixes — full 13-theme sweep (bench-driven fix round, defect A handoff, Task 3)", () => {
  const STEPS_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [{ type: "steps", items: [{ title: "Step one", text: "do the first thing" }] }],
  } as Slide
  const ROADMAP_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      { type: "roadmap", items: [{ title: "Kickoff", period: "Q1", rows: [{ label: "Scope", value: "discovery" }] }] },
    ],
  } as Slide
  const RINGS_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [{ type: "rings", items: [{ label: "Core", desc: "inner layer" }] }],
  } as Slide
  const IMAGE_COMPARE_VS_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      { type: "image_compare", left: { asset_id: "a", label: "Before" }, right: { asset_id: "b", label: "After" }, style: "vs" },
    ],
  } as Slide
  const IMAGE_COMPARE_BEFORE_AFTER_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "image_compare",
        left: { asset_id: "a", label: "Before" },
        right: { asset_id: "b", label: "After" },
        style: "before_after",
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: steps.tsx badge digit clears contrast against its own circle`, () => {
      const findings = auditFindings(deckFor(themeId, STEPS_SLIDE))
      expect(findings.filter((f) => f.code === "low-contrast" && f.detail?.text === "1")).toEqual([])
    })

    it(`${themeId}: roadmap.tsx badge digit clears contrast against its own circle`, () => {
      const findings = auditFindings(deckFor(themeId, ROADMAP_SLIDE))
      expect(findings.filter((f) => f.code === "low-contrast" && f.detail?.text === "01")).toEqual([])
    })

    it(`${themeId}: rings.tsx core label clears contrast against its own circle`, () => {
      const findings = auditFindings(deckFor(themeId, RINGS_SLIDE))
      expect(findings.filter((f) => f.code === "low-contrast" && f.detail?.text === "Core")).toEqual([])
    })

    it(`${themeId}: image-compare.tsx "VS" badge clears contrast against its own circle`, () => {
      const findings = auditFindings(deckFor(themeId, IMAGE_COMPARE_VS_SLIDE))
      expect(findings.filter((f) => f.code === "low-contrast" && f.detail?.text === "VS")).toEqual([])
    })

    it(`${themeId}: image-compare.tsx "AFTER" chip clears contrast against its own chip`, () => {
      const findings = auditFindings(deckFor(themeId, IMAGE_COMPARE_BEFORE_AFTER_SLIDE))
      expect(
        findings.filter((f) => f.code === "low-contrast" && (f.detail?.text === "AFTER" || f.detail?.text === "BEFORE")),
      ).toEqual([])
    })
  }
})

// Bench-driven fix round, defect B (Task 3): the plan named five real
// contrast defects for re-test once defect A's attribution fix landed.
// Three of the five turned out to be genuinely real once measured against
// a real render (not assumed from the plan's own theme-name shorthand) and
// are fixed + netted here — `kpi.tsx`'s delta arrow (both its own row
// layout *and* `content-bento-panel.tsx`'s separate bento-cell call site,
// same shared `deltaProps` root cause, found failing on every one of the
// 13 themes across the two call sites combined once actually swept, not
// just the plan's named journal/enterprise), `numbered_cards.tsx`'s large
// digit (classroom 2.09:1, academic 2.92:1 — both measured, matching the
// plan's own "<3:1" description), and `quote.tsx`'s decorative open-quote
// mark (heritage 2.61:1, plus consulting 1.45:1 — the latter already a
// known pre-existing pin in `deck-audit.test.ts`, removed from that
// "understood, not fixed" list now that it's actually fixed here).
//
// The other two named items were measured and found **not reproducible**
// as new/un-adjudicated defects:
//   - "journal chapter folio numerals": every one of journal's 8 curated
//     chapter archetypes renders zero low-contrast findings except
//     `fashion-chapter`, whose only numeral-shaped finding is its giant
//     chapter-number watermark digit — already covered by this file's own
//     `ALLOWLIST` entry above (`theme: "*"`, `ratioMin`/`ratioMax`
//     1.2-1.8; journal's own measured ratio, 1.459, is literally recorded
//     in that entry's own spread comment). Deliberately faint by design
//     (`chapter-fashion-chapter.tsx`'s own header calls it decorative), not
//     a "folio" (a small running chapter-number label) by any reasonable
//     reading of that term — the watermark is a 420px full-bleed digit.
//   - "classroom×fashion-chapter kicker": `fashion-chapter`'s actual kicker
//     text (the small "CHAPTER 01" line, `fill={readableOn(colors.accent)}`
//     — an editorial kicker in the conventional sense) renders zero
//     findings for classroom, confirmed by direct measurement. This exact
//     combination was the named subject of an *earlier* fix
//     (`themes/definitions.ts`'s own history comment: `readableOn`'s W8
//     two-ink-comparison fix cleared classroom's fashion-chapter text,
//     re-measured 8.19:1). The only finding under this combo is, again,
//     the same already-allowlisted watermark digit (classroom's own ratio,
//     1.537, also recorded in the `ALLOWLIST` entry's spread comment) —
//     not the kicker, and not a new defect.
// Both are documented here rather than silently dropped from the plan's own
// checklist — see the task report for the full measurement.
describe("defect B real contrast fixes (bench-driven fix round, Task 3)", () => {
  const KPI_UP_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    components: [{ type: "kpi_cards", items: [{ value: "1", label: "x", delta: "up" }] }],
  } as Slide
  const KPI_DOWN_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    components: [{ type: "kpi_cards", items: [{ value: "1", label: "x", delta: "down" }] }],
  } as Slide
  const BENTO_KPI_UP_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "bento-panel",
    components: [
      {
        type: "kpi_cards",
        items: [
          { value: "13", label: "one", delta: "up" },
          { value: "24", label: "two" },
        ],
      },
    ],
  } as Slide
  const BENTO_KPI_DOWN_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "bento-panel",
    components: [
      {
        type: "kpi_cards",
        items: [
          { value: "13", label: "one", delta: "down" },
          { value: "24", label: "two" },
        ],
      },
    ],
  } as Slide
  const NUMBERED_CARDS_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    components: [
      {
        type: "numbered_cards",
        items: [
          { title: "First", text: "one" },
          { title: "Second", text: "two" },
        ],
      },
    ],
  } as Slide
  const QUOTE_SLIDE: Slide = {
    type: "content",
    arrangement: "quote",
    heading: HEADING,
    components: [{ type: "quote", text: "an attributed quotation", attribution: "Someone" }],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: kpi.tsx's up-delta arrow clears contrast against its own card surface`, () => {
      const findings = auditFindings(deckFor(themeId, KPI_UP_SLIDE))
      expect(findings.filter((f) => f.code === "low-contrast" && f.detail?.text === "↑")).toEqual([])
    })

    it(`${themeId}: kpi.tsx's down-delta arrow clears contrast against its own card surface`, () => {
      const findings = auditFindings(deckFor(themeId, KPI_DOWN_SLIDE))
      expect(findings.filter((f) => f.code === "low-contrast" && f.detail?.text === "↓")).toEqual([])
    })

    it(`${themeId}: content-bento-panel.tsx's up-delta arrow clears contrast against its own cell surface`, () => {
      const findings = auditFindings(deckFor(themeId, BENTO_KPI_UP_SLIDE))
      expect(findings.filter((f) => f.code === "low-contrast" && f.detail?.text === "↑")).toEqual([])
    })

    it(`${themeId}: content-bento-panel.tsx's down-delta arrow clears contrast against its own cell surface`, () => {
      const findings = auditFindings(deckFor(themeId, BENTO_KPI_DOWN_SLIDE))
      expect(findings.filter((f) => f.code === "low-contrast" && f.detail?.text === "↓")).toEqual([])
    })

    it(`${themeId}: numbered_cards.tsx's large digit clears contrast against the page background`, () => {
      const findings = auditFindings(deckFor(themeId, NUMBERED_CARDS_SLIDE))
      expect(
        findings.filter((f) => f.code === "low-contrast" && (f.detail?.text === "01" || f.detail?.text === "02")),
      ).toEqual([])
    })

    it(`${themeId}: quote.tsx's decorative open-quote mark clears contrast against the page background`, () => {
      const findings = auditFindings(deckFor(themeId, QUOTE_SLIDE))
      expect(findings.filter((f) => f.code === "low-contrast" && f.detail?.text === "“")).toEqual([])
    })
  }
})

// Bench-driven fix round, Task 4 review m2 (routed minor): the two guards
// dc2183f (defect B, Task 3) landed above —
// `accessibleInk(colors.accent, ctx.defaultBg ?? colors.bg, fontSize)` in
// both `numbered-cards.tsx` and `quote.tsx` — were only proven against a
// content slide with *no* `slide.background` override, where `ctx.defaultBg`
// resolves straight to `themeDefaultBg` (`FullSlideSvg.tsx`). Task 3's own
// review verified the same guard also holds on the *asset-scrim* branch (a
// content slide with `background: { kind: "asset", ... }`, where
// `ctx.defaultBg` instead flows through `resolveOverrideBackgroundHex`'s
// asset case — fixed in an earlier task, 03976da, to resolve to
// `paintedFallback`/`themeDefaultBg`, the color `Background.tsx`'s
// auto-scrim actually paints, not `tokens.colors.surface`) across all 13
// themes — but only with throwaway, uncommitted probes, leaving this branch
// without a durable regression net. `paintedFallback` currently equals
// `themeDefaultBg` for every theme (see the two doc comments cited above),
// so this describe block's per-theme pass/fail outcomes are expected to
// match the plain-background block right above it byte-for-byte — the
// point isn't a *different* result, it's guarding the *different code path*
// that produces it: a regression in `resolveOverrideBackgroundHex`'s asset
// branch (e.g. reverting `paintedFallback` back to `surfaceFallback`) would
// slip past every test above, none of which ever sets `slide.background`,
// while this block would catch it immediately.
describe("defect B ink guards hold on the asset-scrim ctx.defaultBg branch (Task 4 review m2)", () => {
  // Minimal-but-real data URI, same pattern already established for a
  // resolved asset background in this suite's sibling file
  // (`deck-audit.test.ts`'s own asset/scrim fixtures) — `auditDeck` never
  // decodes pixel dimensions off it, only checks `src` truthiness
  // (`hasBgImage`, `ImagePages.tsx`/`ToneAdaptiveContent`'s own asset-branch
  // guard), so a tiny placeholder is sufficient and does not skew geometry.
  const ASSET_BG_IMAGES: PptxIR["assets"]["images"] = { bg: { src: "data:image/png;base64,AAAA" } }
  const NUMBERED_CARDS_ASSET_BG_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    background: { kind: "asset", asset_id: "bg" },
    components: [
      {
        type: "numbered_cards",
        items: [
          { title: "First", text: "one" },
          { title: "Second", text: "two" },
        ],
      },
    ],
  } as Slide
  const QUOTE_ASSET_BG_SLIDE: Slide = {
    type: "content",
    arrangement: "quote",
    heading: HEADING,
    background: { kind: "asset", asset_id: "bg" },
    components: [{ type: "quote", text: "an attributed quotation", attribution: "Someone" }],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: numbered_cards.tsx's large digit clears contrast against the asset-scrim background`, () => {
      const findings = auditFindings(deckFor(themeId, NUMBERED_CARDS_ASSET_BG_SLIDE, ASSET_BG_IMAGES))
      expect(
        findings.filter((f) => f.code === "low-contrast" && (f.detail?.text === "01" || f.detail?.text === "02")),
      ).toEqual([])
    })

    it(`${themeId}: quote.tsx's decorative open-quote mark clears contrast against the asset-scrim background`, () => {
      const findings = auditFindings(deckFor(themeId, QUOTE_ASSET_BG_SLIDE, ASSET_BG_IMAGES))
      expect(findings.filter((f) => f.code === "low-contrast" && f.detail?.text === "“")).toEqual([])
    })
  }

  // Distinguishing assertion (red-pre-fix-by-construction, same discipline
  // FullSlideSvg.test.tsx's own 03976da regression uses, and verified red by
  // literally reverting FullSlideSvg.tsx's `defaultBg` asset branch back to
  // `tokens.colors.surface` and re-running this file: academic is the theme
  // that flips under that revert, not every theme — `accessibleInk`'s
  // fallback ink can coincidentally clear both candidate backgrounds for
  // some themes, so this is an empirically-chosen witness, not a guessed
  // one). `colors.accent` ("#00A878") measures 2.92:1 against academic's
  // real content-slide background ("#FAFAF6", `defaultBackgrounds.content`
  // — the exact value this file's own "defect B real contrast fixes" block
  // above cites for the plain-background case) but 3.06:1 against
  // `colors.surface` ("#FFFFFF", the pre-03976da wrong asset-branch
  // fallback) — straddling the 3:1 large-text floor in exactly the
  // direction that makes a wrong ink decision (measured against surface)
  // disagree with what the asset-scrim branch actually paints (the real
  // scrim, themeDefaultBg): `accessibleInk` would wrongly keep the raw
  // accent color, and the audit — which independently reads the real
  // painted scrim, not the ink decision's own background — would catch it.
  it("regression lock: academic's asset-scrim ctx.defaultBg agrees with the real painted scrim, not colors.surface (the pre-03976da wrong fallback)", () => {
    expect(contrastRatio("#00A878", "#FAFAF6")).toBeLessThan(3)
    expect(contrastRatio("#00A878", "#FFFFFF")).toBeGreaterThanOrEqual(3)
    const numberedFindings = auditFindings(deckFor("academic", NUMBERED_CARDS_ASSET_BG_SLIDE, ASSET_BG_IMAGES))
    expect(
      numberedFindings.filter((f) => f.code === "low-contrast" && (f.detail?.text === "01" || f.detail?.text === "02")),
    ).toEqual([])
    const quoteFindings = auditFindings(deckFor("academic", QUOTE_ASSET_BG_SLIDE, ASSET_BG_IMAGES))
    expect(quoteFindings.filter((f) => f.code === "low-contrast" && f.detail?.text === "“")).toEqual([])
  })
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
  // (flat-surface) — `renderCard`'s own accent bar (`roundedTopBarPath`, an
  // SVG arc `<path>`) used to trigger a `pathBoundingBox` limitation in
  // deck-audit.ts (extracting every numeric token from the arc's `d` string
  // and taking min/max misread the arc's radius/flag parameters as
  // coordinates, inflating the accent bar's computed bbox from ~8px tall to
  // ~the whole card, which won the background lookup for the row-label text
  // underneath it) — **resolved** (`fix/arc-bbox`): `pathBoundingBox` is now
  // path-grammar-aware (walks `d` command-by-command, arcs handled via
  // endpoint->center parameterization, see that function's own doc comment
  // in deck-audit.ts), so the row-label correctly resolves against the
  // card's real `colors.surface` rect, matching this entry's classification
  // for the first time rather than by coincidence. That same fix also
  // exposed a *real*, previously-masked defect one level up: `renderCard`'s
  // `period` text (an unguarded `colors.accent` fill) used to resolve
  // against the accent bar's own bogus phantom region — whose fill is that
  // same `colors.accent` value — scoring a trivial ratio=1 "pass" on every
  // theme; measured against the real card background, 8/13 themes
  // genuinely fail 4.5:1. Fixed via `accessibleInk` (same precedent this
  // file's own numbered badge digit already used) — see
  // `deck-audit.test.ts`'s "arc-bbox reclassification ink fixes" describe
  // block for the red->green pin. `renderCard`'s numbered *badge circle*
  // (a `<circle>`, not this path) was a separate, already-fixed story (the
  // bench-driven fix round's own win, see that round's own report) —
  // unrelated to this fix, unaffected by it.
  roadmap: "flat-surface",
  // The one real "needs-fixture" gap this fix round closes — see the
  // dedicated describe block below.
  matrix: "needs-fixture",
  // insight_panel.tsx's footnote/row text sits on the panel's
  // colors.surface shell (flat-surface) — same roundedTopBarPath phantom-
  // background history as roadmap above (insight_panel.tsx uses the
  // identical helper), **resolved** the same way (`fix/arc-bbox`). Unlike
  // roadmap, insight_panel has no badge circle, but its own `title` had the
  // same unguarded-`colors.accent`-on-phantom-region defect as roadmap's
  // `period` — same `accessibleInk` fix, same red->green pin (see
  // `deck-audit.test.ts`).
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
  // Structure-components wave 2 task 1: pest.tsx's `badgeFill` "social" case
  // returns `colors.muted` (same role as swot.tsx's "weaknesses" case) —
  // only ever a `panelFill` tint source / `accessibleInk` candidate, never
  // an unconditional text fill (title/item text always renders
  // `colors.text` routed through `accessibleInk` against the real panel).
  // Same "no-muted-fill" classification as swot for the same reason; the
  // tinted-panel background itself is covered below, "pest tinted-panel
  // contrast".
  pest: "no-muted-fill",
  // five-forces.tsx's `forceToken` "supplier_power" case returns
  // `colors.muted` — identical role (tint/candidate source only, the
  // intensity marker's filled dots reuse the same token but paint no text
  // either). A third use (review fix round, Low: enumeration was
  // incomplete, conclusion unaffected): `render`'s `lineColor =
  // ctx.colors.muted` feeds every hub-and-spoke `<line>`'s `stroke` — a
  // decorative connector, not text, so `findContrastIssues` (which only
  // ever walks `<text>`/`<tspan>`) can never attribute a finding to it
  // either. Same classification, same reasoning as pest above; the
  // tinted-panel background itself is covered below, "five_forces
  // tinted-panel contrast".
  five_forces: "no-muted-fill",
  // Structure-components wave 2 task 2: heatmap.tsx renders `colors.muted`
  // for its column headers (x_labels), row headers (y_labels), and the
  // optional x_title/y_title axis captions — every one of them directly on
  // the ambient page background, never on a self-painted cell (mirroring
  // chart-svg.tsx's own category-axis labels and matrix.tsx's x_title/
  // y_title, both already "page-bg"). The one genuinely self-painted-surface
  // text this component renders — the optional per-cell value
  // (`show_values`) — is never `colors.muted`; it's `colors.text` routed
  // through `accessibleInk` against that cell's own computed fill (see the
  // dedicated "heatmap cell-fill x ink" sweep below, decision 7's mandate).
  heatmap: "page-bg",
  // Structure-components wave 2 task 3: sankey.tsx never references
  // `colors.muted` at all — its one text-bearing surface (the node label)
  // renders via `accessibleInk(colors.text, ctx.defaultBg ?? colors.bg, …)`,
  // deliberately routed through the ambient page background rather than a
  // self-painted rect: a label sits immediately beside its node bar (not on
  // top of it), and flow bands render at `BAND_OPACITY` (0.45) — below
  // `deck-audit.ts`'s own `MIN_BG_OPACITY` (0.5) by deliberate design (see
  // `sankey.tsx`'s own header comment) so a band can never become a
  // contrast-attribution background candidate regardless of how a label's
  // box happens to overlap one. Link values are deliberately not rendered as
  // text at all (unlike heatmap's `show_values`), so there is no second
  // self-painted-surface surface to track here.
  sankey: "no-muted-fill",
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
    // `Object.hasOwn(NARRATIVE_PRESETS, input)` check, `src/narrative/
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

// Structure-components wave 2 task 1, decision 7 (same mandate as wave 1's
// own swot/bmc block above): pest.tsx tints all 4 quadrant panels
// (`mixHex(colors.surface, <token>, t)`, the same primitive) — never renders
// `colors.muted` as an unconditional text fill (see MUTED_SURFACE_CLASS's
// "no-muted-fill" entry above), so this sweep asserts zero `low-contrast`
// findings outright, same as the swot/bmc block.
describe("pest tinted-panel contrast (structure-components wave 2 task 1, decision 7)", () => {
  // Exercises all 4 quadrant token branches (primary/accent/muted/
  // primary-muted-blend — pest.tsx's `badgeFill` switch) with 2 items per
  // quadrant, one quadrant's title overridden so the inline-title path
  // renders too.
  const PEST_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "pest",
        political: { items: ["数据合规监管趋严", "跨境审查政策收紧"] },
        economic: { title: "宏观经济", items: ["利率下行周期", "消费信心指数回升"] },
        social: { items: ["消费习惯代际迁移", "远程办公常态化"] },
        technological: { items: ["生成式AI快速渗透", "边缘计算成本下降"] },
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: pest renders with zero auditDeck findings (contrast, overflow, out-of-bounds)`, () => {
      expect(auditFindings(deckFor(themeId, PEST_SLIDE))).toEqual([])
    })
  }
})

// Structure-components wave 2 task 1, decision 7: five-forces.tsx tints all
// 5 force panels (same `mixHex` primitive) — never renders `colors.muted` as
// an unconditional text fill (see MUTED_SURFACE_CLASS's "no-muted-fill"
// entry above), so this sweep asserts zero `low-contrast` findings outright.
describe("five_forces tinted-panel contrast (structure-components wave 2 task 1, decision 7)", () => {
  // Exercises all 5 panel token branches (accent/primary/muted/
  // primary-accent-blend/accent-muted-blend — five-forces.tsx's
  // `forceToken` switch), all 3 intensity levels across the 5 panels
  // (including the center `rivalry` panel), and the native connector lines.
  const FIVE_FORCES_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "five_forces",
        rivalry: { items: ["头部三家份额超60%", "价格战常态化"], intensity: "high" },
        new_entrants: { items: ["牌照与资质壁垒高"], intensity: "low" },
        supplier_power: { items: ["核心元器件二供不足", "原材料价格波动大"], intensity: "medium" },
        buyer_power: { items: ["大客户集中度高"], intensity: "medium" },
        substitutes: { items: ["开源方案免费可用", "替代技术路线成熟"], intensity: "high" },
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: five_forces renders with zero auditDeck findings (contrast, overflow, out-of-bounds)`, () => {
      expect(auditFindings(deckFor(themeId, FIVE_FORCES_SLIDE))).toEqual([])
    })
  }
})

// bench-driven fix round, defect F (bmc bottom-row overflow,
// `tests/bench/questions/q07` evidence): `BMC_SLIDE` above (1-2 items per
// block) never exercised the schema's own ceiling — 4 items in every one of
// the 9 named blocks (`z.array(z.string()).min(1).max(4)`, `src/ir/index.ts`)
// — which a real bench-generated deck actually produced (q07's
// qwen3.6-27b answer.json: 4 items in all 9 blocks, verbatim below). Pre-fix,
// `bmc.tsx`'s `render` floored its own drawn height at the natural
// (unstretched) total and never shrank below `box.h` — a full-body
// component (`SvgContent.tsx`) gets the archetype's *fixed* content-rect
// height verbatim, never a box sized to its own `measure()` return value —
// so schema-max content overflowed the content rect on every one of the 13
// themes (empirically confirmed pre-fix: 2 v-overflow findings per theme,
// both in the bottom band — `cost_structure`/`revenue_streams` — the last
// band painted and the first to spill). Fixed by shrinking every cell's font
// size/vertical rhythm by the same proportion the box is short by (`bmc.tsx`
// file header, "The inverse case"). `narrow-column` specifically (not one of
// the other 6 content archetypes) — the narrowest, most content-constrained
// curated layout (880px column, 410px content-rect height at this heading),
// so a clean sweep here is real headroom evidence, not a softball; the task
// report's own probe additionally swept all 7 content archetypes × all 13
// themes at this same schema-max fixture (91 combinations, 0 findings) for
// broader confidence beyond this committed regression's one archetype.
describe("bmc bottom-row overflow (bench-driven fix round, defect F)", () => {
  const BMC_SCHEMA_MAX_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "bmc",
        key_partners: ["核心原材料供应商", "第三方物流服务商", "云基础设施提供商", "行业协会与标准组织"],
        key_activities: ["平台核心算法研发", "多系统API对接与集成", "客户成功与培训体系", "生态伙伴拓展与管理"],
        key_resources: ["资深算法与工程团队", "脱敏供应链历史数据库", "高可用云算力集群", "核心专利与软件著作权"],
        value_propositions: ["库存周转天数降低30%", "全链路实时可视化追踪", "基于AI的智能需求预测", "零代码无缝系统对接"],
        customer_relationships: ["专属客户成功经理", "自动化自助服务门户", "季度业务复盘与共创会", "开发者与技术社区"],
        channels: ["直销团队重点攻坚", "行业峰会与线下展会", "现有合作伙伴转介", "技术白皮书与内容营销"],
        customer_segments: ["中大型离散制造企业", "头部跨境电商卖家", "第三方物流运营商", "全国性零售连锁集团"],
        cost_structure: ["研发与工程人力成本", "云服务器与带宽费用", "市场推广与销售佣金", "数据安全与合规投入"],
        revenue_streams: ["SaaS基础版订阅年费", "按调用量计费的API服务", "定制化实施与培训费", "高级数据分析模块授权"],
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: schema-max bmc (4 items in every block) renders with zero auditDeck findings on the narrowest curated content archetype`, () => {
      expect(auditFindings(deckFor(themeId, BMC_SCHEMA_MAX_SLIDE))).toEqual([])
    })
  }
})

// Task 1 fix round (post-review, controller scope addition): `swot.tsx`
// never got a dedicated schema-max sweep of its own (only the 1-2-item
// "swot/bmc tinted-panel contrast" fixture above) — closed now that
// `swot.tsx` carries the same `fontScale` defect-F fix `bmc.tsx`/
// `pest.tsx`/`five-forces.tsx` already have. 5 items in every one of swot's
// 4 quadrants (`z.array(z.string()).min(1).max(5)`, `ir/index.ts`), on
// `narrow-column`, this suite's own narrowest curated content archetype.
describe("swot schema-max content (fix round, controller scope addition)", () => {
  const SWOT_SCHEMA_MAX_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "swot",
        strengths: ["强大的品牌认知度", "稳定的现金流", "经验丰富的管理团队", "自有核心技术平台", "客户复购率高"],
        weaknesses: ["产品线相对单一", "对单一渠道依赖度高", "国际化程度不足", "核心系统老化", "低毛利细分市场占比高"],
        opportunities: ["新兴市场快速增长", "政策利好窗口期", "邻近品类扩张空间", "潜在战略合作机会", "可持续发展需求上升"],
        threats: ["新进入者价格战风险", "关键原材料成本上升", "汇率波动敞口", "消费者偏好快速迁移", "数据隐私监管趋严"],
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: schema-max swot (5 items in every quadrant) renders with zero auditDeck findings on the narrowest curated content archetype`, () => {
      expect(auditFindings(deckFor(themeId, SWOT_SCHEMA_MAX_SLIDE))).toEqual([])
    })
  }
})

// Task 1 fix round (post-review, controller scope addition): the
// reviewer's own repro shape — schema-max content *and* a heading long
// enough to force a 2-line wrap *and* the narrowest curated archetype, all
// three at once (`five-forces.tsx`'s file header already named this
// compound gap as an unresolved residual for that component; this pins
// whether `swot` — now carrying the identical fix — clears it too, rather
// than leaving that claim as prose only). English item text (`fitSvgLine`'s
// Latin-script measurement path, not the CJK path the block above
// exercises) at schema-max density, under a 32-char heading long enough to
// wrap to 2 lines on every one of the 13 themes.
describe("swot zero-residual under a 2-line-wrapped heading + schema-max content (fix round)", () => {
  const SWOT_LONG_HEADING_SLIDE: Slide = {
    type: "content",
    heading: "Competitive Landscape Deep-Dive",
    layout: "narrow-column",
    components: [
      {
        type: "swot",
        strengths: ["Strong brand recognition", "Stable cash flow", "Experienced leadership", "Proprietary tech platform", "item number 5"],
        weaknesses: ["Narrow product line", "High channel dependency", "Limited global presence", "Aging infrastructure", "item number 5"],
        opportunities: ["Fast-growing markets", "Favorable policy window", "Adjacent category growth", "Partnership potential", "item number 5"],
        threats: ["New entrant price wars", "Rising material costs", "Currency volatility", "Shifting preferences", "item number 5"],
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: swot clears the reviewer's compound repro shape with zero findings`, () => {
      expect(auditFindings(deckFor(themeId, SWOT_LONG_HEADING_SLIDE))).toEqual([])
    })
  }
})

// Structure-components wave 2 task 1, same defect-F discipline as bmc's own
// schema-max sweep above: 5 items in every one of pest's 4 quadrants
// (`z.array(z.string()).min(1).max(5)`, `ir/index.ts` — the schema's own
// ceiling), on `narrow-column`, this suite's own narrowest curated content
// archetype.
describe("pest schema-max content (structure-components wave 2 task 1)", () => {
  const PEST_SCHEMA_MAX_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "pest",
        political: {
          items: ["数据合规监管趋严", "跨境审查政策收紧", "反垄断调查加码", "行业准入牌照收紧", "劳动用工新规落地"],
        },
        economic: {
          items: ["利率下行周期", "消费信心指数回升", "人民币汇率波动", "大宗商品价格上涨", "地方财政压力上升"],
        },
        social: {
          items: ["消费习惯代际迁移", "远程办公常态化", "人口老龄化加速", "下沉市场消费升级", "健康与可持续偏好上升"],
        },
        technological: {
          items: ["生成式AI快速渗透", "边缘计算成本下降", "5G应用场景扩展", "自动化生产线普及", "数据安全技术升级"],
        },
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: schema-max pest (5 items in every quadrant) renders with zero auditDeck findings on the narrowest curated content archetype`, () => {
      expect(auditFindings(deckFor(themeId, PEST_SCHEMA_MAX_SLIDE))).toEqual([])
    })
  }
})

// Task 1 fix round (post-review, High finding): the reviewer's own repro
// shape — schema-max content *and* a heading long enough to force a 2-line
// wrap *and* the narrowest curated archetype, all three at once
// (`five-forces.tsx`'s file header already named this compound gap as an
// unresolved residual for that component; this pins whether `pest` — now
// carrying the identical fix — clears it too, rather than leaving that
// claim as prose only). English item text (`fitSvgLine`'s Latin-script
// measurement path, not the CJK path the block above exercises) at
// schema-max density, under a 32-char heading long enough to wrap to 2
// lines on every one of the 13 themes.
describe("pest zero-residual under a 2-line-wrapped heading + schema-max content (fix round)", () => {
  const PEST_LONG_HEADING_SLIDE: Slide = {
    type: "content",
    heading: "Competitive Landscape Deep-Dive",
    layout: "narrow-column",
    components: [
      {
        type: "pest",
        political: { items: ["Tightening regulation", "Rising trade tariffs", "New antitrust scrutiny", "Labor law changes", "item number 5"] },
        economic: { items: ["Falling interest rates", "Confidence rebound", "Currency volatility", "Rising input costs", "item number 5"] },
        social: { items: ["Generational shift", "Normalized remote work", "Aging population", "Sustainability demand", "item number 5"] },
        technological: { items: ["Generative-AI adoption", "Falling compute cost", "5G rollout expanding", "Automation of lines", "item number 5"] },
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: pest clears the reviewer's compound repro shape with zero findings`, () => {
      expect(auditFindings(deckFor(themeId, PEST_LONG_HEADING_SLIDE))).toEqual([])
    })
  }
})

// Structure-components wave 2 task 1, same defect-F discipline as bmc's own
// schema-max sweep above: 5 items in every one of five_forces' 5 panels
// (`z.array(z.string()).min(1).max(5)`, `ir/index.ts` — the schema's own
// ceiling), on `narrow-column`, this suite's own narrowest curated content
// archetype. This is the fixture that first surfaced this file's own
// bench-driven-fix-round-style defect (three stacked full-width bands need
// more vertical room than bmc's own two-band, multi-column canvas) — see
// `five-forces.tsx`'s own file header for the fix (`fontScale`, ported from
// `bmc.tsx`) and its one documented residual gap.
describe("five_forces schema-max content (structure-components wave 2 task 1)", () => {
  const FIVE_FORCES_SCHEMA_MAX_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "five_forces",
        rivalry: {
          intensity: "high",
          items: ["头部三家份额超60%", "价格战常态化", "产品同质化严重", "获客成本持续攀升", "存量市场竞争加剧"],
        },
        new_entrants: {
          intensity: "low",
          items: ["牌照与资质壁垒高", "规模效应门槛高", "渠道资源稀缺", "初始资本投入大", "品牌信任建立周期长"],
        },
        supplier_power: {
          intensity: "medium",
          items: ["核心元器件二供不足", "原材料价格波动大", "供应商集中度高", "切换成本较高", "长期锁定合约限制"],
        },
        buyer_power: {
          intensity: "medium",
          items: ["大客户集中度高", "比价平台信息透明", "切换供应商成本低", "集采议价能力强", "定制化需求增多"],
        },
        substitutes: {
          intensity: "high",
          items: ["开源方案免费可用", "替代技术路线成熟", "跨行业解决方案渗透", "自建能力意愿上升", "性价比替代品增多"],
        },
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: schema-max five_forces (5 items in every panel, all intensity levels) renders with zero auditDeck findings on the narrowest curated content archetype`, () => {
      expect(auditFindings(deckFor(themeId, FIVE_FORCES_SCHEMA_MAX_SLIDE))).toEqual([])
    })
  }
})

// Structure-components wave 2 task 2, decision 4/5: heatmap.tsx is the one
// component in this whole wave whose self-painted surface is a *computed*
// color, not a fixed theme token blend (matrix.tsx's `toneFill` still only
// ever picks from 3 fixed tone branches) — every cell's fill is a
// continuous function of its own value (`cellFill`/`valueT`,
// `heatmap.tsx`), so the value→color→ink chain needs its own dedicated
// sweep rather than reusing swot/pest/five_forces' "assert zero findings
// outright" shape verbatim. Two blocks below: a basic representative-content
// sweep (mirrors the pattern above) and a schema-max 10x10 sweep, both zero
// auditDeck findings across all 13 themes — followed by a third, narrower
// block that isolates the cell-value-text-vs-cell-fill contrast pair
// specifically (decision 7's mandate: "any tinted/computed background needs
// a dedicated probe"), sweeping a wide value spread (including the
// domain extremes, which sit at the ramp's two ends where a marginal ink
// choice is most likely to fail) plus a negative-inclusive distribution.
describe("heatmap contrast (structure-components wave 2 task 2)", () => {
  const HEATMAP_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "heatmap",
        x_labels: ["一季度", "二季度", "三季度", "四季度"],
        y_labels: ["华东", "华南", "华北"],
        values: [
          [12, 45, 78, 33],
          [-20, 5, 60, 90],
          [50, 50, 50, 50],
        ],
        show_values: true,
        x_title: "季度",
        y_title: "区域",
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: heatmap renders with zero auditDeck findings (contrast, overflow, out-of-bounds)`, () => {
      expect(auditFindings(deckFor(themeId, HEATMAP_SLIDE))).toEqual([])
    })
  }

  const heatmapLabels = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)
  const HEATMAP_SCHEMA_MAX_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "heatmap",
        x_labels: heatmapLabels(10, "列"),
        y_labels: heatmapLabels(10, "行"),
        values: Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => r * 10 + c)),
        show_values: true,
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: schema-max heatmap (10x10 grid, show_values on) renders with zero auditDeck findings on the narrowest curated content archetype`, () => {
      expect(auditFindings(deckFor(themeId, HEATMAP_SCHEMA_MAX_SLIDE))).toEqual([])
    })
  }
})

// The cell-fill x ink probe named above: isolates value→color→ink
// specifically, at the ramp's two extremes (domain min/max — where
// `accessibleInk`'s fallback is most likely to actually need to engage,
// since the fill there sits furthest from `colors.surface`) plus a
// negative-inclusive distribution and a fully degenerate one (every value
// equal — the flat mid-tone `valueT` returns for a zero-range domain).
// Every `low-contrast` finding, if any survived, would name the offending
// fill/ink pair (`AuditFinding.detail`) — asserting the finding set outright
// is empty is the same "stronger, more honest claim" swot/bmc/pest/
// five_forces' own tinted-panel blocks already settled on.
describe("heatmap cell-fill x ink (structure-components wave 2 task 2, decision 7 — the hard part named by the controller ruling)", () => {
  const EXTREMES_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "heatmap",
        x_labels: ["min", "mid", "max"],
        y_labels: ["row"],
        values: [[0, 50, 100]],
        show_values: true,
      },
    ],
  } as Slide

  const NEGATIVE_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "heatmap",
        x_labels: ["a", "b", "c", "d"],
        y_labels: ["row"],
        values: [[-100, -25, 0, 40]],
        show_values: true,
      },
    ],
  } as Slide

  const DEGENERATE_SLIDE: Slide = {
    type: "content",
    heading: HEADING,
    layout: "narrow-column",
    components: [
      {
        type: "heatmap",
        x_labels: ["a", "b", "c"],
        y_labels: ["row"],
        values: [[7, 7, 7]],
        show_values: true,
      },
    ],
  } as Slide

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: cell value text clears contrast at both ramp extremes (domain min and max)`, () => {
      expect(auditFindings(deckFor(themeId, EXTREMES_SLIDE))).toEqual([])
    })

    it(`${themeId}: cell value text clears contrast across a negative-inclusive distribution`, () => {
      expect(auditFindings(deckFor(themeId, NEGATIVE_SLIDE))).toEqual([])
    })

    it(`${themeId}: cell value text clears contrast on a fully degenerate (all-equal) grid`, () => {
      expect(auditFindings(deckFor(themeId, DEGENERATE_SLIDE))).toEqual([])
    })
  }
})

// Structure-components wave 2 task 3: sankey.tsx is the wave's largest
// component — three topologies swept per the plan's own visual-QA mandate
// ("simple 2-layer, multi-layer, dense crossing"), each at schema-realistic
// content across all 13 themes. The dense-crossing fixture is the one that
// actually exercises this component's central contrast-safety claim (its
// own header comment, "Band opacity is a deliberate contrast-safety
// choice"): node labels sit directly beside node bars in the same
// horizontal gap several translucent bands route through, so a real
// low-contrast finding here would mean a label got misattributed against a
// band instead of the page background.
// Hoisted to module scope (task-3 fix round, review Major finding) so both
// the auditDeck-based sweep below AND the analytic blended-contrast sweep
// (this file's "sankey label-over-band blended contrast" describe block)
// share exactly the same four fixtures — the whole point of the second
// sweep is to catch a defect class the first one is structurally blind to,
// so it needs to run against the identical topologies, not a redescribed
// approximation of them.
const SANKEY_SIMPLE_SLIDE: Slide = {
  type: "content",
  heading: HEADING,
  layout: "narrow-column",
  components: [
    {
      type: "sankey",
      nodes: [
        { id: "coal", label: "煤炭" },
        { id: "gas", label: "天然气" },
        { id: "grid", label: "电网" },
      ],
      links: [
        { from: "coal", to: "grid", value: 30 },
        { from: "gas", to: "grid", value: 50 },
      ],
    },
  ],
} as Slide

const SANKEY_MULTI_LAYER_SLIDE: Slide = {
  type: "content",
  heading: HEADING,
  layout: "narrow-column",
  components: [
    {
      type: "sankey",
      nodes: [
        { id: "coal", label: "Coal" },
        { id: "gas", label: "Natural Gas" },
        { id: "renewables", label: "Renewables" },
        { id: "grid", label: "National Grid" },
        { id: "homes", label: "Residential Homes" },
        { id: "industry", label: "Heavy Industry" },
        { id: "exports", label: "Exports" },
      ],
      links: [
        { from: "coal", to: "grid", value: 30 },
        { from: "gas", to: "grid", value: 50 },
        { from: "renewables", to: "grid", value: 20 },
        { from: "grid", to: "homes", value: 45 },
        { from: "grid", to: "industry", value: 35 },
        { from: "grid", to: "exports", value: 20 },
      ],
    },
  ],
} as Slide

// Dense crossing: every node in layer 1 links to every node in layer 2 —
// the maximal-crossing topology a 3x3 bipartite fan produces, deliberately
// including a wide value spread (5..95) so band thickness varies a lot,
// and one particularly long label to also exercise truncation under
// crossing bands simultaneously. This is the fixture the review's own
// Major finding was measured against (campaign 4.30:1, insight 4.34:1,
// pre-fix).
const SANKEY_DENSE_CROSSING_SLIDE: Slide = {
  type: "content",
  heading: HEADING,
  layout: "narrow-column",
  components: [
    {
      type: "sankey",
      nodes: [
        { id: "a1", label: "一个相当长的上游节点名称" },
        { id: "a2", label: "Source B" },
        { id: "a3", label: "Source C" },
        { id: "b1", label: "Target X" },
        { id: "b2", label: "Target Y" },
        { id: "b3", label: "Target Z" },
      ],
      links: [
        { from: "a1", to: "b1", value: 95 },
        { from: "a1", to: "b2", value: 5 },
        { from: "a1", to: "b3", value: 40 },
        { from: "a2", to: "b1", value: 15 },
        { from: "a2", to: "b2", value: 60 },
        { from: "a2", to: "b3", value: 10 },
        { from: "a3", to: "b1", value: 25 },
        { from: "a3", to: "b2", value: 30 },
        { from: "a3", to: "b3", value: 70 },
      ],
    },
  ],
} as Slide

const sankeyLabels = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)
const SANKEY_SCHEMA_MAX_SLIDE: Slide = {
  type: "content",
  heading: HEADING,
  layout: "narrow-column",
  components: [
    {
      type: "sankey",
      nodes: sankeyLabels(16, "节点").map((label, i) => ({ id: `n${i}`, label })),
      links: (() => {
        const links: { from: string; to: string; value: number }[] = []
        outer: for (let i = 0; i < 8; i++) {
          for (let j = 8; j < 16; j++) {
            if (links.length >= 30) break outer
            links.push({ from: `n${i}`, to: `n${j}`, value: ((i + j) % 9) + 1 })
          }
        }
        return links
      })(),
    },
  ],
} as Slide

describe("sankey contrast (structure-components wave 2 task 3)", () => {
  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: simple two-layer sankey renders with zero auditDeck findings`, () => {
      expect(auditFindings(deckFor(themeId, SANKEY_SIMPLE_SLIDE))).toEqual([])
    })
  }

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: multi-layer sankey renders with zero auditDeck findings`, () => {
      expect(auditFindings(deckFor(themeId, SANKEY_MULTI_LAYER_SLIDE))).toEqual([])
    })
  }

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: dense-crossing sankey (9 links, 3x3 fully-connected bipartite fan) renders with zero auditDeck findings`, () => {
      expect(auditFindings(deckFor(themeId, SANKEY_DENSE_CROSSING_SLIDE))).toEqual([])
    })
  }

  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}: schema-max sankey (16 nodes, 30 links) renders with zero auditDeck findings on the narrowest curated content archetype`, () => {
      expect(auditFindings(deckFor(themeId, SANKEY_SCHEMA_MAX_SLIDE))).toEqual([])
    })
  }
})

// Task-3 fix round, review Major finding: `auditDeck` (above) is
// structurally blind to a label sitting over a real, translucent band —
// `BAND_OPACITY` (sankey.tsx) is deliberately below `MIN_BG_OPACITY` so a
// band never becomes a `paintedShapes` background candidate (preventing a
// *false positive*), which also means the SVG-level walk can never resolve
// a label's background to anything but the plain page bg, and `--pixels`
// can't help either (verified directly: that layer only ever samples runs
// whose SVG-resolved background came back `null`, and this one resolves
// cleanly — non-null — to the page bg). This describe block is the
// permanent, renderer-output-level regression net the review ordered: it
// reads the REAL rendered SVG (`renderSlideSvg`, the same single-source
// markup the exporter and preview both use) — a band's real fill/geometry
// off its own `data-band-bbox` attribute, a label's real ink/geometry off
// its own `data-label-bbox` — and independently recomputes the analytic
// alpha-composite blend for every band a label's box geometrically
// overlaps, asserting every resulting ratio still clears the WCAG floor.
// A label backed by a safety chip (`data-label-chip`, the opposite-
// direction-conflict escalation `sankey.tsx`'s own `isSafeAgainstAll` doc
// comment names) is verified against the *chip's* real fill instead of any
// band blend — the chip is what a viewer actually sees behind that label.
//
// Pre-fix, this exact method (analytic blend + real geometric overlap)
// reproduced the review's own measured violations on this branch's HEAD
// before the fix (campaign/insight, ratios in the 4.3 range) — this block
// stayed red against the pre-fix renderer and is green now.
describe("sankey label-over-band blended contrast (task 3 fix round, review Major finding — permanent guard)", () => {
  interface BandGeom {
    xMin: number
    yMin: number
    xMax: number
    yMax: number
    fill: string
  }

  /** Every real (label, background-it-actually-sits-on) pair for one
   * rendered sankey slide, read straight off real SVG output — never a
   * reimplementation of sankey.tsx's own layout math, only its declared
   * (`data-*`) geometry and its own chosen `fill` values. */
  function realLabelBackgroundPairs(themeId: string, slide: Slide): { label: string; ink: string; fontSize: number; bg: string }[] {
    const ir = deckFor(themeId, slide)
    const markup = renderSlideSvg(ir, 0)
    const root = parseSvgRoot(markup)
    const pageBg = root.querySelector("rect")?.getAttribute("fill") ?? "#FFFFFF"
    const bands: BandGeom[] = Array.from(root.querySelectorAll("path[data-band-bbox]")).map((el) => {
      const [xMin, yMin, xMax, yMax] = (el.getAttribute("data-band-bbox") ?? "").split(",").map(Number)
      return { xMin, yMin, xMax, yMax, fill: el.getAttribute("fill")! }
    })

    const pairs: { label: string; ink: string; fontSize: number; bg: string }[] = []
    for (const text of Array.from(root.querySelectorAll("text[data-label-bbox]"))) {
      const ink = text.getAttribute("fill")!
      const fontSize = Number(text.getAttribute("font-size"))
      const label = text.textContent ?? ""
      const hasChip = text.previousElementSibling?.getAttribute("data-label-chip") === "1"
      if (hasChip) {
        // The chip's own fill is the real, guaranteed background — verify
        // against *that*, not any band it may still visually sit above
        // (the whole point of the chip is that the band underneath no
        // longer matters).
        pairs.push({ label, ink, fontSize, bg: (text.previousElementSibling as Element).getAttribute("fill")! })
        continue
      }
      const [txMin, tyMin, txMax, tyMax] = (text.getAttribute("data-label-bbox") ?? "").split(",").map(Number)
      pairs.push({ label, ink, fontSize, bg: pageBg })
      for (const band of bands) {
        const overlaps = txMin <= band.xMax && txMax >= band.xMin && tyMin <= band.yMax && tyMax >= band.yMin
        if (!overlaps) continue
        pairs.push({ label, ink, fontSize, bg: mixHex(pageBg, band.fill, BAND_OPACITY) })
      }
    }
    return pairs
  }

  const FIXTURES: [string, Slide][] = [
    ["simple", SANKEY_SIMPLE_SLIDE],
    ["multi-layer", SANKEY_MULTI_LAYER_SLIDE],
    ["dense-crossing", SANKEY_DENSE_CROSSING_SLIDE],
    ["schema-max", SANKEY_SCHEMA_MAX_SLIDE],
  ]

  for (const themeId of CANONICAL_THEME_IDS) {
    for (const [topology, slide] of FIXTURES) {
      it(`${themeId} / ${topology}: every label clears 4.5:1 (or 3:1 if large) against every real background it sits on, band blends included`, () => {
        const pairs = realLabelBackgroundPairs(themeId, slide)
        expect(pairs.length).toBeGreaterThan(0)
        const violations = pairs
          .map(({ label, ink, fontSize, bg }) => ({ label, ink, bg, ratio: contrastRatio(ink, bg), required: requiredContrastRatio(fontSize) }))
          .filter((p) => p.ratio < p.required)
        expect(violations).toEqual([])
      })
    }
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
