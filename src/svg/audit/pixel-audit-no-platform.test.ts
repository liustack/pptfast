// @vitest-environment node
//
// auditDeck(ir, { pixels: true })'s "no rasterization capability at all"
// contract — deliberately its own file, never calling installNodePlatform()
// anywhere: src/platform/registry.ts's `current` is module-level state
// shared by every describe/it block *within* one test file (vitest gives
// each test file its own fresh module graph, but not each describe block
// inside it), so a file that calls installNodePlatform() anywhere can never
// legitimately prove "nothing was installed" elsewhere in that same file —
// confirmed the hard way while first drafting this suite (see this task's
// own report). @vitest-environment node also means no Image/document/
// OffscreenCanvas either, so this reproduces the real "nothing on this
// platform can rasterize" condition, not a simulated stand-in for it.
import { DOMParser as LinkedomDOMParser } from "linkedom"
import { beforeAll, describe, expect, it } from "vitest"
import type { PptxIR, Slide } from "@/ir"
import { installPlatform } from "../../platform/registry"
import { makeSolidRegionPngDataUri } from "../../platform/test-png-fixture"
import { auditDeck } from "./deck-audit"

// The deterministic (non-pixel) audit pass also needs a DOM parser (its own
// pre-existing, unrelated requirement — svg-audit.ts's auditSvgMarkup) —
// installed directly here (not via installNodePlatform(), which would also
// wire rasterizeSvg and defeat the whole point of this file) so this suite
// isolates exactly "domParser present, rasterizeSvg absent".
beforeAll(() => {
  installPlatform({ domParser: LinkedomDOMParser as unknown as typeof DOMParser })
})

function deck(themeId: string, slides: Slide[], overrides: Partial<PptxIR> = {}): PptxIR {
  return {
    version: "4",
    filename: "pixel-audit-no-platform-fixture",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
    ...overrides,
  }
}

describe("auditDeck({ pixels: true }) — no platform rasterization capability", () => {
  it("rejects explicitly (never a silent clean report) when a page actually needs rasterization", async () => {
    const photo = makeSolidRegionPngDataUri(20, 20, () => [0xf5, 0xf5, 0xf0])
    const ir = deck("consulting", [{ type: "cover", heading: "No Platform", background: { kind: "asset", asset_id: "photo" }, components: [] }], {
      assets: { images: { photo: { src: photo } } },
    })
    await expect(auditDeck(ir, { pixels: true })).rejects.toThrow(/rasterizeSvg unavailable/)
  })

  it("does not throw when no page needs rasterization, even with no platform capability at all", async () => {
    const ir = deck("consulting", [{ type: "cover", heading: "Plain Cover, No Platform", components: [] }])
    await expect(auditDeck(ir, { pixels: true })).resolves.toMatchObject({
      checks: { svg: "completed", pixels: "completed" },
    })
  })
})
