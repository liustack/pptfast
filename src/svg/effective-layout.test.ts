// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { render } from "@testing-library/react"
import type { PptxIR, Slide } from "@/ir"
import { FullSlideSvg } from "./FullSlideSvg"
import { getLayout } from "./layouts/registry"
import { THEME_DEFINITIONS } from "../themes/definitions"
import {
  resolveArchetypeId,
  resolveEffectiveLayoutBodyCapacity,
  resolveEffectiveLayoutId,
} from "./effective-layout"

// ── helpers ──

function makeIR(slides: Slide[], themeId: string = "consulting"): PptxIR {
  return {
    version: "3",
    filename: "test.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
  } as PptxIR
}

const CONTENT_ARCHETYPE_IDS = [
  "narrow-column",
  "two-column",
  "rail-numbered",
  "banner-heading",
  "stacked-poster",
  "bento-panel",
  "tone-adaptive-content",
]

// ── resolveArchetypeId (pure seed+ordinal selection, extracted from FullSlideSvg) ──

describe("resolveArchetypeId", () => {
  const consultingLayouts = THEME_DEFINITIONS.consulting.layouts

  it("an explicit pin within the allowed set is honored for every member (not just seed-consistent with one)", () => {
    for (const id of consultingLayouts.cover) {
      expect(resolveArchetypeId("cover", consultingLayouts, 999, 0, id)).toBe(id)
    }
  })

  it("an explicit pin outside the allowed set is still honored when it's a registered archetype applicable to the slide type (spec §3: explicit bypasses curation)", () => {
    // "narrow-column" is journal's content archetype, not a member of tech's own curated set.
    expect(resolveArchetypeId("content", THEME_DEFINITIONS.tech.layouts, 1, 0, "narrow-column")).toBe(
      "narrow-column",
    )
  })

  it("falls back to seed-pick when the pin is unregistered, wrong kind, or has the wrong slideTypes", () => {
    for (const bad of ["not-a-real-layout", "image-split", "banner-title"]) {
      const picked = resolveArchetypeId("content", THEME_DEFINITIONS.tech.layouts, 5, 0, bad)
      expect(["bento-panel", "two-column"]).toContain(picked)
    }
  })

  it("returns null for an empty allowed set with no pin (defensive fallback — unreachable for the 13 built-in themes)", () => {
    const empty = { cover: [], chapter: [], content: [], ending: [] }
    expect(resolveArchetypeId("content", empty, 1, 0, undefined)).toBeNull()
  })

  it("is deterministic: the same (slideType, layouts, seed, ordinal, requested) always resolves the same id", () => {
    const a = resolveArchetypeId("content", THEME_DEFINITIONS.academic.layouts, 42, 1, undefined)
    const b = resolveArchetypeId("content", THEME_DEFINITIONS.academic.layouts, 42, 1, undefined)
    expect(a).toBe(b)
  })

  it("rotates within a 2-element allowed set as typeOrdinal increases (P3 item 2)", () => {
    const picks = [0, 1, 2, 3].map((o) => resolveArchetypeId("content", THEME_DEFINITIONS.academic.layouts, 7, o, undefined))
    expect(picks[0]).not.toBe(picks[1])
    expect(picks[1]).not.toBe(picks[2])
    expect(picks[0]).toBe(picks[2])
  })
})

// ── resolveEffectiveLayoutId (full per-slide resolution) ──

