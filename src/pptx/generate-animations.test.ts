import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import type { Meta, PptxIR, Slide } from "@/ir"

/**
 * End-to-end check (wave-C S1/S2): the full `generatePptxBlob` pipeline —
 * real pptxgenjs, no mocks — carries `meta.animation.transition` all the
 * way through `pptx.write()` → `applyGradientFills` → `applySlideTransitions`
 * to a genuine `<p:transition>` in every slide part of the exported .pptx.
 * `pptx/pptx-animations.test.ts` covers the XML-generation and
 * JSZip-patch logic in isolation; this is the "it also works wired into the
 * real deck pipeline" integration counterpart, mirroring
 * `pptx-generate-gradient-export.test.ts`'s role for the gradient patch.
 */

function slide(type: Slide["type"]): Slide {
  return {
    type,
    heading: "动画开关验证",
    blocks: type === "content" || type === "ending" ? [{ type: "paragraph", text: "正文" }] : [],
  }
}

function makeIR(slides: Slide[], animation?: Meta["animation"]): PptxIR {
  return {
    version: "2",
    filename: "animations.pptx",
    theme: { id: "consulting" },
    meta: animation ? { animation } : {},
    assets: { images: {} },
    slides,
  }
}

async function slideXmls(blob: Blob): Promise<string[]> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p) && !zip.files[p].dir)
    .sort()
  expect(slidePaths.length).toBeGreaterThan(0)
  return Promise.all(slidePaths.map((p) => zip.files[p].async("string")))
}

describe("generatePptxBlob deck-level transition switch", () => {
  it("defaults to a fade transition on every slide when meta.animation is omitted", async () => {
    const { generatePptxBlob } = await import("./generate")
    const blob = await generatePptxBlob(makeIR([slide("cover"), slide("content"), slide("ending")]))
    for (const xml of await slideXmls(blob)) {
      expect(xml).toContain("<p:fade/>")
      expect(xml).toContain('p14:dur="400"')
    }
  }, 30000)

  it("honors an explicit push/wipe transition across every slide", async () => {
    const { generatePptxBlob } = await import("./generate")
    const blob = await generatePptxBlob(
      makeIR([slide("cover"), slide("content")], { transition: "wipe" })
    )
    for (const xml of await slideXmls(blob)) {
      expect(xml).toContain('<p:wipe dir="r"/>')
    }
  }, 30000)

  it('injects no <p:transition> at all when meta.animation.transition is "none"', async () => {
    const { generatePptxBlob } = await import("./generate")
    const blob = await generatePptxBlob(
      makeIR([slide("cover"), slide("content")], { transition: "none" })
    )
    for (const xml of await slideXmls(blob)) {
      expect(xml).not.toContain("<p:transition")
    }
  }, 30000)
})

/**
 * End-to-end check (wave-C S3): a content slide with several block types
 * and `meta.animation.elements === "auto"` gets, through the *real*
 * `generatePptxBlob` pipeline (real pptxgenjs, no mocks), a genuine
 * `<p:timing>` tree built from `blk{slideIndex}-{blockIndex}` objectName
 * markers `renderOps` actually wrote into the shapes. Ordering must survive
 * numeric slide-part sorting, not the lexicographic default some earlier
 * test helpers use (`slide1.xml` vs `slide10.xml`).
 */
function multiBlockContentSlide(): Slide {
  return {
    type: "content",
    variant: "single",
    heading: "多块动画验证",
    blocks: [
      { type: "paragraph", text: "开场段落" }, // block 0 → fade
      {
        type: "chart",
        chart_type: "bar",
        series: [{ name: "S1", data: [{ x: "A", y: 1 }] }],
      }, // block 1 → wipe
      {
        type: "verdict_banner",
        tone: "positive",
        text: "结论压轴",
      }, // block 2 → fade, staged last regardless of index
    ],
  }
}

describe("generatePptxBlob per-block entrance animations (wave-C S3)", () => {
  it('meta.animation.elements omitted: no blk-marker objectNames and no <p:timing> anywhere (default stays untouched)', async () => {
    const { generatePptxBlob } = await import("./generate")
    const blob = await generatePptxBlob(makeIR([multiBlockContentSlide()]))
    for (const xml of await slideXmls(blob)) {
      expect(xml).not.toContain("<p:timing>")
      expect(xml).not.toContain("-blk")
    }
  }, 30000)

  it('meta.animation.elements: "none" explicitly: same as omitted — no injection', async () => {
    const { generatePptxBlob } = await import("./generate")
    const blob = await generatePptxBlob(
      makeIR([multiBlockContentSlide()], { elements: "none" })
    )
    for (const xml of await slideXmls(blob)) {
      expect(xml).not.toContain("<p:timing>")
      expect(xml).not.toContain("-blk")
    }
  }, 30000)

  it('meta.animation.elements: "auto": injects a <p:timing> tree with the right semantic effects, verdict last', async () => {
    const { generatePptxBlob } = await import("./generate")
    const blob = await generatePptxBlob(
      makeIR([slide("cover"), multiBlockContentSlide()], { elements: "auto" })
    )
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const paths = Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p) && !zip.files[p].dir)
      .sort((a, b) => Number(/slide(\d+)/.exec(a)![1]) - Number(/slide(\d+)/.exec(b)![1]))
    const xmls = await Promise.all(paths.map((p) => zip.files[p].async("string")))

    // Cover slide has no blocks → untouched.
    expect(xmls[0]).not.toContain("<p:timing>")

    // Content slide: real <p:timing> tree, all three semantic effects present.
    const content = xmls[1]
    expect(content).toContain("<p:timing>")
    expect(content).toContain('filter="fade"') // paragraph + verdict_banner
    expect(content).toContain('filter="wipe(down)"') // chart
    expect(content.match(/<p:timing>/g)).toHaveLength(1) // never double-injected

    // Every shape got a blk-marker objectName (blockIndex 0..2 all present
    // somewhere in this slide's content).
    expect(content).toMatch(/name="svg2pptx-[a-z0-9]+-blk0001-0000"/)
    expect(content).toMatch(/name="svg2pptx-[a-z0-9]+-blk0001-0001"/)
    expect(content).toMatch(/name="svg2pptx-[a-z0-9]+-blk0001-0002"/)

    // Three blocks staged 200ms apart (0/200/400) — chart may itself have
    // multiple shapes (axis/bars/labels), each its own delay=0 effect par
    // inside the block wrapper, so this dedupes to the *distinct* stage
    // delays rather than asserting an exact flat count of `fill="hold"` cTns.
    const timing = content.slice(content.indexOf("<p:timing>"))
    const delays = Array.from(
      timing.matchAll(/<p:cTn id="\d+" fill="hold"><p:stCondLst><p:cond delay="(\d+)"/g),
    ).map((m) => Number(m[1]))
    expect(Array.from(new Set(delays)).sort((a, b) => a - b)).toEqual([0, 200, 400])
  }, 30000)

  it("degrades gracefully (soffice-safe) when static XML has no real shapes to tag", async () => {
    const { generatePptxBlob } = await import("./generate")
    const blob = await generatePptxBlob(
      makeIR([slide("cover")], { elements: "auto" }) // cover has zero blocks
    )
    for (const xml of await slideXmls(blob)) {
      expect(xml).not.toContain("<p:timing>")
    }
  }, 30000)
})

