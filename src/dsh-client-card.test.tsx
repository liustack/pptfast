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
import type { Node as TsNode } from "typescript"
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
let makeTesting: () => { isZip: (blob: Blob) => Promise<boolean> }

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

  makeTesting = () =>
    (
      mod.factory((id: string) => (id === "react" ? React : {})) as {
        __testing: { isZip: (blob: Blob) => Promise<boolean> }
      }
    ).__testing

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

/**
 * The browser half's own exported helpers, for the checks a rendered card
 * cannot show — the export's byte sniffing has no visible surface of its own.
 */
function clientTesting(): { isZip: (blob: Blob) => Promise<boolean> } {
  return makeTesting()
}

/**
 * A response shaped the way the plugin's own route writes one.
 *
 * Every answer the host half sends carries `x-pptfast-preview: 1`, and the card
 * refuses to read a verdict off a response without it — a bare 404 could have
 * come from a proxy, or from a shell that never loaded this plugin at all.
 * Building the mocks through here is what keeps this suite testing the card's
 * real contract rather than a looser one that would also accept a stranger's
 * 404 as proof a deck is gone.
 */
function routeAnswer(init: {
  status: number
  json?: unknown
  blob?: Blob
  stamped?: boolean
  code?: string
}) {
  const stamped = init.stamped !== false
  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    headers: {
      get: (name: string) => (stamped && name.toLowerCase() === "x-pptfast-preview" ? "1" : null),
    },
    // Failures carry a machine-readable code beside the sentence, which is how
    // the card tells a deleted preview from a damaged one — both are 410, so
    // the status cannot say it and the prose must not have to.
    json: async () => init.json ?? (init.code ? { code: init.code, error: "…" } : null),
    blob: async () => init.blob ?? pptxBytes(),
  }
}

/**
 * Bytes that begin like a zip, which is what a .pptx is.
 *
 * The export button checks this before saving, so a mock that returns an
 * arbitrary blob would be testing the failure path by accident.
 */
function pptxBytes(): Blob {
  return new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00])])
}

