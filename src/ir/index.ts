import { z } from "zod"
import { PPTX_ICON_NAMES } from "@/icons"

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

const MetaSchema = z
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

const AssetsSchema = z
  .object({ images: z.record(z.string(), AssetSchema).default({}) })
  .strict()

const BrandSchema = z
  .object({
    logo_asset_id: z.string().optional(),
    position: z.enum(["tl", "tr", "bl", "br"]).optional(),
  })
  .strict()

// ── Components（24 种）──

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
      icon: z.enum(PPTX_ICON_NAMES).optional(),
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
            icon: z.enum(PPTX_ICON_NAMES).optional(),
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
              icon: z.enum(PPTX_ICON_NAMES),
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
              icon: z.enum(PPTX_ICON_NAMES).optional(),
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
      icon: z.enum(PPTX_ICON_NAMES).optional(),
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
])

// ── Slide ──

const SlideSchema = z
  .object({
    type: z.enum(["cover", "chapter", "content", "ending"]).default("content"),
    // Layout registry id（archetype 或 takeover 皆可，src/svg/layouts/registry.ts
    // 的 LAYOUT_REGISTRY 键）。schema 层是开放 string——已注册 + slideTypes 适用
    // 是 validateIr 的硬门（api.ts，报错带可用清单与页号），同 theme.id「schema
    // 开放、validate 收口」的分层哲学（spec §6）。省略 = resolveArchetype 按
    // 主题 allowed 集 + deck seed 自动轮换选型。4 个图文接管 id
    // （image-split/image-top/image-bottom/image-annotate，原「图文范式族」
    // P3～2026-07-09 研究 ppt-master showcase 借鉴的 image_split/image_top/
    // image_bottom/image_annotate 四个 variant 值）的具体版式行为详见
    // registry.ts 对应条目，不在这里重复。
    layout: z.string().optional(),
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
  })
  .strict()

// ── 顶层 IR ──

export const PptxIRSchema = z
  .object({
    version: z.literal("3").default("3"),
    filename: z.string().default("presentation"),
    theme: ThemeSchema.default({ id: "consulting" }),
    meta: MetaSchema.default({}),
    assets: AssetsSchema.default({ images: {} }),
    brand: BrandSchema.optional(),
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
