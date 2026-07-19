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
 *
 * Audit overlay + annotations (notes+preview wave, task 2): `buildPreviewHtml`
 * is still a pure renderer — `findings` (`../svg/audit/deck-audit.ts`'s
 * `AuditFinding`, reshaped locally as {@link PreviewHtmlFinding} so this file
 * still has no `../ir`/`../svg` import) and the placeholder-skip
 * {@link PreviewHtmlInput.auditNote} both arrive as plain input, the same way
 * `slides` already does; the caller (`runPreview`, `./commands.ts`) decides
 * *whether* to run `auditDeck` at all (skipped whenever the deck has any
 * placeholder page — a placeholder has nothing to audit and `auditDeck`
 * itself silently skips it, so surfacing a half-audited deck as if it were
 * clean would be misleading; the plan's contract is "any placeholder present
 * → skip the whole overlay, one-line notice instead"). Per-page finding
 * counts (thumbnail/stage badges) and the findings panel are rendered as
 * static markup at build time, not computed by client-side JS from the
 * embedded JSON — `findings` is known up front here, so there is nothing for
 * the browser to compute; the embedded `<script type="application/json"
 * id="pf-audit-findings">` blob exists only so a saved `preview.html` still
 * carries the structured findings for later tooling, not to drive the UI.
 * User content still flows through {@link escapeHtml} everywhere it lands in
 * HTML (a finding's `message` embeds a truncated quote of the offending
 * slide's own text) — the JSON blob instead goes through {@link embedJson},
 * which additionally neutralizes any literal `</script` sequence a slide's
 * text could contain (escaping every `<` to its unicode escape — valid
 * inside a JSON string, and the only character the HTML tokenizer would
 * otherwise use to end the `<script>` element early), the standard technique
 * for safely inlining untrusted JSON into a script tag.
 *
 * Annotations are a pure client-side, in-memory feature (no `fs`, no network
 * — this module builds a static page, `<script>`'s own closure holds the
 * state) keyed by each slide's 0-based array index, not by its `pageId` —
 * the id/index duality only matters at *export* time (`pageIdFor()` in
 * `JS` below derives `slide.id` when the active `.pf-slide` node carries a
 * `data-id`, else falls back to the 1-based page number — matching
 * `AuditFinding.page`'s own established "1-based page number when there is
 * no slide id" convention, `../svg/audit/deck-audit.ts`, rather than the
 * 0-based `data-index` this file otherwise uses internally). "Export
 * revision requests" reads the deck title back out of `#pf-title`'s already-
 * escaped `textContent` (browser-decoded HTML entities, exactly the original
 * `title` string) instead of embedding a second JS string literal for it —
 * one fewer thing that needs its own escaping discipline. The exported file
 * never touches disk or a server: `URL.createObjectURL` on an in-memory
 * `Blob` plus a synthetic `<a download>` click, the standard zero-backend
 * browser download pattern — keeping the self-containment invariant this
 * whole module exists to protect (no `fetch`, no `XMLHttpRequest`, no form
 * `action`).
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

/**
 * One `auditDeck` finding (`AuditFinding`, `../svg/audit/deck-audit.ts`),
 * reshaped to this module's own minimal fields only — dropping `detail`
 * (never shown) keeps this file dependency-free of `../svg` the same way it
 * is already dependency-free of `../ir` (see the module doc comment). `page`
 * is 1-based, matching `PreviewHtmlSlideInput.index + 1` for the slide it
 * belongs to (both ultimately trace back to the same `ir.slides` array
 * position in `runPreview`, `./commands.ts`). User content — `message`
 * embeds a truncated quote of the offending slide's own text — HTML-escaped
 * wherever it is shown, same as every other user-content field in this file.
 */
export interface PreviewHtmlFinding {
  page: number
  slideId?: string
  code: string
  message: string
}

export interface PreviewHtmlInput {
  /** Deck title (`ir.filename`) — shown in the `<title>` tag and the header.
   *  User content — HTML-escaped wherever it is shown. */
  title: string
  slides: PreviewHtmlSlideInput[]
  /** `auditDeck(ir).findings` (`../svg/audit/deck-audit.ts`), reshaped to
   *  {@link PreviewHtmlFinding} — omit or pass `[]` when the caller skipped
   *  the audit (no findings to show at all, e.g. the deck has a placeholder
   *  page, see {@link auditNote}) or the deck audited clean. Drives the
   *  thumbnail/stage finding-count badges and the findings panel — see the
   *  module doc comment for why those are rendered as static markup here
   *  rather than computed by client-side JS from the embedded JSON blob. */
  findings?: PreviewHtmlFinding[]
  /** One-line notice shown in the header in place of any findings UI — the
   *  plan's placeholder-skip contract: `runPreview` sets this (and passes no
   *  `findings`) whenever the deck has any placeholder page, since
   *  `auditDeck` itself silently skips a placeholder (nothing to audit) and
   *  showing a placeholder-heavy deck as audit-clean would be misleading.
   *  User content only in the sense that it is caller-supplied prose, not
   *  deck content — HTML-escaped like everything else in this file
   *  regardless. */
  auditNote?: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * `JSON.stringify(value)`, with every `<` escaped to `<` — safe to
 * inline inside a `<script>` element's text content (this file's
 * `#pf-audit-findings` data blob): the HTML tokenizer looks only for the
 * literal byte sequence `</script` to end a script element, regardless of
 * the script's `type` or of what its content actually parses as, so a
 * finding `message` that happens to contain that substring (it embeds a
 * truncated quote of the offending slide's own text — user content) could
 * otherwise truncate the document early. `<` never appears in JSON outside a
 * string value (the syntax has no structural use for it), so this blanket
 * replace only ever touches characters that were already inside string
 * content — the standard technique for embedding untrusted JSON in a page.
 */
function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}

/** `"3"` (a finding-count badge) or `""` when the slide has no findings —
 *  shared by {@link slideNode} (the moving node's own badge) and
 *  {@link thumbButton} (the thumbnail's always-present one), same
 *  "one class for the node's own copy, one for the thumbnail button's"
 *  split the existing `pf-badge`/`pf-thumb-badge` pair already uses. In
 *  practice a slide never carries both this badge and the "unfilled" one —
 *  `runPreview` only ever passes non-empty `findings` when *no* slide in the
 *  deck is a placeholder (the plan's skip-the-whole-overlay contract, see
 *  `PreviewHtmlInput.auditNote`'s doc comment) — but nothing here assumes
 *  that invariant: the two badges use different classes and corners (this
 *  one top-left, "unfilled" top-right) specifically so a caller that did
 *  pass both for one slide would still render two distinct, non-overlapping
 *  marks rather than a garbled stack. */
function findingBadge(count: number, className: string): string {
  if (count === 0) return ""
  return `<div class="${className}" aria-hidden="true">${count}</div>`
}

/** The one `.pf-slide` node this slide will ever have — moved between
 *  `#pf-stage` and its `.pf-thumb-slot` by `<script>` at runtime, never
 *  duplicated (see this module's own doc comment). Carries its own
 *  "unfilled" badge so the badge travels with it wherever it currently is,
 *  plus (independently) a finding-count badge when `findingCount > 0`. */
function slideNode(slide: PreviewHtmlSlideInput, findingCount: number): string {
  const idAttr = slide.id !== undefined ? ` data-id="${escapeHtml(slide.id)}"` : ""
  const badge = slide.placeholder ? `<div class="pf-badge" aria-hidden="true">unfilled</div>` : ""
  const fBadge = findingBadge(findingCount, "pf-finding-badge")
  return `<div class="pf-slide" id="pf-slide-${slide.index}" data-index="${slide.index}"${idAttr}>${badge}${fBadge}${slide.svg}</div>`
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
 *  the button itself, its label, its own "unfilled" badge (if the slide is a
 *  placeholder), and its own finding-count badge (if `findingCount > 0`) are
 *  always rendered — only the slot's content moves. */
function thumbButton(slide: PreviewHtmlSlideInput, isActive: boolean, slotContent: string, findingCount: number): string {
  const description = thumbDescription(slide)
  const badge = slide.placeholder ? `<span class="pf-thumb-badge" aria-hidden="true">unfilled</span>` : ""
  const fBadge = findingBadge(findingCount, "pf-thumb-finding-badge")
  return (
    `<button type="button" class="pf-thumb${isActive ? " pf-thumb-active" : ""}" id="pf-thumb-${slide.index}" ` +
    `data-index="${slide.index}" title="${description}" aria-label="${description}">` +
    `<span class="pf-thumb-slot" id="pf-slot-${slide.index}">${slotContent}</span>` +
    `<span class="pf-thumb-label">${positionLabel(slide)}</span>` +
    `${badge}${fBadge}</button>`
  )
}

/** One row in the audit findings panel — `data-page-index` is the finding's
 *  owning slide's 0-based array index (`f.page - 1`, `PreviewHtmlFinding.page`
 *  is 1-based), the same identity `<script>`'s existing `activate(i)` already
 *  navigates by, so a click just calls the same function every thumbnail
 *  click already does. */
function findingPanelEntry(f: PreviewHtmlFinding): string {
  const idPart = f.slideId !== undefined ? ` · ${escapeHtml(f.slideId)}` : ""
  return (
    `<button type="button" class="pf-finding" data-page-index="${f.page - 1}">` +
    `<span class="pf-finding-loc">page ${f.page}${idPart}</span>` +
    `<span class="pf-finding-code">[${escapeHtml(f.code)}]</span> ` +
    `<span class="pf-finding-msg">${escapeHtml(f.message)}</span>` +
    `</button>`
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
#pf-audit-note{color:#b45309;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#pf-export-btn{font:inherit;font-size:13px;padding:6px 10px;border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:4px;cursor:pointer;white-space:nowrap;flex:0 0 auto}
#pf-export-btn:hover{background:#1d4ed8}
#pf-stage-wrap{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;gap:16px;padding:16px}
#pf-stage{position:relative;background:#000;box-shadow:0 2px 16px rgba(0,0,0,.15);aspect-ratio:16/9;width:min(100%,calc((100vh - 190px) * 16 / 9));max-height:100%}
#pf-stage,.pf-thumb-slot{position:relative}
.pf-slide{position:absolute;inset:0}
.pf-slide svg{display:block;width:100%;height:100%}
#pf-side{flex:0 0 260px;align-self:stretch;overflow-y:auto;background:#fff;border:1px solid #ddd;border-radius:6px;padding:12px;font-size:13px}
#pf-side h2{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#666}
#pf-side section+section{margin-top:16px;padding-top:16px;border-top:1px solid #eee}
.pf-finding{display:block;width:100%;text-align:left;background:#fff;border:1px solid #eee;border-radius:4px;padding:6px 8px;margin-bottom:6px;cursor:pointer;font:inherit}
.pf-finding:hover{border-color:#93c5fd}
.pf-finding-loc{display:block;font-size:11px;color:#888}
.pf-finding-code{display:inline-block;font-size:11px;font-weight:700;color:#b91c1c}
.pf-finding-msg{font-size:12px;color:#333}
#pf-annotate-current-label{font-size:11px;color:#888;margin-bottom:6px}
#pf-annotate-list{list-style:none;margin:0 0 8px;padding:0}
.pf-annotate-item{display:flex;justify-content:space-between;gap:6px;align-items:flex-start;padding:4px 0;border-bottom:1px solid #f0f0f0;font-size:12px}
.pf-annotate-remove{border:none;background:none;color:#999;cursor:pointer;font-size:14px;line-height:1;padding:0 2px}
.pf-annotate-remove:hover{color:#dc2626}
#pf-annotate-input{width:100%;box-sizing:border-box;font:inherit;font-size:12px;padding:6px;border:1px solid #ddd;border-radius:4px;resize:vertical}
#pf-annotate-add{font:inherit;font-size:12px;margin-top:6px;width:100%;padding:6px 10px;border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:4px;cursor:pointer}
#pf-annotate-add:hover{background:#1d4ed8}
#pf-filmstrip{display:flex;gap:8px;padding:10px 16px;overflow-x:auto;background:#fff;border-top:1px solid #ddd;flex:0 0 auto}
.pf-thumb{flex:0 0 auto;width:160px;padding:0;margin:0;border:2px solid transparent;background:#eee;cursor:pointer;border-radius:6px;overflow:hidden;position:relative;font:inherit;text-align:left}
.pf-thumb:hover{border-color:#93c5fd}
.pf-thumb-active,.pf-thumb-active:hover{border-color:#2563eb;background:#dbeafe}
.pf-thumb-slot{display:block;width:100%;aspect-ratio:16/9;background:#ddd}
.pf-thumb-label{display:block;font-size:11px;line-height:1.4;padding:3px 6px;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pf-badge,.pf-thumb-badge{position:absolute;top:4px;right:4px;background:#d97706;color:#fff;font-size:10px;font-weight:700;letter-spacing:.03em;padding:2px 6px;border-radius:3px;text-transform:uppercase;z-index:2;pointer-events:none}
.pf-finding-badge,.pf-thumb-finding-badge{position:absolute;top:4px;left:4px;background:#dc2626;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:3px;z-index:2;pointer-events:none}
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
    renderAnnotations()
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

  // ---- audit findings panel: click a finding, jump to its page (same
  // activate() every thumbnail click already uses) ----
  Array.prototype.slice.call(document.querySelectorAll('.pf-finding')).forEach(function (b) {
    b.addEventListener('click', function () {
      activate(parseInt(b.getAttribute('data-page-index'), 10))
    })
  })

  // ---- annotations: in-memory only, keyed by the slide's 0-based array
  // index (current) — never by pageId, since an object key coerces every
  // key to a string and would silently collide a numeric page-fallback
  // pageId with a same-looking slide id (or lose the numeric/string type
  // distinction the exported JSON needs); pageIdFor() below resolves the
  // real pageId fresh from the DOM only at render/export time. ----
  var annotations = {}
  var annotateList = document.getElementById('pf-annotate-list')
  var annotateInput = document.getElementById('pf-annotate-input')
  var annotateLabel = document.getElementById('pf-annotate-current-label')
  var annotateAdd = document.getElementById('pf-annotate-add')
  var exportBtn = document.getElementById('pf-export-btn')

  // Slide id when the active slide has one, else its 1-based page number —
  // mirrors AuditFinding.page's own "1-based page number when there is no
  // slide id" convention (../svg/audit/deck-audit.ts) rather than this
  // file's internal 0-based data-index, so a revision-request.json's
  // pageId lines up with what pptfast audit/validate already print.
  function pageIdFor(i) {
    var el = slideEl(i)
    var id = el ? el.getAttribute('data-id') : null
    return id !== null ? id : thumbPos(i) + 1
  }

  function renderAnnotations() {
    var pid = pageIdFor(current)
    annotateLabel.textContent = 'page ' + (thumbPos(current) + 1) + (typeof pid === 'string' ? ' · ' + pid : '')
    var list = annotations[current] || []
    annotateList.innerHTML = ''
    list.forEach(function (text, idx) {
      var li = document.createElement('li')
      li.className = 'pf-annotate-item'
      var span = document.createElement('span')
      span.textContent = text
      var rm = document.createElement('button')
      rm.type = 'button'
      rm.className = 'pf-annotate-remove'
      rm.setAttribute('aria-label', 'remove annotation')
      rm.textContent = '\\u00d7'
      rm.addEventListener('click', function () {
        list.splice(idx, 1)
        renderAnnotations()
      })
      li.appendChild(span)
      li.appendChild(rm)
      annotateList.appendChild(li)
    })
  }

  annotateAdd.addEventListener('click', function () {
    var text = annotateInput.value.trim()
    if (!text) return
    if (!annotations[current]) annotations[current] = []
    annotations[current].push(text)
    annotateInput.value = ''
    renderAnnotations()
  })

  // "Export revision requests": preview.html stays read-only end to end —
  // this never writes back into the deck itself, only produces a JSON file
  // of requests for an agent/human to route through pages/*.json (see
  // skills/pptfast/SKILL.md's phase-6 revision-request handling). Zero
  // network/storage — an in-memory Blob + a synthetic <a download> click,
  // the standard browser-only download pattern.
  exportBtn.addEventListener('click', function () {
    var requests = []
    Object.keys(annotations).forEach(function (key) {
      var i = parseInt(key, 10)
      var pid = pageIdFor(i)
      annotations[i].forEach(function (text) {
        requests.push({ pageId: pid, annotation: text, createdAt: new Date().toISOString() })
      })
    })
    var deckTitle = document.getElementById('pf-title').textContent
    var payload = { version: '1', deck: deckTitle, requests: requests }
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = 'revision-request.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  })

  renderAnnotations()
})()
`.trim()

/** Always-present "Annotations" side panel — static markup, no per-build
 *  data (the annotation list itself lives only in `<script>`'s in-memory
 *  `annotations` state, populated and re-rendered at runtime, see `JS`
 *  above's `renderAnnotations()`). Unlike the audit findings panel, this one
 *  is never conditionally omitted — annotating is available regardless of
 *  whether the audit ran, found anything, or was skipped for placeholders. */
const ANNOTATE_PANEL = `<section id="pf-annotate-panel">
<h2>Annotations</h2>
<div id="pf-annotate-current-label"></div>
<ul id="pf-annotate-list"></ul>
<textarea id="pf-annotate-input" rows="3" placeholder="Add a note for this page…"></textarea>
<button type="button" id="pf-annotate-add">Add annotation</button>
</section>`

/**
 * Build the self-contained `preview.html` bundle. Pure — no `fs`, safe to
 * unit-test directly (`./preview-html.test.ts`). See this module's own doc
 * comment for the self-containment and single-embed-per-slide design notes.
 */
export function buildPreviewHtml(input: PreviewHtmlInput): string {
  const { title, slides, findings = [], auditNote } = input
  const total = slides.length
  const escapedTitle = escapeHtml(title)

  // Group findings by the 1-based page number they belong to, so each
  // slide's badge count is a single map lookup rather than an O(findings)
  // scan per slide.
  const findingsByPage = new Map<number, PreviewHtmlFinding[]>()
  for (const f of findings) {
    const list = findingsByPage.get(f.page)
    if (list) list.push(f)
    else findingsByPage.set(f.page, [f])
  }
  const countFor = (slide: PreviewHtmlSlideInput) => findingsByPage.get(slide.index + 1)?.length ?? 0

  const stageSlide = total > 0 ? slideNode(slides[0]!, countFor(slides[0]!)) : ""
  const thumbs = slides
    .map((s, i) => thumbButton(s, i === 0, i === 0 ? "" : slideNode(s, countFor(s)), countFor(s)))
    .join("")
  const initialCounter = total > 0 ? counterText(slides[0]!, total) : "0 / 0"

  // Findings panel + embedded JSON blob (see this module's own doc comment
  // for why the panel is static markup, not client-computed from the blob)
  // — both entirely omitted when there is nothing to show, so a clean or
  // audit-skipped deck's preview.html carries no trace of either (matches
  // the pre-existing "never shows an 'unfilled' badge when no slide is a
  // placeholder" precedent for the badge markup itself).
  const auditPanel =
    findings.length > 0
      ? `<section id="pf-audit-panel"><h2>Audit findings (${findings.length})</h2><div id="pf-audit-list">${findings.map(findingPanelEntry).join("")}</div></section>`
      : ""
  const findingsDataScript =
    findings.length > 0
      ? `<script type="application/json" id="pf-audit-findings">${embedJson(findings)}</script>`
      : ""
  const auditNoteHtml = auditNote !== undefined ? `<span id="pf-audit-note">${escapeHtml(auditNote)}</span>` : ""

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
${auditNoteHtml}
<button type="button" id="pf-export-btn">Export revision requests</button>
</header>
<div id="pf-stage-wrap"><div id="pf-stage">${stageSlide}</div><aside id="pf-side">${auditPanel}${ANNOTATE_PANEL}</aside></div>
<nav id="pf-filmstrip" aria-label="slides">${thumbs}</nav>
${findingsDataScript}
<script>${JS}</script>
</body>
</html>
`
}
