/**
 * The v4 IR schema root: theme/meta/assets/brand/background/slide/narrative
 * and the top-level `PptxIRSchema` a deck document parses against
 * (`parsePptxIR`). The frozen v3 shape lives in `./legacy-v3.ts`, kept only
 * for `migrateIrV3ToV4`'s input parsing (spec §9.3).
 *
 * **The `ComponentSchema` union below is a pure aggregator (src domain reorg
 * wave 2, spec §4.3), same discipline as `src/svg/layouts/registry.ts`'s T1d
 * precedent.** Every one of the 32 component schemas used to live here as a
 * literal `z.object({...})` entry directly inside the `discriminatedUnion`
 * array. Each now lives in its own `src/ir/components/<name>.ts` domain file
 * instead (schema + field aliases + render-trait declaration together, spec
 * §4.1) — imported below and referenced by name, in the exact union position
 * its literal used to occupy, so "take one component away whole" is a
 * single-file operation instead of an edit split across this file,
 * `field-aliases.ts`, and `component-traits.ts`. This file's own job for
 * components is now purely computational: import every component schema, construct
 * `ComponentSchema` via `z.discriminatedUnion`, and derive `COMPONENT_TYPES`
 * from the result — never a hand-copied literal, never a re-export relay. A
 * handful of schema fragments genuinely shared by ≥2 components (only the
 * icon-name enum, as of this wave) live in `src/ir/components/shared.ts`
 * instead of any one domain file; every other named sub-schema that reads as
 * "shared" at a glance (e.g. `GanttItemSchema`, `PestQuadrantSchema`,
 * `SankeyNodeSchema`/`SankeyLinkSchema`) turned out to be single-consumer and
 * moved into its own component's domain file with it.
 *
 * The rest of this module — everything outside the `// ── Components` section
 * — is unrelated to the component-domain split and was never in its scope:
 * background/theme/meta/assets/brand/slide/narrative and the top-level
 * `PptxIRSchema` are genuinely this file's own content, not aggregated from
 * elsewhere.
 */
import { z } from "zod"
import { BEAT_VALUES } from "./narrative-values"
import { componentTypeError } from "./schema-error-hints"
import { schema as bulletsSchema } from "./components/bullets"
import { schema as paragraphSchema } from "./components/paragraph"
import { schema as quoteSchema } from "./components/quote"
import { schema as calloutSchema } from "./components/callout"
import { schema as codeSchema } from "./components/code"
import { schema as kpiCardsSchema } from "./components/kpi-cards"
import { schema as chartSchema } from "./components/chart"
import { schema as flowchartSchema } from "./components/flowchart"
import { schema as architectureSchema } from "./components/architecture"
import { schema as timelineSchema } from "./components/timeline"
import { schema as comparisonSchema } from "./components/comparison"
import { schema as iconCardsSchema } from "./components/icon-cards"
import { schema as rowCardsSchema } from "./components/row-cards"
import { schema as stepsSchema } from "./components/steps"
import { schema as ringsSchema } from "./components/rings"
import { schema as numberedCardsSchema } from "./components/numbered-cards"
import { schema as roadmapSchema } from "./components/roadmap"
import { schema as matrixSchema } from "./components/matrix"
import { schema as insightPanelSchema } from "./components/insight-panel"
import { schema as verdictBannerSchema } from "./components/verdict-banner"
import { schema as citationSchema } from "./components/citation"
import { schema as imageSchema } from "./components/image"
import { schema as imageGridSchema } from "./components/image-grid"
import { schema as imageCompareSchema } from "./components/image-compare"
import { schema as swotSchema } from "./components/swot"
import { schema as bmcSchema } from "./components/bmc"
import { schema as waterfallSchema } from "./components/waterfall"
import { schema as ganttSchema } from "./components/gantt"
import { schema as pestSchema } from "./components/pest"
import { schema as fiveForcesSchema } from "./components/five-forces"
import { schema as heatmapSchema } from "./components/heatmap"
import { schema as sankeySchema } from "./components/sankey"
import { schema as dataTableSchema } from "./components/data-table"
import { schema as deviceMockupSchema } from "./components/device-mockup"
import { schema as cycleSchema } from "./components/cycle"

