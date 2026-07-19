import { describe, expect, it } from "vitest"
import {
  COMPONENT_FIELD_ALIASES,
  COMPONENT_ITEM_FIELD_ALIASES,
  SLIDE_FIELD_ALIASES,
  normalizeComponentAliases,
} from "./field-aliases"
import { PptxIRSchema } from "./index"

function deck(slides: unknown[]) {
  return { version: "3", theme: { id: "consulting" }, slides }
}

function slideWith(components: unknown[]) {
  return { type: "content", heading: "h", components }
}

// ── every COMPONENT_FIELD_ALIASES row round-trips ──────────────────────────

interface BlockCase {
  readonly type: string
  readonly alias: string
  readonly canonical: string
  readonly component: Record<string, unknown>
  readonly expected: unknown
}

const BLOCK_CASES: readonly BlockCase[] = [
  { type: "quote", alias: "content", canonical: "text", component: { type: "quote", content: "hello" }, expected: "hello" },
  { type: "quote", alias: "author", canonical: "attribution", component: { type: "quote", text: "hi", author: "Ada" }, expected: "Ada" },
  { type: "quote", alias: "by", canonical: "attribution", component: { type: "quote", text: "hi", by: "Ada" }, expected: "Ada" },
  { type: "code", alias: "content", canonical: "code", component: { type: "code", language: "python", content: "print(1)" }, expected: "print(1)" },
  { type: "code", alias: "source", canonical: "code", component: { type: "code", language: "python", source: "print(1)" }, expected: "print(1)" },
  { type: "code", alias: "snippet", canonical: "code", component: { type: "code", language: "python", snippet: "print(1)" }, expected: "print(1)" },
  { type: "code", alias: "text", canonical: "code", component: { type: "code", language: "python", text: "print(1)" }, expected: "print(1)" },
  { type: "paragraph", alias: "content", canonical: "text", component: { type: "paragraph", content: "hi" }, expected: "hi" },
  { type: "paragraph", alias: "body", canonical: "text", component: { type: "paragraph", body: "hi" }, expected: "hi" },
  { type: "callout", alias: "tone", canonical: "variant", component: { type: "callout", text: "hi", tone: "info" }, expected: "info" },
  { type: "verdict_banner", alias: "variant", canonical: "tone", component: { type: "verdict_banner", text: "hi", variant: "positive" }, expected: "positive" },
  // swot (structure-components wave task 1, decision 8): singular-for-plural
  // slip on each of the 4 named quadrant slots.
  {
    type: "swot",
    alias: "strength",
    canonical: "strengths",
    component: { type: "swot", strength: ["s"], weaknesses: ["w"], opportunities: ["o"], threats: ["t"] },
    expected: ["s"],
  },
  {
    type: "swot",
    alias: "weakness",
    canonical: "weaknesses",
    component: { type: "swot", strengths: ["s"], weakness: ["w"], opportunities: ["o"], threats: ["t"] },
    expected: ["w"],
  },
  {
    type: "swot",
    alias: "opportunity",
    canonical: "opportunities",
    component: { type: "swot", strengths: ["s"], weaknesses: ["w"], opportunity: ["o"], threats: ["t"] },
    expected: ["o"],
  },
  {
    type: "swot",
    alias: "threat",
    canonical: "threats",
    component: { type: "swot", strengths: ["s"], weaknesses: ["w"], opportunities: ["o"], threat: ["t"] },
    expected: ["t"],
  },
  // bmc (structure-components wave task 1, decision 8): bare-noun-for-
  // compound-key slip on each of the 8 non-`channels` named blocks
  // (`channels` already matches the schema's own canonical key).
  {
    type: "bmc",
    alias: "partners",
    canonical: "key_partners",
    component: {
      type: "bmc",
      partners: ["p"],
      key_activities: ["a"],
      key_resources: ["r"],
      value_propositions: ["v"],
      customer_relationships: ["cr"],
      channels: ["c"],
      customer_segments: ["cs"],
      cost_structure: ["co"],
      revenue_streams: ["rs"],
    },
    expected: ["p"],
  },
  {
    type: "bmc",
    alias: "activities",
    canonical: "key_activities",
    component: {
      type: "bmc",
      key_partners: ["p"],
      activities: ["a"],
      key_resources: ["r"],
      value_propositions: ["v"],
      customer_relationships: ["cr"],
      channels: ["c"],
      customer_segments: ["cs"],
      cost_structure: ["co"],
      revenue_streams: ["rs"],
    },
    expected: ["a"],
  },
  {
    type: "bmc",
    alias: "resources",
    canonical: "key_resources",
    component: {
      type: "bmc",
      key_partners: ["p"],
      key_activities: ["a"],
      resources: ["r"],
      value_propositions: ["v"],
      customer_relationships: ["cr"],
      channels: ["c"],
      customer_segments: ["cs"],
      cost_structure: ["co"],
      revenue_streams: ["rs"],
    },
    expected: ["r"],
  },
  {
    type: "bmc",
    alias: "value_proposition",
    canonical: "value_propositions",
    component: {
      type: "bmc",
      key_partners: ["p"],
      key_activities: ["a"],
      key_resources: ["r"],
      value_proposition: ["v"],
      customer_relationships: ["cr"],
      channels: ["c"],
      customer_segments: ["cs"],
      cost_structure: ["co"],
      revenue_streams: ["rs"],
    },
    expected: ["v"],
  },
  {
    type: "bmc",
    alias: "relationships",
    canonical: "customer_relationships",
    component: {
      type: "bmc",
      key_partners: ["p"],
      key_activities: ["a"],
      key_resources: ["r"],
      value_propositions: ["v"],
      relationships: ["cr"],
      channels: ["c"],
      customer_segments: ["cs"],
      cost_structure: ["co"],
      revenue_streams: ["rs"],
    },
    expected: ["cr"],
  },
  {
    type: "bmc",
    alias: "segments",
    canonical: "customer_segments",
    component: {
      type: "bmc",
      key_partners: ["p"],
      key_activities: ["a"],
      key_resources: ["r"],
      value_propositions: ["v"],
      customer_relationships: ["cr"],
      channels: ["c"],
      segments: ["cs"],
      cost_structure: ["co"],
      revenue_streams: ["rs"],
    },
    expected: ["cs"],
  },
  {
    type: "bmc",
    alias: "costs",
    canonical: "cost_structure",
    component: {
      type: "bmc",
      key_partners: ["p"],
      key_activities: ["a"],
      key_resources: ["r"],
      value_propositions: ["v"],
      customer_relationships: ["cr"],
      channels: ["c"],
      customer_segments: ["cs"],
      costs: ["co"],
      revenue_streams: ["rs"],
    },
    expected: ["co"],
  },
  {
    type: "bmc",
    alias: "revenue",
    canonical: "revenue_streams",
    component: {
      type: "bmc",
      key_partners: ["p"],
      key_activities: ["a"],
      key_resources: ["r"],
      value_propositions: ["v"],
      customer_relationships: ["cr"],
      channels: ["c"],
      customer_segments: ["cs"],
      cost_structure: ["co"],
      revenue: ["rs"],
    },
    expected: ["rs"],
  },
]

