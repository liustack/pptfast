import type { BackgroundSpec, BrandConfig, Slide } from "@/ir"
import { PptfastError } from "../errors"
import type { MotifId } from "../svg/motifs/types"
import { hasExactWidthTable, resolveFontFace } from "../svg/fonts"
import { contrastRatio } from "../svg/ink"
import { excludePinOnly, getLayout, layoutsForSlideType } from "../svg/layouts/registry"
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
   * 各自允许哪些 layout 参与自动选型。排印/色彩在 style，这里只放集合。
   * **W4 全集放开**（spec §3「缺省 = 全集，策展收窄塑造个性」，design
   * decision 7）：十三内置主题四页型默认均为 {@link fullLayoutSet} 的
   * 全集。design decision 7/8 曾经的六处对比度策展排除（luxe/campaign/
   * classroom 的 content 排除 banner-heading、tech 的 cover/content、
   * consulting 的 chapter）已在 W4 fix round 随对比度自适应 ink helper
   * （`src/svg/ink.ts`）的根因修复全部撤销。fix round 自身新发现的三处
   * （bloom/classroom/heritage 的 chapter 排除 fashion-chapter）也已在
   * post-v0.3 W8 fix round 随 `readableOn` 两墨实测对比度取优的根因修复一并
   * 撤销（backlog item 2）——十三主题四页型现在均为不折不扣的全集，无任何
   * 排除残留。页型空集 = 该页型回落调用侧兜底（十三主题四页型均非空，
   * `definitions.test.ts` 锁死）。id 是通用 string（不再按页型区分
   * layout id 联合类型）。
   */
  layouts: Record<Slide["type"], readonly string[]>
  /** Motif：单值，非 allowed-set（spec §3 示意）。undefined = 该主题无 motif 装饰（十三主题中 runway 留空，其余均已设）。 */
  motif?: MotifId
  /**
   * A theme's own structural personality (theme-structure wave, task T1 —
   * `.issues/2026-07-26-theme-structure/plan.md`'s 控制器设计裁定 2): per
   * page type, the layout ids this theme's author wants `resolveLayoutId`
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
   * *before* any tendency is ever consulted (`resolveLayoutId`'s own
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
  /**
   * Which sparse climax pins this theme is willing to honour. This is not a
   * curated auto-pick pool: pinOnly sparse ids never enter `layouts[slideType]`
   * (`fullLayoutSet` / `excludePinOnly` already drop them), so a list here
   * does not make `resolveLayoutId` sample them. It is the offer table for
   * an explicit `slide.layout` pin — the only road that can ever reach a
   * sparse page.
   *
   * **Three shapes, none of them a defaulted array:**
   * - omitted / `undefined`: this theme offers every id in
   *   {@link SPARSE_LAYOUT_IDS}. Builtins that have not boarded a face still
   *   render the generic content face (`sparseFace` miss → `content-*.tsx`).
   *   Custom themes registered via {@link registerTheme} get the same
   *   omitted-means-all contract; do not default the field to `[]` or the
   *   six-id list on the way in (`getThemeDefinition` round-trips the
   *   registration object).
   * - `[]`: this theme offers none. An explicit pin of any sparse id warns
   *   at `validateIr` (`ok` stays true) and render falls back to auto-pick
   *   from the ordinary content (or chapter, for `verse-chapter`) pool.
   * - a list: only those ids. A listed id must be one of the six sparse
   *   ids (`registerTheme` throws {@link PptfastError} otherwise). It does
   *   **not** have to sit in `layouts[slideType]` — those pools exclude
   *   pinOnly members by construction.
   *
   * {@link themeOffersSparse} is the only offer check. Renderers must not
   * branch on theme id. A pin this theme does not offer is stripped
   * (`effectiveRequestedLayout`) *before* `resolveLayoutId`'s pin
   * short-circuit, so fallback reuses the existing auto-pick path instead
   * of teaching selection about this table.
   */
  sparseLayouts?: readonly string[]
}

/**
 * Every registered standard layout id applicable to `slideType`, in
 * `LAYOUT_REGISTRY`'s own insertion order (W4, spec §3's curation default:
 * "layouts 主题引用的 layout 精选集...缺省 = 全集"). Takeover layouts are
 * excluded — `layoutsForSlideType("content")` also returns the 4 image
 * takeovers (their `slideTypes` includes `"content"` too), but a curated
 * auto-pick set may only ever contain standard layouts (`registerTheme`'s own
 * validation below enforces the same constraint on any caller-supplied
 * set — takeovers are addressed only via an explicit `slide.layout` pin,
 * never auto-selected). Also excludes any `pinOnly` layout (quote-stage
 * wave, task T1 -- see `LayoutDefinition.pinOnly`'s own doc comment,
 * `../svg/layouts/registry.ts`): a pinOnly layout must never enter any
 * pool, curated or not, so the exclusion happens here rather than as a
 * later, softer filter the way `narrativesOnly` is.
 */
function fullLayoutSet(slideType: Slide["type"]): readonly string[] {
  return excludePinOnly(layoutsForSlideType(slideType).filter((layout) => layout.kind === "archetype")).map(
    (layout) => layout.id,
  )
}

/**
 * Test-only: `fullLayoutSet` under a `__`-prefixed name (same convention
 * as `__resetRegisteredThemes` below) so a pinOnly regression test can call
 * it directly against a synthetic `LAYOUT_REGISTRY` mutation -- `FULL_LAYOUTS`
 * below only ever snapshots `fullLayoutSet`'s result once, at module
 * load, long before any test could inject a fixture entry. Deliberately not
 * exported from `src/index.ts` (the public SDK barrel).
 */
export function __fullLayoutSet(slideType: Slide["type"]): readonly string[] {
  return fullLayoutSet(slideType)
}

/** The full-set default for every slide type (W4) — one registry walk, shared by every builtin theme below and by `registerTheme`'s own per-slide-type default. */
const FULL_LAYOUTS: Record<Slide["type"], readonly string[]> = {
  cover: fullLayoutSet("cover"),
  chapter: fullLayoutSet("chapter"),
  content: fullLayoutSet("content"),
  ending: fullLayoutSet("ending"),
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
  // ink v3（2026-08-18 主题重设计第一期）：两个开关都开，理由各不相同，
  // 不是一件事的两半。
  //   - `suppressFooterRule` 是 2026-07-10 的旧裁决（motif 自带版框线会与
  //     页脚分隔线撞成双线）。v3 已经把版框线删了，但这条继续留着——落款列
  //     那条 x1220 竖界线加上一条横分隔线仍是两道线交叉在右下角，正是当初
  //     要避免的观感。
  //   - `suppressFooterMeta` 是本期新增：ink-motif v3 的右缘落款列已经把
  //     机构名和年月排在页面右缘，页脚再排一遍就是同一页上印两份。
  //
  //     **两处代价写清楚，都是本期裁决的已知后果，不是漏了：**
  //     1. 密级标与版本号只活在页脚这一行，ink 的内容页因此不再显示这两项
  //        （落款列按设计只收机构名 + 年月 + 印）。
  //     2. 落款列是逐字竖排，一列排得下 11 个字（带年月时；不带年月 17 个）
  //        ——`motif-ink-motif.tsx` 的 `orgCapacity()` 按几何算的。超过这个
  //        长度的机构名会被截断并挂 `data-truncated`，`pptfast audit` 照常
  //        报 content-truncated。**这不是小概率**：`Meridian Analytics`
  //        （18）、`北京云帆科技有限责任公司`（12）都超。竖排是 CJK 短款识的
  //        写法，拉丁长名逐字母竖排本来也不成体统——落款列吃不下的机构名，
  //        正确的出路是 IR 里写 `theme.brand.suppressFooterMeta: false` 把
  //        页脚这一行要回来（`resolveBrand` 的浅合并，override 胜出），
  //        或者换个短名。审计会大声说出来，不会无声吞掉。
  ink: { suppressFooterRule: true, suppressFooterMeta: true },
}

/**
 * 每主题的 layouts + motif。**W4 全集放开**（spec §3「缺省 = 全集，策展收窄
 * 塑造个性」，design decision 7）：十三主题的 cover/chapter/content/ending
 * 均是 {@link FULL_LAYOUTS} 对应页型的全集，本表下面各条目因此不再需要逐
 * layout 罗列——只保留仍然成立的策展叙事（motif/tokens 气质的由来）。
 * W2 任务 2～W4 之前的窄策展集（chapter=1、ending=1、content=2、cover=1-3）
 * 随本表一起退役：那段历史留在 git blame，不再复述于此。与 BRANDS 分开维护
 * 是因为这两块是全量 Record（十三主题每个都必须有非空 layouts），不像
 * BRANDS 那样是 Partial。
 *
 * **W4 fix round（design decision 8 的根因处置收官）**：design decision 7 的
 * 三处既有对比度裁定（luxe/campaign/classroom 的 content 排除
 * banner-heading）与本任务实现期新增的三处阳性裁定（tech 的 cover/content、
 * consulting 的 chapter）——共六处——全部源于同一枚缺陷模式：layout 画在
 * 一块自己不控制（或自画但未检查明度）的背景上、baked 死一个文字色。fix
 * round 引入的对比度自适应 ink helper（`src/svg/ink.ts` 的
 * `readableOn`/`accessibleInk`）从根上修复了这枚缺陷，六处例外逐一用
 * `auditDeck` 复核（对应 layout 现在自适应取色）后确认全部转为可读，予以
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
/**
 * classroom 的结构身份，被 classroom 和 bloom 两个 theme id **共用同一个对象**
 * （theme-structure-allocation wave，`structure-map.md` 会话 0 裁决 3）。
 *
 * 这是声明的同构，不是漏写。定稿分配表把 bloom 的四轴（heading-axis 左 /
 * meta top-band / decor medium / whitespace medium）与 classroom 判成同一格，
 * 而分配表的填表铁律是「任何两个主题不得四轴全同」——两家全同就意味着它们
 * 本来就是同一个结构身份，差别只在色板。与其给 bloom 硬编一组它并不真的想要
 * 的轴去满足查重脚本，不如把这层关系写成代码里的事实：bloom = classroom 的
 * 换肤（palette preset），保留自己的 id 和色板，结构行共享。
 *
 * **柔和组皮肤重设计（2026-08-20）把这层关系落到了底**：bloom 的 token 对象
 * 现在直接 spread `CLASSROOM_TOKENS`（`themes/bloom.ts`，只覆盖五个色值），
 * motif 锚点也改指 `classroom-motif`（专属 `bloom-motif` 整个删除）。两家从此
 * 真的只差色板——结构行、字体、圆角、motif 几何全部同源。
 *
 * 红线：bloom 这个 theme id 永不删除（既有 deck 里写着它）。所以「22 个 theme
 * id、21 个结构身份」是本仓从此的正式口径，不是过渡态。
 *
 * 用同一个对象引用而不是复制字面量，是为了让「同构」这件事有一个测试能真的
 * 抓住：`definitions.test.ts` 用 `toBe`（引用恒等）+ `toEqual`（深等）双钉，
 * 谁把其中一家的值改开，两条断言一起红。复制字面量做不到这件事——两份字面量
 * 各自漂移时深等会红，但引用恒等这条更强的保证从一开始就不存在。
 */
