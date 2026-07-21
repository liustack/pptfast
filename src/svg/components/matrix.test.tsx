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
  // (auditSvgMarkup, same oracle SvgContent.tsx's real data-audit-box wrapper
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
})