/** A 200 whose body is not a deck at all — the `pptx.json` incident, reproduced. */
function notADeck(): Blob {
  return new Blob(["<!doctype html><title>Sign in</title>"])
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
        ? routeAnswer({ status: 200 })
        : routeAnswer({ status: 200, json: JSON.parse(JSON.stringify(bundle)) }),
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
    fireEvent.click(await screen.findByText("Open"))
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
    fetchMock.mockResolvedValue(routeAnswer({ status: 404 }))
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf(nine()), "abc")} />)

    fireEvent.click(await screen.findByText("Open"))

    expect(await screen.findByText("gone")).toBeInTheDocument()
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

  it("opens the viewer on the thumbnail that was clicked", async () => {
    // `#page=N` is the html's own way in (`src/cli/preview-html.ts` reads it
    // off `location.hash`), and a URL is the only thing this card can hand a
    // document. Clicking page five and landing on page one is the kind of
    // small lie that makes a strip feel decorative.
    routeIsAlive()
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf(nine()), "abc")} />)
    fireEvent.click(thumbnails(container)[4]!)
    await waitFor(() => expect(viewer(container)).not.toBeNull())
    expect(viewer(container)).toHaveAttribute("src", "/pptfast/preview/abc/html#page=5")
  })

  it("opens on page one from the header button, with no hash to undo", async () => {
    routeIsAlive()
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf(nine()), "abc")} />)
    fireEvent.click(await screen.findByText("Open"))
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
    fireEvent.click(await screen.findByText("Open"))
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

    const buttons = await screen.findAllByText("Download .pptx")
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
    fetchMock.mockResolvedValue(routeAnswer({ status: 200 }))
    const Card = makeCard()
    render(<Card block={blockWith(bundleOf([page(1)]), "abc123")} />)

    fireEvent.click(await screen.findByText("Download .pptx"))

    await waitFor(() => expect(anchorClicks).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/abc123/pptx")
    expect(anchorClicks[0]!.download).toBe("Quarterly deck.pptx")
    expect(anchorClicks[0]!.href).toContain("blob:deck")
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it("says the deck is gone instead of saving the error body as a file", async () => {
    // The real incident: a bare <a download> on a dead id saved the 404 JSON
    // and called it `pptx.json`.
    fetchMock.mockResolvedValue(routeAnswer({ status: 404, blob: notADeck() }))
    const Card = makeCard()
    render(<Card block={blockWith(bundleOf([page(1)]), "missing")} />)

    fireEvent.click(await screen.findByText("Download .pptx"))

    expect(await screen.findByText("Unavailable")).toBeInTheDocument()
    expect(anchorClicks).toEqual([])
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it("offers a retry after a failure that was not about the deck, rather than retiring itself", async () => {
    // The bug: every failed download latched this button to "expired", so one
    // 502 from a restarting harness — or a request that never left the tab —
    // disabled the export of a deck sitting on disk the whole time, for the
    // life of the page. Collapse `verdictOf` back to `!res.ok` and this goes
    // red on the first assertion.
    for (const failure of [
      { name: "5xx", mock: () => fetchMock.mockResolvedValue(routeAnswer({ status: 502 })) },
      { name: "rejected fetch", mock: () => fetchMock.mockRejectedValue(new Error("offline")) },
    ]) {
      fetchMock.mockReset()
      failure.mock()
      const Card = makeCard()
      const view = render(<Card block={blockWith(bundleOf([page(1)]), "abc")} />)

      fireEvent.click(await screen.findByText("Download .pptx"))
      expect(await screen.findByText("Retry download"), failure.name).toBeInTheDocument()
      expect(anchorClicks).toEqual([])
      // Still a button, and still wired: the whole point of not calling this
      // gone is that clicking again is the obvious next move.
      const attempts = fetchMock.mock.calls.length
      fetchMock.mockResolvedValue(routeAnswer({ status: 200 }))
      fireEvent.click(screen.getByText("Retry download"))
      expect(fetchMock.mock.calls.length, failure.name).toBe(attempts + 1)
      await waitFor(() => expect(anchorClicks).toHaveLength(1))
      expect(await screen.findByText("Download .pptx"), failure.name).toBeInTheDocument()

      anchorClicks.length = 0
      view.unmount()
    }
  })

  it("refuses to save a 200 whose body is not a deck", async () => {
    // The `pptx.json` incident, in its second form. The first version saved a
    // 404 body because it never looked at the status; this checks the status
    // and would still have saved a login page, a proxy notice or an error
    // document served with 200 — the failure mode a captive portal or a
    // misrouted request produces. A .pptx is a zip, so its first four bytes are
    // the claim worth checking. Drop `isZip` and this goes red by handing the
    // user an HTML file named `Quarterly deck.pptx`.
    fetchMock.mockResolvedValue(routeAnswer({ status: 200, blob: notADeck() }))
    const Card = makeCard()
    render(<Card block={blockWith(bundleOf([page(1)]), "abc123")} />)

    fireEvent.click(await screen.findByText("Download .pptx"))

    expect(await screen.findByText("Retry download")).toBeInTheDocument()
    expect(anchorClicks).toEqual([])
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    // Not `gone` either: the route answered 200, so it has said nothing about
    // the deck being missing, and the next click is allowed to try again.
    expect(screen.queryByText("gone")).toBeNull()
  })

  it("recognises the bytes of a real export", async () => {
    // The other half, so the check above cannot pass by rejecting everything.
    const helpers = clientTesting()
    expect(await helpers.isZip(pptxBytes())).toBe(true)
    expect(await helpers.isZip(notADeck())).toBe(false)
    expect(await helpers.isZip(new Blob([new Uint8Array([0x50, 0x4b])]))).toBe(false)
    expect(await helpers.isZip(undefined as unknown as Blob)).toBe(false)
  })

  it("is absent when the result carries no preview id", () => {
    const Card = makeCard()
    render(<Card block={blockWith(bundleOf([page(1)]), null)} />)
    expect(screen.queryByText("Download .pptx")).toBeNull()
  })

  it("says Unavailable before the click, once the card already knows", async () => {
    // Offering `Download .pptx` for a deck the card has just been told is
    // gone is an invitation to a failure it can already predict. The label is
    // the same word the button reaches on its own after a failed click, so
    // the two ways of learning it do not read as two different states.
    fetchMock.mockResolvedValue(routeAnswer({ status: 410 }))
    const Card = makeCard()
    render(<Card block={blockWith(bundleOf([page(1)]), "abc")} />)

    fireEvent.click(await screen.findByText("Open"))

    expect(await screen.findByText("Unavailable")).toBeInTheDocument()
    expect(screen.queryByText("Download .pptx")).toBeNull()
    // And clicking it starts nothing: the route already gave its answer.
    const calls = fetchMock.mock.calls.length
    fireEvent.click(screen.getByText("Unavailable"))
    expect(fetchMock.mock.calls).toHaveLength(calls)
  })
})

describe("dsh preview card — fetching by id (Code Mode)", () => {
  function respondWith(bundles: Record<string, Bundle>) {
    fetchMock.mockImplementation(async (url: string) => {
      const id = /\/pptfast\/preview\/([^/]+)$/.exec(url)?.[1]
      const found = id ? bundles[id] : undefined
      if (!found) return routeAnswer({ status: 404 })
      return routeAnswer({ status: 200, json: JSON.parse(JSON.stringify(found)) })
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
    expect(await screen.findByText("gone")).toBeInTheDocument()
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
      url.endsWith("/B") ? pendingB : routeAnswer({ status: 404 }),
    )
    const Card = makeCard()
    const { container, rerender } = render(<Card block={blockWith(null, "A", { pages: 4 })} />)
    expect(await screen.findByText("gone")).toBeInTheDocument()

    rerender(<Card block={blockWith(null, "B", { pages: 2 })} />)

    // B has been asked and has not answered. Until it does, this card knows
    // nothing about B — least of all that it has expired.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/B"))
    expect(screen.queryByText("gone")).toBeNull()
    expect(container).toBeEmptyDOMElement()

    answerB(routeAnswer({ status: 200, json: bundleOf([page(1), page(2)], "Deck B") }))

    expect(await screen.findByText("Deck B")).toBeInTheDocument()
    expect(screen.queryByText("gone")).toBeNull()
    expect(screen.getByText("Open")).toBeInTheDocument()
  })

  it("still admits the deck existed when the summary carried no page count", async () => {
    // A result text this card cannot mine for a page count is no reason to
    // pretend the call never happened — the id in it is proof enough.
    respondWith({})
    const Card = makeCard()
    render(<Card block={blockWith(null, "missing")} />)

    expect(await screen.findByText("gone")).toBeInTheDocument()
    expect(screen.queryByText(/\d+ pages/)).toBeNull()
  })

  it("keeps a 410 apart from a harness it could not reach at all", async () => {
    // A 410 is the route answering: the deck survived only in part. A rejected
    // fetch is no answer at all — the harness may simply not be up yet — and
    // reporting that as a missing deck would leave a wrong verdict on screen
    // long after its cause passed.
    fetchMock.mockResolvedValue(routeAnswer({ status: 410 }))
    const Card = makeCard()
    render(<Card block={blockWith(null, "A", { pages: 3 })} />)
    expect(await screen.findByText("gone")).toBeInTheDocument()
  })

  it("does not retire a deck because one request came back 5xx", async () => {
    // The bug, at the level a person sees it. A 502 from a harness that is
    // restarting says nothing about the deck, and this card used to answer it
    // with a `gone` badge over files that were on disk the whole time —
    // permanently, because nothing ever re-asked. Widen the check back to
    // `!r.ok` and this goes red on the badge.
    for (const status of [500, 502, 503]) {
      fetchMock.mockReset()
      fetchMock.mockResolvedValue(routeAnswer({ status }))
      const Card = makeCard()
      const view = render(<Card block={blockWith(null, "A", { pages: 3 })} />)

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/A"))
      expect(await screen.findByText("Retry"), String(status)).toBeInTheDocument()
      expect(screen.queryByText("gone"), String(status)).toBeNull()
      expect(screen.queryByText(/no longer on disk/), String(status)).toBeNull()
      // ...and the deck is not silently forgotten either: the transcript still
      // says how long it was, and the row says what to do about it.
      expect(screen.getByText("3 pages"), String(status)).toBeInTheDocument()
      view.unmount()
    }
  })

  it("offers a retry that actually retries, rather than only calling itself retryable", async () => {
    // The gap this closes: the card recorded a 5xx as `unreachable` — correct —
    // and then rendered nothing at all, so "retryable" was a property of an
    // internal variable and not of anything a person could do. The effect will
    // not re-run on its own, so with no button the only way back was reloading
    // the whole page.
    fetchMock.mockResolvedValue(routeAnswer({ status: 503 }))
    const Card = makeCard()
    render(<Card block={blockWith(null, "A", { pages: 3 })} />)

    const retry = await screen.findByText("Retry")
    expect(retry).toHaveAttribute("title", expect.stringMatching(/try again/i))
    const before = fetchMock.mock.calls.length

    // The harness comes back between the two clicks, which is the whole
    // scenario: nothing about the deck ever changed.
    fetchMock.mockResolvedValue(routeAnswer({ status: 200, json: bundleOf([page(1), page(2), page(3)], "Deck A") }))
    fireEvent.click(retry)

    expect(await screen.findByText("Deck A")).toBeInTheDocument()
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before)
    expect(screen.getByText("Open")).toBeInTheDocument()
    expect(screen.queryByText("Retry")).toBeNull()
  })

  it("says refused rather than unreachable when the route answered and said no", async () => {
    // 401/403 are the route answering. Offering "try again" for a closed door
    // is a button that cannot work, so the sentence has to be different even
    // though the deck's standing is untouched in both cases.
    fetchMock.mockResolvedValue(routeAnswer({ status: 403 }))
    const Card = makeCard()
    render(<Card block={blockWith(null, "A", { pages: 3 })} />)

    expect(await screen.findByText(/refused this request/)).toBeInTheDocument()
    expect(screen.queryByText("gone")).toBeNull()
    expect(screen.queryByText(/no longer on disk/)).toBeNull()
  })

  it("keeps quiet when a 404 could have come from anywhere but this route", async () => {
    // An unstamped 404 is the shape of a plugin whose route never registered,
    // or a proxy answering first. The card must not read a verdict off it — and
    // must not invent a missing deck out of a response that was never about one.
    fetchMock.mockResolvedValue(routeAnswer({ status: 404, stamped: false }))
    const Card = makeCard()
    render(<Card block={blockWith(null, "A", { pages: 3 })} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/A"))
    expect(await screen.findByText("Retry")).toBeInTheDocument()
    expect(screen.queryByText("gone")).toBeNull()
    expect(screen.queryByText(/no longer on disk/)).toBeNull()
    // Treated as "could not reach it", which is the honest reading and leaves
    // a way forward.
  })

  it("still opens a deck it already has when a later request comes back 5xx", async () => {
    // The half of "retryable" that has an affordance. The strip is already in
    // the browser, so a 502 on the pre-open check must leave the Open button
    // and the thumbnails alive — otherwise one bad response takes away the
    // only way to try again.
    const pages = [page(1, "cover"), page(2), page(3)]
    fetchMock.mockResolvedValue(routeAnswer({ status: 503 }))
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf(pages), "abc")} />)

    fireEvent.click(await screen.findByText("Open"))
    await act(async () => {})
    expect(viewer(container)).toBeNull()
    expect(screen.queryByText("gone")).toBeNull()
    expect(screen.getByText("Open")).toBeInTheDocument()
    expect(thumbnails(container)).toHaveLength(3)

    // ...and the retry the card left available actually works.
    fetchMock.mockResolvedValue(routeAnswer({ status: 200, json: bundleOf(pages) }))
    fireEvent.click(await screen.findByText("Open"))
    await waitFor(() => expect(viewer(container)).not.toBeNull())
  })

  it("survives a fetch that rejects, and offers the same way out", async () => {
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
      render(<Card block={blockWith(null, "A")} />)

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/A"))
      // Two turns: `unhandledRejection` is only decided once the microtask
      // queue has drained and nobody has attached a handler.
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      expect(rejections).toEqual([])
      // A request that never landed says nothing about the deck, so the card
      // claims nothing about it — and still leaves a button.
      expect(screen.queryByText("gone")).toBeNull()
      expect(await screen.findByText("Retry")).toBeInTheDocument()
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
    fetchMock.mockResolvedValue(routeAnswer({ status: 200 }))
    const Card = makeCard()
    render(<Card block={blockWith(draftBundle(), "abc123")} />)

    fireEvent.click(await screen.findByText("Download .pptx"))

    await waitFor(() => expect(anchorClicks).toHaveLength(1))
    expect(anchorClicks[0]!.download).toBe("Quarterly deck-draft.pptx")
  })
})

