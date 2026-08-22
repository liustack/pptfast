import { PACING_BUDGETS } from "@/narrative"
import type { DecorProps } from "./types"
import { DecorPiece } from "./decor-piece"
import { leafRecessOpacity } from "./decor-budget"

/**
 * crayon-motif —— 「蜡笔描边」（2026-08-21 低龄教育主题。顶饰同日定稿换成
 * 蜡笔涂边 + 太阳涂鸦，设计源画布 `EdgeShading.dc.html` 与
 * `SunDoodle.dc.html`，几何坐标逐条抄录）。
 *
 * 一盒蜡笔画在卡纸上。heavy 的量全部堆在页缘带，不进场内。三件东西，位置
 * 写死，不读内容、不随 seed 变：
 *   - **顶缘蜡笔涂边**：页顶 y0-14 的 primary 蓝填充多边形，下缘手涂不齐。
 *     板上公式 `12 + 3.5*sin(x/97) + 2.5*sin(x/41) + 2`，每 40px 采样，y
 *     钉到 1 位小数，写成模块级常量 {@link EDGE_POINTS}（输入零随机、两次
 *     渲染逐字节同）。opacity 0.9，叶子自带。其上 5 道 bg 色斜向留白划痕：
 *     x140 起每 260px 一道，(x, 1.5) → (x+26, 13)，宽 2.2、opacity 0.55。
 *   - **右上太阳涂鸦**：圆心 (1188,27)。主圈 r12 描边 3.2 走 accent，底下
 *     错位 (1189.5,28.5) r12 描边 2.6 opacity 0.35 的回笔圈，芯 r5.5 填
 *     向日黄（chartPalette[3]）。8 根光芒从 r18 到 r27、起始角偏 0.18rad、
 *     宽 3 圆头 accent。模块级常量生成，零随机。
 *   - **底带彩虹短划**：y644，x 从 96 起 24 段，每段 `x1=96+i*46 → x2=x1+26`，
 *     strokeWidth 5，圆头 linecap，四色轮换 `chartPalette`。板上止于
 *     x≈1180。第五保护带（`docs/designing-themes.md` 第 5 条 y620-664）
 *     落地后走减淡档 {@link DASH_OPACITY}（0.3）：几何一字不改，每根
 *     `<line>` 叶子自带 opacity（导出侧 `svg2pptx` 只读叶子属性，挂 `<g>`
 *     会丢）。准入是正文墨压在「四色划各自叠在 bg 上的合成色」上四格都
 *     ≥4.5:1，`motif-crayon-motif.test.tsx` 用 `contrastRatio` 锁死。
 *     cover 仍撤底带，减淡也是删除线观感。
 *     左下星贴纸（板上 `M56,628`）已整族退役：画廊审查把所有页型的这颗
 *     星都判成多余贴纸。
 *
 * ## 偏离设计板：末两段彩虹划让开右下 logo 盒
 *
 * 板上 24 段划到 x1180，其中 i=22、i=23 的墨迹（含圆头半宽 2.5px）横穿
 * `branding.tsx` 的右下 logo 盒 (1120,630,96×40)——正是
 * `docs/designing-themes.md` 第 5 条五个保护区里的右下 logo 盒。campaign
 * 的底带纸屑整条退役是同一条先例。这里少画末两段、前 22 段坐标一字不改，
 * 24 段的节奏和四色轮换都还在，只是右缘在 logo 盒左沿停住。
 *
 * ## heavy 档降档：判据只钉 IR 结构层
 *
 * 定稿密页形态：太阳撤场，涂边与淡彩虹划留下。对应旧规则里「贴纸撤场」
 * 的位置。判据是这一页的组件数量（{@link HALF_FIELD_COMPONENTS}），一个纯
 * IR 结构量，`slide.components.length` 一个属性读到底。不是 campaign 那种
 * 「满场 120 枚砍成顶带 60 枚」的一半点数，是「页缘两带还在、贴上去的零件
 * 撤掉」。
 *
 * **不许读渲染后的文字几何**（标题占几行、正文缩到几号字、有没有溢出）。
 * 理由与 `motif-campaign-motif.tsx` 同一段：motif 画在正文之前，读测量缓存
 * 会让两次渲染拿到不同的值；文字几何随字体解析变，预览端与导出端会画出
 * 两张图。两条都违反「同 IR 同 seed 两次渲染必须逐字节同」。
 *
 * chapter 完全退让（`return null`）：crayon 的 chapter 默认底色是整版
 * primary 蜡笔蓝（`themes/crayon.ts` 的 `defaultBackgrounds.chapter`），
 * 涂边走 primary（蓝压蓝，看不见），太阳压在八个 chapter layout 的巨幅居中
 * 标题活动范围上。两件失效、一件抢戏，chapter 不画。
 *
 * ## 偏离设计板：cover 撤底带（彩虹划）且太阳让位
 *
 * crayon 声明的封面构造之一 `tone-adaptive-header` 在无背景图模式下把
 * 作者行画在 x64 y650 基线、日期行右对齐 y650（`cover-tone-adaptive-header
 * .tsx`），墨迹带约 y624-656——正是第 5 条新增的 y620-664 第五保护带。
 * 彩虹划的墨迹 y641.5-646.5 正好横穿这行字（structure-map 点名的
 * 「tone-adaptive 底槽撞位」，五案里第四案）。
 * 减淡档把划退到底色级，但 meta 行横贯全宽，淡划仍是删除线观感，所以
 * cover 继续撤底带。motif 不许感知当页选中的 layout（terra 板的确定性
 * 红线），所以照 terra「chapter 整页退让」的同一模式按页型处理：cover
 * 撤底带。板上封面样例的 meta 行画在彩虹划上方，与仓库 layout 的实际
 * 坐标不符，以仓库为准。
 *
 * 涂边 y0-14（最深采样 y18.9）压不到 tone-adaptive-header 顶部 org 标签
 * （x64 y74 基线、字号 22，可视顶约 y52，中间空 33px）。banner-title 的
 * org 圆点标在 translate(96,136)，更低。
 *
 * 太阳外缘约 x1160-1216、y0-55。标题区 (96,48,1040×122) 右沿是 x1136，
 * 太阳在其右侧外（空隙约 24px）。banner-title 密级徽标在 (1058,100,126×48)，
 * 顶沿 y100 在太阳下缘 y55 之下，不撞。tone-adaptive-header 密级徽标在
 * (1086,50,130×44)，顶沿 y50 与太阳两根下光芒（y49.2 / y53.6，线宽 3）
 * 相交。motif 不许感知当页选中的 layout，按页型整颗太阳撤场：cover 不画
 * 太阳。banner-title 本不撞，同一条页型规则一并让出。
 *
 * 纪律：零 theme id、零 hex。涂边走 primary，划痕走 bg，太阳圈与光芒走
 * accent，芯走 chartPalette[3]，彩虹划走 chartPalette
 * （`chartPaletteOffset` 是 ctx 上的独立字段、不改 `colors.chartPalette`
 * 本身，`motif-chart-palette-isolation.test.tsx` 钉着这条）。画笔属性一律
 * 写在叶子上不挂 `<g>`——导出侧 `svg2pptx/dispatch.ts` 的 `leafToOp` 只读
 * 叶子自己的 `fill`/`stroke`/`opacity`，挂在组上预览看得见、导出全丢。
 *
 * 红线：任何形态的粗平左竖条禁止出现。
 *
 * 可拉伸性：四色蜡笔即参数。向日黄永不承字（token 角色注释里写死）。
 */

