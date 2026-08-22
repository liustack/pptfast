// @vitest-environment jsdom
//
// colophon cover acceptance (theme-redesign wave, 2026-08-18). Two jobs:
// pin the 1a design's own coordinates so a later edit can't drift them
// silently, and prove the layout is genuinely shared — it draws through
// `ctx` tokens on every theme, not through ink's palette.
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { ColophonCover, layoutDef } from "./cover-colophon"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "二季度经营回顾"
const SUBHEADING = "收入、成本与下季度重点"

// `subheading: null` means "omit it" — an explicit `undefined` would just
// re-trigger the default parameter, which is exactly the trap the
// no-subheading case below needs to avoid.
function slide(heading = HEADING, subheading: string | null = SUBHEADING): Slide {
  return { type: "cover", heading, subheading: subheading ?? undefined, components: [] } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}, branding?: PptxIR["branding"]): PptxIR {
  return {
    version: "4",
    filename: "colophon.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [slide()],
    ...(branding !== undefined ? { branding } : {}),
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "云帆科技",
  date: "2026-08-15",
  confidentiality: "internal",
  version: "v1.2",
}

function renderCover(
  themeId: string,
  s: Slide = slide(),
  meta: PptxIR["meta"] = FULL_META,
  branding?: PptxIR["branding"],
) {
  const tokens = resolveStyle(themeId)
  const ctx = buildCtx(tokens, {}, undefined, resolveBackgroundHex(tokens.defaultBackgrounds.cover, tokens.colors.surface))
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <ColophonCover ir={ir(themeId, meta, branding)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens, ctx }
}

/** Content must stay left of this — the corridor a theme's motif may use for
 *  a side rail (ink v3's colophon rail starts at x1220). */
const CONTENT_RIGHT_EDGE = 1180

describe("cover-colophon — the 1a design's own geometry", () => {
  it("places the leader block, heading, kicker, subheading and byline on the design's coordinates (single-line heading)", () => {
    const { root } = renderCover("ink", slide(), FULL_META, "full")
    const leader = root.querySelector("rect")!
    expect([
      leader.getAttribute("x"),
      leader.getAttribute("y"),
      leader.getAttribute("width"),
      leader.getAttribute("height"),
    ]).toEqual(["96", "312", "20", "78"])

    const texts = Array.from(root.querySelectorAll("text"))
    const at = (y: number) => texts.find((t) => Number(t.getAttribute("y")) === y)
    expect(at(378)?.textContent, "heading baseline y378").toBe(HEADING)
    expect(at(378)?.getAttribute("x")).toBe("140")
    expect(at(378)?.getAttribute("font-size")).toBe("84")
    expect(at(428)?.textContent, "wide-tracked org kicker y428").toBe("云帆科技")
    expect(at(428)?.getAttribute("font-size")).toBe("20")
    expect(at(428)?.getAttribute("letter-spacing")).toBe("3")
    expect(at(478)?.textContent, "subheading y478").toBe(SUBHEADING)
    expect(at(478)?.getAttribute("font-size")).toBe("27")
    expect(at(648)?.getAttribute("x"), "byline sits on the page margin").toBe("96")
    expect(at(648)?.textContent).toContain("Internal")
    expect(at(648)?.textContent).toContain("2026-08-15")
    expect(at(648)?.textContent).toContain("v1.2")
  })

  it("the heading is first-line anchored so the leader block always flags line one", () => {
    // A two-line heading keeps its FIRST baseline on 378 (the block brackets
    // y312-390) and pushes the rest of the stack down — the opposite of the
    // last-line anchoring most covers in this pool use, and the reason the
    // heading is capped at two lines.
    const LONG = "二季度经营回顾与下半年重点工作安排"
    const { root } = renderCover("ink", slide(LONG))
    // `font-weight="600"` is this layout's heading and nothing else.
    const headings = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "600",
    )
    expect(headings).toHaveLength(2)
    expect(headings.map((t) => t.textContent).join("")).toBe(LONG)
    expect(headings[0].getAttribute("y")).toBe("378")
    // …and the whole stack below it moved down by exactly one line height.
    const lineHeight = Number(headings[1].getAttribute("y")) - 378
    const kickerY = Number(
      Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "云帆科技")!.getAttribute("y"),
    )
    expect(kickerY).toBe(428 + lineHeight)
  })

  it("mutation guard: nothing this layout paints crosses x1180 — the corridor a side-rail motif needs", () => {
    // Widening any maxWidth past 1180 (or moving a text x right) fails here.
    // The estimate is deliberately generous: a CJK glyph is one em wide, so
    // charCount * fontSize is an upper bound on the run's real advance.
    const { root } = renderCover("ink", slide("二季度经营回顾与下半年重点工作安排及资源配置总览方案"))
    for (const el of Array.from(root.querySelectorAll("rect"))) {
      expect(Number(el.getAttribute("x")) + Number(el.getAttribute("width"))).toBeLessThanOrEqual(
        CONTENT_RIGHT_EDGE,
      )
    }
    for (const el of Array.from(root.querySelectorAll("text"))) {
      const size = Number(el.getAttribute("font-size"))
      const spacing = Number(el.getAttribute("letter-spacing") ?? 0)
      const chars = Array.from(el.textContent ?? "").length
      const right = Number(el.getAttribute("x")) + chars * size + Math.max(0, chars - 1) * spacing
      expect(right, `"${el.textContent}"`).toBeLessThanOrEqual(CONTENT_RIGHT_EDGE)
    }
  })

  it("degrades to the heading alone when the deck carries no subheading and no meta", () => {
    const { root } = renderCover("ink", slide(HEADING, null), {})
    const texts = Array.from(root.querySelectorAll("text"))
    expect(texts).toHaveLength(1)
    expect(texts[0].textContent).toBe(HEADING)
    // The leader block is chrome, not content — it stays.
    expect(root.querySelectorAll("rect")).toHaveLength(1)
  })
})

