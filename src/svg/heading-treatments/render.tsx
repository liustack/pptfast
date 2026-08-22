import type { ReactNode } from "react"
import type { SvgTemplateProps } from "../layouts/types"
import type { ContentRect } from "../layout"
import type { ComponentCtx } from "../components/types"
import { chapterNumberFor, sectionNameFor } from "../../lib/derive"
import { hasCjk } from "../layouts/minimal-shared"
import { stacksVertically } from "../../lib/text-script"
import { parseEmphasis } from "../emphasis"
import { accessibleInk, readableOn } from "../ink"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { fitHeadingLines } from "../heading-fit"
import {
  resolveHeadingTreatment,
  type HeadingKnobs,
  type HeadingTreatmentId,
  type NoTitleAnchor,
} from "./assignments"
import { formatChapterLabel, formatJournalRightSlot, headingIsCjk, padded } from "./labels"
import { stackChars } from "./stack"

const PAGE_LEFT = 96
const PAGE_RIGHT = 1184
const PAGE_BOTTOM = 640
const NO_TITLE_Y = 64

function bodyRect(x: number, y: number): ContentRect {
  return { x, y, w: PAGE_RIGHT - x, h: PAGE_BOTTOM - y }
}

function defaultNoTitleAnchor(treatment: HeadingTreatmentId): NoTitleAnchor {
  if (treatment === "ghost_index") return "mini-index"
  if (treatment === "vertical_kicker") return "short-kicker"
  return "none"
}

function themeIdOf(props: SvgTemplateProps): string | undefined {
  return props.ctx.themeId ?? props.ir.theme?.id
}

function borderFill(colors: ComponentCtx["colors"]): string {
  return colors.border ?? colors.muted
}

function warningStroke(colors: ComponentCtx["colors"]): string {
  return colors.warning ?? colors.accent
}

function pageBg(ctx: ComponentCtx): string {
  return ctx.defaultBg ?? ctx.colors.bg
}

function ink(preferred: string, ctx: ComponentCtx, fontSize: number): string {
  return accessibleInk(preferred, pageBg(ctx), fontSize)
}

function fitTitle(text: string, fontSize: number, maxWidth: number, fontFamily: string) {
  return fitHeadingLines(text, {
    maxWidth,
    fontSize,
    maxLines: 2,
    minPt: Math.min(24, fontSize),
    fontFamily,
  })
}

function extraTitleY(fitted: ReturnType<typeof fitHeadingLines>): number {
  return Math.max(0, fitted.lines.length - 1) * fitted.lineHeight
}

export function tryContentHeadingTreatment(
  props: SvgTemplateProps,
): { chrome: ReactNode; contentRect: ContentRect } | null {
  const { ir, slide, index, ctx } = props
  if (slide.type !== "content") return null
  const assignment = resolveHeadingTreatment(themeIdOf(props))
  if (!assignment) return null
  const { treatment, knobs } = assignment
  const chapterNumber = chapterNumberFor(ir.slides, index)
  if ((treatment === "ghost_index" || treatment === "tag_box") && chapterNumber === 0) return null

  const heading = slide.heading?.trim() ?? ""
  const subheading = slide.subheading?.trim() ?? ""
  const sectionName = sectionNameFor(ir.slides, index)
  const cjk = headingIsCjk(sectionName, heading || subheading)
  const anchor = knobs?.noTitleAnchor ?? defaultNoTitleAnchor(treatment)
  const args: RenderArgs = {
    ctx,
    knobs: knobs ?? {},
    heading,
    subheading,
    sectionName,
    chapterNumber,
    cjk,
    anchor,
  }

  if (!heading) return renderNoTitle(treatment, args)

  switch (treatment) {
    case "ghost_index":
      return renderGhostIndex(args)
    case "baseline":
      return renderBaseline(args)
    case "tag_box":
      return renderTagBox(args)
    case "lead_accent":
      return renderLeadAccent(args)
    case "vertical_kicker":
      return renderVerticalKicker(args)
    case "center_mirror":
      return renderCenterMirror(args)
  }
}

interface RenderArgs {
  ctx: ComponentCtx
  knobs: HeadingKnobs
  heading: string
  subheading: string
  sectionName: string | null
  chapterNumber: number
  cjk: boolean
  anchor: NoTitleAnchor
}

function renderNoTitle(
  treatment: HeadingTreatmentId,
  args: RenderArgs,
): { chrome: ReactNode; contentRect: ContentRect } {
  if (treatment === "ghost_index" && args.anchor === "mini-index") {
    return renderGhostMiniIndex(args)
  }
  if (treatment === "vertical_kicker" && args.anchor === "short-kicker") {
    return renderShortKicker(args)
  }
  return { chrome: null, contentRect: bodyRect(PAGE_LEFT, NO_TITLE_Y) }
}

