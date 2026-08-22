// @vitest-environment jsdom
/**
 * E0: a single-edge emphasis bar (left/right/top/bottom) is banned on the
 * owned card faces. Detector matches the r1 callout left-bar rule:
 * w<=12 and h>=70% of the card is a side bar. h<=6 and w>=70% of the card
 * is a top/bottom bar. No hairline substitute.
 */
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { insightPanel } from "./insight-panel"
import { rowCards } from "./row-cards"
import { verdictBanner } from "./verdict-banner"
import { numberedCards } from "./numbered-cards"
import { iconCards } from "./icon-cards"
import { callout } from "./callout"
import type { ComponentCtx } from "./types"
import { CANONICAL_THEME_IDS, resolveStyle } from "../../themes"
import { buildCtx } from "../full-slide-svg"

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

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

function isEdgeBar(rect: Element, cardW: number, cardH: number): boolean {
  const w = Number(rect.getAttribute("width"))
  const h = Number(rect.getAttribute("height"))
  return (w <= 12 && h >= cardH * 0.7) || (h <= 6 && w >= cardW * 0.7)
}

function assertNoEdgeBar(container: HTMLElement, cardW: number, cardH: number, label: string) {
  for (const rect of container.querySelectorAll("rect")) {
    expect(isEdgeBar(rect, cardW, cardH), `${label} ${rect.getAttribute("width")}x${rect.getAttribute("height")}`).toBe(
      false,
    )
  }
}

describe("single-edge emphasis bar ban", () => {
  it("insight_panel paints no top accent bar path and no edge-bar rect", () => {
    const panel = {
      type: "insight_panel" as const,
      title: "策略推演",
      rows: [{ label: "试点", text: "小规模验证利用率。" }],
    }
    const { container } = svg(insightPanel.render(panel, { x: 0, y: 0, w: 400 }, ctx))
    const h = insightPanel.measure(panel, 400, ctx)
    expect(container.querySelector("path")).toBeNull()
    assertNoEdgeBar(container, 400, h, "insight_panel")
  })

  it("row_cards paints no edge bar on a card shell", () => {
    const component = {
      type: "row_cards" as const,
      items: [
        { title: "事项一", text: "说明一" },
        { title: "事项二", text: "说明二" },
      ],
    }
    const { container } = svg(rowCards.render(component, { x: 0, y: 0, w: 800 }, ctx))
    const h = rowCards.measure(component, 800, ctx)
    assertNoEdgeBar(container, 800, h, "row_cards")
  })

  it("verdict_banner has no full-width top/bottom bar", () => {
    const component = { type: "verdict_banner" as const, tone: "warning" as const, text: "结论一句话" }
    const { container } = svg(verdictBanner.render(component, { x: 0, y: 0, w: 1088 }, ctx))
    const h = verdictBanner.measure(component, 1088, ctx)
    assertNoEdgeBar(container, 1088, h, "verdict_banner")
  })

  it("numbered_cards default path paints no top hairline and no side bar", () => {
    const component = {
      type: "numbered_cards" as const,
      items: [
        { title: "要点一", text: "说明" },
        { title: "要点二", text: "说明" },
        { title: "要点三", text: "说明" },
        { title: "要点四", text: "说明" },
      ],
    }
    const { container } = svg(numberedCards.render(component, { x: 0, y: 0, w: 1088 }, ctx))
    const h = numberedCards.measure(component, 1088, ctx)
    const hairlines = [...container.querySelectorAll("rect")].filter((r) => Number(r.getAttribute("height")) <= 3)
    expect(hairlines).toHaveLength(0)
    assertNoEdgeBar(container, 1088, h, "numbered_cards")
  })

  it("icon_cards default path paints no accent bar", () => {
    const component = {
      type: "icon_cards" as const,
      items: [
        { icon: "rocket", title: "断言一", text: "说明一" },
        { icon: "rocket", title: "断言二", text: "说明二" },
        { icon: "rocket", title: "断言三", text: "说明三" },
        { icon: "rocket", title: "断言四", text: "说明四" },
      ],
    }
    const { container } = svg(iconCards.render(component, { x: 0, y: 0, w: 1088 }, ctx))
    const h = iconCards.measure(component, 1088, ctx)
    const accentBars = [...container.querySelectorAll("rect")].filter((r) => r.getAttribute("height") === "3")
    expect(accentBars).toHaveLength(0)
    assertNoEdgeBar(container, 1088, h, "icon_cards")
  })

  it("callout on every canonical theme has no edge bar", () => {
    const component = { type: "callout" as const, variant: "warn" as const, text: "警告" }
    for (const id of CANONICAL_THEME_IDS) {
      const themeCtx = buildCtx(resolveStyle(id), {})
      const { container } = svg(callout.render(component, { x: 0, y: 0, w: 800 }, themeCtx))
      const h = callout.measure(component, 800, themeCtx)
      assertNoEdgeBar(container, 800, h, `callout/${id}`)
    }
  })
})
