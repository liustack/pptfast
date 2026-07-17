// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import PptxGenJS from "pptxgenjs"
import JSZip from "jszip"
import { svgToOps } from "./dispatch"
import { renderOps, applyGradientFills, type SlideLike } from "./render"

/**
 * End-to-end smoke test: a hand-made SVG covering every supported element type
 * is converted to ops and applied to a real pptxgenjs slide, then written to a
 * buffer. This catches API-shape mismatches a spy can't (e.g. pptxgenjs
 * rejecting a custGeom points array or a fill prop).
 */
const SAMPLE_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
    <rect x="0" y="0" width="1280" height="720" fill="#FFFFFF"/>
    <rect x="40" y="40" width="200" height="80" rx="12" fill="rgba(26,74,138,0.9)"/>
    <circle cx="400" cy="120" r="48" fill="#3366CC"/>
    <ellipse cx="600" cy="120" rx="80" ry="40" fill="#88AADD" stroke="#1A1A1A" stroke-width="2"/>
    <line x1="40" y1="200" x2="240" y2="280" stroke="#999999" stroke-width="1.5"/>
    <line x1="240" y1="200" x2="40" y2="280" stroke="#999999" stroke-width="1.5" stroke-dasharray="4,4"/>
    <polygon points="320,200 420,200 370,300" fill="#22AA66"/>
    <polyline points="460,300 520,240 580,300" fill="none" stroke="#AA2266" stroke-width="3"/>
    <path d="M 700,200 L 900,200 L 900,320 L 700,320 Z" fill="#444444"/>
    <path d="M 1000,260 L 1100,260 A 100,100 0 0 1 1000,360 Z" fill="#CC8800"/>
    <g transform="translate(40,420)">
      <text x="0" y="40" font-size="36" fill="#1A1A1A" font-family="Georgia" font-weight="700">Title</text>
      <text x="0" y="90" font-size="20" fill="#555555"><tspan>Lead </tspan><tspan font-weight="bold">bold</tspan></text>
    </g>
    <image x="1000" y="420" width="120" height="120" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="/>
  </svg>
`

function parseSvg(markup: string): Element {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml")
  const svg = doc.querySelector("svg")
  if (!svg) throw new Error("no svg parsed")
  return svg
}

describe("svg2pptx end-to-end", () => {
  it("converts a full sample SVG and writes a valid pptx buffer", async () => {
    const ops = svgToOps(parseSvg(SAMPLE_SVG))
    // Every drawable element should produce exactly one op.
    expect(ops.length).toBe(13)

    const pptx = new PptxGenJS()
    pptx.defineLayout({ name: "W", width: 13.333, height: 7.5 })
    pptx.layout = "W"
    const slide = pptx.addSlide()

    expect(() => renderOps(slide as unknown as SlideLike, ops)).not.toThrow()

    const buf = (await pptx.write({ outputType: "nodebuffer" })) as Uint8Array
    expect(buf.length).toBeGreaterThan(0)
  })
})

/**
 * A linear-gradient rect and a radial-gradient circle, referenced via
 * `fill="url(#…)"` — the controlled-subset shape subset-validate now allows.
 * The linear gradient's second stop carries `stop-opacity` to exercise the
 * `a:alpha` path in the same pass.
 */
const GRADIENT_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
    <defs>
      <linearGradient id="lin1" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#FF0000"/>
        <stop offset="1" stop-color="#0000FF" stop-opacity="0.5"/>
      </linearGradient>
      <radialGradient id="rad1">
        <stop offset="0" stop-color="#FFFFFF"/>
        <stop offset="1" stop-color="#000000"/>
      </radialGradient>
    </defs>
    <rect x="40" y="40" width="200" height="80" fill="url(#lin1)"/>
    <circle cx="400" cy="120" r="48" fill="url(#rad1)"/>
  </svg>
`

