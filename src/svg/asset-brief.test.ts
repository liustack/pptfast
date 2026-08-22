// @vitest-environment node
//
// Runs under the real Node platform (linkedom DOMParser via the platform
// registry seam) — the same reasoning `deck-audit.test.ts` documents for its
// own `@vitest-environment node` choice: this exercises `buildAssetBrief`'s
// actual documented Node consumption path end-to-end, not jsdom's incidental
// global filling in unasked.
import { beforeAll, describe, expect, it } from "vitest"
import type { Component, PptxIR, Slide } from "@/ir"
import { getInstalledThemeIds } from "../themes/definitions"
import { installNodePlatform } from "../platform/node"
import { buildAssetBrief } from "./asset-brief"

beforeAll(() => {
  installNodePlatform()
})

function deck(themeId: string, slides: Slide[], overrides: Partial<PptxIR> = {}): PptxIR {
  return {
    version: "4",
    filename: "asset-brief-fixture",
    theme: { id: themeId },
    meta: {},
    seed: 7,
    assets: { images: {} },
    slides,
    ...overrides,
  } as PptxIR
}

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

function imageComponent(assetId: string, extra: Partial<Component> = {}): Component {
  return { type: "image", asset_id: assetId, fit: "cover", ...extra } as Component
}

/**
 * The controller's own probe deck (task brief §"验收" 1 / plan §"验收"):
 * two-column + consulting, a real visual slot. `image.tsx`'s
 * own `measure` (613 * 0.5 rounds to 307, under the 340 cap) is what this
 * pins against — but this test never imports that constant, it only asserts
 * on `buildAssetBrief`'s output, which is exactly the point (裁定 1: the
 * frame must come from a real render, not a copied formula).
 */
function probeDeck(assetId = "pic"): PptxIR {
  return deck("consulting", [
    {
      type: "content",
      id: "p1",
      layout: "two-column",
      heading: "Regional growth engine",
      components: [
        imageComponent(assetId),
        { type: "paragraph", text: "APAC contributed 42% of net-new revenue this quarter." } as Component,
      ],
    } as Slide,
  ])
}

describe("buildAssetBrief — probe fixture (real render, not a copied constant)", () => {
  it("reports the actual rendered frame 528x264 / 2:1, not a copied slot constant", () => {
    const brief = buildAssetBrief(probeDeck())
    expect(brief.items).toHaveLength(1)
    const item = brief.items[0]!
    expect(item.asset_id).toBe("pic")
    expect(item.rendered).toBe(true)
    expect(item.missing).toBe(true) // no assets.images entry was supplied
    // x/y measured off the real two-column render, not copied from a
    // layout geometry comment. The height is the image's own 2:1 cap
    // inside the left column, not the column's full height.
    expect(item.frame).toEqual({ x: 96, y: 244, w: 528, h: 264, aspect: "2:1" })
    expect(item.suggested_pixels).toEqual({ w: 1056, h: 528 })
  })

  it("reports missing: false once the asset is actually resolved, frame stays identical", () => {
    const ir = probeDeck()
    ir.assets.images.pic = { src: TINY_PNG }
    const brief = buildAssetBrief(ir)
    const item = brief.items[0]!
    expect(item.missing).toBe(false)
    expect(item.rendered).toBe(true)
    expect(item.frame).toEqual({ x: 96, y: 244, w: 528, h: 264, aspect: "2:1" })
  })

  it("never mutates the input ir (dummy injection is a render-only in-memory copy)", () => {
    const ir = probeDeck()
    const before = JSON.parse(JSON.stringify(ir))
    buildAssetBrief(ir)
    expect(ir).toEqual(before)
  })
})

// A11Y-01 alt chain wave, task 1: "asset-brief 的输出顺手带上 alt（若有）"
// (plan 裁定 3) — a small additive field, not a shape change.
describe("buildAssetBrief — alt passthrough (A11Y-01)", () => {
  it("carries the asset's alt text through onto its item when present", () => {
    const ir = probeDeck()
    ir.assets.images.pic = { src: TINY_PNG, alt: "团队庆祝产品发布" }
    const item = buildAssetBrief(ir).items[0]!
    expect(item.alt).toBe("团队庆祝产品发布")
  })

  it("leaves alt undefined (not an empty string) when the asset has none — dropped entirely by JSON.stringify, same as this file's other optional fields (frame/suggested_pixels)", () => {
    const item = buildAssetBrief(probeDeck()).items[0]!
    expect(item.alt).toBeUndefined()
    expect(JSON.parse(JSON.stringify(item))).not.toHaveProperty("alt")
  })
})

describe("buildAssetBrief — missing-asset deck", () => {
  it("lists an unresolved asset_id with missing: true and a non-empty suggested_prompt, renderer stays untouched (no assets.images write)", () => {
    const ir = probeDeck("not-yet-generated")
    const brief = buildAssetBrief(ir)
    expect(ir.assets.images).toEqual({}) // renderer/caller-visible IR never gains the dummy
    const item = brief.items[0]!
    expect(item.missing).toBe(true)
    expect(item.suggested_prompt.length).toBeGreaterThan(0)
    expect(item.suggested_prompt).toContain(item.palette.primary)
  })
})

