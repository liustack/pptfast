import { afterEach, describe, expect, it, vi } from "vitest"
import type { PptxIR } from "@/ir"
import { inlinePptxAssets } from "./inline-assets"
import { PptfastError } from "../errors"

const RED_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

function ir(images: Record<string, { src: string }>): PptxIR {
  return {
    version: "3",
    filename: "t.pptx",
    theme: { id: "enterprise" },
    meta: {},
    assets: { images },
    slides: [
      { type: "cover", heading: "标题", blocks: [] },
      { type: "ending", blocks: [] },
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
    const bytes = new Uint8Array([1, 2, 3])
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
    const bytes = new Uint8Array([4, 5, 6])
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
          new Response(new Uint8Array([9]), {
            headers: { "content-type": "image/webp" },
          }),
      ),
    )
    await expect(
      inlinePptxAssets(ir({ upload_bg: { src: WEBP_URL } })),
    ).rejects.toThrow(/upload_bg/)
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
