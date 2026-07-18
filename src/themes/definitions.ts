import type { BrandConfig, Slide } from "@/ir"
import { PptfastError } from "../errors"
import type { MotifArchetypeId } from "../svg/archetypes/types"
import { getLayout, layoutsForSlideType } from "../svg/layouts/registry"
import { REGISTERED_THEMES } from "./registered-themes"
import type { StyleTokens } from "./tokens"
import { CANONICAL_THEME_IDS, THEME_STYLES, resolveThemeId, type CanonicalThemeId } from "./index"

/**
 * A theme = distributable bundle: `style` (style tokens) + `brand` (brand
 * chrome) + affinity tags (filled in W4).
 *
 * `id` is a plain `string`, not `CanonicalThemeId` — the 13 builtins satisfy
 * this (`CanonicalThemeId` is a subtype of `string`), but `registerTheme`
 * below (W3 task 4's SDK registration seam) must also accept ids outside that
 * closed union.
 */
export interface ThemeDefinition {
  id: string
  style: StyleTokens
  brand: BrandConfig
  tags: readonly string[]
  /**
   * 主题的「选择权」配置（spec §3 theme.layouts 命名裁决；W2 任务 2 由
   * src/themes/manifest.ts〔已删除〕的旧选择权类型原地迁居于此）——四页型
   * 各自允许哪些 archetype 参与自动选型。排印/色彩在 style，这里只放集合。
   * **W4 全集放开**（spec §3「缺省 = 全集，策展收窄塑造个性」，design
   * decision 7）：十三内置主题四页型默认均为 {@link fullArchetypeSet} 的
   * 全集。design decision 7/8 曾经的六处对比度策展排除（luxe/campaign/
   * classroom 的 content 排除 banner-heading、tech 的 cover/content、
   * consulting 的 chapter）已在 W4 fix round 随对比度自适应 ink helper
   * （`src/svg/ink.ts`）的根因修复全部撤销——目前仅剩 fix round 自身新发现
   * 的三处（bloom/classroom/heritage 的 chapter 排除 fashion-chapter，见
   * `CHAPTER_WITHOUT_FASHION` 的注释）。页型空集 = 该页型回落调用侧兜底
   * （十三主题四页型均非空，`definitions.test.ts` 锁死）。id 是通用
   * string（不再按页型区分 archetype id 联合类型）。
   */
  layouts: Record<Slide["type"], readonly string[]>
  /** Motif：单值，非 allowed-set（spec §3 示意）。undefined = 该主题无 motif 装饰（十三主题中 runway 留空，其余均已设）。 */
  motif?: MotifArchetypeId
}

/**
 * Every registered *archetype* layout id applicable to `slideType`, in
 * `LAYOUT_REGISTRY`'s own insertion order (W4, spec §3's curation default:
 * "layouts 主题引用的 layout 精选集...缺省 = 全集"). Takeover layouts are
 * excluded — `layoutsForSlideType("content")` also returns the 4 image
 * takeovers (their `slideTypes` includes `"content"` too), but a curated
 * auto-pick set may only ever contain archetypes (`registerTheme`'s own
 * validation below enforces the same constraint on any caller-supplied
 * set — takeovers are addressed only via an explicit `slide.layout` pin,
 * never auto-selected).
 */
function fullArchetypeSet(slideType: Slide["type"]): readonly string[] {
  return layoutsForSlideType(slideType)
    .filter((layout) => layout.kind === "archetype")
    .map((layout) => layout.id)
}

/** The full-set default for every slide type (W4) — one registry walk, shared by every builtin theme below and by `registerTheme`'s own per-slide-type default. */
const FULL_LAYOUTS: Record<Slide["type"], readonly string[]> = {
  cover: fullArchetypeSet("cover"),
  chapter: fullArchetypeSet("chapter"),
  content: fullArchetypeSet("content"),
  ending: fullArchetypeSet("ending"),
}

/**
 * The full chapter set minus `fashion-chapter` — three W4 fix-round
 * exclusions (bloom/classroom/heritage; see `LAYOUTS` entries below).
 * `chapter-fashion-chapter.tsx` (a runway-native archetype, untouched by
 * this task except an import-path move) already picks its own ink via
 * `readableOn(ctx.colors.accent)` — but `readableOn`'s fixed 0.4 luminance
 * threshold doesn't guarantee the 3:1 large-text ratio the way a strict
 * WCAG-derived cutoff (~0.3) would, for an accent color whose luminance
 * lands in the 0.3-0.4 gap. Full-matrix scanning found three themes whose
 * `colors.accent` falls there badly enough that the archetype's own
 * "CHAPTER NN" label and heading text (not just its already-adjudicated
 * decorative watermark digit — see `full-matrix-contrast.test.ts`'s
 * allowlist) measure under 3:1: bloom (`#D89A8E`, 2.35:1), classroom
 * (`#D89A88`, 2.36:1), heritage (`#C98A4B`, 2.91:1). `readableOn` itself is
 * out of this task's scope to redesign (it backs every other archetype that
 * already shipped with it, and the brief is explicit: adapt ink, don't
 * invent a new color policy) — curation is the fix per design decision 8's
 * standing rule ("策展是主动行为，禁止调阈值消音"), same disposition as
 * every other exclusion in this file. None of the three curated
 * `fashion-chapter` pre-W4 (only runway did), so this is a full-set-rollout
 * new exposure, not a regression on any previously-shipped pairing.
 */
