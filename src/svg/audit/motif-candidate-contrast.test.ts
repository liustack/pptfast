// @vitest-environment node
//
// P1 variety wave, task 2's own contrast-safety obligation (plan §任务 2:
// "对比度矩阵复跑（motif 换贴纸不得引入新对比度违例——若某候选在某主题背景
// 上违例，从该主题候选集剔除并记录）"). `full-matrix-contrast.test.ts`'s
// existing sweep already renders every theme's motif incidentally (whichever
// candidate that file's fixed implicit deck-content-hash seed happens to
// land on for pageKey "0") and passes — but that's one candidate per theme,
// not every one. This file exhaustively forces EVERY candidate in every
// multi-member `MOTIF_CANDIDATES` entry to render at least once per slide
// type, by brute-force searching a small seed for each (theme, candidate)
// pair that `resolveMotifId` actually resolves to it — deterministic once
// found (`findSeedFor` always returns the same seed for the same table), no
// flakiness. Single-member sets (`campaign`, `ink`) and `runway` (no motif)
// need no sweep here — they're already covered by
// `motif-selection.test.ts`'s byte-inertness block (always the theme's own
// pre-existing anchor, already exercised by the pre-P1 `full-matrix-
// contrast.test.ts` sweep every day since it was written).
//
// Result of this sweep (recorded per 控制者裁决 §4's re-pin discipline, so a
// future reviewer doesn't have to re-derive "was this checked" from git
// blame): zero candidates removed. Every non-anchor candidate in
// `MOTIF_CANDIDATES` clears cover/chapter/content/ending on its adoptive
// theme's own backgrounds — expected, given every shared motif's "zero
// baked hex, colors from ctx" discipline (see `motif-selection.ts`'s own
// header for the two narrow documented exceptions, neither of which is
// reachable from this sweep — see that file's own comment).
import { beforeAll, describe, expect, it } from "vitest"
import type { PptxIR, Slide } from "@/ir"
import { renderSlideSvg } from "@/api"
import { auditDeck, type AuditFinding } from "./deck-audit"
import { installNodePlatform } from "../../platform/node"
import { CANONICAL_THEME_IDS, resolveStyle } from "../../themes"
import { MOTIF_CANDIDATES, resolveMotifId } from "../motif-selection"
import { resolveBackgroundHex } from "../full-slide-svg"
import { parseSvgRoot } from "../serialize"
import { contrastRatio } from "../ink"

beforeAll(() => {
  installNodePlatform()
})

const HEADING = "候选贴纸对比度回归探针"
const SUBHEADING = "候选贴纸对比度回归探针副标题"

function deckFor(themeId: string, slide: Slide, seed: number): PptxIR {
  return {
    version: "4",
    filename: "motif-candidate-contrast-fixture",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides: [slide],
    seed,
  } as PptxIR
}

/**
 * The `fashion-chapter` archetype's own decorative chapter-number watermark
 * (`chapter-fashion-chapter.tsx`'s own header calls it decorative by
 * design) — already adjudicated and blanket-allowlisted for all 13 themes
 * in `full-matrix-contrast.test.ts`'s own `ALLOWLIST` (ratio band
 * [1.2, 1.8], 1-2 digit text, current 13-theme spread 1.24-1.75). Unpinned
 * `layout` here means the seed search below can land the chapter fixture on
 * this archetype for some (theme, candidate) pairs — filtering the same
 * already-adjudicated finding out here (rather than re-litigating it) keeps
 * this file's own job scoped to what it actually exists to check: motif
 * contrast, not a pre-existing, motif-unrelated archetype finding this repo
 * already has a durable regression net for.
 */
function isKnownFashionChapterWatermark(f: AuditFinding): boolean {
  if (f.code !== "low-contrast") return false
  const detail = f.detail as { text?: string; ratio?: number } | undefined
  return !!detail?.text && /^\d{1,2}$/.test(detail.text) && !!detail.ratio && detail.ratio >= 1.2 && detail.ratio <= 1.8
}

function auditFindings(ir: PptxIR): AuditFinding[] {
  return auditDeck(ir).findings.filter(
    (f) =>
      (f.code === "low-contrast" || f.code === "overflow" || f.code === "out-of-bounds") &&
      !isKnownFashionChapterWatermark(f),
  )
}

/**
 * Smallest seed in [0, 200) for which `resolveMotifId` picks `target` for a
 * single-slide deck at pageKey "0" — throws if none found (a candidate this
 * unreachable at this sample size would itself be a table bug —
 * `motif-selection.test.ts`'s own "never picked in N draws" test already
 * guards the same thing at a comparable sample size, so a throw here would
 * mean that guard regressed too, not a new independent failure mode).
 * `resolveMotifId` never reads `slide.type`, only `(theme, seed, pageKey)`,
 * so this probe's own slide type is irrelevant to what it finds.
 */
