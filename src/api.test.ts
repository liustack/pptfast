import { afterEach, describe, expect, it } from "vitest"
import { PptxIRSchema } from "@/ir"
import { generatePptx, irJsonSchema, listThemes, renderSlideSvg, validateIr } from "./api"
import { __resetRegisteredThemes, registerTheme, type ThemeDefinition } from "./themes/definitions"

const raw = {
  version: "3",
  filename: "api-test",
  theme: { id: "consulting" },
  slides: [
    { type: "cover", heading: "Hello" },
    { type: "content", heading: "Points", components: [{ type: "bullets", items: ["a", "b"] }] },
  ],
}

describe("validateIr", () => {
  it("accepts a valid IR and returns parsed data with defaults applied", () => {
    const r = validateIr(raw)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.ir?.slides[0]?.components).toEqual([])
  })

  it("gives a migration message for IR v2 input", () => {
    const v = validateIr({ version: "2", filename: "x", theme: { id: "tech" }, slides: [] })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.message).toMatch(/use theme\.style/)
    expect(v.errors[0]!.message).toMatch(/variant is split into layout and arrangement/)
    expect(v.errors[0]!.message).toMatch(/blocks are now components/)
  })

  it("hard-rejects an unknown theme id with the available list", () => {
    const v = validateIr({ theme: { id: "neon" }, slides: [{ heading: "x" }] })
    expect(v.ok).toBe(false)
    expect(v.errors[0]!.message).toMatch(/available:.*consulting/)
  })

  it("maps slide-scoped issues to 1-based page numbers", () => {
    const bad = { ...raw, slides: [{ type: "nope" }] }
    const r = validateIr(bad)
    expect(r.ok).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.errors[0]?.page).toBe(1)
    expect(r.errors[0]?.path.startsWith("slides.0")).toBe(true)
  })

  it("rejects a schema-valid cover slide with no heading (content-quality gate)", () => {
    const bad = {
      ...raw,
      slides: [{ type: "cover" }, raw.slides[1]],
    }
    const r = validateIr(bad)
    expect(r.ok).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.errors[0]?.path).toBe("slides.0")
    expect(r.errors[0]?.page).toBe(1)
    // readable, English (public error surface — see describeQualityIssue in api.ts)
    expect(r.errors[0]?.message).toMatch(/heading/i)
    expect(r.errors[0]?.message).not.toMatch(/[一-鿿]/)
  })

  it("rejects an empty deck", () => {
    const r = validateIr({ ...raw, slides: [] })
    expect(r.ok).toBe(false)
    expect(r.errors).toEqual([{ path: "slides", message: "deck has no slides" }])
  })

  describe("layout applicability gate (W2 task 3)", () => {
    it("rejects a cover slide carrying a content-only takeover layout id (cover-hijack fix)", () => {
      const v = validateIr({
        ...raw,
        slides: [{ type: "cover", heading: "Hello", layout: "image-top" }, raw.slides[1]],
      })
      expect(v.ok).toBe(false)
      expect(v.errors[0]!.page).toBe(1)
      expect(v.errors[0]!.message).toMatch(/image-top/)
      expect(v.errors[0]!.message).toMatch(/cover/)
    })

    it("rejects an unknown layout id, listing the available ids for that slide type", () => {
      const v = validateIr({
        ...raw,
        slides: [raw.slides[0], { type: "content", heading: "x", layout: "not-a-real-layout", components: [] }],
      })
      expect(v.ok).toBe(false)
      expect(v.errors[0]!.page).toBe(2)
      expect(v.errors[0]!.message).toMatch(/not-a-real-layout/)
      expect(v.errors[0]!.message).toMatch(/available/)
    })

    it("accepts a content slide naming a valid takeover layout id", () => {
      const v = validateIr({
        ...raw,
        slides: [
          raw.slides[0],
          {
            type: "content",
            heading: "Split",
            layout: "image-split",
            components: [{ type: "image", asset_id: "a" }],
          },
        ],
      })
      expect(v.ok).toBe(true)
    })

    it("accepts a content slide naming a valid archetype layout id", () => {
      const v = validateIr({
        ...raw,
        slides: [
          raw.slides[0],
          { type: "content", heading: "Bento", layout: "bento-panel", components: [{ type: "paragraph", text: "x" }] },
        ],
      })
      expect(v.ok).toBe(true)
    })

    it("does not gate on arrangement-vs-layout compatibility (declarative this wave, W3 decides)", () => {
      // "two-column" only *declares* arrangements: ["two_column"], but the
      // gate must not enforce that yet — only registry existence +
      // slideTypes applicability are hard errors this task.
      const v = validateIr({
        ...raw,
        slides: [
          raw.slides[0],
          {
            type: "content",
            heading: "Mismatched on purpose",
            layout: "two-column",
            arrangement: "quote",
            components: [{ type: "paragraph", text: "x" }],
          },
        ],
      })
      expect(v.ok).toBe(true)
    })
  })
})

