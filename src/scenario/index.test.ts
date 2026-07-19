import { describe, it, expect } from "vitest"
import { PptfastError } from "../errors"
import { BUILTIN_THEME_IDS } from "../ir"
import {
  MODE_DEFINITIONS,
  DELIVERY_BUDGETS,
  SCENARIO_PRESETS,
  DEFAULT_SCENARIO,
  resolveScenario,
  MODE_VALUES,
  DELIVERY_VALUES,
  AUDIENCE_VALUES,
  type Mode,
  type Delivery,
  type Audience,
  type ScenarioAxes,
} from "./index"

// ── mode definitions (spec §5 mode 五分类) ──────────────────────────────

describe("MODE_DEFINITIONS", () => {
  const expectedModes: Mode[] = ["pyramid", "narrative", "instructional", "showcase", "briefing"]

  it("has exactly the 5 spec modes, each self-keyed", () => {
    expect(Object.keys(MODE_DEFINITIONS).sort()).toEqual([...expectedModes].sort())
    for (const mode of expectedModes) {
      expect(MODE_DEFINITIONS[mode].id).toBe(mode)
    }
  })

  it("every mode carries a non-empty tendency set", () => {
    for (const mode of expectedModes) {
      expect(MODE_DEFINITIONS[mode].tendencies.length).toBeGreaterThan(0)
    }
  })

  it("pins each mode's rhythmPolicy to its spec §5 節奏缺省 mapping", () => {
    expect(MODE_DEFINITIONS.pyramid.rhythmPolicy).toBe("anchor-open")
    expect(MODE_DEFINITIONS.narrative.rhythmPolicy).toBe("alternate")
    expect(MODE_DEFINITIONS.instructional.rhythmPolicy).toBe("repetition-ok")
    expect(MODE_DEFINITIONS.showcase.rhythmPolicy).toBe("anchor-sparse")
    expect(MODE_DEFINITIONS.briefing.rhythmPolicy).toBe("uniform-dense")
  })

  it("pyramid tendencies match spec §5 row as-is (component types), plus the structure-components wave's decision 9 join", () => {
    expect(MODE_DEFINITIONS.pyramid.tendencies).toEqual([
      "kpi_cards",
      "verdict_banner",
      "chart",
      "comparison",
      "matrix",
      "roadmap",
      "swot",
      "bmc",
      "waterfall",
      "gantt",
    ])
  })

  it("narrative normalizes the image family to kebab layout ids, not the underscore form", () => {
    expect(MODE_DEFINITIONS.narrative.tendencies).toContain("image-split")
    expect(MODE_DEFINITIONS.narrative.tendencies).toContain("image-top")
    expect(MODE_DEFINITIONS.narrative.tendencies).toContain("image-bottom")
    expect(MODE_DEFINITIONS.narrative.tendencies).toContain("image-annotate")
    expect(MODE_DEFINITIONS.narrative.tendencies).not.toContain("image_split")
    expect(MODE_DEFINITIONS.narrative.tendencies).toContain("quote")
    expect(MODE_DEFINITIONS.narrative.tendencies).toContain("timeline")
    expect(MODE_DEFINITIONS.narrative.tendencies).toContain("callout")
  })

  it("instructional tendencies match spec §5 row as-is, plus the structure-components wave's decision 9 gantt join", () => {
    expect(MODE_DEFINITIONS.instructional.tendencies).toEqual([
      "steps",
      "numbered_cards",
      "flowchart",
      "architecture",
      "code",
      "gantt",
    ])
  })

  it("showcase carries the full image family plus image_grid (component type) and kpi_cards", () => {
    expect(MODE_DEFINITIONS.showcase.tendencies).toContain("image-split")
    expect(MODE_DEFINITIONS.showcase.tendencies).toContain("image-top")
    expect(MODE_DEFINITIONS.showcase.tendencies).toContain("image-bottom")
    expect(MODE_DEFINITIONS.showcase.tendencies).toContain("image-annotate")
    // image_grid stays a component type (underscore), not a layout id.
    expect(MODE_DEFINITIONS.showcase.tendencies).toContain("image_grid")
    expect(MODE_DEFINITIONS.showcase.tendencies).not.toContain("image-grid")
    // spec's "巨号 kpi" normalizes to the kpi_cards component type.
    expect(MODE_DEFINITIONS.showcase.tendencies).toContain("kpi_cards")
  })

  it("briefing tendencies match spec §5 row as-is", () => {
    expect(MODE_DEFINITIONS.briefing.tendencies).toEqual(["bullets", "row_cards", "timeline", "citation"])
  })
})

// ── delivery budgets (spec §5 delivery table, pinned) ───────────────────

