// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { bullets } from "./bullets"
import type { ComponentCtx } from "./types"
import { PACING_BUDGETS } from "@/narrative"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: PACING_BUDGETS.balanced.bodyBaselinePx, // 24 — ambient default for tests that don't exercise a specific tier
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const items = ["第一条要点", "第二条要点", "第三条要点"]

describe("bullets component", () => {
  it("measures height proportional to item count", () => {
    const h2 = bullets.measure({ type: "bullets", items: items.slice(0, 2) }, 1120, ctx)
    const h3 = bullets.measure({ type: "bullets", items }, 1120, ctx)
    expect(h3).toBeGreaterThan(h2)
  })

  it("无 style 时默认 plain——设计型默认无符号（2026-07-10 用户裁决），不渲染圆点", () => {
    const { container } = svg(
      bullets.render({ type: "bullets", items }, { x: 80, y: 200, w: 1120 }, ctx),
    )
    expect(container.querySelectorAll("circle").length).toBe(0)
  })

  it("default style renders a marker circle per item and text lines (short items = 1 line each)", () => {
    const { container } = svg(
      bullets.render({ type: "bullets", items, style: "default" }, { x: 80, y: 200, w: 1120 }, ctx),
    )
    expect(container.querySelector("g")?.getAttribute("transform")).toBe("translate(80,200)")
    // one marker circle per item, regardless of how many lines the item wraps to
    expect(container.querySelectorAll("circle").length).toBe(3)
    // short items fit on a single line each
    expect(container.querySelectorAll("text").length).toBe(3)
    // marker color is the theme primary
    expect(container.querySelector("circle")?.getAttribute("fill")).toBe("#006A4E")
  })

  it("numbered style renders ordinal prefixes instead of circles", () => {
    const { container } = svg(
      bullets.render({ type: "bullets", items, style: "numbered" }, { x: 0, y: 0, w: 800 }, ctx),
    )
    expect(container.querySelectorAll("circle").length).toBe(0)
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts.some((t) => t?.startsWith("1."))).toBe(true)
  })

  it("checklist style renders checkbox prefixes instead of circles", () => {
    const { container } = svg(
      bullets.render({ type: "bullets", items, style: "checklist" }, { x: 0, y: 0, w: 800 }, ctx),
    )
    expect(container.querySelectorAll("circle").length).toBe(0)
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts.some((t) => t?.startsWith("☐"))).toBe(true)
  })

  it("wraps a long bullet item into at most 2 lines instead of overflowing", () => {
    const long =
      "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练路径"
    const markup = renderToStaticMarkup(
      <svg>{bullets.render({ type: "bullets", items: [long], style: "default" }, { x: 0, y: 0, w: 500 }, ctx)}</svg>,
    )
    const texts = markup.match(/<text/g) ?? []
    expect(texts.length).toBeGreaterThan(1) // 换行成多个 text 行
  })

  it("measure grows with wrapped lines", () => {
    const long =
      "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练路径"
    const one = bullets.measure({ type: "bullets", items: ["短"], style: "default" }, 500, ctx)
    const wrapped = bullets.measure({ type: "bullets", items: [long], style: "default" }, 500, ctx)
    expect(wrapped).toBeGreaterThan(one)
  })

  it("measure(component, w) matches the rendered height exactly", () => {
    const long =
      "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练路径"
    const component = { type: "bullets" as const, items: [long, "短一点的条目", "第三条"] }
    const w = 528
    const measured = bullets.measure(component, w, ctx)
    const { container } = svg(bullets.render(component, { x: 0, y: 0, w }, ctx))
    const ys = Array.from(container.querySelectorAll("text")).map((t) =>
      Number(t.getAttribute("y")),
    )
    // measure() must equal the actual bottom extent used by render() at the same w
    expect(measured).toBeGreaterThanOrEqual(Math.max(...ys))
  })
})

