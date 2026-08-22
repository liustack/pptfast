import { readFileSync, readdirSync } from "node:fs"
import { dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { readableOn } from "../ink"
import { tryContentHeadingTreatment } from "./render"
import type { PptxIR, Slide } from "@/ir"
import type { ComponentCtx } from "../components/types"

const HEADING = "算法团队的迭代节奏与业务预期存在落差"
const SUB = "设备预测性维护业务的增长质量与下半年投入方向"
const CHAPTER = "增长战略"
const EMPHASIZED = "**算法团队的迭代节奏**与业务预期存在落差"

function deck(themeId: string, slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "heading-treatments.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
  } as PptxIR
}

function chapterSlide(heading = CHAPTER): Slide {
  return { type: "chapter", heading, components: [] } as Slide
}

function contentSlide(opts: { heading?: string; subheading?: string } = {}): Slide {
  return {
    type: "content",
    heading: opts.heading,
    subheading: opts.subheading,
    components: [{ type: "paragraph", text: "正文占位" }],
  } as Slide
}

function coverSlide(): Slide {
  return { type: "cover", heading: HEADING, components: [] } as Slide
}

function treat(
  themeId: string,
  slides: Slide[],
  index: number,
): {
  treated: ReturnType<typeof tryContentHeadingTreatment>
  ctx: ComponentCtx
  colors: ComponentCtx["colors"]
  fonts: ComponentCtx["fonts"]
} {
  const ir = deck(themeId, slides)
  const ctx = buildCtx(resolveStyle(themeId), {})
  return {
    treated: tryContentHeadingTreatment({ ir, slide: ir.slides[index], index, ctx }),
    ctx,
    colors: ctx.colors,
    fonts: ctx.fonts,
  }
}

function withChapter(
  themeId: string,
  opts: { heading?: string; subheading?: string; chapterHeading?: string } = {},
) {
  return treat(
    themeId,
    [chapterSlide(opts.chapterHeading), contentSlide({ heading: opts.heading ?? HEADING, subheading: opts.subheading })],
    1,
  )
}

function rootOf(chrome: React.ReactNode): Element {
  return parseSvgRoot(
    renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        {chrome}
      </svg>,
    ),
  )
}

function texts(root: Element): Element[] {
  return Array.from(root.querySelectorAll("text"))
}

function textContaining(root: Element, snippet: string): Element {
  const el = texts(root).find((t) => (t.textContent ?? "").includes(snippet))
  if (!el) throw new Error(`no <text> containing "${snippet}"`)
  return el
}

function num(el: Element, name: string): number {
  return Number(el.getAttribute(name))
}

function rects(root: Element): Element[] {
  return Array.from(root.querySelectorAll("rect"))
}

function rectAt(root: Element, x: number, y: number, w?: number, h?: number): Element {
  const el = rects(root).find((r) => {
    if (num(r, "x") !== x || num(r, "y") !== y) return false
    if (w !== undefined && num(r, "width") !== w) return false
    if (h !== undefined && num(r, "height") !== h) return false
    return true
  })
  if (!el) throw new Error(`no rect at ${x},${y} w=${w} h=${h}`)
  return el
}

describe("tryContentHeadingTreatment null cases", () => {
  it("returns null for an unassigned theme", () => {
    expect(withChapter("classroom").treated).toBeNull()
  })

  it("returns null for ghost_index without a chapter", () => {
    expect(treat("consulting", [contentSlide({ heading: HEADING })], 0).treated).toBeNull()
  })

  it("returns null for tag_box without a chapter", () => {
    expect(treat("playbill", [contentSlide({ heading: HEADING })], 0).treated).toBeNull()
  })

  it("returns null when the slide is not content", () => {
    expect(treat("insight", [coverSlide()], 0).treated).toBeNull()
  })
})

