// GF/svg/archetypes/motif-constellation-motif.tsx
import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"

/**
 * constellation-motif archetype（spec §3.2，Wave 3 Task 22，motif 段收尾）：
 * 全页 135° 对角深空渐变场，充当所有 slide.type 共用的默认底色纹理（同其余
 * 5 个已提炼 motif 的"渐变场 + hasExplicitBackground 跳过"骨架），Ending
 * 页型额外叠加一个小号 3 点星座签名 motif（Cover 自己的 9 点大星座画在
 * Cover 页型自己的函数体内，已在 Wave 1 Task 提炼为 `cover-constellation.tsx`，
 * 与本 Decor 无关，详见下方"关联但不随迁"一节）。自 templates/tech.tsx 的
 * `BentoTechDecor`
 * （1418-1459 行，Step A 用 `grep -n` 实测边界——与 brief 给出的 1418-1467
 * EOF 不同：1461 行起是空行 + eslint-disable 注释 + 文件尾 `TECH_TEMPLATES`
 * 导出对象，已按任务要求排除，不属于本函数体）提炼，随迁其依赖的
 * `hasExplicitBackground`（1405-1416 行，Step A 实测边界，私有复制，签名/
 * 实现原样不变，同 poster-motif.tsx / tone-adaptive-motif.tsx 等已提炼
 * motif 先例）与两个模块级私有常量：`GRADIENT_FIELD_ID`（1366 行，渐变 def
 * 的 id 字符串）、`ENDING_MOTIF_POINTS`（1389-1393 行，Ending 专属 3 点星座
 * 坐标几何，IR 无关的纯常量）。
 *
 * 关联但不随迁：源文件另有 `COVER_MOTIF_POINTS`/`COVER_MOTIF_HERO_POINT`
 * （687-700 行）与三个不透明度/描边宽度常量，那些是 `BentoTechCover`（Cover
 * 页型的函数体，非 Decor）消费的星座几何——已在 Wave 1 Task 提炼
 * `cover-constellation.tsx` 时随迁为该文件私有常量（同名常量各自私有复制，
 * 两份拷贝不共享、不冲突，同 chapter-constellation-chapter.tsx 与本文件互不
 * 依赖的既有模式）。本文件与 `cover-constellation.tsx`/
 * `chapter-constellation-chapter.tsx` 均不互相 import——三者都不 import
 * `../templates/tech`。
 *
 * 替换表（Step B）：Step A 对 1405-1459 行区间执行 Global Constraints 第 4
 * 条给出的 hex/主题 id 字符串扫描——命中 4 处，全部落在渐变 stop 的两个颜色
 * 字面量上（两个 stop 色各命中 2 次：一次在 1429-1430 行的行内注释引用，
 * 一次在 1432/1433 行的实际 `stopColor` 属性值——十六进制值本身不抄进
 * 本注释，避免污染本文件的 grep 清零门）。逐十六进制核对
 * `themes/tech.ts` 的 `colors` 全字段（bg/surface/primary/accent/text/
 * muted/border/chartPalette）：**均无精确匹配**——两个 stop 色都比
 * `colors.bg`（tech 自己的背景色）更深，是"渐变场"这一装饰性视觉效果的一部分，
 * 不对应 token 表里任何一个字段本来的角色（不是背景色本身，也不是描边/
 * 表面色）。
 *
 * 孤儿色归属裁决（按 brief 与 W1-1 归属框架，YAGNI——不新增 token 字段）：
 * 该渐变的语义是"给全页画一个固定深浅的深空对角渐变场"，两个端点色是绑定这
 * 个渐变效果本身的设计常量，不是"某个 token 字段的近似值"（比照
 * motif-tone-adaptive-motif.tsx 对 `BG_MIXED_6PCT_BLACK` 的同一归属框架
 * ①「渐变/混合底色装饰性 → 私有常量保留」，而非框架②「同角色近似 → 并入
 * surface/border」——这里甚至没有"同角色"的候选字段可并，两个 stop 色互相
 * 独立、都不是从 `ctx.colors` 某个值派生的，原样保留为本文件私有装饰常量最
 * 忠实于原设计意图）。若为这两个 stop 色新增专属 token 字段，只服务这一处
 * 渐变装饰、无其他消费点，成本明显高于保留私有常量——不新增。
 *
 * **档位：Content 段（已随本任务提炼进 `content-bento-panel.tsx`）是档位
 * 一・逐字节等价（tech 是零烤色主题）；本 Decor 段因两个渐变孤儿色降级为
 * 档位二・观感等价**——断言退化为：跨 slide.type 装饰几何存在（渐变 def +
 * 满页 rect + Ending 的星座 polyline/circle）、孤儿色原样出现（装饰未隐形，
 * 而非被误删）、换一个"他主题" tokens 渲染时 `hasExplicitBackground` 逻辑与
 * `ctx.colors.accent`（Ending 星座颜色，真正 token 化）随主题切换，孤儿渐变
 * 色跨主题保持不变（未被并入任何字段）。
 *
 * 纪律：本文件禁 theme id 字符串字面量——唯一豁免是上面点名并测试锁死的两个
 * 渐变 stop 私有装饰常量，grep 清零门预期恰好命中这两处（十六进制值本身不抄
 * 进本注释）。渐变 def 的 id 字符串原样保留源文件的 `decor-tech-field`（同
 * poster-motif.tsx 保留 `decor-creative-glow`、tone-adaptive-motif.tsx 保留
 * `decor-custom-field` 的先例：纯几何/id 值，不是颜色字面量，字符串里嵌了
 * 主题名子串但不是 grep 清零门检测的、独立加双引号包裹的那种精确匹配，不
 * 构成违规——若改名会破坏与旧 `BentoTechDecor` 的逐字节 `toBe` 断言，得不
 * 偿失）。
 */

