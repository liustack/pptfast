import { describe, expect, it } from "vitest"
import { PptxIRSchema } from "@/ir"
import { generatePptx, irJsonSchema, listThemes, renderSlideSvg, validateIr } from "./api"

const raw = {
  version: "3",
  filename: "api-test",
  theme: { id: "consulting" },
  slides: [
    { type: "cover", heading: "Hello" },
    { type: "content", heading: "Points", blocks: [{ type: "bullets", items: ["a", "b"] }] },
  ],
}

describe("validateIr", () => {
  it("accepts a valid IR and returns parsed data with defaults applied", () => {
    const r = validateIr(raw)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.ir?.slides[0]?.blocks).toEqual([])
  })

  it("gives a migration message for IR v2 input", () => {
    const v = validateIr({ version: "2", filename: "x", theme: { id: "tech" }, slides: [] })
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]!.message).toMatch(/use theme\.style/)
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
    const styles = listThemes()
    expect(styles).toHaveLength(13)
    expect(styles.map((t) => t.id)).toContain("consulting")
    for (const t of styles) {
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
