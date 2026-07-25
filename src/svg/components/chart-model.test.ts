import { describe, expect, it } from "vitest"
import type { ChartSeries } from "@/ir"
import { buildChartModel, categoryKeyOf, zeroAxisRatio } from "./chart-model"

// Tiny series-literal helper — every test builds `ChartSeries[]` by hand
// (mirrors chart-palette.test.ts's plain-literal style, not
// chart-svg.test.tsx's `seriesOf` helper, since most tests here need
// distinct x values per point, not chart-svg's homogeneous "one series,
// positional y's" shape).
function series(name: string, points: [string | number, number][]): ChartSeries {
  return { name, data: points.map(([x, y]) => ({ x, y })) }
}

describe("categoryKeyOf", () => {
  it("gives string x and number x with the same literal text different keys", () => {
    expect(categoryKeyOf("1")).not.toBe(categoryKeyOf(1))
  })

  it("is deterministic — same value + same type always produces the same key", () => {
    expect(categoryKeyOf("Q1")).toBe(categoryKeyOf("Q1"))
    expect(categoryKeyOf(42)).toBe(categoryKeyOf(42))
  })

  it("distinguishes two different string values", () => {
    expect(categoryKeyOf("A")).not.toBe(categoryKeyOf("B"))
  })

  it("distinguishes two different number values", () => {
    expect(categoryKeyOf(1)).not.toBe(categoryKeyOf(2))
  })

  it("never collides a string with a number regardless of the string's own content", () => {
    // A string that happens to echo the OTHER type's tag prefix must still
    // never collide — the type tag always wins because it's a fixed prefix
    // the raw value can never fully reproduce across the type boundary.
    expect(categoryKeyOf("n:5")).not.toBe(categoryKeyOf(5))
  })
})

describe("buildChartModel — category union", () => {
  it("single series establishes categories in its own x order", () => {
    const model = buildChartModel([series("S1", [["Q1", 10], ["Q2", 20], ["Q3", 30]])])
    expect(model.categories.map((c) => c.x)).toEqual(["Q1", "Q2", "Q3"])
  })

  it("a later series' shared x's do not re-append — only genuinely unseen x's land at the end", () => {
    const model = buildChartModel([
      series("S1", [["Q1", 10], ["Q2", 20]]),
      series("S2", [["Q2", 99], ["Q3", 30]]),
    ])
    // Q2 is already a category from S1 — S2's Q2 must not duplicate it.
    // Q3 is new to S2, so it appends after S1's own categories.
    expect(model.categories.map((c) => c.x)).toEqual(["Q1", "Q2", "Q3"])
  })

  it("a third series can still append its own unseen x's, in its own encounter order", () => {
    const model = buildChartModel([
      series("S1", [["Q1", 1]]),
      series("S2", [["Q2", 2]]),
      series("S3", [["Q4", 4], ["Q3", 3]]),
    ])
    expect(model.categories.map((c) => c.x)).toEqual(["Q1", "Q2", "Q4", "Q3"])
  })

  it("type-distinct x's (string \"1\" vs number 1) become two separate categories", () => {
    const model = buildChartModel([series("S1", [["1", 10], [1, 20]])])
    expect(model.categories).toHaveLength(2)
    expect(model.categories[0]).toEqual({ key: categoryKeyOf("1"), x: "1" })
    expect(model.categories[1]).toEqual({ key: categoryKeyOf(1), x: 1 })
  })

  it("an empty first series does not block a later series from establishing categories", () => {
    const model = buildChartModel([series("Empty", []), series("S2", [["Q1", 5], ["Q2", 6]])])
    expect(model.categories.map((c) => c.x)).toEqual(["Q1", "Q2"])
  })

  it("no series at all yields an empty category list", () => {
    expect(buildChartModel([]).categories).toEqual([])
  })
})

