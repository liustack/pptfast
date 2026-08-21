// @vitest-environment node
//
// `StyleShape.typeScale`: heading/display size multiplier, applied before
// heading-fit shrinks to the box. Body/meta/kicker/footnote stay put.
// Omitted (or 1) is a byte-identical no-op — the first lock below.
import { describe, expect, it } from "vitest"
import type { PptxIR, StyleOverride } from "@/ir"
import { renderSlideSvg, validateIr } from "../api"
import { CANONICAL_THEME_IDS, THEME_STYLES } from "../themes"
import { fitHeadingLines, scaleTypePx } from "./heading-fit"

function coverIr(themeId: string, heading: string, style?: StyleOverride): PptxIR {
  const v = validateIr({
    version: "4",
    filename: "type-scale.pptx",
    theme: { id: themeId, style },
    meta: {},
    assets: { images: {} },
    slides: [{ type: "cover", heading, layout: "poster-center" }],
  })
  if (!v.ok) throw new Error(v.errors.map((e) => e.message).join("\n"))
  return v.ir!
}

function contentIr(style?: StyleOverride): PptxIR {
  const v = validateIr({
    version: "4",
    filename: "type-scale.pptx",
    theme: { id: "consulting", style },
    meta: { organization: "ACME", date: "2026-08" },
    assets: { images: {} },
    slides: [
      {
        type: "content",
        heading: "发现",
        layout: "banner-heading",
        footnote: "来源：内部调研",
        components: [{ type: "paragraph", text: "原字号。" }],
      },
    ],
  })
  if (!v.ok) throw new Error(v.errors.map((e) => e.message).join("\n"))
  return v.ir!
}

function fontSizeFor(svg: string, text: string): number {
  const matches = [...svg.matchAll(/<text\b([^>]*)>([^<]*)</g)]
  const hit = matches.find((m) => m[2] === text)
  if (!hit) throw new Error(`no <text> whose content is ${JSON.stringify(text)}`)
  const size = /font-size="([\d.]+)"/.exec(hit[1]!)
  if (!size) throw new Error(`no font-size on the <text> for ${JSON.stringify(text)}`)
  return Number(size[1])
}

describe("typeScale omitted is a byte-identical no-op", () => {
  it("every built-in theme that omits typeScale matches an explicit typeScale of 1", () => {
    for (const id of CANONICAL_THEME_IDS) {
      if (THEME_STYLES[id].shape?.typeScale != null) continue
      const omitted = renderSlideSvg(coverIr(id, "战略"), 0)
      const one = renderSlideSvg(coverIr(id, "战略", { shape: { typeScale: 1 } }), 0)
      expect(one, id).toBe(omitted)
    }
  })
})

describe("typeScale multiplies heading/display size before fit", () => {
  it("scaleTypePx is a no-op when omitted or 1", () => {
    expect(scaleTypePx(84)).toBe(84)
    expect(scaleTypePx(84, undefined)).toBe(84)
    expect(scaleTypePx(84, 1)).toBe(84)
  })

  it("scaleTypePx multiplies then rounds", () => {
    expect(scaleTypePx(100, 1.5)).toBe(150)
    expect(scaleTypePx(84, 1.3)).toBe(109)
  })

  it("a short heading that still fits grows by the multiplier", () => {
    const base = fitHeadingLines("战略", { maxWidth: 1100, fontSize: 100, maxLines: 2, minPt: 52 })
    const scaled = fitHeadingLines("战略", {
      maxWidth: 1100,
      fontSize: 100,
      maxLines: 2,
      minPt: 52,
      typeScale: 1.5,
    })
    expect(base.fontSize).toBe(100)
    expect(scaled.fontSize).toBe(150)
  })

  it("fit still shrinks a long heading, minPt is the unscaled floor", () => {
    const long = "这是一个相当长的中文标题用于测试自动缩小字号到容器宽度以内不溢出并且还要再长一些"
    const scaled = fitHeadingLines(long, {
      maxWidth: 400,
      fontSize: 100,
      maxLines: 2,
      minPt: 40,
      typeScale: 1.5,
    })
    expect(scaled.fontSize).toBeLessThan(150)
    expect(scaled.fontSize).toBeGreaterThanOrEqual(40)
  })

  it("poster-center heading at typeScale 1.5 is 1.5× the omitted size", () => {
    const baseSvg = renderSlideSvg(coverIr("consulting", "战略"), 0)
    const scaledSvg = renderSlideSvg(coverIr("consulting", "战略", { shape: { typeScale: 1.5 } }), 0)
    expect(fontSizeFor(scaledSvg, "战略")).toBe(Math.round(fontSizeFor(baseSvg, "战略") * 1.5))
  })

  it("body paragraph, footnote, and a content-page title do not move", () => {
    const baseSvg = renderSlideSvg(contentIr(), 0)
    const scaledSvg = renderSlideSvg(contentIr({ shape: { typeScale: 1.5 } }), 0)
    expect(fontSizeFor(scaledSvg, "原字号。")).toBe(fontSizeFor(baseSvg, "原字号。"))
    expect(fontSizeFor(scaledSvg, "来源：内部调研")).toBe(fontSizeFor(baseSvg, "来源：内部调研"))
    expect(fontSizeFor(scaledSvg, "发现")).toBe(fontSizeFor(baseSvg, "发现"))
  })

  it("a statement heading is display type and does grow", () => {
    const ir = (typeScale?: number) => {
      const v = validateIr({
        version: "4",
        filename: "type-scale.pptx",
        theme: { id: "consulting", style: typeScale ? { shape: { typeScale } } : undefined },
        meta: {},
        assets: { images: {} },
        slides: [{ type: "content", heading: "灯灭", layout: "statement" }],
      })
      if (!v.ok) throw new Error(v.errors.map((e) => e.message).join("\n"))
      return v.ir!
    }
    const baseSvg = renderSlideSvg(ir(), 0)
    const scaledSvg = renderSlideSvg(ir(1.5), 0)
    expect(fontSizeFor(scaledSvg, "灯灭")).toBe(Math.round(fontSizeFor(baseSvg, "灯灭") * 1.5))
  })
})
