// @vitest-environment node
//
// Guards on the two-part page fingerprint (`splitPaint`, `verdictFreshness`).
//
// Verdicts persist across gallery runs, and until now a single whole-markup
// hash decided whether one still applied. A theme redesign therefore
// invalidated the lot: the 2026-08-19 round came back with seven of thirty
// judgements marked stale, every one of them about geometry that had not
// moved, and a human re-made them by hand. Splitting the hash is what lets a
// re-run say "only the paint changed" — so the thing worth testing is that
// the split holds against a *real* recolor through the real render chain,
// not against a string the test recolored itself.

import { describe, expect, it } from "vitest"
import { renderSlideSvg, validateIr } from "@/api"
import type { PptxIR } from "@/ir"
import { installNodePlatform } from "@/platform/node"
import { splitPaint, verdictFreshness } from "./render"

await installNodePlatform()

function deck(style?: Record<string, unknown>): PptxIR {
  const ir = {
    version: "4",
    filename: "fingerprint-probe",
    theme: style ? { id: "consulting", style } : { id: "consulting" },
    slides: [
      {
        type: "content",
        heading: "指纹拆分",
        components: [
          {
            type: "bullets",
            items: ["第一条要点", "第二条要点写得长一点，好让排版真的换行", "第三条要点"],
          },
        ],
      },
    ],
  }
  const v = validateIr(ir)
  if (!v.ok) throw new Error(v.errors.map((e) => `${e.path}: ${e.message}`).join("; "))
  return v.ir!
}

const render = (ir: PptxIR) => renderSlideSvg(ir, 0)

describe("splitPaint, against a real recolor", () => {
  const plain = render(deck())
  const recolored = render(deck({ colors: { primary: "#7A1F3D", accent: "#0E7C66" } }))

  it("is measuring two genuinely different renders", () => {
    // Without this the rest of the block would pass just as well on a
    // no-op override.
    expect(recolored).not.toBe(plain)
  })

  it("keeps the geometry hash across a recolor", () => {
    expect(splitPaint(recolored).geometry).toBe(splitPaint(plain).geometry)
  })

  it("moves the color hash across a recolor", () => {
    expect(splitPaint(recolored).color).not.toBe(splitPaint(plain).color)
  })

  it("moves the geometry hash when the content itself changes", () => {
    const ir = deck()
    ir.slides[0]!.heading = "指纹拆分，但这个标题长到得换行才放得下"
    expect(splitPaint(render(ir)).geometry).not.toBe(splitPaint(plain).geometry)
  })
})

describe("splitPaint", () => {
  it("drops paint values but keeps the attribute itself in the shape half", () => {
    // A recolor that *adds* paint where there was none is a shape change and
    // has to read as one — otherwise a new stroke appearing on every card
    // would come back labelled "only the palette moved".
    const a = splitPaint(`<svg><rect x="1" fill="#111"/></svg>`)
    const b = splitPaint(`<svg><rect x="1" fill="#eee"/></svg>`)
    const c = splitPaint(`<svg><rect x="1" fill="#111" stroke="#000"/></svg>`)
    expect(b.geometry).toBe(a.geometry)
    expect(b.color).not.toBe(a.color)
    expect(c.geometry).not.toBe(a.geometry)
  })

  it("counts opacity as paint and stroke width as shape", () => {
    const base = `<svg><path d="M0 0" stroke-width="2" opacity="0.4"/></svg>`
    const dimmer = `<svg><path d="M0 0" stroke-width="2" opacity="0.9"/></svg>`
    const thicker = `<svg><path d="M0 0" stroke-width="6" opacity="0.4"/></svg>`
    expect(splitPaint(dimmer).geometry).toBe(splitPaint(base).geometry)
    expect(splitPaint(thicker).geometry).not.toBe(splitPaint(base).geometry)
  })

  it("leaves type and layout annotations in the shape half", () => {
    // font-family/-size and the audit boxes are what geometry verdicts are
    // actually about; none of them may drift into the paint bucket.
    const a = `<svg><text font-size="20" data-audit-box="0,0,100" fill="#111">x</text></svg>`
    const b = `<svg><text font-size="28" data-audit-box="0,0,100" fill="#111">x</text></svg>`
    const c = `<svg><text font-size="20" data-audit-box="0,0,140" fill="#111">x</text></svg>`
    expect(splitPaint(b).geometry).not.toBe(splitPaint(a).geometry)
    expect(splitPaint(c).geometry).not.toBe(splitPaint(a).geometry)
  })
})

describe("verdictFreshness", () => {
  const page = { hash: "h1", fingerprint: { geometry: "g1", color: "c1" } }

  it("calls a verdict fresh when nothing moved", () => {
    expect(verdictFreshness({ hash: "h1", geo: "g1", col: "c1" }, page)).toBe("fresh")
  })

  it("calls it recolored when only the paint moved", () => {
    expect(verdictFreshness({ hash: "h0", geo: "g1", col: "c0" }, page)).toBe("recolored")
  })

  it("calls it stale when the geometry moved, whatever the paint did", () => {
    expect(verdictFreshness({ hash: "h0", geo: "g0", col: "c1" }, page)).toBe("stale")
    expect(verdictFreshness({ hash: "h0", geo: "g0", col: "c0" }, page)).toBe("stale")
  })

  describe("verdicts recorded before the split", () => {
    // They carry one whole-markup hash and no way to tell a recolor from a
    // redraw. Guessing on their behalf would hand the reviewer a confident
    // "only the palette moved" the data cannot support, so they keep the old
    // all-or-nothing rule until they are re-stamped.
    it("keeps the old all-or-nothing rule", () => {
      expect(verdictFreshness({ hash: "h1" }, page)).toBe("fresh")
      expect(verdictFreshness({ hash: "h0" }, page)).toBe("stale")
    })

    it("does not upgrade a single-hash mismatch to a recolor", () => {
      expect(verdictFreshness({ hash: "h0" }, page)).not.toBe("recolored")
    })
  })

  it("falls back to the whole-markup hash for a page that has no split yet", () => {
    // A manifest written by an older gallery run, opened in a newer page.
    expect(verdictFreshness({ hash: "h1", geo: "g1", col: "c1" }, { hash: "h1" })).toBe("fresh")
    expect(verdictFreshness({ hash: "h0", geo: "g1", col: "c1" }, { hash: "h1" })).toBe("stale")
  })

  it("says nothing about a page it has never seen", () => {
    // A page id in storage that this run did not render — narrowing the
    // matrix with --only should not repaint every absent card as stale.
    expect(verdictFreshness({ hash: "h0", geo: "g0" }, undefined)).toBe("fresh")
    expect(verdictFreshness(undefined, page)).toBe("fresh")
  })

  it("is self-contained enough to survive being shipped into the review page", () => {
    // html.ts embeds this function's own source rather than restating the
    // rule. A module reference in its body would be a ReferenceError there
    // and nowhere else.
    const body = verdictFreshness.toString()
    expect(body).not.toContain("import ")
    expect(body).not.toContain("require(")
  })
})
