// @vitest-environment node
import { describe, expect, it } from "vitest"
import { listThemes, renderSlideSvg } from "../../api"
import type { PptxIR, Slide } from "../../ir"
import { measureMonoTextUnits, measureTextUnits } from "../../lib/svg-text-layout"
import { installNodePlatform } from "../../platform/node"
import { parseTransform } from "../audit/svg-audit"
import { isBold, isMonoFontFamily } from "../fonts"
import { buildCtx } from "../full-slide-svg"
import { parseSvgRoot, renderSvgMarkup } from "../serialize"
import { resolveStyle } from "../../themes"
import { corpusAssets, themeDeck } from "../../../evals/gallery/corpus/decks"
import { LEXICONS } from "../../../evals/gallery/corpus/lexicon"
import { assignedThemeIds } from "./assignments"
import { tryContentHeadingTreatment } from "./render"

installNodePlatform()

const GALLERY_HEADING = "预测准确率提升带来的直接停机减少"
const CHAPTER = "战略与运营部"
const BADGE_X = 96
const BADGE_Y = 96
const BADGE_W = 64
const BADGE_H = 32
const BADGE_LABEL = /^\d+\.\d+$/

interface Box {
  x: number
  y: number
  w: number
  h: number
  label: string
}

function aabbIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function textWidth(el: Element, content: string, fontSize: number): number {
  const fontFamily = el.getAttribute("font-family") ?? ""
  const units = isMonoFontFamily(fontFamily)
    ? measureMonoTextUnits(content)
    : measureTextUnits(content, { bold: isBold(el.getAttribute("font-weight")), fontFamily })
  return units * fontSize
}

function walkTextBoxes(root: Element): Box[] {
  const out: Box[] = []
  const visit = (el: Element, ox: number, oy: number, os: number) => {
    const { dx, dy, scale } = parseTransform(el)
    const ax = ox + os * dx
    const ay = oy + os * dy
    const as = os * scale
    if (el.tagName.toLowerCase() === "text") {
      const content = (el.textContent ?? "").trim()
      if (content) {
        const fontSize = Number(el.getAttribute("font-size") ?? 16) * as
        const tx = ax + Number(el.getAttribute("x") ?? 0) * as
        const ty = ay + Number(el.getAttribute("y") ?? 0) * as
        const width = textWidth(el, content, fontSize)
        const anchor = el.getAttribute("text-anchor") ?? "start"
        const left = anchor === "end" ? tx - width : anchor === "middle" ? tx - width / 2 : tx
        out.push({
          x: left,
          y: ty - fontSize,
          w: width,
          h: fontSize + fontSize * 0.25,
          label: content.slice(0, 24),
        })
      }
    }
    for (const child of Array.from(el.children)) visit(child, ax, ay, as)
  }
  visit(root, 0, 0, 1)
  return out
}

function walkRects(root: Element): Box[] {
  const out: Box[] = []
  const visit = (el: Element, ox: number, oy: number, os: number) => {
    const { dx, dy, scale } = parseTransform(el)
    const ax = ox + os * dx
    const ay = oy + os * dy
    const as = os * scale
    if (el.tagName.toLowerCase() === "rect") {
      const w = Number(el.getAttribute("width") ?? 0) * as
      const h = Number(el.getAttribute("height") ?? 0) * as
      out.push({
        x: ax + Number(el.getAttribute("x") ?? 0) * as,
        y: ay + Number(el.getAttribute("y") ?? 0) * as,
        w,
        h,
        label: "rect",
      })
    }
    for (const child of Array.from(el.children)) visit(child, ax, ay, as)
  }
  visit(root, 0, 0, 1)
  return out
}

function findRailBadge(root: Element): Box | null {
  const painted = walkRects(root).find(
    (r) => r.x === BADGE_X && r.y === BADGE_Y && r.w === BADGE_W && r.h === BADGE_H,
  )
  if (painted) return { ...painted, label: "badge" }
  const label = walkTextBoxes(root).find((t) => BADGE_LABEL.test(t.label))
  if (!label) return null
  const nearby = walkRects(root).find((r) => aabbIntersect(r, label) && r.w >= 40 && r.h >= 20 && r.h <= 40)
  return nearby ? { ...nearby, label: "badge" } : { ...label, label: "badge-label" }
}

function isRailNumbered(root: Element): boolean {
  if (root.querySelector('[data-archetype="rail-numbered"]')) return true
  return findRailBadge(root) !== null
}

function titleBoxes(texts: Box[], heading: string): Box[] {
  return texts.filter((t) => {
    if (t.h < 24 * 1.25 - 0.01) return false
    const content = t.label
    return heading.includes(content) || content.includes(heading.slice(0, 8))
  })
}

function kickerBoxes(texts: Box[]): Box[] {
  return texts.filter((t) => {
    if (Array.from(t.label).length !== 1) return false
    if (t.h >= 24 * 1.25) return false
    if (BADGE_LABEL.test(t.label)) return false
    return true
  })
}

function fmt(b: Box): string {
  return `${b.label} x=${b.x.toFixed(1)} y=${b.y.toFixed(1)} w=${b.w.toFixed(1)} h=${b.h.toFixed(1)}`
}

