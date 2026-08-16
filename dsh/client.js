// Browser half of the pptfast dsh plugin: the deck preview card.
//
// The host half (`./preview-tool.js`) registers `pptfast_preview` and puts
// the rendered bundle on `output.presentationMeta` — a channel persisted with
// the session log and never shown to the model. This file is what turns that
// payload into something a person can look at: a thumbnail strip in the tool
// card, and a full-size modal on click. No new tab, no localhost URL, no
// "open this link yourself", which is the whole reason the tool exists.
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
window.__ModuleLoader__.load({
  id: '@liustack/pptfast',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var TOOL_NAME = 'pptfast_preview'

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

    /** Pages that actually carry markup — an oversized deck ships some without. */
    function drawablePages(bundle) {
      return bundle.pages.filter(function (p) {
        return typeof p.svg === 'string' && p.svg.length > 0
      })
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

      function Frame(props) {
        return h(
          'div',
          {
            style: {
              position: 'relative',
              aspectRatio: (props.width || 1280) + ' / ' + (props.height || 720),
              background: COLORS.stage,
              borderRadius: props.radius || 6,
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

      /** Full-size viewer. Arrow keys page, Escape closes — same as the CLI's own preview. */
      function Modal(props) {
        var pages = props.pages
        var state = useState(props.start || 0)
        var index = Math.min(Math.max(state[0], 0), pages.length - 1)
        var setIndex = state[1]

        useEffect(
          function () {
            function onKey(e) {
              if (e.key === 'Escape') props.onClose()
              else if (e.key === 'ArrowRight') setIndex(function (i) { return Math.min(i + 1, pages.length - 1) })
              else if (e.key === 'ArrowLeft') setIndex(function (i) { return Math.max(i - 1, 0) })
            }
            document.addEventListener('keydown', onKey)
            return function () {
              document.removeEventListener('keydown', onKey)
            }
          },
          [pages.length, props.onClose],
        )

        var page = pages[index]
        return h(
          'div',
          {
            style: {
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 24,
            },
            onClick: function (e) {
              if (e.target === e.currentTarget) props.onClose()
            },
          },
          h(
            'div',
            { style: { width: 'min(100%, calc((100vh - 160px) * 16 / 9))', maxWidth: '100%' } },
            h(Frame, {
              page: page,
              prefix: 'pfm' + index + '-',
              width: props.slide && props.slide.width,
              height: props.slide && props.slide.height,
              radius: 4,
            }),
          ),
          h(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                color: '#fff',
                fontSize: 13,
                fontVariantNumeric: 'tabular-nums',
              },
            },
            h(
              'button',
              {
                onClick: function () { setIndex(Math.max(index - 1, 0)) },
                disabled: index === 0,
                style: modalBtn(index === 0),
              },
              '←',
            ),
            h('span', null, index + 1 + ' / ' + pages.length + (page.type ? ' · ' + page.type : '')),
            h(
              'button',
              {
                onClick: function () { setIndex(Math.min(index + 1, pages.length - 1)) },
                disabled: index === pages.length - 1,
                style: modalBtn(index === pages.length - 1),
              },
              '→',
            ),
            h('button', { onClick: props.onClose, style: modalBtn(false) }, 'Close'),
          ),
        )
      }

      function modalBtn(disabled) {
        return {
          font: 'inherit',
          fontSize: 13,
          padding: '4px 12px',
          borderRadius: 7,
          border: '1px solid rgba(255,255,255,0.35)',
          background: 'transparent',
          color: '#fff',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.4 : 1,
        }
      }

      /** The card itself: a strip of thumbnails, and a button that opens the viewer. */
      return function PptfastPreviewCard(props) {
        var bundle = bundleOf(props.block)
        var open = useState(false)
        var start = useState(0)
        if (!bundle) return null

        var pages = drawablePages(bundle)
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
            h('span', null, bundle.pages.length + ' pages'),
            findingCount > 0 ? h('span', null, findingCount + ' audit findings') : null,
            bundle.markupTruncated ? h('span', null, 'preview shortened') : null,
            h(
              'button',
              {
                onClick: function () {
                  start[1](0)
                  open[1](true)
                },
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
              '预览',
            ),
          ),
          h(
            'div',
            { style: { display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 } },
            pages.slice(0, 12).map(function (page, i) {
              return h(
                'div',
                { key: page.id || i, style: { flex: '0 0 auto', width: 132 } },
                h(Frame, {
                  page: page,
                  prefix: 'pft' + i + '-',
                  width: slide.width,
                  height: slide.height,
                  title: (page.type || 'page') + ' ' + (page.page || i + 1),
                  onClick: function () {
                    start[1](i)
                    open[1](true)
                  },
                }),
              )
            }),
          ),
          open[0]
            ? h(Modal, {
                pages: pages,
                slide: slide,
                start: start[0],
                onClose: function () { open[1](false) },
              })
            : null,
        )
      }
    }

    function registerCard(ctx) {
      if (!ctx.slots || typeof ctx.slots.inject !== 'function') return
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
    // `slots` is optional (registerCard checks), so it is not injected here.
    exports.inject = []
    // Exposed for this repo's tests only; not part of the plugin contract.
    exports.__testing = { bundleOf: bundleOf, namespaceIds: namespaceIds, drawablePages: drawablePages, TOOL_NAME: TOOL_NAME }
    return module.exports
  },
})
