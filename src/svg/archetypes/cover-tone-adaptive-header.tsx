// GF/svg/archetypes/cover-tone-adaptive-header.tsx
import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "../layouts/registry"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { CONF_LABEL } from "../../lib/conf-labels"

/**
 * tone-adaptive-header cover archetype（spec §3.2）：全宽版式——顶部 org 标签 +
 * 保密徽标，居左超大标题 + 斜体副标题，底部分隔线 + 作者/日期/版本 meta 行。
 * 有背景图时整体切换为白字 + 黑色半透明幕布模式。自 templates/custom.tsx 的
 * `CustomCover`（68-248 行）提炼，随迁 helper `hasBgImage`（36-44 行，私有
 * 复制，签名/实现原样不变）。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/custom.ts 的 colors。十
 * 六进制值本身不抄进本注释——避免污染本文件的 grep 清零门，核实过程见上）：
 *   - 源文件私有常量 `INK` —— 与 custom token 表当前的 `primary`、`text`
 *     两个字段精确匹配（custom.ts 里 accent 已从 text/primary 拆分独立，
 *     但 text/primary 二者彼此仍是同一个值，尚未拆分）。INK 在源函数体内
 *     混用于两种语境，不能笼统映射到同一字段：
 *       - 文字填色语境（标题、保密徽标文案、作者名）→ `ctx.colors.text`
 *         （下方 `textFg`）
 *       - 强调/描边语境（保密徽标描边，唯一一处）→ `ctx.colors.primary`
 *         （下方 `strokeFg`）
 *     当前两者数值相同，不影响本文件的观感等价断言；**若 custom 主题未来把
 *     text/primary 拆开，`textFg`/`strokeFg` 会分道渲染出不同颜色，需回来
 *     重新核实每一处引用点选的是哪个语境**——这是本文件唯一需要长期盯防的
 *     假设，其余映射都是精确值匹配、无歧义。
 *   - 源文件私有常量 `MUTED` → `ctx.colors.muted` —— 精确匹配。源函数三处
 *     引用：org 标签、副标题、无背景图模式下右下角 meta 文本（该处源码是
 *     直接写 `MUTED` 常量而非经 `withBg` 派生的变量，机械复制为直接引用
 *     `colors.muted`，行为等价——因为该 JSX 分支本就只在 `!withBg` 下渲染，
 *     `MUTED` 与派生变量在那里数值恒等）。
 *   - 源文件私有常量 `BORDER` → `ctx.colors.border` —— 精确匹配，用于无背
 *     景图模式下的底部分隔线。`border` 在 `StyleColors` 上是可选字段，
 *     `?? colors.muted` 兜底沿用 cover-left-anchor.tsx 的既有写法。
 *
 * withBg 白字/黑幕豁免（Global Constraints 产品逻辑白字豁免，同
 * cover-left-anchor.tsx 白字例外先例）：`hasBgImage` 为真时，
 * `textFg`/`strokeFg`/`mutedFg`/`borderColor` 四个派生变量、以及底部单行
 * meta 文本，都固定切到纯白（各自搭配不同 opacity）——这是背景图上强制白字
 * 的结构性产品逻辑，不随主题变化，不进上面的替换表。顶部黑色半透明幕布
 * （scrim for bg-image readability，替代原 linearGradient）同属此类：不是
 * 任何主题 token 的烤色，是固定可读性遮罩——且不是与全局机制重复的遗留
 * 代码：full-slide-svg.tsx 的全局 auto-scrim 机制通过 `isDesignTheme` 显式
 * 把当前主题排除在外（该文件 ~83/88 行注释：当前主题维持裸背景 + 模型
 * overlay 直通），所以这个局部幕布是本主题封面在有背景图时唯一起作用的
 * 遮罩，必须原样保留。
 *
 * `borderColor` 三元表达式里 withBg 为真那一分支是死分支（机械搬运保留）：
 * `borderColor` 只在 `!withBg` 的 JSX 分支里被消费，运行时永远取不到
 * `withBg` 为真那一半，源文件本就如此，不属于 Step C 的映射范畴，不在本次
 * 提炼里顺手"修掉"。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量（除上述白字/黑幕两类豁免——
 * grep 清零门预期命中的 hex 全部落在文件头点名的豁免范围内，逐行可核对）。
 */

/** Check whether the slide has a valid background image asset. Ported
 * verbatim from templates/custom.tsx（36-44 行），私有复制，签名/实现不变。*/
function hasBgImage(
  ir: SvgTemplateProps["ir"],
  slide: SvgTemplateProps["slide"],
): boolean {
  if (slide.background?.kind !== "asset") return false
  const assetId = slide.background.asset_id
  const asset = ir.assets.images[assetId]
  return !!(asset?.src && !asset.error)
}

export function ToneAdaptiveHeaderCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const withBg = hasBgImage(ir, slide)
  // INK 语境映射（见文件头「替换表」）：文字填色 → text，强调/描边 → primary。
  const textFg = withBg ? "#FFFFFF" : colors.text
  const strokeFg = withBg ? "#FFFFFF" : colors.primary
  const mutedFg = withBg ? "#FFFFFF" : colors.muted
  const borderColor = withBg ? "#FFFFFF" : (colors.border ?? colors.muted)
  const borderOpacity = withBg ? 0.18 : 1

  const org = ir.meta.organization
  const conf = ir.meta.confidentiality
  const confLabel = conf ? CONF_LABEL[conf] : null
  const author = ir.meta.authors?.[0]
  const authorText = author
    ? [author.name, author.role].filter(Boolean).join(" · ")
    : null
  const date = ir.meta.date
  const version = ir.meta.version

  const title = layoutSvgText(slide.heading || "", {
    maxWidth: 1120,
    fontSize: 92,
    maxLines: 2,
    lineHeightRatio: 1.08,
    // bold-metrics fix (2026-07-24): this archetype renders its heading
    // via `layoutSvgText` directly, not `fitHeadingLines` (root-cause.md
    // S1), so it doesn't inherit that function's bold-default flip — its
    // own `fontWeight="700"` below (>=600, this codebase's bold threshold,
    // `isBold()` in fonts.ts) needs the same explicit opt-in.
    bold: true,
    fontFamily: fonts.heading,
  })

  const titleY = withBg
    ? title.lines.length > 1
      ? 480
      : 520
    : title.lines.length > 1
      ? 348
      : 392
  const titleLastY =
    titleY + Math.max(0, title.lines.length - 1) * title.lineHeight
  const subtitleY = titleLastY + 58
  const subtitle = slide.subheading
    ? fitSvgLine(slide.subheading, { maxWidth: 1120, fontSize: 34, minFontSize: 18 })
    : null

  return (
    <>
      {/* Scrim for bg-image readability (replaces linearGradient) — see file
          header's withBg 白字/黑幕豁免. */}
      {withBg && (
        <rect width="1280" height="720" fill="#000000" opacity="0.38" />
      )}

      {/* Top left: organization */}
      {org && (
        <text
          x="64"
          y="74"
          fontFamily={fonts.heading}
          fontSize="22"
          fill={mutedFg}
          opacity={withBg ? 0.8 : 1}
          letterSpacing="3"
          dominantBaseline="alphabetic"
        >
          {org}
        </text>
      )}

      {/* Top right: confidentiality badge */}
      {confLabel && (
        <g>
          <rect
            x="1086"
            y="50"
            width="130"
            height="44"
            rx="6"
            fill="none"
            stroke={strokeFg}
            strokeWidth="2"
            strokeOpacity={withBg ? 0.6 : 1}
          />
          <text
            x="1151"
            y="79"
            fontFamily={fonts.heading}
            fontSize="24"
            fill={textFg}
            textAnchor="middle"
            dominantBaseline="alphabetic"
          >
            {confLabel}
          </text>
        </g>
      )}

      {/* Title */}
      {title.lines.map((line, i) => (
        <text
          key={i}
          x="64"
          y={titleY + i * title.lineHeight}
          fontFamily={fonts.heading}
          fontSize={title.fontSize}
          fontWeight="700"
          fill={textFg}
          letterSpacing="-2"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Subtitle */}
      {subtitle && (
        <text
          data-truncated={subtitle.truncated ? "1" : undefined}
          x="64"
          y={subtitleY}
          fontFamily={fonts.body}
          fontSize={subtitle.fontSize}
          fill={mutedFg}
          opacity={withBg ? 0.82 : 1}
          dominantBaseline="alphabetic"
        >
          {subtitle.text}
        </text>
      )}

      {/* Bottom divider + meta row (no-bg mode) */}
      {!withBg && (
        <>
          <line
            x1="64"
            y1="600"
            x2="1216"
            y2="600"
            stroke={borderColor}
            strokeOpacity={borderOpacity}
            strokeWidth="1.6"
          />
          {authorText && (
            <text
              x="64"
              y="650"
              fontFamily={fonts.body}
              fontSize="26"
              fill={textFg}
              dominantBaseline="alphabetic"
            >
              {authorText}
            </text>
          )}
          <text
            x="1216"
            y="650"
            fontFamily={fonts.body}
            fontSize="24"
            fill={colors.muted}
            textAnchor="end"
            dominantBaseline="alphabetic"
          >
            {[date, version].filter(Boolean).join(" · ")}
          </text>
        </>
      )}

      {/* Bottom meta (bg mode, single line) — see file header's withBg
          白字/黑幕豁免. */}
      {withBg && (authorText || date || version) && (
        <text
          x="64"
          y="684"
          fontFamily={fonts.body}
          fontSize="24"
          fill="#FFFFFF"
          opacity="0.7"
          dominantBaseline="alphabetic"
        >
          {[authorText, date, version].filter(Boolean).join("  ·  ")}
        </text>
      )}
    </>
  )
}

// T1d (src domain reorg wave 1): inlined verbatim from registry.ts's former
// COVER_LAYOUTS["tone-adaptive-header"] entry. `CHROME` (registry.ts's
// private `readonly string[] = []` alias, "not fed by an authored
// component") is inlined here to the literal `[]` it always held, to avoid a
// value-import cycle with the registry aggregator (which value-imports this
// export) — see registry.ts's slot-`accepts` convention doc for what `[]`
// means.
export const layoutDef: LayoutDefinition = {
  // cover-tone-adaptive-header.tsx: org kicker, conf badge, heading,
  // subheading; no-bg mode adds a divider + author/date/version meta row,
  // bg mode collapses meta to one white overlay line (same slot names).
  id: "tone-adaptive-header",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "meta", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "rule", accepts: [] },
  ],
}
