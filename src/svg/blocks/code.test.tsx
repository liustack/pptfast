// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { code } from "./code"
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

describe("code block", () => {
  const multiLineBlock = {
    type: "code" as const,
    language: "typescript",
    code: "const x = 1\nconst y = 2\nreturn x + y",
  }

  it("renders background rect with fill #1E1E1E and code text elements for each line", () => {
    const { container } = svg(
      code.render(multiLineBlock, { x: 80, y: 100, w: 600 }, ctx),
    )
    const g = container.querySelector("g")
    expect(g?.getAttribute("transform")).toBe("translate(80,100)")

    const rect = container.querySelector("rect")
    expect(rect).not.toBeNull()
    expect(rect?.getAttribute("fill")).toBe("#1E1E1E")

    const texts = container.querySelectorAll("text")
    // 3 lines => 3 line-number texts + 3 code texts = 6 total
    expect(texts.length).toBe(6)

    // Code texts are the even-indexed ones (second in each pair)
    const codeTexts = Array.from(texts).filter(
      (t) => t.getAttribute("fill") === "#D4D4D4",
    )
    expect(codeTexts.length).toBe(3)
    expect(codeTexts[0].textContent).toBe("const x = 1")
    expect(codeTexts[1].textContent).toBe("const y = 2")
    expect(codeTexts[2].textContent).toBe("return x + y")
  })

  it("uses ctx.fonts.mono as fontFamily on code text", () => {
    const { container } = svg(
      code.render(multiLineBlock, { x: 0, y: 0, w: 600 }, ctx),
    )
    const codeTexts = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("fill") === "#D4D4D4",
    )
    for (const t of codeTexts) {
      expect(t.getAttribute("font-family")).toBe("Consolas")
    }
  })

  it("shrinks font-size below 15 when a single long line exceeds narrow box width", () => {
    const longLine = "a".repeat(200)
    const longBlock = {
      type: "code" as const,
      language: "text",
      code: longLine,
    }
    const { container } = svg(
      code.render(longBlock, { x: 0, y: 0, w: 200 }, ctx),
    )
    const codeText = Array.from(container.querySelectorAll("text")).find(
      (t) => t.getAttribute("fill") === "#D4D4D4",
    )
    expect(codeText).not.toBeNull()
    const fontSize = Number(codeText!.getAttribute("font-size"))
    expect(fontSize).toBeLessThan(15)
    expect(fontSize).toBeGreaterThanOrEqual(9)
  })

  it("truncates a single unbroken long token so it stays inside the box even at the font-size floor", () => {
    // Mirrors the audit stress fixture: one code line with a long identifier
    // and no spaces to wrap on, wide enough that shrinking to the font-size
    // floor (9) still leaves it wider than the box.
    const EN_LONG =
      "comprehensive-distributed-transaction-consistency-guarantee-and-compensation-strategy"
    const longLine = `const veryLongIdentifierNameForStressTesting = "${EN_LONG}-${EN_LONG}-${EN_LONG}"`
    const longBlock = {
      type: "code" as const,
      language: "ts",
      code: longLine,
    }
    const boxW = 1088
    const { container } = svg(
      code.render(longBlock, { x: 0, y: 0, w: boxW }, ctx),
    )
    const codeText = Array.from(container.querySelectorAll("text")).find(
      (t) => t.getAttribute("fill") === "#D4D4D4",
    )
    expect(codeText).not.toBeNull()
    const fontSize = Number(codeText!.getAttribute("font-size"))
    const content = codeText!.textContent ?? ""

    // Must not silently render the full untruncated token past the box —
    // the visible text width (line-number column already subtracted) must
    // fit inside the content area, with the same MONO_WIDTH_SAFETY margin
    // resolveLayout applies (real-browser audit regression: `ctx.fonts.mono`
    // renders in an actual monospace face like Menlo once resolveFontStack
    // made it a reachable fallback, whose fixed per-character advance runs
    // ~5-6% wider than this estimator's mixed-case average — fitting against
    // the raw, un-shaved contentW let identifier-heavy code overflow the box
    // in the real Chrome-103-class gate even though this jsdom estimate
    // passed).
    const rawContentW = boxW - 2 * 14 - 40
    const contentW = rawContentW * 0.9
    const units = Array.from(content).reduce((sum, ch) => {
      if (/\s/.test(ch)) return sum + 0.35
      if (/[A-Z]/.test(ch)) return sum + 0.66
      if (/[a-z0-9]/.test(ch)) return sum + 0.56
      return sum + 0.46
    }, 0)
    expect(units * fontSize).toBeLessThanOrEqual(contentW + 1)
    expect(content).not.toBe(longLine)
    expect(content.endsWith("…")).toBe(true)
  })

  it("measure returns positive height that grows with line count", () => {
    const twoLines = {
      type: "code" as const,
      language: "js",
      code: "a\nb",
    }
    const fiveLines = {
      type: "code" as const,
      language: "js",
      code: "a\nb\nc\nd\ne",
    }
    const h2 = code.measure(twoLines, 600, ctx)
    const h5 = code.measure(fiveLines, 600, ctx)
    expect(h2).toBeGreaterThan(0)
    expect(h5).toBeGreaterThan(h2)
  })
})