describe("duplicate slide id gate (W5 task 1)", () => {
  it("hard-rejects a deck with duplicate slide ids, listing them (path 'slides', no page)", () => {
    const v = validateIr({
      ...raw,
      slides: [
        { ...raw.slides[0], id: "p-1" },
        { ...raw.slides[1], id: "p-1" },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.path).toBe("slides")
    expect(v.errors[0]!.page).toBeUndefined()
    expect(v.errors[0]!.message).toBe(
      'duplicate slide id(s): "p-1" (pages 1, 2) — slide ids must be unique within a deck',
    )
  })

  it("accepts unique ids across slides", () => {
    const v = validateIr({
      ...raw,
      slides: [
        { ...raw.slides[0], id: "p-1" },
        { ...raw.slides[1], id: "p-2" },
      ],
    })
    expect(v.ok).toBe(true)
  })

  it("accepts slides that omit id entirely (bare, pre-W5 IR)", () => {
    const v = validateIr(raw)
    expect(v.ok).toBe(true)
  })
})

describe("placeholder slide quality exemption (W5 task 1)", () => {
  it("a placeholder slide with no heading passes validate", () => {
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content", id: "p-2", placeholder: true }],
    })
    expect(v.ok).toBe(true)
  })

  it("a normal (non-placeholder) empty content slide still fails the missing-heading gate", () => {
    const v = validateIr({
      ...raw,
      slides: [raw.slides[0], { type: "content" }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => /heading/i.test(e.message))).toBe(true)
  })

  it("skips every content rule for a placeholder page, not only missing_heading", () => {
    const overloaded = {
      type: "content" as const,
      placeholder: true as const,
      heading: "标".repeat(100), // would trip long_heading if checked
      components: Array.from({ length: 10 }, (_, i) => ({ type: "paragraph" as const, text: String(i) })), // would trip density
    }
    const v = validateIr({ ...raw, slides: [raw.slides[0], overloaded] })
    expect(v.ok).toBe(true)
  })
})

describe("describeQualityIssue: density/bullets English messages (W3 task 3, spec §5)", () => {
  // Each message must name whichever side(s) of min(delivery editorial
  // budget, resolved layout capacity) actually bound the limit — see
  // ir-quality.ts's `density`/`bulletsBudget` QualityIssue fields and this
  // file's own describeQualityIssue. Reached only through validateIr (the
  // function itself is private), same convention as the existing
  // "readable, English" missing-heading test above.
  // `n` is the slide's total component count (what the density gate counts
  // against); `withImage` prepends one `image` component (counted as one of
  // `n`) so a pinned takeover layout actually takes over (findImageComponent
  // must find something) instead of falling through to archetype auto-pick.
  const denseSlide = (n: number, opts: { layout?: string; withImage?: boolean } = {}) => ({
    type: "content" as const,
    heading: "Dense",
    layout: opts.layout,
    components: [
      ...(opts.withImage ? [{ type: "image" as const, asset_id: "a" }] : []),
      ...Array.from({ length: opts.withImage ? n - 1 : n }, (_, i) => ({ type: "paragraph" as const, text: String(i) })),
    ],
  })
  const densityMessage = (v: ReturnType<typeof validateIr>) =>
    v.errors.find((e) => e.message.includes("too many components"))?.message

  it("no geometric term (takeover layout): names the delivery alone", () => {
    const v = validateIr({
      ...raw,
      scenario: { delivery: "presentation" },
      slides: [raw.slides[0], denseSlide(4, { layout: "image-top", withImage: true })],
    })
    expect(v.ok).toBe(false)
    expect(densityMessage(v)).toBe(
      "too many components on this slide (max 3 for presentation delivery) — split into multiple slides",
    )
  })

  it("tied capacities (explicit generic layout, balanced): names the delivery alone", () => {
    const v = validateIr({
      ...raw,
      scenario: { delivery: "balanced" },
      slides: [raw.slides[0], denseSlide(5, { layout: "two-column" })],
    })
    expect(v.ok).toBe(false)
    expect(densityMessage(v)).toBe(
      "too many components on this slide (max 4 for balanced delivery) — split into multiple slides",
    )
  })

  it("delivery binds but the layout allows more (bento-panel exception): names both sides", () => {
    const v = validateIr({
      ...raw,
      theme: { id: "tech" },
      scenario: { delivery: "balanced" },
      slides: [raw.slides[0], denseSlide(5, { layout: "bento-panel" })],
    })
    expect(v.ok).toBe(false)
    expect(densityMessage(v)).toBe(
      "too many components on this slide (max 4 — bento-panel fits 6 but balanced delivery caps at 4) — split into multiple slides",
    )
  })

  it("the layout's own capacity is the binding side (text delivery, generic layout): names the layout", () => {
    const v = validateIr({
      ...raw,
      scenario: { delivery: "text" },
      slides: [raw.slides[0], denseSlide(5, { layout: "two-column" })],
    })
    expect(v.ok).toBe(false)
    expect(densityMessage(v)).toBe(
      "too many components on this slide (max 4 — two-column layout's capacity is tighter than text delivery's 5) — split into multiple slides",
    )
  })

  it("bullets_overflow names the delivery", () => {
    const v = validateIr({
      ...raw,
      scenario: { delivery: "balanced" },
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "List",
          components: [{ type: "bullets", items: ["a", "b", "c", "d", "e", "f"] }],
        },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors.find((e) => e.message.includes("too many items"))?.message).toBe(
      "bullet list has too many items (max 5 for balanced delivery) — trim it or split into multiple slides",
    )
  })

  it("bullet_item_long names the delivery", () => {
    const v = validateIr({
      ...raw,
      scenario: { delivery: "text" },
      slides: [
        raw.slides[0],
        {
          type: "content",
          heading: "List",
          components: [{ type: "bullets", items: ["长".repeat(49)] }],
        },
      ],
    })
    expect(v.ok).toBe(false)
    expect(v.errors.find((e) => e.message.includes("too long"))?.message).toBe(
      "a bullet item is too long for text delivery — keep it within about 2 lines",
    )
  })
})

describe("scenario field (W3 task 2)", () => {
  it("hard-rejects an unknown scenario preset name, listing available presets", () => {
    const v = validateIr({ ...raw, scenario: "not-a-real-preset" })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.path).toBe("scenario")
    expect(v.errors[0]!.page).toBeUndefined()
    expect(v.errors[0]!.message).toMatch(/unknown scenario preset/)
    expect(v.errors[0]!.message).toMatch(/available:.*general/)
  })

  it("accepts a valid scenario preset string", () => {
    const v = validateIr({ ...raw, scenario: "boardroom-report" })
    expect(v.ok).toBe(true)
  })

  it("accepts a partial scenario axes object", () => {
    const v = validateIr({ ...raw, scenario: { mode: "pyramid" } })
    expect(v.ok).toBe(true)
  })

  it("accepts an omitted scenario field (defaults to general, no error)", () => {
    const v = validateIr(raw)
    expect(v.ok).toBe(true)
  })

  // W3 task-2 review fix: the axes-object branch used to be schema-closed
  // (a strict z.enum per axis) nested inside a z.union, which zod reports as
  // one opaque invalid_union issue on a failing branch — every one of these
  // would have collapsed to the same useless
  // { path: "scenario", message: "Invalid input" } instead of surfacing
  // resolveScenario's specific, available-values message. The schema now
  // only shape-checks (string vs. object vs. neither — see
  // src/ir/index.test.ts's "IR v3 scenario field" describe block for that
  // layer's coverage); these pin the message content actually reaching the
  // caller through validateIr's resolveScenario try/catch.
  it("hard-rejects a bad axis value inside the axes object, listing valid values", () => {
    const v = validateIr({ ...raw, scenario: { mode: "pyramidal" } })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.path).toBe("scenario")
    expect(v.errors[0]!.page).toBeUndefined()
    expect(v.errors[0]!.message).toMatch(/unknown mode/)
    expect(v.errors[0]!.message).toMatch(/pyramid/)
  })

  it("hard-rejects an unknown key on the axes object, listing valid keys", () => {
    const v = validateIr({ ...raw, scenario: { speed: "fast" } })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.path).toBe("scenario")
    expect(v.errors[0]!.page).toBeUndefined()
    expect(v.errors[0]!.message).toMatch(/unknown scenario axis/)
    expect(v.errors[0]!.message).toMatch(/mode/)
    expect(v.errors[0]!.message).toMatch(/delivery/)
    expect(v.errors[0]!.message).toMatch(/audience/)
  })
})

