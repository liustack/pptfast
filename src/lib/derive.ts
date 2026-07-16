import type { Slide } from "@/ir"

export function chapterNumberFor(slides: Slide[], index: number): number {
  let n = 0
  for (let i = 0; i <= index && i < slides.length; i++) {
    if (slides[i].type === "chapter") n++
  }
  return n
}

export function sectionNameFor(slides: Slide[], index: number): string | null {
  for (let i = index; i >= 0; i--) {
    if (slides[i].type === "chapter") return slides[i].heading ?? null
  }
  return null
}

export function pageInfo(slides: Slide[], index: number): { page: number; total: number } {
  return { page: index + 1, total: slides.length }
}

/**
 * 1-indexed position of the `content` slide at `index` within its chapter —
 * i.e. how many `content` slides (this one included) sit between the nearest
 * preceding `chapter` slide and `index`. Walking backward from `index`,
 * counting only `content`-typed slides and stopping at the first `chapter`
 * boundary (or the deck start, if there is no chapter before `index` at
 * all) — so the count resets to 1 right after every chapter, and slides of
 * other types in between (e.g. an interleaved `cover`) don't affect it.
 */
export function contentIndexInChapter(slides: Slide[], index: number): number {
  let n = 0
  for (let i = index; i >= 0 && slides[i].type !== "chapter"; i--) {
    if (slides[i].type === "content") n++
  }
  return n
}