function renderGhostMiniIndex(args: RenderArgs): { chrome: ReactNode; contentRect: ContentRect } {
  const { colors, fonts } = args.ctx
  const fill = args.knobs.indexStyle === "stroke-corner" ? colors.accent : colors.text
  return {
    contentRect: bodyRect(PAGE_LEFT, NO_TITLE_Y),
    chrome: (
      <text
        x={1184}
        y={76}
        fontSize={20}
        fontWeight={700}
        fontFamily={fonts.heading}
        fill={fill}
        opacity={0.35}
        textAnchor="end"
        dominantBaseline="alphabetic"
      >
        {padded(args.chapterNumber)}
      </text>
    ),
  }
}

function kickerSource(args: RenderArgs): string {
  return args.subheading || args.sectionName || ""
}

function renderShortKicker(args: RenderArgs): { chrome: ReactNode; contentRect: ContentRect } {
  const source = kickerSource(args)
  const insetX = args.knobs.insetX ?? PAGE_LEFT
  if (!source || !stacksVertically(source)) {
    return { chrome: null, contentRect: bodyRect(PAGE_LEFT, NO_TITLE_Y) }
  }
  return {
    contentRect: bodyRect(insetX, NO_TITLE_Y),
    chrome: <>{verticalSign(args, source, { short: true })}</>,
  }
}

function verticalSign(args: RenderArgs, source: string, opts: { short: boolean }): ReactNode {
  const { colors, fonts } = args.ctx
  const mark = args.knobs.kickerMark ?? "none"
  const fontSize = opts.short ? 14 : verticalKickerFontSize(args.knobs)
  const pos = verticalKickerPos(args.knobs)
  const fill = verticalKickerFill(args.knobs, colors)
  return (
    <>
      {mark === "vermilion-dot" && (
        <g data-decor="">
          <rect x={99} y={72} width={10} height={10} fill={colors.accent} />
        </g>
      )}
      {mark === "gold-rule" && (
        <g data-decor="">
          <rect x={96} y={64} width={1} height={opts.short ? 96 : 120} fill={colors.accent} />
        </g>
      )}
      {stackChars(source, {
        x: pos.x,
        y: pos.y,
        fontSize,
        fill: ink(fill, args.ctx, fontSize),
        fontFamily: fonts.heading,
      })}
    </>
  )
}

function verticalKickerFontSize(knobs: HeadingKnobs): number {
  if (knobs.kickerMark === "vermilion-dot") return 16
  return 15
}

function verticalKickerPos(knobs: HeadingKnobs): { x: number; y: number } {
  if (knobs.kickerMark === "vermilion-dot") return { x: 104, y: 100 }
  if (knobs.kickerMark === "gold-rule") return { x: 116, y: 78 }
  return { x: 112, y: 76 }
}

function verticalKickerFill(knobs: HeadingKnobs, colors: ComponentCtx["colors"]): string {
  if (knobs.kickerMark === "gold-rule") return colors.accent
  return colors.muted
}

function renderGhostIndex(args: RenderArgs): { chrome: ReactNode; contentRect: ContentRect } {
  const { colors, fonts } = args.ctx
  const hasSub = args.subheading.length > 0
  const title = fitTitle(args.heading, 42, 1088, fonts.heading)
  const y = (hasSub ? 238 : 196) + extraTitleY(title)
  const index = padded(args.chapterNumber)
  const strokeCorner = args.knobs.indexStyle === "stroke-corner"
  return {
    contentRect: bodyRect(PAGE_LEFT, y),
    chrome: (
      <>
        {strokeCorner ? (
          <>
            <text
              x={1184}
              y={86}
              fontSize={34}
              fontWeight={700}
              fontFamily={fonts.heading}
              fill={ink(colors.accent, args.ctx, 34)}
              textAnchor="end"
              dominantBaseline="alphabetic"
            >
              {index}
            </text>
            <g data-decor="">
              <rect x={1122} y={96} width={62} height={1} fill={borderFill(colors)} />
            </g>
          </>
        ) : (
          <text
            x={1300}
            y={212}
            fontSize={230}
            fontWeight={700}
            fontFamily={fonts.heading}
            fill={colors.text}
            opacity={0.07}
            textAnchor="end"
            dominantBaseline="alphabetic"
            data-bleed="1"
          >
            {index}
          </text>
        )}
        {title.lines.map((line, i) => (
          <text
            key={i}
            x={96}
            y={128 + i * title.lineHeight}
            fontSize={title.fontSize}
            fontWeight={700}
            fontFamily={fonts.heading}
            fill={ink(colors.text, args.ctx, title.fontSize)}
            dominantBaseline="alphabetic"
          >
            {line}
          </text>
        ))}
        {hasSub && (
          <text
            x={96}
            y={172 + extraTitleY(title)}
            fontSize={18}
            fontFamily={fonts.body}
            fill={ink(colors.muted, args.ctx, 18)}
            dominantBaseline="alphabetic"
          >
            {args.subheading}
          </text>
        )}
      </>
    ),
  }
}

