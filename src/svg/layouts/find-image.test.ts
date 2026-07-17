import { describe, expect, it } from "vitest"
import { findImageComponent } from "./find-image"
import type { Slide } from "@/ir"

function slide(components: Slide["components"]): Slide {
  return { type: "content", heading: "h", components }
}

describe("findImageComponent", () => {
  it("returns undefined when there is no image component", () => {
    expect(findImageComponent(slide([{ type: "paragraph", text: "x" }]))).toBeUndefined()
  })

  it("returns undefined for an empty components array", () => {
    expect(findImageComponent(slide([]))).toBeUndefined()
  })

  it("finds the sole image component among other component types", () => {
    const img = { type: "image", asset_id: "a", fit: "cover" } as const
    const found = findImageComponent(slide([{ type: "paragraph", text: "x" }, img]))
    expect(found).toBe(img)
  })

  it("returns the first image component when there are multiple (the shared convention)", () => {
    const first = { type: "image", asset_id: "first", fit: "cover" } as const
    const second = { type: "image", asset_id: "second", fit: "cover" } as const
    expect(findImageComponent(slide([first, second]))?.asset_id).toBe("first")
  })
})
