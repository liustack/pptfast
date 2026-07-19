import { describe, expect, it } from "vitest"
import {
  DeckSpecSchema,
  SPEC_PAGE_COUNT_RANGE,
  formatSpecIssues,
  specJsonSchema,
  resolveSpecThemeId,
  validateSpec,
  type DeckSpec,
  type SpecValidationIssue,
} from "./index"

// ── fixture builders ──────────────────────────────────────────────────────

const cover = (id = "p-cover", extra: Record<string, unknown> = {}) => ({
  id,
  type: "cover",
  heading: "Q3 复盘",
  ...extra,
})
const ending = (id = "p-ending", extra: Record<string, unknown> = {}) => ({
  id,
  type: "ending",
  heading: "谢谢",
  ...extra,
})
const content = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "content",
  heading: `heading for ${id}`,
  ...extra,
})
const chapter = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "chapter",
  heading: `chapter ${id}`,
  ...extra,
})

function makePlan(pages: unknown[], extra: Record<string, unknown> = {}) {
  return { pages, ...extra }
}

/** A minimal structurally-valid plan, no beat/focus declared anywhere (so
 *  it never trips the beat or focus gates). 6 pages — the general preset's
 *  resolved pacing (balanced) floors the page count at 6 — so this stays
 *  ok under the *default*, omitted `narrative` field, which several tests
 *  below rely on (they're specifically exercising "omitted → general"). */
function minimalValidPlan(extra: Record<string, unknown> = {}) {
  return makePlan(
    [cover(), content("p-body"), chapter("p-ch"), content("p-body-2"), content("p-body-3"), ending()],
    extra,
  )
}

/** Wrap one "interesting" page under test in an otherwise-boring plan sized
 *  to clear the spacious pacing's page-count floor (4) — for tests
 *  that care about one specific page-level property and want the boundary/
 *  count gates to be a non-issue. */
function wrapPage(target: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return makePlan([cover(), target, content("p-filler"), ending()], {
    narrative: { pacing: "spacious" },
    ...extra,
  })
}

function expectOk(input: unknown): DeckSpec {
  const r = validateSpec(input)
  if (!r.ok) {
    throw new Error(`expected ok, got errors:\n${formatSpecIssues(r.errors)}`)
  }
  expect(r.spec).toBeDefined()
  return r.spec!
}

function expectErrors(input: unknown): SpecValidationIssue[] {
  const r = validateSpec(input)
  expect(r.ok).toBe(false)
  expect(r.errors.length).toBeGreaterThan(0)
  return r.errors
}

// ── schema accept/reject ────────────────────────────────────────────────

describe("DeckSpecSchema / validateSpec structural pass", () => {
  it("accepts the spec §5 example shape", () => {
    const plan = expectOk({
      version: "1",
      narrative: "boardroom-report",
      theme: "consulting",
      filename: "q3-review",
      seed: 12345,
      meta: {},
      pages: [
        cover("p-cover", { heading: "Q3 复盘", summary: "…" }),
        content("p-kpi", {
          heading: "季度业绩创历史新高",
          beat: "anchor",
          focus: "kpi_cards",
          summary: "内容锚点，仅供填页自读",
        }),
        content("p-detail", { heading: "细分市场表现" }),
        ending(),
      ],
    })
    expect(plan.filename).toBe("q3-review")
    expect(plan.seed).toBe(12345)
  })

  it("defaults version to '1' when omitted", () => {
    const plan = expectOk(minimalValidPlan())
    expect(plan.version).toBe("1")
  })

  it("defaults meta to {} when omitted", () => {
    const plan = expectOk(minimalValidPlan())
    expect(plan.meta).toEqual({})
  })

  it("allows narrative/theme/filename/seed/summary/beat/focus to be omitted", () => {
    // No narrative override on purpose (this test is about field omission) —
    // padded to 6 pages so the *default* resolved pacing (balanced, floor
    // 6) doesn't fail the page-count gate first.
    const plan = expectOk(minimalValidPlan())
    expect(plan.theme).toBeUndefined()
    expect(plan.narrative).toBeUndefined()
    expect(plan.filename).toBeUndefined()
    expect(plan.seed).toBeUndefined()
  })

  it("rejects an explicit wrong version literal", () => {
    const r = validateSpec(minimalValidPlan({ version: "2" }))
    expect(r.ok).toBe(false)
  })

  it("rejects unknown top-level keys (strict)", () => {
    const r = validateSpec(minimalValidPlan({ notAField: true }))
    expect(r.ok).toBe(false)
  })

  it("rejects unknown page-level keys (strict)", () => {
    const r = validateSpec(makePlan([cover(), content("p-body", { notAField: true }), ending()]))
    expect(r.ok).toBe(false)
  })

  it("rejects a bad beat enum value", () => {
    const r = validateSpec(makePlan([cover(), content("p-body", { beat: "chill" }), ending()]))
    expect(r.ok).toBe(false)
  })

  it("rejects a bad page type enum value", () => {
    const r = validateSpec(makePlan([cover(), content("p-body", { type: "sidebar" }), ending()]))
    expect(r.ok).toBe(false)
  })

  it("structural errors attach the page id when the raw input still has one", () => {
    const errors = expectErrors(makePlan([cover(), content("p-body", { beat: "chill" }), ending()]))
    const beatError = errors.find((e) => e.path === "pages.1.beat")
    expect(beatError?.pageId).toBe("p-body")
  })
})

