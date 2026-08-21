// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { imageGrid } from "./image-grid"
import { imageCompare } from "./image-compare"
import type { ComponentCtx } from "./types"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { resolveStyle } from "../../themes"
import { buildCtx } from "../full-slide-svg"
import { readableOn } from "../ink"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#051C2C",
    accent: "#FFC72C",
    text: "#1A2421",
    muted: "#5D6B65",
    border: "#D5D5CB",
    chartPalette: ["#051C2C", "#FFC72C"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
  images: {
    a: { src: "data:image/png;base64,AAAA", alt: "Team offsite, group photo" },
    b: { src: "data:image/png;base64,BBBB" },
    c: { src: "data:image/png;base64,CCCC" },
    d: { src: "data:image/png;base64,DDDD" },
  },
}

const TEST_IMAGES = ctx.images!

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const box = { x: 0, y: 0, w: 1012 }

describe("image_grid component", () => {
  it("renders one <image> per item, side by side for 2 items, with captions", () => {
    const component = {
      type: "image_grid" as const,
      items: [
        { asset_id: "a", caption: "浅色调" },
        { asset_id: "b" },
      ],
    }
    const { container } = svg(<>{imageGrid.render(component, box, ctx)}</>)
    const images = container.querySelectorAll("image")
    expect(images).toHaveLength(2)
    expect(images[0].getAttribute("preserveAspectRatio")).toBe("xMidYMid slice")
    expect(container.textContent).toContain("浅色调")
    // 高度 = 单行比例高 + caption
    const h = imageGrid.measure(component, box.w, ctx)
    expect(h).toBeGreaterThan(200)
    expect(h).toBeLessThanOrEqual(340 + 26)
  })

  it("2x2 layout for 4 items stays within the grid height budget and drops captions", () => {
    const component = {
      type: "image_grid" as const,
      items: [
        { asset_id: "a", caption: "会被忽略" },
        { asset_id: "b" },
        { asset_id: "c" },
        { asset_id: "d" },
      ],
    }
    const { container } = svg(<>{imageGrid.render(component, box, ctx)}</>)
    expect(container.querySelectorAll("image")).toHaveLength(4)
    // 多行网格 caption 会与下行图重叠——不渲染
    expect(container.textContent).not.toContain("会被忽略")
    expect(imageGrid.measure(component, box.w, ctx)).toBe(340)
  })

  it("emphasis=first renders a hero cell wider than the side cells", () => {
    const component = {
      type: "image_grid" as const,
      emphasis: "first" as const,
      items: [{ asset_id: "a" }, { asset_id: "b" }, { asset_id: "c" }],
    }
    const { container } = svg(<>{imageGrid.render(component, box, ctx)}</>)
    const images = Array.from(container.querySelectorAll("image"))
    const heroW = Number(images[0].getAttribute("width"))
    const sideW = Number(images[1].getAttribute("width"))
    expect(heroW).toBeGreaterThan(sideW)
  })

  it("missing asset falls back to a placeholder, not a crash", () => {
    const component = {
      type: "image_grid" as const,
      items: [{ asset_id: "nope" }, { asset_id: "a" }],
    }
    const { container } = svg(<>{imageGrid.render(component, box, ctx)}</>)
    expect(container.textContent).toContain("Image missing")
    expect(container.querySelectorAll("image")).toHaveLength(1)
  })

  it("emits each cell's own asset alt as aria-label, and none at all when the asset has no alt (A11Y-01 follow-up)", () => {
    const component = {
      type: "image_grid" as const,
      items: [{ asset_id: "a" }, { asset_id: "b" }],
    }
    const { container } = svg(<>{imageGrid.render(component, box, ctx)}</>)
    const images = container.querySelectorAll("image")
    expect(images[0].getAttribute("aria-label")).toBe("Team offsite, group photo")
    expect(images[1].hasAttribute("aria-label")).toBe(false)
  })
})

