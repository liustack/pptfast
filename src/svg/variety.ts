import type { PptxIR } from "@/ir"

/**
 * djb2 哈希（与 blocks/chart-svg.tsx 的 stableHash 同算法，那处是文件私有
 * 未导出，此处按同样理由本地实现）。恒返回非负整数。
 */
function stableHash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * deck 级多样性种子：IR 内容的确定性哈希（spec §3.4）。不新增 IR 字段——
 * 预览/导出/重渲染天然一致，存量 deck 同样有稳定 seed。
 */
export function deckSeed(ir: PptxIR): number {
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
 * 同 deck 内轮换选择（P3 Item ②，spec §3.4「相邻页轮换」）：allowed 有 2+
 * 元素时，按该页在同类型页面里的序号 `ordinal` 在集合内轮转——base 起点由
 * (seed,salt) 决定（deck 级随机性），ordinal 提供页面级步进，故同一 deck 相邻
 * content 页拿到集合内相邻的不同 archetype（打破 deck 内雷同）。ordinal=0 与
 * pickBySeed 起点一致，deck 级基准不变。rhythm 不参与（rhythm 是 ops-kb 规划
 * 期字段，不在渲染 IR 里，与 seed 正交，见 spec §3.4）。
 */
export function pickBySeedRotating<T>(
  seed: number,
  salt: string,
  items: readonly T[],
  ordinal: number,
): T {
  if (items.length === 0) throw new Error(`pickBySeedRotating: empty allowed set (salt=${salt})`)
  const base = avalanche(stableHash(`${seed}:${salt}`)) % items.length
  return items[(base + ordinal) % items.length]
}
