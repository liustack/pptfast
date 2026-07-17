import { describe, it, expect } from "vitest"
import {
  layoutBento,
  explodeIntoUnits,
  sortUnitsByHeroWeight,
  type BentoUnit,
} from "./bento-layout"
import type { ContentRect } from "./layout"
import type { Block } from "@/ir"

const rect: ContentRect = { x: 96, y: 200, w: 1088, h: 400 }

function para(text: string): Block {
  return { type: "paragraph", text }
}

function blockUnit(text: string): BentoUnit {
  return { kind: "block", block: para(text) }
}

function chartUnit(): BentoUnit {
  return {
    kind: "block",
    block: {
      type: "chart",
      chart_type: "bar",
      series: [{ name: "S1", data: [{ x: "A", y: 1 }] }],
    },
  }
}

function selfVisualUnit(text: string): BentoUnit {
  return {
    kind: "block",
    block: { type: "verdict_banner", tone: "positive", text },
  }
}

const KPI_UNIT_SOURCE_BLOCK: Extract<Block, { type: "kpi_cards" }> = {
  type: "kpi_cards",
  items: [],
}
const ICON_CARD_UNIT_SOURCE_BLOCK: Extract<Block, { type: "icon_cards" }> = {
  type: "icon_cards",
  items: [],
}

function kpiUnit(value: string): BentoUnit {
  return { kind: "kpi-item", item: { value, label: "标签" }, block: KPI_UNIT_SOURCE_BLOCK }
}

function iconCardUnit(title: string): BentoUnit {
  return {
    kind: "icon-card-item",
    item: { icon: "rocket", title, text: "说明" },
    block: ICON_CARD_UNIT_SOURCE_BLOCK,
  }
}

describe("explodeIntoUnits", () => {
  it("passes non-kpi blocks through unchanged, one unit each", () => {
    const blocks = [para("a"), para("b")]
    const units = explodeIntoUnits(blocks)
    expect(units).toEqual([
      { kind: "block", block: blocks[0] },
      { kind: "block", block: blocks[1] },
    ])
  })

  it("explodes a kpi_cards block into one kpi-item unit per item, preserving position", () => {
    const kpiBlock: Block = {
      type: "kpi_cards",
      items: [
        { value: "42", label: "增长" },
        { value: "7", label: "留存", delta: "up" },
      ],
    }
    const blocks = [para("intro"), kpiBlock, para("outro")]
    const units = explodeIntoUnits(blocks)
    expect(units).toEqual([
      { kind: "block", block: blocks[0] },
      { kind: "kpi-item", item: kpiBlock.items[0], block: kpiBlock },
      { kind: "kpi-item", item: kpiBlock.items[1], block: kpiBlock },
      { kind: "block", block: blocks[2] },
    ])
  })

  it("a kpi_cards block with zero items contributes no units", () => {
    const kpiBlock: Block = { type: "kpi_cards", items: [] }
    const units = explodeIntoUnits([para("a"), kpiBlock, para("b")])
    expect(units).toEqual([
      { kind: "block", block: para("a") },
      { kind: "block", block: para("b") },
    ])
  })

  it("passes a steps block through unchanged as a single block unit (not exploded per-item)", () => {
    // steps is a linear-order block (numbered steps 1..n) — unlike
    // kpi_cards/icon_cards, exploding it into one bento tile per item would
    // lose the sequence's connecting arrows/lines, so it must take the same
    // untouched "block" path as any other unknown-to-this-function block
    // type (paragraph, bullets, etc.) rather than earning its own explosion
    // branch. `blocks/steps.tsx` renders its own numbered-badge shell, so a
    // steps block still reads correctly as one bento tile.
    const stepsBlock: Block = {
      type: "steps",
      items: [
        { title: "步骤一", text: "说明一" },
        { title: "步骤二", text: "说明二" },
        { title: "步骤三", text: "说明三" },
      ],
    }
    const blocks = [para("intro"), stepsBlock, para("outro")]
    const units = explodeIntoUnits(blocks)
    expect(units).toEqual([
      { kind: "block", block: blocks[0] },
      { kind: "block", block: stepsBlock },
      { kind: "block", block: blocks[2] },
    ])
  })

  it("explodes an icon_cards block into one icon-card-item unit per item, preserving position", () => {
    const iconCardsBlock: Block = {
      type: "icon_cards",
      items: [
        { icon: "rocket", title: "断言一", text: "说明一" },
        { icon: "server", title: "断言二", text: "说明二" },
        { icon: "shield", title: "断言三", text: "说明三" },
      ],
    }
    const blocks = [para("intro"), iconCardsBlock, para("outro")]
    const units = explodeIntoUnits(blocks)
    expect(units).toEqual([
      { kind: "block", block: blocks[0] },
      { kind: "icon-card-item", item: iconCardsBlock.items[0], block: iconCardsBlock },
      { kind: "icon-card-item", item: iconCardsBlock.items[1], block: iconCardsBlock },
      { kind: "icon-card-item", item: iconCardsBlock.items[2], block: iconCardsBlock },
      { kind: "block", block: blocks[2] },
    ])
  })
})

