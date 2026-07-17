import type { Component, Slide } from "@/ir"
import type { ComponentBox, ComponentCtx } from "./components/types"
import { measureComponent } from "./components"

export type Arrangement = NonNullable<Slide["arrangement"]>

/** The content region rect (px) a slide gives its components to lay out within. */
export interface ContentRect {
  x: number
  y: number
  w: number
  h: number
}

/** A component paired with the page-coordinate box the layout assigned it. */
export interface PlacedComponent {
  component: Component
  box: ComponentBox
}

/** Vertical gap (px) between stacked components. */
export const BLOCK_GAP = 16
/** Horizontal gap (px) between layout columns. */
export const COLUMN_GAP = 32

/** aside 版式的几何拆分（主 2/3 + 侧栏 1/3）——SvgContent 画侧栏分隔
 * 线时复用同一公式，两处不漂移。 */
export function asideSplit(rect: ContentRect): {
  mainW: number
  asideX: number
  asideW: number
  dividerX: number
} {
  const asideW = Math.round((rect.w - COLUMN_GAP) / 3)
  const mainW = rect.w - COLUMN_GAP - asideW
  const asideX = rect.x + mainW + COLUMN_GAP
  return { mainW, asideX, asideW, dividerX: rect.x + mainW + COLUMN_GAP / 2 }
}

/** Stack components top-to-bottom from (x,y) at width w; report the next free y. */
function stackFrom(
  components: Component[],
  x: number,
  y: number,
  w: number,
  ctx: ComponentCtx,
  gap: number = BLOCK_GAP,
): { placed: PlacedComponent[]; endY: number } {
  let cursor = y
  const placed: PlacedComponent[] = []
  for (const component of components) {
    placed.push({ component, box: { x, y: cursor, w } })
    cursor += measureComponent(component, w, ctx) + gap
  }
  return { placed, endY: components.length ? cursor - gap : y }
}

/** Lay out a content slide's components into page-coordinate boxes per arrangement. */
export function layoutContent(
  arrangement: Arrangement | undefined,
  components: Component[],
  rect: ContentRect,
  ctx: ComponentCtx,
  gap: number = BLOCK_GAP,
): PlacedComponent[] {
  let v = arrangement ?? "single"
  // 双列类版式只有 1 个块时退化为单栏全宽，否则内容被塞进半宽列浪费一半版面
  if ((v === "two_column" || v === "image_focus" || v === "aside") && components.length < 2) {
    v = "single"
  }
  switch (v) {
    case "aside": {
      // 主内容 2/3 + 观点侧栏 1/3（末位块进侧栏）——财经简报的
      // EDITORIAL NOTE 语义：数据与观点并置（2026-07-12 借鉴）。
      const { mainW, asideX, asideW } = asideSplit(rect)
      const main = stackFrom(components.slice(0, -1), rect.x, rect.y, mainW, ctx, gap)
      const aside = stackFrom(components.slice(-1), asideX, rect.y, asideW, ctx, gap)
      return [...main.placed, ...aside.placed]
    }
    case "two_column": {
      const colW = (rect.w - COLUMN_GAP) / 2
      const mid = Math.ceil(components.length / 2)
      const left = stackFrom(components.slice(0, mid), rect.x, rect.y, colW, ctx, gap)
      const right = stackFrom(
        components.slice(mid),
        rect.x + colW + COLUMN_GAP,
        rect.y,
        colW,
        ctx,
        gap,
      )
      return [...left.placed, ...right.placed]
    }
    case "image_focus": {
      const colW = (rect.w - COLUMN_GAP) / 2
      const imgs = components.filter((b) => b.type === "image")
      const rest = components.filter((b) => b.type !== "image")
      const left = stackFrom(imgs, rect.x, rect.y, colW, ctx, gap)
      const right = stackFrom(rest, rect.x + colW + COLUMN_GAP, rect.y, colW, ctx, gap)
      return [...left.placed, ...right.placed]
    }
    case "kpi_focus": {
      const kpis = components.filter((b) => b.type === "kpi_cards")
      const rest = components.filter((b) => b.type !== "kpi_cards")
      const top = stackFrom(kpis, rect.x, rect.y, rect.w, ctx, gap)
      const restY = top.endY + (kpis.length ? gap : 0)
      const bottom = stackFrom(rest, rect.x, restY, rect.w, ctx, gap)
      return [...top.placed, ...bottom.placed]
    }
    case "quote": {
      // Measure the stack, then center it vertically in the rect.
      const measured = stackFrom(components, rect.x, 0, rect.w, ctx, gap)
      const totalH = measured.endY
      const offsetY = rect.y + Math.max(0, (rect.h - totalH) / 2)
      return stackFrom(components, rect.x, offsetY, rect.w, ctx, gap).placed
    }
    case "code":
    case "single":
    default:
      return stackFrom(components, rect.x, rect.y, rect.w, ctx, gap).placed
  }
}

