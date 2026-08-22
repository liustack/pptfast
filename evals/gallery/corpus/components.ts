/**
 * One realistic instance per component type, built from a language track's
 * vocabulary (`./lexicon.ts`).
 *
 * Every builder aims at the *ordinary* case, not the extreme one: item
 * counts in the middle of the schema's range, text at the length a real
 * author writes. The overflow auditors already own the extremes
 * (`src/svg/audit/stress-fixtures.ts`). What a human reviewer can judge and
 * a test cannot is whether the ordinary case looks like something you would
 * put in front of a customer, so the ordinary case is what this corpus
 * renders.
 *
 * Optional fields are exercised rather than skipped — a component reviewed
 * only in its barest form leaves its captions, footnotes, deltas and tags
 * unseen, and those are where visual defects hide.
 */

import type { Component } from "@/ir"
import type { Lexicon } from "./lexicon"

/** Asset ids the corpus declares — see `deck.ts`, which materializes them. */
export const PHOTO_ASSETS = ["photo-1", "photo-2", "photo-3", "photo-4"] as const
export const SCREENSHOT_ASSET = "screenshot-1"

/** Take `n` items starting at `from`, wrapping — keeps builders total. */
function slice(pool: readonly string[], n: number, from = 0): string[] {
  return Array.from({ length: n }, (_, i) => pool[(from + i) % pool.length]!)
}

/**
 * Builders keyed by component type. Kept as a plain record rather than a
 * switch so `Object.keys` is the single source of truth for what the
 * component table covers, and a type added to the IR without a builder here
 * fails the coverage check in `../matrix.ts` loudly.
 */
