// @vitest-environment jsdom
//
// The DSH preview card, mounted for real.
//
// `dsh/client.js` is a hand-written lazy-CJS bundle: the shell puts
// `window.__ModuleLoader__` up, the file registers a factory, and the factory
// gets `require` at materialization time. This suite reproduces that handshake
// with the real `react`, pulls the card component out through a fake `slots`
// service, and drives it the way a person would — clicks, arrow keys, export.
//
// The sibling suite in this repo only ever called the exported pure helpers,
// which meant deleting the placeholder branch or re-filtering the pages left
// every test green. Everything below is written so that breaking the behaviour
// it names turns it red.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react"
import * as React from "react"

interface Page {
  id?: string
  page?: number
  type?: string
  svg: string | null
  findings?: unknown[]
}

interface Bundle {
  title?: string
  slide?: { width: number; height: number }
  pages: Page[]
  draft?: boolean
}

type CardProps = { block: unknown }
type Card = React.ComponentType<CardProps>

let makeCard: () => Card

beforeAll(async () => {
  let captured: { factory: (require: (id: string) => unknown) => unknown } | null = null
  ;(window as unknown as { __ModuleLoader__: unknown }).__ModuleLoader__ = {
    load(mod: { factory: (require: (id: string) => unknown) => unknown }) {
      captured = mod
    },
  }
  // @ts-expect-error the plugin's browser half is untyped plain JS on purpose
  await import("../dsh/client.js")
  const mod = captured as unknown as { factory: (require: (id: string) => unknown) => unknown } | null
  if (!mod) throw new Error("dsh/client.js never registered a module")

  // The module body only evaluates once; the factory may run per test.
  makeCard = () => {
    const exportsObj = mod.factory((id: string) => {
      if (id === "react") return React
      throw new Error("unexpected require: " + id)
    }) as { apply: (ctx: unknown) => void; inject: string[] }

    let found: Card | null = null
    exportsObj.apply({
      slots: {
        inject(_name: string, run: () => Generator<unknown>) {
          for (const _ of run()) {
            /* drain: the registration happens inside */
          }
        },
        register(descriptor: { name: string; key: string }, component: Card) {
          expect(descriptor.name).toBe("tool.call.toolview")
          expect(descriptor.key).toBe("pptfast_preview")
          found = component
          return () => {}
        },
      },
    })
    if (!found) throw new Error("the plugin registered no card")
    return found
  }
})

/** A page whose markup made it into the bundle — one the strip can draw. */
function page(n: number, type = "content"): Page {
  return {
    id: "p" + n,
    page: n,
    type,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" id="root${n}"><rect id="r${n}"/></svg>`,
  }
}

/**
 * A page past the end of the strip: metadata only, no markup. The host half
 * inlines the first `THUMBNAIL_STRIP_PAGES` pages and sends the rest like
 * this, since the viewer that shows them is a whole html page of its own.
 */
function beyondStrip(n: number, type = "content"): Page {
  return { id: "p" + n, page: n, type, svg: null }
}

function bundleOf(pages: Page[], title = "Quarterly deck"): Bundle {
  return { title, slide: { width: 1280, height: 720 }, pages }
}

/**
 * A tool-call block carrying the structured payload (native mode).
 *
 * `pages` puts the host half's own summary phrasing in the result text. That
 * sentence is the only thing left about the deck once the rendered files are
 * gone, so a card with no bundle reads its page count back out of it.
 */
function blockWith(bundle: Bundle | null, previewId: string | null, facts: { pages?: number } = {}) {
  const summary = `deck ready${facts.pages === undefined ? "" : `\nrendered ${facts.pages} pages to /tmp/out`}`
  return {
    content: previewId ? [{ text: `${summary}\npptfast-preview:${previewId}\n` }] : [{ text: summary }],
    meta: bundle ? { card: "pptfast-preview", bundle } : undefined,
  }
}

/**
 * The plugin's host half, for the one thing this suite cannot fake: the exact
 * sentence the card parses a dead deck's page count out of.
 */
async function loadHostHalf(): Promise<{ modelSummary: (value: unknown) => string }> {
  // @ts-expect-error untyped on purpose, same as its own suite imports it
  const mod = await import("../dsh/preview-tool.js")
  return mod.__testing
}

