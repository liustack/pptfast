/**
 * Pure string builder for `pptfast preview --html`'s self-contained review
 * bundle (v0.3 W7 task 1, spec §7 workflow ⑤): one `preview.html` with every
 * slide's already-rendered SVG (`renderSlideSvg`, `../api.ts`) inlined
 * directly into the markup, a bottom thumbnail filmstrip, keyboard (←/→) and
 * click navigation, and a page counter. No `fs` here on purpose — this
 * module only assembles a string; `runPreview` (`./commands.ts`) is the only
 * caller and the only place that touches disk, which keeps this file
 * trivially unit-testable (feed it slide data, assert on the returned
 * string) despite living under the Node-only `src/cli*` tree (AGENTS.md's
 * "no Node-only deps" layout rule is about `src/index.ts`'s own dependency
 * closure, not every file under `src/cli` — this one just happens to need
 * none anyway).
 *
 * Self-containment (the plan's hard requirement): every slide's SVG is
 * embedded as raw markup — never `<img src>`, never any other reference to
 * an external file — and the only CSS/JS in the document is inlined in
 * `<style>`/`<script>`. Local image assets are already `data:` URIs by the
 * time `runPreview` calls `renderSlideSvg` (`resolveLocalAssets`'s job,
 * `./load-ir.ts` — this module never touches assets itself) — *assuming*
 * every image asset the deck references is local or already a `data:` URI.
 * Known limitation: `resolveLocalAssets` deliberately passes a remote
 * `http(s):` asset `src` through untouched (the export pipeline inlines
 * those itself), so that src is left un-inlined and lands verbatim in this
 * bundle's embedded SVG as a live network reference, not a namespace URI —
 * breaking the zero-network-request guarantee for that one slide. Barring
 * that case, the only `http(s)` substrings that can appear anywhere in the
 * output are SVG namespace URIs (`xmlns="http://www.w3.org/2000/svg"`,
 * emitted by `../svg/serialize.ts` on every slide) — XML namespace
 * identifiers, not network requests.
 *
 * Embed strategy (one `<svg>` per slide, not two): the thumbnail filmstrip
 * and the large "stage" view share the exact same DOM node per slide rather
 * than each holding its own copy — duplicating every slide's SVG (including
 * any inlined `data:` image payloads) would double the file's byte size for
 * an image-heavy deck for zero benefit, since only one size is ever on
 * screen for a given slide at a time. The one node that exists for a slide
 * lives in exactly one of two homes: `#pf-stage` (the slide currently being
 * viewed large) or its own `.pf-thumb-slot` (every other slide, shown small
 * in the filmstrip) — `<script>`'s `activate()` moves it between the two
 * with a plain `appendChild` (which detaches a node from its previous parent
 * automatically) when the viewer clicks a thumbnail or presses ←/→. Because
 * an inactive slide's badge travels with its node, and the active slide's
 * thumbnail button carries its own always-present badge, a placeholder page
 * still shows its "unfilled" mark in both places even though only one copy
 * of the slide's markup ever exists.
 */

export interface PreviewHtmlSlideInput {
  /** Authoritative page number (1-based labels derive from this, not array
   *  position, so a caller that filters/reorders `slides` still gets
   *  correct output). */
  index: number
  /** Stable slide id (`slide.id`, `../ir/index.ts`'s `SlideSchema`) when the
   *  deck sets one. User content — HTML-escaped wherever it is shown. */
  id?: string
  /** `slide.type` — `cover`/`chapter`/`content`/`ending` in practice, kept
   *  as a plain `string` here so this module has no dependency on `../ir`. */
  type: string
  /** Already-rendered standalone SVG markup for this slide (`renderSlideSvg`,
   *  `../api.ts`) — embedded verbatim: trusted, self-produced markup, never
   *  escaped (escaping it would corrupt the SVG/XML syntax itself). */
  svg: string
  /** `slide.placeholder` — an unfilled page (assemble's stand-in for content
   *  nobody has written yet, W5 task 1). Renders a visible "unfilled" badge:
   *  this bundle exists for a human/agent visual review, so an unfilled page
   *  must never look indistinguishable from a finished one. */
  placeholder?: boolean
}

