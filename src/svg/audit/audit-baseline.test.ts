// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { slideToSvgMarkup } from "../render-slide"
import { auditSvgMarkup } from "./svg-audit"
import { STRESS_DECKS } from "./stress-fixtures"

// 2026-07-10 主题体系重组后更新为全部 canonical id（custom/magazine 等
// legacy id 经 resolve 渲染的是承接主题，直接列 canonical 才不漏新版式——
// 尤其 runway 的 fashion 出血排印要过 data-bleed 豁免后的审计）。
const THEMES = [
  "consulting",
  "academic",
  "insight",
  "memphis",
  "ink",
  "enterprise",
  "tech",
  "journal",
  "runway",
  "luxe",
  "heritage",
] as const

/**
 * Baseline overflow inventory over pathological content (B-2). All renderer
 * fixes landed, so every case must now report zero issues. Do not "fix" this
 * test by tuning fixtures or the auditor — if a case fails, the residual
 * overflow is real and belongs to the renderer, not this assertion.
 */
describe("overflow audit baseline", () => {
  for (const theme of THEMES) {
    for (const [name, deck] of Object.entries(STRESS_DECKS)) {
      it(`${theme} / ${name}`, () => {
        const ir = { ...deck, theme: { ...deck.theme, id: theme } }
        const issues = ir.slides.flatMap((slide, i) =>
          auditSvgMarkup(slideToSvgMarkup(ir, slide, i)).map(
            (iss) => `s${i} ${iss.kind} ${iss.text}`,
          ),
        )
        expect(issues).toEqual([])
      })
    }
  }
})
