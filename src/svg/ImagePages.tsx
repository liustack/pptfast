import { Fragment } from "react"
import type { PptxIR, Slide } from "@/ir"
import type { ComponentCtx } from "./components/types"
import { renderComponent } from "./components"
import { layoutContentFit, stackBottom } from "./layout"
import { findImageComponent } from "./layouts/find-image"
import { CANVAS_W_PX, CANVAS_H_PX } from "../constants"
import { layoutSvgText, fitSvgLine } from "../lib/svg-text-layout"

/**
 * 压图页与出血 split 页（图片排版 polish，2026-07-09 用户反馈驱动）。
 *
 * 模板文字色是各主题 baked 常量、无法反色，因此压图场景不走模板 Body，
 * 由这里的 bespoke 全页版式接管（BrandChrome/Decor 照常）——参考 ppt-master
 * 的压图页版式本就趋同：暗遮罩 + 白字大标题，主题个性保留在 accent 细节。
 */
const W = CANVAS_W_PX
const H = CANVAS_H_PX

/** 暗 scrim：上浅下深三段（文字集中在中下部），图保持清晰可辨。 */
function DarkScrim() {
  return (
    <>
      <rect x={0} y={0} width={W} height={H} fill="#0A0E14" fillOpacity={0.3} />
      <rect x={0} y={Math.round(H * 0.55)} width={W} height={Math.round(H * 0.45)} fill="#0A0E14" fillOpacity={0.28} />
      <rect x={0} y={Math.round(H * 0.78)} width={W} height={Math.round(H * 0.22)} fill="#0A0E14" fillOpacity={0.3} />
    </>
  )
}

/**
 * cover/chapter 的 asset 背景页：清晰大图 + 暗遮罩 + 白字（左下构图）。
 */
