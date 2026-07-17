// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { TECH_TOKENS } from "../../styles/tech"
import { LEGACY_CUSTOM_TOKENS } from "../archetypes/legacy-custom-tokens"
import { INSIGHT_TOKENS } from "../../styles/insight"
import { CONSULTING_TOKENS } from "../../styles/consulting"
import { verdictBanner } from "./verdict-banner"
import type { BlockCtx } from "./types"

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

function block(tone: "positive" | "warning" | "neutral", text: string) {
  return { type: "verdict_banner" as const, tone, text }
}

describe("verdict_banner block: measure", () => {
  it("returns a positive height", () => {
    expect(
      verdictBanner.measure(block("positive", "结论一句话"), 1088, ctx)
    ).toBeGreaterThan(0)
  })

  it("is 64 for a single-line text", () => {
    expect(
      verdictBanner.measure(block("positive", "结论一句话"), 1088, ctx)
    ).toBe(64)
  })

  it("is 88 for text that wraps to exactly 2 lines", () => {
    // Pure-CJK unbroken run: at 1088 width (no icon, textW=1040, base budget
    // 1040/18≈57.8 units/line) this wraps to exactly 2 lines (57+33 chars)
    // without needing any loosening or truncation.
    const twoLineText = "结".repeat(90)
    expect(
      verdictBanner.measure(block("positive", twoLineText), 1088, ctx)
    ).toBe(88)
  })

  it("caps at 88 even for far-overlong text (never grows to 3+ lines)", () => {
    const veryLongText = "结".repeat(240)
    expect(
      verdictBanner.measure(block("positive", veryLongText), 1088, ctx)
    ).toBe(88)
  })

  it("measure() height matches the actual rendered bar rect height", () => {
    const b = block("warning", "结".repeat(90))
    const measuredH = verdictBanner.measure(b, 1088, ctx)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {verdictBanner.render(b, { x: 80, y: 100, w: 1088 }, ctx)}
      </svg>
    )
    const root = parseSvgRoot(markup)
    const barRect = root.querySelector("rect")!
    expect(Number(barRect.getAttribute("height"))).toBeCloseTo(measuredH)
  })
})

