// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { measureTextUnits } from "../../lib/svg-text-layout"
import { steps } from "./steps"
import type { BlockCtx } from "./types"
import { CANONICAL_THEME_IDS, resolveStyle } from "../../styles"
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

function step(title: string, text: string) {
  return { title, text }
}

const threeSteps = {
  type: "steps" as const,
  items: [
    step("注册账号", "填写基本信息完成注册"),
    step("配置项目", "选择模板并设置参数"),
    step("发布上线", "一键发布并持续监控"),
  ],
}

const fiveSteps = {
  type: "steps" as const,
  items: [
    step("步骤一", "说明一"),
    step("步骤二", "说明二"),
    step("步骤三", "说明三"),
    step("步骤四", "说明四"),
    step("步骤五", "说明五"),
  ],
}

describe("steps block: measure — horizontal", () => {
  it("grows card height when an item's text wraps to 2 lines vs 1", () => {
    const oneLine = {
      type: "steps" as const,
      items: [step("步骤", "短"), step("步骤", "短")],
    }
    const twoLines = {
      type: "steps" as const,
      items: [
        step("步骤", "这是一段足够长的说明文字，会在给定的卡片宽度下换行到第二行显示"),
        step("步骤", "短"),
      ],
    }
    const h1 = steps.measure(oneLine, 600, ctx)
    const h2 = steps.measure(twoLines, 600, ctx)
    expect(h2).toBeGreaterThan(h1)
  })

  it("takes the tallest item's content height for all equal-width cards", () => {
    const mixed = {
      type: "steps" as const,
      items: [
        step("步骤一", "短"),
        step("步骤二", "这是一段足够长的说明文字，会在给定的卡片宽度下换行到第二行显示"),
        step("步骤三", "短"),
      ],
    }
    const measuredH = steps.measure(mixed, 1088, ctx)
    const shortOnly = {
      type: "steps" as const,
      items: [step("步骤一", "短"), step("步骤二", "短"), step("步骤三", "短")],
    }
    const shortH = steps.measure(shortOnly, 1088, ctx)
    expect(measuredH).toBeGreaterThan(shortH)
  })

  it("measure() height matches the actual rendered card rect height", () => {
    const measuredH = steps.measure(threeSteps, 1088, ctx)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {steps.render(threeSteps, { x: 80, y: 100, w: 1088 }, ctx)}
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const cardRects = Array.from(root.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("rx") === "8",
    )
    expect(cardRects).toHaveLength(3)
    cardRects.forEach((r) => {
      expect(Number(r.getAttribute("height"))).toBeCloseTo(measuredH)
    })
  })
})

describe("steps block: render — horizontal", () => {
  it("lays out 3 equal-width cards with x offset = i*(cardW+40), gap=40", () => {
    const { container } = svg(steps.render(threeSteps, { x: 80, y: 100, w: 1088 }, ctx))
    const cardRects = Array.from(container.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("rx") === "8",
    )
    expect(cardRects).toHaveLength(3)
    const n = threeSteps.items.length
    const cardW = (1088 - 40 * (n - 1)) / n
    cardRects.forEach((r, i) => {
      expect(Number(r.getAttribute("x"))).toBeCloseTo(i * (cardW + 40))
      expect(Number(r.getAttribute("width"))).toBeCloseTo(cardW)
    })
  })

  it("numbers badges 1..3, primary-filled circle with a white centered digit", () => {
    const { container } = svg(steps.render(threeSteps, { x: 0, y: 0, w: 1088 }, ctx))
    const badgeCircles = Array.from(container.querySelectorAll("circle")).filter(
      (c) => c.getAttribute("r") === "14",
    )
    expect(badgeCircles).toHaveLength(3)
    badgeCircles.forEach((c) => expect(c.getAttribute("fill")).toBe(ctx.colors.primary))

    // Badge digits are the only fontWeight=700 text elements (title uses 600,
    // description text uses no font-weight).
    const digits = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "700",
    )
    expect(digits.map((t) => t.textContent)).toEqual(["1", "2", "3"])
    digits.forEach((t) => expect(t.getAttribute("fill")).toBe("#FFFFFF"))
  })

  it("renders a title and description text for every card", () => {
    const { container } = svg(steps.render(threeSteps, { x: 0, y: 0, w: 1088 }, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    for (const item of threeSteps.items) {
      expect(texts.some((t) => t.textContent === item.title)).toBe(true)
      expect(texts.some((t) => t.textContent === item.text)).toBe(true)
    }
  })

  it("shrinks an overlong title to fit inside its card", () => {
    const longTitleBlock = {
      type: "steps" as const,
      items: [
        step("这是一句非常非常非常非常非常非常长的步骤短句超出正常卡片宽度", "说明"),
        step("短", "说明"),
      ],
    }
    const { container } = svg(steps.render(longTitleBlock, { x: 0, y: 0, w: 500 }, ctx))
    const titleText = Array.from(container.querySelectorAll("text")).find(
      (t) => t.getAttribute("font-weight") === "600",
    )!
    expect(Number(titleText.getAttribute("font-size"))).toBeLessThan(18)
  })

  it("draws n-1 arrows (line+triangle) in the gap corridors between cards", () => {
    const { container } = svg(steps.render(threeSteps, { x: 0, y: 0, w: 1088 }, ctx))
    const triangles = container.querySelectorAll("polygon")
    expect(triangles).toHaveLength(2)
  })

  it("annotates every card with its own page-coordinate data-audit-box", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {steps.render(threeSteps, { x: 80, y: 100, w: 1088 }, ctx)}
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const boxes = Array.from(root.querySelectorAll("[data-audit-box]"))
    expect(boxes).toHaveLength(3)
    const n = threeSteps.items.length
    const cardW = (1088 - 40 * (n - 1)) / n
    boxes.forEach((el, i) => {
      const [x, y, w] = (el.getAttribute("data-audit-box") ?? "").split(",").map(Number)
      expect(x).toBeCloseTo(80 + i * (cardW + 40))
      expect(y).toBe(100)
      expect(w).toBeCloseTo(cardW)
    })
  })

  it("stays within the controlled SVG subset (assertSubset)", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {steps.render(threeSteps, { x: 80, y: 100, w: 1088 }, ctx)}
      </svg>,
    )
    expect(markup).not.toContain("foreignObject")
    expect(markup).not.toContain("linearGradient")
    expect(markup).not.toContain("url(#")
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })
})

