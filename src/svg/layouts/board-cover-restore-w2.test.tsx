// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { FullSlideSvg } from "../full-slide-svg"
import { THEME_DEFINITIONS } from "../../themes/definitions"
import { resolveMotifId } from "../motif-selection"
import type { PptxIR, Slide } from "@/ir"

const COVER: Slide = {
  type: "cover",
  heading: "岭原智能 2026 年第二季度业务评审",
  subheading: "增长质量与下半年投入方向",
  components: [],
} as Slide

const WAVE2 = [
  { id: "academic", layout: "left-anchor", motif: "rail-motif" },
  { id: "campaign", layout: "poster-center", motif: "campaign-motif" },
  { id: "insight", layout: "poster-center", motif: "poster-motif" },
  { id: "tech", layout: "constellation", motif: "constellation-motif" },
  { id: "luxe", layout: "poster-center", motif: "luxe-motif" },
  { id: "journal", layout: "editorial-masthead", motif: "corner-ornament-motif" },
  { id: "ink", layout: "colophon", motif: "ink-motif" },
  { id: "museum", layout: "poster-center", motif: undefined },
  { id: "terra", layout: "tone-adaptive-header", motif: "terra-motif" },
  { id: "heritage", layout: "editorial-masthead", motif: "heritage-motif" },
] as const

function ir(themeId: string): PptxIR {
  return {
    version: "4",
    filename: "w2-cover.pptx",
    theme: { id: themeId },
    chrome: "full",
    meta: {
      organization: "岭原智能 · 战略与运营部",
      authors: [{ name: "陈砚清", role: "首席技术官" }],
      date: "2026 年 7 月",
      confidentiality: "internal",
    },
    assets: { images: {} },
    slides: [COVER],
    seed: 20260815,
  } as unknown as PptxIR
}

describe("board-cover-restore wave 2 — locked cover faces", () => {
  it.each(WAVE2)("$id cover renders $layout with pinned motif", ({ id, layout, motif }) => {
    expect(THEME_DEFINITIONS[id].layouts.cover).toEqual([layout])
    const doc = ir(id)
    const { container } = render(<FullSlideSvg ir={doc} slide={COVER} index={0} />)
    expect(container.querySelector("[data-archetype]")?.getAttribute("data-archetype")).toBe(layout)
    const decor = container.querySelector("[data-decor]")
    if (motif === undefined) {
      expect(decor).toBeNull()
      expect(resolveMotifId(doc, COVER, 0)).toBeUndefined()
    } else {
      expect(decor).not.toBeNull()
      expect(resolveMotifId(doc, COVER, 0)).toBe(motif)
    }
  })
})
