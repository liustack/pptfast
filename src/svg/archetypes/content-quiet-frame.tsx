import type { SvgTemplateProps } from "./types"
import { SvgContent } from "../SvgContent"
import { sectionNameFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { fitEmphasisLine, renderEmphasisTspans } from "../emphasis"
import { accessibleInk } from "../ink"

/**
 * quiet-frame content archetype (P1 variety wave, task 4 — content-pool
 * expansion, new archetype 3 of 3): the pool's second `breathing`-suitable
 * member (T1 handoff hard requirement — `narrow-column` was previously the
 * only one, a single-member `BEAT_TENDENCIES` set the reviewer flagged as
 * over-sensitive to the max-composition agreement case, T1 report note 1).
 *
 * Composition sketch (geometry, written before this file per the task
 * contract): everything centers on the page's horizontal midline (x=640),
 * inside a frame that is symmetric on both sides — x=200..1080 (w=880,
 * 200px margin left *and* right) — a deliberate contrast with
 * `narrow-column`'s own *asymmetric* gutter (96px left margin, 208px
 * right-hand watermark gutter, content flush left). Kicker at y=120
 * (vs. the pool's usual 88-104), heading centered starting at baseline 180
 * (vs. the pool's usual 150-190 — modest, not dramatic, extra headroom),
 * optional centered subheading, then a short *centered* accent hairline
 * (vs. every other archetype's full-width or left-anchored rule) before
 * the content region begins. The content region itself passes
 * `slide.arrangement` straight through unchanged (this archetype's
 * distinguishing feature is the frame around the content, not a bespoke
 * internal split), width 880 — matching, never narrowing past,
 * `narrow-column`'s own `COLUMN_W` (the pool's existing narrowest
 * single-stack width, so this archetype introduces no new minimum
 * `audit/capacity.ts` would need to re-derive against). No watermark, no
 * side gutter — the whitespace itself (symmetric margins, a lower content
 * start, no persistent decoration) is the whole visual signature, which is
 * exactly what "whitespace-led" means as a *structural* difference from
 * `narrow-column`'s own (asymmetric, watermark-carrying) breathing
 * treatment.
 *
 * Assigned `storytelling` (the pool's already-atmospheric, unhurried
 * strategy — `narrow-column`/`stacked-poster` — gains a third, equally
 * restrained sibling) and beat `breathing` (the archetype's entire reason
 * for existing).
 *
 * Discipline: no theme id, no hex literal — every color is a token or an
 * `../ink` call.
 */

const CENTER_X = 640
const FRAME_X = 200
const FRAME_W = 880

const KICKER_Y = 120
const HEADING_BASELINE = 180

const SUBHEADING_FONT_SIZE = 22
const SUBHEADING_MIN_FONT_SIZE = 16

const RULE_W = 48
const RULE_H = 3
const RULE_GAP = 20
const CONTENT_GAP = 28

export function QuietFrameContent({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const section = sectionNameFor(ir.slides, index)
  const kicker = section
    ? fitSvgLine(section, { maxWidth: FRAME_W, fontSize: 15, minFontSize: 12, letterSpacing: 3 })
    : null

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: FRAME_W,
    fontSize: 40,
    maxLines: 2,
    minPt: 26,
  })
  const headingLastY =
    HEADING_BASELINE + Math.max(0, heading.lines.length - 1) * heading.lineHeight

  const subheading = slide.subheading
    ? fitEmphasisLine(slide.subheading, {
        maxWidth: FRAME_W,
        fontSize: SUBHEADING_FONT_SIZE,
        minFontSize: SUBHEADING_MIN_FONT_SIZE,
      })
    : null
  const subheadingY = headingLastY + 42
  const subheadingFill = subheading
    ? accessibleInk(colors.accent, ctx.defaultBg ?? colors.bg, subheading.fontSize)
    : colors.accent

  const ruleY = (subheading ? subheadingY : headingLastY) + RULE_GAP
  const contentY = ruleY + CONTENT_GAP
  const contentBottom = slide.footnote ? 600 : 620
  const contentRect = {
    x: FRAME_X,
    y: contentY,
    w: FRAME_W,
    h: Math.max(120, contentBottom - contentY),
  }

  const footnote = slide.footnote
    ? fitSvgLine(slide.footnote, { maxWidth: FRAME_W, fontSize: 14, minFontSize: 11 })
    : null

  return (
    <>
      {kicker && (
        <text
          data-truncated={kicker.truncated ? "1" : undefined}
          x={CENTER_X}
          y={KICKER_Y}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={colors.muted}
          letterSpacing={3}
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={CENTER_X}
          y={HEADING_BASELINE + i * heading.lineHeight}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="600"
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {subheading && (
        <text
          x={CENTER_X}
          y={subheadingY}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={subheadingFill}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(subheading.segments, { accent: colors.text, baseFill: subheadingFill, fontWeight: "700" })}
        </text>
      )}

      {/* Centered accent hairline — the frame's only decoration, deliberately
          short (RULE_W) and centered, unlike every other archetype's
          full-width or left-anchored rule. */}
      <rect x={CENTER_X - RULE_W / 2} y={ruleY} width={RULE_W} height={RULE_H} rx={1.5} fill={colors.accent} />

      <SvgContent arrangement={slide.arrangement} components={slide.components} rect={contentRect} ctx={ctx} />

      {footnote && (
        <text
          data-truncated={footnote.truncated ? "1" : undefined}
          x={CENTER_X}
          y={648}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={footnote.fontSize}
          fill={colors.muted}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {footnote.text}
        </text>
      )}
    </>
  )
}
