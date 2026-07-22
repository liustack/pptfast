import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Borrow-wave task 3's "sweep which other large enums exist" requirement,
 * made durable: the flagship bug (a 24,910-char, 1756-option wall) was
 * possible because `z.enum(PPTX_ICON_NAMES)` pulled its candidate list from
 * a large external constant with no message customization. This describe
 * block pins the actual sweep result — read the schema source directly
 * (rather than only probing a handful of hand-picked values through
 * `validateIr`, `../api.test.ts`'s job) so a *new* large enum added later
 * without a custom error map fails a test immediately, not just whenever
 * someone happens to typo that specific field in a probe.
 *
 * Sweep result: every inline `z.enum([...])` literal array in `./index.ts`
 * is small (checked below); `theme.id` and `slide.layout` are open
 * `z.string()` fields with their own short hand-written "available: ..."
 * hard-gate messages outside the schema (`../api.ts`'s installed-theme
 * check, `checkLayoutApplicability`), not zod enums at all; narrative preset
 * names are checked the same way (`../narrative/index.ts`'s
 * `resolveNarrative`). The only two *large* closed vocabularies in the whole
 * schema are the icon enum (5 call sites, all sharing `PPTX_ICON_NAMES`) and
 * `ComponentSchema`'s `type` discriminator (28 options) — both now carry a
 * custom `error` map (`./schema-error-hints.ts`).
 */
describe("large-enum sweep (borrow-wave task 3)", () => {
  // vitest cwd = repo root (jsdom env swaps global URL, so import.meta.url
  // tricks break here — see src/plugin-manifest.test.ts's own note).
  const src = readFileSync(join(process.cwd(), "src/ir/index.ts"), "utf8")

  it("found something to sweep (sanity — a schema rewrite that removes every inline z.enum(...) should fail loudly, not pass by vacuity)", () => {
    const inlineEnumCount = [...src.matchAll(/z\.enum\(\[/g)].length
    expect(inlineEnumCount).toBeGreaterThan(10)
  })

  it("every inline z.enum([...]) literal array stays small enough that even zod's unmodified default message can't wall up", () => {
    const inlineEnums = [...src.matchAll(/z\.enum\(\[([^\]]*)\]/g)]
    for (const [, optionsSource] of inlineEnums) {
      const optionCount = optionsSource!.split(",").filter((s) => s.trim().length > 0).length
      expect(optionCount).toBeLessThanOrEqual(20)
    }
  })

  it("theme.id and slide.layout are open z.string() fields, not zod enums — their own hard gates live outside the schema, each with a short message", () => {
    expect(src).toMatch(/id: z\.string\(\)\.default\("consulting"\)/)
    expect(src).toMatch(/layout: z\.string\(\)\.optional\(\)/)
  })

  it("all 5 icon-enum call sites (the only large enum backed by an external constant) carry the custom did-you-mean error map", () => {
    const iconSites = [...src.matchAll(/z\.enum\(PPTX_ICON_NAMES(?:, \{ error: iconEnumError \})?\)/g)]
    expect(iconSites).toHaveLength(5)
    for (const [site] of iconSites) expect(site).toContain("{ error: iconEnumError }")
  })

  it("the component-type discriminator (the only large closed vocabulary that isn't a plain z.enum) carries the custom did-you-mean error map", () => {
    expect(src).toMatch(/z\.discriminatedUnion\("type", \[/)
    expect(src).toMatch(/\], \{ error: componentTypeError \}\)/)
  })
})