describe("verdict_banner block: render — shell", () => {
  it("renders a full-width rx=10 rect stroked+tinted with the tone color", () => {
    const { container } = svg(
      verdictBanner.render(
        block("positive", "结论"),
        { x: 0, y: 0, w: 1088 },
        ctx
      )
    )
    const rect = container.querySelector("rect")!
    expect(rect.getAttribute("rx")).toBe("10")
    expect(rect.getAttribute("width")).toBe("1088")
    expect(rect.getAttribute("fill")).toBe("#2E9E6B")
    expect(rect.getAttribute("fill-opacity")).toBe("0.08")
    expect(rect.getAttribute("stroke")).toBe("#2E9E6B")
    expect(rect.getAttribute("stroke-width")).toBe("1.5")
  })

  it("annotates the whole bar with a page-coordinate data-audit-box and data-audit-rect", () => {
    const b = block("positive", "结论")
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
      ...block("warning", "结".repeat(240)),
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

describe("verdict_banner block: tone color mapping", () => {
  it("positive/warning resolve to their base hex on a light theme", () => {
    const { container: pos } = svg(
      verdictBanner.render(
        block("positive", "结论"),
        { x: 0, y: 0, w: 1088 },
        ctx
      )
    )
    expect(pos.querySelector("rect")!.getAttribute("fill")).toBe("#2E9E6B")

    const { container: warn } = svg(
      verdictBanner.render(
        block("warning", "结论"),
        { x: 0, y: 0, w: 1088 },
        ctx
      )
    )
    expect(warn.querySelector("rect")!.getAttribute("fill")).toBe("#D9822B")
  })

  it("neutral resolves to ctx.colors.muted, not a TONE_COLORS entry", () => {
    const { container } = svg(
      verdictBanner.render(
        block("neutral", "结论"),
        { x: 0, y: 0, w: 1088 },
        ctx
      )
    )
    expect(container.querySelector("rect")!.getAttribute("fill")).toBe(
      ctx.colors.muted
    )
  })

  it("positive/warning resolve to the bright dark-theme variant on tech's real ctx", () => {
    const darkCtx: BlockCtx = {
      colors: TECH_TOKENS.colors,
      fonts: {
        heading: "Microsoft YaHei",
        body: "Microsoft YaHei",
        mono: "Consolas",
      },
    }
    const { container: pos } = svg(
      verdictBanner.render(
        block("positive", "结论"),
        { x: 0, y: 0, w: 1088 },
        darkCtx
      )
    )
    expect(pos.querySelector("rect")!.getAttribute("fill")).toBe("#4FBF8B")

    const { container: warn } = svg(
      verdictBanner.render(
        block("warning", "结论"),
        { x: 0, y: 0, w: 1088 },
        darkCtx
      )
    )
    expect(warn.querySelector("rect")!.getAttribute("fill")).toBe("#E8A159")
  })

  it("positive/warning resolve to the bright dark-theme variant on creative's real ctx", () => {
    const darkCtx: BlockCtx = {
      colors: INSIGHT_TOKENS.colors,
      fonts: { heading: "Lora", body: "Inter", mono: "Consolas" },
    }
    const { container: pos } = svg(
      verdictBanner.render(
        block("positive", "结论"),
        { x: 0, y: 0, w: 1088 },
        darkCtx
      )
    )
    expect(pos.querySelector("rect")!.getAttribute("fill")).toBe("#4FBF8B")

    const { container: warn } = svg(
      verdictBanner.render(
        block("warning", "结论"),
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
    const customCtx: BlockCtx = {
      colors: LEGACY_CUSTOM_TOKENS.colors,
      fonts: { heading: "Inter", body: "Inter", mono: "Consolas" },
    }
    const { container } = svg(
      verdictBanner.render(
        block("positive", "结论"),
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
    const navyCtx: BlockCtx = {
      colors: CONSULTING_TOKENS.colors,
      fonts: { heading: "Bower", body: "Bower", mono: "Consolas" },
    }
    const { container } = svg(
      verdictBanner.render(
        block("positive", "结论"),
        { x: 0, y: 0, w: 1088 },
        navyCtx
      )
    )
    expect(container.querySelector("rect")!.getAttribute("fill")).toBe(
      "#2E9E6B"
    )
  })
})

describe("verdict_banner block: icon states", () => {
  const withIconBlock = {
    ...block("warning", "警示结论"),
    icon: "triangle-alert" as const,
  }

  it("draws the icon (tone-colored) when present", () => {
    const { container } = svg(
      verdictBanner.render(withIconBlock, { x: 0, y: 0, w: 1088 }, ctx)
    )
    const iconGroup = container.querySelector('g[transform*="scale"]')
    expect(iconGroup).not.toBeNull()
    const path = container.querySelector("path")
    expect(path?.getAttribute("stroke")).toBe("#D9822B")
  })

  it("omits the icon and shifts the text left to PAD_X when absent", () => {
    const { container } = svg(
      verdictBanner.render(
        block("warning", "警示结论"),
        { x: 0, y: 0, w: 1088 },
        ctx
      )
    )
    expect(container.querySelector('g[transform*="scale"]')).toBeNull()
    expect(container.querySelector("path")).toBeNull()
  })

  it("text x is 56 with an icon (24+20+12), 24 without", () => {
    const { container: withIcon } = svg(
      verdictBanner.render(withIconBlock, { x: 0, y: 0, w: 1088 }, ctx)
    )
    const { container: withoutIcon } = svg(
      verdictBanner.render(
        block("warning", "警示结论"),
        { x: 0, y: 0, w: 1088 },
        ctx
      )
    )
    expect(Number(withIcon.querySelector("text")!.getAttribute("x"))).toBe(56)
    expect(Number(withoutIcon.querySelector("text")!.getAttribute("x"))).toBe(
      24
    )
  })
})

describe("verdict_banner block: text truncation", () => {
  it("truncates an overlong line with an ellipsis instead of growing past 2 lines", () => {
    const b = block("positive", "结".repeat(240))
    const { container } = svg(
      verdictBanner.render(b, { x: 0, y: 0, w: 1088 }, ctx)
    )
    const texts = Array.from(container.querySelectorAll("text"))
    expect(texts).toHaveLength(2)
    expect(texts.some((t) => (t.textContent ?? "").endsWith("…"))).toBe(true)
  })
})

describe("verdict_banner block emphasis", () => {
  it("renders unmarked text with no tspan wrapper (byte-level regression)", () => {
    const b = block("neutral", "没有强调标记的结论文本")
    const { container } = svg(
      verdictBanner.render(b, { x: 0, y: 0, w: 1088 }, ctx)
    )
    const first = container.querySelector("text")
    expect(first?.querySelector("tspan")).toBeNull()
    expect(first?.textContent).toBe("没有强调标记的结论文本")
  })

  it("renders **emphasized** runs with the tone color and fontWeight 700", () => {
    const b = block("positive", "总体结论：**关键提升 35%**，符合预期")
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
    const plain = block("positive", "提示文本内容")
    const marked = block("positive", "**提示**文本内容")
    expect(verdictBanner.measure(marked, 1088, ctx)).toBe(
      verdictBanner.measure(plain, 1088, ctx)
    )
  })
})
