// GF/svg/archetypes/ending-tone-adaptive-ending.tsx
import type { SvgTemplateProps } from "./types"
import { fitHeadingLines } from "../heading-fit"

/**
 * tone-adaptive-ending archetype（spec §3.2）：左对齐超大主标题（缺省兜底
 * "谢谢"）+ 底部分隔线 + "联系"区块 + 版权行。有背景图时叠加黑色半透明幕布并
 * 整体切换为白字。自 templates/custom.tsx 的 `CustomEnding`（615-759 行，
 * Step A 实测边界，订正 brief 估的 "615-784"——784 行落在其后
 * `CustomDecor` 的注释块内，不属于本函数）提炼，随迁 helper `hasBgImage`
 * （36-44 行，私有复制，签名/实现原样不变）。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/custom.ts 的 colors。十
 * 六进制值本身不抄进本注释——避免污染本文件的 grep 清零门，同
 * cover-tone-adaptive-header.tsx / chapter-tone-adaptive-chapter.tsx 先
 * 例）：
 *   - 源文件私有常量 `INK` —— 与 custom token 表当前的 `primary`、`text`
 *     两个字段精确匹配（custom.ts 里二者尚未拆分，仍是同一个值）。本函数体
 *     内 `INK`／派生变量 `fg` **只在文字填色语境下被消费**（主标题、联系方
 *     式正文两处，均为 `fill={fg}`），没有任何描边/stroke 用法——与
 *     chapter-tone-adaptive-chapter.tsx 同构、与 cover-tone-adaptive-
 *     header.tsx 的双语境不同，统一映射到 `ctx.colors.text`（下方
 *     `textFg`）。**若 custom 主题未来把 text/primary 拆开，这里不需要回来
 *     重新判断语境——本函数天然只有一种语境**，这点特此记录以免误用 cover
 *     文件头的双语境结论直接套用本文件。
 *   - 源文件私有常量 `MUTED` → `ctx.colors.muted` —— 精确匹配。三处引用：
 *     org 标签、"联系"标签、版权行（均经 `withBg` 派生的 `muted` 变量间接
 *     引用）。
 *   - 源文件私有常量 `BORDER` → `ctx.colors.border ?? ctx.colors.muted` ——
 *     精确匹配，用于分隔线。`??` 兜底沿用 cover-left-anchor.tsx /
 *     ending-rail-ending.tsx 的既有写法（`border` 在 `StyleColors` 上是可
 *     选字段）。
 *   - brief 提示"169 行附近"另有一个灰阶需核实归属（`CustomDecor` 的模块
 *     级常量 `BG_MIXED_6PCT_BLACK`，templates/custom.tsx 第 783 行）：Step A
 *     复核确认该常量是 `CustomDecor`（180° 渐变场）专属消费，`CustomEnding`
 *     函数体 615-759 行内完全不引用它——grep 复核该常量的十六进制值全文件
 *     唯一命中就是它自己的定义那一行。**不在本次 ending 提炼范围内**，留给
 *     Wave 3 motif 迁移（custom 的 Decor）处理，本文件不消费、不归并、不
 *     出现，不构成孤儿色问题（十六进制值本身不抄进本注释，同上方各条约定，
 *     避免污染下面的 grep 清零门）。
 *
 * 档位判定：以上三个烤死常量全部精确匹配 token 值，无孤儿色——**档位一・逐
 * 字节等价**（custom 自己的 tokens 下与旧 `CustomEnding` 输出 `toBe` 全
 * 等）。
 *
 * withBg 白字/黑幕豁免（Global Constraints 产品逻辑白字豁免，同
 * cover-tone-adaptive-header.tsx / chapter-tone-adaptive-chapter.tsx 先
 * 例）：`hasBgImage` 为真时 `textFg`/`mutedFg`/`borderColor` 三个派生变量固
 * 定切到纯白（各自搭配不同 opacity）——背景图上强制白字的结构性产品逻辑，不
 * 随主题变化，不进上面的替换表。整页黑色半透明幕布（scrim for bg-image
 * readability，替代原 linearGradient）同属此类：不是任何主题 token 的烤
 * 色，是固定可读性遮罩，原样保留。
 *
 * 副题兜底语义（按当前源码实际行为原样迁移，不改语义）：`CustomEnding` 源
 * 码里**没有 `slide.subheading` 的任何引用**——只有主标题一层兜底
 * （`slide.heading || "谢谢"`），不存在 ending-rail-ending.tsx /
 * ending-masthead-ending.tsx 那种独立的副标题渲染分支，也没有"heading 缺省
 * 才连带兜底副题"的双重兜底模式（本函数结构上没有副题可兜底）。测试仍按
 * 「有/无 heading」两种 ir 覆盖：有 heading 时标题原样、不触发兜底；无
 * heading 时兜底渲染"谢谢"。
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

export function ToneAdaptiveEnding({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const withBg = hasBgImage(ir, slide)
  // INK 语境映射（见文件头「替换表」）：本函数唯一语境是文字填色 → text。
  const textFg = withBg ? "#FFFFFF" : colors.text
  const mutedFg = withBg ? "#FFFFFF" : colors.muted
  const borderColor = withBg ? "#FFFFFF" : (colors.border ?? colors.muted)
  const borderOpacity = withBg ? 0.18 : 1

  const org = ir.meta.organization
  const contact = ir.meta.contact
  const copyright = ir.meta.copyright
  const author = ir.meta.authors?.[0]

  const contactParts = [author?.name, contact?.email, contact?.website].filter(
    Boolean,
  )
  const contactText = contactParts.join(" · ")

  const heading = fitHeadingLines(slide.heading || "Thank you", {
    maxWidth: 1152,
    fontSize: 100,
    maxLines: 2,
    minPt: 40,
  })
  // Last-line-anchored（S3b addendum, 2026-07-07，机械搬运自源函数注释）：锚
  // 定标题末行基线，使分隔线/联系/版权链条的 y 不随行数变化。
  const HEADING_LAST_BASELINE = 396
  const headingY =
    HEADING_LAST_BASELINE -
    Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const headingLastY = HEADING_LAST_BASELINE
  const dividerY = headingLastY + 124
  const contactLabelY = dividerY + 52
  const contactTextY = dividerY + 88
  const copyrightY = dividerY + 164

  return (
    <>
      {/* Scrim for bg-image mode (replaces linearGradient) — see file
          header's withBg 白字/黑幕豁免. */}
      {withBg && (
        <rect width="1280" height="720" fill="#000000" opacity="0.32" />
      )}

      {/* Top left: organization */}
      {org && (
        <text
          x="64"
          y="74"
          fontFamily={fonts.body}
          fontSize="22"
          fill={mutedFg}
          opacity={withBg ? 0.8 : 1}
          letterSpacing="3"
          dominantBaseline="alphabetic"
        >
          {org}
        </text>
      )}

      {/* Main heading */}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x="64"
          y={headingY + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={textFg}
          letterSpacing="-2"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Divider */}
      <line
        x1="64"
        y1={dividerY}
        x2="1216"
        y2={dividerY}
        stroke={borderColor}
        strokeOpacity={borderOpacity}
        strokeWidth="1.6"
      />

      {/* Contact section */}
      {contactText && (
        <>
          <text
            x="64"
            y={contactLabelY}
            fontFamily={fonts.body}
            fontSize="20"
            fill={mutedFg}
            opacity={withBg ? 0.6 : 1}
            letterSpacing="4"
            dominantBaseline="alphabetic"
          >
            Contact
          </text>
          <text
            x="64"
            y={contactTextY}
            fontFamily={fonts.body}
            fontSize="28"
            fill={textFg}
            dominantBaseline="alphabetic"
          >
            {contactText}
          </text>
        </>
      )}

      {/* Copyright */}
      {copyright && (
        <text
          x="64"
          y={copyrightY}
          fontFamily={fonts.body}
          fontSize="22"
          fill={mutedFg}
          opacity={withBg ? 0.55 : 1}
          dominantBaseline="alphabetic"
        >
          {copyright}
        </text>
      )}
    </>
  )
}
