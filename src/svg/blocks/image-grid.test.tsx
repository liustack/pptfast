// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { imageGrid } from "./image-grid"
import { imageCompare } from "./image-compare"
import type { BlockCtx } from "./types"

const ctx: BlockCtx = {
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
  images: {
    a: { src: "data:image/png;base64,AAAA" },
    b: { src: "data:image/png;base64,BBBB" },
    c: { src: "data:image/png;base64,CCCC" },
    d: { src: "data:image/png;base64,DDDD" },
  },
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const box = { x: 0, y: 0, w: 1012 }

describe("image_grid block", () => {
  it("renders one <image> per item, side by side for 2 items, with captions", () => {
    const block = {
      type: "image_grid" as const,
      items: [
        { asset_id: "a", caption: "浅色调" },
        { asset_id: "b" },
      ],
    }
    const { container } = svg(<>{imageGrid.render(block, box, ctx)}</>)
    const images = container.querySelectorAll("image")
    expect(images).toHaveLength(2)
    expect(images[0].getAttribute("preserveAspectRatio")).toBe("xMidYMid slice")
    expect(container.textContent).toContain("浅色调")
    // 高度 = 单行比例高 + caption
    const h = imageGrid.measure(block, box.w, ctx)
    expect(h).toBeGreaterThan(200)
    expect(h).toBeLessThanOrEqual(340 + 26)
  })

  it("2x2 layout for 4 items stays within the grid height budget and drops captions", () => {
    const block = {
      type: "image_grid" as const,
      items: [
        { asset_id: "a", caption: "会被忽略" },
        { asset_id: "b" },
        { asset_id: "c" },
        { asset_id: "d" },
      ],
    }
    const { container } = svg(<>{imageGrid.render(block, box, ctx)}</>)
    expect(container.querySelectorAll("image")).toHaveLength(4)
    // 多行网格 caption 会与下行图重叠——不渲染
    expect(container.textContent).not.toContain("会被忽略")
    expect(imageGrid.measure(block, box.w, ctx)).toBe(340)
  })

  it("emphasis=first renders a hero cell wider than the side cells", () => {
    const block = {
      type: "image_grid" as const,
      emphasis: "first" as const,
      items: [{ asset_id: "a" }, { asset_id: "b" }, { asset_id: "c" }],
    }
    const { container } = svg(<>{imageGrid.render(block, box, ctx)}</>)
    const images = Array.from(container.querySelectorAll("image"))
    const heroW = Number(images[0].getAttribute("width"))
    const sideW = Number(images[1].getAttribute("width"))
    expect(heroW).toBeGreaterThan(sideW)
  })

  it("missing asset falls back to a placeholder, not a crash", () => {
    const block = {
      type: "image_grid" as const,
      items: [{ asset_id: "nope" }, { asset_id: "a" }],
    }
    const { container } = svg(<>{imageGrid.render(block, box, ctx)}</>)
    expect(container.textContent).toContain("图片缺失")
    expect(container.querySelectorAll("image")).toHaveLength(1)
  })
})

describe("image_compare block", () => {
  const block = {
    type: "image_compare" as const,
    left: { asset_id: "a", label: "冷色调" },
    right: { asset_id: "b", label: "暖色调" },
  }

  it("renders two images with labels and a VS badge by default", () => {
    const { container } = svg(<>{imageCompare.render(block, box, ctx)}</>)
    expect(container.querySelectorAll("image")).toHaveLength(2)
    expect(container.textContent).toContain("冷色调")
    expect(container.textContent).toContain("暖色调")
    expect(container.textContent).toContain("VS")
    expect(container.querySelector("circle")).not.toBeNull()
  })

  it("before_after style renders corner tags instead of the VS badge", () => {
    const { container } = svg(
      <>{imageCompare.render({ ...block, style: "before_after" as const }, box, ctx)}</>,
    )
    expect(container.textContent).toContain("BEFORE")
    expect(container.textContent).toContain("AFTER")
    expect(container.textContent).not.toContain("VS")
    expect(container.querySelector("circle")).toBeNull()
  })

  it("measure stays within the image budget plus label strip", () => {
    const h = imageCompare.measure(block, box.w, ctx)
    expect(h).toBeLessThanOrEqual(320 + 40)
    expect(h).toBeGreaterThan(200)
  })
})
