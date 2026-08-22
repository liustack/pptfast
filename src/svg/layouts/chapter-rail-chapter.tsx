import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines, scaleTypePx } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleOpacity, readableOn } from "../ink"

/**
 * rail-chapter layout（spec §3.2）：巨幅居中标题 + 斜体副标题，压在整页
 * 通栏色块上（色块本身由 FullSlideSvg 按 theme 的
 * `defaultBackgrounds.chapter` 绘制，本文件不画背景），底部一条水平章节
 * 进度点轨（`totalChapters` 只有 1 时收起轨道线，只留单点）。自
 * templates/academic.tsx 的 `BCGEmeraldChapter`（235-328 行）提炼。随迁
 * helper：`CH_DOT_Y`/`CH_DOT_SPACING`（源文件 232-233 行的模块级私有常量，
 * grep 确认整个 academic.tsx 里只有本函数消费，随函数体一并复制为本文件
 * 私有常量，不建公共 util）。
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
 * 对比度自适应修复（W4 fix round，Critical C1）：主标题/副标题原先写死纯白
 * ——假设章节默认背景总是深色。全集放开后该假设对 enterprise/
 * heritage/ink/journal/runway 六个浅底章节主题不成立（runway/enterprise 精确
 * 1.00:1，白字压白底完全不可见。其余四个 1.05-1.14:1，米白/浅棕底同样远低于
 * 3:1 门槛）——同一缺陷模式已在 design decision 8 的台账记录过（consulting×
 * masthead-chapter、tech×left-anchor/banner-heading）。改用 `readableOn(ctx.
 * defaultBg)`：`ctx.defaultBg` 就是 FullSlideSvg 实际画在本页背后的那个
 * `defaultBackgrounds.chapter` 色（见 `ComponentCtx` 自己的文档），
 * `readableOn` 按其明度选中性黑/白——对本来就深色的七个章节底（academic/
 * campaign/classroom/consulting/insight/luxe/tech）算出的仍是白色，是同一个
 * 字面量，输出不变。水印章节号（0.05-0.06 透明度）与进度轨道/进度点两类装饰
 * 元素保留原样纯白字面量——不是本次缺陷范围（低透明度已被审计的
 * `DECORATIVE_ALPHA` 豁免，从未被判定不可读），改动面收在 heading/subheading
 * 两处。
 *
 * 替换表：无——本函数不消费任何 token 字段，唯一颜色输入是上面的
 * `readableOn(ctx.defaultBg)` 自适应结果与装饰元素的纯白字面量。
 *
 * 标题簇呼吸感修复（2026-08-20 第四轮评审，批 2 波 H）：副标题基线原是
 * `headingLastY + 46` 这个与字号无关的定值，在本版式实际渲染的 84px 标题下
 * 只留 6px 墨隙（用户在 `theme--ink--zh--p02` 上点名"副标题距离上面的大标题
 * 那么近"）。定值换成 `subheadingDrop()` 这个纯函数，推导见它自身的注释。
 * 本条属共享版式（campaign/classroom/enterprise/heritage/ink/luxe/
 * tech/terra 九家 chapter 页共用），修一次九家同时受益，不是 ink 专属补丁。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量——唯一豁免是水印/进度轨/进度点
 * 三类装饰元素的纯白字面量（代码里的 3 处 `fill`/`stroke`），grep 清零门
 * 预期恰好命中这 3 处（heading/subheading 两处已改为 `readableOn` 调用，不
 * 再是字面量）。
 */

// Horizontal chapter-progress dot row's fixed y and per-dot spacing. Ported
// verbatim from templates/academic.tsx module scope (232-233 行)——only
// BCGEmeraldChapter consumed them there, so they move here as file-private
// constants rather than staying module-level in the shared templates file.
const CH_DOT_Y = 600
const CH_DOT_SPACING = 40

/** How far a CJK glyph's ink falls below its baseline, per unit of font size. */
const INK_DESCENT = 0.12
/** How far a CJK glyph's ink rises above its baseline, per unit of font size. */
const INK_ASCENT = 0.88
/**
 * Blank space between the heading's lowest ink and the subheading's highest,
 * as a fraction of the heading size — the gap scales with the type it
 * separates, so a heading shrunk to `minPt` does not keep an 84px title's
 * air under it.
 */
const SUBHEADING_BREATH = 0.24

/**
 * Distance from the heading's last baseline down to the subheading's.
 *
 * The number the retired fixed `+46` only worked at one size, and worked at
 * none of the ones this layout actually renders. At the nominal 84px
 * heading / 34px subheading it left 46 - 0.12*84 - 0.88*34 = **6.0px** of
 * ink between the two — the "副标题贴大标题" the 2026-08-20 review reported
 * on `theme--ink--zh--p02` — because 46 is barely half the heading's own
 * 91px line box: the subtitle's baseline was landing *inside* the title's
 * line. The sibling `banner-chapter`, same 84px heading, spends 56 and
 * lands at 14.2px.
 *
 * Stated as a relationship instead of a coordinate: heading descent +
 * breathing room + subheading ascent. At the nominal sizes that is
 * 10 + 20 + 30 = 60 (20.0px of ink between the two, against banner-chapter's
 * 14.2 and masthead-chapter's 19.2); at a heading shrunk to the 40px floor
 * with an 18px subheading it is 5 + 10 + 16 = 31, where the old flat 46
 * would have opened a 25px hole under a 40px title.
 */
