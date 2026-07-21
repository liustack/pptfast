import { describe, it, expect } from "vitest"
import { eaFontFaceFor, isMonoFontFamily, resolveFontFace, resolveFontStack, SAFE_FONTS } from "./fonts"

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

// CJK east-asian font-slot mapping (a:ea patch, following up on borrow-wave
// Task 3's documented CJK glyph gap -- see fonts.ts's header comment).
describe("eaFontFaceFor", () => {
  it("self-references a CJK-capable safe face (explicit east-asian slot, no font change)", () => {
    expect(eaFontFaceFor("Microsoft YaHei")).toBe("Microsoft YaHei")
    expect(eaFontFaceFor("SimSun")).toBe("SimSun")
    expect(eaFontFaceFor("KaiTi")).toBe("KaiTi")
    expect(eaFontFaceFor("楷体")).toBe("楷体")
  })

  it("falls back to Microsoft YaHei for a Latin-only safe face with zero CJK glyphs", () => {
    expect(eaFontFaceFor("Georgia")).toBe("Microsoft YaHei")
    expect(eaFontFaceFor("Consolas")).toBe("Microsoft YaHei")
    expect(eaFontFaceFor("Arial")).toBe("Microsoft YaHei")
  })

  it("is case-insensitive, matching resolveFontFace's own matching rule, and echoes the input's own casing back on self-reference", () => {
    expect(eaFontFaceFor("georgia")).toBe("Microsoft YaHei")
    expect(eaFontFaceFor("SIMSUN")).toBe("SIMSUN")
  })

  it("strips quotes/whitespace like resolveFontFace does, for a raw (unresolved) stack entry", () => {
    expect(eaFontFaceFor(' "Georgia" ')).toBe("Microsoft YaHei")
  })

  it("falls back to Microsoft YaHei for a face outside SAFE_FONTS entirely (defensive default)", () => {
    expect(eaFontFaceFor("Comic Sans MS")).toBe("Microsoft YaHei")
  })
})

// Completeness guard, same shape as full-matrix-contrast.test.ts's
// MUTED_SURFACE_CLASS precedent: every SAFE_FONTS member must be listed on
// one side or the other below, so a newly added member with no CJK
// classification decision fails this test immediately (via the parity
// assertion in the first `it`) instead of silently falling through
// `eaFontFaceFor`'s default with nobody having reviewed whether that's
// actually correct for it.
describe("eaFontFaceFor completeness over SAFE_FONTS", () => {
  // The 10 CJK-capable SAFE_FONTS members (self-reference under eaFontFaceFor).
  const CJK_FACES = [
    "Microsoft YaHei",
    "微软雅黑",
    "SimSun",
    "宋体",
    "SimHei",
    "黑体",
    "KaiTi",
    "楷体",
    "FangSong",
    "仿宋",
  ]
  // The 11 Latin-only SAFE_FONTS members (fall back to Microsoft YaHei).
  const LATIN_ONLY_FACES = [
    "Arial",
    "Calibri",
    "Tahoma",
    "Verdana",
    "Segoe UI",
    "Georgia",
    "Times New Roman",
    "Cambria",
    "Consolas",
    "Courier New",
    "Lucida Console",
  ]

  it("accounts for every SAFE_FONTS member exactly once (fails the moment SAFE_FONTS gains an unclassified member)", () => {
    const classified = new Set([...CJK_FACES, ...LATIN_ONLY_FACES].map((f) => f.toLowerCase()))
    expect(classified.size).toBe(CJK_FACES.length + LATIN_ONLY_FACES.length) // no duplicate across the two lists
    expect(classified).toEqual(new Set(SAFE_FONTS))
  })

  it("every CJK-capable face self-references under eaFontFaceFor", () => {
    for (const face of CJK_FACES) expect(eaFontFaceFor(face)).toBe(face)
  })

  it("every Latin-only face falls back to Microsoft YaHei under eaFontFaceFor", () => {
    for (const face of LATIN_ONLY_FACES) expect(eaFontFaceFor(face)).toBe("Microsoft YaHei")
  })
})
