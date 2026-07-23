import { describe, expect, it, vi, beforeEach } from "vitest"
import type { PptxIR } from "@/ir"
import { PptxSealViolationError } from "./pptx-fixed-timestamps"

/**
 * carried-items wave, fix round — review finding F1: generate.ts's own
 * `try { await dedupeMediaInZip(zip) } catch { ... }` has been deliberately
 * forgiving since 85ebc1e for a *genuine* dedupe failure (bad media bytes,
 * malformed `.rels` XML — "a media-dedupe failure is not a reason to
 * abandon export," the package audit right after still catches any real
 * corruption under its own name). The runtime seal this wave's item 2 added
 * introduced a second, categorically different failure the same call can
 * now throw: a `PptxSealViolationError`, meaning `dedupeMediaInZip` itself
 * ran out of order (reordered to run after `normalizePptxTimestamps`
 * sealed the zip). The reviewer's injection proved that error was being
 * silently absorbed by the pre-existing catch — the fix distinguishes by
 * `instanceof` and rethrows only the seal violation.
 *
 * `dedupeMediaInZip` is mocked here (not the real function) so this file
 * can control exactly which of the two failure classes fires, independent
 * of what real duplicate media would actually trigger — the real-media,
 * no-mock end-to-end proof lives in generate-dedupe-media-export.test.ts.
 * pptxgenjs itself is *not* mocked — the same real-pipeline pattern
 * generate-determinism.test.ts already uses successfully under the default
 * jsdom environment (no `installNodePlatform()` needed for a no-image
 * fixture) — so this pins the real generate.ts call site, not a
 * reimplementation of its logic.
 */

const dedupeMediaInZipMock = vi.fn()
vi.mock("./pptx-dedupe-media", () => ({
  dedupeMediaInZip: (...args: unknown[]) => dedupeMediaInZipMock(...args),
}))

function tinyIr(): PptxIR {
  return {
    version: "4",
    filename: "seal-catch-fixture.pptx",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides: [
      { type: "cover", heading: "Cover", components: [] },
      { type: "ending", heading: "Thanks", components: [] },
    ],
  }
}

beforeEach(() => {
  dedupeMediaInZipMock.mockReset()
})

describe("generate.ts's dedupeMediaInZip catch: two-tier distinction (carried-items wave, fix round)", () => {
  it("a genuine dedupe failure (plain Error) is still swallowed — export succeeds (85ebc1e's original contract, unaffected by the seal)", async () => {
    dedupeMediaInZipMock.mockRejectedValue(new Error("simulated genuine dedupe failure — bad media bytes"))
    const { generatePptxBlob } = await import("./generate")

    const blob = await generatePptxBlob(tinyIr())
    const bytes = new Uint8Array(await blob.arrayBuffer())
    // A real zip (magic "PK") — export completed despite the swallowed error.
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    expect(dedupeMediaInZipMock).toHaveBeenCalledTimes(1)
  })

  it("a PptxSealViolationError propagates — export fails loudly, not silently absorbed (review finding F1)", async () => {
    dedupeMediaInZipMock.mockRejectedValue(new PptxSealViolationError("simulated ordering-seal violation"))
    const { generatePptxBlob } = await import("./generate")

    let caught: Error | undefined
    try {
      await generatePptxBlob(tinyIr())
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeInstanceOf(PptxSealViolationError)
    expect(caught?.message).toContain("simulated ordering-seal violation")
  })

  it("any other PptfastError (not the seal subclass) is still swallowed — only the specific seal subclass propagates", async () => {
    const { PptfastError } = await import("../errors")
    dedupeMediaInZipMock.mockRejectedValue(new PptfastError("some unrelated PptfastError, not a seal violation"))
    const { generatePptxBlob } = await import("./generate")

    const blob = await generatePptxBlob(tinyIr())
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
  })
})
