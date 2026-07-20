import { describe, expect, it } from "vitest"
import {
  fitSvgLine,
  layoutSvgText,
  measureTextUnits,
  truncateToUnits,
} from "./svg-text-layout"

describe("svg text layout", () => {
  it("wraps long mixed CJK title into bounded lines", () => {
    const layout = layoutSvgText(
      "平台架构演进 — 从单体到云原生的技术实践（紫蓝渐变背景）",
      {
        maxWidth: 1088,
        fontSize: 92,
        maxLines: 2,
      }
    )

    expect(layout.lines.length).toBeLessThanOrEqual(2)
    expect(layout.lines.join("")).toContain("平台架构演进")
    expect(layout.fontSize).toBeLessThanOrEqual(92)
  })

  it("scales a single line down when one line is required", () => {
    const layout = layoutSvgText(
      "very-long-file-name-for-quarterly-review.pptx",
      {
        maxWidth: 320,
        fontSize: 40,
        maxLines: 1,
      }
    )

    expect(layout.lines).toHaveLength(1)
    expect(layout.fontSize).toBeLessThan(40)
  })

  it("treats CJK characters as wider than Latin letters", () => {
    expect(measureTextUnits("容量评估")).toBeGreaterThan(
      measureTextUnits("opsx")
    )
  })
})

describe("truncateToUnits", () => {
  it("returns short text unchanged", () => {
    expect(truncateToUnits("短", 10)).toBe("短")
  })
  it("truncates and appends ellipsis within budget", () => {
    const out = truncateToUnits("微服务架构下的分布式事务一致性", 6)
    expect(out.endsWith("…")).toBe(true)
    expect(measureTextUnits(out)).toBeLessThanOrEqual(6)
  })
  it("returns empty string when even the ellipsis exceeds the budget", () => {
    const out = truncateToUnits("任意文本", 0.3)
    expect(out).toBe("")
    expect(measureTextUnits(out)).toBeLessThanOrEqual(0.3)
  })
  it("returns bare ellipsis when budget exactly covers its cost", () => {
    const out = truncateToUnits("任意文本", 0.46)
    expect(out).toBe("…")
    expect(measureTextUnits(out)).toBeLessThanOrEqual(0.46)
  })
})

describe("fitSvgLine", () => {
  it("keeps font size when text fits", () => {
    expect(fitSvgLine("OK", { maxWidth: 200, fontSize: 20 })).toEqual({ text: "OK", fontSize: 20 })
  })
  it("shrinks font down to the floor before truncating", () => {
    const r = fitSvgLine("一二三四五六七八九十", { maxWidth: 120, fontSize: 20, minFontSize: 12 })
    expect(r.fontSize).toBe(12)
    expect(r.text).toBe("一二三四五六七八九十") // 10 单位 × 12 = 120，恰好放下
  })
  it("truncates at the floor when still too wide", () => {
    const r = fitSvgLine("一二三四五六七八九十一二", { maxWidth: 120, fontSize: 20, minFontSize: 12 })
    expect(r.fontSize).toBe(12)
    expect(r.text.endsWith("…")).toBe(true)
    expect(measureTextUnits(r.text) * 12).toBeLessThanOrEqual(120)
  })

  // Regression for the in-browser getBBox audit (Task 12): callers that
  // render the fitted line with an SVG `letterSpacing` attribute (every
  // theme's section-label "kicker" does, e.g. `Chapter 01 · <section>`) add
  // (charCount - 1) * letterSpacing extra real px that the unit-based
  // estimate below didn't know about, so long labels overflowed past the
  // page in a real browser despite passing the estimator-only audit.
  it("shrinks harder to leave room for letterSpacing", () => {
    const withoutSpacing = fitSvgLine("一二三四五六七八九十", { maxWidth: 200, fontSize: 20 })
    const withSpacing = fitSvgLine("一二三四五六七八九十", {
      maxWidth: 200,
      fontSize: 20,
      letterSpacing: 4,
    })
    // 10 chars → 9 gaps × 4px = 36px of letterSpacing to budget out of 200.
    expect(withSpacing.fontSize).toBeLessThan(withoutSpacing.fontSize)
    const charCount = 10
    const totalWidth =
      measureTextUnits(withSpacing.text) * withSpacing.fontSize +
      (charCount - 1) * 4
    expect(totalWidth).toBeLessThanOrEqual(200)
  })

  it("truncates harder (not just shrinks) when letterSpacing alone would blow the budget at the floor", () => {
    const r = fitSvgLine("一二三四五六七八九十一二三四五六七八九十", {
      maxWidth: 120,
      fontSize: 20,
      minFontSize: 12,
      letterSpacing: 4,
    })
    expect(r.fontSize).toBe(12)
    const charCount = Array.from(r.text).length
    const totalWidth = measureTextUnits(r.text) * 12 + Math.max(0, charCount - 1) * 4
    expect(totalWidth).toBeLessThanOrEqual(120)
  })

  it("is a no-op when letterSpacing is omitted (existing callers unaffected)", () => {
    const withDefault = fitSvgLine("一二三四五六七八九十", { maxWidth: 120, fontSize: 20, minFontSize: 12 })
    const explicitZero = fitSvgLine("一二三四五六七八九十", {
      maxWidth: 120,
      fontSize: 20,
      minFontSize: 12,
      letterSpacing: 0,
    })
    expect(explicitZero).toEqual(withDefault)
  })
})