/**
 * Critical fix regression (T2 review finding): a content-type slide dense
 * enough (chart + steps combo) pushes pptxgenjs's own STEP1-3 per-shape id
 * counter (`idx + 2`) past 24, into the id space of pptxgenjs's *hardcoded*
 * STEP4 slide-number placeholder (`<p:cNvPr id="25"
 * name="Slide Number Placeholder 0"/>`, `node_modules/pptxgenjs/dist/pptxgen.cjs.js`).
 * `master-builder.ts` only turns on `slideNumber` for `content`-type masters
 * — the only slide type this module ever tags with `blk` markers — so this
 * is a routine, not a contrived, collision: real generator output for a
 * content-heavy chart+steps slide crossed it before the fix (calibrated via
 * a real `generatePptxBlob` run, see the `wc-task-2-report.md` fix note).
 *
 * `pptx/pptx-animations.test.ts`'s own
 * "pptxgenjs placeholder id collision" suite covers the JSZip-patch logic
 * directly with a synthetic fixture; this is the real, no-mock
 * `generatePptxBlob` pipeline counterpart — the shape ids here come from
 * pptxgenjs's actual id counter, not a hand-built fixture, so it also
 * guards against the counter's own numbering changing in a future
 * pptxgenjs upgrade.
 */
function overflowShapeContentSlide(): Slide {
  return {
    type: "content",
    variant: "single",
    heading: "多形状 id 碰撞回归",
    blocks: [
      { type: "paragraph", text: "开场段落，占一个 fade 块。" }, // block 0 → fade
      {
        type: "chart",
        chart_type: "bar",
        series: [
          {
            name: "S1",
            data: Array.from({ length: 6 }, (_, i) => ({ x: `C${i}`, y: i + 1 })),
          },
        ],
      }, // block 1 → wipe, ~20 shapes (bars/gridlines/labels/gradients)
      {
        type: "steps",
        items: [
          { title: "第一步", text: "简短" },
          { title: "第二步", text: "简短" },
          { title: "第三步", text: "简短" },
        ],
      }, // block 2 → fly, ~15 shapes (cards/badges/labels/arrows)
    ],
  }
}

describe("generatePptxBlob per-block entrance animations — shape-id collision regression", () => {
  it("crosses pptxgenjs's hardcoded slide-number placeholder id with zero duplicate shape ids and unambiguous spid references", async () => {
    const { generatePptxBlob } = await import("./generate")
    const blob = await generatePptxBlob(
      makeIR([overflowShapeContentSlide()], { elements: "auto" })
    )
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const [path] = Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p) && !zip.files[p].dir)
      .sort()
    const xml = await zip.files[path].async("string")

    const shapes = Array.from(xml.matchAll(/<p:cNvPr id="(\d+)" name="([^"]*)"/g)).map((m) => ({
      id: Number(m[1]),
      name: m[2],
    }))
    // Regression guard on the fixture itself: it must actually cross
    // pptxgenjs's STEP1-3 counter into the STEP4 placeholder's id space (25)
    // — otherwise this test would pass even without the fix and prove nothing.
    expect(shapes.length).toBeGreaterThan(24)
    expect(Math.max(...shapes.map((s) => s.id))).toBeGreaterThanOrEqual(25)

    // The Critical finding itself: zero duplicate <p:cNvPr id> anywhere on
    // the slide (OOXML shape-id uniqueness).
    expect(new Set(shapes.map((s) => s.id)).size).toBe(shapes.length)

    // Every spid the injected <p:timing> tree targets resolves to exactly
    // one shape, and it's always a real, block-tagged one — never
    // pptxgenjs's slide-number placeholder (which carries no blk marker).
    const nameById = new Map(shapes.map((s) => [s.id, s.name]))
    const referencedSpids = Array.from(xml.matchAll(/<p:spTgt spid="(\d+)"/g)).map((m) =>
      Number(m[1]),
    )
    expect(referencedSpids.length).toBeGreaterThan(0)
    for (const spid of referencedSpids) {
      expect(nameById.get(spid)).toMatch(/-blk\d{4}-\d{4}$/)
    }
  }, 30000)
})
