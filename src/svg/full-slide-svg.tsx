import type React from "react"
import type { BackgroundSpec, Component, PptxIR, Slide } from "@/ir"
import { PACING_BUDGETS, resolveNarrative, type Strategy, type NarrativeProfile } from "@/narrative"
import type { StyleTokens } from "../themes/tokens"
import { resolveStyle } from "../themes"
import { CANVAS_W_PX, CANVAS_H_PX } from "../constants"
import { resolveFontStack } from "./fonts"
import type { ComponentCtx } from "./components/types"
import type { SvgTemplateProps } from "./archetypes/types"
import { Background } from "./background"
import { BrandChrome } from "./brand-chrome"
import { SlideDecor } from "./slide-decor"
import {
  ImageAnnotatePage,
  ImageBottomPage,
  ImageCoverPage,
  ImageSplitPage,
  ImageTopPage,
} from "./image-pages"
import { findImageComponent } from "./layouts/find-image"
import { gradientBands } from "./gradient-bands"
import { getLayout } from "./layouts/registry"
import { getThemeDefinition, type ThemeDefinition } from "../themes/definitions"
import { COVER_ARCHETYPES } from "./archetypes"
import { CHAPTER_ARCHETYPES } from "./archetypes/index-chapter"
import { CONTENT_ARCHETYPES } from "./archetypes/index-content"
import { ENDING_ARCHETYPES } from "./archetypes/index-ending"
import { MOTIF_ARCHETYPES } from "./archetypes/index-motif"
import { resolveMotifId } from "./motif-selection"
import { resolveChartPaletteOffset } from "./chart-palette"
import { cachedDeckSeed } from "./variety"
import { resolveArchetypeId, resolveEffectiveLayoutId, resolveIrStrategy } from "./effective-layout"

/**
 * Reduce a `BackgroundSpec` to one representative hex color — a color spec
 * is already one; a gradient's `from` stop stands in for the whole band
 * (every built-in gradient goes dark→darker or light→lighter, so which
 * stop is picked never changes an ink decision made off it); an asset spec
 * (a photo) has no single true color, so callers get `surfaceFallback`
 * instead (mirrors the pre-existing `autoScrimColor` computation below,
 * which this function now backs).
 *
 * Exported (W4 fix round) so archetype tests can build a `ComponentCtx`
 * whose `defaultBg` matches a theme's *true* `defaultBackgrounds[slideType]`
 * — required whenever the theme under test gives that slide type a
 * different default than its own `colors.bg` (only `academic`/`classroom`/
 * `consulting`'s `chapter` do, among the 13 built-ins), since `buildCtx`'s
 * own same-named fallback (`colors.bg`) is wrong for exactly those three.
 */
export function resolveBackgroundHex(spec: BackgroundSpec, surfaceFallback: string): string {
  if (spec.kind === "color") return spec.value
  if (spec.kind === "gradient") return spec.from
  return surfaceFallback
}

