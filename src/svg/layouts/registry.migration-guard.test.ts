// @vitest-environment node
//
// T1d (src domain reorg wave 1) migration guard — ONE-TIME, may be deleted
// in a later wave once the layoutDef-inlining migration is trusted.
//
// `__fixtures__/pre-migration-layout-registry.json` is a one-time capture
// (see the task report for the capture method — a temporary
// `__tmp-dump-registry.test.ts`, deleted before this commit, that imported
// the pre-migration `LAYOUT_REGISTRY` — still built from literal
// `COVER_LAYOUT_DEFS`/`CHAPTER_LAYOUT_DEFS`/`ENDING_LAYOUT_DEFS`/`CONTENT_LAYOUT_DEFS`/
// `TAKEOVER_LAYOUT_DEFS` Records — and serialized it). This test replays the
// post-migration aggregator (`LAYOUT_REGISTRY` rebuilt from `layoutDef`
// imports scattered across `layouts/*.tsx` + `image-pages.tsx`) and
// asserts it is unchanged, both in content (every definition, deep-equal)
// and in key order (insertion order feeds `layoutsForSlideType`'s
// `Object.values` walk, which feeds `theme.layouts[type]`'s array order,
// which `resolveLayoutId`'s `weightedPickBySeed` samples from
// positionally — a silent reorder would not fail typecheck or most tests,
// but would silently redistribute deterministic seed-based layout picks).
//
// The comparison is restricted to the fields the capture actually holds.
// `LayoutDefinition` has grown optional metadata since (`narrativesOnly`,
// `pinOnly`, `headingFit`, `paintsOwnBackground`), and a layout that sets one
// of those is not a layout the migration changed — it is a later, deliberate
// decision that this fixture was never a record of. Comparing whole objects
// made the first such decision look like a migration defect and would have
// been answered by re-recording a file whose entire value is that it was
// captured *before* the migration and never touched again. Removals and
// changes to captured fields still fail, which is the thing this guard is
// here to catch.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { LAYOUT_REGISTRY } from "./registry"

const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/pre-migration-layout-registry.json", import.meta.url), "utf-8"),
) as { order: string[]; registry: Record<string, Record<string, unknown>> }

/** Layouts retired after the capture. Compare the rest, skip these ids. */
const RETIRED_LAYOUT_IDS = new Set(["image-lead-split"])

/** `live`, cut down to the keys `captured` has — nothing else is this guard's business. */
function capturedFieldsOf(live: Record<string, unknown>, captured: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(captured).map((k) => [k, live[k]]))
}

describe("LAYOUT_REGISTRY migration guard (registry.ts aggregator conversion, T1d)", () => {
  it("key insertion order is byte-identical to the pre-migration registry", () => {
    expect(Object.keys(LAYOUT_REGISTRY)).toEqual(fixture.order.filter((id) => !RETIRED_LAYOUT_IDS.has(id)))
  })

  it("every captured field is deep-equal to its pre-migration counterpart", () => {
    const live = LAYOUT_REGISTRY as unknown as Record<string, Record<string, unknown>>
    for (const [id, captured] of Object.entries(fixture.registry)) {
      if (RETIRED_LAYOUT_IDS.has(id)) continue
      expect(live[id], id).toBeDefined()
      expect(capturedFieldsOf(live[id]!, captured), id).toEqual(captured)
    }
  })
})