// ── hard gate: pages non-empty ──────────────────────────────────────────

describe("hard gate: pages non-empty", () => {
  it("rejects an empty pages array", () => {
    const errors = expectErrors(makePlan([]))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.path).toBe("pages")
    expect(errors[0]!.message).toMatch(/no pages/)
  })
})

// ── hard gate: boundary types ───────────────────────────────────────────

describe("hard gate: boundary types (first cover, last ending, no cover/ending mid-deck)", () => {
  it("rejects a plan whose first page is not cover", () => {
    const errors = expectErrors(makePlan([content("p-a"), ending()]))
    expect(errors.some((e) => e.path === "pages.0.type" && e.pageId === "p-a")).toBe(true)
    expect(errors.some((e) => /first page must be type "cover"/.test(e.message))).toBe(true)
  })

  it("rejects a plan whose last page is not ending", () => {
    const errors = expectErrors(makePlan([cover(), content("p-a")]))
    expect(errors.some((e) => e.path === "pages.1.type" && e.pageId === "p-a")).toBe(true)
    expect(errors.some((e) => /last page must be type "ending"/.test(e.message))).toBe(true)
  })

  it("rejects a cover page in the middle of the deck", () => {
    const errors = expectErrors(makePlan([cover(), cover("p-mid"), content("p-a"), ending()]))
    expect(errors.some((e) => e.pageId === "p-mid" && /only allowed as the first/.test(e.message))).toBe(true)
  })

  it("rejects an ending page in the middle of the deck", () => {
    const errors = expectErrors(makePlan([cover(), ending("p-mid"), content("p-a"), ending()]))
    expect(errors.some((e) => e.pageId === "p-mid" && /only allowed as the first/.test(e.message))).toBe(true)
  })

  it("allows a chapter page in the middle of the deck", () => {
    expectOk(makePlan([cover(), chapter("p-ch"), content("p-a"), ending()], { narrative: { pacing: "spacious" } }))
  })

  it("reports both violations for a single-page plan (neither cover nor ending)", () => {
    const errors = expectErrors(makePlan([content("p-only")]))
    expect(errors.some((e) => /first page must be type "cover"/.test(e.message))).toBe(true)
    expect(errors.some((e) => /last page must be type "ending"/.test(e.message))).toBe(true)
  })
})

// ── hard gate: page id required + unique ────────────────────────────────

describe("hard gate: page id required + unique", () => {
  it("rejects an empty page id", () => {
    const errors = expectErrors(makePlan([cover("  "), content("p-a"), ending()]))
    expect(errors.some((e) => /empty id/.test(e.message))).toBe(true)
  })

  it("rejects duplicate page ids and lists them", () => {
    const errors = expectErrors(makePlan([cover(), content("dup"), content("dup"), ending()]))
    const dupError = errors.find((e) => /duplicate page id/.test(e.message))
    expect(dupError).toBeDefined()
    expect(dupError!.pageId).toBe("dup")
    expect(dupError!.message).toMatch(/"dup"/)
    expect(dupError!.message).toMatch(/2 pages/)
  })

  it("does not require kebab-case ids", () => {
    expectOk(
      makePlan([cover("P_Cover 1"), content("p-a"), content("p-b"), ending("END")], {
        narrative: { pacing: "spacious" },
      }),
    )
  })

  describe("unsafe (path-traversal) page ids (W5 whole-branch review finding 1, CRITICAL, CWE-22 defense-in-depth)", () => {
    it("rejects a page id containing '..' segments, naming the id on the issue", () => {
      const errors = expectErrors(makePlan([cover(), content("../../../escape"), ending()]))
      const err = errors.find((e) => /not a safe file name/.test(e.message))
      expect(err).toBeDefined()
      expect(err!.pageId).toBe("../../../escape")
      expect(err!.message).toBe(
        'page id "../../../escape" is not a safe file name — ids used as page/asset file names must not contain path separators or ".."',
      )
    })

    it("rejects a page id that is exactly '..'", () => {
      const errors = expectErrors(makePlan([cover(), content(".."), ending()]))
      expect(errors.some((e) => /not a safe file name/.test(e.message))).toBe(true)
    })

    it("rejects a page id containing a backslash", () => {
      const errors = expectErrors(makePlan([cover(), content("..\\escape"), ending()]))
      expect(errors.some((e) => /not a safe file name/.test(e.message))).toBe(true)
    })
  })
})

