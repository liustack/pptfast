// @vitest-environment node
//
// Real end-to-end pixel-audit coverage (audit-v2 phase B) — runs under the
// real Node platform (`installNodePlatform()`), same rationale
// deck-audit.test.ts's own header gives: this suite exercises auditDeck's
// actual documented Node consumption path, real Sharp rasterization
// included, not a mock standing in for it.
//
// The "no platform capability at all" contract (auditDeck(ir, {pixels:
// true}) must reject explicitly, never report a silent clean pass) lives in
// its own file, pixel-audit-no-platform.test.ts — module-level platform
// state (src/platform/registry.ts's `current`) is shared across every
// describe/it block *within* one test file, so a file that also calls
// installNodePlatform() anywhere can never legitimately prove "nothing was
// installed" for another block in the same file.
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { PptxIR, Slide } from "@/ir"
import { measureTextUnits } from "../../lib/svg-text-layout"
import { installNodePlatform } from "../../platform/node"
import { installPlatform, type RasterizedImage } from "../../platform/registry"
import { makeSolidRegionPngDataUri } from "../../platform/test-png-fixture"
import { auditDeck } from "./deck-audit"
import { __pixelFindingsForPage, stripTextNodes } from "./pixel-audit"

function deck(themeId: string, slides: Slide[], overrides: Partial<PptxIR> = {}): PptxIR {
  return {
    version: "4",
    filename: "pixel-audit-fixture",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
    ...overrides,
  }
}

beforeAll(() => {
  installNodePlatform()
})

// ────────────────────────────────────────────────────────────────────────
// stripTextNodes — pure string transform, no platform needed.
// ────────────────────────────────────────────────────────────────────────

describe("stripTextNodes", () => {
  it("removes a <text>...</text> element entirely, including nested tspans", () => {
    const markup = `<svg><rect fill="#000"/><text x="0" y="0"><tspan fill="#fff">a</tspan><tspan>b</tspan></text><rect fill="#111"/></svg>`
    const stripped = stripTextNodes(markup)
    expect(stripped).not.toContain("<text")
    expect(stripped).not.toContain("<tspan")
    expect(stripped).toContain('<rect fill="#000"/>')
    expect(stripped).toContain('<rect fill="#111"/>')
  })

  it("removes multiple sibling <text> elements", () => {
    const markup = `<svg><text>one</text><g><text>two</text></g><text>three</text></svg>`
    expect(stripTextNodes(markup)).toBe("<svg><g></g></svg>")
  })

  it("leaves markup with no <text> at all unchanged", () => {
    const markup = `<svg><rect/><path d="M0 0 L1 1"/></svg>`
    expect(stripTextNodes(markup)).toBe(markup)
  })

  it("removes a self-closing <text/> element", () => {
    const markup = `<svg><text data-empty="1"/><rect/></svg>`
    expect(stripTextNodes(markup)).toBe("<svg><rect/></svg>")
  })
})

// ────────────────────────────────────────────────────────────────────────
// __pixelFindingsForPage — sampling-grid + hard-finding-threshold logic in
// isolation, with a hand-crafted rasterize function returning exact,
// controlled pixel data (see that export's own doc comment for why real
// component geometry can't reach the threshold-crossing branch directly).
// ────────────────────────────────────────────────────────────────────────

/** A `rasterize` stand-in that ignores its input and returns a uniform
 *  RGBA page of `[r,g,b]` — total control over "what the audit sees" with
 *  no Sharp/SVG involved at all. */
function uniformRasterizer(rgb: [number, number, number]) {
  return async (_svg: string, width: number, height: number) => {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = rgb[0]
      data[i + 1] = rgb[1]
      data[i + 2] = rgb[2]
      data[i + 3] = 255
    }
    return { width, height, data }
  }
}

