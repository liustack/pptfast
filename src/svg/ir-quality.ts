/**
 * PPTX IR quality gate (E3): detect content-layout issues and return
 * structured warnings so the UI can surface them after generation.
 *
 * Pure function, no side-effects, never throws.
 */

import type { PptxIR, Slide } from "@/ir"
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

function hasKpiCardsBlock(slide: Slide): boolean {
  return slide.blocks.some((b) => b.type === "kpi_cards")
}

/** Per-theme `maxBlocksPerSlide` (see the derivation comment in capacity.ts —
 * tech's card-grid geometry supports more blocks per page than the
 * linear-stack themes the flat default was derived from). */
function maxBlocksPerSlideFor(themeId: string): number {
  return CAPACITY.maxBlocksPerSlideOverrides[themeId] ?? CAPACITY.maxBlocksPerSlide
}

/**
 * A slide is considered a "background-only image page" if it has exactly one
 * block of type `image` and no heading. We skip the missing-heading check for
 * these because the image IS the content.
 */
function isBackgroundImageOnly(slide: Slide): boolean {
  return (
    !slide.heading &&
    slide.blocks.length === 1 &&
    slide.blocks[0].type === "image"
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
  // (tech's card grid tolerates more blocks per page than the
  // linear-stack themes the flat default was derived from — see capacity.ts).
  const maxBlocksPerSlide = maxBlocksPerSlideFor(themeId)
  if (slide.type === "content" && slide.blocks.length > maxBlocksPerSlide) {
    issues.push({
      slide: index,
      severity: "warn",
      code: "density",
      message: `每页至多 ~${maxBlocksPerSlide} 个块，建议拆页`,
    })
  }

  // bullets overflow + per-item length
  for (const block of slide.blocks) {
    if (block.type !== "bullets") continue
    if (block.items.length > CAPACITY.bullets.maxItems) {
      issues.push({
        slide: index,
        severity: "warn",
        code: "bullets_overflow",
        message: `要点列表条目过多（>${CAPACITY.bullets.maxItems}），建议精简或拆页`,
      })
    }
    for (const item of block.items) {
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

  // big_number variant without kpi_cards block
  if (slide.variant === "big_number" && !hasKpiCardsBlock(slide)) {
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

export function checkIrQuality(ir: PptxIR): QualityIssue[] {
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
    issues.push(...checkSlide(ir.slides[i], i, ir.style.id))
  }

  return issues
}