// ── 顶缘蜡笔涂边 ────────────────────────────────────────────────────────
/** 板上公式 `12 + 3.5*sin(x/97) + 2.5*sin(x/41) + 2`，y 钉到 1 位小数。 */
function edgeY(x: number): string {
  return (12 + 3.5 * Math.sin(x / 97) + 2.5 * Math.sin(x / 41) + 2).toFixed(1)
}

const EDGE_SAMPLES: string[] = []
for (let x = 1280; x >= 0; x -= 40) {
  EDGE_SAMPLES.push(`${x},${edgeY(x)}`)
}

/** 模块级一次生成。输入零随机，两次渲染逐字节同。 */
const EDGE_POINTS = `0,0 1280,0 ${EDGE_SAMPLES.join(" ")}`
const EDGE_OPACITY = 0.9

const SCRATCH_XS = [140, 400, 660, 920, 1180] as const
const SCRATCH_Y1 = 1.5
const SCRATCH_Y2 = 13
const SCRATCH_DX = 26
const SCRATCH_STROKE = 2.2
const SCRATCH_OPACITY = 0.55

// ── 右上太阳涂鸦 ────────────────────────────────────────────────────────
const SUN_CX = 1188
const SUN_CY = 27
const SUN_R = 12
const SUN_STROKE = 3.2
const SUN_GHOST_CX = 1189.5
const SUN_GHOST_CY = 28.5
const SUN_GHOST_STROKE = 2.6
const SUN_GHOST_OPACITY = 0.35
const SUN_CORE_R = 5.5
const SUN_RAY_INNER = 18
const SUN_RAY_OUTER = 27
const SUN_RAY_START = 0.18
const SUN_RAY_STROKE = 3