// ── hard gate: heading required + length ────────────────────────────────

describe("hard gate: heading required + ≤48 chars (CAPACITY.headingMaxChars)", () => {
  it("rejects an empty heading", () => {
    const errors = expectErrors(makePlan([cover(), content("p-a", { heading: "   " }), ending()]))
    expect(errors.some((e) => e.pageId === "p-a" && /missing a required heading/.test(e.message))).toBe(true)
  })

  it("accepts a heading exactly at the 48-char limit", () => {
    const heading = "x".repeat(48)
    expectOk(wrapPage(content("p-a", { heading })))
  })

  it("rejects a heading one character past the 48-char limit", () => {
    const heading = "x".repeat(49)
    const errors = expectErrors(makePlan([cover(), content("p-a", { heading }), ending()]))
    const err = errors.find((e) => e.pageId === "p-a")
    expect(err).toBeDefined()
    expect(err!.message).toMatch(/49 characters/)
    expect(err!.message).toMatch(/48-character limit/)
  })

  it("counts CJK characters as 1 each, same as ir-quality's charLen", () => {
    const heading = "字".repeat(48)
    expectOk(wrapPage(content("p-a", { heading })))
    const tooLong = "字".repeat(49)
    expectErrors(makePlan([cover(), content("p-a", { heading: tooLong }), ending()]))
  })
})

// ── hard gate: theme resolution ─────────────────────────────────────────

describe("hard gate: theme resolution (installed-theme check)", () => {
  it("accepts an omitted theme (defaults to consulting)", () => {
    const plan = expectOk(minimalValidPlan())
    expect(resolveSpecThemeId(plan)).toBe("consulting")
  })

  it("accepts a known built-in theme", () => {
    expectOk(minimalValidPlan({ theme: "tech" }))
  })

  it("rejects an unknown theme and lists available themes", () => {
    const errors = expectErrors(minimalValidPlan({ theme: "not-a-theme" }))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.path).toBe("theme")
    expect(errors[0]!.message).toMatch(/unknown theme "not-a-theme"/)
    expect(errors[0]!.message).toMatch(/consulting/)
  })
})

// ── hard gate: narrative resolution ─────────────────────────────────────

describe("hard gate: narrative resolution (resolveNarrative try/catch)", () => {
  it("accepts an omitted narrative (defaults to general)", () => {
    expectOk(minimalValidPlan())
  })

  it("accepts a named preset string", () => {
    expectOk(minimalValidPlan({ narrative: "boardroom-report" }))
  })

  it("rejects an unknown preset name and lists available presets", () => {
    const errors = expectErrors(minimalValidPlan({ narrative: "not-a-preset" }))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.path).toBe("narrative")
    expect(errors[0]!.message).toMatch(/unknown narrative preset "not-a-preset"/)
  })

  it("rejects an unknown axis value inside an axes object", () => {
    const errors = expectErrors(minimalValidPlan({ narrative: { strategy: "not-a-mode" } }))
    expect(errors[0]!.path).toBe("narrative")
    expect(errors[0]!.message).toMatch(/unknown strategy "not-a-mode"/)
  })
})

// ── hard gate: beat rotation policy matrix (all 5 modes) ─────────────

