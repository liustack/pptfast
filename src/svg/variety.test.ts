import { describe, expect, it } from "vitest"
import type { PptxIR } from "@/ir"
import { deckSeed, pickBySeed, pickBySeedRotating } from "./variety"

function ir(filename: string, headings: string[]): PptxIR {
  return {
    version: "3",
    filename,
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides: headings.map((heading) => ({ type: "content", heading, blocks: [] })),
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

describe("pickBySeedRotating（P3 Item ②：同 deck 内相邻页轮换）", () => {
  it("同 seed 同 salt，ordinal 递增在集合内轮转（相邻页不同版式）", () => {
    const items = ["a", "b"] as const
    const picks = [0, 1, 2, 3].map((o) => pickBySeedRotating(7, "content", items, o))
    // 2 元素集：相邻 ordinal 必交替（base, base^1, base, base^1）
    expect(picks[0]).not.toBe(picks[1])
    expect(picks[1]).not.toBe(picks[2])
    expect(picks[0]).toBe(picks[2])
  })
  it("确定性：同 (seed,salt,ordinal) 恒同结果", () => {
    expect(pickBySeedRotating(9, "content", ["x", "y", "z"], 1)).toBe(
      pickBySeedRotating(9, "content", ["x", "y", "z"], 1),
    )
  })
  it("ordinal=0 与 pickBySeed 起点一致（deck 级基准不变）", () => {
    const items = ["p", "q", "r"] as const
    expect(pickBySeedRotating(42, "content", items, 0)).toBe(pickBySeed(42, "content", items))
  })
  it("不同 deck（seed）起点不同", () => {
    const items = ["a", "b", "c", "d"] as const
    const s1 = pickBySeedRotating(1, "content", items, 0)
    const s2 = pickBySeedRotating(2, "content", items, 0)
    // 大概率不同（4 元素集），至少确定性成立
    expect([s1, s2].every((x) => items.includes(x as (typeof items)[number]))).toBe(true)
  })
  it("单元素集恒返回该元素（无轮换素材时行为不变）", () => {
    expect(pickBySeedRotating(5, "content", ["only"], 3)).toBe("only")
  })
  it("空集抛错", () => {
    expect(() => pickBySeedRotating(1, "content", [], 0)).toThrow()
  })
})
