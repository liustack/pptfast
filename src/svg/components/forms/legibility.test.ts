// @vitest-environment jsdom
import { createElement } from "react"
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { iconCards } from "../icon-cards"
import { numberedCards } from "../numbered-cards"
import { kpi } from "../kpi"
import { cycle } from "../cycle"
import { resolveStyle } from "../../../themes"
import { buildCtx } from "../../full-slide-svg"
import type { ComponentCtx } from "../types"
import { measureTextUnits } from "../../../lib/svg-text-layout"
import {
  boardTypeScale,
  capFormBody,
  fillCardType,
  formGridCols,
  formIconColumnCols,
  layoutFormBody,
  BOARD_CARD_W,
  FORM_BODY_FLOOR,
  FORM_BODY_TITLE_CAP,
  FORM_TITLE_FLOOR,
} from "./legibility"

function themeCtx(id: string): ComponentCtx {
  return buildCtx(resolveStyle(id), {})
}

function svg(node: React.ReactElement) {
  return render(createElement("svg", null, node))
}

function card(title: string, text: string, icon = "rocket") {
  return { icon, title, text }
}

/** Gallery-length CJK copy that currently squeezes 4-across badge cards to 6–7px. */
const GALLERY_FOUR = {
  type: "icon_cards" as const,
  items: [
    card("自建算力替换", "自建算力替换公有云推理，单台设备的月度成本下降三成一。"),
    card("行业场景复制", "华东区域的渗透率是华南的一半，销售覆盖密度是主要原因。"),
    card("现场服务自动化", "现场服务工程师的人均负荷已经接近上限，扩张速度受制于招聘。"),
    card("渠道伙伴培育", "两家竞品在中小客户市场以低于成本的价格投标，短期内难以正面应对。"),
  ],
}

const GALLERY_SIX = {
  type: "icon_cards" as const,
  items: [
    ...GALLERY_FOUR.items,
    card("交付周期压缩", "交付周期从九周压缩到五周，主要靠标准化接入模板。", "gauge"),
    card("续约率回升", "续约率回升到百分之九十一，是过去六个季度的最高点。", "target"),
  ],
}

const GALLERY_THREE = {
  type: "icon_cards" as const,
  items: GALLERY_FOUR.items.slice(0, 3),
}

function isInsideScaledIcon(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const t = n.getAttribute("transform") ?? ""
    if (/scale\(/.test(t)) return true
  }
  return false
}

function cellRects(container: ParentNode): SVGRectElement[] {
  return Array.from(container.querySelectorAll("rect")).filter((r) => {
    if (isInsideScaledIcon(r)) return false
    return Number(r.getAttribute("width") ?? 0) > 100
  })
}

function fontSizeOf(el: Element): number {
  return Number(el.getAttribute("font-size") ?? 0)
}

function stripped(s: string): string {
  return s.replace(/[….]/g, "")
}

function looksLikeTitle(rendered: string, title: string): boolean {
  const t = stripped(rendered)
  if (!t) return false
  return title === rendered || title.startsWith(t)
}

function looksLikeBody(rendered: string, body: string, title: string): boolean {
  if (looksLikeTitle(rendered, title)) return false
  const t = stripped(rendered)
  if (!t) return false
  return body.includes(t) || t.includes(body.slice(0, 6))
}

function titleNodes(container: ParentNode, title: string): Element[] {
  return Array.from(container.querySelectorAll("text")).filter((el) =>
    looksLikeTitle(el.textContent ?? "", title),
  )
}

function bodyNodes(container: ParentNode, body: string, title: string): Element[] {
  return Array.from(container.querySelectorAll("text")).filter((el) =>
    looksLikeBody(el.textContent ?? "", body, title),
  )
}

function textsMatching(container: ParentNode, snippets: string[]): Element[] {
  return Array.from(container.querySelectorAll("text")).filter((t) => {
    const s = t.textContent ?? ""
    return snippets.some((snip) => s.includes(snip) || snip.includes(stripped(s)))
  })
}