/**
 * Same color reduction as `resolveBackgroundHex` above for a `color` spec, but
 * a gradient reduces to its exact midpoint blend (t=0.5) instead of the
 * `from` stop, and an asset resolves to the actually-painted scrim color
 * rather than `resolveBackgroundHex`'s unrelated surface fallback (see
 * "Asset policy rationale" below). Used only for `slide.background`'s own
 * per-slide override (`FullSlideSvg` below, post-v0.3 W8 fix round, backlog
 * item 1 — `.issues/notes/2026-07-18-post-v03-backlog.md` #1) —
 * `resolveBackgroundHex` keeps its `.from`/`surfaceFallback` policy untouched
 * and still exclusively backs `tokens.defaultBackgrounds`, which is real
 * production input today (`tech`'s own cover/chapter/content/ending default
 * *is* a gradient, see `themes/tech.ts`) and must stay byte-identical for a
 * slide with no override of its own.
 *
 * Gradient policy rationale — the representative-color choice here must be
 * *semantically consistent* with what `deck-audit.ts` actually measures
 * against, not just internally self-consistent (confirmed by reading that
 * module before writing this one, not assumed): `deck-audit.ts`'s
 * `findContrastIssues`/`runContrastWalk` never averages a gradient — it
 * records each of `background.tsx`'s 24 real rendered bands as its own
 * exact region (the same `gradientBands` call this function reuses below)
 * and looks up whichever band a text element's own resolved position
 * actually falls inside. A single scalar `ctx.defaultBg` can't reproduce
 * that per-position precision for every consumer at once — it backs many
 * archetypes' ink decisions at many different y-positions on the same slide
 * (`ComponentCtx.defaultBg`'s own doc comment) — so no single pick agrees
 * with the audit's real per-position lookup everywhere. Of the two natural
 * single-value picks, the midpoint is the one actually representative of
 * where those consumers place text: every surveyed `ctx.defaultBg` reader's
 * heading/subheading/numeral sits well away from the y=0 (or x=0, for an
 * `lr`-direction gradient) edge a `.from`-stop pick would implicitly stand
 * in for — chapter headings sit at y=352-408 (close to the canvas's own
 * vertical center, 360), content subheadings at y=88-220 — see the task
 * report's per-archetype y-coordinate survey for the full list. Computed
 * via the renderer's own `gradientBands` (not a separately hand-rolled
 * blend formula), so the exact colour law matches what `background.tsx`
 * actually paints — a real point on the true 24-band gradient, not a
 * divergent approximation of one.
 *
 * Asset policy rationale (final-review Major finding, post-v0.3 backlog
 * item 1's own sub-branch — `.issues/notes/2026-07-18-post-v03-backlog.md`
 * #1): an asset spec has no true single color of its own, same as
 * `resolveBackgroundHex`'s asset branch — but unlike that function (whose
 * `surfaceFallback` genuinely is what gets painted when a *theme's own
 * default* background happens to be an asset, since `autoScrimColor` is
 * then defined circularly off that same fallback), this reducer's asset
 * case is a *per-slide override* on top of an otherwise-normal theme, where
 * what actually paints behind text is already known and different:
 * `background.tsx`'s auto-scrim, colored `themeDefaultBg` (see
 * `FullSlideSvg`'s own `autoScrimColor` assignment below) at
 * `AUTO_SCRIM_OPACITY = 0.66` — opaque enough that `deck-audit.ts` itself
 * trusts the scrim's raw fill as the background region's color
 * (`MIN_BG_OPACITY = 0.5`, `runContrastWalk`'s `opaqueEnough` check), not a
 * blend with the photo beneath it. Falling through to `surfaceFallback`
 * here (the pre-fix behavior) returned `tokens.colors.surface` instead —
 * unrelated to, and routinely different from, that actually-painted color —
 * which is exactly the "ink decision disagrees with what's actually
 * rendered" defect class this whole backlog item exists to close, just in
 * the one branch its original fix (`6b60bb5`) missed. `paintedFallback`
 * (the caller's `themeDefaultBg`, not `surfaceFallback`) closes it: the
 * caller already computes that exact value for `autoScrimColor`'s own use,
 * so this is the same value, not a re-derivation of it. Moot for a
 * cover/chapter override — `imageCoverTakeover` intercepts those before any
 * archetype ever reads `ctx.defaultBg` (see `FullSlideSvg`'s own comment at
 * that assignment) — so this value is simply never read in that case; it is
 * live for content/ending, the only slide types where the auto-scrim (and
 * so this exact color) is what actually renders behind text.
 */
export function resolveOverrideBackgroundHex(
  spec: BackgroundSpec,
  surfaceFallback: string,
  paintedFallback: string,
): string {
  if (spec.kind === "gradient") return gradientBands(spec.from, spec.to, 3)[1]
  if (spec.kind === "asset") return paintedFallback
  return resolveBackgroundHex(spec, surfaceFallback)
}