// Re-exported so `src/spec/index.ts`'s `PageSpecSchema.beat` can share this
// exact tuple instead of a second, independently-declared one — same
// "one vocabulary, two schemas" posture `SlideSchema.beat`'s own doc comment
// above describes, see `./narrative-values.ts` for why this lives there
// rather than being declared directly in either schema module.
export { BEAT_VALUES }

// Built-in theme ids — a registered, renderable subset, not a closed universe:
// v0.4's theme registry can install more without a schema change (theme.id
// below is an open z.string(), the installed-theme check lives in
// api.ts validateIr).
export const BUILTIN_THEME_IDS = [
  "consulting",
  "enterprise",
  "academic",
  "insight",
  "campaign",
  "bloom",
  "classroom",
  "ink",
  "tech",
  "runway",
  "journal",
  "luxe",
  "heritage",
  "pulse",
  "terra",
  "ember",
] as const

const Hex = z.string().regex(/^#[0-9A-Fa-f]{3,8}$/)

// ── Background（slide 级受限覆写）──

const BackgroundSpecSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("color"), value: Hex }).strict(),
  z
    .object({
      kind: z.literal("gradient"),
      from: Hex,
      to: Hex,
      direction: z.enum(["tb", "lr", "diagonal"]).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("asset"),
      asset_id: z.string(),
      overlay: z
        .object({ color: Hex, opacity: z.number().min(0).max(1) })
        .strict()
        .optional(),
      fit: z.enum(["cover", "contain"]).optional(),
    })
    .strict(),
])

// ── Theme / Meta / Assets / Brand ──

/**
 * Style-token override (theme.style): deep-partial palette/fonts/shape
 * merged over the built-in theme (see themes/index.ts resolveStyle). Scope is
 * deliberately palette-level (spec §11): no defaultBackgrounds or manifest
 * overrides. gapScale range mirrors the documented sane range in
 * themes/tokens.ts StyleShape.
 */
