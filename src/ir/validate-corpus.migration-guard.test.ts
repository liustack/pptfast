// @vitest-environment node
//
// Wave-2 (src domain reorg) migration guard 2 of 3 — ONE-TIME, may be
// deleted in a later wave once the `src/ir/components/*.ts` per-component
// migration (W2b/W2c) is trusted. Same convention T1d established
// (`src/svg/layouts/registry.migration-guard.test.ts`) and guard 1 of 3
// (`./ir-json-schema.migration-guard.test.ts`) follows: a fixture captured
// *before* the migration, replayed after each batch.
//
// Guard 1 proves the IR's *JSON Schema* is structurally unchanged; this
// guard proves `validateIr`'s actual runtime *behavior* is unchanged —
// necessary because `.strict()`/bounds/refine semantics could in principle
// survive a JSON-Schema-level comparison (or a schema-level change could be
// masked by `z.toJSONSchema`'s own representation choices) while still
// changing what a real document parses to, or which errors/warnings it
// produces.
//
// **Coverage incident (post-review fix, kept here as the load-bearing
// rationale for the `coverage/*` entries below — do not re-narrow this
// corpus without re-reading it):** the first version of this guard used
// only `examples/*.json` + `STRESS_DECKS` as its corpus, which reviewer
// probing found covers just 27 of the IR's 32 component types — `gantt`,
// `heatmap`, `image_grid`, `sankey`, `waterfall` never appeared anywhere in
// it. `z.refine`/`z.superRefine` closures are opaque to `z.toJSONSchema`
// (guard 1 cannot see them at all), so for those 5 types the differential
// corpus was their *only* net. The reviewer's kill-test — delete sankey's
// entire 6-check `superRefine` block (duplicate node ids, dangling
// `from`/`to`, self-loops, cycle detection) — was independently reproduced
// before this fix: with that block deleted, all 3 guards (this one
// included) stayed green, because no corpus entry ever exercised sankey at
// all. See the task report for the reproduction transcript and the
// post-fix re-run proving this guard now fails that exact mutation.
//
// Corpus, current form:
//  - every `examples/*.json` (currently just `basic.json`)
//  - every `STRESS_DECKS` entry (`src/svg/audit/stress-fixtures.ts`, 11
//    decks, covering 27 of the 32 component types at least once, several
//    deliberately schema/quality-gate-failing by design — see that file's
//    own header)
//  - `COVERAGE_ENTRIES` below: 2 guard-local entries per one of the 5
//    types missing from the two sources above — a clean minimal valid
//    instance, and an instance that trips that type's sharpest available
//    check (its one custom `.refine`/`superRefine` when it has one —
//    gantt/heatmap/sankey — or its tightest schema-level array bound when
//    it doesn't — image_grid/waterfall neither declare a refine, spec'd by
//    the reviewer's own fix instructions). Deliberately literals in this
//    file, not new `STRESS_DECKS` pages — `STRESS_DECKS` is a render-
//    pressure fixture set (13-theme render/audit assertions read it
//    elsewhere), the wrong, far more expensive tool for "make sure this
//    one schema branch gets exercised."
//
// "any existing IR test fixtures dir" (spec's own phrasing) was checked and
// found not to apply: `src/ir/__fixtures__/` holds only
// `v3-equivalence-decks.ts` (raw v3-shaped input — `version: "3"`, which
// `validateIr` hard-rejects before any schema/quality logic runs, an
// already-covered, uninteresting path for this guard) and
// `equivalence-golden/` (rendered SVG/PPTX/audit *output*, not IR *input*).
// Neither belongs in a v4 `validateIr` input corpus.
//
// `__fixtures__/pre-wave2-validate-corpus.json` stores, per corpus entry,
// exactly `{ok, errors, warnings, normalized}` (not the full `ValidateResult`
// — `ir` is deliberately excluded, spec §5 item 2's own field list) —
// stable-stringified (sorted keys, `./__fixtures__/stable-stringify.ts`),
// captured by the same one-time, now-deleted `__tmp-dump-wave2-guards.
// test.ts` guard 1 was (regenerated once, alongside the `coverage/*`
// entries below, by re-running that same disposable script — still a
// legitimate *pre-migration* capture: HEAD at capture time is still
// e985784-plus-guards, `ComponentSchema` still one 32-member array in
// `src/ir/index.ts`, no component has moved to `src/ir/components/*.ts`
// yet). Determinism was checked two ways before trusting this fixture:
// statically (no `Date`/`Math.random`/filesystem read anywhere in
// `validateIr`'s own dependency closure — `src/validate-core.ts` and
// everything it imports) and empirically (the dump script ran `validateIr`
// twice per entry and asserted the two results were identical before
// writing the fixture).
import { extname } from "node:path"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { validateIr } from "@/api"
import { COMPONENT_TYPES } from "@/ir"
import { STRESS_DECKS } from "@/svg/audit/stress-fixtures"

