import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { latinUpper, trackingPx } from "./minimal-shared"
import { accessibleInk, metaInk } from "../ink"

/**
 * institutional-block cover layout（2026-08-22 第七波封面保真，新表达）：
 * **左置巨黑标题 + 顶左宽字距眉行 + 左下强调色签名块 + 右下签名**。构图抄
 * swiss「冷白制度」定稿板（`theme-wave7/Swiss.dc.html` 封面）：172px 硬黑
 * 巨字贴左，眉行是机构名，左下一块 150×14 的强调色条当签名，右下两行弱化
 * 署名。顶边红条和右缘刻度是主题 motif 的事，本版式不画。
 *
 * **它进共享池，不是 swiss 专用**（先例 `cover-colophon.tsx` / 
 * `cover-fashion-masthead.tsx`）。零 theme id、零 hex，颜色走 ctx token。
 *
 * 服务场景：机构年报封面、政策汇报开场、审计交付封面。任何需要「制度腔」
 * 左轴巨字而不是咨询横幅或斜切色块的主题都可以抽。
 *
 * 板上做不到、最近落地：
 *   1. Archivo 900 与 -6px 字距。CJK 不加 letter-spacing（导出会丢字），
 *      字重导出只有粗/不粗，落地 `fontWeight=700`。
 *   2. 板上 `<br>` 强制两行。IR 标题没有换行字段，短标题会落成一行，
 *      长标题由 `fitHeadingLines` 按宽度折。
 *   3. 板上 x852 整高裸格线纵穿正文区，违反五个保护区。网格感改由
 *      swiss-motif 的右缘三格短划承担，本版式不画那根线。
 *   4. 左下签名块板上在 y610-624，有 4px 伸进第五带。上收到 y604-618。
 *   5. 右下签名板上压在 logo 盒上。下移到 logo 盒下方，右缘收到 x1108。
 */

const KICKER_X = 84
const KICKER_Y = 96
const KICKER_SIZE = 13
const KICKER_TRACKING_EM = 0.42

const TITLE_X = 76
const TITLE_TOP = 168
const TITLE_SIZE = 172
const TITLE_MIN_PT = 64
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1100
const TITLE_LINE_HEIGHT_RATIO = 0.98

const SIGN_X = 84
const SIGN_Y = 604
const SIGN_W = 150
const SIGN_H = 14

const META_X = 1108
const META_Y = 672
const META_SIZE = 15
const META_TRACKING_EM = 0.18
const META_LINE_GAP = 28

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text)
}

function hangingBaseline(top: number, fontSize: number): number {
  return top + Math.round(fontSize * 0.8)
}

export function InstitutionalBlockCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const org = ir.meta.organization
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null

  const title = fitHeadingLines(slide.heading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT_RATIO,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const titleY = hangingBaseline(TITLE_TOP, title.fontSize)

  const kickerTracking = org && !hasCjk(org) ? trackingPx(KICKER_SIZE, KICKER_TRACKING_EM) : undefined
  const kicker = org
    ? fitSvgLine(latinUpper(org), {
        maxWidth: TITLE_MAX_W,
        fontSize: KICKER_SIZE,
        minFontSize: 11,
        letterSpacing: kickerTracking,
        fontFamily: fonts.heading,
        bold: true,
      })
    : null

  const bylineLines = [slide.subheading, authorText].filter((v): v is string => Boolean(v))
  const metaLine1 = bylineLines[0]
  const metaLine2 = bylineLines[1]

  const metaTracking = (text: string) => (hasCjk(text) ? undefined : trackingPx(META_SIZE, META_TRACKING_EM))
  const meta1 = metaLine1
    ? fitSvgLine(metaLine1, {
        maxWidth: 420,
        fontSize: META_SIZE,
        minFontSize: 11,
        letterSpacing: metaTracking(metaLine1),
        fontFamily: fonts.body,
      })
    : null
  const meta2 = metaLine2
    ? fitSvgLine(metaLine2, {
        maxWidth: 420,
        fontSize: META_SIZE,
        minFontSize: 11,
        letterSpacing: metaTracking(metaLine2),
        fontFamily: fonts.body,
      })
    : null

  return (
    <>
      {kicker && (
        <text
          data-contrast-tier="meta"
          data-truncated={kicker.truncated ? "1" : undefined}
          x={KICKER_X}
          y={KICKER_Y}
          fontFamily={fonts.heading}
          fontSize={kicker.fontSize}
          fontWeight="700"
          fill={metaInk(colors.muted, bg)}
          letterSpacing={kickerTracking}
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      {title.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={title.truncated && i === title.lines.length - 1 ? "1" : undefined}
          x={TITLE_X}
          y={titleY + i * title.lineHeight}
          fontFamily={fonts.heading}
          fontSize={title.fontSize}
          fontWeight="700"
          fill={accessibleInk(colors.text, bg, title.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      <rect x={SIGN_X} y={SIGN_Y} width={SIGN_W} height={SIGN_H} fill={colors.accent} />

      {meta1 && (
        <text
          data-contrast-tier="meta"
          data-truncated={meta1.truncated ? "1" : undefined}
          x={META_X}
          y={META_Y}
          textAnchor="end"
          fontFamily={fonts.body}
          fontSize={meta1.fontSize}
          fill={metaInk(colors.muted, bg)}
          letterSpacing={metaTracking(meta1.text)}
          dominantBaseline="alphabetic"
        >
          {meta1.text}
        </text>
      )}
      {meta2 && (
        <text
          data-contrast-tier="meta"
          data-truncated={meta2.truncated ? "1" : undefined}
          x={META_X}
          y={META_Y + META_LINE_GAP}
          textAnchor="end"
          fontFamily={fonts.body}
          fontSize={meta2.fontSize}
          fill={metaInk(colors.muted, bg)}
          letterSpacing={metaTracking(meta2.text)}
          dominantBaseline="alphabetic"
        >
          {meta2.text}
        </text>
      )}
    </>
  )
}

export const layoutDef: LayoutDefinition = {
  // cover-institutional-block.tsx: left-axis giant heading, wide-tracked
  // org kicker, accent signature block bottom-left, two-line byline
  // bottom-right. Institutional-report cover grammar.
  id: "institutional-block",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "decor", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
