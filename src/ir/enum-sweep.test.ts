import { describe, expect, it } from "vitest"
import { z } from "zod"
import { PptxIRSchema } from "./index"

/**
 * Borrow-wave task 3's "sweep which other large enums exist" requirement,
 * made durable — review-round strengthening. The flagship bug (a 24,910-char,
 * 1756-option wall) was possible because `z.enum(PPTX_ICON_NAMES)` pulled its
 * candidate list from a large *external* constant with no message
 * customization. A first version of this file only regex-scanned the schema
 * *source text* for inline `z.enum([...])` literal arrays plus a hardcoded
 * name-check for the two known call sites — real coverage for "a new large
 * inline enum", but blind to the exact shape of the original bug: a new
 * large enum sourced from a new external constant would match neither check
 * (not an inline literal array, not one of the two hardcoded names) and pass
 * silently.
 *
 * This version instead walks the *constructed* schema object tree
 * ({@link walkSchema}) — introspecting the actual zod schema instances via
 * zod v4's internal `_zod.def` representation, not the source text — finds
 * every enum/discriminated-union node regardless of where its candidate list
 * came from, and behaviorally probes each large one by feeding it an
 * obviously-invalid value and checking the *real* resulting message length.
 * A new large enum, inline or externally sourced, with or without a custom
 * error map, is caught the same way.
 *
 * Trade-off, stated honestly rather than left implicit: `_zod.def` is zod's
 * internal representation, not a documented public API — a future zod
 * version could reshape it in a way {@link walkSchema} doesn't recognize.
 * That failure mode is guarded, not silent: {@link walkSchema} records every
 * `def.type` it doesn't know how to descend into, and the first test below
 * asserts that set is empty — an unrecognized construct fails the sweep
 * loudly (as "go update the walker") rather than quietly under-counting.
 */

interface EnumFinding {
  path: string
  kind: "enum" | "discriminatedUnion"
  node: z.ZodType
  optionCount: number
}

/**
 * Recursively walk a zod schema's constructed instance tree, collecting
 * every enum ({@link EnumFinding.kind} `"enum"`) and discriminated-union
 * (`"discriminatedUnion"`) node found, however deeply nested and regardless
 * of whether its candidates came from an inline literal or an external
 * constant. `unhandled` collects any `def.type` this walker doesn't know how
 * to descend into (see this file's own top comment) — a non-empty set means
 * the walk may have missed something under an unrecognized construct, which
 * this file's first test turns into a hard failure rather than a silent gap.
 * `seen` guards against infinite recursion on a self-referential schema
 * (none exist in this codebase's IR today, but the guard costs nothing).
 */
function walkSchema(node: unknown, path: string, findings: EnumFinding[], unhandled: Set<string>, seen: Set<unknown>): void {
  if (!node || typeof node !== "object" || seen.has(node)) return
  seen.add(node)
  const def = (node as { _zod?: { def?: { type?: string } & Record<string, unknown> } })._zod?.def
  if (!def?.type) return
  switch (def.type) {
    case "object":
      for (const [key, value] of Object.entries(def.shape as Record<string, unknown>)) {
        walkSchema(value, `${path}.${key}`, findings, unhandled, seen)
      }
      return
    case "array":
      walkSchema(def.element, `${path}[]`, findings, unhandled, seen)
      return
    case "optional":
    case "default":
    case "nullable":
    case "readonly":
    case "catch":
      walkSchema(def.innerType, path, findings, unhandled, seen)
      return
    case "union": {
      const options = def.options as unknown[]
      if (def.discriminator) {
        findings.push({ path, kind: "discriminatedUnion", node: node as z.ZodType, optionCount: options.length })
      }
      for (const option of options) walkSchema(option, `${path}|`, findings, unhandled, seen)
      return
    }
    case "record":
      walkSchema(def.valueType, `${path}{}`, findings, unhandled, seen)
      return
    case "tuple":
      for (const item of (def.items as unknown[] | undefined) ?? []) walkSchema(item, `${path}()`, findings, unhandled, seen)
      return
    case "pipe":
      walkSchema(def.in, path, findings, unhandled, seen)
      walkSchema(def.out, path, findings, unhandled, seen)
      return
    case "enum":
      findings.push({
        path,
        kind: "enum",
        node: node as z.ZodType,
        optionCount: Object.keys(def.entries as Record<string, unknown>).length,
      })
      return
    // Leaf types that never contain a nested schema — nothing to descend into.
    case "string":
    case "number":
    case "boolean":
    case "literal":
    case "int":
    case "any":
    case "unknown":
    case "never":
    case "null":
    case "undefined":
    case "date":
    case "bigint":
    case "nan":
    case "void":
    case "custom":
      return
    default:
      unhandled.add(def.type)
  }
}

