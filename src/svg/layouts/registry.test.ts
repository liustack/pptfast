import { describe, expect, it } from "vitest"
import { STRATEGY_VALUES, type Strategy } from "@/narrative"
import { COVER_ARCHETYPES } from "../archetypes"
import { CHAPTER_ARCHETYPES } from "../archetypes/index-chapter"
import { CONTENT_ARCHETYPES } from "../archetypes/index-content"
import { ENDING_ARCHETYPES } from "../archetypes/index-ending"
import {
  filterByNarrativesOnly,
  getLayout,
  LAYOUT_REGISTRY,
  layoutsForSlideType,
  type LayoutDefinition,
  type SlideType,
} from "./registry"

/**
 * The four real archetype registries paired with the `SlideType` their family
 * renders as — this is the drift guard: every id the render chain actually
 * dispatches through must have a matching `LAYOUT_REGISTRY` entry, so if a
 * future archetype is added to one of these without a registry entry, this
 * test fails loudly instead of the metadata silently going stale.
 */
const FAMILIES: { registry: Record<string, unknown>; slideType: SlideType }[] = [
  { registry: COVER_ARCHETYPES, slideType: "cover" },
  { registry: CHAPTER_ARCHETYPES, slideType: "chapter" },
  { registry: CONTENT_ARCHETYPES, slideType: "content" },
  { registry: ENDING_ARCHETYPES, slideType: "ending" },
]

const TAKEOVER_IDS = ["image-split", "image-top", "image-bottom", "image-annotate"] as const

describe("LAYOUT_REGISTRY completeness (archetype ids)", () => {
  for (const { registry, slideType } of FAMILIES) {
    for (const id of Object.keys(registry)) {
      it(`${slideType} archetype "${id}" has a matching registry entry`, () => {
        const entry = LAYOUT_REGISTRY[id]
        expect(entry, `missing LAYOUT_REGISTRY entry for archetype id "${id}"`).toBeDefined()
        expect(entry.id).toBe(id)
        expect(entry.kind).toBe("archetype")
        expect(entry.slideTypes).toContain(slideType)
      })
    }
  }

  it("has exactly 33 archetype-kind entries, all traceable to one of the four real registries (P1 variety wave task 4: content 7 -> 10)", () => {
    const knownIds = new Set([
      ...Object.keys(COVER_ARCHETYPES),
      ...Object.keys(CHAPTER_ARCHETYPES),
      ...Object.keys(CONTENT_ARCHETYPES),
      ...Object.keys(ENDING_ARCHETYPES),
    ])
    const archetypeEntries = Object.values(LAYOUT_REGISTRY).filter((e) => e.kind === "archetype")
    expect(archetypeEntries).toHaveLength(33)
    for (const entry of archetypeEntries) {
      expect(knownIds.has(entry.id), `"${entry.id}" is not a real archetype id`).toBe(true)
    }
  })
})

describe("LAYOUT_REGISTRY completeness (takeover ids)", () => {
  for (const id of TAKEOVER_IDS) {
    it(`"${id}" is registered as a content takeover with a "first" image slot`, () => {
      const entry = LAYOUT_REGISTRY[id]
      expect(entry, `missing LAYOUT_REGISTRY entry for takeover id "${id}"`).toBeDefined()
      expect(entry.id).toBe(id)
      expect(entry.kind).toBe("takeover")
      expect(entry.slideTypes).toEqual(["content"])
      const image = entry.slots.find((s) => s.name === "image")
      expect(image?.selection).toBe("first")
    })
  }

  it("has exactly 4 takeover-kind entries", () => {
    const takeoverEntries = Object.values(LAYOUT_REGISTRY).filter((e) => e.kind === "takeover")
    expect(takeoverEntries).toHaveLength(4)
  })

  it("image-annotate declares a capacity-4 annotation slot", () => {
    const entry = LAYOUT_REGISTRY["image-annotate"]
    const annotation = entry.slots.find((s) => s.name === "annotation")
    expect(annotation?.capacity).toBe(4)
  })
})

describe("content family: body slot + declared arrangements", () => {
  for (const id of Object.keys(CONTENT_ARCHETYPES)) {
    it(`"${id}" has a body slot and declares arrangements`, () => {
      const entry = LAYOUT_REGISTRY[id]
      expect(entry.slots.some((s) => s.name === "body"), `"${id}" is missing a body slot`).toBe(true)
      expect(entry.arrangements, `"${id}" has not declared arrangements`).toBeDefined()
    })
  }

  it("cover/chapter/ending archetypes never read components, so none declare a body slot", () => {
    for (const { registry, slideType } of FAMILIES) {
      if (slideType === "content") continue
      for (const id of Object.keys(registry)) {
        const entry = LAYOUT_REGISTRY[id]
        expect(
          entry.slots.some((s) => s.name === "body"),
          `${slideType} archetype "${id}" should not declare a body slot`,
        ).toBe(false)
        expect(entry.arrangements, `${slideType} archetype "${id}" should not declare arrangements`).toBeUndefined()
      }
    }
  })

  it("two-column only honors the two_column arrangement (hardcoded, per inventory)", () => {
    expect(LAYOUT_REGISTRY["two-column"].arrangements).toEqual(["two_column"])
  })

  it("bento-panel only honors single (hardcoded, per inventory)", () => {
    expect(LAYOUT_REGISTRY["bento-panel"].arrangements).toEqual(["single"])
  })

  it("asymmetric-triptych only honors single (hardcoded — its own three-region split is its arrangement, P1 variety wave task 4)", () => {
    expect(LAYOUT_REGISTRY["asymmetric-triptych"].arrangements).toEqual(["single"])
  })

  it("stacked-poster declares arrangements \"all\" (W2 task 3 adjudication: its degrade path passes slide.arrangement straight through unchanged, same as the four plain pass-through archetypes — the conditional hero/strip takeover only applies to 1-2 fitting components)", () => {
    expect(LAYOUT_REGISTRY["stacked-poster"].arrangements).toBe("all")
  })

  it("the remaining seven arrangement-respecting archetypes declare arrangements: \"all\" (P1 variety wave task 4 adds side-highlight/quiet-frame to the five pre-existing members)", () => {
    for (const id of [
      "banner-heading",
      "narrow-column",
      "rail-numbered",
      "tone-adaptive-content",
      "stacked-poster",
      "side-highlight",
      "quiet-frame",
    ]) {
      expect(LAYOUT_REGISTRY[id].arrangements).toBe("all")
    }
  })
})

