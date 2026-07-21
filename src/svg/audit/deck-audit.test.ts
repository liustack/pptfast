// @vitest-environment node
//
// Runs under the real Node platform (`installNodePlatform()`), not jsdom —
// deliberately, unlike svg-audit.test.ts/audit-baseline.test.ts (both
// `@vitest-environment jsdom`) — so this suite exercises `auditDeck`'s actual
// documented Node consumption path end-to-end (linkedom DOMParser via the
// platform registry seam), the same path a real CLI/SDK Node caller hits,
// not jsdom's incidental global `DOMParser` filling in unasked.
import { readFileSync } from "node:fs"
import { beforeAll, describe, expect, it } from "vitest"
import { PptxIRSchema, type Component, type PptxIR, type Slide } from "@/ir"
import { renderSlideSvg } from "../../api"
import { installNodePlatform } from "../../platform/node"
import {
  auditDeck,
  findContrastIssues,
  findOverlapIssues,
  __collectBgRegions,
  __collectImageBackedTextRuns,
  __pathBoundingBox,
  type AuditFinding,
} from "./deck-audit"
import { STRESS_DECKS } from "./stress-fixtures"

beforeAll(() => {
  installNodePlatform()
})

const LONG_CJK =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

function deck(themeId: string, slides: Slide[], overrides: Partial<PptxIR> = {}): PptxIR {
  return {
    version: "4",
    filename: "deck-audit-fixture",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
    ...overrides,
  }
}

describe("auditDeck — clean deck baseline", () => {
  it("reports zero findings for examples/basic.json", () => {
    const raw = JSON.parse(readFileSync(new URL("../../../examples/basic.json", import.meta.url), "utf8"))
    const ir = PptxIRSchema.parse(raw)
    const report = auditDeck(ir)
    expect(report.findings).toEqual([])
    expect(report.pagesAudited).toBe(ir.slides.length)
    expect(report.pagesSkipped).toBe(0)
  })

  it("reports checks.svg completed and checks.pixels not-requested when --pixels was never asked for (audit-v2 phase B — 'not checked' must never read as 'passed')", () => {
    const raw = JSON.parse(readFileSync(new URL("../../../examples/basic.json", import.meta.url), "utf8"))
    const ir = PptxIRSchema.parse(raw)
    const report = auditDeck(ir)
    expect(report.checks).toEqual({ svg: "completed", pixels: "not-requested" })
  })

  // Cross-check against the pre-existing stress-content fixtures (extreme
  // text length, every component type) across a representative theme
  // spread — including `tech`, the one built-in theme whose *default*
  // background is a gradient, so the gradient-band background regions get
  // exercised against real (not hand-crafted) markup too. `audit-
  // baseline.test.ts` already proves these render with zero *overflow*;
  // this reuses the same decks as a regression net for the two new check
  // families instead of hunting for bespoke fixtures per theme.
  //
  // `overlap` is asserted zero across the *entire* matrix — no legitimate
  // design reason exists for two components to actually collide (see
  // findOverlapIssues's own doc comment on why `layoutContentFit` prevents
  // it by construction), so any overlap finding here would be a real bug.
  //
  // `low-contrast` is deliberately *not* asserted zero here. Running the
  // matrix while developing this check surfaced three distinct, genuine,
  // pre-existing sources of borderline-WCAG decorative/semantic colour that
  // this task did not introduce and was, at the time, out of scope to
  // remediate (a cross-cutting theme-polish pass, not "audit core") —
  // documented in the task report, and locked in as explicit regression
  // tests right below this block so the *specific*, understood cases stay
  // understood rather than silently allowlisted:
  //   1. `code.tsx`'s `LINE_NUM_COLOR` — a hardcoded editor-gutter gray.
  //   2. `ending-banner-ending.tsx`/`ending-rail-ending.tsx`'s
  //      `COPYRIGHT_FAINT` — an explicitly-adjudicated (see that file's own
  //      lengthy doc comment) cross-theme "copyright is the faintest text
  //      tier" convention.
  //   3. `architecture.tsx`'s layer title (`ctx.colors.primary` on
  //      `ctx.colors.panel ?? ctx.colors.surface`) — a *theme's own*
  //      internal colour pairing, not a hardcoded value; on `insight`
  //      specifically it computes to 4.40:1, essentially a rounding
  //      distance under the 4.5:1 body threshold.
  // Every one of these is a real (if minor/borderline) WCAG deviation an
  // advisory audit is *supposed* to surface — asserting them away would
  // defeat the point. None of them appear in `examples/basic.json` (the
  // plan's actual clean-deck gate, asserted above).
  //
  // Two former members of this list — `kpi.tsx`'s hardcoded delta-arrow
  // red/green and `quote.tsx`'s decorative open-quote mark — are gone as of
  // the bench-driven fix round's B-group (Task 3): both are real defects,
  // not out-of-scope theme polish after all, now fixed via `accessibleInk`.
  // See the "B-group ink fixes" describe block below for the red→green
  // re-pin (this block's own former assertions on them, `contrast.some(...)
  // === true`, are exactly what got flipped).
  const THEMES = ["consulting", "insight", "tech", "campaign", "luxe"] as const
  for (const themeId of THEMES) {
    for (const [name, stressDeck] of Object.entries(STRESS_DECKS)) {
      it(`${themeId} / ${name} stress deck: no false-positive overlap findings, no crash`, () => {
        const ir: PptxIR = { ...stressDeck, theme: { ...stressDeck.theme, id: themeId } }
        const report = auditDeck(ir)
        expect(report.findings.filter((f) => f.code === "overlap")).toEqual([])
        for (const f of report.findings) {
          expect([
            "overflow",
            "out-of-bounds",
            "low-contrast",
            "overlap",
            "content-truncated",
            "content-dropped",
          ]).toContain(f.code)
          expect(f.message.length).toBeGreaterThan(0)
        }
      })
    }
  }
})

describe("auditDeck — understood pre-existing low-contrast sources (not audit bugs)", () => {
  // Each of these locks in *why* a specific, real component produces a
  // low-contrast finding under the stress matrix above, so a future change
  // to any of these three colours shows up here instead of silently
  // vanishing from (or reappearing in) the broader regression net.
  it("code.tsx's hardcoded line-number gray is borderline against a dark code-block background", () => {
    const ir = deck("consulting", [
      {
        type: "content",
        arrangement: "code",
        heading: "code",
        components: [{ type: "code", language: "ts", code: "const x = 1\nconst y = 2" }],
      },
    ])
    const contrast = auditDeck(ir).findings.filter((f) => f.code === "low-contrast")
    expect(contrast.some((f) => (f.detail as { fill?: string })?.fill === "#6A737D")).toBe(true)
  })

  it("ending-banner-ending.tsx's adjudicated COPYRIGHT_FAINT tier fails the strict WCAG body threshold", () => {
    // Pinned explicitly (W4 full-set opening): this test is about one
    // specific component's hardcoded color, not about auto-selection —
    // consulting's ending curated set grew from a single-member
    // ["banner-ending"] to the full 7-archetype set, so an unpinned slide
    // no longer deterministically lands on banner-ending.
    const ir = deck("consulting", [
      { type: "ending", heading: "Thanks", layout: "banner-ending", components: [] },
    ], { meta: { organization: "x", copyright: "© 2026 x" } })
    const contrast = auditDeck(ir).findings.filter((f) => f.code === "low-contrast")
    expect(contrast.some((f) => (f.detail as { fill?: string })?.fill === "#8a8a86")).toBe(true)
  })

  it("architecture.tsx's theme-derived primary-on-panel pairing is a rounding distance under 4.5:1 on insight", () => {
    const ir = deck("insight", [
      {
        type: "content",
        heading: "architecture",
        components: [{ type: "architecture", layers: [{ title: "Layer", items: ["a", "b"] }] }],
      },
    ])
    const contrast = auditDeck(ir).findings.filter((f) => f.code === "low-contrast")
    expect(contrast.some((f) => (f.detail as { fill?: string })?.fill === "#E63946")).toBe(true)
  })
})

