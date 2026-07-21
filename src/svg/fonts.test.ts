import { describe, it, expect } from "vitest"
import { isMonoFontFamily, resolveFontFace, resolveFontStack, SAFE_FONTS } from "./fonts"

describe("resolveFontFace", () => {
  it("returns the first stack member that is a known-safe font", () => {
    // Sectra (designer) and the generic `serif` are skipped; Georgia is safe.
    expect(
      resolveFontFace(["Sectra", "Georgia", "Source Han Serif SC", "serif"], "heading"),
    ).toBe("Georgia")
  })

  it("skips Mac-only / unknown fonts and falls back to the body default", () => {
    // Inter (web), PingFang SC (Mac-only), system-ui (generic) are all unsafe on
    // Windows → fall back to the CJK+Latin safe default.
    expect(resolveFontFace(["Inter", "PingFang SC", "system-ui"], "body")).toBe(
      "Microsoft YaHei",
    )
  })

  it("recognizes Chinese-named safe fonts in the stack", () => {
    expect(resolveFontFace(["Inter", "微软雅黑"], "body")).toBe("微软雅黑")
  })

  it("falls back to Consolas for an unknown mono stack", () => {
    expect(resolveFontFace(["Fira Code", "Menlo"], "mono")).toBe("Consolas")
  })

  it("falls back to the body default for an empty stack", () => {
    expect(resolveFontFace([], "body")).toBe("Microsoft YaHei")
  })

  it("exposes a non-empty safe-font set", () => {
    expect(SAFE_FONTS.has("georgia")).toBe(true)
    expect(SAFE_FONTS.has("consolas")).toBe(true)
  })
})

describe("resolveFontStack", () => {
  it("leads with the resolveFontFace result, unchanged, for svg2pptx's firstFontFamily", () => {
    const stack = resolveFontStack(["Sectra", "Georgia", "Source Han Serif SC", "serif"], "heading")
    expect(stack.split(",")[0].trim()).toBe(resolveFontFace(["Sectra", "Georgia"], "heading"))
  })

  it("appends a CJK serif preview fallback for a serif-resolved face", () => {
    // magazine's heading stack resolves to SimSun.
    const stack = resolveFontStack(["Sectra", "SimSun"], "heading")
    expect(stack).toBe("SimSun, Songti SC, STSong, serif")
  })

  it("appends a sans-serif preview fallback for a sans-resolved face", () => {
    // tech's heading stack resolves to Microsoft YaHei.
    const stack = resolveFontStack(["Inter", "Microsoft YaHei"], "heading")
    expect(stack).toBe("Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif")
  })

  it("appends a monospace preview fallback for the mono role", () => {
    expect(resolveFontStack(["Fira Code"], "mono")).toBe("Consolas, Menlo, monospace")
  })
})

// borrow-wave Task 3 review round (2026-07-21, task-3-review.md Important
// finding N1): `svg-audit.ts`'s overflow detector keys its mono-vs-
// proportional measurement branch off this function instead of a duplicated
// font-name literal. These pin the exact renderer-emitted values it must
// recognize, and the negatives it must not.
describe("isMonoFontFamily", () => {
  it("recognizes every resolveFontStack('mono', ...) output, regardless of which SAFE_FONTS mono face resolved", () => {
    // Every theme in this repo omits `fonts.mono` or lists Consolas first
    // (fonts.ts's own file header), so this is the value `ctx.fonts.mono`
    // actually holds in every shipped deck today.
    expect(isMonoFontFamily(resolveFontStack([], "mono"))).toBe(true)
    // A hypothetical theme whose stack resolves to a *different* SAFE_FONTS
    // mono member must still be recognized — the role decides the width
    // model, not the specific face name (see this function's derivation
    // comment in fonts.ts).
    expect(isMonoFontFamily(resolveFontStack(["Courier New"], "mono"))).toBe(true)
    expect(isMonoFontFamily(resolveFontStack(["Lucida Console"], "mono"))).toBe(true)
  })

  it("rejects every resolveFontStack('heading'|'body', ...) output", () => {
    expect(isMonoFontFamily(resolveFontStack(["Georgia"], "heading"))).toBe(false)
    expect(isMonoFontFamily(resolveFontStack(["Microsoft YaHei"], "body"))).toBe(false)
    expect(isMonoFontFamily(resolveFontStack([], "heading"))).toBe(false)
    expect(isMonoFontFamily(resolveFontStack([], "body"))).toBe(false)
  })

  it("rejects a bare face name with no fallback suffix (e.g. a hand-built test ctx)", () => {
    expect(isMonoFontFamily("Consolas")).toBe(false)
  })

  it("rejects an empty string", () => {
    expect(isMonoFontFamily("")).toBe(false)
  })
})
