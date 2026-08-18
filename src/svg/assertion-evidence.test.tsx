// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { SvgContent } from "./svg-content"
import { measureComponent } from "./components"
import { auditSvgMarkup } from "./audit/svg-audit"
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

  it("keeps the support stack below evidence's real bottom edge when evidence's natural height exceeds its budget (regression round 1: device_mockup/image overlap)", () => {
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

    const markup = renderToStaticMarkup(
      <svg viewBox="0 0 1280 720">
        <SvgContent arrangement="assertion_evidence" components={components} rect={rect} ctx={ctx} />
      </svg>,
    )
    // Round 1 only proved evidence and support don't overlap *each other* —
    // it didn't check either one against the actual content rect, which is
    // exactly the blind spot that let round 1's own fix silently push
    // support (and its drop-pill) past the rect bottom, into the page
    // footer (reviewer-confirmed regression, round 2). `auditSvgMarkup` is
    // the same overflow walker `pptfast audit` runs in production — zero
    // findings here means nothing in this render, evidence or support,
    // exceeds the rect `SvgContent` declared for it via `data-audit-rect`.
    expect(auditSvgMarkup(markup)).toEqual([])
  })

  it("never lets the support stack (including its drop-pill) spill past the content rect — flagship 2-item recipe and a 5-item extreme squeeze, at quiet-frame's own real geometry (regression round 2: footer spill)", () => {
    // `.issues/2026-08-05-component-waves/device-mockup-report.md`'s own
    // repro geometry: `consulting` theme, `quiet-frame` layout, a content
    // rect of exactly this shape — computed once by hand from quiet-frame's
    // own constants (`content-quiet-frame.tsx`: FRAME_X=200, FRAME_W=880,
    // contentY=228 at this heading's line count, contentBottom=620) and
    // pinned here as a literal so this test doesn't silently drift if
    // quiet-frame's own geometry changes later. quiet-frame's own footer
    // chrome sits at y=664 (divider) / y=700 (text) — well below 620, so
    // *any* v-overflow finding against this rect is unambiguous evidence of
    // spill, not a "getting close" false alarm.
    const quietFrameRect = { x: 200, y: 271, w: 880, h: 349 }
    const evidence: Component = { type: "image", asset_id: "missing", fit: "contain" }
    // Flagship: the exact recipe from the report (device_mockup/image + 2
    // bullets) — round 1's fix already stopped the evidence/support overlap
    // here, but the reviewer's re-render showed the *support* content itself
    // (a single 2-line-wrapped bullet, since `supportRectH` had collapsed to
    // ~1px) spilling straight through the footer divider and into the
    // footer text.
    const flagshipSupport: Component = {
      type: "bullets",
      items: [
        "Live reassignment queue reroutes drivers automatically for maximum savings",
        "Dispatchers see ETA drift the moment it happens, not after a customer complains",
      ],
    }
    // Extreme: the 5-item squeeze from the round-1 regression test above,
    // replayed at quiet-frame's own (tighter) real geometry rather than this
    // file's own roomier synthetic `rect`.
    const extremeSupport: Component = {
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

    for (const support of [flagshipSupport, extremeSupport]) {
      // Sanity-check: this geometry must actually force evidence to overflow
      // its fair share at quiet-frame's real rect.h, or the test would pass
      // vacuously without ever exercising the fix.
      const evidenceH = measureComponent(evidence, quietFrameRect.w, ctx)
      expect(evidenceH).toBe(340)
      expect(evidenceH).toBeGreaterThan(quietFrameRect.h * 0.6) // > "fair share" even before subtracting any support budget

      const markup = renderToStaticMarkup(
        <svg viewBox="0 0 1280 720">
          <SvgContent
            arrangement="assertion_evidence"
            components={[evidence, support]}
            rect={quietFrameRect}
            ctx={ctx}
          />
        </svg>,
      )
      const issues = auditSvgMarkup(markup)
      expect(issues, JSON.stringify(issues)).toEqual([])
    }
  })
})
