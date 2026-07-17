import { describe, expect, it } from "vitest"
import { PPTX_ICONS, PPTX_ICON_NAMES } from "./icons"
import { LEGACY_ICON_NAMES } from "./icons.legacy-names"

describe("PPTX icon catalog (W2.5 full lucide set)", () => {
  it("carries at least 1500 icons (full lucide import, not the pre-W2.5 curated 431)", () => {
    expect(PPTX_ICON_NAMES.length).toBeGreaterThanOrEqual(1500)
  })
})

describe("PPTX icon catalog: compat lock", () => {
  // Superset expansion, never a replacement — every name the pre-W2.5
  // curated catalog shipped must still resolve today, even where lucide
  // renamed the underlying icon upstream (gen-pptx-icons.mts bridges those
  // via its own COMPAT_ALIASES map). See icons.legacy-names.ts for provenance.
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