const CLASSROOM_STRUCTURE: NonNullable<ThemeDefinition["layoutTendencies"]> = {
  // cover `band-title`：通栏雾蓝板书带承反白标题，陶土波浪在带下。板上那张
  // 脸，硬锁。banner-title / tone-adaptive-header 那对注释是错的——池里的
  // banner-title 不画通栏带。
  cover: ["band-title"],
  // Second-front wave (2026-08-22)，四轴 L / top-band / medium / medium：
  // - chapter `masthead-chapter` + `tone-adaptive-chapter`：一条横线加一个
  //   标题就是板书的断章，角落水印是讲义的第二档。后者不在 briefing 的
  //   chapter 偏好里，真实边际权重。
  // - content `rail-numbered` + `tone-adaptive-content`：编号步骤加最朴素的
  //   讲义页。前者已在 briefing 的 content 偏好里（单独声明空转），后者不在，
  //   这一格的真实拉力来自最素的那一页。
  // - ending `tone-adaptive-ending` + `masthead-ending`：最素的两个。前者是
  //   万金油 id，任何叙事下都拿满额边际权重。
  chapter: ["masthead-chapter", "tone-adaptive-chapter"],
  content: ["rail-numbered", "tone-adaptive-content"],
  ending: ["tone-adaptive-ending", "masthead-ending"],
}

/** classroom / bloom share one layouts object the same way they share CLASSROOM_STRUCTURE. */
const CLASSROOM_LAYOUTS: ThemeDefinition["layouts"] = {
  cover: ["band-title"],
  chapter: FULL_LAYOUTS.chapter,
  content: FULL_LAYOUTS.content,
  ending: FULL_LAYOUTS.ending,
}

/**
 * 内容页分配表（second front，2026-08-22，`.issues/2026-08-21-content-allocation/`）
 * ——会话 0 的结构分配表只填了封面轴，chapter / content / ending 三轴一直空着。
 * 落地前实测：25 个 theme id 里 content 页 23 家全盲，chapter 页 13 家全盲 1 家
 * 空转，ending 页 13 家全盲 1 家空转；同一份 IR 同一枚 seed 下 24 个结构身份
 * 只渲出 11 组不同的 7 页序列。本波给 24 个结构身份 × 三个页型各填 2 到 3 个
 * 倾向 id，四条硬规则由 `theme-structure.test.ts` 的 second-front 块逐条机器
 * 验证，不靠人眼：
 *
 *   1. 查重：任何两个结构身份在同一页型的倾向集不得全同（严格版，24/24）。
 *   2. 防空转：每一格都至少含一个默认叙事 `briefing` 不偏好的 id。比封面轴的
 *      守卫更严——封面轴只要求「每家至少一格」，这里是每一格。
 *   3. 在池内：每个 id 都必须在该主题该页型自己的 `layouts` 集合里，否则它对
 *      `weightOf` 不可见（不是被降权，是根本不参与打分）。
 *   4. 只追加不替换：本波之前声明过的每一个 id 都活着（declaration-rebalance
 *      wave 裁定 1 的先例）。
 *
 * 每个页型由不同的轴主导，这是本表的填表方法：
 *   - **chapter 由 heading-axis 与 decoration-weight 主导**。断章页只有标题、
 *     序号和一块底，画面上能分家的就是「标题站左还是站中」以及「底给多重」。
 *   - **ending 由 meta 与 whitespace 主导**。收尾页的实质内容是联系方式、版权
 *     与落款，meta 落在哪里决定了它长什么样。
 *   - **content 由 whitespace 与密度主导**。正文页的性格是「一页塞多少、留多少
 *     白」，不是标题对齐。
 *
 * 池容量是数数问题，不是口味问题，先写在这里免得下一个新主题撞墙：ending 池
 * 只有 7 个 id，非空转二元集共 20 个，**少于 24 家**，所以至少 4 家必须用三元集
 * （本波 5 家：consulting 既有、luxe 出于设计、lecture / swiss / memo 是排不开
 * 的让位）。chapter 池 8 个 id，非空转二元集 27 个，24 家排完只剩 3 个位。
 * content 池 12 个 id，二元集 66 个，宽裕。**下一个新主题落地时 ending 轴基本
 * 无位可加**，只能走三元集或扩池。
 *
 * playbill 不收窄 `layouts`。content 格用三元集（split-band / stacked-poster /
 * banner-heading）把三张海报脸占住。
 *
 * 封面轴本波零移动（实测：24 家 × 40 seed × 7 页 = 6720 次抽签里 4278 次移动，
 * 按槽计数 `{1:582, 2:780, 3:836, 4:652, 5:778, 6:650}`，槽 0 一次都没动）。
 * 这是本波对旧 deck 的硬承诺：没写 `slide.layout` 的非封面页会换脸，封面不会。
 */