/** Gap tiers tried in order (widest first) before resorting to dropping components. */
const GAP_TIERS = [BLOCK_GAP, 10, 6]

/** The lowest bottom edge (page px) any placed component's content reaches.
 * 拉伸过的 component（box.h）以分配高度为准。 */
export function stackBottom(placed: PlacedComponent[], ctx: ComponentCtx): number {
  return placed.reduce(
    (max, p) => Math.max(max, p.box.y + (p.box.h ?? measureComponent(p.component, p.box.w, ctx))),
    0,
  )
}

/** 卡壳类 component：布局可把列内剩余高度分给它们本体拉伸（密度铺满）。 */
const STRETCHABLE_TYPES = new Set<Component["type"]>(["kpi_cards", "icon_cards", "row_cards"])
/** 单个卡片 component 至多拉到测量高度的这个倍数，防止矮内容页卡片畸高。 */
const STRETCH_CAP_RATIO = 1.7
/** 剩余低于此值不做拉伸——与 SURPLUS_MIN_REMAINING 同值，保持「剩余 ≤80px
 * 时整个后处理链 byte-identical」的回归锁语义。 */
const STRETCH_MIN_REMAINING = 80

/**
 * 卡片密度拉伸（2026-07-11 用户「带卡片的区块页面总是空腔」痛点）：布局
 * 成功后，把每列底部的剩余高度分给列内卡壳类 component（box.h = 测量高 +
 * 份额，封顶 STRETCH_CAP_RATIO×），列内后续 component 相应下移。剩余没吃完
 * 的部分留给 distributeSurplus 继续做间距呼吸。与 distributeSurplus 同款
 * 列条件：列首块必须贴 rect 顶（quote 居中版式不动）。
 */
function growStretchables(
  placed: PlacedComponent[],
  rect: ContentRect,
  ctx: ComponentCtx,
): PlacedComponent[] {
  if (placed.length === 0) return placed
  const columns = new Map<number, number[]>()
  placed.forEach((p, i) => {
    const col = columns.get(p.box.x)
    if (col) col.push(i)
    else columns.set(p.box.x, [i])
  })
  const next = placed.map((p) => p)
  let grew = false
  for (const idxs of columns.values()) {
    if (Math.abs(placed[idxs[0]].box.y - rect.y) > 0.5) continue
    const colBottom = idxs.reduce(
      (max, i) => Math.max(max, placed[i].box.y + measureComponent(placed[i].component, placed[i].box.w, ctx)),
      0,
    )
    const remaining = rect.y + rect.h - colBottom
    if (remaining <= STRETCH_MIN_REMAINING) continue
    const stretchIdxs = idxs.filter((i) => STRETCHABLE_TYPES.has(placed[i].component.type))
    if (stretchIdxs.length === 0) continue
    const perComponent = remaining / stretchIdxs.length
    let shift = 0
    for (const i of idxs) {
      const p = next[i]
      if (shift > 0) next[i] = { ...p, box: { ...p.box, y: p.box.y + shift } }
      if (STRETCHABLE_TYPES.has(p.component.type)) {
        const measured = measureComponent(p.component, p.box.w, ctx)
        const granted = Math.min(perComponent, measured * (STRETCH_CAP_RATIO - 1))
        if (granted > 1) {
          next[i] = {
            ...next[i],
            box: { ...next[i].box, h: measured + granted },
          }
          shift += granted
          grew = true
        }
      }
    }
  }
  return grew ? next : placed
}

/** Below this much leftover space, surplus distribution is a no-op (regression lock). */
const SURPLUS_MIN_REMAINING = 80
/** Share of the leftover space spent growing gaps; the rest sinks to the bottom. */
const SURPLUS_SHARE = 0.6
/** A gap may grow by at most this many times its original (pre-surplus) size. */
const SURPLUS_GAP_CAP_RATIO = 1.5

/**
 * "Breathing room, not falling apart" (wave-B S4): once a working gap tier
 * lays every component out top-aligned, a short slide can leave a large dead
 * strip below the last component. Spend `SURPLUS_SHARE` of that leftover growing
 * the gaps *between* components — evenly, capped so no single gap balloons past
 * `SURPLUS_GAP_CAP_RATIO`× its original size — and leave the rest as bottom
 * margin.
 *
 * Operates per stacked column (components sharing the same `box.x` — `stackFrom`
 * assigns one x per column and pushes each column's components contiguously, so
 * `two_column`/`image_focus`'s two columns and `kpi_focus`'s
 * hoisted-then-rest column each contribute their own gaps), but the leftover
 * budget and the per-gap increment are both computed once, globally, and
 * applied uniformly to every eligible gap — "均匀摊" means every gap grows by
 * the same amount, not that each column re-derives its own share.
 *
 * Left untouched (returns `placed` unchanged, same object references):
 *  - fewer than 2 placed components (no gap exists to grow)
 *  - `remaining <= SURPLUS_MIN_REMAINING` (regression lock: byte-identical)
 *  - a column whose first component isn't flush with the rect's top edge (e.g.
 *    `quote`, which already centers its whole stack — growing its internal
 *    gaps after the fact would just push it off-center instead of "breathing")
 */
