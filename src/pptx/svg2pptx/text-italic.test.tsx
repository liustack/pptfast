// @vitest-environment jsdom
import { it, expect } from "vitest"
import { textToOp } from "./text"

function parseText(svg: string): Element {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  return doc.querySelector("text")!
}

it("font-style italic 进 run（元素级与 tspan 级）", () => {
  const el = parseText('<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20" font-size="24" font-style="italic">副题斜体</text></svg>')
  expect(textToOp(el).runs[0].italic).toBe(true)
  const el2 = parseText('<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20" font-size="24">正体<tspan font-style="italic">斜体段</tspan></text></svg>')
  const runs = textToOp(el2).runs
  expect(runs[0].italic).toBeUndefined()
  expect(runs[1].italic).toBe(true)
})
