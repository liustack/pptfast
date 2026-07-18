import type { PptxIR } from "@/ir"

/**
 * djb2 哈希（与 components/chart-svg.tsx 的 stableHash 同算法，那处是文件私有
 * 未导出，此处按同样理由本地实现）。恒返回非负整数。
 */
function stableHash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * deck 级多样性种子（W4 seed 机制修订，spec §6：「确定性 ≠ 修订稳定性」）：
 * `ir.seed`（显式，plan/assemble 注入，见 `ir/index.ts` 该字段自己的注释）
 * 优先——同一 seed 在插页/改标题后仍逐字不变，这是显式 seed 存在的唯一意义。
 * 未写 seed 时回落 IR 内容的确定性哈希（filename + 全部 heading），与 W4
 * 之前的行为逐字节一致，裸 IR（无 plan/assemble 参与）向后兼容：预览/导出/
 * 重渲染天然一致，但改任何一页标题都会重排全 deck 自动选型——这正是
 * 「未显式 seed 时不承诺修订稳定性」的记录在案代价（spec §6），不是 bug。
 */
export function deckSeed(ir: PptxIR): number {
  if (ir.seed !== undefined) return ir.seed
  const parts = [ir.filename ?? "", ...ir.slides.map((s) => s.heading ?? "")]
  return stableHash(parts.join("\n"))
}

/**
 * murmur3 定点终混（finalizer）。djb2 的低位是逐字符奇偶性的异或和，字符集
 * 不同的 salt 字符串可能巧合同奇偶（如 "cover" 与 "motif"），导致
 * `% 2` 时 salt 隔离失效——此步把高位也搅进低位，避免这类巧合碰撞。
 */
function avalanche(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h ^= h >>> 16
  return Math.abs(h)
}

/**
 * `deckSeed` 记忆化（原住 FullSlideSvg，2026-07-10 迁here——BrandChrome
 * 也要消费，住渲染组件里会循环 import）：`ir` 对象引用在同一渲染批次内
 * 稳定，跨批次新 IR 对象天然失效，WeakMap 无需手动清理。
 */
const deckSeedCache = new WeakMap<PptxIR, number>()
export function cachedDeckSeed(ir: PptxIR): number {
  let seed = deckSeedCache.get(ir)
  if (seed === undefined) {
    seed = deckSeed(ir)
    deckSeedCache.set(ir, seed)
  }
  return seed
}

/** 在 manifest 允许集（白名单）内按 seed+salt 确定性取一项。 */
export function pickBySeed<T>(seed: number, salt: string, items: readonly T[]): T {
  if (items.length === 0) throw new Error(`pickBySeed: empty allowed set (salt=${salt})`)
  return items[avalanche(stableHash(`${seed}:${salt}`)) % items.length]
}

/**
 * 加权版 `pickBySeed`（W4，spec §6 step 5）：整数权重，hash→[0,totalWeight)
 * 区间走查——`weightOf` 给每个候选打一个正整数权重（调用方职责，本函数不做
 * 权重语义校验），`items` 按声明顺序把各自的权重区间首尾相接铺成一条
 * [0,totalWeight) 数轴，`(seed,salt)` 的雪崩哈希落在哪一段就选哪个（同一算法
 * 思路的加权化：等权=1 时退化为 `hash % items.length`，与 `pickBySeed` 逐位
 * 一致，见该函数自己的等权回归测试）。
 */
export function weightedPickBySeed<T>(
  seed: number,
  salt: string,
  items: readonly T[],
  weightOf: (item: T) => number,
): T {
  if (items.length === 0) throw new Error(`weightedPickBySeed: empty allowed set (salt=${salt})`)
  const weights = items.map(weightOf)
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  const target = avalanche(stableHash(`${seed}:${salt}`)) % totalWeight
  let cursor = 0
  for (let i = 0; i < items.length; i++) {
    cursor += weights[i]
    if (target < cursor) return items[i]
  }
  // Unreachable when every weight is a positive integer (cursor reaches
  // totalWeight on the last item, and target < totalWeight always — it's a
  // `% totalWeight` result), so the loop always returns before falling
  // through. Defensive only, same "total function" posture as this file's
  // other pick functions.
  return items[items.length - 1]
}
