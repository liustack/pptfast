import type { PptxIR } from "./index"
import type { PptxIRV3 } from "./legacy-v3"

/**
 * `scenario.mode` → `narrative.strategy` value map (spec §9.1): only the
 * `"narrative"` mode value renames (the abstraction/instance collision spec
 * §1 flags), every other mode value (`pyramid`/`instructional`/`showcase`/
 * `briefing`) carries straight across unchanged.
 */
const STRATEGY_VALUE_MIGRATION: Readonly<Record<string, string>> = { narrative: "storytelling" }

/**
 * `scenario.delivery` → `narrative.pacing` value map (spec §9.1): `text` →
 * `dense`, `presentation` → `spacious`. `balanced` is not listed because it
 * maps to itself — the fallback branch below handles it (and any other
 * value this map doesn't know about) as an identity mapping.
 */
const PACING_VALUE_MIGRATION: Readonly<Record<string, string>> = { text: "dense", presentation: "spacious" }

/**
 * Map one v3 `scenario` input (`PptxIRV3Schema`'s open `string |
 * Record<string, unknown>` shape) to its v4 `narrative` equivalent, per spec
 * §9.1's field/value table:
 *
 * ```text
 * scenario                             → narrative
 * scenario.mode                        → narrative.strategy
 * scenario.mode: "narrative"           → narrative.strategy: "storytelling"
 * scenario.delivery                    → narrative.pacing
 * scenario.delivery: "text"            → narrative.pacing: "dense"
 * scenario.delivery: "balanced"        → narrative.pacing: "balanced"
 * scenario.delivery: "presentation"    → narrative.pacing: "spacious"
 * scenario.audience                    → narrative.audience
 * ```
 *
 * A preset-id string (e.g. `"annual-review"`) carries straight across
 * unchanged — spec §5: preset ids are not renamed, only the axes and values
 * a preset resolves to internally. An `undefined` input stays `undefined` —
 * both `resolveScenario` and `resolveNarrative` fall back to the exact same
 * `general` preset for an omitted axis input, so omitting is itself already
 * the equivalence-preserving choice (no need to materialize the default).
 *
 * Deliberately mechanical, not validating: an unrecognized key (already
 * invalid under v3 too) or an unrecognized `mode`/`delivery` value passes
 * through unchanged rather than throwing — `migrateIrV3ToV4` is a pure
 * structural mapping (spec §9.3: "只做已声明的结构映射，不运行模型，不重写
 * 内容"), not a second copy of `resolveScenario`'s own runtime validation.
 * Any input that was already invalid under v3's own semantics stays exactly
 * as invalid under v4's — `resolveNarrative` reports it as such the same way
 * `resolveScenario` would have.
 */
function migrateNarrativeInput(
  scenario: string | Record<string, unknown> | undefined,
): string | Record<string, unknown> | undefined {
  if (scenario === undefined || typeof scenario === "string") return scenario

  const narrative: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(scenario)) {
    if (key === "mode") {
      narrative.strategy = typeof value === "string" ? (STRATEGY_VALUE_MIGRATION[value] ?? value) : value
    } else if (key === "delivery") {
      narrative.pacing = typeof value === "string" ? (PACING_VALUE_MIGRATION[value] ?? value) : value
    } else if (key === "audience") {
      narrative.audience = value
    } else {
      // Unknown key on an already-open record — not one of v3's own
      // documented axis keys. Carried across as-is (see this function's own
      // docstring on why this stays mechanical, not validating).
      narrative[key] = value
    }
  }
  return narrative
}

/**
 * Deterministic, pure IR v3 → v4 migration (spec §9.1). Field-for-field,
 * value-for-value per the mapping in {@link migrateNarrativeInput}'s
 * docstring — every field this function doesn't touch (`filename`, `theme`,
 * `meta`, `assets`, `brand`, `seed`, `slides`) carries across by the exact
 * same reference it came in with, unchanged (spec §9.1: "其余 IR 字段保持不
 * 变"; spec §10: no weight/budget/selection/render change is in scope for
 * this migration, ever).
 *
 * Exported from the SDK surface (`src/index.ts`) as the deterministic
 * migration primitive the `pptfast migrate` CLI command (task 2) wraps —
 * this function itself does no I/O and never runs a model, per spec §9.3's
 * "只做已声明的结构映射，不运行模型，不重写内容，不重新选择 layout".
 *
 * Takes an already-parsed `PptxIRV3` (i.e. `PptxIRV3Schema.parse(...)`'s
 * output, defaults already applied) rather than raw `unknown` JSON — schema
 * validation of the v3 input is the caller's job (the CLI parses-then-
 * migrates; `validateIr`'s own v3 path hard-rejects before ever reaching
 * this function, spec §9.3, so `validateIr` itself never calls this).
 */
export function migrateIrV3ToV4(v3: PptxIRV3): PptxIR {
  const narrative = migrateNarrativeInput(v3.scenario as string | Record<string, unknown> | undefined)
  return {
    version: "4",
    filename: v3.filename,
    ...(narrative !== undefined ? { narrative } : {}),
    theme: v3.theme,
    meta: v3.meta,
    assets: v3.assets,
    ...(v3.brand !== undefined ? { brand: v3.brand } : {}),
    ...(v3.seed !== undefined ? { seed: v3.seed } : {}),
    slides: v3.slides,
  }
}