/** The thumbnails: Frame renders a clickable div with an explicit role. */
function thumbnails(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[role="button"]'))
}

/** The viewer, when it is open: one iframe holding the deck's own preview.html. */
function viewer(container: HTMLElement) {
  return container.querySelector("iframe")
}

let fetchMock: ReturnType<typeof vi.fn>
let anchorClicks: { href: string; download: string }[]

beforeEach(() => {
  anchorClicks = []
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    anchorClicks.push({ href: this.href, download: this.download })
  })
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:deck"),
  })
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() })
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("dsh preview card — the thumbnail strip", () => {
  it("draws only the pages that arrived with markup, and still counts the rest", () => {
    const Card = makeCard()
    const pages = [page(1, "cover"), page(2), beyondStrip(3)]
    const { container } = render(<Card block={blockWith(bundleOf(pages), "abc")} />)

    // Two frames for three pages. Drawing the third would put an empty box in
    // the strip, which reads as a broken slide rather than as the end of a
    // teaser.
    expect(thumbnails(container)).toHaveLength(2)
    expect(container.querySelectorAll("svg")).toHaveLength(2)
    // The deck's real length is what the header reports, not the strip's.
    expect(screen.getByText("3 pages")).toBeInTheDocument()
    // And nothing on screen calls a page too big to show: the viewer has
    // every page, so a page without a thumbnail is not a page anybody lost.
    expect(screen.queryByText(/too large/i)).toBeNull()
  })

  it("stops the strip at twelve however much markup it is handed", () => {
    // The strip is a fixed-length teaser. Every page here carries markup —
    // a host half more generous than this one, or one whose cap has been
    // raised and this one's has not — and the strip still stops where it
    // says it stops, rather than growing into a scrollbar with the deck.
    const Card = makeCard()
    const pages = Array.from({ length: 20 }, (_x, i) => page(i + 1))
    const { container } = render(<Card block={blockWith(bundleOf(pages), "abc")} />)

    expect(thumbnails(container)).toHaveLength(12)
    expect(screen.getByText("20 pages")).toBeInTheDocument()
  })

  it("titles each thumbnail with the deck's own numbering", () => {
    const Card = makeCard()
    const pages = [page(1, "cover"), page(2), page(3, "ending")]
    const { container } = render(<Card block={blockWith(bundleOf(pages), "abc")} />)

    expect(thumbnails(container).map((el) => el.getAttribute("title"))).toEqual([
      "cover 1",
      "content 2",
      "ending 3",
    ])
  })

  it("namespaces every id it mounts, so two slides in one DOM cannot cross-wire", () => {
    // Each slide is a standalone document whose ids only have to be unique
    // inside itself; several of them in one page share an id space, so a
    // `url(#glow)` on slide 3 would resolve against slide 1's definition of
    // it. Writing `props.svg` straight into `innerHTML` looks identical in a
    // test that only counts <svg> elements — this one reads the ids.
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf([page(1), page(2)]), "abc")} />)

    const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id)
    expect(ids).toEqual(["pft0-root1", "pft0-r1", "pft1-root2", "pft1-r2"])
    // The raw ids must be gone, not merely joined by prefixed copies.
    expect(container.querySelector("#root1")).toBeNull()
    expect(container.querySelector("#r2")).toBeNull()
  })

  it("renders nothing at all when the block carries no recognisable payload", () => {
    const Card = makeCard()
    const { container } = render(<Card block={{ content: [{ text: "no preview here" }] }} />)
    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("survives a block with no content and no meta", () => {
    const Card = makeCard()
    expect(() => render(<Card block={{}} />)).not.toThrow()
    expect(() => render(<Card block={null} />)).not.toThrow()
  })
})