const CHAPTER_WITHOUT_FASHION = FULL_LAYOUTS.chapter.filter((id) => id !== "fashion-chapter")

const BRANDS: Partial<Record<CanonicalThemeId, BrandConfig>> = {
  enterprise: { suppressFooterOnCardContent: true },
  ink: { suppressFooterRule: true },
}

/**
 * 每主题的 layouts + motif。**W4 全集放开**（spec §3「缺省 = 全集，策展收窄
 * 塑造个性」，design decision 7）：十三主题的 cover/chapter/content/ending
 * 均是 {@link FULL_LAYOUTS} 对应页型的全集，本表下面各条目因此不再需要逐
 * archetype 罗列——只保留仍然成立的策展叙事（motif/tokens 气质的由来）。
 * W2 任务 2～W4 之前的窄策展集（chapter=1、ending=1、content=2、cover=1-3）
 * 随本表一起退役：那段历史留在 git blame，不再复述于此。与 BRANDS 分开维护
 * 是因为这两块是全量 Record（十三主题每个都必须有非空 layouts），不像
 * BRANDS 那样是 Partial。
 *
 * **W4 fix round（design decision 8 的根因处置收官）**：design decision 7 的
 * 三处既有对比度裁定（luxe/campaign/classroom 的 content 排除
 * banner-heading）与本任务实现期新增的三处阳性裁定（tech 的 cover/content、
 * consulting 的 chapter）——共六处——全部源于同一枚缺陷模式：archetype 画在
 * 一块自己不控制（或自画但未检查明度）的背景上、baked 死一个文字色。fix
 * round 引入的对比度自适应 ink helper（`src/svg/ink.ts` 的
 * `readableOn`/`accessibleInk`）从根上修复了这枚缺陷，六处例外逐一用
 * `auditDeck` 复核（对应 archetype 现在自适应取色）后确认全部转为可读，予以
 * 撤销——`LAYOUTS` 现在是十三主题的纯 {@link FULL_LAYOUTS} 全集（A 方案纯
 * 终态），不再有任何 content/cover/chapter 排除残留于这六处。
 *
 * 唯一剩余的排除是 fix round 全矩阵扫描（`full-matrix-contrast.test.ts`）
 * 新发现的一类：runway 专属 `fashion-chapter`/`fashion-masthead`/
 * `fashion-ending` archetype 家族早在 2026-07-10 就自带
 * `readableOn(ctx.colors.accent/primary)` 自适应取色（这是 fix round 提炼
 * 的同一个 helper 的既有消费者，非本任务新写），但 `readableOn` 的固定
 * 0.4 明度阈值不是严格 WCAG 意义上的 3:1 保证（真正的分界约 0.3）——对
 * 少数主题的 accent/primary 明度恰好落在这个 0.3-0.4 缝隙，选中的中性色
 * 仍然达不到 3:1。`readableOn` 本身不在本任务改动范围（brief 明确：自适应
 * 取色不发明新策略，这个函数早已服务其它 archetype），故按同一策展惯例处置
 * ——见 {@link CHAPTER_WITHOUT_FASHION} 的注释。
 */
