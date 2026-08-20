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

// Visual review 2026-08-19 (C cluster, 4): the density-stretch increment
// used to go entirely into the card shells, which split it into top and
// bottom padding. Cards got emptier inside while staying exactly as close
// to each other as before — a page where each 133px card held 69px of
// content and two card edges sat 14px apart read as "太拥挤" even though
// most of the page was blank. Eyes read the edges, not the text.
describe("row_cards density-stretch split between shells and gaps", () => {
  const ITEMS = Array.from({ length: 3 }, (_, i) => ({
    title: `事项 ${i + 1}`,
    text: "本季度通过精细化运营实现增长",
    sub: "补充说明",
  }))
  const component = { type: "row_cards" as const, items: ITEMS }
  const W = 640

  /** Card shell tops and heights, read off the render's own annotations. */
  function shells(h?: number) {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        {rowCards.render(component, { x: 0, y: 0, w: W, ...(h != null ? { h } : {}) }, ctx)}
      </svg>,
    )
    const tops = [...markup.matchAll(/data-audit-box="0,([\d.]+),640"/g)].map((m) => Number(m[1]))
    const heights = [...markup.matchAll(/<rect x="0" y="[\d.]+" width="640" height="([\d.]+)"/g)].map((m) =>
      Number(m[1]),
    )
    return { tops, heights }
  }

  it("at the natural height nothing grows: every gap is the plain CARD_GAP", () => {
    const { tops, heights } = shells()
    expect(tops).toHaveLength(3)
    expect(tops[1] - (tops[0] + heights[0])).toBeCloseTo(14, 5)
    expect(tops[2] - (tops[1] + heights[1])).toBeCloseTo(14, 5)
  })

  it("a stretched box.h widens the gaps as well as the shells", () => {
    const natural = rowCards.measure(component, W, ctx)
    const naturalHeights = shells().heights
    const grow = 90
    const { tops, heights } = shells(natural + grow)
    // 30% of the increment shared across the 2 gaps would be 13.5 each,
    // over the ceiling of 0.6 * CARD_GAP — so the ceiling binds and every
    // gap grows by exactly 8.4, from 14 to 22.4.
    expect(tops[1] - (tops[0] + heights[0])).toBeCloseTo(22.4, 5)
    expect(tops[2] - (tops[1] + heights[1])).toBeCloseTo(22.4, 5)
    // The shells split what is left: (90 - 8.4 * 2) / 3 per card.
    for (let i = 0; i < 3; i++) expect(heights[i] - naturalHeights[i]).toBeCloseTo((90 - 8.4 * 2) / 3, 5)
  })

  it("a small increment stays under the gap ceiling, so the share decides instead", () => {
    const natural = rowCards.measure(component, W, ctx)
    const naturalHeights = shells().heights
    const grow = 30
    const { tops, heights } = shells(natural + grow)
    // 30 * 0.3 / 2 = 4.5 per gap, under the 8.4 ceiling.
    expect(tops[1] - (tops[0] + heights[0])).toBeCloseTo(18.5, 5)
    expect(heights[0] - naturalHeights[0]).toBeCloseTo((30 - 4.5 * 2) / 3, 5)
  })

  it("gap growth comes out of the shell pool, so the stack still ends exactly at box.h", () => {
    const natural = rowCards.measure(component, W, ctx)
    const h = natural + 90
    const { tops, heights } = shells(h)
    expect(tops[2] + heights[2]).toBeCloseTo(h, 5)
  })
})