function findSeedFor(themeId: string, target: string): number {
  const probe: Slide = { type: "content", id: "0", heading: "probe", components: [] } as Slide
  for (let seed = 0; seed < 200; seed++) {
    const ir = deckFor(themeId, probe, seed)
    if (resolveMotifId(ir, ir.slides[0]!, 0) === target) return seed
  }
  throw new Error(`no seed in [0,200) makes theme "${themeId}" resolve motif "${target}"`)
}

const MULTI_CANDIDATE_THEMES = CANONICAL_THEME_IDS.filter((id) => (MOTIF_CANDIDATES[id]?.length ?? 0) > 1)

describe("motif candidate contrast sweep (P1 variety wave, task 2)", () => {
  it("has at least one multi-candidate theme to exercise (sanity check on the fixture set itself)", () => {
    expect(MULTI_CANDIDATE_THEMES.length).toBeGreaterThan(0)
  })

  for (const themeId of MULTI_CANDIDATE_THEMES) {
    const candidates = MOTIF_CANDIDATES[themeId]!
    describe(themeId, () => {
      for (const candidate of candidates) {
        it(`candidate "${candidate}": zero contrast/overflow/out-of-bounds findings across cover/chapter/content/ending`, () => {
          const seed = findSeedFor(themeId, candidate)
          const failures: string[] = []
          const cases: Slide[] = [
            { type: "cover", id: "0", heading: HEADING, components: [] } as Slide,
            { type: "chapter", id: "0", heading: HEADING, subheading: SUBHEADING, components: [] } as Slide,
            {
              type: "content",
              id: "0",
              heading: HEADING,
              subheading: SUBHEADING,
              components: [
                { type: "paragraph", text: "示例正文段落，用于占满 body 插槽验证排版不崩。" },
                { type: "bullets", items: ["要点一", "要点二", "要点三"] },
              ],
            } as Slide,
            { type: "ending", id: "0", heading: HEADING, components: [] } as Slide,
          ]
          for (const slide of cases) {
            const ir = deckFor(themeId, slide, seed)
            // Sanity: this fixture must actually exercise the candidate under
            // test, not silently fall through to something else — proves the
            // seed search above and the audited render agree on which motif
            // is live.
            expect(
              resolveMotifId(ir, ir.slides[0]!, 0),
              `${themeId}/${slide.type} did not resolve to "${candidate}"`,
            ).toBe(candidate)
            const findings = auditFindings(ir)
            for (const f of findings) failures.push(`${slide.type}: ${f.code} ${JSON.stringify(f.detail)}`)
          }
          expect(failures).toEqual([])
        })
      }
    })
  }
})

// Review fix round (P1 variety wave, task 2 — Moderate finding): the sweep
// above proves candidate motifs never make *other* page text unreadable,
// but it structurally cannot catch a motif's own decor rendering invisibly
// against its *own* background — `deck-audit.ts`'s contrast walk explicitly
// excludes every `<g data-decor>` shape from background candidacy (see that
// file's own "One more exclusion" doc comment), so a decor shape blending
// into its own background produces zero findings either way. That is
// exactly the bug the reviewer caught: `motif-banner-motif.tsx` /
// `motif-rail-motif.tsx`'s chapter branches hard-coded a pure-white fill
// tuned for their own anchor theme's dark chapter background — invisible
// white-on-white the moment `enterprise` (chapter bg `#FFFFFF`) or `journal`
// (chapter bg `#FAF7F2`) became candidates for them. Both are fixed
// (`readableOn(ctx.defaultBg ?? ctx.colors.bg)` instead of a literal — see
// each source file's own doc comment) — this guard is the durable
// regression net so a *future* motif/candidate addition can't reintroduce
// the same silent-blankness class without a loud test failure.
//
// Floor calibration (`tmp-calibrate.ts`, run once, not committed — see this
// task's report for the numbers): every legitimately-subtle decor
// blend measured in this codebase today lands at a `contrastRatio` of
// ~1.07-1.13 against its own real background (low opacity is *supposed* to
// look faint). The exact bug this guard exists to catch — white blended
// over an identical white background — measures exactly `1.0000` (zero
// possible delta, not merely a low one). `VISIBILITY_FLOOR` sits well
// inside that gap: comfortably below every real subtle-decoration ratio,
// comfortably above the zero-delta failure mode.
const VISIBILITY_FLOOR = 1.02

/** Same alpha-composite math as `../ink.ts`'s own (private) `blendOver` —
 * duplicated here for the same render→util dependency-direction reason that
 * file's header gives for its own duplicate of `deck-audit.ts`'s copy: a
 * third small, pure, test-local copy is cheaper than exporting a function
 * whose only reason to leave `ink.ts` would be this one guard test. */
function blendOver(fg: string, bg: string, alpha: number): string {
  const toRgb = (hex: string): [number, number, number] => {
    const n = parseInt(hex.replace("#", ""), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const [fr, fgc, fb] = toRgb(fg)
  const [br, bgc, bb] = toRgb(bg)
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha))
  const toHex = (v: number) => v.toString(16).padStart(2, "0")
  return `#${toHex(mix(fr, br))}${toHex(mix(fgc, bgc))}${toHex(mix(fb, bb))}`
}