describe("dsh preview card — a preview whose bookkeeping is damaged", () => {
  /**
   * Every assertion below is about what a person reads on screen.
   *
   * The previous round shipped a server-side `PreviewDamaged`, its own message
   * and its own tests — and all of those tests asserted JSON. None of them
   * drove this card, so the distinction never reached a user: the card mapped
   * every 410 to `gone` and told people their deck had been deleted. Asserting
   * an internal value and calling the behaviour verified is the mistake this
   * suite exists to stop making.
   */
  const damaged = () => routeAnswer({ status: 410, code: "preview_damaged" })

  it("never tells the user a damaged preview was deleted", async () => {
    fetchMock.mockResolvedValue(damaged())
    const Card = makeCard()
    render(<Card block={blockWith(null, "A", { pages: 9 })} />)

    expect(await screen.findByText("damaged")).toBeInTheDocument()
    // The three phrasings that would all be false here.
    expect(screen.queryByText(/deleted/)).toBeNull()
    expect(screen.queryByText(/no longer on disk/)).toBeNull()
    expect(screen.queryByText("gone")).toBeNull()
    // ...and what it says instead is the true thing, plus the page count the
    // transcript still carries.
    expect(screen.getByText(/present but unreadable/)).toBeInTheDocument()
    expect(screen.getByText("9 pages")).toBeInTheDocument()
  })

  it("keeps the thumbnails it already has, because the deck really was rendered", async () => {
    // Damaged bookkeeping is not a missing deck. The strip is already in the
    // browser and it is the deck, so throwing it away would destroy the one
    // thing that still works to make a point about a file the user cannot see.
    fetchMock.mockResolvedValue(damaged())
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf([page(1), page(2), page(3)]), "abc")} />)

    fireEvent.click(await screen.findByText("Open"))

    expect(await screen.findByText("damaged")).toBeInTheDocument()
    expect(container.querySelectorAll("svg")).toHaveLength(3)
    expect(screen.queryByText(/no longer on disk/)).toBeNull()
  })

  it("stops pretending the same request will work next time", async () => {
    fetchMock.mockResolvedValue(damaged())
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf([page(1), page(2)]), "abc")} />)

    fireEvent.click(await screen.findByText("Open"))
    await screen.findByText("damaged")

    // No viewer, no way back into one, and no Retry: nothing about clicking
    // again would change what the route reads off the disk.
    expect(viewer(container)).toBeNull()
    expect(screen.queryByText("Open")).toBeNull()
    expect(screen.queryByText("Retry")).toBeNull()
    expect(thumbnails(container)).toHaveLength(0)
    // The export says which kind of unavailable, not the generic one.
    expect(screen.getByText("Damaged")).toBeInTheDocument()
    expect(screen.queryByText("Unavailable")).toBeNull()
  })
})

