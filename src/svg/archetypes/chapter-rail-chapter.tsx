// GF/svg/archetypes/chapter-rail-chapter.tsx
import type { SvgTemplateProps } from "./types"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"

/**
 * rail-chapter archetype（spec §3.2）：巨幅居中标题 + 斜体副标题，压在整页
 * 通栏 `colors.primary` 色块上（色块本身由 FullSlideSvg 按
 * `themes/academic.ts` 的 `defaultBackgrounds.chapter` 绘制，本文件不
 * 画背景），底部一条水平章节进度点轨（`totalChapters` 只有 1 时收起轨道
 * 线，只留单点）。自 templates/academic.tsx 的 `BCGEmeraldChapter`
 * （235-328 行）提炼。随迁 helper：`CH_DOT_Y`/`CH_DOT_SPACING`
 * （源文件 232-233 行的模块级私有常量，grep 确认整个 academic.tsx 里只有
 * 本函数消费，随函数体一并复制为本文件私有常量，不建公共 util）。
 *
 * Step A 复核（现状表标"烤色同款"，逐字核实后订正——十六进制值本身不抄进
 * 本注释，避免污染本文件的 grep 清零门，同 cover-left-anchor.tsx 先例）：
 * 对函数区间（235-328 行）grep 具名烤色常量，函数体内一次也没有出现
 * `DEEP_GREEN`/`EMERALD`/`TEXT`/`MUTED`/`HAIRLINE` 这些 academic.tsx
 * 模块级烤色常量，也没有任何 `ctx.colors.*` 消费——本函数唯一读取的 ctx
 * 字段是 `ctx.fonts.heading`。函数体内出现的颜色字面量只有一种取值
 * （代码里能看到的那个纯白字面量，出现 5 处：水印章节号 / 主标题 / 副标题
 * / 进度轨道线 / 进度点）。故现状表"烤色同款"的判断不成立，本函数没有需要
 * 建立映射的具名烤色，**档位一・逐字节等价**。
 *
 * 白字处理（同 cover-left-anchor.tsx 的"白字例外"先例，非徽章场景但同一
 * 类产品逻辑）：这 5 处不是"徽章白字"，是画在整页不透明 `colors.primary`
 * 色块之上的水印数字/主标题/副标题/进度点——用于保证在任意主题的
 * `primary` 色值下都可读。**注意一个逐字节陷阱**：这个白色字面量恰好与
 * academic 自己的 `colors.surface` 逐字符相同，但 `surface` 字段在别的
 * 主题里并不是白色（creative/tech 是深色，custom 是浅灰——见
 * themes/*.ts），若机械地把这个字面量映射进 `colors.surface`，在
 * creative/tech 下这些主题的章节页背景同样是深色，文字会变成深色-on-深色
 * 而隐形——这不是"观感等价"而是"观感被破坏"，同 left-anchor 文件头记录的
 * `TRIANGLE_DEEP` 教训同一类陷阱（十六进制凑巧相等 ≠ 语义相同）。核实同款
 * 先例：consulting 的 `MckinseyNavyChapter`（184-324 行）同样对其章节大
 * 标题写死同一个纯白字面量，不是 academic 独有写法，是"章节页压在整页深色
 * 主色块上"这一构图共享的结构性产品逻辑。故该字面量不进下面的替换表，保留
 * 原样，并在测试里跨主题锁死。
 *
 * 替换表：无——本函数不消费任何 token 字段，只有上述白字例外一项。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量——唯一豁免是上面点名并测试
 * 锁死的纯白字面量（代码里的 5 处 `fill`/`stroke`），grep 清零门预期恰好
 * 命中这 5 处。
 */

// Horizontal chapter-progress dot row's fixed y and per-dot spacing. Ported
// verbatim from templates/academic.tsx module scope (232-233 行)——only
// BCGEmeraldChapter consumed them there, so they move here as file-private
// constants rather than staying module-level in the shared templates file.
const CH_DOT_Y = 600
const CH_DOT_SPACING = 40

export function RailChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const chNum = chapterNumberFor(ir.slides, index)
  const label = String(chNum).padStart(2, "0")
  const totalChapters = ir.slides.filter((s) => s.type === "chapter").length

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: 1088,
    fontSize: 84,
    maxLines: 2,
    minPt: 40,
  })
  const headingY = heading.lines.length > 1 ? 352 : 392
  const headingLastY =
    headingY + Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, { maxWidth: 1088, fontSize: 34, minFontSize: 18 })
    : null
  const subheadingY = headingLastY + 46

  // Horizontal chapter-progress dot row, centered under the heading. Single-
  // chapter decks collapse to one dot at the midpoint and skip the track line
  // (nothing to show progress "along").
  const dotsWidth = Math.max(0, totalChapters - 1) * CH_DOT_SPACING
  const dotsStartX = 640 - dotsWidth / 2

  return (
    <>
      <text
        x="1224"
        y="650"
        fontFamily={ctx.fonts.heading}
        fontSize="260"
        fontWeight="700"
        fill="#FFFFFF"
        opacity="0.06"
        textAnchor="end"
        dominantBaseline="alphabetic"
      >
        {label}
      </text>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x="640"
          y={headingY + i * heading.lineHeight}
          fontFamily={ctx.fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="600"
          fill="#FFFFFF"
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}
      {subheading && (
        <text
          x="640"
          y={subheadingY}
          fontFamily={ctx.fonts.heading}
          fontSize={subheading.fontSize}
          fill="#FFFFFF"
          opacity="0.7"
          textAnchor="middle"
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      {/* Horizontal chapter-progress dots */}
      {totalChapters > 1 && (
        <line
          x1={dotsStartX}
          y1={CH_DOT_Y}
          x2={dotsStartX + dotsWidth}
          y2={CH_DOT_Y}
          stroke="#FFFFFF"
          strokeOpacity="0.3"
          strokeWidth="1.6"
        />
      )}
      {Array.from({ length: totalChapters }, (_, i) => i + 1).map((n) => (
        <circle
          key={n}
          cx={dotsStartX + (n - 1) * CH_DOT_SPACING}
          cy={CH_DOT_Y}
          r={n === chNum ? 7 : 5}
          fill="#FFFFFF"
          fillOpacity={n === chNum ? 1 : 0.35}
        />
      ))}
    </>
  )
}
