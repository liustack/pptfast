// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { fitSvgLine } from "../lib/svg-text-layout"
import {
  parseEmphasis,
  stripEmphasis,
  renderEmphasisTspans,
  sliceEmphasisForLines,
  fitEmphasisLine,
} from "./emphasis"

describe("parseEmphasis", () => {
  it("returns a single plain segment when there's no markup", () => {
    expect(parseEmphasis("hello world")).toEqual([{ text: "hello world", emphasized: false }])
  })

  it("splits a single **emphasized** run out of surrounding plain text", () => {
    expect(parseEmphasis("a **b** c")).toEqual([
      { text: "a ", emphasized: false },
      { text: "b", emphasized: true },
      { text: " c", emphasized: false },
    ])
  })

  it("splits multiple emphasized runs in order", () => {
    expect(parseEmphasis("**a** x **b** y **c**")).toEqual([
      { text: "a", emphasized: true },
      { text: " x ", emphasized: false },
      { text: "b", emphasized: true },
      { text: " y ", emphasized: false },
      { text: "c", emphasized: true },
    ])
  })

  it("treats an unclosed ** as literal text", () => {
    expect(parseEmphasis("a **b")).toEqual([{ text: "a **b", emphasized: false }])
  })

  it("treats an empty **** pair as literal text", () => {
    expect(parseEmphasis("a ****b")).toEqual([{ text: "a ****b", emphasized: false }])
  })

  it("handles CJK text inside and outside emphasis", () => {
    expect(parseEmphasis("普通文本 **强调文本** 结尾")).toEqual([
      { text: "普通文本 ", emphasized: false },
      { text: "强调文本", emphasized: true },
      { text: " 结尾", emphasized: false },
    ])
  })

  it("returns an empty array for an empty string", () => {
    expect(parseEmphasis("")).toEqual([])
  })
})

describe("stripEmphasis", () => {
  const samples = [
    "hello world",
    "a **b** c",
    "**a** x **b** y **c**",
    "a **b",
    "a ****b",
    "普通文本 **强调文本** 结尾",
    "",
  ]

  it("removes ** markers, keeping the rest of the text verbatim", () => {
    expect(stripEmphasis("a **b** c")).toBe("a b c")
    expect(stripEmphasis("普通文本 **强调文本** 结尾")).toBe("普通文本 强调文本 结尾")
  })

  it("always equals the concatenation of parseEmphasis's segment texts", () => {
    for (const s of samples) {
      expect(stripEmphasis(s)).toBe(
        parseEmphasis(s)
          .map((seg) => seg.text)
          .join(""),
      )
    }
  })
})

function markup(node: ReturnType<typeof renderEmphasisTspans>) {
  return renderToStaticMarkup(createElement("text", null, node))
}

describe("renderEmphasisTspans", () => {
  it("returns the bare string for a single non-emphasized segment (no tspan wrapper)", () => {
    const result = renderEmphasisTspans([{ text: "plain text", emphasized: false }], {
      accent: "#00A878",
      baseFill: "#1A2421",
    })
    expect(result).toBe("plain text")
    expect(markup(result)).toBe("<text>plain text</text>")
  })

  it("returns an empty string for an empty segment list", () => {
    const result = renderEmphasisTspans([], { accent: "#00A878", baseFill: "#1A2421" })
    expect(result).toBe("")
  })

  it("wraps plain and emphasized segments in tspans with the right fill/weight", () => {
    const result = renderEmphasisTspans(
      [
        { text: "a ", emphasized: false },
        { text: "b", emphasized: true },
        { text: " c", emphasized: false },
      ],
      { accent: "#00A878", baseFill: "#1A2421" },
    )
    const html = markup(result)
    expect(html).toBe(
      '<text><tspan fill="#1A2421">a </tspan><tspan fill="#00A878" font-weight="600">b</tspan><tspan fill="#1A2421"> c</tspan></text>',
    )
  })
})

