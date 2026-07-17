/**
 * PPTX IR quality gate (E3): detect content-layout issues and return
 * structured warnings so the UI can surface them after generation.
 *
 * Pure function, no side-effects, never throws.
 */

import type { PptxIR, Slide } from "@/ir"
import { resolveScenario, type ScenarioAxes } from "@/scenario"
import { CAPACITY } from "./audit/capacity"
import { measureTextUnits } from "../lib/svg-text-layout"

export type QualityIssue = {
  slide: number
  severity: "warn" | "error"
  code: string
  message: string
}

// ── helpers ──

/** Count characters. CJK characters count as 1 each (same as .length). */
function charLen(s: string): number {
  return s.length
}

function hasKpiCardsComponent(slide: Slide): boolean {
  return slide.components.some((b) => b.type === "kpi_cards")
}

/** Per-theme `maxBlocksPerSlide` (see the derivation comment in capacity.ts —
 * tech's card-grid geometry supports more components per page than the
 * linear-stack themes the flat default was derived from). */
function maxBlocksPerSlideFor(themeId: string): number {
  return CAPACITY.maxBlocksPerSlideOverrides[themeId] ?? CAPACITY.maxBlocksPerSlide
}

/**
 * A slide is considered a "background-only image page" if it has exactly one
 * component of type `image` and no heading. We skip the missing-heading check for
 * these because the image IS the content.
 */
function isBackgroundImageOnly(slide: Slide): boolean {
  return (
    !slide.heading &&
    slide.components.length === 1 &&
    slide.components[0].type === "image"
  )
}

// ── per-slide checks ──

function checkSlide(slide: Slide, index: number, themeId: string): QualityIssue[] {
  const issues: QualityIssue[] = []

  // A1-reverse: heading too long
  if (slide.heading && charLen(slide.heading) > CAPACITY.headingMaxChars) {
    issues.push({
      slide: index,
      severity: "warn",
      code: "long_heading",
      message: "标题偏长，建议精炼成断言式短句",
    })
  }

  // A2: density cap — only for content slides. Threshold is theme-aware
  // (tech's card grid tolerates more components per page than the
  // linear-stack themes the flat default was derived from — see capacity.ts).
  const maxBlocksPerSlide = maxBlocksPerSlideFor(themeId)
  if (slide.type === "content" && slide.components.length > maxBlocksPerSlide) {
    issues.push({
      slide: index,
      severity: "warn",
      code: "density",
      message: `每页至多 ~${maxBlocksPerSlide} 个块，建议拆页`,
    })
  }

  // bullets overflow + per-item length
  for (const component of slide.components) {
    if (component.type !== "bullets") continue
    if (component.items.length > CAPACITY.bullets.maxItems) {
      issues.push({
        slide: index,
        severity: "warn",
        code: "bullets_overflow",
        message: `要点列表条目过多（>${CAPACITY.bullets.maxItems}），建议精简或拆页`,
      })
    }
    for (const item of component.items) {
      if (measureTextUnits(item) > CAPACITY.bullets.maxUnitsPerItem) {
        issues.push({
          slide: index,
          severity: "warn",
          code: "bullet_item_long",
          message: "单条要点过长，建议精简至 2 行内",
        })
      }
    }
  }

  // missing heading — cover / chapter / content (skip background-image-only pages)
  const needsHeading: Slide["type"][] = ["cover", "chapter", "content"]
  if (
    needsHeading.includes(slide.type) &&
    !slide.heading &&
    !isBackgroundImageOnly(slide)
  ) {
    issues.push({
      slide: index,
      severity: "warn",
      code: "missing_heading",
      message: "此页缺少标题",
    })
  }

  // big_number arrangement without kpi_cards component
  if (slide.arrangement === "big_number" && !hasKpiCardsComponent(slide)) {
    issues.push({
      slide: index,
      severity: "warn",
      code: "big_number_no_kpi",
      message: "big_number 版式缺少 kpi_cards 块",
    })
  }

  return issues
}

// ── entry ──

/**
 * `resolvedAxes` (added W3 task 2) carries the caller's already-resolved
 * {@link ScenarioAxes} (spec §5) for task 3's scenario-aware density/bullets
 * thresholds — wiring it into this function's own checks is task 3's diff,
 * not this one's (see `.issues/plans/2026-07-18-pptfast-v03-w3-scenario.md`
 * task 3). `api.ts`'s `validateIr` already resolves scenario for its own
 * error handling and threads the result through here so task 3 doesn't have
 * to touch that call site too. Defaults to the `general` preset's axes so
 * this file's own single-argument test call sites keep compiling and
 * behaving byte-for-byte the same.
 */
export function checkIrQuality(ir: PptxIR, _resolvedAxes: ScenarioAxes = resolveScenario(undefined)): QualityIssue[] {
  const issues: QualityIssue[] = []

  // empty deck
  if (ir.slides.length === 0) {
    issues.push({
      slide: 0,
      severity: "error",
      code: "empty_deck",
      message: "演示文稿不包含任何页面",
    })
    return issues
  }

  for (let i = 0; i < ir.slides.length; i++) {
    issues.push(...checkSlide(ir.slides[i], i, ir.theme.id))
  }

  return issues
}