/**
 * Resolve theme tokens + asset map into the render context components/templates use.
 * `components`, when passed, seeds `ctx.blockIndex` (component reference → its
 * position in that array) for wave-C S3's per-component entrance-animation
 * tagging — omit it (the default) to keep `ctx.blockIndex` undefined, which
 * is what keeps the default export path byte-identical (see `ComponentCtx`'s
 * doc comment).
 *
 * `defaultBg` (W4 fix round, post-v0.3 W8 fix round — `ComponentCtx`'s own
 * doc comment): the caller (`FullSlideSvg` below) always supplies the true
 * per-slide-aware default — `slide.background` reduced via
 * `resolveOverrideBackgroundHex` when the slide sets one, else
 * `tokens.defaultBackgrounds[slide.type]` reduced via `resolveBackgroundHex`.
 * Omitting it (as every pre-existing test call site does) falls back to
 * `tokens.colors.bg` — exact for every slide type on 10 of the 13 built-in
 * themes, and still a plausible same-family value on the other 3
 * (`academic`/`classroom`/`consulting`, whose `chapter` background alone
 * diverges from their own `colors.bg`).
 *
 * `bodyFontPx` (W4 task 3, `ComponentCtx.bodyFontPx`'s own doc comment): the
 * caller (`FullSlideSvg` below) always supplies the true
 * `PACING_BUDGETS[resolveNarrative(ir.narrative).pacing].bodyBaselinePx`.
 * Omitting it (as every `buildCtx(...)`-calling test in this repo except
 * the paragraph/bullets/callout/three-tier suites does) falls back to
 * `PACING_BUDGETS.balanced.bodyBaselinePx` (24px) — the narrative default,
 * so a test that doesn't care about body-text sizing still gets the
 * ambient value a caller with an omitted/default narrative would.
 *
 * `chartPaletteOffset` (P1 variety wave, task 2 — `./chart-palette.ts`'s own
 * header comment has the full rationale): the caller supplies
 * `resolveChartPaletteOffset(cachedDeckSeed(ir), tokens.colors.chartPalette.length)`.
 * **Passed through as its own `ComponentCtx` field, `colors.chartPalette`
 * itself is never rotated here** (review fix round, Major finding — see
 * `ComponentCtx.chartPaletteOffset`'s own doc comment for the full leak this
 * corrects): rotating `colors.chartPalette` in place used to silently reach
 * every consumer of that token, not just the chart component, including
 * several motifs that destructure it by fixed position for decoration
 * unrelated to any chart. `components/chart.tsx` — the only reader of this
 * field — is responsible for rotating `colors.chartPalette` itself before
 * use. Every `buildCtx(...)` call site that omits this 6th argument (every
 * test in this repo except this task's own) is unaffected either way,
 * before or after this fix.
 */
export function buildCtx(
  tokens: StyleTokens,
  images: PptxIR["assets"]["images"],
  components?: Component[],
  defaultBg?: string,
  bodyFontPx?: number,
  chartPaletteOffset?: number,
): ComponentCtx {
  return {
    colors: tokens.colors,
    shape: tokens.shape,
    fonts: {
      heading: resolveFontStack(tokens.fonts.heading, "heading"),
      body: resolveFontStack(tokens.fonts.body, "body"),
      mono: resolveFontStack(tokens.fonts.mono ?? [], "mono"),
    },
    images,
    blockIndex: components ? new Map(components.map((component, i) => [component, i])) : undefined,
    defaultBg: defaultBg ?? tokens.colors.bg,
    bodyFontPx: bodyFontPx ?? PACING_BUDGETS.balanced.bodyBaselinePx,
    chartPaletteOffset,
  }
}

export interface FullSlideSvgProps {
  ir: PptxIR
  slide: Slide
  index: number
  className?: string
  preserveAspectRatio?: string
}

/** 四页型 archetype 共用同一签名（archetypes/types.ts 逐个定义但结构相同）。 */
type PageArchetype = (p: SvgTemplateProps) => React.ReactElement

/** `slide.type` → 该页型的 archetype 注册表（Wave 1-3 各自建的四张表）。 */
const PAGE_ARCHETYPE_REGISTRIES: Record<Slide["type"], Record<string, PageArchetype>> = {
  cover: COVER_ARCHETYPES,
  chapter: CHAPTER_ARCHETYPES,
  content: CONTENT_ARCHETYPES,
  ending: ENDING_ARCHETYPES,
}

