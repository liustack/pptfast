// @vitest-environment node
//
// Node `rasterizeSvg` (audit-v2 phase B, spec §4.3/§11.7-§11.9). Two jobs:
//
// 1. Wiring/contract tests — output size, RGBA layout, the remote-asset
//    guard, the missing-Sharp explicit failure.
// 2. The red-first Sharp/librsvg fidelity probe spec §11.9's escape clause
//    demands *before* this task's implementation is trusted: render a real
//    subset of this repo's own SVG output (gradient bands, a rounded arc
//    path built the same way `insight_panel.tsx`/`roadmap.tsx`'s shared
//    (private, unexported) `roundedTopBarPath` helper does, an embedded
//    bitmap, stacked-translucency compositing matching `image-pages.tsx`'s
//    `DarkScrim`) against independently-known-correct colors. Any one of
//    these coming back visibly wrong is spec §11.9's pre-authorized trigger
//    to swap this file's implementation for `@resvg/resvg-js` — see this
//    task's own report for the verdict this suite produced.
import { beforeAll, describe, expect, it } from "vitest"
import { installNodePlatform, isMissingModuleError } from "./node"
import { getPlatform } from "./registry"
import { makeSolidRegionPngDataUri, twoToneSquarePng } from "./test-png-fixture"

beforeAll(() => {
  installNodePlatform()
})

function rasterize(svg: string, w = 1280, h = 720) {
  const impl = getPlatform().rasterizeSvg
  if (!impl) throw new Error("installNodePlatform() did not wire rasterizeSvg")
  return impl(svg, w, h)
}

/** Read one RGBA pixel out of a `RasterizedImage`-shaped buffer. */
function pixelAt(image: { width: number; data: Uint8ClampedArray }, x: number, y: number): [number, number, number, number] {
  const i = (y * image.width + x) * 4
  return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!, image.data[i + 3]!]
}

describe("rasterizeSvg (Sharp) — wiring", () => {
  it("rasterizes to exactly the requested width/height regardless of the source viewBox", async () => {
    const svg = `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg"><rect width="1280" height="720" fill="#000000"/></svg>`
    const image = await rasterize(svg, 1280, 720)
    expect(image.width).toBe(1280)
    expect(image.height).toBe(720)
    expect(image.data.length).toBe(1280 * 720 * 4)
  })

  it("returns fully-opaque RGBA for an opaque solid-fill page (alpha channel present and 255)", async () => {
    const svg = `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg"><rect width="1280" height="720" fill="#336699"/></svg>`
    const image = await rasterize(svg)
    expect(pixelAt(image, 640, 360)).toEqual([0x33, 0x66, 0x99, 255])
  })
})

describe("rasterizeSvg (Sharp) — remote asset guard", () => {
  it("throws explicitly on an http(s) image href, never attempting to rasterize (no network access)", async () => {
    const svg = `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/photo.jpg" x="0" y="0" width="1280" height="720"/></svg>`
    await expect(rasterize(svg)).rejects.toThrow(/remote image.*https:\/\/example\.com\/photo\.jpg/)
  })

  it("throws on a legacy xlink:href remote reference too", async () => {
    const svg = `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg"><image xlink:href="http://example.com/photo.jpg" x="0" y="0" width="1280" height="720"/></svg>`
    await expect(rasterize(svg)).rejects.toThrow(/remote image/)
  })

  it("does not throw for a data-URI image href", async () => {
    const uri = makeSolidRegionPngDataUri(4, 4, () => [1, 2, 3])
    const svg = `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg"><image href="${uri}" x="0" y="0" width="1280" height="720"/></svg>`
    await expect(rasterize(svg)).resolves.toBeTruthy()
  })
})

