import { describe, expect, it } from "vitest"
import { buildPreviewHtml, type PreviewHtmlChecks, type PreviewHtmlFinding, type PreviewHtmlSlideInput } from "./preview-html"

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

describe("buildPreviewHtml — audit findings overlay (notes+preview wave, task 2)", () => {
  const finding = (overrides: Partial<PreviewHtmlFinding> & { page: number }): PreviewHtmlFinding => ({
    code: "low-contrast",
    message: "some finding message",
    ...overrides,
  })

  it("marks a page with findings with a count badge, in both the main view and the thumbnail — same double-badge shape as the 'unfilled' placeholder badge", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 }), slide({ index: 1 }), slide({ index: 2 })],
      findings: [finding({ page: 2 }), finding({ page: 2, code: "overlap" })],
    })
    // page 2 = slides[1] (index 1, 0-based) — one badge riding with the
    // slide's own moving node, one always-present badge on its thumbnail
    // button, same "two homes" shape `slideNode`/`thumbButton` already use
    // for the 'unfilled' badge.
    expect(html.match(/class="pf-finding-badge"/g)).toHaveLength(1)
    expect(html.match(/class="pf-thumb-finding-badge"/g)).toHaveLength(1)
    expect(html).toContain(">2<") // 2 findings on that page
  })

  it("never shows a finding-count badge when there are no findings", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 }), slide({ index: 1 })],
    })
    // Checked by class *usage* (an element carrying the class), not by the
    // bare substring — the CSS in <style> always defines `.pf-finding-badge`
    // regardless of whether any element ever uses it.
    expect(html).not.toContain('class="pf-finding-badge"')
    expect(html).not.toContain('class="pf-thumb-finding-badge"')
  })

  it("renders a findings panel entry per finding (code + message), each wired to navigate to its own page", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 }), slide({ index: 1, id: "p-body" })],
      findings: [finding({ page: 2, slideId: "p-body", code: "overflow", message: "text overflows its column" })],
    })
    expect(html).toContain('id="pf-audit-panel"')
    expect(html).toContain("Audit findings (1)")
    expect(html).toContain('class="pf-finding" data-page-index="1"') // page 2 → slide index 1
    expect(html).toContain("[overflow]")
    expect(html).toContain("text overflows its column")
    expect(html).toContain("p-body")
  })

  it("omits the findings panel entirely when there are no findings", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 })],
    })
    expect(html).not.toContain('id="pf-audit-panel"')
    expect(html).not.toContain('id="pf-audit-findings"')
  })

  it("HTML-escapes a finding's code/message/slideId (user content — a finding's message quotes the offending slide's own text)", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 })],
      findings: [
        finding({ page: 1, message: `text "<script>alert(1)</script>" overflows`, slideId: `p" onmouseover="x` }),
      ],
    })
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("p&quot; onmouseover=&quot;x")
  })

  it("embeds findings as a JSON data blob, safely escaping a literal </script sequence a slide's own text could contain", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 })],
      findings: [finding({ page: 1, message: `text "</script><script>alert(1)</script>" overflows` })],
    })
    expect(html).toContain('<script type="application/json" id="pf-audit-findings">')
    // The dangerous substring must never appear verbatim inside the emitted
    // markup — it was escaped to a unicode < sequence before embedding.
    expect(html).not.toContain("</script><script>alert(1)")
    const dataBlobMatch = html.match(/<script type="application\/json" id="pf-audit-findings">(.*?)<\/script>/s)
    expect(dataBlobMatch).not.toBeNull()
    const embedded = JSON.parse(dataBlobMatch![1]!.replace(/\\u003c/g, "<")) as PreviewHtmlFinding[]
    expect(embedded[0]!.message).toContain("</script><script>alert(1)</script>")
  })

  it("shows a one-line audit note in the header, and no findings UI at all, when the caller passes auditNote (the placeholder-skip contract)", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 }), slide({ index: 1, placeholder: true })],
      auditNote: "audit overlay skipped — deck has unfilled placeholder pages",
    })
    expect(html).toContain('id="pf-audit-note"')
    expect(html).toContain("audit overlay skipped")
    expect(html).not.toContain('id="pf-audit-panel"')
    expect(html).not.toContain('class="pf-finding-badge"')
    expect(html).not.toContain('class="pf-thumb-finding-badge"')
  })

  it("self-containment still holds with findings embedded (no unexpected http(s) reference)", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 })],
      findings: [finding({ page: 1, message: "see https://example.com/not-a-real-network-request in the quoted text" })],
    })
    const KNOWN_NAMESPACE_URIS = new Set(["http://www.w3.org/2000/svg"])
    const matches = html.match(/https?:\/\/[^\s"'<>)]+/g) ?? []
    const unexpected = matches.filter((m) => !KNOWN_NAMESPACE_URIS.has(m))
    // A finding message can legitimately contain an http(s) substring (it is
    // a quote of the deck author's own slide text) — this is not a network
    // reference, just text sitting inside a JSON string/HTML text node, so it
    // is expected here, not a self-containment violation. Assert on the
    // known namespace URI check only; the deliberately-injected fixture
    // string is excluded from `unexpected` by construction (see below).
    expect(unexpected.filter((m) => !m.startsWith("https://example.com"))).toEqual([])
  })
})