export interface PreviewHtmlInput {
  /** Deck title (`ir.filename`) — shown in the `<title>` tag and the header.
   *  User content — HTML-escaped wherever it is shown. */
  title: string
  slides: PreviewHtmlSlideInput[]
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** The one `.pf-slide` node this slide will ever have — moved between
 *  `#pf-stage` and its `.pf-thumb-slot` by `<script>` at runtime, never
 *  duplicated (see this module's own doc comment). Carries its own
 *  "unfilled" badge so the badge travels with it wherever it currently is. */
function slideNode(slide: PreviewHtmlSlideInput): string {
  const idAttr = slide.id !== undefined ? ` data-id="${escapeHtml(slide.id)}"` : ""
  const badge = slide.placeholder ? `<div class="pf-badge" aria-hidden="true">unfilled</div>` : ""
  return `<div class="pf-slide" id="pf-slide-${slide.index}" data-index="${slide.index}"${idAttr}>${badge}${slide.svg}</div>`
}

/** `"slide 3 · content · p-body · unfilled"` — shared by the thumbnail
 *  button's `title`/`aria-label` (raw pieces joined, then escaped once —
 *  escaping each piece separately and joining after would be equally
 *  correct, but this reads simpler and is exactly as safe). */
function thumbDescription(slide: PreviewHtmlSlideInput): string {
  const parts = [`slide ${slide.index + 1}`, slide.type]
  if (slide.id !== undefined) parts.push(slide.id)
  if (slide.placeholder) parts.push("unfilled")
  return escapeHtml(parts.join(" · "))
}

/** `"3 · p-body"` (or just `"3"` without an id) — the thumbnail's small
 *  printed label, and (via {@link counterText}) the page counter's format. */
function positionLabel(slide: PreviewHtmlSlideInput): string {
  const idPart = slide.id !== undefined ? ` · ${slide.id}` : ""
  return escapeHtml(`${slide.index + 1}${idPart}`)
}

/** `"1 / 8 · p-cover"` — the page counter's initial text (rendered directly
 *  into the static markup so it is correct even before `<script>` runs;
 *  `<script>`'s own `updateCounter()` keeps it in sync after that). */
function counterText(slide: PreviewHtmlSlideInput, total: number): string {
  const idPart = slide.id !== undefined ? ` · ${slide.id}` : ""
  return escapeHtml(`${slide.index + 1} / ${total}${idPart}`)
}

/** One always-present thumbnail button. `slotContent` is the slide's own
 *  {@link slideNode} markup when this slide starts inactive (every slide but
 *  the first), or `""` when it starts active (the first slide — its node
 *  lives in `#pf-stage` instead, see {@link buildPreviewHtml}). Either way
 *  the button itself, its label, and its own badge (if the slide is a
 *  placeholder) are always rendered — only the slot's content moves. */
function thumbButton(slide: PreviewHtmlSlideInput, isActive: boolean, slotContent: string): string {
  const description = thumbDescription(slide)
  const badge = slide.placeholder ? `<span class="pf-thumb-badge" aria-hidden="true">unfilled</span>` : ""
  return (
    `<button type="button" class="pf-thumb${isActive ? " pf-thumb-active" : ""}" id="pf-thumb-${slide.index}" ` +
    `data-index="${slide.index}" title="${description}" aria-label="${description}">` +
    `<span class="pf-thumb-slot" id="pf-slot-${slide.index}">${slotContent}</span>` +
    `<span class="pf-thumb-label">${positionLabel(slide)}</span>` +
    `${badge}</button>`
  )
}

const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:#f4f4f4;color:#1a1a1a}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:#fff;border-bottom:1px solid #ddd;font-size:14px;flex:0 0 auto}
#pf-title{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#pf-counter{font-variant-numeric:tabular-nums;color:#555;white-space:nowrap}
#pf-stage-wrap{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;padding:16px}
#pf-stage{position:relative;background:#000;box-shadow:0 2px 16px rgba(0,0,0,.15);aspect-ratio:16/9;width:min(100%,calc((100vh - 190px) * 16 / 9));max-height:100%}
#pf-stage,.pf-thumb-slot{position:relative}
.pf-slide{position:absolute;inset:0}
.pf-slide svg{display:block;width:100%;height:100%}
#pf-filmstrip{display:flex;gap:8px;padding:10px 16px;overflow-x:auto;background:#fff;border-top:1px solid #ddd;flex:0 0 auto}
.pf-thumb{flex:0 0 auto;width:160px;padding:0;margin:0;border:2px solid transparent;background:#eee;cursor:pointer;border-radius:6px;overflow:hidden;position:relative;font:inherit;text-align:left}
.pf-thumb:hover{border-color:#93c5fd}
.pf-thumb-active,.pf-thumb-active:hover{border-color:#2563eb;background:#dbeafe}
.pf-thumb-slot{display:block;width:100%;aspect-ratio:16/9;background:#ddd}
.pf-thumb-label{display:block;font-size:11px;line-height:1.4;padding:3px 6px;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pf-badge,.pf-thumb-badge{position:absolute;top:4px;right:4px;background:#d97706;color:#fff;font-size:10px;font-weight:700;letter-spacing:.03em;padding:2px 6px;border-radius:3px;text-transform:uppercase;z-index:2;pointer-events:none}
`.trim()

const JS = `
(function () {
  var stage = document.getElementById('pf-stage')
  var counter = document.getElementById('pf-counter')
  var thumbs = Array.prototype.slice.call(document.querySelectorAll('.pf-thumb'))
  var total = thumbs.length
  if (total === 0) return
  var current = parseInt(thumbs[0].getAttribute('data-index'), 10)

  function slideEl(i) { return document.getElementById('pf-slide-' + i) }
  function slotEl(i) { return document.getElementById('pf-slot-' + i) }
  function thumbEl(i) { return document.getElementById('pf-thumb-' + i) }
  function thumbPos(i) {
    for (var t = 0; t < thumbs.length; t++) {
      if (parseInt(thumbs[t].getAttribute('data-index'), 10) === i) return t
    }
    return -1
  }

  function updateCounter(i) {
    var el = slideEl(i)
    if (!el) return
    var text = (thumbPos(i) + 1) + ' / ' + total
    var id = el.getAttribute('data-id')
    if (id) text += ' · ' + id
    counter.textContent = text
  }

  function activate(i) {
    if (i === current) return
    var nextSlide = slideEl(i)
    var nextThumb = thumbEl(i)
    if (!nextSlide || !nextThumb) return
    var prevSlide = slideEl(current)
    var prevSlot = slotEl(current)
    if (prevSlide && prevSlot) prevSlot.appendChild(prevSlide)
    var prevThumb = thumbEl(current)
    if (prevThumb) prevThumb.classList.remove('pf-thumb-active')
    stage.appendChild(nextSlide)
    nextThumb.classList.add('pf-thumb-active')
    current = i
    updateCounter(i)
  }

  thumbs.forEach(function (t) {
    t.addEventListener('click', function () {
      activate(parseInt(t.getAttribute('data-index'), 10))
    })
  })

  document.addEventListener('keydown', function (e) {
    var pos = thumbPos(current)
    if (e.key === 'ArrowRight' && pos < total - 1) {
      activate(parseInt(thumbs[pos + 1].getAttribute('data-index'), 10))
    } else if (e.key === 'ArrowLeft' && pos > 0) {
      activate(parseInt(thumbs[pos - 1].getAttribute('data-index'), 10))
    }
  })
})()
`.trim()

/**
 * Build the self-contained `preview.html` bundle. Pure — no `fs`, safe to
 * unit-test directly (`./preview-html.test.ts`). See this module's own doc
 * comment for the self-containment and single-embed-per-slide design notes.
 */
export function buildPreviewHtml(input: PreviewHtmlInput): string {
  const { title, slides } = input
  const total = slides.length
  const escapedTitle = escapeHtml(title)

  const stageSlide = total > 0 ? slideNode(slides[0]!) : ""
  const thumbs = slides
    .map((s, i) => thumbButton(s, i === 0, i === 0 ? "" : slideNode(s)))
    .join("")
  const initialCounter = total > 0 ? counterText(slides[0]!, total) : "0 / 0"

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapedTitle} — pptfast preview</title>
<style>${CSS}</style>
</head>
<body>
<header>
<span id="pf-title">${escapedTitle}</span>
<span id="pf-counter">${initialCounter}</span>
</header>
<div id="pf-stage-wrap"><div id="pf-stage">${stageSlide}</div></div>
<nav id="pf-filmstrip" aria-label="slides">${thumbs}</nav>
<script>${JS}</script>
</body>
</html>
`
}