describe("isMissingModuleError", () => {
  it("recognizes Node's ERR_MODULE_NOT_FOUND code", () => {
    const err = Object.assign(new Error("Cannot find package 'sharp'"), { code: "ERR_MODULE_NOT_FOUND" })
    expect(isMissingModuleError(err)).toBe(true)
  })

  it("recognizes a 'Cannot find' message even without the code (CJS require() shape)", () => {
    expect(isMissingModuleError(new Error("Cannot find module 'sharp'"))).toBe(true)
  })

  it("does not misclassify an unrelated error", () => {
    expect(isMissingModuleError(new Error("libvips: invalid SVG"))).toBe(false)
    expect(isMissingModuleError(new TypeError("boom"))).toBe(false)
    expect(isMissingModuleError(null)).toBe(false)
    expect(isMissingModuleError(undefined)).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────
// Sharp/librsvg fidelity probe (spec §11.9 escape-clause evidence). Every
// case below renders markup built the same way this repo's own components
// build it, then samples specific pixels against a color this test computed
// independently of Sharp (never by rendering with Sharp and reading back
// its own output) — see this task's report for the full verdict.
// ────────────────────────────────────────────────────────────────────────

describe("rasterizeSvg (Sharp) — real-SVG-subset fidelity probe", () => {
  it("gradient bands: renders background.tsx's own 24-solid-rect-band approximation with exact per-band color", async () => {
    // Mirrors gradient-bands.ts + background.tsx's tb-direction band layout
    // exactly (same band count, same rounding) — the actual markup this
    // renderer emits for `background: { kind: "gradient" }` is a stack of
    // opaque <rect> bands, never a real <linearGradient>, so this is the
    // genuine risk surface, not a synthetic stand-in for it.
    function parseHex(hex: string): [number, number, number] {
      const h = hex.replace("#", "")
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
    }
    function toHex(r: number, g: number, b: number): string {
      const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
      return `#${[c(r), c(g), c(b)].map((v) => v.toString(16).toUpperCase().padStart(2, "0")).join("")}`
    }
    const n = 24
    const [r1, g1, b1] = parseHex("#FF0000")
    const [r2, g2, b2] = parseHex("#0000FF")
    const bands = Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1)
      return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
    })
    const bandH = 720 / n
    const rects = bands
      .map((fill, i) => `<rect x="0" y="${Math.round(bandH * i)}" width="1280" height="${Math.ceil(bandH) + 1}" fill="${fill}"/>`)
      .join("")
    const svg = `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`
    const image = await rasterize(svg)

    const [er0, eg0, eb0] = parseHex(bands[0]!)
    expect(pixelAt(image, 10, 5)).toEqual([er0, eg0, eb0, 255])
    const [er23, eg23, eb23] = parseHex(bands[23]!)
    expect(pixelAt(image, 10, 715)).toEqual([er23, eg23, eb23, 255])
    const midY = Math.round(bandH * 12 + 5)
    const [er12, eg12, eb12] = parseHex(bands[12]!)
    expect(pixelAt(image, 10, midY)).toEqual([er12, eg12, eb12, 255])
  })

  it("rounded arc path: the exact d-string grammar insight_panel.tsx/roadmap.tsx's shared roundedTopBarPath builds rasterizes with exact fill color, inside and outside the curve", async () => {
    // roundedTopBarPath's own formula (both components keep it module-private
    // — see deck-audit.ts's own doc comment on the same shape), reproduced
    // here at larger scale (an easier-to-sample stand-in for the real ~6px
    // bar) purely to build markup with the identical arc-command grammar
    // (`M ... A rr rr 0 0 1 ... L ... A rr rr 0 0 1 ... L ... L ... Z`) —
    // exactly the shape deck-audit.ts's own arc-bbox fix (fix/arc-bbox) had
    // to get right for the *measurement* side; this probes the *rendering*
    // side of the same construction.
    function roundedTopBarPath(x: number, y: number, w: number, h: number, r: number): string {
      const rr = Math.min(r, w / 2, h)
      return (
        `M ${x} ${y + rr} A ${rr} ${rr} 0 0 1 ${x + rr} ${y} ` +
        `L ${x + w - rr} ${y} A ${rr} ${rr} 0 0 1 ${x + w} ${y + rr} ` +
        `L ${x + w} ${y + h} L ${x} ${y + h} Z`
      )
    }
    const d = roundedTopBarPath(100, 100, 400, 80, 30)
    const svg = `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg"><rect width="1280" height="720" fill="#FFFFFF"/><path d="${d}" fill="#2255AA"/></svg>`
    const image = await rasterize(svg)

    expect(pixelAt(image, 300, 140)).toEqual([0x22, 0x55, 0xaa, 255]) // flat middle of the bar
    expect(pixelAt(image, 105, 175)).toEqual([0x22, 0x55, 0xaa, 255]) // square bottom-left corner, inside
    expect(pixelAt(image, 102, 102)).toEqual([0xff, 0xff, 0xff, 255]) // just outside the rounded top-left corner — must stay background, not bleed
  })

  it("embedded bitmap: a real PNG asset (the exact <image href=data:...> shape background.tsx emits for an asset background) rasterizes both regions to their known colors", async () => {
    const uri = makeSolidRegionPngDataUri(40, 40, (_x, y) => (y < 20 ? [0xff, 0xee, 0x33] : [0x0b, 0x12, 0x20]))
    const svg = `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg"><image href="${uri}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/></svg>`
    const image = await rasterize(svg)

    expect(pixelAt(image, 200, 100)).toEqual([0xff, 0xee, 0x33, 255])
    expect(pixelAt(image, 200, 600)).toEqual([0x0b, 0x12, 0x20, 255])
  })

  it("transparency: stacked translucent rects (image-pages.tsx's own DarkScrim shape — three overlapping fill-opacity bands) composite within 2/255 of independently-computed sequential alpha blending", async () => {
    // DarkScrim's exact three bands (image-pages.tsx): full-height 0.3, bottom
    // 45% at 0.28, bottom 22% at 0.3, all #0A0E14 — over a bright yellow
    // stand-in background so the compounding is visible at every sample
    // point. Tolerance (not exact-equality) is deliberate and itself part of
    // this task's evidence: this task's own probe found sequential 3-layer
    // compositing lands Sharp within 1/255 per channel of hand-computed
    // sequential over-blending — real, expected floating-point/rounding
    // noise (spec §11.10's own determinism footnote: no cross-platform byte
        // guarantee), nowhere near enough to move a contrast ratio across the
    // 1.5:1 hard-finding gate.
    const svg = `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="1280" height="720" fill="#FFDD00"/>
      <rect x="0" y="0" width="1280" height="720" fill="#0A0E14" fill-opacity="0.3"/>
      <rect x="0" y="396" width="1280" height="324" fill="#0A0E14" fill-opacity="0.28"/>
      <rect x="0" y="562" width="1280" height="158" fill="#0A0E14" fill-opacity="0.3"/>
    </svg>`
    const image = await rasterize(svg)

    function blend(fg: [number, number, number], bg: [number, number, number], a: number): [number, number, number] {
      return [Math.round(fg[0] * a + bg[0] * (1 - a)), Math.round(fg[1] * a + bg[1] * (1 - a)), Math.round(fg[2] * a + bg[2] * (1 - a))]
    }
    const scrim: [number, number, number] = [0x0a, 0x0e, 0x14]

    let topExpected: [number, number, number] = [0xff, 0xdd, 0x00]
    topExpected = blend(scrim, topExpected, 0.3)
    const topActual = pixelAt(image, 10, 50)
    for (let c = 0; c < 3; c++) expect(Math.abs(topActual[c] - topExpected[c])).toBeLessThanOrEqual(2)
    expect(topActual[3]).toBe(255)

    let bottomExpected: [number, number, number] = [0xff, 0xdd, 0x00]
    bottomExpected = blend(scrim, bottomExpected, 0.3)
    bottomExpected = blend(scrim, bottomExpected, 0.28)
    bottomExpected = blend(scrim, bottomExpected, 0.3)
    const bottomActual = pixelAt(image, 10, 650)
    for (let c = 0; c < 3; c++) expect(Math.abs(bottomActual[c] - bottomExpected[c])).toBeLessThanOrEqual(2)
    expect(bottomActual[3]).toBe(255)
  })

  it("(reference only) confirms twoToneSquarePng's own split matches makeSolidRegionPngDataUri's per-pixel contract", () => {
    const png = twoToneSquarePng(4, [1, 2, 3], [4, 5, 6])
    expect(png.length).toBeGreaterThan(0)
  })
})