describe("ghost_index consulting", () => {
  it("title-only: ghost bleed index + title geometry", () => {
    const { treated, colors } = withChapter("consulting")
    expect(treated).not.toBeNull()
    expect(treated!.contentRect).toEqual({ x: 96, y: 196, w: 1088, h: 444 })
    const root = rootOf(treated!.chrome)
    const title = textContaining(root, HEADING)
    expect(num(title, "x")).toBe(96)
    expect(num(title, "y")).toBe(128)
    expect(num(title, "font-size")).toBe(42)
    expect(title.getAttribute("font-weight")).toBe("700")
    const giant = textContaining(root, "01")
    expect(giant.getAttribute("text-anchor")).toBe("end")
    expect(num(giant, "x")).toBe(1300)
    expect(num(giant, "y")).toBe(212)
    expect(num(giant, "font-size")).toBe(230)
    expect(giant.getAttribute("opacity")).toBe("0.07")
    expect(giant.getAttribute("fill")).toBe(colors.text)
  })

  it("enhanced: sub under title, contentRect y=238", () => {
    const { treated, colors } = withChapter("consulting", { subheading: SUB })
    expect(treated!.contentRect.y).toBe(238)
    const root = rootOf(treated!.chrome)
    const sub = textContaining(root, SUB)
    expect(num(sub, "y")).toBe(172)
    expect(num(sub, "font-size")).toBe(18)
    expect(sub.getAttribute("fill")).toBe(colors.muted)
  })

  it("no-title: mini-index, contentRect y=64 h=576, no heading text", () => {
    const { treated } = withChapter("consulting", { heading: "" })
    expect(treated!.contentRect).toEqual({ x: 96, y: 64, w: 1088, h: 576 })
    const root = rootOf(treated!.chrome)
    expect(texts(root).some((t) => (t.textContent ?? "").includes(HEADING))).toBe(false)
    const mini = textContaining(root, "01")
    expect(num(mini, "x")).toBe(1184)
    expect(num(mini, "y")).toBe(76)
    expect(num(mini, "font-size")).toBe(20)
    expect(mini.getAttribute("opacity")).toBe("0.35")
  })
})

describe("ghost_index tech", () => {
  it("filled accent number, not stroke, plus short border line", () => {
    const { treated, colors } = withChapter("tech")
    const root = rootOf(treated!.chrome)
    const number = texts(root).find((t) => t.textContent === "01" && num(t, "font-size") === 34)!
    expect(number).toBeTruthy()
    expect(num(number, "x")).toBe(1184)
    expect(num(number, "y")).toBe(86)
    expect(number.getAttribute("fill")).toBe(colors.accent)
    expect(number.getAttribute("stroke")).toBeNull()
    const line = rectAt(root, 1122, 96, 62, 1)
    expect(line.getAttribute("fill")).toBe(colors.border)
  })

  it("no-title mini-index uses accent", () => {
    const { treated, colors } = withChapter("tech", { heading: "" })
    const root = rootOf(treated!.chrome)
    const mini = textContaining(root, "01")
    expect(mini.getAttribute("fill")).toBe(colors.accent)
  })
})

describe("baseline insight", () => {
  it("title-only hairline", () => {
    const { treated, colors } = withChapter("insight")
    expect(treated!.contentRect.y).toBe(210)
    const root = rootOf(treated!.chrome)
    const title = textContaining(root, HEADING)
    expect(num(title, "x")).toBe(96)
    expect(num(title, "y")).toBe(132)
    expect(num(title, "font-size")).toBe(40)
    const hair = rectAt(root, 96, 162, 1088, 1)
    expect(hair.getAttribute("fill")).toBe(colors.border)
  })

  it("enhanced: sub right-aligned as a short phrase, contentRect stays 210", () => {
    const { treated, colors } = withChapter("insight", { subheading: SUB })
    expect(treated!.contentRect.y).toBe(210)
    const root = rootOf(treated!.chrome)
    const sub = texts(root).find((t) => num(t, "x") === 1184 && num(t, "y") === 132)
    expect(sub).toBeTruthy()
    expect(sub!.getAttribute("text-anchor")).toBe("end")
    expect(num(sub!, "font-size")).toBeLessThanOrEqual(16)
    expect(sub!.getAttribute("fill")).toBe(colors.accent)
    expect((sub!.textContent ?? "").length).toBeGreaterThan(0)
    expect((sub!.textContent ?? "").length).toBeLessThan(SUB.length)
  })

  it("no-title: no anchor, contentRect y=64", () => {
    const { treated } = withChapter("insight", { heading: "" })
    expect(treated!.contentRect).toEqual({ x: 96, y: 64, w: 1088, h: 576 })
    const root = rootOf(treated!.chrome)
    expect(texts(root)).toHaveLength(0)
  })
})

