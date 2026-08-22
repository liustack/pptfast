import { describe, expect, it } from "vitest"
import {
  assignedThemeIds,
  resolveComponentForm,
  type ComponentFormId,
  type FormKnobs,
} from "./form-assignments"

// Render-side form assignment table (component-forms-w1 plumbing). Pure
// lookup contract, independent of any component renderer: missing /
// unknown / unassigned pairs stay undefined so today's default face is
// unchanged. campaign × cycle is hub_spoke (first-listed wins), never
// petal_wheel. 77 rows (72 prior + 5 architecture). classroom is listed
// on callout like every other canonical theme.

type AssignmentRow = {
  componentType: string
  themeId: string
  form: ComponentFormId
  knobs?: FormKnobs
}

const ASSIGNMENTS: AssignmentRow[] = [
  {
    componentType: "icon_cards",
    themeId: "terra",
    form: "icon_columns",
    knobs: { node: "circle", nodeFill: "surface", nodeStroke: "border", iconInk: "accent" },
  },
  {
    componentType: "icon_cards",
    themeId: "lecture",
    form: "icon_columns",
    knobs: { node: "circle", nodeFill: "none", nodeStroke: "dashed", iconInk: "accent" },
  },
  {
    componentType: "icon_cards",
    themeId: "swiss",
    form: "icon_columns",
    knobs: { node: "square", nodeFill: "surface", nodeStroke: "border", iconInk: "text" },
  },
  {
    componentType: "icon_cards",
    themeId: "tech",
    form: "badge_cards",
    knobs: { radius: "soft", badge: "circle-outline" },
  },
  {
    componentType: "icon_cards",
    themeId: "luxe",
    form: "badge_cards",
    knobs: { radius: "square", badge: "circle-outline" },
  },
  {
    componentType: "icon_cards",
    themeId: "vermilion",
    form: "badge_cards",
    knobs: { radius: "soft", badge: "circle-solid" },
  },
  {
    componentType: "icon_cards",
    themeId: "academic",
    form: "outline_grid",
    knobs: { nodeFill: "none", nodeStroke: "primary", radius: "square" },
  },
  {
    componentType: "icon_cards",
    themeId: "ember",
    form: "outline_grid",
    knobs: { nodeFill: "surface", nodeStroke: "border", iconInk: "accent", radius: "square" },
  },
  {
    componentType: "icon_cards",
    themeId: "crayon",
    form: "outline_grid",
    knobs: { nodeFill: "surface", paletteStroke: true, radius: "soft" },
  },
  {
    componentType: "cycle",
    themeId: "museum",
    form: "cycle_loop",
    knobs: { ring: "dashed", highlightFirst: true },
  },
  {
    componentType: "cycle",
    themeId: "journal",
    form: "cycle_loop",
    knobs: { ring: "dotted", highlightFirst: true },
  },
  {
    componentType: "cycle",
    themeId: "arena",
    form: "cycle_loop",
    knobs: { ring: "solid", highlightFirst: true },
  },
  {
    componentType: "cycle",
    themeId: "insight",
    form: "hub_spoke",
    knobs: { hub: "outline" },
  },
  {
    componentType: "cycle",
    themeId: "academic",
    form: "hub_spoke",
    knobs: { hub: "solid" },
  },
  {
    componentType: "cycle",
    themeId: "campaign",
    form: "hub_spoke",
    knobs: { hub: "outline" },
  },
  {
    componentType: "cycle",
    themeId: "tech",
    form: "petal_wheel",
    knobs: { petalAlt: true, hub: "outline" },
  },
  {
    componentType: "cycle",
    themeId: "heritage",
    form: "petal_wheel",
    knobs: { petalAlt: true, hub: "outline" },
  },
  {
    componentType: "numbered_cards",
    themeId: "pulse",
    form: "numbered_pills",
    knobs: { node: "circle", stagger: true, radius: "round" },
  },
  {
    componentType: "numbered_cards",
    themeId: "enterprise",
    form: "numbered_pills",
    knobs: { node: "square", stagger: false, radius: "square" },
  },
  {
    componentType: "numbered_cards",
    themeId: "classroom",
    form: "numbered_pills",
    knobs: {
      node: "circle",
      stagger: true,
      radius: "soft",
      badge: "circle-outline",
      waveFirst: true,
    },
  },
  {
    componentType: "numbered_cards",
    themeId: "tech",
    form: "hex_cluster",
    knobs: { hexFill: "palette", hexStroke: "bg" },
  },
  {
    componentType: "numbered_cards",
    themeId: "ember",
    form: "hex_cluster",
    knobs: { hexFill: "accent-ramp", hexStroke: "bg" },
  },
  {
    componentType: "numbered_cards",
    themeId: "arena",
    form: "hex_cluster",
    knobs: { hexFill: "palette", hexStroke: "accent" },
  },
  {
    componentType: "kpi_cards",
    themeId: "luxe",
    form: "donut_trio",
    knobs: { arc: "accent", track: "muted" },
  },
  {
    componentType: "kpi_cards",
    themeId: "swiss",
    form: "donut_trio",
    knobs: { arc: "primary", track: "border", dangerOnMin: true },
  },
  {
    componentType: "kpi_cards",
    themeId: "terra",
    form: "donut_trio",
    knobs: { arc: "accent", track: "border" },
  },
  {
    componentType: "kpi_cards",
    themeId: "insight",
    form: "bubble_row",
    knobs: { champion: "fill-accent" },
  },
  {
    componentType: "kpi_cards",
    themeId: "crayon",
    form: "bubble_row",
    knobs: { champion: "stroke-palette", paletteStroke: true },
  },
  {
    componentType: "kpi_cards",
    themeId: "journal",
    form: "bubble_row",
    knobs: { champion: "fill-accent" },
  },
  {
    componentType: "comparison",
    themeId: "consulting",
    form: "pill_panels",
    knobs: { frame: "dashed", radius: "round", pillFill: "accent-primary" },
  },
  {
    componentType: "comparison",
    themeId: "vermilion",
    form: "pill_panels",
    knobs: { frame: "solid", radius: "round", cornerMarks: true, pillFill: "accent-all" },
  },
  {
    componentType: "comparison",
    themeId: "ember",
    form: "pill_panels",
    knobs: { frame: "none", radius: "soft", pillFill: "accent-all" },
  },
  {
    componentType: "steps",
    themeId: "runway",
    form: "arrow_steps",
    knobs: { arrow: "chevron", badge: "circle-outline" },
  },
  {
    componentType: "steps",
    themeId: "enterprise",
    form: "arrow_steps",
    knobs: { arrow: "notch", badge: "square-solid" },
  },
  {
    componentType: "steps",
    themeId: "pulse",
    form: "arrow_steps",
    knobs: { arrow: "slope", badge: "circle-solid", pulseLine: true },
  },
  {
    componentType: "timeline",
    themeId: "stage",
    form: "vert_timeline",
    knobs: { axis: "hairline", badge: "circle-outline" },
  },
  {
    componentType: "timeline",
    themeId: "memo",
    form: "vert_timeline",
    knobs: { axis: "dashed", stamp: true },
  },
  {
    componentType: "timeline",
    themeId: "classroom",
    form: "vert_timeline",
    knobs: { axis: "dashed", badge: "circle-solid", waveFirst: true },
  },
  {
    componentType: "image_grid",
    themeId: "museum",
    form: "numbered_photos",
    knobs: { caption: "above", numberBadge: "specimen" },
  },
  {
    componentType: "image_grid",
    themeId: "playbill",
    form: "numbered_photos",
    knobs: { caption: "below", numberBadge: "invert" },
  },
  {
    componentType: "image_grid",
    themeId: "runway",
    form: "numbered_photos",
    knobs: { caption: "below", numberBadge: "accent" },
  },
  { componentType: "callout", themeId: "heritage", form: "tint_panel", knobs: { radius: "soft" } },
  { componentType: "callout", themeId: "swiss", form: "tint_panel", knobs: { radius: "square", weight: "bold" } },
  { componentType: "callout", themeId: "tech", form: "tint_panel", knobs: { radius: "round" } },
  { componentType: "callout", themeId: "academic", form: "tint_panel", knobs: { radius: "square" } },
  { componentType: "callout", themeId: "enterprise", form: "tint_panel", knobs: { radius: "square" } },
  { componentType: "callout", themeId: "consulting", form: "tint_panel", knobs: { radius: "soft" } },
  { componentType: "callout", themeId: "journal", form: "tint_panel", knobs: { radius: "soft" } },
  { componentType: "callout", themeId: "classroom", form: "tint_panel", knobs: { radius: "round" } },
  { componentType: "callout", themeId: "lecture", form: "tint_panel", knobs: { radius: "soft" } },
  { componentType: "callout", themeId: "memo", form: "hanging_bare", knobs: { stamp: true } },
  { componentType: "callout", themeId: "insight", form: "hanging_bare" },
  { componentType: "callout", themeId: "ink", form: "hanging_bare" },
  { componentType: "callout", themeId: "stage", form: "hanging_bare" },
  { componentType: "callout", themeId: "terra", form: "hanging_bare" },
  { componentType: "callout", themeId: "crayon", form: "hanging_bare" },
  { componentType: "callout", themeId: "museum", form: "hanging_bare" },
  { componentType: "callout", themeId: "luxe", form: "lead_word", knobs: { iconInk: "accent" } },
  { componentType: "callout", themeId: "vermilion", form: "lead_word" },
  { componentType: "callout", themeId: "playbill", form: "lead_word", knobs: { weight: "black" } },
  { componentType: "callout", themeId: "campaign", form: "lead_word" },
  { componentType: "callout", themeId: "arena", form: "lead_word" },
  { componentType: "callout", themeId: "pulse", form: "lead_word" },
  { componentType: "callout", themeId: "runway", form: "lead_word" },
  { componentType: "callout", themeId: "ember", form: "lead_word" },
  {
    componentType: "flowchart",
    themeId: "swiss",
    form: "typed_nodes",
    knobs: { radius: "square", nodeStroke: "primary" },
  },
  {
    componentType: "flowchart",
    themeId: "academic",
    form: "typed_nodes",
    knobs: { radius: "square", nodeFill: "none", nodeStroke: "primary" },
  },
  {
    componentType: "flowchart",
    themeId: "tech",
    form: "typed_nodes",
    knobs: { radius: "soft", highlightFirst: true },
  },
  {
    componentType: "flowchart",
    themeId: "museum",
    form: "typed_nodes",
    knobs: { nodeStroke: "border" },
  },
  {
    componentType: "flowchart",
    themeId: "crayon",
    form: "typed_nodes",
    knobs: { radius: "round" },
  },
  {
    componentType: "flowchart",
    themeId: "journal",
    form: "typed_nodes",
    knobs: { highlightFirst: true },
  },
  {
    componentType: "flowchart",
    themeId: "insight",
    form: "typed_nodes",
    knobs: { highlightFirst: true, radius: "soft" },
  },
  {
    componentType: "architecture",
    themeId: "consulting",
    form: "layer_stack",
    knobs: { highlightFirst: true },
  },
  {
    componentType: "architecture",
    themeId: "swiss",
    form: "layer_stack",
    knobs: { radius: "square", nodeFill: "none" },
  },
  {
    componentType: "architecture",
    themeId: "academic",
    form: "layer_stack",
    knobs: { radius: "square", nodeFill: "none" },
  },
  {
    componentType: "architecture",
    themeId: "tech",
    form: "layer_stack",
    knobs: { radius: "square" },
  },
  {
    componentType: "architecture",
    themeId: "museum",
    form: "layer_stack",
    knobs: { nodeStroke: "border" },
  },
]

