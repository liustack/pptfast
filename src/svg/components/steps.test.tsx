// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { measureTextUnits } from "../../lib/svg-text-layout"
import { steps } from "./steps"
import type { ComponentCtx } from "./types"
import { CANONICAL_THEME_IDS, resolveStyle } from "../../themes"
import { buildCtx } from "../full-slide-svg"
import { resolveComponentForm } from "./form-assignments"
import { readableOn } from "../ink"

const ctx: ComponentCtx = {
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
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
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

describe("steps component: measure — horizontal", () => {
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

describe("steps component: render — horizontal", () => {
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
    const longTitleComponent = {
      type: "steps" as const,
      items: [
        step("这是一句非常非常非常非常非常非常长的步骤短句超出正常卡片宽度", "说明"),
        step("短", "说明"),
      ],
    }
    const { container } = svg(steps.render(longTitleComponent, { x: 0, y: 0, w: 500 }, ctx))
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
    const strokedCtx: ComponentCtx = {
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

  it("regression lock: unassigned themes keep the cardStroke contract — assigned arrow_steps themes are skipped", () => {
    for (const id of CANONICAL_THEME_IDS) {
      if (resolveComponentForm("steps", id)) continue
      const themeCtx = buildCtx(resolveStyle(id), {})
      const { container } = svg(steps.render(threeSteps, { x: 0, y: 0, w: 1088 }, themeCtx))
      const card = cardRects(container)[0]
      expect(card).toBeTruthy()
      if (themeCtx.colors.cardStroke) {
        expect(card.getAttribute("stroke")).toBe(themeCtx.colors.cardStroke)
      } else {
        expect(card.getAttribute("stroke")).toBeNull()
      }
    }
  })
})

describe("steps component: vertical degrade", () => {
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

describe("steps component: text overflow fallback", () => {
  // Regression guard for a real bug the pptx overflow-audit stress fixtures
  // (audit/stress-fixtures.ts `new_components_stress`) caught: `layoutSvgText`
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
    const longTextComponent = {
      type: "steps" as const,
      items: [
        step("步骤一", veryLongText),
        step("步骤二", "短"),
        step("步骤三", "短"),
        step("步骤四", "短"),
        step("步骤五", "短"),
      ],
    }
    const { container } = svg(steps.render(longTextComponent, { x: 0, y: 0, w }, ctx))
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
    const longTextComponent = {
      type: "steps" as const,
      items: [
        step("步骤一", veryLongText),
        step("步骤二", "短"),
        step("步骤三", "短"),
        step("步骤四", "短"),
        step("步骤五", "短"),
      ],
    }
    const { container } = svg(steps.render(longTextComponent, { x: 0, y: 0, w }, ctx))
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

function stepsFormMarkup(node: React.ReactElement) {
  return renderSvgMarkup(<svg xmlns="http://www.w3.org/2000/svg">{node}</svg>)
}

describe("arrow_steps form", () => {
  const box = { x: 0, y: 0, w: 1088, h: 360 }
  const three = threeSteps

  it("runway: chevron paths, circle-outline badges with 01/02/03, title on the arrow, text as the footnote", () => {
    const themeCtx = buildCtx(resolveStyle("runway"), {})
    const { container } = svg(steps.render(three, box, themeCtx))
    const arrows = Array.from(container.querySelectorAll("path")).filter(
      (p) => p.getAttribute("fill") === themeCtx.colors.accent,
    )
    expect(arrows).toHaveLength(3)
    expect(container.querySelectorAll("circle")).toHaveLength(3)
    const digits = Array.from(container.querySelectorAll("text")).filter((t) => /^\d{2}$/.test(t.textContent ?? ""))
    expect(digits.map((t) => t.textContent)).toEqual(["01", "02", "03"])
    for (const item of three.items) {
      expect(container.textContent).toContain(item.title)
      expect(container.textContent).toContain(item.text)
    }
    const title = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === three.items[0].title)!
    expect(title.getAttribute("fill")).toBe(readableOn(themeCtx.colors.accent))
    const titleY = Number(title.getAttribute("y"))
    const foot = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === three.items[0].text)!
    expect(Number(foot.getAttribute("y"))).toBeGreaterThan(titleY)
    expect(container.querySelectorAll("rect").length === 0 || container.querySelectorAll('rect[rx="8"]').length === 0).toBe(
      true,
    )
  })

  it("enterprise: notch paths and square-solid badges, fill from primary token", () => {
    const themeCtx = buildCtx(resolveStyle("enterprise"), {})
    const { container } = svg(steps.render(three, box, themeCtx))
    const arrows = Array.from(container.querySelectorAll("path")).filter(
      (p) => p.getAttribute("fill") === themeCtx.colors.primary,
    )
    expect(arrows).toHaveLength(3)
    expect(container.querySelectorAll("circle")).toHaveLength(0)
    const badges = Array.from(container.querySelectorAll("rect"))
    expect(badges.length).toBeGreaterThanOrEqual(3)
  })

  it("pulse: slope arrows, solid circle badges, pulseLine path, no invented third copy layer", () => {
    const themeCtx = buildCtx(resolveStyle("pulse"), {})
    const { container } = svg(steps.render(three, box, themeCtx))
    const filled = Array.from(container.querySelectorAll("path")).filter((p) => p.getAttribute("fill") && p.getAttribute("fill") !== "none")
    expect(filled.length).toBeGreaterThanOrEqual(3)
    expect(container.querySelectorAll("circle").length).toBeGreaterThanOrEqual(3)
    const pulse = Array.from(container.querySelectorAll("path")).find(
      (p) => p.getAttribute("fill") === "none" || p.getAttribute("fill") === null,
    )
    expect(pulse).toBeTruthy()
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent ?? "")
    for (const t of texts) {
      const ok =
        /^\d{2}$/.test(t) ||
        three.items.some((item) => item.title.includes(t) || item.text.includes(t) || t.includes(item.title) || t.includes(item.text.slice(0, 4)))
      expect(ok).toBe(true)
    }
  })

  it("four gallery steps stay on one row in a 640-wide slot and stay inside the box", () => {
    const themeCtx = buildCtx(resolveStyle("runway"), {})
    const four = {
      type: "steps" as const,
      items: [
        step("需求确认", "对齐范围与验收口径，避免现场返工。"),
        step("现场勘测", "核对安装点位与供电条件。"),
        step("设备接入", "完成接线并写入资产台账。"),
        step("模型调优", "压低误报占比后再放量。"),
      ],
    }
    const box = { x: 0, y: 0, w: 640, h: 360 }
    const measured = steps.measure(four, box.w, themeCtx)
    expect(measured).toBeLessThanOrEqual(box.h)
    const { container } = svg(steps.render(four, box, themeCtx))
    const arrows = Array.from(container.querySelectorAll("path")).filter(
      (p) => p.getAttribute("fill") === themeCtx.colors.accent,
    )
    expect(arrows).toHaveLength(4)
    const ys = arrows.map((p) => Number((p.getAttribute("d") ?? "").match(/M [\d.]+ ([\d.]+)/)?.[1] ?? 0))
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(8)
    for (const el of Array.from(container.querySelectorAll("circle"))) {
      const cx = Number(el.getAttribute("cx"))
      const cy = Number(el.getAttribute("cy"))
      const r = Number(el.getAttribute("r"))
      expect(cx - r).toBeGreaterThanOrEqual(-2)
      expect(cx + r).toBeLessThanOrEqual(box.w + 2)
      expect(cy + r).toBeLessThanOrEqual(box.h + 2)
    }
    expect(container.querySelector("[data-dropped]")).toBeNull()
  })

  it("narrow width stacks the same arrows instead of falling back to the card face", () => {
    const themeCtx = buildCtx(resolveStyle("runway"), {})
    const narrow = { x: 0, y: 0, w: 600, h: 900 }
    const { container } = svg(steps.render(fiveSteps, narrow, themeCtx))
    expect(Array.from(container.querySelectorAll("rect")).filter((r) => r.getAttribute("rx") === "8")).toHaveLength(0)
    const arrows = Array.from(container.querySelectorAll("path")).filter(
      (p) => p.getAttribute("fill") === themeCtx.colors.accent,
    )
    expect(arrows).toHaveLength(5)
    const ys = arrows.map((p) => Number((p.getAttribute("d") ?? "").match(/M [\d.]+ ([\d.]+)/)?.[1] ?? 0))
    expect(ys[4]).toBeGreaterThan(ys[0] + 40)
  })

  it("consulting (unassigned) markup is byte-identical to the default face", () => {
    const withId = buildCtx(resolveStyle("consulting"), {})
    const withoutId = { ...withId, themeId: undefined }
    expect(stepsFormMarkup(steps.render(three, { x: 80, y: 100, w: 1088 }, withId))).toBe(
      stepsFormMarkup(steps.render(three, { x: 80, y: 100, w: 1088 }, withoutId)),
    )
  })

  it("n=2 and n=5 stay inside the box, and the tree is subset-safe", () => {
    const themeCtx = buildCtx(resolveStyle("runway"), {})
    for (const ir of [
      { type: "steps" as const, items: [step("甲", "说明甲"), step("乙", "说明乙")] },
      fiveSteps,
    ]) {
      const h = Math.max(steps.measure(ir, box.w, themeCtx), 420)
      const node = steps.render(ir, { x: 0, y: 0, w: 1088, h }, themeCtx)
      const markup = stepsFormMarkup(node)
      const root = parseSvgRoot(markup)
      expect(() => assertSubset(root)).not.toThrow()
      for (const el of Array.from(root.querySelectorAll("rect, circle"))) {
        if (el.tagName.toLowerCase() === "circle") {
          const cx = Number(el.getAttribute("cx"))
          const cy = Number(el.getAttribute("cy"))
          const r = Number(el.getAttribute("r"))
          expect(cx - r).toBeGreaterThanOrEqual(-2)
          expect(cy - r).toBeGreaterThanOrEqual(-2)
          expect(cx + r).toBeLessThanOrEqual(1088 + 2)
          expect(cy + r).toBeLessThanOrEqual(h + 2)
        } else {
          const x = Number(el.getAttribute("x") ?? 0)
          const y = Number(el.getAttribute("y") ?? 0)
          const w = Number(el.getAttribute("width") ?? 0)
          const hh = Number(el.getAttribute("height") ?? 0)
          expect(x).toBeGreaterThanOrEqual(-2)
          expect(y).toBeGreaterThanOrEqual(-2)
          expect(x + w).toBeLessThanOrEqual(1088 + 2)
          expect(y + hh).toBeLessThanOrEqual(h + 2)
        }
      }
    }
  })
})
