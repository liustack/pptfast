// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { Background } from "./Background"
import type { BackgroundSpec } from "@/ir"

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

describe("Background", () => {
  it("renders a full-bleed rect for a color spec", () => {
    const spec: BackgroundSpec = { kind: "color", value: "#FAFAF6" }
    const { container } = svg(<Background spec={spec} />)
    const rect = container.querySelector("rect")
    expect(rect?.getAttribute("fill")).toBe("#FAFAF6")
    expect(rect?.getAttribute("width")).toBe("1280")
    expect(rect?.getAttribute("height")).toBe("720")
  })

  it("renders a gradient as multiple rect bands (first=from, last=to)", () => {
    const spec: BackgroundSpec = { kind: "gradient", from: "#001020", to: "#102030" }
    const { container } = svg(<Background spec={spec} />)
    const rects = Array.from(container.querySelectorAll("rect"))
    expect(rects.length).toBeGreaterThanOrEqual(10)
    expect(rects[0].getAttribute("fill")).toBe("#001020")
    expect(rects[rects.length - 1].getAttribute("fill")).toBe("#102030")
  })

  it("renders lr gradient as vertical bands with x offsets", () => {
    const spec: BackgroundSpec = {
      kind: "gradient",
      from: "#000000",
      to: "#FFFFFF",
      direction: "lr",
    }
    const { container } = svg(<Background spec={spec} />)
    const rects = Array.from(container.querySelectorAll("rect"))
    expect(rects.length).toBeGreaterThanOrEqual(10)
    // lr bands should have varying x and full height
    expect(rects[0].getAttribute("x")).toBe("0")
    expect(rects[0].getAttribute("height")).toBe("720")
    expect(rects[0].getAttribute("fill")).toBe("#000000")
    expect(rects[rects.length - 1].getAttribute("fill")).toBe("#FFFFFF")
  })

  it("renders an asset image with overlay scrim", () => {
    const spec: BackgroundSpec = {
      kind: "asset",
      asset_id: "bg1",
      fit: "cover",
      overlay: { color: "#000000", opacity: 0.4 },
    }
    const { container } = svg(
      <Background spec={spec} images={{ bg1: { src: "data:image/png;base64,AAAA" } }} />,
    )
    const image = container.querySelector("image")
    expect(image?.getAttribute("href")).toBe("data:image/png;base64,AAAA")
    expect(image?.getAttribute("preserveAspectRatio")).toContain("slice")
    const scrim = Array.from(container.querySelectorAll("rect")).find(
      (r) => r.getAttribute("fill") === "#000000",
    )
    expect(scrim?.getAttribute("fill-opacity")).toBe("0.4")
  })
})

describe("Background auto scrim (image-layouts P1)", () => {
  // 设计主题上 asset 背景未显式给 overlay 时自动叠主题化对比度遮罩
  // （surface 色、上浅下深渐变 bands）——文字压图可读性由系统兜底。
  const asset: BackgroundSpec = { kind: "asset", asset_id: "bg1" }
  const images = { bg1: { src: "data:image/png;base64,AAAA" } }

  it("applies a uniform scrim rect when no explicit overlay", () => {
    const { container } = svg(
      <Background spec={asset} images={images} autoScrimColor="#0E2A47" />,
    )
    const scrims = Array.from(container.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("fill") === "#0E2A47",
    )
    expect(scrims).toHaveLength(1)
    const opacity = Number(scrims[0].getAttribute("fill-opacity"))
    // 0.66：0.8 时用户裁决「看不清背景」（2026-07-09）——下限保文字可读，
    // 上限保图像可辨。
    expect(opacity).toBeGreaterThanOrEqual(0.6)
    expect(opacity).toBeLessThan(0.75)
  })

  it("explicit overlay wins over auto scrim", () => {
    const withOverlay: BackgroundSpec = {
      ...asset,
      overlay: { color: "#112233", opacity: 0.5 },
    }
    const { container } = svg(
      <Background spec={withOverlay} images={images} autoScrimColor="#0E2A47" />,
    )
    expect(
      Array.from(container.querySelectorAll("rect")).filter(
        (r) => r.getAttribute("fill") === "#0E2A47",
      ),
    ).toHaveLength(0)
    const scrim = Array.from(container.querySelectorAll("rect")).find(
      (r) => r.getAttribute("fill") === "#112233",
    )
    expect(scrim?.getAttribute("fill-opacity")).toBe("0.5")
  })

  it("no auto scrim without autoScrimColor (custom theme keeps bare image)", () => {
    const { container } = svg(<Background spec={asset} images={images} />)
    expect(container.querySelectorAll("rect")).toHaveLength(0)
  })
})
