import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import type { PptxIR, Slide } from "@/ir"

/**
 * Speaker-notes export chain (notes+preview wave, task 1): `slide.notes` in
 * the IR must reach the exported .pptx as a native PowerPoint speaker note —
 * `s.addNotes(slide.notes)` in `./generate.ts`, verified here against the
 * real pptxgenjs + JSZip output (no mock, same posture as
 * `generate-gradient-export.test.ts`'s "it also works with a real theme"
 * integration tests) rather than a fake recording `addNotes` was called.
 *
 * The byte-identity half of this task's invariant (an omitted-`notes` deck
 * exports unchanged) is covered here as a determinism/no-new-structure
 * regression guard — the actual before/after-this-change proof is a
 * one-time manual base-branch-vs-this-branch diff of `examples/basic.json`'s
 * export (see the task report), not something a single-commit test suite can
 * assert on its own.
 */

function makeIR(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "notes-export.pptx",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides,
  }
}

async function zipEntry(blob: Blob, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const file = zip.file(path)
  expect(file).not.toBeNull()
  return file!.async("string")
}

/** Every zip part's content, keyed by path — `docProps/core.xml` excluded
 *  (pptxgenjs bakes `new Date().toISOString()` into it on every call, see
 *  `node_modules/pptxgenjs/dist/pptxgen.cjs.js`'s `makeXmlCore` — the one
 *  genuinely nondeterministic part of an otherwise pure export, unrelated to
 *  notes). Used to compare two exports for everything *except* that one
 *  known clock-dependent part. */
async function normalizedZipMap(blob: Blob): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const entries = Object.keys(zip.files)
    .filter((p) => !zip.files[p]!.dir && p !== "docProps/core.xml")
    .sort()
  const out: Record<string, string> = {}
  for (const p of entries) out[p] = await zip.files[p]!.async("string")
  return out
}

describe("generatePptxBlob speaker notes export", () => {
  it("a slide's notes field exports as native PowerPoint speaker notes text", async () => {
    const { generatePptxBlob } = await import("./generate")
    const ir = makeIR([
      { type: "content", heading: "Body", components: [], notes: "mention the FX headwind before Q&A" },
    ])
    const blob = await generatePptxBlob(ir)
    const notesXml = await zipEntry(blob, "ppt/notesSlides/notesSlide1.xml")
    expect(notesXml).toContain("mention the FX headwind before Q&amp;A")
  })

  it("only the slide that sets notes gets non-empty notesSlide text — index alignment across a multi-slide deck", async () => {
    const { generatePptxBlob } = await import("./generate")
    const ir = makeIR([
      { type: "cover", heading: "Cover", components: [] },
      { type: "content", heading: "Body", components: [], notes: "second-slide note" },
      { type: "ending", heading: "Thanks", components: [] },
    ])
    const blob = await generatePptxBlob(ir)

    const notes1 = await zipEntry(blob, "ppt/notesSlides/notesSlide1.xml")
    const notes2 = await zipEntry(blob, "ppt/notesSlides/notesSlide2.xml")
    const notes3 = await zipEntry(blob, "ppt/notesSlides/notesSlide3.xml")
    expect(notes2).toContain("second-slide note")
    expect(notes1).not.toContain("second-slide note")
    expect(notes3).not.toContain("second-slide note")
  })

  it("a deck that never sets notes still carries a notesSlide part per slide (pptxgenjs's own unconditional behavior), but with empty placeholder text — not new zip structure introduced by this feature", async () => {
    const { generatePptxBlob } = await import("./generate")
    const ir = makeIR([{ type: "cover", heading: "Cover", components: [] }, { type: "content", heading: "Body", components: [] }])
    const blob = await generatePptxBlob(ir)

    const notes1 = await zipEntry(blob, "ppt/notesSlides/notesSlide1.xml")
    const notes2 = await zipEntry(blob, "ppt/notesSlides/notesSlide2.xml")
    // Placeholder body text is empty — the notes text run's own <a:t></a:t> has no content.
    expect(notes1).toMatch(/<a:t>\s*<\/a:t>/)
    expect(notes2).toMatch(/<a:t>\s*<\/a:t>/)
  })

  it("omitted-notes export is deterministic across repeated calls (every zip part except docProps/core.xml's clock-dependent timestamp is identical) — the invariant an omitted-notes deck's export never changes because of this feature", async () => {
    const { generatePptxBlob } = await import("./generate")
    const ir = makeIR([
      { type: "cover", heading: "pptfast", subheading: "Stable, editable PPTX from a semantic IR", components: [] },
      { type: "chapter", heading: "Why an IR", components: [] },
      {
        type: "content",
        heading: "Design goals",
        components: [
          {
            type: "bullets",
            items: [
              "Raise the floor of AI-generated decks",
              "Native DrawingML output — every shape stays editable",
              "Design tokens plus an archetype library, not freeform drawing",
            ],
          },
        ],
      },
      { type: "ending", heading: "Thanks", layout: "banner-ending", components: [] },
    ])

    const blobA = await generatePptxBlob(ir)
    const blobB = await generatePptxBlob(ir)
    const mapA = await normalizedZipMap(blobA)
    const mapB = await normalizedZipMap(blobB)
    expect(mapA).toEqual(mapB)
  })
})
