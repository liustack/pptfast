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