const LAYOUTS: Record<CanonicalThemeId, Pick<ThemeDefinition, "layouts" | "motif">> = {
  consulting: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "banner-motif",
  },
  insight: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "poster-motif",
  },
  academic: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "rail-motif",
  },
  tech: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "constellation-motif",
  },
  // runway（时尚杂志，2026-07-10 拆分）：冲击力=超大排印+满版色块（检索背书），
  // fashion-masthead/fashion-chapter/fashion-ending 是 runway 专属新表达。
  // journal 与其共享 masthead 报头家族但 tokens 气质大变。
  runway: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    // motif 刻意不配（2026-07-10 全覆盖时曾加「时尚编辑标记」，两版均被
    // 用户裁难看后撤销）：runway 的语言=满版色块+超大排印+留白，排印至上是
    // 终审裁决——十三主题中唯一留空 motif 的一个。
  },
  // journal（人文期刊，原 magazine 改名）：masthead 报头家族，角饰是人文感。
  journal: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "corner-ornament-motif",
  },
  // enterprise（原 custom→gallery 二次返工，2026-07-10）：白墙+正 IKB+炸橘的
  // 高色彩版式组合，banner 横幅 baked 白字在 IKB #002FA7 上对比充足（无需
  // 排除 banner-heading）。
  enterprise: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    // 2026-07-10 motif 全覆盖：IKB 方块秩序
    motif: "enterprise-motif",
  },
  // luxe（原 retail 黑金重定位，2026-07-10）：黑金深底 poster 家族，
  // readableOn 出深字。
  luxe: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    // 2026-07-10 motif 全覆盖：烫金细线（原 P3「motif 可选」验证品，补齐）
    motif: "luxe-motif",
  },
  // campaign（活力营销，2026-07-13 memphis 拆分 A）：深紫底多彩笔刷由专属
  // campaign-motif 承载。
  campaign: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "campaign-motif",
  },
  // classroom（教学课堂，2026-07-13 第 13 主题）：莫兰迪灰调+平滑斑块手绘
  // 点线由专属 classroom-motif 承载。**chapter 排除 fashion-chapter**：见
  // CHAPTER_WITHOUT_FASHION 的注释（W4 fix round 新发现，非 design
  // decision 7/8 原有六处之一）。
  classroom: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: CHAPTER_WITHOUT_FASHION, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "classroom-motif",
  },
  // bloom（柔美庆典，2026-07-13 memphis 拆分 B）：奶白底水彩晕染+植物细线由
  // 专属 bloom-motif 承载。**chapter 排除 fashion-chapter**：见
  // CHAPTER_WITHOUT_FASHION 的注释。
  bloom: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: CHAPTER_WITHOUT_FASHION, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "bloom-motif",
  },
  // ink（水墨国风，2026-07-10 真创意子类②，用户点名例子）：宣纸/墨/朱砂/
  // 楷体靠 tokens + 专属 ink-motif（古籍版框+朱砂印章+淡墨远山）。
  ink: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "ink-motif",
    // ink-motif 自带古籍版框线，BrandChrome 的页脚分隔线会形成双线
    // （2026-07-10 用户截图指出）——style 的 brand.suppressFooterRule
    // 抑制该分隔线（W1 从这里的 chrome 拆到 themes/definitions.ts），meta 文字照排。
  },
  // heritage（第 8 主题，2026-07-10）：勃艮第×焦糖 putty 浅底混搭，酒红横幅
  // 上 baked 白字对比充足。**chapter 排除 fashion-chapter**：见
  // CHAPTER_WITHOUT_FASHION 的注释。
  heritage: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: CHAPTER_WITHOUT_FASHION, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    // 2026-07-10 motif 全覆盖：典藏纹饰（徽记/角花/页缘线）
    motif: "heritage-motif",
  },
}

export const THEME_DEFINITIONS: Record<CanonicalThemeId, ThemeDefinition> = Object.fromEntries(
  CANONICAL_THEME_IDS.map((id) => [
    id,
    {
      id,
      style: THEME_STYLES[id],
      brand: BRANDS[id] ?? {},
      tags: [] as const,
      layouts: LAYOUTS[id].layouts,
      motif: LAYOUTS[id].motif,
    },
  ]),
) as unknown as Record<CanonicalThemeId, ThemeDefinition>

/** Theme brand config + optional IR-level override (shallow merge, override wins). */
export function resolveBrand(id: string, override?: BrandConfig): BrandConfig {
  const base = getThemeDefinition(id).brand
  return override ? { ...base, ...override } : base
}

// ── Theme registration seam (W3 task 4, spec §4/roadmap "theme ecosystem")
// ─────────────────────────────────────────────────────────────────────────
//
// This is deliberately *not* the v0.4 registry protocol (no distribution,
// no manifest fetch, no `pptfast theme add <url>`) — just the runtime SDK
// seam a v0.4 registry client (or any embedder) would call into: hand
// `registerTheme` a fully-formed `ThemeDefinition` and it becomes visible to
// every internal theme lookup (installed-check, selection, resolveStyle,
// resolveBrand) exactly like a builtin, with no second code path.

const REGISTERABLE_SLIDE_TYPES: readonly Slide["type"][] = ["cover", "chapter", "content", "ending"]

/**
 * `registerTheme`'s input shape (W4, spec §3 "缺省 = 全集"): identical to
 * {@link ThemeDefinition} except `layouts` is optional, and — when present —
 * each of its four slide-type entries is independently optional too. A
 * slide type this theme doesn't narrow (its own key omitted, or the whole
 * `layouts` object omitted) defaults to that type's full registered-
 * archetype set ({@link FULL_LAYOUTS}) — the exact same default every
 * builtin theme in `LAYOUTS` above resolves to for a slide type it doesn't
 * curate away from. `getThemeDefinition`/`REGISTERED_THEMES` still only ever
 * hold the fully-resolved `ThemeDefinition` shape (`layouts` total over all
 * four types) — `registerTheme` performs the defaulting once, here, so
 * every downstream reader (`resolveArchetypeId` foremost) can keep assuming
 * a total record and never re-derive "was this slide type curated or
 * defaulted".
 */