describe("baseline heritage", () => {
  it("wenwu double rule", () => {
    const { treated, colors } = withChapter("heritage")
    expect(treated!.contentRect.y).toBe(210)
    const root = rootOf(treated!.chrome)
    const thick = rectAt(root, 96, 158, 1088, 2)
    const thin = rectAt(root, 96, 164, 1088, 1)
    expect(thick.getAttribute("fill")).toBe(colors.primary)
    expect(thin.getAttribute("fill")).toBe(colors.primary)
  })

  it("enhanced: sub sits under the wenwu rule, contentRect y=248", () => {
    const { treated, colors } = withChapter("heritage", { subheading: SUB })
    expect(treated!.contentRect.y).toBe(248)
    const root = rootOf(treated!.chrome)
    const sub = textContaining(root, SUB)
    expect(num(sub, "y")).toBe(188)
    expect(num(sub, "font-size")).toBe(18)
    expect(sub.getAttribute("fill")).toBe(colors.muted)
    rectAt(root, 96, 158, 1088, 2)
    rectAt(root, 96, 164, 1088, 1)
  })
})

describe("baseline journal", () => {
  it("double-tone + numero-name right slot", () => {
    const { treated, colors } = withChapter("journal")
    const root = rootOf(treated!.chrome)
    const top = rectAt(root, 96, 158, 1088, 1)
    const bottom = rectAt(root, 96, 163, 1088, 1)
    expect(top.getAttribute("fill")).toBe(colors.text)
    expect(bottom.getAttribute("fill")).toBe(colors.border)
    const slot = textContaining(root, "№ 01 · 增长战略")
    expect(num(slot, "x")).toBe(1184)
    expect(num(slot, "y")).toBe(132)
    expect(slot.getAttribute("text-anchor")).toBe("end")
    expect(num(slot, "font-size")).toBe(14)
    expect(slot.getAttribute("fill")).toBe(colors.accent)
    expect(treated!.contentRect.y).toBe(210)
  })

  it("enhanced: right slot stays, sub under the rule, contentRect y=248", () => {
    const { treated, colors } = withChapter("journal", { subheading: SUB })
    expect(treated!.contentRect.y).toBe(248)
    const root = rootOf(treated!.chrome)
    expect(textContaining(root, "№ 01 · 增长战略")).toBeTruthy()
    const sub = textContaining(root, SUB)
    expect(num(sub, "y")).toBe(188)
    expect(num(sub, "font-size")).toBe(18)
    expect(sub.getAttribute("fill")).toBe(colors.muted)
  })
})

describe("tag_box playbill", () => {
  it("solid-invert box + 第N幕", () => {
    const { treated, colors } = withChapter("playbill")
    expect(treated!.contentRect.y).toBe(206)
    const root = rootOf(treated!.chrome)
    const box = rectAt(root, 96, 56, 150, 38)
    expect(box.getAttribute("fill")).toBe(colors.text)
    const label = textContaining(root, "第一幕")
    expect(label.getAttribute("fill")).toBe(colors.bg)
    expect(label.getAttribute("text-anchor")).toBe("middle")
    expect(num(label, "x")).toBe(171)
    const title = textContaining(root, HEADING)
    expect(num(title, "y")).toBe(150)
    expect(num(title, "font-size")).toBe(44)
    expect(title.getAttribute("font-weight")).toBe("700")
  })

  it("enhanced sub y=190, contentRect y=240", () => {
    const { treated, colors } = withChapter("playbill", { subheading: SUB })
    expect(treated!.contentRect.y).toBe(240)
    const root = rootOf(treated!.chrome)
    const sub = textContaining(root, SUB)
    expect(num(sub, "y")).toBe(190)
    expect(num(sub, "font-size")).toBe(19)
    expect(sub.getAttribute("fill")).toBe(colors.muted)
  })

  it("no-title: no anchor", () => {
    const { treated } = withChapter("playbill", { heading: "" })
    expect(treated!.contentRect.y).toBe(64)
    const root = rootOf(treated!.chrome)
    expect(texts(root).some((t) => (t.textContent ?? "").includes("第一幕"))).toBe(false)
  })
})

