/**
 * Revision-stability acceptance tests (wave W4, task 2 — spec's own
 * acceptance wording: "改标题/插页不扰动其他页选型", editing a heading or
 * inserting a page must not disturb other pages' auto-selected layout).
 * `assemble.test.ts`'s own "materializes effective layouts" block covers the
 * *mechanics* of materialization (one `assembleDeck` call, does it write the
 * right thing) — this file covers the *stability* property across repeated
 * `assembleDeck` calls on an edited plan, which is the actual thing W4's
 * seed-ladder redesign (design decisions 2 + 3) and adjacent-anti-repetition
 * (design decision 4) exist to guarantee.
 *
 * All four scenarios share one 8-page fixture (`basePages`): a cover, six
 * content pages, and an ending — enough interior pages that the mid-deck
 * insertion scenario has real room on both sides of the insertion point to
 * show "the disturbance stays local," not just assert it by definition on a
 * too-small deck.
 */
import { describe, expect, it } from "vitest"
import type { PptxIR } from "../ir"
import { assembleDeck, type PageContent } from "./assemble"

// ── fixtures ─────────────────────────────────────────────────────────────

function basePages(): Record<string, unknown>[] {
  return [
    { id: "p-cover", type: "cover", heading: "Cover" },
    { id: "p-1", type: "content", heading: "One" },
    { id: "p-2", type: "content", heading: "Two" },
    { id: "p-3", type: "content", heading: "Three" },
    { id: "p-4", type: "content", heading: "Four" },
    { id: "p-5", type: "content", heading: "Five" },
    { id: "p-6", type: "content", heading: "Six" },
    { id: "p-ending", type: "ending", heading: "Thanks" },
  ]
}

/** "spacious" pacing's 4-16 page-count floor is cleared by all 8 base
 *  pages (and by 9, once the insertion scenario adds one more) — same
 *  `narrative: { pacing: "spacious" }` shorthand `assemble.test.ts`'s
 *  own `makePlan` uses, which resolves to a beat policy every one of these
 *  fixtures' all-beat-omitted pages vacuously clears. */
function makePlan(pages: Record<string, unknown>[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: "1",
    narrative: { pacing: "spacious" },
    theme: "consulting",
    filename: "revision-stability-deck",
    pages,
    ...extra,
  }
}

/** Every page's materialized `layout`, keyed by id — order-independent so an
 *  insertion (which shifts every later page's array index) can still be
 *  compared page-by-page against the pre-insertion baseline. */
function layoutsById(ir: PptxIR): Record<string, string | undefined> {
  return Object.fromEntries(ir.slides.map((s) => [s.id as string, s.layout]))
}

// ── explicit seed: full revision stability (spec §6 seed ladder's top tier) ──

