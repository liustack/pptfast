import type { DecorProps } from "./types"
import { accessibleInk } from "../ink"

/**
 * memo-motif —— 「打字机眉行」（2026-08-21 wave7 memo，设计源
 * `theme-wave7/Memo.dc.html`）。light 档，四页型同一张，单锚不借用。
 *
 * 画的两件东西（恒位，无 seed 变体）：
 *   - **顶缘红双线**：3px y26 + 1px y32，印章红（accent），x48→1232。
 *     任务书给死的坐标。比 journal 文武线（2px/0.75px 同 y）更重一档，
 *     比 heritage 藏书票双线（2px y28 / 0.75px y36）更靠上更粗。
 *   - **线上方 Latin 等宽眉字「MEMORANDUM」**：装饰件字符，journal 期号
 *     「№」先例。走 `ctx.fonts.mono`（主题 token 打头 Courier New）。
 *     设计板 Courier Prime 不在 SAFE_FONTS，落地 Courier New，等宽并未
 *     缺席，不退化成纯双线。
 *
 * 板上不做、不进本文件的两件：
 *   1. 标题「决定」下的重笔划线（跟随内容位置，违反恒位）。
 *   2. FROM / RE 打字机落款（封面文案，不是页缘装饰）。
 *
 * 红永不成面：本文件没有 `<rect fill=accent>`，印章红只出现在两条
 * `<line>` 的 stroke 和眉字的 fill。
 *
 * 安全区（设计板上四条红虚线禁区 + 第五带 y620-664）：
 *   - 眉字基线 y20、双线 y26/32，全部在标题区上沿 y48 之上。
 *   - 默认 logo 盒在右下 (1120,630)。顶左 logo 盒 (64,48) 的上沿也在
 *     双线之下。本 motif 不进第五带。
 *   - 顶左 logo 若存在，盒在 y48 起，与眉字（墨迹约 y11-20）不相交。
 *
 * 位置全部写死，不读内容、不随 seed 变。
 *
 * 眉字是装饰件里唯一的文字，归 `deck-audit` 的对比度墙管。accent 压本主题
 * bg 5.72:1，`accessibleInk` 是 no-op。仍然走它，免得以后有主题借走本
 * motif 时烤死一个过不了线的红。
 *
 * Latin 眉行字距 6px（约 0.5em @ 12px，板上 0.6em 的落地）。svg2pptx 不
 * 映射 letter-spacing（LibreOffice 会裁尾字），预览保留、导出变紧。字样
 * 仍是「MEMORANDUM」整词，不把空格烤进字符串去模拟字距。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（accent = 印章红）。
 */

// ── 顶缘红双线 ──────────────────────────────────────────────────────────
const RULE_X1 = 48
const RULE_X2 = 1232
const THICK_RULE_Y = 26
const THICK_RULE_STROKE = 3
const THIN_RULE_Y = 32
const THIN_RULE_STROKE = 1

// ── 线上方 MEMORANDUM ───────────────────────────────────────────────────
const EYEBROW = "MEMORANDUM"
const EYEBROW_X = 96
const EYEBROW_BASELINE_Y = 20
const EYEBROW_FONT_SIZE = 12
const EYEBROW_LETTER_SPACING = 6
const EYEBROW_WEIGHT = 700

export function MemoMotif({ ctx }: DecorProps) {
  const ink = ctx.colors.accent
  const bg = ctx.defaultBg ?? ctx.colors.bg

  return (
    <>
      {/* 两条真正的 <line>，不用只走一根轴的 <path> — svg2pptx 会把
          <path>（哪怕纯水平）转成 custGeom，包围盒零高度会被
          package-audit 硬门的 invalid-shape-transform 规则拒绝。
          <line> 走 svg2pptx/line.ts 的 prstGeom="line"，该规则明确允许一根
          轴为零。 */}
      <line
        x1={RULE_X1}
        y1={THICK_RULE_Y}
        x2={RULE_X2}
        y2={THICK_RULE_Y}
        stroke={ink}
        strokeWidth={THICK_RULE_STROKE}
      />
      <line
        x1={RULE_X1}
        y1={THIN_RULE_Y}
        x2={RULE_X2}
        y2={THIN_RULE_Y}
        stroke={ink}
        strokeWidth={THIN_RULE_STROKE}
      />
      <text
        x={EYEBROW_X}
        y={EYEBROW_BASELINE_Y}
        fontFamily={ctx.fonts.mono}
        fontSize={EYEBROW_FONT_SIZE}
        fontWeight={EYEBROW_WEIGHT}
        letterSpacing={EYEBROW_LETTER_SPACING}
        fill={accessibleInk(ink, bg, EYEBROW_FONT_SIZE)}
        textAnchor="start"
        dominantBaseline="alphabetic"
      >
        {EYEBROW}
      </text>
    </>
  )
}
