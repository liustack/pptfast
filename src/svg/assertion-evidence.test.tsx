// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { SvgContent } from "./svg-content"
import { measureComponent } from "./components"
import type { ComponentCtx } from "./components/types"
import type { Component } from "@/ir"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFF",
    surface: "#EEE",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E", "#00A878"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

const rect = { x: 80, y: 200, w: 1120, h: 460 }

function renderAE(b: Component[]) {
  return render(
    <svg viewBox="0 0 1280 720">
      <SvgContent
        arrangement="assertion_evidence"
        components={b}
        rect={rect}
        ctx={ctx}
      />
    </svg>,
  )
}

describe("assertion_evidence variant", () => {
  it("renders a chart component as the enlarged evidence (rect/path shapes present)", () => {
    const components: Component[] = [
      { type: "paragraph", text: "补充说明文字。" },
      {
        type: "chart",
        chart_type: "bar",
        series: [{ name: "Q1", data: [{ x: "A", y: 10 }, { x: "B", y: 20 }] }],
      },
    ]
    const { container } = renderAE(components)
    // Chart renders rect elements (bars) — should be present
    const rects = container.querySelectorAll("rect")
    expect(rects.length).toBeGreaterThanOrEqual(1)
    // The chart evidence component should be vertically centred: its g transform
    // y-offset should be greater than rect.y (pushed down to centre).
    const groups = Array.from(container.querySelectorAll("g[transform]"))
    const chartGroup = groups.find((g) => {
      const t = g.getAttribute("transform") ?? ""
      return t.includes("translate")
    })
    expect(chartGroup).toBeTruthy()
    // Supporting paragraph text is still rendered
    expect(container.textContent).toContain("补充说明文字")
  })

  it("picks chart over image when both are present (priority order)", () => {
    const components: Component[] = [
      { type: "image", asset_id: "img1", fit: "contain" },
      {
        type: "chart",
        chart_type: "pie",
        series: [{ name: "S", data: [{ x: "X", y: 50 }, { x: "Y", y: 50 }] }],
      },
    ]
    const { container } = renderAE(components)
    // Chart renders paths (pie slices) — should be present
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBeGreaterThanOrEqual(1)
  })

  it("falls back to normal single-column rendering when no evidence component type exists", () => {
    const components: Component[] = [
      { type: "paragraph", text: "纯文字断言页。" },
      { type: "bullets", items: ["要点一", "要点二"], style: "default" },
    ]
    const { container } = renderAE(components)
    // paragraph + bullets rendered normally
    expect(container.textContent).toContain("纯文字断言页")
    expect(container.textContent).toContain("要点一")
    // bullet markers present
    expect(container.querySelectorAll("circle").length).toBe(2)
  })

  it("renders empty content gracefully when components array is empty", () => {
    const { container } = renderAE([])
    // No crash, no text content
    expect(container.querySelectorAll("text").length).toBe(0)
  })

  it("centres a single chart evidence component vertically in the rect", () => {
    const components: Component[] = [
      {
        type: "chart",
        chart_type: "bar",
        series: [{ name: "Q1", data: [{ x: "A", y: 30 }] }],
      },
    ]
    const { container } = renderAE(components)
    // Chart has CHART_H = 240. Rect h = 460. Expected centred y = 200 + (460-240)/2 = 310.
    const groups = Array.from(container.querySelectorAll("g[transform]"))
    const transforms = groups.map((g) => g.getAttribute("transform") ?? "")
    // At least one translate should have y > rect.y (centred, not top-aligned)
    const yValues = transforms
      .map((t) => {
        const m = t.match(/translate\(\s*[\d.]+\s*,\s*([\d.]+)\s*\)/)
        return m ? parseFloat(m[1]) : null
      })
      .filter((v): v is number => v !== null)
    // The chart should be placed around y=310 (centred)
    const centredY = rect.y + (rect.h - 240) / 2 // 310
    expect(yValues.some((y) => Math.abs(y - centredY) < 1)).toBe(true)
  })

  it("keeps the support stack below evidence's real bottom edge when evidence's natural height exceeds its budget (regression: device_mockup/image overlap)", () => {
    // A wide support stack (5 bullet items) drives the support budget past
    // its 40%-of-rect.h cap, squeezing evidence's own available height well
    // below `image`'s fixed MAX_IMAGE_H — reproduces the geometry
    // `.issues/2026-08-05-component-waves/device-mockup-report.md` recorded
    // (found there with device_mockup's own 340px cap; `image` shares the
    // same 340px MAX_IMAGE_H mechanism, so it reproduces identically without
    // needing an asset).
    const evidence: Component = { type: "image", asset_id: "missing", fit: "contain" }
    const support: Component = {
      type: "bullets",
      items: [
        "First supporting point long enough to need real vertical space on the page and wrap onto more than one line",
        "Second supporting point elaborating on reliability and measured outcomes in the field across many deployments",
        "Third supporting point about adoption timeline and rollout across regions and customer segments",
        "Fourth supporting point about validated cost savings and payback period across the fleet",
        "Fifth supporting point about the operations team's own daily workflow around this dashboard",
      ],
      style: "default",
    }
    const components = [evidence, support]

    // Sanity-check the fixture actually exercises the overflow path this
    // test targets, so a future unrelated change can't silently turn this
    // into a vacuous pass.
    const evidenceH = measureComponent(evidence, rect.w, ctx)
    const supportMeasuredH = measureComponent(support, rect.w, ctx)
    expect(evidenceH).toBe(340) // image.tsx's MAX_IMAGE_H
    expect(supportMeasuredH).toBeGreaterThan(rect.h * 0.4) // forces the support-budget cap

    const { container } = renderAE(components)
    const auditRect = container.querySelector("[data-audit-rect]")
    expect(auditRect).toBeTruthy()
    const [evidenceEl, supportEl] = Array.from(auditRect!.children)
    const translateY = (el: Element): number => {
      const t = el.getAttribute("transform") ?? ""
      const m = t.match(/translate\(\s*[\d.-]+\s*,\s*([\d.-]+)\s*\)/)
      if (!m) throw new Error(`element has no translate() transform: "${t}"`)
      return parseFloat(m[1])
    }
    const evidenceY = translateY(evidenceEl)
    const supportY = translateY(supportEl)

    // The support stack must start at or below evidence's true rendered
    // bottom edge — never inside it.
    expect(supportY).toBeGreaterThanOrEqual(evidenceY + evidenceH)
  })
})