describe("buildChartModel — sparse alignment (missing categories)", () => {
  it("marks a series' missing category with the null-class marker, at the right position", () => {
    const model = buildChartModel([
      series("S1", [["Q1", 10], ["Q2", 20], ["Q3", 30]]),
      series("S2", [["Q1", 1], ["Q3", 3]]), // Q2 missing for S2
    ])
    expect(model.categories.map((c) => c.x)).toEqual(["Q1", "Q2", "Q3"])
    expect(model.series[0]!.values).toEqual([10, 20, 30])
    expect(model.series[1]!.values).toEqual([1, null, 3])
  })

  it("every series' aligned values array has exactly categories.length entries, even a wholly-empty series", () => {
    const model = buildChartModel([series("S1", [["Q1", 10], ["Q2", 20]]), series("Empty", [])])
    expect(model.series[1]!.values).toEqual([null, null])
    expect(model.series[1]!.values).toHaveLength(model.categories.length)
  })

  it("a category contributed only by a later series is null for every earlier series", () => {
    const model = buildChartModel([series("S1", [["Q1", 10]]), series("S2", [["Q1", 1], ["Q2", 2]])])
    expect(model.categories.map((c) => c.x)).toEqual(["Q1", "Q2"])
    expect(model.series[0]!.values).toEqual([10, null])
  })
})

describe("buildChartModel — duplicate x within one series", () => {
  it("keeps the FIRST occurrence's value for the aligned array", () => {
    const model = buildChartModel([series("S1", [["Q1", 10], ["Q1", 999], ["Q2", 20]])])
    expect(model.categories.map((c) => c.x)).toEqual(["Q1", "Q2"]) // no phantom second Q1 category
    expect(model.series[0]!.values).toEqual([10, 20])
  })

  it("reports the duplicate: kept index, dropped index/indices, series identity, key", () => {
    const model = buildChartModel([series("S1", [["Q1", 10], ["Q1", 999], ["Q2", 20]])])
    expect(model.duplicates).toEqual([
      {
        seriesIndex: 0,
        seriesName: "S1",
        key: categoryKeyOf("Q1"),
        x: "Q1",
        keptAt: 0,
        droppedAt: [1],
      },
    ])
  })

  it("a triple repeat collapses to one duplicate report entry with two dropped indices", () => {
    const model = buildChartModel([series("S1", [["A", 1], ["A", 2], ["A", 3]])])
    expect(model.duplicates).toHaveLength(1)
    expect(model.duplicates[0]!.keptAt).toBe(0)
    expect(model.duplicates[0]!.droppedAt).toEqual([1, 2])
  })

  it("does not report a duplicate across different series sharing the same x (that's the normal union, not a dup)", () => {
    const model = buildChartModel([series("S1", [["Q1", 10]]), series("S2", [["Q1", 20]])])
    expect(model.duplicates).toEqual([])
  })

  it("duplicate x's with distinct types (string \"1\" then number 1) are NOT duplicates of each other", () => {
    const model = buildChartModel([series("S1", [["1", 10], [1, 20], ["1", 30]])])
    expect(model.categories).toHaveLength(2)
    expect(model.duplicates).toHaveLength(1)
    expect(model.duplicates[0]!.key).toBe(categoryKeyOf("1"))
    expect(model.duplicates[0]!.droppedAt).toEqual([2])
  })

  it("no duplicates for a series with all-unique x's", () => {
    const model = buildChartModel([series("S1", [["A", 1], ["B", 2], ["C", 3]])])
    expect(model.duplicates).toEqual([])
  })
})

