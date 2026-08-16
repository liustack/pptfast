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
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
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

/** A tool-call block carrying the structured payload (native mode). */
function blockWith(bundle: Bundle | null, previewId: string | null) {
  return {
    content: previewId ? [{ text: `deck ready\npptfast-preview:${previewId}\n` }] : [{ text: "deck ready" }],
    meta: bundle ? { card: "pptfast-preview", bundle } : undefined,
  }
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

  function openViewer(id = "abc") {
    const Card = makeCard()
    const view = render(<Card block={blockWith(bundleOf(nine()), id)} />)
    fireEvent.click(screen.getByText("Open"))
    return view
  }

  it("loads the deck's own preview.html instead of paging slides itself", () => {
    // The whole point of the change. That page already has a filmstrip,
    // ←/→, a light/dark surround and an audit panel, was written once and is
    // what every harness without a plugin UI is told to open. The card used
    // to run a thinner copy of it beside the original.
    const { container } = openViewer("abc123")

    expect(viewer(container)).toHaveAttribute("src", "/pptfast/preview/abc123/html")
    // None of the second implementation is left: no counter, no arrows...
    expect(screen.queryByText(/^\d+ \/ \d+/)).toBeNull()
    expect(screen.queryByText("←")).toBeNull()
    expect(screen.queryByText("→")).toBeNull()
    // ...and no second copy of any slide mounted next to the strip's nine.
    expect(container.querySelectorAll("svg")).toHaveLength(9)
  })

  it("opens the same viewer from any thumbnail", () => {
    // Thumbnails used to carry a start page into a React slideshow. The html
    // opens on page one whichever thumbnail was clicked, and that is the
    // whole of the behaviour now.
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf(nine()), "abc")} />)
    fireEvent.click(thumbnails(container)[4]!)
    expect(viewer(container)).toHaveAttribute("src", "/pptfast/preview/abc/html")
  })

  it("opens from the keyboard on the thumbnail that has focus", () => {
    // A thumbnail is a div with `role="button"` and `tabIndex`, which promises
    // the keyboard behaviour a real <button> would have given for free.
    for (const key of ["Enter", " "]) {
      const Card = makeCard()
      const { container, unmount } = render(<Card block={blockWith(bundleOf(nine()), "abc")} />)
      const thumb = thumbnails(container)[2]!
      expect(thumb).toHaveAttribute("tabIndex", "0")

      fireEvent.keyDown(thumb, { key })
      expect(viewer(container), key).not.toBeNull()
      unmount()
      cleanup()
    }
  })

  it("ignores the keys that are not an activation", () => {
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(bundleOf(nine()), "abc")} />)
    fireEvent.keyDown(thumbnails(container)[2]!, { key: "a" })
    fireEvent.keyDown(thumbnails(container)[2]!, { key: "Tab" })
    expect(viewer(container)).toBeNull()
  })

  it("closes on Escape", () => {
    const { container } = openViewer()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(viewer(container)).toBeNull()
  })

  it("closes on Escape pressed inside the frame, where the deck actually has focus", () => {
    // The keystroke a reader really makes: they click the deck first, so the
    // keydown lands on the frame's own document and never reaches this one.
    // Listen on the outer document alone and Escape stops working the moment
    // the viewer is touched, which is the only moment it is wanted.
    const { container } = openViewer()
    const frame = viewer(container)!
    fireEvent.load(frame)
    const inner = frame.contentDocument!
    expect(inner).toBeTruthy()

    fireEvent.keyDown(inner, { key: "Escape" })
    expect(viewer(container)).toBeNull()
  })

  it("closes on the Close button", () => {
    const { container } = openViewer()
    fireEvent.click(screen.getByText("Close"))
    expect(viewer(container)).toBeNull()
  })

  it("closes on a click on the backdrop, but never on one on the deck", () => {
    const { container } = openViewer()
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

  it("stays closed once it is closed", () => {
    const { container } = openViewer()
    fireEvent.keyDown(document, { key: "Escape" })
    // Keys that land after the viewer is gone belong to the page, not to it.
    expect(() => fireEvent.keyDown(document, { key: "Escape" })).not.toThrow()
    expect(viewer(container)).toBeNull()
  })

  it("keeps the download inside the viewer, since the html cannot offer it", async () => {
    // The one card ability the page has no way to reach: it is a static file
    // on a route of its own, with no idea an export exists.
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(["deck"]) })
    openViewer("abc123")

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

  it("stays quiet when the route 404s", async () => {
    respondWith({})
    const Card = makeCard()
    const { container } = render(<Card block={blockWith(null, "missing")} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/pptfast/preview/missing"))
    expect(container).toBeEmptyDOMElement()
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
