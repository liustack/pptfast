// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { roadmap } from "./roadmap"
import type { BlockCtx } from "./types"

const ctx: BlockCtx = {
  colors: {
    bg: "#F7F7F2",
    surface: "#FFFFFF",
    primary: "#051C2C",
    accent: "#FFC72C",
    text: "#051C2C",
    muted: "#6C6C6C",
    chartPalette: ["#051C2C", "#FFC72C"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const threePhase = {
  type: "roadmap" as const,
  items: [
    { title: "样板验证", period: "0-6 个月", rows: [{ label: "规模", value: "3-5 个标杆站" }] },
    { title: "区域扩张", period: "7-18 个月", rows: [{ label: "规模", value: "进入 3-5 个城市" }] },
    { title: "规模复制", period: "19-36 个月", rows: [{ label: "规模", value: "策略目标 500+ 站点" }] },
  ],
}

describe("roadmap block", () => {
  it("lays out N equal-width cards with gap=24", () => {
    const { container } = svg(roadmap.render(threePhase, { x: 80, y: 100, w: 1088 }, ctx))
    const cards = Array.from(container.querySelectorAll("rect"))
    expect(cards).toHaveLength(3)
    const cardW = (1088 - 24 * 2) / 3
    cards.forEach((r, i) => {
      expect(Number(r.getAttribute("x"))).toBeCloseTo(80 + i * (cardW + 24))
      expect(Number(r.getAttribute("width"))).toBeCloseTo(cardW)
    })
  })

  it("numbers badges 01..03 (zero-padded) in primary-filled circles", () => {
    const { container } = svg(roadmap.render(threePhase, { x: 0, y: 0, w: 1088 }, ctx))
    const badges = Array.from(container.querySelectorAll("circle"))
    expect(badges).toHaveLength(3)
    badges.forEach((c) => expect(c.getAttribute("fill")).toBe(ctx.colors.primary))
    const digits = Array.from(container.querySelectorAll("text"))
      .map((t) => t.textContent)
      .filter((t) => t && /^0\d$/.test(t))
    expect(digits).toEqual(["01", "02", "03"])
  })

  it("paints an accent top bar as a <path> (rounded top, not a square rect)", () => {
    const { container } = svg(roadmap.render(threePhase, { x: 0, y: 0, w: 1088 }, ctx))
    const bars = Array.from(container.querySelectorAll("path")).filter(
      (p) => p.getAttribute("fill") === ctx.colors.accent,
    )
    expect(bars).toHaveLength(3)
    // Rounded-top path uses an arc command.
    bars.forEach((p) => expect(p.getAttribute("d")).toContain("A "))
  })

  it("measure() grows when a value wraps to two lines", () => {
    const short = {
      type: "roadmap" as const,
      items: [
        { title: "A", rows: [{ label: "x", value: "短" }] },
        { title: "B", rows: [{ label: "x", value: "短" }] },
      ],
    }
    const long = {
      type: "roadmap" as const,
      items: [
        {
          title: "A",
          rows: [{ label: "x", value: "这是一段很长的值会换行到第二行占更多高度的文本内容内容内容" }],
        },
        { title: "B", rows: [{ label: "x", value: "短" }] },
      ],
    }
    expect(roadmap.measure(long, 600, ctx)).toBeGreaterThan(roadmap.measure(short, 600, ctx))
  })

  it("renders only svg2pptx-subset primitives", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {roadmap.render(threePhase, { x: 0, y: 0, w: 1088 }, ctx)}
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })
})
