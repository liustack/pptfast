// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { ImageSplit } from "./ImageSplit"
import type { Block } from "@/ir"
import type { BlockCtx } from "./blocks/types"

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
  images: { hero: { src: "data:image/png;base64,AAAA" } },
}

const rect = { x: 96, y: 200, w: 1088, h: 420 }

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

describe("ImageSplit variant (image-layouts P3)", () => {
  const blocks: Block[] = [
    { type: "image", asset_id: "hero", fit: "cover", caption: "旧机房实拍" },
    { type: "bullets", items: ["现状一", "现状二"] },
    { type: "paragraph", text: "说明文字。" },
  ]

  it("renders a full-height image column and stacks the rest beside it", () => {
    const { container } = svg(<ImageSplit blocks={blocks} rect={rect} ctx={ctx} />)
    const img = container.querySelector("image")
    expect(img?.getAttribute("height")).toBe(String(rect.h))
    expect(Number(img?.getAttribute("width"))).toBeCloseTo(Math.round(rect.w * 0.42), 0)
    expect(img?.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice")
    // 文字块排在图右侧
    expect(container.textContent).toContain("现状一")
    expect(container.textContent).toContain("说明文字。")
    // caption 色带
    expect(container.textContent).toContain("旧机房实拍")
  })

  it("falls back to single-column when there is no image block", () => {
    const noImage: Block[] = [{ type: "paragraph", text: "只有文字。" }]
    const { container } = svg(<ImageSplit blocks={noImage} rect={rect} ctx={ctx} />)
    expect(container.querySelector("image")).toBeNull()
    expect(container.textContent).toContain("只有文字。")
  })

  it("missing asset renders placeholder, not a crash", () => {
    const missing: Block[] = [
      { type: "image", asset_id: "nope", fit: "cover" },
      { type: "paragraph", text: "侧栏。" },
    ]
    const { container } = svg(<ImageSplit blocks={missing} rect={rect} ctx={ctx} />)
    expect(container.textContent).toContain("图片缺失")
    expect(container.textContent).toContain("侧栏。")
  })
})
