// @vitest-environment node
//
// Wave-2 (src domain reorg) migration guard 1 of 3 — ONE-TIME, may be
// deleted in a later wave once the `src/ir/components/*.ts` per-component
// migration (W2b/W2c) is trusted. Same convention T1d established
// (`src/svg/layouts/registry.migration-guard.test.ts`): a byte-fixture
// captured *before* the migration, replayed after each batch to prove the
// migration is a pure move, not a respelling.
//
// `__fixtures__/pre-wave2-ir-json-schema.json` is a one-time capture of
// `irJsonSchema()` (`src/validate-core.ts`'s `z.toJSONSchema(PptxIRSchema)`,
// re-exported through `src/api.ts` — note this repo uses zod v4's own
// native `z.toJSONSchema`, not the separate `zod-to-json-schema` package),
// stable-stringified (recursively sorted object keys, see
// `./__fixtures__/stable-stringify.ts`'s own doc comment for why sorted
// rather than insertion order) — captured via a temporary
// `__tmp-dump-wave2-guards.test.ts` (deleted before this commit; see the
// task report for the exact method, a direct descendant of T1d's own
// `__tmp-dump-registry.test.ts` precedent) while `ComponentSchema` still
// lives as one 32-member literal array in `src/ir/index.ts`, pre-migration.
//
// Wave-2 spec §3 hard constraint 2: "`irJsonSchema` 的 JSON 输出字节不变"
// (the IR's public JSON Schema output must not change one byte) — this is
// the machine check for that sentence. A structural change (a member
// reordered inside the `discriminatedUnion`, a field dropped or its
// constraints loosened while hoisting a component into its own
// `src/ir/components/<name>.ts` file, a `.strict()` accidentally dropped)
// would change this output; a pure file-move (same schema, same options
// array order, new import path) would not.
//
// This guard does not by itself prove every migration invariant — see
// `validate-corpus.migration-guard.test.ts`'s own doc comment for the
// behavioral (not just structural) differential guard, and guard 3 of 3:
// the pre-existing 55-pair alias-count pin, `src/ir/field-aliases.test.ts`'s
// "total synonym-pair count" describe block (referenced here, not
// duplicated — spec §5 item 3).
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { irJsonSchema } from "@/api"
import { stableStringify } from "./__fixtures__/stable-stringify"

const fixture = readFileSync(new URL("./__fixtures__/pre-wave2-ir-json-schema.json", import.meta.url), "utf-8")

describe("irJsonSchema migration guard (src domain reorg wave 2, spec §5 guard 1/3)", () => {
  it("JSON Schema output is byte-identical to the pre-migration capture", () => {
    expect(stableStringify(irJsonSchema()) + "\n").toBe(fixture)
  })
})