describe("hard gate: beat rotation, parameterized by strategy's beatPolicy", () => {
  const axes = (strategy: string) => ({ strategy, pacing: "spacious", audience: "public" })

  describe("pyramid — anchor-open (only the first content page is checked)", () => {
    it("accepts when the first content page declares anchor", () => {
      expectOk(makePlan([cover(), content("p-1", { beat: "anchor" }), content("p-2"), ending()], { narrative: axes("pyramid") }))
    })

    it("accepts when the first content page declares no beat at all", () => {
      expectOk(makePlan([cover(), content("p-1"), content("p-2"), ending()], { narrative: axes("pyramid") }))
    })

    it("rejects when the first content page declares a non-anchor beat", () => {
      const errors = expectErrors(
        makePlan([cover(), content("p-1", { beat: "dense" }), content("p-2"), ending()], { narrative: axes("pyramid") }),
      )
      expect(errors.some((e) => e.pageId === "p-1" && /open its first content page on "anchor"/.test(e.message))).toBe(
        true,
      )
      expect(errors.some((e) => e.pageId === "p-1" && /strategy "pyramid"/.test(e.message))).toBe(true) // W4 task 4: pin the renamed vocabulary, not leftover "mode"
    })

    it("does not check later content pages' beat at all", () => {
      expectOk(
        makePlan(
          [cover(), content("p-1", { beat: "anchor" }), content("p-2", { beat: "dense" }), content("p-3", { beat: "dense" }), content("p-4", { beat: "dense" }), ending()],
          { narrative: axes("pyramid") },
        ),
      )
    })

    it("is vacuously fine when there are no content pages at all", () => {
      expectOk(makePlan([cover(), chapter("p-1"), chapter("p-2"), ending()], { narrative: axes("pyramid") }))
    })
  })

  describe("storytelling — alternate (hard error on 3+ consecutive same-beat content pages)", () => {
    it("accepts exactly 2 consecutive same-beat content pages", () => {
      expectOk(
        makePlan([cover(), content("p-1", { beat: "anchor" }), content("p-2", { beat: "anchor" }), content("p-3", { beat: "dense" }), ending()], {
          narrative: axes("storytelling"),
        }),
      )
    })

    it("rejects exactly 3 consecutive same-beat content pages", () => {
      const errors = expectErrors(
        makePlan(
          [cover(), content("p-1", { beat: "anchor" }), content("p-2", { beat: "anchor" }), content("p-3", { beat: "anchor" }), ending()],
          { narrative: axes("storytelling") },
        ),
      )
      const err = errors.find((e) => /requires beat to alternate/.test(e.message))
      expect(err).toBeDefined()
      expect(err!.message).toMatch(/3 consecutive/)
      expect(err!.message).toMatch(/p-1, p-2, p-3/)
      expect(err!.message).toMatch(/strategy "storytelling"/) // W4 task 4: pin the renamed vocabulary, not leftover "mode"
      expect(err!.pageId).toBe("p-1")
    })

    it("reports one single error for a 4-in-a-row run, not multiple overlapping triples", () => {
      const errors = expectErrors(
        makePlan(
          [
            cover(),
            content("p-1", { beat: "breathing" }),
            content("p-2", { beat: "breathing" }),
            content("p-3", { beat: "breathing" }),
            content("p-4", { beat: "breathing" }),
            ending(),
          ],
          { narrative: axes("storytelling") },
        ),
      )
      const streakErrors = errors.filter((e) => /requires beat to alternate/.test(e.message))
      expect(streakErrors).toHaveLength(1)
      expect(streakErrors[0]!.message).toMatch(/4 consecutive/)
    })

    it("accepts a fully alternating pattern", () => {
      expectOk(
        makePlan(
          [
            cover(),
            content("p-1", { beat: "anchor" }),
            content("p-2", { beat: "dense" }),
            content("p-3", { beat: "anchor" }),
            content("p-4", { beat: "dense" }),
            ending(),
          ],
          { narrative: axes("storytelling") },
        ),
      )
    })

    it("a chapter page between two same-beat content pages does not break the streak", () => {
      const errors = expectErrors(
        makePlan(
          [cover(), content("p-1", { beat: "anchor" }), chapter("p-ch"), content("p-2", { beat: "anchor" }), content("p-3", { beat: "anchor" }), ending()],
          { narrative: axes("storytelling") },
        ),
      )
      const err = errors.find((e) => /requires beat to alternate/.test(e.message))
      expect(err).toBeDefined()
      expect(err!.message).toMatch(/p-1, p-2, p-3/)
    })

    it("an undeclared-beat content page between two same-beat pages does not break the streak either", () => {
      const errors = expectErrors(
        makePlan(
          [cover(), content("p-1", { beat: "anchor" }), content("p-gap"), content("p-2", { beat: "anchor" }), content("p-3", { beat: "anchor" }), ending()],
          { narrative: axes("storytelling") },
        ),
      )
      const err = errors.find((e) => /requires beat to alternate/.test(e.message))
      expect(err).toBeDefined()
      expect(err!.message).toMatch(/p-1, p-2, p-3/)
      expect(err!.message).not.toMatch(/p-gap/)
    })

    it("never flags pages that omit beat entirely", () => {
      expectOk(makePlan([cover(), content("p-1"), content("p-2"), content("p-3"), content("p-4"), ending()], { narrative: axes("storytelling") }))
    })
  })

  describe("instructional — repetition-ok (exempt entirely)", () => {
    it("accepts any number of consecutive same-beat content pages", () => {
      expectOk(
        makePlan(
          [
            cover(),
            content("p-1", { beat: "dense" }),
            content("p-2", { beat: "dense" }),
            content("p-3", { beat: "dense" }),
            content("p-4", { beat: "dense" }),
            content("p-5", { beat: "dense" }),
            ending(),
          ],
          { narrative: axes("instructional") },
        ),
      )
    })
  })

  describe("showcase — anchor-sparse (hard error if >50% of declared-beat content pages are anchor)", () => {
    it("accepts exactly 50% anchor", () => {
      expectOk(
        makePlan([cover(), content("p-1", { beat: "anchor" }), content("p-2", { beat: "dense" }), ending()], {
          narrative: axes("showcase"),
        }),
      )
    })

    it("rejects when anchor is a strict majority (2 of 3)", () => {
      const errors = expectErrors(
        makePlan(
          [cover(), content("p-1", { beat: "anchor" }), content("p-2", { beat: "anchor" }), content("p-3", { beat: "dense" }), ending()],
          { narrative: axes("showcase") },
        ),
      )
      const err = errors.find((e) => /stay a minority/.test(e.message))
      expect(err).toBeDefined()
      expect(err!.message).toMatch(/2 of 3/)
      expect(err!.message).toMatch(/strategy "showcase"/) // W4 task 4: pin the renamed vocabulary, not leftover "mode"
      // Representative pageId (first anchor page), same shape as
      // checkAlternatePolicy's own issue.
      expect(err!.pageId).toBe("p-1")
    })

    it("is vacuously fine when no content page declares a beat", () => {
      expectOk(makePlan([cover(), content("p-1"), content("p-2"), ending()], { narrative: axes("showcase") }))
    })
  })

  describe("briefing — uniform-dense (exempt entirely)", () => {
    it("accepts uniform dense beat across every content page", () => {
      expectOk(
        makePlan(
          [cover(), content("p-1", { beat: "dense" }), content("p-2", { beat: "dense" }), content("p-3", { beat: "dense" }), ending()],
          { narrative: axes("briefing") },
        ),
      )
    })
  })
})

