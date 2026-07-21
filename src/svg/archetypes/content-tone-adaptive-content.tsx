// GF/svg/archetypes/content-tone-adaptive-content.tsx
import type { SvgTemplateProps } from "./types"
import { SvgContent } from "../SvgContent"
import { chapterNumberFor, sectionNameFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { CONF_LABEL } from "../../lib/conf-labels"
import { fitEmphasisLine, renderEmphasisTspans } from "../emphasis"
import { accessibleInk } from "../ink"

/**
 * tone-adaptive-content archetype（spec §3.2，Wave 3 Task 21）：custom 主题
 * content 页型语法上的"双色态"——不像 cover/chapter/ending 三个已提炼的 custom
 * 兄弟页型那样在有背景图时整页切白字，而是改画一张浮在图片上的不透明白色
 * 卡片，卡片内部仍是与无背景图模式完全相同的墨色/静音色文字（卡片本身已提供
 * 对比度基底，不需要再切白字）。两分支坐标系不同（卡片内 x=92 起排、无背景
 * 图 x=64 起排）但颜色语义相同。自 templates/custom.tsx 的 `CustomContent`
 * （323-612 行，Step A 用 `grep -n` 实测边界——比 brief 给出的 323-614 短，
 * 613 行是空行，614 行起是下一节 Ending 的头注释，不属于本函数体）提炼，
 * 随迁 helper `hasBgImage`（36-44 行，私有复制，签名/实现原样不变，同
 * cover-tone-adaptive-header.tsx / chapter-tone-adaptive-chapter.tsx /
 * ending-tone-adaptive-ending.tsx 先例）。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/custom.ts 的 colors。十
 * 六进制值本身不抄进本注释——避免污染本文件的 grep 清零门，同三个已提炼的
 * custom 兄弟页型先例）：
 *   - 源文件私有常量 `INK` —— 与 custom token 表当前的 `primary`、`text`
 *     两个字段精确匹配（custom.ts 里二者尚未拆分，仍是同一个值）。逐行核对
 *     本函数区间内 `INK` 的两处引用（两分支各一处标题 `fill={INK}`），均为
 *     文字填色语境，没有任何描边/stroke 用法——同 chapter-tone-adaptive-
 *     chapter.tsx / ending-tone-adaptive-ending.tsx 同构、与 cover-tone-
 *     adaptive-header.tsx 的双语境不同，统一映射到 `ctx.colors.text`（下方
 *     直接以 `colors.text` 引用）。**若 custom 主题未来把 text/primary 拆
 *     开，这里不需要回来重新判断语境——本函数天然只有一种语境**，与三个
 *     已提炼的 custom 兄弟页型的记录结论一致。
 *   - 源文件私有常量 `MUTED` → `ctx.colors.muted` —— 精确匹配。两处引用
 *     （卡片内 footer meta、无背景图模式 footnote），均是直接写死常量而非
 *     经 `withBg` 派生的变量——因为本函数的 `withBg` 分支不做白字切换（见
 *     下方"两分支同色，非白字豁免"一节），两处原样映射为 `colors.muted`。
 *   - 源文件私有常量 `BORDER` → `ctx.colors.border ?? ctx.colors.muted` ——
 *     精确匹配，两分支各一处 divider 第二段描边。`??` 兜底沿用
 *     ending-tone-adaptive-ending.tsx 的既有写法（`border` 在 `StyleColors`
 *     上是可选字段）。
 *   - `ctx.colors.accent`/`ctx.colors.text`：函数体内已直接消费（两分支的
 *     section label、subheading 及其 `renderEmphasisTspans` 强调段落、
 *     divider 第一段短横条），本就是 token 而非烤死常量，原样保留不进
 *     替换表。
 * 三个烤死常量全部精确匹配 token 值，**无孤儿色**。
 *
 * 两分支同色，非白字豁免（与三个已提炼的 custom 兄弟页型的关键结构差异，
 * 务必不要照抄它们的"withBg 白字"结论）：`CustomContent` 的 `withBg` 分支
 * 不做 cover/chapter/ending 那种"整页切白字"处理——它改画一张不透明白色
 * 卡片浮在背景图上，卡片内部文字沿用与无背景图模式完全相同的墨色/静音色/
 * 描边色（`INK`/`MUTED`/`BORDER` 在两分支里映射到同一组 token，没有随
 * `withBg` 切换成白色字面量的三元表达式）。逐行核对过 323-612 行区间：
 * 唯一随 `withBg` 变化的颜色只有下面点名的白色卡片本身。
 *
 * 白色卡片豁免（Global Constraints 产品逻辑字面量豁免，与三个已提炼的
 * custom 兄弟页型的"背景图上白字"同属一类产品逻辑，但落点不同——这里落在
 * 卡片背景而非文字）：`withBg` 为真时渲染的浮动卡片固定填充纯白——它扮演
 * "浮在任意背景图片之上的不透明纸片"角色，任意主题下都必须是不透明白色才
 * 能保证卡片内文字的可读性，不随主题变化，也不在任何 token 字段里，故不
 * 进上面的替换表，予以保留并在测试里跨主题锁死。
 *
 * **档位一・逐字节等价**（三个烤死常量都精确匹配 token 值，无孤儿色；唯一
 * 颜色字面量是上面点名并测试锁死的白色卡片豁免）。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量——唯一豁免是上面点名并测试锁
 * 死的白色卡片纯白字面量，grep 清零门预期恰好命中这一处。
 *
 * 对比度自适应修复（W4 fix round，Important I1「content archetype 的
 * subheading 出现同类回声」台账）：两分支的 subheading 都原样消费
 * `colors.accent`，同 content-narrow-column.tsx 先例——对 consulting/bloom/
 * classroom/heritage/academic 五个主题不达标。两分支的有效背景不同（`withBg`
 * 分支落在自画的不透明白色卡片上，无背景分支落在页面默认背景上），各自改用
 * `accessibleInk(colors.accent, <对应背景>, fontSize)`：`withBg` 分支传固定
 * `"#FFFFFF"`（卡片色本身，不随主题变化，见上方"白色卡片豁免"），无背景分支
 * 传 `ctx.defaultBg`。通过校验的主题原样返回、逐字节不变。
 *
 * 白卡分支墨色修复（post-v0.3 backlog closure，
 * `.issues/notes/2026-07-18-post-v03-backlog.md` 新发现 (d)）：`withBg` 分支
 * 的标题（`colors.text`）、交给 `SvgContent` 渲染的正文/项目符号
 * （同样读 `colors.text`/`colors.muted`）、页脚 meta（`colors.muted`）三处此前
 * 直接消费主题 token，未经上面 subheading 早已在用的 accessibleInk 守卫——对
 * `colors.text` 是深色 token 的 9/13 主题无害（其本就是为浅底设计的墨色），
 * 但 campaign/insight/luxe/tech 四个 `colors.text` 是浅色 token 的主题（各自
 * 页面本底是深色，浅字对深底才对）画在这张固定纯白的卡片上，实测约
 * 1:1——不是当前主题的"页面默认底色"出问题，是这张卡片自己的纯白底色和
 * 四个主题的浅色 `colors.text` 撞车。补齐同一套 accessibleInk 守卫，参照
 * subheading 先例，背景参数同样是卡片自己的 `"#FFFFFF"`（不是 `ctx.defaultBg`
 * ——这张卡片是本分支自画的独立面板，见上方"白色卡片豁免"）：标题按
 * `heading.fontSize`、页脚 meta 按其固定 20px 直接调用 accessibleInk。
 * `SvgContent` 的子组件（paragraph.tsx/bullets.tsx 等）没有自己的背景感知，
 * 一律直接读 `ctx.colors.text`/`.muted`——要在不碰这些跨 archetype 共享渲染器
 * 的前提下保护它们，唯一办法是把已经过 accessibleInk 校正的 `colors.text`/
 * `.muted` 通过一份局部派生的 `cardCtx` 往下传，字号参照 `ctx.bodyFontPx`
 * （paragraph.tsx 自己渲染用的确切字号，也是 bullets.tsx 收缩前的上限，不是
 * 拍脑袋常量）。9/13 安全主题在卡片纯白底上原本就有 ≥4.5:1（含 `colors.muted`
 * ，逐主题实测 4.83~18.48:1），accessibleInk 全部原样返回，逐字节不变；4 个
 * 问题主题落回 `readableOn` 的中性墨色 `#0A0E14`。
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

/** Wave-B Task 5c: length (px) of the accent-colored lead-in segment on the
 * heading divider. Pure geometry (not a color), copied verbatim as a private
 * constant — not a candidate for the replacement table. */
const TITLE_BAR_LEN = 48

export function ToneAdaptiveContent({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const withBg = hasBgImage(ir, slide)
  const section = sectionNameFor(ir.slides, index)
  const chNum = chapterNumberFor(ir.slides, index)
  const rawSectionLabel = section
    ? `Chapter ${String(chNum).padStart(2, "0")} · ${section}`
    : null

  if (withBg) {
    const sectionLabel = rawSectionLabel
      ? fitSvgLine(rawSectionLabel, {
          maxWidth: 1096,
          fontSize: 22,
          minFontSize: 12,
          letterSpacing: 2,
        })
      : null
    const heading = fitHeadingLines(slide.heading, {
      maxWidth: 1096,
      fontSize: 44,
      maxLines: 2,
      minPt: 22,
    })
    const headingExtra = Math.max(0, heading.lines.length - 1) * heading.lineHeight
    const headingLastY = 168 + headingExtra

    // Subheading (Task 5): a 22px accent so-what sentence below the heading.
    // Occupies a slot added to the divider/content region's y *only* when
    // `slide.subheading` is set, so a slide without one gets byte-identical
    // geometry to before this feature existed.
    //
    // S3b spacing fix (2026-07-07): the original generic +30 baseline left
    // only ~1px of clearance for this 44px title (titleLastY+round(0.12*44)=
    // titleLastY+5 vs. subheadingY-20=titleLastY+10). Unified formula:
    // headingLastY + 22(ascent) + 14(target gap) + round(0.12*44) =
    // headingLastY + 36+6 = +42. Slot grows by the same +12 the baseline
    // grew (30->42) so the subheading-to-divider gap doesn't shrink.
    const subheading = fitEmphasisLine(slide.subheading, {
      maxWidth: 1096,
      fontSize: 22,
      minFontSize: 16,
    })
    const subheadingY = headingLastY + 42
    const subheadingBudget = subheading ? 46 : 0
    // W4 fix round: this branch's subheading sits on the self-painted white
    // card (below), not the page's `ctx.defaultBg` — keeps colors.accent
    // when it already clears the ratio against white, falls back to
    // readableOn's neutral ink otherwise. Fallback value is never rendered
    // when `subheading` is null.
    const subheadingFill = subheading
      ? accessibleInk(colors.accent, "#FFFFFF", subheading.fontSize)
      : colors.accent
    // The **emphasis** tspans inside the subheading sit on the same white
    // card, so their accent needs the same guard as headingFill below.
    const subheadingEmphasisFill = subheading
      ? accessibleInk(colors.text, "#FFFFFF", subheading.fontSize)
      : colors.text
    const dividerY = 198 + headingExtra + subheadingBudget
    const contentRectY = 216 + headingExtra + subheadingBudget
    const contentRectH = Math.max(120, 400 - headingExtra - subheadingBudget)

    // Post-v0.3 backlog closure (see file header "白卡分支墨色修复"): heading
    // + SvgContent body/bullets + footer meta all sit on this branch's own
    // white card, not `ctx.defaultBg` — same accessibleInk guard the
    // subheading above already uses, same "#FFFFFF" background reference.
    const headingFill = accessibleInk(colors.text, "#FFFFFF", heading.fontSize)
    // `SvgContent`'s descendants (paragraph.tsx/bullets.tsx, etc.) read
    // `ctx.colors.text`/`.muted` raw with no background awareness of their
    // own — the only way to protect them without touching those
    // cross-archetype shared renderers is to hand them an already-corrected
    // ctx. `ctx.bodyFontPx` is the exact size paragraph.tsx itself renders
    // at (and the ceiling bullets.tsx shrinks from), so it's the accurate
    // size reference here, not a guessed constant.
    const cardCtx = {
      ...ctx,
      colors: {
        ...colors,
        text: accessibleInk(colors.text, "#FFFFFF", ctx.bodyFontPx),
        muted: accessibleInk(colors.muted, "#FFFFFF", ctx.bodyFontPx),
      },
    }
    const footerFill = accessibleInk(colors.muted, "#FFFFFF", 20)

    /* White content card floating on the background image — see file
       header's "白色卡片豁免". */
    return (
      <>
        {/* White card */}
        <rect
          x="48"
          y="44"
          width="1184"
          height="632"
          rx={ctx.shape?.radius ?? 14}
          fill="#FFFFFF"
        />

        {/* Section label (kicker) inside card — Task 5b: accent, not muted */}
        {sectionLabel && (
          <text
            data-truncated={sectionLabel.truncated ? "1" : undefined}
            x="92"
            y="104"
            fontFamily={fonts.heading}
            fontSize={sectionLabel.fontSize}
            fill={colors.accent}
            letterSpacing="2"
            dominantBaseline="alphabetic"
          >
            {sectionLabel.text}
          </text>
        )}

        {/* Heading inside card */}
        {heading.lines.map((line, i) => (
          <text
            key={i}
            data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
            x="92"
            y={168 + i * heading.lineHeight}
            fontFamily={fonts.heading}
            fontSize={heading.fontSize}
            fontWeight="700"
            fill={headingFill}
            dominantBaseline="alphabetic"
          >
            {line}
          </text>
        ))}

        {/* Subheading: accent so-what sentence below the heading (Task 5) */}
        {subheading && (
          <text
            x="92"
            y={subheadingY}
            fontFamily={fonts.body}
            fontSize={subheading.fontSize}
            fill={subheadingFill}
            dominantBaseline="alphabetic"
          >
            {renderEmphasisTspans(subheading.segments, { accent: subheadingEmphasisFill, baseFill: subheadingFill, fontWeight: "700" })}
          </text>
        )}

        {/* Divider inside card: accent short bar (Task 5c, candidate ①) +
            thin rule — same x1/x2/y span as the pre-Task-5 single line, just
            split into two segments (zero geometry change). */}
        <line
          x1="92"
          y1={dividerY}
          x2={92 + TITLE_BAR_LEN}
          y2={dividerY}
          stroke={colors.accent}
          strokeWidth="4"
        />
        <line
          x1={92 + TITLE_BAR_LEN}
          y1={dividerY}
          x2="1188"
          y2={dividerY}
          stroke={colors.border ?? colors.muted}
          strokeWidth="1.6"
        />

        {/* Content area inside card (SvgContent replaces foreignObject) */}
        <SvgContent
          arrangement={slide.arrangement}
          components={slide.components}
          rect={{ x: 92, y: contentRectY, w: 1096, h: contentRectH }}
          ctx={cardCtx}
        />

        {/* Footer meta inside card */}
        <text
          x="92"
          y="636"
          fontFamily={fonts.body}
          fontSize="20"
          fill={footerFill}
          dominantBaseline="alphabetic"
        >
          {[
            ir.meta.confidentiality
              ? CONF_LABEL[ir.meta.confidentiality]
              : null,
            ir.meta.organization,
            ir.meta.version,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </text>
      </>
    )
  }

  /* White background mode (no bg image). */
  const contentH = slide.footnote ? 420 : 460
  const sectionLabel = rawSectionLabel
    ? fitSvgLine(rawSectionLabel, {
        maxWidth: 1152,
        fontSize: 22,
        minFontSize: 12,
        letterSpacing: 2,
      })
    : null
  const heading = fitHeadingLines(slide.heading, {
    maxWidth: 1152,
    fontSize: 46,
    maxLines: 2,
    minPt: 22,
  })
  const headingExtra = Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const headingLastY = 130 + headingExtra

  // Subheading (Task 5): a 22px accent so-what sentence below the heading.
  // Occupies a slot added to the divider/content region's y *only* when
  // `slide.subheading` is set, so a slide without one gets byte-identical
  // geometry to before this feature existed.
  //
  // S3b spacing fix (2026-07-07): the original generic +30 baseline left
  // only ~1px of clearance for this 46px title (titleLastY+round(0.12*46)=
  // titleLastY+6 vs. subheadingY-20=titleLastY+10). Unified formula:
  // headingLastY + 22(ascent) + 14(target gap) + round(0.12*46) =
  // headingLastY + 36+6 = +42. Slot grows by the same +12 the baseline
  // grew (30->42) so the subheading-to-divider gap doesn't shrink.
  const subheading = fitEmphasisLine(slide.subheading, {
    maxWidth: 1152,
    fontSize: 22,
    minFontSize: 16,
  })
  const subheadingY = headingLastY + 42
  const subheadingBudget = subheading ? 46 : 0
  // W4 fix round: this (no-bg) branch's subheading sits directly on the
  // page's default background — keeps colors.accent when it already clears
  // the ratio, falls back to readableOn's neutral ink otherwise. Fallback
  // value is never rendered when `subheading` is null. `ctx.defaultBg` is
  // optional (`ComponentCtx`'s own doc comment: a hand-built ctx in a test
  // may omit it) — falls back to the same `colors.bg` `buildCtx` itself
  // defaults to.
  const subheadingFill = subheading
    ? accessibleInk(colors.accent, ctx.defaultBg ?? colors.bg, subheading.fontSize)
    : colors.accent
  const dividerY = 162 + headingExtra + subheadingBudget
  const contentRectY = 180 + headingExtra + subheadingBudget
  const contentRectH = Math.max(120, contentH - headingExtra - subheadingBudget)

  return (
    <>
      {/* Section label (kicker) — Task 5b: accent, not muted */}
      {sectionLabel && (
        <text
          data-truncated={sectionLabel.truncated ? "1" : undefined}
          x="64"
          y="62"
          fontFamily={fonts.heading}
          fontSize={sectionLabel.fontSize}
          fill={colors.accent}
          letterSpacing="2"
          dominantBaseline="alphabetic"
        >
          {sectionLabel.text}
        </text>
      )}

      {/* Heading */}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x="64"
          y={130 + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Subheading: accent so-what sentence below the heading (Task 5) */}
      {subheading && (
        <text
          x="64"
          y={subheadingY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={subheadingFill}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(subheading.segments, { accent: colors.text, baseFill: subheadingFill, fontWeight: "700" })}
        </text>
      )}

      {/* Divider: accent short bar (Task 5c, candidate ①) + thin rule — same
          x1/x2/y span as the pre-Task-5 single line, just split into two
          segments (zero geometry change). */}
      <line
        x1="64"
        y1={dividerY}
        x2={64 + TITLE_BAR_LEN}
        y2={dividerY}
        stroke={colors.accent}
        strokeWidth="4"
      />
      <line
        x1={64 + TITLE_BAR_LEN}
        y1={dividerY}
        x2="1216"
        y2={dividerY}
        stroke={colors.border ?? colors.muted}
        strokeWidth="1.6"
      />

      {/* Content components (SvgContent replaces foreignObject) */}
      <SvgContent
        arrangement={slide.arrangement}
        components={slide.components}
        rect={{ x: 64, y: contentRectY, w: 1152, h: contentRectH }}
        ctx={ctx}
      />

      {/* Footnote */}
      {slide.footnote && (
        <text
          x="64"
          y="688"
          fontFamily={fonts.body}
          fontSize="20"
          fill={colors.muted}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {slide.footnote}
        </text>
      )}
    </>
  )
}
