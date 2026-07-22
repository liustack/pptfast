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
import { auditDeck, type AuditFinding } from "./deck-audit"
import { installNodePlatform } from "../../platform/node"
import { CANONICAL_THEME_IDS } from "../../themes"
import { MOTIF_CANDIDATES, resolveMotifId } from "../motif-selection"

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
