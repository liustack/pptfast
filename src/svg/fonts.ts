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
 *     genuinely risky in the dangerous (real-wider-than-assumed) direction
 *     for the *proportional* width model `measureTextUnits` uses. Task 3
 *     first mitigated this by recalibrating `code.tsx`'s
 *     `MONO_WIDTH_SAFETY` (0.9 -> 0.82) against the real binary. A same-
 *     task review round then found deep-indented code could still overflow
 *     past any fixed safety factor on top of a proportional estimate (see
 *     `MONO_WIDTH_SAFETY`'s derivation comment in code.tsx), so the mono
 *     role now skips the proportional model entirely and sizes text with
 *     an exact per-glyph width -- Consolas's own uniform hmtx advance, via
 *     `measureMonoTextUnits` in svg-text-layout.ts (see that function's
 *     derivation comment).
 *   - Microsoft YaHei (body/fallback ROLE_DEFAULT, six themes' actual
 *     heading+body face): measured safe. No width factor added.
 *
 * A related but distinct gap surfaced during that measurement, not a width
 * question at all: neither Georgia nor Consolas contains a single CJK
 * glyph. Any CJK character in text declared under either face never
 * renders from that face -- PowerPoint substitutes some other, currently
 * uncontrolled font at the glyph level for just those characters. Width
 * calibration cannot fix a missing-glyph problem -- this file's
 * SAFE_FONTS/resolveFontFace axis only ever spoke to the `<a:latin>` slot a
 * DrawingML run carries, never the separate `<a:ea>` (East Asian) slot
 * PowerPoint actually consults for CJK glyphs. Left unresolved at the time
 * (borrow-wave Task 3), this is now closed: `eaFontFaceFor` below resolves
 * the correct `<a:ea>` face for any already-resolved `<a:latin>` face, and
 * `src/pptx/pptx-ea-fonts.ts`'s `applyEaFontFaces` JSZip patch (wired into
 * every `generatePptxBlob` export) writes it into every exported run. CJK
 * glyphs now resolve from a face that actually has them, independent of
 * whichever Latin face the same run also carries.
 *
 * Swapping a SAFE_FONTS member for a more metric-reliable one (e.g.
 * consulting's Georgia -> Cambria, which Anthropic's skill does classify
 * safe) is a real, available option -- but it is a user-facing visual
 * design decision, not a mechanical safety fix, so this task documents it
 * as an option in task-3-report.md rather than executing it. SAFE_FONTS
 * membership itself is unchanged by this task.
 *
 * Decision (2026-07-22): keep Georgia. Our own hmtx measurements found its
 * widths inside `measureTextUnits`'s tolerance, the golden-anchor tests in
 * `svg-text-layout.golden.test.ts` now guard that agreement against drift,
 * and the "QA-unreliable" label came from a rig (LibreOffice-rendered QA)
 * this engine does not depend on. Identity beats a swap with no measured
 * safety benefit. Revisit only if a real overflow traces back to a Georgia
 * metric miss.
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

/**
 * SAFE_FONTS members that ship at least one CJK glyph -- this file's own
 * "CJK (Windows)" group above. Backs `eaFontFaceFor` below: keying off this
 * one set (rather than a parallel 21-row ea-lookup table with 11 pointless
 * self-referencing rows) means there is exactly one place a newly-added
 * SAFE_FONTS member needs a CJK/non-CJK call made -- `fonts.test.ts`'s
 * completeness assertion fails the moment a new member isn't accounted for
 * on either side (this set's "yes," or the implicit "no" of everything
 * else in SAFE_FONTS).
 */
const CJK_SAFE_FACES = new Set(
  ["Microsoft YaHei", "微软雅黑", "SimSun", "宋体", "SimHei", "黑体", "KaiTi", "楷体", "FangSong", "仿宋"].map(
    (f) => f.toLowerCase(),
  ),
)

