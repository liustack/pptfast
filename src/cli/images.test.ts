// @vitest-environment node
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { persistImageApiKey } from "./image-config"
import { runImagesFetch, runImagesList, runImagesSearch } from "./images"

const originalHome = process.env.PPTFAST_HOME
const originalPexels = process.env.PPTFAST_PEXELS_API_KEY
const originalPixabay = process.env.PPTFAST_PIXABAY_API_KEY

afterEach(() => {
  if (originalHome === undefined) delete process.env.PPTFAST_HOME
  else process.env.PPTFAST_HOME = originalHome
  if (originalPexels === undefined) delete process.env.PPTFAST_PEXELS_API_KEY
  else process.env.PPTFAST_PEXELS_API_KEY = originalPexels
  if (originalPixabay === undefined) delete process.env.PPTFAST_PIXABAY_API_KEY
  else process.env.PPTFAST_PIXABAY_API_KEY = originalPixabay
})

const JPEG_TINY = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

const PEXELS_PHOTO = {
  id: 123,
  width: 4000,
  height: 3000,
  url: "https://www.pexels.com/photo/office-desk-123/",
  photographer: "Jane",
  src: {
    original: "https://images.pexels.com/photos/123/original.jpg",
    large2x: "https://images.pexels.com/photos/123/large2x.jpg",
    medium: "https://images.pexels.com/photos/123/medium.jpg",
    tiny: "https://images.pexels.com/photos/123/tiny.jpg",
  },
}

const PIXABAY_HIT = {
  id: 456,
  pageURL: "https://pixabay.com/photos/office-456/",
  previewURL: "https://cdn.pixabay.com/photo/preview.jpg",
  largeImageURL: "https://cdn.pixabay.com/photo/large.jpg",
  user: "Bob",
  imageWidth: 1280,
  imageHeight: 720,
}

async function tmpHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pptfast-images-"))
  process.env.PPTFAST_HOME = dir
  delete process.env.PPTFAST_PEXELS_API_KEY
  delete process.env.PPTFAST_PIXABAY_API_KEY
  return dir
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function bytesResponse(buf: Buffer): Response {
  return new Response(new Uint8Array(buf), { status: 200 })
}

