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
// produces. `errors`/`warnings` carry every hard/soft validation outcome —
// including all 6 `superRefine` sankey checks and the 3 heatmap `.refine`s —
// so a differential over real documents is the behavioral complement to
// guard 1's structural one.
//
// Corpus (spec §5 item 2: "对全部现有测试夹具 + examples/ + STRESS_DECKS 跑
// validateIr"): every `examples/*.json` (currently just `basic.json`) +
// every `STRESS_DECKS` entry (`src/svg/audit/stress-fixtures.ts`, 11 decks
// covering all 32 component types at least once, several deliberately
// schema/quality-gate-failing by design — see that file's own header).
// "any existing IR test fixtures dir" (spec's own phrasing) was checked and
// found not to apply: `src/ir/__fixtures__/` holds only
// `v3-equivalence-decks.ts` (raw v3-shaped input — `version: "3"`, which
// `validateIr` hard-rejects before any schema/quality logic runs, an
// already-covered, uninteresting path for this guard) and
// `equivalence-golden/` (rendered SVG/PPTX/audit *output*, not IR *input*).
// Neither belongs in a v4 `validateIr` input corpus, so this guard's corpus
// is exactly examples + STRESS_DECKS.
//
// `__fixtures__/pre-wave2-validate-corpus.json` stores, per corpus entry,
// exactly `{ok, errors, warnings, normalized}` (not the full `ValidateResult`
// — `ir` is deliberately excluded, spec §5 item 2's own field list) —
// stable-stringified (sorted keys, `./__fixtures__/stable-stringify.ts`),
// captured by the same one-time, now-deleted `__tmp-dump-wave2-guards.
// test.ts` guard 1 was. Determinism was checked two ways before trusting
// this fixture: statically (no `Date`/`Math.random`/filesystem read anywhere
// in `validateIr`'s own dependency closure — `src/validate-core.ts` and
// everything it imports) and empirically (the dump script ran `validateIr`
// twice per `STRESS_DECKS` entry and asserted the two results were
// identical before writing the fixture).
import { extname } from "node:path"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { validateIr } from "@/api"
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

// Rebuilds the exact corpus the one-time dump script captured — same file
// enumeration, same key naming (`examples/<name>`, `stress/<name>`).
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

describe("validateIr differential migration guard (src domain reorg wave 2, spec §5 guard 2/3)", () => {
  it("the corpus key set matches the pre-migration capture exactly (catches corpus drift, not just result drift)", () => {
    expect(Object.keys(corpus).sort()).toEqual(Object.keys(fixture).sort())
  })

  it.each(Object.keys(corpus))("%s: {ok, errors, warnings, normalized} is deep-equal to the pre-migration capture", (key) => {
    expect(pickResult(validateIr(corpus[key]))).toEqual(fixture[key])
  })
})
