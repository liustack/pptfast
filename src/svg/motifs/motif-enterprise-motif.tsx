import type { DecorProps } from "./types"
import { DecorPiece } from "./decor-piece"
import { leafRecessOpacity } from "./decor-budget"
import { readableOn } from "../ink"

/**
 * enterprise-motif v3 —— 「方块秩序」（第八波制度板对账，沿用 v2 方块阶）。
 *
 * 相对 v2（2026-08-20 冷调组皮肤）：
 *   - **封面只留右上阶**，opacity 0.28，几何抄第八波板右上三枚 26×26。
 *     满版 primary 场上走 `readableOn(primary)`，不烤白。第三枚再淡一档
 *     （板上组 0.28 × 叶 0.5）。顶缘刻度尺不在封面画，避免与左齐标题抢。
 *   - **删除左下孤立 accent 方块**（孤立小件禁令）。
 *   - **chapter 浅底可画刻度**：顶缘尺身 + 六枚齿，位置仍是 v2 的 y36 尺。
 *   - **content** 保留尺 + 右上递减阶（v2 几何，压在标题带之上）。
 *   - **ending** 空：满版 primary 收口页板上不留阶。
 *
 * 叶子走 `leafRecessOpacity`。每一组包进 `data-decor-piece`。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx / `readableOn`。
 */

// ── 顶缘刻度尺（chapter / content）──────────────────────────────────────
const RULE_Y = 36
const RULE_X1 = 48
/** 止于右上 logo 带（branding.tsx 的 `logoBox`）的左沿。 */
const RULE_X2 = 1120
/** 六枚齿：两端长齿（y30-42），中间四枚短齿（y32-40），等距 214。 */
const TICKS: readonly { x: number; y1: number; y2: number }[] = [
  { x: 48, y1: 30, y2: 42 },
  { x: 262, y1: 32, y2: 40 },
  { x: 476, y1: 32, y2: 40 },
  { x: 690, y1: 32, y2: 40 },
  { x: 904, y1: 32, y2: 40 },
  { x: 1118, y1: 30, y2: 42 },
]
const TICK_STROKE = 1.5

// ── content 右上递减方块阶（v2 几何，底边同在 y40）──────────────────────
const STEPS: readonly { x: number; y: number; size: number }[] = [
  { x: 1150, y: 12, size: 28 },
  { x: 1188, y: 20, size: 20 },
  { x: 1218, y: 26, size: 14 },
]

// ── 封面右上阶（第八波板，三枚等大正方形）──────────────────────────────
const COVER_STEP_OPACITY = 0.28
const COVER_STEPS: readonly { x: number; y: number; size: number; opacity: number }[] = [
  { x: 1120, y: 64, size: 26, opacity: COVER_STEP_OPACITY },
  { x: 1154, y: 98, size: 26, opacity: COVER_STEP_OPACITY },
  { x: 1086, y: 98, size: 26, opacity: COVER_STEP_OPACITY * 0.5 },
]

function Ruler({
  rule,
  muted,
  fade,
}: {
  rule: string
  muted: string
  fade: (ink: string, preferred?: number) => number | undefined
}) {
  return (
    <DecorPiece id="ruler">
      <line x1={RULE_X1} y1={RULE_Y} x2={RULE_X2} y2={RULE_Y} stroke={rule} strokeWidth={1} opacity={fade(rule)} />
      {TICKS.map((t) => (
        <line
          key={t.x}
          x1={t.x}
          y1={t.y1}
          x2={t.x}
          y2={t.y2}
          stroke={muted}
          strokeWidth={TICK_STROKE}
          opacity={fade(muted)}
        />
      ))}
    </DecorPiece>
  )
}

export function EnterpriseMotif({ slide, ctx }: DecorProps) {
  if (slide.type === "ending") return null

  const ikb = ctx.colors.primary
  const rule = ctx.colors.border ?? ctx.colors.muted
  const muted = ctx.colors.muted
  const bg = ctx.defaultBg ?? ctx.colors.bg
  const fade = (ink: string, preferred?: number) => leafRecessOpacity(slide.type, ink, bg, preferred)

  if (slide.type === "cover") {
    const ink = readableOn(ikb)
    return (
      <DecorPiece id="ikb-steps">
        {COVER_STEPS.map((s) => (
          <rect
            key={`${s.x}-${s.y}`}
            x={s.x}
            y={s.y}
            width={s.size}
            height={s.size}
            fill={ink}
            opacity={fade(ink, s.opacity)}
          />
        ))}
      </DecorPiece>
    )
  }

  return (
    <>
      <Ruler rule={rule} muted={muted} fade={fade} />
      {slide.type === "content" && (
        <DecorPiece id="ikb-steps">
          {STEPS.map((s) => (
            <rect key={s.x} x={s.x} y={s.y} width={s.size} height={s.size} fill={ikb} opacity={fade(ikb)} />
          ))}
        </DecorPiece>
      )}
    </>
  )
}
