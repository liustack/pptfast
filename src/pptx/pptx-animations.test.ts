import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import {
  applySlideTransitions,
  transitionXml,
  blockMarker,
  blockAnimationEffect,
  elementTimingXml,
  applyElementAnimations,
} from "./pptx-animations"

describe("transitionXml", () => {
  it("fade matches the DSpark sample deck's structure verbatim (p14:dur namespace + <p:fade/>)", () => {
    // ~/projects/claw/DSpark-科普版-动画版.pptx, unpacked ppt/slides/slide1.xml:
    // <p:transition p14:dur="400" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">
    //   <p:fade/>
    // </p:transition>
    const xml = transitionXml("fade")
    expect(xml).toContain('p14:dur="400"')
    expect(xml).toContain('xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"')
    expect(xml).toContain("<p:fade/>")
    expect(xml.startsWith("<p:transition")).toBe(true)
    expect(xml.endsWith("</p:transition>")).toBe(true)
  })

  it("push uses <p:push dir=\"r\"/> (ppt-master pptx_animations.py TRANSITIONS table)", () => {
    const xml = transitionXml("push")
    expect(xml).toContain('<p:push dir="r"/>')
  })

  it("wipe uses <p:wipe dir=\"r\"/> (ppt-master pptx_animations.py TRANSITIONS table)", () => {
    const xml = transitionXml("wipe")
    expect(xml).toContain('<p:wipe dir="r"/>')
  })

  it("defaults durMs to 400", () => {
    expect(transitionXml("fade")).toContain('p14:dur="400"')
  })

  it("honors a custom durMs", () => {
    expect(transitionXml("fade", 800)).toContain('p14:dur="800"')
  })
})

// A minimal slide part shaped like pptxgenjs's real output (verified by
// unzipping a real `generatePptxBlob` result): ends in
// `</p:cSld><p:clrMapOvr>...</p:clrMapOvr></p:sld>`, no `p:timing`.
function slidePartXml(n: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="${n}" name="Shape ${n}"/></p:nvSpPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

async function buildPptx(slideCount: number): Promise<Blob> {
  const zip = new JSZip()
  for (let i = 1; i <= slideCount; i++) {
    zip.file(`ppt/slides/slide${i}.xml`, slidePartXml(i))
  }
  zip.file("ppt/presentation.xml", "<p:presentation/>")
  const ab = await zip.generateAsync({ type: "arraybuffer" })
  return new Blob([ab])
}

async function slideXmls(blob: Blob): Promise<string[]> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const paths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p) && !zip.files[p].dir)
    .sort()
  return Promise.all(paths.map((p) => zip.files[p].async("string")))
}