describe("tag_box enterprise", () => {
  it("solid-primary box + 第N部分", () => {
    const { treated, colors } = withChapter("enterprise")
    const root = rootOf(treated!.chrome)
    const box = rectAt(root, 96, 56, 150, 38)
    expect(box.getAttribute("fill")).toBe(colors.primary)
    const label = textContaining(root, "第一部分")
    expect(label.getAttribute("fill")).toBe(readableOn(colors.primary))
  })
})

describe("tag_box arena", () => {
  it("hud brackets + ROUND N + mono tracking", () => {
    const { treated, colors, fonts } = withChapter("arena")
    const root = rootOf(treated!.chrome)
    const box = rectAt(root, 96, 56, 150, 30)
    expect(box.getAttribute("fill")).toBe(colors.surface)
    const label = textContaining(root, "ROUND 1")
    expect(label.getAttribute("fill")).toBe(colors.accent)
    expect(label.getAttribute("font-family")).toBe(fonts.mono)
    expect(label.getAttribute("letter-spacing")).toBe("4")
    const markup = root.innerHTML
    expect(markup).toContain("M 96 56 l 0 -8 l 8 0")
    expect(markup).toContain("M 246 86 l 0 8 l -8 0")
    const paths = Array.from(root.querySelectorAll("path"))
    expect(paths.some((p) => p.getAttribute("stroke") === colors.accent && p.getAttribute("stroke-width") === "2")).toBe(
      true,
    )
  })
})

describe("lead_accent academic", () => {
  it("no ** → whole title fill=text, gold-dot tail", () => {
    const { treated, colors } = withChapter("academic")
    expect(treated!.contentRect.y).toBe(184)
    const root = rootOf(treated!.chrome)
    const title = textContaining(root, HEADING)
    expect(num(title, "x")).toBe(96)
    expect(num(title, "y")).toBe(120)
    expect(num(title, "font-size")).toBe(42)
    expect(title.getAttribute("fill")).toBe(colors.text)
    expect(root.querySelector("tspan")).toBeNull()
    const dot = root.querySelector("circle")!
    expect(num(dot, "cx")).toBe(102)
    expect(num(dot, "cy")).toBe(152)
    expect(num(dot, "r")).toBe(3)
    expect(dot.getAttribute("fill")).toBe(colors.accent)
  })

  it("with ** → typeface-shift tspans", () => {
    const { treated, colors, fonts } = withChapter("academic", { heading: EMPHASIZED })
    const root = rootOf(treated!.chrome)
    const tspans = Array.from(root.querySelectorAll("tspan"))
    const emph = tspans.find((t) => (t.textContent ?? "").includes("算法团队的迭代节奏"))!
    const rest = tspans.find((t) => (t.textContent ?? "").includes("与业务预期存在落差"))!
    expect(emph.getAttribute("font-family")).toBe(fonts.heading)
    expect(emph.getAttribute("fill")).toBe(colors.primary)
    expect(rest.getAttribute("font-family")).toBe(fonts.body)
    expect(rest.getAttribute("fill")).toBe(colors.text)
  })

  it("enhanced: two-line right notes, contentRect y=200", () => {
    const { treated, colors } = withChapter("academic", { subheading: SUB })
    expect(treated!.contentRect.y).toBe(200)
    const root = rootOf(treated!.chrome)
    const notes = texts(root).filter((t) => num(t, "x") === 1184 && t.getAttribute("text-anchor") === "end")
    expect(notes.length).toBeGreaterThanOrEqual(2)
    expect(notes.map((t) => num(t, "y")).sort((a, b) => a - b)).toEqual([106, 130])
    expect(notes.every((t) => num(t, "font-size") === 15)).toBe(true)
    expect(notes.every((t) => t.getAttribute("fill") === colors.muted)).toBe(true)
  })
})

