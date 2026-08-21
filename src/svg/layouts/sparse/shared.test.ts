import { describe, expect, it } from "vitest"
import { yearQuarter } from "./shared"

describe("yearQuarter", () => {
  it("parses a four-digit year plus a 1–12 month into year and quarter", () => {
    expect(yearQuarter("2026-01-15")).toEqual({ year: "2026", quarter: "Q1" })
    expect(yearQuarter("2026-05-01")).toEqual({ year: "2026", quarter: "Q2" })
    expect(yearQuarter("2026-11-20")).toEqual({ year: "2026", quarter: "Q4" })
    expect(yearQuarter("2026-12")).toEqual({ year: "2026", quarter: "Q4" })
  })

  it("returns undefined when the date cannot be read as year-month", () => {
    expect(yearQuarter("sometime soon")).toBeUndefined()
    expect(yearQuarter("2026")).toBeUndefined()
    expect(yearQuarter(undefined)).toBeUndefined()
    expect(yearQuarter("")).toBeUndefined()
    expect(yearQuarter("2026-00-01")).toBeUndefined()
    expect(yearQuarter("2026-13-01")).toBeUndefined()
  })
})
