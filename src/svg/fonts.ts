/**
 * Safe-font resolution for the single-source SVG renderer.
 *
 * pptxgenjs writes a single `fontFace` name into the .pptx; whatever the target
 * machine lacks gets silently substituted by PowerPoint. The 6 themes lead with
 * designer fonts (Sectra / Inter / Lora …) that are absent on a stock Windows
 * install, so we resolve each font stack down to the first member PowerPoint can
 * actually render, falling back to a CJK+Latin-covering default by role.
 *
 * The set is intentionally Windows-guaranteed. Latin faces here (Georgia, Arial,
 * Consolas …) also ship on macOS, but Mac-only faces (PingFang SC) are excluded
 * so a deck authored on a Mac still renders predictably on Windows.
 *
 * ---
 *
 * Two separate judgment axes, not one (borrow-wave Task 3, 2026-07-21):
 *
 * 1. AVAILABILITY (what SAFE_FONTS actually decides) -- will a stock Windows
 *    or Office install have this face at all, so PowerPoint renders the
 *    requested glyphs instead of silently substituting a different font.
 *
 * 2. METRIC RELIABILITY -- once a face is confirmed available, does the
 *    layout engine's width model (`measureTextUnits` in
 *    `src/lib/svg-text-layout.ts`, a font-agnostic per-character-class
 *    heuristic) still predict that face's real advance width closely enough
 *    to size/wrap/shrink text without overflow. A font can pass (1) and
 *    fail (2), or vice versa -- they are independent questions, and
 *    SAFE_FONTS membership on its own answers only the first one.
 *
 * Anthropic's official pptx-generation skill classifies both Georgia and
 * Consolas -- two of this file's SAFE_FONTS members, and the actual export
 * faces for pptfast's default theme (consulting: Georgia heading+body) and
 * every theme's code component (Consolas, all 13 themes, via ROLE_DEFAULT
 * below) -- as "QA-unreliable" rather than "safe". That is axis (2)
 * judgment. This file's SAFE_FONTS is axis (1) judgment. The two
 * classifications disagreeing is not a contradiction to paper over -- they
 * are answering different questions, and pptfast had never actually
 * measured axis (2) for these faces before borrow-wave Task 3 (the one
 * prior width-safety mechanism, `code.tsx`'s `MONO_WIDTH_SAFETY`, was
 * itself calibrated against Menlo, a macOS preview stand-in, not the real
 * exported Consolas).
 *
 * Task 3's real-font measurement (fontTools `hmtx`-table reads of the
 * genuine binaries, cross-validated against real-Chromium `canvas.
 * measureText()` -- see task-3-report.md, borrow-wave scratchpad, not
 * shipped in this repo) resolved axis (2) for all three fonts this file
 * actually exports today:
 *   - Georgia (consulting heading+body default, academic/insight heading):
 *     measured safe. No width factor added -- see the calibration note
 *     above `measureTextUnits` in svg-text-layout.ts.
 *   - Consolas (mono/code, all 13 themes via ROLE_DEFAULT): measured
 *     genuinely risky in the dangerous (real-wider-than-assumed) direction.
 *     Mitigated by `code.tsx`'s `MONO_WIDTH_SAFETY`, recalibrated 0.9 ->
 *     0.82 against the real binary as part of this same task.
 *   - Microsoft YaHei (body/fallback ROLE_DEFAULT, six themes' actual
 *     heading+body face): measured safe. No width factor added.
 *
 * A related but distinct gap surfaced during that measurement, not a width
 * question at all: neither Georgia nor Consolas contains a single CJK
 * glyph. Any CJK character in text declared under either face never
 * renders from that face -- PowerPoint substitutes some other, currently
 * uncontrolled font at the glyph level for just those characters. Width
 * calibration cannot fix a missing-glyph problem. It is recorded here as a
 * known, unresolved risk, not a settled one.
 *
 * Swapping a SAFE_FONTS member for a more metric-reliable one (e.g.
 * consulting's Georgia -> Cambria, which Anthropic's skill does classify
 * safe) is a real, available option -- but it is a user-facing visual
 * design decision, not a mechanical safety fix, so this task documents it
 * as an option in task-3-report.md rather than executing it. SAFE_FONTS
 * membership itself is unchanged by this task.
 */

export type FontRole = "heading" | "body" | "mono"

/** Lower-cased names of fonts preinstalled on a stock Windows (and, for Latin, macOS). */
export const SAFE_FONTS: Set<string> = new Set(
  [
    // Latin sans
    "Arial",
    "Calibri",
    "Tahoma",
    "Verdana",
    "Segoe UI",
    // Latin serif
    "Georgia",
    "Times New Roman",
    "Cambria",
    // Latin mono
    "Consolas",
    "Courier New",
    "Lucida Console",
    // CJK (Windows)
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
  ].map((f) => f.toLowerCase()),
)

const ROLE_DEFAULT: Record<FontRole, string> = {
  heading: "Microsoft YaHei",
  body: "Microsoft YaHei",
  mono: "Consolas",
}

/**
 * Pick the first font in `stack` that PowerPoint can render on a stock machine,
 * or the role default when none qualify.
 */
export function resolveFontFace(stack: string[], role: FontRole): string {
  for (const raw of stack) {
    const name = raw.replace(/['"]/g, "").trim()
    if (SAFE_FONTS.has(name.toLowerCase())) return name
  }
  return ROLE_DEFAULT[role]
}

/** Lower-cased safe faces that read as serif, used to pick a preview fallback family below. */
const SERIF_SAFE_FACES = new Set(
  ["Georgia", "Times New Roman", "Cambria", "SimSun", "宋体", "FangSong", "仿宋", "KaiTi", "楷体"].map(
    (f) => f.toLowerCase(),
  ),
)

/** Preview-only fallback families, keyed by the resolved face's rendered look. */
const PREVIEW_FALLBACK = {
  serif: "Songti SC, STSong, serif",
  sans: "PingFang SC, Helvetica Neue, sans-serif",
  mono: "Menlo, monospace",
} as const

/**
 * Resolve `stack` to a CSS font-family list: the Windows-safe face `resolveFontFace`
 * picks (unchanged — svg2pptx's `firstFontFamily` still reads this as the exported
 * `fontFace`) followed by a macOS-available fallback so the in-app SVG preview
 * doesn't silently drop to a generic sans-serif when the resolved face (e.g.
 * SimSun) isn't installed on the machine rendering the preview.
 */
export function resolveFontStack(stack: string[], role: FontRole): string {
  const face = resolveFontFace(stack, role)
  const fallback =
    role === "mono"
      ? PREVIEW_FALLBACK.mono
      : SERIF_SAFE_FACES.has(face.toLowerCase())
        ? PREVIEW_FALLBACK.serif
        : PREVIEW_FALLBACK.sans
  return `${face}, ${fallback}`
}
