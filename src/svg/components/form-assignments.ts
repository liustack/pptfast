/**
 * Render-side component form assignment table. Forms are not IR: one
 * theme + one component maps to at most one form, looked up here and
 * ignored by renderers until a later commit wires dispatch. campaign ×
 * cycle is hub_spoke (first-listed wins), never petal_wheel. 65 rows
 * (41 prior + 24 callout). classroom is listed on callout like every
 * other canonical theme.
 */

export const COMPONENT_FORMS = [
  "icon_columns",
  "badge_cards",
  "outline_grid",
  "cycle_loop",
  "hub_spoke",
  "petal_wheel",
  "numbered_pills",
  "hex_cluster",
  "donut_trio",
  "bubble_row",
  "pill_panels",
  "arrow_steps",
  "vert_timeline",
  "numbered_photos",
  "tint_panel",
  "hanging_bare",
  "lead_word",
] as const

export type ComponentFormId = (typeof COMPONENT_FORMS)[number]

/**
 * Optional render knobs. A form reads the fields it knows and ignores
 * the rest.
 */
export interface FormKnobs {
  node?: "circle" | "square"
  nodeFill?: "surface" | "none"
  nodeStroke?: "border" | "dashed" | "primary"
  iconInk?: "accent" | "text"
  radius?: "soft" | "square" | "round"
  badge?: "circle-outline" | "circle-solid" | "square-solid"
  paletteStroke?: boolean
  ring?: "dashed" | "dotted" | "solid"
  highlightFirst?: boolean
  hub?: "outline" | "solid"
  petalAlt?: boolean
  stagger?: boolean
  waveFirst?: boolean
  hexFill?: "palette" | "accent-ramp"
  hexStroke?: "bg" | "accent"
  arc?: "accent" | "primary"
  track?: "muted" | "border"
  dangerOnMin?: boolean
  champion?: "fill-accent" | "stroke-palette"
  frame?: "dashed" | "solid" | "none"
  pillFill?: "accent-primary" | "accent-all"
  cornerMarks?: boolean
  arrow?: "chevron" | "notch" | "slope"
  pulseLine?: boolean
  axis?: "hairline" | "dashed"
  stamp?: boolean
  caption?: "above" | "below"
  numberBadge?: "specimen" | "invert" | "accent"
  weight?: "regular" | "bold" | "black"
}

export interface FormAssignment {
  form: ComponentFormId
  knobs?: FormKnobs
}

