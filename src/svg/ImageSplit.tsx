import { Fragment } from "react"
import type { Block } from "@/ir"
import type { BlockCtx } from "./blocks/types"
import { renderBlock } from "./blocks"
import { COLUMN_GAP, layoutContentFit, type ContentRect } from "./layout"

/** Share of the content rect the image column takes (参考图章节页 ~42%). */
const IMAGE_COL_RATIO = 0.42

/**
 * `image_split` variant（图片排版 P3）——半版大图 + 侧栏文字。
 *
 * 第一个 `image` 块作为图源，占左列（42% 宽）并撑满内容区全高（slice
 * 裁剪，竖向大图，区别于 `image_focus` 里按块高度渲染的横图卡）；其余
 * 块单栏排进右列。没有 image 块时退化为单栏（与 two_column 缺块退化
 * 同思路——半版留白毫无意义）。
 */
export function ImageSplit({
  blocks,
  rect,
  ctx,
}: {
  blocks: Block[]
  rect: ContentRect
  ctx: BlockCtx
}) {
  const imageBlock = blocks.find(
    (b): b is Extract<Block, { type: "image" }> => b.type === "image",
  )

  if (!imageBlock) {
    const { placed } = layoutContentFit("single", blocks, rect, ctx)
    return (
      <>
        {placed.map((p, i) => (
          <Fragment key={i}>{renderBlock(p.block, p.box, ctx)}</Fragment>
        ))}
      </>
    )
  }

  const imgW = Math.round(rect.w * IMAGE_COL_RATIO)
  const textX = rect.x + imgW + COLUMN_GAP
  const textW = rect.w - imgW - COLUMN_GAP
  const rest = blocks.filter((b) => b !== imageBlock)
  const { placed, dropped } = layoutContentFit(
    "single",
    rest,
    { x: textX, y: rect.y, w: textW, h: rect.h },
    ctx,
  )
  const src = ctx.images?.[imageBlock.asset_id]?.src

  return (
    <>
      <g>
        {src ? (
          <image
            href={src}
            x={rect.x}
            y={rect.y}
            width={imgW}
            height={rect.h}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <>
            <rect x={rect.x} y={rect.y} width={imgW} height={rect.h} fill={ctx.colors.surface} />
            <text
              textAnchor="middle"
              x={rect.x + imgW / 2}
              y={rect.y + rect.h / 2}
              fontSize={14}
              fill={ctx.colors.muted}
              fontFamily={ctx.fonts.body}
              dominantBaseline="alphabetic"
            >
              图片缺失
            </text>
          </>
        )}
        <rect
          x={rect.x + 0.5}
          y={rect.y + 0.5}
          width={imgW - 1}
          height={rect.h - 1}
          fill="none"
          stroke={ctx.colors.border}
          strokeWidth={1}
        />
        {imageBlock.caption && (
          <>
            <rect
              x={rect.x}
              y={rect.y + rect.h - 34}
              width={imgW}
              height={34}
              fill={ctx.colors.primary}
              fillOpacity={0.88}
            />
            <text
              x={rect.x + imgW / 2}
              y={rect.y + rect.h - 12}
              textAnchor="middle"
              fontSize={14}
              fill={ctx.colors.surface}
              fontFamily={ctx.fonts.body}
              dominantBaseline="alphabetic"
            >
              {imageBlock.caption}
            </text>
          </>
        )}
      </g>
      {placed.map((p, i) => (
        <Fragment key={i}>{renderBlock(p.block, p.box, ctx)}</Fragment>
      ))}
      {dropped > 0 && (
        <text
          x={rect.x + rect.w}
          y={rect.y + rect.h - 6}
          textAnchor="end"
          fontSize={14}
          fill={ctx.colors.muted}
          fontFamily={ctx.fonts.body}
          dominantBaseline="alphabetic"
        >
          {`+${dropped} 项未展示`}
        </text>
      )}
    </>
  )
}