// Bench-driven fix round (defect A reclassification, Task 3 handoff): the
// small-region misattribution fix (see deck-audit.ts's own
// MIN_BG_REGION_AREA/PaintedShape doc comments) re-measures *every* audited
// text against its real background — including four components whose own
// badge/chip text used to be silently mismeasured against the wrong
// (larger) region: `steps.tsx`'s numbered badge, `roadmap.tsx`'s
// stage-number badge, `rings.tsx`'s core label, and `image-compare.tsx`'s
// "VS"/"AFTER" chips (found via an exhaustive 28-component-type x 13-theme
// sweep, not just the plan's 3 named benchmark hits — see the task report's
// reclassification table). All five hardcoded an unwrapped ink
// (`fill="#FFFFFF"` for the two badges, `fill={ctx.colors.surface}` for the
// rings/image-compare pair) with no `accessibleInk`/`readableOn` call
// (unlike `content-rail-numbered.tsx`'s own "{chapter}.{content}" badge,
// already routed through `readableOn(colors.primary)` in a prior fix round
// this whole family never received). Pre-fix this was invisible: each was
// measured against whichever larger region happened to be nearby (a card
// shell, the ambient page background, or — for roadmap specifically — the
// same `roundedTopBarPath` phantom region `MUTED_SURFACE_CLASS`'s own
// `roadmap`/`insight_panel` entries document in full-matrix-contrast.test.ts)
// and often passed (or, for rings/image-compare's "VS" badge — which paint no
// card shell at all — *always* passed, on all 13 themes, pre-fix) by sheer
// coincidence. Fixed here (Task 3) the same way `content-rail-numbered.tsx`'s
// own badge already was: each call site now runs its ink through
// `accessibleInk`, keeping the preferred fill when it already clears the
// ratio (byte-identical on every theme that never failed) and falling back
// to `readableOn`'s neutral ink only where it doesn't. `tech`/`campaign`/
// `consulting` are used below (each is among the affected themes for its
// call site, confirmed by a real 13-theme sweep) — the same probes this
// block's pre-fix version used to pin the defect, now re-pinned to assert
// it's gone (red→green evidence).
describe("auditDeck — B-group ink fixes (bench-driven fix round, defect A handoff, Task 3)", () => {
  it("steps.tsx's numbered badge digit clears contrast against tech's light primary once measured against its own circle", () => {
    const ir = deck("tech", [
      {
        type: "content",
        heading: "steps",
        components: [{ type: "steps", items: [{ title: "Step one", text: "do the first thing" }] }],
      },
    ])
    const contrast = auditDeck(ir).findings.filter((f) => f.code === "low-contrast")
    expect(contrast.some((f) => f.detail?.text === "1")).toBe(false)
  })

  it("roadmap.tsx's numbered badge digit clears contrast against the same light theme primaries as steps.tsx (identical pattern, separate call site)", () => {
    const ir = deck("tech", [
      {
        type: "content",
        heading: "roadmap",
        components: [
          {
            type: "roadmap",
            items: [{ title: "Kickoff", period: "Q1", rows: [{ label: "Scope", value: "discovery" }] }],
          },
        ],
      },
    ])
    const contrast = auditDeck(ir).findings.filter((f) => f.code === "low-contrast")
    expect(contrast.some((f) => f.detail?.text === "01")).toBe(false)
  })

  it("rings.tsx's core label (colors.surface on colors.primary, no card shell at all) clears contrast against campaign once measured against its own circle", () => {
    // rings.tsx paints no rect/card of its own — pre-fix, the core label's
    // *only* possible fallback was the ambient page background, and
    // colors.surface sits close enough to that background on every one of
    // the 13 themes that this was a *universal* false positive-shaped
    // near-miss before the defect-A fix (ratio ~1.0-1.2 everywhere,
    // confirmed by a real sweep) — not just a "sometimes passes by
    // coincidence" case like the two badges above.
    const ir = deck("campaign", [
      {
        type: "content",
        heading: "rings",
        components: [{ type: "rings", items: [{ label: "Core", desc: "inner layer" }] }],
      },
    ])
    const contrast = auditDeck(ir).findings.filter((f) => f.code === "low-contrast")
    expect(contrast.some((f) => f.detail?.text === "Core")).toBe(false)
  })

  it("image-compare.tsx's \"VS\" badge (identical colors.surface-on-colors.primary pattern as rings.tsx, separate call site) clears contrast against campaign the same way", () => {
    const ir = deck("campaign", [
      {
        type: "content",
        heading: "image compare",
        components: [
          {
            type: "image_compare",
            left: { asset_id: "a", label: "Before" },
            right: { asset_id: "b", label: "After" },
            style: "vs",
          },
        ],
      },
    ], { assets: { images: { a: { src: "data:image/png;base64,AAAA" }, b: { src: "data:image/png;base64,AAAA" } } } })
    const contrast = auditDeck(ir).findings.filter((f) => f.code === "low-contrast")
    expect(contrast.some((f) => f.detail?.text === "VS")).toBe(false)
  })

  it("image-compare.tsx's \"before_after\" style AFTER chip (colors.surface on colors.accent, a small rect not a circle) clears contrast against consulting once measured against its own chip", () => {
    // Same defect family, third shape kind: a <rect> this time (the "AFTER"
    // chip, 52x24=1,248px^2 — well below MIN_BG_REGION_AREA), not a circle —
    // proving the defect-A fix's no-area-floor change (not just the new
    // circle/ellipse containment math) is what surfaced this one. Unlike the
    // three above, this was a pure false *negative* pre-defect-A-fix (zero
    // findings on any theme) rather than a coincidental pass on some
    // themes — the chip never registered as a region at all, so resolution
    // fell through to a background that always happened to pass. The
    // BEFORE chip (colors.muted fill) is unaffected on every theme — no
    // low-contrast finding for it before or after this fix.
    const ir = deck("consulting", [
      {
        type: "content",
        heading: "image compare before/after",
        components: [
          {
            type: "image_compare",
            left: { asset_id: "a", label: "Before" },
            right: { asset_id: "b", label: "After" },
            style: "before_after",
          },
        ],
      },
    ], { assets: { images: { a: { src: "data:image/png;base64,AAAA" }, b: { src: "data:image/png;base64,AAAA" } } } })
    const contrast = auditDeck(ir).findings.filter((f) => f.code === "low-contrast")
    expect(contrast.some((f) => f.detail?.text === "AFTER")).toBe(false)
    expect(contrast.some((f) => f.detail?.text === "BEFORE")).toBe(false)
  })
})

describe("auditDeck — overflow / out-of-bounds", () => {
  it("surfaces a v-overflow as an 'overflow' finding with page context and a fix suggestion", () => {
    // `paragraph.tsx` never shrinks/truncates by design ("wrap freely; never
    // shrink/truncate a body paragraph") — its *only* overflow guard is the
    // caller (`layoutContentFit`). A single paragraph this long overflows
    // the tightest gap tier by itself, so `layoutContentFit` falls into its
    // documented "keep the first placed component even if it alone doesn't
    // fit" branch (`layout.ts`) and hands it a `box.h` the component then
    // ignores — a genuine, real (not synthetic-markup) render overflow.
    // Confirmed empirically before writing this test (see task report).
    const ir = deck("consulting", [
      { type: "content", id: "s1", heading: "overflow probe", components: [{ type: "paragraph", text: LONG_CJK.repeat(20) }] },
    ])
    const report = auditDeck(ir)
    const overflow = report.findings.filter((f) => f.code === "overflow")
    expect(overflow.length).toBeGreaterThan(0)
    expect(overflow[0]).toMatchObject({ page: 1, slideId: "s1", code: "overflow" })
    expect(overflow[0].message).toMatch(/shorten the content or split the slide/)
    expect(overflow[0].detail).toBeDefined()
  })

  it("omits slideId when the slide carries none", () => {
    const ir = deck("consulting", [
      { type: "content", heading: "overflow probe", components: [{ type: "paragraph", text: LONG_CJK.repeat(20) }] },
    ])
    const report = auditDeck(ir)
    const overflow = report.findings.filter((f) => f.code === "overflow")
    expect(overflow.length).toBeGreaterThan(0)
    expect(overflow[0].slideId).toBeUndefined()
  })
})

// bench-driven fix round, defect E: `fitSvgLine`'s ellipsis truncation and
// `layoutContentFit`'s "+N more" drop marker used to be invisible to audit —
// a model (or human) had to eyeball the rendered SVG to notice row_cards
// silently dropping items or a slide silently dropping a whole component.
// Both checks below are thin readers of the `data-truncated`/`data-dropped`
// markers the render chain now stamps (`svg-text-layout.ts`'s `fitSvgLine`,
// `layout.ts`'s `layoutContentFit`, `row-cards.tsx`'s own item-level marker)
// — real IR renders, same "auditDeck -> findings" path as every other test
// in this file, not hand-crafted markup, since the point is proving the
// render chain's own markers reach the audit layer end to end.
describe("auditDeck — content-truncated / content-dropped (bench-driven fix round, defect E)", () => {
  it("surfaces an ellipsis-truncated verdict_banner text as a 'content-truncated' finding", () => {
    // verdict_banner renders at a fixed 18px/2-line budget regardless of how
    // far `layoutSvgText` had to loosen its own wrap to fit (`lay`'s own doc
    // comment) — a long enough unbroken run forces `truncateEmphasisSegments`
    // to cut, guaranteed regardless of the resolved layout's column width.
    const ir = deck("consulting", [
      {
        type: "content",
        id: "s1",
        heading: "verdict probe",
        components: [{ type: "verdict_banner", tone: "positive", text: LONG_CJK.repeat(10) }],
      },
    ])
    const report = auditDeck(ir)
    const truncated = report.findings.filter((f) => f.code === "content-truncated")
    expect(truncated.length).toBeGreaterThan(0)
    expect(truncated[0]).toMatchObject({ page: 1, slideId: "s1", code: "content-truncated" })
    expect(truncated[0].message).toMatch(/was truncated with an ellipsis/)
    expect((truncated[0].detail as { text?: string }).text?.endsWith("…")).toBe(true)
  })

  it("surfaces layoutContentFit's fully-dropped components as 'content-dropped' findings", () => {
    // Same fixture shape as SvgContent.test.tsx's own "renders a
    // dropped-count marker" case, run through the real auditDeck path
    // instead of calling SvgContent directly.
    const longText = LONG_CJK.repeat(3)
    const many: Component[] = Array.from({ length: 8 }, () => ({ type: "paragraph", text: longText }))
    const ir = deck("consulting", [{ type: "content", id: "s1", heading: "drop probe", components: many }])
    const report = auditDeck(ir)
    const dropped = report.findings.filter((f) => f.code === "content-dropped")
    expect(dropped.length).toBeGreaterThan(0)
    expect(dropped[0]).toMatchObject({ page: 1, slideId: "s1", code: "content-dropped" })
    expect(dropped[0].message).toMatch(/hidden behind a "\+\d+ more" marker/)
    expect((dropped[0].detail as { count?: number }).count).toBeGreaterThan(0)
  })

  it("surfaces row_cards' own item-level drop (the benchmark's flagship repro) as 'content-dropped'", () => {
    // The exact bench-cited shape: a multi-item row_cards squeezed into a
    // two_column half-width slot alongside a second component, each item
    // carrying enough text/sub content that 5 stacked cards blow well past
    // even a full content rect, let alone a halved one.
    const item = (n: number) => ({
      title: `事项标题条目编号 ${n}`,
      text: LONG_CJK,
      sub: "补充说明文字用于撑高卡片高度",
    })
    const ir = deck("consulting", [
      {
        type: "content",
        id: "s1",
        heading: "row_cards probe",
        arrangement: "two_column",
        components: [
          { type: "row_cards", items: [1, 2, 3, 4, 5].map(item) },
          { type: "paragraph", text: "第二列占位内容" },
        ],
      },
    ])
    const report = auditDeck(ir)
    const dropped = report.findings.filter((f) => f.code === "content-dropped")
    expect(dropped.length).toBeGreaterThan(0)
  })
})

describe("auditDeck — placeholder pages", () => {
  it("skips placeholder slides entirely (not audited, not counted as a finding source)", () => {
    const slides: Slide[] = [
      { type: "content", heading: "real page", components: [{ type: "paragraph", text: "short" }] },
      // A placeholder page whose (absent) content would trivially overflow
      // if it were rendered/audited — proves the skip is real, not just
      // "happened not to have findings".
      { type: "content", placeholder: true, components: [] },
    ]
    const ir = deck("consulting", slides)
    const report = auditDeck(ir)
    expect(report.pagesAudited).toBe(1)
    expect(report.pagesSkipped).toBe(1)
    expect(report.findings.every((f) => f.page === 1)).toBe(true)
  })
})