describe("__pixelFindingsForPage", () => {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
    <image href="data:image/png;base64,x" x="0" y="0" width="1280" height="720"/>
    <text x="96" y="400" font-size="24" fill="#FFFFFF">caption on photo</text>
  </svg>`

  it("emits a low-contrast finding (code, page, slideId, pixel-source detail) when the sampled ratio is below 1.5", async () => {
    // White text (#FFFFFF, alpha 1) directly against a white-ish page (the
    // rasterizer ignores the image entirely and returns this flat color) —
    // ratio ~1:1, far under the 1.5 hard-finding gate.
    const findings = await __pixelFindingsForPage(markup, 3, "p-cover", uniformRasterizer([0xf0, 0xf0, 0xf0]))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      page: 3,
      slideId: "p-cover",
      code: "low-contrast",
    })
    expect(findings[0]!.message).toMatch(/pixel-sampled contrast ratio/)
    expect(findings[0]!.detail).toMatchObject({ source: "pixels", text: "caption on photo", fill: "#FFFFFF" })
    expect((findings[0]!.detail as { ratio: number }).ratio).toBeLessThan(1.5)
  })

  it("emits nothing once the sampled background is dark enough to clear the 1.5 gate", async () => {
    const findings = await __pixelFindingsForPage(markup, 1, undefined, uniformRasterizer([0x05, 0x05, 0x08]))
    expect(findings).toEqual([])
  })

  it("omits slideId when the caller passes undefined (same convention every other finding family uses)", async () => {
    const findings = await __pixelFindingsForPage(markup, 1, undefined, uniformRasterizer([0xf0, 0xf0, 0xf0]))
    expect(findings).toHaveLength(1)
    expect(findings[0]).not.toHaveProperty("slideId")
  })

  it("returns nothing (and never calls rasterize) for markup with no image-backed text", async () => {
    const clean = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#FFFFFF"/><text x="0" y="20" font-size="16" fill="#000000">normal text</text></svg>`
    let called = false
    const findings = await __pixelFindingsForPage(clean, 1, undefined, async (svg, w, h) => {
      called = true
      return uniformRasterizer([0, 0, 0])(svg, w, h)
    })
    expect(findings).toEqual([])
    expect(called).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────
// Dense-stride sampling coverage (deep-acceptance review finding 2). The
// old fixed 5×3-point grid provably missed a genuine sub-1.5:1 patch
// falling between sample points — demonstrated at ImageCoverPage's own
// real org-line scale (fontSize 21, x=96/y=104, white fill at 0.85
// fill-opacity — src/svg/ImagePages.tsx). This block pins that exact
// demonstrated miss as a red-first regression, plus the aligned control and
// a single-pixel noise-robustness case the new design must also satisfy.
// ────────────────────────────────────────────────────────────────────────

describe("worstCaseSample — dense-stride coverage (deep-acceptance review finding 2)", () => {
  // ImageCoverPage's real org-line parameters, verbatim.
  const TEXT = "Meridian Analytics Group" // plausible real org name, same length class task-2-review flagged
  const FONT_SIZE = 21
  const FILL = "#FFFFFF"
  const FILL_OPACITY = 0.85
  const X = 96
  const Y_BASELINE = 104
  const W = 1280
  const H = 720

  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><image href="data:image/png;base64,x" x="0" y="0" width="${W}" height="${H}"/><text x="${X}" y="${Y_BASELINE}" font-size="${FONT_SIZE}" fill="${FILL}" fill-opacity="${FILL_OPACITY}">${TEXT}</text></svg>`

  const left = X
  const right = X + measureTextUnits(TEXT) * FONT_SIZE

  // Reproduce the OLD fixed 5-column grid's own math purely to locate where
  // its blind spot fell — the fix itself no longer uses this formula at
  // all (see pixel-audit.ts's samplePositions), this is just how the
  // acceptance review's own probe found the miss.
  const OLD_SAMPLE_COLS = 5
  const oldColXs = Array.from({ length: OLD_SAMPLE_COLS }, (_, col) =>
    Math.round(left + (right - left) * (col / (OLD_SAMPLE_COLS - 1))),
  )
  const gap01 = oldColXs[1]! - oldColXs[0]!
  const gapCenter = Math.round((oldColXs[0]! + oldColXs[1]!) / 2) // 35px off column 0/1 at this scale
  const stripeW = Math.max(8, Math.min(24, gap01 - 10)) // 24px at this scale, per the report

  const FIELD_V = 30 // dark field: safe for 0.85-alpha white text (~12:1)
  const BAD_V = 250 // near-white patch: genuinely bad (hand-verified ~1.03:1 in the report)

  function rasterWithVerticalStripe(stripeX: number) {
    return async (_svg: string, width: number, height: number): Promise<RasterizedImage> => {
      const data = new Uint8ClampedArray(width * height * 4)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4
          const inStripe = x >= stripeX - stripeW / 2 && x <= stripeX + stripeW / 2
          const v = inStripe ? BAD_V : FIELD_V
          data[i] = v
          data[i + 1] = v
          data[i + 2] = v
          data[i + 3] = 255
        }
      }
      return { width, height, data }
    }
  }

  it("catches a genuinely sub-1.5:1 patch sitting in the old grid's blind gap (previously zero findings)", async () => {
    const findings = await __pixelFindingsForPage(markup, 1, "p1", rasterWithVerticalStripe(gapCenter))
    expect(findings).toHaveLength(1)
    expect((findings[0]!.detail as { ratio: number }).ratio).toBeLessThan(1.5)
  })

  it("still catches the same patch aligned to where the old grid's own column would have hit it (non-regression control)", async () => {
    const findings = await __pixelFindingsForPage(markup, 1, "p1", rasterWithVerticalStripe(oldColXs[1]!))
    expect(findings).toHaveLength(1)
    expect((findings[0]!.detail as { ratio: number }).ratio).toBeLessThan(1.5)
  })

  it("catches the same patch swept across a full old-grid gap period, not just the one historical offset", async () => {
    // Broader proof of the coverage guarantee than the single historical
    // repro above: a ~24px bad patch is caught no matter which of several
    // offsets across the gap it sits at.
    for (let offset = 0; offset < gap01; offset += 7) {
      const stripeX = oldColXs[0]! + offset
      const findings = await __pixelFindingsForPage(markup, 1, "p1", rasterWithVerticalStripe(stripeX))
      expect(findings, `offset ${offset} from column 0`).toHaveLength(1)
    }
  })
})

describe("worstCaseSample — single-pixel noise robustness (deep-acceptance review finding 2)", () => {
  const FONT_SIZE = 24
  const X = 96
  const Y_BASELINE = 200
  const W = 1280
  const H = 720
  const FILL = "#111111" // dark caption ink — the color direction where a lone DARK noise pixel is the adversarial case
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><image href="data:image/png;base64,x" x="0" y="0" width="${W}" height="${H}"/><text x="${X}" y="${Y_BASELINE}" font-size="${FONT_SIZE}" fill="${FILL}">noise probe</text></svg>`

  // The exact top-left sample center pixel-audit.ts's own dense grid always
  // starts at (samplePositions' loop starts at `lo`, i.e. the run's own
  // left edge / band top) — a deterministic, worst-case placement for a
  // single noisy pixel: guaranteed to land as some window's exact center,
  // not a matter of luck.
  const SAMPLE_ASCENT_RATIO = 0.75
  const noiseX = X
  const noiseY = Math.round(Y_BASELINE - FONT_SIZE * SAMPLE_ASCENT_RATIO)

  const SAFE_V = 232 // light field: comfortably safe for near-black text
  const NOISE_V = 8 // a single near-black outlier pixel (e.g. rasterizer antialiasing noise under a glyph edge)

  it("a lone dark pixel exactly at a sample center does not flip a safe patch into a finding", async () => {
    const raster = async (_svg: string, width: number, height: number): Promise<RasterizedImage> => {
      const data = new Uint8ClampedArray(width * height * 4)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4
          const v = x === noiseX && y === noiseY ? NOISE_V : SAFE_V
          data[i] = v
          data[i + 1] = v
          data[i + 2] = v
          data[i + 3] = 255
        }
      }
      return { width, height, data }
    }
    const findings = await __pixelFindingsForPage(markup, 1, "p1", raster)
    expect(findings).toEqual([])
  })

  it("a real, non-noise 12px-wide dark patch at the same spot still gets caught (the averaging window doesn't blind the check to a genuine defect)", async () => {
    const patchHalf = 6 // 12px wide, comfortably >= MIN_GUARANTEED_PATCH_PX
    const raster = async (_svg: string, width: number, height: number): Promise<RasterizedImage> => {
      const data = new Uint8ClampedArray(width * height * 4)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4
          const inPatch = Math.abs(x - noiseX) <= patchHalf
          const v = inPatch ? NOISE_V : SAFE_V
          data[i] = v
          data[i + 1] = v
          data[i + 2] = v
          data[i + 3] = 255
        }
      }
      return { width, height, data }
    }
    const findings = await __pixelFindingsForPage(markup, 1, "p1", raster)
    expect(findings).toHaveLength(1)
  })
})