describe("buildChartModel — shared domain (bar/line rule: global min/max across all series, including zero)", () => {
  it("positive-only values: domain is [0, max]", () => {
    const model = buildChartModel([series("S1", [["A", 5], ["B", 3], ["C", 8]])])
    expect(model.domain).toEqual({ min: 0, max: 8, degenerate: false })
  })

  it("negative-only values: domain is [min, 1] — the max-side floor still applies (no positive data to satisfy it)", () => {
    const model = buildChartModel([series("S1", [["A", -5], ["B", -3], ["C", -8]])])
    expect(model.domain).toEqual({ min: -8, max: 1, degenerate: false })
  })

  it("mixed-sign values: domain spans [min, max], both non-zero", () => {
    const model = buildChartModel([series("S1", [["A", -8], ["B", 3], ["C", 10]])])
    expect(model.domain).toEqual({ min: -8, max: 10, degenerate: false })
  })

  it("all-zero values: degenerate, deterministically expands to [0, 1]", () => {
    const model = buildChartModel([series("S1", [["A", 0], ["B", 0]])])
    expect(model.domain).toEqual({ min: 0, max: 1, degenerate: true })
  })

  it("no data at all (empty series list): degenerate, same [0, 1] expansion — never divides by zero downstream", () => {
    expect(buildChartModel([]).domain).toEqual({ min: 0, max: 1, degenerate: true })
  })

  it("no data at all (series present but every data array empty): same degenerate [0, 1]", () => {
    const model = buildChartModel([series("S1", []), series("S2", [])])
    expect(model.domain).toEqual({ min: 0, max: 1, degenerate: true })
  })

  it("domain is global across ALL series, not just the first (this is the defect T2 fixes: series[1..] must count)", () => {
    const model = buildChartModel([series("S1", [["A", 5]]), series("S2", [["A", 500]])])
    expect(model.domain.max).toBe(500)
  })

  it("zero is always inside [min, max] even when every real value is on one side of it", () => {
    const allPositive = buildChartModel([series("S1", [["A", 5]])]).domain
    const allNegative = buildChartModel([series("S1", [["A", -5]])]).domain
    expect(allPositive.min).toBeLessThanOrEqual(0)
    expect(allPositive.max).toBeGreaterThanOrEqual(0)
    expect(allNegative.min).toBeLessThanOrEqual(0)
    expect(allNegative.max).toBeGreaterThanOrEqual(0)
  })

  it("a dropped duplicate's value does not inflate the domain — domain reflects only what's actually drawn (kept values)", () => {
    // Q1's second occurrence (999) is a dropped duplicate — if domain read
    // raw un-deduped data it would wrongly report max=999.
    const model = buildChartModel([series("S1", [["Q1", 10], ["Q1", 999]])])
    expect(model.domain).toEqual({ min: 0, max: 10, degenerate: false })
  })
})

describe("buildChartModel — single-series identity (byte-compat replication)", () => {
  // chart-svg.tsx `renderBar` (current source, ~line 233-234):
  //   const all = series.flatMap((s) => s.data.map((d) => d.y))
  //   const max = Math.max(...all, 1)
  //   ... const barH = clampChartExtent((d.y / max) * plotH)   // (~line 253)
  // chart-svg.tsx `renderLine` (current source, ~line 327):
  //   const max = Math.max(...s.data.map((d) => d.y), 1)
  //   ... y: plotTop + plotH - clampChartExtent((d.y / max) * plotH)  // (~line 330)
  // Both formulas: (a) never subtract anything before dividing — an
  // implicit zero baseline — and (b) floor the divisor at 1 unconditionally
  // (not just when the real max is <= 0). For a single series, "global
  // across all series" and "this series alone" are the same set, so
  // replicating either renderer's formula is equivalent. This model's
  // domain = { min: Math.min(0, ...values), max: Math.max(0, ...values, 1) }
  // reduces to exactly `{ min: 0, max: Math.max(...values, 1) }` whenever
  // every value is already >= 0 — bit-for-bit the same max the renderer
  // divides by today.
  it("single positive series -> domain.max === Math.max(...values, 1), domain.min === 0 (matches renderBar/renderLine today)", () => {
    const values = [100, 200, 150]
    const model = buildChartModel([series("S1", [["Q1", 100], ["Q2", 200], ["Q3", 150]])])
    expect(model.domain).toEqual({ min: 0, max: Math.max(...values, 1), degenerate: false })
    expect(model.domain.max).toBe(200)
  })

  it("replicates the sub-1 floor quirk: a positive series whose real max is < 1 still floors domain.max at 1, not the real max", () => {
    // Math.max(0.5, 0.3, 1) === 1 in the current renderer's own formula —
    // NOT 0.5. A domain that instead reported max=0.5 here would silently
    // change every bar/line height for any deck using sub-1 (e.g. ratio or
    // share-of-1) values, breaking byte-compat for a legal single-series
    // positive input.
    const model = buildChartModel([series("S1", [["A", 0.5], ["B", 0.3]])])
    expect(model.domain).toEqual({ min: 0, max: 1, degenerate: false })
  })

  it("categories/alignment are a lossless passthrough for a single series with unique x's — same order, same values, no missing/duplicate markers", () => {
    const data: [string, number][] = [["Q1", 100], ["Q2", 200], ["Q3", 150]]
    const model = buildChartModel([series("S1", data)])
    expect(model.categories.map((c) => c.x)).toEqual(["Q1", "Q2", "Q3"])
    expect(model.series).toHaveLength(1)
    expect(model.series[0]!.values).toEqual([100, 200, 150])
    expect(model.duplicates).toEqual([])
  })

  it("single all-zero series matches the renderer's existing all-zero floor-to-1 behavior (no NaN/divide-by-zero)", () => {
    const model = buildChartModel([series("S1", [["A", 0], ["B", 0], ["C", 0]])])
    expect(model.domain).toEqual({ min: 0, max: 1, degenerate: true })
  })
})

