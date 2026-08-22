import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { accessibleInk, metaInk } from "../ink"
import { parseEmphasis, renderEmphasisText, sliceEmphasisForLines, stripEmphasis } from "../emphasis"

/**
 * verdict-index cover layout（2026-08-22 封面还原第一波，新表达）：
 * **结论句当标题 + 强调段背后铺 accent 色块 + 最多三列编号短论据**。构图抄
 * consulting 设计板封面样例（`audit19/covers/consulting.html`）：关键词下面
 * 一条强调色，标题下面三条短论据，报告的目录即封面。
 *
 * **它进共享池，不是 consulting 专用**。零 theme id、零 hex。色块跟标题里
 * 的 `**...**` 走，所以画在版式里（motif 恒位红线不许内容感知）。gallery
 * 封面没有强调标记，也就没有色块。
 *
 * 服务场景：季度业务评审封面、战略结论开场、带三条论据的交付页。任何需要
 * 「先给结论，再摊开三条短理由」而不是纸面大标题加短粗条的主题都可以抽。
 *
 * 板上做不到、最近落地：
 *   1. 板上黄块是手抄在第二行下面的。引擎读标题里的 `**...**`，用
 *      `measureTextUnits` 把色块锚在强调段背后。没有标记就不画。
 *   2. 三条论据来自第一个 `bullets` 组件的 `items.slice(0, 3)`。空
 *      `components` 一列都不画，不编造预览文案。
 *   3. CJK 标题不加 letter-spacing。
 *   4. 左下落款收到 x96、y688，让开 logo 盒 (1120,630,96×40)。
 *
 * 第八波（2026-08-22）：几何改走 `style.shape.cover` 的 verdict* knobs。
 * 缺省等于上面这组常量，别的主题抽到本版式时逐字节不变。consulting 把
 * kicker / 标题 / 论据 / 落款收到板上，并打开底缘规矩线。列间竖线板上
 * 没有：一旦写入 wave8 列位或底线 knobs，竖线不画。
 */

const TITLE_X = 96
const TITLE_Y = 316
const TITLE_SIZE = 58
const TITLE_MIN_PT = 36
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1088
const TITLE_LINE_HEIGHT = 78

const KICKER_X = 96
const KICKER_Y = 226
const KICKER_SIZE = 18
const KICKER_TRACKING = 4

const SUBTITLE_X = 96
const SUBTITLE_Y = 446
const SUBTITLE_SIZE = 22
const SUBTITLE_MAX_W = 1088

const COL_X = [96, 470, 844] as const
const COL_RULE_X = [440, 814] as const
const COL_NUM_Y = 556
const COL_BODY_Y = 590
const COL_NUM_SIZE = 24
const COL_BODY_SIZE = 18
const COL_MAX_W = 330
const COL_RULE_Y1 = 530
const COL_RULE_Y2 = 620

const FOOT_X = 96
const FOOT_Y = 688
const FOOT_SIZE = 17

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text)
}

function coverBulletItems(slide: SvgTemplateProps["slide"]): string[] {
  const block = slide.components.find((c) => c.type === "bullets")
  if (!block || block.type !== "bullets") return []
  return block.items.slice(0, 3)
}