/** Above this option count, a default-flattened zod message risks becoming an actual wall. */
const LARGE_ENUM_THRESHOLD = 20

/** A value no real candidate in this schema will ever equal, for probing an enum/discriminatedUnion node directly. */
const DEFINITELY_INVALID_VALUE = "__definitely_invalid__"

/** Feed `finding` an invalid value directly (bypassing the rest of the IR — this node's own `safeParse` is enough) and return the resulting error message. */
function probe(finding: EnumFinding): string {
  const value =
    finding.kind === "discriminatedUnion"
      ? { [(finding.node._zod.def as unknown as { discriminator: string }).discriminator]: DEFINITELY_INVALID_VALUE }
      : DEFINITELY_INVALID_VALUE
  const result = finding.node.safeParse(value)
  if (result.success) throw new Error(`probe value unexpectedly parsed for ${finding.path}`)
  return result.error.issues[0]!.message
}

describe("large-enum sweep (borrow-wave task 3, review-round strengthening)", () => {
  it("the walker recognizes every zod construct actually used in the schema (no unhandled def.type — see this file's own top comment)", () => {
    const unhandled = new Set<string>()
    walkSchema(PptxIRSchema, "", [], unhandled, new Set())
    expect([...unhandled]).toEqual([])
  })

  it("found at least one large enum/discriminatedUnion to check (sanity — a schema rewrite that removes every large vocabulary should fail loudly, not pass by vacuity)", () => {
    const findings: EnumFinding[] = []
    walkSchema(PptxIRSchema, "", findings, new Set(), new Set())
    const large = findings.filter((f) => f.optionCount > LARGE_ENUM_THRESHOLD)
    expect(large.length).toBeGreaterThan(0)
  })

  it("every enum/discriminatedUnion node over the size threshold, wherever it lives and however its candidates are sourced, produces a short message for an invalid value", () => {
    const findings: EnumFinding[] = []
    walkSchema(PptxIRSchema, "", findings, new Set(), new Set())
    const large = findings.filter((f) => f.optionCount > LARGE_ENUM_THRESHOLD)
    for (const finding of large) {
      const message = probe(finding)
      expect(message.length, `${finding.path} (${finding.kind}, ${finding.optionCount} options): "${message}"`).toBeLessThan(500)
    }
  })

  // Negative control (review-round addition): proves the walker + probe
  // mechanism actually has teeth, not just "always passes" — a synthetic
  // large enum with zod's *unmodified default* error map, probed the exact
  // same way, produces a message well over the bound the test above enforces.
  it("(negative control) an enum with no custom error map fails this sweep's own probe — the guard is not vacuous", () => {
    const bareLargeEnum = z.object({
      x: z.enum(Array.from({ length: 50 }, (_, i) => `option-${i}`) as [string, ...string[]]),
    })
    const findings: EnumFinding[] = []
    walkSchema(bareLargeEnum, "", findings, new Set(), new Set())
    const large = findings.filter((f) => f.optionCount > LARGE_ENUM_THRESHOLD)
    expect(large).toHaveLength(1)
    const message = probe(large[0]!)
    expect(message.length).toBeGreaterThan(500)
  })

  it("theme.id and slide.layout are open z.string() fields, not zod enums — their own hard gates live outside the schema (../api.ts's installed-theme check, checkLayoutApplicability), each with a short message", () => {
    // Reflected in the walk above too: neither field surfaces as an "enum"
    // finding at all, large or small — this is the deliberate design (an
    // open, registry-backed vocabulary, not a closed one), not a gap in the
    // walker, which is what this explicit source-level check documents.
    const findings: EnumFinding[] = []
    walkSchema(PptxIRSchema, "", findings, new Set(), new Set())
    expect(findings.some((f) => f.path.endsWith(".theme.id"))).toBe(false)
    expect(findings.some((f) => f.path.endsWith(".slides[].layout"))).toBe(false)
  })
})