/**
 * The uniform `<a:ea>` fallback for every SAFE_FONTS member with no CJK
 * glyphs of its own. Reuses `ROLE_DEFAULT`'s own heading/body value (both
 * already "Microsoft YaHei") rather than a fresh literal: the whole point
 * of this default is "the CJK face every theme's body text already falls
 * back to when its own designer font isn't Windows-safe" -- see
 * `eaFontFaceFor`'s doc comment for why that specific property is what
 * makes it the right uniform choice here too.
 */
const EA_FALLBACK_FACE = ROLE_DEFAULT.heading

/**
 * Resolve the East Asian (`<a:ea>`) font-slot face for an already-resolved
 * Latin/CJK face -- i.e. `resolveFontFace`'s own return value. A DrawingML
 * text run carries three independent font slots (`<a:latin>`, `<a:ea>`,
 * `<a:cs>` -- ECMA-376 `CT_TextFont`), and PowerPoint picks which one
 * paints a given character from its Unicode script: `<a:ea>` for CJK,
 * `<a:latin>` for everything else. A run whose `<a:ea>` names a face with
 * no CJK glyphs (or, as pptxgenjs's own default does -- see
 * `pptx-ea-fonts.ts`'s header comment -- mirrors whatever `<a:latin>`
 * already says) is harmless for that run's Latin characters, but any CJK
 * character in the same run falls through to PowerPoint's own uncontrolled
 * substitution the instant the declared `<a:ea>` face can't render it --
 * this file's header comment's "related but distinct gap."
 *
 * The mapping is face-keyed, not role-keyed or content-keyed:
 *
 * - A `SAFE_FONTS` member that already ships CJK glyphs (`CJK_SAFE_FACES`
 *   above -- Microsoft YaHei/SimSun/SimHei/KaiTi/FangSong and their Chinese
 *   aliases) resolves to *itself*: an explicit, self-referencing `<a:ea>`
 *   that changes no rendered pixel (the face already covers CJK) but
 *   completes the declaration -- PowerPoint no longer has to guess, closing
 *   exactly the gap `slides_maker`'s `CJK_NO_EA` lint (competitive
 *   research, borrow wave) flags.
 * - Every other `SAFE_FONTS` member (the 11 Latin-only sans/serif/mono
 *   faces -- Georgia, Consolas, Arial, etc.) resolves to the fixed
 *   `EA_FALLBACK_FACE`, regardless of that Latin face's own role
 *   (heading/body/mono) or design register (serif vs sans vs mono). This is
 *   a deliberately role-agnostic, pragmatic default, not a font-matching
 *   exercise: it never introduces a *second* missing-font risk on top of
 *   the one this function exists to close, since it's the same face
 *   `ROLE_DEFAULT` already relies on. The mono role gets no special
 *   CJK-monospace treatment either -- no `SAFE_FONTS` member is both
 *   Windows-safe and a monospace CJK face, so a Consolas-declared code
 *   block's CJK comment text renders in the same (proportional) Microsoft
 *   YaHei as any other non-CJK-capable face's fallback. This also firms up
 *   rather than undercuts `measureMonoTextUnits`'s own pre-existing CJK
 *   width assumption (`svg-text-layout.ts`): that model already sizes a
 *   mono-role CJK character at ~1 em specifically because it measured
 *   Microsoft YaHei's CJK class landing there, on the reasoning that CJK
 *   substitution would likely land near it -- this function now makes that
 *   *exactly* what renders, deterministically, instead of a best guess
 *   about where PowerPoint's uncontrolled substitution would land.
 *
 * Case-insensitive and quote/whitespace-trimming, mirroring
 * `resolveFontFace`'s own matching (a caller always passes that function's
 * return value, which preserves whatever casing the theme's own font stack
 * used). A face outside `SAFE_FONTS` entirely -- which no real caller
 * produces, since `resolveFontFace` only ever returns a `SAFE_FONTS` member
 * or a `ROLE_DEFAULT` value, both always in `SAFE_FONTS` -- still falls
 * back to `EA_FALLBACK_FACE` rather than throwing, so a future caller
 * outside that guarantee degrades safely instead of crashing an export.
 */
