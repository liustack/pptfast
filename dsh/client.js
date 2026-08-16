// Browser half of the pptfast dsh plugin: the deck preview card.
//
// The host half (`./preview-tool.js`) registers `pptfast_preview` and puts
// the rendered bundle on `output.presentationMeta` — a channel persisted with
// the session log and never shown to the model. This file is what turns that
// payload into something a person can look at: a thumbnail strip in the tool
// card, and a full-size modal on click. No new tab, no localhost URL, no
// "open this link yourself", which is the whole reason the tool exists.
//
// `dsh.client.immediately` is not optional for this plugin. The client module
// table is lazy: a boot-graph row only loads when something imports its id,
// and nothing in the shell imports a third-party plugin. Without the flag
// this file is served and never executed — which is exactly how the first
// build shipped, with the tool rendering in the generic row and no error
// anywhere to say the card had never been loaded at all.
//
// Hand-written in the lazy-CJS bundle protocol (`window.__ModuleLoader__.load`
// with a factory returning cordis-plugin exports), matching the host half's
// zero-dependency stance and modlens's precedent: no build step, no JSX, no
// imports from dsh client packages beyond what `require` hands back at
// materialization time. `react` arrives through that same `require`, so this
// package still declares no react dependency of its own.
//
// It renders nothing itself. Every slide it shows is markup `renderSlideSvg`
// already produced, carried verbatim from the tool result — the same single
// rendering path the CLI, the review gallery and the promotional images all
// read from. A second renderer living in a UI is how those would drift into
// describing different products.
//
// It also *views* nothing of its own any more. The modal used to be a small
// React slideshow — arrow keys, a page counter, prev/next buttons, a stand-in
// for pages the server had declined to send — sitting next to the finished
// `preview.html` that `pptfast preview --html` writes for every run and that
// harnesses without a plugin UI are told to open. Two viewers, one deck, and
// only one of them tested. The modal is now an iframe pointing at that file,
// and keeps only the two things the file cannot do for itself: close, and hand
// over the .pptx.
window.__ModuleLoader__.load({
  id: '@liustack/pptfast',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var TOOL_NAME = 'pptfast_preview'

    /**
     * How many thumbnails the strip draws.
     *
     * The host half inlines exactly this many pages' markup
     * (`THUMBNAIL_STRIP_PAGES`, ./preview-tool.js) and sends the rest as
     * metadata only, so the two numbers are one decision written down twice.
     * `stripPages` filters on markup as well as slicing, which is what keeps a
     * disagreement between them showing up as a shorter strip instead of a row
     * of empty boxes.
     */
    var STRIP_PAGES = 12

    /** Where the full-size viewer lives — the html `preview --html` wrote. */
    function previewHtmlUrl(previewId) {
      return '/pptfast/preview/' + previewId + '/html'
    }

    /**
     * Pull the preview bundle out of a frozen tool-call node.
     *
     * `presentationMeta` is projected into the result's view/meta by the
     * host; the exact field the runtime lands it on has moved between rc
     * builds, so this reads the handful of shapes it can appear under rather
     * than pinning one. Returning null simply falls through to the generic
     * card, which is the correct degrade: a card that throws would take the
     * whole turn's rendering with it.
     */
    /**
     * The preview id the tool stamped into its own result text.
     *
     * This is the channel that survives Code Mode: a tool invoked from
     * inside `run_code` is a sub-call, and the registry computes
     * `presentationMeta` for top-level calls only, so on this repo's default
     * agent preset the structured payload never exists. The id in the text
     * always does.
     */
    function previewIdOf(block) {
      var text = ''
      var content = (block && (block.content || (block.result && block.result.content))) || []
      for (var i = 0; i < content.length; i++) {
        if (content[i] && typeof content[i].text === 'string') text += content[i].text
      }
      var m = /pptfast-preview:([A-Za-z0-9-]+)/.exec(text)
      return m ? m[1] : null
    }

    function bundleOf(block) {
      if (!block) return null
      var candidates = [block.meta, block.resultView, block.result && block.result.meta, block.presentationMeta]
      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i]
        if (c && c.card === 'pptfast-preview' && c.bundle && Array.isArray(c.bundle.pages)) return c.bundle
        if (c && c.bundle && Array.isArray(c.bundle.pages)) return c.bundle
      }
      return null
    }

    /**
     * Every page the deck has, markup or not.
     *
     * The pages past the strip arrive with `svg: null`, and they still belong
     * here: this is what the card counts and what decides whether there is a
     * deck at all. Filtering them out would make the header under-report a
     * long deck's length, and would make a card vanish rather than say
     * anything if a bundle ever arrived carrying no markup at all.
     */
    function viewablePages(bundle) {
      return bundle && Array.isArray(bundle.pages) ? bundle.pages : []
    }

    function hasMarkup(page) {
      return !!page && typeof page.svg === 'string' && page.svg.length > 0
    }

    /**
     * The pages the strip can actually draw: the first `STRIP_PAGES`, minus
     * any that arrived without markup. See `STRIP_PAGES` for why the filter is
     * normally a no-op and why it is here anyway.
     */
    function stripPages(pages) {
      return pages.slice(0, STRIP_PAGES).filter(hasMarkup)
    }

    /** The number a reader would call this page, not its index in the array. */
    function pageNumberOf(page, index) {
      return (page && typeof page.page === 'number' ? page.page : null) || index + 1
    }

    /**
     * Namespace one page's internal ids.
     *
     * Every slide is a standalone SVG document whose ids only have to be
     * unique inside itself. Several of them in one page merge id spaces, so a
     * `url(#decor-tech-field)` on slide 6 would resolve against slide 3's
     * definition of the same id. The host half solves this at build time for
     * the files it writes (`src/lib/svg-ids.ts`); the same transform has to
     * run here because this card mounts several documents into one DOM.
     */
    function namespaceIds(svg, prefix) {
      return svg
        .replace(/\bid="([^"]*)"/g, function (_m, id) {
          return 'id="' + prefix + id + '"'
        })
        .replace(/url\(#([^)"']*)\)/g, function (_m, id) {
          return 'url(#' + prefix + id + ')'
        })
        .replace(/\b(xlink:href|href)="#([^"]*)"/g, function (_m, attr, id) {
          return attr + '="#' + prefix + id + '"'
        })
    }

    function PreviewCard(react) {
      var h = react.createElement
      var useState = react.useState
      var useEffect = react.useEffect

      var COLORS = {
        line: 'var(--dsw-alias-separator, rgba(127,127,127,0.28))',
        dim: 'var(--dsw-alias-label-tertiary, rgba(127,127,127,0.85))',
        text: 'var(--dsw-alias-label-primary, inherit)',
        stage: 'var(--dsw-alias-fill-quaternary, rgba(127,127,127,0.12))',
      }

      /**
       * The viewer's own two buttons, styled in a sheet rather than inline.
       *
       * Everything else in this file styles elements directly, which is fine
       * until a button has to answer the pointer: a solid white button that
       * does not change under the cursor reads as broken before it reads as
       * plain, and `:hover` cannot be written inline at all.
       *
       * The colours have to live here too, not just the hover rules. An
       * element's own `style` attribute outranks any sheet, so leaving
       * `background` and `border` inline lets them win every hover — the
       * transition still runs, which is what makes the result look wired up
       * while the colour never moves. The alternative is `!important` on four
       * declarations, which is the same bug with an override on top.
       *
       * Sized against the harness's chrome rather than the card's: these sit
       * over a full-screen view, so at the card's 13px/23px they read as
       * smaller than the controls they are covering. Solid marks the errand —
       * taking the deck away is why the row exists — and the outline marks
       * the exit.
       */
      var MODAL_STYLE_ID = 'pptfast-modal-style'
      var MODAL_BTN_BASE =
        'font:inherit;font-size:13px;padding:7px 16px;border-radius:8px;cursor:pointer;'
      function ensureModalStyles() {
        if (document.getElementById(MODAL_STYLE_ID)) return
        var el = document.createElement('style')
        el.id = MODAL_STYLE_ID
        el.textContent =
          '.pf-mbtn{' +
          MODAL_BTN_BASE +
          'border:1px solid rgba(255,255,255,0.5);background:transparent;color:#fff;' +
          'transition:background-color .12s,border-color .12s}' +
          '.pf-mbtn:hover{background:rgba(255,255,255,0.14);border-color:rgba(255,255,255,0.8)}' +
          '.pf-mbtn-primary{' +
          MODAL_BTN_BASE +
          'font-weight:600;border:1px solid transparent;background:#fff;color:#111;' +
          'transition:background-color .12s}' +
          '.pf-mbtn-primary:hover{background:#e2e2e2}'
        document.head.appendChild(el)
      }

      /** One slide, mounted as real SVG so it scales with its box. */
      function Slide(props) {
        var ref = react.useRef(null)
        useEffect(
          function () {
            var el = ref.current
            if (!el) return
            el.innerHTML = namespaceIds(props.svg, props.prefix)
            var svg = el.querySelector('svg')
            if (svg) {
              svg.setAttribute('width', '100%')
              svg.setAttribute('height', '100%')
              svg.style.display = 'block'
            }
          },
          [props.svg, props.prefix],
        )
        return h('div', {
          ref: ref,
          style: { position: 'absolute', inset: 0 },
        })
      }

      /** One thumbnail: a 16:9 box holding the slide, clickable into the viewer. */
      function Frame(props) {
        return h(
          'div',
          {
            style: {
              position: 'relative',
              aspectRatio: (props.width || 1280) + ' / ' + (props.height || 720),
              background: COLORS.stage,
              borderRadius: 6,
              overflow: 'hidden',
              border: '1px solid ' + COLORS.line,
              cursor: props.onClick ? 'zoom-in' : 'default',
              width: '100%',
            },
            onClick: props.onClick,
            role: props.onClick ? 'button' : undefined,
            tabIndex: props.onClick ? 0 : undefined,
            onKeyDown: props.onClick
              ? function (e) {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    props.onClick()
                  }
                }
              : undefined,
            title: props.title,
          },
          h(Slide, { svg: props.page.svg, prefix: props.prefix }),
        )
      }

      /**
       * Full-size viewer: the deck's own `preview.html`, in an iframe.
       *
       * Everything a reader does inside it — ←/→, the filmstrip, the
       * light/dark surround, the audit findings panel — belongs to that page,
       * which was written, tested and shipped for the harnesses that have no
       * plugin UI. This modal contributes the two things the page has no way
       * to offer from inside itself: a way out, and the export.
       */
      function Modal(props) {
        var frameRef = react.useRef(null)

        useEffect(
          function () {
            ensureModalStyles()
            function onKey(e) {
              if (e.key === 'Escape') props.onClose()
            }
            document.addEventListener('keydown', onKey)
            // Once the reader clicks the deck, keystrokes go to the iframe's
            // own document and never reach this one — so Escape has to be
            // heard there too, or it stops working exactly when the modal is
            // in use. The frame is same-origin by construction (its src is
            // this plugin's own route), and the access is guarded anyway:
            // losing Escape is not worth throwing inside an effect for. The
            // listener needs no removal of its own, since it dies with the
            // document when this modal unmounts.
            var frame = frameRef.current
            function listenInside() {
              try {
                var doc = frame.contentDocument
                if (doc) doc.addEventListener('keydown', onKey)
              } catch {
                /* not reachable from here after all — the outer listener stands */
              }
            }
            if (frame) frame.addEventListener('load', listenInside)
            return function () {
              document.removeEventListener('keydown', onKey)
              if (frame) frame.removeEventListener('load', listenInside)
            }
          },
          [props.onClose, props.src],
        )

        return h(
          'div',
          {
            style: {
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              // Opaque, not the usual translucent backdrop. This covers the
              // whole viewport with a document, so there is nothing behind it
              // worth a glimpse of — and a glimpse is all a translucent one
              // gives. At 0.8 the harness's own composer stayed legible right
              // under this modal's buttons and the eye read the two as one
              // strip of controls; at 0.94 its title bar and its `Session
              // log` pill still ghosted through at 6% white, the pill landing
              // 14px outside the edge these buttons are aligned to.
              background: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            },
            onClick: function (e) {
              if (e.target === e.currentTarget) props.onClose()
            },
          },
          h(
            'div',
            {
              style: {
                width: 'min(100%, 1600px)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              },
              onClick: function (e) {
                if (e.target === e.currentTarget) props.onClose()
              },
            },
            // Above the frame, not below it. Below, this row lands in the
            // strip of backdrop the harness's own input area occupies, and
            // whatever the backdrop lets through sits on the same baseline.
            h(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 10,
                  flex: '0 0 auto',
                  // Lines this row's right edge up with the Light/Dark toggle
                  // in the previewed page's own header, which sits one row
                  // below it. That page's own `header` rule reserves the same
                  // inset (`padding:11px 18px`, preview-html.ts); without
                  // matching it, two right-aligned rows 14px apart miss each
                  // other by just enough to look like a mistake, not a choice.
                  paddingRight: 18,
                },
                onClick: function (e) {
                  if (e.target === e.currentTarget) props.onClose()
                },
              },
              props.previewId
                ? h(ExportButton, {
                    previewId: props.previewId,
                    name: props.name,
                    draft: props.draft,
                    className: 'pf-mbtn-primary',
                  })
                : null,
              h(
                'button',
                { onClick: props.onClose, className: 'pf-mbtn' },
                'Close',
              ),
            ),
            h('iframe', {
              ref: frameRef,
              src: props.src,
              title: 'pptfast deck preview',
              style: {
                // Takes the rest of the dialog and lets the page inside do its
                // own layout. Its stage carries `aspect-ratio: 16/9` and sizes
                // itself off the viewport it is handed, so the slide keeps its
                // shape at any frame size. Pinning the *frame* to 16:9 instead
                // would have to reserve room for that page's header and
                // filmstrip, and every guess at how much is wrong the moment
                // either one changes height.
                flex: '1 1 auto',
                width: '100%',
                minHeight: 0,
                border: 0,
                borderRadius: 8,
                background: COLORS.stage,
              },
            }),
          ),
        )
      }

      /**
       * The export.
       *
       * Fetched and saved by hand rather than left to a plain `download`
       * anchor. A preview id can genuinely expire — the deck it names lives
       * in a temp dir — and on a bare anchor that failure arrives as a 404
       * body the browser saves as a file, which is how the first version
       * handed people a `pptx.json` and called it a download. Going through
       * fetch means a failure can say so.
       */
      function ExportButton(props) {
        var state = useState('idle')
        var status = state[0]
        var setStatus = state[1]

        function save() {
          if (status === 'busy') return
          setStatus('busy')
          fetch('/pptfast/preview/' + props.previewId + '/pptx')
            .then(function (res) {
              if (!res.ok) throw new Error(String(res.status))
              return res.blob()
            })
            .then(function (blob) {
              var url = URL.createObjectURL(blob)
              var a = document.createElement('a')
              a.href = url
              // Matches the name the host half gave the file it is serving
              // (`exportName`, preview-tool.js): a deck with unfilled pages
              // must not be saved under a name that reads as finished work.
              a.download = (props.name || 'deck') + (props.draft ? '-draft' : '') + '.pptx'
              document.body.appendChild(a)
              a.click()
              a.remove()
              setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
              setStatus('idle')
            })
            .catch(function () {
              // Almost always an expired preview: the deck lived in a temp
              // directory and the harness has restarted since.
              setStatus('gone')
            })
        }

        return h(
          'button',
          {
            onClick: save,
            className: props.className,
            style: props.style,
            title:
              status === 'gone'
                ? 'This preview has expired. Run the tool again to rebuild it'
                : props.draft
                  ? 'Download the editable .pptx. It is a draft: some pages are still unfilled placeholders'
                  : 'Download the editable .pptx',
          },
          status === 'busy' ? 'Saving…' : status === 'gone' ? 'Expired' : 'Download .pptx',
        )
      }

      /** The card itself: a strip of thumbnails, and a button that opens the viewer. */
      return function PptfastPreviewCard(props) {
        var direct = bundleOf(props.block)
        var fetched = useState(null)
        var open = useState(false)
        var previewId = previewIdOf(props.block)

        // Structured payload when the runtime computed one (native-mode,
        // top-level call); otherwise fetch it by id from the plugin's own
        // route, which is what Code Mode's sub-calls need.
        // Keyed by preview id, not by "have I fetched anything yet". A React
        // instance is reused when the block it renders changes, so gating on
        // a non-empty cache left the card showing the previous deck forever.
        useEffect(
          function () {
            if (direct || !previewId) return
            if (fetched[0] && fetched[0].__previewId === previewId) return
            var cancelled = false
            fetch('/pptfast/preview/' + previewId)
              .then(function (r) { return r.ok ? r.json() : null })
              .then(function (b) {
                if (cancelled || !b) return
                b.__previewId = previewId
                fetched[1](b)
              })
              .catch(function () { /* the generic row is the degrade */ })
            return function () { cancelled = true }
          },
          [direct, previewId, fetched[0]],
        )

        var cached = fetched[0] && fetched[0].__previewId === previewId ? fetched[0] : null
        var bundle = direct || cached
        if (!bundle) return null

        var pages = viewablePages(bundle)
        if (pages.length === 0) return null

        var slide = bundle.slide || { width: 1280, height: 720 }
        var findingCount = bundle.pages.reduce(function (n, p) {
          return n + ((p.findings && p.findings.length) || 0)
        }, 0)

        return h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '2px 0 6px' } },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: COLORS.dim } },
            h('span', { style: { color: COLORS.text, fontWeight: 600 } }, bundle.title || 'deck'),
            // The deck still has placeholder pages. The export goes out
            // anyway (see `--draft` in preview-tool.js's `execute`), so this
            // badge is what keeps that from being a silent substitution: the
            // user is looking at unfinished work and the file they save says
            // so too.
            bundle.draft
              ? h(
                  'span',
                  {
                    title: 'Some pages are still unfilled placeholders — the export is labelled a draft',
                    style: {
                      border: '1px solid ' + COLORS.line,
                      borderRadius: 5,
                      padding: '0 6px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      fontSize: 10,
                      letterSpacing: '0.04em',
                    },
                  },
                  'draft',
                )
              : null,
            h('span', null, bundle.pages.length + ' pages'),
            findingCount > 0 ? h('span', null, findingCount + ' audit findings') : null,
            // No viewer without an id: the full-size view is a route keyed by
            // it. A button that opened an empty frame would be worse than an
            // absent one, and the thumbnails below go inert for the same
            // reason.
            previewId
              ? h(
                  'button',
                  {
                    onClick: function () { open[1](true) },
                    style: {
                      marginLeft: 'auto',
                      font: 'inherit',
                      fontSize: 12,
                      padding: '3px 10px',
                      borderRadius: 7,
                      border: '1px solid ' + COLORS.line,
                      background: 'transparent',
                      color: COLORS.text,
                      cursor: 'pointer',
                    },
                  },
                  'Open',
                )
              : null,
            previewId
              ? h(ExportButton, {
                  previewId: previewId,
                  name: bundle.title,
                  draft: bundle.draft,
                  style: {
                    font: 'inherit',
                    fontSize: 12,
                    padding: '3px 10px',
                    borderRadius: 7,
                    border: '1px solid ' + COLORS.line,
                    background: 'transparent',
                    color: COLORS.text,
                    cursor: 'pointer',
                  },
                })
              : null,
          ),
          h(
            'div',
            { style: { display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 } },
            stripPages(pages).map(function (page, i) {
              return h(
                'div',
                { key: page.id || i, style: { flex: '0 0 auto', width: 132 } },
                h(Frame, {
                  page: page,
                  prefix: 'pft' + i + '-',
                  width: slide.width,
                  height: slide.height,
                  title: (page.type || 'page') + ' ' + pageNumberOf(page, i),
                  // Every thumbnail opens the same viewer. It used to carry a
                  // start page, which the html has no way to honour — see the
                  // note on `Modal`.
                  onClick: previewId ? function () { open[1](true) } : undefined,
                }),
              )
            }),
          ),
          open[0] && previewId
            ? h(Modal, {
                src: previewHtmlUrl(previewId),
                previewId: previewId,
                name: bundle.title,
                draft: bundle.draft,
                onClose: function () { open[1](false) },
              })
            : null,
        )
      }
    }

    function registerCard(ctx) {
      // `slots` is a declared dependency (see `exports.inject` below), so
      // cordis does not apply this plugin until the service exists. The guard
      // stays as a belt-and-braces check, but it must never be the thing that
      // silently makes this card a no-op — which is exactly what happened
      // when `inject` was empty: apply ran before the slot registry was up,
      // this returned quietly, and the tool rendered in the generic row with
      // no sign anything had failed.
      if (!ctx.slots || typeof ctx.slots.inject !== 'function') {
        console.error('[pptfast] preview card skipped: no slot registry on this context')
        return
      }
      var react
      try {
        react = require('react')
      } catch (error) {
        console.error('[pptfast] preview card skipped: ' + error)
        return
      }
      var Card = PreviewCard(react)
      ctx.slots.inject('tool.call.toolview', function* () {
        yield ctx.slots.register({ name: 'tool.call.toolview', key: TOOL_NAME }, Card)
      })
    }

    function apply(ctx) {
      // A card that fails to register is a console line, not a dead turn —
      // the generic tool row still renders the call, same posture the host
      // half takes for its own registrations.
      try {
        registerCard(ctx)
      } catch (error) {
        console.error('[pptfast] preview card registration skipped: ' + error)
      }
    }

    exports.apply = apply
    // Declared, not sniffed: cordis holds this plugin until the slot registry
    // is up. The shipped `ui-skill` registrant declares the same service for
    // the same reason.
    exports.inject = ['slots']
    // Exposed for this repo's tests only; not part of the plugin contract.
    exports.__testing = {
      bundleOf: bundleOf,
      previewIdOf: previewIdOf,
      namespaceIds: namespaceIds,
      viewablePages: viewablePages,
      stripPages: stripPages,
      hasMarkup: hasMarkup,
      pageNumberOf: pageNumberOf,
      previewHtmlUrl: previewHtmlUrl,
      STRIP_PAGES: STRIP_PAGES,
      TOOL_NAME: TOOL_NAME,
    }
    return module.exports
  },
})
