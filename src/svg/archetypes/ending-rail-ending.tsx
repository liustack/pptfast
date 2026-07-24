// GF/svg/archetypes/ending-rail-ending.tsx
import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "../layouts/registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"

/**
 * rail-ending archetype（spec §3.2）：左下角两块深浅同色系矩形（呼应
 * cover 的通栏色块 / chapter 的进度轨道 motif），巨幅居中标题 + 斜体副标题 +
 * 一条 hairline 分隔的"联系"区块 + 版权行。自 templates/academic.tsx 的
 * `BCGEmeraldEnding` 提炼。
 *
 * Step A 实测边界（订正 brief 的"约 559-712 行"）：函数体实际是
 * **559-664 行**（`export function BCGEmeraldEnding` 起，到其闭合 `}` 止）。
 * 719 行往后是 `BcgEmeraldDecor`（chapter/content/ending 共用的一个 Decor
 * 函数，不是 Ending 专属，且已被 cover-left-anchor.tsx 处理过它在 Cover 上
 * 的等价物 `TRIANGLE_DEEP`，其余部分排入 Wave 3 motif 迁移）——不在本次
 * BCGEmeraldEnding 的提炼范围内。随迁的只有函数体正上方 555-557 行的三个
 * 模块级私有数值常量（`ENDING_HEADING_LAST_BASELINE` /
 * `ENDING_TWO_LINE_SHIFT_MAX` / `ENDING_TWO_LINE_HAIRLINE_GAP`，整个
 * academic.tsx 里只有本函数消费），同 chapter-rail-chapter.tsx 处理
 * `CH_DOT_Y`/`CH_DOT_SPACING` 的先例，作为文件私有常量复制，不建公共 util。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/academic.ts 的 colors。
 * 十六进制值本身不抄进本注释——避免污染本文件的 grep 清零门，同
 * cover-left-anchor.tsx / chapter-rail-chapter.tsx 先例，核实过程见
 * w2t13 任务报告）：
 *   - 源文件私有常量 `DEEP_GREEN` → `colors.primary` —— 逐字符精确匹配。
 *   - 源文件私有常量 `EMERALD`    → `colors.accent`  —— 精确匹配。
 *   - 源文件私有常量 `TEXT`       → `colors.text`    —— 精确匹配。
 *   - 源文件私有常量 `MUTED`      → `colors.muted`   —— 精确匹配。
 *   - 源文件私有常量 `HAIRLINE`   → `colors.border ?? colors.muted` ——
 *     精确匹配 academic 的 `border` 字段，`??` 兜底沿用
 *     cover-left-anchor.tsx 的既有写法（`border` 在 `StyleColors` 上是可选
 *     字段）。
 *
 * 孤儿色处理（**档位二・观感等价**，唯一孤儿色）：版权行 fill 用的一个内联
 * 十六进制字面量，在 academic.ts 的 colors 表里没有精确匹配——整个
 * academic.tsx 文件 grep 只出现这一处（不是模块级具名常量）。判断过程
 * （Step B）：
 *   1. 十六进制差值检验——该字面量相对 `colors.muted` 是几乎均匀的三通道
 *      整体调亮，同色系、同色相，只是更浅一档——这个"数值上是某 token 的
 *      均匀偏移"模式与 cover-left-anchor.tsx 记录的 `TRIANGLE_DEEP`
 *      （`colors.primary` 均匀调暗一档）同构，不是随手取的近似灰。
 *   2. 页面内的层级证据——同一页里，"联系"标签与联系方式正文都用
 *      `colors.muted`，版权行故意比它们更浅一档，形成"正文 > 联系信息
 *      (muted) > 版权 (更浅)"的三级弱化梯度。若把它并入 `muted`，版权行会
 *      与上方联系信息同色，这个梯度就被抹平——不是"元素隐形"那种破坏，但
 *      仍是可观察的观感差异被抹掉，判定为该保留的对比性装饰色，同
 *      `TRIANGLE_DEEP` 一类。
 *   3. 跨主题旁证——`templates/consulting.tsx` 的 `MckinseyNavyEnding`
 *      版权行也独立烤了一个跟自己 `muted` 不同的近似灰（consulting 自己的
 *      Wave 2 Task 14 孤儿色，另案处理），两个主题各自独立地为"版权行"发明
 *      了一个比 `muted` 更浅的专属灰——不是巧合的抄近似值，是"版权行天生该
 *      比其余弱化文本更淡"这条构图惯例在多个主题里各自重复出现。
 *   结论：该字面量保留为文件私有装饰常量 `COPYRIGHT_FAINT`（十六进制值见
 *   下方代码本身），不并入 `colors.muted`，不进上面的替换表。测试用同
 *   `TRIANGLE_DEEP` 一样的锁法断言其值跨主题原样出现、且不会被归并为任何
 *   主题的 `muted`。
 *
 * 副题兜底语义（按当前源码实际行为原样迁移，不改语义）：只有主标题有
 * `slide.heading || "谢谢"` 这一层兜底——`slide.heading` 缺省时标题渲染固定
 * 文案"谢谢"。副标题**没有**独立兜底文案，纯粹按 `slide.subheading` 是否
 * 存在决定是否渲染（不是 masthead-ending 那种"heading 也缺省才连带兜底副题
 * 文案"的双重兜底模式，两个主题的源函数写法本就不同，不强行拉齐）。测试
 * 覆盖有 heading（标题原样、不触发兜底）与无 heading（兜底"谢谢"）两种 ir。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量——唯一豁免是上面点名并测试
 * 锁死的 `COPYRIGHT_FAINT`，grep 清零门预期恰好命中它的代码定义那一行。
 */

