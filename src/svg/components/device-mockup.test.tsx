// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { deviceMockup } from "./device-mockup"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
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
  bodyFontPx: 24,
  images: {
    dash: { src: "data:image/png;base64,AAAA" },
    "dash-alt": { src: "data:image/png;base64,AAAA", alt: "Route optimization dashboard" },
  },
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

describe("device_mockup component — browser", () => {
  it("renders <image> cover-cropped below the chrome bar", () => {
    const component = { type: "device_mockup" as const, device: "browser" as const, asset_id: "dash" }
    const { container } = svg(deviceMockup.render(component, { x: 80, y: 100, w: 1120 }, ctx))
    const g = container.querySelector("g")
    expect(g?.getAttribute("transform")).toBe("translate(80,100)")

    const img = container.querySelector("image")
    expect(img).not.toBeNull()
    expect(img?.getAttribute("href")).toBe("data:image/png;base64,AAAA")
    expect(img?.getAttribute("preserveAspectRatio")).toContain("slice")
  })

  it("emits aria-label from the asset's alt text when present (A11Y-01 alt chain, new emission site)", () => {
    const component = { type: "device_mockup" as const, device: "browser" as const, asset_id: "dash-alt" }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 1120 }, ctx))
    const img = container.querySelector("image")
    expect(img?.getAttribute("aria-label")).toBe("Route optimization dashboard")
  })

  it("emits no aria-label at all when the asset has no alt text (zero-byte-change guarantee)", () => {
    const component = { type: "device_mockup" as const, device: "browser" as const, asset_id: "dash" }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 1120 }, ctx))
    const img = container.querySelector("image")
    expect(img?.hasAttribute("aria-label")).toBe(false)
  })

  it("renders three traffic-light dots and a url pill when url is set", () => {
    const component = {
      type: "device_mockup" as const,
      device: "browser" as const,
      asset_id: "dash",
      url: "app.routeoptimize.com/dispatch",
    }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 1120 }, ctx))
    expect(container.querySelectorAll("circle").length).toBe(3)
    const text = Array.from(container.querySelectorAll("text")).find((t) =>
      t.textContent?.includes("app.routeoptimize.com"),
    )
    expect(text).not.toBeUndefined()
    expect(text?.getAttribute("data-contrast-tier")).toBe("meta")
  })

  it("renders no url pill/text when url is unset", () => {
    const component = { type: "device_mockup" as const, device: "browser" as const, asset_id: "dash" }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 1120 }, ctx))
    // three dots still render; no text at all besides them (no caption either)
    expect(container.querySelectorAll("text").length).toBe(0)
  })

  it("never renders a screen <image> when the asset is missing — placeholder only, no fake content", () => {
    const component = { type: "device_mockup" as const, device: "browser" as const, asset_id: "nonexistent" }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 800 }, ctx))
    expect(container.querySelector("image")).toBeNull()
    const placeholderRect = Array.from(container.querySelectorAll("rect")).find(
      (r) => r.getAttribute("fill") === ctx.colors.surface,
    )
    expect(placeholderRect).not.toBeUndefined()
  })

  it("still paints the chrome frame (outer border + top bar) when the asset is missing", () => {
    const component = { type: "device_mockup" as const, device: "browser" as const, asset_id: "nonexistent" }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 800 }, ctx))
    expect(container.querySelector("path")).not.toBeNull() // rounded-top chrome bar
    const outer = Array.from(container.querySelectorAll("rect")).find(
      (r) => r.getAttribute("stroke") === ctx.colors.border,
    )
    expect(outer).not.toBeUndefined()
  })

  it("renders caption inside the screen's own bottom strip", () => {
    const component = { type: "device_mockup" as const, device: "browser" as const, asset_id: "dash", caption: "调度仪表盘" }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 1120 }, ctx))
    const captionEl = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "调度仪表盘")
    expect(captionEl).not.toBeUndefined()
    expect(captionEl?.getAttribute("fill")).toBe(ctx.colors.surface)
  })

  it("caps a full-width browser frame's measured height so it fits every theme's content rect", () => {
    const component = { type: "device_mockup" as const, device: "browser" as const, asset_id: "dash" }
    const w = 1088
    expect(deviceMockup.measure(component, w, ctx)).toBeLessThanOrEqual(380)
  })

  it("truncates/shrinks a very long url instead of overflowing the pill", () => {
    const component = {
      type: "device_mockup" as const,
      device: "browser" as const,
      asset_id: "dash",
      url: `https://example.com/${"a".repeat(120)}`,
    }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 400 }, ctx))
    const text = Array.from(container.querySelectorAll("text")).find((t) => t.textContent?.startsWith("https://"))
    expect(text).not.toBeUndefined()
    const fontSize = Number(text!.getAttribute("font-size"))
    const truncated = text!.textContent!.endsWith("…")
    expect(fontSize < 12 || truncated).toBe(true)
  })
})

