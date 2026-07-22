// @vitest-environment node
//
// Runs under the real Node/linkedom platform seam, same rationale as
// `package-reader.test.ts` — this is the runtime `generatePptxBlob`'s own
// hard gate actually executes under.
//
// Red-first breakage fixtures (package-audit wave, task 1): render a real
// deck through the real pipeline, surgically corrupt the resulting zip via
// JSZip (never hand-authored XML strings — the corruption has to look like
// something a patch bug would actually produce), then call `auditPptxPackage`
// standalone against the broken bytes and assert it rejects with the right
// invariant named. Every fixture starts from `renderCleanZip`, which itself
// only ever succeeds against a genuinely clean render — `generatePptxBlob`'s
// own gate is unconditional (no skip switch), so there is no way to produce
// an already-broken zip *through* the generator; corruption always happens
// after the fact, standing in for "what if a future patch bug did this."
import { readFileSync } from "node:fs"
import { describe, it, expect, beforeAll } from "vitest"
import JSZip from "jszip"
import type { PptxIR } from "@/ir"
import { installNodePlatform } from "../platform/node"
import { generatePptxBlob } from "./generate"
import { auditPptxPackage } from "./package-audit"

beforeAll(() => {
  installNodePlatform()
})

const BASIC_IR_PATH = new URL("../../examples/basic.json", import.meta.url)

function makeIr(overrides: Partial<PptxIR> = {}): PptxIR {
  return {
    version: "4",
    filename: "package-audit-fixture",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides: [
      { type: "cover", heading: "Package Audit Fixture" },
      { type: "content", heading: "Body", components: [{ type: "bullets", items: ["one", "two"] }] },
      { type: "ending", heading: "Thanks" },
    ],
    ...overrides,
  } as PptxIR
}

/** Render a real deck through the real (unconditionally gated) pipeline and
 * hand back the loaded zip for surgical corruption. */
async function renderCleanZip(ir: PptxIR = makeIr()): Promise<JSZip> {
  const blob = await generatePptxBlob(ir)
  return JSZip.loadAsync(await blob.arrayBuffer())
}

async function readPart(zip: JSZip, path: string): Promise<string> {
  return zip.files[path]!.async("string")
}

describe("auditPptxPackage — positive path", () => {
  it("accepts a real clean render without throwing", async () => {
    await expect(auditPptxPackage(await renderCleanZip())).resolves.toBeUndefined()
  })

  it("never mutates the zip it audits (read-only)", async () => {
    const zip = await renderCleanZip()
    const partPaths = Object.keys(zip.files)
      .filter((p) => !zip.files[p]!.dir)
      .sort()
    const before = new Map<string, string>()
    for (const path of partPaths) before.set(path, await readPart(zip, path))

    await auditPptxPackage(zip)

    const afterPaths = Object.keys(zip.files)
      .filter((p) => !zip.files[p]!.dir)
      .sort()
    expect(afterPaths).toEqual(partPaths)
    for (const path of partPaths) {
      expect(await readPart(zip, path)).toBe(before.get(path))
    }
  })

  it("a real clean render genuinely exercises the connector's zero-axis exception (not vacuously)", async () => {
    // examples/basic.json's own content draws real prstGeom="line" divider
    // shapes (confirmed by unzipping a real render) — this asserts that
    // structural fact directly, so "the gate accepts clean output" isn't
    // trivially true just because no line shape ever appears.
    const basicIr = JSON.parse(readFileSync(BASIC_IR_PATH, "utf-8")) as PptxIR
    const zip = await renderCleanZip(basicIr)
    let sawZeroAxisLine = false
    for (const path of Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))) {
      const xml = await readPart(zip, path)
      if (/<a:prstGeom prst="line">/.test(xml) && /<a:ext cx="0" cy="\d+"\/>|<a:ext cx="\d+" cy="0"\/>/.test(xml)) {
        sawZeroAxisLine = true
        break
      }
    }
    expect(sawZeroAxisLine).toBe(true)
    await expect(auditPptxPackage(zip)).resolves.toBeUndefined()
  })
})

