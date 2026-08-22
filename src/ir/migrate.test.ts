import { describe, expect, it } from "vitest"
import { PptfastError } from "../errors"
import { migrateBloomToClassroom, migrateChromeToBranding, migrateIrV3ToV4, migrateLogoWallToImageGrid } from "./migrate"
import { PptxIRV3Schema, type PptxIRV3 } from "./legacy-v3"
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

  it("rewrites chrome to branding so a v3 object that carried chrome does not drop it", () => {
    const v3 = { ...baseV3({ scenario: "boardroom-report" }), chrome: "minimal" } as PptxIRV3
    const v4 = migrateIrV3ToV4(v3)
    expect(v4.version).toBe("4")
    expect(v4.narrative).toBe("boardroom-report")
    expect(v4.branding).toBe("minimal")
    expect("chrome" in v4).toBe(false)
  })

  it("rewrites bloom theme id to classroom so a v3 object that carried bloom comes out v4 classroom", () => {
    const v3 = baseV3({
      scenario: { mode: "narrative", delivery: "text" },
      theme: { id: "bloom", style: { colors: { primary: "#D89A8E" } } },
    })
    const v4 = migrateIrV3ToV4(v3)
    expect(v4.version).toBe("4")
    expect(v4.theme.id).toBe("classroom")
    expect(v4.theme.style).toEqual({ colors: { primary: "#D89A8E" } })
    expect(v4.narrative).toEqual({ strategy: "storytelling", pacing: "dense" })
  })
})

describe("migrateChromeToBranding", () => {
  it.each(["full", "cover-only", "minimal"] as const)("rewrites chrome %s to branding, dropping the chrome key", (value) => {
    const result = migrateChromeToBranding({ chrome: value, filename: "x" }) as Record<string, unknown>
    expect(result).toEqual({ branding: value, filename: "x" })
    expect("chrome" in result).toBe(false)
  })

  it("neither key is identity: no branding default is materialized", () => {
    const result = migrateChromeToBranding({ filename: "x" }) as Record<string, unknown>
    expect("chrome" in result).toBe(false)
    expect("branding" in result).toBe(false)
    expect(result.filename).toBe("x")
  })

  it("only branding is identity", () => {
    const result = migrateChromeToBranding({ branding: "cover-only", filename: "x" }) as Record<string, unknown>
    expect(result).toEqual({ branding: "cover-only", filename: "x" })
    expect("chrome" in result).toBe(false)
  })

  it("both keys is a hard error naming chrome and branding", () => {
    const input = { chrome: "full", branding: "minimal" }
    expect(() => migrateChromeToBranding(input)).toThrow(PptfastError)
    expect(() => migrateChromeToBranding(input)).toThrow(/chrome/)
    expect(() => migrateChromeToBranding(input)).toThrow(/branding/)
  })

  it("non-object input passes through unchanged", () => {
    expect(migrateChromeToBranding(null)).toBeNull()
    expect(migrateChromeToBranding("not-an-object")).toBe("not-an-object")
    expect(migrateChromeToBranding(42)).toBe(42)
    const arr = [{ chrome: "full" }]
    expect(migrateChromeToBranding(arr)).toBe(arr)
  })

  it("does not mutate the input", () => {
    const input = { chrome: "full", meta: { organization: "ACME" } }
    const snapshot = JSON.parse(JSON.stringify(input))
    const result = migrateChromeToBranding(input)
    expect(input).toEqual(snapshot)
    expect(result).not.toBe(input)
    expect(result).toEqual({ branding: "full", meta: { organization: "ACME" } })
  })
})

describe("migrateBloomToClassroom", () => {
  it("rewrites IR theme.id bloom to classroom and preserves other theme fields", () => {
    const input = { theme: { id: "bloom", style: { colors: { primary: "#D89A8E" } }, brand: { footer: false } } }
    const result = migrateBloomToClassroom(input) as { theme: Record<string, unknown> }
    expect(result.theme.id).toBe("classroom")
    expect(result.theme.style).toEqual({ colors: { primary: "#D89A8E" } })
    expect(result.theme.brand).toEqual({ footer: false })
    expect(result.theme).not.toBe(input.theme)
  })

  it("rewrites spec theme string bloom to classroom", () => {
    const result = migrateBloomToClassroom({ theme: "bloom", pages: [] }) as Record<string, unknown>
    expect(result.theme).toBe("classroom")
    expect(result.pages).toEqual([])
  })

  it("classroom / omitted theme / other ids are identity: same reference", () => {
    const classroomIr = { theme: { id: "classroom" } }
    expect(migrateBloomToClassroom(classroomIr)).toBe(classroomIr)
    const classroomSpec = { theme: "classroom" }
    expect(migrateBloomToClassroom(classroomSpec)).toBe(classroomSpec)
    const omitted = { filename: "x" }
    expect(migrateBloomToClassroom(omitted)).toBe(omitted)
    const other = { theme: { id: "consulting" } }
    expect(migrateBloomToClassroom(other)).toBe(other)
    const otherSpec = { theme: "tech" }
    expect(migrateBloomToClassroom(otherSpec)).toBe(otherSpec)
  })

  it("non-object input passes through unchanged", () => {
    expect(migrateBloomToClassroom(null)).toBeNull()
    expect(migrateBloomToClassroom("not-an-object")).toBe("not-an-object")
    expect(migrateBloomToClassroom(42)).toBe(42)
    const arr = [{ theme: "bloom" }]
    expect(migrateBloomToClassroom(arr)).toBe(arr)
  })

  it("does not mutate the input", () => {
    const input = { theme: { id: "bloom", style: { colors: { primary: "#D89A8E" } } } }
    const snapshot = JSON.parse(JSON.stringify(input))
    const result = migrateBloomToClassroom(input)
    expect(input).toEqual(snapshot)
    expect(result).not.toBe(input)
    expect((result as { theme: unknown }).theme).not.toBe(input.theme)
  })
})

