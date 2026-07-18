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
import { PptxIRSchema, type PptxIR, type Slide } from "@/ir"
import { renderSlideSvg } from "../../api"
import { installNodePlatform } from "../../platform/node"
import {
  auditDeck,
  findContrastIssues,
  findOverlapIssues,
  __collectBgRegions,
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
    version: "3",
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
  // matrix while developing this check surfaced five distinct, genuine,
  // pre-existing sources of borderline-WCAG decorative/semantic colour that
  // this task did not introduce and is out of scope to remediate (a
  // cross-cutting theme-polish pass, not "audit core") — documented in the
  // task report, and locked in as explicit regression tests right below
  // this block so the *specific*, understood cases stay understood rather
  // than silently allowlisted:
  //   1. `kpi.tsx`'s `deltaProps` — hardcoded universal red/green
  //      up/down arrows, uncalibrated against per-theme backgrounds.
  //   2. `code.tsx`'s `LINE_NUM_COLOR` — a hardcoded editor-gutter gray.
  //   3. `ending-banner-ending.tsx`/`ending-rail-ending.tsx`'s
  //      `COPYRIGHT_FAINT` — an explicitly-adjudicated (see that file's own
  //      lengthy doc comment) cross-theme "copyright is the faintest text
  //      tier" convention.
  //   4. `quote.tsx`'s decorative open-quote mark — the component's own
  //      comment calls it decorative; it renders at full opacity in
  //      `ctx.colors.accent`, so `DECORATIVE_ALPHA`'s opacity-based
  //      exemption (correctly) doesn't catch it.
  //   5. `architecture.tsx`'s layer title (`ctx.colors.primary` on
  //      `ctx.colors.panel ?? ctx.colors.surface`) — a *theme's own*
  //      internal colour pairing, not a hardcoded value; on `insight`
  //      specifically it computes to 4.40:1, essentially a rounding
  //      distance under the 4.5:1 body threshold.
  // Every one of these is a real (if minor/borderline) WCAG deviation an
  // advisory audit is *supposed* to surface — asserting them away would
  // defeat the point. None of them appear in `examples/basic.json` (the
  // plan's actual clean-deck gate, asserted above).
  const THEMES = ["consulting", "insight", "tech", "campaign", "luxe"] as const
  for (const themeId of THEMES) {
    for (const [name, stressDeck] of Object.entries(STRESS_DECKS)) {
      it(`${themeId} / ${name} stress deck: no false-positive overlap findings, no crash`, () => {
        const ir: PptxIR = { ...stressDeck, theme: { ...stressDeck.theme, id: themeId } }
        const report = auditDeck(ir)
        expect(report.findings.filter((f) => f.code === "overlap")).toEqual([])
        for (const f of report.findings) {
          expect(["overflow", "out-of-bounds", "low-contrast", "overlap"]).toContain(f.code)
          expect(f.message.length).toBeGreaterThan(0)
        }
      })
    }
  }
})

describe("auditDeck — understood pre-existing low-contrast sources (not audit bugs)", () => {
  // Each of these locks in *why* a specific, real component produces a
  // low-contrast finding under the stress matrix above, so a future change
  // to any of these five colours shows up here instead of silently
  // vanishing from (or reappearing in) the broader regression net.
  it("kpi.tsx's hardcoded delta-arrow red is borderline against a dark/saturated theme background", () => {
    const ir = deck("luxe", [
      {
        type: "content",
        heading: "kpi",
        components: [{ type: "kpi_cards", items: [{ value: "1", label: "x", delta: "down" }] }],
      },
    ])
    const contrast = auditDeck(ir).findings.filter((f) => f.code === "low-contrast")
    expect(contrast.some((f) => (f.detail as { fill?: string })?.fill === "#DC2626")).toBe(true)
  })

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

  it("quote.tsx's decorative open-quote mark renders at full opacity, so the opacity-based decorative exemption doesn't apply", () => {
    const ir = deck("consulting", [
      {
        type: "content",
        arrangement: "quote",
        heading: "quote",
        components: [{ type: "quote", text: "an attributed quotation" }],
      },
    ])
    const contrast = auditDeck(ir).findings.filter((f) => f.code === "low-contrast")
    expect(contrast.some((f) => f.detail?.text === "“")).toBe(true)
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

  it("does not let a small decorative rect (below MIN_BG_REGION_AREA) override the real local background", () => {
    // A tiny accent bar (icon-cards.tsx-style, 32x3) painted over the card,
    // with text positioned right where the bar is — if the bar wrongly
    // registered as a background region despite its size, the (dark-ink-on-
    // yellow) lookup would still pass by coincidence, so instead give the
    // bar an *unreadable* color pairing: were it (wrongly) picked up as the
    // background, this near-identical fill would fail; since it must be
    // excluded by area, resolution falls through to the white card beneath,
    // which passes comfortably.
    const markup = page(
      BG,
      `<rect x="96" y="176" width="536" height="226" fill="#FFFFFF"/>
       <rect x="120" y="176" width="32" height="3" fill="#050505"/>
       <text x="125" y="178" font-size="20" fill="#000000">card body text</text>`,
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
      expect(["overflow", "out-of-bounds", "low-contrast", "overlap"]).toContain(f.code)
      expect(typeof f.message).toBe("string")
    }
  })
})
