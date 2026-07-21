import { describe, it, expect } from "vitest"
import { fitHeadingPt, fitHeadingLines, visualUnits } from "./heading-fit"
import { measureTextUnits } from "../lib/svg-text-layout"

describe("heading-fit", () => {
  it("counts CJK wider than ascii", () => {
    expect(visualUnits("中文")).toBeGreaterThan(visualUnits("ab"))
  })

  // S3e: same-class fix as S3c's svg-text-layout.ts WIDE_CHAR_RE fix
  // (3f752de0) — this file keeps its own, independent CJK-weight table
  // (`visualUnits`'s CJK weight is 1.2 per char, not measureTextUnits' 1.0
  // — see capacity.ts's own note that the two are separate tables), so
  // S3c's fix to the *other* file never touched this one's identical gap.
  it("weights an em dash the same as a CJK ideograph, not the narrow 'other' bucket", () => {
    // Before the fix, "——" (doubled EM DASH, U+2014, the idiomatic CJK
    // long-dash mark) fell through to the narrow "other" 0.56/char weight
    // instead of the 1.2/char CJK-wide weight every ideograph in this range
    // already gets — undercounting a heading's true rendered width by more
    // than half whenever it contained an em dash.
    expect(visualUnits("——")).toBeCloseTo(visualUnits("中中"), 5)
  })

  it("weights curly quotes the same as a CJK ideograph, not the narrow 'other' bucket", () => {
    // U+2018-U+201F: the quotation-mark sub-block of General Punctuation
    // (curly single/double quotes) — same gap as the em dash above.
    expect(visualUnits("“”")).toBeCloseTo(visualUnits("中中"), 5)
    expect(visualUnits("‘’")).toBeCloseTo(visualUnits("中中"), 5)
  })

  it("sizes a heading with an em dash the same as an equal-length pure-CJK heading", () => {
    // Regression lock for the fix above: fitHeadingPt derives its font size
    // from visualUnits, so an undercounted em dash used to let a heading
    // like this compute a font size too large to actually fit — the exact
    // bug class S3c fixed for measureTextUnits, now closed here too.
    const withDash = "系统吞吐量提升——显著"
    const pureCjk = "系统吞吐量提升显著显著" // same char count, all CJK-wide
    expect(Array.from(withDash).length).toBe(Array.from(pureCjk).length)
    const ptWithDash = fitHeadingPt(withDash, { widthIn: 8, maxPt: 84, minPt: 20 })
    const ptPureCjk = fitHeadingPt(pureCjk, { widthIn: 8, maxPt: 84, minPt: 20 })
    expect(ptWithDash).toBe(ptPureCjk)
  })

  it("returns maxPt for empty text", () => {
    expect(fitHeadingPt("", { widthIn: 10, maxPt: 80 })).toBe(80)
  })

  it("shrinks a long heading below maxPt but not below minPt", () => {
    const long = "这是一个相当长的中文标题用于测试自动缩小字号到容器宽度以内不溢出"
    const pt = fitHeadingPt(long, { widthIn: 8, maxPt: 84, minPt: 40 })
    expect(pt).toBeLessThan(84)
    expect(pt).toBeGreaterThanOrEqual(40)
  })
})

