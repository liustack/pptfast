// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { callout } from "./callout"
import { resolveComponentForm } from "./form-assignments"
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

  it("renders a full-width tint panel, one step off the page bg, never a hairline", () => {
    const { container } = svg(
      callout.render(component, { x: 80, y: 100, w: 1120 }, ctx),
    )
    const panel = [...container.querySelectorAll("rect")].find(
      (r) => Number(r.getAttribute("width")) === 1120,
    )
    expect(panel).toBeTruthy()
    expect(panel!.getAttribute("rx")).toBe("2")
    expect(panel!.getAttribute("y")).toBe("0")
    expect(panel!.getAttribute("fill")).not.toBe(ctx.colors.bg)
    expect(panel!.getAttribute("fill")).not.toBe(ctx.colors.surface)
    expect(panel!.getAttribute("stroke")).toBeNull()
    const hairlines = [...container.querySelectorAll("rect")].filter(
      (r) => Number(r.getAttribute("height")) <= 3,
    )
    expect(hairlines).toHaveLength(0)
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

describe("callout TintPanel has no card stroke", () => {
  const component = { type: "callout" as const, variant: "info" as const, text: "提示信息文本内容" }

  it("does not draw a stroke even when ctx.colors.cardStroke is set", () => {
    const strokedCtx: ComponentCtx = {
      ...ctx,
      colors: { ...ctx.colors, cardStroke: "#ABCDEF" },
    }
    const { container } = svg(callout.render(component, { x: 80, y: 100, w: 1120 }, strokedCtx))
    for (const rect of container.querySelectorAll("rect")) {
      expect(rect.getAttribute("stroke")).toBeNull()
    }
  })

  it("no canonical TintPanel theme strokes the panel, including enterprise/runway", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const themeCtx = buildCtx(resolveStyle(id), {})
      const { container } = svg(callout.render(component, { x: 80, y: 100, w: 1120 }, themeCtx))
      for (const rect of container.querySelectorAll("rect")) {
        expect(rect.getAttribute("stroke"), id).toBeNull()
      }
    }
  })
})

describe("callout semantic color tokens", () => {
  const warn = { type: "callout" as const, variant: "warn" as const, text: "警告" }

  function warnIcon(themeCtx: ComponentCtx) {
    const { container } = svg(callout.render(warn, { x: 0, y: 0, w: 800 }, themeCtx))
    return container.querySelector("path")?.getAttribute("stroke")
  }

  it("paints the pre-token red on the icon when the theme declares no semantic color", () => {
    expect(warnIcon(ctx)).toBe("#DC2626")
  })

  it("follows colors.danger — the whole alert family in one token", () => {
    const themed: ComponentCtx = { ...ctx, colors: { ...ctx.colors, danger: "#7A0B12" } }
    expect(warnIcon(themed)).toBe("#7A0B12")
  })

  it("lets colors.warning split the caution tier off from the error tier", () => {
    const themed: ComponentCtx = {
      ...ctx,
      colors: { ...ctx.colors, danger: "#7A0B12", warning: "#8A5A00" },
    }
    expect(warnIcon(themed)).toBe("#8A5A00")
  })

  it("leaves info and tip on primary/accent — a semantic token moves nothing else", () => {
    const themed: ComponentCtx = {
      ...ctx,
      colors: { ...ctx.colors, danger: "#7A0B12", warning: "#8A5A00", success: "#0B5D2E" },
    }
    for (const [variant, expected] of [
      ["info", "#006A4E"],
      ["tip", "#00A878"],
    ] as const) {
      const { container } = svg(
        callout.render({ type: "callout", variant, text: "测试" }, { x: 0, y: 0, w: 800 }, themed),
      )
      expect(container.querySelector("path")?.getAttribute("stroke")).toBe(expected)
    }
  })

  // Visual review round 4 (2026-08-20): "为啥这个提醒长卡片上边框总是红色啊，
  // 无论主题什么配色，这个总是红色" — the same `#DC2626` on all 17 themes was
  // the defect, not the top rule itself. Every canonical theme now names its
  // own caution color, so the built-in fallback is unreachable from a
  // built-in theme and only a custom/brand-extracted theme can still land on
  // it. Both halves are asserted: the rule follows the theme, and no two
  // themes share a value (a copy-paste that recolored 17 files to the same
  // hex would pass the first half alone).
  it("regression lock: every canonical theme names its own caution color, never the built-in default", () => {
    const seen = new Map<string, string>()
    for (const id of CANONICAL_THEME_IDS) {
      const style = resolveStyle(id)
      const expected = style.colors.warning ?? style.colors.danger
      expect(expected, `${id} declares no semantic caution color`).toBeTruthy()
      expect(expected, `${id} still carries the built-in fallback red`).not.toBe("#DC2626")
      const owner = seen.get(expected!)
      expect(owner, `${id} reuses ${owner}'s caution color ${expected}`).toBeUndefined()
      seen.set(expected!, id)
      const themeCtx = buildCtx(style, {})
      const assignment = resolveComponentForm("callout", id)
      const { container } = svg(callout.render(warn, { x: 0, y: 0, w: 800 }, themeCtx))
      if (assignment?.form === "lead_word") {
        const lead = [...container.querySelectorAll("text")].find((t) => t.textContent === "风险")
        const painted = lead?.getAttribute("fill")
        if (assignment.knobs?.iconInk === "accent") {
          expect(painted, id).toBe(style.colors.accent)
        } else {
          expect(painted, id).toBe(expected)
        }
      } else if (assignment?.knobs?.stamp === true) {
        const stamp = [...container.querySelectorAll("text")].find((t) => t.textContent === "WARN:")
        expect(stamp?.getAttribute("fill"), id).toBe(expected)
      } else {
        expect(container.querySelector("path")?.getAttribute("stroke"), id).toBe(expected)
      }
    }
  })

  it("every canonical theme paints no left bar and no top/bottom hairline", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const themeCtx = buildCtx(resolveStyle(id), {})
      const { container } = svg(callout.render(warn, { x: 0, y: 0, w: 800 }, themeCtx))
      const cardH = callout.measure(warn, 800, themeCtx)
      for (const rect of container.querySelectorAll("rect")) {
        const w = Number(rect.getAttribute("width"))
        const h = Number(rect.getAttribute("height"))
        expect(w <= 12 && h >= cardH * 0.7, `${id} left-edge bar ${w}x${h}`).toBe(false)
        expect(h <= 6 && w >= 800 * 0.7, `${id} top/bottom bar ${w}x${h}`).toBe(false)
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
