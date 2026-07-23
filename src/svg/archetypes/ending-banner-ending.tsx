// GF/svg/archetypes/ending-banner-ending.tsx
import type { SvgTemplateProps } from "./types"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"

/**
 * banner-ending archetype（spec §3.2）：org 圆点标 + 巨幅斜体主标题 + 中文
 * 副标题 + 一条通栏分隔线 + "联系"区块 + 版权行，呼应 banner-title cover /
 * banner-chapter 同一"结论横幅"气质。自 templates/consulting.tsx 的
 * `MckinseyNavyEnding` 提炼。
 *
 * Step A 实测边界（订正 brief 的"约 504-680 行"）：函数体实际是
 * **504-638 行**（`export function MckinseyNavyEnding` 起，到其闭合 `}`
 * 止）。639 行起是模块级 Decor 相关注释/`MckinseyNavyDecor`，不属于本函数。
 * 随迁的只有函数体正上方 500-502 行的三个模块级私有数值常量
 * （`ENDING_HEADING_LAST_BASELINE` / `ENDING_TWO_LINE_SHIFT_MAX` /
 * `ENDING_TWO_LINE_DIVIDER_GAP`，整个 consulting.tsx 里只有本函数消费），同
 * ending-rail-ending.tsx 处理 `ENDING_HEADING_LAST_BASELINE` 等三个常量的
 * 先例，作为文件私有常量复制，不建公共 util。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/consulting.ts 的
 * colors。十六进制值本身不抄进本注释——避免污染本文件的 grep 清零门，同
 * ending-rail-ending.tsx / cover-left-anchor.tsx 先例）：consulting.tsx
 * 模块级共有 4 个烤死常量（`NAVY`/`YELLOW`/`MUTED`/`DIVIDER`，23-26 行），
 * 但 grep 该函数区间（504-638 行）后确认 `DIVIDER` 在本函数体内**未被
 * 使用**（分隔线用的是 `NAVY`，不是 `DIVIDER`——与 banner-title cover 的
 * meta 分隔线用 `DIVIDER` 不同，是本函数自己的构图选择，原样保留不改
 * 语义）。本函数实际消费的只有以下三个，均逐字符精确匹配
 * `themes/consulting.ts` 的对应字段：
 *   - `NAVY`   → `colors.primary`。
 *   - `YELLOW` → `colors.accent`。
 *   - `MUTED`  → `colors.muted`。
 *
 * 孤儿色处理（**档位二・观感等价**，唯一孤儿色）：版权行 `fill` 用的一个
 * 内联十六进制字面量（630 行，不是模块级具名常量，grep 整个
 * consulting.tsx 只出现这一处）在 consulting.ts 的 colors 表里没有精确
 * 匹配。判断过程（Step B，参照 ending-rail-ending.tsx 对 academic 同类
 * 孤儿色 `COPYRIGHT_FAINT` 的裁决）：
 *   1. 十六进制差值检验——该字面量相对 `colors.muted` 是三通道几乎均匀的
 *      整体调亮，同色相、同去饱和灰调，只是更浅一档——与 academic 版权行
 *      孤儿色相对 `muted` 的偏移模式同构。
 *   2. 页面内的层级证据——同一页里，"联系"标签与联系方式正文都用
 *      `colors.muted`（`MUTED`），版权行故意比它们更浅一档，形成"正文 >
 *      联系信息 (muted) > 版权 (更浅)"的三级弱化梯度，若并入 `muted` 会把
 *      这个梯度抹平。
 *   3. 跨主题旁证——ending-rail-ending.tsx 文件头已记录：`academic` 的
 *      `BCGEmeraldEnding` 版权行独立烤了一个跟自己 `muted` 不同的近似灰
 *      （`COPYRIGHT_FAINT`），两个主题各自独立为"版权行"发明一个比
 *      `muted` 更浅的专属灰——不是巧合的抄近似值，是"版权行天生该比其余
 *      弱化文本更淡"这条构图惯例在多个主题里各自重复出现，判定为该保留
 *      的对比性装饰色，同 `COPYRIGHT_FAINT` 一类，不并入 `colors.muted`。
 *   结论：该字面量保留为文件私有装饰常量 `COPYRIGHT_FAINT`（原始值见下方
 *   代码本身，小写 hex，原样保留，不改大小写），不进上面的替换表。测试用
 *   同 ending-rail-ending.tsx 一样的锁法断言其值跨主题原样出现、且不会被
 *   归并为任何主题的 `muted`。因存在此孤儿色，本函数整体走**档位二**。
 *
 * 白字豁免：本函数区间 grep 未命中任何纯白字面量——不涉及 Global
 * Constraints 的"产品逻辑白字"豁免类别，无需额外点名。
 *
 * 副题兜底语义（按当前源码实际行为原样迁移，不改语义，见源码 525-526 行
 * 注释"兜底只服务完全默认的 ending 页"）：`slide.subheading ||
 * (slide.heading ? "" : "We appreciate your time.")`——仅当 `slide.heading`
 * 也缺省时才兜底显示该文案；若 `heading` 有值但 `subheading` 缺省，则不显示
 * 任何副题（避免模型已填感谢语时与兜底副题语义重复）。主标题自身兜底
 * `slide.heading || "Thank you."`。测试覆盖有 heading（不触发副题兜底）与
 * 无 heading（标题兜底"Thank you."、副题兜底"We appreciate your time."）
 * 两种 ir。defect C 修复：原中文兜底文案"谢谢。"改为英文，选择与主标题不同的
 * 措辞（而非直译重复"Thank you."）避免同页大小标题显示同一句话。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量——唯一豁免是上面点名并测试
 * 锁死的 `COPYRIGHT_FAINT`，grep 清零门预期恰好命中它的代码定义那一行。
 */