const ASSIGNMENTS: Record<string, Record<string, FormAssignment>> = {
  icon_cards: {
    terra: {
      form: "icon_columns",
      knobs: { node: "circle", nodeFill: "surface", nodeStroke: "border", iconInk: "accent" },
    },
    lecture: {
      form: "icon_columns",
      knobs: { node: "circle", nodeFill: "none", nodeStroke: "dashed", iconInk: "accent" },
    },
    swiss: {
      form: "icon_columns",
      knobs: { node: "square", nodeFill: "surface", nodeStroke: "border", iconInk: "text" },
    },
    tech: {
      form: "badge_cards",
      knobs: { radius: "soft", badge: "circle-outline" },
    },
    luxe: {
      form: "badge_cards",
      knobs: { radius: "square", badge: "circle-outline" },
    },
    vermilion: {
      form: "badge_cards",
      knobs: { radius: "soft", badge: "circle-solid" },
    },
    academic: {
      form: "outline_grid",
      knobs: { nodeFill: "none", nodeStroke: "primary", radius: "square" },
    },
    ember: {
      form: "outline_grid",
      knobs: { nodeFill: "surface", nodeStroke: "border", iconInk: "accent", radius: "square" },
    },
    crayon: {
      form: "outline_grid",
      knobs: { nodeFill: "surface", paletteStroke: true, radius: "soft" },
    },
  },
  cycle: {
    museum: {
      form: "cycle_loop",
      knobs: { ring: "dashed", highlightFirst: true },
    },
    journal: {
      form: "cycle_loop",
      knobs: { ring: "dotted", highlightFirst: true },
    },
    arena: {
      form: "cycle_loop",
      knobs: { ring: "solid", highlightFirst: true },
    },
    insight: {
      form: "hub_spoke",
      knobs: { hub: "outline" },
    },
    academic: {
      form: "hub_spoke",
      knobs: { hub: "solid" },
    },
    campaign: {
      form: "hub_spoke",
      knobs: { hub: "outline" },
    },
    tech: {
      form: "petal_wheel",
      knobs: { petalAlt: true, hub: "outline" },
    },
    heritage: {
      form: "petal_wheel",
      knobs: { petalAlt: true, hub: "outline" },
    },
  },
  numbered_cards: {
    pulse: {
      form: "numbered_pills",
      knobs: { node: "circle", stagger: true, radius: "round" },
    },
    enterprise: {
      form: "numbered_pills",
      knobs: { node: "square", stagger: false, radius: "square" },
    },
    classroom: {
      form: "numbered_pills",
      knobs: {
        node: "circle",
        stagger: true,
        radius: "soft",
        badge: "circle-outline",
        waveFirst: true,
      },
    },
    tech: {
      form: "hex_cluster",
      knobs: { hexFill: "palette", hexStroke: "bg" },
    },
    ember: {
      form: "hex_cluster",
      knobs: { hexFill: "accent-ramp", hexStroke: "bg" },
    },
    arena: {
      form: "hex_cluster",
      knobs: { hexFill: "palette", hexStroke: "accent" },
    },
  },
  kpi_cards: {
    luxe: {
      form: "donut_trio",
      knobs: { arc: "accent", track: "muted" },
    },
    swiss: {
      form: "donut_trio",
      knobs: { arc: "primary", track: "border", dangerOnMin: true },
    },
    terra: {
      form: "donut_trio",
      knobs: { arc: "accent", track: "border" },
    },
    insight: {
      form: "bubble_row",
      knobs: { champion: "fill-accent" },
    },
    crayon: {
      form: "bubble_row",
      knobs: { champion: "stroke-palette", paletteStroke: true },
    },
    journal: {
      form: "bubble_row",
      knobs: { champion: "fill-accent" },
    },
  },
  comparison: {
    consulting: {
      form: "pill_panels",
      knobs: { frame: "dashed", radius: "round", pillFill: "accent-primary" },
    },
    vermilion: {
      form: "pill_panels",
      knobs: { frame: "solid", radius: "round", cornerMarks: true, pillFill: "accent-all" },
    },
    ember: {
      form: "pill_panels",
      knobs: { frame: "none", radius: "soft", pillFill: "accent-all" },
    },
  },
  steps: {
    runway: {
      form: "arrow_steps",
      knobs: { arrow: "chevron", badge: "circle-outline" },
    },
    enterprise: {
      form: "arrow_steps",
      knobs: { arrow: "notch", badge: "square-solid" },
    },
    pulse: {
      form: "arrow_steps",
      knobs: { arrow: "slope", badge: "circle-solid", pulseLine: true },
    },
  },
  timeline: {
    stage: {
      form: "vert_timeline",
      knobs: { axis: "hairline", badge: "circle-outline" },
    },
    memo: {
      form: "vert_timeline",
      knobs: { axis: "dashed", stamp: true },
    },
    classroom: {
      form: "vert_timeline",
      knobs: { axis: "dashed", badge: "circle-solid", waveFirst: true },
    },
  },
  image_grid: {
    museum: {
      form: "numbered_photos",
      knobs: { caption: "above", numberBadge: "specimen" },
    },
    playbill: {
      form: "numbered_photos",
      knobs: { caption: "below", numberBadge: "invert" },
    },
    runway: {
      form: "numbered_photos",
      knobs: { caption: "below", numberBadge: "accent" },
    },
  },
  callout: {
    heritage: { form: "tint_panel", knobs: { radius: "soft" } },
    swiss: { form: "tint_panel", knobs: { radius: "square", weight: "bold" } },
    tech: { form: "tint_panel", knobs: { radius: "round" } },
    academic: { form: "tint_panel", knobs: { radius: "square" } },
    enterprise: { form: "tint_panel", knobs: { radius: "square" } },
    consulting: { form: "tint_panel", knobs: { radius: "soft" } },
    journal: { form: "tint_panel", knobs: { radius: "soft" } },
    classroom: { form: "tint_panel", knobs: { radius: "round" } },
    lecture: { form: "tint_panel", knobs: { radius: "soft" } },
    memo: { form: "hanging_bare", knobs: { stamp: true } },
    insight: { form: "hanging_bare" },
    ink: { form: "hanging_bare" },
    stage: { form: "hanging_bare" },
    terra: { form: "hanging_bare" },
    crayon: { form: "hanging_bare" },
    museum: { form: "hanging_bare" },
    luxe: { form: "lead_word", knobs: { iconInk: "accent" } },
    vermilion: { form: "lead_word" },
    playbill: { form: "lead_word", knobs: { weight: "black" } },
    campaign: { form: "lead_word" },
    arena: { form: "lead_word" },
    pulse: { form: "lead_word" },
    runway: { form: "lead_word" },
    ember: { form: "lead_word" },
  },
}

export function resolveComponentForm(
  componentType: string,
  themeId: string | undefined,
): FormAssignment | undefined {
  if (themeId === undefined) return undefined
  return ASSIGNMENTS[componentType]?.[themeId]
}

export function assignedThemeIds(componentType: string): string[] {
  const byTheme = ASSIGNMENTS[componentType]
  return byTheme === undefined ? [] : Object.keys(byTheme)
}