describe("registerTheme end-to-end (W3 task 4)", () => {
  afterEach(() => {
    __resetRegisteredThemes()
  })

  function registeredTheme(id: string): ThemeDefinition {
    return {
      id,
      style: {
        id,
        colors: {
          bg: "#123ABC",
          surface: "#FFFFFF",
          primary: "#123ABC",
          accent: "#FF00AA",
          text: "#101010",
          muted: "#666666",
          chartPalette: ["#123ABC", "#FF00AA"],
        },
        fonts: { heading: ["Arial"], body: ["Arial"] },
        defaultBackgrounds: {
          cover: { kind: "color", value: "#123ABC" },
          chapter: { kind: "color", value: "#123ABC" },
          content: { kind: "color", value: "#123ABC" },
          ending: { kind: "color", value: "#123ABC" },
        },
      },
      brand: {},
      tags: [],
      // Narrow (single-archetype) curated set per slide type — proves
      // selection actually respects the registered theme's own curation
      // rather than falling back to consulting's allowed set.
      layouts: {
        cover: ["poster-center"],
        chapter: ["banner-chapter"],
        content: ["two-column"],
        ending: ["banner-ending"],
      },
    }
  }

  it("a registered theme's style and curated layout take effect end-to-end (validateIr → renderSlideSvg)", () => {
    registerTheme(registeredTheme("acme-registered"))
    const v = validateIr({
      version: "3",
      filename: "registered-theme-test",
      theme: { id: "acme-registered" },
      slides: [{ type: "cover", heading: "Hello from a registered theme" }],
    })
    expect(v.ok).toBe(true)

    const svg = renderSlideSvg(v.ir!, 0)
    // distinctive primary color from the registered theme's own style tokens
    expect(svg).toContain("#123ABC")
    // respects the registered theme's narrow (single-entry) curated cover layout
    expect(svg).toContain('data-archetype="poster-center"')
  })

  it("validateIr accepts a registered theme id and still rejects an unknown id with the enlarged available list", () => {
    registerTheme(registeredTheme("acme-registered-2"))

    const accepted = validateIr({ ...raw, theme: { id: "acme-registered-2" } })
    expect(accepted.ok).toBe(true)

    const rejected = validateIr({ ...raw, theme: { id: "still-not-a-theme" } })
    expect(rejected.ok).toBe(false)
    expect(rejected.errors[0]!.message).toMatch(/available:.*acme-registered-2/)
  })
})

