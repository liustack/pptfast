import { describe, expect, it } from "vitest"
import { PptxIRSchema } from "@/ir"
import { generatePptx, irJsonSchema, listThemes, renderSlideSvg, validateIr } from "./api"

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