describe("auditPptxPackage — red-first breakage fixtures", () => {
  it("rejects a missing relationship target", async () => {
    const zip = await renderCleanZip()
    // Every slide references its slideLayout via a relationship (pptxgenjs's
    // own universal behavior) — delete the referenced layout part itself,
    // leaving the relationship dangling, the exact shape a media-dedupe-style
    // repoint-gone-wrong patch bug would produce.
    const rels = await readPart(zip, "ppt/slides/_rels/slide1.xml.rels")
    const targetMatch = /Target="\.\.\/slideLayouts\/(slideLayout\d+\.xml)"/.exec(rels)
    expect(targetMatch).toBeTruthy()
    zip.remove(`ppt/slideLayouts/${targetMatch![1]}`)

    await expect(auditPptxPackage(zip)).rejects.toThrow(/relationship-target-missing/)
  })

  it("rejects a duplicate p:cNvPr id within a slide", async () => {
    const zip = await renderCleanZip()
    const path = "ppt/slides/slide2.xml"
    let xml = await readPart(zip, path)
    const ids = Array.from(xml.matchAll(/<p:cNvPr id="(\d+)"/g)).map((m) => m[1]!)
    expect(ids.length).toBeGreaterThanOrEqual(2)
    const [firstId, secondId] = ids
    // Renumber the second shape's id to collide with the first's — the same
    // collision class `pptx-animations.ts`'s own `dedupeShapeIds` doc
    // comment documents as a real, previously-shipped defect (pptxgenjs's
    // STEP1-3 shape counter vs. its hardcoded STEP4 slide-number id).
    xml = xml.replace(new RegExp(`(<p:cNvPr id=")${secondId}(")`), `$1${firstId}$2`)
    zip.file(path, xml)

    await expect(auditPptxPackage(zip)).rejects.toThrow(/duplicate-shape-id/)
  })

  it("rejects a dangling animation shape reference", async () => {
    const zip = await renderCleanZip(
      makeIr({
        meta: { animation: { elements: "auto" } },
      }),
    )
    const slidePaths = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    let timingPath: string | undefined
    let xml = ""
    for (const path of slidePaths) {
      const content = await readPart(zip, path)
      if (content.includes("<p:timing>")) {
        timingPath = path
        xml = content
        break
      }
    }
    expect(timingPath).toBeTruthy()
    expect(xml).toMatch(/<p:spTgt spid="\d+"/)
    // Point one animation target at a shape id that doesn't exist on this
    // slide — the failure mode a stale spid reverse-lookup after a future
    // `dedupeShapeIds` edit would produce (see that function's own doc
    // comment in pptx-animations.ts).
    const broken = xml.replace(/(<p:spTgt spid=")\d+(")/, "$199999$2")
    expect(broken).not.toBe(xml)
    zip.file(timingPath!, broken)

    await expect(auditPptxPackage(zip)).rejects.toThrow(/dangling-animation-target/)
  })
})