describe("findContrastIssues — low-contrast", () => {
  const BG = "#F7F7F2" // consulting theme colors.bg
  // Background is now derived from the rendered geometry itself (see
  // findContrastIssues's doc comment) — every fixture here starts with a
  // real full-page background <rect>, the same thing Background.tsx always
  // renders first, rather than passing a background value in directly.
  const page = (bg: string, inner: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect x="0" y="0" width="1280" height="720" fill="${bg}"/>${inner}</svg>`

  it("flags near-background text fill as low-contrast", () => {
    const markup = page(BG, `<text x="96" y="200" font-size="20" fill="#F5F5F0">barely visible body text</text>`)
    const issues = findContrastIssues(markup)
    expect(issues).toHaveLength(1)
    expect(issues[0].required).toBe(4.5)
    expect(issues[0].ratio).toBeLessThan(4.5)
  })

  it("passes normal theme-text-color body text", () => {
    const markup = page(BG, `<text x="96" y="200" font-size="20" fill="#051C2C">normal heading-ink body text</text>`)
    expect(findContrastIssues(markup)).toEqual([])
  })

  it("uses the relaxed 3:1 threshold at the 24px large-text cutoff", () => {
    // #808080 vs #F7F7F2 computes to a 3.68:1 ratio (WCAG relative-luminance
    // formula) — between the two thresholds: fails 4.5:1 but clears 3:1 — so
    // identical fill/background at 24px must pass while the same pair at
    // 20px (body) must fail.
    const large = page(BG, `<text x="0" y="40" font-size="24" fill="#808080">large</text>`)
    const body = page(BG, `<text x="0" y="40" font-size="20" fill="#808080">body</text>`)
    expect(findContrastIssues(large)).toEqual([])
    const bodyIssues = findContrastIssues(body)
    expect(bodyIssues).toHaveLength(1)
    expect(bodyIssues[0].required).toBe(4.5)
  })

  it("excludes decorative near-transparent text (SlideDecor-style watermark) from the check", () => {
    // Mirrors SlideDecor.tsx's `big_number` watermark: near-black-on-light
    // would ordinarily pass anyway, so use a fill that *would* fail at full
    // opacity but is dimmed to 0.14 fill-opacity, same as that component's
    // "subtle" intensity — must NOT be flagged.
    const markup = page(
      "#0A0A0C",
      `<text x="1100" y="600" text-anchor="end" font-size="140" fill="#F7F7F2" fill-opacity="0.14">01</text>`,
    )
    expect(findContrastIssues(markup)).toEqual([])
  })

  it("blends fill-opacity into the effective color instead of ignoring it", () => {
    // fill="#051C2C" (theme text ink, high contrast alone) at fill-opacity
    // 0.5 over a near-identical background must be judged on the *blended*
    // color, not the raw ink — the blend lands close to the background, so
    // this should fail even though the raw fill would pass comfortably.
    const markup = page("#0A2030", `<text x="0" y="40" font-size="20" fill="#051C2C" fill-opacity="0.5">dimmed</text>`)
    expect(findContrastIssues(markup)).toHaveLength(1)
  })

  it("checks each differently-colored tspan independently, not the parent text's (absent) fill", () => {
    // Mirrors cover-left-anchor.tsx's author/date/version meta line: the
    // <text> itself carries no fill, only its <tspan> children do.
    const markup = page(
      BG,
      `<text x="0" y="40" font-size="20">
        <tspan fill="#051C2C">high contrast run</tspan>
        <tspan fill="#F5F5F0">low contrast run</tspan>
      </text>`,
    )
    const issues = findContrastIssues(markup)
    expect(issues).toHaveLength(1)
    expect(issues[0].text).toContain("low contrast run")
  })

  // Backlog item 5b (`.issues/notes/2026-07-18-post-v03-backlog.md` #5):
  // the test above only ever exercises a *single* background region, so a
  // <tspan> with no x/y of its own landing at the wrong position (see
  // below) still resolves to the same region it should have anyway,
  // masking the bug. These two mirror cover-left-anchor.tsx's real emitted
  // markup exactly (verified against a real render while investigating this
  // task): a page-wide background <rect> (Background.tsx, painted first),
  // an opaque left-side color block painted over it, and a <text> — no
  // wrapping <g transform>, positioned via its own x/y attributes directly
  // — whose <tspan> children carry no x/y of their own, same as the real
  // author/date/version meta line's markup
  // (`<text x="576" y="268" ...><tspan fill="#...">Jane Doe · Lead</tspan>
  // <tspan fill="#...">    ·    2026-07-19</tspan>...</text>`, captured
  // from a real academic-theme render).
  it("attributes a multi-tspan run without its own x/y to the owning <text>'s real position, not the ancestor transform origin", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <rect x="0" y="0" width="1280" height="720" fill="#FFFFFF"/>
      <rect x="0" y="0" width="512" height="720" fill="#051C2C"/>
      <text x="640" y="300" font-size="26">
        <tspan fill="#051C2C">first run</tspan><tspan fill="#051C2C">second run</tspan>
      </text>
    </svg>`
    // Correct attribution: both tspans sit on the right side, over the
    // page-wide white background — #051C2C-on-white is a real,
    // comfortably-passing pairing. Before the fix, a <tspan> lacking its
    // own x/y inherited (ox,oy) — the accumulated *transform* origin passed
    // down to the <text>'s children — which never includes the <text>'s
    // own x/y attribute (that offset was only ever applied locally, for the
    // <text> element's own direct-text check, and never propagated into
    // what its children receive). With no ancestor <g transform> at all
    // here, that origin is (0,0) — inside the *left* block region — so both
    // tspans were wrongly checked against #051C2C-on-#051C2C (identical
    // colors, 1:1 ratio) and failed outright, against a background neither
    // run actually sits on.
    expect(findContrastIssues(markup)).toEqual([])
  })

  it("does not let a mis-attributed tspan hide a genuine low-contrast pairing on its real background", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <rect x="0" y="0" width="1280" height="720" fill="#FFFFFF"/>
      <rect x="0" y="0" width="512" height="720" fill="#051C2C"/>
      <text x="640" y="300" font-size="26">
        <tspan fill="#051C2C">passes on white</tspan><tspan fill="#F5F5F0">fails on white</tspan>
      </text>
    </svg>`
    // The first run (#051C2C-on-white) is fine and must stay unflagged —
    // proving per-tspan independence survives the position fix. The second
    // (#F5F5F0-on-white, the tspan's real right-side background) is a
    // genuine WCAG failure and must be flagged. Before the fix, the same
    // mis-attribution as above resolved *both* tspans to the left block's
    // dark background instead, where #F5F5F0-on-#051C2C passes
    // comfortably — silently hiding a real issue rather than merely
    // manufacturing a spurious one.
    const issues = findContrastIssues(markup)
    expect(issues).toHaveLength(1)
    expect(issues[0].text).toContain("fails on white")
    expect(issues[0].background).toBe("#FFFFFF")
  })

  // Backlog item 6 (task-1 routed follow-up, `.issues/notes/2026-07-18-post-v03-backlog.md`
  // #5b's own fix): the two tests above both exercise a <tspan> that omits
  // its own x/y and inherits the owning <text>'s position — deck-audit.ts's
  // precedence branch (`const tx = ownX !== null ? ax + Number(ownX) * as :
  // (inheritedTx ?? ax)`) has a second half neither one reaches: a <tspan>
  // that carries its *own* x/y must use that, not the inherited position,
  // even though both are available. A bare <text> never exercises this half
  // either (that function's own doc comment: a <text> is never itself
  // nested inside another <text>/<tspan>, so `inheritedTx` is always `null`
  // for it — it always takes the ownX branch trivially).
  it("a tspan's own x/y overrides the inherited text position, even when an inherited position is also available", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <rect x="0" y="0" width="1280" height="720" fill="#FFFFFF"/>
      <rect x="0" y="0" width="512" height="720" fill="#051C2C"/>
      <text x="640" y="300" font-size="26" fill="#051C2C">
        <tspan>inherits text position</tspan>
        <tspan x="200" y="300">own position overrides</tspan>
      </text>
    </svg>`
    // Both tspans share the same (inherited) fill — the owning <text>'s
    // #051C2C. The first tspan has no x/y of its own, so it inherits the
    // <text>'s real position (640,300) — over the white right-side
    // background, #051C2C-on-white passes comfortably and must stay
    // unflagged. The second tspan sets its own x=200,y=300, landing inside
    // the *left* dark-navy block (#051C2C) — if its own coordinates
    // correctly win, the effective pairing is #051C2C-on-#051C2C (identical
    // colors, ratio 1:1), a clear failure. If precedence were wrong (the
    // inherited/text position winning instead), this tspan would resolve to
    // the same white background as its sibling and wrongly pass too.
    const issues = findContrastIssues(markup)
    expect(issues).toHaveLength(1)
    expect(issues[0].text).toBe("own position overrides")
    expect(issues[0].background).toBe("#051C2C")
  })

  it("uses the 3:1 threshold once a scaled ancestor transform pushes effective font-size past 24px", () => {
    // font-size 12 under scale(2.5) renders at effective 30px — above the
    // 24px large-text cutoff — must use the 3:1 threshold, not 4.5:1.
    const markup = page(
      BG,
      `<g transform="translate(0,0) scale(2.5)"><text x="0" y="20" font-size="12" fill="#808080">scaled large text</text></g>`,
    )
    expect(findContrastIssues(markup)).toEqual([])
  })

  it("resolves a local panel's own color as the background for text painted inside it, not the page bg", () => {
    // Mirrors content-banner-heading.tsx's real shape: an opaque
    // colors.primary banner (well above MIN_BG_REGION_AREA) painted over the
    // page background, with white heading text inside it — the exact
    // examples/basic.json false-positive this design pivot was built to fix
    // (see the task report). White-on-dark-navy passes; the same white
    // would fail if wrongly checked against the light page bg instead.
    const markup = page(
      BG,
      `<rect x="96" y="72" width="1088" height="88" fill="#051C2C"/>
       <text x="120" y="120" font-size="34" fill="#FFFFFF">Design goals</text>`,
    )
    expect(findContrastIssues(markup)).toEqual([])
  })

  // Bench-driven fix round (defect A) re-pin: this test used to assert the
  // opposite (a small decorative rect below MIN_BG_REGION_AREA must NOT
  // override the real local background, resolution falling through to the
  // white card beneath instead) — that was the audit-tool bug this fix
  // round exists to close, root-caused as the single most-hit false-positive
  // class in the benchmark (rail-numbered's badge, steps' numbered circle:
  // both small self-painted shapes whose own text was being checked against
  // a *larger* region underneath instead of the shape it was actually
  // painted on — see MIN_BG_REGION_AREA's own doc comment in deck-audit.ts).
  // Old assertion (`toEqual([])`, i.e. no finding — background resolved to
  // the white card) → new assertion (one finding, background resolves to
  // the bar's own `#050505` fill) is the derivable flip: attribution now has
  // no area floor, so text painted directly on top of *any* opaque
  // self-painted shape resolves against that shape, however small.
  it("resolves a small decorative rect (below MIN_BG_REGION_AREA) as the real background for text painted directly on top of it", () => {
    // Same tiny accent bar (icon-cards.tsx-style, 32x3) as before, with text
    // positioned right where the bar visually is. The near-identical
    // (near-black text on near-black bar) pairing must now fail — were
    // resolution still (wrongly) falling through to the white card beneath,
    // this would pass instead, silently hiding the real on-bar contrast.
    const markup = page(
      BG,
      `<rect x="96" y="176" width="536" height="226" fill="#FFFFFF"/>
       <rect x="120" y="176" width="32" height="3" fill="#050505"/>
       <text x="125" y="178" font-size="20" fill="#000000">card body text</text>`,
    )
    const issues = findContrastIssues(markup)
    expect(issues).toHaveLength(1)
    expect(issues[0].background).toBe("#050505")
  })

  it("does not let a small decorative rect's bounding box swallow text positioned beside it, not on it", () => {
    // Same tiny accent bar, but the text now sits to the right of it (x=200
    // vs. the bar's own x=120..152 span) — outside its bounds entirely. Must
    // still resolve to the real card background beneath: removing the area
    // floor makes every small opaque shape a candidate, but containment is
    // still exact (this is a <rect>, so an AABB test) — a shape a text
    // element doesn't actually sit on must never "leak" onto it.
    const markup = page(
      BG,
      `<rect x="96" y="176" width="536" height="226" fill="#FFFFFF"/>
       <rect x="120" y="176" width="32" height="3" fill="#050505"/>
       <text x="200" y="200" font-size="20" fill="#000000">card body text</text>`,
    )
    expect(findContrastIssues(markup)).toEqual([])
  })

  it("resolves each of several gradient bands to its own color rather than one page-wide value", () => {
    // Background.tsx paints a gradient as N solid-fill bands stacked
    // top-to-bottom. A light band low in the stack and a dark band high in
    // the stack must each be judged against their *own* band, not a single
    // blended page-wide estimate.
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <rect x="0" y="0" width="1280" height="360" fill="#F5F5F0"/>
      <rect x="0" y="360" width="1280" height="360" fill="#0A0A0C"/>
      <text x="0" y="100" font-size="20" fill="#051C2C">on the light band</text>
      <text x="0" y="460" font-size="20" fill="#F5F5F0">on the dark band</text>
    </svg>`
    expect(findContrastIssues(markup)).toEqual([])
  })

  it("treats a bare photo (no scrim) as an indeterminate background and skips text over it", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <image href="data:image/png;base64,x" x="0" y="0" width="1280" height="720"/>
      <text x="96" y="600" font-size="20" fill="#000000">caption over unknown photo</text>
    </svg>`
    expect(findContrastIssues(markup)).toEqual([])
  })

  it("trusts an opaque-enough scrim over a photo as the effective background", () => {
    // Mirrors Background.tsx's auto-scrim (opacity 0.66, above MIN_BG_OPACITY).
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <image href="data:image/png;base64,x" x="0" y="0" width="1280" height="720"/>
      <rect x="0" y="0" width="1280" height="720" fill="#0A0A0C" fill-opacity="0.66"/>
      <text x="96" y="600" font-size="20" fill="#0A0A0C">low contrast on the scrim itself</text>
    </svg>`
    expect(findContrastIssues(markup)).toHaveLength(1)
  })

  it("does not trust a too-faint overlay as a reliable background estimate", () => {
    // Mirrors ImagePages.tsx's ImageCoverPage-style light scrims (~0.3,
    // below MIN_BG_OPACITY) — too translucent for its own color to be a
    // trustworthy stand-in for "the background text sits on".
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <image href="data:image/png;base64,x" x="0" y="0" width="1280" height="720"/>
      <rect x="0" y="0" width="1280" height="720" fill="#0A0E14" fill-opacity="0.3"/>
      <text x="96" y="600" font-size="20" fill="#FFFFFF">bespoke white cover text</text>
    </svg>`
    expect(findContrastIssues(markup)).toEqual([])
  })

  it("locks the opacity-accumulation product for background regions: fill-opacity alone clearing MIN_BG_OPACITY is not enough if the opacity attribute drags the product below it", () => {
    // Regression lock for findContrastIssues's `currentFillOpacity *
    // currentOpacityProduct >= MIN_BG_OPACITY` region-eligibility check —
    // reverting that to `currentFillOpacity >= MIN_BG_OPACITY` alone (i.e.
    // dropping the `opacity`-attribute accumulation) makes this test fail
    // (verified by temporarily reverting before finalizing this test, then
    // restoring — see the task report's RED observation).
    //
    // The decoy rect's own fill-opacity (0.9) alone already clears
    // MIN_BG_OPACITY (0.5) — a buggy fill-opacity-only check would treat it
    // as opaque-enough. Its `opacity="0.4"` (compounding, per real SVG
    // rendering) brings the *product* to 0.36, below threshold, so a
    // correct implementation must exclude it as a background region. The
    // white text sitting inside the decoy's bounds makes the verdict itself
    // flip on whether the product logic actually ran: wrongly counted, the
    // decoy's dark fill would resolve as "the background" and white-on-dark
    // passes comfortably (zero findings); correctly excluded, resolution
    // falls through to the real (near-white) page background underneath,
    // and white-on-near-white fails WCAG — a finding, against that real bg.
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <rect x="0" y="0" width="1280" height="720" fill="${BG}"/>
      <rect x="0" y="0" width="400" height="400" fill="#051C2C" fill-opacity="0.9" opacity="0.4"/>
      <text x="50" y="50" font-size="20" fill="#FFFFFF">text over the translucent decoy</text>
    </svg>`
    const issues = findContrastIssues(markup)
    expect(issues).toHaveLength(1)
    expect(issues[0].background).toBe(BG)
  })
})

describe("__collectImageBackedTextRuns — audit-v2 phase B pixel-audit input", () => {
  it("collects a run painted over a bare photo (no scrim) — the exact case findContrastIssues itself skips", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <image href="data:image/png;base64,x" x="0" y="0" width="1280" height="720"/>
      <text x="96" y="600" font-size="20" fill="#000000">caption over unknown photo</text>
    </svg>`
    expect(findContrastIssues(markup)).toEqual([])
    const runs = __collectImageBackedTextRuns(markup)
    expect(runs).toHaveLength(1)
    // Text is sliced to 24 chars — same convention ContrastIssue.text/
    // OverflowIssue.text already use ("caption over unknown photo" is 27).
    expect(runs[0]).toMatchObject({ text: "caption over unknown pho", fill: "#000000", baseline: 600, fontSize: 20, required: 4.5 })
  })

  it("collects a run when the only overlay is too faint to resolve (ImagePages.tsx's DarkScrim shape)", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <image href="data:image/png;base64,x" x="0" y="0" width="1280" height="720"/>
      <rect x="0" y="0" width="1280" height="720" fill="#0A0E14" fill-opacity="0.3"/>
      <text x="96" y="600" font-size="20" fill="#FFFFFF">bespoke white cover text</text>
    </svg>`
    expect(findContrastIssues(markup)).toEqual([])
    const runs = __collectImageBackedTextRuns(markup)
    expect(runs).toHaveLength(1)
    expect(runs[0]!.fill).toBe("#FFFFFF")
  })

  it("does not collect a run once an opaque-enough scrim resolves the background (no false-positive pixel candidates)", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <image href="data:image/png;base64,x" x="0" y="0" width="1280" height="720"/>
      <rect x="0" y="0" width="1280" height="720" fill="#0A0A0C" fill-opacity="0.66"/>
      <text x="96" y="600" font-size="20" fill="#0A0A0C">low contrast on the scrim itself</text>
    </svg>`
    expect(__collectImageBackedTextRuns(markup)).toEqual([])
  })

  it("excludes decorative near-transparent text from image-backed collection too (same DECORATIVE_ALPHA gate as findContrastIssues)", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <image href="data:image/png;base64,x" x="0" y="0" width="1280" height="720"/>
      <text x="96" y="600" font-size="20" fill="#FFFFFF" fill-opacity="0.1">faint watermark over the photo</text>
    </svg>`
    expect(__collectImageBackedTextRuns(markup)).toEqual([])
  })

  it("computes left/right anchor-aware, matching svg-audit.ts's own estimator for start/middle/end", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <image href="data:image/png;base64,x" x="0" y="0" width="1280" height="720"/>
      <text x="640" y="100" font-size="20" text-anchor="middle" fill="#FFFFFF">centered</text>
      <text x="640" y="200" font-size="20" text-anchor="end" fill="#FFFFFF">right-aligned</text>
    </svg>`
    const runs = __collectImageBackedTextRuns(markup)
    expect(runs).toHaveLength(2)
    const [middle, end] = runs
    // text-anchor="middle": x is the run's horizontal center.
    expect(middle!.left).toBeLessThan(640)
    expect(middle!.right).toBeGreaterThan(640)
    expect((middle!.left + middle!.right) / 2).toBeCloseTo(640, 5)
    // text-anchor="end": x is the run's right edge.
    expect(end!.right).toBeCloseTo(640, 5)
    expect(end!.left).toBeLessThan(640)
  })

  it("uses the large-text 3:1 threshold once rendered size clears LARGE_TEXT_MIN_PX", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <image href="data:image/png;base64,x" x="0" y="0" width="1280" height="720"/>
      <text x="96" y="100" font-size="32" fill="#FFFFFF">big heading over the photo</text>
    </svg>`
    const runs = __collectImageBackedTextRuns(markup)
    expect(runs).toHaveLength(1)
    expect(runs[0]!.required).toBe(3)
  })
})

// Task-2 review (bench-driven fix round, defect A), Moderate #2: every real
// circle/ellipse the shipped component suite renders puts text dead-center
// (rings.tsx's "Core" label sits ~40px² from its circle's center — nowhere
// near an edge case), so the full-matrix/deck-audit real-render nets never
// exercised the new `ellipseShape` containment math, the paint-order-safety
// invariant, the opacity gate on the new shape kinds, or the interaction
// between `data-decor` and the now-floor-free attribution walk — "the
// riskiest new surface in the diff" per the review, and a future regression
// in any of them would have nothing here to catch it. These adapt the
// review's own independently-verified synthetic probe shapes into this
// file's regular synthetic-markup style.
describe("findContrastIssues — circle/ellipse containment and paint-order safety (bench-driven fix round, defect A synthetic edge cases)", () => {
  it("does not attribute text anchored in a circle's bbox corner to that circle when the point sits outside the disk", () => {
    // Circle cx=200,cy=200,r=20 — its AABB corners sit at distance
    // r*sqrt(2)≈28.28 from the center, always outside the disk itself no
    // matter the radius. Text placed exactly at the top-left bbox corner
    // (180,180) must fall through to the real white card beneath, not the
    // circle's own near-black fill — a cruder AABB containment test (the
    // shape's bounding box, not its actual outline) would wrongly say
    // "inside" and misattribute it.
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <rect x="0" y="0" width="1280" height="720" fill="#F7F7F2"/>
      <rect x="96" y="96" width="536" height="336" fill="#FFFFFF"/>
      <circle cx="200" cy="200" r="20" fill="#050505"/>
      <text x="180" y="180" font-size="20" fill="#000000">beside the badge, not on it</text>
    </svg>`
    // Wrongly attributed to the circle: #000000-on-#050505 ≈ 1:1, a finding.
    // Correctly falls through to the white card: #000000-on-#FFFFFF passes.
    expect(findContrastIssues(markup)).toEqual([])
  })

  it("attributes text exactly on a circle's boundary to that circle (inclusive edge, distance === r)", () => {
    // (420,400) sits exactly r=20 from the circle's own center (400,400) —
    // ellipseShape's containment uses `<= 1`, not `< 1`, so the boundary
    // itself must still count as inside, not just points strictly interior.
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <rect x="0" y="0" width="1280" height="720" fill="#F7F7F2"/>
      <circle cx="400" cy="400" r="20" fill="#050505"/>
      <text x="420" y="400" font-size="20" fill="#000000">on the boundary</text>
    </svg>`
    const issues = findContrastIssues(markup)
    expect(issues).toHaveLength(1)
    expect(issues[0].background).toBe("#050505")
  })

  it("never attributes text to a shape painted after it in document order", () => {
    // The circle is painted *after* the text, at the exact same position —
    // if the search ever walked paintedShapes without respecting paint
    // order (e.g. a two-pass "collect every shape, then check every text"
    // implementation instead of the real interleaved single walk), this
    // near-black text would wrongly resolve against the same-colored circle
    // instead of the real (white) page background it was actually painted
    // on top of.
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <rect x="0" y="0" width="1280" height="720" fill="#FFFFFF"/>
      <text x="100" y="100" font-size="20" fill="#000000">painted before the badge</text>
      <circle cx="100" cy="100" r="50" fill="#000000"/>
    </svg>`
    // Correct: resolves to the page's own white background, passes.
    // Broken order guard: resolves to the later circle instead,
    // #000000-on-#000000, a finding.
    expect(findContrastIssues(markup)).toEqual([])
  })

  it("skips a sub-MIN_BG_OPACITY circle for attribution, falling through to the real background beneath it", () => {
    // A translucent white circle (fill-opacity 0.3, below MIN_BG_OPACITY's
    // 0.5) sits on top of a dark card. Correct: too faint to trust as a
    // background estimate, so attribution skips it entirely and falls
    // through to the dark card beneath — near-white text against that dark
    // card passes comfortably. A bug that treated the circle as opaque
    // (using its raw #FFFFFF fill instead of skipping it) would silently
    // swap in a passing near-white-on-white verdict here instead — the same
    // "a false pass hides a real defect" failure mode as the mis-attributed
    // tspan test earlier in this file, on the new shape kinds specifically.
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <rect x="0" y="0" width="1280" height="720" fill="#0A0A0C"/>
      <circle cx="200" cy="200" r="40" fill="#FFFFFF" fill-opacity="0.3"/>
      <text x="200" y="200" font-size="20" fill="#F5F5F0">near-white on the dark card</text>
    </svg>`
    expect(findContrastIssues(markup)).toEqual([])
  })

  it("does not attribute text to an opaque, adequately-sized shape inside a <g data-decor> subtree", () => {
    // Mirrors the real-render decor-exclusion lock below (a campaign-theme
    // cover's motif), but targets *attribution* specifically with synthetic
    // markup: this circle is large, fully opaque, and geometrically contains
    // the text — every property that would normally make it win
    // backgroundAt's search — except that it sits inside a data-decor
    // subtree (`data-decor="true"`, this renderer's own real serialized
    // form — confirmed against a live render, not assumed). Worth locking
    // explicitly post-fix: attribution now has no area floor at all, so
    // without this guard *any* decor shape, however small, could shadow
    // nearby text — a strictly larger blast radius than pre-fix, when only
    // decor shapes big enough to clear MIN_BG_REGION_AREA could ever matter.
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <rect x="0" y="0" width="1280" height="720" fill="#FFFFFF"/>
      <g data-decor="true">
        <circle cx="200" cy="200" r="40" fill="#000000"/>
      </g>
      <text x="200" y="200" font-size="20" fill="#000000">over the decor watermark</text>
    </svg>`
    // Wrongly attributed to the decor circle: #000000-on-#000000, a finding.
    // Correctly excluded: falls through to the white page background, passes.
    expect(findContrastIssues(markup)).toEqual([])
  })
})

