import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitSvgLine, measureTextUnits } from "../../lib/svg-text-layout"
import { accessibleInk, metaInk, readableOn } from "../ink"

/**
 * action-pad-ending（第八波 pinOnly）：下一步清单，不是致谢页。黄垫块是
 * 唯一的 CTA。底细线 + 落款。无 Contact、无版权、无 "Thank you."。
 *
 * 清单优先取第一个 `bullets` 的前三项。没有 bullets 时从 heading 按换行
 * 或「一、/1.」切开，CTA 走 subheading。有 bullets 时 heading 就是 CTA。
 *
 * 构图抄 consulting 设计板 ending：kicker y150，三条 y256/344/432，
 * 垫块 y500 高 56，底线 y640，落款 y676。
 *
 * 纪律：零 theme id、零 baked hex。公开 kicker 用英文 NEXT。
 */

const KICKER_X = 96
const KICKER_Y = 150
const KICKER_SIZE = 17
const KICKER_TRACKING = 8

const ITEM_X = 96
const ITEM_YS = [256, 344, 432] as const
const ITEM_SIZE = 40
const ITEM_MIN_PT = 22
const ITEM_MAX_W = 1088

const PAD_X = 96
const PAD_Y = 500
const PAD_MIN_W = 240
const PAD_H = 56
const PAD_TEXT_SIZE = 22
const PAD_TEXT_Y = 537
const PAD_X_PAD = 48

const FOOT_X = 96
const FOOT_Y = 676
const FOOT_SIZE = 15
const FOOT_RULE_Y = 640
const FOOT_RULE_W = 1088

const NEXT_KICKER = "NEXT"

function coverBulletItems(slide: SvgTemplateProps["slide"]): string[] {
  const block = slide.components.find((c) => c.type === "bullets")
  if (!block || block.type !== "bullets") return []
  return block.items.slice(0, 3)
}

function splitActionLines(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const byNewline = trimmed.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  if (byNewline.length > 1) return byNewline.slice(0, 3)
  const byCn = trimmed.split(/(?=[一二三四五六七八九十]+、)/).map((line) => line.trim()).filter(Boolean)
  if (byCn.length > 1) return byCn.slice(0, 3)
  const byDot = trimmed.split(/(?=(?:^|\s)\d+[.、]\s*)/).map((line) => line.trim()).filter(Boolean)
  if (byDot.length > 1) return byDot.slice(0, 3)
  return [trimmed]
}

function actionItems(slide: SvgTemplateProps["slide"]): string[] {
  const bullets = coverBulletItems(slide)
  if (bullets.length > 0) return bullets
  return splitActionLines(slide.heading ?? "")
}

function actionCta(slide: SvgTemplateProps["slide"]): string {
  if (coverBulletItems(slide).length > 0) return (slide.heading ?? "").trim()
  return (slide.subheading ?? "").trim()
}

export function ActionPadEnding({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const org = ir.meta.organization
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null
  const items = actionItems(slide)
  const ctaSource = actionCta(slide)

  const kicker = fitSvgLine(NEXT_KICKER, {
    maxWidth: ITEM_MAX_W,
    fontSize: KICKER_SIZE,
    minFontSize: 12,
    letterSpacing: KICKER_TRACKING,
    fontFamily: fonts.body,
  })

  const lines = items.map((item, i) => ({
    y: ITEM_YS[i]!,
    body: fitSvgLine(item, {
      maxWidth: ITEM_MAX_W,
      fontSize: ITEM_SIZE,
      minFontSize: ITEM_MIN_PT,
      fontFamily: fonts.heading,
    }),
  }))

  const cta = ctaSource
    ? fitSvgLine(ctaSource, {
        maxWidth: 1000,
        fontSize: PAD_TEXT_SIZE,
        minFontSize: 14,
        fontFamily: fonts.body,
      })
    : null
  const ctaWidth = cta
    ? measureTextUnits(cta.text, { bold: true, fontFamily: fonts.body }) * cta.fontSize
    : 0
  const padW = cta ? Math.min(ITEM_MAX_W, Math.max(PAD_MIN_W, Math.ceil(ctaWidth + PAD_X_PAD))) : 0

  const footParts = [org, authorText].filter((v): v is string => Boolean(v))
  const foot =
    footParts.length > 0
      ? fitSvgLine(footParts.join(" · "), {
          maxWidth: 1000,
          fontSize: FOOT_SIZE,
          minFontSize: 12,
          fontFamily: fonts.body,
        })
      : null

  const itemInk = accessibleInk(colors.text, bg, ITEM_SIZE)
  const ruleStroke = colors.border ?? colors.muted

  return (
    <>
      <text
        data-contrast-tier="meta"
        data-truncated={kicker.truncated ? "1" : undefined}
        x={KICKER_X}
        y={KICKER_Y}
        fontFamily={fonts.body}
        fontSize={kicker.fontSize}
        fill={metaInk(colors.muted, bg)}
        letterSpacing={KICKER_TRACKING}
        dominantBaseline="alphabetic"
      >
        {kicker.text}
      </text>

      {lines.map((line, i) => (
        <text
          key={i}
          data-truncated={line.body.truncated ? "1" : undefined}
          x={ITEM_X}
          y={line.y}
          fontFamily={fonts.heading}
          fontSize={line.body.fontSize}
          fontWeight="700"
          fill={itemInk}
          dominantBaseline="alphabetic"
        >
          {line.body.text}
        </text>
      ))}

      {cta && (
        <>
          <rect x={PAD_X} y={PAD_Y} width={padW} height={PAD_H} fill={colors.accent} />
          <text
            data-truncated={cta.truncated ? "1" : undefined}
            x={PAD_X + padW / 2}
            y={PAD_TEXT_Y}
            textAnchor="middle"
            fontFamily={fonts.body}
            fontSize={cta.fontSize}
            fontWeight="700"
            fill={readableOn(colors.accent)}
            dominantBaseline="alphabetic"
          >
            {cta.text}
          </text>
        </>
      )}

      <line
        x1={FOOT_X}
        y1={FOOT_RULE_Y}
        x2={FOOT_X + FOOT_RULE_W}
        y2={FOOT_RULE_Y}
        stroke={ruleStroke}
        strokeWidth={1}
      />

      {foot && (
        <text
          data-contrast-tier="meta"
          data-truncated={foot.truncated ? "1" : undefined}
          x={FOOT_X}
          y={FOOT_Y}
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
  // ending-action-pad-ending.tsx: pinOnly next-step list, accent pad CTA,
  // foot rule and sign-off. No thank-you. Optional bullets fill the list.
  id: "action-pad-ending",
  kind: "archetype",
  pinOnly: true,
  branding: "none",
  slideTypes: ["ending"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "body", accepts: ["bullets"], capacity: 1 },
    { name: "meta", accepts: [] },
  ],
}