export const COMPONENT_BUILDERS: Record<string, (lex: Lexicon) => Component> = {
  // ── Text ───────────────────────────────────────────────────────────────
  paragraph: (lex) => ({ type: "paragraph", text: lex.paragraph }),

  bullets: (lex) => ({ type: "bullets", items: slice(lex.bullets, 5), style: "default" }),

  quote: (lex) => ({ type: "quote", text: lex.quote.text, attribution: lex.quote.attribution }),

  callout: (lex) => ({ type: "callout", variant: "warn", text: lex.callouts.warn, icon: "alert-triangle" }),

  code: (lex) => ({ type: "code", language: lex.code.language, code: lex.code.code }),

  citation: (lex) => ({
    type: "citation",
    sources: lex.sources.map((s) => ({ label: s.label, ref: s.ref, url: s.url })),
  }),

  verdict_banner: (lex) => ({ type: "verdict_banner", text: lex.verdicts.warning, tone: "warning", icon: "alert-triangle" }),

  tag_row: (lex) => ({ type: "tag_row", title: lex.kickers[2], items: slice(lex.tags, 10), emphasis: "first" }),

  // ── Numbers ────────────────────────────────────────────────────────────
  kpi_cards: (lex) => ({
    type: "kpi_cards",
    items: lex.metrics.slice(0, 4).map((m, i) => ({
      ...m,
      icon: "trending-up" as const,
      // Source line only on the first card — the way a real deck credits a
      // number without repeating the attribution four times.
      source: i === 0 ? lex.sources[0]!.label : undefined,
    })),
  }),

  // No `show_grid` here: a bar chart's house default is gridline-free
  // (round-4 review, `journal p05` — every bar already prints its value, see
  // `renderBar`'s own `showGrid` doc comment), and this page is the one the
  // gallery review actually looks at. The `line`/`area` variants below still
  // pass `show_grid: true` — matching their own default, and stating it so
  // the contrast between the two families is visible in the corpus itself.
  chart: (lex) => ({
    type: "chart",
    chart_type: "bar",
    axes: { x_title: lex.periodAxis, y_title: lex.metrics[0]!.label },
    series: [
      { name: lex.labels[8]!, data: slice(lex.periods, 4).map((p, i) => ({ x: p, y: 42 + i * 11 })) },
      { name: lex.labels[9]!, data: slice(lex.periods, 4).map((p, i) => ({ x: p, y: 30 + i * 6 })) },
    ],
  }),

  data_table: (lex) => ({
    type: "data_table",
    columns: [
      { key: "seg", label: lex.labels[8]!, align: "left" },
      { key: "q1", label: lex.periods[0]!, align: "right" },
      { key: "q2", label: lex.periods[1]!, align: "right" },
      { key: "yoy", label: lex.metrics[1]!.label, align: "right" },
    ],
    rows: [
      { cells: { seg: lex.labels[8]!, q1: 1840, q2: 2210, yoy: "+20.1%" } },
      { cells: { seg: lex.labels[9]!, q1: 1320, q2: 1495, yoy: "+13.3%" } },
      { cells: { seg: lex.labels[10]!, q1: 610, q2: 588, yoy: "-3.6%" }, emphasis: "highlight" },
      { cells: { seg: lex.labels[11]!, q1: 402, q2: 476, yoy: "+18.4%" } },
      { cells: { seg: lex.phrases[0]!, q1: 4172, q2: 4769, yoy: "+14.3%" }, emphasis: "total" },
    ],
    source: lex.sources[0]!.label,
  }),

  waterfall: (lex) => ({
    type: "waterfall",
    unit: lex.metrics[0]!.unit,
    items: [
      { label: lex.periods[0]!, value: 4172, kind: "total" },
      { label: lex.phrases[0]!, value: 810 },
      { label: lex.phrases[2]!, value: 265 },
      { label: lex.phrases[7]!, value: -318 },
      { label: lex.phrases[10]!, value: -160 },
      { label: lex.periods[1]!, value: 4769, kind: "total" },
    ],
  }),

  heatmap: (lex) => ({
    type: "heatmap",
    x_title: lex.periodAxis,
    y_title: lex.segmentAxis,
    x_labels: slice(lex.periods, 4),
    y_labels: slice(lex.labels, 4, 8),
    values: [
      [82, 88, 91, 94],
      [61, 74, 79, 85],
      [44, 47, 52, 58],
      [70, 66, 72, 77],
    ],
    show_values: true,
  }),

  gantt: (lex) => ({
    type: "gantt",
    axis_labels: slice(lex.periods, 4),
    items: [
      { label: lex.stages[0]!, start: 0, end: 2 },
      { label: lex.stages[1]!, start: 1, end: 4 },
      { label: lex.stages[2]!, start: 3, end: 7 },
      { label: lex.stages[3]!, start: 6, end: 10 },
      { label: lex.stages[4]!, start: 9, end: 12 },
    ],
  }),

  sankey: (lex) => ({
    type: "sankey",
    nodes: [
      { id: "n1", label: lex.labels[8]! },
      { id: "n2", label: lex.labels[9]! },
      { id: "n3", label: lex.labels[10]! },
      { id: "n4", label: lex.phrases[0]! },
      { id: "n5", label: lex.phrases[2]! },
      { id: "n6", label: lex.phrases[4]! },
    ],
    links: [
      { from: "n1", to: "n4", value: 34 },
      { from: "n1", to: "n5", value: 18 },
      { from: "n2", to: "n4", value: 21 },
      { from: "n2", to: "n6", value: 15 },
      { from: "n3", to: "n5", value: 12 },
      { from: "n4", to: "n6", value: 40 },
      { from: "n5", to: "n6", value: 22 },
    ],
  }),

  // ── Structure ──────────────────────────────────────────────────────────
  steps: (lex) => ({
    type: "steps",
    items: slice(lex.stages, 4).map((title, i) => ({ title, text: lex.sentences[i]! })),
  }),

  numbered_cards: (lex) => ({
    type: "numbered_cards",
    items: slice(lex.phrases, 4).map((title, i) => ({ title, text: lex.sentences[i + 2]!, sub: lex.periods[i] })),
  }),

  icon_cards: (lex) => ({
    type: "icon_cards",
    items: slice(lex.phrases, 4, 2).map((title, i) => ({
      icon: (["target", "gauge", "shield", "rocket"] as const)[i]!,
      title,
      text: lex.sentences[i + 4]!,
    })),
  }),

  // Three cards, not four. Each card carries title + text + sub, and four of
  // those plus this table's lead-in paragraph exceed the content rect in all
  // three languages — the component then truncates itself correctly and the
  // table showed its degrade path instead of the component. The component
  // table's question is "does this component draw well", so it gets a count
  // that fits. That four rich cards do not fit a full content rect is worth
  // knowing, but it is a question about capacity, not about this drawing.
  row_cards: (lex) => ({
    type: "row_cards",
    items: slice(lex.phrases, 3, 4).map((title, i) => ({
      icon: (["layers", "cpu", "database", "globe"] as const)[i]!,
      title,
      text: lex.sentences[i + 1]!,
      sub: lex.periods[i],
      highlight: i === 0,
    })),
  }),

  timeline: (lex) => ({
    type: "timeline",
    layout: "horizontal",
    milestones: slice(lex.stages, 4).map((title, i) => ({
      date: lex.periods[i]!,
      title,
      desc: lex.phrases[i]!,
      highlight: i === 2,
    })),
  }),

  roadmap: (lex) => ({
    type: "roadmap",
    items: slice(lex.chapters, 3).map((title, i) => ({
      title,
      period: lex.periods[i],
      rows: [
        { label: lex.metrics[0]!.label, value: `${lex.metrics[0]!.value}${lex.metrics[0]!.unit ?? ""}` },
        { label: lex.metrics[1]!.label, value: `${lex.metrics[1]!.value}${lex.metrics[1]!.unit ?? ""}` },
      ],
    })),
  }),

  cycle: (lex) => ({
    type: "cycle",
    title: lex.kickers[2],
    items: slice(lex.stages, 5).map((label, i) => ({ label, description: lex.phrases[i] })),
  }),

  rings: (lex) => ({
    type: "rings",
    items: slice(lex.labels, 3).map((label, i) => ({ label, desc: lex.sentences[i]! })),
  }),

  matrix: (lex) => ({
    type: "matrix",
    x_title: lex.periodAxis,
    y_title: lex.segmentAxis,
    cols: 3,
    items: slice(lex.phrases, 6).map((title, i) => ({
      title,
      tag: lex.periods[i % 4],
      tone: (["accent", "neutral", "info"] as const)[i % 3],
    })),
  }),

  flowchart: (lex) => ({
    type: "flowchart",
    direction: "LR",
    nodes: [
      { id: "a", label: lex.stages[0]!, kind: "round" },
      { id: "b", label: lex.stages[1]! },
      { id: "c", label: lex.stages[2]!, kind: "diamond" },
      { id: "d", label: lex.stages[3]! },
      { id: "e", label: lex.stages[5]!, kind: "round" },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "d", label: lex.labels[0] },
      { from: "c", to: "b", label: lex.labels[1] },
      { from: "d", to: "e" },
    ],
  }),

  architecture: (lex) => ({
    type: "architecture",
    direction: "top_down",
    layers: [
      { title: lex.chapters[2]!, items: slice(lex.labels, 3) },
      { title: lex.chapters[3]!, items: slice(lex.labels, 4, 3) },
      { title: lex.chapters[4]!, items: slice(lex.labels, 3, 7) },
    ],
  }),

  // `columns` carries the *data* column headers only — the renderer puts an
  // empty header over the row-label column itself (`comparison.tsx`'s
  // `headerTitles`). This used to lead with an extra `""`, which handed the
  // renderer five headers for four columns and shifted every one of them a
  // column to the right on all twenty comparison pages: the first two data
  // columns had no header at all and the last header hung over nothing.
  comparison: (lex) => ({
    type: "comparison",
    columns: [lex.labels[8]!, lex.labels[9]!, lex.labels[10]!],
    rows: slice(lex.phrases, 4).map((label, i) => ({
      label,
      cells: [lex.periods[i % 4]!, lex.labels[(i + 12) % lex.labels.length]!, lex.periods[(i + 1) % 4]!],
    })),
  }),

  insight_panel: (lex) => ({
    type: "insight_panel",
    title: lex.chapters[0]!,
    rows: slice(lex.phrases, 3).map((label, i) => ({ label, text: lex.sentences[i]! })),
    footnote: lex.sources[0]!.label,
  }),

  // ── Frameworks ─────────────────────────────────────────────────────────
  swot: (lex) => ({
    type: "swot",
    strengths: lex.strengths.slice(0, 3),
    weaknesses: lex.weaknesses.slice(0, 3),
    opportunities: lex.opportunities.slice(0, 3),
    threats: lex.threats.slice(0, 3),
  }),

  pest: (lex) => ({
    type: "pest",
    political: { items: lex.threats.slice(0, 3) },
    economic: { items: lex.opportunities.slice(0, 3) },
    social: { items: lex.strengths.slice(0, 3) },
    technological: { items: lex.weaknesses.slice(0, 3) },
  }),

  five_forces: (lex) => ({
    type: "five_forces",
    rivalry: { items: lex.threats.slice(0, 2), intensity: "high" },
    new_entrants: { items: lex.opportunities.slice(0, 2), intensity: "medium" },
    supplier_power: { items: lex.weaknesses.slice(0, 2), intensity: "medium" },
    buyer_power: { items: lex.strengths.slice(0, 2), intensity: "high" },
    substitutes: { items: lex.threats.slice(2, 4), intensity: "low" },
  }),

  bmc: (lex) => ({
    type: "bmc",
    key_partners: slice(lex.orgs, 3),
    key_activities: lex.phrases.slice(0, 3),
    key_resources: lex.phrases.slice(3, 6),
    value_propositions: lex.strengths.slice(0, 3),
    customer_relationships: lex.phrases.slice(6, 9),
    channels: slice(lex.labels, 3, 12),
    customer_segments: slice(lex.labels, 3, 8),
    cost_structure: lex.weaknesses.slice(0, 3),
    revenue_streams: lex.opportunities.slice(0, 3),
  }),

  // ── People and brands ──────────────────────────────────────────────────
  people_cards: (lex) => ({
    type: "people_cards",
    title: lex.kickers[1],
    people: lex.people.slice(0, 5).map((p) => ({ name: p.name, role: p.role, org: p.org })),
  }),

  // ── Images ─────────────────────────────────────────────────────────────
  image: (lex) => ({ type: "image", asset_id: PHOTO_ASSETS[0], caption: lex.captions[0], fit: "cover" }),

  image_grid: (lex) => ({
    type: "image_grid",
    emphasis: "first",
    items: PHOTO_ASSETS.slice(0, 3).map((asset_id, i) => ({ asset_id, caption: lex.captions[i] })),
  }),

  image_compare: (lex) => ({
    type: "image_compare",
    style: "before_after",
    left: { asset_id: PHOTO_ASSETS[1]!, label: lex.periods[0]! },
    right: { asset_id: PHOTO_ASSETS[2]!, label: lex.periods[1]! },
  }),

  device_mockup: (lex) => ({
    type: "device_mockup",
    device: "browser",
    asset_id: SCREENSHOT_ASSET,
    url: lex.url,
    caption: lex.captions[2],
  }),
}

