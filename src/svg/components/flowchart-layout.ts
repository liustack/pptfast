export type Rankdir = "TB" | "BT" | "LR" | "RL"

export interface SizedNode {
  id: string
  w: number
  h: number
}

export interface LayoutEdge {
  from: string
  to: string
}

export interface PlacedNode {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface FlowchartLayout {
  nodes: PlacedNode[]
  width: number
  height: number
}

const DEFAULT_NODESEP = 30
const DEFAULT_RANKSEP = 48
const EMPTY_WIDTH = 400
const EMPTY_HEIGHT = 200

function assignRanks(
  n: number,
  succ: readonly number[][],
  pred: readonly number[][],
  inDegree: readonly number[],
): number[] {
  const remaining = inDegree.slice()
  const rank = new Array<number>(n)
  const hasRank = new Array<boolean>(n).fill(false)
  const done = new Array<boolean>(n).fill(false)
  const pendingMax = new Array<number>(n).fill(0)

  const assign = (i: number, r: number) => {
    rank[i] = r
    hasRank[i] = true
  }

  const drain = (seed: readonly number[]) => {
    const queue = seed.slice()
    for (let qi = 0; qi < queue.length; qi++) {
      const u = queue[qi]!
      if (done[u]) continue
      done[u] = true
      for (const v of succ[u]!) {
        if (done[v]) continue
        pendingMax[v] = Math.max(pendingMax[v]!, rank[u]! + 1)
        remaining[v]!--
        if (remaining[v] === 0 && !hasRank[v]) {
          assign(v, pendingMax[v]!)
          queue.push(v)
        }
      }
    }
  }

  const sources: number[] = []
  for (let i = 0; i < n; i++) {
    if (remaining[i] === 0) {
      assign(i, 0)
      sources.push(i)
    }
  }
  if (sources.length === 0) {
    assign(0, 0)
    sources.push(0)
  }
  drain(sources)

  while (true) {
    let pick = -1
    for (let i = 0; i < n; i++) {
      if (hasRank[i]) continue
      let rankedPred = false
      for (const p of pred[i]!) {
        if (hasRank[p]) {
          rankedPred = true
          break
        }
      }
      if (rankedPred) {
        pick = i
        break
      }
    }
    if (pick === -1) {
      for (let i = 0; i < n; i++) {
        if (!hasRank[i]) {
          pick = i
          break
        }
      }
    }
    if (pick === -1) break
    let maxPred = -1
    for (const p of pred[pick]!) {
      if (hasRank[p]) maxPred = Math.max(maxPred, rank[p]!)
    }
    assign(pick, maxPred < 0 ? 0 : 1 + maxPred)
    remaining[pick] = 0
    drain([pick])
  }

  for (let i = 0; i < n; i++) {
    if (!hasRank[i]) assign(i, 0)
  }
  return rank
}

function orderByBarycenter(
  n: number,
  rank: readonly number[],
  succ: readonly number[][],
  pred: readonly number[][],
): number[][] {
  let maxRank = 0
  for (let i = 0; i < n; i++) maxRank = Math.max(maxRank, rank[i]!)
  const layers: number[][] = Array.from({ length: maxRank + 1 }, () => [])
  for (let i = 0; i < n; i++) layers[rank[i]!]!.push(i)

  const orderIndex = new Array<number>(n)
  for (let r = 1; r <= maxRank; r++) {
    const prev = layers[r - 1]!
    orderIndex.fill(-1)
    for (let p = 0; p < prev.length; p++) orderIndex[prev[p]!] = p

    const layer = layers[r]!
    const scored = layer.map((idx) => {
      let sum = 0
      let count = 0
      for (const p of pred[idx]!) {
        const oi = orderIndex[p]!
        if (oi >= 0) {
          sum += oi
          count++
        }
      }
      for (const s of succ[idx]!) {
        const oi = orderIndex[s]!
        if (oi >= 0) {
          sum += oi
          count++
        }
      }
      return { idx, bary: count > 0 ? sum / count : idx }
    })
    scored.sort((a, b) => a.bary - b.bary || a.idx - b.idx)
    layers[r] = scored.map((s) => s.idx)
  }
  return layers.filter((layer) => layer.length > 0)
}

function placeTb(
  nodes: readonly SizedNode[],
  layers: readonly number[][],
  nodesep: number,
  ranksep: number,
): { xy: { x: number; y: number }[]; width: number; height: number } {
  const n = nodes.length
  const xy = Array.from({ length: n }, () => ({ x: 0, y: 0 }))
  const rankCount = layers.length
  const rankHeights = layers.map((layer) => Math.max(...layer.map((i) => nodes[i]!.h)))
  const rankWidths = layers.map((layer) => {
    let sum = 0
    for (let k = 0; k < layer.length; k++) {
      if (k) sum += nodesep
      sum += nodes[layer[k]!]!.w
    }
    return sum
  })
  let width = 0
  let height = 0
  for (const w of rankWidths) width = Math.max(width, w)
  for (const h of rankHeights) height += h
  if (rankCount > 1) height += ranksep * (rankCount - 1)

  let y = 0
  for (let r = 0; r < rankCount; r++) {
    const layer = layers[r]!
    const rh = rankHeights[r]!
    let x = (width - rankWidths[r]!) / 2
    for (const i of layer) {
      const nd = nodes[i]!
      xy[i] = { x, y: y + (rh - nd.h) / 2 }
      x += nd.w + nodesep
    }
    y += rh + ranksep
  }
  return { xy, width, height }
}

function placeLr(
  nodes: readonly SizedNode[],
  layers: readonly number[][],
  nodesep: number,
  ranksep: number,
): { xy: { x: number; y: number }[]; width: number; height: number } {
  const n = nodes.length
  const xy = Array.from({ length: n }, () => ({ x: 0, y: 0 }))
  const rankCount = layers.length
  const rankWidths = layers.map((layer) => Math.max(...layer.map((i) => nodes[i]!.w)))
  const rankHeights = layers.map((layer) => {
    let sum = 0
    for (let k = 0; k < layer.length; k++) {
      if (k) sum += nodesep
      sum += nodes[layer[k]!]!.h
    }
    return sum
  })
  let width = 0
  let height = 0
  for (const w of rankWidths) width += w
  for (const h of rankHeights) height = Math.max(height, h)
  if (rankCount > 1) width += ranksep * (rankCount - 1)

  let x = 0
  for (let r = 0; r < rankCount; r++) {
    const layer = layers[r]!
    const rw = rankWidths[r]!
    let y = (height - rankHeights[r]!) / 2
    for (const i of layer) {
      const nd = nodes[i]!
      xy[i] = { x: x + (rw - nd.w) / 2, y }
      y += nd.h + nodesep
    }
    x += rw + ranksep
  }
  return { xy, width, height }
}

export function layoutFlowchart(
  nodes: readonly SizedNode[],
  edges: readonly LayoutEdge[],
  rankdir: Rankdir,
  opts?: { nodesep?: number; ranksep?: number },
): FlowchartLayout {
  const nodesep = opts?.nodesep ?? DEFAULT_NODESEP
  const ranksep = opts?.ranksep ?? DEFAULT_RANKSEP
  const n = nodes.length
  if (n === 0) return { nodes: [], width: EMPTY_WIDTH, height: EMPTY_HEIGHT }

  const idToIndex = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const id = nodes[i]!.id
    if (!idToIndex.has(id)) idToIndex.set(id, i)
  }