describe("dsh preview card — the viewer", () => {
  const nine = () => [
    page(1, "cover"),
    page(2),
    page(3),
    page(4),
    page(5),
    page(6),
    page(7),
    page(8),
    page(9, "ending"),
  ]

  /**
   * The bundle route answering that the deck is still there.
   *
   * Every way into the viewer asks first (see `openViewer` in client.js), so
   * a test that clicks "Open" without this is testing a card whose id the
   * harness has just disowned.
   */
  function routeIsAlive(bundle: Bundle = bundleOf(nine())) {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/pptx")
        ? { ok: true, status: 200, blob: async () => new Blob(["deck"]) }
        : { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(bundle)) },
    )
  }

  /**
   * Open the viewer and wait until it is actually usable.
   *
   * The frame appearing is not enough. Opening is asynchronous now — the card
   * asks the route whether the id is still live before it renders anything —
   * and `waitFor` can return on the render that mounts the frame, one turn
   * before React runs the modal's effect. That effect is what registers the
   * Escape listener, so a test that pressed Escape on the strength of the
   * frame alone was pressing it into a document nobody was listening to.
   */
  async function openViewer(id = "abc") {
    routeIsAlive()
    const Card = makeCard()
    const view = render(<Card block={blockWith(bundleOf(nine()), id)} />)
    fireEvent.click(screen.getByText("Open"))
    await waitFor(() => expect(viewer(view.container)).not.toBeNull())
    await act(async () => {})
    return view
  }

  it("checks the id is still live before opening, instead of walking into a wall", async () => {
    // The failure this exists for: a browser tab left open across a harness
    // restart. The card is drawing a bundle it fetched minutes ago, the
    // record behind the id is gone, and the viewer's iframe navigates to a
    // route that answers 404 — which the browser renders as a document. The
    // deck stays on screen, because those thumbnails are real; what goes is
    // the promise that clicking them leads anywhere.
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => null })
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf(nine()), "abc")} />)

    fireEvent.click(screen.getByText("Open"))

    expect(await screen.findByText("expired")).toBeInTheDocument()
    expect(viewer(container)).toBeNull()
    // The strip survives: it is the deck, and it is already in the browser.
    expect(container.querySelectorAll("svg")).toHaveLength(9)
    // ...and no way back in is left lying around: no Open button, and the
    // thumbnails give up their button role rather than sit there looking
    // clickable.
    expect(screen.queryByText("Open")).toBeNull()
    expect(thumbnails(container)).toHaveLength(0)
    fireEvent.click(container.querySelectorAll("svg")[0]!)
    expect(viewer(container)).toBeNull()
  })

  it("loads the deck's own preview.html instead of paging slides itself", async () => {
    // The whole point of the change. That page already has a filmstrip,
    // ←/→, a light/dark surround and an audit panel, was written once and is
    // what every harness without a plugin UI is told to open. The card used
    // to run a thinner copy of it beside the original.
    const { container } = await openViewer("abc123")

    expect(viewer(container)).toHaveAttribute("src", "/pptfast/preview/abc123/html")
    // None of the second implementation is left: no counter, no arrows...
    expect(screen.queryByText(/^\d+ \/ \d+/)).toBeNull()
    expect(screen.queryByText("←")).toBeNull()
    expect(screen.queryByText("→")).toBeNull()
    // ...and no second copy of any slide mounted next to the strip's nine.
    expect(container.querySelectorAll("svg")).toHaveLength(9)
  })

  it("opens the same viewer from any thumbnail", async () => {
    // Thumbnails used to carry a start page into a React slideshow. The html
    // opens on page one whichever thumbnail was clicked, and that is the
    // whole of the behaviour now.
    routeIsAlive()
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf(nine()), "abc")} />)
    fireEvent.click(thumbnails(container)[4]!)
    await waitFor(() => expect(viewer(container)).not.toBeNull())
    expect(viewer(container)).toHaveAttribute("src", "/pptfast/preview/abc/html")
  })

  it("opens from the keyboard on the thumbnail that has focus", async () => {
    // A thumbnail is a div with `role="button"` and `tabIndex`, which promises
    // the keyboard behaviour a real <button> would have given for free.
    for (const key of ["Enter", " "]) {
      routeIsAlive()
      const Card = makeCard()
      const { container, unmount } = render(<Card block={blockWith(bundleOf(nine()), "abc")} />)
      const thumb = thumbnails(container)[2]!
      expect(thumb).toHaveAttribute("tabIndex", "0")

      fireEvent.keyDown(thumb, { key })
      await waitFor(() => expect(viewer(container), key).not.toBeNull())
      unmount()
      cleanup()
    }
  })

  it("ignores the keys that are not an activation", () => {
    routeIsAlive()
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf(nine()), "abc")} />)
    fireEvent.keyDown(thumbnails(container)[2]!, { key: "a" })
    fireEvent.keyDown(thumbnails(container)[2]!, { key: "Tab" })
    expect(viewer(container)).toBeNull()
  })

  it("closes on Escape", async () => {
    const { container } = await openViewer()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(viewer(container)).toBeNull()
  })

  it("closes on Escape pressed inside the frame, where the deck actually has focus", async () => {
    // The keystroke a reader really makes: they click the deck first, so the
    // keydown lands on the frame's own document and never reaches this one.
    // Listen on the outer document alone and Escape stops working the moment
    // the viewer is touched, which is the only moment it is wanted.
    const { container } = await openViewer()
    const frame = viewer(container)!
    fireEvent.load(frame)
    const inner = frame.contentDocument!
    expect(inner).toBeTruthy()

    fireEvent.keyDown(inner, { key: "Escape" })
    expect(viewer(container)).toBeNull()
  })

  it("closes on the Close button", async () => {
    const { container } = await openViewer()
    fireEvent.click(screen.getByText("Close"))
    expect(viewer(container)).toBeNull()
  })

  it("closes on a click on the backdrop, but never on one on the deck", async () => {
    const { container } = await openViewer()
    const backdrop = container.querySelector('[style*="position: fixed"]') as HTMLElement
    expect(backdrop).toBeTruthy()

    // A click that started on the frame bubbles to the same element and must
    // not be mistaken for one on the backdrop — that would dismiss the viewer
    // every time somebody clicked the deck they came to read.
    fireEvent.click(viewer(container)!)
    expect(viewer(container)).not.toBeNull()

    fireEvent.click(backdrop)
    expect(viewer(container)).toBeNull()
  })

  it("closes on a click on any dark surface, including the button row's own", async () => {
    // Every black area in the viewer dismisses it — except, before this,
    // the band the buttons sit in, which looks exactly like the rest of the
    // backdrop and is nearly a thousand pixels wide.
    const { container } = await openViewer()
    const row = screen.getByText("Close").parentElement as HTMLElement
    expect(row).toBeTruthy()

    fireEvent.click(row)
    expect(viewer(container)).toBeNull()
  })

  it("gives the viewer's buttons a hover state, which inline styles cannot", async () => {
    // A solid white button that does not answer the pointer reads as broken
    // before it reads as plain, and `:hover` is unreachable from the inline
    // styles the rest of this card is built from.
    const { container } = await openViewer()
    // Waited for rather than read straight off: the sheet is appended by the
    // modal's own effect, one turn after the frame it is asserted through.
    await waitFor(() => expect(document.querySelectorAll("#pptfast-modal-style")).toHaveLength(1))
    const css = document.querySelector("#pptfast-modal-style")!.textContent ?? ""
    expect(css).toContain(".pf-mbtn:hover")
    expect(css).toContain(".pf-mbtn-primary:hover")

    const close = screen.getByText("Close")
    expect(close.className).toBe("pf-mbtn")
    // The card carries a download button too, so reach the viewer's through
    // the row it shares with Close rather than by its label.
    const row = close.parentElement as HTMLElement
    const download = row.querySelector(".pf-mbtn-primary") as HTMLElement
    expect(download?.textContent).toBe("Download .pptx")

    // The part a passing className does not prove, and the reason the first
    // version of this shipped broken: an element's own `style` attribute
    // outranks any sheet, so a `background` or `border` left inline wins
    // every hover. The transition still runs, so it looks wired up while the
    // colour never moves. Both buttons must take their whole appearance from
    // the sheet, or the rules above are decoration.
    for (const btn of [close, download]) {
      expect(btn.style.background).toBe("")
      expect(btn.style.backgroundColor).toBe("")
      expect(btn.style.border).toBe("")
      expect(btn.style.borderColor).toBe("")
    }
    expect(css).toContain("background:#fff")
    expect(css).toContain("background:transparent")

    // Opening a second viewer must not stack a second copy in the head.
    fireEvent.keyDown(document, { key: "Escape" })
    expect(viewer(container)).toBeNull()
    fireEvent.click(screen.getByText("Open"))
    await waitFor(() => expect(viewer(container)).not.toBeNull())
    await act(async () => {})
    expect(document.querySelectorAll("#pptfast-modal-style")).toHaveLength(1)
  })

  it("stays closed once it is closed", async () => {
    const { container } = await openViewer()
    fireEvent.keyDown(document, { key: "Escape" })
    // Keys that land after the viewer is gone belong to the page, not to it.
    expect(() => fireEvent.keyDown(document, { key: "Escape" })).not.toThrow()
    expect(viewer(container)).toBeNull()
  })

  it("keeps the download inside the viewer, since the html cannot offer it", async () => {
    // The one card ability the page has no way to reach: it is a static file
    // on a route of its own, with no idea an export exists.
    await openViewer("abc123")

    const buttons = screen.getAllByText("Download .pptx")
    expect(buttons).toHaveLength(2) // one on the card, one in the viewer
    fireEvent.click(buttons[1]!)

    await waitFor(() => expect(anchorClicks).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/abc123/pptx")
  })

  it("offers no viewer at all without a preview id, rather than an empty frame", () => {
    // The viewer is a route keyed by that id. A button that opened a 404
    // would be worse than no button.
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf([page(1)]), null)} />)

    expect(screen.queryByText("Open")).toBeNull()
    expect(thumbnails(container)).toHaveLength(0)
    expect(viewer(container)).toBeNull()
    // The deck is still on screen: drawing the strip needs no id.
    expect(container.querySelectorAll("svg")).toHaveLength(1)
  })
})