/** Mirrors templates/custom.tsx's own `hasExplicitBackground` (same check)
 * — this theme's decor is the only other theme-decor that needs to know
 * whether the slide carries an explicit background override, to skip the
 * full-bleed decor gradient that would otherwise hide it. Any
 * override kind counts, not just `asset`: `color`/`gradient` are
 * schema-validated hex values that always render successfully in
 * background.tsx, so presence alone is enough; `asset` still requires
 * resolving to a loadable image — an errored/missing asset falls back to
 * background.tsx's own dark placeholder rect, which isn't a meaningful
 * override worth protecting from decor. Ported verbatim from
 * templates/tech.tsx（1405-1416 行），私有复制，签名/实现不变. */
function hasExplicitBackground(
  ir: DecorProps["ir"],
  slide: DecorProps["slide"]
): boolean {
  const bg = slide.background
  if (!bg) return false
  if (bg.kind === "asset") {
    const asset = ir.assets.images[bg.asset_id]
    return !!(asset?.src && !asset.error)
  }
  return true
}

const GRADIENT_FIELD_ID = "decor-tech-field"

/**
 * Ending's small signature motif — 3 fixed points, all y >= 108 (clear of
 * BrandChrome's tr logo band at `y:48-88`). Uniform r=3 and a fainter line
 * (opacity 0.25) — deliberately quieter than Cover's own (larger) motif
 * since Ending still carries a heading/meta stack, not a mostly-empty hero
 * layout. Content dropped this motif outright (its top-right corner
 * collided with a long content-page title's reachable area — see the source
 * file's own historical S3d note); only Ending still shows it. Ported
 * verbatim from templates/tech.tsx（1389-1393 行）.
 */
const ENDING_MOTIF_POINTS = [
  { x: 1080, y: 108 },
  { x: 1140, y: 140 },
  { x: 1196, y: 118 },
]
// 构图变体（2026-07-10 装饰多样性推广）：b=四点 W 形、c=左上三点。
const ENDING_MOTIF_POINTS_B = [
  { x: 1052, y: 132 },
  { x: 1104, y: 100 },
  { x: 1156, y: 136 },
  { x: 1208, y: 104 },
]
const ENDING_MOTIF_POINTS_C = [
  { x: 96, y: 120 },
  { x: 152, y: 96 },
  { x: 204, y: 132 },
]
function endingPointsFor(variant: "a" | "b" | "c") {
  return variant === "b" ? ENDING_MOTIF_POINTS_B : variant === "c" ? ENDING_MOTIF_POINTS_C : ENDING_MOTIF_POINTS
}

// Decoration-only gradient stops (see file header's "孤儿色归属裁决"):
// a fixed dark diagonal field, deliberately darker than `colors.bg` in every
// direction — not derived from any `ctx.colors` field. Deliberately NOT
// mapped to any token — no field represents "bg but as a fixed dark diagonal
// gradient", and there is no natural token candidate to merge into (unlike
// motif-tone-adaptive-motif.tsx's `BG_MIXED_6PCT_BLACK`, which at least
// shares `colors.bg` as its gradient *start*, this gradient's both stops are
// independent literals). Ported verbatim from templates/tech.tsx (this pair
// of literals is the file's one intentional, test-locked grep-gate
// exemption).
const GRADIENT_STOP_START = "#04070E"
const GRADIENT_STOP_END = "#0A1220"

export function ConstellationMotif({ ir, slide, ctx }: DecorProps) {
  const variant = pickBySeed(cachedDeckSeed(ir), "constellation-decor", ["a", "b", "c"] as const)
  const endingPoints = endingPointsFor(variant)
  const withBg = hasExplicitBackground(ir, slide)
  if (withBg) return <></>

  // S3d: content no longer shows this motif — only Ending does now.
  const showEndingMotif = slide.type === "ending"

  return (
    <>
      <defs>
        <linearGradient id={GRADIENT_FIELD_ID} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={GRADIENT_STOP_START} />
          <stop offset="100%" stopColor={GRADIENT_STOP_END} />
        </linearGradient>
      </defs>
      <rect
        x="0"
        y="0"
        width="1280"
        height="720"
        fill={`url(#${GRADIENT_FIELD_ID})`}
      />
      {showEndingMotif && (
        <>
          <polyline
            points={endingPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={ctx.colors.accent}
            strokeWidth="1"
            strokeOpacity="0.25"
          />
          {endingPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3" fill={ctx.colors.accent} />
          ))}
        </>
      )}
    </>
  )
}
