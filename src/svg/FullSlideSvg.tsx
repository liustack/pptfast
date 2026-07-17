import type React from "react"
import type { Block, PptxIR, Slide } from "@/ir"
import type { ThemeTokens } from "../styles/tokens"
import { getTheme } from "../styles"
import { CANVAS_W_PX, CANVAS_H_PX } from "../constants"
import { resolveFontStack } from "./fonts"
import type { BlockCtx } from "./blocks/types"
import type { SvgTemplateProps } from "./archetypes/types"
import { Background } from "./Background"
import { MasterChrome } from "./MasterChrome"
import { SlideDecor } from "./SlideDecor"
import {
  ImageAnnotatePage,
  ImageBottomPage,
  ImageCoverPage,
  ImageSplitPage,
  ImageTopPage,
} from "./ImagePages"
import { getManifest, type PersonalityManifest } from "../styles/manifest"
import { COVER_ARCHETYPES } from "./archetypes"
import { CHAPTER_ARCHETYPES } from "./archetypes/index-chapter"
import { CONTENT_ARCHETYPES } from "./archetypes/index-content"
import { ENDING_ARCHETYPES } from "./archetypes/index-ending"
import { MOTIF_ARCHETYPES } from "./archetypes/index-motif"
import { cachedDeckSeed, pickBySeedRotating } from "./variety"

/**
 * Resolve theme tokens + asset map into the render context blocks/templates use.
 * `blocks`, when passed, seeds `ctx.blockIndex` (block reference → its
 * position in that array) for wave-C S3's per-block entrance-animation
 * tagging — omit it (the default) to keep `ctx.blockIndex` undefined, which
 * is what keeps the default export path byte-identical (see `BlockCtx`'s
 * doc comment).
 */
 
export function buildCtx(
  tokens: ThemeTokens,
  images: PptxIR["assets"]["images"],
  blocks?: Block[],
): BlockCtx {
  return {
    colors: tokens.colors,
    shape: tokens.shape,
    fonts: {
      heading: resolveFontStack(tokens.fonts.heading, "heading"),
      body: resolveFontStack(tokens.fonts.body, "body"),
      mono: resolveFontStack(tokens.fonts.mono ?? [], "mono"),
    },
    images,
    blockIndex: blocks ? new Map(blocks.map((block, i) => [block, i])) : undefined,
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
 * manifest archetype 分发泛化（P2 Task 24，spec §4.2 strangler）：四页型共用
 * 「查 manifest allowed set → 按 deck seed 在集合内挑一个 → 查对应页型的
 * 注册表」这段逻辑。allowed 空集返回 null（Wave 5 删旧模板后：六主题四页型
 * 已全量接线、allowed 恒非空，manifest.test「Wave 5 前置门」锁死该前提，
 * 故 null 分支不可达；保留只为类型完备与防御未来配置 bug）。salt 沿用 P1 的
 * `"cover-archetype"`
 * 字符串形状（`${slideType}-archetype`），对 cover 页型逐字节保持同一个
 * seed 输入，不改变既有 deck 的 archetype 选择结果。
 */
function resolveArchetype(
  slideType: Slide["type"],
  manifest: PersonalityManifest,
  seed: number,
  typeOrdinal: number,
): { id: string; Component: PageArchetype } | null {
  const allowed: readonly string[] = manifest.archetypes[slideType]
  if (allowed.length === 0) return null
  // P3 Item ②：按「该页在同类型页面里的序号」轮换（pickBySeedRotating），
  // allowed 有 2+ 元素时同 deck 相邻 content 页拿到不同 archetype 打破雷同。
  // typeOrdinal=0 与 pickBySeed 起点一致，故单页型（cover/chapter/ending 通常
  // 每 deck 1 个）与单元素允许集主题行为零回归。
  const id = pickBySeedRotating(seed, `${slideType}-archetype`, allowed, typeOrdinal)
  return { id, Component: PAGE_ARCHETYPE_REGISTRIES[slideType][id] }
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
  const tokens = getTheme(ir.style.id, ir.style.tokens)
  const ctx = buildCtx(
    tokens,
    ir.assets.images,
    ir.meta.animation?.elements === "auto" ? slide.blocks : undefined,
  )
  const manifest = getManifest(ir.style.id)
  // motif 分发（P2 Task 24→Wave5 收尾）：全走 manifest.motif（六主题四页型
  // 已全量接线，旧 templates/<theme>.tsx 的 Decor 回落已随 templates 删除）。
  const Decor = manifest.motif ? MOTIF_ARCHETYPES[manifest.motif] : undefined
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
      const pageDefault = tokens.defaultBackgrounds[slide.type]
      autoScrimColor =
        pageDefault.kind === "color"
          ? pageDefault.value
          : pageDefault.kind === "gradient"
            ? pageDefault.from
            : tokens.colors.surface
    }
  }
  // 图文范式族接管（image_split/image_top/image_bottom）：出血图 bespoke
  // 版式，heading 由版式自画，跳过模板 Body 防重复标题。无 image 块回落
  // 模板路径。
  const hasImageBlock = slide.blocks.some((b) => b.type === "image")
  const imageFamilyVariant =
    slide.variant === "image_split" ||
    slide.variant === "image_top" ||
    slide.variant === "image_bottom" ||
    slide.variant === "image_annotate"
  const splitTakeover = imageFamilyVariant && hasImageBlock
  // manifest archetype 层（P1 cover-only → P2 Task 24 泛化四页型，spec §4.2
  // strangler）：允许集非空才接管（六主题四页型 Wave 5 后恒非空）。image 接管优先级更高
  // （压图页/图文版式语义不归 archetype 管，imageCoverTakeover 仅 cover/
  // chapter 生效、splitTakeover 对所有页型生效，两条优先级原样保留）。
  // 同类型页序（P3 Item ②轮换用）：该页在整个 deck 同 slide.type 页面里是第
  // 几个（0 起）。content 页据此在允许集内轮换，打破同 deck 内 content 页雷同。
  let typeOrdinal = 0
  for (let i = 0; i < index && i < ir.slides.length; i++) {
    if (ir.slides[i].type === slide.type) typeOrdinal++
  }
  const archetype =
    imageCoverTakeover || splitTakeover
      ? null
      : resolveArchetype(slide.type, manifest, cachedDeckSeed(ir), typeOrdinal)

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
      ) : splitTakeover && slide.variant === "image_top" ? (
        <ImageTopPage ir={ir} slide={slide} ctx={ctx} />
      ) : splitTakeover && slide.variant === "image_bottom" ? (
        <ImageBottomPage ir={ir} slide={slide} ctx={ctx} />
      ) : splitTakeover && slide.variant === "image_annotate" ? (
        <ImageAnnotatePage ir={ir} slide={slide} ctx={ctx} />
      ) : splitTakeover ? (
        <ImageSplitPage ir={ir} slide={slide} ctx={ctx} />
      ) : archetype ? (
        <g data-archetype={archetype.id}>
          <archetype.Component ir={ir} slide={slide} index={index} ctx={ctx} />
        </g>
      ) : null /* 不可达：非 takeover 时 resolveArchetype 恒命中（六主题四页型
        allowed 全非空，manifest.test「Wave 5 前置门」锁死）。空集才返回 null，
        渲空白而非崩溃是防御性兜底，正常运行不会到这里。 */}
      <MasterChrome ir={ir} slide={slide} ctx={ctx} />
    </svg>
  )
}