describe("layoutBento", () => {
  it("0 units: empty cells and overflow", () => {
    const { cells, overflow } = layoutBento([], rect)
    expect(cells).toEqual([])
    expect(overflow).toEqual([])
  })

  it("1 unit: takes the whole rect", () => {
    const units = [blockUnit("a")]
    const { cells, overflow } = layoutBento(units, rect)
    expect(overflow).toEqual([])
    expect(cells).toHaveLength(1)
    expect(cells[0].box).toEqual({ x: 96, y: 200, w: 1088, h: 400 })
    expect(cells[0].unit).toBe(units[0])
  })

  it("2 units: left 58% / right 42%, full height", () => {
    const units = [blockUnit("a"), blockUnit("b")]
    const { cells, overflow } = layoutBento(units, rect)
    expect(overflow).toEqual([])
    expect(cells).toHaveLength(2)
    const usableW = 1088 - 16
    const leftW = usableW * 0.58
    const rightW = usableW * 0.42
    expect(cells[0].box).toEqual({ x: 96, y: 200, w: leftW, h: 400 })
    expect(cells[1].box).toEqual({
      x: 96 + leftW + 16,
      y: 200,
      w: rightW,
      h: 400,
    })
  })

  it("3 units: left 60% full-height big card + right column split up/down", () => {
    const units = [blockUnit("a"), blockUnit("b"), blockUnit("c")]
    const { cells, overflow } = layoutBento(units, rect)
    expect(overflow).toEqual([])
    expect(cells).toHaveLength(3)
    const usableW = 1088 - 16
    const leftW = usableW * 0.6
    const rightW = usableW * 0.4
    const rightX = 96 + leftW + 16
    const rightH = (400 - 16) / 2
    expect(cells[0].box).toEqual({ x: 96, y: 200, w: leftW, h: 400 })
    expect(cells[1].box).toEqual({ x: rightX, y: 200, w: rightW, h: rightH })
    expect(cells[2].box).toEqual({
      x: rightX,
      y: 200 + rightH + 16,
      w: rightW,
      h: rightH,
    })
  })

  it("4 units: 2x2 with 60/40 top row and 40/60 bottom row", () => {
    const units = [
      blockUnit("a"),
      blockUnit("b"),
      blockUnit("c"),
      blockUnit("d"),
    ]
    const { cells, overflow } = layoutBento(units, rect)
    expect(overflow).toEqual([])
    expect(cells).toHaveLength(4)
    const usableW = 1088 - 16
    const rowH = (400 - 16) / 2
    const topLeftW = usableW * 0.6
    const topRightW = usableW * 0.4
    const bottomLeftW = usableW * 0.4
    const bottomRightW = usableW * 0.6
    const bottomY = 200 + rowH + 16
    expect(cells[0].box).toEqual({ x: 96, y: 200, w: topLeftW, h: rowH })
    expect(cells[1].box).toEqual({
      x: 96 + topLeftW + 16,
      y: 200,
      w: topRightW,
      h: rowH,
    })
    expect(cells[2].box).toEqual({ x: 96, y: bottomY, w: bottomLeftW, h: rowH })
    expect(cells[3].box).toEqual({
      x: 96 + bottomLeftW + 16,
      y: bottomY,
      w: bottomRightW,
      h: rowH,
    })
  })

  it("5 units: upper row of 3 equal cards, lower row of 2 equal cards, each row full-width", () => {
    const units = Array.from({ length: 5 }, (_, i) => blockUnit(`u${i}`))
    const { cells, overflow } = layoutBento(units, rect)
    expect(overflow).toEqual([])
    expect(cells).toHaveLength(5)

    const rowH = (400 - 16) / 2
    const topW = (1088 - 2 * 16) / 3
    const bottomW = (1088 - 16) / 2
    const bottomY = 200 + rowH + 16

    expect(cells[0].box).toEqual({ x: 96, y: 200, w: topW, h: rowH })
    expect(cells[1].box).toEqual({
      x: 96 + topW + 16,
      y: 200,
      w: topW,
      h: rowH,
    })
    expect(cells[2].box).toEqual({
      x: 96 + 2 * (topW + 16),
      y: 200,
      w: topW,
      h: rowH,
    })
    expect(cells[3].box).toEqual({ x: 96, y: bottomY, w: bottomW, h: rowH })
    expect(cells[4].box).toEqual({
      x: 96 + bottomW + 16,
      y: bottomY,
      w: bottomW,
      h: rowH,
    })

    // Both rows independently span the full rect width.
    expect(cells[0].box.w * 3 + 16 * 2).toBeCloseTo(1088)
    expect(cells[3].box.w * 2 + 16).toBeCloseTo(1088)
  })

  it("6 units: equal-width 3x2 grid", () => {
    const units = Array.from({ length: 6 }, (_, i) => blockUnit(`u${i}`))
    const { cells, overflow } = layoutBento(units, rect)
    expect(overflow).toEqual([])
    expect(cells).toHaveLength(6)

    const rowH = (400 - 16) / 2
    const colW = (1088 - 2 * 16) / 3
    const bottomY = 200 + rowH + 16

    expect(cells[0].box).toEqual({ x: 96, y: 200, w: colW, h: rowH })
    expect(cells[1].box).toEqual({
      x: 96 + colW + 16,
      y: 200,
      w: colW,
      h: rowH,
    })
    expect(cells[2].box).toEqual({
      x: 96 + 2 * (colW + 16),
      y: 200,
      w: colW,
      h: rowH,
    })
    expect(cells[3].box).toEqual({ x: 96, y: bottomY, w: colW, h: rowH })
    expect(cells[4].box).toEqual({
      x: 96 + colW + 16,
      y: bottomY,
      w: colW,
      h: rowH,
    })
    expect(cells[5].box).toEqual({
      x: 96 + 2 * (colW + 16),
      y: bottomY,
      w: colW,
      h: rowH,
    })
  })

  it("8 units: first 6 laid out per the 3x2 rule, rest overflow", () => {
    const units = Array.from({ length: 8 }, (_, i) => blockUnit(`u${i}`))
    const { cells, overflow } = layoutBento(units, rect)
    expect(cells).toHaveLength(6)
    expect(overflow).toEqual([units[6], units[7]])
    expect(cells.map((c) => c.unit)).toEqual(units.slice(0, 6))
  })

  describe("invariants across all cell counts", () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 9]) {
      it(`n=${n}: boxes are non-overlapping, within rect, area <= rect area`, () => {
        const units = Array.from({ length: n }, (_, i) => blockUnit(`u${i}`))
        const { cells } = layoutBento(units, rect)

        let totalArea = 0
        for (const cell of cells) {
          const { x, y, w, h } = cell.box
          // within rect bounds (allow tiny fp slop)
          expect(x).toBeGreaterThanOrEqual(rect.x - 0.01)
          expect(y).toBeGreaterThanOrEqual(rect.y - 0.01)
          expect(x + w).toBeLessThanOrEqual(rect.x + rect.w + 0.01)
          expect(y + h).toBeLessThanOrEqual(rect.y + rect.h + 0.01)
          totalArea += w * h
        }
        expect(totalArea).toBeLessThanOrEqual(rect.w * rect.h + 0.01)

        // pairwise non-overlap (axis-aligned rect intersection test)
        for (let i = 0; i < cells.length; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            const a = cells[i].box
            const b = cells[j].box
            const overlapsX = a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01
            const overlapsY = a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01
            expect(overlapsX && overlapsY).toBe(false)
          }
        }
      })
    }
  })

  describe("拼盘档位均衡 — 等高优先 (Task 3 audit lock-in)", () => {
    // Explicit "same-row cells share the same height" lock, on top of the
    // exact-box assertions above (which already imply this, but don't say
    // so directly) — Task 3's brief asked to confirm this in a test if the
    // current geometry already holds it, rather than change any tier's
    // layout (see bento-layout.ts's module doc / the task report for the
    // full current-state audit of all 6 tiers).
    it("2 units: both cells (the only 'row') share the same height", () => {
      const { cells } = layoutBento([blockUnit("a"), blockUnit("b")], rect)
      expect(cells[0].box.h).toBe(cells[1].box.h)
    })

    it("3 units: the two right-column cells share the same height (the left hero cell spans both rows by design — not a same-row pair)", () => {
      const { cells } = layoutBento(
        [blockUnit("a"), blockUnit("b"), blockUnit("c")],
        rect
      )
      expect(cells[1].box.h).toBe(cells[2].box.h)
      // The hero cell is taller than the row cells — intentional asymmetry
      // (a full-height card beside two stacked half-height ones), not an
      // oversight this lock-in should flag.
      expect(cells[0].box.h).toBeGreaterThan(cells[1].box.h)
    })

    it("4 units: all 4 cells (both rows) share the same height", () => {
      const units = Array.from({ length: 4 }, (_, i) => blockUnit(`u${i}`))
      const { cells } = layoutBento(units, rect)
      const heights = new Set(cells.map((c) => c.box.h))
      expect(heights.size).toBe(1)
    })

    it("5 units: all 5 cells (the 3-up top row and the 2-up bottom row alike) share the same height", () => {
      const units = Array.from({ length: 5 }, (_, i) => blockUnit(`u${i}`))
      const { cells } = layoutBento(units, rect)
      const heights = new Set(cells.map((c) => c.box.h))
      expect(heights.size).toBe(1)
    })

    it("6 units: all 6 cells share the same height", () => {
      const units = Array.from({ length: 6 }, (_, i) => blockUnit(`u${i}`))
      const { cells } = layoutBento(units, rect)
      const heights = new Set(cells.map((c) => c.box.h))
      expect(heights.size).toBe(1)
    })
  })
})

