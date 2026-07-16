// GF/svg/archetypes/cover-constellation.tsx
import type { SvgTemplateProps } from "./types"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { CONF_LABEL } from "../../lib/conf-labels"

/**
 * constellation cover archetype（spec §3.2）：底锚英雄标题 + 右侧半区的 9 点
 * 星座光点 motif（hero 点带三层同心光晕）。自 templates/tech.tsx 的
 * `BentoTechCover`（703-864 行）提炼，无随迁 helper——函数体本身消费的两处
 * 模块级私有常量（`COVER_MOTIF_POINTS`/`COVER_MOTIF_HERO_POINT`，687-700 行，
 * 星座坐标几何）与三个不透明度/描边宽度常量（`BENTO_CARD_STROKE_WIDTH`
 * 56 行、`BENTO_KPI_GLOW_RING1_OPACITY`/`BENTO_KPI_GLOW_RING2_OPACITY`
 * 170-171 行，光晕环复用 KPI 卡片同款视觉语言）随迁为本文件私有常量（不导出、
 * 不建公共 util）。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/tech.ts 的 colors）：
 * Step A 对函数区间（687-864 行）复核 grep 未命中任何 `#XXXXXX` 字面量或
 * theme id 字符串——源函数体已直接消费 `ctx.colors`/`ctx.fonts`
 * （`colors.text`/`colors.muted`/`colors.accent`），无烤死颜色常量。随迁的
 * 三个不透明度/线宽私有常量（"1"/"0.18"/"0.07"）是数值字符串不是颜色，
 * 不在 Step B 替换表范围内，原样随迁。**档位一・逐字节等价**。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量。
 */

// Ported verbatim from templates/tech.tsx (56/170-171 行) — opacity/stroke
// width constants consumed by the glow rings below, not colors.
const BENTO_CARD_STROKE_WIDTH = "1"
const BENTO_KPI_GLOW_RING1_OPACITY = "0.18"
const BENTO_KPI_GLOW_RING2_OPACITY = "0.07"

/**
 * Cover's signature node-line motif: 9 fixed points of varying radius (an
 * organic "constellation" rather than a uniform dot grid), connected in
 * order by one polyline. Geometry is IR-independent, so this is a plain
 * constant, not something computed per-render. Ported verbatim from
 * templates/tech.tsx（687-697 行）.
 */
const COVER_MOTIF_POINTS = [
  { x: 700, y: 300, r: 2 },
  { x: 800, y: 218, r: 3 },
  { x: 902, y: 296, r: 2.5 },
  { x: 940, y: 150, r: 2.5 },
  { x: 1030, y: 110, r: 4 },
  { x: 1004, y: 368, r: 3.5 },
  { x: 1100, y: 170, r: 3 },
  { x: 1148, y: 430, r: 2.5 },
  { x: 1180, y: 128, r: 5 },
]
/** The largest node (last in `COVER_MOTIF_POINTS`) — the one that earns the
 * extra concentric glow rings. Ported verbatim from templates/tech.tsx（700 行）. */
const COVER_MOTIF_HERO_POINT = COVER_MOTIF_POINTS[COVER_MOTIF_POINTS.length - 1]

