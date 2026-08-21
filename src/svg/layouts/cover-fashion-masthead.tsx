import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { CONF_LABEL } from "../../lib/conf-labels"
import { showsDocumentMeta } from "../document-meta"
import { blendOver, metaInk, readableOn } from "../ink"

/**
 * fashion-masthead cover layout（2026-07-10 时尚 runway 专属表达，
 * 纯新写）：**满版 primary 色块 + 超大报头排印**——检索结论（Dazed/NYLON/
 * 大胆现代风）：时尚杂志的视觉冲击力来自排印尺度（极粗字重、极大字号、
 * 大小极端对比）与满版色块。二轮返工（用户裁决「封面不能白底」）：白底
 * 版升级为满版 primary 底（runway 纯黑 → 黑色大片封面），前景经
 * readableOn(primary) 自适应（黑→白字，其他浅 primary 主题借用时同样
 * 安全），满宽 accent 粗色带保持。页面节奏：黑封面→红章节→白内容→黑
 * 结尾，满版-留白交替是杂志语法。
 * 纪律：零 theme id、零 hex（readableOn 中性黑白豁免），颜色全部来自 ctx。
 *
 * 底部 meta 行颜色（contrast-policy 波遗留任务，metaInk 迁移）：这一行
 * （org/confidentiality/date/version 拼接）是 B 层元信息文本
 * （`docs/contrast-system.md` 三层对比度策略），真实署名/日期信息，故意
 * 弱化，不是纯装饰。迁移前它一直烤 `fill={fg} fillOpacity={0.6}`——`fg`
 * 是 `readableOn(colors.primary)` 已经选出的、相对这块满版底对比度最高的
 * 中性墨色，0.6 是这一行自己的既有弱化倍率（同页副题用 0.72，是同一构图
 * 语言）。`full-matrix-contrast.test.ts` 曾为此单独留一条
 * `tech/fashion-masthead` ALLOWLIST 条目（实测 tech 主题下 ~4.16:1，够不上
 * 旧的 4.5:1 正文线但早已清 B 层 3:1 线），该条目自己的注释已经点名"这一行
 * 尚未接入 metaInk/data-contrast-tier=meta，是未来主题打磨范围"——本次就是
 * 那次打磨，条目本身随之删除（`isAllowlisted` 的判定改交给 `deck-audit` 的
 * meta 层 3:1 门槛）。
 *
 * 现在的做法：不是简单套用其余归档档案（ending-banner-ending.tsx /
 * ending-rail-ending.tsx）的 `metaInk(colors.muted, bg)` 写法——那两个文件
 * 没画自己的背板，`colors.muted` 是页面上同类弱化文本已经在用的 token，测的
 * 是 `ctx.defaultBg`。本文件不同：整页背景是自己画的满版 `colors.primary`
 * 色块（"测你实际画的颜色"，同一文档的 `ctx.defaultBg` 一节），且这一行历来
 * 用的不是某个 token 而是 `fg` 按固定倍率淡出的复合色。于是保留原有构图
 * （复合色 = `blendOver(fg, colors.primary, META_LINE_ALPHA)`，与旧
 * `fill+fillOpacity` 渲染出的像素完全一致），把这个复合色本身作为
 * `metaInk` 的 `preferredFill`，测的背景是 `colors.primary`——已经清 3:1 的
 * 主题（16 个里 15 个，含 tech 自己的 ~4.16:1）`metaInk` 原样放行，输出与
 * 复合色逐字节相同，改用纯色 `fill` 渲染（不再需要 `fillOpacity`，对不透明
 * 底色而言两者是同一像素）不改变任何已渲染的主题。唯一改变的是 `insight`
 * 主题：旧复合色相对 `colors.primary`（`#E63946`）实测仅 2.886:1（该主题
 * 从未被任何既有测试覆盖过——`full-matrix-contrast.test.ts` 自己的 sweep
 * fixture 不填 organization/date，`metaLine` 从未在那个文件的扫描里真正
 * 渲染过），是这条 B 层 3:1 硬线下的一个真实未捕获缺陷，`metaInk` 把它按自己
 * 的最小步进策略上调到 3.094:1（`#591d26`——这个具体产出由
 * `full-matrix-contrast.test.ts` 的 16 主题 meta-line sweep 锁定，本文件
 * 同名测试只提供 fixture 不做 fill 断言）。挂 `data-contrast-tier="meta"`
 * 让 `deck-audit` 按 3:1 而非默认 4.5:1 判它。
 *
 * runway/fashion-chapter（`chapter-fashion-chapter.tsx`）的机构名行是独立
 * 代码路径（不同文件、不同函数、不同背景 token `colors.accent`、不同倍率
 * 0.85），本次不顺带迁移——16 个主题实测最低是 runway 自己的 4.056:1，
 * 早已清 B 层 3:1，不是当前缺陷，保持`theme-structure.test.ts`已有的"deferred
 * to a future theme-polish pass"记录不变。
 */