function round1(n: number): number {
  return Number(n.toFixed(1))
}

const SUN_RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = SUN_RAY_START + (i * Math.PI) / 4
  return {
    x1: round1(SUN_CX + SUN_RAY_INNER * Math.cos(a)),
    y1: round1(SUN_CY + SUN_RAY_INNER * Math.sin(a)),
    x2: round1(SUN_CX + SUN_RAY_OUTER * Math.cos(a)),
    y2: round1(SUN_CY + SUN_RAY_OUTER * Math.sin(a)),
  }
})

// ── 底带彩虹短划 ────────────────────────────────────────────────────────
const DASH_Y = 644
const DASH_X0 = 96
const DASH_STEP = 46
const DASH_LEN = 26
const DASH_STROKE = 5
/**
 * 第五保护带减淡档。几何一字不改，只把 5px 实色划退到底色级。
 * 准入：正文墨压在四色划叠 bg 的合成色上四格都 ≥4.5:1，见
 * `motif-crayon-motif.test.tsx`。
 */
const DASH_OPACITY = 0.3
/** 板上的段数。末两段让开右下 logo 盒，实际落笔见 {@link dashDrawn}。 */
const DASH_COUNT = 24

const LOGO_BR = { x: 1120, y: 630, w: 96, h: 40 } as const

function dashInk(i: number): { x0: number; y0: number; x1: number; y1: number } {
  const x1 = DASH_X0 + i * DASH_STEP
  const x2 = x1 + DASH_LEN
  const half = DASH_STROKE / 2
  return { x0: x1 - half, y0: DASH_Y - half, x1: x2 + half, y1: DASH_Y + half }
}

function dashDrawn(i: number): boolean {
  const b = dashInk(i)
  return !(b.x0 < LOGO_BR.x + LOGO_BR.w && b.x1 > LOGO_BR.x && b.y0 < LOGO_BR.y + LOGO_BR.h && b.y1 > LOGO_BR.y)
}

const DASHES = Array.from({ length: DASH_COUNT }, (_, i) => i).filter(dashDrawn)

/** 密页实际落笔的彩虹划段数（满场让开 logo 后的条数，降档不减这段）。 */
export const CRAYON_DASH_DRAWN = DASHES.length