describe("dsh preview card — a route that refuses", () => {
  /**
   * `refused` used to exist as a name and nothing else: `isRetryable` said it
   * was not retryable and no rendering path ever called `isRetryable`. So the
   * card offered a Retry button on a 403, the viewer swallowed one silently,
   * and the download reported it as a network problem. Three behaviours for
   * one verdict, none of them the one that was designed.
   */
  const refused = () => routeAnswer({ status: 403 })

  it("offers no retry it cannot honour, when there is no deck in hand", async () => {
    fetchMock.mockResolvedValue(refused())
    const Card = makeCard()
    render(<Card block={blockWith(null, "A", { pages: 3 })} />)

    expect(await screen.findByText(/refused this request/)).toBeInTheDocument()
    expect(screen.getByText("refused")).toBeInTheDocument()
    // The button that would send the identical request to the same closed door.
    expect(screen.queryByText("Retry")).toBeNull()
    expect(screen.queryByText("gone")).toBeNull()
    expect(screen.queryByText(/no longer on disk/)).toBeNull()
  })

  it("says so when the viewer is refused, instead of doing nothing visible", async () => {
    // The click that used to be swallowed whole: the modal did not open, the
    // card said nothing, the button stayed, and the only feedback available was
    // clicking it again.
    fetchMock.mockResolvedValue(refused())
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf([page(1), page(2)]), "abc")} />)

    fireEvent.click(await screen.findByText("Open"))

    expect(await screen.findByText("refused")).toBeInTheDocument()
    expect(screen.getByText(/refused this request/)).toBeInTheDocument()
    expect(viewer(container)).toBeNull()
    // The deck stays on screen; the promise that clicking leads anywhere does not.
    expect(container.querySelectorAll("svg")).toHaveLength(2)
    expect(screen.queryByText("Open")).toBeNull()
    expect(screen.queryByText("Retry")).toBeNull()
  })

  it("calls a refused download refused, not a network problem", async () => {
    for (const status of [401, 403]) {
      fetchMock.mockReset()
      fetchMock.mockResolvedValue(routeAnswer({ status }))
      const Card = makeCard()
      const view = render(<Card block={blockWith(bundleOf([page(1)]), "abc")} />)

      fireEvent.click(await screen.findByText("Download .pptx"))

      expect(await screen.findByText("Refused"), String(status)).toBeInTheDocument()
      // The two things it used to say instead: a retry it could not honour, and
      // a sentence blaming the network for a door the route closed on purpose.
      expect(screen.queryByText("Retry download"), String(status)).toBeNull()
      expect(screen.getByText("Refused").title, String(status)).toMatch(/refused this request/)
      expect(anchorClicks).toEqual([])
      view.unmount()
    }
  })
})

describe("dsh preview card — one button, many decks", () => {
  it("does not carry a dead download from one deck onto the next", async () => {
    // Introduced by the verdict model itself: the card keys its bundle and its
    // verdict by preview id, and the export button kept a plain `useState`. One
    // React instance is reused as the block it renders changes, so deck A's
    // 410 latched the button and deck B — a live deck, on disk, with a working
    // export — rendered `Unavailable` for the rest of the session.
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/A/") ? routeAnswer({ status: 410, code: "preview_missing" }) : routeAnswer({ status: 200 }),
    )
    const Card = makeCard()
    const { rerender } = render(<Card block={blockWith(bundleOf([page(1)]), "A")} />)

    fireEvent.click(await screen.findByText("Download .pptx"))
    expect(await screen.findByText("Unavailable")).toBeInTheDocument()

    rerender(<Card block={blockWith(bundleOf([page(1), page(2)]), "B")} />)

    // B has been asked nothing yet, so the button offers what it always offers.
    expect(await screen.findByText("Download .pptx")).toBeInTheDocument()
    expect(screen.queryByText("Unavailable")).toBeNull()
    // ...and it works, which is the half that says the state really did reset
    // rather than merely being hidden.
    fireEvent.click(await screen.findByText("Download .pptx"))
    await waitFor(() => expect(anchorClicks).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/B/pptx")
  })

  it("does not carry a transient download failure across decks either", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/A/") ? routeAnswer({ status: 502 }) : routeAnswer({ status: 200 }),
    )
    const Card = makeCard()
    const { rerender } = render(<Card block={blockWith(bundleOf([page(1)]), "A")} />)

    fireEvent.click(await screen.findByText("Download .pptx"))
    expect(await screen.findByText("Retry download")).toBeInTheDocument()

    rerender(<Card block={blockWith(bundleOf([page(1)]), "B")} />)
    expect(await screen.findByText("Download .pptx")).toBeInTheDocument()
    expect(screen.queryByText("Retry download")).toBeNull()
  })
})

describe("dsh preview card — one instance, decks going past", () => {
  /**
   * A card is a long-lived React instance that watches decks scroll by, and
   * every round of this work has broken the same way: a piece of state, or an
   * async write, that could not say which preview it was about. The host's
   * bundle cache, then the export button's status, then the viewer. These tests
   * are about the class, not any one of them.
   */
  it("does not open deck B's viewer because deck A's check came back", async () => {
    // The race, produced rather than asserted about. A's pre-open check is
    // still in flight when the instance moves to B; A then succeeds. The modal
    // used to open on the strength of that success — pointed at B, whose id had
    // never been checked at all. The check that exists to stop the viewer
    // walking into a wall was walking it into a different one.
    let answerA = (_value: unknown) => {}
    const pendingA = new Promise((resolve) => {
      answerA = resolve
    })
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/A") ? pendingA : routeAnswer({ status: 200, json: bundleOf([page(1)], "Deck B") }),
    )

    const Card = makeCard()
    const { container, rerender } = render(<Card block={blockWith(bundleOf([page(1), page(2)]), "A")} />)
    fireEvent.click(await screen.findByText("Open"))
    // In flight, nothing open yet.
    await act(async () => {})
    expect(viewer(container)).toBeNull()

    rerender(<Card block={blockWith(bundleOf([page(1)], "Deck B"), "B")} />)
    answerA(routeAnswer({ status: 200, json: bundleOf([page(1), page(2)], "Deck A") }))
    await act(async () => {})

    // B is on screen and B was never asked, so nothing may be open.
    expect(screen.getByText("Deck B")).toBeInTheDocument()
    expect(viewer(container)).toBeNull()
    // ...and A's bundle did not overwrite B's either.
    expect(screen.queryByText("Deck A")).toBeNull()
  })

  it("does not let deck A's verdict retire deck B", async () => {
    // The same race with the other outcome: A comes back 410 after the card has
    // moved on. B is live, and must not inherit A's obituary.
    let answerA = (_value: unknown) => {}
    const pendingA = new Promise((resolve) => {
      answerA = resolve
    })
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/A") ? pendingA : routeAnswer({ status: 200, json: bundleOf([page(1)], "Deck B") }),
    )

    const Card = makeCard()
    const { rerender } = render(<Card block={blockWith(bundleOf([page(1)]), "A")} />)
    fireEvent.click(await screen.findByText("Open"))
    await act(async () => {})

    rerender(<Card block={blockWith(bundleOf([page(1)], "Deck B"), "B")} />)
    answerA(routeAnswer({ status: 410, code: "preview_missing" }))
    await act(async () => {})

    expect(screen.queryByText("gone")).toBeNull()
    expect(screen.queryByText(/no longer on disk/)).toBeNull()
    expect(screen.getByText("Open")).toBeInTheDocument()
  })

  it("closes the viewer when the deck under it changes", async () => {
    // The un-keyed half of the same state. With the modal open on A, moving the
    // instance to B kept it open — and pointed it at B, a deck the user had not
    // asked to see and the card had not checked.
    fetchMock.mockResolvedValue(routeAnswer({ status: 200, json: bundleOf([page(1), page(2)]) }))
    const Card = makeCard()
    const { container, rerender } = render(<Card block={blockWith(bundleOf([page(1), page(2)]), "A")} />)

    fireEvent.click(await screen.findByText("Open"))
    await waitFor(() => expect(viewer(container)).not.toBeNull())
    expect(viewer(container)).toHaveAttribute("src", "/pptfast/preview/A/html")

    rerender(<Card block={blockWith(bundleOf([page(1)], "Deck B"), "B")} />)
    await act(async () => {})
    expect(viewer(container)).toBeNull()
  })

  it("does not carry one deck's start page onto another", async () => {
    // `#page=` lived in unkeyed state too: open A on page 2, switch to B, open
    // B — and B opened on page 2 because that number belonged to nobody.
    fetchMock.mockResolvedValue(routeAnswer({ status: 200, json: bundleOf([page(1), page(2)]) }))
    const Card = makeCard()
    const { container, rerender } = render(<Card block={blockWith(bundleOf([page(1), page(2)]), "A")} />)

    fireEvent.click(thumbnails(container)[1]!)
    await waitFor(() => expect(viewer(container)).not.toBeNull())
    expect(viewer(container)).toHaveAttribute("src", "/pptfast/preview/A/html#page=2")

    rerender(<Card block={blockWith(bundleOf([page(1), page(2)], "Deck B"), "B")} />)
    await act(async () => {})
    fireEvent.click(await screen.findByText("Open"))
    await waitFor(() => expect(viewer(container)).not.toBeNull())
    expect(viewer(container)).toHaveAttribute("src", "/pptfast/preview/B/html")
  })

  it("does not let a stale answer close the viewer the user is looking at", async () => {
    // The consequence that isolates the ownership check on the viewer write,
    // and the reason it is load-bearing rather than decorative. `viewer` is
    // replaced wholesale, not compared and ignored like `checked` and
    // `fetched` — so a late response does not merely fail to open something,
    // it overwrites what is open. A is in flight, the card moves to B, B's
    // viewer opens, and then A lands: without the check A's write replaces the
    // viewer state and B's modal, open in front of the user, disappears.
    let answerA = (_value: unknown) => {}
    const pendingA = new Promise((resolve) => {
      answerA = resolve
    })
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/A") ? pendingA : routeAnswer({ status: 200, json: bundleOf([page(1)], "Deck B") }),
    )

    const Card = makeCard()
    const { container, rerender } = render(<Card block={blockWith(bundleOf([page(1), page(2)]), "A")} />)
    fireEvent.click(await screen.findByText("Open"))
    await act(async () => {})

    rerender(<Card block={blockWith(bundleOf([page(1)], "Deck B"), "B")} />)
    fireEvent.click(await screen.findByText("Open"))
    await waitFor(() => expect(viewer(container)).not.toBeNull())
    expect(viewer(container)).toHaveAttribute("src", "/pptfast/preview/B/html")

    // A finally answers, minutes late and about a deck nobody is looking at.
    answerA(routeAnswer({ status: 200, json: bundleOf([page(1), page(2)], "Deck A") }))
    await act(async () => {})

    expect(viewer(container)).not.toBeNull()
    expect(viewer(container)).toHaveAttribute("src", "/pptfast/preview/B/html")
  })
})