describe("COMPONENT_FIELD_ALIASES: every row round-trips", () => {
  it.each(BLOCK_CASES)("$type: $alias → $canonical", ({ alias, canonical, component, expected }) => {
    const input = deck([slideWith([component])])
    const { value, normalized } = normalizeComponentAliases(input)
    expect(normalized).toEqual([`slides[0].components[0]: ${alias} → ${canonical}`])
    const out = (value as any).slides[0].components[0]
    // toEqual (not toBe): swot/bmc's `expected` values are arrays (each
    // named slot holds a string[]) — toBe's reference equality would fail
    // them even on a correct rename since the array literal here and the
    // renamed one aren't the same object. Behaves identically to toBe for
    // every pre-existing string-valued case above.
    expect(out[canonical]).toEqual(expected)
    expect(alias in out).toBe(false)
    expect(PptxIRSchema.safeParse(value).success).toBe(true)
  })

  it("covers every COMPONENT_FIELD_ALIASES row exactly once (fails if the table gains a row with no test)", () => {
    const expected = new Set<string>()
    for (const [type, aliases] of Object.entries(COMPONENT_FIELD_ALIASES)) {
      for (const alias of Object.keys(aliases)) expected.add(`${type}.${alias}`)
    }
    const actual = new Set(BLOCK_CASES.map((c) => `${c.type}.${c.alias}`))
    expect(actual).toEqual(expected)
  })
})

// ── every SLIDE_FIELD_ALIASES row round-trips ───────────────────────────────

interface SlideCase {
  readonly alias: string
  readonly slide: Record<string, unknown>
  readonly expected: string
}