describe("dsh preview card — the export button", () => {
  it("fetches the pptx route and hands the browser a real .pptx", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(["deck"]) })
    const Card = makeCard()
    render(<Card block={blockWith(bundleOf([page(1)]), "abc123")} />)

    fireEvent.click(screen.getByText("Download .pptx"))

    await waitFor(() => expect(anchorClicks).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/abc123/pptx")
    expect(anchorClicks[0]!.download).toBe("Quarterly deck.pptx")
    expect(anchorClicks[0]!.href).toContain("blob:deck")
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it("says the preview expired instead of saving the error body as a file", async () => {
    // The real incident: a bare <a download> on an expired id saved the 404
    // JSON and called it `pptx.json`.
    fetchMock.mockResolvedValue({ ok: false, status: 404, blob: async () => new Blob(['{"error":"gone"}']) })
    const Card = makeCard()
    render(<Card block={blockWith(bundleOf([page(1)]), "expired")} />)

    fireEvent.click(screen.getByText("Download .pptx"))

    expect(await screen.findByText("Expired")).toBeInTheDocument()
    expect(anchorClicks).toEqual([])
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it("reports a network failure the same way", async () => {
    fetchMock.mockRejectedValue(new Error("offline"))
    const Card = makeCard()
    render(<Card block={blockWith(bundleOf([page(1)]), "abc")} />)

    fireEvent.click(screen.getByText("Download .pptx"))

    expect(await screen.findByText("Expired")).toBeInTheDocument()
    expect(anchorClicks).toEqual([])
  })

  it("is absent when the result carries no preview id", () => {
    const Card = makeCard()
    render(<Card block={blockWith(bundleOf([page(1)]), null)} />)
    expect(screen.queryByText("Download .pptx")).toBeNull()
  })

  it("says Expired before the click, once the card already knows", async () => {
    // Offering `Download .pptx` for a deck the card has just been told is
    // gone is an invitation to a failure it can already predict. The label is
    // the same word the button reaches on its own after a failed click, so
    // the two ways of learning it do not read as two different states.
    fetchMock.mockResolvedValue({ ok: false, status: 410, json: async () => null })
    const Card = makeCard()
    render(<Card block={blockWith(bundleOf([page(1)]), "abc")} />)

    fireEvent.click(screen.getByText("Open"))

    expect(await screen.findByText("Expired")).toBeInTheDocument()
    expect(screen.queryByText("Download .pptx")).toBeNull()
    // And clicking it starts nothing: the route already gave its answer.
    const calls = fetchMock.mock.calls.length
    fireEvent.click(screen.getByText("Expired"))
    expect(fetchMock.mock.calls).toHaveLength(calls)
  })
})

describe("dsh preview card — fetching by id (Code Mode)", () => {
  function respondWith(bundles: Record<string, Bundle>) {
    fetchMock.mockImplementation(async (url: string) => {
      const id = /\/pptfast\/preview\/([^/]+)$/.exec(url)?.[1]
      const found = id ? bundles[id] : undefined
      if (!found) return { ok: false, status: 404, json: async () => null }
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(found)) }
    })
  }

  it("pulls the bundle from the plugin route when the block has no structured payload", async () => {
    respondWith({ A: bundleOf([page(1), beyondStrip(2)], "Deck A") })
    const Card = makeCard()
    render(<Card block={blockWith(null, "A")} />)

    expect(await screen.findByText("Deck A")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/A")
    expect(screen.getByText("2 pages")).toBeInTheDocument()
  })

  it("re-fetches and stops showing the old deck when the same instance moves to another preview", async () => {
    respondWith({ A: bundleOf([page(1)], "Deck A"), B: bundleOf([page(1), page(2)], "Deck B") })
    const Card = makeCard()
    const { rerender } = render(<Card block={blockWith(null, "A")} />)
    expect(await screen.findByText("Deck A")).toBeInTheDocument()

    rerender(<Card block={blockWith(null, "B")} />)

    // Caching on "have I fetched anything yet" left the card pinned to A.
    expect(await screen.findByText("Deck B")).toBeInTheDocument()
    expect(screen.queryByText("Deck A")).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/B")
  })

  it("says the preview expired when the route 404s, instead of vanishing", async () => {
    // The reported failure, in one test. A transcript reopened after the
    // harness has forgotten the id used to render exactly nothing: no strip,
    // no buttons, no line of text — the tool call looked like it had never
    // produced anything. Under Code Mode the bundle is not in the session log
    // and cannot be recovered, so the honest answer is not a deck: it is the
    // fact that there was one, how long it was, and why it will not open.
    respondWith({})
    const Card = makeCard()
    render(<Card block={blockWith(null, "missing", { pages: 9 })} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/missing"))
    expect(await screen.findByText("expired")).toBeInTheDocument()
    expect(screen.getByText("9 pages")).toBeInTheDocument()
    expect(screen.getByText(/no longer on disk/)).toBeInTheDocument()
    // Nothing that promises a deck it cannot show.
    expect(screen.queryByText("Open")).toBeNull()
  })

  it("reads the page count out of the summary the host half actually writes", async () => {
    // The degraded card's one fact comes from prose, so the prose is pinned:
    // this is `modelSummary`'s real output, not a hand-written lookalike, and
    // rewording it in preview-tool.js turns this red.
    const summary = (await loadHostHalf()).modelSummary({
      previewId: "S1",
      pageCount: 9,
      outDir: "/tmp/out",
      findingCount: 0,
      audited: true,
    })

    respondWith({})
    const Card = makeCard()
    render(<Card block={{ content: [{ text: summary }] }} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/S1"))
    expect(await screen.findByText("9 pages")).toBeInTheDocument()
  })

  it("does not carry one deck's expiry over to the next one it renders", async () => {
    // The same React instance is reused as the block it renders changes. A
    // verdict remembered without the id it was about would expire a live deck
    // on the strength of a dead one that happened to render here first — and
    // it shows in the gap, so the gap is what this test holds open: B's
    // answer is withheld until after the assertions that matter.
    let answerB = (_value: unknown) => {}
    const pendingB = new Promise((resolve) => {
      answerB = resolve
    })
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/B") ? pendingB : { ok: false, status: 404, json: async () => null },
    )
    const Card = makeCard()
    const { container, rerender } = render(<Card block={blockWith(null, "A", { pages: 4 })} />)
    expect(await screen.findByText("expired")).toBeInTheDocument()

    rerender(<Card block={blockWith(null, "B", { pages: 2 })} />)

    // B has been asked and has not answered. Until it does, this card knows
    // nothing about B — least of all that it has expired.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/B"))
    expect(screen.queryByText("expired")).toBeNull()
    expect(container).toBeEmptyDOMElement()

    answerB({ ok: true, status: 200, json: async () => bundleOf([page(1), page(2)], "Deck B") })

    expect(await screen.findByText("Deck B")).toBeInTheDocument()
    expect(screen.queryByText("expired")).toBeNull()
    expect(screen.getByText("Open")).toBeInTheDocument()
  })

  it("still admits the deck existed when the summary carried no page count", async () => {
    // A result text this card cannot mine for a page count is no reason to
    // pretend the call never happened — the id in it is proof enough.
    respondWith({})
    const Card = makeCard()
    render(<Card block={blockWith(null, "missing")} />)

    expect(await screen.findByText("expired")).toBeInTheDocument()
    expect(screen.queryByText(/\d+ pages/)).toBeNull()
  })

  it("keeps a 410 apart from a harness it could not reach at all", async () => {
    // A 410 is the route answering: the deck is gone. A rejected fetch is no
    // answer at all — the harness may simply not be up yet — and reporting
    // that as an expired preview would leave a wrong verdict on screen long
    // after its cause passed.
    fetchMock.mockResolvedValue({ ok: false, status: 410, json: async () => null })
    const Card = makeCard()
    render(<Card block={blockWith(null, "A", { pages: 3 })} />)
    expect(await screen.findByText("expired")).toBeInTheDocument()
  })

  it("falls back to the generic row when the fetch itself fails", async () => {
    // A rejected promise, not a non-ok response: the harness restarting
    // mid-render, or the route not registered at all. Without its own catch
    // this is an unhandled rejection inside an effect, and the export
    // button's catch is a different function that never sees it.
    // Listened for on `process`, not on `window`: the promise is a native one
    // created by this file, so jsdom's own event never fires for it and a
    // window listener would sit there proving nothing. Remove the `.catch` in
    // the effect and this goes red.
    const rejections: unknown[] = []
    const onRejection = (reason: unknown) => rejections.push(reason)
    process.on("unhandledRejection", onRejection)
    try {
      fetchMock.mockRejectedValue(new Error("connection refused"))
      const Card = makeCard()
      const { container } = render(<Card block={blockWith(null, "A")} />)

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/A"))
      // Two turns: `unhandledRejection` is only decided once the microtask
      // queue has drained and nobody has attached a handler.
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      expect(rejections).toEqual([])
      expect(container).toBeEmptyDOMElement()
    } finally {
      process.off("unhandledRejection", onRejection)
    }
  })

  it("does not keep asking after a failure it cannot recover from", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"))
    const Card = makeCard()
    const { rerender } = render(<Card block={blockWith(null, "A")} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    rerender(<Card block={blockWith(null, "A")} />)
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("dsh preview card — a deck with unfilled pages", () => {
  function draftBundle(): Bundle {
    return { ...bundleOf([page(1), page(2)]), draft: true }
  }

  it("says so on the card, because the export goes out anyway", () => {
    // The host half renders these with `--draft` rather than letting the
    // download button fail forever (see preview-tool.js's `execute`). That
    // trade only holds while the card admits the deck is unfinished.
    const Card = makeCard()
    render(<Card block={blockWith(draftBundle(), "abc")} />)
    expect(screen.getByText("draft")).toBeInTheDocument()
  })

  it("keeps quiet about drafts on a finished deck", () => {
    const Card = makeCard()
    render(<Card block={blockWith(bundleOf([page(1)]), "abc")} />)
    expect(screen.queryByText("draft")).toBeNull()
  })

  it("saves the file under a name that says draft too", async () => {
    // The card is a conversation the file will outlive: it gets mailed and
    // opened by people who never saw the badge.
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(["deck"]) })
    const Card = makeCard()
    render(<Card block={blockWith(draftBundle(), "abc123")} />)

    fireEvent.click(screen.getByText("Download .pptx"))

    await waitFor(() => expect(anchorClicks).toHaveLength(1))
    expect(anchorClicks[0]!.download).toBe("Quarterly deck-draft.pptx")
  })
})
