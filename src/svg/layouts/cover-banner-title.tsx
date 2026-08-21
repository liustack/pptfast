import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { layoutSvgText } from "../../lib/svg-text-layout"
import { scaleTypePx } from "../heading-fit"
import { accessibleInk } from "../ink"
import { CONF_LABEL } from "../../lib/conf-labels"
import { showsDocumentMeta } from "../document-meta"

/**
 * banner-title cover layout（spec §3.2）：结论横幅式封面——org 圆点标、
 * 大标题、accent 短粗条、meta 分隔线。自 templates/consulting.tsx 的
 * MckinseyNavyCover 提炼，baked 常量全部换 ctx.colors（替换表见 P1 计划
 * Task 4）。纪律：本文件禁 theme id、禁颜色 hex 字面量。
 *
 * 2026-07-09（Wave 3 Task 21b，独立 commit）：P1 逐字节提炼把旧
 * MckinseyNavyCover 的一个既有瑕疵原样搬了进来——accent 条与副题首行轻微
 * 叠压（旧模板 titleLastY+68 vs. accent 条 [+40,+48]，见下方 subtitleY 的
 * 注释）。本任务有意偏离旧模板修掉它，只改了 subtitleY 一个间距常量
 * （68→96），不动 accent 条自身的 40/8。这是本文件与旧模板唯一的几何差异
 * ——cover-banner-title.test.tsx 里对旧模板的 toBe 逐字节断言相应改为观感
 * 等价断言（结构/文本/token 化仍锁），详见该测试文件注释。
 *
 * 2026-08-19（深底组皮肤重设计）：四处以 `colors.primary` 作**文字**色的
 * 填充改走 `accessibleInk`。起因是深底组把 primary 从「亮色主色」改成
 * 「与底几乎同色的横幅/色块底色」（设计稿的角色定义，见 `themes/tech.ts`
 * 的「承 readableOn 反白」一条），本版式却把 primary 直接当页面底色上的
 * 文字用——insight/tech/luxe 三家的大标题因此掉到 1.08-1.28:1。
 * `accessibleInk` 对「本来就过线」的配对是逐字节 no-op（见其自身注释），
 * 实测其余 14 家 primary 压各自背景 3.09-19.80:1，全部过 3:1，输出不变。
 * 装饰用的 primary（标题下的短粗条、密级框描边）不动——那是色块与描边，
 * 归 `motif-candidate-contrast.test.ts` 的装饰可见度地板管，不归文字对比度管。
 */
