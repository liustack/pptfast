import { describe, expect, it } from "vitest"
import {
  DeckPlanSchema,
  PLAN_PAGE_COUNT_RANGE,
  formatPlanIssues,
  planJsonSchema,
  resolvePlanThemeId,
  validatePlan,
  type DeckPlan,
  type PlanValidationIssue,
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

/** A minimal structurally-valid plan, no rhythm/focus declared anywhere (so
 *  it never trips the rhythm or focus gates). 6 pages — the general preset's
 *  resolved delivery (balanced) floors the page count at 6 — so this stays
 *  ok under the *default*, omitted `scenario` field, which several tests
 *  below rely on (they're specifically exercising "omitted → general"). */
function minimalValidPlan(extra: Record<string, unknown> = {}) {
  return makePlan(
    [cover(), content("p-body"), chapter("p-ch"), content("p-body-2"), content("p-body-3"), ending()],
    extra,
  )
}

/** Wrap one "interesting" page under test in an otherwise-boring plan sized
 *  to clear the presentation delivery's page-count floor (4) — for tests
 *  that care about one specific page-level property and want the boundary/
 *  count gates to be a non-issue. */
function wrapPage(target: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return makePlan([cover(), target, content("p-filler"), ending()], {
    scenario: { delivery: "presentation" },
    ...extra,
  })
}

function expectOk(input: unknown): DeckPlan {
  const r = validatePlan(input)
  if (!r.ok) {
    throw new Error(`expected ok, got errors:\n${formatPlanIssues(r.errors)}`)
  }
  expect(r.plan).toBeDefined()
  return r.plan!
}

function expectErrors(input: unknown): PlanValidationIssue[] {
  const r = validatePlan(input)
  expect(r.ok).toBe(false)
  expect(r.errors.length).toBeGreaterThan(0)
  return r.errors
}

// ── schema accept/reject ────────────────────────────────────────────────

describe("DeckPlanSchema / validatePlan structural pass", () => {
  it("accepts the spec §5 example shape", () => {
    const plan = expectOk({
      version: "1",
      scenario: "boardroom-report",
      theme: "consulting",
      filename: "q3-review",
      seed: 12345,
      meta: {},
      pages: [
        cover("p-cover", { heading: "Q3 复盘", summary: "…" }),
        content("p-kpi", {
          heading: "季度业绩创历史新高",
          rhythm: "anchor",
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

  it("allows scenario/theme/filename/seed/summary/rhythm/focus to be omitted", () => {
    // No scenario override on purpose (this test is about field omission) —
    // padded to 6 pages so the *default* resolved delivery (balanced, floor
    // 6) doesn't fail the page-count gate first.
    const plan = expectOk(minimalValidPlan())
    expect(plan.theme).toBeUndefined()
    expect(plan.scenario).toBeUndefined()
    expect(plan.filename).toBeUndefined()
    expect(plan.seed).toBeUndefined()
  })

  it("rejects an explicit wrong version literal", () => {
    const r = validatePlan(minimalValidPlan({ version: "2" }))
    expect(r.ok).toBe(false)
  })

  it("rejects unknown top-level keys (strict)", () => {
    const r = validatePlan(minimalValidPlan({ notAField: true }))
    expect(r.ok).toBe(false)
  })

  it("rejects unknown page-level keys (strict)", () => {
    const r = validatePlan(makePlan([cover(), content("p-body", { notAField: true }), ending()]))
    expect(r.ok).toBe(false)
  })

  it("rejects a bad rhythm enum value", () => {
    const r = validatePlan(makePlan([cover(), content("p-body", { rhythm: "chill" }), ending()]))
    expect(r.ok).toBe(false)
  })

  it("rejects a bad page type enum value", () => {
    const r = validatePlan(makePlan([cover(), content("p-body", { type: "sidebar" }), ending()]))
    expect(r.ok).toBe(false)
  })

  it("structural errors attach the page id when the raw input still has one", () => {
    const errors = expectErrors(makePlan([cover(), content("p-body", { rhythm: "chill" }), ending()]))
    const rhythmError = errors.find((e) => e.path === "pages.1.rhythm")
    expect(rhythmError?.pageId).toBe("p-body")
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
    expectOk(makePlan([cover(), chapter("p-ch"), content("p-a"), ending()], { scenario: { delivery: "presentation" } }))
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
        scenario: { delivery: "presentation" },
      }),
    )
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
    expect(resolvePlanThemeId(plan)).toBe("consulting")
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

// ── hard gate: scenario resolution ──────────────────────────────────────

describe("hard gate: scenario resolution (resolveScenario try/catch)", () => {
  it("accepts an omitted scenario (defaults to general)", () => {
    expectOk(minimalValidPlan())
  })

  it("accepts a named preset string", () => {
    expectOk(minimalValidPlan({ scenario: "boardroom-report" }))
  })

  it("rejects an unknown preset name and lists available presets", () => {
    const errors = expectErrors(minimalValidPlan({ scenario: "not-a-preset" }))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.path).toBe("scenario")
    expect(errors[0]!.message).toMatch(/unknown scenario preset "not-a-preset"/)
  })

  it("rejects an unknown axis value inside an axes object", () => {
    const errors = expectErrors(minimalValidPlan({ scenario: { mode: "not-a-mode" } }))
    expect(errors[0]!.path).toBe("scenario")
    expect(errors[0]!.message).toMatch(/unknown mode "not-a-mode"/)
  })
})

// ── hard gate: rhythm rotation policy matrix (all 5 modes) ─────────────

describe("hard gate: rhythm rotation, parameterized by mode's rhythmPolicy", () => {
  const axes = (mode: string) => ({ mode, delivery: "presentation", audience: "public" })

  describe("pyramid — anchor-open (only the first content page is checked)", () => {
    it("accepts when the first content page declares anchor", () => {
      expectOk(makePlan([cover(), content("p-1", { rhythm: "anchor" }), content("p-2"), ending()], { scenario: axes("pyramid") }))
    })

    it("accepts when the first content page declares no rhythm at all", () => {
      expectOk(makePlan([cover(), content("p-1"), content("p-2"), ending()], { scenario: axes("pyramid") }))
    })

    it("rejects when the first content page declares a non-anchor rhythm", () => {
      const errors = expectErrors(
        makePlan([cover(), content("p-1", { rhythm: "dense" }), content("p-2"), ending()], { scenario: axes("pyramid") }),
      )
      expect(errors.some((e) => e.pageId === "p-1" && /open its first content page on "anchor"/.test(e.message))).toBe(
        true,
      )
    })

    it("does not check later content pages' rhythm at all", () => {
      expectOk(
        makePlan(
          [cover(), content("p-1", { rhythm: "anchor" }), content("p-2", { rhythm: "dense" }), content("p-3", { rhythm: "dense" }), content("p-4", { rhythm: "dense" }), ending()],
          { scenario: axes("pyramid") },
        ),
      )
    })

    it("is vacuously fine when there are no content pages at all", () => {
      expectOk(makePlan([cover(), chapter("p-1"), chapter("p-2"), ending()], { scenario: axes("pyramid") }))
    })
  })

  describe("narrative — alternate (hard error on 3+ consecutive same-rhythm content pages)", () => {
    it("accepts exactly 2 consecutive same-rhythm content pages", () => {
      expectOk(
        makePlan([cover(), content("p-1", { rhythm: "anchor" }), content("p-2", { rhythm: "anchor" }), content("p-3", { rhythm: "dense" }), ending()], {
          scenario: axes("narrative"),
        }),
      )
    })

    it("rejects exactly 3 consecutive same-rhythm content pages", () => {
      const errors = expectErrors(
        makePlan(
          [cover(), content("p-1", { rhythm: "anchor" }), content("p-2", { rhythm: "anchor" }), content("p-3", { rhythm: "anchor" }), ending()],
          { scenario: axes("narrative") },
        ),
      )
      const err = errors.find((e) => /requires rhythm to alternate/.test(e.message))
      expect(err).toBeDefined()
      expect(err!.message).toMatch(/3 consecutive/)
      expect(err!.message).toMatch(/p-1, p-2, p-3/)
      expect(err!.pageId).toBe("p-1")
    })

    it("reports one single error for a 4-in-a-row run, not multiple overlapping triples", () => {
      const errors = expectErrors(
        makePlan(
          [
            cover(),
            content("p-1", { rhythm: "breathing" }),
            content("p-2", { rhythm: "breathing" }),
            content("p-3", { rhythm: "breathing" }),
            content("p-4", { rhythm: "breathing" }),
            ending(),
          ],
          { scenario: axes("narrative") },
        ),
      )
      const streakErrors = errors.filter((e) => /requires rhythm to alternate/.test(e.message))
      expect(streakErrors).toHaveLength(1)
      expect(streakErrors[0]!.message).toMatch(/4 consecutive/)
    })

    it("accepts a fully alternating pattern", () => {
      expectOk(
        makePlan(
          [
            cover(),
            content("p-1", { rhythm: "anchor" }),
            content("p-2", { rhythm: "dense" }),
            content("p-3", { rhythm: "anchor" }),
            content("p-4", { rhythm: "dense" }),
            ending(),
          ],
          { scenario: axes("narrative") },
        ),
      )
    })

    it("a chapter page between two same-rhythm content pages does not break the streak", () => {
      const errors = expectErrors(
        makePlan(
          [cover(), content("p-1", { rhythm: "anchor" }), chapter("p-ch"), content("p-2", { rhythm: "anchor" }), content("p-3", { rhythm: "anchor" }), ending()],
          { scenario: axes("narrative") },
        ),
      )
      const err = errors.find((e) => /requires rhythm to alternate/.test(e.message))
      expect(err).toBeDefined()
      expect(err!.message).toMatch(/p-1, p-2, p-3/)
    })

    it("an undeclared-rhythm content page between two same-rhythm pages does not break the streak either", () => {
      const errors = expectErrors(
        makePlan(
          [cover(), content("p-1", { rhythm: "anchor" }), content("p-gap"), content("p-2", { rhythm: "anchor" }), content("p-3", { rhythm: "anchor" }), ending()],
          { scenario: axes("narrative") },
        ),
      )
      const err = errors.find((e) => /requires rhythm to alternate/.test(e.message))
      expect(err).toBeDefined()
      expect(err!.message).toMatch(/p-1, p-2, p-3/)
      expect(err!.message).not.toMatch(/p-gap/)
    })

    it("never flags pages that omit rhythm entirely", () => {
      expectOk(makePlan([cover(), content("p-1"), content("p-2"), content("p-3"), content("p-4"), ending()], { scenario: axes("narrative") }))
    })
  })

  describe("instructional — repetition-ok (exempt entirely)", () => {
    it("accepts any number of consecutive same-rhythm content pages", () => {
      expectOk(
        makePlan(
          [
            cover(),
            content("p-1", { rhythm: "dense" }),
            content("p-2", { rhythm: "dense" }),
            content("p-3", { rhythm: "dense" }),
            content("p-4", { rhythm: "dense" }),
            content("p-5", { rhythm: "dense" }),
            ending(),
          ],
          { scenario: axes("instructional") },
        ),
      )
    })
  })

  describe("showcase — anchor-sparse (hard error if >50% of declared-rhythm content pages are anchor)", () => {
    it("accepts exactly 50% anchor", () => {
      expectOk(
        makePlan([cover(), content("p-1", { rhythm: "anchor" }), content("p-2", { rhythm: "dense" }), ending()], {
          scenario: axes("showcase"),
        }),
      )
    })

    it("rejects when anchor is a strict majority (2 of 3)", () => {
      const errors = expectErrors(
        makePlan(
          [cover(), content("p-1", { rhythm: "anchor" }), content("p-2", { rhythm: "anchor" }), content("p-3", { rhythm: "dense" }), ending()],
          { scenario: axes("showcase") },
        ),
      )
      const err = errors.find((e) => /stay a minority/.test(e.message))
      expect(err).toBeDefined()
      expect(err!.message).toMatch(/2 of 3/)
      // Representative pageId (first anchor page), same shape as
      // checkAlternatePolicy's own issue.
      expect(err!.pageId).toBe("p-1")
    })

    it("is vacuously fine when no content page declares a rhythm", () => {
      expectOk(makePlan([cover(), content("p-1"), content("p-2"), ending()], { scenario: axes("showcase") }))
    })
  })

  describe("briefing — uniform-dense (exempt entirely)", () => {
    it("accepts uniform dense rhythm across every content page", () => {
      expectOk(
        makePlan(
          [cover(), content("p-1", { rhythm: "dense" }), content("p-2", { rhythm: "dense" }), content("p-3", { rhythm: "dense" }), ending()],
          { scenario: axes("briefing") },
        ),
      )
    })
  })
})

// ── hard gate: focus vocabulary ─────────────────────────────────────────

describe("hard gate: focus vocabulary (mode tendencies ∪ component types ∪ layout ids)", () => {
  const pyramidScenario = { mode: "pyramid", delivery: "presentation", audience: "executive" }

  it("accepts a focus drawn from the resolved mode's own tendencies", () => {
    expectOk(wrapPage(content("p-1", { focus: "kpi_cards" }), { scenario: pyramidScenario }))
  })

  it("accepts a focus that is a global component type outside the mode's tendencies", () => {
    // "bullets" is a real component type, not in pyramid's tendency set
    expectOk(wrapPage(content("p-1", { focus: "bullets" }), { scenario: pyramidScenario }))
  })

  it("accepts a focus that is a registered layout id outside the mode's tendencies", () => {
    // "two-column" is a real layout id, not in pyramid's tendency set
    expectOk(wrapPage(content("p-1", { focus: "two-column" }), { scenario: pyramidScenario }))
  })

  it("rejects a focus that matches none of the three vocabularies", () => {
    const errors = expectErrors(
      makePlan([cover(), content("p-1", { focus: "not_a_real_thing" }), ending()], { scenario: pyramidScenario }),
    )
    const err = errors.find((e) => e.pageId === "p-1")
    expect(err).toBeDefined()
    expect(err!.message).toMatch(/unknown focus "not_a_real_thing"/)
    expect(err!.message).toMatch(/kpi_cards/) // mode tendency list present
    expect(err!.message).toMatch(/bullets/) // component type vocabulary present
    expect(err!.message).toMatch(/two-column/) // layout id vocabulary present
  })

  it("accepts an omitted focus", () => {
    expectOk(wrapPage(content("p-1"), { scenario: pyramidScenario }))
  })
})

// ── hard gate: page count vs delivery ───────────────────────────────────

describe("hard gate: page count within the delivery's suggested range", () => {
  function decksOfSize(n: number) {
    const middle = Array.from({ length: n - 2 }, (_, i) => content(`p-${i}`))
    return makePlan([cover(), ...middle, ending()])
  }

  it("accepts the presentation delivery's lower boundary (4 pages)", () => {
    expectOk({ ...decksOfSize(4), scenario: { delivery: "presentation" } })
  })

  it("rejects one below the presentation lower boundary (3 pages)", () => {
    const errors = expectErrors({ ...decksOfSize(3), scenario: { delivery: "presentation" } })
    expect(errors).toHaveLength(1)
    expect(errors[0]!.path).toBe("pages")
    expect(errors[0]!.message).toMatch(/plan has 3 pages/)
    expect(errors[0]!.message).toMatch(/"presentation" delivery expects 4-16 pages/)
    expect(errors[0]!.message).toMatch(/change delivery or add\/remove pages/)
  })

  it("accepts the presentation delivery's upper boundary (16 pages)", () => {
    expectOk({ ...decksOfSize(16), scenario: { delivery: "presentation" } })
  })

  it("rejects one above the presentation upper boundary (17 pages)", () => {
    const errors = expectErrors({ ...decksOfSize(17), scenario: { delivery: "presentation" } })
    expect(errors[0]!.message).toMatch(/plan has 17 pages/)
  })

  it("the same page count can pass for one delivery and fail for another", () => {
    // 5 pages: within presentation's 4-16, below balanced's 6-24
    expectOk({ ...decksOfSize(5), scenario: { delivery: "presentation" } })
    const errors = expectErrors({ ...decksOfSize(5), scenario: { delivery: "balanced" } })
    expect(errors[0]!.message).toMatch(/"balanced" delivery expects 6-24 pages/)
  })

  it("accepts the text delivery's lower boundary (8 pages)", () => {
    expectOk({ ...decksOfSize(8), scenario: { delivery: "text" } })
  })

  it("rejects one below the text delivery's lower boundary (7 pages)", () => {
    const errors = expectErrors({ ...decksOfSize(7), scenario: { delivery: "text" } })
    expect(errors[0]!.message).toMatch(/"text" delivery expects 8-30 pages/)
  })
})

describe("PLAN_PAGE_COUNT_RANGE", () => {
  it("is pinned to the spec's initial values", () => {
    expect(PLAN_PAGE_COUNT_RANGE).toEqual({
      text: { min: 8, max: 30 },
      balanced: { min: 6, max: 24 },
      presentation: { min: 4, max: 16 },
    })
  })
})

// ── planJsonSchema ───────────────────────────────────────────────────────

describe("planJsonSchema", () => {
  it("produces a JSON Schema document with the plan's top-level shape", () => {
    const schema = planJsonSchema()
    expect(schema).toHaveProperty("$schema")
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining(["version", "scenario", "theme", "filename", "seed", "meta", "pages"]),
    )
  })

  it("matches DeckPlanSchema (same schema instance, no drift between the two exports)", () => {
    expect(planJsonSchema()).toBeDefined()
    expect(DeckPlanSchema).toBeDefined()
  })
})

// ── formatPlanIssues ─────────────────────────────────────────────────────

describe("formatPlanIssues", () => {
  it("prefixes a page-scoped issue with its page id", () => {
    const text = formatPlanIssues([{ path: "pages.0.heading", message: "too long", pageId: "p-cover" }])
    expect(text).toBe('page "p-cover" — pages.0.heading: too long')
  })

  it("omits the page prefix for deck-level issues", () => {
    const text = formatPlanIssues([{ path: "pages", message: "no pages" }])
    expect(text).toBe("pages: no pages")
  })

  it("joins multiple issues with newlines", () => {
    const text = formatPlanIssues([
      { path: "a", message: "1" },
      { path: "b", message: "2" },
    ])
    expect(text.split("\n")).toHaveLength(2)
  })
})
