// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { deviceMockup } from "./device-mockup"
import { contrastRatio } from "../ink"
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
  it("renders <image> cover-cropped below the frame bar", () => {
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

  it("still paints the device frame (outer border + top bar) when the asset is missing", () => {
    const component = { type: "device_mockup" as const, device: "browser" as const, asset_id: "nonexistent" }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 800 }, ctx))
    expect(container.querySelector("path")).not.toBeNull() // rounded-top window bar
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

// Review fix round, Important-2: on a near-black theme (tech: bg #060A13 vs
// surface #0A101C) the window bar/dots/url pill barely separated
// from the page behind them or from each other — a plain `colors.surface`
// fill has almost no luminance headroom against a `colors.bg` that close.
// These two ctx fixtures reproduce the two real shapes that failure took
// (near-black *and* the flat-white enterprise/runway case where bg and
// surface are the exact same hex, zero headroom by construction) rather
// than re-deriving the fix's own formula and asserting it matches itself.
const darkCtx: ComponentCtx = {
  ...ctx,
  colors: { ...ctx.colors, bg: "#060A13", surface: "#0A101C", muted: "#8A94A6", border: "#2C3140" },
}
const flatLightCtx: ComponentCtx = {
  ...ctx,
  colors: { ...ctx.colors, bg: "#FFFFFF", surface: "#FFFFFF", muted: "#6B6B6B", border: "#D5D5CB" },
}

describe("device_mockup frame color derivation (review fix round, Important-2)", () => {
  it("derives a frame-bar fill with guaranteed separation from the ambient background on a near-black theme", () => {
    const component = {
      type: "device_mockup" as const,
      device: "browser" as const,
      asset_id: "dash",
      url: "app.example.com",
    }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 1120 }, darkCtx))
    const frameBar = container.querySelector("path")!
    const barFill = frameBar.getAttribute("fill")!
    expect(barFill).not.toBe(darkCtx.colors.surface)
    expect(barFill).not.toBe(darkCtx.colors.bg)
    // The whole point: mixing surface toward the theme's own readable ink
    // must measurably separate the bar from the page background — a plain
    // `colors.surface` fill (bg #060A13 vs surface #0A101C) barely clears
    // 1.1:1 against bg, nowhere near enough to read as its own layer.
    expect(contrastRatio(barFill, darkCtx.colors.bg)).toBeGreaterThan(
      contrastRatio(darkCtx.colors.surface, darkCtx.colors.bg),
    )
  })

  it("derives a guaranteed-separation frame-bar fill even when surface and bg are the exact same hex (flat-white theme)", () => {
    const component = { type: "device_mockup" as const, device: "browser" as const, asset_id: "dash" }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 1120 }, flatLightCtx))
    const barFill = container.querySelector("path")!.getAttribute("fill")!
    // surface === bg here, so the fill must differ from both by construction
    // — zero shift would mean zero separation, not "imperceptible".
    expect(barFill).not.toBe(flatLightCtx.colors.surface)
    expect(contrastRatio(barFill, flatLightCtx.colors.bg)).toBeGreaterThan(1)
  })

  it("renders the three dots in colors.muted, not colors.border (border isn't contrast-calibrated per-theme)", () => {
    const component = { type: "device_mockup" as const, device: "browser" as const, asset_id: "dash" }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 1120 }, darkCtx))
    const dots = Array.from(container.querySelectorAll("circle"))
    expect(dots).toHaveLength(3)
    for (const dot of dots) {
      expect(dot.getAttribute("fill")).toBe(darkCtx.colors.muted)
      expect(dot.getAttribute("fill")).not.toBe(darkCtx.colors.border)
    }
  })

  it("derives a url-pill fill one step further than the frame bar, so the pill reads as its own nested layer", () => {
    const component = {
      type: "device_mockup" as const,
      device: "browser" as const,
      asset_id: "dash",
      url: "app.example.com/dispatch",
    }
    const { container } = svg(deviceMockup.render(component, { x: 0, y: 0, w: 1120 }, darkCtx))
    const frameBarFill = container.querySelector("path")!.getAttribute("fill")!
    const urlPill = Array.from(container.querySelectorAll("rect")).find(
      (r) => r.getAttribute("rx") && Number(r.getAttribute("rx")) > 5 && r.getAttribute("width") !== r.getAttribute("height"),
    )!
    const pillFill = urlPill.getAttribute("fill")!
    expect(pillFill).not.toBe(frameBarFill)
    expect(contrastRatio(pillFill, darkCtx.colors.bg)).toBeGreaterThan(contrastRatio(frameBarFill, darkCtx.colors.bg))
    // The url text itself must still clear the meta-tier 3:1 floor against
    // its own (now-derived) pill fill, not the ambient page background.
    const urlText = Array.from(container.querySelectorAll("text")).find((t) => t.textContent?.includes("app.example.com"))!
    expect(contrastRatio(urlText.getAttribute("fill")!, pillFill)).toBeGreaterThanOrEqual(3)
  })
})
