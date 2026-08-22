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
// The two halves of a card have different lifetimes, and that is the whole of
// what went wrong in the field. What it draws comes from one request; what its
// buttons do is a second request made minutes or days later, against files the
// user may since have deleted. Reopen a transcript after that and the card used
// to have two failure modes and no words for either: under Code Mode the fetch
// 404'd and the entire card — strip, Open, Download — rendered nothing, so the
// tool call read as if it had produced nothing; with a payload already in hand,
// the strip drew perfectly and the viewer opened on
// `{"error":"unknown preview id"}`, displayed as a document, framed by this
// card's own Close button. So: a missing deck is now an answer (the card says
// the deck is gone, and how long it was), every way into the viewer asks the
// route first, and the host half answers the iframe with a page rather than
// with JSON.
//
// The correction after that was learning to tell "gone" from "this request did
// not work" — see `verdictOf`. Collapsing the two meant one flaky response
// permanently retired a deck that was sitting on disk the whole time.
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

    /**
     * Where the full-size viewer lives — the html `preview --html` wrote.
     *
     * `#page=N` is that page's own way in, and a URL is the only thing this
     * card can hand it: the frame is a document, not a component with props.
     * N counts pages the way a reader does, so it is the thumbnail's own
     * label rather than its index in a strip that may be a prefix of the deck.
     */
    function previewHtmlUrl(previewId, startPage) {
      var url = '/pptfast/preview/' + previewId + '/html'
      return startPage > 1 ? url + '#page=' + startPage : url
    }

    /** Where the deck itself lives — the bundle the strip draws from. */
    function previewBundleUrl(previewId) {
      return '/pptfast/preview/' + previewId
    }

    /**
     * What one answer from the route says about the deck behind an id.
     *
     * This is the distinction the card was missing, and the bug it caused was
     * not subtle: every non-2xx response collapsed into "expired", so a single
     * 502 from a restarting harness, or a request that never left the tab,
     * retired a deck that was sitting on disk the whole time — permanently,
     * for the life of the page, with a reload the only way back.
     *
     * 404 and 410 are the route's two verdicts about the id itself: never
     * heard of it, or heard of it and cannot serve what is left. Both are
     * final, because nothing regenerates a preview (see the host half). Every
     * other outcome — a 5xx, a proxy error, a socket that never opened — is a
     * statement about this attempt and about nothing else, so the card holds
     * its judgement and the next click tries again.
     */
    function verdictOf(res) {
      if (!res) return Promise.resolve(UNREACHABLE_VERDICT)
      if (res.ok) return Promise.resolve('alive')
      // A status code does not say who produced it. The plugin's route may
      // have failed to register, a proxy may have answered first, or the shell
      // may be serving its own not-found page for a path it does not know —
      // all of which look exactly like our 404 and none of which are evidence
      // that a deck is gone. Only a stamped answer is allowed to retire one.
      //
      // Same-origin, so the header is readable without the server having to
      // list it in `Access-Control-Expose-Headers`. If this route ever became
      // cross-origin that header would have to be added, and until then a proxy
      // that strips ours degrades everything to `unreachable` — a false
      // negative, which is the safe direction: the card offers another try
      // instead of retiring a live deck.
      if (!fromPreviewRoute(res)) return Promise.resolve(UNREACHABLE_VERDICT)
      // Not lumped in with the retryable failures, because retrying an
      // identical request against a door that is closed does nothing. The user
      // has to change something outside this card first.
      //
      // Only a *stamped* 401/403 reaches this line — the check above has
      // already sent an unstamped one to `unreachable`. So this is a narrow
      // door: a plain reverse proxy's own 401 does not carry our header and
      // gets a Retry it may well be able to satisfy, which is the safe way
      // round. The host half sends no 401/403 of its own at all.
      if (res.status === 401 || res.status === 403) return Promise.resolve('refused')
      if (res.status !== 404 && res.status !== 410) return Promise.resolve(UNREACHABLE_VERDICT)
      // Both final, and they need opposite sentences in front of a person, so
      // the status alone is not enough to act on. The route says which kind in
      // the body; reading it is why this function is asynchronous.
      return readFailureCode(res).then(function (code) {
        return code === 'preview_damaged' ? 'damaged' : 'gone'
      })
    }

    /** The header the host half stamps on every answer it writes. */
    var ROUTE_HEADER = 'x-pptfast-preview'

    function fromPreviewRoute(res) {
      var headers = res && res.headers
      if (!headers || typeof headers.get !== 'function') return false
      return headers.get(ROUTE_HEADER) === '1'
    }

    /**
     * The machine-readable half of a failure, or nothing.
     *
     * Read from the body rather than guessed from the prose. A body that will
     * not parse is not a reason to give up on the status we already have, so
     * this resolves with null and the caller falls back to the coarser reading.
     */
    function readFailureCode(res) {
      if (!res || typeof res.json !== 'function') return Promise.resolve(null)
      return res
        .json()
        .then(function (body) {
          return body && typeof body.code === 'string' ? body.code : null
        })
        .catch(function () {
          return null
        })
    }

    /** A request that never produced a response says nothing about the deck. */
    var UNREACHABLE_VERDICT = 'unreachable'

    /**
     * The verdicts a Retry button can honestly do something about.
     *
     * Only `unreachable`. `gone` and `damaged` are final by construction —
     * nothing regenerates a preview — and `refused` is the route answering, so
     * the identical request will be refused identically until something changes
     * elsewhere. This is called from the render path, not just asserted about:
     * a version of this that was only ever tested as a pure function shipped a
     * Retry button on a refusal it could never satisfy.
     */
    function isRetryable(verdict) {
      return verdict === UNREACHABLE_VERDICT
    }

    /** The verdicts that mean this deck will not open, whatever the user does next. */
    function isFinal(verdict) {
      return verdict === 'gone' || verdict === 'damaged' || verdict === 'refused'
    }

    /**
     * Are these bytes a zip, and therefore plausibly a .pptx?
     *
     * `50 4b 03 04` is the local file header every zip starts with, and Office
     * Open XML is a zip. This is not a deep validation and does not try to be —
     * it is the one check that separates "a deck" from "an HTML page a proxy
     * returned with status 200", which is the failure that actually happened.
     */
    function isZip(blob) {
      if (!blob || typeof blob.slice !== 'function' || typeof blob.arrayBuffer !== 'function') {
        return Promise.resolve(false)
      }
      return blob
        .slice(0, 4)
        .arrayBuffer()
        .then(function (head) {
          var bytes = new Uint8Array(head)
          return bytes.length === 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
        })
        .catch(function () {
          return false
        })
    }

    /**
     * What the card says once it knows the deck behind its id is gone.
     *
     * One sentence, used by the badge, the export button and the degraded row
     * alike, because they are all reporting the same fact and a card that
     * words it three ways reads as three different problems.
     *
     * It no longer says "expired", and that is a correctness fix rather than a
     * wording preference: nothing expires a preview. There is no timer, no
     * size budget and no sweep, so telling the user their preview timed out
     * sent them looking for a retention setting that does not exist.
     *
     * It does not name a culprit either, and that is the same correction made
     * twice. All the route observed is that nothing is at this id under the
     * previews root this session is reading. Deletion is the usual reason and
     * not the only one: `PPTFAST_HOME` decides that root, so a deck written
     * under a different one is alive and out of reach, which is a fact about
     * configuration and not about anything the user did wrong.
     */
    var MISSING_HINT =
      'The rendered deck for this preview is no longer on disk where this session looks for it. ' +
      'Previews are never removed on a timer, so it was either deleted or written under a different ' +
      'PPTFAST_HOME. Run pptfast_preview again to rebuild it.'

    /** What the card says when it could not reach the route at all. */
    var UNREACHABLE_HINT =
      'Could not reach the pptfast preview route. The deck may still be there — try again.'

    /** What the card says when the route answered, but refused. */
    var REFUSED_HINT =
      'The pptfast preview route refused this request. The deck may still be there, ' +
      'but this browser is not allowed to read it. Trying again will be refused the same way.'

    /**
     * What the card says when the deck was rendered and its bookkeeping is not
     * readable.
     *
     * Deliberately never the word "deleted", and never "no longer on disk". The
     * host half tells these two apart and says so in a machine-readable code;
     * before this sentence existed the card threw that away and reported both
     * as a deletion, so a `record.json` truncated by a full disk arrived at the
     * user as an accusation that they had removed their own work. The pages are
     * very likely still sitting next to the file that went bad.
     */
    var DAMAGED_HINT =
      'This preview cannot be opened: the file describing it is present but unreadable. ' +
      'The rendered pages may still be on disk — run pptfast_preview again to rebuild it.'

    /** The sentence that goes with a verdict, in the one place that shows all of them. */
    function hintFor(verdict) {
      if (verdict === 'gone') return MISSING_HINT
      if (verdict === 'damaged') return DAMAGED_HINT
      if (verdict === 'refused') return REFUSED_HINT
      return UNREACHABLE_HINT
    }

    /** The one word the badge shows, per verdict. Never "gone" for anything but gone. */
    function badgeFor(verdict) {
      if (verdict === 'damaged') return 'damaged'
      if (verdict === 'refused') return 'refused'
      return 'gone'
    }

    /** What the export button says once it knows it cannot succeed. */
    function exportLabelFor(verdict) {
      if (verdict === 'damaged') return 'Damaged'
      if (verdict === 'refused') return 'Refused'
      return 'Unavailable'
    }

    /**
     * Everything the tool said in text, joined.
     *
     * This is the channel that survives Code Mode: a tool invoked from inside
     * `run_code` is a sub-call, and the registry computes `presentationMeta`
     * for top-level calls only, so on this repo's default agent preset the
     * structured payload never exists. The result text always does — which is
     * why both the preview id and, when the deck itself is gone, the one fact
     * left about it are read back out of here.
     */
    function resultTextOf(block) {
      var text = ''
      var content = (block && (block.content || (block.result && block.result.content))) || []
      for (var i = 0; i < content.length; i++) {
        if (content[i] && typeof content[i].text === 'string') text += content[i].text
      }
      return text
    }

    /** The preview id the tool stamped into its own result text. */
    function previewIdOf(block) {
      var m = /pptfast-preview:([A-Za-z0-9-]+)/.exec(resultTextOf(block))
      return m ? m[1] : null
    }

    /**
     * How long the deck was, read back out of the tool's own summary line.
     *
     * The tool's summary line is what survives in a transcript once the
     * rendered files are gone, and this is the fact the card reads back out of
     * it. The bundle does not survive: it never enters the session log under
     * Code Mode, and putting it there would mean a session log that grows by a
     * deck's worth of SVG per call — the trade this plugin already decided
     * against. So when the route can no longer serve the deck, one number
     * parsed from a line already in the log is the difference between a card
     * that says "there were nine pages here" and a card that vanishes as if
     * the tool had never run.
     *
     * Parsed rather than carried in a second machine-readable stamp: the
     * sentence is written by `modelSummary` in this plugin's own host half,
     * one file away, and a test drives the real output of that function
     * through this parser, so the two cannot drift apart without that test
     * going red.
     */
    function pageCountOf(block) {
      var m = /\brendered (\d+) pages?\b/.exec(resultTextOf(block))
      return m ? Number(m[1]) : null
    }

    /**
     * Pull the preview bundle out of a frozen tool-call node.
     *
     * `presentationMeta` is projected into the result's view/meta by the
     * host; the exact field the runtime lands it on has moved between rc
     * builds, so this reads the handful of shapes it can appear under rather
     * than pinning one. Returning null simply falls through to the route,
     * which is where a Code Mode sub-call's deck has to come from anyway.
     */
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
       * Sized against the harness's shell rather than the card's: these sit
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
                    status: props.downloadStatus,
                    onStatus: props.onDownloadStatus,
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
       * anchor. A preview id can genuinely stop resolving — the user is free
       * to delete what it names — and on a bare anchor that failure arrives as
       * a 404 body the browser saves as a file, which is how the first version
       * handed people a `pptx.json` and called it a download. Going through
       * fetch means a failure can say so.
       *
       * The states are the verdicts, plus `busy` and `failed`. Anything final
       * (`gone`, `damaged`, `refused`) disables the button and says which;
       * `failed` is this attempt not working and leaves it clickable. Before
       * that split, one dropped request turned a live export into a dead button
       * for the rest of the session.
       *
       * This component owns no state. It reads `props.status` and reports
       * through `props.onStatus(next, order)`, both of which belong to the
       * card's store — see THE STORE for why a component keeping "just a
       * little" of its own is how this went wrong twice. The `order` it passes
       * back is one ticket for the whole attempt, in the download lane. Two
       * clicks can still answer out of order, of course. What the ticket buys
       * is that the older answer is the one discarded, and that an answer about
       * the deck cannot discard this one.
       */
      function ExportButton(props) {
        // `props.verdict` is the card telling this button what it already
        // learned from the route. Before it, the only way to find out was to
        // click and wait for the fetch to fail, so a card that knew perfectly
        // well the export was dead still offered it as `Download .pptx`.
        var status = isFinal(props.verdict) ? props.verdict : props.status
        var setStatus = props.onStatus

        function save() {
          if (status === 'busy' || isFinal(status)) return
          // One ticket for this whole attempt, in its own lane. Two clicks race
          // the same way two Opens do, and the download lane is separate from
          // the deck lane so a slow export cannot make a fresh verdict look
          // stale — or the reverse.
          var order = { lane: 'download', ticket: nextTicket() }
          setStatus('busy', order)
          fetch('/pptfast/preview/' + props.previewId + '/pptx')
            .then(function (res) {
              return verdictOf(res).then(function (verdict) {
                if (verdict !== 'alive') {
                  var error = new Error('preview route answered ' + (res ? res.status : 'nothing'))
                  error.verdict = verdict
                  throw error
                }
                return res.blob()
              })
            })
            .then(function (blob) {
              // Look at the bytes before saving them. A 200 whose body is a
              // login page, a proxy notice or an error document is exactly how
              // the first version of this button handed people a `pptx.json`
              // and called it a download — the status line said fine and the
              // content was not a deck. A .pptx is a zip, so its first four
              // bytes are the only claim worth checking.
              return isZip(blob).then(function (ok) {
                if (!ok) {
                  var error = new Error('the preview route returned something that is not a .pptx')
                  error.verdict = UNREACHABLE_VERDICT
                  throw error
                }
                return blob
              })
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
              setStatus('idle', order)
            })
            .catch(function (error) {
              // A rejection carrying no verdict is not the route speaking: the
              // request never landed, or it landed and reading the body failed
              // halfway. Neither says anything final about the deck. Only the
              // route's own answers do — and `refused` counts among them, since
              // clicking again sends the identical request to the same closed
              // door. Folding 401/403 into `failed` offered a retry that could
              // only fail again, under a sentence about the network.
              var verdict = error && error.verdict
              setStatus(isFinal(verdict) ? verdict : 'failed', order)
            })
        }

        return h(
          'button',
          {
            onClick: save,
            className: props.className,
            style: props.style,
            title: isFinal(status)
              ? hintFor(status)
              : status === 'failed'
                ? UNREACHABLE_HINT
                : props.draft
                  ? 'Download the editable .pptx. It is a draft: some pages are still unfilled placeholders'
                  : 'Download the editable .pptx',
          },
          status === 'busy'
            ? 'Saving…'
            : isFinal(status)
              ? exportLabelFor(status)
              : status === 'failed'
                ? 'Retry download'
                : 'Download .pptx',
        )
      }

      /**
       * The missing card's own line, under the header.
       *
       * Said out loud rather than left to a tooltip: the whole complaint this
       * exists to answer is a card that told the user nothing at all.
       */
      function VerdictNote(props) {
        return h(
          'div',
          { style: { fontSize: 12, color: COLORS.dim, paddingTop: 2 } },
          hintFor(props.verdict),
        )
      }

      /**
       * The badge that marks a deck the route will not serve, and says which
       * kind of "will not".
       *
       * It used to read `gone` whatever had happened, which is how a damaged
       * `record.json` reached the user as a deletion. The word comes from the
       * verdict now, and the verdict comes from a code the route sends.
       */
      function VerdictBadge(props) {
        return h(
          'span',
          {
            title: hintFor(props.verdict),
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
          badgeFor(props.verdict),
        )
      }

      // THE STORE.
      //
      // Seven review rounds produced seven defects of one shape: state that
      // could not say which preview it was about, or a write that landed on the
      // wrong one. Three of those were introduced by the fix for the previous
      // one. What is left is one entry and one number, and this note describes
      // only what the code in front of you does.
      //
      // ONE ENTRY. The card draws one deck at a time, so the store holds one
      // deck's state, stamped with the preview id it belongs to. A render reads
      // it only while that stamp matches the deck it is drawing (`mine`);
      // otherwise it reads `UNASKED` and the deck that has scrolled past lends
      // nothing to the one that replaced it — not its verdict, not its open
      // viewer, not its download status. Arriving at a deck replaces the entry
      // outright rather than adjusting the one already there, which is what
      // makes that true of every field at once instead of field by field.
      //
      // ONE NUMBER. A monotonic counter hands out a ticket per request, and one
      // per arrival. An entry starts life holding its arrival's ticket as the
      // high-water mark of both lanes, and a write is accepted only if its
      // ticket is at least the mark of the lane it names. That single
      // comparison does two jobs:
      //
      //  - within one stay, an older answer cannot overwrite a newer one. Two
      //    clicks on Open used to race last-writer-wins: the second request
      //    answered 410 and settled the card, then the first answered 200 and
      //    un-settled it, reopening a viewer for a deck the route had just
      //    disowned. "Last to arrive" and "most recent" are not the same thing,
      //    and only one of them is a fact about the deck.
      //
      //  - across stays, an answer from a stay the card has left is refused by
      //    the same line, because the current entry's mark was taken when the
      //    card arrived — which is after that request went out. This is why
      //    there is no second stamp to compare. An earlier version addressed
      //    entries by `{ id, visit }` and matched the visit exactly, and it had
      //    to: a new entry started both lanes at zero, so a departed stay's
      //    ticket was the higher number and won. Seeding the marks from the
      //    arrival inverts that. The danger did not go away, the arithmetic
      //    turned round — leave the seed at zero and a viewer opens by itself
      //    over a deck the user has only just come back to.
      //
      // Two lanes, deck and download, each with a mark of its own, so a slow
      // export cannot make a fresh verdict look stale, or the reverse.
      //
      // Nothing is written during a render — not the store, and not the counter
      // below. The store is *read* during one, in `deck`, which is ordinary
      // React. What this file must not do is let a render decide or remember
      // anything, which is how the ref-based version broke under a render that
      // was thrown away. Nothing is captured from a render either: a request
      // takes its ticket when it is sent, and what it is measured against is
      // whatever the store holds when it answers.
      //
      // `useLayoutEffect` rather than `useEffect` for the maintenance, and the
      // reason is narrow: it puts the entry in place during the commit that
      // paints the buttons, so there is no frame in which a click could land on
      // a deck that has nowhere to write its answer. It is not load-bearing for
      // ordering — the fetch effect waits for the entry through its dependency
      // list rather than through hook order, so a passive spelling declared
      // anywhere fetches just the same. That was measured, not reasoned: with
      // `maintainStore` rewritten as a passive effect and moved below the fetch
      // effect, all 189 tests across this plugin's two suites stay green. A
      // structural test could tell the two spellings apart. No behaviour test
      // in this suite does.
      //
      // What this does NOT do, stated because overclaiming here has itself been
      // a recurring defect:
      //
      //  - it does not stop a request that has been left behind from finishing.
      //    A download started on a previous visit still saves its file, because
      //    the user did ask for it; what it cannot do is report back.
      //  - it cannot stop a component from keeping state of its own and going
      //    around the store. See the tripwire test for what is and is not
      //    caught, and `.issues/…/design.md` §5.12 for the list of shapes that
      //    are known to slip past it.
      //  - the id stamp is not something a behaviour test in this suite can
      //    see, and that half was measured: drop it from the read and all 189
      //    tests stay green (round 9, K1). `maintainStore` is a layout effect,
      //    so the render that pairs the old entry with the new id is replaced
      //    before the browser paints and before any assertion runs. It is kept
      //    for what that render would do on the way past — mount the viewer's
      //    iframe against the new deck's URL on the strength of the old deck's
      //    open flag, and send the bundle request while the old entry still
      //    holds the marks it would be measured against. That half is read off
      //    React's commit order, not off a failing test, and it is free: the
      //    same comparison is already there for the fetch effect to wait on.
      //
      // `AbortController` was considered and left out: cancelling still leaves
      // an abort rejection to handle, so it moves a check rather than removing
      // one, and adds a second thing to keep in sync.

      /**
       * What a preview is, to this card, before anything has been asked about
       * it — and what a render reads for a deck whose entry is not in place
       * yet. `id` is null because that is precisely what makes it nobody's.
       */
      var UNASKED = {
        id: null,
        bundle: null,
        verdict: null,
        viewerOpen: false,
        viewerPage: 1,
        download: 'idle',
        attempt: 0,
        seen: { deck: 0, download: 0 },
      }

      /**
       * A brand new entry for a deck this card has just arrived at.
       *
       * Both lanes start at the arrival's own ticket, which is the whole of how
       * a request from an earlier stay is turned away: it took a smaller number
       * before this arrival took its own.
       */
      function arrivalAt(id, ticket) {
        return Object.assign({}, UNASKED, { id: id, seen: { deck: ticket, download: ticket } })
      }

      /**
       * The card's monotonic counter: one number per request, and one per
       * arrival.
       *
       * It lives in this factory's closure, so every card the plugin renders
       * draws from the same sequence — which is more than the store needs (each
       * card's numbers are only ever compared with its own) and keeps it out of
       * component state, and therefore out of the render.
       *
       * Arrivals draw from the same sequence as requests on purpose, and it is
       * not a convenience: an arrival's number has to be comparable with the
       * tickets of requests already in flight, or it could not outrank them.
       */
      var lastTicket = 0
      function nextTicket() {
        lastTicket += 1
        return lastTicket
      }

      /** The card itself: a strip of thumbnails, and a button that opens the viewer. */
      return function PptfastPreviewCard(props) {
        var direct = bundleOf(props.block)
        var previewId = previewIdOf(props.block)
        var pageCount = pageCountOf(props.block)

        // One entry, stamped with the deck it belongs to — see THE STORE.
        var store = useState(UNASKED)

        /**
         * Keep the entry pointed at the deck this card is showing.
         *
         * The only place an entry is replaced. Runs on commit, so a render
         * React threw away changes nothing.
         *
         * Arriving at a deck builds a NEW entry, always, even for an id this
         * card was showing a moment ago. That is the point: the previous stay
         * and this one are two different recipients, so the requests still in
         * flight from the previous one have a number to be turned away by (see
         * `arrivalAt`). Nothing is carried over — carrying the download status
         * alone was enough, once, to label a live deck's export `Unavailable`
         * on the strength of the previous deck's 410.
         *
         * The store is left strictly alone when it already holds this deck, so
         * a second run of this effect cannot replace a live entry. The number
         * is taken outside the updater because React may run an updater more
         * than once, and this one has to stay a plain function of `entry`.
         */
        function maintainStore() {
          var arrival = nextTicket()
          store[1](function (entry) {
            return entry.id === previewId ? entry : arrivalAt(previewId, arrival)
          })
        }
        react.useLayoutEffect(maintainStore, [previewId])

        /**
         * The only way an asynchronous result changes anything.
         *
         * `order` is `{ lane, ticket }`: which sequence this write belongs to,
         * and where in it. UI actions that are their own newest intent take a
         * fresh ticket, and the two lanes are independent.
         *
         * One refusal, doing two jobs — see THE STORE. An older ticket never
         * overwrites a newer one in the same lane, and an answer from a stay
         * this card has left is older than the arrival that replaced it.
         */
        function commit(change, order) {
          store[1](function (entry) {
            if (order.ticket < entry.seen[order.lane]) return entry
            var seen = Object.assign({}, entry.seen)
            seen[order.lane] = order.ticket
            return Object.assign({}, entry, change, { seen: seen })
          })
        }

        // Read side: this preview's own entry, or the state of a preview
        // nobody has asked about yet. Derived from props, so a render decides
        // nothing and remembers nothing. `mine` is also what the fetch effect
        // waits on: until the entry is this deck's, a request sent from here
        // would be measured against the previous deck's marks.
        var mine = previewId !== null && store[0].id === previewId
        var deck = mine ? store[0] : UNASKED
        var verdict = deck.verdict
        // Every way this deck will not open, under one name. `gone` used to
        // stand in for all of them, which is why a damaged preview and a
        // refused request both told the user their deck had been deleted.
        var settled = isFinal(verdict)

        // Structured payload when the runtime computed one (native-mode,
        // top-level call); otherwise fetch it by id from the plugin's own
        // route, which is what Code Mode's sub-calls need.
        useEffect(
          function () {
            // `!mine` is the render between arriving at a deck and
            // `maintainStore` putting its entry in place. A request sent from
            // there would be ordered against the *previous* deck's marks, and
            // the entry it wrote into would be thrown away a moment later — so
            // it waits, and `mine` is in the dependency list below, which is
            // what brings it back the moment there is somewhere to write to.
            if (direct || !mine || deck.bundle) return
            var order = { lane: 'deck', ticket: nextTicket() }
            fetch(previewBundleUrl(previewId))
              .then(function (r) {
                // A 404 or 410 is an answer, not a failure to get one: the
                // harness is there and it has never heard of this deck, or
                // has and cannot serve what is left of it. Swallowing that is
                // what made a whole card — thumbnails, Open, Download —
                // disappear out of a reopened transcript without a word.
                // Anything else this records as `unreachable`, which the card
                // reads as "no verdict yet" rather than as a dead deck.
                return verdictOf(r).then(function (answer) {
                  if (answer !== 'alive') {
                    commit({ verdict: answer }, order)
                    return null
                  }
                  return r.json()
                })
              })
              .then(function (b) {
                if (!b) return
                commit({ bundle: b, verdict: 'alive' }, order)
              })
              .catch(function () {
                // Not a verdict: the request never landed, or it landed and the
                // body would not parse. Either way that is a fact about this
                // attempt and not about the deck, and reporting it as a missing
                // preview would outlive its cause. The generic row is the
                // degrade, and every later click — Open, Download — asks the
                // route again from scratch.
                commit({ verdict: UNREACHABLE_VERDICT }, order)
              })
          },
          [direct, previewId, mine, deck.bundle, deck.attempt],
        )

        var bundle = direct || deck.bundle

        /**
         * Ask before opening, every time.
         *
         * The bundle a card is drawing came from one request, and the viewer
         * is a second one made minutes or days later — a browser tab left open
         * across a harness restart is enough to put a whole deck's lifetime
         * between them. Opening on the strength of the first request is how
         * the viewer landed on `{"error":"unknown preview id"}` rendered as a
         * document, framed by this card's own Close button. The check is one
         * loopback request against the route the iframe is about to hit
         * anyway, and it doubles as a refresh of the strip.
         *
         * The ticket is taken here, when the click happens, and it is the only
         * thing this request carries — see THE STORE. No write asks "is this
         * still current": arriving anywhere else, including back at this same
         * deck, takes a higher number, so an answer to a click the user walked
         * away from lands nowhere. Both halves of that have been a defect here.
         * First the wrong deck: click Open on A, let the card move to B while
         * A's request is in flight, and A's success opened the viewer — pointed
         * at B, which had been asked nothing at all. Then the wrong time: go
         * A → B → A, and A's first-stay success opened a viewer over the deck
         * the user had only just come back to.
         */
        function openViewer(page) {
          if (!previewId || settled) return
          var startAt = page > 1 ? page : 1
          // Two clicks on Open are two requests, and the one that answers
          // second is not necessarily the newer one. The ticket is what stops
          // an older 200 from undoing a newer 410 and reopening the viewer on
          // a deck the route has just disowned.
          var order = { lane: 'deck', ticket: nextTicket() }
          fetch(previewBundleUrl(previewId))
            .then(function (r) {
              return verdictOf(r).then(function (answer) {
                if (answer !== 'alive') {
                  // Recorded, and therefore said out loud: this is the click
                  // that used to do nothing visible at all when the route
                  // refused it, leaving the button in place and the user
                  // clicking it again. Every verdict now reaches the card.
                  commit({ verdict: answer }, order)
                  return null
                }
                return r.json()
              })
            })
            .then(function (b) {
              if (!b) return
              commit({ bundle: b, verdict: 'alive', viewerOpen: true, viewerPage: startAt }, order)
            })
            .catch(function () {
              // The modal stays shut either way, but only the route's own
              // verdict retires the deck. A click that never reached the
              // harness, or reached it and came back unreadable, leaves the
              // strip live and the button clickable, which is what makes trying
              // again the obvious next move rather than an impossible one.
              commit({ verdict: UNREACHABLE_VERDICT }, order)
            })
        }

        if (!bundle) {
          // Nothing to draw and nothing said about why: the card refusing to
          // invent a deck it does not have.
          if (verdict === null || verdict === 'alive') return null
          // Otherwise the tool did run, and the transcript still says how long
          // the deck was. That number survives a deleted preview on purpose:
          // the host half keeps no gravestone on disk, so the tool's own
          // summary line, still sitting in the log, is the only evidence this
          // card can still read that nine pages once existed here. A card that vanishes instead is the one thing worse
          // than a card reporting a problem: the user is left doubting the deck
          // was ever generated.
          //
          // The Retry button appears only for the one verdict a retry can
          // change. `refused` and the final verdicts get the same row without
          // it, because a button that re-sends an identical request to a door
          // that just closed is a promise the card cannot keep.
          return h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 4, padding: '2px 0 6px' } },
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: COLORS.dim } },
              h('span', { style: { color: COLORS.text, fontWeight: 600 } }, 'deck'),
              settled ? h(VerdictBadge, { verdict: verdict }) : null,
              pageCount !== null ? h('span', null, pageCount + ' pages') : null,
              isRetryable(verdict)
                ? h(
                    'button',
                    {
                      onClick: function () {
                        commit({ attempt: deck.attempt + 1 }, { lane: 'deck', ticket: nextTicket() })
                      },
                      title: hintFor(verdict),
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
                    'Retry',
                  )
                : null,
            ),
            h(VerdictNote, { verdict: verdict }),
          )
        }

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
            // The deck is on screen and the route has already said it cannot
            // serve it any more. Both halves are true, and the thumbnails are
            // the half worth keeping — they are the deck, not a picture of a
            // button. What goes is the promise that clicking them leads
            // anywhere.
            settled ? h(VerdictBadge, { verdict: verdict }) : null,
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
            // No viewer without an id, and none for an id the route has
            // already disowned: the full-size view is a route keyed by it. A
            // button that opened an empty frame would be worse than an absent
            // one, and the thumbnails below go inert for the same reason.
            previewId && !settled
              ? h(
                  'button',
                  {
                    onClick: function () { openViewer(1) },
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
                  verdict: verdict,
                  status: deck.download,
                  onStatus: function (next, order) { commit({ download: next }, order) },
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
                  // Opens the viewer on this page. Clicking page 3 and
                  // landing on page 1 is the kind of small lie that makes a
                  // strip feel decorative.
                  onClick:
                    previewId && !settled
                      ? function () { openViewer(pageNumberOf(page, i)) }
                      : undefined,
                }),
              )
            }),
          ),
          settled ? h(VerdictNote, { verdict: verdict }) : null,
          // No id comparison here, and none needed: `deck` is this preview's own
          // entry or the unasked state, so a viewer left open on another deck
          // is not something this can read.
          deck.viewerOpen && previewId && !settled
            ? h(Modal, {
                src: previewHtmlUrl(previewId, deck.viewerPage),
                previewId: previewId,
                name: bundle.title,
                draft: bundle.draft,
                downloadStatus: deck.download,
                onDownloadStatus: function (next, order) { commit({ download: next }, order) },
                onClose: function () {
                  commit({ viewerOpen: false, viewerPage: 1 }, { lane: 'deck', ticket: nextTicket() })
                },
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
      pageCountOf: pageCountOf,
      verdictOf: verdictOf,
      isRetryable: isRetryable,
      isFinal: isFinal,
      isZip: isZip,
      ROUTE_HEADER: ROUTE_HEADER,
      MISSING_HINT: MISSING_HINT,
      UNREACHABLE_HINT: UNREACHABLE_HINT,
      REFUSED_HINT: REFUSED_HINT,
      DAMAGED_HINT: DAMAGED_HINT,
      namespaceIds: namespaceIds,
      viewablePages: viewablePages,
      stripPages: stripPages,
      hasMarkup: hasMarkup,
      pageNumberOf: pageNumberOf,
      previewHtmlUrl: previewHtmlUrl,
      previewBundleUrl: previewBundleUrl,
      STRIP_PAGES: STRIP_PAGES,
      TOOL_NAME: TOOL_NAME,
    }
    return module.exports
  },
})
