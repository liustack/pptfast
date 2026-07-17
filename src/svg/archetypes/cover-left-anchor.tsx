// GF/svg/archetypes/cover-left-anchor.tsx
import type { SvgTemplateProps } from "./types"
import { fitHeadingLines } from "../heading-fit"
import { layoutSvgText } from "../../lib/svg-text-layout"
import { CONF_LABEL } from "../../lib/conf-labels"

/**
 * left-anchor cover archetype（spec §3.2）：左侧 40%宽通栏色块 + 右侧留白面板——
 * 色块内嵌白色主标题，org / 保密标 / 副标题 / meta 全部挪到右侧白面板。自
 * templates/academic.tsx 的 BCGEmeraldCover（62-234 行）提炼，无随迁 helper。
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量——本文件有两处豁免（白字 + 装饰
 * 深色三角），均在下方点名理由并有测试锁住，grep 清零门预期恰好命中这两处。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/academic.ts 的 colors。
 * 十六进制值本身不抄进本注释——避免污染本文件的 grep 清零门，核实过程见
 * w1t1 任务报告）：
 *   - `colors.primary` / `colors.accent`：源函数已直接消费 `ctx.colors`，未
 *     烤死，原样保留。
 *   - 源文件私有常量 `TEXT`  → `ctx.colors.text`  —— 与 academic token 表逐
 *     字符精确匹配。
 *   - 源文件私有常量 `MUTED` → `ctx.colors.muted` —— 精确匹配。
 *   - 源文件私有常量 `HAIRLINE` → `ctx.colors.border ?? ctx.colors.muted` ——
 *     精确匹配 academic 的 border 字段，`??` 兜底沿用 cover-banner-title.tsx
 *     的既有写法（`border` 在 StyleColors 上是可选字段）。
 *
 * 装饰色豁免（修订，取代最初的"孤儿色并入 primary"方案——见下方修复记录）：
 * 源文件私有常量 `TRIANGLE_DEEP` 是色块角落三角形的填色，其自身注释写明是
 * "one shade darker than colors.primary"，语义上就是"与 primary 同色系但更深
 * 一号"的纯装饰对比色，不代表 token 表里任何一个语义字段（不是 primary、不是
 * accent，也没有 primaryDark 这类字段）——若强行并入 primary，三角形会与背景
 * 色块同色而彻底隐形，等于删除了一个可见装饰元素，不是"观感等价的降级"而是
 * "观感被破坏"。比照计划 Wave 3 Task 22（tech 主题 Decor 的渐变款私有装饰常量
 * 先例：装饰性数值留在 archetype 文件内、不进 ctx.colors），本文件原样保留
 * `TRIANGLE_DEEP` 的十六进制值作为文件私有装饰常量（不导出、不进 token 替换
 * 表），在测试里用同白字豁免一样的锁法断言其值出现在输出中。
 *
 * 白字例外（Global Constraints "产品逻辑白字"豁免，同 custom.tsx withBg 分支
 * 先例）：主标题固定画在不透明的 40%宽 `colors.primary` 色块内部，为保证在
 * 任意主题色下都可读，标题字色写死为纯白——这不是某个主题的烤死色（它不随
 * 主题变化，也不在任何 token 字段里），是"色块上必须白字"的结构性产品逻辑，
 * 故不进上面的替换表，予以保留并在测试里锁死（跨主题渲染时仍应固定为纯白，
 * 不会变成任何主题的 primary/accent/text）。
 *
 * 修复记录（协调方 review 后订正）：初版把 `TRIANGLE_DEEP` 当孤儿色并入了
 * `colors.primary`，判定为"观感等价档的可接受降级"。协调方指出这个判断不
 * 成立——装饰元素从可见变为完全隐形是观感被破坏，不是等价，遂改为上面的
 * "装饰色豁免"方案：原样保留私有 hex 常量，不做 token 映射。
 */

const COVER_BLOCK_W = 512 // 40% of the 1280-wide canvas
const COVER_TITLE_X = 64
const COVER_TITLE_MAX_W = 360
const COVER_BLOCK_CENTER_Y = 360 // vertical center of the full-height block
const COVER_RIGHT_X = COVER_BLOCK_W + 64 // 576
const COVER_RIGHT_EDGE = 1184 // mirrors the 96px page margin used elsewhere (1280 - 96)
const COVER_RIGHT_MAX_W = COVER_RIGHT_EDGE - COVER_RIGHT_X

// Shared vertical-centering convention (see consulting.tsx's assertion
// banner for the original derivation): for a single line at `fontSize`,
// `pivotY + round(fontSize * 0.32)` lands the baseline visually centered on
// `pivotY`; multi-line blocks spread symmetrically around the same pivot.
const BASELINE_FUDGE_RATIO = 0.32

// Decoration-only swatch (see file header's "装饰色豁免"): one shade darker
// than `colors.primary`, used solely for the corner triangle's same-hue
// contrast. Deliberately NOT mapped to any `ctx.colors` field — there is no
// token for "primary but darker", and merging it into `primary` would make
// the triangle invisible against the block it sits on (see the header's
// fix-record). Ported verbatim from templates/academic.tsx.
const TRIANGLE_DEEP = "#004C38"

