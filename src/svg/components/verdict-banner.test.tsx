// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { TECH_TOKENS } from "../../themes/tech"
import { LEGACY_CUSTOM_TOKENS } from "../layouts/legacy-custom-tokens"
import { INSIGHT_TOKENS } from "../../themes/insight"
import { CONSULTING_TOKENS } from "../../themes/consulting"
import { verdictBanner } from "./verdict-banner"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    border: "#D8DEDB",
    chartPalette: ["#006A4E", "#00A878"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

function component(tone: "positive" | "warning" | "neutral", text: string) {
  return { type: "verdict_banner" as const, tone, text }
}

describe("verdict_banner component: measure", () => {
  it("returns a positive height", () => {
    expect(
      verdictBanner.measure(component("positive", "结论一句话"), 1088, ctx)
    ).toBeGreaterThan(0)
  })

  it("uses the 70px wide editorial rhythm for one line", () => {
    expect(
      verdictBanner.measure(component("positive", "结论一句话"), 1088, ctx)
    ).toBe(70)
  })

  it("uses the 104px wide editorial rhythm for two lines", () => {
    const twoLineText = "结".repeat(90)
    expect(
      verdictBanner.measure(component("positive", twoLineText), 1088, ctx)
    ).toBe(104)
  })

  it("caps at the two-line wide height even for far-overlong text", () => {
    const veryLongText = "结".repeat(240)
    expect(
      verdictBanner.measure(component("positive", veryLongText), 1088, ctx)
    ).toBe(104)
  })

  it("uses a compact responsive height at 528px", () => {
    const pain = "问题不在「生成」，而在「改不动」：结果像一张成品图，而不是一份文档"
    expect(verdictBanner.measure(component("warning", pain), 528, ctx)).toBe(94)
  })

  it("measure() height matches the rendered audit rectangle", () => {
    const b = component("warning", "结".repeat(90))
    const measuredH = verdictBanner.measure(b, 1088, ctx)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {verdictBanner.render(b, { x: 80, y: 100, w: 1088 }, ctx)}
      </svg>
    )
    const root = parseSvgRoot(markup)
    const audited = root.querySelector("[data-audit-rect]")!
    expect(audited.getAttribute("data-audit-rect")).toBe(`80,100,1088,${measuredH}`)
  })
})

describe("verdict_banner component: editorial rule", () => {
  it("renders a 64px tone mark plus a remaining rule at 1088px, without a card shell", () => {
    const { container } = svg(
      verdictBanner.render(
        component("positive", "结论"),
        { x: 0, y: 0, w: 1088 },
        ctx
      )
    )
    const rects = Array.from(container.querySelectorAll("rect"))
    expect(rects).toHaveLength(1)
    expect(rects[0].getAttribute("x")).toBe("0")
    expect(rects[0].getAttribute("y")).toBe("0")
    expect(rects[0].getAttribute("width")).toBe("64")
    expect(rects[0].getAttribute("height")).toBe("4")
    expect(rects[0].getAttribute("fill")).toBe("#2E9E6B")
    expect(rects[0].getAttribute("rx")).toBeNull()
    expect(rects[0].getAttribute("fill-opacity")).toBeNull()
    expect(rects[0].getAttribute("stroke")).toBeNull()

    const rule = container.querySelector("line")!
    expect(rule.getAttribute("x1")).toBe("64")
    expect(rule.getAttribute("x2")).toBe("1088")
    expect(rule.getAttribute("stroke")).toBe(ctx.colors.border)

    const text = container.querySelector("text")!
    expect(text.getAttribute("font-size")).toBe("26")
  })

  it("renders a 48px tone mark and 24px type at 528px", () => {
    const { container } = svg(
      verdictBanner.render(
        component("warning", "问题不在生成，而在改不动"),
        { x: 0, y: 0, w: 528 },
        ctx
      )
    )
    const mark = container.querySelector("rect")!
    expect(mark.getAttribute("width")).toBe("48")
    expect(mark.getAttribute("height")).toBe("4")
    expect(mark.getAttribute("fill")).toBe("#D9822B")
    expect(container.querySelector("line")!.getAttribute("x1")).toBe("48")
    expect(container.querySelector("line")!.getAttribute("x2")).toBe("528")
    expect(container.querySelector("text")!.getAttribute("font-size")).toBe("24")
  })

  it("annotates the whole bar with a page-coordinate data-audit-box and data-audit-rect", () => {
    const b = component("positive", "结论")
    const h = verdictBanner.measure(b, 1088, ctx)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {verdictBanner.render(b, { x: 80, y: 100, w: 1088 }, ctx)}
      </svg>
    )
    const root = parseSvgRoot(markup)
    const el = root.querySelector("[data-audit-box]")!
    expect(el.getAttribute("data-audit-box")).toBe("80,100,1088")
    expect(el.getAttribute("data-audit-rect")).toBe(`80,100,1088,${h}`)
  })

  it("stays within the controlled SVG subset (assertSubset)", () => {
    const longWithIcon = {
      ...component("warning", "结".repeat(240)),
      icon: "triangle-alert" as const,
    }
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {verdictBanner.render(longWithIcon, { x: 80, y: 100, w: 1088 }, ctx)}
      </svg>
    )
    expect(markup).not.toContain("foreignObject")
    expect(markup).not.toContain("linearGradient")
    expect(markup).not.toContain("url(#")
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })
})

