// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { measureTextUnits } from "../../lib/svg-text-layout"
import { iconCards, iconCardContentHeight } from "./icon-cards"
import type { BlockCtx } from "./types"
import { CANONICAL_THEME_IDS, resolveStyle } from "../../themes"
import { buildCtx } from "../FullSlideSvg"

const ctx: BlockCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E", "#00A878"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

function card(title: string, text: string) {
  return { icon: "rocket", title, text }
}

const block = {
  type: "icon_cards" as const,
  items: [
    card("断言一", "简短说明一"),
    card("断言二", "简短说明二"),
    card("断言三", "简短说明三"),
    card("断言四", "简短说明四"),
  ],
}

describe("icon_cards block: measure", () => {
  it("grows card height when an item's text wraps to 2 lines vs 1", () => {
    const oneLine = {
      type: "icon_cards" as const,
      items: [card("断言", "短"), card("断言", "短")],
    }
    const twoLines = {
      type: "icon_cards" as const,
      items: [
        card(
          "断言",
          "这是一段足够长的说明文字，会在给定的卡片宽度下换行到第二行显示"
        ),
        card("断言", "短"),
      ],
    }
    const h1 = iconCards.measure(oneLine, 600, ctx)
    const h2 = iconCards.measure(twoLines, 600, ctx)
    expect(h2).toBeGreaterThan(h1)
  })

  it("takes the tallest item's content height for all 4 equal-width cards", () => {
    const mixed = {
      type: "icon_cards" as const,
      items: [
        card("断言一", "短"),
        card(
          "断言二",
          "这是一段足够长的说明文字，会在给定的卡片宽度下换行到第二行显示"
        ),
        card("断言三", "短"),
        card("断言四", "短"),
      ],
    }
    const w = 1088
    const n = mixed.items.length
    const cardW = (w - 16 * (n - 1)) / n
    const contentW = cardW - 24 * 2 // PAD_X on each side (icon-cards.tsx)
    const PAD_TOP = 20
    const PAD_BOTTOM = 20
    const expectedH = Math.max(
      ...mixed.items.map(
        (item) => PAD_TOP + iconCardContentHeight(item, contentW) + PAD_BOTTOM
      )
    )
    expect(iconCards.measure(mixed, w, ctx)).toBeCloseTo(expectedH)
    // The wrapping item's own content height must be the binding one here
    // (2 lines strictly taller than every 1-line sibling).
    const wrappingH = iconCardContentHeight(mixed.items[1], contentW)
    const shortH = iconCardContentHeight(mixed.items[0], contentW)
    expect(wrappingH).toBeGreaterThan(shortH)
  })
})

describe("icon_cards block: render", () => {
  it("lays out 4 equal-width cards with x offset = i * (cardW + 16)", () => {
    const { container } = svg(
      iconCards.render(block, { x: 80, y: 100, w: 1088 }, ctx)
    )
    const cardRects = Array.from(container.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("rx") === "8"
    )
    expect(cardRects).toHaveLength(4)
    const n = block.items.length
    const cardW = (1088 - 16 * (n - 1)) / n
    cardRects.forEach((r, i) => {
      expect(Number(r.getAttribute("x"))).toBeCloseTo(i * (cardW + 16))
      expect(Number(r.getAttribute("width"))).toBeCloseTo(cardW)
    })
  })

  it("renders an accent bar, an icon, a title, and description text for every card", () => {
    const { container } = svg(
      iconCards.render(block, { x: 0, y: 0, w: 1088 }, ctx)
    )
    const accentBars = Array.from(container.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("height") === "3"
    )
    expect(accentBars).toHaveLength(4)
    accentBars.forEach((bar) => {
      expect(bar.getAttribute("fill")).toBe(ctx.colors.accent)
    })

    const paths = container.querySelectorAll("path")
    expect(paths.length).toBeGreaterThanOrEqual(4) // >=1 icon glyph per card

    const texts = Array.from(container.querySelectorAll("text"))
    for (const item of block.items) {
      expect(texts.some((t) => t.textContent === item.title)).toBe(true)
      expect(texts.some((t) => t.textContent === item.text)).toBe(true)
    }

    // Default path (no `titleFontSize` opt, i.e. every theme except bento's
    // own exploded-card renderer) renders titles at TITLE_FONT_SIZE=20 — a
    // direct lock so a future bento-only tweak (or an accidental default
    // change) can't silently drift the 5-theme standalone row layout. bento
    // itself asserts its own 22px override in templates/tech.test.tsx.
    const titleTexts = texts.filter((t) =>
      block.items.some((item) => item.title === t.textContent)
    )
    expect(titleTexts).toHaveLength(4)
    titleTexts.forEach((t) => {
      expect(t.getAttribute("font-size")).toBe("20")
    })
  })

  it("shrinks an overlong title to fit inside its card", () => {
    const longTitleBlock = {
      type: "icon_cards" as const,
      items: [
        card(
          "这是一句非常非常非常非常非常非常长的断言短句超出正常卡片宽度",
          "说明"
        ),
        card("短", "说明"),
      ],
    }
    const { container } = svg(
      iconCards.render(longTitleBlock, { x: 0, y: 0, w: 400 }, ctx)
    )
    // Titles are the only <text>s rendered with fontWeight="600" (text
    // lines use no font-weight), so this reliably targets the title
    // regardless of whether it also got truncated at the font-size floor.
    const titleText = Array.from(container.querySelectorAll("text")).find(
      (t) => t.getAttribute("font-weight") === "600"
    )!
    expect(Number(titleText.getAttribute("font-size"))).toBeLessThan(20)
  })

  it("annotates every card with its own page-coordinate data-audit-box", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {iconCards.render(block, { x: 80, y: 100, w: 1088 }, ctx)}
      </svg>
    )
    const root = parseSvgRoot(markup)
    const boxes = Array.from(root.querySelectorAll("[data-audit-box]"))
    expect(boxes).toHaveLength(4)
    const n = block.items.length
    const cardW = (1088 - 16 * (n - 1)) / n
    boxes.forEach((el, i) => {
      const [x, y, w] = (el.getAttribute("data-audit-box") ?? "")
        .split(",")
        .map(Number)
      expect(x).toBeCloseTo(80 + i * (cardW + 16))
      expect(y).toBe(100)
      expect(w).toBeCloseTo(cardW)
    })
  })

  it("stays within the controlled SVG subset (assertSubset)", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {iconCards.render(block, { x: 80, y: 100, w: 1088 }, ctx)}
      </svg>
    )
    expect(markup).not.toContain("foreignObject")
    expect(markup).not.toContain("linearGradient")
    expect(markup).not.toContain("url(#")
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })
})