export function ConstellationCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const org = ir.meta.organization
  const conf = ir.meta.confidentiality
  const confLabel = conf ? CONF_LABEL[conf] : null
  const date = ir.meta.date
  const metaParts = [confLabel, date].filter((v): v is string => Boolean(v))

  const title = fitHeadingLines(slide.heading, {
    maxWidth: 900,
    fontSize: 88,
    maxLines: 2,
    minPt: 44,
  })
  // Bottom-anchored hero title: the *last* line always sits on baseline 520
  // regardless of 1 vs. 2 lines, so the meta row below it never moves.
  const TITLE_BASELINE = 520
  const titleY =
    TITLE_BASELINE - Math.max(0, title.lines.length - 1) * title.lineHeight

  const subtitle = slide.subheading
    ? fitSvgLine(slide.subheading, {
        maxWidth: 900,
        fontSize: 30,
        minFontSize: 18,
      })
    : null

  return (
    <>
      {/* Top-left kicker: organization name */}
      {org && (
        <text
          x="96"
          y="120"
          fontFamily={fonts.body}
          fontSize="22"
          fill={colors.muted}
          letterSpacing="4"
          dominantBaseline="alphabetic"
        >
          {org}
        </text>
      )}

      {/* Subtitle sits directly under the title — accent short bar + subtitle.
          Layering: kicker → [constellation zone] → title → bar → subtitle → meta. */}
      {subtitle && (
        <>
          <rect x="96" y="548" width="84" height="4" fill={colors.accent} />
          <text
            x="96"
            y="596"
            fontFamily={fonts.body}
            fontSize={subtitle.fontSize}
            fill={colors.muted}
            dominantBaseline="alphabetic"
          >
            {subtitle.text}
          </text>
        </>
      )}

      {/* Bottom-left hero title */}
      {title.lines.map((line, i) => (
        <text
          key={i}
          x="96"
          y={titleY + i * title.lineHeight}
          fontFamily={fonts.heading}
          fontSize={title.fontSize}
          fontWeight="700"
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Bottom meta row: confidentiality / date */}
      {metaParts.length > 0 && (
        <text
          x="96"
          y="660"
          fontFamily={fonts.body}
          fontSize="20"
          fill={colors.muted}
          dominantBaseline="alphabetic"
        >
          {metaParts.join("    ·    ")}
        </text>
      )}

      {/* Signature node-line motif: 9 nodes at varying radii (not a uniform
          dot grid) connected by a single faint polyline, with the largest
          node picking up a soft concentric glow — same glow technique the
          bento KPI card body uses (no SVG filter; Chrome 103's controlled
          subset has none). */}
      <polyline
        points={COVER_MOTIF_POINTS.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke={colors.accent}
        strokeWidth="1"
        strokeOpacity="0.25"
      />
      {COVER_MOTIF_POINTS.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={colors.accent} />
      ))}
      {/* Glow around the largest node only (last in COVER_MOTIF_POINTS,
          r=5) — same +4/+8 ring offsets and opacity convention as the KPI
          glow, reused here so the theme's "glow" visual language reads as
          one signature, not two unrelated effects. */}
      <circle
        cx={COVER_MOTIF_HERO_POINT.x}
        cy={COVER_MOTIF_HERO_POINT.y}
        r={COVER_MOTIF_HERO_POINT.r + 4}
        fill="none"
        stroke={colors.accent}
        strokeOpacity={BENTO_KPI_GLOW_RING1_OPACITY}
        strokeWidth={BENTO_CARD_STROKE_WIDTH}
      />
      <circle
        cx={COVER_MOTIF_HERO_POINT.x}
        cy={COVER_MOTIF_HERO_POINT.y}
        r={COVER_MOTIF_HERO_POINT.r + 8}
        fill="none"
        stroke={colors.accent}
        strokeOpacity={BENTO_KPI_GLOW_RING2_OPACITY}
        strokeWidth={BENTO_CARD_STROKE_WIDTH}
      />
      <circle
        cx={COVER_MOTIF_HERO_POINT.x}
        cy={COVER_MOTIF_HERO_POINT.y}
        r={COVER_MOTIF_HERO_POINT.r + 18}
        fill="none"
        stroke={colors.accent}
        strokeOpacity="0.1"
        strokeWidth={BENTO_CARD_STROKE_WIDTH}
      />
      <circle
        cx={COVER_MOTIF_HERO_POINT.x}
        cy={COVER_MOTIF_HERO_POINT.y}
        r={COVER_MOTIF_HERO_POINT.r + 30}
        fill="none"
        stroke={colors.accent}
        strokeOpacity="0.05"
        strokeWidth={BENTO_CARD_STROKE_WIDTH}
      />
    </>
  )
}
