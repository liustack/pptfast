// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { kpi } from "./kpi"
import type { BlockCtx } from "./types"
import { CANONICAL_THEME_IDS, getTheme } from "../../themes"
import { buildCtx } from "../FullSlideSvg"

const ctx: BlockCtx = {
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
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const block = {
  type: "kpi_cards" as const,
  items: [
    { value: "128", unit: "台", label: "设备总数", delta: "up" as const },
    { value: "99.7%", label: "在线率", delta: "down" as const },
    { value: "3", label: "告警数", delta: "flat" as const },
  ],
}

describe("kpi block", () => {
  it("renders 3 card rects with fill=ctx.colors.surface", () => {
    const { container } = svg(
      kpi.render(block, { x: 80, y: 200, w: 1120 }, ctx),
    )
    const rects = container.querySelectorAll("rect")
    expect(rects).toHaveLength(3)
    rects.forEach((r) => {
      expect(r.getAttribute("fill")).toBe(ctx.colors.surface)
    })
  })

  it("renders value text with fill=ctx.colors.text and fontWeight=bold", () => {
    const { container } = svg(
      kpi.render(block, { x: 80, y: 200, w: 1120 }, ctx),
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

  it('renders delta="up" arrow with fill="#16A34A"', () => {
    const { container } = svg(
      kpi.render(block, { x: 80, y: 200, w: 1120 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    // delta texts are at y=36 positions
    const deltaTexts = Array.from(texts).filter(
      (t) => t.getAttribute("y") === "36",
    )
    // First item has delta="up"
    const upArrow = deltaTexts[0]
    expect(upArrow.textContent).toBe("↑")
    expect(upArrow.getAttribute("fill")).toBe("#16A34A")
  })

  it("measure returns 120", () => {
    expect(kpi.measure(block, 1120, ctx)).toBe(120)
  })

  it("shrinks an overlong value to fit inside its card", () => {
    const wideBlock = {
      type: "kpi_cards" as const,
      items: [{ value: "1,234,567,890.99", unit: "件", label: "短标签" }],
    }
    const { container } = svg(
      kpi.render(wideBlock, { x: 0, y: 0, w: 300 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    const valueText = Array.from(texts).find(
      (t) => t.getAttribute("y") === "58",
    )!
    expect(Number(valueText.getAttribute("font-size"))).toBeLessThan(40)
  })

  it("truncates an overlong label with an ellipsis when it can't fit at the minimum font size", () => {
    const longLabelBlock = {
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
      kpi.render(longLabelBlock, { x: 0, y: 0, w: 300 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    const labelText = Array.from(texts).find(
      (t) => t.getAttribute("y") === "96",
    )!
    expect(labelText.textContent).toMatch(/…$/)
  })

  it("scales the unit tspan font-size proportionally to the fitted value font-size", () => {
    const wideBlock = {
      type: "kpi_cards" as const,
      items: [{ value: "1,234,567,890.99", unit: "件", label: "短标签" }],
    }
    const { container } = svg(
      kpi.render(wideBlock, { x: 0, y: 0, w: 300 }, ctx),
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
    const longUnitBlock = {
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
      kpi.render(longUnitBlock, { x: 0, y: 0, w: 300 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    const valueText = Array.from(texts).find(
      (t) => t.getAttribute("y") === "58",
    )!
    const unitTspan = valueText.querySelector("tspan")!
    expect(unitTspan.textContent).toMatch(/…$/)
    expect(unitTspan.textContent!.length).toBeLessThan(
      longUnitBlock.items[0].unit.length,
    )
  })
})

describe("kpi card stroke (Task 5d)", () => {
  it("does not draw a stroke when ctx.colors.cardStroke is unset (every theme before this task)", () => {
    const { container } = svg(kpi.render(block, { x: 0, y: 0, w: 1120 }, ctx))
    const rects = container.querySelectorAll("rect")
    rects.forEach((r) => expect(r.getAttribute("stroke")).toBeNull())
  })

  it("draws a 1px stroke in cardStroke's color when the token is set", () => {
    const strokedCtx: BlockCtx = {
      ...ctx,
      colors: { ...ctx.colors, cardStroke: "#ABCDEF" },
    }
    const { container } = svg(kpi.render(block, { x: 0, y: 0, w: 1120 }, strokedCtx))
    const rects = container.querySelectorAll("rect")
    expect(rects.length).toBeGreaterThan(0)
    rects.forEach((r) => {
      expect(r.getAttribute("stroke")).toBe("#ABCDEF")
      expect(r.getAttribute("stroke-width")).toBe("1")
    })
  })

  it("regression lock: only enterprise/runway's real tokens set cardStroke — the other canonical themes stay stroke-free", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const themeCtx = buildCtx(getTheme(id), {})
      const { container } = svg(kpi.render(block, { x: 0, y: 0, w: 1120 }, themeCtx))
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
    const dupBlock = {
      type: "kpi_cards" as const,
      items: [{ value: "35%", unit: "%", label: "转化率" }],
    }
    const { container } = svg(kpi.render(dupBlock, { x: 80, y: 200, w: 1120 }, ctx))
    expect(container.textContent).toContain("35%")
    expect(container.textContent).not.toContain("35%%")
  })

  it("value 不含 unit 时照常渲染单位", () => {
    const okBlock = {
      type: "kpi_cards" as const,
      items: [{ value: "128", unit: "台", label: "设备总数" }],
    }
    const { container } = svg(kpi.render(okBlock, { x: 80, y: 200, w: 1120 }, ctx))
    expect(container.textContent).toContain("128")
    expect(container.textContent).toContain("台")
  })
})
