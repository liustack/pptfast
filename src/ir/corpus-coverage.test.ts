// @vitest-environment node
//
// Permanent regression test: every live `COMPONENT_TYPES` member must be
// behaviorally exercised at least once by the IR validation corpus
// assembled below (`examples/*.json` + `STRESS_DECKS` + the hand-written
// `COVERAGE_ENTRIES`). This is what forces corpus coverage onto every
// future component type — land a new component without also getting it
// into this corpus (either because an existing `examples/*.json`/
// `STRESS_DECKS` fixture already happens to use it, or because a new
// `COVERAGE_ENTRIES` pair was added for it), and the first test below
// goes red.
//
// Why this can't just rely on `examples/*.json` + `STRESS_DECKS` alone:
// those two sources are curated for other purposes (a walkthrough example;
// 13-theme render/audit pressure pages) and aren't guaranteed to touch
// every component type. They didn't, once: an audit found they covered
// only 27 of the IR's 32 component types at the time — `gantt`, `heatmap`,
// `image_grid`, `sankey`, `waterfall` never appeared in either. That
// mattered more than an ordinary coverage gap because `z.refine`/
// `z.superRefine` closures are opaque to static schema inspection
// (`z.toJSONSchema` can't see them) — a type missing from every corpus
// entry isn't just an untested happy path, it's an untested *rejection*
// path too. The gap was confirmed by reproduction: deleting `sankey`'s
// entire 6-check `superRefine` block (duplicate node ids, dangling
// `from`/`to`, self-loops, cycle detection) left every existing test green,
// because nothing in the corpus ever constructed a `sankey` component at
// all.
//
// `COVERAGE_ENTRIES` below closes that class of gap directly: for each
// type not otherwise guaranteed to appear, a `-valid` entry (a clean
// minimal instance — proves the happy parse still succeeds) and a
// `-tripwire` entry (an otherwise-minimal instance that fails exactly one
// check, isolated so the failure is unambiguous). Deliberately literals in
// this file, not new `STRESS_DECKS` pages — `STRESS_DECKS` is a
// render-pressure fixture set (13-theme render/audit assertions read it
// elsewhere), the wrong, far more expensive tool for "make sure this one
// schema branch gets exercised." Add a new `-valid`/`-tripwire` pair here
// whenever a new component type isn't already covered by
// `examples/*.json` or `STRESS_DECKS` (R1's `data_table` is the next one
// due).
import { extname } from "node:path"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { validateIr } from "@/api"
import { COMPONENT_TYPES } from "@/ir"
import { STRESS_DECKS } from "@/svg/audit/stress-fixtures"

const EXAMPLES_DIR = new URL("../../examples/", import.meta.url)

/** Wraps one component in the smallest deck `validateIr` accepts — every `coverage/*` entry below is single-component, which trivially satisfies `checkFullBodyExclusivity` for the full-body types among them (gantt/heatmap/sankey/waterfall). */
function minimalDeck(component: Record<string, unknown>): unknown {
  return {
    version: "4",
    theme: { id: "consulting" },
    slides: [{ type: "content", heading: "coverage probe", components: [component] }],
  }
}

/**
 * Hand-written fill-in for component types not otherwise guaranteed to
 * appear in `examples/*.json` or `STRESS_DECKS` — see this file's top doc
 * comment for why this exists. Each type gets exactly 2 entries: `-valid`
 * (a clean minimal instance — proves the happy parse still succeeds) and
 * `-tripwire` (an otherwise-minimal instance that fails exactly one check,
 * isolated so the failure is unambiguous). Both are asserted against
 * `validateIr` below — the coverage test only proves the type is
 * *present* in the corpus; the per-entry assertions below prove its
 * refine/bound actually *fires*:
 *  - `gantt-tripwire`: item `end` (8) not `>` its own `start` (8) —
 *    `GanttItemSchema`'s `.refine`.
 *  - `heatmap-tripwire`: `domain.max` (1) `<` `domain.min` (10) — the 3rd
 *    of heatmap's 3 `.refine`s; `values`/`x_labels`/`y_labels` stay
 *    perfectly shaped so the other 2 refines don't also fire.
 *  - `sankey-tripwire`: link `to: "c"` references a node id not declared
 *    in `nodes` — the dangling-endpoint check inside `sankey`'s
 *    `superRefine`.
 *  - `image_grid-tripwire` / `waterfall-tripwire`: neither component
 *    declares a custom refine, so each trips its tightest schema-level
 *    bound instead (`image_grid.items` `min(2)`, `waterfall.items`
 *    `min(3)`).
 *  - `data_table-tripwire` (R1 evidence wave, Task T3 — 33rd component):
 *    row 0's `cells` carries `ghost_col`, a key not declared in `columns` —
 *    the sharpest contract violation this component's schema rejects (`ir/
 *    components/data-table.ts`'s `superRefine`). Deliberately not a
 *    *missing*-key row (`cells` short one declared column's key) — that
 *    case is schema-legal by the plan's own lenient-revision contract
 *    (renders empty + an `ir-quality.ts` warn, never a parse failure), so it
 *    belongs in a quality/warn-path test (`ir-quality.test.tsx`), not this
 *    file's hard-rejection tripwire.
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
  "coverage/data_table-valid": minimalDeck({
    type: "data_table",
    columns: [
      { key: "metric", label: "Metric" },
      { key: "q1", label: "Q1", align: "right" },
    ],
    rows: [{ cells: { metric: "Revenue", q1: "120" } }],
  }),
  "coverage/data_table-tripwire": minimalDeck({
    type: "data_table",
    columns: [
      { key: "metric", label: "Metric" },
      { key: "q1", label: "Q1", align: "right" },
    ],
    rows: [{ cells: { metric: "Revenue", q1: "120", ghost_col: "x" } }],
  }),
}

// Assembles the validation corpus from all three sources, keyed by
// `<source>/<name>` (only used for readable failure output — the coverage
// test below doesn't care about the keys, just the `type` of each
// component it finds inside).
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

describe("validation corpus coverage", () => {
  it(`the corpus behaviorally exercises all ${COMPONENT_TYPES.length} live COMPONENT_TYPES at least once`, () => {
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

  describe("COVERAGE_ENTRIES actually exercise their target check (presence alone doesn't prove this)", () => {
    const validEntries = Object.entries(COVERAGE_ENTRIES).filter(([key]) => key.endsWith("-valid"))
    const tripwireEntries = Object.entries(COVERAGE_ENTRIES).filter(([key]) => key.endsWith("-tripwire"))

    it.each(validEntries)("%s parses cleanly", (_key, deck) => {
      const result = validateIr(deck)
      expect(result.ok).toBe(true)
      expect(result.errors).toEqual([])
    })

    it.each(tripwireEntries)("%s fails validation", (_key, deck) => {
      const result = validateIr(deck)
      expect(result.ok).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })
})
