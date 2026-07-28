import type { BackgroundSpec, BrandConfig, Slide } from "@/ir"
import { PptfastError } from "../errors"
import type { MotifArchetypeId } from "../svg/motifs/types"
import { hasExactWidthTable, resolveFontFace } from "../svg/fonts"
import { contrastRatio } from "../svg/ink"
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
   * （`src/svg/ink.ts`）的根因修复全部撤销。fix round 自身新发现的三处
   * （bloom/classroom/heritage 的 chapter 排除 fashion-chapter）也已在
   * post-v0.3 W8 fix round 随 `readableOn` 两墨实测对比度取优的根因修复一并
   * 撤销（backlog item 2）——十三主题四页型现在均为不折不扣的全集，无任何
   * 排除残留。页型空集 = 该页型回落调用侧兜底（十三主题四页型均非空，
   * `definitions.test.ts` 锁死）。id 是通用 string（不再按页型区分
   * archetype id 联合类型）。
   */
  layouts: Record<Slide["type"], readonly string[]>
  /** Motif：单值，非 allowed-set（spec §3 示意）。undefined = 该主题无 motif 装饰（十三主题中 runway 留空，其余均已设）。 */
  motif?: MotifArchetypeId
  /**
   * A theme's own structural personality (theme-structure wave, task T1 —
   * `.issues/2026-07-26-theme-structure/plan.md`'s 控制器设计裁定 2): per
   * page type, the archetype ids this theme's author wants `resolveArchetypeId`
   * (`src/svg/layout-selection.ts`) to lean toward. Shape mirrors
   * `StrategyDefinition.layoutTendencies` (`@/narrative`) — the same "named
   * ids get a soft weight bump, everyone else stays at the floor" contract —
   * but declared **per slide type** rather than content-only: a strategy's
   * `layoutTendencies` is content-only, so on cover/chapter/ending a theme
   * competes only with `StrategyDefinition.identityTendencies` (which
   * `tendencyIdsFor` does consult for those three types — an earlier draft
   * of this comment wrongly claimed no strategy signal reached them at all).
   * **Consequence worth knowing when declaring:** because `weightOf`
   * composes via `Math.max`, a theme tendency naming an id the active
   * strategy's `identityTendencies` already names adds no differential pull
   * for that id under that strategy (max(3,3) = 3) — a theme's structural
   * character therefore reads most clearly on ids the strategies do not
   * already favor. Content can carry both a strategy tendency
   * and a theme tendency at once; `weightOf` composes every live layer via
   * `Math.max`, never multiplication (same ruling `BEAT_TENDENCY_WEIGHT`'s
   * doc comment already argues for: agreement between layers corroborates
   * the same preference dimension, it does not square the pull).
   *
   * **Soft weight, not a whitelist — `layouts` above stays the one hard
   * boundary.** A slide type's candidate pool is built from `layouts[slideType]`
   * *before* any tendency is ever consulted (`resolveArchetypeId`'s own
   * `pool` construction), so an id this record names for a page type it is
   * not also present in that same page type's `layouts` set can never be
   * scored — it is invisible to `weightOf`, not merely down-weighted. That
   * silent no-op is exactly why it counts as a theme-author mistake rather
   * than a legal (if unusual) declaration — `definitions.test.ts`'s
   * consistency sweep over the 13 builtins, and `registerTheme`'s own
   * validation below for any future custom theme, both fail loudly the
   * moment a `layoutTendencies` entry names an id outside its own page
   * type's `layouts` set, so the mistake surfaces at registration/test time
   * instead of silently doing nothing at render time.
   *
   * Optional at every level (the whole field, and independently each of its
   * four page-type entries) — **omission is not a lesser default, it is
   * today's exact behavior**: a page type this record doesn't cover (key
   * absent, or the field itself `undefined`) contributes a uniform weight of
   * 1 to every candidate, the same "no theme-layer opinion" no-op floor
   * `beatTendencies === undefined` already gives beat. None of the 13
   * builtins declare this field yet (theme-structure wave task T1 is the
   * mechanism only — task T2 is where individual builtins pick up a
   * personality), so every one of them renders byte-identically to before
   * this field existed.
   */
  layoutTendencies?: Partial<Record<Slide["type"], readonly string[]>>
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
 * Formerly "the full chapter set minus `fashion-chapter`" — three W4
 * fix-round exclusions (bloom/classroom/heritage), **reverted** in the
 * post-v0.3 W8 fix round (backlog item 2,
 * `.issues/notes/engineering-history.md` #2) now that the root cause
 * is actually fixed. History, for the git-blame reader:
 * `chapter-fashion-chapter.tsx` already picked its own ink via
 * `readableOn(ctx.colors.accent)`, but `readableOn`'s old fixed-0.4-luminance
 * threshold didn't guarantee the 3:1 large-text ratio the way comparing both
 * inks' real contrast does — bloom (`#D89A8E`), classroom (`#D89A88`),
 * heritage (`#C98A4B`) all have an accent luminance in the old threshold's
 * blind gap (~0.19-0.4), where white ink measured under 3:1 (bloom 2.35,
 * classroom 2.36, heritage 2.91) even though dark ink was always the better
 * option there. `readableOn` now compares both inks' actual contrast and
 * picks the higher one (`src/svg/ink.ts`) — re-measured post-fix (`pnpm exec
 * tsx` against a real render of all three, 2026-07-19): dark ink measures
 * 8.23:1 (bloom), 8.19:1 (classroom), 6.65:1 (heritage) against the same
 * accent colors, and `auditDeck` reports zero low-contrast findings for the
 * heading/"CHAPTER NN" label on all three — comfortably above 3:1, so the
 * curation workaround is no longer needed. (The decorative watermark digit's
 * own already-adjudicated sub-3:1 blend — `full-matrix-contrast.test.ts`'s
 * ratio-banded allowlist entry — is unaffected: its post-fix ratios, 1.537/
 * 1.537/1.498, still land inside that entry's existing [1.2, 1.8] band.)
 * `LAYOUTS` below now gives all 13 themes the plain {@link FULL_LAYOUTS.chapter}
 * — no remaining exclusion of any kind in this file.
 */

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
 * fix round 全矩阵扫描曾额外发现一类——bloom/classroom/heritage 的 chapter
 * 排除 `fashion-chapter`（`readableOn(ctx.colors.accent)` 固定 0.4 明度阈值
 * 对这三个主题的 accent 色不够精确，产出 <3:1）——但这处排除已在 post-v0.3
 * W8 fix round（backlog item 2，`readableOn` 改为两墨实测对比度取优）随根因
 * 一起撤销：三个主题重测后的 accent-ink 对比度分别是 8.23:1/8.19:1/6.65:1，
 * `auditDeck` 复核零 low-contrast 发现。`LAYOUTS` 现在是十三主题不折不扣的
 * {@link FULL_LAYOUTS} 全集，四页型均无任何例外残留。
 */
const LAYOUTS: Record<CanonicalThemeId, Pick<ThemeDefinition, "layouts" | "motif" | "layoutTendencies">> = {
  consulting: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "banner-motif",
    // Theme-structure wave, task T2: consulting's own motif is
    // `banner-motif`, and `banner-title`/`banner-chapter`/`banner-ending`
    // are verbatim extractions of consulting's own predecessor render code
    // (`MckinseyNavyCover`/`Chapter`/`Ending`, see each archetype file's own
    // header) — this is the theme's native "assertion banner" register, not
    // a borrowed one.
    layoutTendencies: {
      cover: ["banner-title"],
      chapter: ["banner-chapter"],
      ending: ["banner-ending"],
    },
  },
  insight: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "poster-motif",
    // Theme-structure wave, task T2: insight's own motif is `poster-motif`,
    // and `poster-center`/`poster-chapter`/`poster-ending` are verbatim
    // extractions of insight's own predecessor creative.tsx render code
    // (`EditorialDarkCover`/`Chapter`/`Ending`) — matches the
    // Bloomberg/Economist-style bold, information-forward register this
    // theme's own token comment names ("原 creative 改名...其实是
    // Bloomberg/Economist 财经信息图风").
    layoutTendencies: {
      cover: ["poster-center"],
      chapter: ["poster-chapter"],
      ending: ["poster-ending"],
    },
  },
  academic: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "rail-motif",
    // Theme-structure wave, task T2: academic's own motif is `rail-motif`,
    // and `left-anchor`/`rail-chapter`/`rail-ending` are verbatim
    // extractions of academic's own predecessor render code
    // (`BCGEmeraldCover`/`Chapter`/`Ending`) — this theme's native
    // color-block-plus-progress-rail register.
    layoutTendencies: {
      cover: ["left-anchor"],
      chapter: ["rail-chapter"],
      ending: ["rail-ending"],
    },
  },
  tech: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "constellation-motif",
    // Theme-structure wave, task T2: tech's own motif is
    // `constellation-motif`, and `constellation`/`constellation-chapter`/
    // `constellation-ending` are verbatim extractions of tech's own
    // predecessor render code (`BentoTechCover`/`Chapter`/`Ending`) — this
    // theme's native visual family, not a borrowed one.
    layoutTendencies: {
      cover: ["constellation"],
      chapter: ["constellation-chapter"],
      ending: ["constellation-ending"],
    },
  },
  // runway（时尚杂志，2026-07-10 拆分）：冲击力=超大排印+满版色块（检索背书），
  // fashion-masthead/fashion-chapter/fashion-ending 是 runway 专属新表达。
  // journal 与其共享 masthead 报头家族但 tokens 气质大变。
  runway: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    // motif 刻意不配（2026-07-10 全覆盖时曾加「时尚编辑标记」，两版均被
    // 用户裁难看后撤销）：runway 的语言=满版色块+超大排印+留白，排印至上是
    // 终审裁决——十三主题中唯一留空 motif 的一个。
    // Theme-structure wave, task T2: `fashion-masthead`/`fashion-chapter`/
    // `fashion-ending` were built exclusively for runway (2026-07-10, pure
    // new writes, extreme-scale full-bleed typography) — with no motif of
    // its own, this archetype family is runway's only structural signature
    // beyond token colors.
    layoutTendencies: {
      cover: ["fashion-masthead"],
      chapter: ["fashion-chapter"],
      ending: ["fashion-ending"],
    },
  },
  // journal（人文期刊，原 magazine 改名）：masthead 报头家族，角饰是人文感。
  journal: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "corner-ornament-motif",
    // Theme-structure wave, task T2: journal's own motif is
    // `corner-ornament-motif` (editorial ornamentation), and
    // `editorial-masthead`/`masthead-chapter`/`masthead-ending` are verbatim
    // extractions of journal's own predecessor magazine.tsx render code
    // (`EditorialSerifCover`/`Chapter`/`Ending`) — this theme's native
    // masthead register.
    layoutTendencies: {
      cover: ["editorial-masthead"],
      chapter: ["masthead-chapter"],
      ending: ["masthead-ending"],
    },
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
  // 点线由专属 classroom-motif 承载。chapter 曾排除 fashion-chapter（W4 fix
  // round 新发现），post-v0.3 W8 fix round 随 readableOn 根因修复一起撤销
  // ——见上方 LAYOUTS 块注释。
  classroom: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "classroom-motif",
  },
  // bloom（柔美庆典，2026-07-13 memphis 拆分 B）：奶白底水彩晕染+植物细线由
  // 专属 bloom-motif 承载。chapter 曾排除 fashion-chapter，post-v0.3 W8 fix
  // round 撤销——见上方 LAYOUTS 块注释。
  bloom: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
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
  // 上 baked 白字对比充足。chapter 曾排除 fashion-chapter，post-v0.3 W8 fix
  // round 撤销——见上方 LAYOUTS 块注释。
  heritage: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    // 2026-07-10 motif 全覆盖：典藏纹饰（徽记/角花/页缘线）
    motif: "heritage-motif",
  },
  // pulse（医疗健康/生命科学，2026-07-28 themes-16 wave task T1，第 14 主题）：
  // 极浅薄荷白底+深青绿主色的清洁诊疗气质，细脉搏线+胶囊/细胞圆点簇由专属
  // pulse-motif 承载。pulse 没有 legacy 预兆代码可提炼（不像 academic/tech
  // 等六个既有声明主题那样有自己的原生 archetype 家族——那六家各自占用
  // cover/chapter/ending 三池里互不重叠的一整个「家族」：banner/poster/
  // rail/constellation/fashion/masthead），layoutTendencies 因此从通用
  // archetype 池里挑选气质相符的 id（plan 裁定 3）：
  //   - cover `split-diagonal`：primary 色块以硬斜切线收边，标题在净空区
  //     跨近斜切线——一道果断的斜切像心电图尖峰的陡直落笔，呼应 pulse 自己
  //     的脉搏节律气质，同时是 P3「新表达」archetype，不与任何既有声明
  //     主题的 cover 家族重合（重合仅 strategy 层的 instructional 一家，
  //     不与默认 briefing 重合）。
  //   - chapter `tone-adaptive-chapter`：居中大标题+右下角编号水印，朴素
  //     无花哨——`narrative/index.ts` 里明确"从不出现在任何 strategy 的
  //     identityTendencies 字段里"的三个"万金油" identity archetype 之一
  //     （该文件自己的文档用语），pulse 在它上面永远拿到满额差异化权重，
  //     零 strategy 重合。
  //   - ending `banner-ending`："联系"区块+版权行的务实收尾——生物医药 BD/
  //     诊所品牌很自然需要一条联系方式收尾。重合 instructional/briefing
  //     两家（三选一里代价最小：cover/chapter 已经零重合，ending 让一步）。
  // 实测校验（`theme-structure.test.ts` 的"每个声明主题的 resolveSequence
  // 两两不同"）：weightedPickBySeed 的候选池抽签值只取决于 (seed,
  // pageKey)、与 theme id 无关——两个主题若对同一页型声明完全相同的单一
  // tendency id，会在该页型上产出完全相同的选中结果（非小概率巧合，是
  // weightedPickBySeed 的确定性推论）。左侧色块+留白（left-anchor）、
  // 底部进度点轨（rail-chapter）等更"显然贴题"的候选逐一试过，但它们已是
  // academic 自己的 cover/chapter 声明，会在 fixture 固定 IR 的 seed=1 上
  // 与 academic 撞出字节相同的 7 页序列（brute-force 扫过 cover×chapter×
  // ending 全部 448 组合验证，仅 160 组不与既有 6 个声明主题碰撞）——上面
  // 三选是其中同时兼顾气质贴合、strategy 零/低重合、且实测通过的一组。
  pulse: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "pulse-motif",
    layoutTendencies: {
      cover: ["split-diagonal"],
      chapter: ["tone-adaptive-chapter"],
      ending: ["banner-ending"],
    },
  },
  // terra（可持续/ESG，2026-07-28 themes-16 wave task T2，第 15 主题）：
  // 沙色底+橄榄绿主色的朴素大地气质，等高线+叶脉/种子点由专属 terra-motif
  // 承载。同 pulse 一样没有 legacy 预兆代码可提炼，layoutTendencies 从通用
  // archetype 池里挑（plan 裁定 3）——挑选时先盘点 8 个既有声明主题（含
  // pulse）已经用掉的 id：cover 池 8 个 id 里 7 个已被声明（banner-title/
  // poster-center/left-anchor/constellation/fashion-masthead/editorial-
  // masthead/split-diagonal），ending 池 7 个里 6 个已被声明（banner-ending/
  // poster-ending/rail-ending/constellation-ending/fashion-ending/masthead-
  // ending）——两池各自只剩一个从未被任何主题声明过的 id：
  //   - cover `tone-adaptive-header`：唯一零主题重合的 cover id，同时是
  //     `narrative/index.ts` 里"从不出现在任何 strategy 的 identityTendencies
  //     字段里"的万金油 identity archetype——自适应留白的克制封面，恰好呼应
  //     terra「朴素、根系」气质里"朴素"的那一半：不靠硬构图抢眼，靠底色和
  //     motif 本身的地形线说话。
  //   - ending `tone-adaptive-ending`：唯一零主题重合的 ending id，同 cover
  //     一样是万金油 identity archetype，零 strategy 重合——"长期主义"收尾
  //     不需要一句响亮的收官宣言，克制留白比横幅更贴题。
  //   - chapter 轴刻意不声明：masthead-chapter 落在 strategy `briefing` 的
  //     identityTendencies.chapter 里，默认 strategy 下 max(3,3)=3，声明它
  //     不产生任何边际权重；它同时是 journal 已声明的 chapter id，声明了也
  //     只是重复 journal 在 chapter 轴上的性格。剩下能让完整序列岔开的选项
  //     （见上一版注释的 brute-force 结果）都要么撞权重、要么撞别的主题
  //     已声明的轴，没有一个能不靠这两种代价拿到区分度——没有区分度的声明
  //     就是噪音，裁剪（Partial 只声明 cover/ending）比硬凑一个更诚实。
  // 实测校验（`theme-structure.test.ts` 的"每个声明主题的 resolveSequence
  // 两两不同"）：terra 的完整 resolveSequence 靠 cover/ending 两个万金油 id
  // 已经与其余 7 个既有声明主题（含 pulse）逐一比对均不同，也不与 7 个未声明
  // 主题共享的默认序列相同，chapter 轴不需要额外声明来撑区分度。
  terra: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "terra-motif",
    layoutTendencies: {
      cover: ["tone-adaptive-header"],
      ending: ["tone-adaptive-ending"],
    },
  },
  // ember（创业路演/暖色能量，2026-07-28 themes-16 wave task T3，第 16、
  // 本波最后一个主题）：暖白底+火橙主色的明快上升气质，上升火花由专属
  // ember-motif 承载。task T3 brief 明确警告：找"没人用过的 id"这条路在
  // cover/ending 两个轴上已经走绝——terra 落地后 cover 池 8 个 id 已全部被
  // 既有声明主题占用（banner-title/left-anchor/poster-center/constellation/
  // fashion-masthead/editorial-masthead/split-diagonal/tone-adaptive-
  // header），ending 池 7 个也已全占（masthead-ending/constellation-ending/
  // rail-ending/banner-ending/poster-ending/tone-adaptive-ending/fashion-
  // ending 的等价重合形态），chapter 池仅剩 roman-chapter 未被声明过。ember
  // 因此不找"未占用 id"，改用 brief 指定的工具：复用 id + 组合交互 +
  // 部分声明。
  //
  // 实测穷举（`resolveArchetypeId` 直连，同 T2 terra 的 brute-force 方法，
  // 脚本临时写在仓库外未入库）：先按气质从每轴挑 2-3 个候选——cover
  // {fashion-masthead, poster-center, split-diagonal}（满版色块/居中海报/
  // 硬切对角，都读"发布感"）、chapter {fashion-chapter, poster-chapter,
  // rail-chapter}（杂志感章节标/自信里程碑数字/进度点轨，都读"上升/推进"）、
  // ending {fashion-ending, constellation-ending, banner-ending}（响亮
  // 收官/"Thank you."签名条/联系方式）。逐一用 theme-structure.test.ts 同款
  // fixture（seed=1）实测发现：**该 fixture 上 8 个 cover id 的单声明只
  // 收敛到 2 个可达结果**（banner-title 或 poster-center——briefing 默认
  // strategy 自己已把 banner-title/poster-center 权重锁到 3，任何主题
  // 声明的第三个 id 只是把总权重从 12 抬到 14，被同一个固定哈希目标值
  // 打进同一个 poster-center 桶，声明具体是哪个 id 不影响这一结果）；chapter
  // 同理只收敛到 2 个结果（masthead-chapter 或 fashion-chapter，8 个非
  // masthead/constellation 的单声明全部落在 fashion-chapter，含 roman-
  // chapter——T3 brief 转述的"roman-chapter 与 runway 全组合撞车"结论就是
  // 这枚硬币的另一面：声明 roman-chapter 与声明 rail-chapter/banner-chapter/
  // fashion-chapter 等价，都收敛到 fashion-chapter，不是 roman-chapter 本身
  // 有什么特殊之处）；ending 收敛到 3 个结果（masthead-ending/banner-ending/
  // poster-ending）。8 declared + undeclared 控制组在这套 (cover, chapter,
  // ending) 三元组空间里已经占满 12 种可达组合里的 9 种，只剩 3 种未被
  // 使用，全部要求 cover 落在 banner-title（即 cover 轴不声明或声明一个
  // 与 briefing 完全打平的零边际权重 id——两者对这枚 fixture 而言等价）。
  //
  // 结论：cover 轴对本主题没有任何真实分化空间——声明它要么是零边际权重
  // 的空动作（同 terra 修复前 masthead-chapter 的教训：declare 与不 declare
  // 字节相同），要么把结果推进已经 6/8 主题挤占的 poster-center 桶，两条
  // 路都不产生区分度，因此**刻意不声明 cover**（Partial 裁剪，terra 先例
  // 的同一处理，这次轮到 cover 轴让步）。chapter/ending 两轴改为服务两个
  // 目的：(a) 挑到未被使用的三元组之一，(b) 气质对得上——最终选
  // chapter `rail-chapter`（进度点轨，"pitch deck 里程碑推进"的具象读法，
  // 呼应"上升"气质；复用 academic 的声明 id，但 academic 是 BCG 绿的
  // 咨询进度轨，ember 是橙色发布倒计时式的进度轨，同一构图两种气质）+
  // ending `constellation-ending`（"Thank you."+accent 句号+签名条，干脆
  // 自信的收尾，呼应"发布感"；复用 tech 的声明 id，但 tech 是深空星域
  // 冷调，ember 是暖橙调——归档件本身零 baked hex，全部吃 ctx.colors，
  // 视觉观感由 tokens 决定，不是同一张脸）——落到 (banner-title[cover
  // 轴不声明的默认值], fashion-chapter, tone-adaptive-content, split-band,
  // rail-chapter, banner-heading, banner-ending) 这一未被使用的三元组。
  //
  // 实测校验（`theme-structure.test.ts` 的"每个声明主题的 resolveSequence
  // 两两不同"）：ember 的完整 resolveSequence（seed=1）与其余 8 个既有
  // 声明主题（含 pulse/terra）逐一比对均不同，也不与 7 个未声明主题共享的
  // 默认序列相同。
  ember: {
    layouts: { cover: FULL_LAYOUTS.cover, chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "ember-motif",
    layoutTendencies: {
      chapter: ["rail-chapter"],
      ending: ["constellation-ending"],
    },
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
      // Theme-structure wave, task T1 fix round (reviewer's Minor): projected
      // through now, even though no builtin's `LAYOUTS` entry sets it yet
      // (task T2's job) — so a future entry that adds `layoutTendencies` is
      // mechanical (just another key on that entry's object literal) instead
      // of also requiring a matching edit here, and `tsc` would have caught
      // the omission had this projection itself been forgotten.
      layoutTendencies: LAYOUTS[id].layoutTendencies,
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
 * Reduce a `BackgroundSpec` to one representative hex color — a color spec
 * is already one; a gradient's `from` stop stands in for the whole band (see
 * `svg/full-slide-svg.tsx`'s own copy of this same function for the fuller
 * gradient/asset rationale).
 *
 * Deliberately duplicated (byte-identical logic) from `svg/full-slide-svg.tsx`'s
 * exported `resolveBackgroundHex` rather than imported: that file already
 * imports back from this one (`getThemeDefinition`), and it further pulls in
 * the render-orchestration subtree (`brand-chrome.tsx`/`layout-selection.ts`/
 * `motif-selection.ts`, confirmed via `npx madge --circular`) — importing it
 * here would fold that whole subtree into a cycle with this foundational
 * theme-registration module just to reuse a 3-line pure function. `ink.ts`'s
 * own `contrastRatio` below makes the identical call against
 * `deck-audit.ts`'s copy for an analogous reason (see that file's header
 * comment: "render code must never import from the audit package;
 * dependency direction is render→util, not the reverse") — this is the same
 * discipline applied to the mirror-image direction (a low-level
 * registration module must not import the high-level render orchestrator).
 * Keep in sync with `full-slide-svg.tsx`'s copy if the reduction rule ever
 * changes.
 */
function resolveBackgroundHex(spec: BackgroundSpec, surfaceFallback: string): string {
  if (spec.kind === "color") return spec.value
  if (spec.kind === "gradient") return spec.from
  return surfaceFallback
}

/**
 * Registration-time contrast floor (backlog-sweep task I2, controller-
 * adjudicated): `colors.text`/`colors.muted` must clear 3.0:1 — the WCAG
 * large-text floor — against each checked slide type's own resolved default
 * background (same reduction `full-slide-svg.tsx` itself paints with,
 * {@link resolveBackgroundHex}). Below 3.0 a token is unreadable at *any*
 * font size, not just body text, which is the same "always broken, no
 * legitimate design reading it as intentional" bar this function's 6
 * existing throw checks already hold layout ids to.
 *
 * Deliberately *not* the 4.5:1 body-text floor: a real gray-scale design can
 * legitimately land in [3.0, 4.5) and should not be hard-rejected at
 * registration — that higher bar is a theme author's own self-audit
 * concern, already covered by `full-matrix-contrast.test.ts`'s
 * `colors.muted contrast` suite for the 13 builtins (all measure >= 4.5
 * there today).
 */
const CONTRAST_FLOOR = 3.0

/**
 * Slide types this check actually walks — `"chapter"` is deliberately
 * excluded, same as `full-matrix-contrast.test.ts`'s `colors.muted contrast`
 * suite (see that block's own comment). Verified by reading, not assumed:
 * every one of the 8 chapter archetypes (`chapter-*.tsx`) imports
 * `accessibleInk`/`readableOn` from `../svg/ink` and routes *both*
 * `colors.text` and `colors.muted` through it before ever painting a fill —
 * none paints either token raw against `ctx.defaultBg`. This isn't a
 * per-theme coincidence this function would need to re-verify per
 * registration: `registerTheme` can only curate a subset of *already
 * existing* archetypes ("a theme never ships new render code", this
 * function's own doc comment above) drawn from that same shared, fixed
 * chapter-archetype set — so the raw-token-vs-chapter-background pairing
 * this check would otherwise measure is structurally never what actually
 * renders, for any theme this function could ever accept, not just the 13
 * builtins. A probe against all 13 builtins' real tokens confirms this is
 * load-bearing, not theoretical: `academic`/`classroom`/`consulting` are the
 * 3 builtins whose `defaultBackgrounds.chapter` intentionally diverges from
 * their own `colors.bg` (a dark divider tone, see {@link resolveBackgroundHex}'s
 * own doc comment) — checking `chapter` here would hard-reject `colors.text`
 * and/or `colors.muted` for all 3 of them (measured 1.00:1/2.41:1/2.23:1 for
 * text, 3.26:1/1.18:1/1.46:1 for muted, against their own chapter
 * background) despite every one of them rendering correctly today, precisely
 * because their chapter archetypes never read these tokens raw.
 */
const CONTRAST_CHECKED_SLIDE_TYPES = ["cover", "content", "ending"] as const

/**
 * Throws {@link PptfastError} the moment any of `style.colors.text`/
 * `style.colors.muted` falls below {@link CONTRAST_FLOOR} against a
 * {@link CONTRAST_CHECKED_SLIDE_TYPES} slide type's own resolved default
 * background — see that constant's doc comment for the 3.0 rationale and
 * {@link CONTRAST_CHECKED_SLIDE_TYPES}'s for why `chapter` is out of scope.
 *
 * Exported so a test can sweep it directly against the 13 builtins: they
 * never call {@link registerTheme} (`THEME_DEFINITIONS` is built straight
 * from `THEME_STYLES`, not through this seam — see `registered-themes.ts`'s
 * own docstring for why that separation is load-bearing), so this is the
 * only way to lock their contrast floor as part of this task.
 */
export function assertContrastFloor(id: string, style: StyleTokens): void {
  for (const slideType of CONTRAST_CHECKED_SLIDE_TYPES) {
    const bg = resolveBackgroundHex(style.defaultBackgrounds[slideType], style.colors.surface)
    for (const token of ["text", "muted"] as const) {
      const ratio = contrastRatio(style.colors[token], bg)
      if (ratio < CONTRAST_FLOOR) {
        throw new PptfastError(
          `theme "${id}" colors.${token} has a contrast ratio of ${ratio.toFixed(2)}:1 against its "${slideType}" background (${bg}) — must be at least ${CONTRAST_FLOOR.toFixed(1)}:1`,
        )
      }
    }
  }
}

/**
 * `console.warn`s a single line when `stack` (a theme's `fonts.heading` or
 * `fonts.body`) resolves — via `resolveFontFace`, the exact same resolution
 * `full-slide-svg.tsx`'s render path uses — to a face with no exact
 * per-character width table (`hasExactWidthTable`, `../svg/fonts` ->
 * `svg-text-layout.ts`). Not a hard rejection: an unmeasured designer font
 * (Cambria, a theme's own custom stack, …) is a legitimate design choice,
 * not a defect — `measureTextUnits`'s class-average envelope still sizes it,
 * just more conservatively, with a real (if small) overflow risk on long
 * runs. `mono` is deliberately never checked here — `measureMonoTextUnits`
 * already sizes it with an exact per-glyph model for Consolas, the only
 * mono face any builtin ships.
 *
 * This is the first `console.warn` call site in the codebase (a repo-wide
 * grep found none) — deliberately plain, no new warning-channel
 * abstraction: there is no registration-time warning plumbing to reuse, and
 * `console.warn` needs none (zero API surface change, works identically on
 * every platform this package ships to).
 */
function warnUnmeasuredFace(id: string, role: "heading" | "body", stack: string[]): void {
  const face = resolveFontFace(stack, role)
  if (!hasExactWidthTable(face)) {
    console.warn(
      `theme "${id}" ${role} font "${face}" has no exact width table — text width estimation falls back to a conservative class-average envelope and may overflow on long text; see measureTextUnits in src/lib/svg-text-layout.ts`,
    )
  }
}

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
 * - `style.colors.text`/`style.colors.muted` must each clear the
 *   {@link CONTRAST_FLOOR} against a {@link CONTRAST_CHECKED_SLIDE_TYPES}
 *   slide type's own resolved default background — see
 *   {@link assertContrastFloor}'s own doc comment.
 *
 * Also `console.warn`s (never throws) once for each of `style.fonts.heading`/
 * `style.fonts.body` that resolves to a face with no exact width table — see
 * {@link warnUnmeasuredFace}'s own doc comment. Fires only for a
 * registration that clears every check above (i.e. one that is actually
 * about to succeed).
 *
 * Once registered, the theme participates in `getInstalledThemeIds`,
 * `getThemeDefinition` (hence `layout-selection.ts`/`FullSlideSvg`'s
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
  assertContrastFloor(def.id, def.style)
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
  // `layoutTendencies` consistency (theme-structure wave, task T1): a
  // declared id that isn't also a member of this same slide type's
  // just-resolved `layouts` set can never be scored by `weightOf`
  // (`layout-selection.ts`'s pool is built from `layouts[slideType]` before
  // any tendency is consulted) — it would silently do nothing forever, the
  // exact "theme author mistake" `ThemeDefinition.layoutTendencies`'s own
  // doc comment warns about. Caught here, at registration time, rather than
  // left to surface (or not) at render time.
  for (const slideType of REGISTERABLE_SLIDE_TYPES) {
    const tendencyIds = def.layoutTendencies?.[slideType]
    if (!tendencyIds) continue
    for (const id of tendencyIds) {
      if (!layouts[slideType].includes(id)) {
        throw new PptfastError(
          `theme "${def.id}" layoutTendencies.${slideType} references "${id}", which is not in this theme's own layouts.${slideType} set — a tendency must name an id already in the theme's curated pool`,
        )
      }
    }
  }
  // Soft checks last, only once every hard check above has confirmed this
  // registration will actually succeed — a registration that goes on to
  // throw (bad layout id, etc.) never warns for an unrelated font choice.
  warnUnmeasuredFace(def.id, "heading", def.style.fonts.heading)
  warnUnmeasuredFace(def.id, "body", def.style.fonts.body)
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
 * directly (`layout-selection.ts`, `full-slide-svg.tsx`) now calls instead, so
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