const SLIDE_CASES: readonly SlideCase[] = [
  { alias: "note", slide: { type: "content", heading: "h", note: "say this out loud", components: [] }, expected: "say this out loud" },
  { alias: "speaker_notes", slide: { type: "content", heading: "h", speaker_notes: "remember the Q3 caveat", components: [] }, expected: "remember the Q3 caveat" },
  { alias: "speakerNotes", slide: { type: "content", heading: "h", speakerNotes: "pause here", components: [] }, expected: "pause here" },
]

describe("SLIDE_FIELD_ALIASES: every row round-trips", () => {
  it.each(SLIDE_CASES)("$alias → notes", ({ alias, slide, expected }) => {
    const input = deck([slide])
    const { value, normalized } = normalizeComponentAliases(input)
    expect(normalized).toEqual([`slides[0]: ${alias} → notes`])
    const out = (value as any).slides[0]
    expect(out.notes).toBe(expected)
    expect(alias in out).toBe(false)
    expect(PptxIRSchema.safeParse(value).success).toBe(true)
  })

  it("covers every SLIDE_FIELD_ALIASES row exactly once (fails if the table gains a row with no test)", () => {
    const expected = new Set(Object.keys(SLIDE_FIELD_ALIASES))
    const actual = new Set(SLIDE_CASES.map((c) => c.alias))
    expect(actual).toEqual(expected)
  })

  it("both alias and canonical present: left untouched for zod strict to reject", () => {
    const slide = { type: "content", heading: "h", notes: "real", note: "ignored", components: [] }
    const input = deck([slide])
    const { value, normalized } = normalizeComponentAliases(input)
    expect(normalized).toEqual([])
    expect(value).toBe(input)
    expect(PptxIRSchema.safeParse(value).success).toBe(false)
  })

  it("applies alongside a component-level rewrite on the same slide", () => {
    const slide = { type: "content", heading: "h", note: "say this", components: [{ type: "quote", content: "hello" }] }
    const input = deck([slide])
    const { value, normalized } = normalizeComponentAliases(input)
    expect(normalized).toEqual(["slides[0]: note → notes", "slides[0].components[0]: content → text"])
    const out = (value as any).slides[0]
    expect(out.notes).toBe("say this")
    expect(out.components[0]).toEqual({ type: "quote", text: "hello" })
  })

  it("a slide with no components array still gets its own notes alias rewritten", () => {
    const input = deck([{ type: "content", heading: "h", note: "still works" }])
    const { value, normalized } = normalizeComponentAliases(input)
    expect(normalized).toEqual(["slides[0]: note → notes"])
    expect((value as any).slides[0].notes).toBe("still works")
  })
})

// ── every COMPONENT_ITEM_FIELD_ALIASES row round-trips ─────────────────────

interface ItemCase {
  readonly type: string
  readonly itemsKey: string
  readonly alias: string
  readonly canonical: string
  readonly item: Record<string, unknown>
  readonly expected: unknown
  /** Extra already-canonical items appended after `item`, only to satisfy a component's own array min-count (steps/numbered_cards/row_cards) — irrelevant to the alias under test. */
  readonly pad?: Record<string, unknown>[]
}

const ITEM_CASES: readonly ItemCase[] = [
  { type: "kpi_cards", itemsKey: "items", alias: "title", canonical: "label", item: { value: "42", title: "Revenue" }, expected: "Revenue" },
  { type: "kpi_cards", itemsKey: "items", alias: "name", canonical: "label", item: { value: "42", name: "Revenue" }, expected: "Revenue" },
  { type: "architecture", itemsKey: "layers", alias: "name", canonical: "title", item: { items: ["a"], name: "API" }, expected: "API" },
  { type: "architecture", itemsKey: "layers", alias: "components", canonical: "items", item: { title: "Layer", components: ["svc-a", "svc-b"] }, expected: ["svc-a", "svc-b"] },
  { type: "architecture", itemsKey: "layers", alias: "nodes", canonical: "items", item: { title: "Layer", nodes: ["svc-a"] }, expected: ["svc-a"] },
  { type: "steps", itemsKey: "items", alias: "description", canonical: "text", item: { title: "Step 1", description: "do thing" }, expected: "do thing", pad: [{ title: "Step 2", text: "already canonical" }] },
  { type: "steps", itemsKey: "items", alias: "desc", canonical: "text", item: { title: "Step 1", desc: "do thing" }, expected: "do thing", pad: [{ title: "Step 2", text: "already canonical" }] },
  { type: "timeline", itemsKey: "milestones", alias: "year", canonical: "date", item: { title: "Launch", year: "2024" }, expected: "2024" },
  { type: "timeline", itemsKey: "milestones", alias: "text", canonical: "desc", item: { title: "Launch", date: "2024", text: "details" }, expected: "details" },
  { type: "timeline", itemsKey: "milestones", alias: "description", canonical: "desc", item: { title: "Launch", date: "2024", description: "details" }, expected: "details" },
  { type: "numbered_cards", itemsKey: "items", alias: "description", canonical: "text", item: { title: "Card 1", description: "body" }, expected: "body", pad: [{ title: "Card 2" }, { title: "Card 3" }] },
  { type: "numbered_cards", itemsKey: "items", alias: "desc", canonical: "text", item: { title: "Card 1", desc: "body" }, expected: "body", pad: [{ title: "Card 2" }, { title: "Card 3" }] },
  { type: "row_cards", itemsKey: "items", alias: "description", canonical: "text", item: { title: "Row 1", description: "body" }, expected: "body", pad: [{ title: "Row 2" }, { title: "Row 3" }] },
  { type: "row_cards", itemsKey: "items", alias: "desc", canonical: "text", item: { title: "Row 1", desc: "body" }, expected: "body", pad: [{ title: "Row 2" }, { title: "Row 3" }] },
]