describe("migrateLogoWallToImageGrid", () => {
  const fourItems = [
    { asset_id: "logo-1", label: "Acme" },
    { asset_id: "logo-2" },
    { asset_id: "logo-3", label: "Beta", extra: "drop-me" },
    { asset_id: "logo-4", label: "Gamma" },
  ]
  const mappedFourItems = [
    { asset_id: "logo-1", caption: "Acme" },
    { asset_id: "logo-2" },
    { asset_id: "logo-3", caption: "Beta" },
    { asset_id: "logo-4", caption: "Gamma" },
  ]
  const wall = {
    type: "logo_wall",
    title: "Partners",
    emphasis: "first",
    someUnknown: "x",
    items: fourItems,
  }
  const irWith = (component: unknown) => ({
    version: "4",
    filename: "x",
    slides: [{ type: "content", heading: "h", components: [component] }],
  })

  it("rewrites a 4-item logo_wall in slides[].components[] to image_grid, mapping label→caption and dropping leftover keys", () => {
    const input = irWith(wall)
    const result = migrateLogoWallToImageGrid(input) as {
      slides: Array<{ type: string; heading: string; components: Array<Record<string, unknown>> }>
    }
    expect(result.slides[0]!.heading).toBe("h")
    expect(result.slides[0]!.components).toHaveLength(1)
    expect(result.slides[0]!.components[0]).toEqual({ type: "image_grid", items: mappedFourItems })
    expect(result.slides[0]!.components[0]!.items).toHaveLength(4)
    expect((result.slides[0]!.components[0]!.items as Array<{ asset_id: string }>).map((item) => item.asset_id)).toEqual([
      "logo-1",
      "logo-2",
      "logo-3",
      "logo-4",
    ])
    expect(Object.keys(result.slides[0]!.components[0]!)).toEqual(["type", "items"])
    expect((result.slides[0]!.components[0]!.items as Array<Record<string, unknown>>)[1]).toEqual({ asset_id: "logo-2" })
    expect((result.slides[0]!.components[0]!.items as Array<Record<string, unknown>>)[2]).toEqual({
      asset_id: "logo-3",
      caption: "Beta",
    })
  })

  it("keeps only the first 4 items of an 8-item wall (image_grid ceiling is 4)", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ asset_id: `logo-${i + 1}` }))
    const result = migrateLogoWallToImageGrid(irWith({ type: "logo_wall", title: "Partners", items })) as {
      slides: Array<{ components: Array<{ type: string; items: Array<{ asset_id: string }> }> }>
    }
    const rewritten = result.slides[0]!.components[0]!
    expect(rewritten.type).toBe("image_grid")
    expect(rewritten.items).toHaveLength(4)
    expect(rewritten.items.map((item) => item.asset_id)).toEqual(["logo-1", "logo-2", "logo-3", "logo-4"])
  })

  it("IR with only paragraph / omitted components / already image_grid is identity: same reference", () => {
    const paragraphIr = irWith({ type: "paragraph", text: "hi" })
    expect(migrateLogoWallToImageGrid(paragraphIr)).toBe(paragraphIr)
    const omitted = { version: "4", filename: "x", slides: [{ type: "cover", heading: "h" }] }
    expect(migrateLogoWallToImageGrid(omitted)).toBe(omitted)
    const already = irWith({
      type: "image_grid",
      items: [{ asset_id: "a" }, { asset_id: "b" }],
    })
    expect(migrateLogoWallToImageGrid(already)).toBe(already)
  })

  it("does not mutate the input", () => {
    const input = irWith(wall)
    const snapshot = JSON.parse(JSON.stringify(input))
    const result = migrateLogoWallToImageGrid(input)
    expect(input).toEqual(snapshot)
    expect(result).not.toBe(input)
  })

  it("non-object input passes through unchanged", () => {
    expect(migrateLogoWallToImageGrid(null)).toBeNull()
    expect(migrateLogoWallToImageGrid("not-an-object")).toBe("not-an-object")
    expect(migrateLogoWallToImageGrid(42)).toBe(42)
    const arr = [{ type: "logo_wall", items: fourItems }]
    expect(migrateLogoWallToImageGrid(arr)).toBe(arr)
  })

  it("rewrites a page-shaped { components: [...] } object, not only a full IR", () => {
    const page = { components: [wall] }
    const result = migrateLogoWallToImageGrid(page) as { components: Array<Record<string, unknown>> }
    expect(result.components).toHaveLength(1)
    expect(result.components[0]).toEqual({ type: "image_grid", items: mappedFourItems })
    expect(result).not.toBe(page)
  })

  it("migrateIrV3ToV4 rewrites a logo_wall slide (cast, do not parse leftover through PptxIRV3Schema)", () => {
    const v3 = {
      ...baseV3(),
      slides: [{ type: "content", heading: "h", components: [wall] }],
    } as PptxIRV3
    const v4 = migrateIrV3ToV4(v3)
    const rewritten = v4.slides[0]!.components[0] as Record<string, unknown>
    expect(rewritten).toEqual({ type: "image_grid", items: mappedFourItems })
  })

  it("non-array items still emit { type: image_grid, items: as-is } (mechanical, not validating)", () => {
    const input = irWith({ type: "logo_wall", title: "Partners", items: "not-an-array" })
    const result = migrateLogoWallToImageGrid(input) as {
      slides: Array<{ components: Array<Record<string, unknown>> }>
    }
    expect(result.slides[0]!.components[0]).toEqual({ type: "image_grid", items: "not-an-array" })
  })
})
