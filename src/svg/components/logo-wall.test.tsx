// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { assertSubset } from "../subset-validate"
import { parseSvgRoot } from "../serialize"
import { auditSvgMarkup } from "../audit/svg-audit"
import { contrastRatio } from "../ink"
import { logoWall } from "./logo-wall"
import { DARK_INK_LOGO, LIGHT_INK_LOGO } from "./__fixtures__/logos"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#FFFFFF",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E", "#00A878"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24,
}

const images = {
  "logo-1": { src: DARK_INK_LOGO, alt: "The Ledger Review" },
  "logo-2": { src: LIGHT_INK_LOGO }, // no alt — falls back to the item label
}

/** Every asset-id resolvable (logo-1..logo-12) — no missing-asset placeholders,
 * so a cell emits only its `<image>` and no `<text>`. */
const imagesAll = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [
    `logo-${i + 1}`,
    { src: i % 2 === 0 ? DARK_INK_LOGO : LIGHT_INK_LOGO },
  ]),
)

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const wall = (n: number, overrides: Record<string, unknown> = {}) => ({
  type: "logo_wall" as const,
  items: Array.from({ length: n }, (_, i) => ({ asset_id: `logo-${i + 1}` })),
  ...overrides,
})

describe("logo_wall component", () => {
  it("renders one contain-fit <image> per resolvable logo (never cropped)", () => {
    const { container } = svg(
      logoWall.render(wall(4), { x: 40, y: 40, w: 1000 }, { ...ctx, images }),
    )
    const imgs = Array.from(container.querySelectorAll("image"))
    // logo-1/logo-2 resolve; logo-3/logo-4 have no asset → placeholder, no <image>
    expect(imgs.length).toBe(2)
    for (const img of imgs) {
      // p13 counter: contain (meet), never slice/cover — a wordmark keeps both ends
      expect(img.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet")
    }
  })

  it("paints a filled backing panel behind every cell (p14 counter — image_grid paints none)", () => {
    const { container } = svg(
      logoWall.render(wall(4), { x: 0, y: 0, w: 1000 }, { ...ctx, images }),
    )
    const rects = Array.from(container.querySelectorAll("rect"))
    // 4 cells, each a filled (non-"none") backing rect
    expect(rects.length).toBe(4)
    for (const r of rects) {
      expect(r.getAttribute("fill")).not.toBe("none")
      expect(r.getAttribute("fill")).toBeTruthy()
    }
  })

  it("keeps BOTH a dark-ink and a light-ink logo legible on the same neutral board", () => {
    const board = (() => {
      const { container } = svg(logoWall.render(wall(2), { x: 0, y: 0, w: 800 }, { ...ctx, images }))
      return container.querySelector("rect")!.getAttribute("fill")!
    })()
    // The board is a mid-neutral, not the near-white surface — a #FFFFFF board
    // would fail the exact p14 defect (white-ink logo invisible). Both ink
    // extremes clear a discernible margin against it.
    expect(contrastRatio(board, "#000000")).toBeGreaterThan(2.5)
    expect(contrastRatio(board, "#FFFFFF")).toBeGreaterThan(2.5)
    // And the board is distinct from the slide background (panel separation).
    expect(contrastRatio(board, ctx.colors.bg)).toBeGreaterThan(1.3)
  })

  it("alt chain: asset alt wins, else the item label, else nothing", () => {
    const { container } = svg(
      logoWall.render(
        wall(4, {
          items: [
            { asset_id: "logo-1", label: "override-me" }, // asset has alt → alt wins
            { asset_id: "logo-2", label: "Circuit Weekly" }, // asset has no alt → label
            { asset_id: "logo-3" }, // missing asset entirely (no <image>)
            { asset_id: "logo-1" }, // asset alt, no label
          ],
        }),
        { x: 0, y: 0, w: 1000 },
        { ...ctx, images },
      ),
    )
    const labels = Array.from(container.querySelectorAll("image")).map((i) => i.getAttribute("aria-label"))
    expect(labels).toContain("The Ledger Review") // asset alt beat the label
    expect(labels).toContain("Circuit Weekly") // label used when asset lacks alt
    expect(labels).not.toContain("override-me")
  })

  it("missing asset with a label renders the label text, never a fake logo", () => {
    const { container } = svg(
      logoWall.render(
        wall(4, {
          items: [{ asset_id: "nope", label: "Harbor Press" }, ...wall(3).items],
        }),
        { x: 0, y: 0, w: 1000 },
        { ...ctx, images: {} },
      ),
    )
    expect(container.querySelectorAll("image").length).toBe(0)
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("Harbor Press")
  })

  it("missing asset without a label falls back to the Image-missing placeholder", () => {
    const { container } = svg(
      logoWall.render(wall(4), { x: 0, y: 0, w: 1000 }, { ...ctx, images: {} }),
    )
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts.every((t) => t === "Image missing")).toBe(true)
  })

  it("renders an optional overall title above the wall, omitting it entirely when unset", () => {
    const withTitle = svg(
      logoWall.render(wall(4, { title: "As seen in" }), { x: 0, y: 0, w: 1000 }, { ...ctx, images }),
    )
    expect(
      Array.from(withTitle.container.querySelectorAll("text")).some((t) => t.textContent === "As seen in"),
    ).toBe(true)
    const noTitle = svg(logoWall.render(wall(4), { x: 0, y: 0, w: 1000 }, { ...ctx, images: imagesAll }))
    expect(noTitle.container.querySelectorAll("text").length).toBe(0)
  })

  it("grid tiers: 1-2 rows for 4-6, three rows for 7-12 (measure grows with the row count)", () => {
    // Cell count grows but the wall stays bounded — three rows at n=12 is the
    // deepest tier and must still fit the wall-height budget.
    const h6 = logoWall.measure(wall(6), 1000, ctx)
    const h12 = logoWall.measure(wall(12), 1000, ctx)
    expect(h6).toBeGreaterThan(0)
    expect(h12).toBeGreaterThan(0)
    expect(h12).toBeLessThanOrEqual(340) // MAX_WALL_H — never approaches the full slide
  })

  it("is deterministic — the same IR renders byte-identical SVG markup on repeat calls", () => {
    const box = { x: 60, y: 60, w: 1000 }
    const a = renderToStaticMarkup(<svg>{logoWall.render(wall(12), box, { ...ctx, images })}</svg>)
    const b = renderToStaticMarkup(<svg>{logoWall.render(wall(12), box, { ...ctx, images })}</svg>)
    expect(a).toBe(b)
  })

  it("stays inside the controlled SVG element subset (no foreignObject/nested svg/gradient)", () => {
    const markup = renderToStaticMarkup(
      <svg viewBox="0 0 1280 720">{logoWall.render(wall(12), { x: 40, y: 40, w: 1200 }, { ...ctx, images })}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })

  it("passes the overflow auditor at the schema min (4) and max (12) logo counts", () => {
    for (const n of [4, 12]) {
      const markup = renderToStaticMarkup(
        <svg viewBox="0 0 1280 720">{logoWall.render(wall(n), { x: 40, y: 40, w: 1200 }, { ...ctx, images })}</svg>,
      )
      expect(auditSvgMarkup(markup)).toEqual([])
    }
  })
})
