// @vitest-environment node
//
// Guards on the real-geometry pass (`pnpm gallery --bbox`, `bbox.ts`).
//
// Everything here is deliberately browser-free. The pass itself needs a real
// browser — that is its whole point — but `pnpm check` must not, so the parts
// under test are the ones that decide what a measurement *means*: parsing the
// audit's output lines, the slack that separates measurement error from a
// defect, and the designed-bleed list. The browser half is exercised by
// running `pnpm gallery --bbox` by hand.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
import { describe, expect, it } from "vitest"
import { classify, harnessHtml, layoutOf, parseIssue, slackFor } from "./bbox"
import { bleedExemption, DESIGNED_BLEED } from "./bbox-exemptions"

describe("parseIssue", () => {
  it("reads how far a line's ink ran past its box, and on which axis", () => {
    const p = parseIssue("h-overflow 本季度设备接入量: [96,534] exceeds box x=96 w=435")
    expect(p).toEqual({ kind: "h-overflow", label: "本季度设备接入量", axis: "x", overrun: 3, extent: 435 })
  })

  it("reads a left-edge overrun as the same kind of horizontal miss", () => {
    const p = parseIssue("h-overflow validated: [90,900] exceeds box x=96 w=1088")
    expect(p?.axis).toBe("x")
    expect(p?.overrun).toBe(6)
  })

  it("reads a rect overflow as vertical", () => {
    const p = parseIssue("v-overflow tail line: bottom 530 below rect bottom 512")
    expect(p).toMatchObject({ kind: "v-overflow", axis: "y", overrun: 18 })
  })

  it("picks the axis a page overflow actually broke out on", () => {
    const down = parseIssue("page-overflow 01: [947,1224] y=[374,738] outside 1280x720")
    expect(down).toMatchObject({ kind: "page-overflow", label: "01", axis: "y", overrun: 18, extent: 720 })

    const sideways = parseIssue("page-overflow wide: [0,1330] y=[100,200] outside 1280x720")
    expect(sideways).toMatchObject({ axis: "x", overrun: 50, extent: 1280 })
  })

  it("keeps the numbers right when the text itself contains a colon", () => {
    // The label is cut at the first ": ", but the measurements are read off
    // the tail, which is generated and cannot be confused by content.
    const p = parseIssue("h-overflow Q1: revenue: [96,600] exceeds box x=96 w=400")
    expect(p?.label).toBe("Q1")
    expect(p?.overrun).toBe(104)
  })

  it("returns nothing for a line that is not an overflow report", () => {
    expect(parseIssue("render-lost: no <svg> root")).toBeUndefined()
  })
})

describe("slackFor", () => {
  // Horizontal overflow is per-glyph estimation error accumulated along a
  // line, so the same underlying disagreement measures larger on a wider box.
  // The corpus shows one cause producing 3px on a 435px column and 6px on a
  // 1088px one, which a flat threshold would split into "clean" and "defect".
  it("scales the horizontal allowance with the box", () => {
    expect(slackFor({ axis: "x", extent: 435 }, 2)).toBeCloseTo(4.35)
    expect(slackFor({ axis: "x", extent: 1088 }, 2)).toBeCloseTo(8)
  })

  it("never lets the horizontal allowance fall below the floor", () => {
    // A 62px sankey node label would otherwise get 0.6px of room, which is
    // under the ink-versus-advance noise the floor exists to absorb.
    expect(slackFor({ axis: "x", extent: 62 }, 2)).toBe(2)
  })

  it("caps the horizontal allowance so a wide box cannot become a blindfold", () => {
    expect(slackFor({ axis: "x", extent: 1280 }, 2)).toBe(8)
    expect(slackFor({ axis: "x", extent: 100_000 }, 2)).toBe(8)
  })

  it("gives vertical overflow the flat floor — nothing accumulates down a baseline", () => {
    expect(slackFor({ axis: "y", extent: 720 }, 2)).toBe(2)
  })
})