describe("lead_accent terra", () => {
  it("color emphasis + olive-rule", () => {
    const { treated, colors } = withChapter("terra", { heading: EMPHASIZED })
    const root = rootOf(treated!.chrome)
    const tspans = Array.from(root.querySelectorAll("tspan"))
    const emph = tspans.find((t) => (t.textContent ?? "").includes("算法团队的迭代节奏"))!
    const rest = tspans.find((t) => (t.textContent ?? "").includes("与业务预期存在落差"))!
    expect(emph.getAttribute("fill")).toBe(colors.accent)
    expect(emph.getAttribute("font-weight")).toBe("700")
    expect(rest.getAttribute("fill")).toBe(colors.text)
    const rule = rectAt(root, 96, 142, 64, 2)
    expect(rule.getAttribute("fill")).toBe(colors.primary)
  })
})

describe("vertical_kicker ink", () => {
  it("vermilion-dot + stacked CJK kicker from section name", () => {
    const { treated, colors } = withChapter("ink")
    expect(treated!.contentRect).toMatchObject({ x: 152, y: 200 })
    const root = rootOf(treated!.chrome)
    const dot = rectAt(root, 99, 72, 10, 10)
    expect(dot.getAttribute("fill")).toBe(colors.accent)
    const stacked = texts(root).filter((t) => num(t, "x") === 104)
    expect(stacked.length).toBe(CHAPTER.length)
    expect(num(stacked[0], "y")).toBe(100)
    expect(num(stacked[1], "y")).toBe(122)
    expect(num(stacked[0], "font-size")).toBe(16)
    expect(stacked[0].getAttribute("fill")).toBe(colors.muted)
    const title = textContaining(root, HEADING)
    expect(num(title, "x")).toBe(152)
    expect(num(title, "y")).toBe(126)
    expect(num(title, "font-size")).toBe(42)
  })

  it("Latin/mixed section name: no stack, inset falls back to 96", () => {
    const { treated } = withChapter("ink", { chapterHeading: "Growth Strategy" })
    expect(treated!.contentRect.x).toBe(96)
    const root = rootOf(treated!.chrome)
    expect(texts(root).filter((t) => (t.textContent ?? "").length === 1)).toHaveLength(0)
  })
})

describe("vertical_kicker museum", () => {
  it("gold rule + kicker + inset title", () => {
    const { treated, colors } = withChapter("museum")
    expect(treated!.contentRect).toMatchObject({ x: 168, y: 196 })
    const root = rootOf(treated!.chrome)
    const rule = rectAt(root, 96, 64, 1, 120)
    expect(rule.getAttribute("fill")).toBe(colors.accent)
    const kicker = texts(root).find((t) => num(t, "x") === 116)!
    expect(num(kicker, "y")).toBe(78)
    expect(num(kicker, "font-size")).toBe(15)
    expect(kicker.getAttribute("fill")).toBe(colors.accent)
    const title = textContaining(root, HEADING)
    expect(num(title, "x")).toBe(168)
  })

  it("no-title short-kicker: line h=96, font 14, content x=168 y=64", () => {
    const { treated } = withChapter("museum", { heading: "" })
    expect(treated!.contentRect).toMatchObject({ x: 168, y: 64 })
    const root = rootOf(treated!.chrome)
    const rule = rectAt(root, 96, 64, 1, 96)
    expect(rule).toBeTruthy()
    const kicker = texts(root).find((t) => num(t, "x") === 116)!
    expect(num(kicker, "font-size")).toBe(14)
  })
})

describe("vertical_kicker lecture", () => {
  it("no left rule, chalk underline", () => {
    const { treated, colors } = withChapter("lecture")
    expect(treated!.contentRect).toMatchObject({ x: 164, y: 196 })
    const root = rootOf(treated!.chrome)
    expect(rects(root).some((r) => num(r, "x") === 96 && num(r, "width") === 1)).toBe(false)
    const kicker = texts(root).find((t) => num(t, "x") === 112)!
    expect(num(kicker, "y")).toBe(76)
    expect(num(kicker, "font-size")).toBe(15)
    expect(kicker.getAttribute("fill")).toBe(colors.muted)
    const title = textContaining(root, HEADING)
    expect(num(title, "x")).toBe(164)
    const path = root.querySelector("path")!
    expect(path.getAttribute("d")).toBe("M 166 148 q 160 8 330 3")
    expect(path.getAttribute("stroke")).toBe(colors.warning)
    expect(path.getAttribute("stroke-width")).toBe("3")
    expect(path.getAttribute("opacity")).toBe("0.85")
    expect(path.getAttribute("stroke-linecap")).toBe("round")
  })
})