function assertTitleBodyFloors(
  container: ParentNode,
  items: ReadonlyArray<{ title: string; text?: string; label?: string }>,
) {
  for (const item of items) {
    const titleHits = titleNodes(container, item.title)
    expect(titleHits.length, `title "${item.title}"`).toBeGreaterThan(0)
    for (const t of titleHits) {
      expect(fontSizeOf(t), `title "${t.textContent}"`).toBeGreaterThanOrEqual(FORM_TITLE_FLOOR)
    }
    const body = item.text
    if (!body) continue
    const bodyHits = bodyNodes(container, body, item.title)
    for (const t of bodyHits) {
      expect(fontSizeOf(t), `body "${t.textContent}"`).toBeGreaterThanOrEqual(FORM_BODY_FLOOR)
    }
  }
}

function uniqueXs(rects: SVGRectElement[]): number[] {
  return [...new Set(rects.map((r) => Math.round(Number(r.getAttribute("x") ?? 0))))].sort((a, b) => a - b)
}

function polygonPoints(poly: Element): { x: number; y: number }[] {
  const raw = (poly.getAttribute("points") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n))
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i + 1 < raw.length; i += 2) pts.push({ x: raw[i]!, y: raw[i + 1]! })
  return pts
}

function polygonBBoxWidth(poly: Element): number {
  const pts = polygonPoints(poly)
  const xs = pts.map((p) => p.x)
  return Math.max(...xs) - Math.min(...xs)
}

function pointInPolygon(x: number, y: number, pts: readonly { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i]!.y
    const yj = pts[j]!.y
    const xi = pts[i]!.x
    const xj = pts[j]!.x
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.MIN_VALUE) + xi
    if (hit) inside = !inside
  }
  return inside
}

describe("formGridCols", () => {
  it("uses n columns for 1–3 items, 2×2 for 4, 3 columns for 5–6", () => {
    expect(formGridCols(1)).toBe(1)
    expect(formGridCols(2)).toBe(2)
    expect(formGridCols(3)).toBe(3)
    expect(formGridCols(4)).toBe(2)
    expect(formGridCols(5)).toBe(3)
    expect(formGridCols(6)).toBe(3)
  })
})

describe("formIconColumnCols", () => {
  it("keeps 4-across on a 640-wide box when floors still fit", () => {
    expect(formIconColumnCols(4, 640)).toBe(4)
  })

  it("falls back to 2×2 when a 4-across column cannot hold the title floor", () => {
    expect(formIconColumnCols(4, 200)).toBe(2)
  })
})