describe("layoutSvgText balanceLines (widow avoidance)", () => {
  // 用户复验 backlog#3：emerald 封面「年度战略回顾」在 360px/64px 下贪心断行成
  // 「年度战略回」+「顾」——孤字末行。balanceLines 按 total/N 预算重排为 3+3。
  it("re-balances a CJK widow into even lines when enabled", () => {
    const r = layoutSvgText("年度战略回顾", {
      maxWidth: 360,
      fontSize: 64,
      maxLines: 3,
      balanceLines: true,
    })
    expect(r.lines).toEqual(["年度战", "略回顾"])
    expect(r.fontSize).toBe(64)
  })

  it("keeps the greedy wrap by default (existing callers unaffected)", () => {
    const r = layoutSvgText("年度战略回顾", { maxWidth: 360, fontSize: 64, maxLines: 3 })
    expect(r.lines).toEqual(["年度战略回", "顾"])
  })

  it("balances space-delimited text without splitting words", () => {
    // 贪心：["Alpha Beta Gamma Delta", "X"]（孤词末行）。平衡预算从
    // max(total/2, 最长词) 起步，逐步放宽，绝不触发 splitLongToken 拆词。
    const r = layoutSvgText("Alpha Beta Gamma Delta X", {
      maxWidth: 806.4, // 12.6 units × 64px
      fontSize: 64,
      maxLines: 2,
      balanceLines: true,
    })
    expect(r.lines.length).toBe(2)
    const greedyLast = "X"
    expect(r.lines[1]).not.toBe(greedyLast)
    for (const line of r.lines) {
      expect(line.split(" ").every((w) => "Alpha Beta Gamma Delta X".includes(w))).toBe(true)
    }
  })

  it("leaves explicit newlines alone", () => {
    const r = layoutSvgText("年度战略回\n顾", {
      maxWidth: 360,
      fontSize: 64,
      maxLines: 3,
      balanceLines: true,
    })
    expect(r.lines).toEqual(["年度战略回", "顾"])
  })

  it("does not rebalance when the last line is reasonably full", () => {
    // 「微服务架构下的分布式一致」12 字在 5.625 units 预算下 5+5+2？——用 2 行
    // 且末行 ≥ 50% 最宽行的用例：8 字 → 5+3，3/5=0.6 ≥ 0.5，保持贪心结果。
    const r = layoutSvgText("年度战略回顾报告", {
      maxWidth: 360,
      fontSize: 64,
      maxLines: 3,
      balanceLines: true,
    })
    expect(r.lines).toEqual(["年度战略回", "顾报告"])
  })
})
