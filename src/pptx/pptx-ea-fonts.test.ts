import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { applyEaFontFaces } from "./pptx-ea-fonts"

/**
 * One `<p:sp>` text run shaped like pptxgenjs's real `genXmlTextRunProperties`
 * output (verified against a real `generatePptxBlob` result — see
 * `pptx-ea-fonts.ts`'s header comment): `<a:latin>`/`<a:ea>`/`<a:cs>` always
 * appear together, in that order, all three naming the *same* face pptxgenjs
 * was asked for via its single `fontFace` option — this fixture's `eaFace`
 * defaults to matching `latinFace` for exactly that reason. Passing a
 * different `eaFace` simulates a run that (unlike anything pptxgenjs itself
 * produces today) already has a distinct ea value, to prove the patch
 * corrects it rather than assuming it's always a fresh latin-mirroring value.
 */
function runXml(latinFace: string, eaFace = latinFace): string {
  return (
    `<a:r><a:rPr lang="en-US" sz="1800" dirty="0"><a:solidFill><a:srgbClr val="000000"/></a:solidFill>` +
    `<a:latin typeface="${latinFace}" pitchFamily="34" charset="0"/>` +
    `<a:ea typeface="${eaFace}" pitchFamily="34" charset="-122"/>` +
    `<a:cs typeface="${latinFace}" pitchFamily="34" charset="-120"/></a:rPr><a:t>hi</a:t></a:r>`
  )
}

/** A run with no `<a:ea>`/`<a:cs>` at all — defensive case no live pptxgenjs
 *  path produces today, but the patch must still handle it (insert, not
 *  crash) per the controller ruling's literal "insert right after latin". */
function runXmlLatinOnly(latinFace: string): string {
  return (
    `<a:r><a:rPr lang="en-US" sz="1800" dirty="0">` +
    `<a:latin typeface="${latinFace}" pitchFamily="34" charset="0"/></a:rPr><a:t>hi</a:t></a:r>`
  )
}

function slidePartXml(n: number, runs: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree><p:sp><p:txBody><a:p>${runs}</a:p></p:txBody></p:sp></p:spTree></p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  )
}

/**
 * A `<p:txBody>`'s `<a:lstStyle><a:lvl1pPr><a:defRPr>...</a:defRPr>` shaped
 * like pptxgenjs's `genXmlTextRunProperties(opts, isDefault=true)` output
 * for a placeholder shape (`genXmlTextBody`'s `slideObj._type ===
 * 'placeholder'` branch — the only path that ever passes `isDefault=true`).
 * `LATIN_EA_RE` has no anchor to any enclosing tag name, so it's
 * parent-tag-agnostic by construction — pptxgenjs's own
 * `genXmlTextRunProperties` is the *same function* for both `<a:rPr>`
 * (`isDefault=false`) and `<a:defRPr>` (`isDefault=true`), emitting an
 * identical latin/ea/cs triple either way. This codebase's own
 * `svg2pptx/render.ts` never sets `opts.placeholder` on its `addText`
 * calls, so no real slide part in this repo produces a `<a:defRPr>` with a
 * real face today — this fixture exists purely to pin that the patch
 * really does reach this context, not just that the regex theoretically
 * could.
 */
function slidePartWithDefRPr(latinFace: string): string {
  const lstStyle =
    `<a:lstStyle><a:lvl1pPr algn="l"><a:defRPr sz="1800" kern="1200">` +
    `<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>` +
    `<a:latin typeface="${latinFace}" pitchFamily="34" charset="0"/>` +
    `<a:ea typeface="${latinFace}" pitchFamily="34" charset="-122"/>` +
    `<a:cs typeface="${latinFace}" pitchFamily="34" charset="-120"/></a:defRPr></a:lvl1pPr></a:lstStyle>`
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree><p:sp><p:txBody>${lstStyle}<a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree></p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  )
}