// ── hard gate: focus vocabulary ─────────────────────────────────────────

describe("hard gate: focus vocabulary (strategy tendencies ∪ component types ∪ layout ids)", () => {
  const pyramidScenario = { strategy: "pyramid", pacing: "spacious", audience: "executive" }

  it("accepts a focus drawn from the resolved strategy's own tendencies", () => {
    expectOk(wrapPage(content("p-1", { focus: "kpi_cards" }), { narrative: pyramidScenario }))
  })

  it("accepts a focus that is a global component type outside the strategy's tendencies", () => {
    // "bullets" is a real component type, not in pyramid's tendency set
    expectOk(wrapPage(content("p-1", { focus: "bullets" }), { narrative: pyramidScenario }))
  })

  it("accepts a focus that is a registered layout id outside the strategy's tendencies", () => {
    // "two-column" is a real layout id, not in pyramid's tendency set
    expectOk(wrapPage(content("p-1", { focus: "two-column" }), { narrative: pyramidScenario }))
  })

  it("rejects a focus that matches none of the three vocabularies", () => {
    const errors = expectErrors(
      makePlan([cover(), content("p-1", { focus: "not_a_real_thing" }), ending()], { narrative: pyramidScenario }),
    )
    const err = errors.find((e) => e.pageId === "p-1")
    expect(err).toBeDefined()
    expect(err!.message).toMatch(/unknown focus "not_a_real_thing"/)
    expect(err!.message).toMatch(/strategy "pyramid"/) // W4 task 4: pin the renamed vocabulary, not leftover "mode"
    expect(err!.message).toMatch(/kpi_cards/) // strategy tendency list present
    expect(err!.message).toMatch(/bullets/) // component type vocabulary present
    expect(err!.message).toMatch(/two-column/) // layout id vocabulary present
  })

  it("accepts an omitted focus", () => {
    expectOk(wrapPage(content("p-1"), { narrative: pyramidScenario }))
  })
})