describe("dsh preview card — the store", () => {
  it("keeps state in one place, checked against the syntax tree rather than the text", async () => {
    // A TRIPWIRE, NOT A PROOF — and the difference is worth stating plainly,
    // because the previous version of this test claimed more than it could do.
    //
    // It was a string match on `useState(`, which `react.useState ('x')`,
    // `const h = react.useState; h()`, `react['useState']()`, `useReducer`, a
    // `useRef` holding deck state, or a direct call to the setter all walk
    // straight past. It went red for the one mutation written to match it,
    // which proved the mutation was killable and nothing else.
    //
    // This version parses the file and asks questions of the tree, which
    // closes some of those holes. It does NOT close all of them, and the ones
    // it misses are worth naming rather than leaving to be discovered:
    //
    //  - `const h = useState` then `h()`  — the callee is `h`, not `useState`
    //  - `react['use' + 'State']()`       — the name is not a literal
    //  - `useSyncExternalStore` or `useRef` reached through an alias
    //  - `useOptimistic` and any hook added to React after this was written
    //  - `const set = store[1]` then `set()` outside `commit`
    //  - passing the setter to a function defined elsewhere
    //  - a mutable object at module scope, or captured in a factory closure
    //
    // The root cause is that this inspects call expressions by their final
    // name; it has no symbol resolution and no data flow. Closing that needs a
    // type-aware lint rule, which is a bigger commitment than this file has
    // earned so far.
    //
    // So: a tripwire for the shapes that have actually gone wrong, not a proof.
    // Its value is that a new bypass has to be invented rather than stumbled
    // into — and that is all it should ever be described as.
    const { readFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const ts = await import("typescript")
    const path = join(process.cwd(), "dsh", "client.js")
    const tree = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.ES2020, true)

    /** The nearest named function around a node, for "where is this call?". */
    const enclosingFunction = (node: TsNode): string => {
      for (let at = node.parent; at; at = at.parent) {
        if (ts.isFunctionDeclaration(at) && at.name) return at.name.text
        if (ts.isVariableDeclaration(at.parent ?? at) && ts.isIdentifier((at.parent as never as { name: unknown }).name as never)) {
          return ((at.parent as never as { name: { text: string } }).name).text
        }
      }
      return "<top level>"
    }

    /** Every call in the file, as `{ callee, insideFunction }`. */
    const calls: { callee: string; inside: string }[] = []
    const walk = (node: TsNode): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression
        let name = ""
        if (ts.isIdentifier(callee)) name = callee.text
        else if (ts.isPropertyAccessExpression(callee)) name = callee.name.text
        else if (ts.isElementAccessExpression(callee)) {
          const arg = callee.argumentExpression
          name = ts.isStringLiteral(arg) ? arg.text : `${callee.expression.getText()}[${arg.getText()}]`
        }
        calls.push({ callee: name, inside: enclosingFunction(node) })
      }
      ts.forEachChild(node, walk)
    }
    walk(tree)

    // One state container, whatever spelling is used to reach it.
    expect(calls.filter((c) => c.callee === "useState")).toHaveLength(1)
    // No second one under another name.
    for (const hook of ["useReducer", "useSyncExternalStore", "useDeferredValue"]) {
      expect(calls.filter((c) => c.callee === hook), hook).toHaveLength(0)
    }
    // `useRef` only where it holds a DOM node. A ref holding deck state is the
    // shape that broke under a discarded render.
    const refs = calls.filter((c) => c.callee === "useRef").map((c) => c.inside)
    expect(refs.sort()).toEqual(["Modal", "Slide"])
    // `commit` touches one entry and does not survey the store. A capacity rule
    // is the shape that turned an isolated write into a cross-deck effect: a
    // late answer re-inserted its own entry and pushed the deck on screen out,
    // resetting a download that was in progress. Put a budget back in `commit`
    // on its own and no behaviour test can see it, because `maintainStore`
    // prunes to a single entry and a budget of eight is never reached — the
    // mutation has to strip the prune out as well before anything moves (round
    // 8, E1). That is what the assertion below is for: it fails on the half
    // that behaviour cannot reach.
    const commitBody = (() => {
      let found = ""
      const find = (node: TsNode): void => {
        if (ts.isFunctionDeclaration(node) && node.name?.text === "commit") found = node.getText()
        ts.forEachChild(node, find)
      }
      find(tree)
      return found
    })()
    expect(commitBody).not.toBe("")
    for (const survey of ["Object.keys", "while (", "for (", ".length >", "delete next["]) {
      expect(commitBody, survey).not.toContain(survey)
    }

    // The setter is called in exactly two functions, and both are named for the
    // job: `maintainStore` creates and drops entries on commit, `commit`
    // updates the one that exists. A third would be a writer nobody decided on.
    const writes = calls.filter((c) => /^store\[1\]$/.test(c.callee))
    expect(writes.length).toBeGreaterThan(0)
    expect([...new Set(writes.map((w) => w.inside))].sort()).toEqual(["commit", "maintainStore"])
    // And nothing aliases the hook out of `react` to dodge the count above.
    const aliased = tree.getText().match(/=\s*react\s*(\.\s*useState|\[\s*['"]useState['"]\s*\])/g) ?? []
    expect(aliased).toHaveLength(1)
  })

  it("drops a stale answer instead of letting it erase the deck on screen", async () => {
    // The correction to last round's reasoning, and the reason it matters. I
    // argued this guard was defence-in-depth because a stale verdict carries
    // deck A's id and the render compares ids before using it. That is true of
    // *reading* and irrelevant to *writing*: the verdict lives in one slot, so
    // A's late write does not get ignored — it overwrites whatever B had put
    // there. B was settled as `gone`, and A's arrival un-settles it, putting
    // the Open button back on a deck the route has already disowned.
    let answerA = (_value: unknown) => {}
    const pendingA = new Promise((resolve) => {
      answerA = resolve
    })
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/A") ? pendingA : routeAnswer({ status: 410, code: "preview_missing" }),
    )

    const Card = makeCard()
    const { rerender } = render(<Card block={blockWith(bundleOf([page(1)]), "A")} />)
    fireEvent.click(await screen.findByText("Open"))
    await act(async () => {})

    rerender(<Card block={blockWith(bundleOf([page(1), page(2)], "Deck B"), "B")} />)
    fireEvent.click(await screen.findByText("Open"))
    expect(await screen.findByText("gone")).toBeInTheDocument()
    expect(screen.queryByText("Open")).toBeNull()

    // A answers at last, about a deck nobody is looking at.
    answerA(routeAnswer({ status: 410, code: "preview_missing" }))
    await act(async () => {})

    // B is still settled. Without the check in `commit`, A's write lands in the
    // same slot, B's verdict is erased, and `Open` comes back.
    expect(screen.getByText("gone")).toBeInTheDocument()
    expect(screen.queryByText("Open")).toBeNull()
  })

  it("does not let a stale download answer cancel the download in progress", async () => {
    // The fourth defect of the class, and the one that arrived in the round
    // whose whole subject was sweeping the class up. A's download is in flight,
    // the card moves to B, B's download starts and the button reads `Saving…` —
    // then A's 410 lands, resets the shared status, and B's button goes back to
    // `Download .pptx` mid-request, inviting a second submission of a download
    // that is already running.
    let answerA = (_value: unknown) => {}
    let answerB = (_value: unknown) => {}
    const pendingA = new Promise((resolve) => {
      answerA = resolve
    })
    const pendingB = new Promise((resolve) => {
      answerB = resolve
    })
    fetchMock.mockImplementation(async (url: string) => (url.includes("/A/") ? pendingA : pendingB))

    const Card = makeCard()
    const { rerender } = render(<Card block={blockWith(bundleOf([page(1)]), "A")} />)
    fireEvent.click(await screen.findByText("Download .pptx"))
    await act(async () => {})

    rerender(<Card block={blockWith(bundleOf([page(1)], "Deck B"), "B")} />)
    fireEvent.click(await screen.findByText("Download .pptx"))
    expect(await screen.findByText("Saving…")).toBeInTheDocument()

    answerA(routeAnswer({ status: 410, code: "preview_missing" }))
    await act(async () => {})

    // B is still saving. Its request has not come back and nothing about A can
    // say otherwise.
    expect(screen.getByText("Saving…")).toBeInTheDocument()
    expect(screen.queryByText("Download .pptx")).toBeNull()
    expect(screen.queryByText("Unavailable")).toBeNull()

    answerB(routeAnswer({ status: 200 }))
    await waitFor(() => expect(anchorClicks).toHaveLength(1))
  })
})

describe("dsh preview card — renders that never commit", () => {
  /**
   * The defect this exists for was introduced by the fix for the previous one,
   * which is the fifth time that has happened and the reason the mechanism
   * changed rather than the care taken.
   *
   * Ownership used to be read out of a ref assigned during render. React
   * forbids that, and the reason is exactly this: a render can happen and be
   * thrown away. Under a transition, React renders the next deck to see
   * whether it can show it; if that render suspends, nothing is committed and
   * the previous deck stays on screen. The ref had already moved, so the deck
   * the user was still looking at was locked out of its own state — every
   * answer about it now looked stale and was dropped.
   */
  it("lets the deck on screen finish its own download when the next one never commits", async () => {
    let answerA = (_value: unknown) => {}
    const pendingA = new Promise((resolve) => {
      answerA = resolve
    })
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/A/") ? pendingA : routeAnswer({ status: 200 }),
    )

    // A component that suspends for ever: rendering it produces no commit.
    const Never = () => {
      throw new Promise(() => {})
    }
    const Card = makeCard()

    const { rerender } = render(
      <React.Suspense fallback={<div>loading</div>}>
        <Card block={blockWith(bundleOf([page(1)]), "A")} />
      </React.Suspense>,
    )
    fireEvent.click(await screen.findByText("Download .pptx"))
    expect(await screen.findByText("Saving…")).toBeInTheDocument()

    // React starts rendering B and never gets to commit it. On screen, A.
    await act(async () => {
      React.startTransition(() => {
        rerender(
          <React.Suspense fallback={<div>loading</div>}>
            <Card block={blockWith(bundleOf([page(1)]), "B")} />
            <Never />
          </React.Suspense>,
        )
      })
    })

    // A answers. It is the deck that is committed, so its own answer must reach
    // it. With ownership read from a render-time ref, the discarded B render had
    // already claimed the pointer and this stayed `Saving…` for ever.
    answerA(routeAnswer({ status: 410, code: "preview_missing" }))
    await waitFor(() => {
      expect(screen.queryByText("Saving…")).toBeNull()
      expect(screen.getByText("Unavailable")).toBeInTheDocument()
    })
  })

  it("decides ownership without writing anything during a render", async () => {
    // The property behind the test above, checked against the source so a
    // future fix cannot reintroduce a render-phase mutable write and still
    // pass. React forbids writing `ref.current` during a render, and this file
    // did it anyway — the two surviving refs hold DOM nodes and are assigned by
    // React, never by this code.
    const { readFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const source = await readFile(join(process.cwd(), "dsh", "client.js"), "utf8")

    expect(source).not.toMatch(/\.current\s*(\.\s*\w+\s*)?=[^=]/)
  })
})

describe("dsh preview card — decks that have left the screen", () => {
  it("does not let a late answer about a departed deck disturb the one on screen", async () => {
    // The reachable half of the eviction counterexample. A's download is in
    // flight when the card moves to B; B starts its own; A answers late. B must
    // still be saving.
    //
    // Note what this test can and cannot do, because getting that wrong is how
    // three rounds of tests passed against their own mutations. The original
    // counterexample needed nine decks' worth of entries so that a late write
    // could push the current one out of a capacity-bounded store. The store has
    // no capacity now and keeps only the deck on screen, so those entries
    // cannot exist and the scenario is unreachable — the fix removed the
    // precondition, not just the effect. What guards *that* is the structural
    // assertion in "keeps state in one place", which fails if `commit` ever
    // starts iterating or trimming the store again.
    let answerA = (_value: unknown) => {}
    const pendingA = new Promise((resolve) => {
      answerA = resolve
    })
    const pendingForever = new Promise(() => {})
    fetchMock.mockImplementation(async (url: string) => (url.includes("/A/") ? pendingA : pendingForever))

    const Card = makeCard()
    const { rerender } = render(<Card block={blockWith(bundleOf([page(1)]), "A")} />)
    fireEvent.click(await screen.findByText("Download .pptx"))
    await act(async () => {})

    rerender(<Card block={blockWith(bundleOf([page(1)], "Deck B"), "B")} />)
    fireEvent.click(await screen.findByText("Download .pptx"))
    expect(await screen.findByText("Saving…")).toBeInTheDocument()

    answerA(routeAnswer({ status: 410, code: "preview_missing" }))
    await act(async () => {})

    expect(screen.getByText("Saving…")).toBeInTheDocument()
    expect(screen.queryByText("Download .pptx")).toBeNull()
    expect(screen.queryByText("gone")).toBeNull()
    expect(screen.queryByText("Unavailable")).toBeNull()
  })

  it("ignores a departed deck's answer rather than recreating its state", async () => {
    // The other half of the rule: `commit` never creates an entry. A response
    // that lands while its deck has no entry is genuinely stale, and the place
    // that shows is when the card comes BACK to that deck — with the rule, it
    // asks again; without it, a verdict appears out of a reply the card had
    // already decided not to be listening for.
    //
    // The first version of this test asserted only that the other deck was
    // untouched, which is true either way once eviction is gone. It passed
    // against the mutation, which is the failure mode this suite keeps having
    // to be rescued from: asserting the safe neighbour instead of the effect.
    let answerA = (_value: unknown) => {}
    const pendingA = new Promise((resolve) => {
      answerA = resolve
    })
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/A") ? pendingA : routeAnswer({ status: 200, json: bundleOf([page(1)], "Deck B") }),
    )

    const Card = makeCard()
    const { rerender } = render(<Card block={blockWith(null, "A", { pages: 4 })} />)
    await act(async () => {})

    rerender(<Card block={blockWith(null, "B", { pages: 2 })} />)
    expect(await screen.findByText("Deck B")).toBeInTheDocument()

    // A answers long after it left the screen, with a whole deck.
    answerA(routeAnswer({ status: 200, json: bundleOf([page(1)], "Deck A as it was") }))
    await act(async () => {})
    expect(screen.getByText("Deck B")).toBeInTheDocument()

    // Now come back to A. The route has moved on since; A must ask it rather
    // than draw a deck assembled from a reply that landed while it had no
    // entry. A bundle is the right thing to check for: a stale *verdict* would
    // be masked by the refetch that follows it, so an earlier version of this
    // test could not see the difference at all.
    const before = fetchMock.mock.calls.length
    fetchMock.mockImplementation(async () => routeAnswer({ status: 200, json: bundleOf([page(1)], "Deck A now") }))
    rerender(<Card block={blockWith(null, "A", { pages: 4 })} />)
    await act(async () => {})

    expect(fetchMock.mock.calls.length).toBeGreaterThan(before)
    expect(await screen.findByText("Deck A now")).toBeInTheDocument()
    expect(screen.queryByText("Deck A as it was")).toBeNull()
  })
})

