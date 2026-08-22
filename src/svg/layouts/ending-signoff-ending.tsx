import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk, accessibleOpacity, metaInk, readableOn } from "../ink"
import { showsDocumentMeta } from "../document-meta"
import { stripEmphasis } from "../emphasis"

/**
 * signoff-ending（第八波回签收口）：满版 primary 场，左齐行动标题，回签清
 * 单，题下白杠，落款。构图抄 `.issues/design-boards/wave8/b1/Enterprise.dc.html`
 * ending：标题 y300、三条清单 y392/436/480、白杠 y580、落款 y650。
 *
 * 进共享池，不是 enterprise 专用。零 theme id、零 baked hex。不致谢：heading
 * 缺省不兜底 "Thank you."。清单来自第一个 bullets 的 items，空 components
 * 一列都不画，不编造预览文案。
 *
 * 板上做不到、最近落地：
 *   1. CJK 标题不加 letter-spacing。
 *   2. 字色走 `readableOn` / `metaInk` 相对本场 primary。
 *   3. 满版色场由本文件自己铺（`paintsOwnBackground`），主题
 *      `defaultBackgrounds.ending` 保持浅底。
 */

const TITLE_X = 96
const TITLE_Y = 300
const TITLE_SIZE = 52
const TITLE_MIN_PT = 32
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1088

const ITEM_X = 96
const ITEM_Y0 = 392
const ITEM_GAP = 44
const ITEM_SIZE = 21
const ITEM_MAX_W = 1088
const ITEM_MAX = 4
const ITEM_OPACITY = 0.78

const BAR_X = 96
const BAR_W = 120
const BAR_H = 8
const BAR_Y = 580
const BAR_GAP = 56

const FOOT_X = 96
const FOOT_GAP = 70
const FOOT_SIZE = 17
const FOOT_MAX_W = 1000

function signoffItems(slide: SvgTemplateProps["slide"]): string[] {
  const block = slide.components.find((c) => c.type === "bullets")
  if (!block || block.type !== "bullets") return []
  return block.items.map((item) => stripEmphasis(item)).filter((item) => item.trim().length > 0).slice(0, ITEM_MAX)
}

export function SignoffEnding({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const field = colors.primary
  const ink = readableOn(field)
  const org = ir.meta.organization
  const date = showsDocumentMeta(ir) ? ir.meta.date : undefined
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null

  const plainHeading = stripEmphasis(slide.heading ?? "")
  const showTitle = plainHeading.trim().length > 0
  const title = fitHeadingLines(plainHeading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const titleLastY = TITLE_Y + Math.max(0, title.lines.length - 1) * title.lineHeight
  const titleInk = accessibleInk(ink, field, title.fontSize)

  const items = signoffItems(slide)
  const listInk = ink
  const listOpacity = accessibleOpacity(listInk, field, ITEM_SIZE, ITEM_OPACITY)

  const lastItemY = items.length > 0 ? ITEM_Y0 + (items.length - 1) * ITEM_GAP : titleLastY
  const barY = items.length > 0 ? Math.max(BAR_Y, lastItemY + BAR_GAP) : Math.max(BAR_Y, titleLastY + BAR_GAP)

  const footParts = [org, authorText, date].filter((v): v is string => Boolean(v))
  const foot =
    footParts.length > 0
      ? fitSvgLine(footParts.join(" · "), {
          maxWidth: FOOT_MAX_W,
          fontSize: FOOT_SIZE,
          minFontSize: 12,
          fontFamily: fonts.body,
        })
      : null

  return (
    <>
      <rect x={0} y={0} width={1280} height={720} fill={field} />

      {showTitle &&
        title.lines.map((line, i) => (
          <text
            key={i}
            data-truncated={title.truncated && i === title.lines.length - 1 ? "1" : undefined}
            x={TITLE_X}
            y={TITLE_Y + i * title.lineHeight}
            fontFamily={fonts.heading}
            fontSize={title.fontSize}
            fontWeight="700"
            fill={titleInk}
            dominantBaseline="alphabetic"
          >
            {line}
          </text>
        ))}

      {items.map((item, i) => {
        const line = fitSvgLine(item, {
          maxWidth: ITEM_MAX_W,
          fontSize: ITEM_SIZE,
          minFontSize: 14,
          fontFamily: fonts.body,
        })
        return (
          <text
            key={i}
            data-truncated={line.truncated ? "1" : undefined}
            x={ITEM_X}
            y={ITEM_Y0 + i * ITEM_GAP}
            fontFamily={fonts.body}
            fontSize={line.fontSize}
            fill={listInk}
            fillOpacity={listOpacity}
            dominantBaseline="alphabetic"
          >
            {line.text}
          </text>
        )
      })}

      <rect x={BAR_X} y={barY} width={BAR_W} height={BAR_H} fill={ink} />

      {foot && (
        <text
          data-contrast-tier="meta"
          data-truncated={foot.truncated ? "1" : undefined}
          x={FOOT_X}
          y={barY + FOOT_GAP}
          fontFamily={fonts.body}
          fontSize={foot.fontSize}
          fill={metaInk(colors.muted, field)}
          dominantBaseline="alphabetic"
        >
          {foot.text}
        </text>
      )}
    </>
  )
}

export const layoutDef = {
  // ending-signoff-ending.tsx: full-bleed primary field, action heading,
  // sign-off list from the first bullets component, short rule, colophon.
  // Empty heading does not fall back to a thank-you. Empty components draw
  // no preview list.
  id: "signoff-ending",
  kind: "archetype",
  pinOnly: true,
  branding: "none",
  paintsOwnBackground: true,
  slideTypes: ["ending"],
  slots: [
    { name: "heading", accepts: [] },
    { name: "body", accepts: ["bullets"], capacity: 1 },
    { name: "rule", accepts: [] },
    { name: "meta", accepts: [] },
  ],
  headingFit: {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
  },
} satisfies LayoutDefinition