describe("findContrastIssues — decor/motif subtrees excluded from background-region collection", () => {
  // Real-render regression lock (not synthetic markup, unlike the suite
  // above) for the `data-decor` exclusion: reviewer measured 7-9 spurious
  // background regions per slide on campaign-theme covers before this fix,
  // dormant only because no test rendered a campaign cover through
  // `findContrastIssues`'s region collector and looked. `campaign-motif`
  // (`motif-campaign-motif.tsx`, `themeDef.motif` for the campaign theme)
  // draws several large, >=0.64-effective-opacity crayon-stroke `<path>`s —
  // exactly the shape `MIN_BG_REGION_AREA`/`MIN_BG_OPACITY` would otherwise
  // accept as real backgrounds — inside the `<g data-decor>` wrapper
  // `FullSlideSvg.tsx` renders around every theme motif's output.
  //
  // `layout: "split-diagonal"` pins the cover archetype deterministically
  // (an explicit `slide.layout` short-circuits the seed-based pick per
  // `resolveArchetypeId`'s own doc comment in `effective-layout.ts`) to
  // `cover-split-diagonal.tsx` — chosen specifically because it exercises
  // `pathBoundingBox`'s one remaining *exact* (non-decor) solid-path case
  // side-by-side with the decor exclusion in the same render, tying both
  // halves of this fix together. That gives an exact, hand-verified
  // legitimate region count of 2 (read from source, not guessed): the
  // campaign theme's solid `#3D2E78` full-page background
  // (`Background.tsx`'s `spec.kind === "color"` branch paints exactly one
  // `<rect>`) and `cover-split-diagonal.tsx`'s own `#F0559E` (`ctx.colors.
  // primary`) diagonal color panel (its accent bar is 72x5=360px², under
  // `MIN_BG_REGION_AREA`; its decorative circle isn't a rect/image/path at
  // all — neither contributes a region). `BrandChrome` renders nothing for
  // a cover slide with no `ir.brand` configured. If the decor exclusion
  // regressed, this count would jump well past 2.
  it("sees exactly the two legitimate background regions on a real campaign-theme cover, none from the motif", () => {
    const ir = deck("campaign", [
      { type: "cover", heading: "Launch Day", layout: "split-diagonal", components: [] },
    ])
    const markup = renderSlideSvg(ir, 0)
    const regions = __collectBgRegions(markup)
    expect(regions).toHaveLength(2)
    expect(regions.map((r) => r.fill).sort()).toEqual(["#3D2E78", "#F0559E"])
  })
})