describe("capacity metadata: only where the inventory gives hard numbers", () => {
  it("hero and strip slots (stacked-poster) carry capacity 1", () => {
    const slots = LAYOUT_REGISTRY["stacked-poster"].slots
    expect(slots.find((s) => s.name === "hero")?.capacity).toBe(1)
    expect(slots.find((s) => s.name === "strip")?.capacity).toBe(1)
  })

  it("the grid slot (bento-panel) carries capacity 6", () => {
    const grid = LAYOUT_REGISTRY["bento-panel"].slots.find((s) => s.name === "grid")
    expect(grid?.capacity).toBe(6)
  })

  it("bento-panel's body slot mirrors its own grid capacity (6), not the flat single-stack default (W2 task 5)", () => {
    const body = LAYOUT_REGISTRY["bento-panel"].slots.find((s) => s.name === "body")
    expect(body?.capacity).toBe(6)
  })

  it("the remaining 9 content archetypes' body slots carry capacity 4 (W2 task 5 — the registry's own geometric number, unchanged by W3; P1 variety wave task 4's three new archetypes join at the same flat default — see registry.ts's CONTENT_LAYOUTS header comment)", () => {
    for (const id of Object.keys(CONTENT_ARCHETYPES)) {
      if (id === "bento-panel") continue
      const body = LAYOUT_REGISTRY[id].slots.find((s) => s.name === "body")
      expect(body?.capacity, `"${id}" body slot should carry capacity 4`).toBe(4)
    }
  })
})

describe("getLayout", () => {
  it("returns the entry for a known archetype id", () => {
    expect(getLayout("banner-title")?.kind).toBe("archetype")
  })
  it("returns the entry for a known takeover id", () => {
    expect(getLayout("image-split")?.kind).toBe("takeover")
  })
  it("returns undefined for an unknown id", () => {
    expect(getLayout("does-not-exist")).toBeUndefined()
  })
})

describe("layoutsForSlideType", () => {
  it("returns only entries applicable to the given slide type", () => {
    const covers = layoutsForSlideType("cover")
    expect(covers.length).toBeGreaterThan(0)
    for (const l of covers) expect(l.slideTypes).toContain("cover")
  })

  it("cover/chapter/ending each resolve to exactly their 7 or 8 archetypes (no takeovers)", () => {
    expect(layoutsForSlideType("cover")).toHaveLength(8)
    expect(layoutsForSlideType("chapter")).toHaveLength(8)
    expect(layoutsForSlideType("ending")).toHaveLength(7)
  })

  it("content includes both the 10 archetypes and the 4 takeovers (P1 variety wave task 4: content 7 -> 10)", () => {
    const contents = layoutsForSlideType("content")
    expect(contents.filter((l) => l.kind === "archetype")).toHaveLength(10)
    expect(contents.filter((l) => l.kind === "takeover")).toHaveLength(4)
    expect(contents).toHaveLength(14)
  })
})

describe("filterByNarrativesOnly (W4, spec §6 step 4's rare narratives_only hard constraint)", () => {
  // Synthetic fixtures, not real registry entries — the whole point of this
  // being a standalone pure function (design decision 5) is that it can be
  // unit-tested without any real LAYOUT_REGISTRY id or a live selection
  // pass through `resolveArchetypeId`.
  function synthetic(id: string, narrativesOnly?: readonly Strategy[]): LayoutDefinition {
    return { id, kind: "archetype", slideTypes: ["content"], slots: [], narrativesOnly }
  }

  it("keeps a layout whose narrativesOnly list includes the resolved strategy", () => {
    const defs = [synthetic("a", ["pyramid", "storytelling"])]
    expect(filterByNarrativesOnly(defs, "pyramid")).toEqual(defs)
  })

  it("drops a layout whose narrativesOnly list excludes the resolved strategy", () => {
    const defs = [synthetic("a", ["pyramid"])]
    expect(filterByNarrativesOnly(defs, "briefing")).toEqual([])
  })

  it("keeps a layout with no narrativesOnly regardless of strategy (unrestricted default — every built-in layout today)", () => {
    const defs = [synthetic("a")]
    for (const strategy of STRATEGY_VALUES) {
      expect(filterByNarrativesOnly(defs, strategy)).toEqual(defs)
    }
  })

  it("filters a mixed pool: keeps unrestricted + in-list members, drops out-of-list members, preserves order", () => {
    const defs = [
      synthetic("unrestricted"),
      synthetic("in-list", ["showcase"]),
      synthetic("out-of-list", ["pyramid"]),
    ]
    expect(filterByNarrativesOnly(defs, "showcase").map((d) => d.id)).toEqual(["unrestricted", "in-list"])
  })

  it("real LAYOUT_REGISTRY entries: none set narrativesOnly yet (mechanism lands ahead of any real consumer, W4 design decision 5)", () => {
    for (const def of Object.values(LAYOUT_REGISTRY)) {
      expect(def.narrativesOnly, `"${def.id}" unexpectedly sets narrativesOnly`).toBeUndefined()
    }
  })
})