describe("verdict_banner component: tone color mapping", () => {
  it("positive/warning resolve to their base hex on a light theme", () => {
    const { container: pos } = svg(
      verdictBanner.render(
        component("positive", "结论"),
        { x: 0, y: 0, w: 1088 },
        ctx
      )
    )
    expect(pos.querySelector("rect")!.getAttribute("fill")).toBe("#2E9E6B")

    const { container: warn } = svg(
      verdictBanner.render(
        component("warning", "结论"),
        { x: 0, y: 0, w: 1088 },
        ctx
      )
    )
    expect(warn.querySelector("rect")!.getAttribute("fill")).toBe("#D9822B")
  })

  it("neutral resolves to ctx.colors.muted, not a TONE_COLORS entry", () => {
    const { container } = svg(
      verdictBanner.render(
        component("neutral", "结论"),
        { x: 0, y: 0, w: 1088 },
        ctx
      )
    )
    expect(container.querySelector("rect")!.getAttribute("fill")).toBe(
      ctx.colors.muted
    )
  })

  it("positive/warning resolve to the bright dark-theme variant on tech's real ctx", () => {
    const darkCtx: ComponentCtx = {
      colors: TECH_TOKENS.colors,
      fonts: {
        heading: "Microsoft YaHei",
        body: "Microsoft YaHei",
        mono: "Consolas",
      },
      bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
    }
    const { container: pos } = svg(
      verdictBanner.render(
        component("positive", "结论"),
        { x: 0, y: 0, w: 1088 },
        darkCtx
      )
    )
    expect(pos.querySelector("rect")!.getAttribute("fill")).toBe("#4FBF8B")

    const { container: warn } = svg(
      verdictBanner.render(
        component("warning", "结论"),
        { x: 0, y: 0, w: 1088 },
        darkCtx
      )
    )
    expect(warn.querySelector("rect")!.getAttribute("fill")).toBe("#E8A159")
  })

  it("positive/warning resolve to the bright dark-theme variant on creative's real ctx", () => {
    const darkCtx: ComponentCtx = {
      colors: INSIGHT_TOKENS.colors,
      fonts: { heading: "Lora", body: "Inter", mono: "Consolas" },
      bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
    }
    const { container: pos } = svg(
      verdictBanner.render(
        component("positive", "结论"),
        { x: 0, y: 0, w: 1088 },
        darkCtx
      )
    )
    expect(pos.querySelector("rect")!.getAttribute("fill")).toBe("#4FBF8B")

    const { container: warn } = svg(
      verdictBanner.render(
        component("warning", "结论"),
        { x: 0, y: 0, w: 1088 },
        darkCtx
      )
    )
    expect(warn.querySelector("rect")!.getAttribute("fill")).toBe("#E8A159")
  })

  it("resolves to the base color on legacy-custom tokens (keys off bg, not primary/accent)", () => {
    // Regression guard: `custom`'s own primary/accent/text are a near-black
    // monochrome (#18181B — see themes/custom.ts), which could look
    // "dark enough" to wrongly trip the dark-theme branch if tone resolution
    // ever keyed off those instead of `colors.bg` (which stays `#FFFFFF`).
    const customCtx: ComponentCtx = {
      colors: LEGACY_CUSTOM_TOKENS.colors,
      fonts: { heading: "Inter", body: "Inter", mono: "Consolas" },
      bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
    }
    const { container } = svg(
      verdictBanner.render(
        component("positive", "结论"),
        { x: 0, y: 0, w: 1088 },
        customCtx
      )
    )
    expect(container.querySelector("rect")!.getAttribute("fill")).toBe(
      "#2E9E6B"
    )
  })

  it("resolves to the base color on consulting's real ctx (keys off bg, not a literal-navy primary)", () => {
    // Regression guard: consulting's `primary`/`text` are a literal navy
    // `#051C2C` (see themes/consulting.ts) while its `bg` stays a
    // light `#F7F7F2` — the tone resolution must key off `colors.bg`'s own
    // brightness, not `colors.primary`/`colors.text`, or a name/color this
    // literally "navy" would wrongly flip to the dark-theme bright variant.
    const navyCtx: ComponentCtx = {
      colors: CONSULTING_TOKENS.colors,
      fonts: { heading: "Bower", body: "Bower", mono: "Consolas" },
      bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
    }
    const { container } = svg(
      verdictBanner.render(
        component("positive", "结论"),
        { x: 0, y: 0, w: 1088 },
        navyCtx
      )
    )
    expect(container.querySelector("rect")!.getAttribute("fill")).toBe(
      "#2E9E6B"
    )
  })
})