describe("dsh preview card — an answer that arrives while nothing is on screen", () => {
  it("keeps a reply out of a store that is empty, rather than letting it move in", async () => {
    // The same rule as "ignores a departed deck's answer", through the one
    // sequence where a created entry would survive to be read. `maintainStore`
    // leaves a store alone when it already holds exactly the deck being
    // rendered — so if a late reply is allowed to *create* the entry for A
    // while the card is showing no preview at all, that entry is the only one
    // there, and coming back to A finds it settled and draws it. `commit`
    // refusing to create is the whole of what keeps that reply out.
    //
    // The card being between previews is not exotic: `previewId` is parsed out
    // of the tool's own result text, and the card renders with it null for
    // every block that has not got one.
    let answerA = (_value: unknown) => {}
    const pendingA = new Promise((resolve) => {
      answerA = resolve
    })
    fetchMock.mockImplementation(async () => pendingA)

    const Card = makeCard()
    const { rerender } = render(<Card block={blockWith(null, "A", { pages: 4 })} />)
    await act(async () => {})

    // A block with no preview in it at all: the store now holds nothing.
    rerender(<Card block={{ content: [{ text: "no preview here" }] }} />)
    await act(async () => {})

    // A answers into that emptiness, with a whole deck.
    answerA(routeAnswer({ status: 200, json: bundleOf([page(1)], "Deck A as it was") }))
    await act(async () => {})

    // Back to A. It has to ask the route, not read a reply it was not listening
    // for by the time it arrived.
    fetchMock.mockImplementation(async () => routeAnswer({ status: 200, json: bundleOf([page(1)], "Deck A now") }))
    rerender(<Card block={blockWith(null, "A", { pages: 4 })} />)

    expect(await screen.findByText("Deck A now")).toBeInTheDocument()
    expect(screen.queryByText("Deck A as it was")).toBeNull()
  })
})