describe("applySlideTransitions", () => {
  it("injects the transition into every slide part, right before </p:sld>", async () => {
    const out = await applySlideTransitions(await buildPptx(3), "fade")
    const xmls = await slideXmls(out)
    expect(xmls).toHaveLength(3)
    for (const xml of xmls) {
      expect(xml).toContain("<p:fade/>")
      // Lands after </p:clrMapOvr>, immediately before </p:sld> — the only
      // schema-valid slot per ECMA-376 CT_Slide child order when no
      // p:timing is present.
      expect(xml).toMatch(/<\/p:clrMapOvr><p:transition[\s\S]*<\/p:transition><\/p:sld>$/)
    }
  })

  it("defaults to fade when no effect is passed", async () => {
    const out = await applySlideTransitions(await buildPptx(1))
    const [xml] = await slideXmls(out)
    expect(xml).toContain("<p:fade/>")
  })

  it('skips injection entirely for "none" (no <p:transition> anywhere)', async () => {
    const input = await buildPptx(2)
    const out = await applySlideTransitions(input, "none")
    const xmls = await slideXmls(out)
    for (const xml of xmls) expect(xml).not.toContain("<p:transition")
  })

  it('"none" returns the exact input blob unchanged (identity, not just equal bytes)', async () => {
    const input = await buildPptx(1)
    const out = await applySlideTransitions(input, "none")
    expect(out).toBe(input)
  })

  it("uses push/wipe's own element when requested", async () => {
    const pushOut = await applySlideTransitions(await buildPptx(1), "push")
    expect((await slideXmls(pushOut))[0]).toContain('<p:push dir="r"/>')

    const wipeOut = await applySlideTransitions(await buildPptx(1), "wipe")
    expect((await slideXmls(wipeOut))[0]).toContain('<p:wipe dir="r"/>')
  })

  it("is idempotent: calling it twice never stacks a second <p:transition>", async () => {
    const once = await applySlideTransitions(await buildPptx(2), "fade")
    const twice = await applySlideTransitions(once, "fade")
    const xmls = await slideXmls(twice)
    for (const xml of xmls) {
      expect(xml.match(/<p:transition/g)).toHaveLength(1)
    }
  })

  it("re-injecting with a different effect replaces (not stacks) the previous one", async () => {
    const fadeOnce = await applySlideTransitions(await buildPptx(1), "fade")
    const rewipe = await applySlideTransitions(fadeOnce, "wipe")
    const [xml] = await slideXmls(rewipe)
    expect(xml.match(/<p:transition/g)).toHaveLength(1)
    expect(xml).toContain('<p:wipe dir="r"/>')
    expect(xml).not.toContain("<p:fade/>")
  })

  it("returns the input unchanged on a non-zip blob (never breaks export)", async () => {
    const bad = new Blob(["not a zip"])
    const out = await applySlideTransitions(bad, "fade")
    expect(out).toBe(bad)
  })
})

// ============================================================================
// S3 — per-block entrance animations (opt-in, meta.animation.elements="auto")
// ============================================================================

describe("blockMarker", () => {
  it("zero-pads slide/block indices to 4 digits", () => {
    expect(blockMarker(0, 2)).toBe("blk0000-0002")
    expect(blockMarker(3, 12)).toBe("blk0003-0012")
  })

  it("never produces a marker that is a substring of a different marker (10+ blocks/slides)", () => {
    // blk0-2 would be a naive substring of blk0-20 without fixed-width
    // padding — this is exactly the false-positive `collectSpidsForBlock`'s
    // `.includes()` check must never hit.
    const a = blockMarker(0, 2)
    const b = blockMarker(0, 20)
    expect(b.includes(a)).toBe(false)
    expect(a.includes(b)).toBe(false)

    const c = blockMarker(1, 0)
    const d = blockMarker(10, 0)
    expect(d.includes(c)).toBe(false)
  })
})

describe("blockAnimationEffect", () => {
  it("maps chart to wipe", () => {
    expect(blockAnimationEffect("chart")).toBe("wipe")
  })

  it("maps steps to fly", () => {
    expect(blockAnimationEffect("steps")).toBe("fly")
  })

  it("maps kpi_cards, icon_cards, and verdict_banner to fade (explicitly called out in the plan)", () => {
    expect(blockAnimationEffect("kpi_cards")).toBe("fade")
    expect(blockAnimationEffect("icon_cards")).toBe("fade")
    expect(blockAnimationEffect("verdict_banner")).toBe("fade")
  })

  it("defaults every other block type to fade", () => {
    expect(blockAnimationEffect("paragraph")).toBe("fade")
    expect(blockAnimationEffect("bullets")).toBe("fade")
    expect(blockAnimationEffect("quote")).toBe("fade")
    expect(blockAnimationEffect("image")).toBe("fade")
  })
})

