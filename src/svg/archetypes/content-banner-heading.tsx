// GF/svg/archetypes/content-banner-heading.tsx
import type { SvgTemplateProps } from "./types"
import type { PptxIR } from "@/ir"
import { SvgContent } from "../SvgContent"
import { sectionNameFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { fitEmphasisLine, renderEmphasisTspans } from "../emphasis"
import { accessibleInk, readableOn } from "../ink"

/**
 * banner-heading content archetype（spec §3.2，Wave 3 Task 19）：consulting
 * 主题 content 页型的"换骨"语法——不是「kicker + 标题 + 分隔线」，而是全宽的
 * "assertion banner"：一块不透明 `colors.primary` 色块承载白字标题（McKinsey
 * 式"先结论后证据"），banner 高度随标题折成 1/2 行变化，下方内容矩形随之
 * 下移，二者永不重叠。自 templates/consulting.tsx 的 `MckinseyNavyContent`
 * 提炼（351-483 行，Step A 用 `sed -n '351,483p'` 摘录核实——与 brief 给出的
 * 351-503 行不同，503 行已进入下一节 Ending 的头注释，函数体实际到 483 行
 * 为止）。随迁 helper：`hasTlLogo`（源文件 325-330 行，私有复制，判断 IR 里
 * 是否真的存在 tl 位 logo 资产，决定 kicker 要不要为 logo 让位，而不是静态
 * 假设最坏情况）。
 *
 * 替换表（Step B，逐函数实测——同 W2-8/W2-14 的发现，同一源文件里
 * NAVY/YELLOW/MUTED/DIVIDER 这 4 个模块级烤死常量并非每个函数都消费）：
 *   - 对函数区间 351-483 行（含随迁的 hasTlLogo 325-330 行）逐行核对，
 *     NAVY/YELLOW/MUTED/DIVIDER **零命中**——本函数一次也没有引用它们。
 *     源代码里出现的颜色全部已经是 `colors.primary`/`colors.muted`/
 *     `colors.text` 直接消费（kicker 用 muted、banner 填色/subheading 用
 *     primary、subheading 强调段用 text、footnote 用 muted），未烤死。
 *   - 唯一的颜色字面量是 banner 标题文字的纯白 `fill`，处理见下方"白字
 *     例外"，不进替换表。
 * 结论：**无孤儿色**（没有替换表要核实的烤死常量，自然无孤儿），也没有
 * 需要做映射决策的 token 替换——本文件的 Step B 核实结果是"确认源函数已
 * 完全 token 化，无需改动颜色表达式"。
 *
 * 白字例外（同 chapter-banner-chapter.tsx / content-rail-numbered.tsx 记录
 * 的同一类产品逻辑）——**W4 fix round 前**：banner 标题文字曾固定写死纯白
 * 字面量，注释断言"任意主题色下都可读"。design decision 8 的实测推翻了这个
 * 断言：tech 偏亮的 `colors.primary`（`#2DD4E6`）上白字只有 ~1.80:1，一度靠
 * 策展排除（`CONTENT_WITHOUT_BANNER_HEADING`）处理，luxe/campaign/classroom
 * 三个更早的既有排除同一根因。
 *
 * 对比度自适应修复（W4 fix round，根因处置）：banner 标题改用
 * `readableOn(colors.primary)`——banner 本身就是标题唯一的背景来源（本文件
 * 自画，不依赖页面级默认背景）。subheading（本就走"substitutes colors.
 * primary" 的替换策略，见上方注释）进一步收紧为
 * `accessibleInk(colors.primary, ctx.defaultBg, fontSize)`——campaign
 * （3.49:1）/classroom（3.09:1）的 22px 副标题原来不满足 4.5:1 body 门槛，
 * 现落回 `readableOn` 的中性墨色；consulting/enterprise/runway/bloom/
 * heritage（pre-W4 既有五个策展主题）与 luxe/tech 原值均已通过校验，原样
 * 返回、逐字节不变。四处历史排除是否因此失去存在依据，见
 * definitions.ts 的裁定。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量——heading/subheading 两处均已
 * 改为 `../ink` 调用，grep 清零门预期不再命中任何纯白字面量。
 */

const BANNER_X = 96
const BANNER_Y = 72
const BANNER_W = 1088
const BANNER_H_1LINE = 88
const BANNER_H_2LINE = 132
const BANNER_RADIUS = 4
const BANNER_TITLE_X = 120
// Baseline vertical-centering fudge: for a single line at the nominal 34px
// heading size this yields a baseline of 72 + 88/2 + round(34*0.32) = 127,
// matching the spec's fixed reference point, while staying proportional if
// the heading shrinks toward its 22px floor on pathologically long titles.
const BANNER_BASELINE_FUDGE_RATIO = 0.32
const SOURCE_LINE_Y = 648
const CONTENT_RECT_BOTTOM = 620

// Kicker (section-name label) sits above the banner, fully inside
// BrandChrome's tl/tr logo bands' y-range (48-88) regardless of BANNER_Y.
// `brand.logo_asset_id` is unset (no image at all) unless a deck explicitly
// opts a logo into `position: "tl"` — so `hasTlLogo` mirrors BrandChrome's
// own `logo?.src && !logo.error` gate to check the *real* IR instead of
// assuming the worst: align with the banner's own left edge (BANNER_X)
// whenever no tl logo actually resolves, and only fall back to the sideways
// dodge (x=176) when one genuinely does.
const KICKER_Y = 52

function hasTlLogo(ir: PptxIR): boolean {
  const { brand, assets } = ir
  if (brand?.position !== "tl" || !brand.logo_asset_id) return false
  const asset = assets.images[brand.logo_asset_id]
  return !!asset?.src && !asset.error
}

// Subheading: a 22px "so-what" sentence rendered directly below the banner.
// Occupies a slot (22px line + gap) that only exists when `slide.subheading`
// is set — SUBHEADING_SLOT is added to the content rect's y *only* in that
// case, so a slide without a subheading gets byte-identical geometry to
// before this feature existed. Unlike the other five themes' subheading,
// this one anchors off `bannerBottom` (a filled color block with no CJK
// glyph descent), not a title baseline, so it gets its own flat slot value
// rather than a title-font-size-driven formula.
const SUBHEADING_FONT_SIZE = 22
const SUBHEADING_MIN_FONT_SIZE = 16
const SUBHEADING_SLOT = 38

export function BannerHeadingContent({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const section = sectionNameFor(ir.slides, index)

  // See KICKER_Y's doc comment: aligned with the banner's own left edge
  // (BANNER_X) unless a real tl-positioned logo is present, in which case
  // it falls back to the old sideways dodge.
  const kickerX = hasTlLogo(ir) ? 176 : BANNER_X
  const kickerMaxW = 1120 - 16 - kickerX
  const kicker = section
    ? fitSvgLine(section, { maxWidth: kickerMaxW, fontSize: 12, minFontSize: 9, letterSpacing: 4 })
    : null

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: 1040,
    fontSize: 34,
    maxLines: 2,
    minPt: 22,
  })
  const bannerH = heading.lines.length > 1 ? BANNER_H_2LINE : BANNER_H_1LINE
  const bannerBottom = BANNER_Y + bannerH
  const bannerCenterY = BANNER_Y + bannerH / 2
  const baselineFudge = Math.round(heading.fontSize * BANNER_BASELINE_FUDGE_RATIO)

  // Rendered outside/below the banner (the banner is the white-on-primary
  // assertion; this is a separate accent beat under it), at the banner's
  // bottom + 24 baseline. This theme's own `colors.accent` measures far
  // under WCAG AA's 4.5:1 floor for normal-weight text against the off-white
  // content background, so it substitutes `colors.primary` (measured
  // sufficient contrast) as the subheading's base color instead of the
  // usual `colors.accent` — same substitution content-rail-numbered.tsx
  // makes for academic.
  const subheading = fitEmphasisLine(slide.subheading, {
    maxWidth: 1040,
    fontSize: SUBHEADING_FONT_SIZE,
    minFontSize: SUBHEADING_MIN_FONT_SIZE,
  })
  const subheadingY = bannerBottom + 24
  // W4 fix round: keeps colors.primary when it already clears the
  // size-appropriate ratio (every pre-W4-curated theme does — see file
  // header), falls back to readableOn's neutral ink otherwise
  // (campaign/classroom, this archetype's own decision-7 exclusions).
  // Fallback value is never rendered when `subheading` is null.
  // `ctx.defaultBg` is optional (`ComponentCtx`'s own doc comment: a
  // hand-built ctx in a test may omit it) — falls back to the same
  // `colors.bg` `buildCtx` itself defaults to.
  const subheadingFill = subheading
    ? accessibleInk(colors.primary, ctx.defaultBg ?? colors.bg, subheading.fontSize)
    : colors.primary

  const contentRectY = bannerBottom + 32 + (subheading ? SUBHEADING_SLOT : 0)
  const contentRect = {
    x: BANNER_X,
    y: contentRectY,
    w: BANNER_W,
    h: Math.max(0, CONTENT_RECT_BOTTOM - contentRectY),
  }

  const footnote = slide.footnote
    ? fitSvgLine(slide.footnote, { maxWidth: BANNER_W, fontSize: 14, minFontSize: 11 })
    : null

  return (
    <>
      {/* Kicker: section name */}
      {kicker && (
        <text
          x={kickerX}
          y={KICKER_Y}
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={colors.muted}
          letterSpacing="4"
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      {/* Assertion banner: filled primary bar carrying the white heading */}
      <rect
        x={BANNER_X}
        y={BANNER_Y}
        width={BANNER_W}
        height={bannerH}
        rx={ctx.shape?.radius ?? BANNER_RADIUS}
        fill={colors.primary}
      />
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={BANNER_TITLE_X}
          y={
            bannerCenterY -
            ((heading.lines.length - 1) * heading.lineHeight) / 2 +
            i * heading.lineHeight +
            baselineFudge
          }
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="600"
          fill={readableOn(colors.primary)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Subheading: accent so-what sentence below the banner */}
      {subheading && (
        <text
          x={BANNER_X}
          y={subheadingY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={subheadingFill}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(subheading.segments, { accent: colors.text, baseFill: subheadingFill, fontWeight: "700" })}
        </text>
      )}

      {/* Content components below the banner (was a divider + foreignObject) */}
      <SvgContent arrangement={slide.arrangement} components={slide.components} rect={contentRect} ctx={ctx} />

      {/* Footnote only — BrandChrome already renders the y=664 footer
       * hairline for content pages, so this archetype must not draw its own
       * source line at y=648 (16px apart, doubled hairline). */}
      {footnote && (
        <text
          x={BANNER_X}
          y={SOURCE_LINE_Y + 28}
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