const LAYOUTS: Record<CanonicalThemeId, Pick<ThemeDefinition, "layouts" | "motif" | "layoutTendencies">> = {
  consulting: {
    layouts: { cover: ["verdict-index"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "banner-motif",
    // Theme-structure wave, task T2: consulting's own motif is
    // `banner-motif`, and `banner-title`/`banner-chapter`/`banner-ending`
    // are verbatim extractions of consulting's own predecessor render code
    // (`MckinseyNavyCover`/`Chapter`/`Ending`, see each layout file's own
    // header) — this is the theme's native "assertion banner" register, not
    // a borrowed one.
    //
    // Declaration-rebalance wave (`.issues/2026-08-03-declaration-rebalance/plan.md`,
    // 裁定 1-2): cover and ending were both dead under the default `briefing`
    // strategy — `banner-title`/`banner-ending` are each already members of
    // `briefing.identityTendencies` (`@/narrative`'s `STRATEGY_DEFINITIONS`),
    // so `Math.max(strategyWeight, themeWeight)` never exceeded the
    // strategy-only weight (max(3,3)=3) and these two axes read identically
    // to an undeclared theme under the deck's own default narrative. Native
    // ids kept (still real, historically-honest register for the other 4
    // strategies); a second, honest id appended to each dead axis instead of
    // a swap, per 裁定 1.
    //
    // - cover `left-anchor` (read `cover-left-anchor.tsx`, not just its id):
    //   40%-width primary color block carries the heading, with the org
    //   kicker, confidentiality badge, italic subheading, and an explicit
    //   author/date/version meta row on the right panel — the same formal
    //   "state the point, then the paper trail" report-cover convention
    //   `banner-title` itself already uses, just with the assertion moved
    //   into a color block instead of a banner rule. Not in
    //   `briefing.identityTendencies.cover` (`["banner-title",
    //   "poster-center"]`), so it's the theme's first real cover pull under
    //   the default strategy.
    // - ending `rail-ending` (read `ending-rail-ending.tsx`): corner
    //   color-block accents + a heading + an explicit hairline-separated
    //   "Contact" section + copyright — `pyramid.identityTendencies.ending`'s
    //   own doc comment already calls this id out as reading "like a
    //   report's closing page, not a sentimental goodbye", which is
    //   consulting's own register verbatim.
    // - ending `tone-adaptive-ending` (read `ending-tone-adaptive-ending.tsx`):
    //   left-aligned heading, a divider, "Contact" + copyright, zero
    //   ornament — the pool's "万金油" ending (`@/narrative`'s own doc
    //   comment: never a member of any strategy's `identityTendencies`), and
    //   the plainest possible closing register, matching consulting's own
    //   restrained-report character.
    //
    // Real-pull verification (direct `resolveLayoutId` sweep, same
    // technique the themes-16 wave's T2/T3 reviewers used, against this
    // repo's `theme-structure.test.ts` fixture at seed=1, strategy
    // `briefing`): a *single* appended id on `ending` cannot fix it — every
    // valid candidate is base-weight 1 before the append and
    // `TENDENCY_WEIGHT`(3) after, so any single append moves
    // `weightedPickBySeed`'s modulus from 11 to 13 *regardless of which id
    // was appended* (`variety.ts`'s `target = hash % totalWeight`) — the
    // fixed hash for this fixture's `ending-layout:6` salt then lands in
    // exactly one of two possible buckets no matter the choice, and both of
    // those buckets were already occupied byte-for-byte by academic's and
    // runway's own pre-existing sequences (see git blame on this comment for
    // the full derivation — recorded once here, not per-line). A second
    // appended id (modulus 15) opens a third, previously-unreachable bucket:
    // `[banner-ending, rail-ending, tone-adaptive-ending]` resolves to
    // `tone-adaptive-ending` at this fixture/seed, distinct from every other
    // theme. `ThemeDefinition.layoutTendencies`'s own doc comment already
    // notes a theme axis using more than one id is legal, just unused before
    // this wave ("主题层至今只用 1 个是习惯不是约束").
    //
    // Second-front wave (2026-08-22): 断言横幅是 consulting 的母语，chapter
    // 与 content 都从这句话延长出去。四轴 L / bottom-left / light / medium。
    // - chapter `poster-chapter` 追加：左对齐巨幅序号 + 800 字重标题 + 两条
    //   细线 + 右上机构名，就是同一份报告的分节页，左轴那一档的另一张脸。
    //   不在 `briefing.identityTendencies.chapter` 里，真实边际权重。
    // - content `banner-heading` + `split-band`：`banner-heading` 本来就是从
    //   consulting 的旧内容页提炼出来的（全宽实心横幅承标题），`split-band`
    //   是同一句断言横过来占满页宽的全出血头带。前者已在 `briefing`
    //   的 content 偏好里（max(3,3)=3，单独声明空转），后者不在。这一格的
    //   真实拉力来自 `split-band`，`banner-heading` 是按裁定 1 保留的真实主张。
    // - ending 三元集不动（declaration-rebalance wave 的成果）。
    layoutTendencies: {
      cover: ["verdict-index"],
      chapter: ["banner-chapter", "poster-chapter"],
      content: ["banner-heading", "split-band"],
      ending: ["banner-ending", "rail-ending", "tone-adaptive-ending"],
    },
  },
  insight: {
    // board-cover-restore wave 2 (parameter gap, no new ids): lock poster-center.
    layouts: { cover: ["poster-center"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "poster-motif",
    // Theme-structure wave, task T2: insight's own motif is `poster-motif`,
    // and `poster-center`/`poster-chapter`/`poster-ending` are verbatim
    // extractions of insight's own predecessor creative.tsx render code
    // (`EditorialDarkCover`/`Chapter`/`Ending`) — matches the
    // Bloomberg/Economist-style bold, information-forward register this
    // theme's own token comment names ("原 creative 改名...其实是
    // Bloomberg/Economist 财经信息图风").
    layoutTendencies: {
      // `editorial-masthead` appended (inert-declaration fix, 2026-08-19).
      // `poster-center` alone was a declaration a default deck could never
      // see: it is one of `briefing.identityTendencies.cover`'s own two ids,
      // so `Math.max(3, 3) = 3` and insight picked its cover exactly the way
      // a theme declaring nothing does. The allocation table was drawn on
      // structural grounds without checking it against the composition rule.
      //
      // `editorial-masthead` (verified absent from briefing's set, and pinned
      // by this file's own guard) is the honest second id rather than a
      // modulus escape: double rules across the top over a serif masthead is
      // the ticker-and-rule furniture of a financial daily, which is the
      // register insight's deep ground and running band already speak. It is
      // journal's declared id too — journal is the black-and-white humanities
      // masthead, insight is the same construction on a near-black field with
      // a red accent, and the layout bakes no hex, so one composition carries
      // two registers.
      cover: ["poster-center"],
      // Second-front wave (2026-08-22)，四轴 C / top-band / light / tight：
      // - chapter `tone-adaptive-chapter` 追加：居中标题 + 一枚角落水印、零其它
      //   装饰。巨号加细线是行情屏的分区，这一枚给它第二张脸。它是
      //   `narrative/index.ts` 明确「从不出现在任何 strategy 的
      //   identityTendencies 里」的万金油 id，在任何叙事下都拿满额边际权重，
      //   也是把 insight 从盲序列上撬开的那一个。
      // - content `bento-panel` + `side-highlight`：六格拼盘 + 正文栏右缘常驻
      //   primary 面板，正是彭博终端那两栏。tight 那一档要的就是这个密度，
      //   两个 id 都不在 `briefing` 的 content 偏好里。
      // - ending `constellation-ending` 追加：居中「Thank you.」+ accent 句号 +
      //   短签名条，干脆自信，与居中海报式的 `poster-ending` 同属居中收尾。
      chapter: ["poster-chapter", "tone-adaptive-chapter"],
      content: ["bento-panel", "side-highlight"],
      ending: ["poster-ending", "constellation-ending"],
    },
  },
  academic: {
    // board-cover-restore wave 2 (parameter gap, no new ids): lock left-anchor.
    layouts: { cover: ["left-anchor"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "rail-motif",
    // Theme-structure wave, task T2: academic's own motif is `rail-motif`,
    // and `left-anchor`/`rail-chapter`/`rail-ending` are verbatim
    // extractions of academic's own predecessor render code
    // (`BCGEmeraldCover`/`Chapter`/`Ending`) — this theme's native
    // color-block-plus-progress-rail register.
    layoutTendencies: {
      cover: ["left-anchor"],
      // Second-front wave (2026-08-22)。四轴按提案 1.3 重建，不当仓内事实：
      // L / top-band / light / medium（封面 `left-anchor` 定左轴，rail-motif
      // v2 两件收在顶带 y30 与右上角且板上自称 light 档，`gapScale` 1.05）。
      // 与 pulse 的反推值全同，正式取值以仓外定稿表为准，本波分配不依赖
      // 这四格的精确数字，靠既有 rail 家族声明与气质填表。
      // - chapter `masthead-chapter` 追加：双细线夹左对齐大标题是论文分节，
      //   进度点轨是 motif 自己在说的话。`masthead-chapter` 已在 briefing
      //   的 chapter 偏好里，真实边际仍来自既有的 `rail-chapter`。
      // - content `rail-numbered` + `narrow-column`：编号导轨加稿纸窄栏，
      //   medium 留白。前者与 briefing 重合，后者不在，真实拉力来自窄栏。
      // - ending `masthead-ending` 追加：既有 `rail-ending` 的延长线，两个
      //   id 都是学术落款的读法。前者与 briefing 重合，真实边际仍在 rail。
      chapter: ["rail-chapter", "masthead-chapter"],
      content: ["rail-numbered", "narrow-column"],
      ending: ["rail-ending", "masthead-ending"],
    },
  },
  tech: {
    // board-cover-restore wave 2 (parameter gap, no new ids): lock constellation.
    layouts: { cover: ["constellation"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "constellation-motif",
    // Theme-structure wave, task T2: tech's own motif is
    // `constellation-motif`, and `constellation`/`constellation-chapter`/
    // `constellation-ending` are verbatim extractions of tech's own
    // predecessor render code (`BentoTechCover`/`Chapter`/`Ending`) — this
    // theme's native visual family, not a borrowed one.
    layoutTendencies: {
      cover: ["constellation"],
      // Second-front wave (2026-08-22)，四轴 L / bottom-right / medium / tight：
      // - chapter `rail-chapter` 追加：`constellation-chapter` 今天是空声明
      //   （它正是 briefing 自己偏好的 id，max(3,3)=3），进度轨读作路线图，
      //   把它变成真声明。与 2026-08-19 修掉的 insight / vermilion 封面空转
      //   是同一枚缺陷，只是没人查过 chapter 轴。
      // - content `bento-panel` + `split-band`：拼盘加通栏头带，tight 那一档
      //   的密度。两个 id 都不在 briefing 的 content 偏好里。
      // - ending `banner-ending` 追加：签名条加联系页。`banner-ending` 已在
      //   briefing 的 ending 偏好里，这一格的真实边际仍来自既有的
      //   `constellation-ending`，联系页是按裁定 1 保留的真实主张。
      chapter: ["constellation-chapter", "rail-chapter"],
      content: ["bento-panel", "split-band"],
      ending: ["constellation-ending", "banner-ending"],
    },
  },
  // runway（时尚杂志，2026-07-10 拆分）：冲击力=超大排印+满版色块（检索背书），
  // fashion-masthead/fashion-chapter/fashion-ending 是 runway 专属新表达。
  // journal 与其共享 masthead 报头家族但 tokens 气质大变。
  runway: {
    layouts: { cover: ["paper-masthead"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    // motif 刻意不配（2026-07-10 全覆盖时曾加「时尚编辑标记」，两版均被
    // 用户裁难看后撤销）：runway 的语言=满版色块+超大排印+留白，排印至上是
    // 终审裁决——十三主题中唯一留空 motif 的一个。
    // Theme-structure wave, task T2: `fashion-masthead`/`fashion-chapter`/
    // `fashion-ending` were built exclusively for runway (2026-07-10, pure
    // new writes, extreme-scale full-bleed typography) — with no motif of
    // its own, this layout family is runway's only structural signature
    // beyond token colors.
    layoutTendencies: {
      cover: ["paper-masthead"],
      // Second-front wave (2026-08-22)，四轴 L / bottom-left / none / airy：
      // - chapter `masthead-chapter` 追加：fashion 家族是它唯一的结构签名
      //   （无 motif），双细线给它一张不那么响的第二脸。`masthead-chapter`
      //   与 briefing 重合，真实边际仍来自既有的 `fashion-chapter`。
      // - content `narrow-column` + `stacked-poster`：杂志窄栏加主视觉堆叠，
      //   都是 airy。两个 id 都不在 briefing 的 content 偏好里。
      // - ending `tone-adaptive-ending` 追加：满版收官加最素的落款。后者是
      //   万金油 id，真实边际权重。
      chapter: ["fashion-chapter", "masthead-chapter"],
      content: ["narrow-column", "stacked-poster"],
      ending: ["fashion-ending", "tone-adaptive-ending"],
    },
  },
  // journal（人文期刊，原 magazine 改名）：masthead 报头家族，角饰是人文感。
  journal: {
    // board-cover-restore wave 2 (parameter gap, no new ids): lock editorial-masthead.
    layouts: { cover: ["editorial-masthead"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "corner-ornament-motif",
    // Theme-structure wave, task T2: journal's own motif is
    // `corner-ornament-motif` (editorial ornamentation), and
    // `editorial-masthead`/`masthead-chapter`/`masthead-ending` are verbatim
    // extractions of journal's own predecessor magazine.tsx render code
    // (`EditorialSerifCover`/`Chapter`/`Ending`) — this theme's native
    // masthead register.
    //
    // Declaration-rebalance wave (`.issues/2026-08-03-declaration-rebalance/plan.md`,
    // 裁定 1-2): chapter and ending were both dead under the default
    // `briefing` strategy — `masthead-chapter`/`masthead-ending` are each
    // already members of `briefing.identityTendencies`, so both axes read
    // identically to an undeclared theme under the deck's own default
    // narrative (same `Math.max` no-op `banner-title`/`banner-ending` hit
    // for consulting, see that theme's own comment above for the full
    // mechanism). `editorial-masthead` (cover) already has real pull under
    // `briefing` — not touched. Native chapter/ending ids kept; a second,
    // honest id appended to each dead axis instead of a swap, per 裁定 1.
    //
    // - chapter `roman-chapter` (read `chapter-roman-chapter.tsx`, not just
    //   its id): giant roman-numeral watermark + heading + optional italic
    //   subheading + a seed/chapter-rotated arc ornament — the pool's most
    //   literary, magazine-editorial chapter break (storytelling's own
    //   `identityTendencies` comment already reads it the same way: "the
    //   pool's most literary, ornamental chapter break"). Journal is a
    //   humanities-magazine register (`corner-ornament-motif`, italic
    //   subheadings on its own `editorial-masthead` cover) — a roman-numeral
    //   section marker is the same editorial-magazine vocabulary, not a
    //   borrowed one. Not in `briefing.identityTendencies.chapter`
    //   (`["masthead-chapter", "constellation-chapter"]`), and — unlike
    //   every other chapter id in the registry — not yet claimed by any
    //   other theme's own `layoutTendencies.chapter` as of this wave either.
    // - chapter `tone-adaptive-chapter` (read
    //   `chapter-tone-adaptive-chapter.tsx`): centered heading + a large
    //   translucent corner watermark, zero other ornament — the pool's
    //   "万金油" chapter id (`@/narrative`'s own doc comment: never a member
    //   of any strategy's `identityTendencies`). Appended alongside
    //   `roman-chapter` purely for the modulus-escape reason documented
    //   below, not for its own competing character claim — its plain,
    //   unadorned register doesn't contradict roman-chapter's literary one,
    //   it just never outweighs it (both share `TENDENCY_WEIGHT`, so
    //   whichever the deterministic sampler favors for a given seed is
    //   still one of journal's own two honest picks).
    // - ending `poster-ending` (read `ending-poster-ending.tsx`): fully
    //   centered, italic serif heading + italic subheading + a short accent
    //   bar — the same italic-serif literary voice journal's own
    //   `editorial-masthead` cover already opens with (that layout's own
    //   "centered literary masthead + italic subheading" register), now
    //   closing the deck in the same voice it opened in. Not in
    //   `briefing.identityTendencies.ending` (`["masthead-ending",
    //   "banner-ending"]`).
    //
    // Real-pull verification (direct `resolveLayoutId` sweep, same
    // technique the themes-16 wave's T2/T3 reviewers used, against this
    // repo's `theme-structure.test.ts` fixture at seed=1, strategy
    // `briefing`): a *single* appended id on `chapter` cannot fix the first
    // chapter slide (fixture index 1) without colliding — same modulus
    // mechanism as consulting's ending above (`variety.ts`'s
    // `target = hash % totalWeight`): any single append moves the chapter
    // pool's modulus from 12 to 14 regardless of which id is appended, and
    // the fixed hash for this fixture's `chapter-layout:1` salt always
    // lands on `fashion-chapter` at that modulus — a value already occupied
    // (together with journal's own already-live `poster-center` cover pick
    // at this fixture) by academic's and runway's own pre-existing
    // sequences. A second appended id (modulus 16) opens a previously
    // unreachable bucket: `[masthead-chapter, roman-chapter,
    // tone-adaptive-chapter]` resolves to `constellation-chapter` at fixture
    // index 1 and to `roman-chapter` itself at fixture index 4 (the deck's
    // second chapter slide) — both distinct from every other theme. `ending`
    // only needed a single append here (`poster-ending`) precisely because
    // this chapter fix already moved journal off the crowded
    // `poster-center` + `fashion-chapter` bucket group other themes share.
    layoutTendencies: {
      cover: ["editorial-masthead"],
      // Second-front wave (2026-08-22)。chapter 与 ending 保持已声明不动
      // （declaration-rebalance wave 实测挑出来的那两格）。四轴按提案 1.3
      // 重建，不当仓内事实：C / top-band / light / medium（封面
      // `editorial-masthead` 居中，corner-ornament-motif v2 是顶缘文武双线，
      // `gapScale` 1.1）。无冲突行。
      // - content `narrow-column` + `two-column`：期刊本来的窄栏与双栏。
      //   后者与 briefing 重合，真实拉力来自窄栏。
      chapter: ["masthead-chapter", "roman-chapter", "tone-adaptive-chapter"],
      content: ["narrow-column", "two-column"],
      ending: ["masthead-ending", "poster-ending"],
    },
  },
  // enterprise（原 custom→gallery 二次返工，2026-07-10）：白墙+正 IKB+accent
  // 的高色彩版式组合，banner 横幅 baked 白字在 IKB #002FA7 上对比充足（无需
  // 排除 banner-heading）。（accent 当时是炸橘，第四轮评审换成工业蓝，蓝配橙
  // 入禁忌——见 `themes/enterprise.ts` 的文件头。版式选择不受影响。）
  //
  // cover 声明（theme-structure-allocation wave）：分配表给 enterprise 的四轴
  // 是 左轴 / top-band / medium / tight，cover-picks = banner-title +
  // split-diagonal。tight 那一档是关键——Swiss 网格的紧排，两个候选都是「先用
  // 一块实心几何切开画面，再把标题压进去」的构图：
  //   - `banner-title`：满宽深色横幅 + 横幅内标题，top-band 这一轴最直白的读法。
  //     briefing.identityTendencies.cover 已经把它锁在权重 3，所以它单独声明是
  //     空转；保留它是因为它确实是这个主题的母语，追加而非替换（declaration-
  //     rebalance wave 裁定 1 的先例）。
  //   - `split-diagonal`：IKB 色块以硬斜切线收边——正 IKB 的整块蓝配一道果断的
  //     斜切，比横幅更紧、更有工业感。它不在 briefing 的 cover 集合里，
  //     max(3,1)=3，是这一对里真正产生边际权重的那个。
  enterprise: {
    layouts: { cover: ["band-title"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    // 2026-07-10 motif 全覆盖：IKB 方块秩序
    motif: "enterprise-motif",
    layoutTendencies: {
      cover: ["band-title"],
      // Second-front wave (2026-08-22)，四轴 L / top-band / medium / tight：
      // - chapter `constellation-chapter` + `banner-chapter`：IKB 方块秩序
      //   在断章上读作左侧巨号加底部细线，或整版蓝压白字。两个 id 里
      //   `constellation-chapter` 与 briefing 重合，真实边际来自满版断言。
      // - content `bento-panel` + `two-column`：content 就是方块本身（拼盘
      //   + 双栏）。后者与 briefing 重合，真实拉力来自拼盘。
      // - ending `rail-ending` + `constellation-ending`：角落色块接同一套
      //   几何。两个 id 都不在 briefing 的 ending 偏好里。
      chapter: ["constellation-chapter", "banner-chapter"],
      content: ["bento-panel", "two-column"],
      ending: ["rail-ending", "constellation-ending"],
    },
  },
  // luxe（原 retail 黑金重定位，2026-07-10）：黑金深底 poster 家族，
  // readableOn 出深字。
  //
  // cover 声明（theme-structure-allocation wave）：luxe 与 heritage 曾是审计
  // 实测出的「孪生对」——双双全盲，同 IR 同 seed 渲染出逐字节相同的结构。会话 0
  // 裁决 1 判它们彻底分开、不砍不并，用四轴全岔根治：luxe = 居中 / bottom-right
  // / light / airy（黑金请柬的大留白），heritage = 左轴 / bottom-left / medium /
  // medium（藏书票的密排）。封面族也随之分开：
  //   - `poster-center`：引首 + 居中大标题，中轴对称的请柬构图，airy 那一档的
  //     天然归宿。briefing 已锁权重 3，单独声明空转，保留为真实主张。
  //   - `fashion-masthead`：满版 primary 深底 + 超大报头 + 极简 meta 行，黑金
  //     在这块满版底上正是它最贵的样子。不在 briefing 的 cover 集合里，
  //     max(3,1)=3，是这一对里产生边际权重的那个。与 runway 共用同一构造：
  //     runway 是 #0A0A0A 上的时装刊，luxe 是黑底烫金请柬——layout 零 baked
  //     hex，全吃 ctx.colors，同一构图两种气质。
  luxe: {
    // board-cover-restore wave 2 (parameter gap, no new ids): lock poster-center.
    layouts: { cover: ["poster-center"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    // 2026-07-10 motif 全覆盖：烫金细线（原 P3「motif 可选」验证品，补齐）
    motif: "luxe-motif",
    layoutTendencies: {
      cover: ["poster-center"],
      // Second-front wave (2026-08-22)，四轴 C / bottom-right / light / airy：
      // - chapter `roman-chapter` + `banner-chapter`：请柬用罗马数字分节，
      //   整版黑底压金字是另一张脸。两个 id 都不在 briefing 的 chapter
      //   偏好里。
      // - content `quiet-frame` + `tone-adaptive-content`：池里最安静的两个，
      //   airy 那一档。两个 id 都不在 briefing 的 content 偏好里。
      // - ending 三元集 `masthead-ending` + `poster-ending` + `fashion-ending`：
      //   居中报头、居中海报、满版收官三张脸都属于黑金请柬。`masthead-ending`
      //   与 briefing 重合，后两个是真实边际。三元是设计主张，不是排位让位。
      chapter: ["roman-chapter", "banner-chapter"],
      content: ["quiet-frame", "tone-adaptive-content"],
      ending: ["masthead-ending", "poster-ending", "fashion-ending"],
    },
  },
  // campaign（活力营销，2026-07-13 memphis 拆分 A）：深紫底多彩笔刷由专属
  // campaign-motif 承载。
  //
  // cover 声明（theme-structure-allocation wave）：分配表四轴 = 居中 /
  // bottom-left / heavy / medium。heavy 是全表唯一的一档装饰权重（多彩笔刷
  // 本来就是全表最重的 motif），所以封面构造反而要让位——把画面中轴让出来给
  // motif，标题居中站上去：
  //   - `poster-center`：引首 + 居中大标题，营销舞台的正面构图。briefing 已锁
  //     权重 3，单独声明空转，保留为真实主张。
  //   - `split-diagonal`：深紫色块以硬斜切线收边——笔刷的斜向笔势和这道斜切是
  //     一路的。不在 briefing 的 cover 集合里，max(3,1)=3，产生真实边际权重。
  campaign: {
    // board-cover-restore wave 2 (parameter gap, no new ids): lock poster-center.
    layouts: { cover: ["poster-center"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "campaign-motif",
    layoutTendencies: {
      cover: ["poster-center"],
      // Second-front wave (2026-08-22)，四轴 C / bottom-left / heavy / medium：
      // - chapter `fashion-chapter` + `rail-chapter`：满版强调色断章接笔刷的
      //   斜势，居中巨标压整版色是舞台正面。两个 id 都不在 briefing 的
      //   chapter 偏好里。
      // - content `stacked-poster` + `side-highlight`：主视觉压顶加常驻高亮栏。
      //   两个 id 都不在 briefing 的 content 偏好里。
      // - ending `fashion-ending` + `constellation-ending`：满版收官加签名条。
      //   两个 id 都不在 briefing 的 ending 偏好里。
      chapter: ["fashion-chapter", "rail-chapter"],
      content: ["stacked-poster", "side-highlight"],
      ending: ["fashion-ending", "constellation-ending"],
    },
  },
  // classroom（教学课堂，2026-07-13 第 13 主题）：讲义雾蓝 + 拍纸簿装饰由
  // 专属 classroom-motif 承载（2026-08-20 柔和组重设计，同一个 motif 也是
  // bloom 的锚点）。chapter 曾排除 fashion-chapter（W4 fix
  // round 新发现），post-v0.3 W8 fix round 随 readableOn 根因修复一起撤销
  // ——见上方 LAYOUTS 块注释。
  // cover 声明（theme-structure-allocation wave）见 `CLASSROOM_STRUCTURE`
  // 的文档注释——那个对象同时是 bloom 的结构行，两家共用一份引用。
  classroom: {
    layouts: CLASSROOM_LAYOUTS,
    motif: "classroom-motif",
    layoutTendencies: CLASSROOM_STRUCTURE,
  },
  // bloom（柔美庆典，2026-07-13 memphis 拆分 B）：chapter 曾排除
  // fashion-chapter，post-v0.3 W8 fix round 撤销——见上方 LAYOUTS 块注释。
  // bloom 的结构身份就是 classroom 的结构身份，共用同一个对象——**这是声明的
  // 同构（palette preset），不是遗漏**。理由、红线和测试怎么钉，全写在
  // `CLASSROOM_STRUCTURE` 的文档注释里。
  // motif 本轮（2026-08-20 柔和组）改指 `classroom-motif`：bloom 专属的
  // 水彩 motif 随色板一起退役，preset 从此连装饰几何也是同一份，渲出来的是
  // bloom 自己的樱粉色板。bloom 这个 theme id 永不删除的红线不变。
  bloom: {
    layouts: CLASSROOM_LAYOUTS,
    motif: "classroom-motif",
    layoutTendencies: CLASSROOM_STRUCTURE,
  },
  // ink（水墨国风，2026-07-10 真创意子类②，用户点名例子）：宣纸/墨/朱砂/
  // 楷体靠 tokens + 专属 ink-motif。**v3 重设计（2026-08-18 第一期）**把
  // motif 换成了右缘落款列 + 一角残山（旧的版框线/大远山/旧印位全部删，见
  // `../svg/motifs/motif-ink-motif.tsx` 的文件头），页脚 chrome 的两个抑制
  // 开关见上方 `BRANDS.ink`。
  //
  // layoutTendencies（本期新声明——ink 此前是 `structure-map.md` 点名的七个
  // 「全盲」主题之一：不声明任何结构倾向，同 IR 同 seed 与其它全盲主题渲染
  // 出逐字节相同的版式序列）。定稿分配表给 ink 的四轴是
  // 左轴 / side-rail / light / airy，cover-picks 是 colophon + fashion-masthead：
  //   - cover `colophon`：本期新造的构造（`../svg/layouts/cover-colophon.tsx`），
  //     左轴大标题 + 引首块，右边界收在 x1180——它和落款列（x>=1220）是配套
  //     设计的一对，side-rail 这一轴的完整表达只在这个组合里成立。
  //   - cover `fashion-masthead`：第二选择，满版焦墨底 + 超大报头。与 ink 的
  //     「素」不冲突：宋人也画过满幅浓墨，且这是 runway 之外无人声明的构造，
  //     两个 cover 候选让抽签结果不至于只有一种脸。
  //   - content `quiet-frame` / `narrow-column`：分配表的 airy 留白档在 content
  //     池里就这两位——一个居中留白框、一个窄单栏，都是「疏可走马」那一路。
  //     content 页型此前全 17 主题无人声明（`inventory.md` 的第二病），ink 是
  //     第一个开口的。
  //   - chapter / ending 本期不声明：chapter-inkfield 与 ending-seal 两个构造
  //     推到二期（decisions.md），在它们落地之前，从通用池里硬挑一个 id 只是
  //     为了填表，不是结构判断。
  ink: {
    // board-cover-restore wave 2 (parameter gap, no new ids): lock colophon
    // (ink 1a geometry already frozen). Drop fashion-masthead from cover
    // tendencies. Second face is full-bleed ink and fights the colophon rail.
    layouts: { cover: ["colophon"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "ink-motif",
    layoutTendencies: {
      cover: ["colophon"],
      // Second-front wave (2026-08-22)，四轴 L / side-rail / light / airy：
      // 覆盖本条目上方「chapter / ending 本期不声明」的旧裁剪。content 保持
      // 已声明的 quiet-frame 加窄栏。
      // - chapter `roman-chapter` + `tone-adaptive-chapter`：罗马数字旁的圆弧
      //   意象与一角残山同一路，tone-adaptive 只留一枚角落水印，都是
      //   「疏可走马」。两个 id 里后者是万金油，任何叙事下都拿满额边际。
      // - ending `tone-adaptive-ending` + `poster-ending`：素落款加居中海报
      //   式收尾。前者是万金油 id。
      chapter: ["roman-chapter", "tone-adaptive-chapter"],
      content: ["quiet-frame", "narrow-column"],
      ending: ["tone-adaptive-ending", "poster-ending"],
    },
  },
  // heritage（第 8 主题，2026-07-10）：勃艮第×焦糖 putty 浅底混搭，酒红横幅
  // 上 baked 白字对比充足。chapter 曾排除 fashion-chapter，post-v0.3 W8 fix
  // round 撤销——见上方 LAYOUTS 块注释。
  // cover 声明（theme-structure-allocation wave）：heritage 是上面 luxe 那条
  // 注释里的孪生另一半，四轴取 左轴 / bottom-left / medium / medium 与 luxe
  // 全岔。封面族也整族让开——luxe 走 poster/fashion，heritage 走 masthead/
  // anchor，两家不再共用任何一个 cover id：
  //   - `editorial-masthead`：顶部双规则线 + 衬线报头，藏书票和扉页的排印惯例，
  //     勃艮第配焦糖正是这套排印的底色。不在 briefing 的 cover 集合里，
  //     max(3,1)=3，真实边际权重。与 journal 共用同一构造（journal 是人文期刊
  //     的黑白报头，heritage 是酒红典藏），layout 零 baked hex。
  //   - `left-anchor`：左侧竖向色条 + 左上标题，密排那一路的起手式，bottom-left
  //     的 meta 轴在这个构图里落得最自然。同样不在 briefing 里，真实边际权重。
  heritage: {
    // board-cover-restore wave 2 (parameter gap, no new ids): lock
    // editorial-masthead. Drop left-anchor from cover tendencies.
    layouts: { cover: ["editorial-masthead"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    // 2026-07-10 motif 全覆盖：典藏纹饰（徽记/角花/页缘线）
    motif: "heritage-motif",
    layoutTendencies: {
      cover: ["editorial-masthead"],
      // Second-front wave (2026-08-22)，四轴 L / bottom-left / medium / medium：
      // - chapter `masthead-chapter` + `roman-chapter`：藏书票的分节是罗马数字
      //   与文武线。前者与 briefing 重合，真实边际来自罗马数字。
      // - content `two-column` + `asymmetric-triptych`：密排（双栏与三区）。
      //   前者与 briefing 重合，真实拉力来自三区。
      // - ending `rail-ending` + `poster-ending`：左下角色块正落在它的
      //   bottom-left meta 轴上。两个 id 都不在 briefing 的 ending 偏好里。
      chapter: ["masthead-chapter", "roman-chapter"],
      content: ["two-column", "asymmetric-triptych"],
      ending: ["rail-ending", "poster-ending"],
    },
  },
  // pulse（医疗健康/生命科学，2026-07-28 themes-16 wave task T1，第 14 主题）：
  // 极浅薄荷白底+深青绿主色的清洁诊疗气质，细脉搏线+胶囊/细胞圆点簇由专属
  // pulse-motif 承载。pulse 没有 legacy 预兆代码可提炼（不像 academic/tech
  // 等六个既有声明主题那样有自己的原生 layout 家族——那六家各自占用
  // cover/chapter/ending 三池里互不重叠的一整个「家族」：banner/poster/
  // rail/constellation/fashion/masthead），layoutTendencies 因此从通用
  // layout 池里挑选气质相符的 id（plan 裁定 3）：
  //   - cover `split-diagonal`：primary 色块以硬斜切线收边，标题在净空区
  //     跨近斜切线——一道果断的斜切像心电图尖峰的陡直落笔，呼应 pulse 自己
  //     的脉搏节律气质，同时是 P3「新表达」layout，不与任何既有声明
  //     主题的 cover 家族重合（重合仅 strategy 层的 instructional 一家，
  //     不与默认 briefing 重合）。
  //   - chapter `tone-adaptive-chapter`：居中大标题+右下角编号水印，朴素
  //     无花哨——`narrative/index.ts` 里明确"从不出现在任何 strategy 的
  //     identityTendencies 字段里"的三个"万金油" identity layout 之一
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
    layouts: { cover: ["horizon-wedge"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "pulse-motif",
    layoutTendencies: {
      cover: ["horizon-wedge"],
      // Second-front wave (2026-08-22)。四轴按提案 1.3 重建，不当仓内事实：
      // L / top-band / light / medium（封面 `horizon-wedge` 底缘缓坡，pulse-motif
      // v2 顶缘一条心电线，`gapScale` 1）。与 academic 的反推值全同。
      // - chapter `rail-chapter` 追加：点轨读作疗程推进，与顶缘那一条心电线
      //   同一句话。既有 `tone-adaptive-chapter` 是万金油，这一格本来就有
      //   真实边际，rail 是第二张脸。
      // - content `rail-numbered` + `quiet-frame`：编号条目加留白框，清洁诊疗。
      //   前者与 briefing 重合，真实拉力来自留白框。
      // - ending `tone-adaptive-ending` 追加：`banner-ending` 今天空转（它正是
      //   briefing 自己偏好的 id），追加最素的落款把它变成真声明。与 tech
      //   chapter 同一枚空转缺陷。
      chapter: ["tone-adaptive-chapter", "rail-chapter"],
      content: ["rail-numbered", "quiet-frame"],
      ending: ["banner-ending", "tone-adaptive-ending"],
    },
  },
  // terra（可持续/ESG，2026-07-28 themes-16 wave task T2，第 15 主题）：
  // 沙色底+橄榄绿主色的朴素大地气质，等高线+叶脉/种子点由专属 terra-motif
  // 承载。同 pulse 一样没有 legacy 预兆代码可提炼，layoutTendencies 从通用
  // layout 池里挑（plan 裁定 3）——挑选时先盘点 8 个既有声明主题（含
  // pulse）已经用掉的 id：cover 池 8 个 id 里 7 个已被声明（banner-title/
  // poster-center/left-anchor/constellation/fashion-masthead/editorial-
  // masthead/split-diagonal），ending 池 7 个里 6 个已被声明（banner-ending/
  // poster-ending/rail-ending/constellation-ending/fashion-ending/masthead-
  // ending）——两池各自只剩一个从未被任何主题声明过的 id：
  //   - cover `tone-adaptive-header`：唯一零主题重合的 cover id，同时是
  //     `narrative/index.ts` 里"从不出现在任何 strategy 的 identityTendencies
  //     字段里"的万金油 identity layout——自适应留白的克制封面，恰好呼应
  //     terra「朴素、根系」气质里"朴素"的那一半：不靠硬构图抢眼，靠底色和
  //     motif 本身的地形线说话。
  //   - ending `tone-adaptive-ending`：唯一零主题重合的 ending id，同 cover
  //     一样是万金油 identity layout，零 strategy 重合——"长期主义"收尾
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
    // board-cover-restore wave 2 (parameter gap, no new ids): lock tone-adaptive-header.
    layouts: { cover: ["tone-adaptive-header"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "terra-motif",
    layoutTendencies: {
      // theme-structure-allocation wave 增补 `left-anchor`：分配表给 terra 的
      // meta 轴是 bottom-left，而 tone-adaptive-header 的 meta 落在右下角——
      // 单靠它一个，terra 的 meta 轴在封面上没有任何一个构造真的表达出来。
      // left-anchor 的左侧竖条 + 左上标题 + 左下落款正好补上这一半，也让
      // terra 的封面不再只有一张脸（tone-adaptive-header 是唯一候选时，抽签
      // 结果恒定）。它同时是 consulting/academic/heritage 已声明的 id，但
      // 这三家的 cover 集合与 terra 各不相同（consulting 配 banner-title、
      // academic 单声明、heritage 配 editorial-masthead），四家的权重向量
      // 两两不同。
      cover: ["tone-adaptive-header"],
      // Second-front wave (2026-08-22)。覆盖本条目上方「chapter 轴刻意不声明」
      // 的旧裁剪。四轴按提案 1.3 重建，不当仓内事实：L / bottom-left / light /
      // medium（`definitions.ts` 明写 meta 轴是 bottom-left，terra-motif v2
      // 左下等高线簇且板上自称 light 档，`gapScale` 1）。与 consulting 的
      // 记录值全同，正式取值以仓外定稿表为准。
      // - chapter `rail-chapter` + `poster-chapter`：平缓推进的点轨与左轴巨号，
      //   都是等高线那一路。两个 id 里前者不在 briefing 的 chapter 偏好里
      //   （rail-chapter 不在 masthead/constellation 里），两个都有真实边际。
      // - content `quiet-frame` + `two-column`：留白框加报告双栏。后者与
      //   briefing 重合，真实拉力来自留白框。
      // - ending `rail-ending` 追加：保留已声明的素落款，追加左下角色块对上
      //   它的 meta 轴。后者不在 briefing 的 ending 偏好里。
      chapter: ["rail-chapter", "poster-chapter"],
      content: ["quiet-frame", "two-column"],
      ending: ["tone-adaptive-ending", "rail-ending"],
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
  // 实测穷举（`resolveLayoutId` 直连，同 T2 terra 的 brute-force 方法，
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
    layouts: { cover: ["corner-wedge"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "ember-motif",
    layoutTendencies: {
      // cover 硬锁 `corner-wedge`。板上是右下火橙角楔，标题留左纸面，meta
      // 反白入楔。`split-diagonal` 是全高侧栏，画不出这只角楔。
      cover: ["corner-wedge"],
      // Second-front wave (2026-08-22)，四轴 C / bottom-right / medium / medium：
      // - chapter 三元集：保留已声明的里程碑点轨，追加满版断言横幅与序号断章
      //   （后者与已声明的 `constellation-ending` 首尾同族）。三元集是 chapter
      //   池排不开时的让位追加，不是三份主张。三个 id 里 `constellation-chapter`
      //   与 briefing 重合，另外两个有真实边际。
      // - content `stacked-poster` + `banner-heading`：主视觉加断言横幅。后者
      //   与 briefing 重合，真实拉力来自主视觉。
      // - ending `tone-adaptive-ending` 追加：既有签名条加最素的落款。后者是
      //   万金油 id。
      chapter: ["rail-chapter", "banner-chapter", "constellation-chapter"],
      content: ["stacked-poster", "banner-heading"],
      ending: ["constellation-ending", "tone-adaptive-ending"],
    },
  },
  // vermilion（庄重公务汇报，2026-08-06 gov-theme wave，第 17 主题）：暖米白底
  // + 正红主色的庄重红金公务气质，旗帜感绸带弧线 + 金色光芒细线由专属
  // vermilion-motif 承载。同 pulse/terra/ember 一样没有 legacy 预兆代码可提炼，
  // layoutTendencies 从通用 layout 池里挑气质相符的 id（plan 裁定 3：汇报体
  // 的结构性格 = banner 族「横幅/庄重」+ rail 族「条理」，避开与 consulting
  // 完全同套）。cover/chapter/ending 三池的 id 到 ember 落地时已被既有 9 个
  // 声明主题全占（cover 8/8、chapter 除 roman-chapter 外全占、ending 7/7），
  // 故不找「未占用 id」，改用 brief 指定的工具：复用 id + 组合交互 + 部分声明
  // （ember 先例）。真穷举（`resolveLayoutId` 直连，同 T2/T3 的 brute-force
  // 方法，脚本临时写在仓库外未入库）先按 ruling 3 气质挑候选，逐一在
  // `theme-structure.test.ts` 同款 fixture（seed=1，默认 briefing）实测——
  // 关键发现：**chapter/ending 各自单声明只收敛到少数可达结果**（chapter 非
  // masthead/constellation 单声明全落 fashion-chapter@idx1，ending 单声明只落
  // masthead/banner/poster-ending 三者之一，同 ember 注释详述的硬币），最初
  // 选的 {chapter:[banner-chapter], ending:[rail-ending]} 与 **ember 完整序列
  // 逐字节相同**（两者都塌进同一组桶）。最终选组合交互更强的一组：
  //   - chapter `["banner-chapter", "rail-chapter"]`（两 id 都是真实性格主张，
  //     非纯 modulus-escape）：banner-chapter = 居中白字压整版 primary 正红
  //     色块，正是本主题 chapter 默认背景（正红整版）+ readableOn 反白的具象
  //     读法，庄重红底白字的断章正是汇报体的签名；rail-chapter = 底部进度点轨，
  //     「第 N 章」的条理读法。**两 id 均有真实边际权重**（都不在
  //     briefing.identityTendencies.chapter=["masthead-chapter",
  //     "constellation-chapter"] 里，max(3,1)=3）。二元集合把 chapter 模数从
  //     单声明的塌缩桶里撬开，在本 fixture 上 idx1 落 constellation-chapter、
  //     **idx4 真的落到 banner-chapter**（签名红断章在 fixture 里实际浮现，
  //     不是纯软权重空转）。复用 consulting 的 banner-chapter / academic 的
  //     rail-chapter，但两者是麦肯锡藏青 / BCG 绿，vermilion 是正红金黄——
  //     归档件零 baked hex 全吃 ctx.colors，同一构图两种气质。
  //   - ending `rail-ending`（角落色块 + 显式「Contact」区块 + 版权）：条理化
  //     的收尾，像一份报告的落款联系页——汇报体的收尾正是「联系方式 + 落款」
  //     而非煽情告别。**有真实边际权重**（不在 briefing.ending=["masthead-
  //     ending", "banner-ending"] 里，max(3,1)=3）。本 fixture/seed 上采样落到
  //     banner-ending（同属「Contact 区块 + 版权」的务实收尾家族，语域一致，
  //     是 rail-ending 软权重在这枚种子上的实际着陆点，非另一种气质）。
  //   - cover 轴刻意不声明（Partial 裁剪，terra/ember 先例）：cover 池对本
  //     fixture/seed 的单声明只收敛到 banner-title 或 poster-center 两个可达
  //     结果（ember 注释已详述：briefing 已把两者锁到权重 3，任何第三个 cover
  //     id 的声明要么零边际权重、要么被同一固定哈希打进 poster-center 桶），
  //     无真实分化空间。汇报封面的庄重红金身份本就由红色结构型 layout
  //     （banner-title 红强调条——浅底红字直接达标 / left-anchor 40% 红块与
  //     split-diagonal 红斜切——readableOn 反白）+ 红金 motif 承载，不靠声明一个零区分度的 cover
  //     tendency——没有区分度的声明是噪音，裁剪比硬凑更诚实。
  // 实测校验（`theme-structure.test.ts` 的「每个声明主题的 resolveSequence
  // 两两不同」+ divergence）：vermilion 完整 resolveSequence（seed=1）=
  // ["banner-title", "constellation-chapter", "tone-adaptive-content",
  // "split-band", "banner-chapter", "banner-heading", "banner-ending"]，与其余
  // 9 个既有声明主题（含 pulse/terra/ember）逐一比对均不同，也不与 7 个未声明
  // 主题共享的默认序列相同（派生结果见 task-1-report.md）。
  vermilion: {
    layouts: { cover: ["band-title"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "vermilion-motif",
    layoutTendencies: {
      // cover 声明（theme-structure-allocation wave，覆盖本条目上方注释里
      // 「cover 轴刻意不声明」的旧裁剪；第二个 id 由 inert-declaration fix
      // 于 2026-08-19 修正）。
      //
      // 分配表原本给的是 banner-title + poster-center，而这两个恰好就是
      // `briefing.identityTendencies.cover` 的全部成员——`Math.max(3,3)=3`，
      // 默认叙事下 vermilion 的封面抽签与完全不声明逐字节相同。这不是「弱
      // 声明」，是穿着声明外衣的空声明。分配表按结构轴画的时候没有对照
      // 合成规则核算，本次修正，并把这一整类写成守卫测试
      // （`theme-structure.test.ts` 的「every structural identity names at
      // least one cover id the default narrative does not already favor」）。
      //
      //   - `banner-title` 保留：顶上一条红横幅压住标题，红头文件的封面本来
      //     就长这样，这是真话，不因为 briefing 也这么想就变成假话。按
      //     declaration-rebalance wave 裁定 1 的先例，追加而不是替换。
      //   - `tone-adaptive-header` 接上（实证不在 briefing 集合里，且是
      //     `narrative/index.ts` 明确「从不出现在任何 strategy 的
      //     identityTendencies 里」的万金油 identity layout——在**任何**叙事
      //     下都拿满额边际权重，不只是默认这一档）：左上机构名、右上密级
      //     徽标、近底一条规则线、右下日期。这正是一份公文抬头的物理顺序
      //     ——发文机关在上，密级在侧，红线一道，成文日期落在右下角。
      //     classroom 与 terra 也声明了它，但三家的 cover 集合各不相同
      //     （classroom 配 banner-title、terra 配 left-anchor），权重向量
      //     两两不同。
      cover: ["band-title"],
      // Second-front wave (2026-08-22)，四轴 C / top-band / medium / medium：
      // - chapter 保持不动（banner + rail 已是汇报体的签名）。
      // - content `rail-numbered` + `split-band`：通栏头带正是红头文件那一条
      //   红头，条目走编号。前者与 briefing 重合，真实拉力来自通栏头带。
      // - ending `banner-ending` 追加：既有条理落款加联系页收尾。后者与
      //   briefing 重合，真实边际仍来自既有的 `rail-ending`。
      chapter: ["banner-chapter", "rail-chapter"],
      content: ["rail-numbered", "split-band"],
      ending: ["rail-ending", "banner-ending"],
    },
  },
  // crayon（蜡笔卡纸，2026-08-21 场景审计 #27 第六组新主题·低龄教育）：卡纸奶油底 + 蜡笔
  // 四原色，页缘蜡笔描边由专属 crayon-motif 承载。结构行 L / top-band /
  // heavy / medium，最近邻 classroom（L / top-band / medium / medium），
  // 装饰浓度岔开——classroom 是拍纸簿的 medium，crayon 是满场 heavy 在密页
  // 降成顶＋底半场。封面构造：
  //   - `tone-adaptive-header`：克制的自适应留白封面，标题黑字写在卡纸上、
  //     蓝带只到顶（封面样例自己的读法）。`narrative/index.ts` 明确「从不
  //     出现在任何 strategy 的 identityTendencies 里」的万金油 identity
  //     layout 之一，默认 briefing 下拿满额边际权重（max(3,1)=3），是这一
  //     对里真正把 crayon 从盲主题默认序列上撬开的那一个。
  //   - `banner-title`：整幅深色横幅压住标题，板书带的读法。briefing 已锁
  //     权重 3，单独声明空转，保留为真实主张（declaration-rebalance wave
  //     裁定 1 的追加先例）。写在第二个，3:1 软权重照现有写法，两个 id
  //     都拿 TENDENCY_WEIGHT。
  // layouts 仍是四页型全集（各家无一收窄，heavy 身份用 motif 降档表达，
  // 不靠策展砍 layout）。
  crayon: {
    layouts: { cover: ["header-band"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "crayon-motif",
    layoutTendencies: {
      cover: ["header-band"],
      // Second-front wave (2026-08-22)，四轴 L / top-band / heavy / medium：
      // - chapter `fashion-chapter` + `tone-adaptive-chapter`：满版原色断章加
      //   角落水印，heavy 的量在色不在件。后者是万金油 id。
      // - content `tone-adaptive-content` + `stacked-poster`：最朴素的讲义页
      //   加主视觉堆叠。两个 id 都不在 briefing 的 content 偏好里。
      // - ending `banner-ending` + `poster-ending`：联系方式加居中海报式收尾。
      //   前者与 briefing 重合，真实边际来自海报收尾。
      chapter: ["fashion-chapter", "tone-adaptive-chapter"],
      content: ["tone-adaptive-content", "stacked-poster"],
      ending: ["banner-ending", "poster-ending"],
    },
  },
  // arena（竞技场紫黑，2026-08-21 场景审计 #27 第六组新主题·娱乐电竞）：紫黑灯灭 + 电光绿 HUD，由专属
  // arena-motif 承载。结构行 center / bottom-left / heavy / tight，最近邻
  // campaign（C/BL/heavy/medium），岔在留白轴。封面硬锁 `corner-wedge`：
  // 板上是居中标题加右下品红角楔。`split-diagonal` 是全高侧栏，不是这只楔。
  arena: {
    layouts: { cover: ["corner-wedge"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "arena-motif",
    layoutTendencies: {
      cover: ["corner-wedge"],
      // Second-front wave (2026-08-22)，四轴 C / bottom-left / heavy / tight：
      // 覆盖本条目上方「chapter / ending 不声明」的旧裁剪。
      // - chapter `banner-chapter` + `fashion-chapter`：两式满版（整版紫黑压
      //   白字、满版电光绿）。两个 id 都不在 briefing 的 chapter 偏好里。
      // - content `split-band` + `side-highlight`：通栏头带加常驻侧栏，正是
      //   HUD 的读法。两个 id 都不在 briefing 的 content 偏好里。
      // - ending `fashion-ending` + `banner-ending`：满版收官加联系页。后者
      //   与 briefing 重合，真实边际来自满版收官。
      chapter: ["banner-chapter", "fashion-chapter"],
      content: ["split-band", "side-highlight"],
      ending: ["fashion-ending", "banner-ending"],
    },
  },
  // museum（博物，2026-08-21 鹦鹉站气质立项）：棕黑厅堂 + 衬线 + 展签铜金。
  // 无 motif——落地版的展签框 + 四角针点被用户终审裁撤（2026-08-21：四角
  // 装饰「没必要，也太丑」），气质全部由色板与衬线排印承担，装饰浓度为
  // none（runway 先例之后第二家）。结构行 C / top-band / none / airy，最近邻
  // insight（C / top-band / light / tight），岔在留白轴。封面构造
  // poster-center / editorial-masthead（与 insight 同构图，insight 是夜刊、
  // museum 是展厅，layout 零 baked hex）：
  //   - `poster-center`：展览开幕的正面站位。briefing 已锁权重 3，单独声明
  //     空转，保留为真实主张（裁定 1 的追加先例）。
  //   - `editorial-masthead`：衬线报头，目录册封面。不在 briefing 的 cover
  //     集合里，max(3,1)=3，产生真实边际权重。
  // chapter / ending / content 不声明：身份靠封面 + light motif + airy
  // gapScale，不靠再声明一个与 insight 同形的轴去硬凑区分度。
  museum: {
    // board-cover-restore wave 2 (parameter gap, no new ids): lock poster-center.
    // editorial-masthead is the second face, deferred.
    layouts: { cover: ["poster-center"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    layoutTendencies: {
      cover: ["poster-center"],
      // Second-front wave (2026-08-22)，四轴 C / top-band / none / airy：
      // 覆盖本条目上方「chapter / ending / content 不声明」的旧裁剪。
      // - chapter `masthead-chapter` + `poster-chapter`：双细线与展签编号。
      //   前者与 briefing 重合，真实边际来自编号分节。
      // - content `narrow-column` + `asymmetric-triptych`：窄栏加三区展签。
      //   两个 id 都不在 briefing 的 content 偏好里。
      // - ending `masthead-ending` + `constellation-ending`：居中报头加签名条，
      //   厅堂不喊。前者与 briefing 重合，真实边际来自签名条。
      chapter: ["masthead-chapter", "poster-chapter"],
      content: ["narrow-column", "asymmetric-triptych"],
      ending: ["masthead-ending", "constellation-ending"],
    },
  },
  // stage（黑场，2026-08-21 huashu 风格库 Top 5 第 3）：冷玄黑 + sans +
  // 哑银，**无 motif**。结构行 C / bottom-right / none / airy，最近邻
  // luxe（C / bottom-right / light / airy），岔在 decor 轴——无框对请柬框。
  // runway 已占 L / bottom-left / none / airy，heading 与 meta 都岔开。
  // 封面锁定 `poster-center`（板面是居中巨字海报，构图已被池中
  // poster-center 覆盖。历史曾软倾向 poster-center / tone-adaptive-header）。
  // chapter / ending 的 layouts 收窄待下版本设计板后锁定。content 走全集加
  // 分配表倾向。statement 是 pinOnly，不进倾向池。
  stage: {
    // 第七波封面保真：板面是居中巨字海报。构图已被 poster-center 覆盖
    // （typeScale 1.5 把 100px 提到展示级）。收窄 cover 池，软倾向保不住
    // 「一模一样」。docs/themes.md 写明的作者主动权，首次动用。
    // chapter / ending 的 layouts 收窄待下版本设计板后锁定。
    layouts: { cover: ["poster-center"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    // motif 刻意不配：无框就是身份。runway 是「大片排印」的 none，stage
    // 是「黑场」的 none，用 heading / meta 两轴分开。照 runway 先例留空，
    // 不是漏写（theme-structure.test.ts 把两家一起钉成合法例外）。
    layoutTendencies: {
      cover: ["poster-center"],
      // Second-front wave (2026-08-22)，四轴 C / bottom-right / none / airy：
      // chapter / content / ending 走分配表软倾向。layouts 收窄仍待设计板。
      // - chapter `constellation-chapter` + `tone-adaptive-chapter`：空场只留
      //   一枚序号或一枚水印。前者与 briefing 重合，真实边际来自万金油水印。
      // - content `quiet-frame` + `side-highlight`：留白框加常驻侧栏。两个 id
      //   都不在 briefing 的 content 偏好里。
      // - ending `masthead-ending` + `fashion-ending`：居中报头加满版黑场收官。
      //   前者与 briefing 重合，真实边际来自满版收官。
      chapter: ["constellation-chapter", "tone-adaptive-chapter"],
      content: ["quiet-frame", "side-highlight"],
      ending: ["masthead-ending", "fashion-ending"],
    },
  },
  // lecture（黑板夜校，2026-08-21）：墨绿板面 + 衬线 + 黄粉笔，粉笔槽细框
  // 由专属 lecture-motif 承载。结构行 L / top-band / light / tight，最近邻
  // enterprise（L / top / medium / tight），岔装饰轴——enterprise 是 IKB
  // 方块秩序的 medium，lecture 是 26px 内缩细框的 light。封面锁定
  // `board-head`（板面是左轴板书，池里没有这个构造，新建进共享池。
  // 历史曾软倾向 banner-title / tone-adaptive-header）。
  // chapter / ending 的 layouts 收窄待下版本设计板后锁定。content 走全集加
  // 分配表倾向。classroom 是白日讲义纸，lecture 是夜校黑板。
  lecture: {
    // 第七波封面保真：板面是左轴板书，池里没有这个构造，新建 board-head
    // 进共享池并收窄 cover。粉笔槽细框仍走 lecture-motif。
    // chapter / ending 的 layouts 收窄待下版本设计板后锁定。
    layouts: { cover: ["board-head"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "lecture-motif",
    layoutTendencies: {
      cover: ["board-head"],
      // Second-front wave (2026-08-22)，四轴 L / top-band / light / tight：
      // chapter / content / ending 走分配表软倾向。layouts 收窄仍待设计板。
      // - chapter `banner-chapter` + `tone-adaptive-chapter`：整版板面压白字，
      //   或只留一枚角落水印。两个 id 里后者是万金油。
      // - content `rail-numbered` + `bento-panel`：编号步骤加拼盘。前者与
      //   briefing 重合，真实拉力来自拼盘。
      // - ending 三元集 `banner-ending` + `constellation-ending` +
      //   `masthead-ending`：池排不开的让位追加，三个都是夜校下课的读法。
      //   `banner-ending` 与 `masthead-ending` 与 briefing 重合，真实边际来自
      //   签名条。
      chapter: ["banner-chapter", "tone-adaptive-chapter"],
      content: ["rail-numbered", "bento-panel"],
      ending: ["banner-ending", "constellation-ending", "masthead-ending"],
    },
  },
  // swiss（冷白制度，2026-08-21 wave7）：冷白纸 + 硬黑即正文即色块 + 瑞士红
  // 成边，由专属 swiss-motif 承载。结构行 L / bottom-right / light / tight，
  // 最近邻 tech（L / BR / medium / tight），岔在装饰轴。consulting 是报告腔、
  // vermilion 是公文腔、swiss 是制度腔，三家不是换色。封面锁定
  // `institutional-block`（板面是红边 + 左置巨黑字 + 签名块，池里没有这个
  // 构造。历史曾软倾向 left-anchor / split-diagonal）。
  // chapter / ending 的 layouts 收窄待下版本设计板后锁定。content 走全集加
  // 分配表倾向。
  swiss: {
    // 第七波封面保真：板面是红边 + 左置巨黑字 + 签名块，池里没有这个构造。
    // 新建 institutional-block 进共享池并收窄 cover。顶边红条仍走 swiss-motif。
    // chapter / ending 的 layouts 收窄待下版本设计板后锁定。
    layouts: { cover: ["institutional-block"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "swiss-motif",
    layoutTendencies: {
      cover: ["institutional-block"],
      // Second-front wave (2026-08-22)，四轴 L / bottom-right / light / tight：
      // chapter / content / ending 走分配表软倾向。layouts 收窄仍待设计板。
      // - chapter `constellation-chapter` + `poster-chapter`：编号与网格。前者
      //   与 briefing 重合，真实边际来自左轴巨号。
      // - content `two-column` + `split-band`：双栏加通栏头带，制度腔。前者与
      //   briefing 重合，真实拉力来自通栏头带。
      // - ending 三元集 `tone-adaptive-ending` + `rail-ending` +
      //   `masthead-ending`：池排不开的让位追加，素落款打头。`masthead-ending`
      //   与 briefing 重合，前两个有真实边际。
      chapter: ["constellation-chapter", "poster-chapter"],
      content: ["two-column", "split-band"],
      ending: ["tone-adaptive-ending", "rail-ending", "masthead-ending"],
    },
  },
  // memo（打字机决定，2026-08-21 wave7）：便笺纸 + 宋体标题 + 印章红双线。
  // 结构行 L / bottom-left / light / tight，最近邻 consulting
  // （L / BL / light / medium），岔留白轴。红成线不成面，与 vermilion
  // 红条承白字、heritage 藏书票衬线分家。封面锁定 `memo-head`（板面是
  // MEMORANDUM 眉行 + 红双线 + 标题末词下划。历史曾软倾向 banner-title /
  // editorial-masthead）。
  // chapter / ending 的 layouts 收窄待下版本设计板后锁定。content 走全集加
  // 分配表倾向。chrome 仍归 deck 声明，不在本行绑定。
  memo: {
    // 第七波封面保真：板面是 MEMORANDUM 眉行 + 红双线 + 标题末词下划。
    // 新建 memo-head 进共享池并收窄 cover。motif 在封面退让，避免双份公文头。
    // chapter / ending 的 layouts 收窄待下版本设计板后锁定。
    layouts: { cover: ["memo-head"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    motif: "memo-motif",
    layoutTendencies: {
      cover: ["memo-head"],
      // Second-front wave (2026-08-22)，四轴 L / bottom-left / light / tight：
      // chapter / content / ending 走分配表软倾向。layouts 收窄仍待设计板。
      // - chapter `masthead-chapter` + `banner-chapter`：文武线夹标题是打字机
      //   双线的同一套排印，横幅吃 ink primary 不吃印章红（红永不成面）。前者
      //   与 briefing 重合，真实边际来自整版横幅。
      // - content `narrow-column` + `tone-adaptive-content`：窄栏加最朴素的一页。
      //   两个 id 都不在 briefing 的 content 偏好里。
      // - ending 三元集 `banner-ending` + `masthead-ending` +
      //   `tone-adaptive-ending`：池排不开的让位追加，落款联系页打头。前两个
      //   与 briefing 重合，真实边际来自万金油落款。
      chapter: ["masthead-chapter", "banner-chapter"],
      content: ["narrow-column", "tone-adaptive-content"],
      ending: ["banner-ending", "masthead-ending", "tone-adaptive-ending"],
    },
  },
  // playbill（荧光嗓门，2026-08-21 第七波）：荧光黄整版 + 硬黑特粗字。
  // 日期贴片走 playbill-motif（2026-08-22 终审还原：读 meta.date，无日期
  // 整片不画。journal 期号先例）。heavy 的量在满版黄、typeScale 1.3 和字重。
  // **heavy 不必然等于 motif 重**：结构行 C / top-band / heavy / medium，
  // 最近邻 vermilion（C / top-band / medium / medium），岔在装饰轴。
  // 封面锁定 `bill-head`（板面是出血巨字 + 底粗线，池里没有这个构造。
  // 历史曾软倾向 poster-center / fashion-masthead）。
  // chapter / ending 的 layouts 收窄待下版本设计板后锁定。content 走全集加
  // 分配表倾向。定位 10 页内活动件（宣发 / 招募 / 节目单）。
  playbill: {
    // 第七波封面保真：板面是出血巨字 + 底粗线，池里没有这个构造。新建
    // bill-head 进共享池并收窄 cover。日期贴片仍走 playbill-motif，版式不画。
    // chapter / ending 的 layouts 收窄待下版本设计板后锁定。
    layouts: { cover: ["bill-head"], chapter: FULL_LAYOUTS.chapter, content: FULL_LAYOUTS.content, ending: FULL_LAYOUTS.ending },
    // 2026-08-22 用户终审还原日期贴片：motif 读 meta.date，无日期整片
    // 不画（journal 期号先例）。heavy 的主体仍在满版黄与字重。
    motif: "playbill-motif",
    layoutTendencies: {
      cover: ["bill-head"],
      // Second-front wave (2026-08-22)，四轴 C / top-band / heavy / medium：
      // chapter / content / ending 走分配表软倾向。cover 已锁 bill-head。
      // chapter / content / ending 的 layouts 仍是全集。content 用三元集把
      // 三张海报脸占住，把概率往活动件方向压，全集兜底仍在。
      // - chapter `fashion-chapter` + `poster-chapter`：满版黄黑两式。两个 id
      //   都不在 briefing 的 chapter 偏好里。
      // - content `split-band` + `stacked-poster` + `banner-heading`：通栏头带、
      //   主视觉堆叠、全宽断言横幅。`banner-heading` 与 briefing 重合，真实
      //   边际来自另外两张。briefing 下抽签与二元集逐字节相同，其它策略下
      //   横幅会真的加力。
      // - ending `fashion-ending` + `poster-ending`：满版收官加居中海报。
      chapter: ["fashion-chapter", "poster-chapter"],
      content: ["split-band", "stacked-poster", "banner-heading"],
      ending: ["fashion-ending", "poster-ending"],
    },
  },
}

/**
 * The six pinOnly sparse climax layouts. One list, reused by
 * {@link themeOffersSparse}, {@link registerTheme}'s validation, and the
 * gallery speech table (`SPEECH_LAYOUT_IDS` re-exports this). Do not
 * hand-copy the six names into those call sites.
 */
export const SPARSE_LAYOUT_IDS = [
  "statement",
  "pull-quote",
  "verse-chapter",
  "stat-hero",
  "one-evidence",
  "mono-bleed",
] as const

const NO_SPARSE: readonly string[] = []

/**
 * Per-theme sparse offer table, projected onto {@link THEME_DEFINITIONS}
 * below. Kept off the `LAYOUTS` literals so cover-lock tests that pin
 * `layoutTendencies` object identity (`bloom` `toBe` `classroom`) stay
 * untouched. Omitted keys stay `undefined` through the projection (offer
 * every sparse id). `[]` offers none. A list is the three boarded content
 * faces in `FACES` insertion order, then `verse-chapter`.
 */
const SPARSE_LAYOUTS: Partial<Record<CanonicalThemeId, readonly string[]>> = {
  crayon: NO_SPARSE,
  classroom: NO_SPARSE,
  bloom: NO_SPARSE,
  enterprise: NO_SPARSE,
  pulse: NO_SPARSE,
  runway: NO_SPARSE,
  ember: NO_SPARSE,
  stage: ["statement", "stat-hero", "pull-quote", "verse-chapter"],
  lecture: ["statement", "stat-hero", "one-evidence", "verse-chapter"],
  swiss: ["stat-hero", "statement", "one-evidence", "verse-chapter"],
  memo: ["pull-quote", "stat-hero", "statement", "verse-chapter"],
  playbill: ["statement", "stat-hero", "mono-bleed", "verse-chapter"],
  museum: ["statement", "one-evidence", "stat-hero", "verse-chapter"],
  luxe: ["pull-quote", "stat-hero", "statement", "verse-chapter"],
  ink: ["statement", "stat-hero", "pull-quote", "verse-chapter"],
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
      sparseLayouts: SPARSE_LAYOUTS[id],
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
 * every one of the 8 chapter layouts (`chapter-*.tsx`) imports
 * `accessibleInk`/`readableOn` from `../svg/ink` and routes *both*
 * `colors.text` and `colors.muted` through it before ever painting a fill —
 * none paints either token raw against `ctx.defaultBg`. This isn't a
 * per-theme coincidence this function would need to re-verify per
 * registration: `registerTheme` can only curate a subset of *already
 * existing* layouts ("a theme never ships new render code", this
 * function's own doc comment above) drawn from that same shared, fixed
 * chapter-layout set — so the raw-token-vs-chapter-background pairing
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
 * because their chapter layouts never read these tokens raw.
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
 * layout set ({@link FULL_LAYOUTS}) — the exact same default every
 * builtin theme in `LAYOUTS` above resolves to for a slide type it doesn't
 * curate away from. `getThemeDefinition`/`REGISTERED_THEMES` still only ever
 * hold the fully-resolved `ThemeDefinition` shape (`layouts` total over all
 * four types) — `registerTheme` performs the defaulting once, here, so
 * every downstream reader (`resolveLayoutId` foremost) can keep assuming
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
 *   `resolveLayoutId`/`FullSlideSvg` select from — a theme never ships
 *   new render code, only a curated subset of the existing 30 layouts +
 *   4 takeovers, per `docs/architecture.md`'s "Adding a theme" section). An
 *   *explicit* empty array for a slide type still fails this check (the
 *   default only kicks in when the key — or `layouts` itself — is omitted
 *   entirely, `undefined`, never for a caller-supplied `[]`).
 * - `style` must be present (a JS caller can bypass the TS type).
 * - `style.colors.text`/`style.colors.muted` must each clear the
 *   {@link CONTRAST_FLOOR} against a {@link CONTRAST_CHECKED_SLIDE_TYPES}
 *   slide type's own resolved default background — see
 *   {@link assertContrastFloor}'s own doc comment.
 * - `sparseLayouts`, when present, may be empty (offers none) or a list of
 *   {@link SPARSE_LAYOUT_IDS} members. A listed non-sparse id throws. The
 *   field is not defaulted when omitted (`undefined` = offer all six).
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
      // Curated sets feed the auto-selection path, which assumes layout ids
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
  // Offer table for explicit sparse pins, not an auto-pick pool. A listed
  // id must be one of the six sparse climax layouts. It does not have to
  // sit in `layouts[slideType]` (those pools exclude pinOnly members).
  // Empty array is legal (offers none). Omitted stays undefined — do not
  // default it to an array, `getThemeDefinition` round-trips the
  // registration object.
  if (def.sparseLayouts !== undefined) {
    for (const id of def.sparseLayouts) {
      if (!(SPARSE_LAYOUT_IDS as readonly string[]).includes(id)) {
        throw new PptfastError(
          `theme "${def.id}" sparseLayouts references "${id}", which is not a sparse climax layout — allowed: ${SPARSE_LAYOUT_IDS.join(", ")}`,
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
 * Whether `themeId` is willing to honour an explicit pin of `layoutId` as a
 * sparse climax page. Reads the definition via {@link getThemeDefinition} so
 * a registered custom theme participates the same way as a builtin.
 *
 * - `layoutId` not in {@link SPARSE_LAYOUT_IDS}: `false`
 * - `sparseLayouts` omitted / `undefined`: `true` (offers all six)
 * - `sparseLayouts` is `[]`: `false`
 * - otherwise `sparseLayouts.includes(layoutId)`
 *
 * The only offer check. Do not put theme-id switches in renderers.
 */
export function themeOffersSparse(themeId: string, layoutId: string): boolean {
  if (!(SPARSE_LAYOUT_IDS as readonly string[]).includes(layoutId)) return false
  const offered = getThemeDefinition(themeId).sparseLayouts
  if (offered === undefined) return true
  return offered.includes(layoutId)
}

/**
 * Strip an unoffered sparse pin to `undefined` so `resolveLayoutId`'s pin
 * short-circuit does not fire and auto-pick runs on the ordinary content /
 * chapter pool. Non-sparse pins (including takeovers) and offered sparse
 * pins pass through unchanged. Shared by `resolveOneEffectiveLayoutId` and
 * `FullSlideSvg`'s `resolvePageLayout` wrapper so validate and render cannot
 * drift. Not exported from `src/index.ts`.
 */
export function effectiveRequestedLayout(themeId: string, requested: string | undefined): string | undefined {
  if (
    requested !== undefined &&
    (SPARSE_LAYOUT_IDS as readonly string[]).includes(requested) &&
    !themeOffersSparse(themeId, requested)
  ) {
    return undefined
  }
  return requested
}

/**
 * Test-only: clear every registered theme. Deliberately not exported from
 * `src/index.ts` (the public SDK barrel) — a `__`-prefixed, clearly
 * test-only name signals the same at the call site.
 */
export function __resetRegisteredThemes(): void {
  REGISTERED_THEMES.clear()
}
