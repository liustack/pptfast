/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest"
import { defineMastersForIR } from "./master-builder"
import { getTheme } from "../themes"

function fakePptx() {
  const masters: any[] = []
  return {
    defineSlideMaster: vi.fn((m: any) => masters.push(m)),
    masters,
  }
}

describe("defineMastersForIR (slim, single-source era)", () => {
  const tokens = getTheme("tech")

  it("defines one master per slide type", () => {
    const pptx = fakePptx()
    defineMastersForIR(pptx as any, tokens)
    expect(pptx.defineSlideMaster).toHaveBeenCalledTimes(4)
    expect(pptx.masters.map((m) => m.title)).toEqual(["cover", "chapter", "content", "ending"])
  })

  it("no master carries a native slide number (2026-07-09 用户裁决删页码)", () => {
    const pptx = fakePptx()
    defineMastersForIR(pptx as any, tokens)
    for (const m of pptx.masters) {
      expect(m.slideNumber).toBeUndefined()
    }
  })

  it("attaches no background or object layers (the single-source svg paints them)", () => {
    const pptx = fakePptx()
    defineMastersForIR(pptx as any, tokens)
    for (const m of pptx.masters) {
      expect(m.objects ?? []).toHaveLength(0)
      expect(m.background).toBeUndefined()
    }
  })
})