describe("steps card stroke (fix wave, T5 follow-up)", () => {
  // T5 (01d02823) added the optional cardStroke token to kpi_cards/icon_cards/
  // callout's shared surface-card shell but missed this file's own horizontal
  // card shell (same rx=8/fill=surface family — see this file's own PAD_X
  // comment). Locks the same three-case contract as kpi.test.tsx/
  // icon-cards.test.tsx/callout.test.tsx's own "Task 5d" describe blocks.
  function cardRects(container: HTMLElement) {
    return Array.from(container.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("rx") === "8",
    )
  }

  it("does not draw a stroke when ctx.colors.cardStroke is unset (every theme before this task)", () => {
    const { container } = svg(steps.render(threeSteps, { x: 0, y: 0, w: 1088 }, ctx))
    const cards = cardRects(container)
    expect(cards).toHaveLength(3)
    cards.forEach((r) => expect(r.getAttribute("stroke")).toBeNull())
  })

  it("draws a 1px stroke in cardStroke's color when the token is set", () => {
    const strokedCtx: BlockCtx = {
      ...ctx,
      colors: { ...ctx.colors, cardStroke: "#ABCDEF" },
    }
    const { container } = svg(steps.render(threeSteps, { x: 0, y: 0, w: 1088 }, strokedCtx))
    const cards = cardRects(container)
    expect(cards).toHaveLength(3)
    cards.forEach((r) => {
      expect(r.getAttribute("stroke")).toBe("#ABCDEF")
      expect(r.getAttribute("stroke-width")).toBe("1")
    })
  })

  it("regression lock: only enterprise/runway's real tokens set cardStroke — the other canonical themes stay stroke-free", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const themeCtx = buildCtx(resolveStyle(id), {})
      const { container } = svg(steps.render(threeSteps, { x: 0, y: 0, w: 1088 }, themeCtx))
      const card = cardRects(container)[0]
      if (id === "enterprise" || id === "runway") {
        expect(card.getAttribute("stroke")).toBe(themeCtx.colors.cardStroke)
      } else {
        expect(card.getAttribute("stroke")).toBeNull()
      }
    }
  })
})

