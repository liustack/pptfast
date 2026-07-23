import { z } from "zod"
import { PPTX_ICON_NAMES } from "@/icons"
import { BEAT_VALUES } from "./narrative-values"
import { componentTypeError, iconEnumError } from "./schema-error-hints"

// Re-exported so `src/plan/index.ts`'s `PageSpecSchema.beat` can share this
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
// an equivalent shape that could drift from it (`src/plan/index.ts`).
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
// an equivalent shape that could drift from it (`src/plan/index.ts`).
export const BrandSchema = z
  .object({
    logo_asset_id: z.string().optional(),
    position: z.enum(["tl", "tr", "bl", "br"]).optional(),
  })
  .strict()

// ── Components（32 种）──

// gantt's own item schema is pulled out to a named const (structure-
// components wave task 2, decision 6) rather than inlined in the union
// array below, purely so its `.refine` — the one item shape in this whole
// union that needs cross-field validation — reads as a standalone unit
// instead of being buried in the middle of a 400-line array literal.
// `ComponentSchema.options.map((option) => option.shape.type.value)`
// (`COMPONENT_TYPES` below) requires every *top-level* union member to stay
// a plain `ZodObject` (`.shape` doesn't exist on the `ZodEffects` a `.refine`
// wrapper produces) — this only matters for `gantt`'s own top-level object,
// which stays untouched; the refine lives one level down, on the item
// schema nested inside `z.array(...)`, where that constraint doesn't apply.
const GanttItemSchema = z
  .object({
    label: z.string(),
    start: z.number(),
    end: z.number(),
  })
  .strict()
  .refine((item) => item.end > item.start, {
    message: "gantt item's end must be greater than its start (no zero/negative-duration bars)",
    path: ["end"],
  })

// PEST macro-environment scan (structure-components wave task 1, second
// component of this task — same "named-slot family" discipline as
// swot/bmc above: four independent named fields, never a positional array a
// weak model could mis-order). Each quadrant carries its own optional
// `title` inline (`{title?, items}`) instead of a sibling `labels` object
// the way swot does — this task's own schema-shape call, not a swot-copy
// oversight (see pest.tsx's own file header for the render-side rationale).
const PestQuadrantSchema = z
  .object({
    title: z.string().optional(),
    items: z.array(z.string()).min(1).max(5),
  })
  .strict()

// Porter's Five Forces hub-and-spoke (structure-components wave 2 task 1,
// second component of this task): `rivalry` is the center panel
// (competitive rivalry — the model's own namesake force), the other four
// are the surrounding forces. All five named slots share one shape —
// `intensity` is meaningful for `rivalry` too, a market's own competitive
// intensity is exactly what the center panel measures, so it isn't
// special-cased out of the shared schema the way a "hub has no intensity"
// design would have done.
const FiveForcesPanelSchema = z
  .object({
    label: z.string().optional(),
    intensity: z.enum(["low", "medium", "high"]).optional(),
    items: z.array(z.string()).min(1).max(5),
  })
  .strict()

// Sankey flow diagram (structure-components wave 2 task 3 — the wave's
// largest component and its sharpest differentiator: Anthropic's own
// official pptx-authoring skill classifies a sankey as "PowerPoint has no
// native form for this" and ships it as a rasterized image. This component
// routes every node bar and flow band through the existing SVG path ->
// custGeom pipeline instead, so the export carries zero `<p:pic>` for it —
// natively editable vectors, not a picture of a chart).
//
// Two named sub-schemas (not inlined, same "cross-field refine needs its own
// symbol" precedent GanttItemSchema set above): `nodes`/`links` is a graph,
// not a named-slot family (swot/pest's own "positional array a weak model
// could mis-order" concern doesn't apply here — a node's identity is its own
// `id`, referenced by `links[].from`/`to`, not by array position), so this
// stays the natural {nodes[], links[]} shape rather than forcing named slots
// where none would make sense.
const SankeyNodeSchema = z
  .object({
    id: z.string(),
    label: z.string(),
  })
  .strict()