const EXAMPLES_DIR = new URL("../../examples/", import.meta.url)

interface StoredResult {
  ok: boolean
  errors: unknown[]
  warnings?: unknown[]
  normalized?: string[]
}

const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/pre-wave2-validate-corpus.json", import.meta.url), "utf-8"),
) as Record<string, StoredResult>

/** Same 4 fields the fixture stores — see this file's own doc comment for why `ir` is excluded. */
function pickResult(r: ReturnType<typeof validateIr>): StoredResult {
  const { ok, errors, warnings, normalized } = r
  return { ok, errors, warnings, normalized }
}

/** Wraps one component in the smallest deck validateIr accepts — every `coverage/*` entry below is single-component, which trivially satisfies `checkFullBodyExclusivity` for the 4 of the 5 covered types (gantt/heatmap/sankey/waterfall) that are full-body. */
function minimalDeck(component: Record<string, unknown>): unknown {
  return {
    version: "4",
    theme: { id: "consulting" },
    slides: [{ type: "content", heading: "coverage probe", components: [component] }],
  }
}

/**
 * Guard-local fill-in for the 5 component types absent from both
 * `examples/*.json` and `STRESS_DECKS` — see this file's top doc comment
 * ("Coverage incident") for why this exists. Each type gets exactly 2
 * entries: `-valid` (a clean minimal instance — proves the happy parse
 * still succeeds) and `-tripwire` (an otherwise-minimal instance that
 * fails exactly one check, isolated so the failure is unambiguous):
 *  - `gantt-tripwire`: item `end` (8) not `>` its own `start` (8) —
 *    `GanttItemSchema`'s `.refine`.
 *  - `heatmap-tripwire`: `domain.max` (1) `<` `domain.min` (10) — the
 *    3rd of heatmap's 3 `.refine`s; `values`/`x_labels`/`y_labels` stay
 *    perfectly shaped so the other 2 refines don't also fire.
 *  - `sankey-tripwire`: link `to: "c"` references a node id not declared
 *    in `nodes` — the dangling-endpoint check inside the `superRefine`
 *    the kill-test deleted (the reviewer's own suggested tripwire).
 *  - `image_grid-tripwire` / `waterfall-tripwire`: neither component
 *    declares a custom refine, so each trips its tightest schema-level
 *    bound instead (`image_grid.items` `min(2)`, `waterfall.items`
 *    `min(3)`) — per the reviewer's fix instructions ("their tightest
 *    constraint").
 */
