import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { CONF_LABEL } from "../../lib/conf-labels"
import { accessibleInk, metaInk } from "../ink"

/**
 * colophon cover layout（2026-08-18 主题重设计第一期，新表达）：**左轴单栏 +
 * 引首块**——标题贴着页面左侧一条竖轴排下来，标题行首外侧压一枚窄长的强调色
 * 引首块（书画卷首「引首章」的位置感），机构名以宽字距小字接在标题下，副题
 * 再接一行，署名一行收在页脚左角。整版右边界收在 x1180，把右缘那 100px
 * 留成空白廊道。
 *
 * 几何来自 `.issues/2026-08-18-theme-redesign/ink/decisions.md` 抄录的 1a
 * 封面设计稿：引首块 x96 y312 20×78、标题 84px x140 y378、宽字距行 20px
 * y428、副题 27px y478、页脚署名 16px x96 y648。单行标题时渲染结果与设计稿
 * 逐坐标一致；标题折行时下面三行整体顺延（见 `TITLE_FIRST_BASELINE`）。
 *
 * **一处需要说明的取舍**：设计稿把 y428 那行画成一句英文（中文大标题下压一行
 * 小字拉开字距的西文，中文封面的老套路）。IR 里没有「英文标题」这个字段，
 * 编一个出来不是选项，所以这一行改承载 `meta.organization`——封面上唯一一句
 * 短的「这是谁出的」，形制（20px、字距 3）与设计稿一致。页脚署名那行因此
 * 让出 org，只排人/密级/日期/版本，与 `cover-left-anchor.tsx` 的分工同型
 * （org 单独一行，其余合成 meta 行）。
 *
 * **它进共享池，不是 ink 专用**（先例 `cover-fashion-masthead.tsx`：为
 * runway 画的，全主题可抽）。所以文件里零 theme id、零 hex，颜色全部走
 * ctx token + `../ink` 的 `accessibleInk`/`metaInk`——设计稿上那几个色值是
 * 「ink 的 token 在这套构图下应该长成的样子」，不是常量。本版式自己不画
 * 任何背景板，文字直接落在 `Background` 画的页面底色上，所以对比度一律测
 * `ctx.defaultBg ?? colors.bg`（每个不自画背板的版式都用这个回落，
 * `ComponentCtx.defaultBg` 自己的文档注释）。
 *
 * **右边界 x1180 是硬约束**，不是审美余量：ink 的 `ink-motif` v3 在
 * x>=1220 画一整条竖排落款列（`../motifs/motif-ink-motif.tsx`），中间那
 * 40px 是两者之间的空气。别的主题在这里只是得到一条安静的右留白，代价为零，
 * 所以这条边界写死在 `CONTENT_RIGHT_EDGE` 而不是做成 ink 的特例分支。
 */

// ── 设计稿坐标（1a 封面，逐条抄录） ────────────────────────────────────
const TITLE_X = 140
const FOOTER_X = 96
/** 内容区右边界——右缘 100px 留给落款列（见文件头）。 */
const CONTENT_RIGHT_EDGE = 1180

/** 引首块：标题首行外侧的窄长强调色块，几何写死，永远框住第一行。 */
const LEADER_X = 96
const LEADER_Y = 312
const LEADER_W = 20
const LEADER_H = 78

/**
 * 标题**首行** baseline。首行锚定（不是别处常见的末行锚定）是因为引首块
 * 固定在 y312-390：它标的是「起首」，必须框住第一行；末行锚定会让两行标题
 * 的首行跑到块的上方去。代价是标题折行时下面三行顺延，所以标题限两行
 * （84px 两行末行 baseline 约 469，署名行仍在 y648 之下有余量）。
 */
const TITLE_FIRST_BASELINE = 378
const TITLE_SIZE = 84
const TITLE_MIN_PT = 44
const TITLE_MAX_LINES = 2

/** 标题末行 → 宽字距行 → 副题，两段等距。单行标题时正好落在设计稿的
 *  y428 / y478。 */
const STACK_GAP = 50
const KICKER_SIZE = 20
const KICKER_LETTER_SPACING = 3
const SUBTITLE_SIZE = 27
const SUBTITLE_MAX_LINES = 2
const SUBTITLE_LINE_HEIGHT_RATIO = 1.3

const FOOTER_BASELINE = 648
const FOOTER_SIZE = 16
const FOOTER_MIN_SIZE = 12

/** 元信息各段之间的分隔（与 cover-left-anchor / editorial-masthead 同款）。 */
const META_SEPARATOR = "    ·    "

