// @vitest-environment jsdom
//
// gov-theme wave (2026-08-06), plan 裁定 4 acceptance: vermilion is the first
// built-in theme designed Chinese-register-first (工作汇报/述职/年度总结), so
// its CJK typography must be first-class, exercised harder than a regular
// theme wave. `audit-baseline.test.ts` already runs vermilion across every
// STRESS_DECK, and `theme-structure.test.ts`'s forced-stress block already
// pins vermilion's own declared chapter/ending ids under CJK_LONG/MIXED_LONG —
// this file closes the remaining gap: **pathological CJK across all four slide
// types at once, in one deck**, including the red-forward cover/chapter
// archetypes where `readableOn` must pick white ink on the full-bleed
// vermilion (the theme's signature 红底白字), all audited for zero geometry
// findings (overflow / out-of-bounds / overlap).
import { describe, expect, it } from "vitest"
import type { Component, PptxIR, Slide } from "@/ir"
import { auditDeck } from "../svg/audit/deck-audit"
import { renderSlideSvg } from "../api"
import { CJK_LONG, CJK_LONG_WITH_DASH, MIXED_LONG, STRESS_DECKS } from "../svg/audit/stress-fixtures"

const GEOMETRY_CODES = new Set(["overflow", "out-of-bounds", "overlap"])

function geometryFindings(ir: PptxIR): string[] {
  return auditDeck(ir)
    .findings.filter((f) => GEOMETRY_CODES.has(f.code))
    .map((f) => `${f.code}: ${f.message}`)
}

/** A vermilion deck of `slides`, reusing the "heading" stress deck's own worst-case org/contact/copyright meta chain. */
function vermilionDeck(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "vermilion-cjk.pptx",
    theme: { id: "vermilion" },
    meta: STRESS_DECKS.heading.meta,
    assets: { images: {} },
    slides,
  } as PptxIR
}

// Pathological CJK body: a long CJK paragraph, long CJK bullets, and kpi_cards
// with CJK labels — the "汇报正文" shapes a real work-report content page
// carries, at stress length.
const CJK_BODY: Component[] = [
  { type: "paragraph", text: `${CJK_LONG}。${CJK_LONG}。` },
  { type: "bullets", items: [CJK_LONG, MIXED_LONG, CJK_LONG_WITH_DASH, `${CJK_LONG}${CJK_LONG}`] },
  {
    type: "kpi_cards",
    items: [
      { value: "128%", label: CJK_LONG.slice(0, 12) },
      { value: "3200 万", label: MIXED_LONG.slice(0, 12) },
      { value: "17", label: CJK_LONG.slice(6, 18) },
    ],
  },
] as Component[]

describe("vermilion CJK-first typography (plan 裁定 4)", () => {
  it("auto-selected: all four slide types with pathological CJK headings/subheadings + CJK body audit clean (zero geometry findings)", () => {
    const ir = vermilionDeck([
      { type: "cover", heading: CJK_LONG, subheading: MIXED_LONG, components: [] },
      { type: "chapter", heading: CJK_LONG_WITH_DASH, subheading: MIXED_LONG, components: [] },
      { type: "content", heading: CJK_LONG, subheading: MIXED_LONG, components: CJK_BODY },
      { type: "ending", heading: CJK_LONG, subheading: MIXED_LONG, components: [] },
    ] as Slide[])
    expect(geometryFindings(ir)).toEqual([])
  })

  // The red identity lives on the full-bleed vermilion chapter and on the
  // red-forward cover archetypes (banner-title's accent bar, left-anchor's
  // 40% primary block, split-diagonal's diagonal primary cut) — each pinned
  // here so the CJK heading is forced through the exact readableOn-on-red path
  // that makes the 红底白字 register work, and audited for zero overflow.
  const RED_FORWARD: { slideType: "cover" | "chapter"; layout: string }[] = [
    { slideType: "cover", layout: "banner-title" },
    { slideType: "cover", layout: "left-anchor" },
    { slideType: "cover", layout: "split-diagonal" },
    { slideType: "chapter", layout: "banner-chapter" },
  ]
  for (const { slideType, layout } of RED_FORWARD) {
    it(`red-forward ${slideType}/${layout} with a pathological CJK heading audits clean`, () => {
      const ir = vermilionDeck([
        { type: slideType, heading: CJK_LONG, subheading: MIXED_LONG, layout, components: [] },
      ] as Slide[])
      expect(geometryFindings(ir)).toEqual([])
    })
  }

  it("renders non-empty SVG markup for every slide type (the deck actually draws, not just audits)", () => {
    const ir = vermilionDeck([
      { type: "cover", heading: CJK_LONG, subheading: MIXED_LONG, components: [] },
      { type: "chapter", heading: CJK_LONG, subheading: MIXED_LONG, components: [] },
      { type: "content", heading: CJK_LONG, components: CJK_BODY },
      { type: "ending", heading: CJK_LONG, components: [] },
    ] as Slide[])
    for (let i = 0; i < ir.slides.length; i++) {
      const svg = renderSlideSvg(ir, i)
      expect(svg.length, `slide ${i}`).toBeGreaterThan(100)
      expect(svg, `slide ${i}`).toContain("<svg")
    }
  })
})
