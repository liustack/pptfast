import { describe, expect, it } from "vitest"
import { migrateDeckPlanToSpec } from "./migrate"

/**
 * Standalone unit tests for `migrateDeckPlanToSpec` (task 3, routed from task
 * 2's review — the function shipped in task 2 alongside `runMigrate`'s own
 * deck-dir-leg tests in `src/cli/commands.test.ts`, but had no test file of
 * its own exercising it directly). Mirrors `src/ir/migrate.test.ts`'s shape
 * for `migrateIrV3ToV4`: one case per line of spec §9.2's field mapping —
 *
 * ```text
 * deck.plan.json                       → deck.spec.json
 * scenario                             → narrative
 * pages[].rhythm                       → pages[].beat
 * 其余字段                              → 原样保留
 * ```
 *
 * — plus the "mechanical, not validating" edge shapes this function's own
 * doc comment calls out: non-object input, and a `pages` value that isn't an
 * array, both pass through completely unchanged.
 */

describe("migrateDeckPlanToSpec", () => {
  it("scenario → narrative: a preset-id string carries straight across", () => {
    const result = migrateDeckPlanToSpec({ scenario: "boardroom-report", pages: [] }) as Record<string, unknown>
    expect(result.scenario).toBeUndefined()
    expect(result.narrative).toBe("boardroom-report")
  })

  it("scenario → narrative: an axes object carries straight across (value already in the new strategy/pacing vocabulary as of task 1, this function never touches axis values)", () => {
    const result = migrateDeckPlanToSpec({
      scenario: { strategy: "storytelling", pacing: "dense", audience: "public" },
      pages: [],
    }) as Record<string, unknown>
    expect(result.narrative).toEqual({ strategy: "storytelling", pacing: "dense", audience: "public" })
  })

  it("an omitted scenario stays omitted — no narrative key materialized", () => {
    const result = migrateDeckPlanToSpec({ pages: [] }) as Record<string, unknown>
    expect("narrative" in result).toBe(false)
    expect("scenario" in result).toBe(false)
  })

  it("pages[].rhythm → pages[].beat: a page carrying rhythm gets it renamed to beat", () => {
    const result = migrateDeckPlanToSpec({
      pages: [{ id: "p-a", type: "content", heading: "A", rhythm: "anchor" }],
    }) as { pages: Record<string, unknown>[] }
    expect(result.pages[0]!.rhythm).toBeUndefined()
    expect(result.pages[0]!.beat).toBe("anchor")
  })

  it("a page with no rhythm key is left with no beat key (no synthesized default)", () => {
    const result = migrateDeckPlanToSpec({
      pages: [{ id: "p-a", type: "content", heading: "A" }],
    }) as { pages: Record<string, unknown>[] }
    expect("rhythm" in result.pages[0]!).toBe(false)
    expect("beat" in result.pages[0]!).toBe(false)
  })

  it("renames rhythm independently on every page in a mixed set (some with rhythm, some without)", () => {
    const result = migrateDeckPlanToSpec({
      pages: [
        { id: "p-cover", type: "cover", heading: "Cover" },
        { id: "p-a", type: "content", heading: "A", rhythm: "anchor" },
        { id: "p-b", type: "content", heading: "B", rhythm: "dense" },
        { id: "p-c", type: "content", heading: "C" },
        { id: "p-ending", type: "ending", heading: "Thanks", rhythm: "breathing" },
      ],
    }) as { pages: Record<string, unknown>[] }
    expect(result.pages.map((p) => p.beat)).toEqual([undefined, "anchor", "dense", undefined, "breathing"])
    expect(result.pages.every((p) => !("rhythm" in p))).toBe(true)
  })

  it("every other top-level field carries across unchanged (spec §9.2: 其余字段 → 原样保留)", () => {
    const result = migrateDeckPlanToSpec({
      version: "1",
      scenario: "boardroom-report",
      theme: "consulting",
      filename: "q3-review",
      seed: 1550434794,
      meta: { organization: "ACME" },
      pages: [],
    }) as Record<string, unknown>
    expect(result.version).toBe("1")
    expect(result.theme).toBe("consulting")
    expect(result.filename).toBe("q3-review")
    expect(result.seed).toBe(1550434794)
    expect(result.meta).toEqual({ organization: "ACME" })
  })

  it("every other per-page field carries across unchanged", () => {
    const result = migrateDeckPlanToSpec({
      pages: [{ id: "p-a", type: "content", heading: "A", focus: "kpi_cards", summary: "the point", rhythm: "anchor" }],
    }) as { pages: Record<string, unknown>[] }
    expect(result.pages[0]).toEqual({ id: "p-a", type: "content", heading: "A", focus: "kpi_cards", summary: "the point", beat: "anchor" })
  })

  it("is pure: never mutates its input (top level or nested pages)", () => {
    const input = { scenario: "boardroom-report", pages: [{ id: "p-a", type: "content", heading: "A", rhythm: "anchor" }] }
    const snapshot = JSON.parse(JSON.stringify(input))
    migrateDeckPlanToSpec(input)
    expect(input).toEqual(snapshot)
  })

  it("is deterministic: repeated calls on the same input produce deep-equal output", () => {
    const input = { scenario: "boardroom-report", pages: [{ id: "p-a", type: "content", heading: "A", rhythm: "anchor" }] }
    expect(migrateDeckPlanToSpec(input)).toEqual(migrateDeckPlanToSpec(input))
  })

  // ── edge shapes: mechanical, not validating (this function's own doc
  // comment — malformed input is `runMigrate`'s job to report, not this
  // rename step's) ──────────────────────────────────────────────────────

  it("non-object input passes through unchanged: null", () => {
    expect(migrateDeckPlanToSpec(null)).toBeNull()
  })

  it("non-object input passes through unchanged: a primitive", () => {
    expect(migrateDeckPlanToSpec("not-an-object")).toBe("not-an-object")
    expect(migrateDeckPlanToSpec(42)).toBe(42)
  })

  it("non-object input passes through unchanged: an array (excluded from the object branch even though typeof array === \"object\")", () => {
    const input = [1, 2, 3]
    expect(migrateDeckPlanToSpec(input)).toBe(input)
  })

  it("a pages value that isn't an array passes through unchanged, left for validateSpec to report", () => {
    const result = migrateDeckPlanToSpec({ scenario: "boardroom-report", pages: "not-an-array" }) as Record<string, unknown>
    expect(result.pages).toBe("not-an-array")
    expect(result.narrative).toBe("boardroom-report")
  })

  it("an omitted pages key stays omitted (no synthesized empty array)", () => {
    const result = migrateDeckPlanToSpec({ scenario: "boardroom-report" }) as Record<string, unknown>
    expect("pages" in result).toBe(false)
  })

  it("a non-object page entry inside the pages array passes through unchanged", () => {
    const result = migrateDeckPlanToSpec({ pages: [null, "not-a-page", 5] }) as { pages: unknown[] }
    expect(result.pages).toEqual([null, "not-a-page", 5])
  })
})