export const StyleOverrideSchema = z
  .object({
    colors: z
      .object({
        bg: Hex.optional(),
        surface: Hex.optional(),
        panel: Hex.optional(),
        primary: Hex.optional(),
        accent: Hex.optional(),
        text: Hex.optional(),
        muted: Hex.optional(),
        border: Hex.optional(),
        chartPalette: z.array(Hex).min(1).optional(),
        accentPool: z.array(Hex).min(1).optional(),
        cardStroke: Hex.optional(),
      })
      .strict()
      .optional(),
    fonts: z
      .object({
        heading: z.array(z.string()).min(1).optional(),
        body: z.array(z.string()).min(1).optional(),
        mono: z.array(z.string()).min(1).optional(),
      })
      .strict()
      .optional(),
    shape: z
      .object({
        radius: z.number().min(0).max(32).optional(),
        gapScale: z.number().min(0.8).max(1.3).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export type StyleOverride = z.infer<typeof StyleOverrideSchema>

/**
 * Brand (logical slide-master) config: brand-chrome behavior owned by a theme.
 * W1 scope = exactly the two flags migrated from the old manifest.chrome.
 * Single source of truth — the TS type is inferred, never hand-written.
 */
export const BrandConfigSchema = z
  .object({
    /** Suppress the footer entirely on content slides with a card background (enterprise legacy semantics). */
    suppressFooterOnCardContent: z.boolean().optional(),
    /** Skip the footer divider line — for themes that draw their own frame (ink). */
    suppressFooterRule: z.boolean().optional(),
  })
  .strict()

export type BrandConfig = z.infer<typeof BrandConfigSchema>

export const ThemeSchema = z
  .object({
    // Open string, not an enum — installed-theme check happens in validateIr
    // so a v0.4 registry can add themes without a schema change (spec §4).
    id: z.string().default("consulting"),
    style: StyleOverrideSchema.optional(),
    brand: BrandConfigSchema.optional(),
  })
  .strict()

// Exported (not just used internally) so W5's plan schema can pass its own
// `meta` field straight through to this exact schema instead of redefining
// an equivalent shape that could drift from it (`src/spec/index.ts`).
export const MetaSchema = z
  .object({
    organization: z.string().optional(),
    authors: z
      .array(
        z
          .object({
            name: z.string(),
            role: z.string().optional(),
            org: z.string().optional(),
          })
          .strict()
      )
      .optional(),
    date: z.string().optional(),
    version: z.string().optional(),
    confidentiality: z
      .enum(["public", "internal", "confidential", "restricted"])
      .optional(),
    contact: z
      .object({
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        website: z.string().optional(),
      })
      .strict()
      .optional(),
    copyright: z.string().optional(),
    // Deck-level animation switch (波次 C). Omitted entirely = default
    // behavior: page-transition fade on, per-component entrance animations off.
    // `transition: "none"` opts a deck out of the default fade transition.
    // `elements: "auto"` opts into per-component entrance animations (S3, wired —
    // see `pptx-generate.ts`'s `applyElementAnimations` call, gated on this
    // exact flag).
    animation: z
      .object({
        transition: z.enum(["fade", "push", "wipe", "none"]).optional(),
        elements: z.enum(["none", "auto"]).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

const AssetSchema = z
  .object({
    src: z.string(),
    alt: z.string().optional(),
    error: z.string().optional(),
  })
  .strict()

// Exported (not just used internally) so `./legacy-v3.ts` (the frozen v3
// schema) can reuse this exact schema — assets never changed shape between
// v3 and v4 (spec §9.1: "其余 IR 字段保持不变").
export const AssetsSchema = z
  .object({ images: z.record(z.string(), AssetSchema).default({}) })
  .strict()

// Exported (not just used internally) so W5's plan schema can pass its own
// `brand` field straight through to this exact schema instead of redefining
// an equivalent shape that could drift from it (`src/spec/index.ts`).
export const BrandSchema = z
  .object({
    logo_asset_id: z.string().optional(),
    position: z.enum(["tl", "tr", "bl", "br"]).optional(),
  })
  .strict()

// ── Components（35 种）──

const ComponentSchema = z.discriminatedUnion("type", [
  bulletsSchema,
  paragraphSchema,
  quoteSchema,
  calloutSchema,
  codeSchema,
  kpiCardsSchema,
  chartSchema,
  flowchartSchema,
  architectureSchema,
  timelineSchema,
  comparisonSchema,
  iconCardsSchema,
  rowCardsSchema,
  stepsSchema,
  ringsSchema,
  numberedCardsSchema,
  roadmapSchema,
  matrixSchema,
  insightPanelSchema,
  verdictBannerSchema,
  citationSchema,
  imageSchema,
  imageGridSchema,
  imageCompareSchema,
  swotSchema,
  bmcSchema,
  waterfallSchema,
  ganttSchema,
  pestSchema,
  fiveForcesSchema,
  heatmapSchema,
  sankeySchema,
  dataTableSchema,
  deviceMockupSchema,
  cycleSchema,
], { error: componentTypeError })

/**
 * All component `type` discriminant values, derived from `ComponentSchema`
 * itself (never hand-copied) so this list can't drift from the union above.
 * Typed as plain `readonly string[]` rather than `Component["type"][]` —
 * every consumer of this list (W5's plan `focus` vocabulary gate,
 * `src/spec/index.ts`) tests membership of an arbitrary author-supplied
 * string, and TS's `Array.includes` is invariant in its element type, so a
 * narrower literal-union type would reject that call at the caller.
 */
export const COMPONENT_TYPES: readonly string[] = ComponentSchema.options.map((option) => option.shape.type.value)

// ── Slide ──

// Exported (not just used internally) so `./legacy-v3.ts` (the frozen v3
// schema, kept around only for `migrateIrV3ToV4`'s input parsing and the
// v3-hard-reject path's own tests) can reuse this exact schema instead of a
// second definition that could drift from it — slides never changed shape
// between v3 and v4 (spec §9.1: "其余 IR 字段保持不变").
export const SlideSchema = z
  .object({
    type: z.enum(["cover", "chapter", "content", "ending"]).default("content"),
    // 稳定页标识（W5 spec/assemble 注入，裸 IR 可省）。schema 层不做跨 slide
    // 校验——同 deck 内重复 id 是 validateIr 的硬错误（api.ts
    // checkDuplicateSlideIds），错误列出重复的 id，不带页码（跨多页的
    // deck 级问题，单一 page 字段放不下）。
    id: z.string().optional(),
    // assemble 对未填充页生成的占位标记（W5）。validateIr 放行占位页的
    // schema 与内容质量检查（ir-quality.ts 的 checkIrQuality 跳过占位页
    // 的所有内容规则——占位页无内容可判）。generatePptx 未传
    // `{ draft: true }` 时对含占位页的 deck 硬拦（api.ts 的 draft
    // gate），renderSlideSvg（预览）永远不拦。
    placeholder: z.literal(true).optional(),
    // Layout registry id（archetype 或 takeover 皆可，src/svg/layouts/registry.ts
    // 的 LAYOUT_REGISTRY 键）。schema 层是开放 string——已注册 + slideTypes 适用
    // 是 validateIr 的硬门（api.ts，报错带可用清单与页号），同 theme.id「schema
    // 开放、validate 收口」的分层哲学（spec §6）。省略 = 四步确定性选型（页型
    // 全集 → theme.layouts 边界 → scenario 加权 → 加权 seed 取样加相邻防重复，
    // src/svg/layout-selection.ts。容量归 validate 密度门，不参与选型）。4 个图文接管 id
    // （image-split/image-top/image-bottom/image-annotate，原「图文范式族」
    // P3～2026-07-09 研究 ppt-master showcase 借鉴的 image_split/image_top/
    // image_bottom/image_annotate 四个 variant 值）的具体版式行为详见
    // registry.ts 对应条目，不在这里重复。
    layout: z.string().optional(),
    /**
     * Page-level rhythm hint (P1 variety wave, task 1 — additive v4 field,
     * spec's own beat vocabulary, `BEAT_VALUES`/`./narrative-values.ts`:
     * "anchor" | "dense" | "breathing"). **A selection-weight hint, not a
     * hard filter**: `resolveArchetypeId` (`svg/layout-selection.ts`)
     * combines a small tendency-weight factor for whichever content
     * archetypes the declared beat favors with the existing
     * `narrative.strategy` weight via `Math.max` (a P1 fix-round revision —
     * see `BEAT_TENDENCY_WEIGHT`'s own doc comment for why a product
     * measurably compounded into a monotony bug and `max` doesn't) — an
     * omitted `beat` contributes an implicit weight of 1 to every candidate,
     * which `max` never lets exceed the strategy-only weight, so a slide/deck
     * that never declares one resolves and renders byte-identically to
     * before this field existed (the v4 freeze's additive-only contract,
     * `docs/concepts.md`'s "v4
     * schema freeze" section). Authored on a `deck.spec.json` page
     * (`PageSpecSchema.beat`, `src/spec/index.ts`) and carried through
     * `assembleDeck` into this exact field as of this task — previously a
     * spec-only authoring anchor dropped at assemble (see that module's own
     * doc comment history). Not confined to `type: "content"` at the schema
     * layer (same open posture as every other optional `Slide` field), but
     * only ever has a real weighting effect there in practice: every
     * `BEAT_TENDENCIES` entry (`svg/layout-selection.ts`) names only content
     * archetype ids, the identical "cover/chapter/ending weighting is a
     * structural no-op" convention `StrategyDefinition.layoutTendencies`
     * already relies on for the same reason (that field's own doc comment).
     */
    beat: z.enum(BEAT_VALUES).optional(),
    // Body-arrangement（W2 任务 3：从旧 variant 字段拆出——上面 4 个图文接管值
    // 升格进 layout，其余 9 个身体排布值原样保留，语义逐条不变）。
    arrangement: z
      .enum([
        "single",
        "two_column",
        "kpi_focus",
        "image_focus",
        "code",
        "quote",
        "big_number",
        "assertion_evidence",
        // aside（2026-07-12 借鉴财经简报 EDITORIAL NOTE）：主内容 2/3 +
        // 观点侧栏 1/3——末位块进侧栏（放 callout/quote/kpi 巨号观点），
        // 数据与观点并置。<2 块退化 single。
        "aside",
      ])
      .optional(),
    heading: z.string().optional(),
    subheading: z.string().optional(),
    components: z.array(ComponentSchema).default([]),
    background: BackgroundSpecSchema.optional(),
    // 图片排版 P4：受控装饰原语——模型只有选择权（kind + 强度 + corner_tag
    // 的文本），绘制由渲染层手写 SVG 按主题 token 着色，不接受任意图形。
    decor: z
      .object({
        kind: z.enum(["big_number", "corner_tag", "rule_line", "quote_marks", "geo_dots"]),
        intensity: z.enum(["subtle", "normal"]).optional(),
        text: z.string().max(12).optional(),
      })
      .strict()
      .optional(),
    // 仅 image_split 用：图列在左还是右（缺省 left；ppt-master P04 右图出血）
    image_side: z.enum(["left", "right"]).optional(),
    footnote: z.string().optional(),
    /**
     * Speaker notes — exported as native PowerPoint speaker notes
     * (`src/pptx/generate.ts`'s `slide.addNotes`), never rendered onto the
     * canvas SVG. Purely additive on the frozen v3 schema (optional, no
     * default): an existing IR that omits this field parses and exports
     * identically to before this field existed. Never reaches the canvas
     * SVG, so it carries no geometry to overflow and no ink to contrast-check
     * — out of scope for capacity/audit measurement
     * (`src/svg/audit/deck-audit.ts`) by construction, not by an added
     * exemption.
     */
    notes: z.string().optional(),
  })
  .strict()

// ── Narrative（spec §5, renamed from "Scenario" — spec §8.1）──

/**
 * Object half of the top-level `narrative` field's `string | object` union
 * (see {@link PptxIRSchema}) — deliberately as open as a record gets: any
 * string key, any value. Same open-schema/closed-semantic split as the
 * preset-name string branch (and this file's `theme.id`): the *actual*
 * constraint — only `strategy`/`pacing`/`audience` are legal keys, each with
 * its own closed enum — is enforced later, in `validateIr`, by
 * `resolveNarrative` (`src/narrative`), not here.
 *
 * This was originally a `.strict()` object with a `z.enum(...)` per axis,
 * closed right at the schema layer — wrong inside a `z.union([...])`: zod
 * reports a failing union branch as one opaque `invalid_union` issue, not
 * that branch's own specific issue, so an axis-value typo or an unknown key
 * never surfaced `resolveNarrative`'s available-values message — every
 * rejection collapsed to the same useless
 * `{ path: "narrative", message: "Invalid input" }` (W3 task-2 review
 * finding). Loosening this branch to a plain record makes the schema layer
 * responsible for exactly one thing — string vs. object vs. neither — so an
 * object input always parses far enough for `validateIr`'s existing
 * `resolveNarrative` try/catch to run and produce a specific, listable
 * message, the same way it already did for an unknown preset-name string.
 * `resolveNarrative` itself still reads `./narrative-values`'s
 * `STRATEGY_VALUES`/`PACING_VALUES`/`AUDIENCE_VALUES` tuples for its runtime
 * checks — this schema no longer needs to import them at all.
 *
 * Exported so W5's plan schema (`src/spec/index.ts`) can reuse this exact
 * object branch for its own top-level `scenario` field (plan's own field
 * name is unchanged this task — spec §8.1's `DeckPlan`→`DeckSpec` rename is
 * task 2's job, not this one) — same open-schema/closed-semantic split, same
 * `resolveNarrative` consumer, one definition instead of two that could
 * drift apart.
 *
 * Renamed from `ScenarioAxesInputSchema` in the vocabulary-v4 rename (task
 * 1) — not itself named in spec §8.1's table, but derived from
 * `ScenarioAxes`→`NarrativeProfile` the same way the rest of this module's
 * axis vocabulary was. `./legacy-v3.ts`'s frozen `PptxIRV3Schema` reuses this
 * exact schema for its own `scenario` field too — the object shape (any
 * string key, any value) never changed between v3 and v4, only which field
 * name and which axis-key vocabulary `resolveNarrative`/`resolveScenario`
 * validate against it downstream.
 */
export const NarrativeProfileInputSchema = z.record(z.string(), z.unknown())

// ── 顶层 IR（v4 — current. The frozen v3 shape lives in ./legacy-v3.ts,
// kept only for migrateIrV3ToV4's input parsing and the v3-hard-reject
// path's own tests, per spec §9.3: v3 is a closed, frozen contract that
// this repo's render chain no longer speaks directly — every v3 input must
// pass through `migrateIrV3ToV4` first）──

export const PptxIRSchema = z
  .object({
    // v4 is now the default (spec §15.1: "version 默认 '4'") — an omitted
    // version is treated as v4, not v3. `validateIr` (`src/api.ts`) branches
    // on an *explicit* "2" or "3" before this schema ever runs (hard reject,
    // spec §9.3/§15.3); everything else — omitted, or explicit "4" — reaches
    // this schema's own `.strict()` parse with no old-vocabulary rescue
    // (spec §16: an old field name like `scenario` fails here as an
    // unrecognized key, same as any other typo).
    version: z.literal("4").default("4"),
    filename: z.string().default("presentation"),
    // Preset id string or a partial per-axis override object — both
    // branches are open at the schema layer now (validity checked in
    // validateIr, same open-schema/closed-semantic pattern as this object's
    // own theme.id field; see NarrativeProfileInputSchema above for why the
    // object branch reads this way too). Omitted entirely = the `general`
    // preset (briefing × balanced × public, spec §5). Deliberately has no
    // `.default(...)`: the resolved NarrativeProfile is never written back
    // into the IR — validateIr and (W4) the render path each call
    // `resolveNarrative` themselves (pure, cheap) rather than this schema
    // baking a materialized default in, which would drift the parsed-output
    // shape the moment NARRATIVE_PRESETS.general's axes changed.
    //
    // Type note: this infers as `string | Record<string, unknown> |
    // undefined` on PptxIR — wider than the "strategy/pacing/audience" shape
    // one might expect. `resolveNarrative` (src/narrative) is the semantic
    // authority for that narrower shape; treat this field's static type as
    // shape-only and go there for what's actually valid.
    //
    // Renamed from `scenario` (spec §8.1/§9.1). A v4-track document that
    // still writes the pre-rename field name (`scenario`) is rejected here —
    // this object is `.strict()`, so `scenario` surfaces as an unrecognized
    // key (spec §16). The pre-rename axis field names `mode`/`delivery`
    // inside `narrative` slip past this schema (it stays an open record —
    // see `NarrativeProfileInputSchema` above) but are caught one level down
    // by `resolveNarrative`'s own runtime axis-key check (`src/narrative`).
    narrative: z.union([z.string(), NarrativeProfileInputSchema]).optional(),
    theme: ThemeSchema.default({ id: "consulting" }),
    meta: MetaSchema.default({}),
    assets: AssetsSchema.default({ images: {} }),
    brand: BrandSchema.optional(),
    // 修订稳定性 seed（W5 由 assemble 从 plan 注入，W4 消费做取样选型）。与
    // variety.ts 的内容哈希 deckSeed 正交、互不影响——缺省时 W4 前的选型/
    // 渲染行为不变。
    seed: z.number().int().optional(),
    slides: z.array(SlideSchema),
  })
  .strict()

export type PptxIR = z.infer<typeof PptxIRSchema>
export type Component = z.infer<typeof ComponentSchema>
export type BackgroundSpec = z.infer<typeof BackgroundSpecSchema>
export type Slide = z.infer<typeof SlideSchema>
export type Assets = z.infer<typeof AssetsSchema>
export type Meta = z.infer<typeof MetaSchema>
export type Brand = z.infer<typeof BrandSchema>

// Component sub-types (extracted from ComponentSchema union members)
export type KpiItem = {
  value: string
  unit?: string
  label: string
  delta?: "up" | "down" | "flat"
}
export type ChartSeries = {
  name: string
  data: { x: string | number; y: number }[]
}
export type FlowNode = {
  id: string
  label: string
  kind?: "rect" | "diamond" | "round"
}
export type FlowEdge = { from: string; to: string; label?: string }
export type ArchitectureLayer = { title: string; items: string[] }
export type TimelineMilestone = { date: string; title: string; desc?: string }
export type ComparisonRow = { label: string; cells: string[] }
export type CitationSource = { label: string; url?: string; ref?: string }

export function parsePptxIR(
  json: unknown
): { success: true; data: PptxIR } | { success: false; error: string } {
  const result = PptxIRSchema.safeParse(json)
  if (result.success) return { success: true, data: result.data }
  return {
    success: false,
    error: result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n"),
  }
}