function renderBaseline(args: RenderArgs): { chrome: ReactNode; contentRect: ContentRect } {
  const { colors, fonts } = args.ctx
  const hasSub = args.subheading.length > 0
  const rule = args.knobs.rule ?? "hairline"
  const rightSlot = args.knobs.rightSlot ?? "none"
  const journalEnhanced = rule === "double-tone" && hasSub
  const insightSide = rule === "hairline" && hasSub
  const sidePhrase = insightSide
    ? fitSvgLine(args.subheading, { maxWidth: 200, fontSize: 16, minFontSize: 16, fontFamily: fonts.body })
    : null
  const title = fitTitle(args.heading, 40, 1088, fonts.heading)
  const lift = extraTitleY(title)
  const contentY = (journalEnhanced ? 248 : 210) + lift
  const numero =
    rightSlot === "numero-name" && args.sectionName
      ? formatJournalRightSlot(args.chapterNumber, args.sectionName)
      : null
  return {
    contentRect: bodyRect(PAGE_LEFT, contentY),
    chrome: (
      <>
        {title.lines.map((line, i) => (
          <text
            key={i}
            x={96}
            y={132 + i * title.lineHeight}
            fontSize={title.fontSize}
            fontWeight={700}
            fontFamily={fonts.heading}
            fill={ink(colors.text, args.ctx, title.fontSize)}
            dominantBaseline="alphabetic"
          >
            {line}
          </text>
        ))}
        {sidePhrase && (
          <text
            x={1184}
            y={132}
            fontSize={sidePhrase.fontSize}
            fontFamily={fonts.body}
            fill={ink(colors.accent, args.ctx, sidePhrase.fontSize)}
            textAnchor="end"
            dominantBaseline="alphabetic"
          >
            {sidePhrase.text}
          </text>
        )}
        {numero && (
          <text
            x={1184}
            y={132}
            fontSize={14}
            fontFamily={fonts.body}
            fill={ink(colors.accent, args.ctx, 14)}
            textAnchor="end"
            dominantBaseline="alphabetic"
          >
            {numero}
          </text>
        )}
        {rule === "hairline" && (
          <g data-decor="">
            <rect x={96} y={162 + lift} width={1088} height={1} fill={borderFill(colors)} />
          </g>
        )}
        {rule === "wenwu" && (
          <g data-decor="">
            <rect x={96} y={158 + lift} width={1088} height={2} fill={colors.primary} />
            <rect x={96} y={164 + lift} width={1088} height={1} fill={colors.primary} />
          </g>
        )}
        {rule === "double-tone" && (
          <g data-decor="">
            <rect x={96} y={158 + lift} width={1088} height={1} fill={colors.text} />
            <rect x={96} y={163 + lift} width={1088} height={1} fill={borderFill(colors)} />
          </g>
        )}
        {journalEnhanced && (
          <text
            x={96}
            y={188 + lift}
            fontSize={18}
            fontFamily={fonts.body}
            fill={ink(colors.muted, args.ctx, 18)}
            dominantBaseline="alphabetic"
          >
            {args.subheading}
          </text>
        )}
      </>
    ),
  }
}