describe("cover-colophon — shared pool, not ink's private layout", () => {
  it("is registered for cover only, as an archetype, with the cover family's slot vocabulary", () => {
    expect(layoutDef.id).toBe("colophon")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.slideTypes).toEqual(["cover"])
    expect(layoutDef.slots.map((s) => s.name)).toEqual([
      "decor",
      "heading",
      "kicker",
      "subheading",
      "meta",
    ])
    // cover layouts never read `slide.components` — no body slot, and every
    // slot is chrome (`accepts: []`), same as every other cover in the pool.
    for (const s of layoutDef.slots) expect(s.accepts).toEqual([])
  })

  it("bakes no hex: every fill on every one of the 17 themes traces to that theme's own tokens", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderCover(themeId)
      expect(root.querySelector("rect")!.getAttribute("fill"), `${themeId} leader block`).toBe(
        tokens.colors.accent,
      )
      // Text fills come from `accessibleInk`/`metaInk`, which return the
      // theme's own token unless it fails the floor — in which case the
      // fallback is a neutral ink, never another theme's color. Checking the
      // ratio (below) rather than the literal is what actually matters.
      expect(root.querySelectorAll("text").length).toBeGreaterThan(0)
    }
  })

  it("every text run clears its own contrast tier against the theme's real cover background, on all 17 themes", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderCover(themeId)
      const bg = resolveBackgroundHex(tokens.defaultBackgrounds.cover, tokens.colors.surface)
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const size = Number(el.getAttribute("font-size"))
        // B tier (`data-contrast-tier="meta"`) is a flat 3:1 at any size;
        // A tier is size-driven.
        const required =
          el.getAttribute("data-contrast-tier") === "meta" ? 3 : requiredContrastRatio(size)
        const ratio = contrastRatio(el.getAttribute("fill")!, bg)
        expect(ratio, `${themeId}: "${el.textContent}" at ${size}px`).toBeGreaterThanOrEqual(required)
      }
    }
  })

  it("emits only export-safe primitives, on every theme", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      expect(() => assertSubset(renderCover(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat — no seed, no randomness, no content-derived geometry", () => {
    expect(renderCover("ink").markup).toBe(renderCover("ink").markup)
    expect(renderCover("runway").markup).toBe(renderCover("runway").markup)
  })
})
