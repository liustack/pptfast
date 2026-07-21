import JSZip from "jszip"
import { eaFontFaceFor } from "@/svg/fonts"

/**
 * CJK east-asian font-slot patch (follow-up to borrow-wave Task 3's
 * documented CJK glyph gap — see `fonts.ts`'s header comment and
 * `eaFontFaceFor`'s own doc comment for the mapping policy this applies).
 *
 * Pre-check finding: pptxgenjs 4.0.1 has no API to set `<a:ea>` (East
 * Asian) independently of `<a:latin>` — its `TextPropsOptions.fontFace` is
 * a single string (`node_modules/pptxgenjs/types/index.d.ts`), and its own
 * `genXmlTextRunProperties` (`pptxgen.cjs.js`) already writes all three font
 * slots from that one value whenever it's set:
 *
 * ```
 * <a:latin typeface="Georgia" pitchFamily="34" charset="0"/>
 * <a:ea typeface="Georgia" pitchFamily="34" charset="-122"/>
 * <a:cs typeface="Georgia" pitchFamily="34" charset="-120"/>
 * ```
 *
 * (verified by unzipping a real `generatePptxBlob` result — every text op
 * this codebase emits sets `op.fontFace` from the SVG `<text>` element's own
 * `font-family` attribute, which `resolveFontStack`/`resolveFontFace`
 * always populate, so this is the shape of every real run in a shipped
 * deck, not a hypothetical). So the bug is not a *missing* `<a:ea>` — it's
 * an `<a:ea>` already present but pointing at the same face as `<a:latin>`,
 * which for Georgia/Consolas (zero CJK glyphs — `fonts.ts`) still leaves
 * PowerPoint to silently substitute an uncontrolled font for any CJK
 * character in that run. There is no native pptxgenjs path that can
 * express a face-keyed `<a:latin>`≠`<a:ea>` mapping, so this patches the
 * written package directly — same JSZip-write-after-patch shape as the
 * sibling `render.ts`'s `applyGradientFills` and `pptx-animations.ts`'s
 * `applySlideTransitions`/`applyElementAnimations`.
 *
 * Unconditional, not content-gated: every `<a:latin>` in every slide part
 * gets a corrected `<a:ea>`, regardless of whether that specific run's text
 * contains any CJK character. A per-run "does this text contain CJK"
 * detector would make the exported bytes depend on run content in a way
 * nothing else in this pipeline does, and would still miss any run whose
 * text starts Latin-only but is later hand-edited in PowerPoint to add CJK
 * — declaring the correct `<a:ea>` face on every run costs nothing (a
 * Latin-only run's `<a:ea>` slot is simply never consulted) and closes the
 * gap completely rather than probabilistically.
 */

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

/** A `.pptx`'s own slide part path, e.g. `ppt/slides/slide1.xml` — same
 *  scope as every sibling JSZip patch (gradient/transition/element-anim):
 *  never theme/master/layout/notesSlide parts, which either use scheme
 *  placeholders (`+mn-ea`) this feature doesn't touch, or (notesSlide)
 *  never carry an explicit `fontFace` from this codebase in the first
 *  place. */
const SLIDE_PART_RE = /^ppt\/slides\/slide\d+\.xml$/

