import { afterEach, describe, expect, it, vi } from "vitest"
import type { PptxIR } from "@/ir"
import { inlinePptxAssets } from "./inline-assets"
import { PptfastError } from "../errors"

const RED_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

// Task 2 follow-up (borrow wave — assertValidFetchedImageBytes): these
// fixtures only need to pass magic-byte sniffing, not decode as real images
// — the tests using them stub `Image`/`canvas` decoding separately, so only
// the leading signature bytes matter here.
const FAKE_WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
const FAKE_JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])

function ir(images: Record<string, { src: string }>): PptxIR {
  return {
    version: "4",
    filename: "t.pptx",
    theme: { id: "enterprise" },
    meta: {},
    assets: { images },
    slides: [
      { type: "cover", heading: "标题", components: [] },
      { type: "ending", components: [] },
    ],
  } as PptxIR
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("inlinePptxAssets", () => {
  it("passes data URLs through untouched and skips fetch", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const out = await inlinePptxAssets(ir({ bg: { src: RED_PNG } }))
    expect(out.assets.images.bg.src).toBe(RED_PNG)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("fetches http(s) assets and inlines them as data URLs", async () => {
    const bytes = Uint8Array.from(atob(RED_PNG.split(",")[1]), (c) => c.charCodeAt(0))
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(bytes, { headers: { "content-type": "image/png" } }),
      ),
    )
    const out = await inlinePptxAssets(
      ir({ bg: { src: "https://minio.local/render/cover.png?sig=x" } }),
    )
    expect(out.assets.images.bg.src.startsWith("data:image/png;base64,")).toBe(true)
  })

  it("throws a PptfastError naming the asset when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403 })),
    )
    await expect(
      inlinePptxAssets(ir({ cover_bg: { src: "https://minio.local/x.png" } })),
    ).rejects.toThrow(PptfastError)
    await expect(
      inlinePptxAssets(ir({ cover_bg: { src: "https://minio.local/x.png" } })),
    ).rejects.toThrow(/cover_bg/)
  })

  it("returns the same ir when there are no assets", async () => {
    const input = ir({})
    const out = await inlinePptxAssets(input)
    expect(out).toBe(input)
  })
})

describe("office-safe mime normalization", () => {
  // 上传图走 ref:upload 后，资产可能是 webp（1600w 预览变体）——pptxgenjs
  // 会把 mime 原样写进 pptx，而 PowerPoint 不认 webp。导出前必须重编码 PNG。
  const WEBP_URL = "https://minio.local/source-object-previews/x-1600w.webp"

  function stubDecodeEnv({ decodeOk }: { decodeOk: boolean }) {
    class FakeImage {
      naturalWidth = decodeOk ? 2 : 0
      naturalHeight = 2
      onload: null | (() => void) = null
      onerror: null | ((e?: unknown) => void) = null
      set src(_v: string) {
        queueMicrotask(() => {
          if (decodeOk) this.onload?.()
          else this.onerror?.(new Error("decode failed"))
        })
      }
    }
    vi.stubGlobal("Image", FakeImage)
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toDataURL: () => RED_PNG,
    }
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation(
      (tag: string) =>
        (tag === "canvas" ? fakeCanvas : realCreate(tag)) as HTMLElement,
    )
  }

  it("re-encodes fetched webp assets to png", async () => {
    stubDecodeEnv({ decodeOk: true })
    const bytes = FAKE_WEBP_BYTES
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(bytes, { headers: { "content-type": "image/webp" } }),
      ),
    )
    const out = await inlinePptxAssets(ir({ photo: { src: WEBP_URL } }))
    expect(out.assets.images.photo.src.startsWith("data:image/png")).toBe(true)
  })

  it("re-encodes inline data:image/webp assets to png", async () => {
    stubDecodeEnv({ decodeOk: true })
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const webpDataUrl = `data:image/webp;base64,${btoa("xx")}`
    const out = await inlinePptxAssets(ir({ photo: { src: webpDataUrl } }))
    expect(out.assets.images.photo.src.startsWith("data:image/png")).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("passes fetched jpeg through without re-encoding", async () => {
    const bytes = FAKE_JPEG_BYTES
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(bytes, { headers: { "content-type": "image/jpeg" } }),
      ),
    )
    const out = await inlinePptxAssets(ir({ photo: { src: "https://minio.local/p.jpg" } }))
    expect(out.assets.images.photo.src.startsWith("data:image/jpeg;base64,")).toBe(true)
  })

  it("throws a PptfastError naming the asset when re-encode decoding fails", async () => {
    stubDecodeEnv({ decodeOk: false })
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(FAKE_WEBP_BYTES, {
            headers: { "content-type": "image/webp" },
          }),
      ),
    )
    await expect(
      inlinePptxAssets(ir({ upload_bg: { src: WEBP_URL } })),
    ).rejects.toThrow(/upload_bg/)
  })
})