export type ThemeRegistration = Omit<ThemeDefinition, "layouts"> & {
  layouts?: Partial<Record<Slide["type"], readonly string[]>>
}

/**
 * Register a theme at runtime (SDK seam, not the v0.4 distribution
 * protocol). Validates just enough to keep the render chain from silently
 * breaking on a malformed registration — not a full schema:
 *
 * - `id` must not collide with a builtin or an already-registered theme.
 * - each of the four slide types, once defaulted ({@link ThemeRegistration}),
 *   must have at least one layout id that is both registered in
 *   `LAYOUT_REGISTRY` and valid for that slide type (the same registry
 *   `resolveArchetypeId`/`FullSlideSvg` select from — a theme never ships
 *   new render code, only a curated subset of the existing 30 archetypes +
 *   4 takeovers, per `docs/architecture.md`'s "Adding a theme" section). An
 *   *explicit* empty array for a slide type still fails this check (the
 *   default only kicks in when the key — or `layouts` itself — is omitted
 *   entirely, `undefined`, never for a caller-supplied `[]`).
 * - `style` must be present (a JS caller can bypass the TS type).
 *
 * Once registered, the theme participates in `getInstalledThemeIds`,
 * `getThemeDefinition` (hence `effective-layout.ts`/`FullSlideSvg`'s
 * selection and `resolveBrand`), and `themes/index.ts`'s `resolveStyle` —
 * every internal theme lookup, with no separate "registered theme" branch
 * for callers to remember.
 */
export function registerTheme(def: ThemeRegistration): void {
  if ((CANONICAL_THEME_IDS as readonly string[]).includes(def.id) || REGISTERED_THEMES.has(def.id)) {
    throw new PptfastError(`theme "${def.id}" is already installed`)
  }
  if (!def.style) {
    throw new PptfastError(`theme "${def.id}" is missing style tokens`)
  }
  const layouts = {} as Record<Slide["type"], readonly string[]>
  for (const slideType of REGISTERABLE_SLIDE_TYPES) {
    const ids = def.layouts?.[slideType] ?? FULL_LAYOUTS[slideType]
    if (ids.length === 0) {
      throw new PptfastError(`theme "${def.id}" must declare at least one layout for "${slideType}" slides`)
    }
    for (const id of ids) {
      const layout = getLayout(id)
      if (!layout) {
        throw new PptfastError(`theme "${def.id}" layouts.${slideType} references unknown layout id "${id}"`)
      }
      // Curated sets feed the auto-selection path, which assumes archetype ids
      // only — a takeover id here would crash at render (undefined component).
      if (layout.kind !== "archetype") {
        throw new PptfastError(
          `theme "${def.id}" layouts.${slideType}: "${id}" is a ${layout.kind} layout — curated sets may only contain archetype layouts`,
        )
      }
      if (!layout.slideTypes.includes(slideType)) {
        throw new PptfastError(
          `theme "${def.id}" layouts.${slideType}: layout "${id}" is not valid for "${slideType}" slides`,
        )
      }
    }
    layouts[slideType] = ids
  }
  REGISTERED_THEMES.set(def.id, { ...def, layouts })
}

/** Every installed theme id: the 13 builtins, then registered themes in registration order. */
export function getInstalledThemeIds(): readonly string[] {
  return [...CANONICAL_THEME_IDS, ...REGISTERED_THEMES.keys()]
}

/**
 * Resolve a theme id to its full definition — a registered theme first, then
 * the builtin fallback (`THEME_DEFINITIONS[resolveThemeId(id)]`, which itself
 * folds an unrecognized id to consulting). The one lookup every internal
 * consumer that used to read `THEME_DEFINITIONS[resolveThemeId(id)]`
 * directly (`effective-layout.ts`, `FullSlideSvg.tsx`) now calls instead, so
 * a registered theme's curated layouts actually drive selection end-to-end.
 */
export function getThemeDefinition(id: string): ThemeDefinition {
  return REGISTERED_THEMES.get(id) ?? THEME_DEFINITIONS[resolveThemeId(id)]
}

/**
 * Test-only: clear every registered theme. Deliberately not exported from
 * `src/index.ts` (the public SDK barrel) — a `__`-prefixed, clearly
 * test-only name signals the same at the call site.
 */
export function __resetRegisteredThemes(): void {
  REGISTERED_THEMES.clear()
}