function distributeSurplus(
  placed: PlacedComponent[],
  rect: ContentRect,
  gap: number,
  bottom: number,
): PlacedComponent[] {
  if (placed.length < 2) return placed
  const remaining = rect.y + rect.h - bottom
  if (remaining <= SURPLUS_MIN_REMAINING) return placed

  const columns = new Map<number, number[]>()
  placed.forEach((p, i) => {
    const col = columns.get(p.box.x)
    if (col) col.push(i)
    else columns.set(p.box.x, [i])
  })
  const eligibleColumns = Array.from(columns.values()).filter(
    (idxs) => idxs.length >= 2 && Math.abs(placed[idxs[0]].box.y - rect.y) < 0.5,
  )
  const totalGaps = eligibleColumns.reduce((n, idxs) => n + idxs.length - 1, 0)
  if (totalGaps === 0) return placed

  const perGapIncrement = Math.min(
    (remaining * SURPLUS_SHARE) / totalGaps,
    gap * SURPLUS_GAP_CAP_RATIO,
  )

  const shiftByIndex = new Map<number, number>()
  for (const idxs of eligibleColumns) {
    idxs.forEach((i, k) => {
      if (k > 0) shiftByIndex.set(i, k * perGapIncrement)
    })
  }
  return placed.map((p, i) => {
    const shift = shiftByIndex.get(i)
    return shift ? { ...p, box: { ...p.box, y: p.box.y + shift } } : p
  })
}

/**
 * Vertical overflow guard: retries `layoutContent` with progressively tighter
 * gaps, then — if the tightest gap still overflows — keeps only the components
 * whose bottom edge fits the rect and reports how many were dropped so the
 * caller can render a "+N 项未展示" marker. Quality gates upstream (ir-quality
 * warn, backend lint) are meant to keep real decks from ever reaching the
 * drop path — this is the last line of defense.
 *
 * On success, hands the placement through `distributeSurplus` so any leftover
 * space below a short stack gets spent as gap growth rather than sitting
 * dead at the bottom (wave-B S4) — callers (`SvgContent`, `BigNumber`,
 * `AssertionEvidence`) render/annotate straight from the returned boxes, so
 * the audit annotations follow automatically.
 */
export function layoutContentFit(
  arrangement: Arrangement | undefined,
  components: Component[],
  rect: ContentRect,
  ctx: ComponentCtx,
): { placed: PlacedComponent[]; dropped: number } {
  // gapScale（shape token，2026-07-10）：只作用于首选档（BLOCK_GAP×scale），
  // 紧缩 fallback 档（10/6）不乘——主题偏好只影响有余量时的呼吸感，空间
  // 紧张时的回落行为全主题一致。
  const scaledTiers =
    ctx.shape?.gapScale && ctx.shape.gapScale !== 1
      ? [Math.round(BLOCK_GAP * ctx.shape.gapScale), ...GAP_TIERS.slice(1)]
      : GAP_TIERS
  for (const gap of scaledTiers) {
    const placed = layoutContent(arrangement, components, rect, ctx, gap)
    const bottom = stackBottom(placed, ctx)
    if (bottom <= rect.y + rect.h + 1) {
      // 先做卡片密度拉伸（吃大头），剩余交给间距呼吸
      const grown = growStretchables(placed, rect, ctx)
      const grownBottom = grown === placed ? bottom : stackBottom(grown, ctx)
      return { placed: distributeSurplus(grown, rect, gap, grownBottom), dropped: 0 }
    }
  }
  const placed = layoutContent(arrangement, components, rect, ctx, GAP_TIERS[GAP_TIERS.length - 1])
  const kept = placed.filter(
    (p) => p.box.y + measureComponent(p.component, p.box.w, ctx) <= rect.y + rect.h + 1,
  )
  // A slide degraded to nothing but the "+N 项未展示" marker is worse than
  // one with a single overflowing component — keep the first placed component even
  // if it alone doesn't fit the rect (upstream quality gates make this rare).
  // 保留块带上剩余可用高（box.h < 测量高 = 截断预算，2026-07-11 存量
  // deck 5 项长卡画出页外实锤）：可分割块（row_cards）据此块内截断并
  // 自画「+N 项未展示」，不感知 box.h 的块行为不变（照旧溢出渲染）。
  if (kept.length === 0 && placed.length > 0) {
    const first = placed[0]
    const avail = rect.y + rect.h - first.box.y
    return {
      placed: [{ ...first, box: { ...first.box, h: Math.max(80, avail) } }],
      dropped: placed.length - 1,
    }
  }
  return { placed: kept, dropped: placed.length - kept.length }
}
