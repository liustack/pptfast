import { describe, expect, it } from "vitest"
import type { PptxIR } from "@/ir"
import { deckSeed, pickBySeed, weightedPickBySeed } from "./variety"

function ir(filename: string, headings: string[]): PptxIR {
  return {
    version: "3",
    filename,
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides: headings.map((heading) => ({ type: "content", heading, components: [] })),
  } as unknown as PptxIR
}

describe("deckSeed", () => {
  it("同一 IR 稳定（预览/导出/重渲染一致）", () => {
    const a = ir("方案.pptx", ["现状", "对策"])
    expect(deckSeed(a)).toBe(deckSeed(ir("方案.pptx", ["现状", "对策"])))
  })
  it("不同内容不同 seed（deck 间多样性来源）", () => {
    expect(deckSeed(ir("a.pptx", ["现状"]))).not.toBe(deckSeed(ir("b.pptx", ["现状"])))
    expect(deckSeed(ir("a.pptx", ["现状"]))).not.toBe(deckSeed(ir("a.pptx", ["对策"])))
  })
  it("heading 缺省不炸（cover/ending 可无 heading）", () => {
    expect(() => deckSeed(ir("a.pptx", [undefined as unknown as string]))).not.toThrow()
  })
  it("显式 ir.seed 优先于内容哈希（W4 seed 机制修订：修订稳定性阶梯的第一级）", () => {
    const a: PptxIR = { ...ir("方案.pptx", ["现状"]), seed: 12345 }
    const b: PptxIR = { ...ir("方案.pptx", ["对策"]), seed: 12345 } // 内容不同
    expect(deckSeed(a)).toBe(12345)
    expect(deckSeed(a)).toBe(deckSeed(b)) // 同 seed 忽略内容差异——这正是修订稳定性的意义
  })
  it("显式 ir.seed=0 仍被采用（非 falsy 回落——`!== undefined` 而非 `??`/`||`）", () => {
    const a: PptxIR = { ...ir("a.pptx", ["x"]), seed: 0 }
    expect(deckSeed(a)).toBe(0)
  })
})

describe("pickBySeed", () => {
  it("确定性：同 seed 同 salt 同结果", () => {
    expect(pickBySeed(42, "cover", ["a", "b", "c"])).toBe(pickBySeed(42, "cover", ["a", "b", "c"]))
  })
  it("salt 隔离：cover 与 motif 的选择互不牵连", () => {
    const picks = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => `${pickBySeed(s, "cover", ["a", "b"])}${pickBySeed(s, "motif", ["a", "b"])}`))
    expect(picks.size).toBeGreaterThan(2) // 若 salt 无效，两处永远同步只会出 aa/bb
  })
  it("单元素集恒返回该元素（观感等价主题的日常路径）", () => {
    expect(pickBySeed(999, "cover", ["only"])).toBe("only")
  })
  it("空集抛错（manifest 配置错误要炸在测试期）", () => {
    expect(() => pickBySeed(1, "cover", [])).toThrow()
  })
})

describe("weightedPickBySeed（W4，spec §6 step 5：加权 seed 取样）", () => {
  it("确定性：同 (seed,salt,items,weightOf) 恒同结果", () => {
    const items = ["a", "b", "c"] as const
    const weightOf = () => 1
    expect(weightedPickBySeed(42, "salt", items, weightOf)).toBe(weightedPickBySeed(42, "salt", items, weightOf))
  })

  it("等权（weightOf 恒 1）时与 pickBySeed 逐位一致（同一算法的加权化，等权退化验证）", () => {
    const items = ["p", "q", "r"] as const
    for (const seed of [1, 2, 3, 42, 999]) {
      expect(weightedPickBySeed(seed, "content", items, () => 1)).toBe(pickBySeed(seed, "content", items))
    }
  })

  it("单元素集恒返回该元素", () => {
    expect(weightedPickBySeed(999, "cover", ["only"], () => 1)).toBe("only")
  })

  it("空集抛错（manifest 配置错误要炸在测试期，同 pickBySeed）", () => {
    expect(() => weightedPickBySeed(1, "cover", [], () => 1)).toThrow()
  })

  it("salt 隔离：不同 salt 的取样互不牵连", () => {
    const items = ["a", "b"] as const
    const picks = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map(
        (s) => `${weightedPickBySeed(s, "cover", items, () => 1)}${weightedPickBySeed(s, "motif", items, () => 1)}`,
      ),
    )
    expect(picks.size).toBeGreaterThan(2)
  })

  it("分布：×3 权重项的命中频率是 ×1 权重项的 2.5-3.5 倍（≥1000 个盐，W4 design decision 1 的权重初值）", () => {
    const items = ["heavy", "light"] as const
    const weightOf = (item: (typeof items)[number]) => (item === "heavy" ? 3 : 1)
    let heavyCount = 0
    let lightCount = 0
    const N = 5000
    for (let i = 0; i < N; i++) {
      const picked = weightedPickBySeed(i, `salt-${i}`, items, weightOf)
      if (picked === "heavy") heavyCount++
      else lightCount++
    }
    expect(heavyCount + lightCount).toBe(N)
    const ratio = heavyCount / lightCount
    expect(ratio).toBeGreaterThanOrEqual(2.5)
    expect(ratio).toBeLessThanOrEqual(3.5)
  })
})
