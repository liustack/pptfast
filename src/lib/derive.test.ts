 
import { describe, it, expect } from "vitest"
import { chapterNumberFor, sectionNameFor, pageInfo, contentIndexInChapter } from "./derive"
import type { PptxIR } from "@/ir"

const ir = (types: string[]): PptxIR =>
  ({ version: "2", filename: "d.pptx", theme: { id: "consulting" }, meta: {},
     assets: { images: {} },
     slides: types.map((t, i) => ({ type: t as any, heading: `H${i}`, blocks: [] })) }) as PptxIR

describe("derive", () => {
  const deck = ir(["cover", "chapter", "content", "content", "chapter", "content", "ending"])
  it("chapterNumberFor counts chapters in order (1-indexed)", () => {
    expect(chapterNumberFor(deck.slides, 1)).toBe(1)
    expect(chapterNumberFor(deck.slides, 4)).toBe(2)
  })
  it("sectionNameFor = heading of the chapter the content belongs to", () => {
    expect(sectionNameFor(deck.slides, 2)).toBe("H1") // content after chapter@1
    expect(sectionNameFor(deck.slides, 5)).toBe("H4") // content after chapter@4
  })
  it("sectionNameFor null before any chapter", () => {
    expect(sectionNameFor(deck.slides, 0)).toBeNull()
  })
  it("pageInfo gives 1-indexed page + total", () => {
    expect(pageInfo(deck.slides, 2)).toEqual({ page: 3, total: 7 })
  })

  describe("contentIndexInChapter", () => {
    it("counts content slides after the nearest preceding chapter (1-indexed)", () => {
      // deck: cover, chapter@1, content@2, content@3, chapter@4, content@5, ending@6
      expect(contentIndexInChapter(deck.slides, 2)).toBe(1)
      expect(contentIndexInChapter(deck.slides, 3)).toBe(2)
      expect(contentIndexInChapter(deck.slides, 5)).toBe(1) // resets after chapter@4
    })

    it("counts from the deck start when no chapter precedes the content", () => {
      const noPrefix = ir(["content", "content", "chapter", "content"])
      expect(contentIndexInChapter(noPrefix.slides, 0)).toBe(1)
      expect(contentIndexInChapter(noPrefix.slides, 1)).toBe(2)
      expect(contentIndexInChapter(noPrefix.slides, 3)).toBe(1) // resets after chapter@2
    })

    it("keeps counting across a run of consecutive content slides", () => {
      const run = ir(["chapter", "content", "content", "content"])
      expect(contentIndexInChapter(run.slides, 1)).toBe(1)
      expect(contentIndexInChapter(run.slides, 2)).toBe(2)
      expect(contentIndexInChapter(run.slides, 3)).toBe(3)
    })

    it("resets to 1 for every new chapter, even with a single content slide each", () => {
      const multi = ir(["chapter", "content", "chapter", "content", "content"])
      expect(contentIndexInChapter(multi.slides, 1)).toBe(1)
      expect(contentIndexInChapter(multi.slides, 3)).toBe(1)
      expect(contentIndexInChapter(multi.slides, 4)).toBe(2)
    })
  })
})
