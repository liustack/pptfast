// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { code } from "./code"
import { measureMonoTextUnits } from "../../lib/svg-text-layout"
import type { ComponentCtx } from "./types"

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

describe("code component", () => {
  const multiLineComponent = {
    type: "code" as const,
    language: "typescript",
    code: "const x = 1\nconst y = 2\nreturn x + y",
  }

  it("renders background rect with fill #1E1E1E and code text elements for each line", () => {
    const { container } = svg(
      code.render(multiLineComponent, { x: 80, y: 100, w: 600 }, ctx),
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
      code.render(multiLineComponent, { x: 0, y: 0, w: 600 }, ctx),
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
    const longComponent = {
      type: "code" as const,
      language: "text",
      code: longLine,
    }
    const { container } = svg(
      code.render(longComponent, { x: 0, y: 0, w: 200 }, ctx),
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
    const longComponent = {
      type: "code" as const,
      language: "ts",
      code: longLine,
    }
    const boxW = 1088
    const { container } = svg(
      code.render(longComponent, { x: 0, y: 0, w: boxW }, ctx),
    )
    const codeText = Array.from(container.querySelectorAll("text")).find(
      (t) => t.getAttribute("fill") === "#D4D4D4",
    )
    expect(codeText).not.toBeNull()
    const fontSize = Number(codeText!.getAttribute("font-size"))
    const content = codeText!.textContent ?? ""

    // Must not silently render the full untruncated token past the box —
    // the visible text width (line-number column already subtracted) must
    // fit inside the content area. Reimplemented locally (not imported from
    // svg-text-layout.ts) so this stays an independent check on
    // resolveLayout's actual behavior, not a tautology with its own
    // formula. Re-pinned 2026-07-21 (borrow-wave Task 3 fix round): every
    // char in this fixture is ASCII (identifier/hyphen/quote/`=`), so the
    // exact mono model's uniform Consolas advance applies — 0.5498 em/char
    // (1126/2048, Consolas's own hmtx advance. See measureMonoTextUnits's
    // derivation comment in svg-text-layout.ts) — with no WIDE_CHAR_RE case
    // to mirror. Old value: proportional per-character-class weights
    // (0.35-0.66) through a 0.82 `MONO_WIDTH_SAFETY` multiplier. New value:
    // uniform 0.5498 through a 1.0 multiplier (code.tsx's derivation
    // comment: the model is exact, not an estimate, so there is no margin
    // left to budget here either).
    const rawContentW = boxW - 2 * 14 - 40
    const contentW = rawContentW * 1.0
    const units = Array.from(content).length * (1126 / 2048)
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

// Important-1 partial closure (task-3-review.md): a data-anchored accuracy
// test whose expected values come from the font file, not from the
// estimator or from resolveLayout's own arithmetic — breaking the layout/
// audit tautology the review flagged for the mono role specifically.
describe("measureMonoTextUnits — golden Consolas widths (data-anchored, borrow-wave Task 3 fix round)", () => {
  // Hardcoded truth: exact Consolas advance widths for a handful of real
  // code samples, read from the font's own hmtx table (borrow-wave Task
  // 3's fontTools measurement, task-3-report.md's per_string corpus,
  // independently reproduced to 4 decimal places in task-3-review.md by a
  // from-scratch Node.js sfnt/hmtx parser sharing no code with fontTools —
  // both scratchpad, not shipped in this repo). Every string is pure ASCII
  // (no CJK), so Consolas's uniform 0.5498 em/char advance applies without
  // the WIDE_CHAR_RE exception (see measureMonoTextUnits's derivation
  // comment in svg-text-layout.ts).
  const GOLDEN_CONSOLAS_WIDTHS: Array<{ text: string; realEm: number }> = [
    { text: "function calculateTotalRevenue(items) {", realEm: 21.4424 },
    {
      text: "if (x > 0 && y < 10 || (z === null)) { return [a, b, c]; }",
      realEm: 31.8887, // the sample behind the old approach's +18.5% ceiling
    },
    { text: "        });", realEm: 6.0479 }, // shares its shape with the deep-indent family below
    { text: "}", realEm: 0.5498 },
    { text: "export const MAX_RETRIES: number = 3;", realEm: 20.3428 },
  ]

  it("matches the real, hmtx-measured Consolas width within 0.0005 em", () => {
    // Tolerance covers only the golden values' own 4-decimal-place rounding
    // (max ~0.00005 em) with 10x headroom — not a loose "close enough" band.
    for (const { text, realEm } of GOLDEN_CONSOLAS_WIDTHS) {
      expect(measureMonoTextUnits(text)).toBeCloseTo(realEm, 3)
    }
  })
})

// Red-first (task-3-review.md Important-2): the reviewer's adversarial
// deep-indent family becomes a permanent regression. Referenced by name
// from code.tsx's MONO_WIDTH_SAFETY derivation comment.
describe("mono exact-width model — deep-indent adversarial family (red-first, borrow-wave Task 3 fix round)", () => {
  // An 8/16/24/32-space-indented closing-bracket line — the shape that
  // broke the old proportional-weights + MONO_WIDTH_SAFETY(0.82) approach,
  // because deep indentation is almost entirely "space", the single most
  // underestimated proportional class (+57.1% real-vs-assumed at the
  // character level), and that gap has no ceiling as indentation deepens.
  // `realConsolasEm` is computed independently of `measureMonoTextUnits`
  // (not by calling it) so a bug in that function wouldn't be masked by a
  // self-referential check: every character here is ASCII, so real em
  // width = charCount * (1126/2048), Consolas's own hmtx advance.
  const MONO_DEEP_INDENT_FIXTURES = [8, 16, 24, 32].map((indent) => {
    const line = `${" ".repeat(indent)}});`
    const realConsolasEm = Array.from(line).length * (1126 / 2048)
    return { indent, line, realConsolasEm }
  })

  it("reproduces the reviewer's real-vs-proportional deviation percentages", () => {
    // Independent reimplementation of the old proportional model (not
    // imported), mirroring measureTextUnits's weights exactly.
    const measureProportional = (text: string) =>
      Array.from(text).reduce((sum, ch) => {
        if (/\s/.test(ch)) return sum + 0.35
        if (/[A-Z]/.test(ch)) return sum + 0.66
        if (/[a-z0-9]/.test(ch)) return sum + 0.56
        return sum + 0.46
      }, 0)
    const expectedDeviationPct = [44.69, 49.66, 51.79, 52.97]
    MONO_DEEP_INDENT_FIXTURES.forEach(({ line, realConsolasEm }, i) => {
      const assumed = measureProportional(line)
      const deviationPct = ((realConsolasEm - assumed) / assumed) * 100
      expect(deviationPct).toBeCloseTo(expectedDeviationPct[i], 2)
    })
  })

  it("stays within the safety envelope when rendered as the box's sole (controlling) line", () => {
    // Box narrow enough to force resolveLayout's shrink branch (200px,
    // reusing this file's existing narrow-box convention from the
    // font-size-floor test above), one fixture per line so each is
    // unambiguously the line that sets fontSize — no ambiguity about
    // whether it's really "the longest line" driving the fit.
    const boxW = 200
    const rawContentW = boxW - 2 * 14 - 40 // PADDING, LINE_NUM_COL (code.tsx)

    for (const { line } of MONO_DEEP_INDENT_FIXTURES) {
      const component = { type: "code" as const, language: "ts", code: line }
      const { container } = svg(
        code.render(component, { x: 0, y: 0, w: boxW }, ctx),
      )
      const codeText = Array.from(container.querySelectorAll("text")).find(
        (t) => t.getAttribute("fill") === "#D4D4D4",
      )
      expect(codeText).not.toBeNull()
      const fontSize = Number(codeText!.getAttribute("font-size"))
      const rendered = codeText!.textContent ?? ""

      // Real width of whatever actually rendered (full or truncated) —
      // every possible character here (space, the closing punctuation in
      // `line`, the truncation ellipsis "…") is non-CJK, so the uniform
      // Consolas advance applies regardless of whether truncation fired.
      const realRenderedEm = Array.from(rendered).length * (1126 / 2048)
      const realRenderedWidthPx = realRenderedEm * fontSize
      expect(realRenderedWidthPx).toBeLessThanOrEqual(rawContentW + 1)
    }
  })
})