/**
 * Classic 3-color DFS cycle detection, returning one concrete node-id path
 * (e.g. `["a","b","c","a"]`) rather than just "a cycle exists somewhere" —
 * actionable for a weak model to repair by naming exactly which link to
 * remove or redirect (plan task 3 item 1: "带可执行消息"). Iterates
 * `nodeIds`/each node's outgoing adjacency list in *authored array order*
 * (both built from `c.nodes`/`c.links` by the caller, never a Map/Set
 * iteration for anything order-sensitive), so the specific cycle reported is
 * deterministic across runs even when a graph contains more than one.
 *
 * Written as a return-threading recursive helper — not a closure mutating an
 * outer `let` — deliberately: an earlier version threaded a shared `let
 * cyclePath` through the recursive `visit` closure instead, which TS's
 * control-flow narrowing couldn't follow across the closure boundary
 * (`cyclePath` narrowed to `never` at the read site despite the runtime
 * value being correct) — functional return-threading sidesteps that
 * whole class of narrowing fragility rather than fighting it with a type
 * assertion.
 */
function findSankeyCycle(nodeIds: readonly string[], adjacency: ReadonlyMap<string, string[]>): string[] | null {
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>(nodeIds.map((id) => [id, WHITE]))
  const stack: string[] = []

  const visit = (id: string): string[] | null => {
    color.set(id, GRAY)
    stack.push(id)
    for (const next of adjacency.get(id) ?? []) {
      if (color.get(next) === GRAY) {
        const start = stack.indexOf(next)
        return [...stack.slice(start), next]
      }
      if (color.get(next) === WHITE) {
        const found = visit(next)
        if (found) return found
      }
    }
    stack.pop()
    color.set(id, BLACK)
    return null
  }

  for (const id of nodeIds) {
    if (color.get(id) === WHITE) {
      const found = visit(id)
      if (found) return found
    }
  }
  return null
}

const SankeyLinkSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    /** Flow magnitude, strictly positive (`z.number().positive()` — the
     * schema-level decision for "value > 0 or explicit zero-value handling",
     * plan task 3 item 1). A zero or negative value carries no visible flow
     * to draw — rejecting it at the schema is a clearer signal than silently
     * rendering an invisible or degenerate band, and matches this schema's
     * own posture elsewhere (gantt's item `.refine` rejects a zero-duration
     * bar the same way, for the same reason: a valid-looking but
     * un-renderable-as-intended value is a schema-time error, not a
     * render-time silent no-op). A *tiny-but-positive* value is legal and
     * handled at render time instead — `sankey.tsx`'s `MIN_BAND_H` floors it
     * to a visible minimum thickness rather than letting it vanish, the
     * pathological case named in the plan's "extreme value ratio (1:10000)"
     * probe. */
    value: z.number().positive(),
  })
  .strict()

const ComponentSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("bullets"),
      items: z.array(z.string()),
      style: z.enum(["default", "checklist", "numbered", "plain", "divided"]).optional(),
    })
    .strict(),
  z.object({ type: z.literal("paragraph"), text: z.string() }).strict(),
  z
    .object({
      type: z.literal("quote"),
      text: z.string(),
      attribution: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("callout"),
      variant: z.enum(["info", "warn", "tip"]),
      text: z.string(),
      icon: z.enum(PPTX_ICON_NAMES, { error: iconEnumError }).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("code"),
      language: z.string(),
      code: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("kpi_cards"),
      items: z.array(
        z
          .object({
            value: z.string(),
            unit: z.string().optional(),
            label: z.string(),
            delta: z.enum(["up", "down", "flat"]).optional(),
            icon: z.enum(PPTX_ICON_NAMES, { error: iconEnumError }).optional(),
            /** 数据来源小字（财经信任语言，2026-07-12 借鉴），如
             * 「来源: Crunchbase」。 */
            source: z.string().optional(),
          })
          .strict()
      ),
    })
    .strict(),
  z
    .object({
      type: z.literal("chart"),
      /** dumbbell（2026-07-12 借鉴）：哑铃变化图——series[0]=起点值、
       * series[1]=终点值（等长同 x 标签），每行「起点●———●终点」显变化。
       * bar 可加 direction:"horizontal" 横条排名（长标签友好）。
       * pie 可加 style:"donut" 环形+中心总值。 */
      chart_type: z.enum(["bar", "line", "pie", "funnel", "dumbbell"]),
      direction: z.enum(["horizontal", "vertical"]).optional(),
      style: z.enum(["donut"]).optional(),
      /** Renders only for `chart_type: "bar"` (either direction) and
       * `"line"` — a cartesian plot box with a real category/value axis pair
       * to title and grid against. Ignored (schema-legal, silently dropped
       * at render, warn-severity `chart_axes_ignored` validate finding) on
       * `pie`/`funnel`/`dumbbell`, which have no such plot box. */
      axes: z
        .object({
          x_title: z.string().optional(),
          y_title: z.string().optional(),
          show_grid: z.boolean().optional(),
        })
        .strict()
        .optional(),
      series: z.array(
        z
          .object({
            name: z.string(),
            data: z.array(
              z
                .object({
                  x: z.union([z.string(), z.number()]),
                  y: z.number(),
                })
                .strict()
            ),
          })
          .strict()
      ),
    })
    .strict(),
  z
    .object({
      type: z.literal("flowchart"),
      nodes: z
        .array(
          z
            .object({
              id: z.string(),
              label: z.string(),
              kind: z.enum(["rect", "diamond", "round"]).optional(),
            })
            .strict()
        )
        .max(20),
      edges: z.array(
        z
          .object({
            from: z.string(),
            to: z.string(),
            label: z.string().optional(),
          })
          .strict()
      ),
      direction: z.enum(["TB", "TD", "BT", "LR", "RL"]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("architecture"),
      layers: z.array(
        z
          .object({ title: z.string(), items: z.array(z.string()) })
          .strict()
      ),
    })
    .strict(),
  z
    .object({
      type: z.literal("timeline"),
      /** 版式：缺省 horizontal（存量语义）。vertical=左 date/中轴圆点/右
       * 标题描述的编辑部竖排时间线，适合 4-8 个叙事型节点。 */
      layout: z.enum(["horizontal", "vertical"]).optional(),
      milestones: z.array(
        z
          .object({
            date: z.string(),
            title: z.string(),
            desc: z.string().optional(),
            /** 强调节点：accent 色 + 大圆点（时间线上的「转折点」语义）。 */
            highlight: z.boolean().optional(),
          })
          .strict()
      ),
    })
    .strict(),
  z
    .object({
      type: z.literal("comparison"),
      columns: z.array(z.string()),
      rows: z.array(
        z
          .object({ label: z.string(), cells: z.array(z.string()) })
          .strict()
      ),
    })
    .strict(),
  z
    .object({
      type: z.literal("icon_cards"),
      /** 2-4 项单行并列，5-6 项自动 2 行 3 列宫格（2026-07-11 用户借鉴）。 */
      items: z
        .array(
          z
            .object({
              icon: z.enum(PPTX_ICON_NAMES, { error: iconEnumError }),
              title: z.string(),
              text: z.string(),
            })
            .strict()
        )
        .min(2)
        .max(6),
    })
    .strict(),
  z
    .object({
      type: z.literal("row_cards"),
      /** 全宽横向长卡列表（编号圆圈 + 可选图标 + 三级文字），3-6 项纵向
       * 堆叠，highlight 项 accent 描边强调。适合成果一览/贡献清单/议题列表
       * 这类每项信息量较大的枚举。 */
      items: z
        .array(
          z
            .object({
              icon: z.enum(PPTX_ICON_NAMES, { error: iconEnumError }).optional(),
              title: z.string(),
              text: z.string().optional(),
              sub: z.string().optional(),
              highlight: z.boolean().optional(),
            })
            .strict()
        )
        .min(3)
        .max(6),
    })
    .strict(),
  z
    .object({
      type: z.literal("steps"),
      items: z
        .array(
          z
            .object({
              title: z.string(),
              text: z.string(),
            })
            .strict()
        )
        .min(2)
        .max(5),
    })
    .strict(),
  z
    .object({
      type: z.literal("rings"),
      /** 分层同心圆环（洋葱模型）：items 从内核到外层排序（items[0]=内核
       * 实心圆）。每层引线标注到右侧（label 短词 ≤8 字，desc 一句话）。 */
      items: z
        .array(
          z
            .object({
              label: z.string(),
              desc: z.string().optional(),
            })
            .strict()
        )
        .min(2)
        .max(4),
    })
    .strict(),
  z
    .object({
      type: z.literal("numbered_cards"),
      /** 编号网格列表（编辑部大数字目录）：自动编号 01..N，无卡壳左竖线
       * 分栏，适合并列名录/作品集/要点集。≤4 项单行，5-8 项两行网格。 */
      items: z
        .array(
          z
            .object({
              title: z.string(),
              text: z.string().optional(),
              sub: z.string().optional(),
            })
            .strict()
        )
        .min(3)
        .max(8),
    })
    .strict(),
  z
    .object({
      type: z.literal("roadmap"),
      /** 阶段路线图卡：2-4 个阶段横排，自动编号 01..N，每阶段含标题、
       * 可选时段（如「0-6 个月」）与若干 label:value 指标行。适合分阶段
       * 推进/路线图/里程碑规划。 */
      items: z
        .array(
          z
            .object({
              title: z.string(),
              period: z.string().optional(),
              rows: z
                .array(z.object({ label: z.string(), value: z.string() }).strict())
                .max(4)
                .optional(),
            })
            .strict()
        )
        .min(2)
        .max(4),
    })
    .strict(),
  z
    .object({
      type: z.literal("matrix"),
      /** 二维定位矩阵：带可选 XY 轴标签的色格网格，items 按行优先填格，
       * tone 决定象限底色。适合定位矩阵/象限分析/组合分类。 */
      x_title: z.string().optional(),
      y_title: z.string().optional(),
      cols: z.number().int().min(2).max(3),
      items: z
        .array(
          z
            .object({
              title: z.string(),
              tag: z.string().optional(),
              tone: z.enum(["neutral", "accent", "info"]).optional(),
            })
            .strict()
        )
        .min(2)
        .max(9),
    })
    .strict(),
  z
    .object({
      type: z.literal("insight_panel"),
      /** 带标题的策略/观点面板：标题压色条 + 若干 label/描述行 + 可选贴底
       * 脚注。常作 aside 侧栏块与数据并置（观点/纪律/结论）。 */
      title: z.string(),
      rows: z
        .array(z.object({ label: z.string(), text: z.string() }).strict())
        .min(1)
        .max(5),
      footnote: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("verdict_banner"),
      text: z.string(),
      tone: z.enum(["positive", "warning", "neutral"]),
      icon: z.enum(PPTX_ICON_NAMES, { error: iconEnumError }).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("citation"),
      sources: z.array(
        z
          .object({
            label: z.string(),
            url: z.string().optional(),
            ref: z.string().optional(),
          })
          .strict()
      ),
    })
    .strict(),
  z
    .object({
      type: z.literal("image"),
      asset_id: z.string(),
      caption: z.string().optional(),
      // 默认 cover（2026-07-09 用户反馈：模型常选 contain letterbox 不铺满
      // ——照片一律等比铺满裁切；contain 留给图表截图等不可裁切的图）
      fit: z.enum(["contain", "cover"]).default("cover"),
    })
    .strict(),
  // 图片排版 P2（2026-07-08）：多图网格与双图对比。
  z
    .object({
      type: z.literal("image_grid"),
      items: z
        .array(
          z
            .object({
              asset_id: z.string(),
              caption: z.string().optional(),
            })
            .strict()
        )
        .min(2)
        .max(4),
      emphasis: z.enum(["none", "first"]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("image_compare"),
      left: z.object({ asset_id: z.string(), label: z.string() }).strict(),
      right: z.object({ asset_id: z.string(), label: z.string() }).strict(),
      style: z.enum(["vs", "before_after"]).optional(),
    })
    .strict(),
  // 结构化组件族（structure-components wave task 1）：named-slot 满幅组件
  // ——不走 bullets 那种弱模型易错序的位置数组，每个语义槽是独立具名字段，
  // 模型写错字段名会被 zod strict 直接拒收，而不是静默错标象限/分区。渲染
  // 时必须是 slide 的唯一 component（`FULL_BODY_TYPES`, component-traits.ts
  // + `checkFullBodyExclusivity`, api.ts 的独占硬门）。
  z
    .object({
      type: z.literal("swot"),
      /** 内部因素·优势/劣势，外部因素·机会/威胁——经典 2×2 SWOT 矩阵。每槽
       * 1-5 条，各自独立数组（绝不是共享一个位置数组按下标分象限）。 */
      strengths: z.array(z.string()).min(1).max(5),
      weaknesses: z.array(z.string()).min(1).max(5),
      opportunities: z.array(z.string()).min(1).max(5),
      threats: z.array(z.string()).min(1).max(5),
      /** 象限标题覆写（国际化/自定义措辞）——缺省用固定英文 S/W/O/T 全称
       * （Strengths/Weaknesses/Opportunities/Threats），四键均可选，缺的键
       * 落回默认值。 */
      labels: z
        .object({
          strengths: z.string().optional(),
          weaknesses: z.string().optional(),
          opportunities: z.string().optional(),
          threats: z.string().optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("bmc"),
      /** Business Model Canvas 经典九宫——固定具名键（非位置数组），每槽
       * 1-4 条。渲染层按 Osterwalder 标准五列画布排布（见 bmc.tsx 头注）。 */
      key_partners: z.array(z.string()).min(1).max(4),
      key_activities: z.array(z.string()).min(1).max(4),
      key_resources: z.array(z.string()).min(1).max(4),
      value_propositions: z.array(z.string()).min(1).max(4),
      customer_relationships: z.array(z.string()).min(1).max(4),
      channels: z.array(z.string()).min(1).max(4),
      customer_segments: z.array(z.string()).min(1).max(4),
      cost_structure: z.array(z.string()).min(1).max(4),
      revenue_streams: z.array(z.string()).min(1).max(4),
    })
    .strict(),
  // 数值轴家族（structure-components wave task 2）：另一支满幅组件——不是
  // named-slot（swot/bmc 的具名槽治的是「弱模型排错序」），而是「运行合计/
  // 比例映射必须逐字节确定性可推导」，见 waterfall.tsx/gantt.tsx 头注。
  z
    .object({
      type: z.literal("waterfall"),
      /** 瀑布桥图条目：`value` 是带符号增量（相对上一条运行合计的涨跌），
       * `kind` 缺省即普通涨跌делта；显式 "total" 表示该条不是增量而是绝对
       * 合计检查点（渲染层从 0 画到 `value` 本身，不参与增量累加）。3-8
       * 条——末条非 "total" 时渲染层自动补一根合计柱（见 waterfall.tsx）。 */
      items: z
        .array(
          z
            .object({
              label: z.string(),
              value: z.number(),
              kind: z.enum(["delta", "total"]).optional(),
            })
            .strict()
        )
        .min(3)
        .max(8),
      /** 数值单位后缀（如「万」「%」），附加在每条数值标签之后，纯展示。 */
      unit: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("gantt"),
      /** 共享数值轴时间条：`start`/`end` 是同一条数轴上的数值（周序/月序/
       * 任意模型自定的单位），不解析日期字符串——轴界=所有条目 start 的最小
       * 值与 end 的最大值。2-8 条，每条 `end` 必须大于 `start`
       * （{@link GanttItemSchema} 的 `.refine`）。 */
      items: z.array(GanttItemSchema).min(2).max(8),
      /** 可选刻度标签，沿轴均匀分布展示（不必与 items 的 start/end 值对齐
       * ——纯展示刻度，如 ["W1","W2","W3","W4"]）。 */
      axis_labels: z.array(z.string()).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("pest"),
      /** 政治/经济/社会/技术——经典 2×2 PEST 宏观环境扫描。每槽 1-5 条，各槽
       * 自带可选 `title` 覆写（缺省用固定英文全称，见 pest.tsx）。 */
      political: PestQuadrantSchema,
      economic: PestQuadrantSchema,
      social: PestQuadrantSchema,
      technological: PestQuadrantSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("five_forces"),
      /** 波特五力——中心「竞争强度」+ 四向力量（新进入者/供应商议价力/买方
       * 议价力/替代品威胁）。五槽同构，`intensity` 对中心槽同样有意义（见
       * {@link FiveForcesPanelSchema}）。 */
      rivalry: FiveForcesPanelSchema,
      new_entrants: FiveForcesPanelSchema,
      supplier_power: FiveForcesPanelSchema,
      buyer_power: FiveForcesPanelSchema,
      substitutes: FiveForcesPanelSchema,
    })
    .strict(),
  // 值驱动数值网格家族（structure-components wave 2 task 2）：另一支满幅
  // 组件——形状由 x_labels/y_labels 两个具名数组直接推导（无独立 cols/rows
  // 字段，杜绝两套数字互相打架），values 矩形性用三条 `.refine` 校验
  // （行数=y_labels 长度、每行列数=x_labels 长度、可选 domain.max>=min）。
  // zod v4 下 `.refine()` 直接挂在 discriminatedUnion 成员对象上仍保留
  // `.shape`（经本任务实测确认，不同于 v3 的 ZodEffects 包装丢 `.shape`
  // 的旧顾虑——`GanttItemSchema` 当年绕开的那个坑在 v4 已不成立），因此这里
  // 不必像 gantt 的 refine 那样退一层塞进嵌套数组项，直接写在组件对象本身。
  z
    .object({
      type: z.literal("heatmap"),
      /** 列头（沿横轴，每列一个），1-10 项——1 项即单列热力图（病态但合法，
       * 见 heatmap.tsx 头注）。 */
      x_labels: z.array(z.string()).min(1).max(10),
      /** 行头（沿纵轴，每行一个），1-10 项——1 项即单行热力图。 */
      y_labels: z.array(z.string()).min(1).max(10),
      /** 值矩阵，行优先：`values[row][col]`。行数必须等于 y_labels 长度、
       * 每行列数必须等于 x_labels 长度（下方 `.refine`）——不接受锯齿数组。
       * 无正负号约束（负值合法业务数据，如同比降幅）。 */
      values: z.array(z.array(z.number())).min(1),
      /** 显式色阶值域覆写，缺省取 values 的真实 min/max。`min===max`
       * （退化域）合法——渲染层落回统一中间色调，不是 schema 层拒收的
       * 病态（见 heatmap.tsx 的 `valueT`）。`min>max`（真正的顺序错误）
       * 才是 schema 层拒收的对象（下方 `.refine`）。 */
      domain: z.object({ min: z.number(), max: z.number() }).strict().optional(),
      /** 每格叠加显示数值（原样 `String(value)`，不做千分位/小数位格式化——
       * 格式化留给未来任务，v1 范围内如实展示原始数字）。缺省不显示。 */
      show_values: z.boolean().optional(),
      /** 横轴/纵轴整体说明（如「季度」/「地区」），复用 chart.tsx 的
       * axes.x_title/y_title 拟合机制——与 x_labels/y_labels（每列/每行的
       * 具体刻度）是两个不同语义层，同时可选、互不依赖。 */
      x_title: z.string().optional(),
      y_title: z.string().optional(),
    })
    .strict()
    .refine((c) => c.values.length === c.y_labels.length, {
      message: "heatmap values row count must equal y_labels length (one row per y_label)",
      path: ["values"],
    })
    .refine((c) => c.values.every((row) => row.length === c.x_labels.length), {
      message: "heatmap every values row's length must equal x_labels length (one column per x_label)",
      path: ["values"],
    })
    .refine((c) => !c.domain || c.domain.max >= c.domain.min, {
      message: "heatmap domain.max must be greater than or equal to domain.min",
      path: ["domain"],
    }),
  // Sankey (structure-components wave 2 task 3) — see SankeyNodeSchema/
  // SankeyLinkSchema above for the shape rationale. Bounds: 2-16 nodes
  // (a single node has nothing to flow into/out of — `min(2)` is the
  // smallest graph with at least one real edge), 1-30 links. Both ceilings
  // are a render-geometry derivation, not an arbitrary round number: the
  // full-body content box is ~500-600px tall, `sankey.tsx`'s own
  // `MIN_NODE_H`+`NODE_GAP` floor keeps even the most-populated single layer
  // (worst case: every node lands in one layer, e.g. an all-disconnected
  // graph) legible up to about 16 stacked bars before they'd compress below
  // a readable minimum — the same "schema max = the largest shape the real
  // renderer keeps legible" discipline heatmap's 10x10 bound and gantt's
  // 2-8 item bound already establish. 30 links comfortably covers the
  // "dense crossing" topology the plan names as a required visual case
  // (e.g. a 4-layer, 4-node-per-layer diagram with every adjacent layer
  // pair fully connected is 4*4*3=48 possible edges, well above what a
  // legible band stack can carry) without inviting an unbounded array.
  z
    .object({
      type: z.literal("sankey"),
      nodes: z.array(SankeyNodeSchema).min(2).max(16),
      links: z.array(SankeyLinkSchema).min(1).max(30),
    })
    .strict()
    .superRefine((c, ctx) => {
      // 1. Unique node ids — a duplicated id makes every downstream
      // `links[].from`/`to` reference ambiguous (which node?), so this is
      // checked first and independently of the endpoint-existence check
      // below (a link referencing a duplicated id would otherwise "resolve"
      // against either occurrence, masking the real problem).
      const idCounts = new Map<string, number>()
      for (const n of c.nodes) idCounts.set(n.id, (idCounts.get(n.id) ?? 0) + 1)
      const duplicateIds = [...idCounts].filter(([, count]) => count > 1).map(([id]) => id)
      if (duplicateIds.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["nodes"],
          message: `sankey node ids must be unique — duplicated: ${duplicateIds.map((id) => `'${id}'`).join(", ")}`,
        })
      }

      // 2. Every link's from/to must reference a declared node id, and 3. no
      // self-loops (a node flowing into itself has no meaningful band
      // geometry — top/bottom of the same bar — so it's rejected outright
      // rather than special-cased at render time, plan task 3 item 1's
      // explicit "self-loops rejected with an actionable message"). Every
      // message below is single-quoted (never a raw `"` around an id).
      //
      // The endpoint-existence checks' `path` drills to the exact field
      // (`["links", i, "from"]`/`["links", i, "to"]`) — the self-loop
      // check's stays at `["links", i]`, since neither endpoint alone is
      // "wrong" there (both are equal, valid ids; it's the pair that's
      // rejected). This briefly used a workaround, now removed: the
      // browser-distribution e2e leg's `BARE_STATIC_IMPORT` scanner
      // (`scripts/e2e.mts`) used to do a raw text match with no notion of
      // string-literal context, so a compiled zod issue `path` array ending
      // in the literal element `"from"` collided with its bare-import scan
      // exactly like a minified `import x from"pkg"` would. Fixed at the
      // scanner (syntax-aware now — see that file's own doc comment), so
      // the natural, most-precise path is safe again and no longer needs to
      // route around a false positive one layer away from where it lives.
      const nodeIds = new Set(c.nodes.map((n) => n.id))
      const availableIds = [...nodeIds].map((id) => `'${id}'`).join(", ") || "(no nodes declared)"
      let hasStructuralLinkError = false
      c.links.forEach((link, i) => {
        if (link.from === link.to) {
          hasStructuralLinkError = true
          ctx.addIssue({
            code: "custom",
            path: ["links", i],
            message: `sankey link ${i} is a self-loop ('${link.from}' -> '${link.to}') — self-loops are not supported, remove this link or route the flow through an intermediate node instead`,
          })
        }
        if (!nodeIds.has(link.from)) {
          hasStructuralLinkError = true
          ctx.addIssue({
            code: "custom",
            path: ["links", i, "from"],
            message: `sankey link ${i}'s 'from' node id '${link.from}' is not declared in nodes — available: ${availableIds}`,
          })
        }
        if (!nodeIds.has(link.to)) {
          hasStructuralLinkError = true
          ctx.addIssue({
            code: "custom",
            path: ["links", i, "to"],
            message: `sankey link ${i}'s 'to' node id '${link.to}' is not declared in nodes — available: ${availableIds}`,
          })
        }
      })

      // 4. Cycle detection — sankey.tsx's layered layout requires a DAG
      // (layer = longest path from a source, undefined on a cycle). Only
      // runs once the graph is otherwise structurally sound (unique ids,
      // every endpoint resolved, no self-loop) — a dangling reference or
      // self-loop already produced its own actionable issue above, and
      // would make the adjacency walk below meaningless (a self-loop is
      // trivially "a cycle" but the message above is the more useful one).
      // See {@link findSankeyCycle}'s own doc comment for the algorithm and
      // determinism argument.
      if (duplicateIds.length > 0 || hasStructuralLinkError) return
      const adjacency = new Map<string, string[]>(c.nodes.map((n) => [n.id, [] as string[]]))
      for (const link of c.links) adjacency.get(link.from)!.push(link.to)

      const cyclePath = findSankeyCycle(c.nodes.map((n) => n.id), adjacency)
      if (cyclePath) {
        ctx.addIssue({
          code: "custom",
          path: ["links"],
          message: `sankey graph contains a cycle: ${cyclePath.join(" -> ")} — sankey layout requires a directed acyclic graph (DAG), break the cycle by removing or redirecting one of these links`,
        })
      }
    }),
], { error: componentTypeError })