export function ImageCoverPage({
  ir,
  slide,
  index,
  ctx,
}: {
  ir: PptxIR
  slide: Slide
  index: number
  ctx: ComponentCtx
}) {
  const accent = ctx.colors.accent
  const isChapter = slide.type === "chapter"
  const org = ir.meta.organization
  const date = ir.meta.date

  const title = layoutSvgText(slide.heading, {
    maxWidth: 1030,
    fontSize: isChapter ? 60 : 68,
    maxLines: 2,
    lineHeightRatio: 1.12,
  })
  const sub = layoutSvgText(slide.subheading, {
    maxWidth: 980,
    fontSize: 27,
    maxLines: 2,
    lineHeightRatio: 1.25,
  })
  // 左下构图：从底部往上倒推（页脚区 ~88px 留给 BrandChrome）
  const subH = sub.lines.length ? sub.lines.length * sub.lineHeight + 18 : 0
  const titleH = title.lines.length * title.lineHeight
  const baseY = H - 118 - subH
  const titleTopY = baseY - titleH + title.lineHeight - 10

  // chapter 大序号（第 N 个 chapter）
  let chapterNo = 0
  for (let i = 0; i <= index && i < ir.slides.length; i++) {
    if (ir.slides[i].type === "chapter") chapterNo++
  }

  return (
    <g>
      <DarkScrim />
      {isChapter && (
        <text
          x={96}
          y={titleTopY - titleH - 34}
          fontSize={30}
          fontWeight={700}
          fontFamily={ctx.fonts.heading}
          fill={accent}
          dominantBaseline="alphabetic"
        >
          {String(Math.max(1, chapterNo)).padStart(2, "0")}
        </text>
      )}
      {org && (
        <text
          x={96}
          y={104}
          fontSize={21}
          fontFamily={ctx.fonts.body}
          fill="#FFFFFF"
          fillOpacity={0.85}
          letterSpacing={2}
          dominantBaseline="alphabetic"
        >
          {org}
        </text>
      )}
      {title.lines.map((line, i) => (
        <text
          key={i}
          x={96}
          y={titleTopY + i * title.lineHeight}
          fontSize={title.fontSize}
          fontWeight={700}
          fontFamily={ctx.fonts.heading}
          fill="#FFFFFF"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}
      <rect x={96} y={baseY + 16} width={92} height={5} fill={accent} />
      {sub.lines.map((line, i) => (
        <text
          key={i}
          x={96}
          y={baseY + 52 + i * sub.lineHeight}
          fontSize={sub.fontSize}
          fontFamily={ctx.fonts.body}
          fill="#FFFFFF"
          fillOpacity={0.88}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}
      {!isChapter && date && (
        <text
          x={W - 96}
          y={104}
          textAnchor="end"
          fontSize={19}
          fontFamily={ctx.fonts.body}
          fill="#FFFFFF"
          fillOpacity={0.75}
          dominantBaseline="alphabetic"
        >
          {date}
        </text>
      )}
    </g>
  )
}

const SPLIT_IMG_W = 540
const SPLIT_TEXT_X = 620
const SPLIT_TEXT_W = W - SPLIT_TEXT_X - 96
/** 图列垂直通栏（2026-07-09 用户裁决）：BrandChrome 对 image_split 页
 * 已整页抑制页脚，无压图问题。 */
const SPLIT_IMG_H = H

/**
 * image_split 出血版式：左列全高出血大图（页顶到页底、贴左缘，无框线），
 * 右栏 kicker + 大标题 + accent 短线 + 副题 + components 的排印层次。
 * 无 image 块时回落 null（调用方走模板正常路径）。
 */
export function ImageSplitPage({
  ir,
  slide,
  ctx,
}: {
  ir: PptxIR
  slide: Slide
  ctx: ComponentCtx
}) {
  const imageComponent = findImageComponent(slide)
  if (!imageComponent) return null
  // 图文范式族（ppt-master P04 右图出血）：image_side=right 时整页镜像——
  // 图列贴右缘、文字区在左。
  const rightSide = slide.image_side === "right"
  const imgX = rightSide ? W - SPLIT_IMG_W : 0
  const textX = rightSide ? 96 : SPLIT_TEXT_X
  const src = ctx.images?.[imageComponent.asset_id]?.src
  const rest = slide.components.filter((b) => b !== imageComponent)
  const org = ir.meta.organization

  // fontWeight 600 而非 700：magazine/creative 的衬线 heading（SimSun/Lora）
  // 被 700 合成加粗抹掉衬线特征——降字重提字号保气势
  const title = layoutSvgText(slide.heading, {
    maxWidth: SPLIT_TEXT_W,
    fontSize: 44,
    maxLines: 3,
    lineHeightRatio: 1.18,
  })
  const sub = layoutSvgText(slide.subheading, {
    maxWidth: SPLIT_TEXT_W,
    fontSize: 21,
    maxLines: 2,
    lineHeightRatio: 1.3,
  })
  let cursor = 128
  const kickerY = cursor
  cursor += 46
  const titleY = cursor + title.lineHeight - 12
  cursor += title.lines.length * title.lineHeight + 18
  const ruleY = cursor
  cursor += 30
  const subY = cursor + 6
  if (sub.lines.length) cursor += sub.lines.length * sub.lineHeight + 24
  const componentsTop = cursor + 8
  const componentsH = H - 96 - componentsTop
  const { placed, dropped } = layoutContentFit(
    "single",
    rest,
    { x: textX, y: componentsTop, w: SPLIT_TEXT_W, h: Math.max(120, componentsH) },
    ctx,
  )

  return (
    <g>
      {src ? (
        <image
          href={src}
          x={imgX}
          y={0}
          width={SPLIT_IMG_W}
          height={SPLIT_IMG_H}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <rect x={imgX} y={0} width={SPLIT_IMG_W} height={SPLIT_IMG_H} fill={ctx.colors.surface} />
      )}
      {imageComponent.caption &&
        (() => {
          const fitted = fitSvgLine(imageComponent.caption, {
            maxWidth: SPLIT_IMG_W - 48,
            fontSize: 15,
            minFontSize: 12,
          })
          return (
            <>
              <rect x={imgX} y={SPLIT_IMG_H - 44} width={SPLIT_IMG_W} height={44} fill="#0A0E14" fillOpacity={0.62} />
              <text
                x={imgX + 24}
                y={SPLIT_IMG_H - 17}
                fontSize={fitted.fontSize}
                fontFamily={ctx.fonts.body}
                fill="#FFFFFF"
                fillOpacity={0.92}
                dominantBaseline="alphabetic"
              >
                {fitted.text}
              </text>
            </>
          )
        })()}
      {org && <rect x={textX} y={kickerY - 13} width={13} height={13} fill={ctx.colors.accent} />}
      {org && (
        <text
          x={textX + 24}
          y={kickerY}
          fontSize={17}
          fontFamily={ctx.fonts.body}
          fill={ctx.colors.muted}
          letterSpacing={2}
          dominantBaseline="alphabetic"
        >
          {org}
        </text>
      )}
      {title.lines.map((line, i) => (
        <text
          key={i}
          x={textX}
          y={titleY + i * title.lineHeight}
          fontSize={title.fontSize}
          fontWeight={600}
          fontFamily={ctx.fonts.heading}
          fill={ctx.colors.primary}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}
      <rect x={textX} y={ruleY} width={72} height={4} fill={ctx.colors.accent} />
      {sub.lines.map((line, i) => (
        <text
          key={i}
          x={textX}
          y={subY + i * sub.lineHeight}
          fontSize={sub.fontSize}
          fontFamily={ctx.fonts.body}
          fill={ctx.colors.muted}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}
      {placed.map((p, i) => (
        <Fragment key={i}>{renderComponent(p.component, p.box, ctx)}</Fragment>
      ))}
      {dropped > 0 && (
        <text
          x={W - 96}
          y={H - 76}
          textAnchor="end"
          fontSize={14}
          fill={ctx.colors.muted}
          fontFamily={ctx.fonts.body}
          dominantBaseline="alphabetic"
        >
          {`+${dropped} 项未展示`}
        </text>
      )}
    </g>
  )
}

const TOP_IMG_H = 356
const BAND_PAD_X = 96

/**
 * image_top 顶图分栏（ppt-master P05）：上半全幅出血图（贴顶三边）+
 * 图下细标题行 + 下方文字 components 自动分列（2-3 块横排，1 块单栏）。
 * 无 image 块回落 null（调用方走模板路径）。
 */
export function ImageTopPage({
  ir: _ir,
  slide,
  ctx,
}: {
  ir: PptxIR
  slide: Slide
  ctx: ComponentCtx
}) {
  const imageComponent = findImageComponent(slide)
  if (!imageComponent) return null
  const src = ctx.images?.[imageComponent.asset_id]?.src
  const rest = slide.components.filter((b) => b !== imageComponent)

  const title = layoutSvgText(slide.heading, {
    maxWidth: W - BAND_PAD_X * 2 - 120,
    fontSize: 30,
    maxLines: 1,
    lineHeightRatio: 1.2,
  })
  const bandY = TOP_IMG_H + 52
  const componentsTop = bandY + 34
  const componentsH = H - 84 - componentsTop
  // 2-3 个文字块横向分列（P05 三栏），单块全宽
  const n = Math.max(1, Math.min(rest.length, 3))
  const colGap = 40
  const colW = (W - BAND_PAD_X * 2 - colGap * (n - 1)) / n
  const cols = rest.slice(0, 3).map((b, i) => {
    const rect = {
      x: BAND_PAD_X + i * (colW + colGap),
      y: componentsTop,
      w: colW,
      h: Math.max(100, componentsH),
    }
    const { placed } = layoutContentFit("single", [b], rect, ctx)
    return placed
  })

  return (
    <g>
      {src ? (
        <image
          href={src}
          x={0}
          y={0}
          width={W}
          height={TOP_IMG_H}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <rect x={0} y={0} width={W} height={TOP_IMG_H} fill={ctx.colors.surface} />
      )}
      {/* 标题行：kicker 点 + 标题 + 贯穿细线（图眉/脚注的杂志结构） */}
      <rect x={BAND_PAD_X} y={bandY - 22} width={13} height={13} fill={ctx.colors.accent} />
      {title.lines.map((line, i) => (
        <text
          key={i}
          x={BAND_PAD_X + 26}
          y={bandY - 10}
          fontSize={title.fontSize}
          fontWeight={600}
          fontFamily={ctx.fonts.heading}
          fill={ctx.colors.primary}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}
      <rect x={BAND_PAD_X} y={bandY + 2} width={W - BAND_PAD_X * 2} height={1} fill={ctx.colors.border} />
      {cols.map((placed, ci) => (
        <Fragment key={ci}>
          {placed.map((p, i) => (
            <Fragment key={i}>{renderComponent(p.component, p.box, ctx)}</Fragment>
          ))}
        </Fragment>
      ))}
    </g>
  )
}

// ── image_annotate 中心图 + 四角放射标注（ppt-master P09/P16）──
// P16 证明矩形中心图即可成立，不依赖圆形 clipPath（导出链未验证 clipPath）。
const ANN_IMG_W = 470
const ANN_IMG_H = 300
const ANN_IMG_X = (W - ANN_IMG_W) / 2
const ANN_IMG_Y = 218
const ANN_FRAME_PAD = 10
/** 左/右列标注文字的锚点 x（左列 anchor=end，右列 anchor=start）。 */
const ANN_LEFT_X = 330
const ANN_RIGHT_X = W - ANN_LEFT_X
const ANN_TEXT_W = 250

type AnnotationCorner = {
  anchor: "start" | "end"
  textX: number
  titleY: number
  /** 引线：文字端 → 图框端（图端画 accent 圆点）。 */
  line: { x1: number; y1: number; x2: number; y2: number }
}

const ANN_CORNERS: AnnotationCorner[] = [
  {
    anchor: "end",
    textX: ANN_LEFT_X,
    titleY: 182,
    line: { x1: ANN_LEFT_X + 14, y1: 188, x2: ANN_IMG_X + 16, y2: ANN_IMG_Y + 46 },
  },
  {
    anchor: "start",
    textX: ANN_RIGHT_X,
    titleY: 182,
    line: { x1: ANN_RIGHT_X - 14, y1: 188, x2: ANN_IMG_X + ANN_IMG_W - 16, y2: ANN_IMG_Y + 46 },
  },
  {
    anchor: "end",
    textX: ANN_LEFT_X,
    titleY: 512,
    line: { x1: ANN_LEFT_X + 14, y1: 506, x2: ANN_IMG_X + 16, y2: ANN_IMG_Y + ANN_IMG_H - 46 },
  },
  {
    anchor: "start",
    textX: ANN_RIGHT_X,
    titleY: 512,
    line: { x1: ANN_RIGHT_X - 14, y1: 506, x2: ANN_IMG_X + ANN_IMG_W - 16, y2: ANN_IMG_Y + ANN_IMG_H - 46 },
  },
]

/** bullets 条目按「：/:」拆 标题+说明（无冒号时整条做标题换行）。 */
function splitAnnotation(item: string): { title: string; desc: string } {
  const m = item.match(/^(.{1,18}?)[：:]\s*(.+)$/)
  if (m) return { title: m[1], desc: m[2] }
  return { title: item, desc: "" }
}

/**
 * image_annotate 中心图 + 四角放射标注：heading 居中在顶、白框中心图、
 * bullets 前 4 条按 tl/tr/bl/br 放射排布（粗标题+弱说明+细引线+accent 点）。
 * 无 image 块回落 null（调用方走模板路径）。
 */
export function ImageAnnotatePage({
  ir: _ir,
  slide,
  ctx,
}: {
  ir: PptxIR
  slide: Slide
  ctx: ComponentCtx
}) {
  const imageComponent = findImageComponent(slide)
  if (!imageComponent) return null
  const src = ctx.images?.[imageComponent.asset_id]?.src
  const bulletsComponent = slide.components.find(
    (b): b is Extract<Slide["components"][number], { type: "bullets" }> => b.type === "bullets",
  )
  const annotations = (bulletsComponent?.items ?? []).slice(0, 4).map(splitAnnotation)

  const title = layoutSvgText(slide.heading, {
    maxWidth: 900,
    fontSize: 32,
    maxLines: 1,
    lineHeightRatio: 1.2,
  })
  const sub = fitSvgLine(slide.subheading ?? "", {
    maxWidth: 860,
    fontSize: 17,
    minFontSize: 14,
  })

  return (
    <g>
      {title.lines.map((line, i) => (
        <text
          key={i}
          x={W / 2}
          y={82 + i * title.lineHeight}
          textAnchor="middle"
          fontSize={title.fontSize}
          fontWeight={600}
          fontFamily={ctx.fonts.heading}
          fill={ctx.colors.primary}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}
      <rect x={W / 2 - 28} y={98} width={56} height={3} fill={ctx.colors.accent} />
      {slide.subheading && (
        <text
          x={W / 2}
          y={132}
          textAnchor="middle"
          fontSize={sub.fontSize}
          fontFamily={ctx.fonts.body}
          fill={ctx.colors.muted}
          dominantBaseline="alphabetic"
        >
          {sub.text}
        </text>
      )}
      {/* 白框照片卡（showcase 的 photo-print 质感，深浅主题通用） */}
      <rect
        x={ANN_IMG_X - ANN_FRAME_PAD}
        y={ANN_IMG_Y - ANN_FRAME_PAD}
        width={ANN_IMG_W + ANN_FRAME_PAD * 2}
        height={ANN_IMG_H + ANN_FRAME_PAD * 2}
        fill="#FFFFFF"
        stroke={ctx.colors.border}
        strokeWidth={1}
      />
      {src ? (
        <image
          href={src}
          x={ANN_IMG_X}
          y={ANN_IMG_Y}
          width={ANN_IMG_W}
          height={ANN_IMG_H}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <rect x={ANN_IMG_X} y={ANN_IMG_Y} width={ANN_IMG_W} height={ANN_IMG_H} fill={ctx.colors.surface} />
      )}
      {imageComponent.caption && (
        <text
          x={W / 2}
          y={ANN_IMG_Y + ANN_IMG_H + ANN_FRAME_PAD + 30}
          textAnchor="middle"
          fontSize={14}
          fontFamily={ctx.fonts.body}
          fill={ctx.colors.muted}
          dominantBaseline="alphabetic"
        >
          {fitSvgLine(imageComponent.caption, { maxWidth: 620, fontSize: 14, minFontSize: 12 }).text}
        </text>
      )}
      {annotations.map((ann, i) => {
        const corner = ANN_CORNERS[i]
        const desc = ann.desc
          ? layoutSvgText(ann.desc, {
              maxWidth: ANN_TEXT_W,
              fontSize: 15,
              maxLines: 2,
              lineHeightRatio: 1.35,
            })
          : null
        const annTitle = layoutSvgText(ann.title, {
          maxWidth: ANN_TEXT_W,
          fontSize: 22,
          maxLines: desc ? 1 : 2,
          lineHeightRatio: 1.2,
        })
        return (
          <g key={i}>
            <line
              x1={corner.line.x1}
              y1={corner.line.y1}
              x2={corner.line.x2}
              y2={corner.line.y2}
              stroke={ctx.colors.border}
              strokeWidth={1.5}
            />
            <circle cx={corner.line.x2} cy={corner.line.y2} r={4} fill={ctx.colors.accent} />
            {annTitle.lines.map((line, li) => (
              <text
                key={li}
                x={corner.textX}
                y={corner.titleY + li * annTitle.lineHeight}
                textAnchor={corner.anchor}
                fontSize={annTitle.fontSize}
                fontWeight={700}
                fontFamily={ctx.fonts.heading}
                fill={ctx.colors.text}
                dominantBaseline="alphabetic"
              >
                {line}
              </text>
            ))}
            {desc?.lines.map((line, li) => (
              <text
                key={li}
                x={corner.textX}
                y={corner.titleY + annTitle.lines.length * annTitle.lineHeight + 6 + li * desc.lineHeight}
                textAnchor={corner.anchor}
                fontSize={desc.fontSize}
                fontFamily={ctx.fonts.body}
                fill={ctx.colors.muted}
                dominantBaseline="alphabetic"
              >
                {line}
              </text>
            ))}
          </g>
        )
      })}
    </g>
  )
}

// 底图高自适应区间（2026-07-14 内容优先）：短内容大图、长内容小图，
// 正文实际底部之下才放图，绝不碰撞。
const MIN_BOTTOM_IMG = 240
const MAX_BOTTOM_IMG = 360

/**
 * image_bottom 上文下图（ppt-master P15 对等对话）：上半 heading/副题/
 * components 居中排布，下半全幅出血图（贴底三边）。
 */
export function ImageBottomPage({
  ir,
  slide,
  ctx,
}: {
  ir: PptxIR
  slide: Slide
  ctx: ComponentCtx
}) {
  const imageComponent = findImageComponent(slide)
  if (!imageComponent) return null
  const src = ctx.images?.[imageComponent.asset_id]?.src
  const rest = slide.components.filter((b) => b !== imageComponent)

  const title = layoutSvgText(slide.heading, {
    maxWidth: 900,
    fontSize: 44,
    maxLines: 2,
    lineHeightRatio: 1.15,
  })
  const sub = layoutSvgText(slide.subheading, {
    maxWidth: 860,
    fontSize: 21,
    maxLines: 2,
    lineHeightRatio: 1.3,
  })
  // 底图垂直通栏到页缘（2026-07-09 用户裁决：绝不拉伸，slice 裁剪出血）。
  // meta 页脚由 BrandChrome 以遮罩浮层压图渲染，caption 条相应上移让位。
  const meta = ir.meta
  const hasMetaFooter = Boolean(
    meta.confidentiality || meta.organization || meta.version || meta.date,
  )
  const captionBottom = hasMetaFooter ? H - 40 : H
  let cursor = 96
  const titleY = cursor + title.lineHeight - 10
  cursor += title.lines.length * title.lineHeight + 14
  const ruleY = cursor
  cursor += 26
  const subY = cursor + 4
  if (sub.lines.length) cursor += sub.lines.length * sub.lineHeight + 18
  const componentsTop = cursor + 6
  // 内容优先（2026-07-14 用户截图：固定底图高把正文区压太小、numbered
  // 内容溢进图片被裁）：正文先排在「到最小底图上缘」的大区，图片起点落
  // 正文实际底部下方，图高 MIN_BOTTOM_IMG..MAX_BOTTOM_IMG 自适应——短内容
  // 大图、长内容小图，正文与图永不碰撞。
  const contentZoneBottom = H - MIN_BOTTOM_IMG - 20
  const { placed } = layoutContentFit(
    "single",
    rest,
    { x: 240, y: componentsTop, w: W - 480, h: Math.max(60, contentZoneBottom - componentsTop) },
    ctx,
  )
  const contentBottom = placed.length ? stackBottom(placed, ctx) : componentsTop
  const imgTop = Math.min(
    Math.max(contentBottom + 24, H - MAX_BOTTOM_IMG),
    H - MIN_BOTTOM_IMG,
  )
  const imgH = H - imgTop

  return (
    <g>
      {title.lines.map((line, i) => (
        <text
          key={i}
          x={W / 2}
          y={titleY + i * title.lineHeight}
          textAnchor="middle"
          fontSize={title.fontSize}
          fontWeight={600}
          fontFamily={ctx.fonts.heading}
          fill={ctx.colors.primary}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}
      <rect x={W / 2 - 42} y={ruleY} width={84} height={4} fill={ctx.colors.accent} />
      {sub.lines.map((line, i) => (
        <text
          key={i}
          x={W / 2}
          y={subY + i * sub.lineHeight}
          textAnchor="middle"
          fontSize={sub.fontSize}
          fontFamily={ctx.fonts.body}
          fill={ctx.colors.muted}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}
      {placed.map((p, i) => (
        <Fragment key={i}>{renderComponent(p.component, p.box, ctx)}</Fragment>
      ))}
      {src ? (
        <image
          href={src}
          x={0}
          y={imgTop}
          width={W}
          height={imgH}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <rect x={0} y={imgTop} width={W} height={imgH} fill={ctx.colors.surface} />
      )}
      {imageComponent.caption &&
        (() => {
          const fitted = fitSvgLine(imageComponent.caption, {
            maxWidth: W - 240,
            fontSize: 15,
            minFontSize: 12,
          })
          return (
            <>
              <rect x={0} y={captionBottom - 40} width={W} height={40} fill="#0A0E14" fillOpacity={0.55} />
              <text
                x={W / 2}
                y={captionBottom - 15}
                textAnchor="middle"
                fontSize={fitted.fontSize}
                fontFamily={ctx.fonts.body}
                fill="#FFFFFF"
                fillOpacity={0.92}
                dominantBaseline="alphabetic"
              >
                {fitted.text}
              </text>
            </>
          )
        })()}
    </g>
  )
}