// Task 2 follow-up (borrow wave — review finding, high): the exact
// garbage-server scenario the review constructed — a 200 response,
// `content-type: image/png`, and a body that is not real image bytes.
// Previously nothing in the chain checked a *fetched* asset's bytes, so
// this sailed through inlinePptxAssets/generatePptx untouched and landed
// verbatim in the exported ppt/media/* part.
describe("assertValidFetchedImageBytes (Task 2 follow-up — fetched-bytes validation)", () => {
  it("rejects a 200 response with a valid content-type header but garbage bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([0x00, 0x01, 0x02, 0x03]), {
            headers: { "content-type": "image/png" },
          }),
      ),
    )
    await expect(
      inlinePptxAssets(ir({ hero: { src: "https://example.com/hero.png" } })),
    ).rejects.toThrow(PptfastError)
    await expect(
      inlinePptxAssets(ir({ hero: { src: "https://example.com/hero.png" } })),
    ).rejects.toThrow(/hero/)
  })

  it("rejects a zero-byte fetched response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([]), { headers: { "content-type": "image/png" } })),
    )
    await expect(
      inlinePptxAssets(ir({ hero: { src: "https://example.com/hero.png" } })),
    ).rejects.toThrow(/zero-byte or undecodable/)
  })

  it("rejects a real PNG fetched with a content-type: image/jpeg header (declared-MIME-vs-bytes mismatch)", async () => {
    const pngBytes = Uint8Array.from(atob(RED_PNG.split(",")[1]!), (c) => c.charCodeAt(0))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(pngBytes, { headers: { "content-type": "image/jpeg" } })),
    )
    await expect(
      inlinePptxAssets(ir({ hero: { src: "https://example.com/hero.jpg" } })),
    ).rejects.toThrow(/declares "image\/jpeg" but its bytes are actually image\/png/)
  })

  it("still accepts a genuinely valid fetched PNG (byte-inertness)", async () => {
    const pngBytes = Uint8Array.from(atob(RED_PNG.split(",")[1]!), (c) => c.charCodeAt(0))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(pngBytes, { headers: { "content-type": "image/png" } })),
    )
    const out = await inlinePptxAssets(ir({ hero: { src: "https://example.com/hero.png" } }))
    expect(out.assets.images.hero?.src.startsWith("data:image/png;base64,")).toBe(true)
  })
})

describe("background compression selection", () => {
  it("collects only asset ids referenced by slide backgrounds", async () => {
    const { backgroundAssetIds } = await import("./inline-assets")
    const input = ir({ a: { src: RED_PNG }, b: { src: RED_PNG } })
    input.slides[0].background = { kind: "asset", asset_id: "a" }
    expect(backgroundAssetIds(input)).toEqual(new Set(["a"]))
  })

  it("keeps small or non-background assets untouched by compression", async () => {
    const { maybeCompressBackground } = await import("./inline-assets")
    // jsdom 无 canvas：压缩路径应优雅跳过并原样返回
    const out = await maybeCompressBackground(RED_PNG)
    expect(out).toBe(RED_PNG)
  })
})