/**
 * 半场降档判据：一页的组件数到这个数就撤太阳。取
 * `PACING_BUDGETS.dense.maxComponentsPerSlide`——全仓自己的「最密一档每页
 * 块数上限」，不另造一个魔数。到了这个数，页面已经是内容说了算的一页，
 * 装饰把贴上去的零件让出来。
 */
const HALF_FIELD_COMPONENTS = PACING_BUDGETS.dense.maxComponentsPerSlide

export function CrayonMotif({ slide, ctx }: DecorProps) {
  // chapter 是整版 primary 蜡笔蓝底，涂边消失、太阳与巨幅标题抢面
  // （见文件头）。
  if (slide.type === "chapter") return null

  const palette = ctx.colors.chartPalette
  const blue = ctx.colors.primary
  const orange = ctx.colors.accent
  const paper = ctx.colors.bg
  const ground = ctx.defaultBg ?? ctx.colors.bg
  const fade = (ink: string, preferred?: number) => leafRecessOpacity(slide.type, ink, ground, preferred)
  // 半场降档：判据只读 IR 结构层的组件数量，绝不读渲染后的文字几何。
  const halfField = slide.components.length >= HALF_FIELD_COMPONENTS
  // cover 撤底带：tone-adaptive-header 封面的作者/日期行画在 y624-656，
  // 彩虹划会横穿它（见文件头「cover 撤底带」一节）。
  const bottomBand = slide.type !== "cover"
  // cover 太阳让位：tone-adaptive-header 密级徽标与太阳下光芒相交
  // （见文件头）。motif 不感知 layout，按页型整颗撤场。
  const sun = slide.type !== "cover" && !halfField

  return (
    <>
      <DecorPiece id="edge">
        <polygon points={EDGE_POINTS} fill={blue} opacity={fade(blue, EDGE_OPACITY)} />
        {SCRATCH_XS.map((x) => (
          <line
            key={x}
            x1={x}
            y1={SCRATCH_Y1}
            x2={x + SCRATCH_DX}
            y2={SCRATCH_Y2}
            stroke={paper}
            strokeWidth={SCRATCH_STROKE}
            opacity={fade(paper, SCRATCH_OPACITY)}
          />
        ))}
      </DecorPiece>
      {sun && (
        <DecorPiece id="sun">
          <circle
            cx={SUN_GHOST_CX}
            cy={SUN_GHOST_CY}
            r={SUN_R}
            fill="none"
            stroke={orange}
            strokeWidth={SUN_GHOST_STROKE}
            opacity={fade(orange, SUN_GHOST_OPACITY)}
          />
          <circle
            cx={SUN_CX}
            cy={SUN_CY}
            r={SUN_R}
            fill="none"
            stroke={orange}
            strokeWidth={SUN_STROKE}
            opacity={fade(orange)}
          />
          <circle cx={SUN_CX} cy={SUN_CY} r={SUN_CORE_R} fill={palette[3]} opacity={fade(palette[3]!)} />
          {SUN_RAYS.map((r) => (
            <line
              key={`${r.x1},${r.y1}`}
              x1={r.x1}
              y1={r.y1}
              x2={r.x2}
              y2={r.y2}
              stroke={orange}
              strokeWidth={SUN_RAY_STROKE}
              strokeLinecap="round"
              opacity={fade(orange)}
            />
          ))}
        </DecorPiece>
      )}
      {bottomBand && (
        <DecorPiece id="dashes">
          {DASHES.map((i) => (
            <line
              key={i}
              x1={DASH_X0 + i * DASH_STEP}
              y1={DASH_Y}
              x2={DASH_X0 + i * DASH_STEP + DASH_LEN}
              y2={DASH_Y}
              stroke={palette[i % 4]}
              strokeWidth={DASH_STROKE}
              strokeLinecap="round"
              opacity={fade(palette[i % 4]!, DASH_OPACITY)}
            />
          ))}
        </DecorPiece>
      )}
    </>
  )
}