describe("vertical kicker chain", () => {
  it("subheading wins over section name", () => {
    const { treated } = withChapter("ink", { subheading: "增长质量" })
    const root = rootOf(treated!.chrome)
    const stacked = texts(root).filter((t) => num(t, "x") === 104)
    expect(stacked.map((t) => t.textContent).join("")).toBe("增长质量")
    expect(stacked.map((t) => t.textContent).join("")).not.toBe(CHAPTER)
  })

  it("stacks the full SubEnhanced board kicker, not an 8-character stub", () => {
    const kicker = "增长质量与投入方向"
    const { treated } = withChapter("ink", { subheading: kicker })
    const root = rootOf(treated!.chrome)
    const stacked = texts(root).filter((t) => num(t, "x") === 104)
    expect(stacked.map((t) => t.textContent).join("")).toBe(kicker)
    expect(stacked).toHaveLength(Array.from(kicker).length)
  })

  it("both missing → no vertical texts, body x=96", () => {
    const { treated } = treat("ink", [contentSlide({ heading: HEADING })], 0)
    expect(treated).not.toBeNull()
    expect(treated!.contentRect.x).toBe(96)
    const root = rootOf(treated!.chrome)
    expect(texts(root).filter((t) => (t.textContent ?? "").length === 1)).toHaveLength(0)
  })
})

describe("center_mirror luxe", () => {
  it("centered title, CJK eyebrow without tracking, hairlines, diamond", () => {
    const { treated, colors } = withChapter("luxe")
    expect(treated!.contentRect.y).toBe(216)
    const root = rootOf(treated!.chrome)
    const title = textContaining(root, HEADING)
    expect(num(title, "x")).toBe(640)
    expect(title.getAttribute("text-anchor")).toBe("middle")
    expect(num(title, "y")).toBe(130)
    expect(num(title, "font-size")).toBe(42)
    expect(title.getAttribute("fill")).toBe(colors.accent)
    const eyebrow = textContaining(root, "第一章")
    expect(num(eyebrow, "x")).toBe(640)
    expect(num(eyebrow, "y")).toBe(70)
    expect(num(eyebrow, "font-size")).toBe(14)
    expect(eyebrow.getAttribute("fill")).toBe(colors.muted)
    expect(eyebrow.getAttribute("letter-spacing")).toBeNull()
    const left = rectAt(root, 500, 64, 90, 1)
    const right = rectAt(root, 690, 64, 90, 1)
    expect(left.getAttribute("fill")).toBe(colors.border)
    expect(right.getAttribute("fill")).toBe(colors.border)
    const diamond = root.querySelector("path")!
    expect(diamond.getAttribute("d")).toBe("M 640 156 l 5 7 l -5 7 l -5 -7 z")
    expect(diamond.getAttribute("fill")).toBe(colors.accent)
  })

  it("no chapter: no eyebrow, hairlines still drawn", () => {
    const { treated } = treat("luxe", [contentSlide({ heading: HEADING })], 0)
    const root = rootOf(treated!.chrome)
    expect(texts(root).some((t) => (t.textContent ?? "").includes("章"))).toBe(false)
    rectAt(root, 500, 64, 90, 1)
    rectAt(root, 690, 64, 90, 1)
  })

  it("enhanced: sub center y=176, diamond between title and sub, contentRect y=236", () => {
    const { treated, colors } = withChapter("luxe", { subheading: SUB })
    expect(treated!.contentRect.y).toBe(236)
    const root = rootOf(treated!.chrome)
    const sub = textContaining(root, SUB)
    expect(num(sub, "x")).toBe(640)
    expect(sub.getAttribute("text-anchor")).toBe("middle")
    expect(num(sub, "y")).toBe(176)
    expect(num(sub, "font-size")).toBe(17)
    expect(sub.getAttribute("fill")).toBe(colors.muted)
    const diamond = root.querySelector("path")!
    expect(diamond.getAttribute("d")).toBe("M 640 156 l 5 7 l -5 7 l -5 -7 z")
  })

  it("no-title: no anchor", () => {
    const { treated } = withChapter("luxe", { heading: "" })
    expect(treated!.contentRect.y).toBe(64)
    const root = rootOf(treated!.chrome)
    expect(texts(root).some((t) => (t.textContent ?? "").includes(HEADING))).toBe(false)
  })
})