describe("COMPONENT_ITEM_FIELD_ALIASES: every row round-trips", () => {
  it.each(ITEM_CASES)("$type.$itemsKey: $alias → $canonical", ({ type, itemsKey, alias, canonical, item, expected, pad = [] }) => {
    const component = { type, [itemsKey]: [item, ...pad] }
    const input = deck([slideWith([component])])
    const { value, normalized } = normalizeComponentAliases(input)
    expect(normalized).toEqual([`slides[0].components[0].${itemsKey}[0]: ${alias} → ${canonical}`])
    const outItem = (value as any).slides[0].components[0][itemsKey][0]
    expect(outItem[canonical]).toEqual(expected)
    expect(alias in outItem).toBe(false)
    expect(PptxIRSchema.safeParse(value).success).toBe(true)
  })

  it("covers every COMPONENT_ITEM_FIELD_ALIASES row exactly once (fails if the table gains a row with no test)", () => {
    const expected = new Set<string>()
    for (const [type, spec] of Object.entries(COMPONENT_ITEM_FIELD_ALIASES)) {
      for (const alias of Object.keys(spec.aliases)) expected.add(`${type}.${alias}`)
    }
    const actual = new Set(ITEM_CASES.map((c) => `${c.type}.${c.alias}`))
    expect(actual).toEqual(expected)
  })
})

// ── both alias and canonical present: left untouched, zod strict rejects ───

describe("both alias and canonical present: left untouched for zod strict to reject", () => {
  it("quote: content + text both present", () => {
    const component = { type: "quote", text: "real", content: "ignored" }
    const input = deck([slideWith([component])])
    const { value, normalized } = normalizeComponentAliases(input)
    expect(normalized).toEqual([])
    expect(value).toBe(input)
    expect(PptxIRSchema.safeParse(value).success).toBe(false)
  })

  it("kpi_cards item: title + label both present", () => {
    const component = { type: "kpi_cards", items: [{ value: "1", label: "Real", title: "Ignored" }] }
    const input = deck([slideWith([component])])
    const { value, normalized } = normalizeComponentAliases(input)
    expect(normalized).toEqual([])
    expect(value).toBe(input)
    expect(PptxIRSchema.safeParse(value).success).toBe(false)
  })

  it("callout's own canonical `variant` field is untouched — type-scoped dispatch means verdict_banner's inverse alias never applies to it", () => {
    const component = { type: "callout", text: "hi", variant: "warn" }
    const input = deck([slideWith([component])])
    const { value, normalized } = normalizeComponentAliases(input)
    expect(normalized).toEqual([])
    expect(value).toBe(input)
    expect(PptxIRSchema.safeParse(value).success).toBe(true)
  })

  it("two different aliases for the same canonical, both present: table order decides a deterministic winner, the loser is left for zod strict", () => {
    // COMPONENT_ITEM_FIELD_ALIASES.kpi_cards lists "title" before "name" —
    // title fills the empty `label` slot first; by the time "name" is
    // considered, `label` is already present, so "name" is left alone.
    const component = { type: "kpi_cards", items: [{ value: "1", title: "First", name: "Second" }] }
    const input = deck([slideWith([component])])
    const { value, normalized } = normalizeComponentAliases(input)
    expect(normalized).toEqual(["slides[0].components[0].items[0]: title → label"])
    const outItem = (value as any).slides[0].components[0].items[0]
    expect(outItem).toEqual({ value: "1", label: "First", name: "Second" })
    expect(PptxIRSchema.safeParse(value).success).toBe(false) // "name" now unrecognized
  })
})

