import { describe, it, expect } from "vitest"
import { checkIrQuality, type QualityIssue } from "./ir-quality"
import { CAPACITY } from "./audit/capacity"
import { resolveEffectiveLayoutId } from "./effective-layout"
import { DELIVERY_BUDGETS, resolveScenario, type Delivery, type ScenarioAxes } from "@/scenario"
import type { Component, PptxIR, Slide } from "@/ir"

// ── helpers ──

function makeIR(slides: Slide[], themeId: PptxIR["theme"]["id"] = "consulting"): PptxIR {
  return {
    version: "3",
    filename: "test.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
  }
}

function codes(issues: QualityIssue[]): string[] {
  return issues.map((i) => i.code)
}

function paragraphs(n: number): Component[] {
  return Array.from({ length: n }, (_, i) => ({ type: "paragraph" as const, text: String(i) }))
}

/** {@link ScenarioAxes} varying only in `delivery` — mode/audience default (briefing/public, neither affects W3's density/bullets gates). */
function deliveryAxes(delivery: Delivery): ScenarioAxes {
  return resolveScenario({ delivery })
}

/**
 * Search for a heading string that makes a single-content-slide `themeId`
 * deck's auto-pick (content ordinal 0) land on `targetLayoutId` — via the
 * real `resolveEffectiveLayoutId` (`./effective-layout`), never a
 * reimplemented copy of its seed/hash mechanics, so this fixture can never
 * silently drift from what selection actually does (same "must reuse, not
 * reimplement" concern `effective-layout.ts` itself documents). Only needed
 * for theme "tech", whose content allowed set (`["bento-panel",
 * "two-column"]`) mixes two different body capacities (6 vs 4) — every
 * other built-in theme's content allowed set is two same-capacity (4)
 * archetypes, so which one gets picked never changes the expected limit.
 */
function findAutoPickHeading(themeId: string, targetLayoutId: string): string {
  for (let i = 0; i < 500; i++) {
    const heading = `probe-${i}`
    const ir = makeIR([{ type: "content", heading, components: [] }], themeId)
    if (resolveEffectiveLayoutId(ir, ir.slides[0], 0) === targetLayoutId) return heading
  }
  throw new Error(`no auto-pick fixture landing on "${targetLayoutId}" for theme "${themeId}" within 500 tries`)
}

// ── tests ──