export function eaFontFaceFor(latinFace: string): string {
  const name = latinFace.replace(/['"]/g, "").trim()
  return CJK_SAFE_FACES.has(name.toLowerCase()) ? name : EA_FALLBACK_FACE
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

/**
 * True when `fontFamily` is a family list `resolveFontStack` above produces
 * for role `"mono"` — i.e. text whose rendered `font-family` attribute came
 * from `ctx.fonts.mono` (`code.tsx`, the sole mono-role consumer today),
 * which sizes that text with `measureMonoTextUnits`'s exact per-glyph model
 * instead of the proportional `measureTextUnits` every other role still
 * uses (see that function's derivation comment in svg-text-layout.ts).
 *
 * `svg-audit.ts`'s overflow detector imports this rather than hardcoding a
 * font-name literal of its own, so its "is this mono text" branch can't
 * silently drift from the renderer's actual role decision (borrow-wave
 * Task 3 review round, 2026-07-21 — task-3-review.md's Important finding
 * N1, scratchpad, not shipped in this repo). Before that round's fix,
 * `code.tsx` and the auditor both sized every role with the same
 * proportional formula, so the two were structurally self-consistent — the
 * auditor could never flag content the renderer didn't also (by the same
 * math) consider oversized. Once the mono role switched to an exact model
 * while every other role kept estimating, that self-consistency broke: an
 * auditor still measuring mono text proportionally can flag real,
 * upper/underscore-heavy code (constant names, SQL keywords) the exact
 * renderer never actually overflows.
 *
 * Matches on `resolveFontStack`'s mono-only fallback suffix
 * (`PREVIEW_FALLBACK.mono`), not the resolved face name. The face name
 * varies with theme/input (`ROLE_DEFAULT.mono` = "Consolas" today, but any
 * `SAFE_FONTS` mono entry a theme lists first would resolve instead — e.g.
 * tech/journal's `["Consolas", "Courier New"]` stack still resolves to
 * "Consolas" only because it's listed first); what actually decides which
 * width model `code.tsx` uses is the *role*, not that specific face.
 * `resolveFontStack` appends `PREVIEW_FALLBACK.mono` only when
 * `role === "mono"` — no other role's fallback (`.serif`/`.sans`) can ever
 * produce this suffix — so keying off it tracks the renderer's real role
 * decision instead of one face name it currently happens to resolve to.
 */
export function isMonoFontFamily(fontFamily: string): boolean {
  return fontFamily.endsWith(`, ${PREVIEW_FALLBACK.mono}`)
}

/**
 * True when a DrawingML/CSS `font-weight` value renders bold. Shared
 * between the export converter (`svg2pptx/text.ts`, which maps this to
 * OOXML's boolean `b="1"` run property) and the overflow auditor
 * (`svg-audit.ts`'s `auditSvgMarkup`) so the two can never literally-drift
 * apart on which weight value counts as bold (bold-metrics fix,
 * 2026-07-24) — the same class of risk `isMonoFontFamily` above already
 * closed for the mono/proportional split, per root-cause.md's
 * "estimator/audit shared-blindness" finding: the auditor and the renderer
 * sharing one *source* for a judgment, not each hand-rolling their own
 * copy that can silently diverge. Matches CSS's two bold keywords
 * (`"bold"`/`"bolder"`) or any numeric weight >= 600 — OOXML has no weight
 * granularity beyond a single on/off bit, so PowerPoint renders anything
 * >= 600 with the same real Bold glyph outline as a literal `"bold"`.
 */
export function isBold(weight: string | null): boolean {
  if (!weight) return false
  if (weight === "bold" || weight === "bolder") return true
  return parseInt(weight, 10) >= 600
}

/**
 * Re-exported from `svg-text-layout.ts` (backlog-sweep task I2) so a
 * font-role caller here — `registerTheme` (`themes/definitions.ts`)
 * foremost — can ask "does this resolved face get an exact width model"
 * alongside `resolveFontFace` without a separate `../lib/svg-text-layout`
 * import of its own. See that function's own doc comment for the
 * georgia/yahei-only exact set and its class-average fallback.
 */
export { hasExactWidthTable } from "../lib/svg-text-layout"
