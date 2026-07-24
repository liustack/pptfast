// GF/svg/archetypes/motif-tone-adaptive-motif.tsx
import type { DecorProps } from "./types"

/**
 * tone-adaptive-motif archetype（spec §3.2，Wave 3 Task 21）：全页极淡的
 * 180° 竖直渐变场（`colors.bg` → 一个固定的"轻度混黑"灰阶），充当所有
 * slide.type 共用的默认底色纹理，代替 background.tsx 那块纯色矩形之上的一层
 * 微妙层次（background.tsx 仍照常画自己的纯色矩形，本渐变场在 FullSlideSvg
 * 的 decor 插槽里画在它之上，完全覆盖，故不需要改 background.tsx）。当 slide
 * 携带任何显式背景覆盖（`hasExplicitBackground`——比 `hasBgImage` 更宽，
 * asset/color/gradient 三种都算）时整体跳过渲染（返回 `<></>`），避免遮住
 * 那个已经画出来的真实背景。自 templates/custom.tsx 的 `CustomDecor`
 * （785-798 行，Step A 用 `grep -n` 实测边界——比 brief 给出的 785-807
 * EOF 短，799-808 行是空行 + eslint-disable 注释 + 文件尾 `customTemplate`
 * 导出对象，已按任务要求排除，不属于本函数体）提炼，随迁其依赖的
 * `hasExplicitBackground`（57-65 行，Step A 实测边界——比 brief 给出的
 * 57-67 短，66 行是空行、67 行是下一节 Cover 的头注释，不属于本函数）与
 * 后者内部消费的 `hasBgImage`（36-44 行，私有复制，签名/实现原样不变，同
 * 三个已提炼的 custom 兄弟页型先例）——两个 helper 都私有复制进本文件，不
 * 建公共 util。
 *
 * `BG_MIXED_6PCT_BLACK` 归属核实（brief 点名的孤儿色候选，W2-16 已定位、
 * 留给本任务处理——见 ending-tone-adaptive-ending.tsx 文件头"该常量不在
 * ending 提炼范围内"的记录。十六进制值本身不抄进本节——避免污染下面的
 * grep 清零门，同本文件其余各节约定一致）：源文件模块级私有常量
 * `BG_MIXED_6PCT_BLACK`（templates/custom.tsx 第 783 行，注释写明是
 * "colors.bg 与 6% 黑混合"的固定计算结果，`applyOverride` 从不触碰
 * `bg`，故这是个算好的常量而非运行时计算）逐十六进制核对
 * themes/custom.ts 的 `colors`（bg/surface/panel/primary/accent/
 * text/muted/border/cardStroke 全字段）：**无精确匹配**——`surface`/
 * `panel` 是与之最接近的字段，但数值不同（逐字符核对不相等）。按 W1-1
 * 裁决的归属框架二选一：
 *   ①「渐变/混合底色装饰性 → 私有常量保留」vs.
 *   ②「同角色近似 → 并入 surface/border 语义更贴的」。
 * 判定为①：该常量的语义是"把 `colors.bg` 按固定比例掺黑得到的渐变终点"——
 * 定义上就绑定 `colors.bg`（渐变起点已经是活的 `ctx.colors.bg`），不是
 * `surface`/`panel`（卡片实色背景语义）或 `border`（描边语义）里任何一个
 * 字段本来的角色。比照 cover-left-anchor.tsx 对 academic `TRIANGLE_DEEP`
 * 的处理先例（同属"和某 token 同色系但更深/更暗一档的纯装饰计算值，语义上
 * 不对应任何字段"），原样保留为本文件私有装饰常量，不做 token 映射，也不
 * 改写成读取 `colors.surface`（若真的换成 `colors.surface`，在其他主题的
 * `bg` 不是白色时，这个"渐变终点"会失去它"由 bg 掺黑得来"的原始设计含义，
 * 变成一个跟 bg 脱钩的随意色块，属于观感被改写而非等价迁移）。
 *
 * **档位二・观感等价**（因 `BG_MIXED_6PCT_BLACK` 是孤儿色，未并入任何 token
 * 字段——渐变起点 `ctx.colors.bg` 本身仍是活的 token 引用，唯一的烤死值是
 * 渐变终点，已按上述决策原样保留并测试锁死"装饰未隐形"）。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量——唯一豁免是上面点名并测试锁死
 * 的 `BG_MIXED_6PCT_BLACK` 私有装饰常量，grep 清零门预期恰好命中这一处
 * （该常量的十六进制值本身不抄进本注释——避免污染下面的 grep 清零门）。渐变
 * def 的 id 字符串原样保留源文件的 `decor-custom-field`（同 poster-motif.tsx
 * 保留 `decor-creative-glow` 的先例：纯几何/id 值，不是颜色字面量，字符串里
 * 嵌了主题名子串，但不是 grep 清零门检测的、独立加双引号包裹的那种精确匹配，
 * 不构成违规——若改名，会破坏与旧 `CustomDecor` 的逐字节 `toBe` 断言，得不
 * 偿失）。
 */

/** Check whether the slide has a valid background image asset. Ported
 * verbatim from templates/custom.tsx（36-44 行），私有复制，签名/实现不变。*/
function hasBgImage(
  ir: DecorProps["ir"],
  slide: DecorProps["slide"],
): boolean {
  if (slide.background?.kind !== "asset") return false
  const assetId = slide.background.asset_id
  const asset = ir.assets.images[assetId]
  return !!(asset?.src && !asset.error)
}

/** Whether the slide carries an explicit background override of *any* kind
 * — broader than `hasBgImage` above (asset/color/gradient all count here,
 * `hasBgImage` is asset-only). Ported verbatim from templates/custom.tsx
 * （57-65 行），私有复制，签名/实现不变。*/
function hasExplicitBackground(
  ir: DecorProps["ir"],
  slide: DecorProps["slide"],
): boolean {
  const bg = slide.background
  if (!bg) return false
  if (bg.kind === "asset") return hasBgImage(ir, slide)
  return true
}

const GRADIENT_FIELD_ID = "decor-custom-field"

// Decoration-only swatch (see file header's "`BG_MIXED_6PCT_BLACK` 归属核实"):
// `colors.bg` mixed with a fixed 6% black, computed once (255 * 0.94 ≈ 240 =
// 0xF0 per channel). Deliberately NOT mapped to any `ctx.colors` field — no
// token represents "bg but darker", and switching to `colors.surface` would
// sever this value's "derived from bg" design intent for themes whose `bg`
// isn't white. Ported verbatim from templates/custom.tsx (this literal is
// the file's one intentional, test-locked grep-gate exemption).
const BG_MIXED_6PCT_BLACK = "#F0F0F0"

export function ToneAdaptiveMotif({ ir, slide, ctx }: DecorProps) {
  if (hasExplicitBackground(ir, slide)) return <></>
  return (
    <>
      <defs>
        <linearGradient id={GRADIENT_FIELD_ID} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ctx.colors.bg} />
          <stop offset="100%" stopColor={BG_MIXED_6PCT_BLACK} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1280" height="720" fill={`url(#${GRADIENT_FIELD_ID})`} />
    </>
  )
}