describe("sortUnitsByHeroWeight", () => {
  it("chart and kpi-item tie at the top weight tier — stable, whichever comes first in the input stays first", () => {
    const a = sortUnitsByHeroWeight([kpiUnit("1"), chartUnit()])
    expect(a).toEqual([kpiUnit("1"), chartUnit()])

    const b = sortUnitsByHeroWeight([chartUnit(), kpiUnit("1")])
    expect(b).toEqual([chartUnit(), kpiUnit("1")])
  })

  it("promotes a kpi-item ahead of a plain block that appeared earlier in the original order", () => {
    const sorted = sortUnitsByHeroWeight([blockUnit("a"), kpiUnit("42")])
    expect(sorted).toEqual([kpiUnit("42"), blockUnit("a")])
  })

  it("ranks icon-card-item above a plain block but below kpi-item/chart", () => {
    const sorted = sortUnitsByHeroWeight([
      blockUnit("a"),
      iconCardUnit("t"),
      kpiUnit("1"),
    ])
    expect(sorted).toEqual([kpiUnit("1"), iconCardUnit("t"), blockUnit("a")])
  })

  it("ranks a self-visual block (verdict_banner) above a plain block but below icon-card-item", () => {
    const sorted = sortUnitsByHeroWeight([
      blockUnit("a"),
      selfVisualUnit("v"),
      iconCardUnit("t"),
    ])
    expect(sorted).toEqual([
      iconCardUnit("t"),
      selfVisualUnit("v"),
      blockUnit("a"),
    ])
  })

  it("keeps units of equal weight in their original relative order (stable tie-break, including a 3-way top-tier tie)", () => {
    const plainBlocks = [blockUnit("a"), blockUnit("b"), blockUnit("c")]
    expect(sortUnitsByHeroWeight(plainBlocks)).toEqual(plainBlocks)

    const mixed = [kpiUnit("1"), chartUnit(), kpiUnit("2")]
    expect(sortUnitsByHeroWeight(mixed)).toEqual(mixed)
  })

  it("4-unit tier: the two highest-weight units fill BOTH big cells (array indices 0 and 3), not just index 0", () => {
    // layoutBento's 4-unit tier has *two* equal-area 0.6-width cells at
    // indices 0 and 3 (see bento-layout.ts's CELL_AREA_RANK comment) — a
    // naive "move heavy units to the front" sort would put the 2nd-heaviest
    // unit at index 1 (one of the *small* 0.4-width cells) instead.
    const hi1 = kpiUnit("hi1")
    const hi2 = kpiUnit("hi2")
    const low1 = blockUnit("low1")
    const low2 = blockUnit("low2")
    const sorted = sortUnitsByHeroWeight([hi1, low1, low2, hi2])
    expect(sorted).toEqual([hi1, low1, low2, hi2])
  })

  it("5-unit tier: the two highest-weight units fill the wider bottom-row cells (indices 3, 4), not the top row", () => {
    // layoutBento's 5-unit tier's bottom row (indices 3, 4) is *wider* (and
    // thus larger-area) than its top row (indices 0, 1, 2) at the same row
    // height — see bento-layout.ts's CELL_AREA_RANK comment. A naive
    // front-loading sort would put the two heavy units at indices 0 and 1
    // (the *smaller* top row) instead.
    const hi1 = kpiUnit("hi1")
    const hi2 = kpiUnit("hi2")
    const low1 = blockUnit("low1")
    const low2 = blockUnit("low2")
    const low3 = blockUnit("low3")
    const sorted = sortUnitsByHeroWeight([hi1, low1, low2, low3, hi2])
    expect(sorted).toEqual([low1, low2, low3, hi1, hi2])
  })

  it("6-unit tier: every cell is equal-area, so weight-sorting still runs but has no 'wrong cell' to avoid (rank is identity)", () => {
    const units = [
      blockUnit("a"),
      kpiUnit("1"),
      blockUnit("b"),
      iconCardUnit("t"),
      blockUnit("c"),
      chartUnit(),
    ]
    const sorted = sortUnitsByHeroWeight(units)
    // Top-tier (kpi/chart) first, in original relative order; then
    // icon-card; then the plain blocks, in original relative order.
    expect(sorted).toEqual([
      kpiUnit("1"),
      chartUnit(),
      iconCardUnit("t"),
      blockUnit("a"),
      blockUnit("b"),
      blockUnit("c"),
    ])
  })

  it("returns units unchanged for counts outside the 0-6 bento grid (e.g. 7) — no cell ranking exists to target", () => {
    const units = [
      blockUnit("a"),
      blockUnit("b"),
      blockUnit("c"),
      blockUnit("d"),
      blockUnit("e"),
      blockUnit("f"),
      kpiUnit("hi"), // last, but 7 units never becomes bento cells (>6 always degrades)
    ]
    expect(sortUnitsByHeroWeight(units)).toEqual(units)
  })

  it("0/1 units: no-op", () => {
    expect(sortUnitsByHeroWeight([])).toEqual([])
    const single = [blockUnit("a")]
    expect(sortUnitsByHeroWeight(single)).toEqual(single)
  })

  describe("wave-B T3 review regression — equal-weight units keep IR order, only genuine hero units get promoted", () => {
    it("4-unit tier, all equal weight: identity (no unit outranks another, so none get scattered by CELL_AREA_RANK's [0,3,1,2])", () => {
      const units = [
        blockUnit("壹"),
        blockUnit("贰"),
        blockUnit("叁"),
        blockUnit("肆"),
      ]
      expect(sortUnitsByHeroWeight(units)).toEqual(units)
    })

    it("5-unit tier, all equal weight: identity (no unit outranks another, so none get scattered by CELL_AREA_RANK's [3,4,0,1,2])", () => {
      const units = [
        blockUnit("壹"),
        blockUnit("贰"),
        blockUnit("叁"),
        blockUnit("肆"),
        blockUnit("伍"),
      ]
      expect(sortUnitsByHeroWeight(units)).toEqual(units)
    })

    it("3-unit tier, all equal weight: identity (already-correct case — CELL_AREA_RANK is identity here — pinned so the promotion rewrite can't regress it)", () => {
      const units = [blockUnit("a"), blockUnit("b"), blockUnit("c")]
      expect(sortUnitsByHeroWeight(units)).toEqual(units)
    })

    it("4-unit tier, single hero: only the chart is promoted into the sole biggest cell (index 0); the other three keep their original relative order in the remaining cells", () => {
      const units = [
        blockUnit("a"),
        blockUnit("b"),
        chartUnit(),
        blockUnit("c"),
      ]
      const sorted = sortUnitsByHeroWeight(units)
      expect(sorted).toEqual([
        chartUnit(),
        blockUnit("a"),
        blockUnit("b"),
        blockUnit("c"),
      ])
    })

    it("5-unit tier, single hero: only the kpi-item is promoted into the sole biggest cell (index 3); the other four keep their original relative order in the remaining cells", () => {
      const units = [
        blockUnit("a"),
        blockUnit("b"),
        kpiUnit("hi"),
        blockUnit("c"),
        blockUnit("d"),
      ]
      const sorted = sortUnitsByHeroWeight(units)
      expect(sorted).toEqual([
        blockUnit("a"),
        blockUnit("b"),
        blockUnit("c"),
        kpiUnit("hi"),
        blockUnit("d"),
      ])
    })

    it("4-unit tier, two equal-weight heroes starting in the *middle* of the array: both still get promoted into the two big cells (0 and 3), in their original relative order, while the two lows keep their relative order in the small cells — a genuine reorder, not a coincidental no-op", () => {
      const units = [
        blockUnit("low1"),
        kpiUnit("hi1"),
        kpiUnit("hi2"),
        blockUnit("low2"),
      ]
      const sorted = sortUnitsByHeroWeight(units)
      expect(sorted).toEqual([
        kpiUnit("hi1"),
        blockUnit("low1"),
        blockUnit("low2"),
        kpiUnit("hi2"),
      ])
    })
  })
})