// ── no aliases present: zero change ─────────────────────────────────────

describe("no aliases present: zero change", () => {
  it("a fully-canonical multi-slide deck comes back reference-equal, no clone", () => {
    const input = deck([
      slideWith([{ type: "quote", text: "hi", attribution: "Ada" }]),
      slideWith([{ type: "kpi_cards", items: [{ value: "1", label: "Revenue" }] }]),
    ])
    const { value, normalized } = normalizeComponentAliases(input)
    expect(value).toBe(input)
    expect(normalized).toEqual([])
  })

  it.each<[string, unknown]>([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["a string", "not an ir"],
    ["an array", []],
    ["an object with no slides", {}],
    ["slides not an array", { slides: "nope" }],
    ["slide entries that aren't objects", { slides: [null, "x", 1] }],
    ["components not an array", { slides: [{ components: "nope" }] }],
    ["component entries that aren't objects", { slides: [{ components: [null, "x", 1] }] }],
    ["a component with no type", { slides: [{ components: [{ label: "x" }] }] }],
    ["a component with a non-string type", { slides: [{ components: [{ type: 123 }] }] }],
    ["a recognized type with no alias-table row (bullets)", { slides: [{ components: [{ type: "bullets", items: ["a"] }] }] }],
  ])("passes through unchanged: %s", (_label, input) => {
    const { value, normalized } = normalizeComponentAliases(input)
    expect(value).toBe(input)
    expect(normalized).toEqual([])
  })

  it("never mutates a deeply frozen input", () => {
    const component = Object.freeze({ type: "quote", content: "hello" })
    const components = Object.freeze([component])
    const slide = Object.freeze({ type: "content", heading: "h", components })
    const slides = Object.freeze([slide])
    const input = Object.freeze({ version: "3", theme: Object.freeze({ id: "consulting" }), slides })

    expect(() => normalizeComponentAliases(input)).not.toThrow()
    const { value } = normalizeComponentAliases(input)
    expect((value as any).slides[0].components[0]).toEqual({ type: "quote", text: "hello" })
    expect(component).toEqual({ type: "quote", content: "hello" }) // original untouched
  })
})

// ── nested / assembled paths ────────────────────────────────────────────

describe("nested item-array paths", () => {
  it("reproduces the exact bracketed path format for a 3rd-slide, 2nd kpi item alias", () => {
    const input = deck([
      slideWith([{ type: "paragraph", text: "slide 1" }]),
      slideWith([{ type: "paragraph", text: "slide 2" }]),
      slideWith([
        {
          type: "kpi_cards",
          items: [
            { value: "1", label: "Already canonical" },
            { value: "2", title: "Aliased" },
          ],
        },
      ]),
    ])
    const { normalized } = normalizeComponentAliases(input)
    expect(normalized).toEqual(["slides[2].components[0].items[1]: title → label"])
  })

  it("records one entry per rewritten item, in walk order, across multiple components on one slide", () => {
    const input = deck([
      slideWith([
        { type: "quote", content: "q" },
        { type: "kpi_cards", items: [{ value: "1", title: "A" }, { value: "2", name: "B" }] },
      ]),
    ])
    const { normalized } = normalizeComponentAliases(input)
    expect(normalized).toEqual([
      "slides[0].components[0]: content → text",
      "slides[0].components[1].items[0]: title → label",
      "slides[0].components[1].items[1]: name → label",
    ])
  })
})

// ── deliberately out of scope: value coercion ───────────────────────────

describe("value type mismatches survive the rename (no _coerce_str port — field names only, not values)", () => {
  it("timeline year as a raw number renames the key but still fails zod's string check on `date`", () => {
    const component = { type: "timeline", milestones: [{ title: "Launch", year: 2024 }] }
    const input = deck([slideWith([component])])
    const { value, normalized } = normalizeComponentAliases(input)
    expect(normalized).toEqual(["slides[0].components[0].milestones[0]: year → date"])
    const outItem = (value as any).slides[0].components[0].milestones[0]
    expect(outItem.date).toBe(2024) // renamed, value untouched — still a number
    const r = PptxIRSchema.safeParse(value)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path.join(".").includes("date"))).toBe(true)
  })
})
