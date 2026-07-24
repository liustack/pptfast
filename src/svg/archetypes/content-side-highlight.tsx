import type { SvgTemplateProps } from "./types"
import { SvgContent } from "../svg-content"
import { chapterNumberFor, contentIndexInChapter, sectionNameFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { fitEmphasisLine, renderEmphasisTspans } from "../emphasis"
import { accessibleInk, accessibleOpacity, readableOn } from "../ink"

/**
 * side-highlight content archetype (P1 variety wave, task 4 — content-pool
 * expansion, new archetype 1 of 3): a genuinely asymmetric two-region page —
 * a standard-width body column (kicker/heading/subheading/`SvgContent`,
 * unchanged geometry from the pool's other single-stack archetypes) paired
 * with a *persistent, opaque, self-painted `colors.primary` panel* running
 * the page's full content height on the right edge. The panel is chrome, not
 * a `body` slot — it never depends on `slide.components` at all, so it draws
 * identically whether the page has 0 or 4 components.
 *
 * Composition sketch (geometry, written before this file per the task
 * contract): body column x=96..976 (w=880 — matches the pool's own existing
 * narrowest single-stack width, `narrow-column`'s `COLUMN_W`, so this
 * archetype introduces no width narrower than `audit/capacity.ts` already
 * accounts for). Highlight panel x=1008..1184 (w=176), y=72..640 (h=568),
 * rx=12, fill=`colors.primary`. Panel content (top to bottom): a small
 * "{chapter}.{content-in-chapter}" badge label (reusing the exact
 * `chapterNumberFor`/`contentIndexInChapter` convention `rail-numbered`
 * already established, not a new numbering scheme); a large, low-opacity
 * chapter-number watermark digit pair, centered; a short decorative accent
 * rule; and — only when `ir.meta.organization` is set — a single compact
 * organization label near the panel's bottom edge. The panel never renders
 * empty: kicker + watermark are unconditional.
 *
 * Why this is structurally distinct from the pool's other 7 (now 9)
 * archetypes: `two-column`/`aside` split the *body's own components* into
 * multiple columns (a component-count-dependent geometry that collapses to
 * one full-width column at n<2, per `two-column`'s own file comment) —
 * this archetype's second region is never a component destination at all,
 * so the asymmetric silhouette survives regardless of how many components
 * the slide carries, including exactly 1 (the reviewer's flagged weak
 * point for the pool's existing `dense`-tendency members on a
 * single-component page, T1 handoff note 2). `rail-numbered`'s own
 * "second region" is a 4px hairline track; this panel is 176px of opaque
 * fill. `banner-heading`'s filled block sits *above* the heading, full
 * width; this one sits beside the body, full height. `bento-panel`'s grid
 * only appears when there are >=2 components to arrange.
 *
 * Assigned `showcase` (visual-impact-first strategy — a bold, permanently
 * visible color block is the closest content-page echo of showcase's own
 * cover/chapter/ending picks, `poster-center`/`fashion-masthead`/
 * `fashion-chapter`/`fashion-ending`) and beat `anchor` (a loud, unmissable
 * assertion of page identity — the same "one confident statement" register
 * `banner-heading`/`stacked-poster` already occupy that set for).
 *
 * Contrast discipline: every panel-painted text element uses `readableOn`
 * (the panel's own opaque fill is the *only* background that text ever
 * sits on, so a dual-ink max-contrast pick — not a "keep the preferred
 * token if it passes" `accessibleInk` check — is the right tool, mirroring
 * `banner-heading`'s heading/`rail-numbered`'s badge, both of which also
 * paint text directly on a self-painted `colors.primary` shape). The body
 * column's own kicker/heading/subheading/footnote reuse the exact
 * `accessibleInk`-guarded pattern every sibling single-stack archetype
 * already uses against `ctx.defaultBg`.
 *
 * Discipline: no theme id, no hex literal — every color is a token or an
 * `../ink` call.
 */

const BODY_X = 96
const BODY_W = 880
const PANEL_GAP = 32
const PANEL_X = BODY_X + BODY_W + PANEL_GAP // 1008
const PANEL_W = 1184 - PANEL_X // 176
const PANEL_Y = 72
const PANEL_BOTTOM = 640
const PANEL_H = PANEL_BOTTOM - PANEL_Y // 568
const PANEL_RADIUS = 12
const PANEL_PAD = 24

const KICKER_Y = 96
const HEADING_BASELINE = 150

const SUBHEADING_FONT_SIZE = 22
const SUBHEADING_MIN_FONT_SIZE = 16
const SUBHEADING_SLOT = 46

const BADGE_FONT_SIZE = 13
const WATERMARK_FONT_SIZE = 128
const ORG_FONT_SIZE = 14

export function SideHighlightContent({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const section = sectionNameFor(ir.slides, index)
  const kicker = section
    ? fitSvgLine(section, { maxWidth: BODY_W, fontSize: 17, minFontSize: 13, letterSpacing: 2 })
    : null

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: BODY_W,
    fontSize: 42,
    maxLines: 2,
    minPt: 28,
    fontFamily: fonts.heading,
  })
  const headingLastY =
    HEADING_BASELINE + Math.max(0, heading.lines.length - 1) * heading.lineHeight

  const subheading = slide.subheading
    ? fitEmphasisLine(slide.subheading, {
        maxWidth: BODY_W,
        fontSize: SUBHEADING_FONT_SIZE,
        minFontSize: SUBHEADING_MIN_FONT_SIZE,
      })
    : null
  const subheadingY = headingLastY + 42
  const subheadingBudget = subheading ? SUBHEADING_SLOT : 0
  const subheadingFill = subheading
    ? accessibleInk(colors.accent, ctx.defaultBg ?? colors.bg, subheading.fontSize)
    : colors.accent

  const contentRectY = headingLastY + 40 + subheadingBudget
  const contentRectBottom = slide.footnote ? 616 : 632
  const contentRect = {
    x: BODY_X,
    y: contentRectY,
    w: BODY_W,
    h: Math.max(120, contentRectBottom - contentRectY),
  }

  const footnote = slide.footnote
    ? fitSvgLine(slide.footnote, { maxWidth: BODY_W, fontSize: 14, minFontSize: 11 })
    : null

  // Panel content — see file header, always painted regardless of
  // `slide.components`.
  const chNum = Math.max(1, chapterNumberFor(ir.slides, index))
  const contentNum = contentIndexInChapter(ir.slides, index)
  const badge = fitSvgLine(`${chNum}.${contentNum}`, {
    maxWidth: PANEL_W - PANEL_PAD * 2,
    fontSize: BADGE_FONT_SIZE,
    minFontSize: 10,
  })
  const badgeInk = readableOn(colors.primary)
  // Badge/org labels dim their ink to 0.85 for hierarchy — blending toward
  // the panel's own fill can pull an already-max-contrast ink below the
  // size-appropriate ratio, same reasoning `kpi.tsx`'s own
  // `accessibleOpacity` call documents (contrast-system.md). The 128px
  // watermark below stays at its own literal 0.18 — well under
  // `deck-audit.ts`'s DECORATIVE_ALPHA (0.4), so it is intentional
  // decoration the audit never measures, same convention `narrow-column`'s
  // own 0.3-opacity page-number watermark already relies on.
  const badgeOpacity = accessibleOpacity(badgeInk, colors.primary, BADGE_FONT_SIZE, 0.85)
  const orgOpacity = accessibleOpacity(badgeInk, colors.primary, ORG_FONT_SIZE, 0.85)
  const watermark = String(chNum).padStart(2, "0")
  const watermarkCy = PANEL_Y + PANEL_H * 0.5
  const ruleY = PANEL_BOTTOM - 76
  const org = ir.meta.organization
    ? fitSvgLine(ir.meta.organization, { maxWidth: PANEL_W - PANEL_PAD * 2, fontSize: ORG_FONT_SIZE, minFontSize: 10 })
    : null

  return (
    <>
      {/* Body column: standard kicker/heading/subheading/content chrome */}
      {kicker && (
        <text
          data-truncated={kicker.truncated ? "1" : undefined}
          x={BODY_X}
          y={KICKER_Y}
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={colors.muted}
          letterSpacing={2}
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={BODY_X}
          y={HEADING_BASELINE + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {subheading && (
        <text
          x={BODY_X}
          y={subheadingY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={subheadingFill}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(subheading.segments, { accent: colors.text, baseFill: subheadingFill, fontWeight: "700" })}
        </text>
      )}

      <SvgContent arrangement={slide.arrangement} components={slide.components} rect={contentRect} ctx={ctx} />

      {footnote && (
        <text
          data-truncated={footnote.truncated ? "1" : undefined}
          x={BODY_X}
          y={652}
          fontFamily={fonts.body}
          fontSize={footnote.fontSize}
          fill={colors.muted}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {footnote.text}
        </text>
      )}

      {/* Persistent highlight panel — see file header, unconditional. */}
      <rect x={PANEL_X} y={PANEL_Y} width={PANEL_W} height={PANEL_H} rx={PANEL_RADIUS} fill={colors.primary} />

      <text
        data-truncated={badge.truncated ? "1" : undefined}
        x={PANEL_X + PANEL_PAD}
        y={PANEL_Y + 44}
        fontFamily={fonts.body}
        fontSize={badge.fontSize}
        fontWeight="700"
        letterSpacing={1}
        fill={badgeInk}
        opacity={badgeOpacity}
        dominantBaseline="alphabetic"
      >
        {badge.text}
      </text>

      <text
        x={PANEL_X + PANEL_W / 2}
        y={watermarkCy}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={WATERMARK_FONT_SIZE}
        fontWeight="800"
        fill={badgeInk}
        opacity={0.18}
        dominantBaseline="alphabetic"
      >
        {watermark}
      </text>

      <rect x={PANEL_X + PANEL_PAD} y={ruleY} width={28} height={3} fill={badgeInk} opacity={0.4} />

      {org && (
        <text
          data-truncated={org.truncated ? "1" : undefined}
          x={PANEL_X + PANEL_PAD}
          y={PANEL_BOTTOM - 40}
          fontFamily={fonts.body}
          fontSize={org.fontSize}
          fill={badgeInk}
          opacity={orgOpacity}
          dominantBaseline="alphabetic"
        >
          {org.text}
        </text>
      )}
    </>
  )
}