describe("image_compare component", () => {
  const component = {
    type: "image_compare" as const,
    left: { asset_id: "a", label: "冷色调" },
    right: { asset_id: "b", label: "暖色调" },
  }

  it("renders two images with labels and a VS badge by default", () => {
    const { container } = svg(<>{imageCompare.render(component, box, ctx)}</>)
    expect(container.querySelectorAll("image")).toHaveLength(2)
    expect(container.textContent).toContain("冷色调")
    expect(container.textContent).toContain("暖色调")
    expect(container.textContent).toContain("VS")
    expect(container.querySelector("circle")).not.toBeNull()
  })

  it("before_after style renders corner tags instead of the VS badge", () => {
    const { container } = svg(
      <>{imageCompare.render({ ...component, style: "before_after" as const }, box, ctx)}</>,
    )
    expect(container.textContent).toContain("BEFORE")
    expect(container.textContent).toContain("AFTER")
    expect(container.textContent).not.toContain("VS")
    expect(container.querySelector("circle")).toBeNull()
  })

  it("measure stays within the image budget plus label strip", () => {
    const h = imageCompare.measure(component, box.w, ctx)
    expect(h).toBeLessThanOrEqual(320 + 40)
    expect(h).toBeGreaterThan(200)
  })

  it("emits each side's own asset alt as aria-label, and none at all when the asset has no alt (A11Y-01 follow-up)", () => {
    const { container } = svg(<>{imageCompare.render(component, box, ctx)}</>)
    const images = container.querySelectorAll("image")
    expect(images[0].getAttribute("aria-label")).toBe("Team offsite, group photo")
    expect(images[1].hasAttribute("aria-label")).toBe(false)
  })
})

function gridFormMarkup(node: React.ReactElement) {
  return renderSvgMarkup(<svg xmlns="http://www.w3.org/2000/svg">{node}</svg>)
}

