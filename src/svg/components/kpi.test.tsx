// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { kpi, rowValueFontSize, splitKpiValueWidths } from "./kpi"
import { measureTextUnits } from "../../lib/svg-text-layout"
import type { ComponentCtx } from "./types"
import { CANONICAL_THEME_IDS, resolveStyle } from "../../themes"
import { buildCtx } from "../full-slide-svg"
import { accessibleInk } from "../ink"
import { resolveComponentForm } from "./form-assignments"
import { donutArcPath } from "./forms/donut-trio"
import { parseKpiRatio } from "./forms/kpi-value"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E", "#00A878"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const component = {
  type: "kpi_cards" as const,
  items: [
    { value: "128", unit: "台", label: "设备总数", delta: "up" as const },
    { value: "99.7%", label: "在线率", delta: "down" as const },
    { value: "3", label: "告警数", delta: "flat" as const },
  ],
}

describe("kpi component", () => {
  it("renders 3 card rects with fill=ctx.colors.surface", () => {
    const { container } = svg(
      kpi.render(component, { x: 80, y: 200, w: 1120 }, ctx),
    )
    const rects = container.querySelectorAll("rect")
    expect(rects).toHaveLength(3)
    rects.forEach((r) => {
      expect(r.getAttribute("fill")).toBe(ctx.colors.surface)
    })
  })

  it("renders value text with fill=ctx.colors.text and fontWeight=bold", () => {
    const { container } = svg(
      kpi.render(component, { x: 80, y: 200, w: 1120 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    // value texts are at y=58 positions
    const valueTexts = Array.from(texts).filter(
      (t) => t.getAttribute("y") === "58",
    )
    expect(valueTexts).toHaveLength(3)
    valueTexts.forEach((t) => {
      expect(t.getAttribute("fill")).toBe(ctx.colors.text)
      expect(t.getAttribute("font-weight")).toBe("bold")
    })
  })

  it('renders delta="up" arrow with accessibleInk-guarded fill', () => {
    // Bench-driven fix round, defect B: `deltaProps`'s hardcoded #16A34A
    // green measures 3.00:1 against this suite's own synthetic
    // `colors.surface` (#F4F4F4) — under the 20px arrow's 4.5:1 body floor
    // (real math, not assumed: contrastRatio("#16A34A", "#F4F4F4") =
    // 2.9964..., verified with `pnpm exec tsx`). `accessibleInk` falls back
    // to `readableOn`'s neutral dark ink here — this was a real,
    // reproducible instance of the same defect the fix addresses, not a
    // synthetic-fixture-only quirk (see full-matrix-contrast.test.ts's
    // "defect B real contrast fixes" 13-real-theme sweep for the rest).
    const { container } = svg(
      kpi.render(component, { x: 80, y: 200, w: 1120 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    // delta texts are at y=36 positions
    const deltaTexts = Array.from(texts).filter(
      (t) => t.getAttribute("y") === "36",
    )
    // First item has delta="up"
    const upArrow = deltaTexts[0]
    expect(upArrow.textContent).toBe("↑")
    expect(upArrow.getAttribute("fill")).toBe("#0A0E14")
  })

  it("measure returns 120", () => {
    expect(kpi.measure(component, 1120, ctx)).toBe(120)
  })

  it("shrinks an overlong value to fit inside its card", () => {
    const wideComponent = {
      type: "kpi_cards" as const,
      items: [{ value: "1,234,567,890.99", unit: "件", label: "短标签" }],
    }
    const { container } = svg(
      kpi.render(wideComponent, { x: 0, y: 0, w: 300 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    const valueText = Array.from(texts).find(
      (t) => t.getAttribute("y") === "58",
    )!
    expect(Number(valueText.getAttribute("font-size"))).toBeLessThan(40)
  })

  it("truncates an overlong label with an ellipsis when it can't fit at the minimum font size", () => {
    const longLabelComponent = {
      type: "kpi_cards" as const,
      items: [
        {
          value: "1",
          label:
            "非常非常非常非常非常非常非常非常非常非常长的指标标签文字说明超长内容",
        },
      ],
    }
    const { container } = svg(
      kpi.render(longLabelComponent, { x: 0, y: 0, w: 300 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    const labelText = Array.from(texts).find(
      (t) => t.getAttribute("y") === "96",
    )!
    expect(labelText.textContent).toMatch(/…$/)
  })

  it("scales the unit tspan font-size proportionally to the fitted value font-size", () => {
    const wideComponent = {
      type: "kpi_cards" as const,
      items: [{ value: "1,234,567,890.99", unit: "件", label: "短标签" }],
    }
    const { container } = svg(
      kpi.render(wideComponent, { x: 0, y: 0, w: 300 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    const valueText = Array.from(texts).find(
      (t) => t.getAttribute("y") === "58",
    )!
    const valueFontSize = Number(valueText.getAttribute("font-size"))
    const unitTspan = valueText.querySelector("tspan")!
    expect(Number(unitTspan.getAttribute("font-size"))).toBe(
      Math.round(valueFontSize * 0.45),
    )
  })

  it("truncates a pathologically long unit so it cannot overflow the card", () => {
    const longUnitComponent = {
      type: "kpi_cards" as const,
      items: [
        {
          value: "9",
          unit:
            "非常非常非常非常非常非常非常非常非常非常长的单位文字说明超长内容单位",
          label: "短标签",
        },
      ],
    }
    const { container } = svg(
      kpi.render(longUnitComponent, { x: 0, y: 0, w: 300 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    const valueText = Array.from(texts).find(
      (t) => t.getAttribute("y") === "58",
    )!
    const unitTspan = valueText.querySelector("tspan")!
    expect(unitTspan.textContent).toMatch(/…$/)
    expect(unitTspan.textContent!.length).toBeLessThan(
      longUnitComponent.items[0].unit.length,
    )
  })
})

describe("kpi semantic color tokens", () => {
  /** Delta arrows render at y=36, one per card, in item order: up, down, flat. */
  function deltaFills(themeCtx: ComponentCtx) {
    const { container } = svg(kpi.render(component, { x: 80, y: 200, w: 1120 }, themeCtx))
    return Array.from(container.querySelectorAll("text"))
      .filter((t) => t.getAttribute("y") === "36")
      .map((t) => t.getAttribute("fill"))
  }

  it("follows colors.success / colors.danger for the up and down arrows", () => {
    // Both tokens clear the 20px arrow's 4.5:1 floor against this suite's
    // `colors.surface` (#F4F4F4) — 10.13:1 and 7.29:1, measured — so
    // `accessibleInk` keeps them verbatim and the assertion reads the token
    // itself rather than a fallback ink.
    const themed: ComponentCtx = {
      ...ctx,
      colors: { ...ctx.colors, danger: "#7A0B12", success: "#0B5D2E" },
    }
    const [up, down, flat] = deltaFills(themed)
    expect(up).toBe("#0B5D2E")
    expect(down).toBe("#7A0B12")
    // "flat" carries no semantic meaning to color, so it stays on muted.
    expect(flat).toBe(ctx.colors.muted)
  })

  it("still hands the token to accessibleInk, which overrides one that fails on this surface", () => {
    // A token is a theme's preference, not a license to render illegibly:
    // #34D399 measures 1.83:1 against #F4F4F4, so the guard still fires.
    const themed: ComponentCtx = { ...ctx, colors: { ...ctx.colors, success: "#34D399" } }
    expect(deltaFills(themed)[0]).toBe("#0A0E14")
  })

  it("regression lock: every canonical theme paints its own semantic hexes, and none of them is demoted", () => {
    // Visual review round 4 turned this lock around. It used to spell out
    // the legacy `#16A34A`/`#DC2626` and assert no theme had moved off them;
    // all 17 now name their own, so it asserts the arrows carry the theme's
    // token *undemoted* — every value is calibrated to clear 4.5:1 on its own
    // card surface, which `full-matrix-contrast.test.ts` pins independently.
    // A theme that lands a too-dim green here fails loudly instead of
    // silently rendering neutral ink, and any drift needs a deliberate
    // re-capture of the `migrate-equivalence` goldens (they cover kpi_cards).
    for (const id of CANONICAL_THEME_IDS) {
      if (resolveComponentForm("kpi_cards", id)) continue
      const themeCtx = buildCtx(resolveStyle(id), {})
      const { success, danger, muted, surface } = themeCtx.colors
      expect(success, `${id} declares no success color`).toBeTruthy()
      expect(danger, `${id} declares no danger color`).toBeTruthy()
      expect(deltaFills(themeCtx), id).toEqual([success, danger, muted])
      expect(accessibleInk(success!, surface, 20), `${id} success demoted`).toBe(success)
      expect(accessibleInk(danger!, surface, 20), `${id} danger demoted`).toBe(danger)
    }
  })
})

describe("kpi card stroke (Task 5d)", () => {
  it("does not draw a stroke when ctx.colors.cardStroke is unset (every theme before this task)", () => {
    const { container } = svg(kpi.render(component, { x: 0, y: 0, w: 1120 }, ctx))
    const rects = container.querySelectorAll("rect")
    rects.forEach((r) => expect(r.getAttribute("stroke")).toBeNull())
  })

  it("draws a 1px stroke in cardStroke's color when the token is set", () => {
    const strokedCtx: ComponentCtx = {
      ...ctx,
      colors: { ...ctx.colors, cardStroke: "#ABCDEF" },
    }
    const { container } = svg(kpi.render(component, { x: 0, y: 0, w: 1120 }, strokedCtx))
    const rects = container.querySelectorAll("rect")
    expect(rects.length).toBeGreaterThan(0)
    rects.forEach((r) => {
      expect(r.getAttribute("stroke")).toBe("#ABCDEF")
      expect(r.getAttribute("stroke-width")).toBe("1")
    })
  })

  it("regression lock: only enterprise/runway's real tokens set cardStroke — the other canonical themes stay stroke-free", () => {
    for (const id of CANONICAL_THEME_IDS) {
      if (resolveComponentForm("kpi_cards", id)) continue
      const themeCtx = buildCtx(resolveStyle(id), {})
      const { container } = svg(kpi.render(component, { x: 0, y: 0, w: 1120 }, themeCtx))
      const rect = container.querySelector("rect")!
      if (id === "enterprise" || id === "runway") {
        expect(rect.getAttribute("stroke")).toBe(themeCtx.colors.cardStroke)
      } else {
        expect(rect.getAttribute("stroke")).toBeNull()
      }
    }
  })
})

describe("kpi icon", () => {
  it("renders the catalogued icon and lowers the value baseline", () => {
    const markup = renderToStaticMarkup(
      <svg>
        {kpi.render(
          { type: "kpi_cards", items: [{ value: "99.9", unit: "%", label: "可用率", icon: "server" }] },
          { x: 0, y: 0, w: 400 },
          ctx,
        )}
      </svg>,
    )
    expect(markup).toContain("scale(0.75)")
    expect(/<text[^>]*y="64"/.test(markup)).toBe(true)
  })

  it("keeps legacy layout when no icon is set", () => {
    const markup = renderToStaticMarkup(
      <svg>
        {kpi.render(
          { type: "kpi_cards", items: [{ value: "8", label: "无图标" }] },
          { x: 0, y: 0, w: 400 },
          ctx,
        )}
      </svg>,
    )
    expect(markup).not.toContain("scale(")
    expect(/<text[^>]*y="58"/.test(markup)).toBe(true)
  })
})

describe("kpi 冗余单位去重（2026-07-10 无图矩阵真机病型：value 已含 unit 时拼成 '35%%'）", () => {
  it("value 以 unit 结尾时丢弃 unit，不再双渲", () => {
    const dupComponent = {
      type: "kpi_cards" as const,
      items: [{ value: "35%", unit: "%", label: "转化率" }],
    }
    const { container } = svg(kpi.render(dupComponent, { x: 80, y: 200, w: 1120 }, ctx))
    expect(container.textContent).toContain("35%")
    expect(container.textContent).not.toContain("35%%")
  })

  it("value 不含 unit 时照常渲染单位", () => {
    const okComponent = {
      type: "kpi_cards" as const,
      items: [{ value: "128", unit: "台", label: "设备总数" }],
    }
    const { container } = svg(kpi.render(okComponent, { x: 80, y: 200, w: 1120 }, ctx))
    expect(container.textContent).toContain("128")
    expect(container.textContent).toContain("台")
  })
})

// P0 hardening (robustness deep-review D1's horizontal-axis sibling, review
// round 2): `items` has no schema ceiling (unlike icon_cards/row_cards,
// which cap at 6). Pre-fix, `cardW = (box.w - GAP*(n-1)) / n` had no floor
// — past a realistic item count, `cardW` goes negative, and the delta
// arrow's `<text textAnchor="end" x={cardX+cardW-20}>` (not the card's own
// `<rect>`, which `rect.ts`'s `floorAxis` already protects) turns into a
// genuinely negative-width text shape that `package-audit` rejects. Full
// generatePptx-level red-first coverage of the reviewer's exact repro (50
// items with delta) lives in `src/pptx/depth-axis-hardening.test.ts`; this
// pins the component-level cap/marker/containment behavior in isolation.
describe("kpi_cards box.w-aware horizontal cap (graceful landing)", () => {
  const manyItems = Array.from({ length: 50 }, (_, i) => ({
    value: String(i),
    label: `metric ${i}`,
    delta: "up" as const,
  }))
  const manyComponent = { type: "kpi_cards" as const, items: manyItems }

  it("caps rendered cards to what box.w can hold at a sane minimum width, marks the drop with data-dropped, and keeps every card and the marker within box.w", () => {
    const box = { x: 0, y: 0, w: 1088 }
    const { container } = svg(kpi.render(manyComponent, box, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    expect(rects.length).toBeGreaterThan(0)
    expect(rects.length).toBeLessThan(manyItems.length)

    // Every rendered card's rect stays within box.w, and no card is
    // negative-width (the reviewer's exact crash class).
    for (const rect of rects) {
      const x = Number(rect.getAttribute("x"))
      const w = Number(rect.getAttribute("width"))
      expect(w).toBeGreaterThan(0)
      expect(x + w).toBeLessThanOrEqual(box.w)
    }

    // Every rendered <text> (value/delta/label — the delta arrow is the
    // reviewer's exact crash site) stays within box.w too, marker
    // included — a marker-excluding containment check is exactly what let
    // bullets.tsx's own marker overflow slip through review earlier this
    // task.
    for (const t of Array.from(container.querySelectorAll("text"))) {
      const x = Number(t.getAttribute("x"))
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(box.w)
    }

    const dropped = container.querySelector("[data-dropped]")
    expect(dropped).toBeTruthy()
    const hiddenCount = Number(dropped!.getAttribute("data-dropped"))
    expect(hiddenCount).toBeGreaterThan(0)
    expect(hiddenCount + rects.length).toBe(manyItems.length)
    expect(dropped!.textContent).toBe(`+${hiddenCount} …`)
  })

  it("still renders at least one card even when box.w is far smaller than a single card's minimum width", () => {
    const box = { x: 0, y: 0, w: 20 }
    const { container } = svg(kpi.render(manyComponent, box, ctx))
    expect(container.querySelectorAll("rect").length).toBeGreaterThanOrEqual(1)
  })

  it("is a byte-identical no-op for an item count that already fits box.w at a healthy width (the ordinary/common render path)", () => {
    const smallComponent = { type: "kpi_cards" as const, items: manyItems.slice(0, 3) }
    const withoutMarker = renderToStaticMarkup(
      <svg>{kpi.render(smallComponent, { x: 0, y: 0, w: 1120 }, ctx)}</svg>,
    )
    expect(withoutMarker).not.toContain("data-dropped")
    expect((withoutMarker.match(/<rect/g) ?? []).length).toBe(3)
  })

  it("never shows a data-dropped marker when the full set already clears MIN_CARD_W", () => {
    const { container } = svg(kpi.render(manyComponent, { x: 0, y: 0, w: 100000 }, ctx))
    expect(container.querySelector("[data-dropped]")).toBeNull()
    expect(container.querySelectorAll("rect").length).toBe(manyItems.length)
  })
})

// Review round 3, D-cluster 5a ("the number itself got eaten"): the width
// split between a KPI's value and its unit used to hand each of them a share
// of the card proportional to its own character count, so `value="5"` /
// `unit="weeks"` gave the number 13px and the suffix 70px — and the card
// rendered "…weeks", with no number on it at all. The reviewer saw it on the
// gallery's own `layout--two-column--en` page, on two of its four cards.
describe("kpi value/unit width split puts the number first", () => {
  /** One card alone in a `cardW`-wide box — the row never degrades at n=1. */
  function oneCard(item: { value: string; unit?: string; label: string }, cardW: number) {
    const { container } = svg(
      kpi.render({ type: "kpi_cards", items: [item] }, { x: 0, y: 0, w: cardW }, ctx),
    )
    const valueText = Array.from(container.querySelectorAll("text")).find(
      (t) => t.getAttribute("y") === "58",
    )!
    const tspan = valueText.querySelector("tspan")
    return {
      container,
      valueText,
      // The value's own characters, without the unit tspan's.
      value: Array.from(valueText.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join(""),
      valueFontSize: Number(valueText.getAttribute("font-size")),
      valueTruncated: valueText.getAttribute("data-truncated") === "1",
      unit: tspan ? tspan.textContent : null,
    }
  }

  it("keeps the whole number and abbreviates a long unit instead of the other way round", () => {
    // Pre-fix this rendered an empty value element next to a 24-character
    // unit: the proportional split gave the number 4px of a 260px line,
    // because the unit had 33 characters to the number's one.
    const card = oneCard(
      {
        value: "9",
        unit: "非常非常非常非常非常非常非常非常非常非常长的单位文字说明超长内容单位",
        label: "短标签",
      },
      300,
    )
    expect(card.value).toBe("9")
    expect(card.valueTruncated).toBe(false)
    expect(card.valueFontSize).toBe(40)
    expect(card.unit).toMatch(/…$/)
    expect(card.unit!.length).toBeLessThan(10)
  })

  it("lets the unit step aside entirely rather than let the number lose a digit", () => {
    // The reviewer's own case, at the reviewer's own geometry: the gallery's
    // two-column right rail drew four cards 123px wide, i.e. an 83px text
    // line. Pre-fix: "…" for the number, and a full "weeks" beside it.
    const card = oneCard({ value: "5", unit: "weeks", label: "Average delivery time" }, 123)
    expect(card.value).toBe("5")
    expect(card.valueTruncated).toBe(false)
    expect(card.unit).toBeNull()
  })

  it("never leaves a bare ellipsis where the unit was — it reads as part of the number", () => {
    const card = oneCard({ value: "5", unit: "weeks", label: "Average delivery time" }, 84)
    expect(card.value).toBe("5")
    expect(card.unit).toBeNull()
  })

  it("cuts the number itself only as a last resort, and cuts it from the small end", () => {
    // A 16-character figure in a 140px card cannot be rendered whole at any
    // legible size, so this is the one case where the number does lose
    // characters — at its floor size, from the tail, so the digits that
    // carry the magnitude survive. The unit is long gone by then.
    const card = oneCard({ value: "1,234,567,890.99", unit: "元", label: "短标签" }, 140)
    expect(card.value).toBe("1,234,…")
    expect(card.valueFontSize).toBe(22)
    expect(card.unit).toBeNull()
  })

  it("leaves a card with room for both exactly where it was", () => {
    // The common path: a full-width row of four, every value and every unit
    // spelled out in full. Nothing is dropped, nothing is truncated, and
    // every character survives — which is what the value-first change was
    // about.
    //
    // The four sizes were "39, 40, 40, 40" until review round 4's
    // row-uniform rule: "102k units" needs 39 in this width and the row now
    // follows its tightest card rather than letting one number sit a point
    // smaller than its neighbours (see "kpi row-uniform value size").
    const { container } = svg(
      kpi.render({ type: "kpi_cards", items: METRICS }, { x: 0, y: 0, w: 1088 }, ctx),
    )
    expect(container.querySelector("[data-dropped]")).toBeNull()
    expect(container.querySelector("[data-truncated]")).toBeNull()
    const valueTexts = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("y") === "58",
    )
    expect(valueTexts.map((t) => t.getAttribute("font-size"))).toEqual(["39", "39", "39", "39"])
    expect(valueTexts.map((t) => t.textContent)).toEqual(["102kunits", "91%", "88%", "5weeks"])
  })

  it("hands back the same width split as before wherever the value already fits", () => {
    // Stated as the pre-change formula rather than as literal pixels, so the
    // pin survives a text-metric recalibration but not a change of policy:
    // as long as the value's share is large enough to render it, the split
    // is the one this component always used.
    for (const [value, unit, availableWidth] of [
      ["102k", "units", 220],
      ["91", "%", 220],
      ["5", "weeks", 220],
      ["1,234,567,890.99", "件", 260],
      ["24%", "pts", 500],
    ] as const) {
      const valueUnits = measureTextUnits(value)
      const unitUnits = measureTextUnits(unit)
      const valueMaxWidth = Math.floor((availableWidth * valueUnits) / (valueUnits + unitUnits))
      expect(splitKpiValueWidths(value, unit, availableWidth), `${value} ${unit}`).toEqual({
        valueMaxWidth,
        unitMaxWidth: availableWidth - valueMaxWidth,
      })
    }
  })
})

const METRICS = [
  { value: "102k", unit: "units", label: "Connected equipment" },
  { value: "91", unit: "%", label: "Renewal rate" },
  { value: "88", unit: "%", label: "Prediction accuracy" },
  { value: "5", unit: "weeks", label: "Average delivery time" },
]

describe("kpi readability floor", () => {
  it("degrades a column too narrow to read into fewer, readable cards plus a marker", () => {
    // The gallery's two-column right rail: 528px for four cards is 123px
    // each, which clears the old 80px anti-crash floor and so degraded
    // nothing — it just drew four cards nobody could read.
    const { container } = svg(
      kpi.render({ type: "kpi_cards", items: METRICS }, { x: 0, y: 0, w: 528 }, ctx),
    )
    const rects = Array.from(container.querySelectorAll("rect"))
    expect(rects.length).toBe(2)
    for (const r of rects) expect(Number(r.getAttribute("width"))).toBeGreaterThanOrEqual(160)
    expect(container.querySelector("[data-dropped]")!.getAttribute("data-dropped")).toBe("2")
  })

  it("does not degrade a row whose cards already clear the floor", () => {
    const { container } = svg(
      kpi.render({ type: "kpi_cards", items: METRICS }, { x: 0, y: 0, w: 1088 }, ctx),
    )
    expect(container.querySelectorAll("rect").length).toBe(4)
    expect(container.querySelector("[data-dropped]")).toBeNull()
  })

  it("still draws one card when the box cannot hold even a single readable one", () => {
    const { container } = svg(
      kpi.render({ type: "kpi_cards", items: METRICS }, { x: 0, y: 0, w: 120 }, ctx),
    )
    expect(container.querySelectorAll("rect").length).toBe(1)
  })
})

// Review round 4, J's re-check finding 3: the gallery's own
// `layout--two-column--en` drew "102k" at 29px next to "91" at 40px. Each
// card was fitting its own number in isolation, so the card whose unit ate
// the most width shrank alone and the row read as two different type
// scales side by side. A row of KPI cards is one comparison, and a
// comparison whose figures are set at different sizes says the big one
// matters more.
describe("kpi row-uniform value size", () => {
  /** Every rendered value's font-size, left to right. */
  function valueSizes(component: Parameters<typeof kpi.render>[0], w: number): number[] {
    const { container } = svg(kpi.render(component, { x: 0, y: 0, w }, ctx))
    return Array.from(container.querySelectorAll("text[font-weight='bold']")).map((t) =>
      Number(t.getAttribute("font-size")),
    )
  }

  it("sets every value in one row at the same size", () => {
    // The reviewer's own page: a 528px rail, which degrades to the two
    // leading cards — "102k units" and "91 %".
    const sizes = valueSizes({ type: "kpi_cards", items: METRICS }, 528)
    expect(sizes).toHaveLength(2)
    expect(new Set(sizes).size).toBe(1)
  })

  it("takes the smallest size the row can all state its number at, not the largest", () => {
    const sizes = valueSizes({ type: "kpi_cards", items: METRICS }, 528)
    // Whatever the tightest card needs is what the row gets: rendering the
    // row at the roomiest card's size would push the tight one into
    // truncation, which loses a digit rather than a few points of type.
    const alone = valueSizes({ type: "kpi_cards", items: [METRICS[0]!] }, (528 - 90 - 16 - 16) / 2)
    expect(alone[0]).toBeLessThan(40)
    expect(sizes).toEqual([alone[0], alone[0]])
  })

  it("leaves a row whose cards all fit at the design size exactly where it was", () => {
    const sizes = valueSizes(
      { type: "kpi_cards", items: [{ value: "13", label: "a" }, { value: "28", label: "b" }] },
      1120,
    )
    expect(sizes).toEqual([40, 40])
  })

  it("scales every unit tspan off the shared size, so the suffixes match too", () => {
    const { container } = svg(kpi.render({ type: "kpi_cards", items: METRICS }, { x: 0, y: 0, w: 528 }, ctx))
    const values = Array.from(container.querySelectorAll("text[font-weight='bold']"))
    const unitSizes = values.map((t) => Number(t.querySelector("tspan")!.getAttribute("font-size")))
    expect(new Set(unitSizes).size).toBe(1)
    expect(unitSizes[0]).toBe(Math.round(Number(values[0]!.getAttribute("font-size")) * 0.45))
  })

  it("rowValueFontSize is decided by the row's own content and geometry alone", () => {
    const scale = { fontSize: 40, minFontSize: 22, unitRatio: 0.45 }
    const items = METRICS.slice(0, 2)
    expect(rowValueFontSize(items, 162, scale)).toBe(rowValueFontSize(items, 162, scale))
    // A wider card lets the tight number back up to the design size.
    expect(rowValueFontSize(items, 1000, scale)).toBe(40)
    expect(rowValueFontSize(items, 162, scale)).toBeLessThan(40)
    // Never below the scale's own floor — that is `fitSvgLine`'s job, not
    // this function's.
    expect(rowValueFontSize(items, 10, scale)).toBe(22)
  })
})

function themeCtx(id: string): ComponentCtx {
  return buildCtx(resolveStyle(id), {})
}

function parseArcEnd(d: string): { ex: number; ey: number; large: number } {
  const m = /A\s+[\d.]+\s+[\d.]+\s+0\s+(\d)\s+1\s+([\d.-]+)\s+([\d.-]+)/.exec(d)
  if (!m) throw new Error(`not an arc path: ${d}`)
  return { large: Number(m[1]), ex: Number(m[2]), ey: Number(m[3]) }
}

function assertInsideBox(container: HTMLElement, w: number, h: number, slop = 2) {
  for (const c of Array.from(container.querySelectorAll("circle"))) {
    const cx = Number(c.getAttribute("cx"))
    const cy = Number(c.getAttribute("cy"))
    const r = Number(c.getAttribute("r"))
    expect(cx - r).toBeGreaterThanOrEqual(-slop)
    expect(cx + r).toBeLessThanOrEqual(w + slop)
    expect(cy - r).toBeGreaterThanOrEqual(-slop)
    expect(cy + r).toBeLessThanOrEqual(h + slop)
  }
}

const RATES = {
  type: "kpi_cards" as const,
  items: [
    { value: "86%", label: "预测命中率", source: "提前 48 小时以上" },
    { value: "72%", label: "工单闭环率" },
    { value: "29%", label: "误报占比" },
  ],
}

describe("parseKpiRatio", () => {
  it("reads percents, unit %, 0..1, 1..100, and refuses counts above 100", () => {
    expect(parseKpiRatio("86%")).toBeCloseTo(0.86)
    expect(parseKpiRatio("72", "%")).toBeCloseTo(0.72)
    expect(parseKpiRatio("0.5")).toBe(0.5)
    expect(parseKpiRatio("50")).toBe(0.5)
    expect(parseKpiRatio("99.7%")).toBeCloseTo(0.997)
    expect(parseKpiRatio("1,234")).toBeNull()
    expect(parseKpiRatio("128", "台")).toBeNull()
  })
})

describe("donut_trio", () => {
  it("locks the 86/72/29 arc endpoints within 0.6px of the 12-o'clock clockwise formula", () => {
    const r = 95
    const d86 = donutArcPath(280, 330, r, 0.86)
    const d72 = donutArcPath(640, 330, r, 0.72)
    const d29 = donutArcPath(1000, 330, r, 0.29)
    const a86 = parseArcEnd(d86)
    const a72 = parseArcEnd(d72)
    const a29 = parseArcEnd(d29)
    expect(Math.abs(a86.ex - 206.8)).toBeLessThanOrEqual(0.6)
    expect(Math.abs(a86.ey - 269.4)).toBeLessThanOrEqual(0.6)
    expect(a86.large).toBe(1)
    expect(Math.abs(a72.ex - 546.7)).toBeLessThanOrEqual(0.6)
    expect(Math.abs(a72.ey - 347.8)).toBeLessThanOrEqual(0.6)
    expect(a72.large).toBe(1)
    expect(Math.abs(a29.ex - 1092.0)).toBeLessThanOrEqual(0.6)
    expect(Math.abs(a29.ey - 353.6)).toBeLessThanOrEqual(0.6)
    expect(a29.large).toBe(0)
    expect(donutArcPath(0, 0, 10, 0)).toBe("")
  })

  it("luxe: one track circle and one A path per item, arc in the accent token", () => {
    const luxe = themeCtx("luxe")
    const { container } = svg(kpi.render(RATES, { x: 0, y: 0, w: 1120 }, luxe))
    expect(container.querySelectorAll("circle")).toHaveLength(3)
    const arcs = Array.from(container.querySelectorAll("path")).filter((p) =>
      (p.getAttribute("d") ?? "").includes("A"),
    )
    expect(arcs).toHaveLength(3)
    arcs.forEach((p) => {
      expect(p.getAttribute("stroke")).toBe(luxe.colors.accent)
      expect(p.getAttribute("fill")).toBe("none")
    })
    expect(container.textContent).toContain("86")
    expect(container.textContent).toContain("预测命中率")
    expect(container.textContent).toContain("提前 48 小时以上")
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{kpi.render(RATES, { x: 0, y: 0, w: 1120 }, luxe)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })

  it("swiss dangerOnMin paints the smallest parsed ratio in colors.danger", () => {
    const swiss = themeCtx("swiss")
    const { container } = svg(kpi.render(RATES, { x: 0, y: 0, w: 1120 }, swiss))
    const arcs = Array.from(container.querySelectorAll("path")).filter((p) =>
      (p.getAttribute("d") ?? "").includes("A"),
    )
    const danger = swiss.colors.danger
    const hot = arcs.filter((p) => p.getAttribute("stroke") === danger)
    expect(hot).toHaveLength(1)
    const end = parseArcEnd(hot[0]!.getAttribute("d")!)
    expect(end.large).toBe(0)
  })

  it("does not invent an icon when IR has none, and omits the arc for a count above 100", () => {
    const luxe = themeCtx("luxe")
    const counts = {
      type: "kpi_cards" as const,
      items: [{ value: "128", unit: "台", label: "设备总数" }],
    }
    const markup = renderToStaticMarkup(<svg>{kpi.render(counts, { x: 0, y: 0, w: 400 }, luxe)}</svg>)
    expect(markup).not.toContain("scale(")
    expect((markup.match(/<path /g) ?? []).length).toBe(0)
    expect(markup).toContain("128")
  })

  it("n=2 and n=8 stay inside the box", () => {
    const luxe = themeCtx("luxe")
    for (const n of [2, 8]) {
      const component = {
        type: "kpi_cards" as const,
        items: Array.from({ length: n }, (_, i) => ({
          value: `${80 - i * 7}%`,
          label: `指标${i + 1}`,
        })),
      }
      const w = 1088
      const h = kpi.measure(component, w, luxe)
      const { container } = svg(kpi.render(component, { x: 0, y: 0, w, h }, luxe))
      assertInsideBox(container, w, h)
    }
  })
})

describe("bubble_row", () => {
  const bubbles = {
    type: "kpi_cards" as const,
    items: [
      { value: "41%", label: "四号线" },
      { value: "92%", label: "三号线", source: "全点位接入" },
      { value: "68%", label: "二号线" },
      { value: "74%", label: "一号线" },
      { value: "35%", label: "五号线" },
    ],
  }

  it("insight: champion is the largest circle at center, 2nd left, 3rd right, no baseline", () => {
    const insight = themeCtx("insight")
    const w = 1120
    const { container } = svg(kpi.render(bubbles, { x: 0, y: 0, w }, insight))
    const circles = Array.from(container.querySelectorAll("circle")).sort(
      (a, b) => Number(b.getAttribute("r")) - Number(a.getAttribute("r")),
    )
    expect(circles.length).toBe(5)
    const champ = circles[0]!
    expect(Number(champ.getAttribute("cx"))).toBeCloseTo(w / 2, 0)
    expect(champ.getAttribute("fill")).toBe(insight.colors.accent)
    expect(Number(circles[1]!.getAttribute("cx"))).toBeLessThan(Number(champ.getAttribute("cx")))
    expect(Number(circles[2]!.getAttribute("cx"))).toBeGreaterThan(Number(champ.getAttribute("cx")))
    expect(container.querySelectorAll("line")).toHaveLength(0)
    expect(container.textContent).toContain("92%")
    expect(container.textContent).toContain("全点位接入")
    expect(container.textContent).not.toContain("三号线是样板")
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{kpi.render(bubbles, { x: 0, y: 0, w }, insight)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })

  it("crayon paletteStroke uses chartPalette tokens, not a horizontal baseline", () => {
    const crayon = themeCtx("crayon")
    const { container } = svg(kpi.render(bubbles, { x: 0, y: 0, w: 1120 }, crayon))
    const circles = Array.from(container.querySelectorAll("circle"))
    const strokes = circles.map((c) => c.getAttribute("stroke")).filter((s): s is string => Boolean(s))
    expect(strokes.length).toBe(5)
    for (const s of strokes) {
      expect(crayon.colors.chartPalette).toContain(s)
    }
    expect(container.querySelectorAll("line")).toHaveLength(0)
  })

  it("unparseable values get the min radius and sit on the outside, stable on index", () => {
    const insight = themeCtx("insight")
    const mixed = {
      type: "kpi_cards" as const,
      items: [
        { value: "n/a", label: "甲" },
        { value: "40%", label: "乙" },
        { value: "n/a", label: "丙" },
      ],
    }
    const w = 900
    const { container } = svg(kpi.render(mixed, { x: 0, y: 0, w }, insight))
    const circles = Array.from(container.querySelectorAll("circle"))
    const byR = [...circles].sort((a, b) => Number(b.getAttribute("r")) - Number(a.getAttribute("r")))
    expect(Number(byR[0]!.getAttribute("r"))).toBeGreaterThan(Number(byR[1]!.getAttribute("r")))
    const cx0 = w / 2
    const outer = [...circles].sort(
      (a, b) =>
        Math.abs(Number(b.getAttribute("cx")) - cx0) - Math.abs(Number(a.getAttribute("cx")) - cx0),
    )
    expect(Number(outer[0]!.getAttribute("r"))).toBeLessThanOrEqual(Number(byR[0]!.getAttribute("r")))
  })

  it("n=2 and n=8 stay inside the box", () => {
    const insight = themeCtx("insight")
    for (const n of [2, 8]) {
      const component = {
        type: "kpi_cards" as const,
        items: Array.from({ length: n }, (_, i) => ({
          value: `${90 - i * 8}%`,
          label: `线${i + 1}`,
        })),
      }
      const w = 1088
      const h = kpi.measure(component, w, insight)
      const { container } = svg(kpi.render(component, { x: 0, y: 0, w, h }, insight))
      assertInsideBox(container, w, h)
    }
  })
})

describe("kpi_cards unassigned theme equals the default face", () => {
  it("consulting (unassigned) markup equals the same tokens with themeId omitted", () => {
    const consulting = themeCtx("consulting")
    const noId: ComponentCtx = { ...consulting, themeId: undefined }
    const box = { x: 80, y: 200, w: 1120 }
    expect(renderToStaticMarkup(<svg>{kpi.render(component, box, consulting)}</svg>)).toBe(
      renderToStaticMarkup(<svg>{kpi.render(component, box, noId)}</svg>),
    )
  })
})

