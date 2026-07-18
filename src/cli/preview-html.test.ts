import { describe, expect, it } from "vitest"
import { buildPreviewHtml, type PreviewHtmlSlideInput } from "./preview-html"

/** Minimal-but-realistic standalone slide SVG, matching what `renderSlideSvg`
 *  (`../api.ts`) actually produces: a `viewBox="0 0 1280 720"` root with the
 *  SVG namespace declared — the one `http` substring every real slide
 *  contains (`../svg/serialize.ts`'s `renderSvgMarkup`). The embedded text
 *  node includes a literal `&` on purpose (already-valid SVG/XML, pre-escaped
 *  as `&amp;`) so a test can catch the builder double-escaping raw SVG it
 *  must instead pass through byte-for-byte. */
function fakeSvg(label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><text>${label} &amp; co</text></svg>`
}

function slide(overrides: Partial<PreviewHtmlSlideInput> & { index: number }): PreviewHtmlSlideInput {
  return {
    type: "content",
    svg: fakeSvg(`slide ${overrides.index}`),
    ...overrides,
  }
}

describe("buildPreviewHtml", () => {
  it("embeds every slide's SVG exactly once (single embed per slide, reused visually for the thumbnail)", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 }), slide({ index: 1 }), slide({ index: 2 })],
    })
    expect(html.match(/<svg\b/g)).toHaveLength(3)
  })

  it("embeds the raw SVG markup byte-for-byte, without re-escaping it", () => {
    const svg = fakeSvg("literal")
    const html = buildPreviewHtml({ title: "deck", slides: [slide({ index: 0, svg })] })
    expect(html).toContain(svg)
    // A naive "escape everything" builder would turn the SVG's own already-valid
    // `&amp;` into `&amp;amp;` — assert that did not happen.
    expect(html).not.toContain("&amp;amp;")
  })

  it("HTML-escapes the deck title (user content) wherever it appears", () => {
    const html = buildPreviewHtml({
      title: `<script>alert("x")</script> & friends`,
      slides: [slide({ index: 0 })],
    })
    expect(html).not.toContain('<script>alert("x")</script>')
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("&amp; friends")
  })

  it("HTML-escapes a slide id (user content) wherever it appears", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0, id: `p-1" onmouseover="alert(1)` })],
    })
    expect(html).not.toContain(`p-1" onmouseover="alert(1)`)
    expect(html).toContain("p-1&quot; onmouseover=&quot;alert(1)")
  })

  it("shows the initial page counter with the 1-based position, total, and the active slide's id", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0, id: "p-cover" }), slide({ index: 1 }), slide({ index: 2 })],
    })
    expect(html).toMatch(/1\s*\/\s*3/)
    expect(html).toContain("p-cover")
  })

  it("marks a placeholder slide with a visible 'unfilled' badge, in both the main view and the thumbnail", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 }), slide({ index: 1, placeholder: true }), slide({ index: 2 })],
    })
    // One badge riding along with the slide's own moving node (shows in the
    // stage when active, in its thumbnail slot otherwise) + one always-present
    // badge on the thumbnail button itself (stays visible even while the
    // slide's SVG is on loan to the stage) — see the module's own doc comment.
    // Counted by CSS class, not by the raw word "unfilled" — that word also
    // appears in the thumbnail's title/aria-label for the same slide (an
    // intentional accessibility echo of the visible badge, not a badge itself).
    expect(html.match(/class="pf-badge"/g)).toHaveLength(1)
    expect(html.match(/class="pf-thumb-badge"/g)).toHaveLength(1)
    expect(html).toContain(">unfilled<")
  })

  it("never shows an 'unfilled' badge when no slide is a placeholder", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 }), slide({ index: 1 })],
    })
    expect(html).not.toContain("unfilled")
  })

  it("includes keyboard left/right navigation JS", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 }), slide({ index: 1 })],
    })
    expect(html).toContain("ArrowLeft")
    expect(html).toContain("ArrowRight")
  })

  it("never embeds an <img> tag (SVG is inlined directly, never referenced as an external file)", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 }), slide({ index: 1 })],
    })
    expect(html).not.toContain("<img")
  })

  it("self-containment: no http(s) reference anywhere except known SVG/XML namespace URIs", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 }), slide({ index: 1, placeholder: true })],
    })
    const KNOWN_NAMESPACE_URIS = new Set(["http://www.w3.org/2000/svg"])
    const matches = html.match(/https?:\/\/[^\s"'<>)]+/g) ?? []
    const unexpected = matches.filter((m) => !KNOWN_NAMESPACE_URIS.has(m))
    expect(unexpected).toEqual([])
    // The assertion above is vacuously true if the regex just never matched
    // anything at all — guard against that by proving the fixture really does
    // contain at least the one expected namespace URI.
    expect(matches.length).toBeGreaterThan(0)
  })

  it("is a pure function: identical input produces identical output", () => {
    const input = { title: "deck", slides: [slide({ index: 0 }), slide({ index: 1 })] }
    expect(buildPreviewHtml(input)).toBe(buildPreviewHtml(input))
  })
})