describe("sliceEmphasisForLines", () => {
  it("maps a single-line segment table straight through", () => {
    const segments = parseEmphasis("a **b** c")
    const [line] = sliceEmphasisForLines(segments, ["a b c"])
    expect(line).toEqual([
      { text: "a ", emphasized: false },
      { text: "b", emphasized: true },
      { text: " c", emphasized: false },
    ])
  })

  it("continues an emphasized run's styling across a line break that splits it", () => {
    const source = "plain **long emphasized phrase segment** end"
    const segments = parseEmphasis(source)
    // Simulates the fit chain wrapping stripEmphasis(source) into two lines.
    const lines = ["plain long emphasized phrase", "segment end"]
    const [line1, line2] = sliceEmphasisForLines(segments, lines)
    expect(line1.some((s) => s.emphasized)).toBe(true)
    expect(line2.some((s) => s.emphasized)).toBe(true)
    expect(line1.find((s) => s.emphasized)?.text).toBe("long emphasized phrase")
    expect(line2.find((s) => s.emphasized)?.text).toBe("segment")
  })

  it("keeps a truncation ellipsis emphasized when it lands inside an emphasized run", () => {
    const segments = parseEmphasis("some **emphasized** text")
    // Simulates truncateToUnits cutting mid-emphasis-run and appending "…".
    const [line] = sliceEmphasisForLines(segments, ["some emphas…"])
    const last = line[line.length - 1]
    expect(last.text.endsWith("…")).toBe(true)
    expect(last.emphasized).toBe(true)
  })

  it("round-trips plain (no-emphasis) text unchanged", () => {
    const segments = parseEmphasis("no markup here")
    const [line] = sliceEmphasisForLines(segments, ["no markup here"])
    expect(line).toEqual([{ text: "no markup here", emphasized: false }])
  })
})

describe("fitEmphasisLine", () => {
  it("returns null for undefined/empty/whitespace-only text", () => {
    expect(fitEmphasisLine(undefined, { maxWidth: 900, fontSize: 22, minFontSize: 16 })).toBeNull()
    expect(fitEmphasisLine("", { maxWidth: 900, fontSize: 22, minFontSize: 16 })).toBeNull()
    expect(fitEmphasisLine("   ", { maxWidth: 900, fontSize: 22, minFontSize: 16 })).toBeNull()
  })

  it("fits unmarked text at the declared font size with a single plain segment", () => {
    const result = fitEmphasisLine("一句简短的结论", {
      maxWidth: 900,
      fontSize: 22,
      minFontSize: 16,
    })
    expect(result).not.toBeNull()
    expect(result!.fontSize).toBe(22)
    expect(result!.segments).toEqual([{ text: "一句简短的结论", emphasized: false }])
  })

  it("keeps ** markup as separate emphasized segments alongside the fitted font size", () => {
    const result = fitEmphasisLine("结论是**效率提升三成**这件事", {
      maxWidth: 900,
      fontSize: 22,
      minFontSize: 16,
    })
    expect(result).not.toBeNull()
    expect(result!.fontSize).toBe(22)
    expect(result!.segments).toEqual([
      { text: "结论是", emphasized: false },
      { text: "效率提升三成", emphasized: true },
      { text: "这件事", emphasized: false },
    ])
  })

  it("shrinks toward minFontSize before truncating, matching fitSvgLine's own behavior", () => {
    const longText = "一段相当长的结论性陈述".repeat(3)
    const plain = fitSvgLine(longText, { maxWidth: 300, fontSize: 22, minFontSize: 16 })
    const result = fitEmphasisLine(longText, { maxWidth: 300, fontSize: 22, minFontSize: 16 })
    expect(result).not.toBeNull()
    expect(result!.fontSize).toBe(plain.fontSize)
    const rebuilt = result!.segments.map((s) => s.text).join("")
    expect(rebuilt).toBe(plain.text)
  })

  it("truncates mid-emphasized-run and keeps the ellipsis emphasized", () => {
    const longEmphasis = "**" + "关键结论文字".repeat(4) + "**"
    const result = fitEmphasisLine(longEmphasis, { maxWidth: 200, fontSize: 22, minFontSize: 16 })
    expect(result).not.toBeNull()
    const last = result!.segments[result!.segments.length - 1]
    expect(last.text.endsWith("…")).toBe(true)
    expect(last.emphasized).toBe(true)
  })
})