describe("elementTimingXml", () => {
  it("returns an empty string when no entry has any spids", () => {
    expect(elementTimingXml([{ effect: "fade", spids: [] }])).toBe("")
    expect(elementTimingXml([])).toBe("")
  })

  it("matches the DSpark sample's root/mainSeq/outer-wrapper structure verbatim", () => {
    // ~/projects/claw/DSpark-科普版-动画版.pptx, unpacked ppt/slides/slide3.xml:
    // <p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"> …
    //   <p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"> …
    //     <p:par><p:cTn id="3" fill="hold">
    //       <p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst>
    const xml = elementTimingXml([{ effect: "fade", spids: [16] }])
    expect(xml.startsWith("<p:timing>")).toBe(true)
    expect(xml.endsWith("</p:timing>")).toBe(true)
    expect(xml).toContain('<p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">')
    expect(xml).toContain('<p:seq concurrent="1" nextAc="seek">')
    expect(xml).toContain('<p:cTn id="2" dur="indefinite" nodeType="mainSeq">')
    expect(xml).toContain(
      '<p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/>' +
        '<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst>',
    )
    // Sample-verified boilerplate siblings on <p:seq> and the trailing <p:bldLst>.
    expect(xml).toContain(
      '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>',
    )
    expect(xml).toContain(
      '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>',
    )
    expect(xml).toContain('<p:bldP spid="16" grpId="0"/>')
  })

  it("a single-spid block's par is set-visibility → animEffect, matching the sample's fade block exactly", () => {
    // Sample's spid=16 block (presetID=10/entr/0, filter="fade", dur 400):
    const xml = elementTimingXml([{ effect: "fade", spids: [16] }])
    expect(xml).toContain(
      '<p:cTn id="5" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" nodeType="afterEffect">',
    )
    expect(xml).toContain(
      '<p:set><p:cBhvr><p:cTn id="6" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>' +
        '<p:tgtEl><p:spTgt spid="16"/></p:tgtEl>' +
        '<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>' +
        '<p:to><p:strVal val="visible"/></p:to></p:set>',
    )
    expect(xml).toContain(
      '<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="7" dur="400"/>' +
        '<p:tgtEl><p:spTgt spid="16"/></p:tgtEl></p:cBhvr></p:animEffect>',
    )
    // set always precedes its animEffect for the same spid (visibility flips before the effect plays).
    expect(xml.indexOf('spid="16"')).toBeLessThan(xml.lastIndexOf('spid="16"'))
  })

  it("stages blocks 200ms apart by default (S3: 块间 after-previous 错峰 200ms)", () => {
    const xml = elementTimingXml([
      { effect: "fade", spids: [16] },
      { effect: "wipe", spids: [26] },
      { effect: "fly", spids: [35] },
    ])
    expect(xml).toContain('<p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst>')
    expect(xml).toContain('fill="hold"><p:stCondLst><p:cond delay="200"/></p:stCondLst>')
    expect(xml).toContain('fill="hold"><p:stCondLst><p:cond delay="400"/></p:stCondLst>')
  })

  it("honors a custom staggerMs", () => {
    const xml = elementTimingXml(
      [{ effect: "fade", spids: [16] }, { effect: "fade", spids: [26] }],
      150,
    )
    expect(xml).toContain('fill="hold"><p:stCondLst><p:cond delay="150"/></p:stCondLst>')
  })

  it("uses the wipe/fly filter+preset pairing chosen for S3's directional mapping", () => {
    const wipe = elementTimingXml([{ effect: "wipe", spids: [1] }])
    expect(wipe).toContain('filter="wipe(down)"')
    expect(wipe).toContain('presetID="12" presetClass="entr" presetSubtype="4"')

    const fly = elementTimingXml([{ effect: "fly", spids: [1] }])
    expect(fly).toContain('filter="slide(fromLeft)"')
    expect(fly).toContain('presetID="42" presetClass="entr" presetSubtype="8"')
  })

  it("aggregates multiple spids in one block into simultaneous withEffect pars, siblings directly under the block wrapper (no extra grouping layer)", () => {
    const xml = elementTimingXml([{ effect: "fade", spids: [10, 11, 12] }])
    // No chained "afterEffect" leaf for a multi-spid block — every leaf is withEffect.
    expect(xml).not.toContain("nodeType=\"afterEffect\"")
    expect((xml.match(/nodeType="withEffect"/g) ?? []).length).toBe(3)
    for (const spid of [10, 11, 12]) {
      expect(xml).toContain(`<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst>`)
      expect(xml).toContain(`<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:animEffect>`)
      expect(xml).toContain(`<p:bldP spid="${spid}" grpId="0"/>`)
    }
    // The block wrapper (id="4", delay=0 — the only block, so no stagger)
    // parents all three withEffect leaves directly — there is no
    // intermediate "group" <p:par> any more (that used to be id="5" wrapping
    // ids 6/9/12; now id="4" wraps ids 5/8/11 with nothing in between).
    expect(xml).toContain('<p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst>')
    expect(xml).toContain(
      '<p:cTn id="5" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" nodeType="withEffect">',
    )
  })

  it("drops entries with no spids but keeps staging the ones that do have them", () => {
    const xml = elementTimingXml([
      { effect: "fade", spids: [] }, // dropped — block never got rendered
      { effect: "wipe", spids: [26] },
    ])
    expect(xml).not.toBe("")
    expect(xml).toContain('spid="26"')
    // The surviving (only) block still starts at delay=0 — the dropped one
    // doesn't leave a gap in the stagger sequence.
    expect(xml).toContain('<p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst>')
  })

  it("never reuses a p:cTn id within one fragment", () => {
    const xml = elementTimingXml([
      { effect: "fade", spids: [1, 2] },
      { effect: "wipe", spids: [3] },
      { effect: "fly", spids: [4, 5, 6] },
    ])
    const ids = Array.from(xml.matchAll(/<p:cTn id="(\d+)"/g)).map((m) => Number(m[1]))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ============================================================================
// Critical fix regression: PowerPoint's mainSeq par-nesting convention is
// exactly 3 levels deep (click par → block par → effect par). A prior
// revision of `blockParXml` inserted a 4th, redundant "group" `<p:par>`
// around a multi-spid block's withEffect leaves — real PowerPoint (verified
// with a live automation probe, not just a schema reading) refuses to open
// the resulting file, throwing up its "repair" dialog on every launch, on
// every deck that had at least one multi-shape block (i.e. almost every
// real deck: `chart`/`steps`/`kpi_cards`/`icon_cards` blocks routinely
// explode into several shapes). This guard walks the actual parsed DOM tree
// — not a string/regex search — specifically so it can't be fooled by
// attribute-order or whitespace changes and keeps catching this exact class
// of regression regardless of how the XML-building code is refactored.
// ============================================================================
describe("mainSeq par-nesting depth — PowerPoint compatibility guard", () => {
  /** Every `<p:par>`'s nesting depth *below* `mainSeq` (the `<p:seq>` node itself is depth 0). */
  function maxParDepthUnderMainSeq(timingXml: string): number {
    const doc = new DOMParser().parseFromString(
      `<root xmlns:p="urn:x-pptx-test-ns">${timingXml}</root>`,
      "application/xml",
    )
    expect(doc.querySelector("parsererror")).toBeNull()
    const mainSeq = doc.getElementsByTagName("p:seq")[0]
    expect(mainSeq).toBeTruthy()

    let max = 0
    const walk = (el: Element, parDepth: number) => {
      for (const child of Array.from(el.children)) {
        const depth = child.tagName === "p:par" ? parDepth + 1 : parDepth
        if (depth > max) max = depth
        walk(child, depth)
      }
    }
    walk(mainSeq, 0)
    return max
  }

  it("stays at 3 levels for a single-spid block (click → block → afterEffect leaf)", () => {
    const xml = elementTimingXml([{ effect: "fade", spids: [16] }])
    expect(maxParDepthUnderMainSeq(xml)).toBe(3)
  })

  it("stays at 3 levels for a multi-spid block — the withEffect leaves must NOT get an extra grouping par", () => {
    const xml = elementTimingXml([{ effect: "fade", spids: [10, 11, 12] }])
    expect(maxParDepthUnderMainSeq(xml)).toBe(3)
  })

  it("stays at 3 levels across several staged blocks mixing single- and multi-spid", () => {
    const xml = elementTimingXml([
      { effect: "fade", spids: [1, 2] },
      { effect: "wipe", spids: [3] },
      { effect: "fly", spids: [4, 5, 6] },
    ])
    expect(maxParDepthUnderMainSeq(xml)).toBe(3)
  })

  it("stays at 3 levels through the real applyElementAnimations JSZip-patch pipeline, not just the raw fragment", async () => {
    const shapes = [
      { id: 2, name: "svg2pptx-a-blk0000-0000" },
      { id: 3, name: "svg2pptx-b-blk0000-0000" },
      { id: 4, name: "svg2pptx-c-blk0000-0000" }, // block 0: 3 spids (multi)
      { id: 5, name: "svg2pptx-d-blk0000-0001" }, // block 1: 1 spid (single)
    ]
    const zip = new JSZip()
    zip.file(
      "ppt/slides/slide1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ` +
        `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
        `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
        `<p:cSld><p:spTree>${shapes
          .map((s) => `<p:sp><p:nvSpPr><p:cNvPr id="${s.id}" name="${s.name}"/></p:nvSpPr></p:sp>`)
          .join("")}</p:spTree></p:cSld>` +
        `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
    )
    const ab = await zip.generateAsync({ type: "arraybuffer" })
    const out = await applyElementAnimations(new Blob([ab]), [["kpi_cards", "paragraph"]])

    const outZip = await JSZip.loadAsync(await out.arrayBuffer())
    const xml = await outZip.files["ppt/slides/slide1.xml"].async("string")
    const timing = xml.slice(xml.indexOf("<p:timing>"), xml.indexOf("</p:timing>") + "</p:timing>".length)
    expect(maxParDepthUnderMainSeq(timing)).toBe(3)
  })
})

// A slide part carrying `<p:cNvPr id="…" name="…">` entries, shaped like what
// `svg2pptx/render.ts`'s `renderOp`/`withBlockMarker` actually produces —
// used to exercise `applyElementAnimations`'s spid reverse-lookup end to end.
function slidePartXmlWithShapes(shapes: Array<{ id: number; name: string }>): string {
  const sp = shapes
    .map(
      (s) =>
        `<p:sp><p:nvSpPr><p:cNvPr id="${s.id}" name="${s.name}"/></p:nvSpPr></p:sp>`,
    )
    .join("")
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree>${sp}</p:spTree></p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  )
}

async function buildAnimatedPptx(slides: Array<Array<{ id: number; name: string }>>): Promise<Blob> {
  const zip = new JSZip()
  slides.forEach((shapes, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, slidePartXmlWithShapes(shapes))
  })
  zip.file("ppt/presentation.xml", "<p:presentation/>")
  const ab = await zip.generateAsync({ type: "arraybuffer" })
  return new Blob([ab])
}

async function orderedSlideXmls(blob: Blob): Promise<string[]> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const paths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p) && !zip.files[p].dir)
    .sort((a, b) => Number(/slide(\d+)/.exec(a)![1]) - Number(/slide(\d+)/.exec(b)![1]))
  return Promise.all(paths.map((p) => zip.files[p].async("string")))
}

describe("applyElementAnimations", () => {
  it("injects a <p:timing> built from the shapes' blk markers", async () => {
    const input = await buildAnimatedPptx([
      [
        { id: 2, name: "svg2pptx-abc123-blk0000-0000" }, // block 0 (paragraph → fade)
        { id: 5, name: "svg2pptx-gradient-xyz-0-blk0000-0001" }, // block 1 (chart → wipe), gradient marker coexisting
      ],
    ])
    const out = await applyElementAnimations(input, [["paragraph", "chart"]])
    const [xml] = await orderedSlideXmls(out)
    expect(xml).toContain("<p:timing>")
    expect(xml).toContain('<p:spTgt spid="2"/>')
    expect(xml).toContain('<p:spTgt spid="5"/>')
    expect(xml).toContain('filter="fade"')
    expect(xml).toContain('filter="wipe(down)"')
  })

  it("aggregates multiple shapes sharing the same block marker into one par", async () => {
    const input = await buildAnimatedPptx([
      [
        { id: 2, name: "svg2pptx-a-blk0000-0000" },
        { id: 3, name: "svg2pptx-b-blk0000-0000" },
        { id: 4, name: "svg2pptx-c-blk0000-0000" },
      ],
    ])
    const out = await applyElementAnimations(input, [["kpi_cards"]])
    const [xml] = await orderedSlideXmls(out)
    for (const spid of [2, 3, 4]) expect(xml).toContain(`<p:spTgt spid="${spid}"/>`)
    expect((xml.match(/nodeType="withEffect"/g) ?? []).length).toBe(3)
  })

  it("orders verdict_banner last regardless of its position in slide.blocks", async () => {
    const input = await buildAnimatedPptx([
      [
        { id: 2, name: "svg2pptx-a-blk0000-0000" }, // verdict_banner, block index 0
        { id: 3, name: "svg2pptx-b-blk0000-0001" }, // paragraph, block index 1
      ],
    ])
    const out = await applyElementAnimations(input, [["verdict_banner", "paragraph"]])
    const [xml] = await orderedSlideXmls(out)
    // paragraph (spid 3) must be staged before verdict_banner (spid 2) despite
    // being block index 1 (after verdict_banner's index 0).
    expect(xml.indexOf('spid="3"')).toBeLessThan(xml.indexOf('spid="2"'))
    // verdict_banner is fade, staged last → its wrapper carries the later delay.
    expect(xml).toContain('<p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst>')
    expect(xml).toContain('fill="hold"><p:stCondLst><p:cond delay="200"/></p:stCondLst>')
  })

  it("skips slides with no blocks (cover/chapter/ending) without touching their XML", async () => {
    const input = await buildAnimatedPptx([[], [{ id: 2, name: "svg2pptx-a-blk0001-0000" }]])
    const out = await applyElementAnimations(input, [[], ["paragraph"]])
    const [cover, content] = await orderedSlideXmls(out)
    expect(cover).not.toContain("<p:timing>")
    expect(content).toContain("<p:timing>")
  })

  it("skips a slide entirely when none of its blocks' markers are found (nothing was tagged)", async () => {
    const input = await buildAnimatedPptx([[{ id: 2, name: "Shape 1" }]]) // no blk marker at all
    const out = await applyElementAnimations(input, [["paragraph"]])
    const [xml] = await orderedSlideXmls(out)
    expect(xml).not.toContain("<p:timing>")
  })

  it("is idempotent: calling it twice never stacks a second <p:timing>", async () => {
    const input = await buildAnimatedPptx([[{ id: 2, name: "svg2pptx-a-blk0000-0000" }]])
    const once = await applyElementAnimations(input, [["paragraph"]])
    const twice = await applyElementAnimations(once, [["paragraph"]])
    const [xml] = await orderedSlideXmls(twice)
    expect(xml.match(/<p:timing>/g)).toHaveLength(1)
  })

  it("lands <p:timing> after an existing <p:transition> (CT_Slide child order)", async () => {
    const raw = slidePartXmlWithShapes([{ id: 2, name: "svg2pptx-a-blk0000-0000" }])
    const withTransition = raw.replace(
      "</p:sld>",
      '<p:transition p14:dur="400" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p:fade/></p:transition></p:sld>',
    )
    const zip = new JSZip()
    zip.file("ppt/slides/slide1.xml", withTransition)
    const ab = await zip.generateAsync({ type: "arraybuffer" })
    const input = new Blob([ab])

    const out = await applyElementAnimations(input, [["paragraph"]])
    const [xml] = await orderedSlideXmls(out)
    expect(xml.indexOf("<p:transition")).toBeLessThan(xml.indexOf("<p:timing>"))
    expect(xml.endsWith("</p:sld>")).toBe(true)
  })

  it("returns the input unchanged on a non-zip blob (never breaks export)", async () => {
    const bad = new Blob(["not a zip"])
    const out = await applyElementAnimations(bad, [["paragraph"]])
    expect(out).toBe(bad)
  })
})

// ============================================================================
// Critical fix regression: spid collision with pptxgenjs's hardcoded
// placeholder ids (T2 review finding). See `pptx-generate-animations.test.ts`
// for the real-pipeline (no-mock `generatePptxBlob`) counterpart of this —
// this suite covers the JSZip-patch logic directly with a fixture shaped
// exactly like pptxgenjs's actual output.
// ============================================================================
describe("applyElementAnimations — pptxgenjs placeholder id collision", () => {
  // Mirrors pptxgenjs's real STEP4 behavior verbatim: `dist/pptxgen.cjs.js`
  // appends a hardcoded `<p:cNvPr id="25" name="Slide Number Placeholder 0"/>`
  // as the slide's *last* shape whenever the slide's master has `slideNumber`
  // set (every `content`-type master — `master-builder.ts`), independent of
  // the STEP1-3 per-shape id counter (`idx + 2`, sequential from 2). A
  // content slide with >=24 real block shapes — routine for a chart+steps
  // combo, see `pptx-generate-animations.test.ts`'s real-pipeline repro —
  // pushes that counter to 25 too, so pptxgenjs's own output can carry two
  // `<p:cNvPr id="25">` elements in one slide part before this module's fix.
  function slideWithPlaceholderCollision(): Array<{ id: number; name: string }> {
    const chartShapes = Array.from({ length: 14 }, (_, i) => ({
      id: i + 2, // ids 2..15 — block 0 (chart)
      name: `svg2pptx-chart${i}-blk0000-0000`,
    }))
    const stepsShapes = Array.from({ length: 10 }, (_, i) => ({
      id: i + 16, // ids 16..25 — block 1 (steps); last one collides below
      name: `svg2pptx-steps${i}-blk0000-0001`,
    }))
    // pptxgenjs STEP4's own hardcoded shape: no blk marker, id fixed at 25
    // regardless of how many real shapes preceded it.
    const placeholder = { id: 25, name: "Slide Number Placeholder 0" }
    return [...chartShapes, ...stepsShapes, placeholder]
  }

  it('renumbers the colliding placeholder rather than leaving two <p:cNvPr id="25">', async () => {
    const input = await buildAnimatedPptx([slideWithPlaceholderCollision()])
    const out = await applyElementAnimations(input, [["chart", "steps"]])
    const [xml] = await orderedSlideXmls(out)

    const shapes = Array.from(xml.matchAll(/<p:cNvPr id="(\d+)" name="([^"]*)"/g)).map((m) => ({
      id: Number(m[1]),
      name: m[2],
    }))
    // 24 real content shapes + 1 placeholder = 25 shapes, 25 distinct ids —
    // the fix must never drop or merge a shape, only renumber the colliding one.
    expect(shapes).toHaveLength(25)
    expect(new Set(shapes.map((s) => s.id)).size).toBe(25)

    // The real steps shape keeps its original id 25 — first occurrence wins
    // (document order: STEP1-3 content always precedes STEP4's trailing
    // append), so every id this module already reverse-looked-up by marker
    // stays exactly what it was.
    const stepsLast = shapes.find((s) => s.name === "svg2pptx-steps9-blk0000-0001")
    expect(stepsLast?.id).toBe(25)

    // The placeholder — the *second* occurrence of id 25 in document order —
    // is the one that moves.
    const placeholder = shapes.find((s) => s.name === "Slide Number Placeholder 0")
    expect(placeholder?.id).not.toBe(25)

    // Every <p:spTgt spid> the injected timing tree targets resolves to
    // exactly one shape, and it always carries a blk marker — never the
    // renumbered placeholder, regardless of which id it landed on.
    const nameById = new Map(shapes.map((s) => [s.id, s.name]))
    const referencedSpids = Array.from(xml.matchAll(/<p:spTgt spid="(\d+)"/g)).map((m) =>
      Number(m[1]),
    )
    expect(referencedSpids.length).toBeGreaterThan(0)
    for (const spid of referencedSpids) {
      expect(nameById.get(spid)).toMatch(/-blk\d{4}-\d{4}$/)
    }
  })

  it("is a no-op when no ids collide (small-deck default path unaffected)", async () => {
    const input = await buildAnimatedPptx([
      [
        { id: 2, name: "svg2pptx-a-blk0000-0000" },
        { id: 3, name: "svg2pptx-b-blk0000-0000" },
      ],
    ])
    const out = await applyElementAnimations(input, [["paragraph"]])
    const [xml] = await orderedSlideXmls(out)
    expect(xml).toContain('<p:spTgt spid="2"/>')
    expect(xml).toContain('<p:spTgt spid="3"/>')
  })
})
