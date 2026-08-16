// @vitest-environment node
import { describe, expect, it } from "vitest"
import { namespaceSvgIds, svgIdPrefix } from "./svg-ids"

describe("namespaceSvgIds", () => {
  it("rewrites a definition and every reference to it together", () => {
    const svg =
      '<svg><defs><linearGradient id="sky"><stop/></linearGradient></defs>' +
      '<rect fill="url(#sky)"/><use href="#sky"/><use xlink:href="#sky"/></svg>'
    const out = namespaceSvgIds(svg, "s3-")
    expect(out).toContain('id="s3-sky"')
    expect(out).toContain("url(#s3-sky)")
    expect(out).toContain('href="#s3-sky"')
    expect(out).toContain('xlink:href="#s3-sky"')
    // Nothing keeps the bare form, or the reference would dangle.
    expect(out).not.toContain('id="sky"')
    expect(out).not.toContain("url(#sky)")
  })

  it("keeps two slides that define the same id apart", () => {
    // The real case: a theme's decor gradient is emitted per slide under one
    // id. Inlined into one document unprefixed, the later slide's `url(#…)`
    // resolves against the earlier slide's definition.
    const decor = '<svg><linearGradient id="decor"><stop stop-color="COLOR"/></linearGradient><rect fill="url(#decor)"/></svg>'
    const a = namespaceSvgIds(decor.replace("COLOR", "#111"), svgIdPrefix(2))
    const b = namespaceSvgIds(decor.replace("COLOR", "#eee"), svgIdPrefix(5))
    const ids = [...(a + b).matchAll(/id="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
    expect(a).toContain("url(#s2-decor)")
    expect(b).toContain("url(#s5-decor)")
  })

  it("leaves markup untouched when there is no prefix to apply", () => {
    const svg = '<svg><rect id="a" fill="url(#a)"/></svg>'
    expect(namespaceSvgIds(svg, "")).toBe(svg)
  })

  it("gives each slide index its own prefix, including identical slides", () => {
    expect(svgIdPrefix(0)).not.toBe(svgIdPrefix(1))
  })
})