// 随迁自 consulting.tsx 模块作用域（500-502 行），只有 MckinseyNavyEnding
// 消费，随函数体一并复制为本文件私有常量。含义见源文件注释：两行标题时把
// 首行上移一个 lineHeight（封顶 85px）以保持末行基线不变，分隔线间距同步
// 收紧。
const ENDING_HEADING_LAST_BASELINE = 356
const ENDING_TWO_LINE_SHIFT_MAX = 85
const ENDING_TWO_LINE_DIVIDER_GAP = 128

// 装饰对比色（见文件头"孤儿色处理"）：版权行专属的、比 `colors.muted` 浅
// 一档的弱化灰，不对应任何 token 字段。原样保留自 templates/consulting.tsx
// 的内联字面量，不导出、不进 token 替换表。
const COPYRIGHT_FAINT = "#8a8a86"

export function BannerEnding({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const org = ir.meta.organization
  const contact = ir.meta.contact
  const copyright = ir.meta.copyright
  const author = ir.meta.authors?.[0]
  const contactText = [author?.name, contact?.email]
    .filter(Boolean)
    .join(" · ")

  const heading = fitHeadingLines(slide.heading || "Thank you.", {
    maxWidth: 1088,
    fontSize: 132,
    maxLines: 2,
    minPt: 40,
    // bold-metrics fix (2026-07-24): this heading renders at fontWeight=500
    // below (one of exactly 2 archetype heading declarations under 600, the
    // codebase's bold threshold — root-cause.md S5), so it opts out of
    // `fitHeadingLines`'s bold-default flip explicitly rather than being
    // over-corrected for a weight it never actually exports as.
    bold: false,
    fontFamily: fonts.heading,
  })
  const isTwoLine = heading.lines.length > 1
  const headingY = isTwoLine
    ? ENDING_HEADING_LAST_BASELINE - Math.min(heading.lineHeight, ENDING_TWO_LINE_SHIFT_MAX)
    : ENDING_HEADING_LAST_BASELINE
  const headingLastY =
    headingY + Math.max(0, heading.lines.length - 1) * heading.lineHeight
  // 兜底只服务完全默认的 ending 页（模型填了 heading 时再兜底必然语义重复，
  // 同 consulting 源码 2026-07-09 去重裁决，原样迁移）。defect C 修复：原
  // 兜底文案"谢谢。"改为英文"We appreciate your time."——不直译成与主标题
  // 相同的"Thank you."，避免同页大小标题重复同一句话（主标题兜底已是
  // "Thank you."，见上方）。
  const subheading = fitSvgLine(slide.subheading || (slide.heading ? "" : "We appreciate your time."), {
    maxWidth: 1088,
    fontSize: 48,
    minFontSize: 24,
  })
  const subheadingY = headingLastY + 80
  const dividerY = headingLastY + (isTwoLine ? ENDING_TWO_LINE_DIVIDER_GAP : 164)

  return (
    <>
      {/* Organization label */}
      <g transform="translate(96, 136)">
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

      {/* Main heading */}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x="96"
          y={headingY + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="500"
          fill={colors.primary}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Chinese subheading（空串=heading 已含感谢语，跳过） */}
      {subheading.text && (
        <text
          data-truncated={subheading.truncated ? "1" : undefined}
          x="96"
          y={subheadingY}
          fontFamily={fonts.heading}
          fontSize={subheading.fontSize}
          fill={colors.muted}
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      {/* Horizontal divider */}
      <line
        x1="96"
        y1={dividerY}
        x2="1184"
        y2={dividerY}
        stroke={colors.primary}
        strokeWidth="1.4"
      />

      {/* Contact section */}
      {contactText && (
        <>
          <text
            x="96"
            y={dividerY + 52}
            fontFamily={fonts.body}
            fontSize="20"
            fill={colors.muted}
            letterSpacing="4"
            dominantBaseline="alphabetic"
          >
            Contact
          </text>
          <text
            x="96"
            y={dividerY + 90}
            fontFamily={fonts.body}
            fontSize="28"
            fill={colors.primary}
            dominantBaseline="alphabetic"
          >
            {contactText}
          </text>
        </>
      )}

      {/* Copyright */}
      {copyright && (
        <text
          x="96"
          y={dividerY + 168}
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
