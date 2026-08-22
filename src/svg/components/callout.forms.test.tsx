// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { callout } from "./callout"
import { resolveComponentForm } from "./form-assignments"
import type { ComponentCtx } from "./types"
import { CANONICAL_THEME_IDS, resolveStyle } from "../../themes"
import { buildCtx } from "../full-slide-svg"
import { PACING_BUDGETS } from "@/narrative"

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

function themeCtx(id: string): ComponentCtx {
  return buildCtx(resolveStyle(id), {})
}

const BOX = { x: 0, y: 0, w: 800 }

function warn(text: string) {
  return { type: "callout" as const, variant: "warn" as const, text }
}

function isEdgeBar(rect: Element, cardW: number, cardH: number): boolean {
  const w = Number(rect.getAttribute("width"))
  const h = Number(rect.getAttribute("height"))
  return (w <= 12 && h >= cardH * 0.7) || (h <= 6 && w >= cardW * 0.7)
}

describe("callout form assignment covers every canonical theme", () => {
  it("every canonical theme resolves a callout form", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const row = resolveComponentForm("callout", id)
      expect(row, id).toBeDefined()
      expect(["tint_panel", "hanging_bare", "lead_word"]).toContain(row!.form)
    }
  })

  it("heritage is TintPanel, not the hanging/lead reference skins", () => {
    expect(resolveComponentForm("callout", "heritage")?.form).toBe("tint_panel")
  })

  it("swiss is TintPanel (LeadWord swiss is reference only)", () => {
    expect(resolveComponentForm("callout", "swiss")?.form).toBe("tint_panel")
  })
})

describe("callout morphs: no single-edge bar", () => {
  it("no canonical theme paints a thin-wide edge bar on callout", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const ctx = themeCtx(id)
      const { container } = svg(callout.render(warn("警告信息文本"), BOX, ctx))
      const rects = [...container.querySelectorAll("rect")]
      const cardH = callout.measure(warn("警告信息文本"), BOX.w, ctx)
      for (const rect of rects) {
        expect(isEdgeBar(rect, BOX.w, cardH), `${id} edge bar`).toBe(false)
      }
    }
  })

  it("TintPanel is a full-width face, not a stroke and not a hairline", () => {
    const ctx = themeCtx("heritage")
    const { container } = svg(callout.render(warn("风电行业的取数链路仍在打磨"), BOX, ctx))
    const rects = [...container.querySelectorAll("rect")]
    expect(rects.length).toBeGreaterThanOrEqual(1)
    const panel = rects.reduce((a, b) =>
      Number(a.getAttribute("width")) * Number(a.getAttribute("height")) >
      Number(b.getAttribute("width")) * Number(b.getAttribute("height"))
        ? a
        : b,
    )
    expect(Number(panel.getAttribute("width"))).toBe(BOX.w)
    expect(Number(panel.getAttribute("height"))).toBeGreaterThan(20)
    expect(panel.getAttribute("fill")).not.toBe(ctx.colors.bg)
    expect(panel.getAttribute("stroke")).toBeNull()
    const hairlines = rects.filter((r) => Number(r.getAttribute("height")) <= 3)
    expect(hairlines).toHaveLength(0)
  })

  it("swiss TintPanel is square, tech TintPanel is rounded, heritage is a small rx", () => {
    const swiss = svg(callout.render(warn("警告"), BOX, themeCtx("swiss")))
    const tech = svg(callout.render(warn("警告"), BOX, themeCtx("tech")))
    const heritage = svg(callout.render(warn("警告"), BOX, themeCtx("heritage")))
    const rx = (rendered: ReturnType<typeof svg>) =>
      Number(
        [...rendered.container.querySelectorAll("rect")].find(
          (r) => Number(r.getAttribute("width")) === BOX.w,
        )?.getAttribute("rx") ?? "0",
      )
    expect(rx(swiss)).toBe(0)
    expect(rx(tech)).toBe(8)
    expect(rx(heritage)).toBe(2)
  })

  it("hanging_bare and lead_word paint zero container rect", () => {
    for (const id of ["memo", "insight", "luxe", "ember"] as const) {
      const { container } = svg(callout.render(warn("警告信息文本"), BOX, themeCtx(id)))
      expect(container.querySelectorAll("rect"), id).toHaveLength(0)
    }
  })
})

describe("callout lead-word lexicon", () => {
  const cases = [
    ["warn", "风险", "Risk"],
    ["info", "注意", "Note"],
    ["tip", "提示", "Tip"],
  ] as const

  it.each(cases)("%s CJK text uses %s, English text uses %s", (variant, zh, en) => {
    const ctx = themeCtx("luxe")
    const zhNode = svg(
      callout.render({ type: "callout", variant, text: "风电行业的取数链路仍在打磨" }, BOX, ctx),
    )
    const enNode = svg(
      callout.render(
        { type: "callout", variant, text: "The data path still needs another quarter of work." },
        BOX,
        ctx,
      ),
    )
    const zhWords = [...zhNode.container.querySelectorAll("text")].map((t) => t.textContent)
    const enWords = [...enNode.container.querySelectorAll("text")].map((t) => t.textContent)
    expect(zhWords).toContain(zh)
    expect(enWords).toContain(en)
    expect(zhWords).not.toContain(en)
    expect(enWords).not.toContain(zh)
  })

  it("lead_word has no icon path and no box", () => {
    const { container } = svg(
      callout.render(warn("风电行业的取数链路仍在打磨"), BOX, themeCtx("luxe")),
    )
    expect(container.querySelector("rect")).toBeNull()
    expect(container.querySelector("path")).toBeNull()
    expect(container.textContent).toContain("风险")
  })
})

describe("callout hanging memo stamp", () => {
  it("memo uses a typewriter WARN:/NOTE:/TIP: label instead of an icon", () => {
    const ctx = themeCtx("memo")
    const labels: Record<"warn" | "info" | "tip", string> = {
      warn: "WARN:",
      info: "NOTE:",
      tip: "TIP:",
    }
    for (const variant of ["warn", "info", "tip"] as const) {
      const { container } = svg(
        callout.render(
          { type: "callout", variant, text: "风电行业的取数链路仍在打磨" },
          BOX,
          ctx,
        ),
      )
      expect(container.textContent).toContain(labels[variant])
      const stamp = [...container.querySelectorAll("text")].find(
        (t) => t.textContent === labels[variant],
      )
      expect(stamp, variant).toBeTruthy()
      expect(stamp!.getAttribute("letter-spacing")).toBeTruthy()
      expect(stamp!.getAttribute("font-family")).toBe(ctx.fonts.mono)
    }
  })
})

describe("callout morphs keep pacing and emphasis", () => {
  it("dense pacing still renders font-size 20 on TintPanel body", () => {
    const ctx: ComponentCtx = {
      ...themeCtx("heritage"),
      bodyFontPx: PACING_BUDGETS.dense.bodyBaselinePx,
    }
    const { container } = svg(
      callout.render({ type: "callout", variant: "info", text: "档位字号验证提示" }, BOX, ctx),
    )
    const body = [...container.querySelectorAll("text")].find((t) =>
      (t.textContent ?? "").includes("档位"),
    )
    expect(body?.getAttribute("font-size")).toBe("20")
  })
})
