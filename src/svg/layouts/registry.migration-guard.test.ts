// @vitest-environment node
//
// T1d (src domain reorg wave 1) migration guard — ONE-TIME, may be deleted
// in a later wave once the layoutDef-inlining migration is trusted.
//
// `__fixtures__/pre-migration-layout-registry.json` is a one-time capture
// (see the task report for the capture method — a temporary
// `__tmp-dump-registry.test.ts`, deleted before this commit, that imported
// the pre-migration `LAYOUT_REGISTRY` — still built from literal
// `COVER_LAYOUTS`/`CHAPTER_LAYOUTS`/`ENDING_LAYOUTS`/`CONTENT_LAYOUTS`/
// `TAKEOVER_LAYOUTS` Records — and serialized it). This test replays the
// post-migration aggregator (`LAYOUT_REGISTRY` rebuilt from `layoutDef`
// imports scattered across `archetypes/*.tsx` + `image-pages.tsx`) and
// asserts it is unchanged, both in content (every definition, deep-equal)
// and in key order (insertion order feeds `layoutsForSlideType`'s
// `Object.values` walk, which feeds `theme.layouts[type]`'s array order,
// which `resolveArchetypeId`'s `weightedPickBySeed` samples from
// positionally — a silent reorder would not fail typecheck or most tests,
// but would silently redistribute deterministic seed-based layout picks).
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { LAYOUT_REGISTRY } from "./registry"

const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/pre-migration-layout-registry.json", import.meta.url), "utf-8"),
) as { order: string[]; registry: Record<string, unknown> }

describe("LAYOUT_REGISTRY migration guard (registry.ts aggregator conversion, T1d)", () => {
  it("key insertion order is byte-identical to the pre-migration registry", () => {
    expect(Object.keys(LAYOUT_REGISTRY)).toEqual(fixture.order)
  })

  it("every definition is deep-equal to its pre-migration counterpart", () => {
    expect(LAYOUT_REGISTRY).toEqual(fixture.registry)
  })
})
