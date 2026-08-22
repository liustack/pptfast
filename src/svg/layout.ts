import type { Component, Slide } from "@/ir"
import type { ComponentBox, ComponentCtx } from "./components/types"
import { COLUMN_SPANNING_TYPES, STRETCHABLE_TYPES } from "./component-traits"
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

/**
 * Lay out one ordinary run inside a two-column section. A one-component run
 * takes the full width, matching the arrangement's existing whole-slide
 * degeneration rule. Longer runs keep the established first-half-left,
 * second-half-right ordering.
 */
function twoColumnRun(
  components: Component[],
  rect: ContentRect,
  y: number,
  ctx: ComponentCtx,
  gap: number,
): { placed: PlacedComponent[]; endY: number } {
  if (components.length === 0) return { placed: [], endY: y }
  if (components.length === 1) return stackFrom(components, rect.x, y, rect.w, ctx, gap)

  const colW = (rect.w - COLUMN_GAP) / 2
  const mid = Math.ceil(components.length / 2)
  const left = stackFrom(components.slice(0, mid), rect.x, y, colW, ctx, gap)
  const right = stackFrom(
    components.slice(mid),
    rect.x + colW + COLUMN_GAP,
    y,
    colW,
    ctx,
    gap,
  )
  return { placed: [...left.placed, ...right.placed], endY: Math.max(left.endY, right.endY) }
}

/**
 * Preserve authored order while allowing page-level components to span the
 * full row. Consecutive ordinary components form a two-column section. Each
 * spanning component closes that section, renders full-width, then starts a
 * fresh section below it.
 */