// 随迁自 academic.tsx 模块作用域（555-557 行），只有 BCGEmeraldEnding 消费，
// 随函数体一并复制为本文件私有常量。含义见源文件注释：两行标题时把首行上移
// 一个 lineHeight（封顶 88px）以保持末行基线不变，hairline 间距同步收紧。
const ENDING_HEADING_LAST_BASELINE = 356
const ENDING_TWO_LINE_SHIFT_MAX = 88
const ENDING_TWO_LINE_HAIRLINE_GAP = 100

// 装饰对比色（见文件头"孤儿色处理"）：版权行专属的、比 `colors.muted` 浅
// 一档的弱化灰，不对应任何 token 字段。原样保留自 templates/academic.tsx
// 的内联字面量，不导出、不进 token 替换表。
const COPYRIGHT_FAINT = "#8A968F"

export function RailEnding({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const org = ir.meta.organization
  const contact = ir.meta.contact
  const copyright = ir.meta.copyright
  const contactText = [contact?.email, contact?.website].filter(Boolean).join("  ·  ")

  const heading = fitHeadingLines(slide.heading || "Thank you", {
    maxWidth: 768,
    fontSize: 120,
    maxLines: 2,
    minPt: 40,
    fontFamily: fonts.heading,
  })
  const isTwoLine = heading.lines.length > 1
  const headingY = isTwoLine
    ? ENDING_HEADING_LAST_BASELINE - Math.min(heading.lineHeight, ENDING_TWO_LINE_SHIFT_MAX)
    : ENDING_HEADING_LAST_BASELINE
  const headingLastY =
    headingY + Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, { maxWidth: 768, fontSize: 40, minFontSize: 20 })
    : null
  const subheadingY = headingLastY + 68
  const hairlineY = headingLastY + (isTwoLine ? ENDING_TWO_LINE_HAIRLINE_GAP : 120)

  return (
    <>
      {/* Corner blocks — rects echoing Cover's rectangular color-block motif. */}
      <rect x="0" y="480" width="280" height="240" fill={colors.primary} />
      <rect x="0" y="600" width="140" height="120" fill={colors.accent} />

      <g transform="translate(96, 144)">
        <circle cx="12" cy="-12" r="12" fill={colors.accent} />
        {org && (
          <text
            x="48"
            y="0"
            fontFamily={fonts.body}
            fontSize="32"
            fill={colors.primary}
            letterSpacing="2"
            dominantBaseline="alphabetic"
          >
            {org}
          </text>
        )}
      </g>

      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x="400"
          y={headingY + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="600"
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {subheading && (
        <text
          data-truncated={subheading.truncated ? "1" : undefined}
          x="400"
          y={subheadingY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={colors.muted}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      <line
        x1="400"
        y1={hairlineY}
        x2="1184"
        y2={hairlineY}
        stroke={colors.border ?? colors.muted}
        strokeWidth="1.4"
      />

      {contactText && (
        <>
          <text
            x="400"
            y={hairlineY + 52}
            fontFamily={fonts.body}
            fontSize="20"
            fill={colors.muted}
            letterSpacing="4"
            dominantBaseline="alphabetic"
          >
            Contact
          </text>
          <text
            x="400"
            y={hairlineY + 90}
            fontFamily={fonts.body}
            fontSize="28"
            fill={colors.text}
            dominantBaseline="alphabetic"
          >
            {contactText}
          </text>
        </>
      )}

      {copyright && (
        <text
          x="400"
          y={hairlineY + 212}
          fontFamily={fonts.body}
          fontSize="22"
          fill={COPYRIGHT_FAINT}
          dominantBaseline="alphabetic"
        >
          {copyright}
        </text>
      )}
    </>
  )
}

// T1d (src domain reorg wave 1): inlined verbatim from registry.ts's former
// ENDING_LAYOUTS["rail-ending"] entry. `CHROME` (registry.ts's private
// `readonly string[] = []` alias, "not fed by an authored component") is
// inlined here to the literal `[]` it always held, to avoid a value-import
// cycle with the registry aggregator (which value-imports this export) — see
// registry.ts's slot-`accepts` convention doc for what `[]` means.
export const layoutDef: LayoutDefinition = {
  // ending-rail-ending.tsx: corner color-block accents (decor, echoing
  // Cover's rect motif), org kicker, heading ("Thank you"), subheading,
  // hairline + "Contact" contact section + copyright line (all meta).
  id: "rail-ending",
  kind: "archetype",
  slideTypes: ["ending"],
  slots: [
    { name: "decor", accepts: [] },
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "rule", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