function renderTagBox(args: RenderArgs): { chrome: ReactNode; contentRect: ContentRect } {
  const { colors, fonts } = args.ctx
  const hasSub = args.subheading.length > 0
  const box = args.knobs.box ?? "solid-invert"
  const hud = box === "hud-brackets"
  const boxH = hud ? 30 : 38
  const boxFill = box === "solid-invert" ? colors.text : box === "solid-primary" ? colors.primary : colors.surface
  const labelFill =
    box === "solid-invert" ? colors.bg : box === "solid-primary" ? readableOn(colors.primary) : colors.accent
  const labelKind = args.knobs.chapterLabel ?? "act"
  const label = formatChapterLabel(labelKind, args.chapterNumber, hasCjk(args.sectionName ?? ""))
  const labelY = hud ? 77 : 82
  const labelSize = hud ? 15 : box === "solid-primary" ? 17 : 18
  const title = fitTitle(args.heading, 44, 1088, fonts.heading)
  const lift = extraTitleY(title)
  return {
    contentRect: bodyRect(PAGE_LEFT, (hasSub ? 240 : 206) + lift),
    chrome: (
      <>
        <rect x={96} y={56} width={150} height={boxH} fill={boxFill} />
        {hud && (
          <g data-decor="">
            <path d="M 96 56 l 0 -8 l 8 0" fill="none" stroke={colors.accent} strokeWidth={2} />
            <path d="M 246 86 l 0 8 l -8 0" fill="none" stroke={colors.accent} strokeWidth={2} />
          </g>
        )}
        <text
          x={171}
          y={labelY}
          fontSize={labelSize}
          fontWeight={700}
          fontFamily={hud ? fonts.mono : fonts.heading}
          fill={labelFill}
          textAnchor="middle"
          dominantBaseline="alphabetic"
          {...(hud ? { letterSpacing: 4 } : {})}
        >
          {label}
        </text>
        {title.lines.map((line, i) => (
          <text
            key={i}
            x={96}
            y={150 + i * title.lineHeight}
            fontSize={title.fontSize}
            fontWeight={700}
            fontFamily={fonts.heading}
            fill={ink(colors.text, args.ctx, title.fontSize)}
            dominantBaseline="alphabetic"
          >
            {line}
          </text>
        ))}
        {hasSub && (
          <text
            x={96}
            y={190 + lift}
            fontSize={19}
            fontFamily={fonts.body}
            fill={ink(colors.muted, args.ctx, 19)}
            dominantBaseline="alphabetic"
          >
            {args.subheading}
          </text>
        )}
      </>
    ),
  }
}

function renderLeadAccent(args: RenderArgs): { chrome: ReactNode; contentRect: ContentRect } {
  const { colors, fonts } = args.ctx
  const hasSub = args.subheading.length > 0
  const segments = parseEmphasis(args.heading)
  const hasEmph = segments.some((s) => s.emphasized)
  const typeface = args.knobs.accentStyle === "typeface-shift"
  const titleInner = !hasEmph ? (
    args.heading
  ) : (
    segments.map((seg, i) =>
      typeface ? (
        <tspan
          key={i}
          fontFamily={seg.emphasized ? fonts.heading : fonts.body}
          fill={ink(seg.emphasized ? colors.primary : colors.text, args.ctx, 42)}
        >
          {seg.text}
        </tspan>
      ) : (
        <tspan
          key={i}
          fill={ink(seg.emphasized ? colors.accent : colors.text, args.ctx, 42)}
          fontWeight={seg.emphasized ? 700 : 400}
        >
          {seg.text}
        </tspan>
      ),
    )
  )
  const notes = hasSub
    ? layoutSvgText(args.subheading, {
        maxWidth: 220,
        fontSize: 15,
        maxLines: 2,
        minPt: 15,
        fontFamily: fonts.body,
      })
    : null
  const noteYs = [106, 130]
  const titleFit = hasEmph ? null : fitTitle(args.heading, 42, 1088, fonts.heading)
  const lift = titleFit ? extraTitleY(titleFit) : 0
  return {
    contentRect: bodyRect(PAGE_LEFT, (hasSub ? 200 : 184) + lift),
    chrome: (
      <>
        {titleFit ? (
          titleFit.lines.map((line, i) => (
            <text
              key={i}
              x={96}
              y={120 + i * titleFit.lineHeight}
              fontSize={titleFit.fontSize}
              fontWeight={700}
              fontFamily={fonts.heading}
              fill={ink(colors.text, args.ctx, titleFit.fontSize)}
              dominantBaseline="alphabetic"
            >
              {line}
            </text>
          ))
        ) : (
          <text
            x={96}
            y={120}
            fontSize={42}
            fontWeight={700}
            fontFamily={fonts.heading}
            fill={ink(colors.text, args.ctx, 42)}
            dominantBaseline="alphabetic"
          >
            {titleInner}
          </text>
        )}
        {args.knobs.tail === "gold-dot" && (
          <g data-decor="">
            <circle cx={102} cy={152 + lift} r={3} fill={colors.accent} />
          </g>
        )}
        {args.knobs.tail === "olive-rule" && (
          <g data-decor="">
            <rect x={96} y={142 + lift} width={64} height={2} fill={colors.primary} />
          </g>
        )}
        {notes &&
          notes.lines.map((line, i) => (
            <text
              key={i}
              x={1184}
              y={noteYs[i] ?? 130}
              fontSize={15}
              fontFamily={fonts.body}
              fill={ink(colors.muted, args.ctx, 15)}
              textAnchor="end"
              dominantBaseline="alphabetic"
            >
              {line}
            </text>
          ))}
      </>
    ),
  }
}