function twoColumnWithSpanners(
  components: Component[],
  rect: ContentRect,
  ctx: ComponentCtx,
  gap: number,
): PlacedComponent[] {
  const placed: PlacedComponent[] = []
  let run: Component[] = []
  let cursorY = rect.y

  const flushRun = () => {
    if (run.length === 0) return
    const section = twoColumnRun(run, rect, cursorY, ctx, gap)
    placed.push(...section.placed)
    cursorY = section.endY + gap
    run = []
  }

  for (const component of components) {
    if (!COLUMN_SPANNING_TYPES.has(component.type)) {
      run.push(component)
      continue
    }
    flushRun()
    placed.push({ component, box: { x: rect.x, y: cursorY, w: rect.w } })
    cursorY += measureComponent(component, rect.w, ctx) + gap
  }
  flushRun()
  return placed
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
      return twoColumnWithSpanners(components, rect, ctx, gap)
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

/** Matches `MIN_READABLE_CARD_W` / `GAP` in `components/kpi.tsx`. Layout
 * restacks a two-column page before that component drops items at half
 * width (gallery two-column EN, 2026-08-22). */
const KPI_MIN_CARD_W = 160
const KPI_CARD_GAP = 16

function kpiCardsNeedFullWidth(component: Component, width: number): boolean {
  if (component.type !== "kpi_cards") return false
  const n = component.items.length
  if (n <= 1) return false
  return (width - KPI_CARD_GAP * (n - 1)) / n < KPI_MIN_CARD_W
}

function placementSqueezesKpi(placed: PlacedComponent[]): boolean {
  return placed.some((p) => kpiCardsNeedFullWidth(p.component, p.box.w))
}

function restackIfKpiSqueezed(
  arrangement: Arrangement | undefined,
  components: Component[],
  rect: ContentRect,
  ctx: ComponentCtx,
  result: { placed: PlacedComponent[]; dropped: number },
): { placed: PlacedComponent[]; dropped: number } {
  if (arrangement !== "two_column" || result.dropped !== 0 || !placementSqueezesKpi(result.placed)) {
    return result
  }
  const single = layoutContentFit("single", components, rect, ctx)
  return single.dropped === 0 ? single : result
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

/** 单个卡片 component 至多拉到测量高度的这个倍数，防止矮内容页卡片畸高。 */
const STRETCH_CAP_RATIO = 1.7
/** 剩余低于此值不做拉伸——与 SURPLUS_MIN_REMAINING 同值，保持「剩余 ≤80px
 * 时整个后处理链 byte-identical」的回归锁语义。 */
const STRETCH_MIN_REMAINING = 80
/** 拉伸这一趟至多吃掉列内剩余的这个份额，其余留给 distributeSurplus。
 * 与 SURPLUS_SHARE 同值（沿用本文件既有写法：数字重写一遍，注释里挑明是
 * 同一个数），两趟都只花掉自己看到的剩余的 60%，谁先跑都不会把版面吃干净。
 * 没有上限时单个可伸展块独吞全部剩余（拉伸倍率直接顶到 STRETCH_CAP_RATIO），
 * 卡壳内部撑出大片死空、卡与卡之间一 px 不长、末排卡片贴到页脚上
 * （2026-08-19 评审 C 簇 3/4：188.5px 高的卡里只有 107px 内容，
 * 末排卡底离脚注墨迹 3px）。 */
const STRETCH_SHARE = 0.6

/**
 * 卡片密度拉伸（2026-07-11 用户「带卡片的区块页面总是空腔」痛点）：布局
 * 成功后，把每列底部剩余高度的 STRETCH_SHARE 分给列内卡壳类 component
 * （box.h = 测量高 + 份额，封顶 STRETCH_CAP_RATIO×），列内后续 component
 * 相应下移。份额之外的剩余留给 distributeSurplus 继续做间距呼吸——不设份额
 * 上限时这一趟会把剩余吃干净，distributeSurplus 拿到的永远是 remaining = 0，
 * 必然空转。与 distributeSurplus 同款列条件：列首块必须贴 rect 顶
 * （quote 居中版式不动）。
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
    const perComponent = (remaining * STRETCH_SHARE) / stretchIdxs.length
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
/**
 * A gap ends up at most this many times its original (pre-surplus) size.
 * Same "final size, not added size" reading as `STRETCH_CAP_RATIO` above,
 * and the same `× (RATIO - 1)` arithmetic below.
 *
 * Tightened by the 2026-08-20 vertical-gravity ruling. This number used to
 * mean "may grow by 1.5x again", which let a 16px gap end up at 40. A gap
 * stretched to two and a half times its designed size stops reading as
 * space between two parts of one block and starts reading as a page that
 * has come apart ("像一盘沙"). At 1.5 that same gap tops out at 24, and the
 * space this ceiling declines is not handed to some other gap: it falls to
 * the bottom of the page, which is the side the ruling allows to be empty.
 */
const SURPLUS_GAP_CAP_RATIO = 1.5

/**
 * "Breathing room, not falling apart" (wave-B S4): once a working gap tier
 * lays every component out top-aligned, a short slide can leave a large dead
 * strip below the last component. Spend `SURPLUS_SHARE` of that leftover growing
 * the gaps *between* components — evenly, capped so no single gap ends up past
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
    gap * (SURPLUS_GAP_CAP_RATIO - 1),
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
 * Share of a block's leftover height that settles *above* it — the golden
 * position (2026-08-21 user ruling, fourth review round). 38% over the block,
 * 62% under it.
 *
 * The number itself is the 2026-07-10 ruling's, restored: it was right, and
 * the thing that made pages read as "一盘沙" was never this offset but the
 * gaps *inside* the block, which `SURPLUS_GAP_CAP_RATIO` now holds to 1.5x.
 * Both extremes have been tried and refused — a block centered in its rect
 * ("居中死", the 50% version) hangs away from the heading it belongs under,
 * and a block flush with the rect's top ("顶死", 0%) welds it to that
 * heading with the whole page's air behind it. 38% is the optically centered
 * position: more room below than above, which is what "下可空上不空" asks
 * for once the members are already gathered.
 */
export const GOLDEN_TOP_SHARE = 0.38

/**
 * How many designed block-gaps of air `settleToGolden` may place above a
 * gathered block. One heading-to-body beat. Beyond this, leftover sinks
 * below (下可空) so a short block cannot hang as a second island under
 * the heading band that already occupies the page's top.
 *
 * Linked to `gapScale` through `goldenTopCap` (scale 1 → 16, 1.1 → 18,
 * 1.3 → 21). The 38% share still applies when leftover is small enough
 * that 38% sits inside this cap. Two gaps (the 2026-08-21 first cap)
 * still left ~94px of ink between a banner and a lone table header.
 * Sixth review (same day) tightens the beat to one.
 */
export const GOLDEN_TOP_CAP_GAPS = 1

/** Ceiling on the air `settleToGolden` may add above a gathered block. */
export function goldenTopCap(ctx: ComponentCtx): number {
  return Math.round(BLOCK_GAP * GOLDEN_TOP_CAP_GAPS * (ctx.shape?.gapScale ?? 1))
}

/**
 * Move a finished placement, whole, into the golden position: every box
 * shifts down by the same `GOLDEN_TOP_SHARE` of the height left over under
 * the stack, capped at `goldenTopCap` so a tall leftover cannot open an
 * island between the heading and the body. Gaps, widths and stretched
 * heights are untouched — this pass only decides where the assembled
 * block stands, never how it is built.
 *
 * Left alone (same references back, so a caller can compare by identity):
 *  - an empty placement
 *  - a stack whose first box is not flush with the rect's top edge. Two
 *    kinds arrive that way: `quote`, which centers itself because the author
 *    asked for that composition by name, and a stack that has already been
 *    settled — which is what makes a second call a no-op rather than a
 *    second 38%.
 *  - a stack with nothing left over (it already reaches the rect's bottom)
 */
export function settleToGolden(
  placed: PlacedComponent[],
  rect: ContentRect,
  ctx: ComponentCtx,
  opts?: { capTopAir?: boolean },
): PlacedComponent[] {
  if (placed.length === 0) return placed
  const top = placed.reduce((min, p) => Math.min(min, p.box.y), Number.POSITIVE_INFINITY)
  if (Math.abs(top - rect.y) > 0.5) return placed
  const remaining = rect.y + rect.h - stackBottom(placed, ctx)
  if (remaining <= 0) return placed
  const airCap = opts?.capTopAir === false ? remaining : goldenTopCap(ctx)
  const shift = Math.min(remaining * GOLDEN_TOP_SHARE, airCap)
  return placed.map((p) => ({ ...p, box: { ...p.box, y: p.box.y + shift } }))
}

/**
 * Vertical overflow guard: retries `layoutContent` with progressively tighter
 * gaps, then — if the tightest gap still overflows — keeps only the components
 * whose bottom edge fits the rect and reports how many were dropped so the
 * caller can render a "+N more" marker. Quality gates upstream (ir-quality
 * warn, backend lint) are meant to keep real decks from ever reaching the
 * drop path — this is the last line of defense.
 *
 * On success, hands the placement through `distributeSurplus` so any leftover
 * space below a short stack gets spent as gap growth rather than sitting
 * dead at the bottom (wave-B S4), and then — for a stack of two or more —
 * through `settleToGolden`, which sets that assembled block down 38% of the
 * way into whatever space is still left, capped at one heading-to-body beat
 * so a tall leftover cannot split heading and body into two islands.
 * Callers (`SvgContent`, `BigNumber`, `AssertionEvidence`) render/annotate
 * straight from the returned boxes, so the audit annotations follow
 * automatically.
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
      // The stretch and surplus passes model each x coordinate as one
      // continuous column rooted at rect.y. A spanning row deliberately
      // breaks that invariant into vertical sections. Leave its successful
      // placement untouched so a full-width verdict cannot make only the
      // left section stretch while the matching right section stays fixed.
      if (
        arrangement === "two_column" &&
        components.length >= 2 &&
        placed.some((p) => COLUMN_SPANNING_TYPES.has(p.component.type))
      ) {
        // Its internal spacing stays untouched for the reason above; the
        // whole row still gets set down at the golden position, which moves
        // every section by the same amount and so cannot pull two of them
        // apart.
        return restackIfKpiSqueezed(arrangement, components, rect, ctx, {
          placed: settleToGolden(placed, rect, ctx),
          dropped: 0,
        })
      }
      // 先做卡片密度拉伸（吃大头），剩余交给间距呼吸
      const grown = growStretchables(placed, rect, ctx)
      const grownBottom = grown === placed ? bottom : stackBottom(grown, ctx)
      const spaced = distributeSurplus(grown, rect, gap, grownBottom)
      // Gather the members first (stretch, then gaps), then set the whole
      // block down at the golden position — but only when there is a block
      // of two or more to set down. A lone component's vertical placement
      // belongs to whoever owns the region: `SvgContent` settles a page's
      // one block itself, while this same call also fills a page's
      // *sub*-region (an image takeover's caption column, `big_number`'s
      // support stack), where settling each one-block region by its own
      // leftover would tilt regions that are meant to share a top edge.
      return restackIfKpiSqueezed(arrangement, components, rect, ctx, {
        placed: spaced.length >= 2 ? settleToGolden(spaced, rect, ctx) : spaced,
        dropped: 0,
      })
    }
  }
  // Before giving up and dropping content: a column-splitting arrangement
  // halves the width available to every block, and a block sized for a
  // full-width rect routinely fails to fit a half-width one. When that
  // happens the page renders as one column of content beside an empty one,
  // with the rest silently gone — the shape the 2026-08-15 visual review
  // kept flagging as "左侧空白" on `two-column` pages.
  //
  // A full-width single stack that keeps every block beats a split that
  // loses some, so retry as one column before accepting any loss. Only
  // when the single stack *also* has to drop something does the original
  // split stand: at that point the arrangement is not what is costing the
  // content, and the layout the theme chose is worth preserving.
  const SPLITTING: readonly Arrangement[] = ["two_column", "image_focus", "aside"]
  if (arrangement && SPLITTING.includes(arrangement)) {
    const single = layoutContentFit("single", components, rect, ctx)
    // The single stack was built to survive, not to fill: blocks measured
    // for a full-width rect are usually much shorter there than the split
    // they replaced, so this branch is exactly where a large leftover shows
    // up. It gets the same golden placement as any other stack — the retry
    // above already ran it through `settleToGolden`, so 38% of that leftover
    // is above the block and 62% below, and this branch needs no notion of
    // its own about where a stack belongs.
    //
    // Two earlier answers here, both refused by the same person: splitting
    // the leftover evenly (academic p06 sat 106px clear of the rule line it
    // hangs under) and sinking all of it (the same page welded to that line,
    // 0px). Measured at 38%: 61px.
    if (single.dropped === 0) return single
  }

  const tightestGap = GAP_TIERS[GAP_TIERS.length - 1]
  const placed = layoutContent(arrangement, components, rect, ctx, tightestGap)
  const fits = (p: PlacedComponent) =>
    p.box.y + measureComponent(p.component, p.box.w, ctx) <= rect.y + rect.h + 1
  const kept = placed.filter(fits)
  // A slide degraded to nothing but the "+N more" marker is worse than
  // one with a single overflowing component — keep the first placed component even
  // if it alone doesn't fit the rect (upstream quality gates make this rare).
  // 保留块带上剩余可用高（box.h < 测量高 = 截断预算，2026-07-11 存量
  // deck 5 项长卡画出页外实锤）：可分割块（row_cards）据此块内截断并
  // 自画「+N …」，不感知 box.h 的块行为不变（照旧溢出渲染）。
  if (kept.length === 0 && placed.length > 0) {
    const first = placed[0]
    const avail = rect.y + rect.h - first.box.y
    return {
      placed: [{ ...first, box: { ...first.box, h: Math.max(80, avail) } }],
      dropped: placed.length - 1,
    }
  }
  // The `kept` filter only sieves — survivors stay in the column they were
  // assigned. When a split arrangement loses one column outright (its blocks
  // are the ones that did not fit the half width), what is left is content on
  // one half of the page and nothing at all on the other: the "左侧空白" shape
  // the 2026-08-19 review kept reading as a defect with no name (D cluster,
  // 5b — `content-dropped` tells the reader two blocks are gone, nothing tells
  // them half the page is empty). Restack the survivors as one full-width
  // column, which is also the width they were originally measured for. Kept
  // only if it costs nothing: a block whose height grows with its width (an
  // `image`) can fail to fit the wider column, and losing more content to
  // improve the shape is not a trade worth making.
  const columnXs = new Set(placed.map((p) => p.box.x))
  const survivingXs = new Set(kept.map((p) => p.box.x))
  if (kept.length > 0 && columnXs.size > 1 && survivingXs.size < columnXs.size) {
    const restacked = stackFrom(
      kept.map((p) => p.component),
      rect.x,
      rect.y,
      rect.w,
      ctx,
      tightestGap,
    )
    if (restacked.placed.every(fits)) {
      return { placed: restacked.placed, dropped: placed.length - kept.length }
    }
  }
  return { placed: kept, dropped: placed.length - kept.length }
}
