import { PACING_BUDGETS } from "@/narrative"
import type { DecorProps } from "./types"

/**
 * crayon-motif —— 「蜡笔描边」（2026-08-21 低龄教育主题，设计源
 * `design-project/skin-boards.html` 的 crayon 板，几何坐标逐条抄录）。
 *
 * 一盒蜡笔画在卡纸上。heavy 的量全部堆在页缘带，不进场内。四件东西，位置
 * 写死，不读内容、不随 seed 变：
 *   - **顶缘手绘波浪蜡笔线**：`M48,26` 起 14 段二次贝塞尔，控制点偏置
 *     {@link WAVE_AMP}（板上 `q40,±10`）。二次曲线的实际振幅是偏置的一半
 *     （y26±5），加上 3px 线宽后墨迹大约 y19.5-32.5，正是板上写的
 *     「y26±6」。蜡笔蓝（primary），横贯到 x1168。振幅是参数。
 *   - **顶带右侧三枚圆贴纸**：`(1150,28)` / `(1188,28)` / `(1226,28)`，
 *     r11，黄 / 绿 / 橘红（`chartPalette[3,2,1]`）。y16-40 那一条带。
 *     贴纸数量是参数。
 *   - **底带彩虹短划**：y644，x 从 96 起 24 段，每段 `x1=96+i*46 → x2=x1+26`，
 *     strokeWidth 5，圆头 linecap，四色轮换 `chartPalette`。板上止于
 *     x≈1180。
 *   - **左下角一颗橘红星贴纸**：板上路径从 `(56,628)` 起笔（星顶），填
 *     accent。标签写的 x56,y636 是这颗星的位置，不是另一个坐标。
 *
 * ## 偏离设计板：末两段彩虹划让开右下 logo 盒
 *
 * 板上 24 段划到 x1180，其中 i=22、i=23 的墨迹（含圆头半宽 2.5px）横穿
 * `brand-chrome.tsx` 的右下 logo 盒 (1120,630,96×40)——正是
 * `docs/designing-themes.md` 第 5 条四内容区的第四个。campaign 的底带纸屑
 * 整条退役是同一条先例。这里少画末两段、前 22 段坐标一字不改，24 段的
 * 节奏和四色轮换都还在，只是右缘在 logo 盒左沿停住。
 *
 * 左下星贴纸会擦到可选的左下 logo 盒 (64,630,96×40) 大约 6px。第 5 条点名
 * 的是右下那只，左下放星是板上自己画的，不挪。
 *
 * ## heavy 档降档：判据只钉 IR 结构层
 *
 * 板上密页样例原话：「装饰只剩顶波浪＋底彩虹划——密页自动降为『顶＋底』
 * 半场，贴纸撤场」。判据是这一页的组件数量（{@link HALF_FIELD_COMPONENTS}），
 * 一个纯 IR 结构量，`slide.components.length` 一个属性读到底。降档形态是
 * 贴纸与星星撤场，波浪与彩虹划留下——不是 campaign 那种「满场 120 枚砍成
 * 顶带 60 枚」的一半点数，是「页缘两带还在、贴上去的零件撤掉」。
 *
 * **不许读渲染后的文字几何**（标题占几行、正文缩到几号字、有没有溢出）。
 * 理由与 `motif-campaign-motif.tsx` 同一段：motif 画在正文之前，读测量缓存
 * 会让两次渲染拿到不同的值；文字几何随字体解析变，预览端与导出端会画出
 * 两张图。两条都违反「同 IR 同 seed 两次渲染必须逐字节同」。
 *
 * chapter 完全退让（`return null`）：crayon 的 chapter 默认底色是整版
 * primary 蜡笔蓝（`themes/crayon.ts` 的 `defaultBackgrounds.chapter`），
 * 波浪走 primary（蓝压蓝，看不见），贴纸与星星压在八个 chapter layout
 * 的巨幅居中标题活动范围上。三件失效、一件抢戏，chapter 不画。
 *
 * 纪律：零 theme id、零 hex。波浪走 primary，星走 accent，贴纸与彩虹划走
 * `chartPalette`（`chartPaletteOffset` 是 ctx 上的独立字段、不改
 * `colors.chartPalette` 本身，`motif-chart-palette-isolation.test.tsx`
 * 钉着这条）。画笔属性一律写在叶子上不挂 `<g>`——导出侧
 * `svg2pptx/dispatch.ts` 的 `leafToOp` 只读叶子自己的 `fill`/`stroke`/
 * `opacity`，挂在组上预览看得见、导出全丢。
 *
 * 红线：任何形态的粗平左竖条禁止出现。
 *
 * 可拉伸性：四色蜡笔即参数；波浪振幅、贴纸数量是 motif 参数，heavy→medium
 * 只减贴纸与彩虹划密度，几何不动。向日黄永不承字（token 角色注释里写死）。
 */

