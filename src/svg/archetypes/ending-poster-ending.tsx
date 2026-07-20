// GF/svg/archetypes/ending-poster-ending.tsx
import type { SvgTemplateProps } from "./types"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"

/**
 * poster-ending archetype（spec §3.2）：全居中"海报"式收尾页——巨幅斜体居中
 * 标题、短横条（accent 红）、斜体副标题、水平分隔线、底部单行合并 meta
 * （组织 / 联系方式 / 版权）。自 templates/creative.tsx 的
 * `EditorialDarkEnding`（697-844 行，Step A 实测边界，brief 估 697-845——闭合
 * `}` 在 844 行，845 行为空行，846 行起是紧随其后的 `EditorialDarkDecor`，
 * 不属于本函数体）提炼。
 *
 * 随迁 helper：`AccentBar`（源文件 49-60 行）——Step A 复核确认本函数体内确实
 * 调用了它（`<AccentBar y={accentY} />`，源 773 行），与 chapter-poster-chapter
 * 不同（W2-9 已确认 Chapter 不调用，未内联）。本文件将其内联为一个裸 `<rect>`
 * 字面量（同 cover-poster-center.tsx 对同一 helper 的处理方式，不额外包一层
 * 组件函数，直接写在调用点）。
 *
 * 替换表（Step B，逐十六进制核对 GF/themes/creative.ts 的 `colors`，
 * 十六进制值本身不抄进本注释——避免污染本文件的 grep 清零门，同
 * chapter-poster-chapter.tsx / cover-poster-center.tsx 先例）：
 *   RED → ctx.colors.primary（逐字节精确匹配——**不是** `accent`，`accent`
 *   是另一个完全不同的暖棕色值，沿用 P1 cover-poster-center.tsx 已订正的
 *   映射结论，不重犯"RED→accent"的误判）。
 *   FG → ctx.colors.text（逐字节精确匹配）。
 *   MUTED → ctx.colors.muted（逐字节精确匹配）。
 *   BORDER → ctx.colors.border（逐字节精确匹配，creative token 表本身有
 *   `border` 字段，无需 `?? muted` 兜底）。
 *
 * 孤儿色处理（**档位二・观感等价**，唯一孤儿色，沿用 P1 cover-poster-center.tsx
 * 已核实过的同一结论）：`META_MUTED` 在 creative token 表里没有精确匹配（既不
 * 等于 `muted` 也不等于任何其它字段），语义上与 `MUTED` 是同一"次要文本"角色
 * 的两级深浅，不是对比性装饰色——并入 `ctx.colors.muted`。该函数内 `META_MUTED`
 * 唯一的消费点（底部合并 meta 行）随之改为 `ctx.colors.muted`，接受 creative
 * 下观感等价而非逐字节一致。
 *
 * 副题兜底语义（按当前源码实际行为原样迁移，不改语义，同 consulting
 * 2026-07-09 去重裁决）：`slide.subheading || (slide.heading ? "" : "Questions
 * & Discussion")`——只有 `slide.heading` 也缺省时，副标题才兜底为固定文案
 * "Questions & Discussion"，避免用户填了标题、只是恰好没填副标题时被强行塞入
 * 一句无关的默认副题。测试覆盖有 heading（不触发兜底）与无 heading（触发副题
 * 兜底）两种 ir。defect C 修复：主标题兜底原是中文"提问与讨论"，与副标题兜底
 * 恰是同一句话的两种语言（副标题此前已是英文，主标题这次补齐）——译文延续
 * 同一措辞 "Questions & Discussion"，不臆造新词。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量。
 */

/** Center-x of the 1280-wide canvas — every poster-mode element anchors here. */
const CENTER_X = 640

/** 短横条尺寸：本页唯一的 accent 色装饰元素，纯粹是分隔用途，从不作为文字色。 */
const ACCENT_BAR_W = 60
const ACCENT_BAR_H = 4

export function PosterEnding({ ir, slide, ctx }: SvgTemplateProps) {
  const org = ir.meta.organization
  const contact = ir.meta.contact
  const copyright = ir.meta.copyright
  const author = ir.meta.authors?.[0]

  const heading = fitHeadingLines(slide.heading || "Questions & Discussion", {
    maxWidth: 1152,
    fontSize: 150,
    maxLines: 2,
    minPt: 40,
  })
  // Last-line-anchored（同源文件 2026-07-07 addendum）：把末行锚定在固定基线，
  // 无论标题是一行还是两行，下方 accent bar / 副标题 / 分隔线 / meta 的整条链路
  // 都不随行数变化，首行随行数向上让位。
  // 396→424（2026-07-13 campaign ending 用户反馈标题偏上：几何居中但
  // 光学偏上——顶部装饰压近+底部 570-720 空腔。下移 28px 光学居中，
  // 全 poster-ending 主题统一受益）
  const HEADING_LAST_BASELINE = 424
  const headingY =
    HEADING_LAST_BASELINE -
    Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const headingLastY = HEADING_LAST_BASELINE

  // +40→+54（2026-07-10 导出审计：同 cover-poster-center 的压线修正）
  const accentY = headingLastY + 64

  // 兜底只服务完全默认的 ending 页：仅 slide.heading 也缺省时才连带兜底副标题。
  const subheading = fitSvgLine(slide.subheading || (slide.heading ? "" : "Questions & Discussion"), {
    maxWidth: 900,
    fontSize: 40,
    minFontSize: 20,
  })
  const subheadingY = accentY + 64
  const dividerY = subheadingY + 56

  const contactText = [author?.name, contact?.email].filter(Boolean).join(" · ")
  const metaParts = [org, contactText || null, copyright].filter(
    (v): v is string => Boolean(v),
  )
  const metaLine =
    metaParts.length > 0
      ? fitSvgLine(metaParts.join("    ·    "), {
          maxWidth: 1000,
          fontSize: 22,
          minFontSize: 16,
        })
      : null
  const metaY = dividerY + 52

  return (
    <>
      {/* Main heading (italic serif, centered) */}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={CENTER_X}
          y={headingY + i * heading.lineHeight}
          textAnchor="middle"
          fontFamily={ctx.fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="800"
          fill={ctx.colors.text}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Accent hairline (AccentBar helper inlined, same treatment as
          cover-poster-center.tsx) */}
      <rect
        x={CENTER_X - ACCENT_BAR_W / 2}
        y={accentY}
        width={ACCENT_BAR_W}
        height={ACCENT_BAR_H}
        rx="2"
        fill={ctx.colors.primary}
      />

      {/* Subheading */}
      {subheading.text && (
        <text
          x={CENTER_X}
          y={subheadingY}
          textAnchor="middle"
          fontFamily={ctx.fonts.heading}
          fontSize={subheading.fontSize}
          fill={ctx.colors.muted}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      {/* Divider */}
      <line
        x1="56"
        y1={dividerY}
        x2="1224"
        y2={dividerY}
        stroke={ctx.colors.border}
        strokeWidth="1.6"
      />

      {/* Combined centered meta line: org / contact / copyright */}
      {metaLine && (
        <text
          x={CENTER_X}
          y={metaY}
          textAnchor="middle"
          fontFamily={ctx.fonts.body}
          fontSize={metaLine.fontSize}
          fill={ctx.colors.muted}
          letterSpacing="2"
          dominantBaseline="alphabetic"
        >
          {metaLine.text}
        </text>
      )}
    </>
  )
}