describe("buildChartModel — legend model", () => {
  it("one legend entry per input series, in input order, verbatim names", () => {
    const model = buildChartModel([series("Revenue", [["Q1", 1]]), series("Cost", [["Q1", 1]])])
    expect(model.legend).toEqual([
      { seriesIndex: 0, name: "Revenue", colorIndex: 0 },
      { seriesIndex: 1, name: "Cost", colorIndex: 1 },
    ])
  })

  it("colorIndex is the pre-modulo series position — mirrors chart-svg.tsx's existing `palette[sIdx % palette.length]` indexing (renderLine, ~line 360); this module holds no palette length to mod against by design", () => {
    const model = buildChartModel(Array.from({ length: 5 }, (_, i) => series(`S${i}`, [["A", i]])))
    expect(model.legend.map((e) => e.colorIndex)).toEqual([0, 1, 2, 3, 4])
  })

  it("does not truncate or drop entries — that's a render-time (T2) width decision, not this model's job", () => {
    const many = Array.from({ length: 50 }, (_, i) => series(`Series with a very long name ${i}`, [["A", i]]))
    const model = buildChartModel(many)
    expect(model.legend).toHaveLength(50)
    expect(model.legend[49]!.name).toBe("Series with a very long name 49")
  })

  it("duplicate series names produce duplicate legend entries (no silent dedup — legend mirrors series identity, not uniqueness)", () => {
    const model = buildChartModel([series("Same", [["A", 1]]), series("Same", [["A", 2]])])
    expect(model.legend.map((e) => e.name)).toEqual(["Same", "Same"])
    expect(model.legend.map((e) => e.seriesIndex)).toEqual([0, 1])
  })
})

describe("buildChartModel — determinism", () => {
  const input: ChartSeries[] = [
    series("S1", [["Q1", 10], ["Q1", 999], ["Q2", 20]]),
    series("S2", [["Q2", 1], ["Q3", -5]]),
  ]

  it("double call on the same input reference is deep-equal", () => {
    expect(buildChartModel(input)).toEqual(buildChartModel(input))
  })

  it("double call on structurally-identical but distinct input objects/arrays is deep-equal", () => {
    const a = [series("S1", [["Q1", 10], ["Q1", 999], ["Q2", 20]]), series("S2", [["Q2", 1], ["Q3", -5]])]
    const b = [series("S1", [["Q1", 10], ["Q1", 999], ["Q2", 20]]), series("S2", [["Q2", 1], ["Q3", -5]])]
    expect(a).not.toBe(b)
    expect(buildChartModel(a)).toEqual(buildChartModel(b))
  })

  it("does not mutate the input series/data", () => {
    const frozen: ChartSeries[] = [
      Object.freeze({ name: "S1", data: Object.freeze([Object.freeze({ x: "Q1", y: 10 })]) }) as ChartSeries,
    ]
    expect(() => buildChartModel(frozen)).not.toThrow()
    expect(frozen[0]!.data).toEqual([{ x: "Q1", y: 10 }])
  })
})

describe("zeroAxisRatio", () => {
  it("is 0 when the domain's own baseline is min (a positive-only domain)", () => {
    expect(zeroAxisRatio({ min: 0, max: 200, degenerate: false })).toBe(0)
  })

  it("is 1 when the domain's own baseline is max (a negative-only domain)", () => {
    expect(zeroAxisRatio({ min: -8, max: 0, degenerate: false })).toBe(1)
  })

  it("is fractional and proportionate for a mixed-sign domain", () => {
    expect(zeroAxisRatio({ min: -8, max: 2, degenerate: false })).toBeCloseTo(0.8, 10)
  })

  it("never divides by zero for any domain buildChartModel can actually produce", () => {
    for (let seed = -50; seed <= 50; seed++) {
      const model = buildChartModel([series("S", [["A", seed]])])
      expect(Number.isFinite(zeroAxisRatio(model.domain))).toBe(true)
    }
  })
})