describe("fitHeadingLines", () => {
  it("keeps a short heading on one line at the requested size", () => {
    const r = fitHeadingLines("年度战略回顾", { maxWidth: 1088, fontSize: 84, maxLines: 2, minPt: 40 })
    expect(r.lines).toEqual(["年度战略回顾"])
    expect(r.fontSize).toBe(84)
    // truncation-visibility wave, Task 2: every heading that merely shrinks
    // (or fits outright) must report `truncated: false` — the render layer
    // reads this to skip `data-truncated`, so a false positive here would
    // mark a perfectly-fitting heading as content-loss.
    expect(r.truncated).toBe(false)
  })

  // Decision (Task 9 review): the px-based fitHeadingLines model is intended
  // to keep a heading at its design max size whenever it genuinely fits —
  // even across 2 lines — rather than pre-emptively shrinking like the old
  // pt/in×1.2-weight fitHeadingPt curve did. A 12-CJK-char heading at 84px is
  // 1008px wide, which fits inside 1088px on one line, so it must NOT shrink.
  // 旧 pt 模型过度收缩，px 模型与审计器同源（同一 measureTextUnits），放得下就不缩。
  it("keeps a mid-length heading at max size on one line when it genuinely fits", () => {
    const mid12 = "微服务架构下的分布式事务" // 12 CJK chars, 12 units at 1 unit/char
    const r = fitHeadingLines(mid12, { maxWidth: 1088, fontSize: 84, maxLines: 2, minPt: 40 })
    expect(r.lines).toEqual([mid12])
    expect(r.fontSize).toBe(84)
  })

  it("keeps a mid-length heading at max size but wraps to 2 balanced lines once it no longer fits on one", () => {
    const mid14 = "微服务架构下的分布式事务一致" // 14 CJK chars — 1 char over the 1-line budget
    const r = fitHeadingLines(mid14, { maxWidth: 1088, fontSize: 84, maxLines: 2, minPt: 40 })
    // 贪心断行是 12+2（「一致」孤行）——widow avoidance 重排为 7+7，字号不变。
    expect(r.lines).toEqual(["微服务架构下的", "分布式事务一致"])
    expect(r.fontSize).toBe(84)
  })

  it("avoids a single-character widow on the emerald cover title (backlog#3)", () => {
    // 复验报告原样：360px 列宽 / 64px 字号下「年度战略回顾」曾断成
    // 「年度战略回」+「顾」。平衡后 3+3，字号维持 64。
    const r = fitHeadingLines("年度战略回顾", {
      maxWidth: 360,
      fontSize: 64,
      maxLines: 3,
      minPt: 32,
    })
    expect(r.lines).toEqual(["年度战", "略回顾"])
    expect(r.fontSize).toBe(64)
  })

  it("wraps a pathologically long CJK heading within maxWidth even at the floor", () => {
    // Single-line fitHeadingPt would clamp to minPt and still overflow width
    // for content this long — fitHeadingLines must wrap to >1 line and keep
    // every line's rendered width within maxWidth (self-consistent with the
    // overflow auditor's measureTextUnits-based width formula).
    const long =
      "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"
    const r = fitHeadingLines(long, { maxWidth: 1088, fontSize: 84, maxLines: 2, minPt: 40 })
    expect(r.lines.length).toBeGreaterThan(1)
    expect(r.lines.length).toBeLessThanOrEqual(2)
    for (const line of r.lines) {
      expect(measureTextUnits(line) * r.fontSize).toBeLessThanOrEqual(1088 + 1)
    }
  })

  it("falls back to truncation with an ellipsis when even the floor can't fit two lines", () => {
    const long =
      "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明微服务架构下的分布式事务一致性保障机制"
    const r = fitHeadingLines(long, { maxWidth: 300, fontSize: 84, maxLines: 2, minPt: 40 })
    expect(r.lines.join("")).toContain("…")
    for (const line of r.lines) {
      expect(measureTextUnits(line) * r.fontSize).toBeLessThanOrEqual(300 + 1)
    }
    // truncation-visibility wave, Task 2: the one gap `ir-quality.ts`'s
    // long_heading comment recorded — `fitHeadingLines`'s internal
    // `truncateToUnits` cut used to be invisible outside this module. The
    // render layer (every archetype's heading `<text>`) and `deck-audit.ts`'s
    // generic `[data-truncated="1"]` reader both key off this flag.
    expect(r.truncated).toBe(true)
  })

  // Review fix round — Critical 1: `truncated` used to be set unconditionally
  // on taking the `minPt`-floor branch, without checking whether
  // `truncateToUnits` actually dropped a character. `budget` (a flat
  // per-line-average units ceiling) and the balanced-wrap fontSize
  // computation `first.fontSize < minPt` gates on are different formulas —
  // a heading can fail that fontSize check yet still measure under `budget`
  // once re-wrapped at `minPt`, so it renders in full with no ellipsis. Real
  // production params (cover-fashion-masthead.tsx): maxWidth 1168, fontSize
  // 150, maxLines 2, minPt 72 — the archetype with the least shrink headroom
  // in the whole codebase (ir-quality.ts's own survey), so the easiest place
  // to hit this false positive.
  it("does not report truncated when the minPt-floor branch fires but no character is actually dropped", () => {
    // 30 CJK chars — takes the minPt-floor branch (its balanced-wrap fontSize
    // comes in under 72) but measures well under the 32.4-unit budget once
    // re-wrapped at minPt, so truncateToUnits returns it unchanged.
    const plain = "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及"
    const r = fitHeadingLines(plain, { maxWidth: 1168, fontSize: 150, maxLines: 2, minPt: 72 })
    expect(r.fontSize).toBe(72) // did take the minPt-floor branch
    expect(r.lines.join("")).not.toContain("…") // but nothing was cut
    expect(r.lines.join("")).toBe(plain) // full text survives, unaltered
    expect(r.truncated).toBe(false)
  })
})
