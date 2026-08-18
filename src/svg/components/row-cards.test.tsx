// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { renderSvgMarkup } from "../serialize"
import { auditSvgMarkup } from "../audit/svg-audit"
import { rowCards } from "./row-cards"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#F7F7F2",
    surface: "#FFFFFF",
    primary: "#051C2C",
    accent: "#FFC72C",
    text: "#051C2C",
    muted: "#6C6C6C",
    chartPalette: ["#051C2C", "#FFC72C"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24,
}

const DENSE_ITEMS = Array.from({ length: 6 }, (_, i) => ({
  title: `事项标题条目编号 ${i + 1} 一个比较长的标题`,
  text: "本季度通过精细化运营和渠道下沉实现了显著的增长，具体体现在多个核心业务指标上",
  sub: "补充说明文字用于撑高卡片高度到贴近真实内容",
}))

describe("row_cards truncation-budget marker geometry (R1 evidence wave, Task T3 review)", () => {
  // Regression test for a real, production-reachable defect — found via a
  // stress-fixture reshuffle (adding an unrelated data_table page to
  // structure_bold_headings changed the deck's implicit content-hash seed,
  // which auto-selected row_cards onto a narrower layout than it had ever
  // been exercised against — content-quiet-frame's own auto-picked width,
  // confirmed live across all 13 themes), fixed at the renderer per Global
  // Constraint 6 / the I3 precedent (matrix.tsx's own bold-width fix), not
  // routed around by pinning a seed.
  //
  // Root cause: the acceptance loop (which decides how many cards fit
  // within `truncBudget = box.h - 20`) only ever charges CARD_GAP *between*
  // cards (N-1 gaps for N cards — matches measure()'s own formula), but the
  // render loop used to add a trailing CARD_GAP after *every* card
  // including the last one (`cursor += shellH + CARD_GAP`, unconditional)
  // before placing the "+N more" marker 14px below `cursor` — an extra,
  // uncounted CARD_GAP (14px) the acceptance loop never budgeted for.
  // Worst case the marker's baseline could land up to `box.h + 8`, past the
  // real overflow auditor's own tolerance (`TOL = 6`, svg-audit.ts).
  //
  // Swept across a range of box.h values (not one hand-picked magic number)
  // so this test doesn't depend on today's exact cardH/CARD_GAP arithmetic
  // — any box.h that forces truncation must leave the marker inside the
  // real v-overflow auditor's tolerance.
  it("the '+N more' marker never v-overflows its declared rect, for every box.h that forces truncation", () => {
    const w = 640
    const component = { type: "row_cards" as const, items: DENSE_ITEMS }
    const natural = rowCards.measure(component, w, ctx)
    // A single card's own natural height (no gaps involved at length 1) —
    // the floor for where the sweep should start. Below `singleCardH + 20`
    // (`truncBudget = box.h - 20` derivation), even one card can't fit and
    // `Math.max(1, visible)`'s own deliberate "never render zero visible
    // units, an honest overflow beats an empty list" tradeoff (this file's
    // own comment) takes over — a separate, pre-existing, intentionally-
    // accepted edge case this test isn't about. +8 margin keeps the sweep
    // safely inside the "acceptance loop genuinely accepted >=1 card on its
    // own terms" regime this test is actually about.
    const singleCardH = rowCards.measure({ type: "row_cards" as const, items: [DENSE_ITEMS[0]] }, w, ctx)
    let exercisedAtLeastOneTruncation = false
    for (let h = singleCardH + 20 + 8; h < natural; h += 8) {
      const box = { x: 20, y: 40, w, h }
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
          <g data-audit-rect={`${box.x},${box.y},${box.w},${box.h}`}>{rowCards.render(component, box, ctx)}</g>
        </svg>,
      )
      if (!markup.includes("data-dropped")) continue // this box.h didn't force truncation — skip
      exercisedAtLeastOneTruncation = true
      // Scoped to the "+N more" marker specifically, not every v-overflow
      // finding — a card's own text can independently overflow for
      // unrelated reasons (font-fit edge cases) this test isn't about.
      const markerOverflow = auditSvgMarkup(markup).filter(
        (i) => i.kind === "v-overflow" && i.text.includes("more"),
      )
      expect(markerOverflow, `box.h=${h} produced a marker v-overflow: ${JSON.stringify(markerOverflow)}`).toEqual([])
    }
    expect(exercisedAtLeastOneTruncation).toBe(true)
  })
})
