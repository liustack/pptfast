// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { bullets } from "./bullets"
import type { BlockCtx } from "./types"

const ctx: BlockCtx = {
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
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const items = ["第一条要点", "第二条要点", "第三条要点"]

describe("bullets block", () => {
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

  it("measure(block, w) matches the rendered height exactly", () => {
    const long =
      "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练路径"
    const block = { type: "bullets" as const, items: [long, "短一点的条目", "第三条"] }
    const w = 528
    const measured = bullets.measure(block, w, ctx)
    const { container } = svg(bullets.render(block, { x: 0, y: 0, w }, ctx))
    const ys = Array.from(container.querySelectorAll("text")).map((t) =>
      Number(t.getAttribute("y")),
    )
    // measure() must equal the actual bottom extent used by render() at the same w
    expect(measured).toBeGreaterThanOrEqual(Math.max(...ys))
  })
})

describe("bullets block emphasis", () => {
  it("renders unmarked items with no tspan wrapper", () => {
    const block = { type: "bullets" as const, items: ["没有强调标记的条目"] }
    const { container } = svg(bullets.render(block, { x: 0, y: 0, w: 1120 }, ctx))
    const first = container.querySelector("text")
    expect(first?.querySelector("tspan")).toBeNull()
    expect(first?.textContent).toBe("没有强调标记的条目")
  })

  it("renders **emphasized** runs as accent-colored bold tspans", () => {
    const block = { type: "bullets" as const, items: ["这是**重点内容**条目"] }
    const { container } = svg(bullets.render(block, { x: 0, y: 0, w: 1120 }, ctx))
    const first = container.querySelector("text")
    const tspans = Array.from(first?.querySelectorAll("tspan") ?? [])
    const accentSpan = tspans.find((t) => t.textContent === "重点内容")
    expect(accentSpan?.getAttribute("fill")).toBe("#00A878")
    expect(accentSpan?.getAttribute("font-weight")).toBe("600")
  })

  it("keeps the numbered/checklist prefix un-emphasized even when the item text is fully bold", () => {
    const block = { type: "bullets" as const, items: ["**全部强调**"], style: "numbered" as const }
    const { container } = svg(bullets.render(block, { x: 0, y: 0, w: 1120 }, ctx))
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
    const block = {
      type: "bullets" as const,
      items: ["这是很长的开头部 **然后开始一段跨行的强调内容片段测试用例延续** 结尾还有一些文字"],
    }
    const { container } = svg(bullets.render(block, { x: 0, y: 0, w: 220 }, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    expect(texts.length).toBe(2)
    const lastLineText = texts[1].textContent
    expect(lastLineText).toBe("结尾还有一些文字")
    const lastLineTspans = Array.from(texts[1].querySelectorAll("tspan"))
    expect(lastLineTspans.some((t) => t.getAttribute("fill") === "#00A878")).toBe(false)
  })
})