describe("buildPreviewHtml — audit checks summary (notes+preview wave, task 2)", () => {
  const checks = (overrides: Partial<PreviewHtmlChecks> = {}): PreviewHtmlChecks => ({
    svg: "completed",
    pixels: "not-requested",
    ...overrides,
  })

  it("renders a one-line checks summary naming pixels as not-requested — the literal state word, never a checkmark that could read as passed", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 })],
      checks: checks({ pixels: "not-requested" }),
    })
    expect(html).toContain('id="pf-audit-checks"')
    expect(html).toContain("svg completed")
    expect(html).toContain("pixels not-requested")
    // Soul constraint (audit-v2): "not-requested" must never be rendered as
    // if it had passed — no checkmark/tick glyph anywhere in the document.
    expect(html).not.toContain("✓") // ✓
    expect(html).not.toContain("✔") // ✔
    expect(html).not.toContain("✅") // ✅
  })

  it("renders the checks summary naming pixels as completed once the pixel pass actually ran", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 })],
      checks: checks({ pixels: "completed" }),
    })
    expect(html).toContain('id="pf-audit-checks"')
    expect(html).toContain("svg completed")
    expect(html).toContain("pixels completed")
    // And "not-requested" must not linger anywhere once pixels did run.
    expect(html).not.toContain("not-requested")
  })

  it("shows the checks line even on a clean, zero-finding report — the findings panel is omitted but the checks summary is not, since a clean report and a not-fully-checked report must stay visually distinguishable", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 })],
      checks: checks({ pixels: "not-requested" }),
      // no findings passed — this is the "clean" shape
    })
    expect(html).not.toContain('id="pf-audit-panel"')
    expect(html).toContain('id="pf-audit-checks"')
  })

  it("omits the checks line entirely when the caller passes no checks (audit skipped for this deck) — matches the existing auditNote/findings convention of only rendering what the caller actually supplies", () => {
    const html = buildPreviewHtml({
      title: "deck",
      slides: [slide({ index: 0 })],
    })
    expect(html).not.toContain('id="pf-audit-checks"')
  })
})

describe("buildPreviewHtml — annotations + export (notes+preview wave, task 2)", () => {
  it("always renders the annotation UI (textarea, add button, per-page list) regardless of findings", () => {
    const html = buildPreviewHtml({ title: "deck", slides: [slide({ index: 0 })] })
    expect(html).toContain('id="pf-annotate-panel"')
    expect(html).toContain('id="pf-annotate-input"')
    expect(html).toContain('id="pf-annotate-add"')
    expect(html).toContain('id="pf-annotate-list"')
  })

  it("always renders the 'Export revision requests' button", () => {
    const html = buildPreviewHtml({ title: "deck", slides: [slide({ index: 0 })] })
    expect(html).toContain('id="pf-export-btn"')
    expect(html).toContain("Export revision requests")
  })

  it("includes the annotation add/remove JS and the export button's revision-request JSON shape", () => {
    const html = buildPreviewHtml({ title: "deck", slides: [slide({ index: 0 })] })
    // add/remove wiring
    expect(html).toContain("annotateAdd.addEventListener")
    expect(html).toContain("renderAnnotations()")
    // pageId resolution: slide id when present, else 1-based page number —
    // matches AuditFinding.page's own convention (see the JS's own comment).
    expect(html).toContain("function pageIdFor(i)")
    // the exported payload's shape, asserted at the source-text level (this
    // file's existing tests are all string-level, not jsdom-executed) —
    // `{ version: "1", deck: <filename/title>, requests: [{ pageId,
    // annotation, createdAt }] }` per the plan's spec.
    expect(html).toContain("version: '1'")
    expect(html).toContain("deck: deckTitle")
    expect(html).toContain("pageId: pid, annotation: text, createdAt: new Date().toISOString()")
    // zero-network, zero-storage download — a Blob + a synthetic <a download>
    // click, never fetch/XMLHttpRequest/a form submission.
    expect(html).toContain("new Blob(")
    expect(html).toContain("URL.createObjectURL(blob)")
    expect(html).toContain('a.download = \'revision-request.json\'')
    expect(html).not.toMatch(/\bfetch\(/)
    expect(html).not.toContain("XMLHttpRequest")
  })

  it("self-containment: the annotation/export JS introduces no external reference either", () => {
    const html = buildPreviewHtml({ title: "deck", slides: [slide({ index: 0 })] })
    const KNOWN_NAMESPACE_URIS = new Set(["http://www.w3.org/2000/svg"])
    const matches = html.match(/https?:\/\/[^\s"'<>)]+/g) ?? []
    const unexpected = matches.filter((m) => !KNOWN_NAMESPACE_URIS.has(m))
    expect(unexpected).toEqual([])
  })
})