export function VerdictIndexCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const cover = ctx.shape?.cover
  const titleY = cover?.verdictTitleY ?? TITLE_Y
  const titleSize = cover?.verdictTitleSize ?? TITLE_SIZE
  const kickerY = cover?.verdictKickerY ?? KICKER_Y
  const colNumY = cover?.verdictColNumY ?? COL_NUM_Y
  const colBodyY = cover?.verdictColBodyY ?? COL_BODY_Y
  const footY = cover?.verdictFootY ?? FOOT_Y
  const footRule = cover?.verdictFootRule === true
  const showColRules = cover?.verdictColNumY == null && cover?.verdictFootRule !== true
  const org = ir.meta.organization
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null
  const version = ir.meta.version
  const headingSource = slide.heading ?? ""
  const plainHeading = stripEmphasis(headingSource)
  const segments = parseEmphasis(headingSource)

  const title = fitHeadingLines(plainHeading, {
    maxWidth: TITLE_MAX_W,
    fontSize: titleSize,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT / TITLE_SIZE,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const lineSegs = sliceEmphasisForLines(segments, title.lines)
  const titleInk = accessibleInk(colors.text, bg, title.fontSize)
  const accentInk = accessibleInk(colors.accent, bg, title.fontSize)

  const kickerTracking = org && !hasCjk(org) ? KICKER_TRACKING : undefined
  const kicker = org
    ? fitSvgLine(org, {
        maxWidth: TITLE_MAX_W,
        fontSize: KICKER_SIZE,
        minFontSize: 12,
        letterSpacing: kickerTracking,
        fontFamily: fonts.body,
      })
    : null

  const subtitle = layoutSvgText(slide.subheading || "", {
    maxWidth: SUBTITLE_MAX_W,
    fontSize: SUBTITLE_SIZE,
    maxLines: 2,
    lineHeightRatio: 1.25,
    fontFamily: fonts.body,
  })

  const items = coverBulletItems(slide)
  const columns = items.map((item, i) => ({
    x: COL_X[i]!,
    num: String(i + 1).padStart(2, "0"),
    body: layoutSvgText(item, {
      maxWidth: COL_MAX_W,
      fontSize: COL_BODY_SIZE,
      maxLines: 2,
      lineHeightRatio: 26 / COL_BODY_SIZE,
      fontFamily: fonts.body,
    }),
  }))

  const footParts = [authorText, version].filter((v): v is string => Boolean(v))
  const foot =
    footParts.length > 0
      ? fitSvgLine(footParts.join(" · "), {
          maxWidth: 1000,
          fontSize: FOOT_SIZE,
          minFontSize: 12,
          fontFamily: fonts.body,
        })
      : null

  const numInk = accessibleInk(colors.primary, bg, COL_NUM_SIZE)
  const bodyInk = accessibleInk(colors.muted, bg, COL_BODY_SIZE)
  const ruleStroke = colors.border ?? colors.muted

  return (
    <>
      {kicker && (
        <text
          data-contrast-tier="meta"
          data-truncated={kicker.truncated ? "1" : undefined}
          x={KICKER_X}
          y={kickerY}
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={metaInk(colors.primary, bg)}
          letterSpacing={kickerTracking}
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      {title.lines.map((line, i) =>
        renderEmphasisText(
          lineSegs[i] ?? [{ text: line, emphasized: false }],
          {
            accent: accentInk,
            padFill: colors.accent,
            baseFill: titleInk,
            fontWeight: "700",
            themeId: ctx.themeId,
            measureWeight: { bold: true, fontFamily: fonts.heading },
          },
          <text
            key={i}
            data-truncated={title.truncated && i === title.lines.length - 1 ? "1" : undefined}
            x={TITLE_X}
            y={titleY + i * TITLE_LINE_HEIGHT}
            fontFamily={fonts.heading}
            fontSize={title.fontSize}
            fontWeight="700"
            fill={titleInk}
            dominantBaseline="alphabetic"
          />,
        ),
      )}

      {subtitle.lines.map((line, i) => (
        <text
          key={`sub-${i}`}
          x={SUBTITLE_X}
          y={SUBTITLE_Y + i * subtitle.lineHeight}
          fontFamily={fonts.body}
          fontSize={subtitle.fontSize}
          fill={metaInk(colors.muted, bg)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {columns.map((col, i) => (
        <g key={col.num}>
          {i > 0 && showColRules && (
            <line
              x1={COL_RULE_X[i - 1]}
              y1={COL_RULE_Y1}
              x2={COL_RULE_X[i - 1]}
              y2={COL_RULE_Y2}
              stroke={ruleStroke}
              strokeWidth={1}
            />
          )}
          <text
            x={col.x}
            y={colNumY}
            fontFamily={fonts.heading}
            fontSize={COL_NUM_SIZE}
            fontWeight="700"
            fill={numInk}
            dominantBaseline="alphabetic"
          >
            {col.num}
          </text>
          {col.body.lines.map((line, li) => (
            <text
              key={li}
              data-truncated={col.body.truncated && li === col.body.lines.length - 1 ? "1" : undefined}
              x={col.x}
              y={colBodyY + li * col.body.lineHeight}
              fontFamily={fonts.body}
              fontSize={col.body.fontSize}
              fill={bodyInk}
              dominantBaseline="alphabetic"
            >
              {line}
            </text>
          ))}
        </g>
      ))}

      {footRule && (
        <line
          x1={FOOT_X}
          y1={footY - 36}
          x2={FOOT_X + TITLE_MAX_W}
          y2={footY - 36}
          stroke={ruleStroke}
          strokeWidth={1}
        />
      )}

      {foot && (
        <text
          data-contrast-tier="meta"
          data-truncated={foot.truncated ? "1" : undefined}
          x={FOOT_X}
          y={footY}
          fontFamily={fonts.body}
          fontSize={foot.fontSize}
          fill={metaInk(colors.muted, bg)}
          dominantBaseline="alphabetic"
        >
          {foot.text}
        </text>
      )}
    </>
  )
}

export const layoutDef: LayoutDefinition = {
  // cover-verdict-index.tsx: verdict heading, optional accent block behind
  // the emphasized run, up to three numbered short arguments from the first
  // bullets component. Empty components draw no preview columns.
  id: "verdict-index",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "body", accepts: ["bullets"], capacity: 1 },
    { name: "meta", accepts: [] },
  ],
}