// ── 顶缘手绘波浪 ────────────────────────────────────────────────────────
const WAVE_X0 = 48
const WAVE_Y = 26
/** 二次贝塞尔控制点的纵向偏置。实际振幅是它的一半（对称二次曲线在 t=0.5
 * 落到偏置/2），板上 `q40,±10` 抄到这里。 */
const WAVE_AMP = 10
const WAVE_LEN = 80
const WAVE_CYCLES = 14
const WAVE_STROKE = 3

function wavePath(amp: number): string {
  let d = `M${WAVE_X0},${WAVE_Y}`
  for (let i = 0; i < WAVE_CYCLES; i++) {
    const sign = i % 2 === 0 ? -1 : 1
    d += ` q${WAVE_LEN / 2},${sign * amp} ${WAVE_LEN},0`
  }
  return d
}

const WAVE_D = wavePath(WAVE_AMP)

// ── 顶带右侧三枚圆贴纸 ──────────────────────────────────────────────────
const STICKERS: readonly { cx: number; cy: number; paletteIndex: number }[] = [
  { cx: 1150, cy: 28, paletteIndex: 3 },
  { cx: 1188, cy: 28, paletteIndex: 2 },
  { cx: 1226, cy: 28, paletteIndex: 1 },
]
const STICKER_R = 11

// ── 底带彩虹短划 ────────────────────────────────────────────────────────
const DASH_Y = 644
const DASH_X0 = 96
const DASH_STEP = 46
const DASH_LEN = 26
const DASH_STROKE = 5
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

// ── 左下角橘红星贴纸 ────────────────────────────────────────────────────
/** 板上路径，从星顶 (56,628) 起笔。标签 x56,y636 是这颗星的位置。 */
const STAR_D = "M56,628 l4,10 10,1 -7,7 2,10 -9,-5 -9,5 2,-10 -7,-7 10,-1 z"

/**
 * 半场降档判据：一页的组件数到这个数就撤贴纸与星星。取
 * `PACING_BUDGETS.dense.maxComponentsPerSlide`——全仓自己的「最密一档每页
 * 块数上限」，不另造一个魔数。到了这个数，页面已经是内容说了算的一页，
 * 装饰把贴上去的零件让出来。
 */
const HALF_FIELD_COMPONENTS = PACING_BUDGETS.dense.maxComponentsPerSlide

export function CrayonMotif({ slide, ctx }: DecorProps) {
  // chapter 是整版 primary 蜡笔蓝底，波浪消失、贴纸与巨幅标题抢面
  // （见文件头）。
  if (slide.type === "chapter") return null

  const palette = ctx.colors.chartPalette
  const blue = ctx.colors.primary
  const orange = ctx.colors.accent
  // 半场降档：判据只读 IR 结构层的组件数量，绝不读渲染后的文字几何。
  const halfField = slide.components.length >= HALF_FIELD_COMPONENTS

  return (
    <>
      <path
        d={WAVE_D}
        fill="none"
        stroke={blue}
        strokeWidth={WAVE_STROKE}
        strokeLinecap="round"
      />
      {!halfField &&
        STICKERS.map((s) => (
          <circle key={s.cx} cx={s.cx} cy={s.cy} r={STICKER_R} fill={palette[s.paletteIndex]} />
        ))}
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
        />
      ))}
      {!halfField && <path d={STAR_D} fill={orange} />}
    </>
  )
}
