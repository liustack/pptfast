// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { SlideDecor } from "./SlideDecor"
import type { PptxIR, Slide } from "@/ir"
import type { BlockCtx } from "./blocks/types"

const ctx: BlockCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#051C2C",
    accent: "#FFC72C",
    text: "#1A2421",
    muted: "#5D6B65",
    border: "#D5D5CB",
    chartPalette: ["#051C2C", "#FFC72C"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
}

function deck(slides: Slide[]): PptxIR {
  return {
    version: "2",
    filename: "d.pptx",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides,
  }
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

describe("SlideDecor (image-layouts P4 受控装饰原语)", () => {
  it("renders nothing without an explicit decor", () => {
    const slide: Slide = { type: "content", heading: "无饰", blocks: [] }
    const { container } = svg(
      <SlideDecor ir={deck([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(container.querySelector("g, text, rect, circle")).toBeNull()
  })

  it("big_number derives the chapter ordinal from deck position", () => {
    const slides: Slide[] = [
      { type: "cover", heading: "封", blocks: [] },
      { type: "chapter", heading: "一", blocks: [] },
      { type: "chapter", heading: "二", blocks: [], decor: { kind: "big_number" } },
    ]
    const { container } = svg(
      <SlideDecor ir={deck(slides)} slide={slides[2]} index={2} ctx={ctx} />,
    )
    expect(container.textContent).toContain("02")
  })

  it("corner_tag renders model-provided text, skips silently without it", () => {
    const tagged: Slide = {
      type: "content",
      heading: "x",
      blocks: [],
      decor: { kind: "corner_tag", text: "巡检专刊" },
    }
    const { container } = svg(
      <SlideDecor ir={deck([tagged])} slide={tagged} index={0} ctx={ctx} />,
    )
    expect(container.textContent).toContain("巡检专刊")

    const untagged: Slide = { ...tagged, decor: { kind: "corner_tag" } }
    const { container: c2 } = svg(
      <SlideDecor ir={deck([untagged])} slide={untagged} index={0} ctx={ctx} />,
    )
    expect(c2.textContent).toBe("")
  })

  it("intensity=subtle lowers opacity vs normal", () => {
    const mk = (intensity: "subtle" | "normal"): Slide => ({
      type: "content",
      heading: "x",
      blocks: [],
      decor: { kind: "geo_dots", intensity },
    })
    const subtle = svg(
      <SlideDecor ir={deck([mk("subtle")])} slide={mk("subtle")} index={0} ctx={ctx} />,
    )
    const normal = svg(
      <SlideDecor ir={deck([mk("normal")])} slide={mk("normal")} index={0} ctx={ctx} />,
    )
    const opacityOf = (c: HTMLElement) =>
      Number(c.querySelector("circle")?.getAttribute("fill-opacity"))
    expect(opacityOf(subtle.container)).toBeLessThan(opacityOf(normal.container))
  })

  it.each(["rule_line", "quote_marks", "geo_dots"] as const)(
    "%s renders themed shapes",
    (kind) => {
      const slide: Slide = { type: "content", heading: "x", blocks: [], decor: { kind } }
      const { container } = svg(
        <SlideDecor ir={deck([slide])} slide={slide} index={0} ctx={ctx} />,
      )
      expect(container.querySelector("rect, circle, text")).not.toBeNull()
    },
  )
})