describe("icon_cards card stroke (Task 5d)", () => {
  function cardRects(container: HTMLElement) {
    // 卡壳识别按尺寸而非 rx 值——shape token 开值后各主题 rx 不同
    // （luxe/runway 直角 0、enterprise 8），rx 不再是卡壳的判别特征。
    return Array.from(container.querySelectorAll("rect")).filter(
      (r) => Number(r.getAttribute("width") ?? 0) > 100,
    )
  }

  it("does not draw a stroke when ctx.colors.cardStroke is unset (every theme before this task)", () => {
    const { container } = svg(iconCards.render(block, { x: 0, y: 0, w: 1088 }, ctx))
    const cards = cardRects(container)
    expect(cards).toHaveLength(4)
    cards.forEach((r) => expect(r.getAttribute("stroke")).toBeNull())
  })

  it("draws a 1px stroke in cardStroke's color when the token is set", () => {
    const strokedCtx: BlockCtx = {
      ...ctx,
      colors: { ...ctx.colors, cardStroke: "#ABCDEF" },
    }
    const { container } = svg(iconCards.render(block, { x: 0, y: 0, w: 1088 }, strokedCtx))
    const cards = cardRects(container)
    expect(cards).toHaveLength(4)
    cards.forEach((r) => {
      expect(r.getAttribute("stroke")).toBe("#ABCDEF")
      expect(r.getAttribute("stroke-width")).toBe("1")
    })
  })

  it("regression lock: only enterprise/runway's real tokens set cardStroke — the other canonical themes stay stroke-free", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const themeCtx = buildCtx(resolveStyle(id), {})
      const { container } = svg(iconCards.render(block, { x: 0, y: 0, w: 1088 }, themeCtx))
      const card = cardRects(container)[0]
      if (id === "enterprise" || id === "runway") {
        expect(card.getAttribute("stroke")).toBe(themeCtx.colors.cardStroke)
      } else {
        expect(card.getAttribute("stroke")).toBeNull()
      }
    }
  })
})

describe("icon_cards block: text overflow fallback", () => {
  // Regression guard for a real bug the pptx overflow-audit stress fixtures
  // (audit/stress-fixtures.ts `new_blocks_stress`) caught: `layoutSvgText`
  // shrinks its returned font size so the widest wrapped line fits
  // `contentW`, but that shrink floors at 1px — text long enough that the
  // merged tail line (past its 2-line cap) still exceeds `contentW` even at
  // 1px/unit came back unfit, a genuine h-overflow. `layoutIconCard` now
  // truncates defensively at the fitted size (see icon-cards.tsx).
  it("keeps every rendered text line within its card's content width, even far past the shrink floor", () => {
    const w = 1088
    const n = 4
    const cardW = (w - 16 * (n - 1)) / n
    const contentW = cardW - 24 * 2
    const veryLongText = "说".repeat(300)
    const longTextBlock = {
      type: "icon_cards" as const,
      items: [
        card("断言一", veryLongText),
        card("断言二", "短"),
        card("断言三", "短"),
        card("断言四", "短"),
      ],
    }
    const { container } = svg(
      iconCards.render(longTextBlock, { x: 0, y: 0, w }, ctx)
    )
    const bodyTexts = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") !== "600" // titles are 600; text lines aren't
    )
    expect(bodyTexts.length).toBeGreaterThan(0)
    for (const t of bodyTexts) {
      const fontSize = Number(t.getAttribute("font-size"))
      const width = measureTextUnits(t.textContent ?? "") * fontSize
      expect(width).toBeLessThanOrEqual(contentW + 1) // +1 float rounding slack
    }
    // 300 repeated wide chars can't fit in 2 lines even at the 1px shrink
    // floor — truncation must have kicked in.
    expect(bodyTexts.some((t) => (t.textContent ?? "").endsWith("…"))).toBe(
      true
    )
  })
})