describe("numbered_photos form", () => {
  const formBox = { x: 0, y: 0, w: 1012, h: 420 }
  const three = {
    type: "image_grid" as const,
    items: [
      { asset_id: "a", caption: "主轴承座" },
      { asset_id: "b", caption: "振动传感器" },
      { asset_id: "c", caption: "第一张预测工单" },
    ],
  }

  it("museum: caption above the image, specimen badge on the image top-left, equal columns", () => {
    const themeCtx = buildCtx(resolveStyle("museum"), TEST_IMAGES)
    const { container } = svg(imageGrid.render(three, formBox, themeCtx))
    const images = Array.from(container.querySelectorAll("image"))
    expect(images).toHaveLength(3)
    expect(images[0].getAttribute("preserveAspectRatio")).toBe("xMidYMid slice")
    const w0 = Number(images[0].getAttribute("width"))
    const w1 = Number(images[1].getAttribute("width"))
    expect(w0).toBeCloseTo(w1, 0)
    const cap = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "主轴承座")!
    expect(Number(cap.getAttribute("y"))).toBeLessThan(Number(images[0].getAttribute("y")))
    expect(container.textContent).toMatch(/№/)
    const badge = Array.from(container.querySelectorAll("rect")).find(
      (r) => r.getAttribute("fill") === themeCtx.colors.accent,
    )
    expect(badge).toBeTruthy()
    expect(Number(badge!.getAttribute("x"))).toBeCloseTo(Number(images[0].getAttribute("x")), 0)
    expect(Number(badge!.getAttribute("y"))).toBeCloseTo(Number(images[0].getAttribute("y")), 0)
    expect(container.textContent).not.toContain("1998")
  })

  it("playbill: caption below, invert badge fill is the theme bg token", () => {
    const themeCtx = buildCtx(resolveStyle("playbill"), TEST_IMAGES)
    const { container } = svg(imageGrid.render(three, formBox, themeCtx))
    const image = container.querySelector("image")!
    const cap = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "主轴承座")!
    expect(Number(cap.getAttribute("y"))).toBeGreaterThan(
      Number(image.getAttribute("y")) + Number(image.getAttribute("height")) - 4,
    )
    const badge = Array.from(container.querySelectorAll("rect")).find(
      (r) => r.getAttribute("fill") === themeCtx.colors.bg,
    )
    expect(badge).toBeTruthy()
    const ink = Array.from(container.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("01"))
    expect(ink?.getAttribute("fill")).toBe(readableOn(themeCtx.colors.bg))
  })

  it("runway: caption below, accent badge, ignores emphasis=first", () => {
    const themeCtx = buildCtx(resolveStyle("runway"), TEST_IMAGES)
    const ir = { ...three, emphasis: "first" as const }
    const { container } = svg(imageGrid.render(ir, formBox, themeCtx))
    const images = Array.from(container.querySelectorAll("image"))
    expect(Number(images[0].getAttribute("width"))).toBeCloseTo(Number(images[1].getAttribute("width")), 0)
    const badge = Array.from(container.querySelectorAll("rect")).find(
      (r) => r.getAttribute("fill") === themeCtx.colors.accent,
    )
    expect(badge).toBeTruthy()
    const cap = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "主轴承座")!
    expect(Number(cap.getAttribute("y"))).toBeGreaterThan(Number(images[0].getAttribute("y")))
  })

  it("missing asset still falls back to Image missing", () => {
    const themeCtx = buildCtx(resolveStyle("museum"), TEST_IMAGES)
    const ir = {
      type: "image_grid" as const,
      items: [
        { asset_id: "nope", caption: "缺图" },
        { asset_id: "a", caption: "有图" },
      ],
    }
    const { container } = svg(imageGrid.render(ir, formBox, themeCtx))
    expect(container.textContent).toContain("Image missing")
    expect(container.querySelectorAll("image")).toHaveLength(1)
  })

  it("consulting (unassigned) markup is byte-identical to the default face", () => {
    const withId = buildCtx(resolveStyle("consulting"), TEST_IMAGES)
    const withoutId = { ...withId, themeId: undefined }
    const ir = {
      type: "image_grid" as const,
      items: [
        { asset_id: "a", caption: "浅色调" },
        { asset_id: "b" },
      ],
    }
    expect(gridFormMarkup(imageGrid.render(ir, box, withId))).toBe(gridFormMarkup(imageGrid.render(ir, box, withoutId)))
  })

  it("n=2 and n=4 stay inside the box, and the tree is subset-safe", () => {
    const themeCtx = buildCtx(resolveStyle("museum"), TEST_IMAGES)
    const two = {
      type: "image_grid" as const,
      items: [
        { asset_id: "a", caption: "甲" },
        { asset_id: "b", caption: "乙" },
      ],
    }
    const four = {
      type: "image_grid" as const,
      items: [
        { asset_id: "a", caption: "甲" },
        { asset_id: "b", caption: "乙" },
        { asset_id: "c", caption: "丙" },
        { asset_id: "d", caption: "丁" },
      ],
    }
    for (const ir of [two, four]) {
      const h = Math.max(imageGrid.measure(ir, formBox.w, themeCtx), 360)
      const renderBox = { x: 0, y: 0, w: formBox.w, h }
      const markup = gridFormMarkup(imageGrid.render(ir, renderBox, themeCtx))
      const root = parseSvgRoot(markup)
      expect(() => assertSubset(root)).not.toThrow()
      for (const el of Array.from(root.querySelectorAll("rect, image"))) {
        const x = Number(el.getAttribute("x") ?? 0)
        const y = Number(el.getAttribute("y") ?? 0)
        const w = Number(el.getAttribute("width") ?? 0)
        const hh = Number(el.getAttribute("height") ?? 0)
        expect(x).toBeGreaterThanOrEqual(-2)
        expect(y).toBeGreaterThanOrEqual(-2)
        expect(x + w).toBeLessThanOrEqual(renderBox.w + 2)
        expect(y + hh).toBeLessThanOrEqual(renderBox.h + 2)
      }
    }
  })
})
