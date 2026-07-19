import { describe, expect, it } from "vitest"
import { migrateIrV3ToV4 } from "./migrate"
import { PptxIRV3Schema } from "./legacy-v3"
import { STRATEGY_VALUES, PACING_VALUES, AUDIENCE_VALUES } from "./narrative-values"

/**
 * Property tests for `migrateIrV3ToV4` (vocabulary-v4 rename, task 1) —
 * every line of spec §9.1's field/value mapping table gets its own case:
 *
 * ```text
 * version: "3"                         → version: "4"
 * scenario                             → narrative
 * scenario.mode                        → narrative.strategy
 * scenario.mode: "narrative"           → narrative.strategy: "storytelling"
 * scenario.delivery                    → narrative.pacing
 * scenario.delivery: "text"            → narrative.pacing: "dense"
 * scenario.delivery: "balanced"        → narrative.pacing: "balanced"
 * scenario.delivery: "presentation"    → narrative.pacing: "spacious"
 * scenario.audience                    → narrative.audience
 * ```
 *
 * Plus spec §9.1's "其余 IR 字段保持不变" (everything else unchanged) and §5's
 * "预设 ID 保持不变" (a preset-name string passes through unchanged).
 */

const baseV3 = (extra: Record<string, unknown> = {}) =>
  PptxIRV3Schema.parse({
    version: "3",
    filename: "migrate-test",
    theme: { id: "consulting" },
    meta: { organization: "ACME" },
    assets: { images: {} },
    slides: [{ type: "cover", heading: "x", components: [] }],
    ...extra,
  })