export function ColophonCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  // 本版式不画背板，测的是页面底色（见文件头）。
  const bg = ctx.defaultBg ?? colors.bg

  const org = ir.meta.organization
  const conf = ir.meta.confidentiality
  const confLabel = conf ? CONF_LABEL[conf] : null
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null

  const title = fitHeadingLines(slide.heading, {
    maxWidth: CONTENT_RIGHT_EDGE - TITLE_X,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    fontFamily: fonts.heading,
  })
  const titleLastY = TITLE_FIRST_BASELINE + Math.max(0, title.lines.length - 1) * title.lineHeight

  // 宽字距行走机构名：这条 20px letterSpacing 3 的小字是封面上唯一的「这是谁
  // 出的」，页脚署名那行留给人和日期（同 cover-left-anchor 的分工：org 单独
  // 起一行，作者/日期/版本合成 meta 行）。`letterSpacing` 传给 `fitSvgLine`
  // ——字距是绝对 px、不随字号缩，不报给它会让长机构名量出偏窄的宽度。
  const kickerY = titleLastY + STACK_GAP
  const kicker = org
    ? fitSvgLine(org, {
        maxWidth: CONTENT_RIGHT_EDGE - TITLE_X,
        fontSize: KICKER_SIZE,
        minFontSize: 14,
        letterSpacing: KICKER_LETTER_SPACING,
        fontFamily: fonts.body,
      })
    : null

  // Guarded rather than handed an empty string: `layoutSvgText("")` still
  // returns one (empty) line, which would render a content-free `<text>` into
  // every deck that omits a subheading. Same posture as
  // `cover-editorial-masthead.tsx`'s own subtitle.
  const subtitleY = kickerY + STACK_GAP
  const subtitle = slide.subheading
    ? layoutSvgText(slide.subheading, {
        maxWidth: CONTENT_RIGHT_EDGE - TITLE_X,
        fontSize: SUBTITLE_SIZE,
        maxLines: SUBTITLE_MAX_LINES,
        lineHeightRatio: SUBTITLE_LINE_HEIGHT_RATIO,
        fontFamily: fonts.heading,
      })
    : null

  const footerParts = [authorText, confLabel, ir.meta.date, ir.meta.version].filter(
    (v): v is string => Boolean(v),
  )
  const footer =
    footerParts.length > 0
      ? fitSvgLine(footerParts.join(META_SEPARATOR), {
          maxWidth: CONTENT_RIGHT_EDGE - FOOTER_X,
          fontSize: FOOTER_SIZE,
          minFontSize: FOOTER_MIN_SIZE,
          fontFamily: fonts.body,
        })
      : null

  return (
    <>
      {/* 引首块 */}
      <rect x={LEADER_X} y={LEADER_Y} width={LEADER_W} height={LEADER_H} fill={colors.accent} />

      {/* 标题（左轴） */}
      {title.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={title.truncated && i === title.lines.length - 1 ? "1" : undefined}
          x={TITLE_X}
          y={TITLE_FIRST_BASELINE + i * title.lineHeight}
          fontFamily={fonts.heading}
          fontSize={title.fontSize}
          fontWeight="600"
          fill={accessibleInk(colors.text, bg, title.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* 机构名（宽字距小字）—— B 层元信息文本（`docs/contrast-system.md`
          三层策略点名的「机构名」），`metaInk` 保 3:1，`data-contrast-tier`
          告诉 deck-audit 按这一档判而不是按字号判。 */}
      {kicker && (
        <text
          data-contrast-tier="meta"
          data-truncated={kicker.truncated ? "1" : undefined}
          x={TITLE_X}
          y={kickerY}
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={metaInk(colors.muted, bg)}
          letterSpacing={KICKER_LETTER_SPACING}
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      {/* 副题 —— 正文层（A 层），按字号判，27px 走大字 3:1 那一档 */}
      {subtitle?.lines.map((line, i) => (
        <text
          key={i}
          x={TITLE_X}
          y={subtitleY + i * subtitle.lineHeight}
          fontFamily={fonts.heading}
          fontSize={subtitle.fontSize}
          fill={accessibleInk(colors.muted, bg, subtitle.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* 页脚署名（作者 / 密级 / 日期 / 版本）—— 同样是 B 层 */}
      {footer && (
        <text
          data-contrast-tier="meta"
          data-truncated={footer.truncated ? "1" : undefined}
          x={FOOTER_X}
          y={FOOTER_BASELINE}
          fontFamily={fonts.body}
          fontSize={footer.fontSize}
          fill={metaInk(colors.muted, bg)}
          dominantBaseline="alphabetic"
        >
          {footer.text}
        </text>
      )}
    </>
  )
}

export const layoutDef: LayoutDefinition = {
  // cover-colophon.tsx: accent leader block flagging the first heading line,
  // left-axis heading, wide-tracked org kicker, subheading, and a
  // bottom-left byline row. Content stays left of x1180 — the right edge is
  // reserved for a side-rail colophon a theme's motif may draw there.
  //
  // `kind: "archetype"` is the standard tier's fossilized spelling (see
  // `LayoutDefinition.kind`'s own doc comment) — kept at its current value,
  // renaming it is a golden-fixture change of its own.
  id: "colophon",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "decor", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "kicker", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