describe("badge_cards legibility", () => {
  it("4 gallery items in the quiet-frame 640×392 slot wrap 2×2 and keep title ≥20 / body ≥15", () => {
    const ctx = themeCtx("tech")
    const box = { x: 0, y: 0, w: 640, h: 392 }
    const { container } = svg(iconCards.render(GALLERY_FOUR, box, ctx))
    const cards = cellRects(container)
    expect(cards).toHaveLength(4)
    const widths = cards.map((c) => Number(c.getAttribute("width")))
    expect(Math.min(...widths)).toBeGreaterThan(250)
    expect(Math.max(...widths)).toBeLessThan(340)
    expect(uniqueXs(cards)).toHaveLength(2)
    assertTitleBodyFloors(container, GALLERY_FOUR.items)

    const heights = cards.map((c) => Number(c.getAttribute("height")))
    const cardH = heights[0]!
    for (let i = 0; i < cards.length; i++) {
      const cardEl = cards[i]!
      const item = GALLERY_FOUR.items[i]!
      const cardY = Number(cardEl.getAttribute("y"))
      const bodyHits = bodyNodes(container, item.text, item.title)
      expect(bodyHits.length).toBeGreaterThan(0)
      const lastY = Math.max(...bodyHits.map((t) => Number(t.getAttribute("y"))))
      const innerH = cardH - 40
      const blockTop = Math.min(
        ...textsMatching(container, [item.title]).map((t) => Number(t.getAttribute("y")) - fontSizeOf(t)),
      )
      const blockH = lastY - blockTop
      const filled = lastY - cardY >= 0.45 * cardH || blockH >= 0.35 * innerH
      expect(filled, `card ${i} last body y ${lastY} cardY ${cardY} cardH ${cardH}`).toBe(true)
    }
  })

  it("4 items at 1088×420 also wrap 2×2, keep floors, and stay inside the box", () => {
    const ctx = themeCtx("tech")
    const box = { x: 0, y: 0, w: 1088, h: 420 }
    const { container } = svg(iconCards.render(GALLERY_FOUR, box, ctx))
    const cards = cellRects(container)
    expect(cards).toHaveLength(4)
    expect(uniqueXs(cards)).toHaveLength(2)
    expect(Math.min(...cards.map((c) => Number(c.getAttribute("width"))))).toBeGreaterThan(400)
    assertTitleBodyFloors(container, GALLERY_FOUR.items)
    for (const cardEl of cards) {
      const x = Number(cardEl.getAttribute("x"))
      const y = Number(cardEl.getAttribute("y"))
      const w = Number(cardEl.getAttribute("width"))
      const h = Number(cardEl.getAttribute("height"))
      expect(x).toBeGreaterThanOrEqual(-2)
      expect(y).toBeGreaterThanOrEqual(-2)
      expect(x + w).toBeLessThanOrEqual(box.w + 2)
      expect(y + h).toBeLessThanOrEqual(box.h + 2)
    }
  })

  it("3 items stay 1 row and titles scale with ~300px cards instead of sticking at 14", () => {
    const ctx = themeCtx("tech")
    const box = { x: 0, y: 0, w: 932 }
    const { container } = svg(iconCards.render(GALLERY_THREE, box, ctx))
    const cards = cellRects(container)
    expect(cards).toHaveLength(3)
    expect(uniqueXs(cards)).toHaveLength(3)
    const widths = cards.map((c) => Number(c.getAttribute("width")))
    expect(Math.min(...widths)).toBeGreaterThan(280)
    expect(Math.max(...widths)).toBeLessThan(320)
    const titles = GALLERY_THREE.items.flatMap((item) => titleNodes(container, item.title))
    expect(titles.length).toBeGreaterThanOrEqual(3)
    for (const t of titles) {
      const fs = fontSizeOf(t)
      expect(fs).toBeGreaterThanOrEqual(22.5)
      expect(fs).toBeLessThan(32)
    }
    assertTitleBodyFloors(container, GALLERY_THREE.items)
  })

  it("6 items lay out 3×2 with fonts at or above the floors", () => {
    const ctx = themeCtx("tech")
    const box = { x: 0, y: 0, w: 1088, h: 420 }
    const { container } = svg(iconCards.render(GALLERY_SIX, box, ctx))
    const cards = cellRects(container)
    expect(cards).toHaveLength(6)
    expect(uniqueXs(cards)).toHaveLength(3)
    const ys = [...new Set(cards.map((c) => Math.round(Number(c.getAttribute("y")))))].sort((a, b) => a - b)
    expect(ys.length).toBe(2)
    assertTitleBodyFloors(container, GALLERY_SIX.items)
  })
})

describe("outline_grid legibility", () => {
  it("academic 6 items in ~1088×420 keep cell text at or above the floors", () => {
    const ctx = themeCtx("academic")
    const box = { x: 0, y: 0, w: 1088, h: 420 }
    const { container } = svg(iconCards.render(GALLERY_SIX, box, ctx))
    const cells = cellRects(container)
    expect(cells).toHaveLength(6)
    expect(uniqueXs(cells)).toHaveLength(3)
    assertTitleBodyFloors(container, GALLERY_SIX.items)
  })
})

