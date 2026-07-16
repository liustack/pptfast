// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "./serialize"
import { SvgContent } from "./SvgContent"
import { svgToOps } from "../pptx/svg2pptx/dispatch"
import { SLIDE_W_IN } from "../constants"
import type { BlockCtx } from "./blocks/types"
import type { Block } from "@/ir"

const ctx: BlockCtx = {
  colors: {
    bg: "#FFF",
    surface: "#EEE",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
}

const blocks: Block[] = [
  { type: "paragraph", text: "引言段落用于验证往返。" },
  { type: "bullets", items: ["甲", "乙"] },
]

describe("serialize bridge (React SVG → ops)", () => {
  const node = (
    <svg viewBox="0 0 1280 720">
      <SvgContent variant="single" blocks={blocks} rect={{ x: 80, y: 264, w: 1120, h: 400 }} ctx={ctx} />
    </svg>
  )

  it("serializes to standalone svg markup with no foreignObject", () => {
    const markup = renderSvgMarkup(node)
    expect(markup).toContain("<text")
    expect(markup).toContain("xmlns")
    expect(markup).not.toContain("foreignObject")
  })

  it("round-trips through svgToOps into in-bounds pptxgenjs ops", () => {
    const root = parseSvgRoot(renderSvgMarkup(node))
    const ops = svgToOps(root)
    expect(ops.length).toBeGreaterThanOrEqual(3)
    const kinds = new Set(ops.map((o) => o.kind))
    expect(kinds.has("text")).toBe(true)
    for (const op of ops) {
      expect(op.x).toBeGreaterThanOrEqual(0)
      expect(op.x).toBeLessThanOrEqual(SLIDE_W_IN)
      expect(op.y).toBeGreaterThanOrEqual(0)
    }
  })
})