/**
 * Matches one `<a:latin typeface="X".../>`, optionally immediately followed
 * by its own `<a:ea typeface="Y".../>` — per ECMA-376's `CT_TextCharacterProperties`
 * child order (`latin`, `ea`, `cs`, all optional but order-fixed when
 * present), `<a:ea>` can only ever legally sit directly after `<a:latin>`
 * and before any `<a:cs>`, so anchoring on adjacency both finds the right
 * target and guarantees the rewrite can never reorder anything.
 *
 * Group 1 = the latin face (also what `eaFontFaceFor` is keyed on). Group 2
 * = the latin tag's own trailing attributes, preserved verbatim. Group 3 =
 * the existing ea tag's own trailing attributes when one is already present
 * (`undefined` when this run has no `<a:ea>` at all yet — group 3 only
 * matches inside the optional non-capturing wrapper, so a plain "no <a:ea>
 * here" leaves it `undefined` rather than an empty string).
 *
 * Zero-whitespace-adjacency assumption: the `<a:ea...>` alternative matches
 * only when it starts the instant `<a:latin...>`'s own `/>` ends, no space
 * or newline tolerated in between. This is exactly how pptxgenjs 4.0.1's
 * `genXmlTextRunProperties` builds the string today (plain `+=`
 * concatenation, no pretty-printing — verified against
 * `node_modules/pptxgenjs/dist/pptxgen.cjs.js`), so it holds for every real
 * run this codebase exports. It is not a documented/versioned contract on
 * pptxgenjs's part, though: a future `^4.0.1`-range release that reformats
 * this internal concatenation (e.g. adds a newline for readability) would
 * make the optional group stop matching for the affected runs — not a
 * silent no-op, but `patchEaFontsInXml` would then treat that run as
 * latin-only and *insert* a fresh `<a:ea>` right after `<a:latin>`, leaving
 * the old, now-unmatched (and still wrong) `<a:ea>` untouched immediately
 * after it — two `<a:ea>` siblings on one run, which `CT_TextCharacterProperties`
 * forbids (at most one `ea` child). `pptx-ea-fonts.test.ts`'s whitespace-variant
 * test pins today's exact behavior so a pptxgenjs upgrade that breaks this
 * assumption fails loud there (and independently, in the real-pptxgenjs e2e
 * leg) instead of shipping a malformed package silently.
 */
const LATIN_EA_RE = /<a:latin typeface="([^"]*)"([^>]*?)\/>(?:<a:ea typeface="[^"]*"([^>]*?)\/>)?/g

/**
 * Rewrite one slide part's full XML text so every `<a:latin>` run/paragraph-
 * default font is immediately followed by an `<a:ea>` naming the correct
 * face for that latin face (`eaFontFaceFor`): replacing an existing ea tag
 * in place (preserving its own `pitchFamily`/`charset` attributes, only the
 * `typeface` value changes) when one is already there, or inserting a
 * fresh, attribute-free one when it's missing. Never touches a following
 * `<a:cs>` — out of scope for this feature (see this file's header
 * comment) — which, since it's never part of the match, simply stays
 * exactly where it already was.
 *
 * Idempotent by construction: `eaFontFaceFor` is a pure function of the
 * latin face alone, which this function never changes, so re-running it
 * against its own output recomputes the identical ea value and produces
 * byte-identical text.
 */
function patchEaFontsInXml(xml: string): string {
  return xml.replace(
    LATIN_EA_RE,
    (_full, latinFace: string, latinAttrs: string, eaAttrs: string | undefined) =>
      `<a:latin typeface="${latinFace}"${latinAttrs}/><a:ea typeface="${eaFontFaceFor(latinFace)}"${eaAttrs ?? ""}/>`,
  )
}

/**
 * Patch a finished `.pptx`'s slide XML, correcting/inserting every run's
 * `<a:ea>` font-slot face (see this file's header comment). Defensive like
 * `applySlideTransitions`/`applyElementAnimations` (not fail-loud like
 * `applyGradientFills`): a bad/non-zip input just comes back unchanged.
 * That's the right asymmetry here too — unlike a missed gradient-fill
 * patch (a specific, trackable `objectName` target going unfound, which
 * signals a real wiring bug), "this slide part has zero `<a:latin>` tags"
 * is an entirely ordinary, expected state (a shapes-only slide with no
 * text), not an error to throw on.
 */
export async function applyEaFontFaces(pptx: Blob | ArrayBuffer | Uint8Array): Promise<Blob> {
  const asBlob = pptx instanceof Blob ? pptx : new Blob([pptx as BlobPart], { type: PPTX_MIME })

  try {
    const zip = await JSZip.loadAsync(await asBlob.arrayBuffer())
    const slidePaths = Object.keys(zip.files).filter((p) => SLIDE_PART_RE.test(p) && !zip.files[p].dir)
    if (slidePaths.length === 0) return asBlob

    let changed = false
    for (const path of slidePaths) {
      const raw = await zip.files[path].async("string")
      const patched = patchEaFontsInXml(raw)
      if (patched !== raw) {
        zip.file(path, patched)
        changed = true
      }
    }
    if (!changed) return asBlob

    const ab = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })
    return new Blob([ab], { type: PPTX_MIME })
  } catch {
    return asBlob
  }
}