export function LeftAnchorCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx

  // Narrow (420px) in-block column: a CJK title routinely wraps to 2-3 lines
  // at hero scale, and the block runs the full 720px page height so there's
  // room — hence maxLines 3 here vs. the usual 2, with a 32pt floor to stay
  // legible even for a pathologically long title.
  const title = fitHeadingLines(slide.heading, {
    maxWidth: COVER_TITLE_MAX_W,
    fontSize: 64,
    maxLines: 3,
    minPt: 32,
  })
  const titleFudge = Math.round(title.fontSize * BASELINE_FUDGE_RATIO)
  const titleFirstY =
    COVER_BLOCK_CENTER_Y -
    ((title.lines.length - 1) * title.lineHeight) / 2 +
    titleFudge

  const subtitle = layoutSvgText(slide.subheading, {
    maxWidth: COVER_RIGHT_MAX_W,
    fontSize: 30,
    maxLines: 3,
    lineHeightRatio: 1.2,
  })

  const org = ir.meta.organization
  const conf = ir.meta.confidentiality
  const confLabel = conf ? CONF_LABEL[conf] : null
  const author = ir.meta.authors?.[0]
  const authorText = author
    ? [author.name, author.role].filter(Boolean).join(" · ")
    : null
  const date = ir.meta.date
  const version = ir.meta.version

  const orgY = 168
  const subtitleY = orgY + 64
  const subtitleLastY =
    subtitleY + Math.max(0, subtitle.lines.length - 1) * subtitle.lineHeight
  const metaDividerY =
    subtitle.lines.length > 0 ? subtitleLastY + subtitle.lineHeight + 24 : orgY + 56
  const metaTextY = metaDividerY + 44

  return (
    <>
      {/* Left 40%-width primary color block, full page height */}
      <rect x="0" y="0" width={COVER_BLOCK_W} height="720" fill={colors.primary} />

      {/* Decor: deeper-green corner triangle, private decoration-only swatch
          (see file header's "装饰色豁免" — `TRIANGLE_DEEP`, not a token).
          Drawn here (body), not in a Decor slot, mirroring the source: it
          must paint *after* the block above to actually show (a decor-slot
          shape at this position would be painted over by the opaque block,
          which always renders after Decor). */}
      <polygon points="0,720 0,520 200,720" fill={TRIANGLE_DEEP} />

      {/* Heading set inside the block — fixed white (see file header's
          "白字例外"), not a theme color. */}
      {title.lines.map((line, i) => (
        <text
          key={i}
          x={COVER_TITLE_X}
          y={titleFirstY + i * title.lineHeight}
          fontFamily={fonts.heading}
          fontSize={title.fontSize}
          fontWeight="600"
          fill="#FFFFFF"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Right panel: org label */}
      <g transform={`translate(${COVER_RIGHT_X}, ${orgY})`}>
        <circle cx="12" cy="-12" r="12" fill={colors.accent} />
        {org && (
          <text
            x="48"
            y="0"
            fontFamily={fonts.body}
            fontSize="32"
            fill={colors.text}
            letterSpacing="2"
            dominantBaseline="alphabetic"
          >
            {org}
          </text>
        )}
      </g>

      {/* Confidentiality badge (top right, over the white panel). y=104 keeps
          it clear of BrandChrome's tr logo band (x 1120-1216, y 48-88) —
          same safety margin as consulting's y=100 equivalent badge. */}
      {confLabel && (
        <g>
          <rect
            x="1064"
            y="104"
            width="120"
            height="48"
            rx="6"
            fill="none"
            stroke={colors.primary}
            strokeWidth="2"
          />
          <text
            x="1124"
            y="135"
            fontFamily={fonts.body}
            fontSize="26"
            fill={colors.text}
            textAnchor="middle"
            dominantBaseline="alphabetic"
          >
            {confLabel}
          </text>
        </g>
      )}

      {/* Subheading (italic) */}
      {subtitle.lines.map((line, i) => (
        <text
          key={i}
          x={COVER_RIGHT_X}
          y={subtitleY + i * subtitle.lineHeight}
          fontFamily={fonts.body}
          fontSize={subtitle.fontSize}
          fill={colors.muted}
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
            x1={COVER_RIGHT_X}
            y1={metaDividerY}
            x2={COVER_RIGHT_EDGE}
            y2={metaDividerY}
            stroke={colors.border ?? colors.muted}
            strokeWidth="1.4"
          />
          <text
            x={COVER_RIGHT_X}
            y={metaTextY}
            fontFamily={fonts.body}
            fontSize="26"
            dominantBaseline="alphabetic"
          >
            {authorText && <tspan fill={colors.text}>{authorText}</tspan>}
            {date && <tspan fill={colors.muted}>{`${authorText ? "    ·    " : ""}${date}`}</tspan>}
            {version && (
              <tspan fill={colors.muted}>{`${authorText || date ? "    ·    " : ""}${version}`}</tspan>
            )}
          </text>
        </>
      )}
    </>
  )
}