function collisionsAgainst(badge: Box, boxes: Box[]): Box[] {
  return boxes.filter((b) => aabbIntersect(badge, b))
}

function deck(themeId: string, slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "heading-collision.pptx",
    theme: { id: themeId },
    meta: { organization: "pptfast" },
    assets: { images: {} },
    slides,
  } as PptxIR
}

function chapterSlide(heading = CHAPTER): Slide {
  return { type: "chapter", heading, components: [] } as Slide
}

function contentSlide(heading = GALLERY_HEADING): Slide {
  return {
    type: "content",
    heading,
    layout: "rail-numbered",
    components: [{ type: "paragraph", text: "正文占位" }],
  } as Slide
}

function renderPinned(themeId: string, heading = GALLERY_HEADING): { svg: string; root: Element } {
  const ir = deck(themeId, [chapterSlide(), contentSlide(heading)])
  const svg = renderSlideSvg(ir, 1)
  return { svg, root: parseSvgRoot(svg) }
}

function expectBadgeClear(themeId: string, root: Element, heading: string): void {
  const badge = findRailBadge(root)
  expect(badge, `${themeId}: rail-numbered badge must still be painted`).not.toBeNull()
  const texts = walkTextBoxes(root)
  const titles = titleBoxes(texts, heading)
  expect(titles.length, `${themeId}: heading text should render`).toBeGreaterThan(0)
  const titleHits = collisionsAgainst(badge!, titles)
  expect(
    titleHits,
    `${themeId}: badge vs title\n  badge ${fmt(badge!)}\n  ${titleHits.map(fmt).join("\n  ")}`,
  ).toEqual([])
  const kickers = kickerBoxes(texts)
  const kickerHits = collisionsAgainst(badge!, kickers)
  expect(
    kickerHits,
    `${themeId}: badge vs stacked kicker chars\n  badge ${fmt(badge!)}\n  ${kickerHits.map(fmt).join("\n  ")}`,
  ).toEqual([])
}

describe("rail-numbered badge vs heading treatment", () => {
  it("playbill title does not intersect the {chapter}.{n} badge", () => {
    const { root } = renderPinned("playbill")
    expectBadgeClear("playbill", root, GALLERY_HEADING)
  })

  it("ink title and vertical-kicker chars do not intersect the badge", () => {
    const { root } = renderPinned("ink")
    expectBadgeClear("ink", root, GALLERY_HEADING)
    const kickers = kickerBoxes(walkTextBoxes(root))
    expect(kickers.length, "ink should still paint a stacked kicker").toBeGreaterThan(0)
  })
})

describe("assigned themes on pinned rail-numbered", () => {
  it.each(assignedThemeIds())("%s: badge vs title and kicker zero intersect", (themeId) => {
    const { root } = renderPinned(themeId)
    expectBadgeClear(themeId, root, GALLERY_HEADING)
  })
})

describe("gallery theme-table rail-numbered pages", () => {
  it("every themeDeck content page that paints the badge stays clear", async () => {
    const assets = await corpusAssets(LEXICONS.zh)
    const dirty: string[] = []
    let scanned = 0
    for (const themeId of listThemes().map((t) => t.id)) {
      const ir = themeDeck(themeId, LEXICONS.zh, assets)
      for (let i = 0; i < ir.slides.length; i++) {
        if (ir.slides[i]!.type !== "content") continue
        const svg = renderSlideSvg(ir, i)
        const root = parseSvgRoot(svg)
        if (!isRailNumbered(root)) continue
        const badge = findRailBadge(root)
        if (!badge) {
          dirty.push(`${themeId} slide ${i}: rail-numbered without a badge`)
          continue
        }
        scanned += 1
        const heading = ir.slides[i]!.heading ?? ""
        const texts = walkTextBoxes(root)
        const hits = [
          ...collisionsAgainst(badge, titleBoxes(texts, heading)),
          ...collisionsAgainst(badge, kickerBoxes(texts)),
        ]
        if (hits.length > 0) {
          dirty.push(`${themeId} p${String(i + 1).padStart(2, "0")} ${hits.map(fmt).join(" | ")}`)
        }
      }
    }
    expect(scanned, "gallery should include rail-numbered content pages").toBeGreaterThan(0)
    expect(dirty, dirty.join("\n")).toEqual([])
  })
})

describe("no-reserve path", () => {
  it("playbill title still starts at x=96 when tryContentHeadingTreatment is called without a reserve", () => {
    const ir = deck("playbill", [chapterSlide(), contentSlide()])
    const ctx = buildCtx(resolveStyle("playbill"), {})
    const treated = tryContentHeadingTreatment({ ir, slide: ir.slides[1]!, index: 1, ctx })
    expect(treated).not.toBeNull()
    const root = parseSvgRoot(
      renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
          {treated!.chrome}
        </svg>,
      ),
    )
    const title = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes(GALLERY_HEADING.slice(0, 4)),
    )
    expect(title).toBeTruthy()
    expect(Number(title!.getAttribute("x"))).toBe(96)
  })
})