describe("buildAssetBrief — component never rendered under the selected layout", () => {
  it("marks rendered: false and omits frame/suggested_pixels rather than dropping the item", () => {
    // A cover layout's own template never reads `slide.components` at all
    // (it renders a fixed heading/subheading/decor layout) — an `image`
    // component placed on a cover slide (with a non-asset background, so
    // `imageCoverTakeover` never engages) is guaranteed to be present in the
    // IR yet never emit an `<image>` anywhere in the rendered markup. This is
    // a deterministic, structural way to exercise the "component silently
    // has no slot" path without depending on a fragile overflow-budget guess.
    const ir = deck("consulting", [
      {
        type: "cover",
        id: "c1",
        layout: "banner-title",
        heading: "Cover",
        components: [imageComponent("orphan")],
      } as Slide,
    ])
    const brief = buildAssetBrief(ir)
    expect(brief.items).toHaveLength(1)
    const item = brief.items[0]!
    expect(item.asset_id).toBe("orphan")
    expect(item.rendered).toBe(false)
    expect(item.frame).toBeUndefined()
    expect(item.suggested_pixels).toBeUndefined()
    // palette/mood/prompt still fully assembled — never dropped silently.
    expect(item.palette.hexes.length).toBeGreaterThan(0)
    expect(item.mood.description.length).toBeGreaterThan(0)
    expect(item.suggested_prompt).toContain("was not rendered")
  })
})

describe("buildAssetBrief — shared asset_id across multiple components on one page", () => {
  // Reviewer repro: `two-column` renders `components[0]` (an
  // image/chart) in the left column and stacks every other component,
  // including a later `image`, into the right column. Two *different* `image`
  // components legally share one `asset_id` (bare string, no uniqueness
  // constraint — `src/ir/index.ts`) — since both resolve to the exact same
  // dummy href, the rendered SVG offers no way to tell which `<image>`
  // belongs to which component (href-based attribution is impossible in
  // principle, not just unimplemented). The fix this test pins: never guess
  // (the previous `Array.prototype.shift()`-off-a-FIFO-queue logic silently
  // paired frames to occurrences in DOM/extraction order, which is *not*
  // `slide.components` order here — body renders before the visual column in
  // the layout's own JSX, so the queue was backwards and every frame was
  // swapped) — instead emit one honest, explicitly `shared` item per real
  // rendered frame, both present, neither claiming a specific component.
  it("emits one shared item per rendered frame, both real frames present and correctly valued, no swapped attribution claim", () => {
    const ir = deck("consulting", [
      {
        type: "content",
        id: "p1",
        layout: "two-column",
        heading: "Regional growth engine",
        components: [
          imageComponent("shared"),
          { type: "paragraph", text: "APAC contributed 42% of net-new revenue this quarter." } as Component,
          imageComponent("shared"),
        ],
      } as Slide,
    ])
    const brief = buildAssetBrief(ir)
    const sharedItems = brief.items.filter((i) => i.asset_id === "shared")
    expect(sharedItems).toHaveLength(2)
    expect(sharedItems.every((i) => i.shared === true)).toBe(true)
    expect(sharedItems.every((i) => i.occurrenceCount === 2)).toBe(true)
    expect(sharedItems.every((i) => i.rendered === true)).toBe(true)
    const frames = sharedItems.map((i) => i.frame)
    // Left column and right column frames must both survive, as a set.
    // Order is DOM/extraction order, not a claim about which component
    // produced which frame.
    expect(frames).toContainEqual(expect.objectContaining({ x: 96, w: 528, h: 264 }))
    expect(frames).toContainEqual(expect.objectContaining({ x: 656, w: 528, h: 264 }))
  })

  it("single-occurrence pages are unaffected: no `shared`/`occurrenceCount` fields, same output shape as before", () => {
    const item = buildAssetBrief(probeDeck()).items[0]!
    expect(item.shared).toBeUndefined()
    expect(item.occurrenceCount).toBeUndefined()
    expect(item.kind).toBe("image")
  })
})

describe("buildAssetBrief — every built-in theme", () => {
  it.each(getInstalledThemeIds())("assembles complete palette/mood fields for theme %s", (themeId) => {
    const ir = probeDeck()
    ir.theme.id = themeId
    const brief = buildAssetBrief(ir)
    expect(brief.theme).toBe(themeId)
    const item = brief.items[0]!
    expect(item.palette.hexes.length).toBeGreaterThan(0)
    expect(item.palette.primary).toMatch(/^#/)
    expect(item.palette.accent).toMatch(/^#/)
    expect(Array.isArray(item.mood.tags)).toBe(true)
    expect(item.mood.description.length).toBeGreaterThan(0)
    expect(item.suggested_prompt.length).toBeGreaterThan(0)
  })
})

describe("buildAssetBrief — determinism", () => {
  it("same IR in, deep-equal AssetBrief out, across two independent calls", () => {
    const ir = probeDeck()
    const first = buildAssetBrief(ir)
    const second = buildAssetBrief(ir)
    expect(second).toEqual(first)
  })
})

describe("buildAssetBrief — fit note", () => {
  it("cover mode names the crop behavior and safe zone", () => {
    const item = buildAssetBrief(probeDeck()).items[0]!
    expect(item.fit.mode).toBe("cover")
    expect(item.fit.note).toContain("center")
  })

  it("contain mode names the letterbox behavior", () => {
    const ir = probeDeck()
    ;(ir.slides[0]!.components[0] as { fit: string }).fit = "contain"
    const item = buildAssetBrief(ir).items[0]!
    expect(item.fit.mode).toBe("contain")
    expect(item.fit.note).toContain("letterbox")
  })
})
