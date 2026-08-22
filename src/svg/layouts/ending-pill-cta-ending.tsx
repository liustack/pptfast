import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import type { Slide } from "@/ir"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, measureTextUnits } from "../../lib/svg-text-layout"
import { accessibleInk, readableOn } from "../ink"

/**
 * pill-cta-ending layout（第八波批 1，新表达）：居中日期句 + 洋红胶囊 CTA。
 * 构图抄 campaign 板 ending 页。进共享池，零 theme id、零 hex。胶囊圆角
 * 走 `shape.radius`，封顶半高，不烤板上的 31。CTA 文案取第一条 bullets
 * 项，没有就不画胶囊，不编造致谢。
 *
 * `pinOnly` + `branding: "none"`。
 */

const CENTER_X = 640
const CONTENT_MAX_W = 1088
const HEADING_Y = 300
const SUB_SIZE = 21
const SUB_GAP = 68
const PILL_H = 62
const PILL_GAP = 72
const PILL_MIN_W = 280
const PILL_MAX_W = 640
const PILL_PAD_X = 74
const CTA_SIZE = 22

function ctaSource(slide: Slide): string | null {
  const bullets = slide.components.find((c) => c.type === "bullets")
  if (bullets?.type === "bullets") {
    const item = bullets.items.find((s) => s.trim().length > 0)
    if (item) return item.trim()
  }
  const para = slide.components.find((c) => c.type === "paragraph")
  if (para?.type === "paragraph") {
    const text = para.text.trim()
    if (text) return text
  }
  return null
}

export function PillCtaEnding({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const heading = fitHeadingLines(slide.heading || "", {
    ...layoutDef.headingFit,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const headingLastY =
    HEADING_Y + Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, {
        maxWidth: CONTENT_MAX_W,
        fontSize: SUB_SIZE,
        minFontSize: 14,
        fontFamily: fonts.body,
      })
    : null
  const subY = headingLastY + SUB_GAP
  const ctaRaw = ctaSource(slide)
  const cta = ctaRaw
    ? fitSvgLine(ctaRaw, {
        maxWidth: PILL_MAX_W - PILL_PAD_X * 2,
        fontSize: CTA_SIZE,
        minFontSize: 14,
        fontFamily: fonts.heading,
      })
    : null
  const pillY = (subheading ? subY : headingLastY) + PILL_GAP
  const pillW = cta
    ? Math.min(
        PILL_MAX_W,
        Math.max(
          PILL_MIN_W,
          measureTextUnits(cta.text, { bold: true, fontFamily: fonts.heading }) * cta.fontSize +
            PILL_PAD_X * 2,
        ),
      )
    : 0
  const radius = ctx.shape?.radius ?? PILL_H / 2
  const rx = Math.min(PILL_H / 2, radius)
  const ctaFill = readableOn(colors.accent)
  const ctaBaseline = pillY + Math.round(PILL_H * 0.64)

  return (
    <>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={CENTER_X}
          y={HEADING_Y + i * heading.lineHeight}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={accessibleInk(colors.text, bg, heading.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {subheading && subheading.text && (
        <text
          data-truncated={subheading.truncated ? "1" : undefined}
          x={CENTER_X}
          y={subY}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={accessibleInk(colors.muted, bg, subheading.fontSize)}
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      {cta && (
        <>
          <rect
            x={CENTER_X - pillW / 2}
            y={pillY}
            width={pillW}
            height={PILL_H}
            rx={rx}
            fill={colors.accent}
          />
          <text
            data-truncated={cta.truncated ? "1" : undefined}
            x={CENTER_X}
            y={ctaBaseline}
            textAnchor="middle"
            fontFamily={fonts.heading}
            fontSize={cta.fontSize}
            fontWeight="700"
            fill={ctaFill}
            dominantBaseline="alphabetic"
          >
            {cta.text}
          </text>
        </>
      )}
    </>
  )
}

export const layoutDef = {
  // ending-pill-cta-ending.tsx: pinOnly centered date-line heading,
  // optional subheading, accent capsule CTA from the first bullets item.
  // Empty components draw no pill and invent no thank-you. branding none.
  id: "pill-cta-ending",
  kind: "archetype",
  pinOnly: true,
  branding: "none",
  slideTypes: ["ending"],
  slots: [
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "body", accepts: ["bullets", "paragraph"], capacity: 1 },
  ],
  headingFit: {
    maxWidth: CONTENT_MAX_W,
    fontSize: 52,
    maxLines: 2,
    minPt: 32,
    bold: true,
    lineHeightRatio: 1.18,
  },
} satisfies LayoutDefinition