describe("explicit seed: revision stability", () => {
  it("editing one page's heading never changes any page's materialized layout", () => {
    const seed = 123456
    const { ir: before } = assembleDeck(makePlan(basePages(), { seed }), {})

    const editedPages = basePages()
    const p4 = editedPages.findIndex((p) => p.id === "p-4")
    editedPages[p4] = { ...editedPages[p4], heading: "Four (revised)" }
    const { ir: after } = assembleDeck(makePlan(editedPages, { seed }), {})

    // Sanity: the edit actually took effect (otherwise this test would prove
    // nothing).
    expect(before.slides.find((s) => s.id === "p-4")?.heading).toBe("Four")
    expect(after.slides.find((s) => s.id === "p-4")?.heading).toBe("Four (revised)")

    // The actual assertion: every page, including the edited one itself
    // (pageKey is `slide.id`, never heading text), keeps the exact same
    // materialized layout.
    expect(layoutsById(after)).toEqual(layoutsById(before))
  })

  it("declaring a beat on one page changes at most that page's own materialized layout, plus its immediate successor through the existing adjacent-anti-repetition channel (P1 variety wave, task 1)", () => {
    // Seed 2 (found by brute-force search over this exact fixture, same
    // method the insertion test below documents for its own seed, re-found
    // after the P1 fix round's max-composition change — see BEAT_TENDENCY_
    // WEIGHT's own doc comment, effective-layout.ts): declaring beat
    // "anchor" on p-2 flips p-2's own raw pick from "two-column" to
    // "rail-numbered" for this seed — neither id is in "anchor"'s own
    // tendency set (BEAT_TENDENCIES, effective-layout.ts), so this isn't
    // beat directly favoring the new pick. It's the standard weighted-
    // interval-sampling effect: boosting banner-heading/stacked-poster's own
    // weight (both now max(1,3)=3, up from strategy-only 1) shifts where
    // every other id's interval boundary falls for the same hash, the same
    // "changing one candidate's weight can flip a different candidate's
    // outcome" property `weightedPickBySeed` already has. p-3's redraw
    // decision is unaffected for this seed — proving both halves of this
    // test are load-bearing: the beat layer really does change the
    // declaring page's own pick, and that change really doesn't cascade
    // past the one page beat was declared on.
    const seed = 2
    const { ir: before } = assembleDeck(makePlan(basePages(), { seed }), {})
    const beforeLayouts = layoutsById(before)

    const beatedPages = basePages()
    const p2 = beatedPages.findIndex((p) => p.id === "p-2")
    beatedPages[p2] = { ...beatedPages[p2], beat: "anchor" }
    const { ir: after } = assembleDeck(makePlan(beatedPages, { seed }), {})
    const afterLayouts = layoutsById(after)

    // Non-vacuity: the beat declaration actually changed something.
    expect(afterLayouts["p-2"]).not.toBe(beforeLayouts["p-2"])

    // Every page except p-2 itself keeps the exact same materialized
    // layout — beat is per-page weighting, never a deck-wide reshuffle. p-1
    // (before p-2) is unaffected too (selection walks forward-only). p-3 is
    // in principle exempt (p-2's own pick changing could in turn flip p-3's
    // adjacent-anti-repetition redraw decision, the same existing channel
    // the insertion test below exercises) but for this seed happens not to
    // — asserted concretely, not just allowed to differ, since a beat
    // declaration that always cascaded to a redraw would still pass a
    // looser "p-3 exempt" assertion without this line.
    const exempt = new Set(["p-2"])
    for (const id of Object.keys(beforeLayouts)) {
      if (exempt.has(id)) continue
      expect(afterLayouts[id], `page "${id}" changed after declaring p-2's beat — should be unaffected`).toBe(
        beforeLayouts[id],
      )
    }
  })

  it("inserting a new page mid-deck only disturbs the new page and its immediate successor", () => {
    // Seed 3 (found by brute-force search over this exact fixture) is used
    // here instead of the heading-edit test's seed *because* it actually
    // exercises the redraw: p-4's raw pick collides with p-new's effective
    // id post-insertion where it didn't collide with p-3's pre-insertion, so
    // p-4 concretely changes — proving this test's exemption is load-bearing,
    // not a vacuously-unused allowance. Any seed would do for the "nothing
    // *else* changes" half of this test.
    const seed = 3
    const { ir: before } = assembleDeck(makePlan(basePages(), { seed }), {})
    const beforeLayouts = layoutsById(before)

    const insertedPages = basePages()
    const insertAt = insertedPages.findIndex((p) => p.id === "p-4")
    insertedPages.splice(insertAt, 0, { id: "p-new", type: "content", heading: "New Page" })
    const { ir: after } = assembleDeck(makePlan(insertedPages, { seed }), {})
    const afterLayouts = layoutsById(after)

    // p-4 is the inserted page's immediate successor (was at `insertAt`,
    // shifted one slot later) — its own raw pick is unaffected (id-keyed
    // salt), but its adjacent-anti-repetition *input* changed (previous
    // slide is now p-new, not p-3), so its redraw decision flips for this
    // seed. Asserted concretely (not just "allowed to differ") so this test
    // actually demonstrates the boundary the spec draws, not just declares
    // an unexercised exemption.
    expect(afterLayouts["p-4"]).not.toBe(beforeLayouts["p-4"])

    const exempt = new Set(["p-new", "p-4"])
    for (const id of Object.keys(beforeLayouts)) {
      if (exempt.has(id)) continue
      expect(afterLayouts[id], `page "${id}" changed after inserting p-new — should be unaffected`).toBe(
        beforeLayouts[id],
      )
    }
    // The new page itself has no baseline to compare against — just confirm
    // it got a real materialized layout like everything else.
    expect(afterLayouts["p-new"]).toEqual(expect.any(String))
  })
})

