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
import { installNodePlatform } from "../../platform/node"
import { installPlatform } from "../../platform/registry"
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