const FORM_COMPONENT_TYPES = [
  "icon_cards",
  "cycle",
  "numbered_cards",
  "kpi_cards",
  "comparison",
  "steps",
  "timeline",
  "image_grid",
  "callout",
  "flowchart",
  "architecture",
] as const

describe("resolveComponentForm", () => {
  describe("unassigned / missing themeId → undefined", () => {
    it("resolveComponentForm(icon_cards, undefined) → undefined", () => {
      expect(resolveComponentForm("icon_cards", undefined)).toBeUndefined()
    })

    it("resolveComponentForm(icon_cards, consulting) → undefined (unassigned contrast theme)", () => {
      expect(resolveComponentForm("icon_cards", "consulting")).toBeUndefined()
    })

    it("resolveComponentForm(cycle, consulting) → undefined", () => {
      expect(resolveComponentForm("cycle", "consulting")).toBeUndefined()
    })

    it("resolveComponentForm(flowchart, consulting) → undefined", () => {
      expect(resolveComponentForm("flowchart", "consulting")).toBeUndefined()
    })

    it("resolveComponentForm(icon_cards, not-a-theme) → undefined", () => {
      expect(resolveComponentForm("icon_cards", "not-a-theme")).toBeUndefined()
    })

    it("resolveComponentForm(paragraph, swiss) → undefined (unknown / unassigned component type)", () => {
      expect(resolveComponentForm("paragraph", "swiss")).toBeUndefined()
    })
  })

  describe("each spec assignment resolves to the expected form", () => {
    it.each(ASSIGNMENTS)(
      "$componentType × $themeId → $form with spec knobs",
      ({ componentType, themeId, form, knobs }) => {
        expect(resolveComponentForm(componentType, themeId)).toEqual(
          knobs === undefined ? { form } : { form, knobs },
        )
      },
    )
  })

  describe("uniqueness: no theme has two forms for the same component", () => {
    it("maps each (componentType, themeId) pair to exactly one form", () => {
      const seen = new Set<string>()
      for (const componentType of FORM_COMPONENT_TYPES) {
        const themeIds = assignedThemeIds(componentType)
        expect(new Set(themeIds).size).toBe(themeIds.length)
        for (const themeId of themeIds) {
          const key = `${componentType}/${themeId}`
          expect(seen.has(key)).toBe(false)
          seen.add(key)
          const assignment = resolveComponentForm(componentType, themeId)
          expect(assignment).toBeDefined()
          expect(assignment!.form).toBeTruthy()
        }
      }
    })

    it("campaign has only hub_spoke for cycle, never petal_wheel", () => {
      expect(resolveComponentForm("cycle", "campaign")?.form).toBe("hub_spoke")
      expect(assignedThemeIds("cycle").filter((id) => id === "campaign")).toEqual(["campaign"])
    })
  })

  it("campaign + cycle → hub_spoke, not petal_wheel", () => {
    expect(resolveComponentForm("cycle", "campaign")).toEqual({
      form: "hub_spoke",
      knobs: { hub: "outline" },
    })
    expect(resolveComponentForm("cycle", "campaign")?.form).not.toBe("petal_wheel")
  })

  it("consulting + comparison → pill_panels, consulting + icon_cards → undefined", () => {
    expect(resolveComponentForm("comparison", "consulting")?.form).toBe("pill_panels")
    expect(resolveComponentForm("icon_cards", "consulting")).toBeUndefined()
  })

  describe("knobs for a few skins", () => {
    it("swiss + icon_cards → form icon_columns, knobs.node === square", () => {
      const assignment = resolveComponentForm("icon_cards", "swiss")
      expect(assignment?.form).toBe("icon_columns")
      expect(assignment?.knobs?.node).toBe("square")
    })

    it("classroom + numbered_cards → form numbered_pills, knobs.waveFirst === true", () => {
      const assignment = resolveComponentForm("numbered_cards", "classroom")
      expect(assignment?.form).toBe("numbered_pills")
      expect(assignment?.knobs?.waveFirst).toBe(true)
    })

    it("swiss + kpi_cards → form donut_trio, knobs.dangerOnMin === true", () => {
      const assignment = resolveComponentForm("kpi_cards", "swiss")
      expect(assignment?.form).toBe("donut_trio")
      expect(assignment?.knobs?.dangerOnMin).toBe(true)
    })
  })

  it("assignment count is 77 (sum of assignedThemeIds across the 11 component types)", () => {
    const total = FORM_COMPONENT_TYPES.reduce(
      (n, componentType) => n + assignedThemeIds(componentType).length,
      0,
    )
    expect(total).toBe(77)
    expect(ASSIGNMENTS).toHaveLength(77)
  })
})

describe("assignedThemeIds", () => {
  it("unknown component → []", () => {
    expect(assignedThemeIds("paragraph")).toEqual([])
    expect(assignedThemeIds("not-a-component")).toEqual([])
  })

  it("callout lists 24 themes", () => {
    expect(assignedThemeIds("callout")).toHaveLength(24)
  })
})