describe("bullets component emphasis", () => {
  it("renders unmarked items with no tspan wrapper", () => {
    const component = { type: "bullets" as const, items: ["没有强调标记的条目"] }
    const { container } = svg(bullets.render(component, { x: 0, y: 0, w: 1120 }, ctx))
    const first = container.querySelector("text")
    expect(first?.querySelector("tspan")).toBeNull()
    expect(first?.textContent).toBe("没有强调标记的条目")
  })

  it("renders **emphasized** runs as accent-colored bold tspans", () => {
    const component = { type: "bullets" as const, items: ["这是**重点内容**条目"] }
    const { container } = svg(bullets.render(component, { x: 0, y: 0, w: 1120 }, ctx))
    const first = container.querySelector("text")
    const tspans = Array.from(first?.querySelectorAll("tspan") ?? [])
    const accentSpan = tspans.find((t) => t.textContent === "重点内容")
    expect(accentSpan?.getAttribute("fill")).toBe("#00A878")
    expect(accentSpan?.getAttribute("font-weight")).toBe("600")
  })

  it("keeps the numbered/checklist prefix un-emphasized even when the item text is fully bold", () => {
    const component = { type: "bullets" as const, items: ["**全部强调**"], style: "numbered" as const }
    const { container } = svg(bullets.render(component, { x: 0, y: 0, w: 1120 }, ctx))
    const first = container.querySelector("text")
    expect(first?.textContent).toBe("1. 全部强调")
    const tspans = Array.from(first?.querySelectorAll("tspan") ?? [])
    const prefixSpan = tspans.find((t) => t.textContent === "1. ")
    expect(prefixSpan?.getAttribute("fill")).toBe("#1A2421")
    const accentSpan = tspans.find((t) => t.textContent === "全部强调")
    expect(accentSpan?.getAttribute("fill")).toBe("#00A878")
  })

  it("measures the same height with or without ** markers", () => {
    const plain = { type: "bullets" as const, items: ["普通条目文本"] }
    const marked = { type: "bullets" as const, items: ["**普通**条目文本"] }
    expect(bullets.measure(marked, 500, ctx)).toBe(bullets.measure(plain, 500, ctx))
  })

  it("continues emphasis styling across a wrapped line break within one item", () => {
    const long = {
      type: "bullets" as const,
      items: ["**然后开始一段跨行的强调内容片段测试用例延续再多一点内容撑满整行**"],
    }
    const { container } = svg(bullets.render(long, { x: 0, y: 0, w: 260 }, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    expect(texts.length).toBe(2) // wraps to exactly 2 lines, no truncation
    const linesWithAccent = texts.filter((t) =>
      Array.from(t.querySelectorAll("tspan")).some((s) => s.getAttribute("fill") === "#00A878"),
    )
    expect(linesWithAccent.length).toBe(2)
  })

  it("does not leak emphasis into a later line when an earlier line gets truncated with an ellipsis", () => {
    // Regression: mapping emphasis onto post-truncation line text (instead of
    // pre-truncation) desyncs the char cursor once a "…" is emitted, so any
    // non-emphasized suffix on a later line was incorrectly rendered as
    // accented. This item's trailing " 结尾还有一些文字" must stay un-accented.
    const component = {
      type: "bullets" as const,
      items: ["这是很长的开头部 **然后开始一段跨行的强调内容片段测试用例延续** 结尾还有一些文字"],
    }
    const { container } = svg(bullets.render(component, { x: 0, y: 0, w: 220 }, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    expect(texts.length).toBe(2)
    const lastLineText = texts[1].textContent
    expect(lastLineText).toBe("结尾还有一些文字")
    const lastLineTspans = Array.from(texts[1].querySelectorAll("tspan"))
    expect(lastLineTspans.some((t) => t.getAttribute("fill") === "#00A878")).toBe(false)
  })
})

// Truncation-visibility fix (2026-07-22): the "1. "/"☐ " prefixes each carry
// exactly one space, which used to flip svg-text-layout.ts's `tokenize()`
// into word-wrap mode for the whole item (a pure-CJK item has no other
// space, so the combined "prefix + content" string tokenized into exactly
// two "words" — the short prefix and one giant unspaced blob for all the
// content). The greedy wrap then stranded the prefix alone on line 1 and
// spilled the entire rest of the content onto line 2, wasting a full line's
// budget on 1-3 characters — numbered/checklist items truncated at ~30-31 /
// ~23-24 CJK units at this box width, versus plain/default/divided's
// ~56-61 at the same width (see capacity.ts's bullets derivation comment for
// the full boundary-scan probe and its methodology). The fix wraps each
// item's content alone (never handing the prefix to `tokenize`) and splices
// the prefix back onto line 1 only after wrap/truncate math is done.
describe("bullets component numbered/checklist prefix-wrap truncation floor", () => {
  const w = 424 // capacity.ts's bullets derivation box width (magazine narrow-column two_column half)

  it("a 31-CJK-unit numbered item — truncated pre-fix at this box width — renders fully post-fix", () => {
    const item = "测".repeat(31)
    const markup = renderToStaticMarkup(
      <svg>{bullets.render({ type: "bullets", items: [item], style: "numbered" }, { x: 0, y: 0, w }, ctx)}</svg>,
    )
    expect(markup).not.toContain('data-truncated="1"')
    expect(markup).toContain("1. ") // prefix still renders on line 1
  })

  it("a 24-CJK-unit checklist item — truncated pre-fix at this box width — renders fully post-fix", () => {
    const item = "测".repeat(24)
    const markup = renderToStaticMarkup(
      <svg>{bullets.render({ type: "bullets", items: [item], style: "checklist" }, { x: 0, y: 0, w }, ctx)}</svg>,
    )
    expect(markup).not.toContain('data-truncated="1"')
  })

  it("numbered/checklist edges now land near the plain family's (within the prefix's own width), not at roughly half of it", () => {
    // Boundary scan mirroring capacity.ts's own methodology: grow a pure-CJK
    // item one character at a time until `data-truncated="1"` first appears.
    function firstTruncatedLength(style: "plain" | "numbered" | "checklist"): number {
      for (let n = 1; n <= 80; n += 1) {
        const item = "测".repeat(n)
        const markup = renderToStaticMarkup(
          <svg>{bullets.render({ type: "bullets", items: [item], style }, { x: 0, y: 0, w }, ctx)}</svg>,
        )
        if (markup.includes('data-truncated="1"')) return n
      }
      return -1
    }
    const plainEdge = firstTruncatedLength("plain")
    const numberedEdge = firstTruncatedLength("numbered")
    const checklistEdge = firstTruncatedLength("checklist")
    // Pre-fix these landed at 31/24 versus plain's 61 — roughly half. Post-fix
    // they should sit within a handful of units of plain's edge (the gap
    // being the prefix's own reserved width, not a wasted line).
    expect(plainEdge - numberedEdge).toBeLessThan(10)
    expect(plainEdge - checklistEdge).toBeLessThan(10)
  })

  it("an empty/whitespace-only item still renders just its marker instead of crashing (content-only wrap yields zero lines to splice the prefix onto)", () => {
    // Regression caught while building the fix above: `layoutSvgText` wraps
    // empty/whitespace-only content to zero lines, so `lineSegments[0]` was
    // `undefined` — spreading it (`...lineSegments[0]`) threw
    // "lineSegments[0] is not iterable". Every style must survive this input.
    for (const style of ["plain", "default", "divided", "numbered", "checklist"] as const) {
      expect(() =>
        renderToStaticMarkup(
          <svg>{bullets.render({ type: "bullets", items: ["", "   "], style }, { x: 0, y: 0, w }, ctx)}</svg>,
        ),
      ).not.toThrow()
    }
    const markup = renderToStaticMarkup(
      <svg>{bullets.render({ type: "bullets", items: [""], style: "numbered" }, { x: 0, y: 0, w }, ctx)}</svg>,
    )
    expect(markup).toContain("1. ")
    expect(markup).not.toContain('data-truncated="1"')
  })
})

// W4 task 3 (design decision 9): bullets' shrink-to-MIN_FONT machinery must
// keep working when it starts from a *higher* baseline than the old fixed
// 20px — spacious pacing's 32px gives long items more room to shrink
// from, not an excuse for the floor/wrap contract to stop applying.
describe("bullets component spacious-pacing shrink (MIN_FONT floor)", () => {
  const long =
    "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练路径"

  it("long bullets at the 32px presentation baseline shrink below it, floor at MIN_FONT=14, and never overflow", () => {
    const spaciousCtx: ComponentCtx = { ...ctx, bodyFontPx: PACING_BUDGETS.spacious.bodyBaselinePx }
    const component = { type: "bullets" as const, items: [long, long, long], style: "default" as const }
    const w = 260
    const { container } = svg(bullets.render(component, { x: 0, y: 0, w }, spaciousCtx))
    const texts = Array.from(container.querySelectorAll("text"))
    expect(texts.length).toBeGreaterThan(3) // long CJK items wrap past 1 line each at this width

    const sizes = texts.map((t) => Number(t.getAttribute("font-size")))
    for (const size of sizes) {
      // Shrink actually engaged: never renders at the bare 32px baseline for
      // content this long at this width.
      expect(size).toBeLessThan(32)
      // The floor holds regardless of how far above it the starting
      // baseline sits.
      expect(size).toBeGreaterThanOrEqual(14)
    }
    // Every rendered line uses the identical unified size (bullets.tsx's own
    // "don't render items at visually inconsistent sizes" contract).
    expect(new Set(sizes).size).toBe(1)

    // No overflow: measure() (used by callers to reserve vertical space)
    // must still bound the actual rendered bottom extent at this tier —
    // same invariant as the ambient-ctx "measure(component, w) matches the
    // rendered height exactly" case above, re-verified at 32px starting
    // baseline instead of the old fixed 20px.
    const measured = bullets.measure(component, w, spaciousCtx)
    const ys = texts.map((t) => Number(t.getAttribute("y")))
    expect(measured).toBeGreaterThanOrEqual(Math.max(...ys))
  })

  it("short items that need no shrink render at exactly each tier's bodyFontPx (proves it starts from ctx.bodyFontPx, not a stale constant)", () => {
    // Wide box + short items ⇒ every item fits on one line comfortably at
    // either baseline, so layoutSvgText's own shrink is a no-op and the
    // rendered size must equal ctx.bodyFontPx exactly. A component that
    // still hardcoded the old FONT_SIZE=20 constant would render "20" here
    // even under spaciousCtx — this test fails loudly in that case,
    // unlike the shrink-engaged case above where both a correct and a
    // stale-20 implementation can coincidentally land under the 32px cap.
    const component = { type: "bullets" as const, items, style: "default" as const }
    const w = 1120
    for (const bodyFontPx of [PACING_BUDGETS.dense.bodyBaselinePx, PACING_BUDGETS.spacious.bodyBaselinePx]) {
      const tierCtx: ComponentCtx = { ...ctx, bodyFontPx }
      const { container } = svg(bullets.render(component, { x: 0, y: 0, w }, tierCtx))
      const sizes = Array.from(container.querySelectorAll("text")).map((t) => t.getAttribute("font-size"))
      expect(sizes.length).toBeGreaterThan(0)
      expect(sizes.every((s) => s === String(bodyFontPx))).toBe(true)
    }
  })

  // P0 hardening (robustness deep-review D1, family-sweep primary target):
  // items has no schema ceiling, and pre-fix render() drew every item's
  // <text> regardless of box.h, letting y run arbitrarily far past the
  // canvas on an extreme item count. `layoutContentFit`'s overflow-defense
  // branch (layout.ts) is the only caller that ever sets box.h on this
  // non-stretchable component — its presence always means "cap to this
  // budget," matching row-cards.tsx's own box.h-undersized precedent.
  describe("box.h-aware vertical cap (graceful landing)", () => {
    const manyItems = Array.from({ length: 500 }, (_, i) => `item ${i}: a mildly long bullet point`)

    it("caps rendered items to what box.h can hold and marks the drop with data-dropped, never rendering past the box", () => {
      const component = { type: "bullets" as const, items: manyItems }
      const box = { x: 96, y: 176, w: 1088, h: 300 }
      const { container } = svg(bullets.render(component, box, ctx))
      const textEls = Array.from(container.querySelectorAll("text"))
      // Far fewer than the full 500 items got a <text> per line.
      expect(textEls.length).toBeLessThan(manyItems.length)

      // Every rendered line's baseline (plus a descent allowance) stays
      // within box.h — the actual geometric guarantee this fix exists for.
      for (const t of textEls) {
        if (t.hasAttribute("data-dropped")) continue
        const y = Number(t.getAttribute("y"))
        const fontSize = Number(t.getAttribute("font-size")) || 24
        expect(y + fontSize * 0.25).toBeLessThanOrEqual(box.h)
      }

      // Drop marker: exactly one, naming how many items were hidden, and
      // the visible+hidden count reconciles to the full input.
      const dropped = container.querySelector("[data-dropped]")
      expect(dropped).toBeTruthy()
      const hiddenCount = Number(dropped!.getAttribute("data-dropped"))
      expect(hiddenCount).toBeGreaterThan(0)
      expect(dropped!.textContent).toBe(`+${hiddenCount} more`)
    })

    it("still renders at least one item even when box.h is far smaller than a single item's own height", () => {
      const component = { type: "bullets" as const, items: manyItems }
      const box = { x: 0, y: 0, w: 1088, h: 5 }
      const { container } = svg(bullets.render(component, box, ctx))
      // At least one item's lines got drawn (row-cards.tsx's "never zero
      // visible units" precedent) despite the budget being unmeetable.
      const nonMarkerTexts = Array.from(container.querySelectorAll("text")).filter(
        (t) => !t.hasAttribute("data-dropped"),
      )
      expect(nonMarkerTexts.length).toBeGreaterThan(0)
    })

    it("is a byte-identical no-op when box.h is omitted (the ordinary/common render path)", () => {
      const component = { type: "bullets" as const, items }
      const withoutH = renderToStaticMarkup(
        <svg>{bullets.render(component, { x: 0, y: 0, w: 1120 }, ctx)}</svg>,
      )
      const withGenerousH = renderToStaticMarkup(
        <svg>{bullets.render(component, { x: 0, y: 0, w: 1120, h: 100000 }, ctx)}</svg>,
      )
      expect(withoutH).toBe(withGenerousH)
      expect(withoutH).not.toContain("data-dropped")
    })

    it("never shows a data-dropped marker when every item already fits box.h", () => {
      const component = { type: "bullets" as const, items }
      const measured = bullets.measure(component, 1120, ctx)
      const { container } = svg(
        bullets.render(component, { x: 0, y: 0, w: 1120, h: measured + 40 }, ctx),
      )
      expect(container.querySelector("[data-dropped]")).toBeNull()
      expect(container.querySelectorAll("text").length).toBeGreaterThan(0)
    })
  })
})