const COVERAGE_ENTRIES: Record<string, unknown> = {
  "coverage/gantt-valid": minimalDeck({
    type: "gantt",
    items: [
      { label: "Design", start: 0, end: 5 },
      { label: "Build", start: 5, end: 12 },
    ],
  }),
  "coverage/gantt-tripwire": minimalDeck({
    type: "gantt",
    items: [
      { label: "Design", start: 0, end: 5 },
      { label: "Build", start: 8, end: 8 },
    ],
  }),
  "coverage/heatmap-valid": minimalDeck({
    type: "heatmap",
    x_labels: ["Q1", "Q2"],
    y_labels: ["East", "West"],
    values: [
      [1, 2],
      [3, 4],
    ],
  }),
  "coverage/heatmap-tripwire": minimalDeck({
    type: "heatmap",
    x_labels: ["Q1", "Q2"],
    y_labels: ["East", "West"],
    values: [
      [1, 2],
      [3, 4],
    ],
    domain: { min: 10, max: 1 },
  }),
  "coverage/image_grid-valid": minimalDeck({
    type: "image_grid",
    items: [{ asset_id: "a1" }, { asset_id: "a2" }],
  }),
  "coverage/image_grid-tripwire": minimalDeck({
    type: "image_grid",
    items: [{ asset_id: "a1" }],
  }),
  "coverage/sankey-valid": minimalDeck({
    type: "sankey",
    nodes: [
      { id: "a", label: "Source" },
      { id: "b", label: "Target" },
    ],
    links: [{ from: "a", to: "b", value: 5 }],
  }),
  "coverage/sankey-tripwire": minimalDeck({
    type: "sankey",
    nodes: [
      { id: "a", label: "Source" },
      { id: "b", label: "Target" },
    ],
    links: [{ from: "a", to: "c", value: 5 }],
  }),
  "coverage/waterfall-valid": minimalDeck({
    type: "waterfall",
    items: [
      { label: "Start", value: 100 },
      { label: "Q1", value: 20 },
      { label: "Q2", value: -15 },
    ],
  }),
  "coverage/waterfall-tripwire": minimalDeck({
    type: "waterfall",
    items: [
      { label: "Start", value: 100 },
      { label: "Q1", value: 20 },
    ],
  }),
}

// Rebuilds the exact corpus the one-time dump script captured — same file
// enumeration, same key naming (`examples/<name>`, `stress/<name>`,
// `coverage/<name>`).
const exampleFiles = readdirSync(fileURLToPath(EXAMPLES_DIR))
  .filter((f) => extname(f) === ".json")
  .sort()

const corpus: Record<string, unknown> = {}
for (const file of exampleFiles) {
  corpus[`examples/${file.slice(0, -".json".length)}`] = JSON.parse(readFileSync(new URL(file, EXAMPLES_DIR), "utf-8"))
}
for (const [name, deck] of Object.entries(STRESS_DECKS)) {
  corpus[`stress/${name}`] = deck
}
for (const [key, deck] of Object.entries(COVERAGE_ENTRIES)) {
  corpus[key] = deck
}

describe("validateIr differential migration guard (src domain reorg wave 2, spec §5 guard 2/3)", () => {
  it("the corpus key set matches the pre-migration capture exactly (catches corpus drift, not just result drift)", () => {
    expect(Object.keys(corpus).sort()).toEqual(Object.keys(fixture).sort())
  })

  it("the corpus behaviorally exercises all 32 live COMPONENT_TYPES at least once (the coverage incident's own regression test)", () => {
    const touched = new Set<string>()
    for (const raw of Object.values(corpus)) {
      const slides = (raw as { slides?: unknown[] }).slides
      if (!Array.isArray(slides)) continue
      for (const slide of slides) {
        const components = (slide as { components?: unknown[] }).components
        if (!Array.isArray(components)) continue
        for (const c of components) {
          const t = (c as { type?: unknown }).type
          if (typeof t === "string") touched.add(t)
        }
      }
    }
    for (const type of COMPONENT_TYPES) {
      expect(touched).toContain(type)
    }
  })

  it.each(Object.keys(corpus))("%s: {ok, errors, warnings, normalized} is deep-equal to the pre-migration capture", (key) => {
    expect(pickResult(validateIr(corpus[key]))).toEqual(fixture[key])
  })
})
