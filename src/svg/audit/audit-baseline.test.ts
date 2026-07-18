// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { slideToSvgMarkup } from "../render-slide"
import { auditSvgMarkup } from "./svg-audit"
import { STRESS_DECKS } from "./stress-fixtures"

// 2026-07-10 主题体系重组后更新为全部 canonical id（custom/magazine 等
// legacy id 经 resolve 渲染的是承接主题，直接列 canonical 才不漏新版式——
// 尤其 runway 的 fashion 出血排印要过 data-bleed 豁免后的审计）。
// W4 补齐 classroom/bloom（原 11/13，缺后加入的第 12/13 主题）——全集放开后
// 每主题的自动选型池覆盖到该页型全部 archetype，这张安全网必须先覆盖全部
// 十三主题才能如实兜住新可达的 theme×archetype 组合（design decision 8）。
const THEMES = [
  "consulting",
  "academic",
  "insight",
  "campaign",
  "ink",
  "enterprise",
  "tech",
  "journal",
  "runway",
  "luxe",
  "heritage",
  "classroom",
  "bloom",
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