// ────────────────────────────────────────────────────────────────────────
// auditDeck(ir, { pixels: true }) — real Sharp rasterization end to end.
// ────────────────────────────────────────────────────────────────────────

describe("auditDeck({ pixels: true }) — real Sharp rasterization", () => {
  it("stays synchronous and Promise-free when pixels is omitted (spec §11.7 semantic-layer contract)", () => {
    const ir = deck("consulting", [{ type: "cover", heading: "Cover", components: [] }])
    const result = auditDeck(ir)
    expect(result).not.toBeInstanceOf(Promise)
    expect(result.checks).toEqual({ svg: "completed", pixels: "not-requested" })
  })

  it("reports zero pixel findings for white cover text over a near-black photo (ImagePages.tsx's real ImageCoverPage/DarkScrim geometry)", async () => {
    const darkPhoto = makeSolidRegionPngDataUri(20, 20, () => [0x05, 0x05, 0x08])
    const ir = deck(
      "consulting",
      [{ type: "cover", heading: "Dark Cover Photo", background: { kind: "asset", asset_id: "photo" }, components: [] }],
      { meta: { organization: "Acme Co" }, assets: { images: { photo: { src: darkPhoto } } } },
    )

    const report = await auditDeck(ir, { pixels: true })
    expect(report.checks).toEqual({ svg: "completed", pixels: "completed" })
    expect(report.findings.filter((f) => f.detail?.source === "pixels")).toEqual([])
  })

  it("never calls the rasterizer at all when no page has image-backed text (a solid-color-only deck stays cheap)", async () => {
    const ir = deck("consulting", [
      { type: "cover", heading: "Plain Cover", components: [] },
      { type: "content", heading: "Body", components: [{ type: "paragraph", text: "hello" }] },
    ])
    const report = await auditDeck(ir, { pixels: true })
    expect(report.checks).toEqual({ svg: "completed", pixels: "completed" })
    expect(report.findings).toEqual([])
  })

  it("is deterministic on the same platform: two runs on the same IR produce byte-identical JSON", async () => {
    const photo = makeSolidRegionPngDataUri(20, 20, () => [0xf5, 0xf5, 0xf0])
    const ir = deck(
      "consulting",
      [{ type: "cover", heading: "Determinism Check", background: { kind: "asset", asset_id: "photo" }, components: [] }],
      { meta: { organization: "Acme Co" }, assets: { images: { photo: { src: photo } } } },
    )
    const [first, second] = await Promise.all([auditDeck(ir, { pixels: true }), auditDeck(ir, { pixels: true })])
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it("rejects with an explicit error (not a silent clean report) when an image-backed run sits on a remote http(s) asset", async () => {
    const ir = deck("consulting", [{ type: "cover", heading: "Remote Photo", background: { kind: "asset", asset_id: "photo" }, components: [] }], {
      assets: { images: { photo: { src: "https://example.com/photo.jpg" } } },
    })
    await expect(auditDeck(ir, { pixels: true })).rejects.toThrow(/remote image/)
  })
})

describe("auditDeck({ pixels: true }) — full pipeline with an injected rasterizer", () => {
  // installPlatform only overrides the one field it's given (registry.ts's
  // `current = {...current, ...p}`), and this restores the real Sharp
  // implementation afterward so it can't leak into the previous describe
  // block's tests if execution order ever changes.
  afterEach(() => {
    installNodePlatform()
  })

  it("surfaces a pixel low-contrast finding end-to-end through the real auditDeck/renderSlideSvg/ImageCoverPage chain when the platform's own rasterizer reports a genuinely bad ratio", async () => {
    installPlatform({
      rasterizeSvg: async (_svg, width, height) => {
        const data = new Uint8ClampedArray(width * height * 4)
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 0xf5
          data[i + 1] = 0xf5
          data[i + 2] = 0xf5
          data[i + 3] = 255
        }
        return { width, height, data }
      },
    })
    const ir = deck(
      "consulting",
      [{ type: "cover", heading: "Injected White Page", background: { kind: "asset", asset_id: "photo" }, components: [] }],
      { meta: { organization: "Acme Co" }, assets: { images: { photo: { src: "data:image/png;base64,x" } } } },
    )

    const report = await auditDeck(ir, { pixels: true })
    const pixelFindings = report.findings.filter((f) => f.detail?.source === "pixels")
    expect(pixelFindings.length).toBeGreaterThan(0)
    expect(pixelFindings[0]).toMatchObject({ page: 1, code: "low-contrast" })
  })
})
