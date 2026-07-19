/**
 * Three representative v3 decks for the vocabulary-v4 rename's equivalence
 * proof (task 1, spec §9.1/§10/§12): a plain deck with no `scenario` at all
 * (defaults chain), a deck with an explicit `scenario` axes object using the
 * pre-rename mode/delivery *values* this task renames (`mode: "narrative"`,
 * `delivery: "text"` — exercises both the mode-value and delivery-value
 * remap in one fixture), and a deck using the `annual-review` named preset
 * (spec §5's own worked example: `mode: narrative` → `strategy:
 * storytelling` inside that preset's definition).
 *
 * Shared by two things that must stay in lockstep:
 *  - the base-commit capture script (task-1 report) that rendered these
 *    exact objects with the pre-rename code and saved the output as this
 *    task's golden fixtures (`equivalence-golden/*.json`, committed
 *    alongside this file)
 *  - `../migrate-equivalence.test.ts`, which replays the same objects
 *    through `PptxIRV3Schema` → `migrateIrV3ToV4` → the (now v4-only) render
 *    chain and asserts byte-equality against that golden output
 *
 * Deliberately untyped (`Record<string, unknown>`, not `PptxIRV3`): every
 * field here is deliberately written in raw v3 vocabulary (`scenario`, not
 * `narrative`) so a plain object literal reads correctly regardless of which
 * IR version's types are in scope when this file is imported.
 */
export const V3_EQUIVALENCE_DECKS: Record<string, unknown> = {
  basic: {
    version: "3",
    filename: "pptfast-basic-demo",
    theme: { id: "consulting" },
    meta: { organization: "pptfast", date: "2026-07-17" },
    slides: [
      { type: "cover", heading: "pptfast", subheading: "Stable, editable PPTX from a semantic IR" },
      { type: "chapter", heading: "Why an IR" },
      {
        type: "content",
        heading: "Design goals",
        components: [
          {
            type: "bullets",
            items: [
              "Raise the floor of AI-generated decks",
              "Native DrawingML output — every shape stays editable",
              "Design tokens plus an archetype library, not freeform drawing",
            ],
          },
        ],
      },
      {
        type: "content",
        heading: "At a glance",
        arrangement: "kpi_focus",
        components: [
          {
            type: "kpi_cards",
            items: [
              { value: "13", label: "built-in themes" },
              { value: "28", label: "semantic component types" },
              { value: "1", label: "single SVG source per slide" },
            ],
          },
        ],
      },
      { type: "ending", heading: "Thanks", layout: "banner-ending" },
    ],
  },
  scenarioBearing: {
    version: "3",
    filename: "scenario-bearing",
    theme: { id: "journal" },
    scenario: { mode: "narrative", delivery: "text", audience: "customer" },
    seed: 42,
    slides: [
      { type: "cover", heading: "Origin Story", subheading: "How we got here" },
      {
        type: "content",
        heading: "The tension",
        components: [{ type: "quote", text: "We almost shipped the wrong thing.", attribution: "Team lead" }],
      },
      {
        type: "content",
        heading: "The turning point",
        components: [
          {
            type: "timeline",
            milestones: [
              { date: "Q1", title: "Discovery", desc: "Found the real problem" },
              { date: "Q2", title: "Pivot", desc: "Rebuilt around it", highlight: true },
              { date: "Q3", title: "Launch", desc: "Shipped to customers" },
            ],
          },
        ],
      },
      {
        type: "content",
        heading: "What changed",
        components: [{ type: "bullets", items: ["Faster iteration", "Clearer ownership", "Happier customers"] }],
      },
      { type: "ending", heading: "Thanks" },
    ],
  },
  annualReviewPreset: {
    version: "3",
    filename: "annual-review",
    theme: { id: "journal" },
    scenario: "annual-review",
    seed: 1550434794,
    slides: [
      { type: "cover", heading: "Q3 Review", subheading: "Results and outlook" },
      { type: "chapter", heading: "Revenue" },
      {
        type: "content",
        heading: "Growth came from high-value expansion",
        components: [
          {
            type: "kpi_cards",
            items: [
              { value: "24%", label: "revenue growth", delta: "up" },
              { value: "$142", label: "average order value", delta: "up" },
              { value: "91%", label: "renewal rate", delta: "flat" },
            ],
          },
        ],
      },
      {
        type: "content",
        heading: "A quarter of steady wins",
        components: [{ type: "quote", text: "The team compounded small wins into a real trend.", attribution: "CFO" }],
      },
      { type: "ending", heading: "Thanks", layout: "banner-ending" },
    ],
  },
}