describe("runImagesSearch", () => {
  it("uses Pexels first and does not call Pixabay on a hit, and prints attribution", async () => {
    await tmpHome()
    await persistImageApiKey("pexels", "TESTPEXELSKEY99")
    const urls: string[] = []
    const out = await runImagesSearch("office desk", {
      fetch: async (input) => {
        const url = String(input)
        urls.push(url)
        if (url.startsWith("https://api.pexels.com/v1/search")) {
          return jsonResponse({ photos: [PEXELS_PHOTO], total_results: 1 })
        }
        throw new Error(`unexpected fetch ${url}`)
      },
    })
    expect(urls.some((u) => u.includes("pixabay.com"))).toBe(false)
    expect(out).toContain("pexels:123")
    expect(out).toContain("https://images.pexels.com/photos/123/medium.jpg")
    expect(out).toContain("Photo by Jane on Pexels")
    expect(out).toContain("https://www.pexels.com/photo/office-desk-123/")
    expect(out).not.toContain("api.pexels.com")
  })

  it("falls through to Pixabay when Pexels returns zero photos", async () => {
    await tmpHome()
    await persistImageApiKey("pexels", "TESTPEXELSKEY99")
    await persistImageApiKey("pixabay", "TESTPIXABAYKEY99")
    const urls: string[] = []
    const out = await runImagesSearch("office", {
      fetch: async (input) => {
        const url = String(input)
        urls.push(url)
        if (url.startsWith("https://api.pexels.com/v1/search")) {
          return jsonResponse({ photos: [], total_results: 0 })
        }
        if (url.startsWith("https://pixabay.com/api/")) {
          return jsonResponse({ hits: [PIXABAY_HIT] })
        }
        throw new Error(`unexpected fetch ${url}`)
      },
    })
    expect(urls.some((u) => u.startsWith("https://api.pexels.com/v1/search"))).toBe(true)
    expect(urls.some((u) => u.startsWith("https://pixabay.com/api/"))).toBe(true)
    expect(out).toContain("pixabay:456")
    expect(out).toContain("https://cdn.pixabay.com/photo/preview.jpg")
    expect(out).toContain("Photo by Bob on Pixabay")
    expect(out).toContain("https://pixabay.com/photos/office-456/")
    expect(out).not.toContain("TESTPIXABAYKEY99")
    expect(out).not.toMatch(/key=/)
  })

  it("hard-fails with apply URLs and config set examples, no <key> placeholder", async () => {
    await tmpHome()
    await expect(runImagesSearch("office")).rejects.toThrow(/https:\/\/www\.pexels\.com\/api\//)
    await expect(runImagesSearch("office")).rejects.toThrow(/https:\/\/pixabay\.com\/api\/docs\//)
    await expect(runImagesSearch("office")).rejects.toThrow(/pptfast config set pexels\.apiKey/)
    await expect(runImagesSearch("office")).rejects.toThrow(/later version/)
    try {
      await runImagesSearch("office")
    } catch (e) {
      const message = (e as Error).message
      expect(message).not.toContain("<key>")
      expect(message).toContain("pptfast config set pixabay.apiKey")
    }
  })

  it("hard-fails asking for Pexels even when only Pixabay is configured", async () => {
    await tmpHome()
    await persistImageApiKey("pixabay", "TESTPIXABAYKEY99")
    await expect(runImagesSearch("office")).rejects.toThrow(/Pexels/)
  })

  it("notes that Pixabay is unconfigured when Pexels is empty", async () => {
    await tmpHome()
    await persistImageApiKey("pexels", "TESTPEXELSKEY99")
    const out = await runImagesSearch("office", {
      fetch: async () => jsonResponse({ photos: [], total_results: 0 }),
    })
    expect(out).toContain("No photos found")
    expect(out).toContain("Pixabay is unconfigured")
    expect(out).toContain("pptfast config set pixabay.apiKey")
  })

  it("redacts a thrown Pixabay URL that contained key=SUPERSECRET99", async () => {
    await tmpHome()
    await persistImageApiKey("pexels", "TESTPEXELSKEY99")
    await persistImageApiKey("pixabay", "SUPERSECRET99")
    await expect(
      runImagesSearch("office", {
        fetch: async (input) => {
          const url = String(input)
          if (url.startsWith("https://api.pexels.com/v1/search")) {
            return jsonResponse({ photos: [], total_results: 0 })
          }
          throw new Error("https://pixabay.com/api/?key=SUPERSECRET99&q=office")
        },
      }),
    ).rejects.toSatisfy((e: unknown) => {
      const message = (e as Error).message
      expect(message).not.toContain("SUPERSECRET99")
      expect(message).not.toMatch(/key=SUPERSECRET99/)
      expect(message).toContain("[redacted]")
      return true
    })
  })
})

describe("runImagesFetch", () => {
  it("writes a jpeg and sidecar, skips the second fetch of the same photo_id, and never stores a key", async () => {
    await tmpHome()
    await persistImageApiKey("pexels", "TESTPEXELSKEY99")
    const cwd = await mkdtemp(join(tmpdir(), "pptfast-fetch-deck-"))
    const deck = join(cwd, "demo-deck")
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      if (url.startsWith("https://api.pexels.com/v1/photos/123")) {
        return jsonResponse(PEXELS_PHOTO)
      }
      if (url.startsWith("https://images.pexels.com/")) {
        return bytesResponse(JPEG_TINY)
      }
      throw new Error(`unexpected fetch ${url}`)
    }
    const resize = async (bytes: Buffer) => bytes
    const first = await runImagesFetch("pexels:123", {
      deck,
      as: "hero",
      cwd,
      query: "office desk",
      fetch: fetchImpl,
      resizeToJpeg: resize,
      now: () => new Date("2026-08-22T00:00:00.000Z"),
    })
    expect(first).toContain("pinned pexels:123 as hero")
    const assets = join(cwd, ".pptfast", "demo-deck", "assets")
    const jpg = await readFile(join(assets, "hero.jpg"))
    expect(jpg.equals(JPEG_TINY)).toBe(true)
    const sidecar = JSON.parse(await readFile(join(assets, "hero.json"), "utf8")) as Record<string, unknown>
    expect(sidecar.provider).toBe("pexels")
    expect(sidecar.photo_id).toBe("123")
    expect(sidecar.author).toBe("Jane")
    expect(sidecar.page_url).toBe("https://www.pexels.com/photo/office-desk-123/")
    expect(sidecar.license).toBe("Pexels License")
    expect(sidecar.downloaded_at).toBe("2026-08-22T00:00:00.000Z")
    expect(sidecar.query).toBe("office desk")
    expect(sidecar).not.toHaveProperty("apiKey")
    expect(sidecar).not.toHaveProperty("key")
    expect(JSON.stringify(sidecar)).not.toContain("TESTPEXELSKEY99")
    expect(JSON.stringify(sidecar)).not.toMatch(/key=/)

    const second = await runImagesFetch("pexels:123", {
      deck,
      as: "hero",
      cwd,
      fetch: async () => {
        throw new Error("network must not run on an idempotent skip")
      },
      resizeToJpeg: resize,
    })
    expect(second).toContain("already pinned pexels:123 as hero")
    expect(second).toContain("skipped")
  })

  it("errors on a Pixabay fetch when Pixabay is unconfigured", async () => {
    await tmpHome()
    await persistImageApiKey("pexels", "TESTPEXELSKEY99")
    await expect(runImagesFetch("pixabay:456", { deck: "demo", as: "hero" })).rejects.toThrow(
      /pixabay\.com\/api\/docs/,
    )
    await expect(runImagesFetch("pixabay:456", { deck: "demo", as: "hero" })).rejects.toThrow(
      /pptfast config set pixabay\.apiKey/,
    )
  })
})

describe("runImagesList", () => {
  it("lists sidecars for a deck", async () => {
    await tmpHome()
    const cwd = await mkdtemp(join(tmpdir(), "pptfast-list-deck-"))
    const assets = join(cwd, ".pptfast", "demo-deck", "assets")
    const { mkdir } = await import("node:fs/promises")
    await mkdir(assets, { recursive: true })
    await writeFile(
      join(assets, "hero.json"),
      JSON.stringify({
        provider: "pexels",
        photo_id: "123",
        license: "Pexels License",
        author: "Jane",
        page_url: "https://www.pexels.com/photo/office-desk-123/",
        downloaded_at: "2026-08-22T00:00:00.000Z",
      }),
    )
    const out = await runImagesList({ deck: join(cwd, "demo-deck"), cwd })
    expect(out).toContain("hero")
    expect(out).toContain("pexels:123")
    expect(out).toContain("Jane")
    expect(out).toContain("https://www.pexels.com/photo/office-desk-123/")
  })
})