describe("steps block: vertical degrade", () => {
  // 5 items × 180 + 4 × 40 = 1060 > 600 — narrower than the minimum 5-card
  // horizontal layout, so this must switch to the badge-column stack.
  const w = 600

  it("switches to vertical mode when items×180+(items-1)×40 > w", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {steps.render(fiveSteps, { x: 80, y: 100, w }, ctx)}
      </svg>,
    )
    const root = parseSvgRoot(markup)
    // No horizontal card shell (rx=8 rect) at all in vertical mode.
    const cardRects = Array.from(root.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("rx") === "8",
    )
    expect(cardRects).toHaveLength(0)
    const boxes = root.querySelectorAll("[data-audit-box]")
    expect(boxes).toHaveLength(5)
  })

  it("connects adjacent badges with items-1 = 4 vertical connector lines", () => {
    const { container } = svg(steps.render(fiveSteps, { x: 0, y: 0, w }, ctx))
    const lines = container.querySelectorAll("line")
    expect(lines).toHaveLength(4)
    lines.forEach((l) => {
      expect(l.getAttribute("stroke")).toBe(ctx.colors.muted)
      expect(Number(l.getAttribute("stroke-width"))).toBeCloseTo(1.5)
      // Vertical connector: same x1/x2 (a single vertical column at x=24 pad + 14 radius = 38).
      expect(l.getAttribute("x1")).toBe(l.getAttribute("x2"))
      expect(Number(l.getAttribute("x1"))).toBeCloseTo(38)
    })
  })

  it("numbers badges 1..5 in the left column, title+text start at x=64", () => {
    const { container } = svg(steps.render(fiveSteps, { x: 0, y: 0, w }, ctx))
    const digits = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "700",
    )
    expect(digits.map((t) => t.textContent)).toEqual(["1", "2", "3", "4", "5"])

    const badgeCircles = Array.from(container.querySelectorAll("circle")).filter(
      (c) => c.getAttribute("r") === "14",
    )
    expect(badgeCircles).toHaveLength(5)
    badgeCircles.forEach((c) => expect(Number(c.getAttribute("cx"))).toBeCloseTo(38))

    const titleTexts = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "600",
    )
    expect(titleTexts).toHaveLength(5)
    titleTexts.forEach((t) => expect(Number(t.getAttribute("x"))).toBeCloseTo(64))
  })

  it("measure() height matches the cumulative row spacing actually rendered", () => {
    const measuredH = steps.measure(fiveSteps, w, ctx)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {steps.render(fiveSteps, { x: 80, y: 100, w }, ctx)}
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const boxes = Array.from(root.querySelectorAll("[data-audit-box]"))
    expect(boxes).toHaveLength(5)
    const ys = boxes.map(
      (b) => Number((b.getAttribute("data-audit-box") ?? "").split(",")[1]),
    )
    const rowH = ys[1] - ys[0]
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i] - ys[i - 1]).toBeCloseTo(rowH)
    }
    // n rows of uniform height rowH should sum to measure()'s reported total.
    expect(ys[4] - ys[0] + rowH).toBeCloseTo(measuredH)
  })

  it("stays within the controlled SVG subset (assertSubset)", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        {steps.render(fiveSteps, { x: 80, y: 100, w }, ctx)}
      </svg>,
    )
    expect(markup).not.toContain("foreignObject")
    expect(markup).not.toContain("linearGradient")
    expect(markup).not.toContain("url(#")
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })
})

describe("steps block: text overflow fallback", () => {
  // Regression guard for a real bug the pptx overflow-audit stress fixtures
  // (audit/stress-fixtures.ts `new_blocks_stress`) caught: `layoutSvgText`
  // shrinks its returned font size so the widest wrapped line fits
  // `contentW`, but that shrink floors at 1px — text long enough that the
  // merged tail line (past its 2-line cap) still exceeds `contentW` even at
  // 1px/unit came back unfit, a genuine h-overflow, in *both* rendering
  // modes (they share `layoutStepItem`). `layoutStepItem` now truncates
  // defensively at the fitted size (see steps.tsx).
  it("keeps every rendered text line within its card's content width in horizontal mode", () => {
    const w = 1088
    const n = 5
    const cardW = (w - 40 * (n - 1)) / n
    const contentW = cardW - 24 * 2
    const veryLongText = "说".repeat(300)
    const longTextBlock = {
      type: "steps" as const,
      items: [
        step("步骤一", veryLongText),
        step("步骤二", "短"),
        step("步骤三", "短"),
        step("步骤四", "短"),
        step("步骤五", "短"),
      ],
    }
    const { container } = svg(steps.render(longTextBlock, { x: 0, y: 0, w }, ctx))
    const bodyTexts = Array.from(container.querySelectorAll("text")).filter(
      (t) => !["600", "700"].includes(t.getAttribute("font-weight") ?? ""), // titles=600, badge digits=700
    )
    expect(bodyTexts.length).toBeGreaterThan(0)
    for (const t of bodyTexts) {
      const fontSize = Number(t.getAttribute("font-size"))
      const width = measureTextUnits(t.textContent ?? "") * fontSize
      expect(width).toBeLessThanOrEqual(contentW + 1) // +1 float rounding slack
    }
    expect(bodyTexts.some((t) => (t.textContent ?? "").endsWith("…"))).toBe(true)
  })

  it("keeps every rendered text line within its row's content width in vertical mode", () => {
    const w = 600 // same narrow width as the "vertical degrade" describe block above
    const contentW = w - 64 // TEXT_X_VERTICAL (steps.tsx)
    // Vertical mode's content column is much wider than a horizontal card
    // (full-width minus the badge column, not divided by item count), so it
    // takes far more repetition to push past the shrink floor here than in
    // the horizontal-mode test above.
    const veryLongText = "说".repeat(1000)
    const longTextBlock = {
      type: "steps" as const,
      items: [
        step("步骤一", veryLongText),
        step("步骤二", "短"),
        step("步骤三", "短"),
        step("步骤四", "短"),
        step("步骤五", "短"),
      ],
    }
    const { container } = svg(steps.render(longTextBlock, { x: 0, y: 0, w }, ctx))
    const bodyTexts = Array.from(container.querySelectorAll("text")).filter(
      (t) => !["600", "700"].includes(t.getAttribute("font-weight") ?? ""),
    )
    expect(bodyTexts.length).toBeGreaterThan(0)
    for (const t of bodyTexts) {
      const fontSize = Number(t.getAttribute("font-size"))
      const width = measureTextUnits(t.textContent ?? "") * fontSize
      expect(width).toBeLessThanOrEqual(contentW + 1)
    }
    expect(bodyTexts.some((t) => (t.textContent ?? "").endsWith("…"))).toBe(true)
  })
})