describe("svg2pptx gradient export", () => {
  it("converts a linear + radial gradient SVG to real a:gradFill XML in the written pptx", async () => {
    const ops = svgToOps(parseSvg(GRADIENT_SVG))
    expect(ops.map((o) => o.kind)).toEqual(["shape", "shape"])

    const pptx = new PptxGenJS()
    pptx.defineLayout({ name: "W", width: 13.333, height: 7.5 })
    pptx.layout = "W"
    const slide = pptx.addSlide()

    const patches = renderOps(slide as unknown as SlideLike, ops)
    expect(patches).toHaveLength(2)

    const buf = (await pptx.write({ outputType: "nodebuffer" })) as Uint8Array
    const patched = await applyGradientFills(buf, patches)

    const zip = await JSZip.loadAsync(await patched.arrayBuffer())
    const slideXml = await zip.files["ppt/slides/slide1.xml"].async("string")

    // Both shapes patched to a real gradFill (not left as solid placeholders).
    expect(slideXml.match(/<a:gradFill/g)).toHaveLength(2)

    // Linear: (0,0)→(1,0) is the 0deg case from the angle table; stop colors/positions verbatim.
    expect(slideXml).toContain('<a:lin ang="0" scaled="1"/>')
    expect(slideXml).toContain('<a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs>')
    // stop-opacity 0.5 → a:alpha val=50000 (50% of the 100000-scale).
    expect(slideXml).toContain(
      '<a:gs pos="100000"><a:srgbClr val="0000FF"><a:alpha val="50000"/></a:srgbClr></a:gs>',
    )

    // Radial: stops + the centered circle path/fillToRect idiom.
    expect(slideXml).toContain('<a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs>')
    expect(slideXml).toContain('<a:gs pos="100000"><a:srgbClr val="000000"/></a:gs>')
    expect(slideXml).toContain('<a:path path="circle">')
    expect(slideXml).toContain('<a:fillToRect l="50000" t="50000" r="50000" b="50000"/>')
  })

  it("folds element opacity into every gradFill stop's alpha (not just the discarded placeholder solid fill)", async () => {
    const svg = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <defs>
          <linearGradient id="lin1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#FF0000"/>
            <stop offset="1" stop-color="#0000FF" stop-opacity="0.5"/>
          </linearGradient>
        </defs>
        <rect x="40" y="40" width="200" height="80" fill="url(#lin1)" opacity="0.06"/>
      </svg>
    `)
    const ops = svgToOps(svg)
    expect(ops).toHaveLength(1)

    const pptx = new PptxGenJS()
    pptx.defineLayout({ name: "W", width: 13.333, height: 7.5 })
    pptx.layout = "W"
    const slide = pptx.addSlide()

    const patches = renderOps(slide as unknown as SlideLike, ops)
    const buf = (await pptx.write({ outputType: "nodebuffer" })) as Uint8Array
    const patched = await applyGradientFills(buf, patches)

    const zip = await JSZip.loadAsync(await patched.arrayBuffer())
    const slideXml = await zip.files["ppt/slides/slide1.xml"].async("string")

    // Stop 1 has no own stop-opacity (implicit full alpha=1) × element opacity 0.06 → 6000/100000.
    expect(slideXml).toContain(
      '<a:gs pos="0"><a:srgbClr val="FF0000"><a:alpha val="6000"/></a:srgbClr></a:gs>',
    )
    // Stop 2's own stop-opacity=0.5 × element opacity 0.06 → 3000/100000 — not the
    // pre-fix 50000 that stop-opacity alone would produce (the bug this test locks:
    // the shape's own `opacity` used to survive only on the placeholder <a:solidFill>
    // that applyGradientFills discards wholesale).
    expect(slideXml).toContain(
      '<a:gs pos="100000"><a:srgbClr val="0000FF"><a:alpha val="3000"/></a:srgbClr></a:gs>',
    )
  })

  it("leaves the pptx untouched when there are no gradient patches", async () => {
    const ops = svgToOps(
      parseSvg(
        `<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10" fill="#FF0000"/></svg>`,
      ),
    )
    const pptx = new PptxGenJS()
    pptx.defineLayout({ name: "W", width: 13.333, height: 7.5 })
    pptx.layout = "W"
    const slide = pptx.addSlide()
    const patches = renderOps(slide as unknown as SlideLike, ops)
    expect(patches).toHaveLength(0)

    const buf = (await pptx.write({ outputType: "nodebuffer" })) as Uint8Array
    const patched = await applyGradientFills(buf, patches)
    const zip = await JSZip.loadAsync(await patched.arrayBuffer())
    const slideXml = await zip.files["ppt/slides/slide1.xml"].async("string")
    expect(slideXml).toContain('<a:srgbClr val="FF0000"/>')
    expect(slideXml).not.toContain("a:gradFill")
  })

  it("throws if asked to patch a shape name absent from every slide", async () => {
    const pptx = new PptxGenJS()
    pptx.addSlide().addShape("rect", { x: 0, y: 0, w: 1, h: 1, fill: { color: "FF0000" } })
    const buf = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer

    await expect(
      applyGradientFills(new Uint8Array(buf), [
        { objectName: "svg2pptx-gradient-does-not-exist", xml: "<a:gradFill/>" },
      ]),
    ).rejects.toThrow(/not found in any slide/)
  })
})