/**
 * theme.layouts archetype 分发泛化（P2 Task 24，spec §4.2→v0.3 spec §6
 * strangler）：四页型共用「查 theme 的 layouts allowed set → 按 deck seed 加权
 * 取样一个 → 查对应页型的注册表」这段逻辑，含 `requestedLayout`（W2 任务 3，即
 * `slide.layout`）显式指定短路——完整选型算法（narrative 加权取样、
 * narrativesOnly 硬约束、相邻防重复、allowed 空集防御性回退，W4 终态）现由
 * `./effective-layout` 的 `resolveArchetypeId` 持有（W3 任务 3 抽取：
 * `checkIrQuality` 的 density 门在 validate 期要跑同一条选型路径，两处各自维护
 * 一份会有漂移风险，故只留一份）。这里只做 render 专属的收尾——按选中 id 查
 * 这个文件自己的 `PAGE_ARCHETYPE_REGISTRIES` 取 JSX Component（validate 侧不
 * 需要、也不该关心这一步）。
 */
function resolveArchetype(
  slideType: Slide["type"],
  layouts: ThemeDefinition["layouts"],
  seed: number,
  pageKey: string,
  requestedLayout: string | undefined,
  strategy: Strategy,
  previousEffectiveLayoutId: string | null,
  beat: Slide["beat"],
): { id: string; Component: PageArchetype } | null {
  const id = resolveArchetypeId(
    slideType,
    layouts,
    seed,
    pageKey,
    requestedLayout,
    strategy,
    previousEffectiveLayoutId,
    beat,
  )
  return id === null ? null : { id, Component: PAGE_ARCHETYPE_REGISTRIES[slideType][id] }
}

/**
 * The single source of a slide's visuals: one flat `<svg viewBox="0 0 1280 720">`
 * = background + theme body + footer chrome. The preview mounts it directly; the
 * exporter serializes it and feeds svg2pptx. Same component → identical output.
 */