describe("center_mirror campaign", () => {
  it("bars, title fill=text, eyebrow 第N幕", () => {
    const { treated, colors } = withChapter("campaign")
    expect(treated!.contentRect.y).toBe(212)
    const root = rootOf(treated!.chrome)
    const title = textContaining(root, HEADING)
    expect(title.getAttribute("fill")).toBe(colors.text)
    expect(title.getAttribute("font-weight")).toBe("700")
    expect(textContaining(root, "第一幕")).toBeTruthy()
    expect(root.querySelector("path")).toBeNull()
    const left = rectAt(root, 556, 62, 24, 3)
    const right = rectAt(root, 700, 62, 24, 3)
    expect(left.getAttribute("fill")).toBe(colors.accent)
    expect(right.getAttribute("fill")).toBe(colors.accent)
  })
})

describe("center_mirror vermilion", () => {
  it("gold-rule, title fill=primary, eyebrow 第N部分", () => {
    const { treated, colors } = withChapter("vermilion")
    expect(treated!.contentRect.y).toBe(212)
    const root = rootOf(treated!.chrome)
    const title = textContaining(root, HEADING)
    expect(title.getAttribute("fill")).toBe(colors.primary)
    expect(title.getAttribute("font-weight")).toBe("700")
    expect(textContaining(root, "第一部分")).toBeTruthy()
    const left = rectAt(root, 470, 60, 120, 1.5)
    const right = rectAt(root, 690, 60, 120, 1.5)
    expect(left.getAttribute("fill")).toBe(colors.accent)
    expect(right.getAttribute("fill")).toBe(colors.accent)
    expect(root.querySelector("path")).toBeNull()
  })

  it("enhanced: diamond returns between title and sub", () => {
    const { treated, colors } = withChapter("vermilion", { subheading: SUB })
    expect(treated!.contentRect.y).toBe(236)
    const root = rootOf(treated!.chrome)
    const sub = textContaining(root, SUB)
    expect(num(sub, "x")).toBe(640)
    expect(num(sub, "y")).toBe(176)
    const diamond = root.querySelector("path")!
    expect(diamond.getAttribute("d")).toBe("M 640 156 l 5 7 l -5 7 l -5 -7 z")
    expect(diamond.getAttribute("fill")).toBe(colors.accent)
  })
})

describe("engine", () => {
  it("assigned-page SVG has no writing-mode", () => {
    const { treated } = withChapter("ink")
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        {treated!.chrome}
      </svg>,
    )
    expect(markup).not.toContain("writing-mode")
  })

  it("heading-treatments source has no baked #RRGGBB", () => {
    const dir = dirname(fileURLToPath(import.meta.url))
    for (const name of readdirSync(dir)) {
      if (name.startsWith("__") || name.includes(".test.")) continue
      if (![".ts", ".tsx"].includes(extname(name))) continue
      const src = readFileSync(join(dir, name), "utf-8")
      expect(src, name).not.toMatch(/#[0-9A-Fa-f]{6}/)
    }
  })

  it("CJK text nodes have no letter-spacing", () => {
    for (const themeId of ["consulting", "luxe", "playbill", "ink", "journal"] as const) {
      const { treated } = withChapter(themeId)
      const root = rootOf(treated!.chrome)
      for (const t of texts(root)) {
        const content = t.textContent ?? ""
        if (/[\u3400-\u9fff]/.test(content)) {
          expect(t.getAttribute("letter-spacing"), `${themeId} ${content}`).toBeNull()
        }
      }
    }
  })

  it("font-weight only 400/700/bold", () => {
    for (const themeId of ["consulting", "playbill", "academic", "luxe", "arena"] as const) {
      const { treated } = withChapter(themeId)
      const root = rootOf(treated!.chrome)
      for (const el of Array.from(root.querySelectorAll("[font-weight]"))) {
        const w = el.getAttribute("font-weight")
        expect(["400", "700", "bold"]).toContain(w)
      }
    }
  })
})
