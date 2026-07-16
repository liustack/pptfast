import type { SvgTemplateProps } from "./types"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { CONF_LABEL } from "../../lib/conf-labels"

/**
 * split-diagonal cover archetype（P3 Item ①，spec §3.2）：左侧 primary 色块以
 * 斜切线收边，org 竖排压在色块上、标题在右侧净空区跨近斜切线。这是 P3「新
 * 表达一次全主题生效」的流程验收对象——纯新写（无源模板可提炼），从零按
 * archetype 纪律（零 theme id、零 baked 主题色 hex，颜色只来自 ctx）实现。
 *
 * 与 P1/P2 六个 cover archetype 的新问题：色块上的文字色不能像其余六个那样
 * 假设固定（它们的文字都画在页型默认底色上），色块用 ctx.colors.primary、
 * 而 primary 的明暗随主题/override 变（academic 深绿 → 浅字，tech 亮青 →
 * 深字）。故引入 readableOn(primary) 按相对明度自适应选前景色。**这正是
 * spec §3.1 tokens 扩展的第一个真实触发信号（P3 Item ④ 输入）**：若后续更
 * 多 archetype 需要「某 token 的明度标记」，应把这个内联计算提升为 token
 * 字段；目前仅本 archetype 需要，保持内联、不预先开 token。
 */

/** 斜切色块几何：顶宽 560、底宽 460（向下内收，形成右倾斜切线）。 */
const BLOCK_TOP_W = 560
const BLOCK_BOTTOM_W = 460
const BLOCK_PATH = `M 0,0 L ${BLOCK_TOP_W},0 L ${BLOCK_BOTTOM_W},720 L 0,720 Z`
/** 标题净空区左缘：躲开斜切线在标题基线高度的 x（约 500），留 96 边距。 */
const TITLE_X = 596
const TITLE_MAX_W = 1280 - TITLE_X - 96

/**
 * sRGB 相对明度（WCAG 定义）：0（黑）~1（白）。IR 的 HexColor 允许 3~8 位
 * （#RGB/#RGBA/#RRGGBB/#RRGGBBAA，见 pptx-ir schema）——3/4 位先按位翻倍
 * 展开、8 位裁掉 alpha（2026-07-10 深度自查修复：原实现只认 6 位，override
 * 传 #FFC 这类亮色短写会当 0 明度处理、错配白字）。
 */
function relativeLuminance(hex: string): number {
  let h = hex.trim().replace(/^#/, "")
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("")
  if (h.length === 8) h = h.slice(0, 6)
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return 0
  const n = parseInt(h, 16)
  const chan = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2]
}

/**
 * 压在给定背景色上的可读前景色：明度高的背景配深字、明度低配浅字。阈值
 * 0.4 略偏向浅字（大色块上浅字观感更稳）。返回中性黑/白，不引主题色。
 */
export function readableOn(bgHex: string): "#FFFFFF" | "#0A0E14" {
  return relativeLuminance(bgHex) > 0.4 ? "#0A0E14" : "#FFFFFF"
}

export function SplitDiagonalCover({ ir, slide, ctx }: SvgTemplateProps) {
  const org = ir.meta.organization
  const date = ir.meta.date
  const conf = ir.meta.confidentiality
  const confLabel = conf ? CONF_LABEL[conf] : null
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null
  const version = ir.meta.version

  const onBlock = readableOn(ctx.colors.primary)

  const title = fitHeadingLines(slide.heading, {
    maxWidth: TITLE_MAX_W,
    fontSize: 76,
    maxLines: 3,
    minPt: 44,
  })
  const TITLE_Y = 300
  const titleLastY = TITLE_Y + Math.max(0, title.lines.length - 1) * title.lineHeight

  const accentY = titleLastY + 40

  const subtitle = layoutSvgText(slide.subheading || "", {
    maxWidth: TITLE_MAX_W,
    fontSize: 26,
    maxLines: 2,
    lineHeightRatio: 1.25,
  })
  const subtitleY = accentY + 44

  const metaParts = [org, confLabel, date, authorText, version].filter(
    (v): v is string => Boolean(v),
  )
  const metaLine =
    metaParts.length > 0
      ? fitSvgLine(metaParts.join("    ·    "), {
          maxWidth: TITLE_MAX_W,
          fontSize: 19,
          minFontSize: 14,
        })
      : null

  return (
    <>
      {/* 斜切色块 */}
      <path d={BLOCK_PATH} fill={ctx.colors.primary} />

      {/* org 标签压在色块上（readableOn 自适应前景色） */}
      {org && (
        <text
          x={96}
          y={128}
          fontFamily={ctx.fonts.body}
          fontSize={22}
          fill={onBlock}
          fillOpacity={0.92}
          letterSpacing={2}
          dominantBaseline="alphabetic"
        >
          {org}
        </text>
      )}

      {/* 色块上的大留白装饰点（accent 强调，避 logo 带位置） */}
      <circle cx={96} cy={620} r={10} fill={onBlock} fillOpacity={0.92} />

      {/* 标题：右侧净空区，跨近斜切线，用页型默认文字色 */}
      {title.lines.map((line, i) => (
        <text
          key={i}
          x={TITLE_X}
          y={TITLE_Y + i * title.lineHeight}
          fontFamily={ctx.fonts.heading}
          fontSize={title.fontSize}
          fontWeight="700"
          fill={ctx.colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* accent 短条 */}
      <rect x={TITLE_X} y={accentY} width={72} height={5} fill={ctx.colors.primary} />

      {/* 副题 */}
      {subtitle.lines.map((line, i) => (
        <text
          key={i}
          x={TITLE_X}
          y={subtitleY + i * subtitle.lineHeight}
          fontFamily={ctx.fonts.body}
          fontSize={subtitle.fontSize}
          fill={ctx.colors.muted}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* meta 行：右下 */}
      {metaLine && (
        <text
          x={TITLE_X}
          y={662}
          fontFamily={ctx.fonts.body}
          fontSize={metaLine.fontSize}
          fill={ctx.colors.muted}
          dominantBaseline="alphabetic"
        >
          {metaLine.text}
        </text>
      )}
    </>
  )
}
