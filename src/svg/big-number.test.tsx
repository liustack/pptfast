// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { SvgContent } from "./svg-content"
import type { ComponentCtx } from "./components/types"
import type { Component } from "@/ir"
import { measureTextUnits } from "../lib/svg-text-layout"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFF",
    surface: "#EEE",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

const components: Component[] = [
  { type: "kpi_cards", items: [{ value: "82", unit: "%", label: "市场渗透率" }] },
  { type: "paragraph", text: "受益于渠道下沉。" },
]

function renderBig(b: Component[]) {
  return render(
    <svg viewBox="0 0 1280 720">
      <SvgContent arrangement="big_number" components={b} rect={{ x: 80, y: 264, w: 1120, h: 400 }} ctx={ctx} />
    </svg>,
  )
}

describe("big_number variant", () => {
  it("renders the first kpi value as a giant hero number with its label", () => {
    const { container } = renderBig(components)
    const texts = Array.from(container.querySelectorAll("text"))
    const hero = texts.find((t) => (t.textContent ?? "").includes("82"))
    expect(hero).toBeTruthy()
    expect(parseFloat(hero!.getAttribute("font-size") ?? "0")).toBeGreaterThanOrEqual(120)
    expect(hero!.getAttribute("fill")).toBe("#006A4E") // primary
    // label present
    expect(container.textContent).toContain("市场渗透率")
    // supporting paragraph still rendered
    expect(container.textContent).toContain("受益于渠道下沉")
  })

  it("shrinks an overlong hero value and label to fit the content rect", () => {
    const longComponents: Component[] = [
      {
        type: "kpi_cards",
        items: [
          {
            value: "1,234,567.89",
            unit: "次/秒",
            label:
              "基于 Kubernetes Operator 的 StatefulSet 滚动升级与 PodDisruptionBudget 联动策略 v2.3.1-rc.4 说明",
          },
        ],
      },
    ]
    const { container } = renderBig(longComponents)
    const texts = Array.from(container.querySelectorAll("text"))
    const hero = texts.find((t) => (t.textContent ?? "").includes("1,234,567.89"))!
    const heroFontSize = Number(hero.getAttribute("font-size"))
    expect(heroFontSize).toBeLessThan(200)
    expect(heroFontSize).toBeGreaterThanOrEqual(48)

    const label = texts.find((t) =>
      (t.textContent ?? "").startsWith("基于 Kubernetes"),
    )!
    const labelFontSize = Number(label.getAttribute("font-size"))
    expect(labelFontSize).toBeLessThan(28)
    expect(labelFontSize).toBeGreaterThanOrEqual(14)
  })

  it("truncates a pathologically long unit so the audit-model estimate (value+unit concatenated at the outer font-size) fits rect.w", () => {
    // The overflow auditor can't see the unit tspan's smaller font-size — it
    // measures the whole <text>'s textContent at the outer (value) font-size.
    // A long unit truncated only against its own (smaller) rendered size can
    // still make that concatenated-at-outer-size estimate blow past rect.w.
    const longUnitComponents: Component[] = [
      {
        type: "kpi_cards",
        items: [
          {
            value: "1234567890",
            unit:
              "非常非常非常非常非常非常非常非常非常非常长的单位文字说明超长内容单位",
            label: "短标签",
          },
        ],
      },
    ]
    const { container } = renderBig(longUnitComponents)
    const texts = Array.from(container.querySelectorAll("text"))
    const hero = texts.find((t) => (t.textContent ?? "").includes("1"))!
    const outerFontSize = Number(hero.getAttribute("font-size"))
    const unitTspan = hero.querySelector("tspan")!
    // Audit semantics: measureTextUnits(full textContent) * outer font-size.
    const combined = hero.textContent ?? ""
    expect(measureTextUnits(combined) * outerFontSize).toBeLessThanOrEqual(1120 + 1) // rect.w in renderBig
    expect(unitTspan.textContent).toMatch(/…$/)
  })

  it("falls back to normal stacking when there is no kpi component", () => {
    const { container } = renderBig([{ type: "paragraph", text: "无指标的页。" }])
    // no giant number; paragraph rendered normally
    const big = Array.from(container.querySelectorAll("text")).some(
      (t) => parseFloat(t.getAttribute("font-size") ?? "0") >= 120,
    )
    expect(big).toBe(false)
    expect(container.textContent).toContain("无指标的页")
  })
})