describe("dsh preview card — a deck the card comes back to", () => {
  /**
   * The seventh defect of the class, and the first one about time rather than
   * about which deck.
   *
   * Entries are addressed by preview id, and `commit` refuses to write into an
   * id that has no entry — which retired every late answer from a deck that had
   * left the screen. But leaving is not permanent: a card that goes A → B → A
   * builds a *second* entry under the same id, with none of the first one's
   * bookkeeping. The old A request, still in flight from the first stay, then
   * found an entry under its own id and was applied to it: a viewer the user
   * had asked for minutes ago, opening by itself over a deck they had only just
   * come back to.
   */
  it("does not open a viewer for an Open the user clicked on a previous visit", async () => {
    let answerA = (_value: unknown) => {}
    const pendingA = new Promise((resolve) => {
      answerA = resolve
    })
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/A") ? pendingA : routeAnswer({ status: 200, json: bundleOf([page(1)], "Deck B") }),
    )

    const Card = makeCard()
    const { container, rerender } = render(<Card block={blockWith(bundleOf([page(1), page(2)]), "A")} />)
    fireEvent.click(await screen.findByText("Open"))
    await act(async () => {})
    expect(viewer(container)).toBeNull()

    // Away, which drops A's entry…
    rerender(<Card block={blockWith(bundleOf([page(1)], "Deck B"), "B")} />)
    await act(async () => {})
    // …and back, which builds a new one under the same id.
    rerender(<Card block={blockWith(bundleOf([page(1), page(2)]), "A")} />)
    await act(async () => {})
    expect(viewer(container)).toBeNull()

    // The first stay's request finally answers.
    answerA(routeAnswer({ status: 200, json: bundleOf([page(1), page(2)]) }))
    await act(async () => {})

    // Nothing opened. The user is looking at the deck they came back to, not at
    // a modal they asked for before they left.
    expect(viewer(container)).toBeNull()
    expect(screen.getByText("Open")).toBeInTheDocument()
  })

  it("does not mark the export unavailable because the previous visit's download failed", async () => {
    // The download lane has the same shape and its own visible damage: come
    // back to a deck that is perfectly fine and find its export already
    // labelled `Unavailable`, on the strength of a request from a visit the
    // user has left behind.
    let answerA = (_value: unknown) => {}
    const pendingA = new Promise((resolve) => {
      answerA = resolve
    })
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/A/") ? pendingA : routeAnswer({ status: 200, json: bundleOf([page(1)], "Deck B") }),
    )

    const Card = makeCard()
    const { rerender } = render(<Card block={blockWith(bundleOf([page(1)]), "A")} />)
    fireEvent.click(await screen.findByText("Download .pptx"))
    expect(await screen.findByText("Saving…")).toBeInTheDocument()

    rerender(<Card block={blockWith(bundleOf([page(1)], "Deck B"), "B")} />)
    await act(async () => {})
    rerender(<Card block={blockWith(bundleOf([page(1)]), "A")} />)
    // A fresh visit: nothing is downloading, so the button offers the download.
    expect(await screen.findByText("Download .pptx")).toBeInTheDocument()

    answerA(routeAnswer({ status: 410, code: "preview_missing" }))
    await act(async () => {})

    expect(screen.getByText("Download .pptx")).toBeInTheDocument()
    expect(screen.queryByText("Unavailable")).toBeNull()
    expect(screen.queryByText(/no longer on disk/)).toBeNull()
  })

  it("draws nothing from the bundle the previous visit was told about", async () => {
    // Code Mode, where the bundle itself arrives by request — and the ordering
    // rule cannot help here, because the stale answer lands *first*. The high
    // water mark it would have been measured against went out with the old
    // entry, so on the second visit there is nothing left to say this reply is
    // older than the one still in flight.
    const answers: ((value: unknown) => void)[] = []
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/A")
        ? new Promise((resolve) => {
            answers.push(resolve)
          })
        : routeAnswer({ status: 200, json: bundleOf([page(1)], "Deck B") }),
    )

    const Card = makeCard()
    const { rerender } = render(<Card block={blockWith(null, "A", { pages: 4 })} />)
    await act(async () => {})
    expect(answers).toHaveLength(1)

    rerender(<Card block={blockWith(null, "B", { pages: 2 })} />)
    expect(await screen.findByText("Deck B")).toBeInTheDocument()

    // Back to A, which asks the route for itself. That request is still out.
    rerender(<Card block={blockWith(null, "A", { pages: 4 })} />)
    await act(async () => {})
    expect(answers).toHaveLength(2)

    // The first visit's request answers, ahead of the one this visit made.
    answers[0]!(routeAnswer({ status: 200, json: bundleOf([page(1)], "Deck A as it was") }))
    await act(async () => {})
    expect(screen.queryByText("Deck A as it was")).toBeNull()

    // This visit's own answer is the one that decides.
    answers[1]!(routeAnswer({ status: 410, code: "preview_missing" }))
    expect(await screen.findByText("gone")).toBeInTheDocument()
    expect(screen.queryByText("Deck A as it was")).toBeNull()
  })
})