/**
 * Extra chart shapes. `chart` is one IR type but nine visually unrelated
 * drawings, and reviewing only the bar form would leave eight untouched —
 * the exact "count the types, miss the surfaces" gap the review exists to
 * close. Keyed by the label the gallery shows, values build the component.
 */
export const CHART_VARIANTS: Record<string, (lex: Lexicon) => Component> = {
  "chart · bar": (lex) => COMPONENT_BUILDERS.chart!(lex),

  "chart · bar horizontal": (lex) => ({
    type: "chart",
    chart_type: "bar",
    direction: "horizontal",
    series: [{ name: lex.metrics[0]!.label, data: slice(lex.phrases, 5).map((x, i) => ({ x, y: 92 - i * 13 })) }],
  }),

  "chart · line": (lex) => ({
    type: "chart",
    chart_type: "line",
    axes: { x_title: lex.periodAxis, y_title: lex.metrics[2]!.label, show_grid: true },
    series: [
      { name: lex.labels[8]!, data: slice(lex.periods, 5).map((x, i) => ({ x, y: 58 + i * 8 })) },
      { name: lex.labels[9]!, data: slice(lex.periods, 5).map((x, i) => ({ x, y: 71 + i * 4 })) },
    ],
  }),

  "chart · area": (lex) => ({
    type: "chart",
    chart_type: "area",
    axes: { x_title: lex.periodAxis, y_title: lex.metrics[0]!.label, show_grid: true },
    series: [{ name: lex.labels[8]!, data: slice(lex.periods, 5).map((x, i) => ({ x, y: 30 + i * i * 4 })) }],
  }),

  "chart · pie": (lex) => ({
    type: "chart",
    chart_type: "pie",
    series: [{ name: lex.metrics[0]!.label, data: slice(lex.labels, 4, 8).map((x, i) => ({ x, y: 40 - i * 8 })) }],
  }),

  "chart · donut": (lex) => ({
    type: "chart",
    chart_type: "donut",
    center_total: true,
    series: [{ name: lex.metrics[0]!.label, data: slice(lex.labels, 4, 8).map((x, i) => ({ x, y: 36 - i * 7 })) }],
  }),

  "chart · funnel": (lex) => ({
    type: "chart",
    chart_type: "funnel",
    series: [{ name: lex.chapters[1]!, data: slice(lex.stages, 5).map((x, i) => ({ x, y: 100 - i * 19 })) }],
  }),

  "chart · dumbbell": (lex) => ({
    type: "chart",
    chart_type: "dumbbell",
    series: [
      { name: lex.periods[0]!, data: slice(lex.phrases, 5).map((x, i) => ({ x, y: 30 + i * 6 })) },
      { name: lex.periods[1]!, data: slice(lex.phrases, 5).map((x, i) => ({ x, y: 55 + i * 7 })) },
    ],
  }),

  "chart · scatter": (lex) => ({
    type: "chart",
    chart_type: "scatter",
    axes: { x_title: lex.metrics[3]!.label, y_title: lex.metrics[2]!.label, show_grid: true },
    series: [
      {
        name: lex.labels[8]!,
        data: [
          { x: 2, y: 61, size: 14 },
          { x: 4, y: 72, size: 22 },
          { x: 5, y: 68, size: 9 },
          { x: 7, y: 84, size: 30 },
          { x: 9, y: 88, size: 18 },
        ],
      },
    ],
  }),

  "chart · gauge": (lex) => ({
    type: "chart",
    chart_type: "gauge",
    gauge: { min: 0, max: 100 },
    series: [{ name: lex.metrics[1]!.label, data: [{ x: lex.metrics[1]!.label, y: 91 }] }],
  }),
}