/** An element's own effective opacity — `opacity` × `fill-opacity` ×
 * `stroke-opacity` (SVG's own composition rule), each defaulting to `1`
 * when absent. Every motif in this codebase only ever sets at most one of
 * the three on a given shape, but multiplying all three is correct either
 * way and no more code than picking "the one that's set". */
function shapeOpacity(el: Element): number {
  const read = (attr: string): number => {
    const v = el.getAttribute(attr)
    return v === null ? 1 : Number(v)
  }
  return read("opacity") * read("fill-opacity") * read("stroke-opacity")
}

/** A shape's own paint color — `fill` if it's a hex literal, else `stroke`
 * if *that's* a hex literal, else `null` (a `url(#...)` gradient ref,
 * `"none"`, or no paint attribute at all — none of this task's motifs use
 * gradients, so `null` here would itself be a signal worth looking at, not
 * expected in practice). */
function shapeColor(el: Element): string | null {
  const fill = el.getAttribute("fill")
  if (fill?.startsWith("#")) return fill
  const stroke = el.getAttribute("stroke")
  if (stroke?.startsWith("#")) return stroke
  return null
}

const DECOR_SHAPE_SELECTOR = "line, path, rect, circle, ellipse"

describe("motif candidate decor-visibility guard (P1 variety wave, task 2 — review fix round)", () => {
  for (const themeId of MULTI_CANDIDATE_THEMES) {
    const candidates = MOTIF_CANDIDATES[themeId]!
    const tokens = resolveStyle(themeId)
    describe(themeId, () => {
      for (const candidate of candidates) {
        it(`candidate "${candidate}": every decor shape it actually renders clears a small but nonzero visibility floor against its own real background, on every slide type`, () => {
          const seed = findSeedFor(themeId, candidate)
          const failures: string[] = []
          let sawAnyShape = false

          for (const slideType of ["cover", "chapter", "content", "ending"] as const) {
            const slide: Slide = { type: slideType, id: "0", heading: HEADING, components: [] } as Slide
            const ir = deckFor(themeId, slide, seed)
            expect(
              resolveMotifId(ir, ir.slides[0]!, 0),
              `${themeId}/${slideType} did not resolve to "${candidate}"`,
            ).toBe(candidate)

            const markup = renderSlideSvg(ir, 0)
            const root = parseSvgRoot(markup)
            const decorRoot = root.querySelector("[data-decor]")
            const shapes = decorRoot ? Array.from(decorRoot.querySelectorAll(DECOR_SHAPE_SELECTOR)) : []
            // No shapes at all is a legitimate, pre-existing "this motif
            // retreats on this slide type" design choice (e.g. every
            // enterprise/luxe/heritage/classroom/bloom-family motif returns
            // null on chapter — the "memphis 先例" documented in each of
            // their own source headers, disclosed in this task's report) —
            // not a visibility bug, so it's intentionally not flagged here.
            if (shapes.length === 0) continue

            const bgHex = resolveBackgroundHex(tokens.defaultBackgrounds[slideType], tokens.colors.surface)
            // Max ratio across the slide's own decor shapes, not "every
            // shape individually" (review-fix round 2, `bloom-motif`'s own
            // watercolor algorithm is many overlapping layers each at
            // ~3-4.5% opacity by design — see that file's own header — any
            // *single* granule layer measured alone is intentionally
            // near-invisible; only their composite is meant to read as
            // visible texture). What must clear the floor is the *most*
            // visible constituent of what this motif actually painted — the
            // exact failure mode this guard exists to catch (banner/rail's
            // old hard-coded white-on-white) had every shape share the same
            // fully-invisible fill, so its own max is 1.0 too, still caught.
            let maxRatio = 0
            let maxRatioDetail = ""
            for (const shape of shapes) {
              const color = shapeColor(shape)
              if (!color) continue // no hex paint on this shape (see shapeColor's own doc comment)
              sawAnyShape = true
              const opacity = shapeOpacity(shape)
              const blended = opacity >= 1 ? color : blendOver(color, bgHex, opacity)
              const ratio = contrastRatio(blended, bgHex)
              if (ratio > maxRatio) {
                maxRatio = ratio
                maxRatioDetail = `${shape.tagName} color=${color} opacity=${opacity} bg=${bgHex} blended=${blended}`
              }
            }
            if (maxRatio > 0 && maxRatio < VISIBILITY_FLOOR) {
              failures.push(
                `${slideType}: every decor shape is near-invisible — best ratio ${maxRatio.toFixed(4)} (floor ${VISIBILITY_FLOOR}) from ${maxRatioDetail}`,
              )
            }
          }

          expect(failures).toEqual([])
          // At least one theme/candidate/slide-type combo in this whole
          // sweep must actually exercise a real shape — otherwise this guard
          // would pass vacuously (every case hit the "no shapes" `continue`
          // and never touched the assertion it exists to make).
          expect(sawAnyShape, `${themeId}/${candidate} never rendered a single hex-colored decor shape`).toBe(true)
        })
      }
    })
  }
})
