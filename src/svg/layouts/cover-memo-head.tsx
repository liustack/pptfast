import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, measureTextUnits } from "../../lib/svg-text-layout"
import { trackingPx } from "./minimal-shared"
import { accessibleInk, metaInk } from "../ink"

/**
 * memo-head cover layout（2026-08-22 第七波封面保真，新表达）：
 * **MEMORANDUM 眉行 + 强调色双线 + 衬线标题 + 末词重笔下划 + FROM/RE
 * 打字机落款**。构图抄 memo「打字机决定」定稿板（`theme-wave7/Memo.dc.html`
 * 封面）。红只成线与字，永不成面。
 *
 * **它进共享池，不是 memo 专用**。零 theme id、零 hex。MEMORANDUM 是这份
 * 公文头的构造件（journal 期号「№」先例），不是某一家主题的文案。
 *
 * 服务场景：决策通报封面、会后 leave-behind、政策落地备忘录。任何需要
 * 「这不是讨论，是已经写下的决定」那一页的主题都可以抽。
 *
 * 与 memo-motif 的分工：motif 的顶缘双线 + MEMORANDUM 在封面会和本版式
 * 叠成两份公文头，所以 motif 在 cover 页整片退让（playbill 在 chapter
 * 退让的同一写法）。内容/章节/收尾页仍走页缘那一份。
 *
 * 板上做不到、最近落地：
 *   1. Courier Prime 不在 SAFE_FONTS，眉行与 FROM/RE 走 `ctx.fonts.mono`
 *      （memo 主题打头 Courier New）。
 *   2. 板上只划「决定」二字。IR 没有「强调哪几个字」字段，下划落在末行
 *      最后一词（有空格按空格切，CJK 无空格取末两字）。
 *   3. 板上 `<br>` 强制两行。短标题按宽度折，不另造换行字段。
 *   4. Latin 眉行 0.6em 字距预览保留，svg2pptx 不映射 letter-spacing，
 *      导出变紧。
 */

const EYEBROW = "MEMORANDUM"
const EYEBROW_X = 100
const EYEBROW_Y = 104
const EYEBROW_SIZE = 22
const EYEBROW_TRACKING_EM = 0.6

const RULE_X = 100
const RULE_W = 1080
const THICK_RULE_Y = 150
const THIN_RULE_Y = 156

const TITLE_X = 96
const TITLE_TOP = 240
const TITLE_SIZE = 88
const TITLE_MIN_PT = 44
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1050
const TITLE_LINE_HEIGHT_RATIO = 1.32
const UNDERLINE_STROKE = 6
const UNDERLINE_GAP = 8

const FROM_X = 100
const FROM_Y = 560
const RE_Y = 596
const FOOTER_SIZE = 17
const FOOTER_TRACKING_EM = 0.08

function hangingBaseline(top: number, fontSize: number): number {
  return top + Math.round(fontSize * 0.8)
}

function lastRun(line: string): { prefix: string; run: string } {
  const space = line.lastIndexOf(" ")
  if (space >= 0) return { prefix: line.slice(0, space + 1), run: line.slice(space + 1) }
  const chars = Array.from(line)
  if (chars.length <= 2) return { prefix: "", run: line }
  return { prefix: chars.slice(0, -2).join(""), run: chars.slice(-2).join("") }
}

export function MemoHeadCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const org = ir.meta.organization
  const mono = fonts.mono

  const eyebrowTracking = trackingPx(EYEBROW_SIZE, EYEBROW_TRACKING_EM)
  const title = fitHeadingLines(slide.heading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT_RATIO,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
    bold: false,
  })
  const titleY = hangingBaseline(TITLE_TOP, title.fontSize)
  const titleLastY = titleY + Math.max(0, title.lines.length - 1) * title.lineHeight
  const lastLine = title.lines[title.lines.length - 1] ?? ""
  const { prefix, run } = lastRun(lastLine)
  const weight = { bold: false, fontFamily: fonts.heading }
  const underlineX = TITLE_X + measureTextUnits(prefix, weight) * title.fontSize
  const underlineW = measureTextUnits(run, weight) * title.fontSize
  const underlineY = titleLastY + UNDERLINE_GAP

  const footerTracking = trackingPx(FOOTER_SIZE, FOOTER_TRACKING_EM)
  const fromText = org ? `FROM: ${org}` : null
  const reText = slide.subheading ? `RE:   ${slide.subheading}` : null
  const fromLine = fromText
    ? fitSvgLine(fromText, {
        maxWidth: 1080,
        fontSize: FOOTER_SIZE,
        minFontSize: 12,
        letterSpacing: footerTracking,
        fontFamily: mono,
      })
    : null
  const reLine = reText
    ? fitSvgLine(reText, {
        maxWidth: 1080,
        fontSize: FOOTER_SIZE,
        minFontSize: 12,
        letterSpacing: footerTracking,
        fontFamily: mono,
      })
    : null

  return (
    <>
      <text
        x={EYEBROW_X}
        y={EYEBROW_Y}
        fontFamily={mono}
        fontSize={EYEBROW_SIZE}
        fontWeight="700"
        fill={accessibleInk(colors.accent, bg, EYEBROW_SIZE)}
        letterSpacing={eyebrowTracking}
        dominantBaseline="alphabetic"
      >
        {EYEBROW}
      </text>
      <line
        x1={RULE_X}
        y1={THICK_RULE_Y}
        x2={RULE_X + RULE_W}
        y2={THICK_RULE_Y}
        stroke={colors.accent}
        strokeWidth="3"
      />
      <line
        x1={RULE_X}
        y1={THIN_RULE_Y}
        x2={RULE_X + RULE_W}
        y2={THIN_RULE_Y}
        stroke={colors.accent}
        strokeWidth="1"
      />

      {title.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={title.truncated && i === title.lines.length - 1 ? "1" : undefined}
          x={TITLE_X}
          y={titleY + i * title.lineHeight}
          fontFamily={fonts.heading}
          fontSize={title.fontSize}
          fontWeight="400"
          fill={accessibleInk(colors.text, bg, title.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {underlineW > 0 && (
        <line
          x1={underlineX}
          y1={underlineY}
          x2={underlineX + underlineW}
          y2={underlineY}
          stroke={colors.accent}
          strokeWidth={UNDERLINE_STROKE}
          strokeLinecap="butt"
        />
      )}

      {fromLine && (
        <text
          data-contrast-tier="meta"
          data-truncated={fromLine.truncated ? "1" : undefined}
          x={FROM_X}
          y={FROM_Y}
          fontFamily={mono}
          fontSize={fromLine.fontSize}
          fill={metaInk(colors.muted, bg)}
          letterSpacing={footerTracking}
          dominantBaseline="alphabetic"
        >
          {fromLine.text}
        </text>
      )}
      {reLine && (
        <text
          data-contrast-tier="meta"
          data-truncated={reLine.truncated ? "1" : undefined}
          x={FROM_X}
          y={RE_Y}
          fontFamily={mono}
          fontSize={reLine.fontSize}
          fill={metaInk(colors.muted, bg)}
          letterSpacing={footerTracking}
          dominantBaseline="alphabetic"
        >
          {reLine.text}
        </text>
      )}
    </>
  )
}

export const layoutDef: LayoutDefinition = {
  // cover-memo-head.tsx: document-header cover — MEMORANDUM eyebrow,
  // accent double rules, serif heading with last-run underline, FROM/RE
  // typewriter footer. Decision-memo grammar.
  id: "memo-head",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "rule", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
