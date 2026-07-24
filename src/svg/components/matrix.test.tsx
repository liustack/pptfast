// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { auditSvgMarkup } from "../audit/svg-audit"
import { matrix } from "./matrix"
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
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const sixCells = {
  type: "matrix" as const,
  x_title: "需求确定性",
  y_title: "资产投入",
  cols: 2 as const,
  items: [
    { title: "县乡节点", tag: "低确定性", tone: "neutral" as const },
    { title: "社区统建统服", tag: "高确定性", tone: "accent" as const },
    { title: "目的地充电", tag: "低确定性", tone: "neutral" as const },
    { title: "物流专用站", tag: "高确定性", tone: "info" as const },
    { title: "高速走廊", tag: "需求波动", tone: "info" as const },
    { title: "城市旗舰超充", tag: "高刚需", tone: "accent" as const },
  ],
}

describe("matrix component", () => {
  it("lays out items in a cols-wide grid (2 cols × 3 rows = 6 cards)", () => {
    const { container } = svg(matrix.render(sixCells, { x: 60, y: 200, w: 800 }, ctx))
    const cards = Array.from(container.querySelectorAll("rect"))
    expect(cards).toHaveLength(6)
    const xs = new Set(cards.map((r) => Math.round(Number(r.getAttribute("x")))))
    expect(xs.size).toBe(2) // two distinct column x-positions
  })

  it("tone maps to distinct card fills (accent vs info vs neutral)", () => {
    const { container } = svg(matrix.render(sixCells, { x: 0, y: 0, w: 800 }, ctx))
    const fills = Array.from(container.querySelectorAll("rect")).map((r) => r.getAttribute("fill"))
    // neutral(idx0), accent(idx1), info(idx3) must all differ from each other.
    expect(new Set([fills[0], fills[1], fills[3]]).size).toBe(3)
    // and none equals plain surface (they are tinted)
    expect(fills[1]).not.toBe(ctx.colors.surface)
  })

  it("renders x/y axis labels when provided", () => {
    const { container } = svg(matrix.render(sixCells, { x: 0, y: 0, w: 800 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts.some((t) => t?.includes("需求确定性") && t?.includes("→"))).toBe(true)
    // y_title is stacked per-char
    expect(texts.filter((t) => "资产投入".includes(t ?? "\x00")).length).toBeGreaterThanOrEqual(4)
  })

  it("measure() grows with more rows", () => {
    const twoRows = matrix.measure(sixCells, 800, ctx)
    const oneRow = matrix.measure({ ...sixCells, items: sixCells.items.slice(0, 2) }, 800, ctx)
    expect(twoRows).toBeGreaterThan(oneRow)
  })

  it("renders only svg2pptx-subset primitives", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{matrix.render(sixCells, { x: 0, y: 0, w: 800 }, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })

  // Borrow-wave Task 4 (docs/contrast-system.md's "Overlap detection
  // boundary") found matrix.tsx's x_title is the one confirmed, shipping
  // free-text field that renders inside a live data-audit-box with zero
  // width fit — the audit's own widened box detects the collision this can
  // cause, but the component itself let the text genuinely overflow. This
  // pins the render-layer fix using the audit's own h-overflow detector
  // (auditSvgMarkup, same oracle svg-content.tsx's real data-audit-box wrapper
  // feeds) as the objective measure, not just an eyeballed string length.
  it("fits an egregiously long x_title within its declared box instead of overflowing it (real-render h-overflow oracle)", () => {
    // 72 CJK chars — far past anything a 560px box minus the y_title gutter
    // (526px available) can hold even after shrinking to the component's own
    // font-size floor, so this also exercises the truncation branch below.
    const egregious = { ...sixCells, x_title: "超长坐标轴标题".repeat(12) }
    const box = { x: 60, y: 200, w: 560 }
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <g data-audit-box={`${box.x},${box.y},${box.w}`}>{matrix.render(egregious, box, ctx)}</g>
      </svg>,
    )
    const hOverflow = auditSvgMarkup(markup).filter((i) => i.kind === "h-overflow")
    expect(hOverflow).toEqual([])

    const root = parseSvgRoot(markup)
    const xTitleText = Array.from(root.querySelectorAll("text")).find((t) =>
      t.textContent?.includes("超长坐标轴标题"),
    )
    expect(xTitleText).toBeTruthy()
    // Shrink alone can't rescue 72 CJK chars in a 526px gutter at the fitted
    // floor — truncateToUnits must engage, and the marker convention every
    // sibling fitted field (item.title/item.tag, same file) already uses
    // must carry over to x_title too.
    expect(xTitleText?.getAttribute("data-truncated")).toBe("1")
  })

  it("leaves a normal-length x_title byte-identical to the unfitted baseline (fit path only engages on real overflow)", () => {
    // sixCells' x_title ("需求确定性") comfortably fits any realistic box —
    // this pins that the fit call introduced for the egregious case above is
    // a genuine no-op here: same font size, same text, no truncation marker.
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{matrix.render(sixCells, { x: 0, y: 0, w: 800 }, ctx)}</svg>,
    )
    const root = parseSvgRoot(markup)
    const xTitleText = Array.from(root.querySelectorAll("text")).find((t) => t.textContent?.includes("需求确定性"))
    expect(xTitleText?.textContent).toBe("需求确定性  →")
    expect(xTitleText?.getAttribute("font-size")).toBe("13")
    expect(xTitleText?.hasAttribute("data-truncated")).toBe(false)
  })

  // Family-sweep follow-up to the x_title fix above (that task's reviewer
  // pinned the root cause): y_title stacks one <text> per character with NO
  // cap against the component's own box height at all. Two coupled defects,
  // both fixed here — (1) render() let the stack run past the box's bottom
  // edge unconditionally, and (2) measure() never accounted for y_title's
  // own vertical extent, so upstream layout never allocated room for it and
  // the audit's data-audit-box never covered it either. Neither of the
  // audit's existing checks catches this class: v-overflow bounds only
  // against the whole slide's data-audit-rect (not a per-component box),
  // and the overlap check needs a sibling box below to collide with — so
  // this test uses the component's own declared box as the oracle directly,
  // the same way the probe that first surfaced this bug did.
  describe("y_title vertical fit", () => {
    // 24 CJK chars, matching the case that first surfaced this defect.
    const longYTitle = "这是一个远远超出网格实际高度的超长纵轴标题文本超"
    // 1 row, no tag, no x_title — the shortest possible grid (55px), so the
    // stack's own height dominates and the overrun is unmistakable rather
    // than incidental.
    const shortGridLongYTitle = {
      type: "matrix" as const,
      y_title: longYTitle,
      cols: 2 as const,
      items: [
        { title: "a", tone: "neutral" as const },
        { title: "b", tone: "accent" as const },
      ],
    }

    function yTitleTexts(root: Element) {
      // Only y_title's per-char stack renders with textAnchor="middle" in
      // this component (item title/tag and x_title all render left-aligned)
      // — an unambiguous, implementation-detail-free selector.
      return Array.from(root.querySelectorAll("text")).filter(
        (t) => t.getAttribute("text-anchor") === "middle",
      )
    }

    it("does not double-subtract the x_title band from the box.h-undefined fallback (regression: x_title present + box.h left undefined spuriously truncated a title that already fit)", () => {
      // Reviewer's exact repro: tech theme, content-bento-panel archetype
      // (which never sets a child's box.h — `renderCell` calls
      // `renderComponent(component, { x, y, w }, ctx)` with no `h` field),
      // x_title="Customer Demand", y_title="Investment Level" (16 chars),
      // 2x2 grid, no tags. The fit-round-1 fallback
      // (`measuredFallbackH = Math.max(gridH, yTitleH)`) already mirrors
      // measure()'s own X_TITLE_H-exclusive second term, but the render()
      // that shipped alongside it subtracted X_TITLE_H from that fallback
      // a second time whenever box.h was undefined — which is every real
      // production path for matrix (it isn't in `STRETCHABLE_TYPES`, and
      // bento-panel never sets box.h either) — silently shrinking the
      // y_title budget by X_TITLE_H (30px) and truncating "Investment
      // Level" down to "Investment Le…" even though measure() had already
      // allocated enough room for the whole title.
      const bentoLikeComponent = {
        type: "matrix" as const,
        x_title: "Customer Demand",
        y_title: "Investment Level",
        cols: 2 as const,
        items: [
          { title: "Rural nodes", tone: "neutral" as const },
          { title: "Community hubs", tone: "accent" as const },
          { title: "Fleet charging", tone: "info" as const },
          { title: "Flagship urban", tone: "accent" as const },
        ],
      }
      const box = { x: 0, y: 0, w: 800 } // box.h intentionally undefined, matching bento-panel
      const measured = matrix.measure(bentoLikeComponent, box.w, ctx)

      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">{matrix.render(bentoLikeComponent, box, ctx)}</svg>,
      )
      const root = parseSvgRoot(markup)
      const yTexts = yTitleTexts(root)

      // Every character survives -- no truncation.
      expect(yTexts.map((t) => t.textContent).join("")).toBe("Investment Level")
      expect(yTexts.every((t) => !t.hasAttribute("data-truncated"))).toBe(true)

      // The rendered stack's own extent matches what measure() allocated
      // for it (yTitleStackHeight(16) — same derivation comment as the
      // implementation: 20 start-offset + 15 * 15 per-char steps + a 0.25em
      // descent allowance on the last glyph), not shrunk by a phantom
      // second X_TITLE_H subtraction, and never exceeds measure()'s own
      // reported footprint (the honesty guarantee the fit-round-1 tests
      // above pin separately).
      const expectedYTitleStackHeight = 20 + 15 * 15 + 13 * 0.25
      const lastText = yTexts[yTexts.length - 1]
      const lastBaselineY = Number(lastText.getAttribute("y"))
      const gridTop = box.y + 30 // box.x_title present -> gridTop offset by X_TITLE_H (30, matrix.tsx's own constant)
      expect(lastBaselineY - gridTop).toBeCloseTo(expectedYTitleStackHeight - 13 * 0.25, 5)
      expect(lastBaselineY + 13 * 0.25).toBeLessThanOrEqual(box.y + measured)
    })

    it("caps the stacked characters within a box height narrower than the full stack needs, marking the dropped tail data-truncated", () => {
      // box.h = 150: wider than the 1-row grid's own card height (55px, so
      // the cards themselves render fine) but far short of what all 24
      // y_title characters stacked at their existing per-char rhythm would
      // need (~368px) — exactly the "box.h explicitly smaller than the
      // component's measured need" case `layout.ts`'s own last-resort
      // overflow path (`layoutContentFit`'s "keep the first placed
      // component" branch) produces for real.
      const box = { x: 96, y: 176, w: 600, h: 150 }
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          {matrix.render(shortGridLongYTitle, box, ctx)}
        </svg>,
      )
      const root = parseSvgRoot(markup)
      const yTexts = yTitleTexts(root)
      expect(yTexts.length).toBeGreaterThan(0)
      expect(yTexts.length).toBeLessThan(Array.from(longYTitle).length)

      // In-bounds: every rendered char's baseline, plus a descent
      // allowance, stays within the declared box (x,y,w,h) — the same
      // box.y+box.h bottom edge the ~215px pre-fix overrun blew past.
      for (const t of yTexts) {
        const baselineY = Number(t.getAttribute("y"))
        expect(baselineY + Number(t.getAttribute("font-size")) * 0.25).toBeLessThanOrEqual(
          box.y + box.h,
        )
      }

      // Truncation marker convention: the last rendered char is "…" and
      // carries data-truncated="1", same as cellLayout's title/tag and
      // x_title (this same file) already do.
      const last = yTexts[yTexts.length - 1]
      expect(last.textContent).toBe("…")
      expect(last.getAttribute("data-truncated")).toBe("1")
      // No earlier char carries the marker — it's a tail marker, not a
      // blanket one, matching every other fitted field's convention.
      expect(yTexts.slice(0, -1).every((t) => !t.hasAttribute("data-truncated"))).toBe(true)
    })

    it("grows measure()'s reported footprint to cover y_title's real vertical extent once it exceeds the grid's own card height", () => {
      // Same 1-row/no-tag/24-char fixture as above, measured without a
      // box.h ceiling — this is what upstream layout (`layout.ts`'s
      // `stackFrom`/`stackBottom`/`growStretchables`) actually calls to
      // decide how much room to reserve and where the next sibling starts.
      const measured = matrix.measure(shortGridLongYTitle, 600, ctx)
      const gridOnly = matrix.measure({ ...shortGridLongYTitle, y_title: undefined }, 600, ctx)
      // Pre-fix, measure() was blind to y_title entirely — this component's
      // reported footprint was `gridOnly` regardless of y_title's length.
      // Post-fix it must grow past that once the stack needs more room.
      expect(measured).toBeGreaterThan(gridOnly)
      // And it must grow far enough to actually cover the full stack this
      // component would render unconstrained — not just "some" growth.
      // 24 chars at the existing per-char rhythm (20 start + 23 * 15 step)
      // need at least 365px from gridTop; measure() must allocate at least
      // that much (plus/minus the small fixed descent allowance render()
      // also budgets, asserted loosely here since this test intentionally
      // doesn't reimplement render()'s exact constants).
      expect(measured).toBeGreaterThanOrEqual(20 + 23 * 15)
    })

    it("leaves measure() and the rendered stack byte-identical to the pre-fix baseline when the title already fits the grid (fit path is a no-op on the common case)", () => {
      // sixCells' own y_title ("资产投入", 4 chars) comfortably fits its
      // 3-row/tagged grid (269px) — this pins that neither measure() nor
      // render()'s new cap change anything here.
      const measured = matrix.measure(sixCells, 800, ctx)
      const gridOnly = matrix.measure({ ...sixCells, y_title: undefined }, 800, ctx)
      expect(measured).toBe(gridOnly)

      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">{matrix.render(sixCells, { x: 0, y: 0, w: 800 }, ctx)}</svg>,
      )
      const root = parseSvgRoot(markup)
      const yTexts = yTitleTexts(root)
      expect(yTexts.map((t) => t.textContent).join("")).toBe(sixCells.y_title)
      expect(yTexts.every((t) => !t.hasAttribute("data-truncated"))).toBe(true)
    })
  })
})