describe("numbered_pills legibility", () => {
  it("pulse 4 items keep title ≥20 and body ≥15 (or omit body, never 13)", () => {
    const ctx = themeCtx("pulse")
    const component = {
      type: "numbered_cards" as const,
      items: GALLERY_FOUR.items.map(({ title, text }) => ({ title, text })),
    }
    const box = { x: 0, y: 0, w: 1088 }
    const { container } = svg(numberedCards.render(component, box, ctx))
    for (const item of component.items) {
      const titleHits = titleNodes(container, item.title)
      expect(titleHits.length).toBeGreaterThan(0)
      for (const t of titleHits) {
        expect(fontSizeOf(t), `title "${t.textContent}"`).toBeGreaterThanOrEqual(FORM_TITLE_FLOOR)
      }
      const bodyHits = bodyNodes(container, item.text, item.title)
      for (const t of bodyHits) {
        expect(fontSizeOf(t), `body "${t.textContent}"`).toBeGreaterThanOrEqual(FORM_BODY_FLOOR)
      }
    }
  })
})

describe("hex_cluster legibility", () => {
  it("tech 4 items never paint text below 15px and titles stay ≥20", () => {
    const ctx = themeCtx("tech")
    const component = {
      type: "numbered_cards" as const,
      items: GALLERY_FOUR.items.map(({ title, text }) => ({ title, text })),
    }
    const box = { x: 0, y: 0, w: 1088, h: 420 }
    const { container } = svg(numberedCards.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    for (const t of texts) {
      expect(fontSizeOf(t), `"${t.textContent}"`).toBeGreaterThanOrEqual(FORM_BODY_FLOOR)
    }
    for (const item of component.items) {
      const titleHits = titleNodes(container, item.title)
      expect(titleHits.length).toBeGreaterThan(0)
      for (const t of titleHits) {
        expect(fontSizeOf(t), `title "${t.textContent}"`).toBeGreaterThanOrEqual(FORM_TITLE_FLOOR)
      }
    }
  })

  it("4 gallery-length titles stay inside 90% of the hex bbox at ≥20", () => {
    const ctx = themeCtx("tech")
    const component = {
      type: "numbered_cards" as const,
      items: GALLERY_FOUR.items.map(({ title, text }) => ({ title, text })),
    }
    const box = { x: 0, y: 0, w: 640, h: 392 }
    const { container } = svg(numberedCards.render(component, box, ctx))
    const groups = Array.from(container.querySelectorAll("g")).filter((g) =>
      Array.from(g.children).some((c) => c.tagName.toLowerCase() === "polygon"),
    )
    expect(groups).toHaveLength(4)
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]!
      const poly = Array.from(group.children).find((c) => c.tagName.toLowerCase() === "polygon")
      expect(poly, `hex ${i}`).toBeTruthy()
      const pts = polygonPoints(poly!)
      const bboxW = polygonBBoxWidth(poly!)
      const title = component.items[i]!.title
      const body = component.items[i]!.text ?? ""
      const titleHits = Array.from(group.querySelectorAll("text")).filter((t) => {
        const s = t.textContent ?? ""
        if (/^\d{2}$/.test(s)) return false
        if (body && looksLikeBody(s, body, title)) return false
        return true
      })
      expect(titleHits.length, `title "${title}"`).toBeGreaterThan(0)
      for (const t of titleHits) {
        const fs = fontSizeOf(t)
        const content = t.textContent ?? ""
        expect(fs, `title "${content}"`).toBeGreaterThanOrEqual(FORM_TITLE_FLOOR)
        const textW = measureTextUnits(content) * fs
        expect(textW, `"${content}" ${textW} vs bbox ${bboxW}`).toBeLessThanOrEqual(bboxW * 0.9)
        const x = Number(t.getAttribute("x"))
        const y = Number(t.getAttribute("y"))
        expect(pointInPolygon(x - textW / 2, y, pts), `"${content}" left`).toBe(true)
        expect(pointInPolygon(x + textW / 2, y, pts), `"${content}" right`).toBe(true)
      }
    }
  })
})

