import { describe, expect, it } from "vitest"
import { PPTX_ICONS, PPTX_ICON_NAMES } from "./catalog"
import { LEGACY_ICON_NAMES } from "./legacy-names"

describe("PPTX icon catalog (W2.5 full lucide set)", () => {
  it("carries at least 1500 icons (full lucide import, not the pre-W2.5 curated 431)", () => {
    expect(PPTX_ICON_NAMES.length).toBeGreaterThanOrEqual(1500)
  })
})

describe("PPTX icon catalog: compat lock", () => {
  // Superset expansion, never a replacement — every name the pre-W2.5
  // curated catalog shipped must still resolve today, even where lucide
  // renamed the underlying icon upstream (gen-pptx-icons.mts bridges those
  // via its own COMPAT_ALIASES map). See legacy-names.ts for provenance.
  it("retains every pre-W2.5 curated icon name", () => {
    const names = new Set(PPTX_ICON_NAMES)
    const missing = LEGACY_ICON_NAMES.filter((n) => !names.has(n))
    expect(missing).toEqual([])
  })

  it("gives every legacy name a non-empty primitive list", () => {
    for (const name of LEGACY_ICON_NAMES) {
      expect(PPTX_ICONS[name]?.length ?? 0).toBeGreaterThan(0)
    }
  })
})

describe("PPTX icon catalog: model pretraining-habit aliases (T0b fix 1)", () => {
  // Distinct from the compat-lock block above: those 8 (+ this pair) all
  // resolve through the exact same gen-pptx-icons.mts COMPAT_ALIASES
  // mechanism, but the *reason* differs. The compat-lock names bridge a
  // lucide upstream rename away from this repo's own pre-W2.5 curated list
  // (LEGACY_ICON_NAMES already spells this pair "circle-alert"/
  // "triangle-alert" — the current canonical names, not these two). This
  // pair instead rescues a weak-model habit: a model's pretraining data
  // remembers the older lucide-react convention ("alert-circle"/
  // "alert-triangle") that this catalog never used. Bench-evidence: 6 real
  // validate failures across 3 models, `.issues/notes/2026-07-24-bench-rerun.md`
  // item 1.
  it("carries both legacy-habit names in the generated catalog", () => {
    expect(PPTX_ICON_NAMES).toContain("alert-circle")
    expect(PPTX_ICON_NAMES).toContain("alert-triangle")
  })

  it("resolves each legacy-habit name to the exact same primitives as its current canonical name", () => {
    expect(PPTX_ICONS["alert-circle"]).toEqual(PPTX_ICONS["circle-alert"])
    expect(PPTX_ICONS["alert-triangle"]).toEqual(PPTX_ICONS["triangle-alert"])
  })
})
