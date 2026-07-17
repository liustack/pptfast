// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { image } from "./image"
import type { BlockCtx } from "./types"

const ctx: BlockCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    border: "#D5D5CB",
    chartPalette: ["#006A4E", "#00A878"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  images: { hero: { src: "data:image/png;base64,AAAA" } },
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

describe("image block", () => {
  it("renders <image> with correct href when asset exists and uses slice for cover fit", () => {
    const block = {
      type: "image" as const,
      asset_id: "hero",
      fit: "cover" as const,
    }
    const { container } = svg(
      image.render(block, { x: 80, y: 100, w: 1120 }, ctx),
    )
    const g = container.querySelector("g")
    expect(g?.getAttribute("transform")).toBe("translate(80,100)")

    const img = container.querySelector("image")
    expect(img).not.toBeNull()
    expect(img?.getAttribute("href")).toBe("data:image/png;base64,AAAA")
    expect(img?.getAttribute("preserveAspectRatio")).toContain("slice")
  })

  it("renders placeholder rect when asset is missing", () => {
    const block = {
      type: "image" as const,
      asset_id: "nonexistent",
      fit: "contain" as const,
    }
    const { container } = svg(
      image.render(block, { x: 0, y: 0, w: 800 }, ctx),
    )
    const img = container.querySelector("image")
    expect(img).toBeNull()

    const rect = container.querySelector("rect")
    expect(rect).not.toBeNull()
    expect(rect?.getAttribute("fill")).toBe(ctx.colors.surface)
  })

  it("renders caption inside a bottom strip (P3 卡片化) without extra measure", () => {
    const withCaption = {
      type: "image" as const,
      asset_id: "hero",
      fit: "contain" as const,
      caption: "示例图片",
    }
    const withoutCaption = {
      type: "image" as const,
      asset_id: "hero",
      fit: "contain" as const,
    }

    const w = 1120
    // caption 画在图内底部色带，不再额外占高
    expect(image.measure(withCaption, w, ctx)).toBe(image.measure(withoutCaption, w, ctx))

    const { container } = svg(
      image.render(withCaption, { x: 0, y: 0, w }, ctx),
    )
    const texts = container.querySelectorAll("text")
    const captionEl = Array.from(texts).find(
      (t) => t.textContent === "示例图片",
    )
    expect(captionEl).not.toBeUndefined()
    // 色带上的白字（surface 色）+ 主题主色色带
    expect(captionEl?.getAttribute("fill")).toBe(ctx.colors.surface)
    const strip = Array.from(container.querySelectorAll("rect")).find(
      (r) => r.getAttribute("fill") === ctx.colors.primary,
    )
    expect(strip).not.toBeUndefined()
    // 卡片框线
    const border = Array.from(container.querySelectorAll("rect")).find(
      (r) => r.getAttribute("stroke") === ctx.colors.border,
    )
    expect(border).not.toBeUndefined()
  })

  it("shrinks/truncates a very long caption to fit the image width", () => {
    const block = {
      type: "image" as const,
      asset_id: "hero",
      fit: "contain" as const,
      caption: "非常".repeat(60),
    }
    const { container } = svg(
      image.render(block, { x: 0, y: 0, w: 300 }, ctx),
    )
    const texts = container.querySelectorAll("text")
    const captionEl = Array.from(texts).find((t) =>
      t.textContent?.startsWith("非常"),
    )!
    expect(captionEl).not.toBeUndefined()
    const fontSize = Number(captionEl.getAttribute("font-size"))
    const shrunk = fontSize < 16
    const truncated = captionEl.textContent!.endsWith("…")
    expect(shrunk || truncated).toBe(true)
  })

  it("caps a full-width image's measured height so it fits every theme's content rect", () => {
    const block = {
      type: "image" as const,
      asset_id: "hero",
      fit: "contain" as const,
      caption: "示例图片",
    }
    const w = 1088
    // Smallest content-rect height across themes is 380-400px; an uncapped
    // w*0.5+caption (≈576px) would exceed it and get dropped by
    // layoutContentFit's overflow guard, rendering a blank slide.
    expect(image.measure(block, w, ctx)).toBeLessThanOrEqual(380)

    const { container } = svg(image.render(block, { x: 0, y: 0, w }, ctx))
    const img = container.querySelector("image")!
    expect(Number(img.getAttribute("height"))).toBeLessThanOrEqual(340)
  })
})