describe("verdict_banner component: icon states", () => {
  const withIconComponent = {
    ...component("warning", "警示结论"),
    icon: "triangle-alert" as const,
  }

  it("draws the icon (tone-colored) when present", () => {
    const { container } = svg(
      verdictBanner.render(withIconComponent, { x: 0, y: 0, w: 1088 }, ctx)
    )
    const iconGroup = container.querySelector('g[transform*="scale"]')
    expect(iconGroup).not.toBeNull()
    const path = container.querySelector("path")
    expect(path?.getAttribute("stroke")).toBe("#D9822B")
  })

  it("omits the icon when absent", () => {
    const { container } = svg(
      verdictBanner.render(
        component("warning", "警示结论"),
        { x: 0, y: 0, w: 1088 },
        ctx
      )
    )
    expect(container.querySelector('g[transform*="scale"]')).toBeNull()
    expect(container.querySelector("path")).toBeNull()
  })

  it("reserves 38px for a 22px icon while unadorned text stays flush", () => {
    const { container: withIcon } = svg(
      verdictBanner.render(withIconComponent, { x: 0, y: 0, w: 1088 }, ctx)
    )
    const { container: withoutIcon } = svg(
      verdictBanner.render(
        component("warning", "警示结论"),
        { x: 0, y: 0, w: 1088 },
        ctx
      )
    )
    expect(Number(withIcon.querySelector("text")!.getAttribute("x"))).toBe(38)
    expect(Number(withoutIcon.querySelector("text")!.getAttribute("x"))).toBe(
      0
    )
  })
})

describe("verdict_banner component: text truncation", () => {
  it("keeps the two DSH verdicts intact at their real render widths", () => {
    const cases = [
      {
        width: 528,
        tone: "warning" as const,
        text: "问题不在「生成」，而在「改不动」：结果像一张成品图，而不是一份文档",
      },
      {
        width: 1088,
        tone: "positive" as const,
        text: "对团队而言：结果是可继承的资产，不是一次性惊喜 —— 谁都能接手修改",
      },
    ]

    for (const { width, tone, text } of cases) {
      const { container } = svg(
        verdictBanner.render(component(tone, text), { x: 0, y: 0, w: width }, ctx)
      )
      const lines = Array.from(container.querySelectorAll("text"))
      expect(lines.map((line) => line.textContent).join("")).toBe(text)
      expect(lines.every((line) => line.getAttribute("data-truncated") == null)).toBe(true)
      expect(lines.every((line) => !(line.textContent ?? "").endsWith("…"))).toBe(true)
    }
  })

  it("truncates an overlong line with an ellipsis instead of growing past 2 lines", () => {
    const b = component("positive", "结".repeat(240))
    const { container } = svg(
      verdictBanner.render(b, { x: 0, y: 0, w: 1088 }, ctx)
    )
    const texts = Array.from(container.querySelectorAll("text"))
    expect(texts).toHaveLength(2)
    expect(texts.some((t) => (t.textContent ?? "").endsWith("…"))).toBe(true)
  })
})

describe("verdict_banner component emphasis", () => {
  it("renders unmarked text with no tspan wrapper (byte-level regression)", () => {
    const b = component("neutral", "没有强调标记的结论文本")
    const { container } = svg(
      verdictBanner.render(b, { x: 0, y: 0, w: 1088 }, ctx)
    )
    const first = container.querySelector("text")
    expect(first?.querySelector("tspan")).toBeNull()
    expect(first?.textContent).toBe("没有强调标记的结论文本")
  })

  it("renders **emphasized** runs with the tone color and fontWeight 700", () => {
    const b = component("positive", "总体结论：**关键提升 35%**，符合预期")
    const { container } = svg(
      verdictBanner.render(b, { x: 0, y: 0, w: 1088 }, ctx)
    )
    const tspans = Array.from(container.querySelectorAll("tspan"))
    const emphasized = tspans.find((t) => t.textContent === "关键提升 35%")
    expect(emphasized?.getAttribute("fill")).toBe("#2E9E6B")
    expect(emphasized?.getAttribute("font-weight")).toBe("700")
    // The surrounding plain runs keep the theme's main text color and don't
    // carry their own font-weight override (they inherit the <text> parent's 600).
    const plain = tspans.find((t) => t.textContent === "总体结论：")
    expect(plain?.getAttribute("fill")).toBe(ctx.colors.text)
    expect(plain?.getAttribute("font-weight")).toBeNull()
  })

  it("measures the same height with or without ** markers", () => {
    const plain = component("positive", "提示文本内容")
    const marked = component("positive", "**提示**文本内容")
    expect(verdictBanner.measure(marked, 1088, ctx)).toBe(
      verdictBanner.measure(plain, 1088, ctx)
    )
  })
})
