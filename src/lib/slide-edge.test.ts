import { describe, expect, it } from "vitest"
import { renderSlideSvg, validateIr } from "@/api"
import type { PptxIR } from "@/ir"
import { slideEdgeFill } from "./slide-edge"

const svg = (body: string) => `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">${body}</svg>`

describe("slideEdgeFill", () => {
  it("reads a solid full-bleed background", () => {
    expect(slideEdgeFill(svg(`<rect x="0" y="0" width="1280" height="720" fill="#2A1E3F"></rect>`))).toBe("#2A1E3F")
  })

  it("takes the last full-bleed rect, not the first", () => {
    // ink's cover: a cream page background with a near-black masthead painted
    // over all of it. The theme token is the wrong answer here; the markup is
    // the right one.
    const markup = svg(
      `<rect x="0" y="0" width="1280" height="720" fill="#F7F2E7"></rect>` +
        `<rect x="0" y="0" width="1280" height="720" fill="#1F1C18"></rect>`,
    )
    expect(slideEdgeFill(markup)).toBe("#1F1C18")
  })

  it("describes a banded page as a hard-stop gradient", () => {
    const markup = svg(
      `<rect x="0" y="0" width="1280" height="720" fill="#F7F2E7"></rect>` +
        `<rect x="0" y="0" width="1280" height="224" fill="#1F1C18"></rect>`,
    )
    expect(slideEdgeFill(markup)).toBe("linear-gradient(180deg,#1F1C18 0% 31.111%,#F7F2E7 31.111% 100%)")
  })

  it("ignores rects that are not full width", () => {
    const markup = svg(
      `<rect x="0" y="0" width="1280" height="720" fill="#101010"></rect>` +
        `<rect x="96" y="72" width="1088" height="88" fill="#16202B"></rect>`,
    )
    expect(slideEdgeFill(markup)).toBe("#101010")
  })

  it("ignores rects that are not opaque", () => {
    const markup = svg(
      `<rect x="0" y="0" width="1280" height="720" fill="#101010"></rect>` +
        `<rect x="0" y="0" width="1280" height="720" fill="#FFFFFF" fill-opacity="0.06"></rect>` +
        `<rect x="0" y="0" width="1280" height="720" fill="#FFFFFF" opacity="0.5"></rect>`,
    )
    expect(slideEdgeFill(markup)).toBe("#101010")
  })

  it("ignores rects inside a group that moves its children", () => {
    // Their coordinates are no longer canvas coordinates, so a 1280-wide rect
    // in there is not a full-bleed rect.
    const markup = svg(
      `<rect x="0" y="0" width="1280" height="720" fill="#101010"></rect>` +
        `<g transform="translate(96,240)"><rect x="0" y="0" width="1280" height="720" fill="#FF0000"></rect></g>` +
        `<g data-audit-rect="0,0,1280,120"><rect x="0" y="0" width="1280" height="120" fill="#202020"></rect></g>`,
    )
    expect(slideEdgeFill(markup)).toBe("linear-gradient(180deg,#202020 0% 16.667%,#101010 16.667% 100%)")
  })

  it("has no answer for a page whose edge is a photo", () => {
    const markup = svg(
      `<image href="data:image/png;base64,AAA" x="0" y="0" width="1280" height="720"></image>` +
        `<rect x="0" y="0" width="1280" height="720" fill="#101010" fill-opacity="0.66"></rect>`,
    )
    expect(slideEdgeFill(markup)).toBeNull()
  })

  it("answers for every slide of a real deck", () => {
    const result = validateIr({
      version: "4",
      theme: { id: "ink" },
      slides: [
        { type: "cover", heading: "封面", components: [] },
        { type: "content", heading: "正文", components: [{ type: "paragraph", text: "一段正文。" }] },
        { type: "ending", heading: "结束", components: [] },
      ],
    })
    expect(result.errors).toEqual([])
    const ir = result.ir as PptxIR
    for (let i = 0; i < ir.slides.length; i++) {
      const edge = slideEdgeFill(renderSlideSvg(ir, i))
      expect(edge, `slide ${i}`).toMatch(/^(#[0-9A-Fa-f]{6}|linear-gradient\()/)
    }
  })
})