async function buildPptx(slideRuns: string[]): Promise<Blob> {
  const zip = new JSZip()
  slideRuns.forEach((runs, i) => zip.file(`ppt/slides/slide${i + 1}.xml`, slidePartXml(i + 1, runs)))
  zip.file("ppt/presentation.xml", "<p:presentation/>")
  // A theme part carrying scheme-placeholder `<a:latin typeface="+mn-lt"/>`
  // font tags of its own (real pptxgenjs boilerplate shape) — proves the
  // patch is scoped to `ppt/slides/*.xml` like every sibling JSZip patch,
  // not a blind whole-package regex sweep.
  zip.file(
    "ppt/theme/theme1.xml",
    `<a:theme><a:fontScheme><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont></a:fontScheme></a:theme>`,
  )
  const ab = await zip.generateAsync({ type: "arraybuffer" })
  return new Blob([ab])
}

async function slideXml(blob: Blob, n = 1): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return zip.files[`ppt/slides/slide${n}.xml`]!.async("string")
}

describe("applyEaFontFaces", () => {
  it("corrects an existing ea tag pointing at the same non-CJK latin face pptxgenjs writes (Georgia -> Microsoft YaHei)", async () => {
    const out = await applyEaFontFaces(await buildPptx([runXml("Georgia")]))
    const xml = await slideXml(out)
    expect(xml).toContain('<a:latin typeface="Georgia" pitchFamily="34" charset="0"/>')
    expect(xml).toContain('<a:ea typeface="Microsoft YaHei" pitchFamily="34" charset="-122"/>')
    expect(xml).not.toContain('<a:ea typeface="Georgia"')
  })

  it("self-references a CJK-capable latin face (SimSun -> SimSun), still rewriting explicitly", async () => {
    const out = await applyEaFontFaces(await buildPptx([runXml("SimSun")]))
    const xml = await slideXml(out)
    expect(xml).toContain('<a:ea typeface="SimSun" pitchFamily="34" charset="-122"/>')
  })

  it("preserves DrawingML child order: <a:latin> then <a:ea> then <a:cs>", async () => {
    const out = await applyEaFontFaces(await buildPptx([runXml("Consolas")]))
    const xml = await slideXml(out)
    const latinIdx = xml.indexOf("<a:latin")
    const eaIdx = xml.indexOf("<a:ea")
    const csIdx = xml.indexOf("<a:cs")
    expect(latinIdx).toBeGreaterThan(-1)
    expect(eaIdx).toBeGreaterThan(latinIdx)
    expect(csIdx).toBeGreaterThan(eaIdx)
    // <a:cs> itself is untouched — this feature only ever corrects <a:ea>.
    expect(xml).toContain('<a:cs typeface="Consolas" pitchFamily="34" charset="-120"/>')
  })

  it("inserts a fresh <a:ea> right after <a:latin> when the run has none yet", async () => {
    const out = await applyEaFontFaces(await buildPptx([runXmlLatinOnly("Georgia")]))
    const xml = await slideXml(out)
    expect(xml).toMatch(
      /<a:latin typeface="Georgia" pitchFamily="34" charset="0"\/><a:ea typeface="Microsoft YaHei"\/>/,
    )
  })

  // Pins LATIN_EA_RE's documented zero-whitespace-adjacency assumption (see
  // that regex's own doc comment in pptx-ea-fonts.ts). pptxgenjs 4.0.1 never
  // actually produces this shape — its `genXmlTextRunProperties` builds the
  // three tags via plain string concatenation, no whitespace between them —
  // so this is a synthetic worst case, not a real fixture. It exists so a
  // future pptxgenjs reformat (or any other producer of this XML shape)
  // can't silently degrade export correctness: if this assertion ever needs
  // to change, that's the signal someone actually hit the gap and the regex
  // needs revisiting, not a silent behavior drift nobody notices.
  it("does NOT tolerate whitespace between <a:latin> and <a:ea> — pinned as a known limitation, not a desired outcome", async () => {
    const runWithWhitespaceBeforeEa =
      `<a:r><a:rPr lang="en-US" sz="1800" dirty="0">` +
      `<a:latin typeface="Georgia" pitchFamily="34" charset="0"/>\n` +
      `<a:ea typeface="Georgia" pitchFamily="34" charset="-122"/>` +
      `<a:cs typeface="Georgia" pitchFamily="34" charset="-120"/></a:rPr><a:t>hi</a:t></a:r>`
    const out = await applyEaFontFaces(await buildPptx([runWithWhitespaceBeforeEa]))
    const xml = await slideXml(out)
    // The optional <a:ea> alternative fails to match past the newline, so
    // the match is latin-only and a fresh, correct <a:ea> gets inserted
    // immediately after <a:latin> — same as the no-ea-at-all case above.
    expect(xml).toContain(
      '<a:latin typeface="Georgia" pitchFamily="34" charset="0"/><a:ea typeface="Microsoft YaHei"/>',
    )
    // But the original whitespace-separated <a:ea typeface="Georgia"> is
    // never consumed by the match, so it survives untouched right after —
    // two <a:ea> siblings on one run (CT_TextCharacterProperties allows at
    // most one), the exact malformed-package failure mode the regex's doc
    // comment names.
    const eaCount = (xml.match(/<a:ea typeface="/g) ?? []).length
    expect(eaCount).toBe(2)
    expect(xml).toContain('<a:ea typeface="Georgia" pitchFamily="34" charset="-122"/>')
  })

  it("corrects <a:ea> inside an <a:defRPr> context, not just <a:rPr> (LATIN_EA_RE is parent-tag-agnostic by design)", async () => {
    const zip = new JSZip()
    zip.file("ppt/slides/slide1.xml", slidePartWithDefRPr("Georgia"))
    const ab = await zip.generateAsync({ type: "arraybuffer" })
    const out = await applyEaFontFaces(new Blob([ab]))
    const xml = await slideXml(out)
    expect(xml).toContain("<a:defRPr")
    expect(xml).toContain(
      '<a:latin typeface="Georgia" pitchFamily="34" charset="0"/><a:ea typeface="Microsoft YaHei" pitchFamily="34" charset="-122"/>',
    )
    expect(xml).not.toContain('<a:ea typeface="Georgia"')
  })

  it("patches every run independently, keyed by that run's own latin face", async () => {
    const out = await applyEaFontFaces(
      await buildPptx([runXml("Georgia") + runXml("SimSun") + runXml("Consolas")]),
    )
    const xml = await slideXml(out)
    expect(xml).toContain('<a:latin typeface="Georgia" pitchFamily="34" charset="0"/><a:ea typeface="Microsoft YaHei"')
    expect(xml).toContain('<a:latin typeface="SimSun" pitchFamily="34" charset="0"/><a:ea typeface="SimSun"')
    expect(xml).toContain('<a:latin typeface="Consolas" pitchFamily="34" charset="0"/><a:ea typeface="Microsoft YaHei"')
  })

  it("patches every slide part in a multi-slide deck", async () => {
    const out = await applyEaFontFaces(await buildPptx([runXml("Georgia"), runXml("KaiTi")]))
    const xml1 = await slideXml(out, 1)
    const xml2 = await slideXml(out, 2)
    expect(xml1).toContain('<a:ea typeface="Microsoft YaHei"')
    expect(xml2).toContain('<a:ea typeface="KaiTi"')
  })

  it("leaves non-slide parts untouched (e.g. theme1.xml's own scheme-placeholder font tags)", async () => {
    const out = await applyEaFontFaces(await buildPptx([runXml("Georgia")]))
    const zip = await JSZip.loadAsync(await out.arrayBuffer())
    const theme = await zip.files["ppt/theme/theme1.xml"]!.async("string")
    expect(theme).toContain('<a:latin typeface="Calibri Light"/><a:ea typeface=""/>')
  })

  it("is idempotent: patching twice matches patching once, byte for byte", async () => {
    const once = await applyEaFontFaces(await buildPptx([runXml("Georgia") + runXml("SimSun")]))
    const twice = await applyEaFontFaces(once)
    expect(await slideXml(twice)).toBe(await slideXml(once))
  })

  it("returns the input unchanged when no slide has any <a:latin> tag", async () => {
    const input = await buildPptx([""])
    const out = await applyEaFontFaces(input)
    expect(await slideXml(out)).toBe(await slideXml(input))
  })

  it("returns the input unchanged on a non-zip blob (never breaks export)", async () => {
    const bad = new Blob(["not a zip"])
    expect(await applyEaFontFaces(bad)).toBe(bad)
  })
})