describe("resolveEffectiveLayoutId", () => {
  it("cover/chapter with an asset background bypasses archetypes entirely (returns null — ImageCoverPage has no registry entry)", () => {
    for (const type of ["cover", "chapter"] as const) {
      const slide: Slide = { type, heading: "x", background: { kind: "asset", asset_id: "bg" }, components: [] }
      const ir = makeIR([slide])
      expect(resolveEffectiveLayoutId(ir, slide, 0)).toBeNull()
    }
  })

  it("content/ending with an asset background does NOT bypass — stays on the normal archetype path (P1 frosted scrim, not a takeover)", () => {
    for (const type of ["content", "ending"] as const) {
      const slide: Slide = { type, heading: "x", background: { kind: "asset", asset_id: "bg" }, components: [] }
      const ir = makeIR([slide])
      expect(resolveEffectiveLayoutId(ir, slide, 0)).not.toBeNull()
    }
  })

  it("a pinned takeover layout with an image component present resolves to that takeover id", () => {
    const slide: Slide = {
      type: "content",
      heading: "x",
      layout: "image-annotate",
      components: [{ type: "image", asset_id: "a", fit: "cover" }],
    }
    const ir = makeIR([slide])
    expect(resolveEffectiveLayoutId(ir, slide, 0)).toBe("image-annotate")
  })

  it("a pinned takeover layout with NO image component falls through to archetype auto-pick (mirrors FullSlideSvg's splitTakeover guard)", () => {
    const slide: Slide = {
      type: "content",
      heading: "x",
      layout: "image-top",
      components: [{ type: "paragraph", text: "no image here" }],
    }
    const ir = makeIR([slide], "tech")
    expect(["bento-panel", "two-column"]).toContain(resolveEffectiveLayoutId(ir, slide, 0))
  })

  it("an explicit archetype pin is honored even outside the theme's curated family", () => {
    const slide: Slide = {
      type: "content",
      heading: "x",
      layout: "narrow-column",
      components: [{ type: "paragraph", text: "x" }],
    }
    const ir = makeIR([slide], "tech") // tech's own content set is ["bento-panel", "two-column"]
    expect(resolveEffectiveLayoutId(ir, slide, 0)).toBe("narrow-column")
  })

  it("auto-pick lands within the theme's curated content allowed set", () => {
    const slide: Slide = { type: "content", heading: "x", components: [{ type: "paragraph", text: "x" }] }
    const ir = makeIR([slide], "academic")
    expect(THEME_DEFINITIONS.academic.layouts.content).toContain(resolveEffectiveLayoutId(ir, slide, 0))
  })

  it("an unrecognized theme id falls back to consulting's allowed set (resolveThemeId's existing fallback, same posture as render)", () => {
    const slide: Slide = { type: "cover", heading: "x", components: [] }
    const irUnknown = makeIR([slide], "not-a-real-theme")
    const irConsulting = makeIR([slide], "consulting")
    expect(resolveEffectiveLayoutId(irUnknown, irUnknown.slides[0], 0)).toBe(
      resolveEffectiveLayoutId(irConsulting, irConsulting.slides[0], 0),
    )
  })

  it("typeOrdinal counts only same-type slides earlier in the deck — an interleaved chapter slide doesn't shift it", () => {
    const slides: Slide[] = [
      { type: "cover", heading: "c", components: [] },
      { type: "content", heading: "p1", components: [{ type: "paragraph", text: "x" }] },
      { type: "chapter", heading: "ch", components: [] },
      { type: "content", heading: "p2", components: [{ type: "paragraph", text: "x" }] },
    ]
    const ir = makeIR(slides, "academic") // 2-element content set — ordinal 0 vs 1 always differ (see rotation test above)
    const id0 = resolveEffectiveLayoutId(ir, slides[1], 1) // 1st content slide -> ordinal 0
    const id1 = resolveEffectiveLayoutId(ir, slides[3], 3) // 2nd content slide -> ordinal 1 (chapter at index 2 doesn't count)
    expect(id0).not.toBe(id1)
    expect([id0, id1].every((id) => THEME_DEFINITIONS.academic.layouts.content.includes(id as string))).toBe(true)
  })
})

// ── resolveEffectiveLayoutBodyCapacity (the density gate's geometric term) ──