/**
 * Theme-assigned component forms. Same IR type as the default row, a
 * different theme so the new face shows. Solo on the page: these drawings
 * are larger than the default cards, and a lead-in paragraph would crowd
 * them off the content rect. First assigned theme per form (campaign ×
 * cycle is hub_spoke).
 */
export interface FormVariant {
  readonly id: string
  readonly theme: string
  readonly build: (lex: Lexicon) => Component
}

export const FORM_VARIANTS: readonly FormVariant[] = [
  { id: "icon_cards · icon columns", theme: "terra", build: (lex) => COMPONENT_BUILDERS.icon_cards!(lex) },
  { id: "icon_cards · badge cards", theme: "tech", build: (lex) => COMPONENT_BUILDERS.icon_cards!(lex) },
  { id: "icon_cards · outline grid", theme: "academic", build: (lex) => COMPONENT_BUILDERS.icon_cards!(lex) },
  { id: "cycle · loop", theme: "museum", build: (lex) => COMPONENT_BUILDERS.cycle!(lex) },
  { id: "cycle · hub spoke", theme: "insight", build: (lex) => COMPONENT_BUILDERS.cycle!(lex) },
  { id: "cycle · petal wheel", theme: "tech", build: (lex) => COMPONENT_BUILDERS.cycle!(lex) },
  { id: "numbered_cards · pills", theme: "pulse", build: (lex) => COMPONENT_BUILDERS.numbered_cards!(lex) },
  { id: "numbered_cards · hex cluster", theme: "tech", build: (lex) => COMPONENT_BUILDERS.numbered_cards!(lex) },
  { id: "kpi_cards · donut trio", theme: "luxe", build: (lex) => COMPONENT_BUILDERS.kpi_cards!(lex) },
  { id: "kpi_cards · bubble row", theme: "insight", build: (lex) => COMPONENT_BUILDERS.kpi_cards!(lex) },
  { id: "comparison · pill panels", theme: "vermilion", build: (lex) => COMPONENT_BUILDERS.comparison!(lex) },
  { id: "steps · arrow band", theme: "runway", build: (lex) => COMPONENT_BUILDERS.steps!(lex) },
  { id: "timeline · vertical nodes", theme: "stage", build: (lex) => COMPONENT_BUILDERS.timeline!(lex) },
  { id: "image_grid · numbered photos", theme: "museum", build: (lex) => COMPONENT_BUILDERS.image_grid!(lex) },
  { id: "flowchart · typed nodes", theme: "swiss", build: (lex) => COMPONENT_BUILDERS.flowchart!(lex) },
]