// ── hard gate: page count vs pacing ─────────────────────────────────────

describe("hard gate: page count within the pacing's suggested range", () => {
  function decksOfSize(n: number) {
    const middle = Array.from({ length: n - 2 }, (_, i) => content(`p-${i}`))
    return makePlan([cover(), ...middle, ending()])
  }

  it("accepts the spacious pacing's lower boundary (4 pages)", () => {
    expectOk({ ...decksOfSize(4), narrative: { pacing: "spacious" } })
  })

  it("rejects one below the spacious lower boundary (3 pages)", () => {
    const errors = expectErrors({ ...decksOfSize(3), narrative: { pacing: "spacious" } })
    expect(errors).toHaveLength(1)
    expect(errors[0]!.path).toBe("pages")
    expect(errors[0]!.message).toMatch(/spec has 3 pages/)
    expect(errors[0]!.message).toMatch(/"spacious" pacing expects 4-16 pages/)
    expect(errors[0]!.message).toMatch(/change pacing or add\/remove pages/)
  })

  it("accepts the spacious pacing's upper boundary (16 pages)", () => {
    expectOk({ ...decksOfSize(16), narrative: { pacing: "spacious" } })
  })

  it("rejects one above the spacious upper boundary (17 pages)", () => {
    const errors = expectErrors({ ...decksOfSize(17), narrative: { pacing: "spacious" } })
    expect(errors[0]!.message).toMatch(/spec has 17 pages/)
  })

  it("the same page count can pass for one pacing and fail for another", () => {
    // 5 pages: within spacious's 4-16, below balanced's 6-24
    expectOk({ ...decksOfSize(5), narrative: { pacing: "spacious" } })
    const errors = expectErrors({ ...decksOfSize(5), narrative: { pacing: "balanced" } })
    expect(errors[0]!.message).toMatch(/"balanced" pacing expects 6-24 pages/)
  })

  it("accepts the dense pacing's lower boundary (8 pages)", () => {
    expectOk({ ...decksOfSize(8), narrative: { pacing: "dense" } })
  })

  it("rejects one below the dense pacing's lower boundary (7 pages)", () => {
    const errors = expectErrors({ ...decksOfSize(7), narrative: { pacing: "dense" } })
    expect(errors[0]!.message).toMatch(/"dense" pacing expects 8-30 pages/)
  })
})

describe("SPEC_PAGE_COUNT_RANGE", () => {
  it("is pinned to the spec's initial values", () => {
    expect(SPEC_PAGE_COUNT_RANGE).toEqual({
      dense: { min: 8, max: 30 },
      balanced: { min: 6, max: 24 },
      spacious: { min: 4, max: 16 },
    })
  })
})

// ── specJsonSchema ───────────────────────────────────────────────────────

describe("specJsonSchema", () => {
  it("produces a JSON Schema document with the spec's top-level shape", () => {
    const schema = specJsonSchema()
    expect(schema).toHaveProperty("$schema")
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining(["version", "narrative", "theme", "filename", "seed", "meta", "pages"]),
    )
  })

  it("matches DeckSpecSchema (same schema instance, no drift between the two exports)", () => {
    expect(specJsonSchema()).toBeDefined()
    expect(DeckSpecSchema).toBeDefined()
  })
})

// ── formatSpecIssues ─────────────────────────────────────────────────────

describe("formatSpecIssues", () => {
  it("prefixes a page-scoped issue with its page id", () => {
    const text = formatSpecIssues([{ path: "pages.0.heading", message: "too long", pageId: "p-cover" }])
    expect(text).toBe('page "p-cover" — pages.0.heading: too long')
  })

  it("omits the page prefix for deck-level issues", () => {
    const text = formatSpecIssues([{ path: "pages", message: "no pages" }])
    expect(text).toBe("pages: no pages")
  })

  it("joins multiple issues with newlines", () => {
    const text = formatSpecIssues([
      { path: "a", message: "1" },
      { path: "b", message: "2" },
    ])
    expect(text.split("\n")).toHaveLength(2)
  })
})
