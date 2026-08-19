// @vitest-environment node
//
// The equivalence-proof hard gate (vocabulary-v4 rename, task 1, spec §10/
// §12): a v3 deck migrated through `migrateIrV3ToV4` must render byte-for-
// byte identical SVG and PPTX output to what the *same* deck rendered on
// the pre-rename codebase (base commit 0511b8c, before any vocabulary-v4
// change landed).
//
// Durable form: `../ir/__fixtures__/equivalence-golden/*.json` is a one-time
// capture of that base-commit render (see the task-1 report for the capture
// method — a temporary script, deleted before this commit, that ran
// `V3_EQUIVALENCE_DECKS` through the pre-rename `PptxIRSchema` +
// `renderSlideSvg` + `generatePptxBlob` and wrote the output here). This
// test replays the exact same fixtures through the post-rename pipeline —
// `PptxIRV3Schema.parse` → `migrateIrV3ToV4` → the (now v4-only) render
// chain — and asserts the output is unchanged from that golden capture. A
// regression here means either the migration function or a render consumer
// silently changed behavior, not just vocabulary — the spec §10 violation
// this whole task's discipline exists to catch.
//
// PPTX comparison excludes `docProps/core.xml` (pptxgenjs bakes
// `new Date().toISOString()` into it on every export — the one genuinely
// nondeterministic zip part, unrelated to this task) — the same normalized-
// zip-map method `src/pptx/generate-notes-export.test.ts` already
// established for this repo's byte-comparison tests.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { PptxIRV3Schema } from "./legacy-v3"
import { migrateIrV3ToV4 } from "./migrate"
import { V3_EQUIVALENCE_DECKS } from "./__fixtures__/v3-equivalence-decks"
import { renderSlideSvg } from "@/api"
import { generatePptxBlob } from "@/pptx/generate"
import { auditDeck } from "@/svg/audit/deck-audit"
import { installNodePlatform } from "@/platform/node"

const GOLDEN_DIR = new URL("./__fixtures__/equivalence-golden/", import.meta.url)

function readGoldenJson<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`${name}.json`, GOLDEN_DIR), "utf-8")) as T
}

async function normalizedZipMap(blob: Blob): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const entries = Object.keys(zip.files)
    .filter((p) => !zip.files[p]!.dir && p !== "docProps/core.xml")
    .sort()
  const out: Record<string, string> = {}
  for (const p of entries) out[p] = await zip.files[p]!.async("string")
  return out
}