// ── no seed (djb2-generated): documented, narrower scope (spec §6: "确定性 ≠ 修订稳定性") ──

describe("no seed (djb2-generated): documented scope", () => {
  it("editing one page's heading keeps the generated seed — and every layout — stable (generateSeed hashes ids, never heading text)", () => {
    const { ir: before, generatedSeed: seedBefore } = assembleDeck(makePlan(basePages()), {})

    const editedPages = basePages()
    const p4 = editedPages.findIndex((p) => p.id === "p-4")
    editedPages[p4] = { ...editedPages[p4], heading: "Four (revised)" }
    const { ir: after, generatedSeed: seedAfter } = assembleDeck(makePlan(editedPages), {})

    expect(seedAfter).toBe(seedBefore)
    expect(layoutsById(after)).toEqual(layoutsById(before))
  })

  it("inserting a new page changes the generated seed — revision stability is not promised without an explicit seed", () => {
    const { generatedSeed: seedBefore } = assembleDeck(makePlan(basePages()), {})

    const insertedPages = basePages()
    const insertAt = insertedPages.findIndex((p) => p.id === "p-4")
    insertedPages.splice(insertAt, 0, { id: "p-new", type: "content", heading: "New Page" })
    const { generatedSeed: seedAfter } = assembleDeck(makePlan(insertedPages), {})

    // The documenting assertion for this scenario (spec's own parenthetical:
    // "插页允许重排（生成 seed 变了）"): unlike the explicit-seed case above,
    // the seed itself is a function of the page-id sequence
    // (`generateSeed`'s own doc comment, `./assemble.ts`), so inserting a
    // page changes the seed every *other* page's weighted pick is salted
    // with — a deck-wide perturbation, not the explicit-seed case's
    // local-only anti-repetition ripple. Whether any *specific* page's
    // layout actually flips depends on where its salted draw happens to land
    // against the new seed, which is exactly why this scenario is
    // "may reshuffle," not "will reshuffle at position N" — the seed change
    // itself is the one deterministic, always-true fact to pin here.
    expect(seedAfter).not.toBe(seedBefore)
  })
})

// ── determinism (spec §6's baseline: same inputs, byte-identical output) ──

describe("determinism", () => {
  it("assembling the same plan and pages twice produces byte-identical deck.json output (explicit seed)", () => {
    const plan = makePlan(basePages(), { seed: 42 })
    const pages: Record<string, PageContent> = { "p-2": { footnote: "unaudited" } }
    const a = assembleDeck(plan, pages)
    const b = assembleDeck(plan, pages)
    expect(JSON.stringify(a.ir, null, 2)).toBe(JSON.stringify(b.ir, null, 2))
  })

  it("also holds when the plan omits seed — generated-seed determinism carries through materialization", () => {
    const plan = makePlan(basePages())
    const a = assembleDeck(plan, {})
    const b = assembleDeck(plan, {})
    expect(a.generatedSeed).toBe(b.generatedSeed)
    expect(JSON.stringify(a.ir, null, 2)).toBe(JSON.stringify(b.ir, null, 2))
  })
})