export function FashionMastheadCover({ ir, slide, ctx }: SvgTemplateProps) {
  const org = ir.meta.organization
  const date = showsDocumentMeta(ir) ? ir.meta.date : undefined
  const conf = showsDocumentMeta(ir) ? ir.meta.confidentiality : undefined
  const confLabel = conf ? CONF_LABEL[conf] : null
  const version = ir.meta.version
  const fg = readableOn(ctx.colors.primary)

  const title = fitHeadingLines(slide.heading, {
    maxWidth: 1168,
    fontSize: 150,
    maxLines: 2,
    minPt: 72,
    // bold-metrics fix (2026-07-24): this line's fontWeight="900" render
    // below relies on `fitHeadingLines`'s bold-default flip (opts.bold
    // defaults true) plus this explicit fontFamily so the estimate is
    // face-aware (Georgia under consulting/academic/insight) rather than
    // falling back to the cross-face envelope. This is the exact layout
    // + slot the user-reported cover-overflow defect traced to
    // (root-cause.md: "Components Demo" on the consulting theme) — see
    // this fix's red-first test in cover-fashion-masthead.test.tsx.
    fontFamily: ctx.fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const TITLE_Y = 330
  const titleLastY = TITLE_Y + Math.max(0, title.lines.length - 1) * title.lineHeight

  // 满宽粗色带：报头下的「大而鲜艳」元素
  const bandY = titleLastY + 52
  const BAND_H = 20

  // 副题带 4px 字距渲染（下方 `letterSpacing={4}`），字距是不随字号缩放的
  // 绝对 px，必须进折行预算：不进的话 71 字符的英文副题被判「一行放得下
  // 1168px」，实际画出 1253.7px，右缘 1309.7 冲出 1280px 页面 29.7px。
  const SUBTITLE_LETTER_SPACING = 4
  const subtitle = layoutSvgText(slide.subheading || "", {
    maxWidth: 1168,
    fontSize: 30,
    maxLines: 2,
    lineHeightRatio: 1.3,
    letterSpacing: SUBTITLE_LETTER_SPACING,
  })
  const subtitleY = bandY + BAND_H + 58

  // 同一个盲区的第二处：meta 行也带字距渲染。`fitSvgLine` 早就有这个参数，
  // 这里一直没传。当前语料下传不传逐字节相同（434 页画廊实测零差异），
  // 但长机构名 + 密级 + 日期 + 版本拼出来的长 meta 行会越界，先补上。
  const META_LETTER_SPACING = 3
  const metaParts = [org, confLabel, date, version].filter((v): v is string => Boolean(v))
  const metaLine =
    metaParts.length > 0
      ? fitSvgLine(metaParts.join("    ·    "), {
          maxWidth: 1100,
          fontSize: 19,
          minFontSize: 14,
          letterSpacing: META_LETTER_SPACING,
        })
      : null
  // B-tier meta line ink (see file header's "底部 meta 行颜色" section for
  // the full derivation): this layout paints its own full-bleed
  // background (`ctx.colors.primary` below), so "measure what you painted"
  // means against that, not `ctx.defaultBg`/`colors.bg`. `META_LINE_ALPHA`
  // preserves this line's own long-standing dim ratio (was `fillOpacity`,
  // now folded into the composite hex `metaInk` grades) — a no-op on every
  // theme whose composite already clears 3:1 (byte-identical fill to the
  // old `fill+fillOpacity` render), only nudged on `insight` (~2.886:1
  // baseline).
  const META_LINE_ALPHA = 0.6
  const metaFill = metaInk(blendOver(fg, ctx.colors.primary, META_LINE_ALPHA), ctx.colors.primary)

  return (
    <>
      {/* 满版 primary 色块（黑色大片封面底） */}
      <rect x={0} y={0} width={1280} height={720} fill={ctx.colors.primary} />

      {/* 顶部刊头信息行：时装刊小字排印（大 letterSpacing） */}
      {org && (
        <text
          x={640}
          y={86}
          fontFamily={ctx.fonts.body}
          fontSize={20}
          fill={fg}
          textAnchor="middle"
          letterSpacing={10}
          fontWeight="600"
          dominantBaseline="alphabetic"
        >
          {org}
        </text>
      )}
      {/* 报头上方规则线（刊头惯例） */}
      <line x1={56} y1={116} x2={1224} y2={116} stroke={fg} strokeWidth={3} />

      {/* 超大报头 */}
      {title.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={title.truncated && i === title.lines.length - 1 ? "1" : undefined}
          x={56}
          y={TITLE_Y + i * title.lineHeight}
          fontFamily={ctx.fonts.heading}
          fontSize={title.fontSize}
          fontWeight="900"
          fill={fg}
          letterSpacing={-2}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* 满宽粗色带（accent 正红压黑底） */}
      <rect x={56} y={bandY} width={1168} height={BAND_H} fill={ctx.colors.accent} />

      {/* 副题 */}
      {subtitle.lines.map((line, i) => (
        <text
          key={i}
          x={56}
          y={subtitleY + i * subtitle.lineHeight}
          fontFamily={ctx.fonts.body}
          fontSize={subtitle.fontSize}
          fill={fg}
          fillOpacity={0.72}
          letterSpacing={SUBTITLE_LETTER_SPACING}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* 底部 meta — B-tier meta-information text (docs/contrast-system.md's
          three-tier contrast policy): `metaFill` (see the const above) is
          `metaInk`-graded against the real painted background
          (`colors.primary`). `data-contrast-tier="meta"` tells deck-audit's
          contrast walk to hold this text to 3:1 instead of the default
          4.5:1. */}
      {metaLine && (
        <text
          data-contrast-tier="meta"
          data-truncated={metaLine.truncated ? "1" : undefined}
          x={640}
          y={668}
          fontFamily={ctx.fonts.body}
          fontSize={metaLine.fontSize}
          fill={metaFill}
          textAnchor="middle"
          letterSpacing={META_LETTER_SPACING}
          dominantBaseline="alphabetic"
        >
          {metaLine.text}
        </text>
      )}
    </>
  )
}

// T1d (src domain reorg wave 1): inlined verbatim from registry.ts's former
// COVER_LAYOUT_DEFS["fashion-masthead"] entry. `CHROME` (registry.ts's private
// `readonly string[] = []` alias, "not fed by an authored component") is
// inlined here to the literal `[]` it always held, to avoid a value-import
// cycle with the registry aggregator (which value-imports this export) — see
// registry.ts's slot-`accepts` convention doc for what `[]` means.
export const layoutDef: LayoutDefinition = {
  // cover-fashion-masthead.tsx: full-bleed primary block, org kicker, thin
  // rule above the masthead heading, accent color band, subheading, meta.
  id: "fashion-masthead",
  kind: "archetype",
  paintsOwnBackground: true,
  slideTypes: ["cover"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "rule", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