/** Icons for the full-load cards, cycled. One per card, none repeated. */
const CARD_ICONS = ["layers", "cpu", "database", "globe", "target", "gauge"] as const

/**
 * Full-load instances for the 满载表. Each builder is the largest count
 * that still renders on a consulting `densityPage` with no silent
 * `data-dropped` overflow stamp and without the block being dropped whole.
 * Counts were measured with a probe (zh first, then en and mixed still fit).
 * One item past the listed count re-introduces the stamp on at least the
 * English track.
 *
 * These pages exist so a reviewer can see a component filled to its
 * geometric ceiling, not past it. Authoring cuts or splits content. The
 * ordinary corpus at the top of this file stays ordinary.
 */
export const DENSITY_BUILDERS: Record<string, (lex: Lexicon) => Component> = {
  // 4 layers. architecture.tsx `LAYER_H + GAP = 84`. CAPACITY.warnLayers=3
  // is the 277px worst-case editorial number, not consulting's taller
  // content rect. Probe on consulting densityPage. 5 layers marks on en.
  architecture: (lex) => ({
    type: "architecture",
    direction: "top_down",
    layers: [...lex.chapters, ...lex.stages].slice(0, 4).map((title, i) => ({
      title,
      items: slice(lex.labels, 4, i * 4),
    })),
  }),

  // 9 items. bullets.tsx height-budget visible count. Probe on consulting
  // densityPage. 10 items marks on en.
  bullets: (lex) => ({
    type: "bullets",
    items: [...slice(lex.bullets, 6), ...slice(lex.phrases, 3)],
    style: "default",
  }),

  // 12 series. chart.tsx `LEGEND_ENTRY_PITCH = 72`. Editorial
  // CAPACITY.chart.lineSeriesAdvisoryMax = 8 is not the geometric ceiling.
  // Probe on consulting densityPage. 13 series marks on en.
  chart: (lex) => ({
    type: "chart",
    chart_type: "line",
    axes: { x_title: lex.periodAxis, y_title: lex.metrics[2]!.label, show_grid: true },
    series: [...lex.labels, ...lex.orgs].slice(0, 12).map((name, i) => ({
      name,
      data: slice(lex.periods, 5).map((x, j) => ({ x, y: 40 + ((i * 7 + j * 11) % 45) })),
    })),
  }),

  // 13 sources. citation.tsx `ROW = 28`. CAPACITY.warnSources=9 is the
  // 277px worst-case editorial number. Probe on consulting densityPage
  // after gallery-review-r1 × main. Coverage's 14 still fits zh/mixed.
  // 14 sources marks on en.
  citation: (lex) => ({
    type: "citation",
    sources: [...slice(lex.orgs, 12), ...slice(lex.phrases, 1)].map((label, i) => ({
      label,
      ref: lex.periods[i % lex.periods.length]!,
    })),
  }),

  // 6 rows. comparison.tsx `ROW = 44` including header. CAPACITY.warnRows=5
  // is the 277px worst-case editorial number. Probe on consulting
  // densityPage. 7 rows marks on en.
  comparison: (lex) => ({
    type: "comparison",
    columns: [lex.labels[8]!, lex.labels[9]!, lex.labels[10]!],
    rows: slice(lex.phrases, 6).map((label, i) => ({
      label,
      cells: [lex.periods[i % 4]!, lex.labels[(i + 12) % lex.labels.length]!, lex.periods[(i + 1) % 4]!],
    })),
  }),

  // 7 rows. Schema `.max(12)` in ir/components/data-table.ts. data-table.tsx
  // `ROW = 44`. Probe on consulting densityPage. 8 rows marks on en, well
  // before the schema ceiling.
  data_table: (lex) => ({
    type: "data_table",
    columns: [
      { key: "seg", label: lex.labels[8]!, align: "left" },
      { key: "q1", label: lex.periods[0]!, align: "right" },
      { key: "q2", label: lex.periods[1]!, align: "right" },
      { key: "yoy", label: lex.metrics[1]!.label, align: "right" },
    ],
    rows: slice(lex.labels, 7).map((seg, i) => ({
      cells: { seg, q1: 402 + i * 97, q2: 431 + i * 111, yoy: `${i % 4 === 2 ? "-" : "+"}${4 + i}.${i % 10}%` },
    })),
    source: lex.sources[0]!.label,
  }),

  // 6 cards. kpi.tsx `MIN_READABLE_CARD_W = 160`, `GAP = 16`. Marker when
  // `naturalCardW < 160`. Probe on consulting densityPage. 7 cards marks
  // on every language track.
  kpi_cards: (lex) => ({
    type: "kpi_cards",
    items: slice(lex.labels, 6).map((label, i) => ({
      value: String(28 + i * 6),
      unit: "%",
      label,
      icon: "trending-up" as const,
      delta: (["up", "down", "flat"] as const)[i % 3]!,
    })),
  }),

  // 3 cards. Schema `.min(3).max(6)` in ir/components/row-cards.ts. Probe
  // on consulting densityPage. 4 cards marks on en (taller wrap). Schema
  // still allows 6.
  row_cards: (lex) => ({
    type: "row_cards",
    items: slice(lex.phrases, 3).map((title, i) => ({
      icon: CARD_ICONS[i % CARD_ICONS.length]!,
      title,
      text: lex.sentences[i % lex.sentences.length]!,
      sub: lex.periods[i % lex.periods.length],
      highlight: i === 0,
    })),
  }),

  // 5 milestones, vertical. The component table uses horizontal. Only a
  // vertical stack runs out of height. timeline.tsx height-budget visible
  // count. Probe on consulting densityPage. 6 milestones marks on en.
  timeline: (lex) => ({
    type: "timeline",
    layout: "vertical",
    milestones: slice(lex.phrases, 5).map((title, i) => ({
      date: lex.periods[i % lex.periods.length]!,
      title,
      desc: lex.labels[i % lex.labels.length],
      highlight: i === 2,
    })),
  }),
}