export function BannerTitleCover({ ir, slide, ctx }: SvgTemplateProps) {
  // 本版式不画自己的背景面板，文字直接压在页面级背景上——与
  // ending-banner-ending.tsx 同一条 `ctx.defaultBg ?? colors.bg` 回退。
  const pageBg = ctx.defaultBg ?? ctx.colors.bg
  const title = layoutSvgText(slide.heading, {
    maxWidth: 1088,
    fontSize: scaleTypePx(84, ctx.shape?.typeScale),
    maxLines: 2,
    lineHeightRatio: 1.08,
    // bold-metrics fix (2026-07-24): this layout renders its heading
    // via `layoutSvgText` directly, not `fitHeadingLines` (root-cause.md
    // S1), so it doesn't inherit that function's bold-default flip — its
    // own `fontWeight="600"` below (>=600, this codebase's bold threshold,
    // `isBold()` in fonts.ts) needs the same explicit opt-in.
    bold: true,
    fontFamily: ctx.fonts.heading,
  })
  const subtitle = layoutSvgText(slide.subheading, {
    maxWidth: 1040,
    fontSize: 34,
    maxLines: 2,
    lineHeightRatio: 1.2,
  })
  const titleY = title.lines.length > 1 ? 322 : 362
  const titleLastY =
    titleY + Math.max(0, title.lines.length - 1) * title.lineHeight
  // 2026-07-09 有意偏离旧模板修叠压 bug：旧 MckinseyNavyCover
  // （templates/consulting.tsx 29-183 行）用 titleLastY+68，但下方 accent 条
  // 占 [titleLastY+40, titleLastY+48]（40 gap + 8 height），只给条底到副题
  // 基线留了 20px（68-48）。副题是 34px 中文 sans body 字（dominantBaseline
  // ="alphabetic"）——按本仓库其余 layout 已反复验证的"六主题统一公式"
  // 惯例（见 content-rail-numbered.tsx/academic.tsx 等 subheadingY 注释：
  // 22px 副题的可视 ascent 按其字号本身估算，即 ascent≈fontSize，外加 14px
  // 目标可视间距），34px 副题的可视 ascent≈34，所以条底到副题基线至少要留
  // 34+14=48px 才不叠压，20px 远远不够，字形顶部与 accent 条底边重叠。这里
  // 的锚点是矩形色块（accent 条），不是文字基线，没有"标题自身 descent"要
  // 清（做法同 content-banner-heading.tsx 的 bannerBottom 锚点，不套六主题
  // 公式里 round(0.12*titleFontSize) 那一项）。改后：
  //   titleLastY + 48(条底) + 34(副题 ascent) + 14(目标间距) = titleLastY + 96
  // 只动这一个间距常量（68→96），条本身的定位（40/8，见下方 rect 注释）不变。
  const subtitleY = titleLastY + 96

  const org = ir.meta.organization
  const conf = showsDocumentMeta(ir) ? ir.meta.confidentiality : undefined
  const confLabel = conf ? CONF_LABEL[conf] : null
  const author = ir.meta.authors?.[0]
  const authorText = author
    ? [author.name, author.role].filter(Boolean).join(" · ")
    : null
  const date = showsDocumentMeta(ir) ? ir.meta.date : undefined
  const version = ir.meta.version

  const metaDividerY =
    subtitleY +
    (subtitle.lines.length > 0
      ? subtitle.lines.length * subtitle.lineHeight + 24
      : 60)
  const metaTextY = metaDividerY + 48

  return (
    <>
      {/* Organization label */}
      <g transform="translate(96, 136)">
        <circle cx="12" cy="-12" r="12" fill={ctx.colors.accent} />
        {org && (
          <text
            x="48"
            y="0"
            fontFamily={ctx.fonts.body}
            fontSize="32"
            fill={accessibleInk(ctx.colors.primary, pageBg, 32)}
            letterSpacing="2"
            dominantBaseline="alphabetic"
          >
            {org}
          </text>
        )}
      </g>

      {/* Confidentiality badge (top right) */}
      {confLabel && (
        <g>
          <rect
            x="1058"
            y="100"
            width="126"
            height="48"
            rx="4"
            fill="none"
            stroke={ctx.colors.primary}
            strokeWidth="2"
          />
          <rect x="1058" y="100" width="8" height="48" fill={ctx.colors.accent} />
          <text
            x="1128"
            y="131"
            fontFamily={ctx.fonts.body}
            fontSize="26"
            fill={accessibleInk(ctx.colors.primary, pageBg, 26)}
            textAnchor="middle"
            dominantBaseline="alphabetic"
          >
            {confLabel}
          </text>
        </g>
      )}

      {/* Main heading lines */}
      {title.lines.map((line, i) => (
        <text
          key={i}
          x="96"
          y={titleY + i * title.lineHeight}
          fontFamily={ctx.fonts.heading}
          fontSize={title.fontSize}
          fontWeight="600"
          fill={accessibleInk(ctx.colors.primary, pageBg, title.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Short, thick navy bar under the title — echoes the Content page's
          assertion banner so Cover reads as the same theme. The 40px gap
          clears the 84px CJK title's own glyph descent so the bar doesn't
          read as an underline; the 8px height is unchanged from the legacy
          template. 2026-07-09: subtitleY (above) grew from titleLastY+68 to
          titleLastY+96 to clear this bar's bottom edge without touching the
          bar's own 40/8 — see subtitleY's own comment for the full math. */}
      <rect x="96" y={titleLastY + 40} width="96" height="8" fill={ctx.colors.primary} />

      {/* Subheading (italic) */}
      {subtitle.lines.map((line, i) => (
        <text
          key={i}
          x="96"
          y={subtitleY + i * subtitle.lineHeight}
          fontFamily={ctx.fonts.body}
          fontSize={subtitle.fontSize}
          fill={ctx.colors.muted}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Meta divider + meta row (author / date / version) */}
      {(authorText || date || version) && (
        <>
          <line
            x1="96"
            y1={metaDividerY}
            x2="820"
            y2={metaDividerY}
            stroke={ctx.colors.border ?? ctx.colors.muted}
            strokeWidth="1.4"
          />
          <text
            x="96"
            y={metaTextY}
            fontFamily={ctx.fonts.body}
            fontSize="26"
            dominantBaseline="alphabetic"
          >
            {authorText && <tspan fill={accessibleInk(ctx.colors.primary, pageBg, 26)}>{authorText}</tspan>}
            {date && (
              <tspan fill={ctx.colors.muted}>{`${authorText ? "    ·    " : ""}${date}`}</tspan>
            )}
            {version && (
              <tspan fill={ctx.colors.muted}>{`${authorText || date ? "    ·    " : ""}${version}`}</tspan>
            )}
          </text>
        </>
      )}
    </>
  )
}

// T1d (src domain reorg wave 1): inlined verbatim from registry.ts's former
// COVER_LAYOUT_DEFS["banner-title"] entry. `CHROME` (registry.ts's private
// `readonly string[] = []` alias, "not fed by an authored component") is
// inlined here to the literal `[]` it always held, to avoid a value-import
// cycle with the registry aggregator (which value-imports this export) — see
// registry.ts's slot-`accepts` convention doc for what `[]` means.
export const layoutDef: LayoutDefinition = {
  // cover-banner-title.tsx: org dot-kicker, conf badge, heading, accent
  // bar, italic subheading, meta divider + author/date/version row.
  id: "banner-title",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "meta", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "rule", accepts: [] },
    { name: "subheading", accepts: [] },
  ],
}
