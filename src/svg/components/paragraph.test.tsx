// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { paragraph } from "./paragraph"
import type { ComponentCtx } from "./types"
import { DELIVERY_BUDGETS } from "@/scenario"

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
  bodyFontPx: DELIVERY_BUDGETS.balanced.bodyBaselinePx, // 24 — ambient default for tests that don't exercise a specific tier
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

describe("paragraph component", () => {
  const component = { type: "paragraph" as const, text: "这是一段用于测试换行与排版的中文段落文本，需要足够长以触发多行换行。" }

  it("measures a positive height that grows when width shrinks", () => {
    const wide = paragraph.measure(component, 1120, ctx)
    const narrow = paragraph.measure(component, 300, ctx)
    expect(wide).toBeGreaterThan(0)
    expect(narrow).toBeGreaterThan(wide)
  })

  it("renders a translated group of text lines in the body font and text color", () => {
    const { container } = svg(
      paragraph.render(component, { x: 80, y: 264, w: 1120 }, ctx),
    )
    const g = container.querySelector("g")
    expect(g?.getAttribute("transform")).toBe("translate(80,264)")
    const texts = container.querySelectorAll("text")
    expect(texts.length).toBeGreaterThanOrEqual(1)
    const first = texts[0]
    expect(first.getAttribute("x")).toBe("0")
    expect(first.getAttribute("fill")).toBe("#1A2421")
    expect(first.getAttribute("font-family")).toBe("Microsoft YaHei")
    expect(first.getAttribute("dominant-baseline")).toBe("alphabetic")
  })
})

describe("paragraph component emphasis", () => {
  it("renders unmarked text with no tspan wrapper, byte-identical to plain text", () => {
    const plain = { type: "paragraph" as const, text: "一段没有强调标记的普通文本" }
    const { container } = svg(paragraph.render(plain, { x: 0, y: 0, w: 1120 }, ctx))
    const first = container.querySelector("text")
    expect(first?.querySelector("tspan")).toBeNull()
    expect(first?.textContent).toBe("一段没有强调标记的普通文本")
  })

  it("renders **emphasized** runs as an accent-colored, bold tspan", () => {
    const marked = { type: "paragraph" as const, text: "普通 **强调内容** 普通" }
    const { container } = svg(paragraph.render(marked, { x: 0, y: 0, w: 1120 }, ctx))
    const first = container.querySelector("text")
    const tspans = first?.querySelectorAll("tspan")
    expect(tspans?.length).toBe(3)
    const accentSpan = Array.from(tspans ?? []).find((t) => t.textContent === "强调内容")
    expect(accentSpan?.getAttribute("fill")).toBe("#00A878")
    expect(accentSpan?.getAttribute("font-weight")).toBe("600")
  })

  it("measures the same height with or without ** markers", () => {
    const plain = { type: "paragraph" as const, text: "一段普通文本内容" }
    const marked = { type: "paragraph" as const, text: "一段**普通**文本内容" }
    expect(paragraph.measure(marked, 1120, ctx)).toBe(paragraph.measure(plain, 1120, ctx))
  })

  it("continues emphasis styling across a wrapped line break", () => {
    const long = {
      type: "paragraph" as const,
      text: "开头文字 **这是一段足够长会被换行切断的强调文本内容用于测试跨行样式延续** 结尾文字",
    }
    const { container } = svg(paragraph.render(long, { x: 0, y: 0, w: 260 }, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    expect(texts.length).toBeGreaterThan(1)
    const linesWithAccent = texts.filter((t) =>
      Array.from(t.querySelectorAll("tspan")).some((s) => s.getAttribute("fill") === "#00A878"),
    )
    expect(linesWithAccent.length).toBeGreaterThan(1)
  })
})