describe("classify", () => {
  const layouts = new Map([["p1", "rail-chapter"], ["p2", "some-layout"]])

  it("files a designed bleed under its exemption rather than as a defect", () => {
    const out = classify([{ id: "p1", issues: ["page-overflow 01: [947,1224] y=[374,738] outside 1280x720"] }], layouts, 2, DESIGNED_BLEED)
    expect(out.defects).toEqual([])
    expect(out.designed).toHaveLength(1)
    expect(out.designed[0]!.why).toMatch(/watermark/)
  })

  it("still reports other text bleeding off the same layout", () => {
    // The exemption is the ordinal, not the layout. A heading running off the
    // page here is exactly the defect a blanket per-layout skip would hide.
    const out = classify([{ id: "p1", issues: ["page-overflow 第三章 增长: [947,1224] y=[374,738] outside 1280x720"] }], layouts, 2, DESIGNED_BLEED)
    expect(out.designed).toEqual([])
    expect(out.defects).toHaveLength(1)
  })

  it("files an overflow inside the slack as measurement error, not as a finding", () => {
    const out = classify([{ id: "p2", issues: ["h-overflow 本季度: [96,534] exceeds box x=96 w=435"] }], layouts, 2, DESIGNED_BLEED)
    expect(out.defects).toEqual([])
    expect(out.metric).toHaveLength(1)
  })

  it("reports an overflow past the slack, with the layout that drew it", () => {
    const out = classify([{ id: "p2", issues: ["h-overflow Tempo: [122,161] exceeds box x=96 w=62.25"] }], layouts, 2, DESIGNED_BLEED)
    expect(out.defects).toHaveLength(1)
    expect(out.defects[0]).toMatchObject({ page: "p2", layout: "some-layout", verdict: "defect" })
    expect(out.defects[0]!.overrun).toBeCloseTo(2.75)
  })

  it("surfaces a line it cannot parse instead of dropping it", () => {
    // "The harness lost a page" must not read the same as "the page was fine".
    const out = classify([{ id: "p2", issues: ["render-lost: no <svg> root"] }], layouts, 2, DESIGNED_BLEED)
    expect(out.defects).toHaveLength(1)
    expect(out.defects[0]!.detail).toContain("render-lost")
  })
})

describe("layoutOf", () => {
  it("reads the layout id back out of the rendered markup", () => {
    expect(layoutOf(`<svg><g data-archetype="rail-chapter"><text/></g></svg>`)).toBe("rail-chapter")
  })

  it("is empty for an image-takeover page, which draws no layout wrapper", () => {
    expect(layoutOf(`<svg><image href="x"/></svg>`)).toBe("")
  })
})

describe("bleedExemption", () => {
  it("matches on layout, check and text together — never on layout alone", () => {
    const list = [{ layout: "l", kind: "page-overflow" as const, text: /^\d+$/, why: "w" }]
    expect(bleedExemption({ layout: "l", kind: "page-overflow", label: "01" }, list)).toBeDefined()
    expect(bleedExemption({ layout: "l", kind: "h-overflow", label: "01" }, list)).toBeUndefined()
    expect(bleedExemption({ layout: "other", kind: "page-overflow", label: "01" }, list)).toBeUndefined()
    expect(bleedExemption({ layout: "l", kind: "page-overflow", label: "01 章" }, list)).toBeUndefined()
  })
})

describe("the in-page harness", () => {
  it("emits a script that actually parses", () => {
    // This script only ever runs inside a browser, so a syntax error in it
    // would first show up as an empty finding list — which reads as a clean
    // sweep. Parsing it here is the cheapest way to rule that out.
    const scripts = [...harnessHtml().matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)
    expect(scripts).toHaveLength(1)
    expect(() => new vm.Script(scripts[0]!)).not.toThrow()
  })

  it("carries no reference to anything only Node would have", () => {
    // `collectBBoxOverflows` travels into the page as source text, so a
    // module-scope reference — or esbuild's keepNames helper — becomes a
    // ReferenceError the moment the audit runs.
    const script = /<script>([\s\S]*?)<\/script>/.exec(harnessHtml())![1]!
    expect(script).not.toContain("__name(")
    expect(script).not.toContain("import ")
    expect(script).not.toContain("require(")
  })
})

describe("the browser stays out of `pnpm check`", () => {
  it("is reached only through a dynamic import, never a top-level one", () => {
    // `gallery.test.mts` runs the whole matrix on every `pnpm check`. If this
    // module were imported at the top of `gallery.mts`, the browser driver
    // would become a hard dependency of the default gate — the one thing the
    // `--bbox` channel was built to avoid.
    const entry = readFileSync(fileURLToPath(new URL("../gallery.mts", import.meta.url)), "utf8")
    expect(entry).toMatch(/await import\("\.\/gallery\/bbox"\)/)
    expect(entry).not.toMatch(/^import .* from "\.\/gallery\/bbox"/m)
  })

  it("names no browser driver in the package's dependencies", () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"))
    const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies })
    expect(declared.filter((d) => /playwright|puppeteer/.test(d))).toEqual([])
  })
})