describe("DELIVERY_BUDGETS", () => {
  it("pins text/balanced/presentation to the spec §5 table values", () => {
    expect(DELIVERY_BUDGETS.text).toEqual({
      bodyBaselinePx: 20,
      maxComponentsPerSlide: 5,
      bullets: { maxItems: 6, maxUnitsPerItem: 48 },
    })
    expect(DELIVERY_BUDGETS.balanced).toEqual({
      bodyBaselinePx: 24,
      maxComponentsPerSlide: 4,
      bullets: { maxItems: 5, maxUnitsPerItem: 40 },
    })
    expect(DELIVERY_BUDGETS.presentation).toEqual({
      bodyBaselinePx: 32,
      maxComponentsPerSlide: 3,
      bullets: { maxItems: 4, maxUnitsPerItem: 30 },
    })
  })

  it("has exactly the 3 delivery keys", () => {
    expect(Object.keys(DELIVERY_BUDGETS).sort()).toEqual(["balanced", "presentation", "text"])
  })
})

// ── named presets (spec §5 具名预设) ────────────────────────────────────

describe("SCENARIO_PRESETS", () => {
  const expectedIds = [
    "general",
    "boardroom-report",
    "pitch",
    "training",
    "product-launch",
    "weekly-brief",
    "annual-review",
  ]

  it("has exactly the 7 spec presets, each self-keyed", () => {
    expect(Object.keys(SCENARIO_PRESETS).sort()).toEqual([...expectedIds].sort())
    for (const id of expectedIds) {
      expect(SCENARIO_PRESETS[id].id).toBe(id)
    }
  })

  it("pins each preset's axes to the spec §5 mode×delivery×audience triple", () => {
    expect(SCENARIO_PRESETS.general.axes).toEqual({ mode: "briefing", delivery: "balanced", audience: "public" })
    expect(SCENARIO_PRESETS["boardroom-report"].axes).toEqual({
      mode: "pyramid",
      delivery: "presentation",
      audience: "executive",
    })
    expect(SCENARIO_PRESETS.pitch.axes).toEqual({ mode: "pyramid", delivery: "presentation", audience: "customer" })
    expect(SCENARIO_PRESETS.training.axes).toEqual({
      mode: "instructional",
      delivery: "balanced",
      audience: "technical",
    })
    expect(SCENARIO_PRESETS["product-launch"].axes).toEqual({
      mode: "showcase",
      delivery: "presentation",
      audience: "customer",
    })
    expect(SCENARIO_PRESETS["weekly-brief"].axes).toEqual({
      mode: "briefing",
      delivery: "text",
      audience: "technical",
    })
    expect(SCENARIO_PRESETS["annual-review"].axes).toEqual({
      mode: "narrative",
      delivery: "balanced",
      audience: "public",
    })
  })

  it("every preset axes triple is internally valid (mode/delivery/audience enum members)", () => {
    for (const id of expectedIds) {
      const { axes } = SCENARIO_PRESETS[id]
      expect(MODE_VALUES).toContain(axes.mode)
      expect(DELIVERY_VALUES).toContain(axes.delivery)
      expect(AUDIENCE_VALUES).toContain(axes.audience)
    }
  })

  it("every preset carries at least one theme recommendation, all real BUILTIN_THEME_IDS members", () => {
    for (const id of expectedIds) {
      const { themeRecommendations } = SCENARIO_PRESETS[id]
      expect(themeRecommendations.length).toBeGreaterThan(0)
      for (const themeId of themeRecommendations) {
        expect(BUILTIN_THEME_IDS as readonly string[]).toContain(themeId)
      }
    }
  })

  it("pins the spec §5 theme recommendation table", () => {
    expect(SCENARIO_PRESETS["boardroom-report"].themeRecommendations).toEqual(["consulting", "enterprise", "insight"])
    expect(SCENARIO_PRESETS.pitch.themeRecommendations).toEqual(["consulting", "tech", "campaign"])
    expect(SCENARIO_PRESETS.training.themeRecommendations).toEqual(["classroom", "academic", "tech"])
    expect(SCENARIO_PRESETS["product-launch"].themeRecommendations).toEqual(["campaign", "runway", "tech"])
    expect(SCENARIO_PRESETS["weekly-brief"].themeRecommendations).toEqual(["enterprise", "consulting"])
    expect(SCENARIO_PRESETS["annual-review"].themeRecommendations).toEqual(["journal", "heritage", "insight"])
    expect(SCENARIO_PRESETS.general.themeRecommendations).toEqual(["consulting"])
  })
})

describe("DEFAULT_SCENARIO", () => {
  it("equals the general preset's axes (briefing x balanced x public)", () => {
    expect(DEFAULT_SCENARIO).toEqual({ mode: "briefing", delivery: "balanced", audience: "public" })
    expect(DEFAULT_SCENARIO).toEqual(SCENARIO_PRESETS.general.axes)
  })
})

// ── resolveScenario (spec §5 缺省链) ────────────────────────────────────