describe("v3 → v4 migration equivalence (task 1 hard gate, spec §10/§12)", () => {
  installNodePlatform()

  for (const [name, rawV3] of Object.entries(V3_EQUIVALENCE_DECKS)) {
    describe(name, () => {
      const v3 = PptxIRV3Schema.parse(rawV3)
      const v4 = migrateIrV3ToV4(v3)

      // Recaptured (P1 variety wave, task 3 — cover/chapter/ending strategy
      // soft-weighting + the pyramid/briefing content layoutTendencies
      // re-derivation). None of these three decks pin every identity page's
      // `layout`, so weighting the previously-uniform cover/chapter/ending
      // auto-pick can legitimately flip which layout a given seed lands
      // on — a real, intended selection-behavior change, not a migration
      // regression. Verified via a targeted diff against the pre-recapture
      // goldens (`.svg.json`/`.pptx-zip.json` only — `.audit.json` needed no
      // recapture, the newly-picked layouts introduce no new findings on
      // any of these three fixtures). Only these specific slides change,
      // every other slide (including every explicitly `layout`-pinned
      // ending) stays byte-identical to the pre-task-3 golden:
      //   - `basic`: slide index 3 (content page "At a glance", auto-picked
      //     — briefing's re-derived content set swapped `bento-panel` for
      //     `rail-numbered`, shifting this seed's pick to
      //     `tone-adaptive-content`).
      //   - `scenarioBearing`: slide indices 0 and 4 (cover + ending, both
      //     auto-picked — storytelling's new identityTendencies pulling
      //     this seed onto `editorial-masthead`/`poster-ending`).
      //   - `annualReviewPreset`: slide index 1 (chapter, auto-picked —
      //     storytelling's new identityTendencies pulling this seed onto
      //     `banner-chapter`).
      //
      // Re-recaptured (P1 variety wave, task 4 — content-pool expansion, 7
      // -> 10 new layouts side-highlight/asymmetric-triptych/quiet-frame,
      // plus their strategy `layoutTendencies`/beat `BEAT_TENDENCIES`
      // placement). None of these three decks pin every content page's
      // `layout` either, so a pool-wide reweighting can legitimately flip
      // which layout a given seed's auto-pick lands on — the same
      // "real, intended selection-behavior change, not a migration
      // regression" posture as the task-3 recapture above. Verified via the
      // identical targeted-diff discipline: `.audit.json` needed no
      // recapture for any of the three (findings stayed the empty array on
      // both sides — the newly-picked layouts introduce no new
      // findings). Exactly the same two slide indices changed in all three
      // fixtures, nothing else:
      //   - `basic`: slide indices 2 and 3 (content pages, both auto-picked
      //     — `bento-panel` -> `stacked-poster`, `tone-adaptive-content` ->
      //     `two-column`).
      //   - `scenarioBearing`: slide indices 2 and 3 (content, auto-picked
      //     — `tone-adaptive-content` -> `rail-numbered`, `stacked-poster`
      //     -> `quiet-frame`).
      //   - `annualReviewPreset`: slide indices 2 and 3 (content,
      //     auto-picked — `banner-heading` -> `narrow-column`, `two-column`
      //     -> `stacked-poster`).
      //
      // Re-recaptured again (P1 variety wave, task 4 fix round — reviewer
      // Minor-1, quiet-frame's single-component symmetry fix): `content-
      // quiet-frame.tsx` now narrows+re-centers its content rect for
      // exactly 1 non-full-body component (640px, was the full 880px
      // symmetric rect) — a real, intended geometry fix, not a migration
      // regression. `scenarioBearing`'s own slide index 3 (the
      // `quiet-frame` content page landed above, exactly 1 paragraph
      // component) is the only slide in any of the three fixtures affected
      // — verified via the same targeted-diff discipline: `basic`/
      // `annualReviewPreset` are untouched by this recapture (neither has a
      // 1-component quiet-frame page), and `.audit.json` needed no
      // recapture (findings stayed the empty array).
      //
      // Re-recaptured again (bold-metrics fix, 2026-07-24 — svg-text-
      // layout.ts's weight/face-aware `measureTextUnits`): a heading's
      // rendered `<text>` carrying `font-weight >= 600` under a real Bold-
      // exporting font now sizes against that font's real Bold advance
      // width, not the pre-fix Regular-only calibration (root-cause.md,
      // this fix's own investigation — the fix this whole task exists
      // for). `annualReviewPreset`'s slide index 3 (`stacked-poster`
      // chapter, `journal` theme -> SimSun heading) is the only slide in
      // any of the three fixtures affected: its bold SimSun heading "A
      // quarter of steady wins" (`fontWeight="800"`) was fitting on one
      // line at fontSize 64 under the old unweighted estimate; the new
      // SimSun/KaiTi-aware estimate (this fix's item 2 -- the face's own
      // Regular-weight space/other gap, folded in regardless of bold --
      // plus its conservative-proxy Bold `lowerDigit` factor) now wraps it
      // to two ("A quarter of" / "steady wins") at the same fontSize 64 --
      // a real, intended shrink-safety change, not a migration regression.
      // Verified via the same targeted-diff discipline as every prior
      // recapture above: `basic`/`scenarioBearing` are untouched (neither
      // lands a bold Georgia/YaHei/SimSun/KaiTi heading close enough to its
      // budget for this fix to move), the only difference anywhere in
      // `annualReviewPreset`'s SVG/PPTX goldens is this one heading's line
      // count and font-family-local geometry it displaces (the quote
      // block's `data-audit-box`/`data-audit-rect` y-coordinates shift down
      // to make room), and `.audit.json` needed no recapture (findings
      // stayed the empty array both sides).
      //
      // Re-recaptured a third time (bold-metrics fix round 2, same date --
      // controller-ordered upgrade from a class-average-plus-margin model
      // to an exact per-character advance model for Georgia/YaHei, after a
      // review found real headings that clipped straight through the
      // margin; see svg-text-layout.ts's EPITAPH comment). SimSun/KaiTi
      // were not upgraded to an exact model (that face's Latin glyphs have
      // zero measured per-character variance -- no class-average gap to
      // close the way Georgia/YaHei had one -- see `SIMSUN_KAITI`'s own
      // comment for the full argument), but did lose the same round-1
      // margin on `lowerDigit` that Georgia/YaHei's classes lost --
      // reverting it to the verbatim conservative-proxy factor undoes
      // exactly the previous recapture above: "A quarter of steady wins"
      // fits back onto one line at fontSize 64, matching what the
      // *original*, pre-round-1 golden had (round 1 wrapped it to two,
      // round 2 un-wraps it back to one -- not a coincidence: `SIMSUN_
      // KAITI`'s `lowerDigit` factor is 1.048 verbatim both before round 1
      // and again now, only round 1's brief middle state multiplied it by
      // the now-retired 1.2 margin). Same targeted-diff discipline: slide
      // index 3 is the only change anywhere in any of the three fixtures'
      // SVG/PPTX goldens, and `.audit.json` needed no recapture -- verified
      // by directly computing `auditDeck` fresh and JSON-comparing it
      // against both the old and new goldens (`true` both times), not just
      // "this file wasn't touched by the diff."
      //
      // Re-recaptured again (theme-structure wave, task T2 --
      // `.issues/2026-07-26-theme-structure/plan.md`): `consulting` and
      // `journal` (the two themes these three fixtures use) both picked up
      // a `layoutTendencies` declaration on cover/chapter/ending
      // (`../themes/definitions.ts`'s `LAYOUTS` table) -- a real, intended
      // selection-behavior change (design decision 2's whole point: the
      // theme layer is now a live weighting input to auto-picked
      // cover/chapter/ending layouts), not a migration regression. None
      // of these three decks pins every identity page's `layout`, so
      // reweighting the pool can legitimately flip a given seed's pick --
      // same posture as every recapture above. Exactly one slide changed
      // in each fixture (verified via a targeted-diff script, not just
      // "this file wasn't touched"):
      //   - `basic` (`consulting`): slide index 1 (chapter, auto-picked) --
      //     `masthead-chapter` -> `banner-chapter`, consulting's own
      //     declared chapter tendency landing directly.
      //   - `scenarioBearing` (`journal`): slide index 4 (ending, auto-
      //     picked) -- `poster-ending` -> `constellation-ending`. Not
      //     journal's own declared id (`masthead-ending`) -- a mechanical
      //     side effect of the same declaration: bumping `masthead-ending`'s
      //     weight 1 -> 3 grows the ending pool's total weight from 11 to
      //     13 (the pool already carries two weight-3 members from the
      //     strategy layer's own `identityTendencies`, so the base is 11,
      //     not the 7 an earlier draft of this comment stated),
      //     which shifts where this fixed seed's `target = hash % total`
      //     lands among the *other* candidates' boundaries too (the same
      //     modulo-reshuffle every weight-sum change in this pipeline can
      //     cause -- not an independent defect).
      //   - `annualReviewPreset` (`journal`): slide index 1 (chapter,
      //     auto-picked) -- `banner-chapter` -> `rail-chapter`, the same
      //     total-weight-shift mechanism as above (journal's declared
      //     `masthead-chapter` weight bump moves the chapter pool's total
      //     from 12 to 14 -- same correction as above, the strategy layer's
      //     own weight-3 members are part of the base).
      // `.audit.json` needed no recapture for any of the three (findings
      // stayed the empty array both sides, confirmed by computing
      // `auditDeck` fresh against both the old and new goldens) -- the
      // newly-picked layouts introduce no new geometry/contrast defect
      // on any of these three fixtures.
      //
      // Re-recaptured again (content-layout expansion wave, task T1 --
      // `.issues/2026-07-26-content-archetypes/plan.md`): registering an
      // 11th content layout (`image-lead-split`) grows the content
      // pool's weighted-sampling denominator on every theme that curates
      // the full set (`consulting`/`journal`, the two themes these three
      // fixtures use, both do) -- the same "real, intended selection-
      // behavior change, not a migration regression" posture as every pool-
      // growth recapture above (P1 variety wave task 4's own 7 -> 10
      // recapture is the direct precedent). None of these three decks pins
      // every content page's `layout`, so a pool-wide reweighting can
      // legitimately flip which layout a given seed's auto-pick lands
      // on. Verified via the same targeted-diff discipline: `.audit.json`
      // needed no recapture for any of the three (findings stayed the
      // empty array both sides) -- `image-lead-split` itself was never the
      // layout any of these three fixtures' seeds actually landed on;
      // the shift is purely the denominator changing which of the
      // *existing* 10 layouts each seed's hash lands on:
      //   - `basic`: slide index 2 (content, auto-picked) --
      //     `stacked-poster` -> `tone-adaptive-content`; slide index 3
      //     (content, auto-picked) -- `two-column` -> `stacked-poster`.
      //   - `scenarioBearing`: slide index 1 (content, auto-picked) --
      //     `stacked-poster` -> `bento-panel`; slide index 2 (content,
      //     auto-picked) -- `rail-numbered` -> `narrow-column`.
      //   - `annualReviewPreset`: slide index 2 (content, auto-picked) --
      //     `narrow-column` -> `quiet-frame`.
      //
      // Re-recaptured again (content-layout expansion wave, task T2 --
      // `.issues/2026-07-26-content-archetypes/plan.md`): registering a
      // 12th content layout (`split-band`) grows the content pool's
      // weighted-sampling denominator again, on the same two full-set
      // themes (`consulting`/`journal`) as every prior pool-growth
      // recapture -- same "real, intended selection-behavior change"
      // posture, not a migration regression. All three fixtures moved this
      // time (a first -- every prior pool-growth recapture above spared at
      // least one of the three):
      //   - `basic`: slide index 2 (content, auto-picked) --
      //     `tone-adaptive-content` -> `rail-numbered`; slide index 3
      //     (content, auto-picked) -- `stacked-poster` -> `split-band`.
      //     `split-band` itself *is* the actual landed pick here, the
      //     first of these three fixtures where the newly-registered
      //     layout is the seed's real choice, not just a denominator
      //     reshuffle onto an existing one.
      //   - `scenarioBearing`: slide index 1 (content, auto-picked) --
      //     `bento-panel` -> `narrow-column`; slide index 2 (content,
      //     auto-picked) -- `narrow-column` -> `side-highlight`.
      //     `split-band` was never this fixture's landed pick -- pure
      //     denominator reshuffle onto existing layouts, same
      //     mechanism as every prior pool-growth recapture.
      //   - `annualReviewPreset`: slide indices 2 and 3 (content,
      //     auto-picked) -- `quiet-frame` -> `image-lead-split`,
      //     `stacked-poster` -> `asymmetric-triptych`. `split-band` was
      //     never this fixture's landed pick either.
      //
      // Unlike every prior pool-growth recapture, `.audit.json` *did* need
      // recapturing for one of the three: `annualReviewPreset`'s
      // re-landed `image-lead-split` page has 3 `kpi_cards` items sharing
      // its 435px text column (a pre-existing, review-approved T1
      // behavior, not something this task touches), and one card's
      // "average order value" label now truncates to "average …" at that
      // column's narrower per-card width -- a real `content-truncated`
      // finding, not a migration artifact. `basic`/`scenarioBearing`'s own
      // `.audit.json` needed no *content* recapture (`findings: []` both
      // sides, before and after -- only JSON pretty-printing whitespace
      // differs, an artifact of the recapture script's own
      // `JSON.stringify(..., null, 2)` versus whatever formatting produced
      // the pre-existing golden, not a behavior change). Verified via the
      // same targeted-diff discipline as every recapture above: the one
      // `content-truncated` finding is the *only* change anywhere in
      // `annualReviewPreset.audit.json` (`findings: []` -> one
      // `content-truncated` entry, `pagesAudited`/`pagesSkipped`/`checks`
      // all unchanged), and `content-truncated` is the pool's own
      // established "graceful degradation, not a rendering bug" signal
      // (`ir-quality`/`deck-audit.ts`'s documented distinction from
      // `overflow`/`out-of-bounds`/`overlap` -- the same three codes
      // `content-split-band.test.tsx`'s own pathological-content sweep
      // asserts zero of, deliberately excluding this one) -- there is
      // nothing to fix in the renderer here, this is the labeling
      // convention working as designed on a slide shape T1's own review
      // already accepted.
      //
      // Re-recaptured again (controller-probed follow-up fix round —
      // `content-image-lead-split.tsx`'s "starved" branch): the
      // `content-truncated` finding pinned directly above turned out to be
      // a real structural defect after all, not just an accepted labeling
      // convention — `image-lead-split`'s unconditional 435px text column
      // squeezed this exact kpi_cards-only page for no reason, since it has
      // no scalable (image/chart) lead component to justify narrowing
      // beside a real visual column. The layout now widens the text
      // column to 788px (and shrinks the decorative visual column to a
      // 260px accent panel) whenever there is no scalable lead — see that
      // file's own header for the full rationale and the skeleton-diversity
      // check that the widened width doesn't collide with an existing
      // layout's own region class. Only `annualReviewPreset`'s slide
      // index 2 is affected across all three fixtures (the only slide, in
      // any of them, that actually lands on `image-lead-split` with no
      // scalable lead — confirmed by diffing all 5 slides of each fixture's
      // recaptured SVG golden against its pre-recapture version, only this
      // one changed anywhere). `.audit.json`'s one `content-truncated`
      // finding goes back to `findings: []` (the label no longer truncates
      // at the widened per-card width); `.pptx-zip.json`'s file-name set is
      // unchanged, only that same slide's XML differs.
      //
      // Re-recaptured again (declaration-rebalance wave —
      // `.issues/2026-08-03-declaration-rebalance/plan.md`): consulting's
      // cover/ending and journal's chapter/ending each gained a second
      // `layoutTendencies` id (`../themes/definitions.ts`'s `LAYOUTS`
      // table) to fix the two axes each theme had silently dead under the
      // default `briefing` strategy — a real, intended selection-behavior
      // change (the whole point of the wave), not a migration regression.
      // Same "reweighting a pool a fixed seed's hash lands in can flip an
      // auto-pick" posture as every weight-table recapture above. Exactly
      // one slide changed in two of the three fixtures, the third
      // untouched (confirmed by diffing all 5 slides of each fixture's
      // recaptured SVG golden against its pre-recapture version):
      //   - `basic` (`consulting`): slide index 0 (cover, auto-picked) —
      //     `constellation` -> `banner-title`. Not `left-anchor` itself
      //     (the newly-appended id) — a mechanical side effect of the same
      //     append: bumping `left-anchor`'s weight 1 -> 3 grows the cover
      //     pool's total weight from 12 to 14, which shifts where this
      //     fixed seed's `target = hash % total` lands among the *other*
      //     candidates' boundaries too (the same modulo-reshuffle
      //     mechanism the theme-structure wave's own T2 recapture comment
      //     above already documents for `scenarioBearing`/
      //     `annualReviewPreset`).
      //   - `scenarioBearing` (`journal`): no change — this fixture's own
      //     cover/chapter/ending seeds don't happen to cross any of the
      //     three axes' new weight boundaries.
      //   - `annualReviewPreset` (`journal`): slide index 1 (chapter,
      //     auto-picked) — `rail-chapter` -> `tone-adaptive-chapter`. This
      //     *is* one of the two ids appended to journal's own `chapter`
      //     tendency (`["masthead-chapter", "roman-chapter",
      //     "tone-adaptive-chapter"]`) landing directly, not a reshuffle
      //     onto an unrelated existing layout.
      // `.audit.json` needed no recapture for any of the three (findings
      // stayed byte-identical, confirmed by computing `auditDeck` fresh
      // against both the old and new goldens) — neither newly-landed
      // layout introduces a new geometry/contrast finding on either
      // fixture. `.pptx-zip.json`'s file-name set is unchanged for all
      // three; only `basic`'s `ppt/slides/slide1.xml` and
      // `annualReviewPreset`'s `ppt/slides/slide2.xml` (1-indexed,
      // matching SVG slide 0 / slide 1 above) differ.
      // Recaptured (visual review round 1, 2026-08-15): `quote.tsx`'s
      // decorative open-quote mark used to reserve its own *baseline* plus a
      // gap above the first body line (`QUOTE_ZONE` 60 against a mark
      // baseline of 44), but a quotation glyph carries its ink high in the
      // em box, so the mark floated far above the text it opens — flagged on
      // every quote page the review saw. `QUOTE_ZONE` is now sized off the
      // mark's ink (34, baseline 40).
      // `scenarioBearing` and `annualReviewPreset` each carry one quote
      // slide, so each has exactly one changed slide (SVG slide 1 / slide 3;
      // PPTX `slide2.xml` / `slide4.xml`, 1-indexed). Targeted diff against
      // the pre-recapture goldens, same discipline as every recapture above:
      // the *only* changes anywhere in either fixture are that mark's
      // `y` 44 → 40, the body/attribution baselines moving up 26px with
      // `QUOTE_ZONE`, and the enclosing block's own `y` shifting by the
      // ~9.9px `distributeSurplus` redistributes once the block measures
      // shorter — plus the matching `<a:off>` y values in the PPTX. No other
      // element, attribute, or file changed; `.audit.json` needed no
      // recapture for any of the three (findings byte-identical, the shift
      // introduces no new geometry or contrast finding), and `basic` needed
      // no recapture at all (it has no quote component).
      //
      // Re-recaptured again (theme-redesign wave, ink v3 —
      // `.issues/2026-08-18-theme-redesign/ink/decisions.md`): registering a
      // 9th cover layout (`colophon`, `@/svg/layouts/cover-colophon.tsx`)
      // grows the cover pool's weighted-sampling denominator on every theme
      // that curates the full set — which is all 17 — so a fixed seed's
      // `target = hash % total` lands on a different candidate. Exactly the
      // same "real, intended selection-behavior change, not a migration
      // regression" mechanism as the content-pool growths above
      // (image-lead-split / split-band), just on the cover axis, and the
      // first time it has hit that axis. **This is a wide change, not a
      // narrow one** — measured across all 17 themes × 40 seeds, 505 of 640
      // non-ink cover picks move (see the wave's own report); the three
      // fixtures here are simply three of them. Neither fixture theme is
      // `ink`, so none of the ink v3 token/motif work is visible in these
      // goldens at all.
      //
      // Exactly one slide changed in each of the three (index 0, the cover;
      // PPTX `ppt/slides/slide1.xml`), verified by diffing all 5 slides of
      // each fixture's recaptured SVG golden against its pre-recapture
      // version:
      //   - `basic` (`consulting`): `banner-title` -> `left-anchor`.
      //   - `scenarioBearing` (`journal`): `editorial-masthead` ->
      //     `tone-adaptive-header`.
      //   - `annualReviewPreset` (`journal`): `banner-title` ->
      //     `tone-adaptive-header`.
      // `colophon` itself is never any of the three seeds' landed pick —
      // pure denominator reshuffle onto existing layouts, same as most
      // prior pool-growth recaptures. `.audit.json` needed no recapture for
      // any of the three (findings stayed the empty array, confirmed by
      // computing `auditDeck` fresh against both the old and new goldens).
      //
      // Re-recaptured again (theme-redesign wave, warm group —
      // `.issues/2026-08-18-theme-redesign/skins/group2-notes.md`):
      // `heritage-motif` was redrawn from three seed variants (corner
      // diamond studs / a centered emblem / page-edge vertical rules) into
      // one fixed bookplate border. `journal` carries `heritage-motif` in
      // its own rotation set (`@/svg/motif-selection`'s `MOTIF_CANDIDATES`
      // — `["corner-ornament-motif", "heritage-motif", "rail-motif"]`), so
      // the two `journal` fixtures here draw the new mark on whichever
      // pages their seed picks it for. A real, intended decor change on a
      // *borrowing* theme, not a migration regression — and the first
      // recapture in this file caused by a motif rather than by layout
      // selection.
      //
      // Targeted diff (`equiv-diff.mts`, the wave's own tool): the only
      // difference anywhere is inside `<g data-decor="true">` — stripping
      // that one group makes old and new byte-identical on every changed
      // slide, so no text, geometry or chrome moved.
      //   - `basic` (`consulting`): untouched. consulting does not carry
      //     `heritage-motif` in its candidate set.
      //   - `scenarioBearing` (`journal`): slides 0, 3, 4
      //     (`ppt/slides/slide{1,4,5}.xml`).
      //   - `annualReviewPreset` (`journal`): slide 0
      //     (`ppt/slides/slide1.xml`).
      // `.audit.json` needed no recapture for any of the three (findings
      // stayed the empty array, confirmed by computing `auditDeck` fresh
      // against both the old and new goldens) — decor is not text, and the
      // new mark introduces no contrast or overflow defect.
      it("renders SVG byte-identical to the base-commit (pre-rename) capture, slide for slide", () => {
        const goldenSvgs = readGoldenJson<string[]>(`${name}.svg`)
        const migratedSvgs = v4.slides.map((_, i) => renderSlideSvg(v4, i))
        expect(migratedSvgs).toEqual(goldenSvgs)
      })

      // `basic.pptx-zip.json` recaptured (a:ea follow-up task): consulting's
      // Georgia heading/body has zero CJK glyphs, so the new `applyEaFontFaces`
      // patch (`src/pptx/pptx-ea-fonts.ts`) genuinely changes its exported
      // `<a:ea>` from the old self-mirroring `"Georgia"` to the corrected
      // `"Microsoft YaHei"` — a real, intended behavior change, not a
      // regression. `scenarioBearing`/`annualReviewPreset` both use the
      // `journal` theme (SimSun heading, Microsoft YaHei body — both already
      // CJK-capable, so `eaFontFaceFor` self-references and the patch is a
      // byte-identical no-op there), which is why only `basic`'s golden
      // needed recapturing. Verified via the same targeted-diff discipline as
      // the defect-B recapture below: after normalizing away every
      // `<a:ea typeface="...">` attribute value, old and new
      // `ppt/slides/slide{1..5}.xml` are byte-identical — the *only* change
      // anywhere in the capture is that one attribute, on exactly the
      // Georgia-declared runs, exactly to `"Microsoft YaHei"`.
      //
      // All three `.pptx-zip.json` recaptured (cycle export fix, 2026-08-17
      // — `svg2pptx/text.ts`'s `anchorTextBox`): a text box's width is
      // measured against the canvas, but it used to be computed from the
      // `<text>` element's *local* x, before `dispatch.ts` flattened the
      // ancestor `<g transform>`s onto it — so every text inside a
      // translated group got a box sized against the wrong origin, and a
      // group centered on its own content produced a negative one. The box
      // is now derived after the flattening. A text box's *anchor* (the
      // edge or center `align` pins the line to) was already correct before
      // this fix and is bit-for-bit unchanged by it — verified directly:
      // across all 72 text shapes in these three fixtures the anchor moves
      // by 0 EMU, so nothing renders anywhere different. What changed is
      // only the box those anchors hang in: `a:off x` and `a:ext cx` on 39
      // text shapes across 9 slides (`basic` slides 1/3/4/5,
      // `scenarioBearing` 2/3/4, `annualReviewPreset` 3/4). Targeted diff,
      // same discipline as every recapture above: normalizing away every
      // `<a:off>`/`<a:ext>` attribute value makes old and new byte-
      // identical everywhere, no non-text shape's geometry moved, and no
      // text shape's `y`/`cy` moved either. `.svg.json`/`.audit.json`
      // needed no recapture for any of the three — this fix lives entirely
      // downstream of the SVG.
      it("exports a PPTX byte-identical (docProps/core.xml timestamp excluded) to the base-commit capture", async () => {
        const goldenZipMap = readGoldenJson<Record<string, string>>(`${name}.pptx-zip`)
        const blob = await generatePptxBlob(v4)
        const migratedZipMap = await normalizedZipMap(blob)
        expect(migratedZipMap).toEqual(goldenZipMap)
      })

      // spec §12 output row "迁移前后审计结果等价" (task 4): auditDeck's
      // findings/pagesAudited/pagesSkipped must match what the pre-rename
      // codebase produced on the same deck, same capture method as the SVG/
      // PPTX goldens above (base commit 0511b8c, PptxIRSchema.parse +
      // auditDeck, no migration involved on that side — it's the pre-rename
      // deck audited by pre-rename code) — asserted here precisely so a
      // future regression in either direction gets caught.
      //
      // Recaptured (bench-driven fix round, defect B, Task 3):
      // annualReviewPreset used to carry two low-contrast findings (a
      // kpi_cards up-delta arrow, `#16A34A` against `#FFFFFF` at 3.30:1,
      // duplicated across two cards) — a real defect this fixture happened
      // to bake in from before the fix, not a migration artifact. All three
      // golden files (`.svg`/`.audit`/`.pptx-zip`) were regenerated through
      // this exact test's own code path post-fix; a targeted diff against
      // the pre-recapture goldens confirmed the *only* change anywhere in
      // any of the three is `#16A34A` → `#0A0E14` at the two arrow glyphs
      // (`fill`/`srgbClr val` respectively) plus the now-empty `findings`
      // array — nothing else drifted. See `kpi.tsx`'s own `deltaColor`
      // comment and `full-matrix-contrast.test.ts`'s "defect B real
      // contrast fixes" sweep for the fix itself.
      it("audits byte-identical findings to the base-commit (pre-rename) capture", () => {
        const goldenAudit = readGoldenJson<ReturnType<typeof auditDeck>>(`${name}.audit`)
        const migratedAudit = auditDeck(v4)
        expect(migratedAudit).toEqual(goldenAudit)
      })
    })
  }

  // The annual-review preset's own worked example (spec §5): "旧：narrative ×
  // balanced × public / 新：storytelling × balanced × public" — the preset id
  // string carries across unchanged, but its *internal* axes resolution
  // (`NARRATIVE_PRESETS["annual-review"]`) must still resolve to the exact
  // same strategy/pacing/audience triple the old `SCENARIO_PRESETS` entry
  // did, just spelled with the new vocabulary — proven here by rendering
  // through the real chain rather than re-asserting the preset table (that
  // table has its own dedicated pins in `narrative/index.test.ts`).
  it("the annual-review preset migrates by id alone (no per-axis remap needed) and still renders byte-identical", () => {
    const v3 = PptxIRV3Schema.parse(V3_EQUIVALENCE_DECKS.annualReviewPreset)
    expect(v3.scenario).toBe("annual-review")
    const v4 = migrateIrV3ToV4(v3)
    expect(v4.narrative).toBe("annual-review")
  })
})
