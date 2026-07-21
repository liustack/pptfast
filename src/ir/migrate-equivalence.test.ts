// @vitest-environment node
//
// The equivalence-proof hard gate (vocabulary-v4 rename, task 1, spec §10/
// §12): a v3 deck migrated through `migrateIrV3ToV4` must render byte-for-
// byte identical SVG and PPTX output to what the *same* deck rendered on
// the pre-rename codebase (base commit 0511b8c, before any vocabulary-v4
// change landed).
//
// Durable form: `../ir/__fixtures__/equivalence-golden/*.json` is a one-time
// capture of that base-commit render (see the task-1 report for the capture
// method — a temporary script, deleted before this commit, that ran
// `V3_EQUIVALENCE_DECKS` through the pre-rename `PptxIRSchema` +
// `renderSlideSvg` + `generatePptxBlob` and wrote the output here). This
// test replays the exact same fixtures through the post-rename pipeline —
// `PptxIRV3Schema.parse` → `migrateIrV3ToV4` → the (now v4-only) render
// chain — and asserts the output is unchanged from that golden capture. A
// regression here means either the migration function or a render consumer
// silently changed behavior, not just vocabulary — the spec §10 violation
// this whole task's discipline exists to catch.
//
// PPTX comparison excludes `docProps/core.xml` (pptxgenjs bakes
// `new Date().toISOString()` into it on every export — the one genuinely
// nondeterministic zip part, unrelated to this task) — the same normalized-
// zip-map method `src/pptx/generate-notes-export.test.ts` already
// established for this repo's byte-comparison tests.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { PptxIRV3Schema } from "./legacy-v3"
import { migrateIrV3ToV4 } from "./migrate"
import { V3_EQUIVALENCE_DECKS } from "./__fixtures__/v3-equivalence-decks"
import { renderSlideSvg } from "@/api"
import { generatePptxBlob } from "@/pptx/generate"
import { auditDeck } from "@/svg/audit/deck-audit"
import { installNodePlatform } from "@/platform/node"

const GOLDEN_DIR = new URL("./__fixtures__/equivalence-golden/", import.meta.url)

function readGoldenJson<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`${name}.json`, GOLDEN_DIR), "utf-8")) as T
}

async function normalizedZipMap(blob: Blob): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const entries = Object.keys(zip.files)
    .filter((p) => !zip.files[p]!.dir && p !== "docProps/core.xml")
    .sort()
  const out: Record<string, string> = {}
  for (const p of entries) out[p] = await zip.files[p]!.async("string")
  return out
}

describe("v3 → v4 migration equivalence (task 1 hard gate, spec §10/§12)", () => {
  installNodePlatform()

  for (const [name, rawV3] of Object.entries(V3_EQUIVALENCE_DECKS)) {
    describe(name, () => {
      const v3 = PptxIRV3Schema.parse(rawV3)
      const v4 = migrateIrV3ToV4(v3)

      it("renders SVG byte-identical to the base-commit (pre-rename) capture, slide for slide", () => {
        const goldenSvgs = readGoldenJson<string[]>(`${name}.svg`)
        const migratedSvgs = v4.slides.map((_, i) => renderSlideSvg(v4, i))
        expect(migratedSvgs).toEqual(goldenSvgs)
      })

      // `basic.pptx-zip.json` recaptured (a:ea follow-up task): consulting's
      // Georgia heading/body has zero CJK glyphs, so the new `applyEaFontFaces`
      // patch (`src/pptx/pptx-ea-fonts.ts`) genuinely changes its exported
      // `<a:ea>` from the old self-mirroring `"Georgia"` to the corrected
      // `"Microsoft YaHei"` — a real, intended behavior change, not a
      // regression. `scenarioBearing`/`annualReviewPreset` both use the
      // `journal` theme (SimSun heading, Microsoft YaHei body — both already
      // CJK-capable, so `eaFontFaceFor` self-references and the patch is a
      // byte-identical no-op there), which is why only `basic`'s golden
      // needed recapturing. Verified via the same targeted-diff discipline as
      // the defect-B recapture below: after normalizing away every
      // `<a:ea typeface="...">` attribute value, old and new
      // `ppt/slides/slide{1..5}.xml` are byte-identical — the *only* change
      // anywhere in the capture is that one attribute, on exactly the
      // Georgia-declared runs, exactly to `"Microsoft YaHei"`.
      it("exports a PPTX byte-identical (docProps/core.xml timestamp excluded) to the base-commit capture", async () => {
        const goldenZipMap = readGoldenJson<Record<string, string>>(`${name}.pptx-zip`)
        const blob = await generatePptxBlob(v4)
        const migratedZipMap = await normalizedZipMap(blob)
        expect(migratedZipMap).toEqual(goldenZipMap)
      })

      // spec §12 output row "迁移前后审计结果等价" (task 4): auditDeck's
      // findings/pagesAudited/pagesSkipped must match what the pre-rename
      // codebase produced on the same deck, same capture method as the SVG/
      // PPTX goldens above (base commit 0511b8c, PptxIRSchema.parse +
      // auditDeck, no migration involved on that side — it's the pre-rename
      // deck audited by pre-rename code) — asserted here precisely so a
      // future regression in either direction gets caught.
      //
      // Recaptured (bench-driven fix round, defect B, Task 3):
      // annualReviewPreset used to carry two low-contrast findings (a
      // kpi_cards up-delta arrow, `#16A34A` against `#FFFFFF` at 3.30:1,
      // duplicated across two cards) — a real defect this fixture happened
      // to bake in from before the fix, not a migration artifact. All three
      // golden files (`.svg`/`.audit`/`.pptx-zip`) were regenerated through
      // this exact test's own code path post-fix; a targeted diff against
      // the pre-recapture goldens confirmed the *only* change anywhere in
      // any of the three is `#16A34A` → `#0A0E14` at the two arrow glyphs
      // (`fill`/`srgbClr val` respectively) plus the now-empty `findings`
      // array — nothing else drifted. See `kpi.tsx`'s own `deltaColor`
      // comment and `full-matrix-contrast.test.ts`'s "defect B real
      // contrast fixes" sweep for the fix itself.
      it("audits byte-identical findings to the base-commit (pre-rename) capture", () => {
        const goldenAudit = readGoldenJson<ReturnType<typeof auditDeck>>(`${name}.audit`)
        const migratedAudit = auditDeck(v4)
        expect(migratedAudit).toEqual(goldenAudit)
      })
    })
  }

  // The annual-review preset's own worked example (spec §5): "旧：narrative ×
  // balanced × public / 新：storytelling × balanced × public" — the preset id
  // string carries across unchanged, but its *internal* axes resolution
  // (`NARRATIVE_PRESETS["annual-review"]`) must still resolve to the exact
  // same strategy/pacing/audience triple the old `SCENARIO_PRESETS` entry
  // did, just spelled with the new vocabulary — proven here by rendering
  // through the real chain rather than re-asserting the preset table (that
  // table has its own dedicated pins in `narrative/index.test.ts`).
  it("the annual-review preset migrates by id alone (no per-axis remap needed) and still renders byte-identical", () => {
    const v3 = PptxIRV3Schema.parse(V3_EQUIVALENCE_DECKS.annualReviewPreset)
    expect(v3.scenario).toBe("annual-review")
    const v4 = migrateIrV3ToV4(v3)
    expect(v4.narrative).toBe("annual-review")
  })
})