describe("resolveScenario", () => {
  it("undefined resolves to DEFAULT_SCENARIO", () => {
    expect(resolveScenario(undefined)).toEqual(DEFAULT_SCENARIO)
  })

  it("a preset id string resolves to that preset's axes", () => {
    expect(resolveScenario("general")).toEqual(SCENARIO_PRESETS.general.axes)
    expect(resolveScenario("boardroom-report")).toEqual(SCENARIO_PRESETS["boardroom-report"].axes)
    expect(resolveScenario("annual-review")).toEqual(SCENARIO_PRESETS["annual-review"].axes)
  })

  it("an unknown preset id throws, listing available preset ids", () => {
    expect(() => resolveScenario("not-a-real-preset")).toThrow(PptfastError)
    expect(() => resolveScenario("not-a-real-preset")).toThrow(/unknown scenario preset/)
    expect(() => resolveScenario("not-a-real-preset")).toThrow(/available:.*general/)
  })

  it("a preset id shadowing an inherited Object.prototype member throws instead of silently resolving", () => {
    // Own-property guard regression probe: SCENARIO_PRESETS is a plain object
    // literal, so a naive `SCENARIO_PRESETS[input]` lookup resolves these to
    // truthy inherited members (the Object constructor, Object.prototype)
    // instead of undefined — silently returning `preset.axes` as undefined
    // rather than throwing. "__proto__" is doubly special: assigning it in an
    // object literal sets the prototype rather than creating an own property,
    // so `Object.hasOwn(SCENARIO_PRESETS, "__proto__")` correctly reports
    // false too.
    expect(() => resolveScenario("constructor")).toThrow(/available/)
    expect(() => resolveScenario("__proto__")).toThrow(/available/)
  })

  it("an empty partial-axes object defaults every axis independently", () => {
    expect(resolveScenario({})).toEqual({ mode: "briefing", delivery: "balanced", audience: "public" })
  })

  it("a partial axes object defaults only the omitted axes", () => {
    expect(resolveScenario({ mode: "pyramid" })).toEqual({
      mode: "pyramid",
      delivery: "balanced",
      audience: "public",
    })
    expect(resolveScenario({ delivery: "text" })).toEqual({
      mode: "briefing",
      delivery: "text",
      audience: "public",
    })
    expect(resolveScenario({ audience: "executive" })).toEqual({
      mode: "briefing",
      delivery: "balanced",
      audience: "executive",
    })
  })

  it("a fully specified partial axes object round-trips unchanged", () => {
    const axes: ScenarioAxes = { mode: "showcase", delivery: "presentation", audience: "customer" }
    expect(resolveScenario({ ...axes })).toEqual(axes)
  })

  it("an unknown mode value throws, listing valid mode values", () => {
    expect(() => resolveScenario({ mode: "bogus" as Mode })).toThrow(PptfastError)
    expect(() => resolveScenario({ mode: "bogus" as Mode })).toThrow(/unknown mode/)
    expect(() => resolveScenario({ mode: "bogus" as Mode })).toThrow(/available:.*pyramid/)
  })

  it("an unknown delivery value throws, listing valid delivery values", () => {
    expect(() => resolveScenario({ delivery: "bogus" as Delivery })).toThrow(PptfastError)
    expect(() => resolveScenario({ delivery: "bogus" as Delivery })).toThrow(/unknown delivery/)
    expect(() => resolveScenario({ delivery: "bogus" as Delivery })).toThrow(/available:.*text/)
  })

  it("an unknown audience value throws, listing valid audience values", () => {
    expect(() => resolveScenario({ audience: "bogus" as Audience })).toThrow(PptfastError)
    expect(() => resolveScenario({ audience: "bogus" as Audience })).toThrow(/unknown audience/)
    expect(() => resolveScenario({ audience: "bogus" as Audience })).toThrow(/available:.*executive/)
  })

  it("an unknown key on the partial axes object throws (strict — a typo is never silently dropped)", () => {
    const bad = { mdoe: "pyramid" } as unknown as Partial<ScenarioAxes>
    expect(() => resolveScenario(bad)).toThrow(PptfastError)
    expect(() => resolveScenario(bad)).toThrow(/unknown scenario axis "mdoe"/)
    expect(() => resolveScenario(bad)).toThrow(/available:.*mode.*delivery.*audience/)
  })

  it("an explicit null axis value throws instead of silently defaulting (null ≠ omission)", () => {
    const bad = { mode: null } as unknown as Partial<ScenarioAxes>
    expect(() => resolveScenario(bad)).toThrow(PptfastError)
    expect(() => resolveScenario(bad)).toThrow(/unknown mode "null" — available:.*pyramid/)
    expect(() => resolveScenario({ delivery: null } as unknown as Partial<ScenarioAxes>)).toThrow(
      /unknown delivery "null"/,
    )
    expect(() => resolveScenario({ audience: null } as unknown as Partial<ScenarioAxes>)).toThrow(
      /unknown audience "null"/,
    )
  })
})