describe("dsh preview card — two requests for the same deck", () => {
  it("does not let an older answer overturn a newer one", async () => {
    // Round five called this "two requests for the same preview race each
    // other, last writer wins — intended". It is not: last to *arrive* is not
    // most *recent*, and `alive` after `gone` is not a race, it is time running
    // backwards. The second Open answered 410 and settled the card; the first,
    // older request then answered 200 and un-settled it, reopening the viewer
    // on a deck the route had just disowned.
    const answers: ((value: unknown) => void)[] = []
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          answers.push(resolve)
        }),
    )

    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf([page(1), page(2)]), "abc")} />)

    fireEvent.click(await screen.findByText("Open"))
    await act(async () => {})
    fireEvent.click(await screen.findByText("Open"))
    await act(async () => {})
    expect(answers).toHaveLength(2)

    // The newer request answers first: this deck is gone.
    answers[1]!(routeAnswer({ status: 410, code: "preview_missing" }))
    expect(await screen.findByText("gone")).toBeInTheDocument()

    // The older one answers afterwards, with news from before that.
    answers[0]!(routeAnswer({ status: 200, json: bundleOf([page(1), page(2)]) }))
    await act(async () => {})

    expect(screen.getByText("gone")).toBeInTheDocument()
    expect(viewer(container)).toBeNull()
    expect(screen.queryByText("Open")).toBeNull()
  })

  it("keeps the download's ordering separate from the deck's", async () => {
    // Two lanes, because one ticket space would let a slow export make a fresh
    // verdict look stale, or a fresh verdict discard the export's own outcome.
    const deckAnswers: ((value: unknown) => void)[] = []
    const downloadAnswers: ((value: unknown) => void)[] = []
    fetchMock.mockImplementation(
      (url: string) =>
        new Promise((resolve) => {
          ;(url.endsWith("/pptx") ? downloadAnswers : deckAnswers).push(resolve)
        }),
    )

    const Card = makeCard()
    render(<Card block={blockWith(bundleOf([page(1)]), "abc")} />)

    fireEvent.click(await screen.findByText("Download .pptx"))
    await act(async () => {})
    fireEvent.click(await screen.findByText("Open"))
    await act(async () => {})

    // The deck answers second but with a later ticket; the download's own
    // outcome, ticketed earlier, must still land in its own lane.
    deckAnswers[0]!(routeAnswer({ status: 200, json: bundleOf([page(1)]) }))
    await act(async () => {})
    downloadAnswers[0]!(routeAnswer({ status: 200 }))
    // Both copies of the button — the card's and the viewer's, which the deck
    // answer opened — are back to offering the download rather than stuck on
    // `Saving…` because a newer deck ticket discarded the export's outcome.
    await waitFor(() => {
      expect(anchorClicks).toHaveLength(1)
      expect(screen.getAllByText("Download .pptx").length).toBeGreaterThan(0)
      expect(screen.queryByText("Saving…")).toBeNull()
    })
  })
})