describe("migrateIrV3ToV4", () => {
  it("version: \"3\" → \"4\"", () => {
    const v4 = migrateIrV3ToV4(baseV3())
    expect(v4.version).toBe("4")
  })

  it("an omitted scenario stays omitted (no narrative field materialized) — both resolvers fall back to the same general preset", () => {
    const v4 = migrateIrV3ToV4(baseV3())
    expect(v4.narrative).toBeUndefined()
  })

  it("a preset-id string scenario carries straight across unchanged (spec §5: preset ids are not renamed)", () => {
    for (const preset of [
      "general",
      "boardroom-report",
      "pitch",
      "training",
      "product-launch",
      "weekly-brief",
      "annual-review",
    ]) {
      const v4 = migrateIrV3ToV4(baseV3({ scenario: preset }))
      expect(v4.narrative).toBe(preset)
    }
  })

  it("scenario → narrative: an axes object moves from the scenario key to the narrative key", () => {
    const v4 = migrateIrV3ToV4(baseV3({ scenario: { mode: "pyramid" } }))
    expect(v4.narrative).toEqual({ strategy: "pyramid" })
  })

  it("scenario.mode → narrative.strategy: every mode value except \"narrative\" carries across unchanged", () => {
    for (const mode of ["pyramid", "instructional", "showcase", "briefing"]) {
      const v4 = migrateIrV3ToV4(baseV3({ scenario: { mode } }))
      expect(v4.narrative).toEqual({ strategy: mode })
    }
  })

  it('scenario.mode: "narrative" → narrative.strategy: "storytelling" (the one renamed mode value)', () => {
    const v4 = migrateIrV3ToV4(baseV3({ scenario: { mode: "narrative" } }))
    expect(v4.narrative).toEqual({ strategy: "storytelling" })
  })

  it('scenario.delivery: "text" → narrative.pacing: "dense"', () => {
    const v4 = migrateIrV3ToV4(baseV3({ scenario: { delivery: "text" } }))
    expect(v4.narrative).toEqual({ pacing: "dense" })
  })

  it('scenario.delivery: "balanced" → narrative.pacing: "balanced" (unchanged)', () => {
    const v4 = migrateIrV3ToV4(baseV3({ scenario: { delivery: "balanced" } }))
    expect(v4.narrative).toEqual({ pacing: "balanced" })
  })

  it('scenario.delivery: "presentation" → narrative.pacing: "spacious"', () => {
    const v4 = migrateIrV3ToV4(baseV3({ scenario: { delivery: "presentation" } }))
    expect(v4.narrative).toEqual({ pacing: "spacious" })
  })

  it("scenario.audience → narrative.audience: every audience value carries across unchanged (audience is not renamed, spec §4.3)", () => {
    for (const audience of ["executive", "technical", "customer", "public"]) {
      const v4 = migrateIrV3ToV4(baseV3({ scenario: { audience } }))
      expect(v4.narrative).toEqual({ audience })
    }
  })

  it("a fully-specified axes object maps every key and value in one pass", () => {
    const v4 = migrateIrV3ToV4(baseV3({ scenario: { mode: "narrative", delivery: "text", audience: "customer" } }))
    expect(v4.narrative).toEqual({ strategy: "storytelling", pacing: "dense", audience: "customer" })
  })

  it("an unrecognized scenario key passes through unchanged (mechanical, not validating — resolveNarrative rejects it downstream)", () => {
    const v4 = migrateIrV3ToV4(baseV3({ scenario: { mode: "pyramid", speed: "fast" } }))
    expect(v4.narrative).toEqual({ strategy: "pyramid", speed: "fast" })
  })

  it("an unrecognized mode/delivery value passes through unchanged (identity fallback, not a throw)", () => {
    const v4 = migrateIrV3ToV4(baseV3({ scenario: { mode: "bogus-mode", delivery: "bogus-delivery" } }))
    expect(v4.narrative).toEqual({ strategy: "bogus-mode", pacing: "bogus-delivery" })
  })

  it("every other field carries across unchanged (spec §9.1: 其余 IR 字段保持不变)", () => {
    const v3 = baseV3({
      scenario: { mode: "pyramid" },
      brand: { logo_asset_id: "logo-1", position: "tl" },
      seed: 42,
      slides: [
        { id: "s1", type: "cover", heading: "Cover", components: [] },
        { id: "s2", type: "content", heading: "Body", components: [{ type: "paragraph", text: "hi" }] },
      ],
    })
    const v4 = migrateIrV3ToV4(v3)
    expect(v4.filename).toBe(v3.filename)
    expect(v4.theme).toEqual(v3.theme)
    expect(v4.meta).toEqual(v3.meta)
    expect(v4.assets).toEqual(v3.assets)
    expect(v4.brand).toEqual(v3.brand)
    expect(v4.seed).toBe(v3.seed)
    expect(v4.slides).toEqual(v3.slides)
  })

  // spec §12 output row "speaker notes、动画、渐变和媒体去重不受影响" (task 4):
  // migrateIrV3ToV4 only ever rewrites the root scenario/mode/delivery
  // fields (spec §9.1) — speaker notes and gradient backgrounds live inside
  // `slides[]`, the deck-level animation switch lives inside `meta`, and
  // media-dedup source data lives inside `assets.images`, so the same
  // generic "carries across unchanged" proof above already covers them
  // structurally. This case makes that coverage explicit instead of
  // implicit: a fixture that actually populates all four, asserting each
  // survives migration byte-for-byte. Render-time behavior for these
  // features (dedup logic, animation XML, gradient fill, notesSlide export)
  // is unchanged code (spec §10) with its own dedicated test suites
  // (generate-notes-export.test.ts, generate-animations.test.ts,
  // generate-gradient-fallback.test.ts, pptx-dedupe-media.test.ts) — out of
  // scope for a migration-function unit test, in scope only for "does the
  // migration function preserve the data those suites depend on."
  it("speaker notes, deck-level animation, gradient backgrounds, and duplicate media references all carry across unchanged", () => {
    const v3 = baseV3({
      meta: { organization: "ACME", animation: { transition: "push", elements: "auto" } },
      assets: {
        images: {
          logo: { src: "data:image/png;base64,AAAA", alt: "logo" },
          "logo-dup": { src: "data:image/png;base64,AAAA", alt: "logo again, same bytes" },
        },
      },
      slides: [
        {
          type: "cover",
          heading: "Cover",
          notes: "speaker notes for the cover slide",
          background: { kind: "gradient", from: "#111111", to: "#EEEEEE", direction: "diagonal" },
          components: [],
        },
        {
          type: "content",
          heading: "Body",
          notes: "speaker notes for the body slide",
          components: [{ type: "paragraph", text: "hi" }],
        },
      ],
    })
    const v4 = migrateIrV3ToV4(v3)
    expect(v4.meta).toEqual(v3.meta)
    expect(v4.assets).toEqual(v3.assets)
    expect(v4.slides).toEqual(v3.slides)
    // Spot-assert the individual fields too, not just the container objects,
    // so a future SlideSchema/MetaSchema field rename can't accidentally
    // satisfy `toEqual` on two empty containers and hide a real regression.
    expect(v4.meta?.animation).toEqual({ transition: "push", elements: "auto" })
    expect(v4.assets?.images.logo.src).toBe(v4.assets?.images["logo-dup"]?.src)
    expect(v4.slides[0]?.notes).toBe("speaker notes for the cover slide")
    expect(v4.slides[0]?.background).toEqual({ kind: "gradient", from: "#111111", to: "#EEEEEE", direction: "diagonal" })
    expect(v4.slides[1]?.notes).toBe("speaker notes for the body slide")
  })

  it("omits brand/seed on the v4 output when the v3 input omits them (no synthesized defaults)", () => {
    const v4 = migrateIrV3ToV4(baseV3())
    expect(v4.brand).toBeUndefined()
    expect(v4.seed).toBeUndefined()
  })

  it("is pure: never mutates its input", () => {
    const v3 = baseV3({ scenario: { mode: "pyramid", delivery: "text" } })
    const snapshot = JSON.parse(JSON.stringify(v3))
    migrateIrV3ToV4(v3)
    expect(v3).toEqual(snapshot)
  })

  it("is deterministic: repeated calls on the same input produce deep-equal output", () => {
    const v3 = baseV3({ scenario: { mode: "narrative", delivery: "presentation", audience: "technical" } })
    expect(migrateIrV3ToV4(v3)).toEqual(migrateIrV3ToV4(v3))
  })

  // Sanity: the value tuples this test file's own literal strings are pinned
  // against haven't drifted out from under it.
  it("STRATEGY_VALUES/PACING_VALUES/AUDIENCE_VALUES still contain the v4 values this suite asserts against", () => {
    expect(STRATEGY_VALUES).toContain("storytelling")
    expect(PACING_VALUES).toEqual(["dense", "balanced", "spacious"])
    expect(AUDIENCE_VALUES).toEqual(["executive", "technical", "customer", "public"])
  })
})