describe("auditPptxPackage — additional invariant coverage", () => {
  it("rejects raw non-zip bytes with the zip-unreadable invariant", async () => {
    await expect(auditPptxPackage(new Blob(["not a zip"]))).rejects.toThrow(/zip-unreadable/)
  })

  it("rejects a zip missing a core part", async () => {
    const zip = await renderCleanZip()
    zip.remove("ppt/presentation.xml")
    await expect(auditPptxPackage(zip)).rejects.toThrow(/core-part-missing/)
  })

  it("rejects malformed content in a foundational part (no XML root survives at all)", async () => {
    const zip = await renderCleanZip()
    zip.file("ppt/presentation.xml", "this is not xml at all")
    await expect(auditPptxPackage(zip)).rejects.toThrow(/xml-parse-error/)
  })

  it("rejects the wrong root element in a foundational part", async () => {
    const zip = await renderCleanZip()
    zip.file("[Content_Types].xml", '<?xml version="1.0"?><NotTypes/>')
    await expect(auditPptxPackage(zip)).rejects.toThrow(/xml-parse-error/)
  })

  it("rejects a slide-list/relationship/part count mismatch", async () => {
    const zip = await renderCleanZip()
    // Remove a slide part directly while its presentation.xml sldIdLst entry
    // and ppt/_rels/presentation.xml.rels relationship both stay untouched —
    // exactly the three-way desync bullet 3 exists to catch.
    zip.remove("ppt/slides/slide2.xml")
    await expect(auditPptxPackage(zip)).rejects.toThrow(/slide-list-mismatch/)
  })

  it("rejects a non-integer shape transform value", async () => {
    const zip = await renderCleanZip()
    const path = "ppt/slides/slide2.xml"
    const before = await readPart(zip, path)
    // Target an actual shape's own <a:ext> (immediately followed by
    // <a:prstGeom>, unlike the always-present root group's <a:ext
    // cx="0" cy="0"/><a:chOff.../> — which this rule deliberately never
    // checks, see checkShapeTransforms's own doc comment) so the corruption
    // lands somewhere the rule is actually scoped to see.
    const after = before.replace(/(<a:ext cx=")(\d+)(" cy="\d+"\/><\/a:xfrm><a:prstGeom)/, "$112.5$3")
    expect(after).not.toBe(before)
    zip.file(path, after)

    await expect(auditPptxPackage(zip)).rejects.toThrow(/invalid-shape-transform/)
  })

  it("rejects a zero-area (both axes zero) non-connector shape", async () => {
    const zip = await renderCleanZip()
    const path = "ppt/slides/slide2.xml"
    const before = await readPart(zip, path)
    const after = before.replace(
      /<a:ext cx="\d+" cy="\d+"\/><\/a:xfrm><a:prstGeom prst="rect"/,
      '<a:ext cx="0" cy="0"/></a:xfrm><a:prstGeom prst="rect"',
    )
    expect(after).not.toBe(before)
    zip.file(path, after)

    await expect(auditPptxPackage(zip)).rejects.toThrow(/invalid-shape-transform/)
  })

  it("aggregates multiple violations into one error, each named", async () => {
    const zip = await renderCleanZip()
    const path = "ppt/slides/slide2.xml"
    let xml = await readPart(zip, path)
    const ids = Array.from(xml.matchAll(/<p:cNvPr id="(\d+)"/g)).map((m) => m[1]!)
    const [firstId, secondId] = ids
    xml = xml.replace(new RegExp(`(<p:cNvPr id=")${secondId}(")`), `$1${firstId}$2`)
    zip.file(path, xml)
    zip.remove("ppt/slides/slide3.xml")

    let caught: Error | undefined
    try {
      await auditPptxPackage(zip)
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeTruthy()
    expect(caught!.message).toMatch(/duplicate-shape-id/)
    expect(caught!.message).toMatch(/slide-list-mismatch/)
  })

  // P0 hardening (robustness deep-review D1): the pre-fix `formatViolations`
  // concatenated every violation verbatim with no cap — a real deck with an
  // extreme-count text-stacking component (500-item bullets, 20000-item
  // bullets) drove `checkShapeTransforms` to emit hundreds to tens of
  // thousands of `invalid-shape-transform` lines, producing a 2.5MB single
  // error string. Reproduced here without an extreme-content deck (the
  // renderer-level cap added alongside this fix would make that path no
  // longer reach this many violations for bullets specifically) by directly
  // injecting many synthetic broken shapes into a clean slide's `<p:spTree>`
  // — this is a property of `formatViolations` itself, independent of which
  // rule or component produced the flood.
  it("caps a message-blowing flood of same-rule violations to a bounded, grouped-by-rule summary", async () => {
    const zip = await renderCleanZip()
    const path = "ppt/slides/slide2.xml"
    const before = await readPart(zip, path)
    const FLOOD_N = 2000
    const brokenShapes = Array.from(
      { length: FLOOD_N },
      (_, i) =>
        `<p:sp><p:nvSpPr><p:cNvPr id="${90000 + i}" name="flood${i}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="12.5"/><a:ext cx="100" cy="100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp>`,
    ).join("")
    const after = before.replace("</p:spTree>", `${brokenShapes}</p:spTree>`)
    expect(after).not.toBe(before)
    zip.file(path, after)

    let caught: Error | undefined
    try {
      await auditPptxPackage(zip)
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeTruthy()
    const message = caught!.message

    // Total count is still reported honestly (not silently lost by capping).
    expect(message).toMatch(new RegExp(`${FLOOD_N} invariant violation`))
    // Grouped-by-rule summary names the rule with its real count.
    expect(message).toMatch(new RegExp(`invalid-shape-transform: ${FLOOD_N}`))
    // The verbatim detail sample never exceeds the fixed line cap, however
    // large the underlying violation count — this is the actual "2.5MB
    // impossible" guarantee: bytes scale with the cap, not with FLOOD_N.
    const detailLineCount = (message.match(/\[invalid-shape-transform]/g) ?? []).length
    expect(detailLineCount).toBeLessThanOrEqual(20)
    expect(message).toMatch(/more violations? omitted/)
    // Message-size upper bound (D1 opportunity #2's hard requirement: a
    // 2.5MB error string must become impossible). 8KB is generous headroom
    // above what 20 detail lines plus a handful of rule-summary lines can
    // possibly need, yet three orders of magnitude below the 2.5MB baseline
    // this flood used to produce pre-fix.
    expect(message.length).toBeLessThan(8_000)
  })
})
