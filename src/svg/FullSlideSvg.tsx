import type React from "react"
import type { BackgroundSpec, Component, PptxIR, Slide } from "@/ir"
import { DELIVERY_BUDGETS, resolveScenario, type Mode, type ScenarioAxes } from "@/scenario"
import type { StyleTokens } from "../themes/tokens"
import { resolveStyle } from "../themes"
import { CANVAS_W_PX, CANVAS_H_PX } from "../constants"
import { resolveFontStack } from "./fonts"
import type { ComponentCtx } from "./components/types"
import type { SvgTemplateProps } from "./archetypes/types"
import { Background } from "./Background"
import { BrandChrome } from "./BrandChrome"
import { SlideDecor } from "./SlideDecor"
import {
  ImageAnnotatePage,
  ImageBottomPage,
  ImageCoverPage,
  ImageSplitPage,
  ImageTopPage,
} from "./ImagePages"
import { findImageComponent } from "./layouts/find-image"
import { gradientBands } from "./gradient-bands"
import { getLayout } from "./layouts/registry"
import { getThemeDefinition, type ThemeDefinition } from "../themes/definitions"
import { COVER_ARCHETYPES } from "./archetypes"
import { CHAPTER_ARCHETYPES } from "./archetypes/index-chapter"
import { CONTENT_ARCHETYPES } from "./archetypes/index-content"
import { ENDING_ARCHETYPES } from "./archetypes/index-ending"
import { MOTIF_ARCHETYPES } from "./archetypes/index-motif"
import { cachedDeckSeed } from "./variety"
import { resolveArchetypeId, resolveEffectiveLayoutId, resolveIrMode } from "./effective-layout"

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
 * Same color/asset reduction as `resolveBackgroundHex` above, but a
 * gradient reduces to its exact midpoint blend (t=0.5) instead of the
 * `from` stop. Used only for `slide.background`'s own per-slide override
 * (`FullSlideSvg` below, post-v0.3 W8 fix round, backlog item 1 —
 * `.issues/notes/2026-07-18-post-v03-backlog.md` #1) — `resolveBackgroundHex`
 * keeps its `.from` policy untouched and still exclusively backs
 * `tokens.defaultBackgrounds`, which is real production input today
 * (`tech`'s own cover/chapter/content/ending default *is* a gradient, see
 * `themes/tech.ts`) and must stay byte-identical for a slide with no
 * override of its own.
 *
 * Gradient policy rationale — the representative-color choice here must be
 * *semantically consistent* with what `deck-audit.ts` actually measures
 * against, not just internally self-consistent (confirmed by reading that
 * module before writing this one, not assumed): `deck-audit.ts`'s
 * `findContrastIssues`/`runContrastWalk` never averages a gradient — it
 * records each of `Background.tsx`'s 24 real rendered bands as its own
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
 * blend formula), so the exact colour law matches what `Background.tsx`
 * actually paints — a real point on the true 24-band gradient, not a
 * divergent approximation of one.
 */
export function resolveOverrideBackgroundHex(spec: BackgroundSpec, surfaceFallback: string): string {
  if (spec.kind === "gradient") return gradientBands(spec.from, spec.to, 3)[1]
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
 * `DELIVERY_BUDGETS[resolveScenario(ir.scenario).delivery].bodyBaselinePx`.
 * Omitting it (as every `buildCtx(...)`-calling test in this repo except
 * the paragraph/bullets/callout/three-tier suites does) falls back to
 * `DELIVERY_BUDGETS.balanced.bodyBaselinePx` (24px) — the scenario default,
 * so a test that doesn't care about body-text sizing still gets the
 * ambient value a caller with an omitted/default scenario would.
 */
export function buildCtx(
  tokens: StyleTokens,
  images: PptxIR["assets"]["images"],
  components?: Component[],
  defaultBg?: string,
  bodyFontPx?: number,
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
    bodyFontPx: bodyFontPx ?? DELIVERY_BUDGETS.balanced.bodyBaselinePx,
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
 * `slide.layout`）显式指定短路——完整选型算法（scenario 加权取样、
 * scenariosOnly 硬约束、相邻防重复、allowed 空集防御性回退，W4 终态）现由
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
  mode: Mode,
  previousEffectiveLayoutId: string | null,
): { id: string; Component: PageArchetype } | null {
  const id = resolveArchetypeId(slideType, layouts, seed, pageKey, requestedLayout, mode, previousEffectiveLayoutId)
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
  // comment for why the two intentionally differ. A slide with no override
  // resolves to exactly `themeDefaultBg` above, unchanged from before this
  // fix (invariant verified in `FullSlideSvg.test.tsx`).
  const defaultBg = slide.background
    ? resolveOverrideBackgroundHex(slide.background, tokens.colors.surface)
    : themeDefaultBg
  // W4 task 3 (design decision 9): the single injection seam for the
  // paragraph/bullets/callout trio's body-text baseline — see
  // `ComponentCtx.bodyFontPx`'s own doc comment for why this is required
  // (not optional like `defaultBg` above) and why no component recomputes
  // it. A second, independent `resolveScenario` call from `resolveIrMode`'s
  // own (cheap, unmemoized — see that function's doc comment) below is
  // expected, not a duplicated selection-logic copy: this projects
  // `.delivery`, `resolveIrMode` projects `.mode`, off the same pure input.
  const bodyFontPx =
    DELIVERY_BUDGETS[resolveScenario(ir.scenario as string | Partial<ScenarioAxes> | undefined).delivery]
      .bodyBaselinePx
  const ctx = buildCtx(
    tokens,
    ir.assets.images,
    ir.meta.animation?.elements === "auto" ? slide.components : undefined,
    defaultBg,
    bodyFontPx,
  )
  const themeDef = getThemeDefinition(ir.theme.id)
  // motif 分发（P2 Task 24→Wave5 收尾，W2 任务 2 数据源迁至 THEME_DEFINITIONS，
  // W3 任务 4 起经 getThemeDefinition 统一查找——registered theme 同样生效）：
  // 全走 theme 定义的 motif（十三主题四页型已全量接线，旧 templates/<theme>.tsx
  // 的 Decor 回落已随 templates 删除）。
  const Decor = themeDef.motif ? MOTIF_ARCHETYPES[themeDef.motif] : undefined
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
      // `themeDefaultBg`, deliberately not the slide-background-aware
      // `defaultBg` above: an asset background has no true colour of its
      // own to scrim toward (a photo isn't reducible to one hex), so this
      // scrim has always pulled the image back toward the *theme's* own
      // base tone for this slide type (see this variable's own doc comment
      // above) — unrelated to, and deliberately untouched by, backlog item
      // 1's per-slide-background-aware `ctx.defaultBg` fix.
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
  const mode = resolveIrMode(ir)
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
          mode,
          previousEffectiveLayoutId,
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