  const succ: number[][] = Array.from({ length: n }, () => [])
  const pred: number[][] = Array.from({ length: n }, () => [])
  const inDegree = new Array<number>(n).fill(0)
  for (const e of edges) {
    const u = idToIndex.get(e.from)
    const v = idToIndex.get(e.to)
    if (u === undefined || v === undefined || u === v) continue
    succ[u]!.push(v)
    pred[v]!.push(u)
    inDegree[v]!++
  }

  const rank = assignRanks(n, succ, pred, inDegree)
  const layers = orderByBarycenter(n, rank, succ, pred)
  const axis: Rankdir = rankdir === "BT" ? "TB" : rankdir === "RL" ? "LR" : rankdir
  const placed = axis === "LR" ? placeLr(nodes, layers, nodesep, ranksep) : placeTb(nodes, layers, nodesep, ranksep)
  const { width, height } = placed
  const out: PlacedNode[] = []
  for (let i = 0; i < n; i++) {
    const nd = nodes[i]!
    let x = placed.xy[i]!.x
    let y = placed.xy[i]!.y
    if (rankdir === "BT") y = height - y - nd.h
    if (rankdir === "RL") x = width - x - nd.w
    out.push({ id: nd.id, x, y, w: nd.w, h: nd.h })
  }
  return { nodes: out, width, height }
}