describe("checkIrQuality", () => {
  it("returns empty array for a clean deck", () => {
    const ir = makeIR([
      {
        type: "cover",
        heading: "标题",
        components: [],
      },
      {
        type: "content",
        heading: "内容页",
        components: [
          { type: "bullets", items: ["a", "b", "c"] },
          { type: "paragraph", text: "hello" },
        ],
      },
    ])
    expect(checkIrQuality(ir)).toEqual([])
  })

  // ── empty_deck ──

  it("reports error for empty deck", () => {
    const issues = checkIrQuality(makeIR([]))
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe("error")
    expect(issues[0].code).toBe("empty_deck")
  })

  // ── density (W3 task 3, spec §5 dual-attribute capacity split) ──
  //
  // limit = min(DELIVERY_BUDGETS[delivery].maxComponentsPerSlide,
  // resolveEffectiveLayoutBodyCapacity(...).capacity ?? Infinity). The
  // matrix below deliberately covers: all 3 deliveries, explicit vs.
  // auto-picked layout, the bento-panel capacity-6 exception (both
  // auto-picked and explicit-pinned), and takeover layouts (no geometric
  // term at all). Content archetypes other than bento-panel all carry body
  // capacity 4 (registry.test.ts pins this), so any non-tech theme's
  // auto-pick — always a 2-member set of same-capacity archetypes — needs
  // no seed-search to get a deterministic expected limit.

  describe("density gate matrix", () => {
    const cases: {
      label: string
      themeId: string
      delivery: Delivery
      layout?: string
      image?: boolean
      expectedLimit: number
    }[] = [
      // text delivery (editorial budget 5)
      {
        label: "text delivery, explicit generic layout — the layout's own capacity (4) binds under delivery's 5",
        themeId: "consulting",
        delivery: "text",
        layout: "two-column",
        expectedLimit: 4,
      },
      {
        label: "text delivery, explicit bento-panel — delivery's 5 binds under the layout's own capacity (6)",
        themeId: "consulting",
        delivery: "text",
        layout: "bento-panel",
        expectedLimit: 5,
      },
      {
        label: "text delivery, auto-picked layout (non-tech theme) — layout capacity (4) binds under delivery's 5",
        themeId: "journal",
        delivery: "text",
        expectedLimit: 4,
      },
      {
        label: "text delivery, takeover layout — no geometric term, pure delivery budget (5)",
        themeId: "consulting",
        delivery: "text",
        layout: "image-top",
        image: true,
        expectedLimit: 5,
      },
      // balanced delivery (editorial budget 4)
      {
        label: "balanced delivery, explicit generic layout — tie at 4",
        themeId: "consulting",
        delivery: "balanced",
        layout: "banner-heading",
        expectedLimit: 4,
      },
      {
        label: "balanced delivery, auto-picked layout (non-tech theme) — tie at 4",
        themeId: "consulting",
        delivery: "balanced",
        expectedLimit: 4,
      },
      {
        label: "balanced delivery, explicit bento-panel — delivery's 4 binds under the layout's own capacity (6)",
        themeId: "tech",
        delivery: "balanced",
        layout: "bento-panel",
        expectedLimit: 4,
      },
      {
        label: "balanced delivery, takeover layout — no geometric term, pure delivery budget (4)",
        themeId: "consulting",
        delivery: "balanced",
        layout: "image-split",
        image: true,
        expectedLimit: 4,
      },
      // presentation delivery (editorial budget 3) — every content layout's
      // own capacity is >= 4, so delivery always binds regardless of layout.
      {
        label: "presentation delivery, explicit generic layout — delivery's 3 always binds",
        themeId: "consulting",
        delivery: "presentation",
        layout: "two-column",
        expectedLimit: 3,
      },
      {
        label: "presentation delivery, explicit bento-panel — delivery's 3 always binds",
        themeId: "tech",
        delivery: "presentation",
        layout: "bento-panel",
        expectedLimit: 3,
      },
      {
        label: "presentation delivery, auto-picked layout — delivery's 3 always binds",
        themeId: "consulting",
        delivery: "presentation",
        expectedLimit: 3,
      },
      {
        label: "presentation delivery, takeover layout — no geometric term, pure delivery budget (3)",
        themeId: "consulting",
        delivery: "presentation",
        layout: "image-bottom",
        image: true,
        expectedLimit: 3,
      },
    ]

    for (const c of cases) {
      it(`${c.label} → limit ${c.expectedLimit}`, () => {
        const build = (n: number): Slide => ({
          type: "content",
          heading: "标题",
          layout: c.layout,
          components: [
            ...(c.image ? [{ type: "image" as const, asset_id: "hero", fit: "cover" as const }] : []),
            ...paragraphs(n - (c.image ? 1 : 0)),
          ],
        })
        const axes = deliveryAxes(c.delivery)

        const atLimit = makeIR([build(c.expectedLimit)], c.themeId)
        expect(codes(checkIrQuality(atLimit, axes))).not.toContain("density")

        const overLimit = makeIR([build(c.expectedLimit + 1)], c.themeId)
        const issues = checkIrQuality(overLimit, axes)
        expect(codes(issues)).toContain("density")
        const density = issues.find((i) => i.code === "density")!
        expect(density.density?.limit).toBe(c.expectedLimit)
        expect(density.density?.delivery).toBe(c.delivery)
        expect(density.message).toContain(String(c.expectedLimit))
      })
    }

    it("auto-selected bento-panel under balanced delivery: limit is 4 (delivery), not 6 (the layout's own capacity)", () => {
      // The headline case spec §5's W3 amendment calls out by name: a
      // generous-looking auto-picked layout must not let editorial
      // discipline slip. Confirms the fixture really lands on bento-panel
      // (guards this test against silently testing the wrong branch if the
      // selection algorithm or tech's curated set ever changes).
      const heading = findAutoPickHeading("tech", "bento-panel")
      const axes = deliveryAxes("balanced")
      const build = (n: number): Slide => ({ type: "content", heading, components: paragraphs(n) })

      const atLimit = makeIR([build(4)], "tech")
      expect(resolveEffectiveLayoutId(atLimit, atLimit.slides[0], 0)).toBe("bento-panel")
      expect(codes(checkIrQuality(atLimit, axes))).not.toContain("density")

      const overLimit = makeIR([build(5)], "tech")
      const issues = checkIrQuality(overLimit, axes)
      expect(codes(issues)).toContain("density")
      const density = issues.find((i) => i.code === "density")!.density!
      expect(density.limit).toBe(4)
      expect(density.layoutId).toBe("bento-panel")
      expect(density.layoutCapacity).toBe(6)
      expect(density.deliveryBudget).toBe(4)
    })

    it("a pinned takeover id with no image component falls through to archetype auto-pick (mirrors FullSlideSvg's own fallback — validate=render)", () => {
      // "image-split" is registered and kind "takeover", but render's own
      // splitTakeover check (and this module's mirror of it) only fires
      // when an image component is present too — with none here it falls
      // back to tech's curated content set, landing on two-column
      // (capacity 4), not the takeover's "no geometric term" behavior.
      const heading = findAutoPickHeading("tech", "two-column")
      const axes = deliveryAxes("balanced")
      const build = (n: number): Slide => ({
        type: "content",
        heading,
        layout: "image-split",
        components: paragraphs(n),
      })

      const atLimit = makeIR([build(4)], "tech")
      expect(resolveEffectiveLayoutId(atLimit, atLimit.slides[0], 0)).toBe("two-column")
      expect(codes(checkIrQuality(atLimit, axes))).not.toContain("density")

      const overLimit = makeIR([build(5)], "tech")
      const issues = checkIrQuality(overLimit, axes)
      expect(codes(issues)).toContain("density")
      expect(issues.find((i) => i.code === "density")!.density?.layoutId).toBe("two-column")
    })

    it("scenario omitted defaults to the general preset (briefing x balanced x public) — density limit 4", () => {
      const atLimit = makeIR([{ type: "content", heading: "标题", components: paragraphs(4) }])
      expect(codes(checkIrQuality(atLimit))).not.toContain("density")

      const overLimit = makeIR([{ type: "content", heading: "标题", components: paragraphs(5) }])
      const issues = checkIrQuality(overLimit)
      expect(codes(issues)).toContain("density")
      const density = issues.find((i) => i.code === "density")!.density!
      expect(density.limit).toBe(4)
      expect(density.delivery).toBe("balanced")
    })

    it("does NOT warn density for a non-content slide regardless of component count (density gate is content-only)", () => {
      const ir = makeIR([{ type: "cover", heading: "封面", components: paragraphs(6) }])
      expect(codes(checkIrQuality(ir))).not.toContain("density")
    })
  })

  // ── bullets (W3 task 3: reads DELIVERY_BUDGETS[delivery].bullets instead of the old flat CAPACITY.bullets) ──

  describe("bullets gate matrix", () => {
    const deliveries: Delivery[] = ["text", "balanced", "presentation"]

    for (const delivery of deliveries) {
      const budget = DELIVERY_BUDGETS[delivery]
      const axes = deliveryAxes(delivery)

      it(`${delivery} delivery: does NOT warn bullets_overflow at exactly ${budget.bullets.maxItems} items`, () => {
        const ir = makeIR([
          {
            type: "content",
            heading: "列表页",
            components: [
              { type: "bullets", items: Array.from({ length: budget.bullets.maxItems }, (_, i) => String(i)) },
            ],
          },
        ])
        expect(codes(checkIrQuality(ir, axes))).not.toContain("bullets_overflow")
      })

      it(`${delivery} delivery: warns bullets_overflow at ${budget.bullets.maxItems + 1} items, naming the delivery`, () => {
        const ir = makeIR([
          {
            type: "content",
            heading: "列表页",
            components: [
              { type: "bullets", items: Array.from({ length: budget.bullets.maxItems + 1 }, (_, i) => String(i)) },
            ],
          },
        ])
        const issues = checkIrQuality(ir, axes)
        expect(codes(issues)).toContain("bullets_overflow")
        const issue = issues.find((i) => i.code === "bullets_overflow")!
        expect(issue.message).toContain(String(budget.bullets.maxItems))
        expect(issue.bulletsBudget).toEqual({
          delivery,
          maxItems: budget.bullets.maxItems,
          maxUnitsPerItem: budget.bullets.maxUnitsPerItem,
        })
      })

      it(`${delivery} delivery: does NOT warn bullet_item_long at exactly ${budget.bullets.maxUnitsPerItem} measureTextUnits`, () => {
        const ok = "长".repeat(budget.bullets.maxUnitsPerItem) // CJK weight = 1.0/字
        const ir = makeIR([
          { type: "content", heading: "列表页", components: [{ type: "bullets", items: [ok] }] },
        ])
        expect(codes(checkIrQuality(ir, axes))).not.toContain("bullet_item_long")
      })

      it(`${delivery} delivery: warns bullet_item_long over ${budget.bullets.maxUnitsPerItem} measureTextUnits`, () => {
        const long = "长".repeat(budget.bullets.maxUnitsPerItem + 1)
        const ir = makeIR([
          { type: "content", heading: "列表页", components: [{ type: "bullets", items: [long] }] },
        ])
        const issues = checkIrQuality(ir, axes)
        expect(codes(issues)).toContain("bullet_item_long")
        const issue = issues.find((i) => i.code === "bullet_item_long")!
        expect(issue.severity).toBe("warn")
        expect(issue.bulletsBudget?.delivery).toBe(delivery)
      })
    }

    it("scenario omitted defaults to the general preset (balanced) bullets budget — maxItems 5", () => {
      const ir = makeIR([
        {
          type: "content",
          heading: "列表页",
          components: [{ type: "bullets", items: Array.from({ length: 6 }, (_, i) => String(i)) }],
        },
      ])
      const issues = checkIrQuality(ir)
      expect(codes(issues)).toContain("bullets_overflow")
      expect(issues.find((i) => i.code === "bullets_overflow")!.bulletsBudget).toEqual({
        delivery: "balanced",
        maxItems: 5,
        maxUnitsPerItem: 40,
      })
    })
  })

  // ── placeholder pages (W5 task 1): quality gate skips all content rules ──

  it("a placeholder page reports no issues even though it is missing a heading", () => {
    const ir = makeIR([{ type: "content", placeholder: true, components: [] }])
    expect(checkIrQuality(ir)).toEqual([])
  })

  it("a placeholder page skips density/long_heading too, even when it looks overloaded", () => {
    const ir = makeIR([
      {
        type: "content",
        placeholder: true,
        heading: "标".repeat(CAPACITY.headingMaxChars + 1),
        components: paragraphs(20),
      },
    ])
    expect(checkIrQuality(ir)).toEqual([])
  })

  it("does not let placeholder:true on one slide suppress a real issue on another slide", () => {
    const ir = makeIR([
      { type: "content", placeholder: true, components: [] },
      { type: "content", components: [{ type: "paragraph", text: "hi" }] }, // no heading — real issue
    ])
    const issues = checkIrQuality(ir)
    expect(issues).toHaveLength(1)
    expect(issues[0].slide).toBe(1)
    expect(issues[0].code).toBe("missing_heading")
  })

  // ── missing_heading ──

  it("warns when content slide has no heading", () => {
    const ir = makeIR([
      {
        type: "content",
        components: [{ type: "paragraph", text: "hi" }],
      },
    ])
    expect(codes(checkIrQuality(ir))).toContain("missing_heading")
  })

  it("warns when cover slide has no heading", () => {
    const ir = makeIR([
      {
        type: "cover",
        components: [],
      },
    ])
    expect(codes(checkIrQuality(ir))).toContain("missing_heading")
  })

  it("warns when chapter slide has no heading", () => {
    const ir = makeIR([
      {
        type: "chapter",
        components: [],
      },
    ])
    expect(codes(checkIrQuality(ir))).toContain("missing_heading")
  })

  it("does NOT warn missing_heading for ending slide", () => {
    const ir = makeIR([
      {
        type: "ending",
        components: [],
      },
    ])
    expect(codes(checkIrQuality(ir))).not.toContain("missing_heading")
  })

  it("does NOT warn missing_heading for background-image-only pages", () => {
    const ir = makeIR([
      {
        type: "content",
        components: [{ type: "image", asset_id: "hero", fit: "cover" }],
      },
    ])
    expect(codes(checkIrQuality(ir))).not.toContain("missing_heading")
  })

  // ── long_heading ──

  it(`warns when heading exceeds ${CAPACITY.headingMaxChars} characters`, () => {
    const ir = makeIR([
      {
        type: "content",
        heading:
          "这是一个超过四十个字符的标题用来测试标题过长告警功能是否正常工作的完整长句子啊你好世界。这句真的很长",
        components: [],
      },
    ])
    const issues = checkIrQuality(ir)
    expect(codes(issues)).toContain("long_heading")
    expect(issues.find((i) => i.code === "long_heading")!.message).toContain(
      "断言式短句"
    )
  })

  it(`does NOT warn for heading at exactly ${CAPACITY.headingMaxChars} characters`, () => {
    const ir = makeIR([
      {
        type: "content",
        heading: "a".repeat(CAPACITY.headingMaxChars),
        components: [],
      },
    ])
    expect(codes(checkIrQuality(ir))).not.toContain("long_heading")
  })

  // ── big_number_no_kpi ──

  it("warns when big_number variant lacks kpi_cards component", () => {
    const ir = makeIR([
      {
        type: "content",
        heading: "大数字",
        arrangement: "big_number",
        components: [{ type: "paragraph", text: "oops" }],
      },
    ])
    expect(codes(checkIrQuality(ir))).toContain("big_number_no_kpi")
  })

  it("does NOT warn big_number_no_kpi when kpi_cards present", () => {
    const ir = makeIR([
      {
        type: "content",
        heading: "大数字",
        arrangement: "big_number",
        components: [
          {
            type: "kpi_cards",
            items: [{ value: "99%", label: "完成率" }],
          },
        ],
      },
    ])
    expect(codes(checkIrQuality(ir))).not.toContain("big_number_no_kpi")
  })

  // ── multiple issues on one slide ──

  it("can report multiple issues on a single slide (default scenario: general/balanced)", () => {
    const budget = DELIVERY_BUDGETS.balanced
    const ir = makeIR([
      {
        type: "content",
        // no heading + over the density limit + bullets overflow
        components: [
          { type: "bullets", items: Array.from({ length: budget.bullets.maxItems + 1 }, (_, i) => String(i)) },
          ...paragraphs(budget.maxComponentsPerSlide),
        ],
      },
    ])
    const c = codes(checkIrQuality(ir))
    expect(c).toContain("density")
    expect(c).toContain("bullets_overflow")
    expect(c).toContain("missing_heading")
  })

  // ── slide index correctness ──

  it("reports correct slide index (0-based)", () => {
    const ir = makeIR([
      { type: "cover", heading: "OK", components: [] },
      {
        type: "content",
        // no heading
        components: [{ type: "paragraph", text: "x" }],
      },
    ])
    const issues = checkIrQuality(ir)
    expect(issues).toHaveLength(1)
    expect(issues[0].slide).toBe(1)
  })
})
