// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { callout } from "./callout"
import type { ComponentCtx } from "./types"
import { CANONICAL_THEME_IDS, resolveStyle } from "../../themes"
import { buildCtx } from "../full-slide-svg"
import { PACING_BUDGETS } from "@/narrative"

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
  bodyFontPx: PACING_BUDGETS.balanced.bodyBaselinePx, // 24 — ambient default for tests that don't exercise a specific tier
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

describe("callout component", () => {
  const component = { type: "callout" as const, variant: "info" as const, text: "提示信息文本内容" }

  it("measures a positive height", () => {
    const h = callout.measure(component, 1120, ctx)
    expect(h).toBeGreaterThan(0)
  })

  it("renders a background rect with surface fill", () => {
    const { container } = svg(
      callout.render(component, { x: 80, y: 100, w: 1120 }, ctx),
    )
    const rects = container.querySelectorAll("rect")
    const bgRect = rects[0]
    expect(bgRect.getAttribute("fill")).toBe("#F4F4F4")
    expect(bgRect.getAttribute("width")).toBe("1120")
    expect(bgRect.getAttribute("rx")).toBe("6")
  })

  it("renders a left bar rect with width=4 and warn variant uses #DC2626", () => {
    const warnComponent = { type: "callout" as const, variant: "warn" as const, text: "警告" }
    const { container } = svg(
      callout.render(warnComponent, { x: 0, y: 0, w: 800 }, ctx),
    )
    const rects = container.querySelectorAll("rect")
    const barRect = rects[1]
    expect(barRect.getAttribute("width")).toBe("4")
    expect(barRect.getAttribute("fill")).toBe("#DC2626")
  })

  it("renders text with ctx.colors.text fill", () => {
    const { container } = svg(
      callout.render(component, { x: 80, y: 100, w: 1120 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    expect(texts.length).toBeGreaterThanOrEqual(1)
    const first = texts[0]
    expect(first.getAttribute("fill")).toBe("#1A2421")
    expect(first.getAttribute("font-family")).toBe("Microsoft YaHei")
    expect(first.getAttribute("dominant-baseline")).toBe("alphabetic")
  })

  it("renders an icon (at least one <path>) in the callout", () => {
    const { container } = svg(
      callout.render(component, { x: 80, y: 100, w: 1120 }, ctx),
    )
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBeGreaterThanOrEqual(1)
  })

  it("renders icon stroke matching the accent color for each variant", () => {
    for (const [variant, expectedColor] of [
      ["info", "#006A4E"],
      ["warn", "#DC2626"],
      ["tip", "#00A878"],
    ] as const) {
      const b = { type: "callout" as const, variant, text: "测试" }
      const { container } = svg(
        callout.render(b, { x: 0, y: 0, w: 800 }, ctx),
      )
      const paths = container.querySelectorAll("path")
      expect(paths.length).toBeGreaterThanOrEqual(1)
      expect(paths[0].getAttribute("stroke")).toBe(expectedColor)
    }
  })
})

describe("callout card stroke (Task 5d)", () => {
  const component = { type: "callout" as const, variant: "info" as const, text: "提示信息文本内容" }

  it("does not draw a stroke when ctx.colors.cardStroke is unset (every theme before this task)", () => {
    const { container } = svg(callout.render(component, { x: 80, y: 100, w: 1120 }, ctx))
    const bgRect = container.querySelectorAll("rect")[0]
    expect(bgRect.getAttribute("stroke")).toBeNull()
  })

  it("draws a 1px stroke in cardStroke's color when the token is set", () => {
    const strokedCtx: ComponentCtx = {
      ...ctx,
      colors: { ...ctx.colors, cardStroke: "#ABCDEF" },
    }
    const { container } = svg(callout.render(component, { x: 80, y: 100, w: 1120 }, strokedCtx))
    const bgRect = container.querySelectorAll("rect")[0]
    expect(bgRect.getAttribute("stroke")).toBe("#ABCDEF")
    expect(bgRect.getAttribute("stroke-width")).toBe("1")
  })

  it("regression lock: only enterprise/runway's real tokens set cardStroke — the other canonical themes stay stroke-free", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const themeCtx = buildCtx(resolveStyle(id), {})
      const { container } = svg(callout.render(component, { x: 80, y: 100, w: 1120 }, themeCtx))
      const bgRect = container.querySelectorAll("rect")[0]
      if (id === "enterprise" || id === "runway") {
        expect(bgRect.getAttribute("stroke")).toBe(themeCtx.colors.cardStroke)
      } else {
        expect(bgRect.getAttribute("stroke")).toBeNull()
      }
    }
  })
})

describe("callout component emphasis", () => {
  it("renders unmarked text with no tspan wrapper", () => {
    const plain = { type: "callout" as const, variant: "info" as const, text: "没有强调标记的提示文本" }
    const { container } = svg(callout.render(plain, { x: 0, y: 0, w: 1120 }, ctx))
    const first = container.querySelector("text")
    expect(first?.querySelector("tspan")).toBeNull()
    expect(first?.textContent).toBe("没有强调标记的提示文本")
  })

  it("renders **emphasized** runs with the theme accent color, independent of variant bar color", () => {
    const marked = { type: "callout" as const, variant: "warn" as const, text: "注意 **关键信息** 请查看" }
    const { container } = svg(callout.render(marked, { x: 0, y: 0, w: 1120 }, ctx))
    const first = container.querySelector("text")
    const tspans = Array.from(first?.querySelectorAll("tspan") ?? [])
    const accentSpan = tspans.find((t) => t.textContent === "关键信息")
    // theme accent (#00A878), not the warn variant's bar/icon color (#DC2626)
    expect(accentSpan?.getAttribute("fill")).toBe("#00A878")
    expect(accentSpan?.getAttribute("font-weight")).toBe("600")
  })

  it("measures the same height with or without ** markers", () => {
    const plain = { type: "callout" as const, variant: "info" as const, text: "提示文本内容" }
    const marked = { type: "callout" as const, variant: "info" as const, text: "**提示**文本内容" }
    expect(callout.measure(marked, 1120, ctx)).toBe(callout.measure(plain, 1120, ctx))
  })
})

describe("callout icon override", () => {
  it("renders the explicit icon instead of the variant default", () => {
    const markup = renderToStaticMarkup(
      <svg>
        {callout.render(
          { type: "callout", variant: "info", text: "提示", icon: "rocket" },
          { x: 0, y: 0, w: 600 },
          ctx,
        )}
      </svg>,
    )
    // rocket 的首个 path 片段（来自共享目录）
    expect(markup).toContain("M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2")
  })
})

// W4 task 3 fix round (review Minor finding): callout was the one component
// in the paragraph/bullets/callout trio with no numeric font-size assertion
// at all — mirrors paragraph.test.tsx's own "pacing tiers" block, same
// three-tier pattern, same ctx-construction shape. If callout.tsx ever
// regresses back to a hardcoded FONT_SIZE constant instead of reading
// ctx.bodyFontPx, this fails loudly at every tier except the ambient 24px
// one.
describe("callout component pacing tiers", () => {
  const component = { type: "callout" as const, variant: "info" as const, text: "档位字号验证提示" }

  it("dense pacing (20px) renders font-size 20", () => {
    const denseCtx: ComponentCtx = { ...ctx, bodyFontPx: PACING_BUDGETS.dense.bodyBaselinePx }
    const { container } = svg(callout.render(component, { x: 0, y: 0, w: 1120 }, denseCtx))
    expect(container.querySelector("text")?.getAttribute("font-size")).toBe("20")
  })

  it("balanced pacing (24px) renders font-size 24", () => {
    const balancedCtx: ComponentCtx = { ...ctx, bodyFontPx: PACING_BUDGETS.balanced.bodyBaselinePx }
    const { container } = svg(callout.render(component, { x: 0, y: 0, w: 1120 }, balancedCtx))
    expect(container.querySelector("text")?.getAttribute("font-size")).toBe("24")
  })

  it("spacious pacing (32px) renders font-size 32", () => {
    const spaciousCtx: ComponentCtx = { ...ctx, bodyFontPx: PACING_BUDGETS.spacious.bodyBaselinePx }
    const { container } = svg(callout.render(component, { x: 0, y: 0, w: 1120 }, spaciousCtx))
    expect(container.querySelector("text")?.getAttribute("font-size")).toBe("32")
  })
})