/**
 * All 32 component `type` discriminant values, derived from `ComponentSchema`
 * itself (never hand-copied) so this list can't drift from the union above.
 * Typed as plain `readonly string[]` rather than `Component["type"][]` —
 * every consumer of this list (W5's plan `focus` vocabulary gate,
 * `src/plan/index.ts`) tests membership of an arbitrary author-supplied
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
    // 稳定页标识（W5 plan/assemble 注入，裸 IR 可省）。schema 层不做跨 slide
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
    // src/svg/effective-layout.ts。容量归 validate 密度门，不参与选型）。4 个图文接管 id
    // （image-split/image-top/image-bottom/image-annotate，原「图文范式族」
    // P3～2026-07-09 研究 ppt-master showcase 借鉴的 image_split/image_top/
    // image_bottom/image_annotate 四个 variant 值）的具体版式行为详见
    // registry.ts 对应条目，不在这里重复。
    layout: z.string().optional(),
    /**
     * Page-level rhythm hint (P1 variety wave, task 1 — additive v4 field,
     * spec's own beat vocabulary, `BEAT_VALUES`/`./narrative-values.ts`:
     * "anchor" | "dense" | "breathing"). **A selection-weight hint, not a
     * hard filter**: `resolveArchetypeId` (`svg/effective-layout.ts`)
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
     * (`PageSpecSchema.beat`, `src/plan/index.ts`) and carried through
     * `assembleDeck` into this exact field as of this task — previously a
     * spec-only authoring anchor dropped at assemble (see that module's own
     * doc comment history). Not confined to `type: "content"` at the schema
     * layer (same open posture as every other optional `Slide` field), but
     * only ever has a real weighting effect there in practice: every
     * `BEAT_TENDENCIES` entry (`svg/effective-layout.ts`) names only content
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
 * Exported so W5's plan schema (`src/plan/index.ts`) can reuse this exact
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
