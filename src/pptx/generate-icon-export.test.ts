// @vitest-environment node
//
// Regression coverage for task 1's blocking review finding: segsToOp
// (src/pptx/svg2pptx/path.ts) computed a <path>'s DrawingML bbox with no
// minimum-size floor, unlike its buildOp sibling (see that file's own
// zero-extent floor tests in ./svg2pptx/path.test.ts for the unit-level
// repro). Lucide's icon-dot/short-stroke idiom ("M12 8h.01", "M12 16v-4")
// produced custGeom shapes with cx=0 or cy=0 on their own — silently
// degenerate pre-audit, and an unconditional invalid-shape-transform export
// failure once the package-audit hard gate went live. callout's default
// icon (all 3 variants) and any icon-bearing kpi_cards/icon_cards item are
// the *default*, ordinary path every caller hits (icon_cards' `icon` field
// is mandatory) — 923/1756 (52.6%) of the shared Lucide catalog triggered
// this pre-fix (see this task's fix report for the full-sweep evidence;
// reproduced independently by this file's own author via the reviewer's own
// batched kpi_cards + generatePptxBlob method).
//
// Runs under the real Node/linkedom platform seam — the runtime
// generatePptx/generatePptxBlob's own hard gate actually executes under in
// production (same rationale as package-audit.test.ts/package-reader.test.ts)
// — and calls the REAL generatePptx (src/api.ts)/generatePptxBlob
// (./generate.ts), never a mock, closing the SVG-level/export-level
// test-coverage split the review named as the structural reason this slipped
// through (every existing callout/icon test renders SVG markup only; no test
// combined "a component that renders an <Icon>" with "a call to
// generatePptxBlob" before this file).
import { beforeAll, describe, expect, it } from "vitest"
import type { Component, PptxIR } from "@/ir"
import { generatePptx } from "@/api"
import { installNodePlatform } from "../platform/node"
import { generatePptxBlob } from "./generate"

beforeAll(() => {
  installNodePlatform()
})

function makeIr(components: Component[]): PptxIR {
  return {
    version: "4",
    filename: "icon-export-fixture",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides: [
      { type: "cover", heading: "Cover" },
      { type: "content", heading: "Body", components },
      { type: "ending", heading: "Thanks" },
    ],
  } as PptxIR
}

describe("callout default icon through the real generatePptx (task 1 blocking finding)", () => {
  const variants = ["info", "warn", "tip"] as const

  for (const variant of variants) {
    it(`variant "${variant}" (no icon override — VARIANT_ICON default) exports without an invalid-shape-transform`, async () => {
      const ir = makeIr([
        { type: "callout", variant, text: "Default-icon callout export smoke test." },
      ])
      const bytes = await generatePptx(ir)
      // A real export (zip magic "PK"), not a thrown PptfastError — the
      // reviewer's exact repro threw `invalid-shape-transform: ... a:ext
      // cx=0 cy=...` for every one of these 3 variants pre-fix.
      expect(bytes.length).toBeGreaterThan(10_000)
      expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
    })
  }

  it("an icon-bearing kpi_cards item exports too (confirms this isn't callout-specific)", async () => {
    const ir = makeIr([
      { type: "kpi_cards", items: [{ value: "42", label: "Uptime", icon: "info" }] },
    ])
    await expect(generatePptx(ir)).resolves.toBeInstanceOf(Uint8Array)
  })

  it("icon_cards, whose icon field is mandatory by schema, exports too", async () => {
    const ir = makeIr([
      {
        type: "icon_cards",
        items: [
          { icon: "info", title: "Reliable", text: "99.95% uptime" },
          { icon: "globe", title: "Global", text: "40 regions" },
        ],
      },
    ])
    await expect(generatePptx(ir)).resolves.toBeInstanceOf(Uint8Array)
  })
})

/**
 * Deterministic ≥40-icon sample for a fast, always-on regression — the full
 * 1756-icon catalog is swept out-of-band once per this task's fix report,
 * not on every test run (too slow for the unit tier). Derived from a real
 * pre-fix run of the reviewer's own sweep method (one kpi_cards item per
 * icon, batched through the real generatePptxBlob — see
 * scratchpad/av/sweep-all-icons.mts in the review's own workspace) at HEAD
 * aa5d295, which reproduced the reviewer's 923/1756 (52.6%) count exactly:
 *
 * - AFFECTED_SAMPLE: the 11 common business-deck icon names the review
 *   explicitly named as failing (info/triangle-alert/lightbulb/calendar/
 *   globe/anchor/building/handshake/thumbs-up/package/truck), plus the next
 *   19 names (catalog order, i.e. Object.keys(PPTX_ICONS) order) that threw
 *   invalid-shape-transform pre-fix — 30 total, all independently confirmed
 *   members of the 923-icon affected class.
 * - UNAFFECTED_SAMPLE: the first 15 catalog-order names that did NOT throw
 *   pre-fix (multi-primitive icons whose bbox was never degenerate) — a
 *   contrast group proving the fix doesn't change already-correct geometry.
 */
