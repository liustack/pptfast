// GF/svg/motifs/motif-rail-motif.tsx
import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"
import { readableOn } from "../ink"

/**
 * rail-motif archetype（spec §3.2，Wave 3 Task 18）：a soft quarter-disc arc
 * in the page's bottom-right corner, drawn via `path` (svg2pptx's `path`
 * primitive, allowed starting P2 — see magazine's `CornerOrnamentMotif` for
 * the other P2 precedent, this file's second use). Cover gets nothing here
 * (its own deeper-green corner triangle is drawn directly in
 * `cover-left-anchor.tsx`'s body instead — see that file's own doc comment
 * for why: it must paint *after* the cover's opaque color block, and Decor
 * always renders *before* the body, so a decor-slot shape at that position
 * would be fully painted over). Chapter uses a white arc (its default
 * background is `colors.primary` itself, so a primary-tinted arc at low
 * opacity would be a no-op composite — invisible, not merely subtle);
 * content/ending use a `colors.primary`-tinted arc over their light default
 * background. Extracted from templates/academic.tsx 的 `BcgEmeraldDecor`
 * （713-720 行，Step A 实测边界，比 brief 给出的 713-729 短——722 行起是文件
 * 末尾的 `academicTemplate` 导出对象，已按任务要求排除）。随迁 helper：
 * `ARC_CX`/`ARC_CY`/`ARC_R`/`ARC_PATH`（源文件 693-711 行的模块级私有几何
 * 常量，只被本函数消费，随函数体一并复制为本文件私有常量，不建公共
 * util——同 chapter-rail-chapter.tsx 对 `CH_DOT_*` 的处理）。
 *
 * **TRIANGLE_DEEP 交叉核实（本任务的关键检查项）**：cover-left-anchor.tsx
 * 已把 academic 的装饰色 `TRIANGLE_DEEP`（源文件 691 行）处理为文件私有常量
 * 保留（不并入 `primary`，理由见该文件头的"装饰色豁免"）。逐行核对
 * `BcgEmeraldDecor`（713-720 行）本身——`TRIANGLE_DEEP` 仅被
 * `BCGEmeraldCover`（源文件 120 行）消费，`BcgEmeraldDecor` 函数体内一次也
 * 没有引用它（`grep -n "TRIANGLE_DEEP" templates/academic.tsx` 只命中
 * 116/120/691 三行，均在 Cover 函数或其模块级声明内，不在 Decor 函数区间
 * 713-720 内）。故本文件**不涉及** `TRIANGLE_DEEP`、无需沿用 cover-left-anchor
 * 的私有常量保留处理——这里记录的是"核实过、确认不适用"，不是遗漏。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/academic.ts 的 colors。
 * 十六进制值本身不抄进本注释——避免污染本文件的 grep 清零门）：
 *   - `ctx.colors.primary`（content/ending 分支的 arc 填色）：源函数已直接
 *     消费，未烤死，原样保留——brief 现状表标注的"719 行 `ctx.colors.primary`
 *     直用，低风险"，核实成立。
 * 唯一的颜色字面量是 chapter 分支的白色 arc 填色，处理见下方"白字例外"。
 * **无孤儿色**。
 *
 * **Review fix round (P1 variety wave, task 2 — Moderate finding)**: the
 * chapter branch used to hard-code a pure-white arc fill — a deliberate
 * escape from "primary tinted arc on primary-solid background is a no-op
 * composite" (still true, and still the reason this branch can't just reuse
 * `ctx.colors.primary` the way content/ending do), but tuned only for
 * academic's own dark chapter background (`#006A4E`). Once
 * `motif-selection.ts` made this motif a candidate for other themes too
 * (`enterprise` — chapter bg `#FFFFFF`; `journal` — chapter bg `#FAF7F2`,
 * near-white), the hard-coded white arc became invisible white-on-(near-)
 * white — the same class of bug `motif-banner-motif.tsx`'s own chapter
 * branch had (see that file's own doc comment for the full story, including
 * why `motif-selection.ts`'s existing contrast sweep couldn't have caught
 * this: `<g data-decor>` shapes are structurally excluded from that walk's
 * background candidacy). Fixed the same way: `readableOn(ctx.defaultBg ??
 * ctx.colors.bg)` (`../ink.ts`) instead of a hard-coded literal, same 0.06
 * opacity either way. On academic's own dark chapter bg this still resolves
 * to exactly `#FFFFFF` (white beats `readableOn`'s other neutral ink,
 * near-black, by a wide margin there) — byte-identical to before this fix.
 *
 * **档位一・逐字节等价**（academic 自身渲染字节不变，其余全部消费
 * `ctx.colors.primary`，无孤儿色）。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量——唯一豁免是 `../ink.ts` 内部
 * 持有的两枚中性墨色常量，本文件自身不再持有任何 hex 字面量。
 */
const ARC_CX = 1280
const ARC_CY = 720
const ARC_R = 260
/**
 * A circle centered exactly on the page's bottom-right corner would only
 * ever show its top-left quarter (the rest clipped by the svg viewBox), with
 * no visual difference from drawing just that quarter directly. But
 * svg2pptx's ellipse conversion keeps the *full* circle's bounding box
 * (pptxgenjs has no shape-clipping concept), which would bleed ~260px past
 * both slide edges and trip render-slide.test.tsx's "no op past the slide
 * edge" check. Drawing just the visible quarter-disc directly — two straight
 * radii along the canvas edges plus the connecting arc (large-arc-flag=0,
 * sweep-flag=0, so the arc bulges toward the center of the page, not away
 * from it) — is pixel-identical to the full circle's visible portion while
 * keeping the shape's own bounding box exactly on-slide.
 */
const ARC_PATH = `M ${ARC_CX},${ARC_CY} L ${ARC_CX},${ARC_CY - ARC_R} A ${ARC_R},${ARC_R} 0 0,0 ${ARC_CX - ARC_R},${ARC_CY} Z`
// 构图变体（2026-07-10 装饰多样性推广）：b=左下角镜像、c=右上角。
const ARC_PATH_BL = `M 0,${ARC_CY} L 0,${ARC_CY - ARC_R} A ${ARC_R},${ARC_R} 0 0,1 ${ARC_R},${ARC_CY} Z`
const ARC_PATH_TR = `M ${ARC_CX},0 L ${ARC_CX},${ARC_R} A ${ARC_R},${ARC_R} 0 0,0 ${ARC_CX - ARC_R},0 Z`
function arcFor(variant: "a" | "b" | "c"): string {
  return variant === "b" ? ARC_PATH_BL : variant === "c" ? ARC_PATH_TR : ARC_PATH
}

export function RailMotif({ ir, slide, ctx }: DecorProps) {
  const variant = pickBySeed(cachedDeckSeed(ir), "rail-decor", ["a", "b", "c"] as const)
  // Cover's triangle lives in cover-left-anchor.tsx's body instead (see
  // that file's own doc comment).
  if (slide.type === "cover") return <></>
  if (slide.type === "chapter") {
    return <path d={arcFor(variant)} fill={readableOn(ctx.defaultBg ?? ctx.colors.bg)} opacity="0.06" />
  }
  return <path d={arcFor(variant)} fill={ctx.colors.primary} opacity="0.06" />
}