describe("device_mockup component — phone", () => {
  it("renders <image> cover-cropped inside the bezel, centered within a wider column", () => {
    const component = { type: "device_mockup" as const, device: "phone" as const, asset_id: "dash" }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 1120 }, ctx))
    const img = container.querySelector("image")
    expect(img).not.toBeNull()
    expect(img?.getAttribute("preserveAspectRatio")).toContain("slice")
  })

  it("emits aria-label from the asset's alt text (A11Y-01 alt chain)", () => {
    const component = { type: "device_mockup" as const, device: "phone" as const, asset_id: "dash-alt" }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 1120 }, ctx))
    const img = container.querySelector("image")
    expect(img?.getAttribute("aria-label")).toBe("Route optimization dashboard")
  })

  it("keeps the phone frame narrow and centered rather than stretching to the column width (裁定 3)", () => {
    const component = { type: "device_mockup" as const, device: "phone" as const, asset_id: "dash" }
    const box = { x: 0, y: 0, w: 1120 }
    const { container } = svg(deviceMockup.render(component, box, ctx))
    const outerRect = container.querySelector("rect")!
    const frameW = Number(outerRect.getAttribute("width"))
    expect(frameW).toBeLessThan(box.w)
    // measured height must equal the actual rendered frame height
    const measuredH = deviceMockup.measure(component, box.w, ctx)
    expect(Number(outerRect.getAttribute("height"))).toBe(measuredH)
  })

  it("degrades a too-narrow column to a smaller (still-proportioned) phone rather than overflowing (MAX_IMAGE_H precedent)", () => {
    const component = { type: "device_mockup" as const, device: "phone" as const, asset_id: "dash" }
    // The phone's own natural (MAX_DEVICE_H-budget) width is well under 160px
    // (19:9 portrait at a 340px height cap) — a column narrower than that
    // must clamp the phone's width (and, proportionally, its height) down
    // instead of overflowing the column.
    const narrowH = deviceMockup.measure(component, 100, ctx)
    const wideH = deviceMockup.measure(component, 1120, ctx)
    expect(narrowH).toBeLessThan(wideH)
  })

  it("never renders a screen <image> when the asset is missing — placeholder only", () => {
    const component = { type: "device_mockup" as const, device: "phone" as const, asset_id: "nonexistent" }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 800 }, ctx))
    expect(container.querySelector("image")).toBeNull()
    const placeholderRect = Array.from(container.querySelectorAll("rect")).find(
      (r) => r.getAttribute("fill") === ctx.colors.surface,
    )
    expect(placeholderRect).not.toBeUndefined()
  })

  it("renders caption inside the screen's own bottom strip", () => {
    const component = { type: "device_mockup" as const, device: "phone" as const, asset_id: "dash", caption: "调度" }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 1120 }, ctx))
    const captionEl = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "调度")
    expect(captionEl).not.toBeUndefined()
  })
})
