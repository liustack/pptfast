import { describe, expect, it } from "vitest"
import { isCjk, stacksVertically } from "./text-script"

describe("stacksVertically", () => {
  it("stacks pure Chinese", () => {
    expect(stacksVertically("资产投入")).toBe(true)
    expect(stacksVertically("客户洞察")).toBe(true)
    expect(stacksVertically("冶金")).toBe(true)
  })

  it("stacks kana and Hangul", () => {
    expect(stacksVertically("売上高")).toBe(true)
    expect(stacksVertically("うりあげ")).toBe(true)
    expect(stacksVertically("マージン")).toBe(true)
    expect(stacksVertically("매출액")).toBe(true)
  })

  it("refuses every Latin label — the reviewed defect", () => {
    // The two pages the 2026-08-20 review called out by name.
    expect(stacksVertically("Tempo")).toBe(false) // component--heatmap--mixed
    expect(stacksVertically("Customers")).toBe(false) // component--matrix--en
    expect(stacksVertically("Investment Level")).toBe(false)
    expect(stacksVertically("USD")).toBe(false)
  })

  it("refuses the other alphabetic scripts too, not only Latin", () => {
    expect(stacksVertically("Выручка")).toBe(false) // Cyrillic
    expect(stacksVertically("Έσοδα")).toBe(false) // Greek
    expect(stacksVertically("الإيرادات")).toBe(false) // Arabic
  })

  it("refuses a mixed label — one Latin run is enough, no majority vote", () => {
    // Every one of these is majority-Chinese by character count. A dominant-
    // script rule would stack them and shatter the Latin run inside; the
    // allowlist rule sends all of them horizontal.
    expect(stacksVertically("K8s 托管")).toBe(false)
    expect(stacksVertically("风险 & rollback")).toBe(false)
    expect(stacksVertically("基于 Kubernetes 的调度")).toBe(false)
  })

  it("keeps the CJK dash and curly quotes on the stackable side", () => {
    // `heading-fit.ts` already weighs "——" as an ideograph rather than as
    // narrow Latin punctuation; this agrees with it, so a CJK title that
    // happens to carry a dash does not fall off the vertical path.
    expect(stacksVertically("补偿策略——设计规范")).toBe(true)
    expect(stacksVertically("“核心”指标")).toBe(true)
    expect(stacksVertically("投入（万元）")).toBe(true)
    expect(stacksVertically("第一季度、第二季度")).toBe(true)
  })

  it("stacks digits and spaces riding along with a square script", () => {
    expect(stacksVertically("2026 年营收")).toBe(true)
    expect(stacksVertically("客户 洞察")).toBe(true)
  })

  it("refuses a label with no square glyph at all, however punctuated", () => {
    // Digits, spaces and punctuation are companions, never the whole label —
    // a stacked "2026" is debris, not a title.
    expect(stacksVertically("")).toBe(false)
    expect(stacksVertically("2026")).toBe(false)
    expect(stacksVertically("   ")).toBe(false)
    expect(stacksVertically("——")).toBe(false)
    expect(stacksVertically("%")).toBe(false)
  })
})

describe("isCjk", () => {
  it("is true when the string carries a square-script glyph", () => {
    expect(isCjk("风电行业的取数链路仍在打磨")).toBe(true)
    expect(isCjk("K8s 托管")).toBe(true)
    expect(isCjk("売上高")).toBe(true)
  })

  it("is false for Latin-only callout copy", () => {
    expect(isCjk("The data path still needs another quarter of work.")).toBe(false)
    expect(isCjk("Risk")).toBe(false)
    expect(isCjk("")).toBe(false)
  })
})

describe("stacksVertically purity", () => {
  it("is a pure function of the string — same input, same answer, no hidden state", () => {
    // The regexes are module-level; a `lastIndex` leak from a stateful (`/g`)
    // regex would make the second call disagree with the first.
    for (const sample of ["资产投入", "Tempo", "K8s 托管", "2026 年营收"]) {
      const first = stacksVertically(sample)
      expect(stacksVertically(sample)).toBe(first)
      expect(stacksVertically(sample)).toBe(first)
    }
  })
})