export function FullSlideSvg({
  ir,
  slide,
  index,
  className,
  preserveAspectRatio,
}: FullSlideSvgProps) {
  const tokens = resolveStyle(ir.theme.id, ir.theme.style)
  // The theme's own default background for this slide type, independent of
  // any per-slide `slide.background` override — still needed below as
  // `autoScrimColor`'s source (an asset background's scrim always pulls
  // toward the *theme's* own base tone, never toward anything derived from
  // the image spec itself — see that assignment's own comment) and as
  // `defaultBg`'s own fallback for a slide that sets no override.
  const themeDefaultBg = resolveBackgroundHex(tokens.defaultBackgrounds[slide.type], tokens.colors.surface)
  // ctx.defaultBg (post-v0.3 W8 fix round, backlog item 1 —
  // `.issues/notes/2026-07-18-post-v03-backlog.md` #1): prefer the slide's
  // own `slide.background` override when it sets one, so an archetype that
  // paints no panel of its own (and so reads this field to pick readable
  // ink — see `ComponentCtx.defaultBg`'s own doc comment) measures contrast
  // against the background the slide actually renders, not always the
  // theme's per-slide-type default regardless of any override. A gradient
  // override reduces via `resolveOverrideBackgroundHex`'s midpoint policy,
  // not `resolveBackgroundHex`'s `.from` — see that function's own doc
  // comment for why the two intentionally differ. An asset override
  // resolves to `themeDefaultBg` itself — final-review Major finding, this
  // same backlog item's sub-branch fix: `themeDefaultBg` is exactly the
  // color `autoScrimColor` below paints behind text for a content/ending
  // asset background (see `resolveOverrideBackgroundHex`'s own "Asset
  // policy rationale" for the full paint-path justification), so passing it
  // as that function's `paintedFallback` argument makes this agree with
  // what's actually rendered instead of falling back to the unrelated
  // `tokens.colors.surface`. A slide with no override resolves to exactly
  // `themeDefaultBg` above, unchanged from before this fix (invariant
  // verified in `full-slide-svg.test.tsx`).
  const defaultBg = slide.background
    ? resolveOverrideBackgroundHex(slide.background, tokens.colors.surface, themeDefaultBg)
    : themeDefaultBg
  // W4 task 3 (design decision 9): the single injection seam for the
  // paragraph/bullets/callout trio's body-text baseline — see
  // `ComponentCtx.bodyFontPx`'s own doc comment for why this is required
  // (not optional like `defaultBg` above) and why no component recomputes
  // it. A second, independent `resolveNarrative` call from `resolveIrStrategy`'s
  // own (cheap, unmemoized — see that function's doc comment) below is
  // expected, not a duplicated selection-logic copy: this projects
  // `.pacing`, `resolveIrStrategy` projects `.strategy`, off the same pure input.
  const bodyFontPx =
    PACING_BUDGETS[resolveNarrative(ir.narrative as string | Partial<NarrativeProfile> | undefined).pacing]
      .bodyBaselinePx
  // P1 variety wave, task 2 (`./chart-palette.ts`'s own header comment has
  // the full rationale): one offset per deck (seed-derived, no pageKey), so
  // every chart on every page of this deck agrees on the same rotated
  // phase — computed here, not memoized, since it's a cheap pure function of
  // `cachedDeckSeed(ir)` + this theme's own palette length.
  const chartPaletteOffset = resolveChartPaletteOffset(cachedDeckSeed(ir), tokens.colors.chartPalette.length)
  const ctx = buildCtx(
    tokens,
    ir.assets.images,
    ir.meta.animation?.elements === "auto" ? slide.components : undefined,
    defaultBg,
    bodyFontPx,
    chartPaletteOffset,
  )
  const themeDef = getThemeDefinition(ir.theme.id)
  // motif 分发（P2 Task 24→Wave5 收尾，W2 任务 2 数据源迁至 THEME_DEFINITIONS，
  // W3 任务 4 起经 getThemeDefinition 统一查找——registered theme 同样生效，
  // P1 variety wave task 2 起不再是每主题一个固定 id：`resolveMotifId`
  // 〔./motif-selection.ts〕在 12/13 内置主题上把它换成一个 2-3 项候选子集的
  // seed+pageKey 加权采样，同 deck 内不同页常态性拿到不同贴纸；runway〔无
  // motif〕与 registered/自定义主题走该函数自己的直通回落，行为不变）。
  const motifId = resolveMotifId(ir, slide, index)
  const Decor = motifId ? MOTIF_ARCHETYPES[motifId] : undefined
  let bgSpec = slide.background ?? tokens.defaultBackgrounds[slide.type]
  // 压图页接管（图片排版 polish，2026-07-09 用户反馈）：cover/chapter 的
  // asset 背景 → 暗遮罩 + 白字 bespoke 版式（ImageCoverPage）——图保持清晰
  // 可辨（此前把图拉回主题底色的雾面 scrim 用户裁决太朦胧）。模板文字色是
  // baked 常量无法反色，故不走模板 Body；主题个性保留在 accent 细节。
  // 2026-07-10 custom→gallery 改造后所有主题都是设计主题，原「custom 裸
  // 背景 + 模型 overlay 直通」特判随之删除（存量 custom deck 落 gallery，
  // 压图页同享暗遮罩接管）。
  const imageCoverTakeover =
    bgSpec.kind === "asset" &&
    (slide.type === "cover" || slide.type === "chapter")
  // content/ending 的 asset 背景维持 P1 雾面 scrim（正文密度高，可读性优先）。
  let autoScrimColor: string | undefined
  if (bgSpec.kind === "asset") {
    const { overlay: _ignored, ...withoutOverlay } = bgSpec
    bgSpec = withoutOverlay
    if (!imageCoverTakeover) {
      // `themeDefaultBg` directly, not the slide-background-aware
      // `defaultBg` above — though the two are now (final-review Major
      // finding, this same backlog item's sub-branch fix) provably equal
      // whenever this branch runs: `resolveOverrideBackgroundHex`'s asset
      // case returns exactly this `themeDefaultBg` value, and the
      // no-override path assigns it directly, so `defaultBg ===
      // themeDefaultBg` here either way. Reading `themeDefaultBg` (not
      // `defaultBg`) keeps this assignment independent of `defaultBg`'s own
      // override-resolution path rather than relying on that equality by
      // construction — an asset background has no true colour of its own to
      // scrim toward (a photo isn't reducible to one hex), so this scrim has
      // always pulled the image back toward the *theme's* own base tone for
      // this slide type (see this variable's own doc comment above).
      autoScrimColor = themeDefaultBg
    }
  }
  // 图文范式族接管（image-split/image-top/image-bottom/image-annotate，W2
  // 任务 3：分派钥匙由 slide.variant 改为 slide.layout，4 个版式各自的行为
  // 不变）：出血图 bespoke 版式，heading 由版式自画，跳过模板 Body 防重复
  // 标题。无 image 块回落模板路径。
  const requestedLayoutDef = slide.layout ? getLayout(slide.layout) : undefined
  const isTakeoverLayout = requestedLayoutDef?.kind === "takeover"
  const splitTakeover = isTakeoverLayout && findImageComponent(slide) != null
  // theme.layouts archetype 层（P1 cover-only → P2 Task 24 泛化四页型，spec
  // §4.2→v0.3 spec §6 strangler）：允许集非空才接管（十三主题四页型 Wave 5 后
  // 恒非空）。image 接管优先级更高（压图页/图文版式语义不归 archetype 管，
  // imageCoverTakeover 仅 cover/chapter 生效、splitTakeover 对所有页型生效，
  // 两条优先级原样保留）。
  // 盐 pageKey（W4 design decision 2，同类型页序 ordinal 机制已废弃）：优先
  // 稳定 slide.id，无 id 落回绝对页 index——插页/重排不再牵动其它页的取样。
  // previousEffectiveLayoutId（W4 design decision 4，相邻防重复的唯一跨页
  // 输入）：复用 `resolveEffectiveLayoutId` 对上一页的解算而非在这里另起一份
  // 折叠——同一 WeakMap 缓存的折叠结果，两处必然同源同值。
  const pageKey = slide.id ?? String(index)
  const strategy = resolveIrStrategy(ir)
  const previousEffectiveLayoutId = index > 0 ? resolveEffectiveLayoutId(ir, ir.slides[index - 1], index - 1) : null
  const archetype =
    imageCoverTakeover || splitTakeover
      ? null
      : resolveArchetype(
          slide.type,
          themeDef.layouts,
          cachedDeckSeed(ir),
          pageKey,
          slide.layout,
          strategy,
          previousEffectiveLayoutId,
          slide.beat,
        )

  return (
    <svg
      viewBox={`0 0 ${CANVAS_W_PX} ${CANVAS_H_PX}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      preserveAspectRatio={preserveAspectRatio}
    >
      <Background spec={bgSpec} images={ir.assets.images} autoScrimColor={autoScrimColor} />
      {Decor && !imageCoverTakeover && (
        <g data-decor>
          <Decor ir={ir} slide={slide} ctx={ctx} />
        </g>
      )}
      <SlideDecor ir={ir} slide={slide} index={index} ctx={ctx} />
      {imageCoverTakeover ? (
        <ImageCoverPage ir={ir} slide={slide} index={index} ctx={ctx} />
      ) : splitTakeover && slide.layout === "image-top" ? (
        <ImageTopPage ir={ir} slide={slide} ctx={ctx} />
      ) : splitTakeover && slide.layout === "image-bottom" ? (
        <ImageBottomPage ir={ir} slide={slide} ctx={ctx} />
      ) : splitTakeover && slide.layout === "image-annotate" ? (
        <ImageAnnotatePage ir={ir} slide={slide} ctx={ctx} />
      ) : splitTakeover ? (
        <ImageSplitPage ir={ir} slide={slide} ctx={ctx} />
      ) : archetype ? (
        <g data-archetype={archetype.id}>
          <archetype.Component ir={ir} slide={slide} index={index} ctx={ctx} />
        </g>
      ) : null /* 不可达：非 takeover 时 resolveArchetype 恒命中（十三主题四页型
        allowed 全非空，definitions.test「Wave 5 前置门」锁死）。空集才返回 null，
        渲空白而非崩溃是防御性兜底，正常运行不会到这里。 */}
      <BrandChrome ir={ir} slide={slide} ctx={ctx} />
    </svg>
  )
}