describe("bubble_row legibility", () => {
  it("insight 4 KPI values like 91% stay ≥15", () => {
    const ctx = themeCtx("insight")
    const component = {
      type: "kpi_cards" as const,
      items: [
        { value: "91%", label: "客户续约率" },
        { value: "88%", label: "故障预测准确率" },
        { value: "64%", label: "接入设备总量" },
        { value: "35%", label: "平均交付周期" },
      ],
    }
    const box = { x: 0, y: 0, w: 1088 }
    const { container } = svg(kpi.render(component, box, ctx))
    for (const item of component.items) {
      const valueHits = textsMatching(container, [item.value, item.value.replace("%", "")])
      expect(valueHits.length, `value ${item.value}`).toBeGreaterThan(0)
      for (const t of valueHits) {
        expect(fontSizeOf(t), `value "${t.textContent}"`).toBeGreaterThanOrEqual(FORM_BODY_FLOOR)
      }
      const labelHits = textsMatching(container, [item.label])
      for (const t of labelHits) {
        expect(fontSizeOf(t), `label "${t.textContent}"`).toBeGreaterThanOrEqual(FORM_BODY_FLOOR)
      }
    }
  })
})

describe("donut_trio legibility", () => {
  it("luxe paints 10.2万台 without ellipsizing the unit, at ≥15", () => {
    const ctx = themeCtx("luxe")
    const component = {
      type: "kpi_cards" as const,
      items: [
        { value: "10.2", unit: "万台", label: "接入设备总量" },
        { value: "91", unit: "%", label: "客户续约率" },
        { value: "88", unit: "%", label: "故障预测准确率" },
        { value: "5", unit: "周", label: "平均交付周期" },
      ],
    }
    const box = { x: 0, y: 0, w: 640, h: 392 }
    const { container } = svg(kpi.render(component, box, ctx))
    const blob = Array.from(container.querySelectorAll("text"))
      .map((t) => t.textContent ?? "")
      .join("")
    expect(blob).toContain("万")
    expect(blob).toContain("台")
    const valueHits = Array.from(container.querySelectorAll("text")).filter((t) => {
      const s = t.textContent ?? ""
      return /10\.2|万|台/.test(s) && !s.includes("接入")
    })
    expect(valueHits.length).toBeGreaterThan(0)
    for (const t of valueHits) {
      expect(fontSizeOf(t), `value "${t.textContent}"`).toBeGreaterThanOrEqual(FORM_BODY_FLOOR)
    }
    const labelHits = textsMatching(container, ["接入设备总量"])
    for (const t of labelHits) {
      expect(fontSizeOf(t), `label "${t.textContent}"`).toBeGreaterThanOrEqual(FORM_BODY_FLOOR)
    }
  })
})

describe("petal_wheel legibility", () => {
  it("tech 4-char on-petal labels wrap at ≥20 instead of 现场…", () => {
    const ctx = themeCtx("tech")
    const component = {
      type: "cycle" as const,
      title: "能力面",
      items: [
        { label: "需求确认", description: "阶段说明一" },
        { label: "现场勘测", description: "阶段说明二" },
        { label: "设备接入", description: "阶段说明三" },
        { label: "模型调优", description: "阶段说明四" },
        { label: "试运行", description: "阶段说明五" },
      ],
    }
    const box = { x: 0, y: 0, w: 640, h: 392 }
    const { container } = svg(cycle.render(component, box, ctx))
    const blob = Array.from(container.querySelectorAll("text"))
      .map((t) => t.textContent ?? "")
      .join("")
    expect(blob).toContain("现")
    expect(blob).toContain("场")
    expect(blob).toContain("勘")
    expect(blob).toContain("测")
    expect(blob).not.toMatch(/现场…/)
    const hits = Array.from(container.querySelectorAll("text")).filter((t) =>
      /现|场|勘|测/.test(t.textContent ?? ""),
    )
    expect(hits.length).toBeGreaterThan(0)
    for (const t of hits) {
      expect(fontSizeOf(t), `"${t.textContent}"`).toBeGreaterThanOrEqual(FORM_TITLE_FLOOR)
    }
  })
})