describe("renderSlideSvg", () => {
  it("renders one slide to standalone SVG markup", () => {
    const ir = PptxIRSchema.parse(raw)
    const svg = renderSlideSvg(ir, 0)
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg).toContain("Hello")
  })

  it("throws a readable error for an out-of-range index", () => {
    const ir = PptxIRSchema.parse(raw)
    expect(() => renderSlideSvg(ir, 99)).toThrow(/out of range/)
  })
})

describe("generatePptx", () => {
  it("returns pptx bytes (zip magic) for a valid IR", async () => {
    const bytes = await generatePptx(raw)
    expect(bytes.length).toBeGreaterThan(10_000)
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]) // "PK"
  })

  it("throws PptfastError with per-page details for invalid input", async () => {
    await expect(generatePptx({ nope: true })).rejects.toThrow(/invalid IR/)
  })
})

describe("generatePptx draft gate (W5 task 1)", () => {
  const withPlaceholder = {
    ...raw,
    slides: [raw.slides[0], { type: "content" as const, id: "p-2", placeholder: true as const }],
  }

  it("throws PptfastError listing the placeholder page number + id when draft is not passed", async () => {
    await expect(generatePptx(withPlaceholder)).rejects.toThrow(
      "deck has 1 unfilled placeholder page: p-2 (page 2) — fill them or pass --draft",
    )
  })

  it("lists every placeholder page when there is more than one", async () => {
    const twoPlaceholders = {
      ...raw,
      slides: [
        raw.slides[0],
        { type: "content" as const, id: "p-2", placeholder: true as const },
        { type: "content" as const, placeholder: true as const }, // no id — falls back to page-only ref
      ],
    }
    await expect(generatePptx(twoPlaceholders)).rejects.toThrow(
      "deck has 2 unfilled placeholder pages: p-2 (page 2), page 3 — fill them or pass --draft",
    )
  })

  it("renders successfully when placeholders exist and { draft: true } is passed", async () => {
    const bytes = await generatePptx(withPlaceholder, { draft: true })
    expect(bytes.length).toBeGreaterThan(10_000)
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
  })

  it("is unaffected when there are no placeholder pages, draft omitted", async () => {
    const bytes = await generatePptx(raw)
    expect(bytes.length).toBeGreaterThan(10_000)
  })

  it("renderSlideSvg never gates on placeholder pages (preview always allowed)", () => {
    const v = validateIr(withPlaceholder)
    expect(v.ok).toBe(true)
    expect(() => renderSlideSvg(v.ir!, 1)).not.toThrow()
  })
})

describe("listThemes", () => {
  it("lists 13 canonical themes with labels and color tokens", () => {
    const themes = listThemes()
    expect(themes).toHaveLength(13)
    expect(themes.map((t) => t.id)).toContain("consulting")
    for (const t of themes) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(Object.keys(t.colors).length).toBeGreaterThan(0)
    }
  })
})

describe("irJsonSchema", () => {
  it("exports a JSON Schema object for the IR", () => {
    const schema = irJsonSchema()
    expect(schema).toHaveProperty("$schema")
    expect(JSON.stringify(schema)).toContain("slides")
  })
})