describe("auditDeck — low-contrast via a real style-token override (validate-legal)", () => {
  it("flags a theme.style.colors.text override that lands near colors.bg", () => {
    // `theme.style` is a schema-legal deep-partial override — this is
    // content a real deck author (or an over-eager model) could actually
    // author and have pass `validateIr`; it just happens to render
    // unreadable text, which is exactly the "renderer-level, not
    // validate-level" problem this audit exists to catch.
    const ir = deck(
      "consulting",
      [{ type: "content", heading: "readable heading", components: [{ type: "paragraph", text: "some body copy" }] }],
      { theme: { id: "consulting", style: { colors: { text: "#F5F5F0" } } } },
    )
    const report = auditDeck(ir)
    const contrast = report.findings.filter((f) => f.code === "low-contrast")
    expect(contrast.length).toBeGreaterThan(0)
    expect(contrast[0].message).toMatch(/contrast/)
  })

  it("never throws on an asset (photo) background slide, resolved or not", () => {
    // `Background.tsx` falls back to a solid `#1A1A1A` rect for an
    // unresolved asset id (not `null`/indeterminate — a real, checkable
    // color), and adds an auto-scrim over a resolved one — so this doesn't
    // assert "no contrast findings" (both of those *are* legitimately
    // checkable backgrounds, see findContrastIssues's own asset/scrim
    // fixtures above); it only proves the whole pipeline stays robust
    // (parses, resolves, never throws) end-to-end for this background kind.
    const ir = deck("consulting", [
      {
        type: "content",
        heading: "photo bg",
        background: { kind: "asset", asset_id: "missing" },
        components: [{ type: "paragraph", text: "caption-like text" }],
      },
    ])
    expect(() => auditDeck(ir)).not.toThrow()
  })
})