describe("form body title cap", () => {
  it("exports a 0.6 body-to-title ceiling", () => {
    expect(FORM_BODY_TITLE_CAP).toBeCloseTo(0.6)
  })

  it("boardTypeScale caps body at 0.6 of title on a wide card", () => {
    const wide = boardTypeScale(600)
    expect(wide.title).toBeGreaterThan(FORM_TITLE_FLOOR)
    expect(wide.body).toBeLessThanOrEqual(wide.title * FORM_BODY_TITLE_CAP + 1e-6)
    expect(wide.body).toBeGreaterThanOrEqual(FORM_BODY_FLOOR)
  })

  it("boardTypeScale at board width keeps the body floor when 0.6×title is below it", () => {
    const board = boardTypeScale(BOARD_CARD_W)
    expect(board.title).toBeCloseTo(23)
    expect(board.body).toBe(FORM_BODY_FLOOR)
    expect(board.body).toBeGreaterThan(board.title * FORM_BODY_TITLE_CAP)
  })

  it("layoutFormBody honors titleSize via the 0.6 cap", () => {
    const laid = layoutFormBody("副文本在卡片里应该明显小于标题", {
      maxWidth: 400,
      fontSize: 40,
      titleSize: 40,
    })
    expect(laid.fontSize).toBeLessThanOrEqual(40 * FORM_BODY_TITLE_CAP + 1e-6)
    expect(laid.fontSize).toBeGreaterThanOrEqual(FORM_BODY_FLOOR)
  })

  it("fillCardType upscale keeps body at or under 0.6 of title", () => {
    const filled = fillCardType({
      innerH: 400,
      contentW: 300,
      titleSize: 23,
      bodySize: 16.5,
      gap: 8,
      longestBody: "自建算力替换公有云推理，单台设备的月度成本下降三成一。",
      titles: ["自建算力替换"],
    })
    expect(filled.titleSize).toBeGreaterThan(FORM_TITLE_FLOOR)
    expect(filled.bodySize).toBeLessThanOrEqual(filled.titleSize * FORM_BODY_TITLE_CAP + 1e-6)
    expect(filled.bodySize).toBeGreaterThanOrEqual(FORM_BODY_FLOOR)
  })

  it("capFormBody never drops below the body floor", () => {
    expect(capFormBody(20, 18)).toBe(FORM_BODY_FLOOR)
    expect(capFormBody(40, 30)).toBeCloseTo(24)
  })

  it("academic outline_grid on a tall slot keeps body ≤ 0.6 title", () => {
    const ctx = themeCtx("academic")
    const box = { x: 0, y: 0, w: 1088, h: 520 }
    const { container } = svg(iconCards.render(GALLERY_THREE, box, ctx))
    const item = GALLERY_THREE.items[0]!
    const titles = titleNodes(container, item.title)
    const bodies = Array.from(container.querySelectorAll("text")).filter((el) => {
      const s = el.textContent ?? ""
      return s.includes("公有云") || s.includes("月度成本")
    })
    expect(titles.length).toBeGreaterThan(0)
    expect(bodies.length).toBeGreaterThan(0)
    const titleFs = Math.max(...titles.map(fontSizeOf))
    const cap = Math.max(FORM_BODY_FLOOR, titleFs * FORM_BODY_TITLE_CAP)
    expect(titleFs).toBeGreaterThan(FORM_TITLE_FLOOR)
    for (const t of bodies) {
      expect(fontSizeOf(t), `body "${t.textContent}" vs title ${titleFs}`).toBeLessThanOrEqual(cap + 0.05)
      expect(fontSizeOf(t)).toBeGreaterThanOrEqual(FORM_BODY_FLOOR)
    }
  })
})