function renderVerticalKicker(args: RenderArgs): { chrome: ReactNode; contentRect: ContentRect } {
  const { colors, fonts } = args.ctx
  const source = kickerSource(args)
  const stackable = source.length > 0 && stacksVertically(source)
  const insetX = stackable ? (args.knobs.insetX ?? PAGE_LEFT) : PAGE_LEFT
  const titleX = stackable ? (args.knobs.insetX ?? PAGE_LEFT) : PAGE_LEFT
  const maxW = 1184 - titleX
  const title = fitTitle(args.heading, 42, maxW, fonts.heading)
  const contentY = (args.knobs.kickerMark === "vermilion-dot" ? 200 : 196) + extraTitleY(title)
  return {
    contentRect: bodyRect(insetX, contentY),
    chrome: (
      <>
        {stackable && verticalSign(args, source, { short: false })}
        {title.lines.map((line, i) => (
          <text
            key={i}
            x={titleX}
            y={126 + i * title.lineHeight}
            fontSize={title.fontSize}
            fontWeight={700}
            fontFamily={fonts.heading}
            fill={ink(colors.text, args.ctx, title.fontSize)}
            dominantBaseline="alphabetic"
          >
            {line}
          </text>
        ))}
        {args.knobs.titleRule === "chalk" && (
          <g data-decor="">
            <path
              d="M 166 148 q 160 8 330 3"
              fill="none"
              stroke={warningStroke(colors)}
              strokeWidth={3}
              opacity={0.85}
              strokeLinecap="round"
            />
          </g>
        )}
      </>
    ),
  }
}

function renderCenterMirror(args: RenderArgs): { chrome: ReactNode; contentRect: ContentRect } {
  const { colors, fonts } = args.ctx
  const hasSub = args.subheading.length > 0
  const mirror = args.knobs.mirror ?? "hairline"
  const titleFill = mirror === "hairline" ? colors.accent : mirror === "gold-rule" ? colors.primary : colors.text
  const title = fitTitle(args.heading, 42, 1088, fonts.heading)
  const lift = extraTitleY(title)
  const contentY = (hasSub ? 236 : mirror === "hairline" ? 216 : 212) + lift
  const eyebrowKind = args.knobs.chapterLabel ?? "chapter"
  const eyebrow =
    args.chapterNumber > 0 ? formatChapterLabel(eyebrowKind, args.chapterNumber, args.cjk) : null
  return {
    contentRect: bodyRect(PAGE_LEFT, contentY),
    chrome: (
      <>
        {mirror === "hairline" && (
          <g data-decor="">
            <rect x={500} y={64} width={90} height={1} fill={borderFill(colors)} />
            <rect x={690} y={64} width={90} height={1} fill={borderFill(colors)} />
          </g>
        )}
        {mirror === "bar" && (
          <g data-decor="">
            <rect x={556} y={62} width={24} height={3} fill={colors.accent} />
            <rect x={700} y={62} width={24} height={3} fill={colors.accent} />
          </g>
        )}
        {mirror === "gold-rule" && (
          <g data-decor="">
            <rect x={470} y={60} width={120} height={1.5} fill={colors.accent} />
            <rect x={690} y={60} width={120} height={1.5} fill={colors.accent} />
          </g>
        )}
        {eyebrow && (
          <text
            x={640}
            y={70}
            fontSize={14}
            fontFamily={fonts.body}
            fill={ink(colors.muted, args.ctx, 14)}
            textAnchor="middle"
            dominantBaseline="alphabetic"
          >
            {eyebrow}
          </text>
        )}
        {title.lines.map((line, i) => (
          <text
            key={i}
            x={640}
            y={130 + i * title.lineHeight}
            fontSize={title.fontSize}
            fontWeight={700}
            fontFamily={fonts.heading}
            fill={ink(titleFill, args.ctx, title.fontSize)}
            textAnchor="middle"
            dominantBaseline="alphabetic"
          >
            {line}
          </text>
        ))}
        {(args.knobs.diamond || (hasSub && mirror === "gold-rule")) && (
          <g data-decor="">
            <path d="M 640 156 l 5 7 l -5 7 l -5 -7 z" fill={colors.accent} />
          </g>
        )}
        {hasSub && (
          <text
            x={640}
            y={176 + lift}
            fontSize={17}
            fontFamily={fonts.body}
            fill={ink(colors.muted, args.ctx, 17)}
            textAnchor="middle"
            dominantBaseline="alphabetic"
          >
            {args.subheading}
          </text>
        )}
      </>
    ),
  }
}
