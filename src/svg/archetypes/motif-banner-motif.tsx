// GF/svg/archetypes/motif-banner-motif.tsx
import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"
import { readableOn } from "../ink"

/**
 * banner-motif archetype（spec §3.2，Wave 3 Task 19）：cover/chapter ("强",
 * chapter mirrors cover, no separable cover-only bonus withheld) get a
 * faint grid-line texture — 5 verticals @ 256px spacing clipped to y
 * 100-620 so none cross the header/footer logo bands, 3 candidate
 * horizontals @ 240px spacing with the one landing inside the title band
 * (y 300-480) filtered out, leaving 2. content/ending ("弱", ending mirrors
 * content) render nothing — a former `colors.primary` accent bar was ruled
 * deleted outright (2026-07-08) rather than redesigned, see source file's
 * own history note. Extracted from templates/consulting.tsx 的
 * `MckinseyNavyDecor`（681-719 行，Step A 用 `sed -n '681,719p'` 摘录核实——
 * 比 brief 给出的 681-728 短，722-728 行是文件尾 `consultingTemplate` 导出
 * 对象，已按任务要求排除）。随迁 helper：`GRID_STROKE_OPACITY` /
 * `GRID_STROKE_OPACITY_CHAPTER` / `GRID_V_XS` / `GRID_V_Y1` / `GRID_V_Y2` /
 * `GRID_H_CANDIDATES`（源文件 672-679 行的模块级私有几何/透明度常量，只被
 * 本函数消费，随函数体一并复制为本文件私有常量，不建公共 util）。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/consulting.ts 的
 * colors。十六进制值本身不抄进本注释——避免污染本文件的 grep 清零门，同
 * cover-banner-title.tsx / content-banner-heading.tsx 先例）：
 *   - 对函数区间 681-719 行逐行核对，模块级烤死常量里只有 `DIVIDER` 被
 *     本函数消费（cover 分支的 grid 描边色）——`NAVY`/`YELLOW`/`MUTED` 零
 *     命中，同 content-banner-heading.tsx 的发现一致（同一源文件不同函数
 *     消费的烤死常量集合不同，需逐函数实测，不能凭文件头统一替换表）。
 *   - `DIVIDER` 逐十六进制核对 consulting 的 `colors.border` 字段，精确
 *     匹配 → 映射为 `ctx.colors.border ?? ctx.colors.muted`（`border` 是
 *     `StyleColors` 里的可选字段，`?? muted` 的兜底写法与
 *     cover-banner-title.tsx / motif-corner-ornament-motif.tsx 先例一致，
 *     纯为类型层面兜底——consulting 自己的 token 表里 `border` 始终有值）。
 *   - chapter 分支的 grid 描边色是纯白字面量，处理见下方"白字例外"，
 *     不进替换表。
 * 结论：**无孤儿色**（唯一被消费的烤死常量 `DIVIDER` 有精确 token 匹配）。
 *
 * **Review fix round (P1 variety wave, task 2 — Moderate finding)**: the
 * chapter branch used to hard-code a pure-white grid stroke, tuned for
 * consulting's own dark chapter background (`#051C2C`) — safe as long as
 * this motif only ever rendered on its own anchor theme. Once
 * `motif-selection.ts` made this motif a *candidate* for other themes too
 * (`enterprise`, whose chapter background is `#FFFFFF`), the hard-coded
 * white grid became invisible white-on-white — contradicting
 * `motif-selection.ts`'s own contrast-safety claim (that claim only ever
 * covered `findContrastIssues`' text/background walk, which structurally
 * excludes every `<g data-decor>` shape from candidacy — see that file's
 * "Contrast safety" section — so it never caught a decor shape rendering
 * invisibly against its *own* background; it only ever proved decor never
 * makes *other* text unreadable). Fixed by deriving the ink from the actual
 * background instead of a hard-coded literal: `readableOn(ctx.defaultBg ??
 * ctx.colors.bg)` (`../ink.ts`) — the same two-ink, real-contrast-measured
 * chooser the archetype-side contrast fix round already uses for exactly
 * this "self-painted surface, adaptive ink" problem, applied here to a
 * decorative line instead of body text. Kept at the same low opacity
 * (`GRID_STROKE_OPACITY_CHAPTER`) either way — a low-opacity blend of
 * *either* neutral ink against its own background is a small, deliberately
 * subtle, but always nonzero luminance delta, on any background. On
 * consulting's own dark chapter bg this resolves to exactly `#FFFFFF` —
 * `readableOn` picks the higher-contrast of its two fixed neutral inks, and
 * white beats near-black by a wide margin there — so the anchor theme's own
 * render is byte-identical to before this fix.
 *
 * **档位一・逐字节等价**（consulting 自身渲染字节不变，唯一烤死颜色常量
 * `DIVIDER` 有精确 token 匹配）。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量——唯一豁免是 `../ink.ts` 内部
 * 持有的两枚中性墨色常量，本文件自身不再持有任何 hex 字面量。
 */
const GRID_STROKE_OPACITY = 0.25
const GRID_STROKE_OPACITY_CHAPTER = 0.05
const GRID_V_XS = [128, 384, 640, 896, 1152]
// 构图变体（2026-07-10 装饰多样性推广）：b=稀疏三线、c=右移半格。
const GRID_V_XS_SPARSE = [256, 640, 1024]
const GRID_V_XS_SHIFTED = [192, 448, 704, 960, 1216]
function gridXsFor(variant: "a" | "b" | "c"): number[] {
  return variant === "b" ? GRID_V_XS_SPARSE : variant === "c" ? GRID_V_XS_SHIFTED : GRID_V_XS
}
const GRID_V_Y1 = 100
const GRID_V_Y2 = 620
// Candidates only — the one landing inside the title band (y 300-480) is
// filtered out below, leaving 120 and 600.
const GRID_H_CANDIDATES = [120, 360, 600]

export function BannerMotif({ ir, slide, ctx }: DecorProps) {
  const variant = pickBySeed(cachedDeckSeed(ir), "banner-decor", ["a", "b", "c"] as const)
  if (slide.type === "cover" || slide.type === "chapter") {
    const isChapter = slide.type === "chapter"
    const gridStroke = isChapter
      ? readableOn(ctx.defaultBg ?? ctx.colors.bg)
      : (ctx.colors.border ?? ctx.colors.muted)
    const gridOpacity = isChapter
      ? GRID_STROKE_OPACITY_CHAPTER
      : GRID_STROKE_OPACITY
    return (
      <>
        {gridXsFor(variant).map((x) => (
          <line
            key={`v${x}`}
            x1={x}
            y1={GRID_V_Y1}
            x2={x}
            y2={GRID_V_Y2}
            stroke={gridStroke}
            strokeWidth="1"
            strokeOpacity={gridOpacity}
          />
        ))}
        {GRID_H_CANDIDATES.filter((y) => y < 300 || y > 480).map((y) => (
          <line
            key={`h${y}`}
            x1="0"
            y1={y}
            x2="1280"
            y2={y}
            stroke={gridStroke}
            strokeWidth="1"
            strokeOpacity={gridOpacity}
          />
        ))}
      </>
    )
  }
  // content/ending：无装饰（源主题 2026-07-08 用户裁决删除 accent band）。
  return null
}