describe("resolveEffectiveLayoutBodyCapacity", () => {
  it("a generic content archetype (explicit pin) reports capacity 4", () => {
    const slide: Slide = { type: "content", heading: "x", layout: "two-column", components: [] }
    const ir = makeIR([slide])
    expect(resolveEffectiveLayoutBodyCapacity(ir, slide, 0)).toEqual({ layoutId: "two-column", capacity: 4 })
  })

  it("bento-panel (explicit pin) reports its own capacity 6, not the flat single-stack default", () => {
    const slide: Slide = { type: "content", heading: "x", layout: "bento-panel", components: [] }
    const ir = makeIR([slide], "tech")
    expect(resolveEffectiveLayoutBodyCapacity(ir, slide, 0)).toEqual({ layoutId: "bento-panel", capacity: 6 })
  })

  it("every content archetype's reported capacity matches its own LAYOUT_REGISTRY body-slot entry (consistency with registry.test.ts's pinned numbers)", () => {
    for (const id of CONTENT_ARCHETYPE_IDS) {
      const slide: Slide = { type: "content", heading: "x", layout: id, components: [] }
      const ir = makeIR([slide], "tech") // explicit pin bypasses curation, so any theme works for every id
      const expected = getLayout(id)?.slots.find((s) => s.name === "body")?.capacity
      expect(resolveEffectiveLayoutBodyCapacity(ir, slide, 0).capacity).toBe(expected)
    }
  })

  it("a takeover layout reports undefined capacity (no geometric term) while still naming its own id", () => {
    const slide: Slide = {
      type: "content",
      heading: "x",
      layout: "image-split",
      components: [{ type: "image", asset_id: "a", fit: "cover" }],
    }
    const ir = makeIR([slide])
    expect(resolveEffectiveLayoutBodyCapacity(ir, slide, 0)).toEqual({ layoutId: "image-split", capacity: undefined })
  })

  it("image-annotate (no body slot at all) also reports undefined capacity", () => {
    const slide: Slide = {
      type: "content",
      heading: "x",
      layout: "image-annotate",
      components: [{ type: "image", asset_id: "a", fit: "cover" }],
    }
    const ir = makeIR([slide])
    expect(resolveEffectiveLayoutBodyCapacity(ir, slide, 0)).toEqual({
      layoutId: "image-annotate",
      capacity: undefined,
    })
  })

  it("the image-cover bypass reports a null layoutId and undefined capacity", () => {
    const slide: Slide = {
      type: "cover",
      heading: "x",
      background: { kind: "asset", asset_id: "bg" },
      components: [],
    }
    const ir = makeIR([slide])
    expect(resolveEffectiveLayoutBodyCapacity(ir, slide, 0)).toEqual({ layoutId: null, capacity: undefined })
  })
})

// ── render parity: the "validate sees what render uses" promise, proven by actually rendering ──

describe("render parity with FullSlideSvg", () => {
  function renderedArchetypeId(ir: PptxIR, slide: Slide, index: number): string | null {
    const { container } = render(createElement(FullSlideSvg, { ir, slide, index }))
    return container.querySelector("[data-archetype]")?.getAttribute("data-archetype") ?? null
  }

  const archetypePathCases: { label: string; themeId: string; slide: Slide }[] = [
    { label: "tech cover, auto-pick", themeId: "tech", slide: { type: "cover", heading: "x", components: [] } },
    {
      label: "academic content, auto-pick",
      themeId: "academic",
      slide: { type: "content", heading: "x", components: [{ type: "paragraph", text: "x" }] },
    },
    {
      label: "consulting content, explicit banner-heading pin",
      themeId: "consulting",
      slide: { type: "content", heading: "x", layout: "banner-heading", components: [{ type: "paragraph", text: "x" }] },
    },
    {
      label: "tech content, explicit bento-panel pin",
      themeId: "tech",
      slide: { type: "content", heading: "x", layout: "bento-panel", components: [{ type: "paragraph", text: "x" }] },
    },
    {
      label: "journal ending, auto-pick",
      themeId: "journal",
      slide: { type: "ending", heading: "x", components: [] },
    },
  ]

  for (const c of archetypePathCases) {
    it(`${c.label}: resolveEffectiveLayoutId matches the actual rendered data-archetype`, () => {
      const ir = makeIR([c.slide], c.themeId)
      expect(resolveEffectiveLayoutId(ir, c.slide, 0)).toBe(renderedArchetypeId(ir, c.slide, 0))
    })
  }

  it("a takeover or image-cover bypass never renders [data-archetype] (the archetype branch is correctly skipped both sides)", () => {
    const bypassCases: { themeId: string; slide: Slide }[] = [
      {
        themeId: "consulting",
        slide: { type: "cover", heading: "x", background: { kind: "asset", asset_id: "bg" }, components: [] },
      },
      {
        themeId: "consulting",
        slide: {
          type: "content",
          heading: "x",
          layout: "image-split",
          components: [{ type: "image", asset_id: "a", fit: "cover" }],
        },
      },
    ]
    for (const { themeId, slide } of bypassCases) {
      const ir: PptxIR = {
        ...makeIR([slide], themeId),
        assets: { images: { bg: { src: "data:image/png;base64,AAAA" }, a: { src: "data:image/png;base64,AAAA" } } },
      }
      expect(renderedArchetypeId(ir, slide, 0)).toBeNull()
    }
  })
})