describe("findOverlapIssues — synthetic markup", () => {
  // A real, IR-driven positive overlap fixture is not reachable through this
  // renderer's normal layout path: `layoutContentFit` only ever shrinks
  // inter-component gaps or drops components that don't fit — stacked
  // components within one column never collide by construction ("同列堆叠
  // 天然不相交"), and two-column/aside arrangements place columns at
  // disjoint x-ranges. Per the plan's own fallback for this check
  // ("overlap fixture...else synthetic-markup unit test + document"), these
  // exercise `findOverlapIssues` directly against hand-crafted markup that
  // reproduces the exact shape real components emit (a `data-audit-box`
  // wrapping a full-size background `<rect>`, `SvgContent`/`icon-cards.tsx`'s
  // own convention) — see the task report for the fuller adjudication.

  // Mirrors the real shape every card component emits (icon-cards.tsx etc.):
  // a `<g transform="translate(x,y)">` positions local content, and the
  // data-audit-box attribute independently bakes the same (x,y) absolute —
  // the rect's own x/y stay local (0,0), matching real markup exactly.
  const box = (x: number, y: number, w: number, h: number) =>
    `<g transform="translate(${x},${y})"><g data-audit-box="${x},${y},${w}"><rect x="0" y="0" width="${w}" height="${h}" fill="#FFFFFF"/></g></g>`

  it("flags two boxes whose rendered rects substantially overlap", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      ${box(100, 100, 200, 100)}
      ${box(150, 120, 200, 100)}
    </svg>`
    const issues = findOverlapIssues(markup)
    expect(issues).toHaveLength(1)
    expect(issues[0].ratio).toBeGreaterThan(0.2)
  })

  it("does not flag two boxes with only a hairline touching edge", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      ${box(100, 100, 200, 100)}
      ${box(299, 100, 200, 100)}
    </svg>`
    expect(findOverlapIssues(markup)).toEqual([])
  })

  it("does not flag a same-column vertical stack (sequential, non-overlapping y ranges)", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      ${box(96, 176, 1088, 80)}
      ${box(96, 272, 1088, 80)}
    </svg>`
    expect(findOverlapIssues(markup)).toEqual([])
  })

  it("does not flag a container box against its own nested per-item boxes", () => {
    // Mirrors icon-cards.tsx's real shape: SvgContent's outer data-audit-box
    // (no direct geometry of its own) wraps two inner per-card
    // data-audit-box elements. Without the nested-box exclusion, the outer
    // box would infer no geometry and just vanish — a weaker version of
    // this test — so this specifically also gives the *outer* scope direct
    // geometry too (a connecting line, mirroring steps.tsx's vertical-mode
    // connector), which would otherwise spatially contain both inner cards
    // and register as ~100% overlap with each.
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <g data-audit-box="96,176,1088">
        <g transform="translate(96,176)">
          <line x1="10" y1="0" x2="10" y2="200" stroke="#000"/>
          <g data-audit-box="96,176,500"><rect x="0" y="0" width="500" height="200" fill="#FFFFFF"/></g>
          <g data-audit-box="684,176,500"><rect x="0" y="0" width="500" height="200" fill="#FFFFFF"/></g>
        </g>
      </g>
    </svg>`
    expect(findOverlapIssues(markup)).toEqual([])
  })

  it("infers height from a text-only box (no background rect) via font-metrics, and flags real intersection", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <g data-audit-box="96,176,400"><text x="96" y="196" font-size="20">bullet one</text></g>
      <g data-audit-box="96,190,400"><text x="96" y="210" font-size="20">overlapping bullet</text></g>
    </svg>`
    const issues = findOverlapIssues(markup)
    expect(issues).toHaveLength(1)
  })

  // Borrow-wave Task 4 (inventory-first): fact-report Q4's Case B, ported
  // from that task's read-only probe (q4-overlap-probe.ts, scratchpad, not
  // shipped in this repo) into a permanent pin. Box A's declared width
  // (200px) leaves a clear 40px declared gap before box B — but box A's
  // `<text>` is long enough that its real ink, measured the same way
  // `fitSvgLine`/`measureTextUnits` would size it at this font-size, runs
  // hundreds of px past the declared box and deep into box B's territory.
  // Pre-fix, `collectLeafBoxes` never read a `<text>` element's `x` or its
  // content's width at all — only ever widened a box's inferred *bottom*
  // (height) from a text baseline — so this exact pair reported zero
  // issues (confirmed red against the pre-fix source before this test was
  // added to the suite). This is the false-negative half fact-report Q4
  // found and this task's inventory (task-4-report.md, scratchpad) found a
  // real, shipping instance of (matrix.tsx's `x_title`) inside a live
  // `data-audit-box` scope, not just a synthetic hypothetical.
  it("flags a declared-gap pair when box A's real text ink overruns into neighbor B (Q4 Case B false negative)", () => {
    const longText = "This label is deliberately far too long for its declared box width"
    // Box A is hand-rolled (text-only, no card chrome — a bare label like
    // matrix.tsx's x_title) rather than built from `box()` above, since the
    // point is a leaf whose *only* geometry is the text itself. Box B reuses
    // `box()` for its background rect so it registers at its declared
    // position via that helper's own translate wrapper, the same way every
    // other rect-backed box in this describe block does.
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <g data-audit-box="100,300,200"><text x="100" y="320" font-size="24">${longText}</text></g>
      ${box(340, 300, 300, 80)}
    </svg>`
    const issues = findOverlapIssues(markup)
    expect(issues).toHaveLength(1)
  })

  // Companion pin for Q4's *other* half (Case A) — a declared-box false
  // positive real glyphs don't back up. This task's decision rule (per the
  // controlling brief) only closes the false-negative half above: widening
  // a box from real ink never *shrinks* it, so a pair whose declared boxes
  // already overlap while the real glyphs inside stay apart keeps
  // reporting the exact same (false-positive) finding, unchanged, both
  // before and after this task's fix — this pins that the fix doesn't
  // quietly also change Case A's behavior. Not a new capability: recorded
  // here as a stays-the-same negative control, same values as the original
  // Case A repro in q4-overlap-probe.ts (scratchpad, not shipped in this
  // repo) and docs/contrast-system.md's "Overlap detection boundary".
  it("still flags Case A's declared-box overlap unchanged (real glyphs stay apart — a documented, un-closed limitation)", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <g data-audit-box="100,100,300"><text x="100" y="160" font-size="40">Q1</text></g>
      <g data-audit-box="300,100,300"><text x="300" y="160" font-size="40">Q2</text></g>
    </svg>`
    const issues = findOverlapIssues(markup)
    expect(issues).toHaveLength(1)
  })
})

describe("auditDeck — finding shape contract", () => {
  it("every finding auditDeck produces has a well-formed page/code/message", () => {
    // Smoke-tests the auditDeck -> overflowFindings/contrastFindings/
    // overlapFindings wiring (page/slideId/message/detail shape) using the
    // same real render path as every other auditDeck test — this deck
    // happens to be a *clean* one (no real overlap reachable, as
    // established above), so this only asserts the shape contract on
    // whatever findings a deliberately tiny deck can produce, via the
    // exported AuditFinding fields.
    const ir = deck("consulting", [{ type: "cover", heading: "hello", components: [] }])
    const report: { findings: AuditFinding[] } = auditDeck(ir)
    for (const f of report.findings) {
      expect(f.page).toBeGreaterThan(0)
      expect([
        "overflow",
        "out-of-bounds",
        "low-contrast",
        "overlap",
        "content-truncated",
        "content-dropped",
      ]).toContain(f.code)
      expect(typeof f.message).toBe("string")
    }
  })
})

// Arc-bbox root fix (fix/arc-bbox): `pathBoundingBox` used to extract every
// numeric token from a path's `d` and min/max them, blind to path grammar —
// exact for straight-line polygons, silently wrong for an `A`/`a` arc
// command, whose own rx/ry/rotation/flag numbers got paired as if they were
// more (x,y) coordinates. `insight_panel.tsx`/`roadmap.tsx`'s shared
// `roundedTopBarPath` accent bar hit this dead-on: a real ~6px-tall bar
// inflated to a ~1184×1182px bbox dwarfing the 1280×720 canvas (recorded in
// docs/contrast-system.md's former "Known limitation" paragraph and
// `.issues/notes/2026-07-18-post-v03-backlog.md`'s "本轮新发现 (a)"). This
// block first pins the pre-fix defect as a *characterization* test (the old
// algorithm reimplemented inline, run against a real render's exact `d`
// string — not a call into the fixed source, which no longer contains the
// buggy path), then asserts the fixed `__pathBoundingBox` produces a tight
// bbox for the same string, plus synthetic arc grammar cases the real
// render doesn't happen to exercise (a full circle via two arcs, absolute
// and relative).
describe("__pathBoundingBox — arc-bbox root fix (fix/arc-bbox)", () => {
  // A real `insight_panel` accent-bar `d` string, captured from
  // `renderSlideSvg` (insight theme, 2-row panel) before this fix —
  // `roundedTopBarPath(96, 322.34.., 1088, 6, 2)`'s exact output. Kept as a
  // literal (not re-derived from the component) so this test stays a fixed
  // characterization of the real defect, immune to unrelated future layout
  // changes in insight_panel.tsx's own padding/measurement math.
  const REAL_ACCENT_BAR_D =
    "M 96 322.34000000000003 A 2 2 0 0 1 98 320.34000000000003 " +
    "L 1182 320.34000000000003 A 2 2 0 0 1 1184 322.34000000000003 " +
    "L 1184 326.34000000000003 L 96 326.34000000000003 Z"

  it("characterizes the pre-fix defect: the old blind token min/max inflates the accent bar to ~1184x1182", () => {
    // The exact pre-fix algorithm (deck-audit.ts's own `pathBoundingBox`
    // before this task), reimplemented inline rather than imported — the
    // source no longer contains it (see `pathBoundingBoxByTokenMinMax`'s
    // doc comment, now scoped to the malformed-`d` fallback only). This is
    // the red half of red->green: it documents exactly how wrong the old
    // behavior was, numerically, against a real render's output.
    const oldTokenMinMax = (d: string) => {
      const nums = d.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi)!
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = Number(nums[i])
        const y = Number(nums[i + 1])
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    }
    const bbox = oldTokenMinMax(REAL_ACCENT_BAR_D)
    // Empirically confirmed while building this fix (and matching
    // docs/contrast-system.md's former "Known limitation" paragraph almost
    // exactly, modulo the fresh fixture's own exact box width): the arc's
    // own `rx ry rot largeArc sweep` numbers (2, 2, 0, 0, 1) get paired as
    // bogus coordinates, and the bogus min x=0/min y=0 corner (from the
    // rotation/flag zeros) plus the real max x=1184/max y=326.34 gets
    // further corrupted by the flag "1" pairing with a real y coordinate.
    expect(bbox.x).toBe(0)
    expect(bbox.y).toBe(0)
    expect(bbox.w).toBeCloseTo(1184, 0)
    expect(bbox.h).toBeCloseTo(1182, 0)
  })

  it("fixes the accent bar: the grammar-aware bbox is tight around the real ~1088x6 bar, not the phantom ~1184x1182", () => {
    const bbox = __pathBoundingBox(REAL_ACCENT_BAR_D)
    expect(bbox).not.toBeNull()
    expect(bbox!.x).toBeCloseTo(96, 1)
    expect(bbox!.y).toBeCloseTo(320.34, 1)
    expect(bbox!.w).toBeCloseTo(1088, 1)
    expect(bbox!.h).toBeCloseTo(6, 1)
  })

  it("small corner-rounding arcs (a miniature roundedTopBarPath shape) stay tight to the bar's own box, not the corner radius", () => {
    // Same shape family as the real bar above, hand-built at a size small
    // enough to eyeball: a 40x6 bar with a 4px corner radius. The rounded
    // corners cut *into* the rectangle, never bulge past it, so the tight
    // bbox must equal the un-rounded rectangle's own extent exactly.
    const d = "M 0 4 A 4 4 0 0 1 4 0 L 36 0 A 4 4 0 0 1 40 4 L 40 6 L 0 6 Z"
    const bbox = __pathBoundingBox(d)
    expect(bbox).toEqual({ x: 0, y: 0, w: 40, h: 6 })
  })

  it("a full circle via two absolute semicircle arcs bounds exactly to its true circle, not the chord/flag numbers", () => {
    // M 150 100 A 50 50 0 1 1 50 100 A 50 50 0 1 1 150 100 — the textbook
    // "circle via two arcs" idiom, center (100, 100) radius 50 (independently
    // confirmed via the same endpoint->center math run standalone before
    // writing this test, not just trusted from the implementation under
    // test). True bbox: x/y in [50, 150].
    const d = "M 150 100 A 50 50 0 1 1 50 100 A 50 50 0 1 1 150 100"
    const bbox = __pathBoundingBox(d)
    expect(bbox).toEqual({ x: 50, y: 50, w: 100, h: 100 })
  })

  it("a full circle via two relative semicircle arcs (lowercase a) bounds correctly, proving relative-command handling", () => {
    // M 60 10 a 50 50 0 1 1 -100 0 a 50 50 0 1 1 100 0 — relative-arc
    // version of the same idiom, center (10, 10) radius 50. Both arcs
    // confirmed (via standalone sampling before writing this test) to trace
    // complementary halves of the same circle, not the same half twice.
    const d = "M 60 10 a 50 50 0 1 1 -100 0 a 50 50 0 1 1 100 0"
    const bbox = __pathBoundingBox(d)
    expect(bbox).toEqual({ x: -40, y: -40, w: 100, h: 100 })
  })

  it("falls back to the old token min/max — never throws — on a d string the grammar walk can't parse", () => {
    // "Q" here is missing its final (x, y) pair — a genuinely malformed
    // path the grammar walk can't finish (runs out of tokens mid-command)
    // — the fallback still returns a safe (if approximate) bbox instead of
    // throwing and taking down the whole audit walk.
    const bbox = __pathBoundingBox("M 0 0 Q 10 20")
    expect(bbox).toEqual({ x: 0, y: 0, w: 10, h: 20 })
  })

  it("an exact straight-line polygon (cover-split-diagonal.tsx's real shape) stays exact, unaffected by the grammar rewrite", () => {
    const d = "M 0,0 L 560,0 L 460,720 L 0,720 Z"
    const bbox = __pathBoundingBox(d)
    expect(bbox).toEqual({ x: 0, y: 0, w: 560, h: 720 })
  })

  it("a cubic curve's exact bbox extends past its own endpoints when the control points do", () => {
    // M 0 0 C 0 100 100 100 100 0 — a symmetric hump. Endpoints are (0,0)
    // and (100,0), both y=0, but the curve visibly bulges upward toward the
    // control points (0,100)/(100,100) — an endpoints-only bbox would
    // wrongly report h=0. Exact analytic extreme: at t=0.5 the curve's own
    // y reaches 75 (cubic Bezier at the midpoint of two control points both
    // at y=100 with endpoints at y=0: y(0.5) = 3*0.25*100 + 3*0.25*100 = 75).
    const d = "M 0 0 C 0 100 100 100 100 0"
    const bbox = __pathBoundingBox(d)
    expect(bbox!.x).toBeCloseTo(0, 1)
    expect(bbox!.w).toBeCloseTo(100, 1)
    expect(bbox!.y).toBeCloseTo(0, 1)
    expect(bbox!.h).toBeCloseTo(75, 1)
  })
})

// Compressed SVG arc-flag fix (fix/arc-bbox, flag-parse round): the arc-bbox
// root fix above made `pathBoundingBoxByGrammar` grammar-aware for M/L/H/V/
// C/S/Q/T/A/Z, but its tokenizer (`tokenizePathD`) still read every operand
// with one generic greedy-number regex — correct for every other command,
// silently wrong for `A`/`a`'s `large-arc-flag`/`sweep-flag` operands, which
// SVG's grammar defines as exactly one `"0"`/`"1"` character each and which
// real authoring tools (lucide's own `d` strings, this catalog's upstream —
// see `src/icons.ts`'s header) routinely glue to each other and to the
// following coordinate with no separator (`"a1 1 0 001 1"` = rx 1 ry 1 rot 0
// large-arc-flag 0 sweep-flag 0 x 1 y 1, not "001" as one number). A code
// review of this branch caught it against real, already-shipped data: 16 of
// the 2229 arc-bearing `d` strings in `src/icons.ts` produced a silently
// wrong (non-null, non-thrown) bbox. `tokenizePathD` is now a positional
// char-by-char scanner that reads the 4th/5th argument of every `A`/`a`
// 7-tuple as exactly one flag character, whatever's glued on either side.
//
// Every expected bbox below was independently re-derived (not trusted from
// this branch's own arc math) two ways: (1) hand-tracing the grammar
// char-by-char against the SVG 1.1 path-data BNF, and (2) a from-scratch
// reference implementation (positional tokenizer + brute-force parametric
// sampling of each curve/arc at up to 400,000 points, entirely independent
// of this file's derivative-root/endpoint-to-center code) run standalone
// before writing these assertions. Both methods agree with the fixed
// `__pathBoundingBox`'s actual output to well within the `toBeCloseTo`
// tolerances used here.
describe("__pathBoundingBox — compressed SVG arc-flag fix (fix/arc-bbox, flag-parse round)", () => {
  it("characterizes the pre-fix defect: the old greedy-regex tokenizer reads a glued '001' as one number, not flag 0 + flag 0 + x 1", () => {
    // The exact pre-fix `tokenizePathD` regex (`/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi`)
    // reimplemented inline — same red-half-of-red/green precedent the arc-bbox
    // root fix's own characterization test above uses, since the buggy source
    // no longer exists to call directly. "a1 1 0 001 1" (rx 1 ry 1 rot 0
    // large-arc-flag 0 sweep-flag 0 x 1 y 1) reads "001" as a single token
    // (value 1) via this regex, desyncing every argument after the rotation:
    // large-arc-flag becomes 1 (not 0), sweep-flag becomes the next token "1"
    // (not 0), and the arc's own x then has no token left before the next
    // command letter — throwing "malformed" and silently falling back to the
    // pre-arc-fix blind token min/max over the whole `d` string.
    const oldGreedyTokenize = (d: string) => d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
    const tokens = oldGreedyTokenize("a1 1 0 001 1")
    expect(tokens).toEqual(["a", "1", "1", "0", "001", "1"])
    // rx=1 ry=1 rot=0 read correctly; large-arc-flag then wrongly consumes
    // the whole "001" token (Number("001") === 1) instead of just its first
    // character, and only one token ("1") remains for sweep-flag — none left
    // for x, which is exactly why the real function above throws and falls
    // back rather than returning a wrong-but-plausible-looking arc.
    expect(Number(tokens[4])).toBe(1)
  })

  it("fixes the reviewer's minimal case: 'M14 2v5a1 1 0 001 1h5' bounds to the real 6x6 corner-round box, not the pre-fix fallback's 13x2 phantom", () => {
    // Pre-fix (captured via a temporary probe against this exact source
    // before the tokenizer fix, same non-committed-probe method the original
    // review used): __pathBoundingBox returned {x:1,y:0,w:13,h:2} — the old
    // blind-token-min-max fallback pairing (14,2)(5,1)(1,0)(1,1) after "001"
    // collapsed to a single "1" token, an entirely different region of the
    // path than what it actually draws.
    //
    // Independently re-derived correct trace: M sets (14,2). v5 lines to
    // (14,7). a1 1 0 0 0 1 1 draws a quarter-round arc (rx=ry=1) from (14,7)
    // to (15,8) — a small corner cut that stays within the rectangle
    // [14,15]x[7,8], contributing no bbox extension beyond its own endpoints
    // (radius 1 == chord's own half-diagonal component, no scale-up, no
    // bulge past the endpoints for this specific quarter-turn geometry).
    // h5 lines to (20,8). Full path bbox: x in [14,20] (w=6), y in [2,8]
    // (starts at M's y=2, ends at the arc/line's y=8) — w=6, h=6.
    const bbox = __pathBoundingBox("M14 2v5a1 1 0 001 1h5")
    expect(bbox).not.toBeNull()
    expect(bbox!.x).toBeCloseTo(14, 2)
    expect(bbox!.y).toBeCloseTo(2, 2)
    expect(bbox!.w).toBeCloseTo(6, 2)
    expect(bbox!.h).toBeCloseTo(6, 2)
  })

  it("fixes the reviewer's second case (hdmi-port's real d string): bounds to the real 20x8 port outline, not the pre-fix fallback's 23x17 phantom", () => {
    // Pre-fix: __pathBoundingBox returned {x:-1,y:-1,w:23,h:17} (same blind
    // fallback mechanism as above, on hdmi-port's own real `d`). Correct
    // value independently re-derived via the brute-force sampling reference
    // described in this describe block's header.
    const d =
      "M22 9a1 1 0 00-1-1H3a1 1 0 00-1 1v4a1 1 0 001 1h.5a2 2 0 011.6.8l.3.4A2 2 0 007 16h10a2 2 0 001.6-.8l.3-.4a2 2 0 011.6-.8h.5a1 1 0 001-1z"
    const bbox = __pathBoundingBox(d)
    expect(bbox).not.toBeNull()
    expect(bbox!.x).toBeCloseTo(2, 2)
    expect(bbox!.y).toBeCloseTo(8, 2)
    expect(bbox!.w).toBeCloseTo(20, 2)
    expect(bbox!.h).toBeCloseTo(8, 2)
  })

  // All 16 real `src/icons.ts` `d` strings a full-catalog scan (2229
  // arc-bearing paths, all of `PPTX_ICONS`) found silently mis-parsed
  // pre-fix — not a hand-picked sample, the complete set, matching the
  // review's own "16 real icon paths" count exactly. Expected values are the
  // brute-force-sampling reference's output (this describe block's header),
  // cross-checked to match the fixed `__pathBoundingBox`'s actual output to
  // within 3 decimal places before rounding for these assertions.
  it.each([
    {
      icon: "ethernet-port",
      d: "M19 17a2 2 0 00-1.765 1.059l-.47.882A2 2 0 0115 20H9a2 2 0 01-1.765-1.059l-.47-.882A2 2 0 005 17H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v9a2 2 0 01-2 2z",
      expected: { x: 2, y: 4, w: 20, h: 16 },
    },
    {
      icon: "file-box (accent corner arc)",
      d: "M14 2v5a1 1 0 001 1h5",
      expected: { x: 14, y: 2, w: 6, h: 6 },
    },
    {
      icon: "file-box (envelope outline)",
      d: "M14.692 22H18a2 2 0 002-2V8a2.4 2.4 0 00-.706-1.706l-3.588-3.588A2.4 2.4 0 0014 2H6a2 2 0 00-2 2v3.804",
      expected: { x: 4, y: 2, w: 16, h: 20 },
    },
    {
      icon: "file-box (box lid)",
      d: "M2.995 13.014A2 2 0 002 14.744v3.516a2 2 0 00.996 1.73l3 1.74a2 2 0 002.008 0l3-1.74A2 2 0 0012 18.26v-3.517a2 2 0 00-.995-1.73l-3-1.742a2 2 0 00-1.892-.064z",
      expected: { x: 2, y: 11, w: 10, h: 11 },
    },
    {
      icon: "hdmi-port",
      d: "M22 9a1 1 0 00-1-1H3a1 1 0 00-1 1v4a1 1 0 001 1h.5a2 2 0 011.6.8l.3.4A2 2 0 007 16h10a2 2 0 001.6-.8l.3-.4a2 2 0 011.6-.8h.5a1 1 0 001-1z",
      expected: { x: 2, y: 8, w: 20, h: 8 },
    },
    {
      icon: "paper-bag (left side)",
      d: "M5.364 3.848C4 6 3 9.652 3 12.652V19a2 2 0 002 2h14a2 2 0 002-2v-5c0-2.334-1.816-4.668-2.622-7.002",
      expected: { x: 3, y: 3.848, w: 18, h: 17.152 },
    },
    {
      icon: "paper-bag (fold)",
      d: "M7 3h11.379a2 2 0 011.789 1.106l.723 1.447A1 1 0 0119.997 7h-8.525a2 2 0 01-1.789-1.106L8.79 4.105a2 2 0 10-3.579 1.789l2.261 4.522A5 5 0 018 12.652V21",
      expected: { x: 5, y: 3, w: 15.997, h: 18.001 },
    },
    {
      icon: "save-pen (page corner)",
      d: "M13.33 13H8a1 1 0 00-1 1v7",
      expected: { x: 7, y: 13, w: 6.33, h: 8 },
    },
    {
      icon: "save-pen (pencil nib)",
      d: "M14.363 17.634a2 2 0 00-.506.854l-.837 2.87a.5.5 0 00.62.62l2.87-.837a2 2 0 00.854-.506l4.013-4.009a1 1 0 10-3.004-3.004z",
      expected: { x: 13, y: 13, w: 8.999, h: 8.998 },
    },
    {
      icon: "save-pen (fold corner)",
      d: "M7 3v4a1 1 0 001 1h7",
      expected: { x: 7, y: 3, w: 8, h: 5 },
    },
    {
      icon: "save-pen (page outline)",
      d: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h10.2a2 2 0 011.4.6l3.8 3.8a2 2 0 01.6 1.4v.3",
      expected: { x: 3, y: 3, w: 18, h: 18 },
    },
    {
      icon: "scan-box (top-right corner)",
      d: "M17 3h2a2 2 0 012 2v2",
      expected: { x: 17, y: 3, w: 4, h: 4 },
    },
    {
      icon: "scan-box (bottom-right corner)",
      d: "M21 17v2a2 2 0 01-2 2h-2",
      expected: { x: 17, y: 17, w: 4, h: 4 },
    },
    {
      icon: "scan-box (top-left corner)",
      d: "M3 7V5a2 2 0 012-2h2",
      expected: { x: 3, y: 3, w: 4, h: 4 },
    },
    {
      icon: "scan-box (bottom-left corner)",
      d: "M7 21H5a2 2 0 01-2-2v-2",
      expected: { x: 3, y: 17, w: 4, h: 4 },
    },
    {
      icon: "scan-box (viewfinder box)",
      d: "M7.995 8.514A2 2 0 007 10.244v3.516a2 2 0 00.996 1.73l3 1.74a2 2 0 002.008 0l3-1.74A2 2 0 0017 13.76v-3.517a2 2 0 00-.995-1.73l-3-1.742a2 2 0 00-1.892-.064z",
      expected: { x: 7, y: 6.5, w: 10, h: 11 },
    },
  ])("$icon: bounds to the correct, independently-derived box (silently wrong pre-fix)", ({ d, expected }) => {
    const bbox = __pathBoundingBox(d)
    expect(bbox).not.toBeNull()
    expect(bbox!.x).toBeCloseTo(expected.x, 1)
    expect(bbox!.y).toBeCloseTo(expected.y, 1)
    expect(bbox!.w).toBeCloseTo(expected.w, 1)
    expect(bbox!.h).toBeCloseTo(expected.h, 1)
  })

  it("reproduces the whole-page-phantom-bbox class with a compressed-flag rewrite of the real accent bar: tight ~1088x6, matching the space-separated original exactly", () => {
    // `roundedTopBarPath`'s real output (the arc-bbox root fix's own
    // characterization fixture above, `REAL_ACCENT_BAR_D`) already space-
    // separates every arc operand ("A 2 2 0 0 1 98 ..."), so it never
    // exercised this defect class itself. This is the same shape, same
    // coordinates, with the two arcs' "0 1 98"/"0 1 1184" glued into
    // compressed "0198"/"011184" — legal per the SVG grammar, and exactly
    // the shape of glued digit this codebase's own icon catalog contains.
    // A correctly positional parse must recover the identical tight bbox
    // the space-separated form does; a naive greedy-number tokenizer
    // desyncs on the glued flags/coordinate and (independently confirmed
    // via a temporary probe against the pre-fix source) balloons this to
    // {x:0,y:0,w:11184,h:1182} — the same defect class ("insight_panel"/
    // "roadmap"'s real ~1184x1182 phantom bbox), reached via compressed
    // flags instead of the original bar's own now-fixed grammar gap.
    const compressedAccentBar =
      "M 96 322.34000000000003 A2 2 0 0198 320.34000000000003 " +
      "L 1182 320.34000000000003 A2 2 0 011184 322.34000000000003 " +
      "L 1184 326.34000000000003 L 96 326.34000000000003 Z"
    const bbox = __pathBoundingBox(compressedAccentBar)
    expect(bbox).not.toBeNull()
    expect(bbox!.x).toBeCloseTo(96, 1)
    expect(bbox!.y).toBeCloseTo(320.34, 1)
    expect(bbox!.w).toBeCloseTo(1088, 1)
    expect(bbox!.h).toBeCloseTo(6, 1)
  })

  it("parses the review's own synthetic string correctly per spec — not a tight bar for these particular (radius 2, chord ~1180) numbers, but provably different from the pre-fix {0,0,1181,1181} phantom", () => {
    // "M10 315 A2 2 0 010 313 L 1181 313 A2 2 0 011 315 L1181 319 L10 319 Z"
    // — flagged by the review as reproducing the phantom-bbox class. Traced
    // positionally per spec: the first arc is rx=2 ry=2 rot=0 large-arc-flag=0
    // sweep-flag=1 x=0 y=313 (not x=12 — "010 313" decodes to flag '0',
    // flag '1', then the digit '0' immediately following starts x itself,
    // giving x=0, not a continuation of "12"). With a declared radius of 2
    // but a ~10-unit chord to (0,313) from the start point (10,315), and
    // later a ~1180-unit chord for the second arc, SVG's own out-of-range
    // radius correction (appendix F.6.6.2: scale rx/ry up by sqrt(lambda)
    // when the declared radius can't reach the chord) forces a large
    // effective radius — so this exact string's own correct bbox is
    // genuinely large (independently re-derived via brute-force sampling:
    // x=-0.099 y=313 w=1181.1 h=591.0), not tight. It is nonetheless a
    // faithful demonstration of the fix: the pre-fix fallback value
    // (independently confirmed via a temporary probe against the pre-fix
    // source) was {x:0,y:0,w:1181,h:1181} — a different, spec-incorrect
    // region reached by mis-pairing flag/rotation numbers as coordinates,
    // not the radius-correction math above.
    const bbox = __pathBoundingBox(
      "M10 315 A2 2 0 010 313 L 1181 313 A2 2 0 011 315 L1181 319 L10 319 Z"
    )
    expect(bbox).not.toBeNull()
    expect(bbox!.x).toBeCloseTo(-0.1, 1)
    expect(bbox!.y).toBeCloseTo(313, 1)
    expect(bbox!.w).toBeCloseTo(1181.1, 1)
    expect(bbox!.h).toBeCloseTo(591, 1)
  })

  it("still falls back honestly (never throws) on a genuinely malformed arc missing its final coordinate", () => {
    // "A 2 2 0 0 1" with no trailing x/y at all — the positional flag
    // parser correctly reads both flags, then the grammar walk's own num()
    // throws on running out of tokens for x, same honest-fallback contract
    // as every other malformed case in the arc-bbox root fix's own tests.
    const bbox = __pathBoundingBox("M 0 0 A 2 2 0 0 1")
    expect(bbox).toEqual({ x: 0, y: 0, w: 2, h: 2 })
  })

  it("a repeated arc group with no second command letter still parses each group's flags positionally, not just the first", () => {
    // "M 0 0 a1 1 0 001 1 1 1 0 001 1" — a single "a" command carrying two
    // 7-tuples back to back, the implicit-repeat grammar rule (no second
    // "a" between them). Each compressed group ("001 1", both times) is
    // rx=1 ry=1 rot=0 large-arc-flag=0 sweep-flag=0 x=1 y=1 — the same
    // compressed shape as the minimal-case test above, applied twice.
    // The tokenizer's argIndex tracking must reset after 7 arguments
    // without seeing a new command letter for the second group's flags to
    // be read positionally too, not as one more generic number each. Two
    // relative quarter-round steps: (0,0) -> (1,1) -> (2,2), independently
    // confirmed via the standalone reference implementation (not just
    // hand-traced, to avoid the exact kind of manual-counting error this
    // whole fix exists to eliminate).
    const bbox = __pathBoundingBox("M 0 0 a1 1 0 001 1 1 1 0 001 1")
    expect(bbox).not.toBeNull()
    expect(bbox!.x).toBeCloseTo(0, 1)
    expect(bbox!.y).toBeCloseTo(0, 1)
    expect(bbox!.w).toBeCloseTo(2, 1)
    expect(bbox!.h).toBeCloseTo(2, 1)
  })
})

// Arc-bbox root fix, reclassification sweep: fixing `pathBoundingBox` (above)
// exposed a *real* defect the old bug had been masking, not just resolving
// false positives. `insight_panel.tsx`'s title and `roadmap.tsx`'s period
// text both render an unguarded `colors.accent` fill with no
// `accessibleInk` wrap — pre-fix, deck-audit.ts's `backgroundAt` resolved
// both against the accent bar's own bogus ~whole-card phantom region, whose
// fill is that exact same `colors.accent` value, so every theme scored a
// trivial ratio=1 "pass" (the benchmark-reported "insight_panel title
// renders 1:1 contrast across themes" symptom this task's brief named). A
// 13-theme sweep against the fixed bbox (run while building this fix, not
// asserted directly here — see the task report's reclassification table)
// found 8/13 themes' real (accent-on-`colors.surface`) pair genuinely fails
// 4.5:1. Fixed the same way `roadmap.tsx`'s own badge digit already was
// (`accessibleInk`, same file, established precedent) — these two tests are
// the red->green pin for that fix, using two of the eight affected themes.
describe("auditDeck — arc-bbox reclassification ink fixes (fix/arc-bbox)", () => {
  it("insight_panel.tsx's title clears contrast against academic's accent-on-surface pairing once measured against its real panel background", () => {
    const ir = deck("academic", [
      {
        type: "content",
        heading: "insight",
        components: [
          {
            type: "insight_panel",
            title: "Strategy",
            rows: [{ label: "Focus", text: "Ship the core loop before anything else." }],
          },
        ],
      },
    ])
    const contrast = auditDeck(ir).findings.filter((f) => f.code === "low-contrast")
    expect(contrast.some((f) => f.detail?.text === "Strategy")).toBe(false)
  })

  it("roadmap.tsx's period text clears contrast against luxe's accent-on-surface pairing once measured against its real card background", () => {
    const ir = deck("luxe", [
      {
        type: "content",
        heading: "roadmap",
        components: [
          {
            type: "roadmap",
            items: [{ title: "Kickoff", period: "Q1", rows: [{ label: "Scope", value: "discovery" }] }],
          },
        ],
      },
    ])
    const contrast = auditDeck(ir).findings.filter((f) => f.code === "low-contrast")
    expect(contrast.some((f) => f.detail?.text === "Q1")).toBe(false)
  })
})