function subheadingDrop(headingSize: number, subheadingSize: number): number {
  return (
    Math.round(headingSize * INK_DESCENT) +
    Math.round(headingSize * SUBHEADING_BREATH) +
    Math.round(subheadingSize * INK_ASCENT)
  )
}

export function RailChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const chNum = chapterNumberFor(ir.slides, index)
  const label = String(chNum).padStart(2, "0")
  const totalChapters = ir.slides.filter((s) => s.type === "chapter").length
  // `ctx.defaultBg` is optional (ComponentCtx's own doc comment: a
  // hand-built ctx in a test may omit it) — falls back to the same
  // `colors.bg` `buildCtx` itself defaults to.
  const defaultBg = ctx.defaultBg ?? ctx.colors.bg
  const ink = readableOn(defaultBg)

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: 1088,
    fontSize: 84,
    maxLines: 2,
    minPt: 40,
    fontFamily: ctx.fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const headingY = heading.lines.length > 1 ? 352 : 392
  const headingLastY =
    headingY + Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, { maxWidth: 1088, fontSize: 34, minFontSize: 18 })
    : null
  const subheadingY = subheading
    ? headingLastY + subheadingDrop(heading.fontSize, subheading.fontSize)
    : headingLastY
  // Dimmed subheading tier (0.7 opacity for visual hierarchy under the
  // heading) — W4 fix round: classroom's chapter background (#6E8E9E) gives
  // `ink` only 3.48:1 at full opacity to begin with (comfortably >=3, but
  // the *tightest* margin of any theme this layout's white ink already
  // covered), and blending it toward that background at 0.7 alpha drops the
  // rendered ratio to ~2.53:1 — a real, pre-existing gap (present since
  // before this fix round; classroom's rail-chapter pairing was already
  // curated pre-W4) that `accessibleOpacity` catches by verifying the
  // *blended* result, not just `ink`'s own full-opacity ratio.
  const subheadingOpacity = subheading
    ? accessibleOpacity(ink, defaultBg, subheading.fontSize, 0.7)
    : 0.7

  // Horizontal chapter-progress dot row, centered under the heading.
  //
  // A single-chapter deck draws none of it. The track line was already
  // skipped there (nothing to show progress "along"), but the dots were not,
  // which left exactly one white dot floating at (640,600) with no track
  // under it and nothing to compare itself to — the "meaningless dot" the
  // 2026-08-20 review pointed at on ink p02. A progress indicator that can
  // only ever show "1 of 1" indicates nothing, so the dot hides with its
  // track.
  const showDots = totalChapters > 1
  const dotsWidth = Math.max(0, totalChapters - 1) * CH_DOT_SPACING
  const dotsStartX = 640 - dotsWidth / 2

  return (
    <>
      <text
        x="1224"
        y="650"
        fontFamily={ctx.fonts.heading}
        fontSize={scaleTypePx(260, ctx.shape?.typeScale)}
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
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x="640"
          y={headingY + i * heading.lineHeight}
          fontFamily={ctx.fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="600"
          fill={ink}
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}
      {subheading && (
        <text
          data-truncated={subheading.truncated ? "1" : undefined}
          x="640"
          y={subheadingY}
          fontFamily={ctx.fonts.heading}
          fontSize={subheading.fontSize}
          fill={ink}
          opacity={subheadingOpacity}
          textAnchor="middle"
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      {/* Horizontal chapter-progress track + dots (multi-chapter decks only) */}
      {showDots && (
        <>
          <line
            x1={dotsStartX}
            y1={CH_DOT_Y}
            x2={dotsStartX + dotsWidth}
            y2={CH_DOT_Y}
            stroke="#FFFFFF"
            strokeOpacity="0.3"
            strokeWidth="1.6"
          />
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
      )}
    </>
  )
}

// T1d (src domain reorg wave 1): inlined verbatim from registry.ts's former
// CHAPTER_LAYOUT_DEFS["rail-chapter"] entry. Slot `accepts: []` means the slot is not fed by an authored
// component. That empty array used to live as a private alias in registry.ts
// and is inlined here as the literal `[]` it always held, to avoid a value-import
// cycle with the registry aggregator (which value-imports this export) — see
// registry.ts's slot-`accepts` convention doc for what `[]` means.
export const layoutDef: LayoutDefinition = {
  // chapter-rail-chapter.tsx: giant translucent watermark numeral, centered
  // heading + italic subheading over the theme's primary color block, and
  // a horizontal chapter-progress dot row + track → rail.
  id: "rail-chapter",
  kind: "archetype",
  slideTypes: ["chapter"],
  slots: [
    { name: "watermark", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "rail", accepts: [] },
  ],
}
