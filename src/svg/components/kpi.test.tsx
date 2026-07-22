// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { kpi } from "./kpi"
import type { ComponentCtx } from "./types"
import { CANONICAL_THEME_IDS, resolveStyle } from "../../themes"
import { buildCtx } from "../FullSlideSvg"

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
    expect(dropped!.textContent).toBe(`+${hiddenCount} more`)
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