const AFFECTED_SAMPLE = [
  "info", "triangle-alert", "lightbulb", "calendar", "globe", "anchor", "building",
  "handshake", "thumbs-up", "package", "truck",
  "a-arrow-down", "a-arrow-up", "a-large-small", "ad", "air-vent",
  "alarm-clock-minus", "alarm-clock-plus", "align-center-horizontal", "align-center-vertical",
  "align-end-horizontal", "align-end-vertical", "align-horizontal-distribute-center",
  "align-horizontal-distribute-end", "align-horizontal-distribute-start",
  "align-horizontal-justify-center", "align-horizontal-justify-end",
  "align-horizontal-justify-start", "align-horizontal-space-around",
  "align-horizontal-space-between",
] as const

const UNAFFECTED_SAMPLE = [
  "accessibility", "activity", "airplay", "alarm-clock", "alarm-clock-check",
  "alarm-clock-off", "alarm-smoke", "album", "ampersands", "apple", "archive-x",
  "arrow-big-down", "arrow-big-left", "arrow-big-right", "arrow-big-up",
] as const

describe("icon catalog sample survives the real export pipeline (task 1 blocking finding)", () => {
  it(`a deterministic ${AFFECTED_SAMPLE.length + UNAFFECTED_SAMPLE.length}-icon sample (${AFFECTED_SAMPLE.length} from the reviewer's 923-icon affected class + ${UNAFFECTED_SAMPLE.length} unaffected for contrast), spread across real kpi_cards slides, renders through generatePptxBlob without an invalid-shape-transform`, async () => {
    const sample = [...AFFECTED_SAMPLE, ...UNAFFECTED_SAMPLE]
    const PER_SLIDE = 5
    const slides: PptxIR["slides"] = [
      { type: "cover", heading: "Icon catalog sample", components: [] },
    ]
    for (let i = 0; i < sample.length; i += PER_SLIDE) {
      const names = sample.slice(i, i + PER_SLIDE)
      slides.push({
        type: "content",
        heading: `Slide ${i / PER_SLIDE}`,
        components: [
          {
            type: "kpi_cards",
            items: names.map((name) => ({ value: "1", label: name, icon: name })),
          },
        ],
      } as PptxIR["slides"][number])
    }
    slides.push({ type: "ending", heading: "Thanks", components: [] })
    const ir: PptxIR = {
      version: "4",
      filename: "icon-catalog-sample",
      theme: { id: "consulting" },
      meta: {},
      assets: { images: {} },
      slides,
    } as PptxIR

    const blob = await generatePptxBlob(ir)
    expect(blob.size).toBeGreaterThan(1000)
  })

  it.each(AFFECTED_SAMPLE)(
    "affected-class icon %s individually renders through generatePptxBlob without throwing",
    async (name) => {
      const ir = makeIr([{ type: "kpi_cards", items: [{ value: "1", label: name, icon: name }] }])
      await expect(generatePptxBlob(ir)).resolves.toBeInstanceOf(Blob)
    },
  )
})

/**
 * A second, independent instance of the same root-cause pattern, found by
 * this fix's own full 1756-icon sweep (not by the review): "circle-divide"
 * and "square-divide" draw the "÷" numerator/denominator dots as zero-length
 * `<line x1=x2 y1=y2>` elements, not `<path>` — so they never went through
 * segsToOp at all, and survived the segsToOp-only fix (923 -> 2 on the full
 * sweep, not 0) until lineToOp (./line.ts) got the analogous floor. See that
 * file's own "zero-length point line" tests for the unit-level repro/fix.
 */
describe("circle-divide/square-divide (zero-length <line> dots, not segsToOp) through the real export pipeline", () => {
  it.each(["circle-divide", "square-divide"] as const)(
    "icon %s exports through generatePptxBlob without throwing",
    async (name) => {
      const ir = makeIr([{ type: "kpi_cards", items: [{ value: "1", label: name, icon: name }] }])
      await expect(generatePptxBlob(ir)).resolves.toBeInstanceOf(Blob)
    },
  )
})
