// @vitest-environment node
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { persistImageApiKey, persistUserConfigValue } from "./image-config"
import { resetOpenverseTokenCache } from "./image-openverse"
import { runImagesFetch, runImagesList, runImagesSearch } from "./images"

const originalHome = process.env.PPTFAST_HOME
const originalPexels = process.env.PPTFAST_PEXELS_API_KEY
const originalPixabay = process.env.PPTFAST_PIXABAY_API_KEY
const originalOvId = process.env.PPTFAST_OPENVERSE_CLIENT_ID
const originalOvSecret = process.env.PPTFAST_OPENVERSE_CLIENT_SECRET

afterEach(() => {
  if (originalHome === undefined) delete process.env.PPTFAST_HOME
  else process.env.PPTFAST_HOME = originalHome
  if (originalPexels === undefined) delete process.env.PPTFAST_PEXELS_API_KEY
  else process.env.PPTFAST_PEXELS_API_KEY = originalPexels
  if (originalPixabay === undefined) delete process.env.PPTFAST_PIXABAY_API_KEY
  else process.env.PPTFAST_PIXABAY_API_KEY = originalPixabay
  if (originalOvId === undefined) delete process.env.PPTFAST_OPENVERSE_CLIENT_ID
  else process.env.PPTFAST_OPENVERSE_CLIENT_ID = originalOvId
  if (originalOvSecret === undefined) delete process.env.PPTFAST_OPENVERSE_CLIENT_SECRET
  else process.env.PPTFAST_OPENVERSE_CLIENT_SECRET = originalOvSecret
  resetOpenverseTokenCache()
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

const OPENVERSE_CC0_ID = "aaaa1111-bbbb-4ccc-8ddd-eeeeffff0001"
const OPENVERSE_BYSA_ID = "bbbb2222-cccc-4ddd-8eee-ffff00001111"
const OPENVERSE_CC0 = {
  id: OPENVERSE_CC0_ID,
  url: "https://live.staticflickr.com/123/office.jpg",
  foreign_landing_url: "https://stocksnap.io/photo/office-desk",
  creator: "Bench Accounting",
  license: "cc0",
  attribution:
    '"Office Desk" by Bench Accounting is marked with CC0 1.0. To view the terms, visit https://creativecommons.org/publicdomain/zero/1.0/.',
  provider: "flickr",
  source: "stocksnap",
  width: 2000,
  height: 1333,
  thumbnail: "https://live.staticflickr.com/123/office-thumb.jpg",
}
const OPENVERSE_BYSA = {
  ...OPENVERSE_CC0,
  id: OPENVERSE_BYSA_ID,
  license: "by-sa",
  foreign_landing_url: "https://example.com/by-sa",
  url: "https://live.staticflickr.com/123/bysa.jpg",
}

async function tmpHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pptfast-images-"))
  process.env.PPTFAST_HOME = dir
  delete process.env.PPTFAST_PEXELS_API_KEY
  delete process.env.PPTFAST_PIXABAY_API_KEY
  delete process.env.PPTFAST_OPENVERSE_CLIENT_ID
  delete process.env.PPTFAST_OPENVERSE_CLIENT_SECRET
  return dir
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function bytesResponse(buf: Buffer): Response {
  return new Response(new Uint8Array(buf), { status: 200 })
}

describe("runImagesSearch", () => {
  it("uses Pexels first and does not call Pixabay or Openverse on a hit, and prints attribution", async () => {
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
    expect(urls.some((u) => u.includes("openverse.org"))).toBe(false)
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
    expect(urls.some((u) => u.includes("openverse.org"))).toBe(false)
  })

  it("falls through to Openverse when Pexels and Pixabay are empty, drops by-sa, keeps cc0", async () => {
    await tmpHome()
    await persistImageApiKey("pexels", "TESTPEXELSKEY99")
    await persistImageApiKey("pixabay", "TESTPIXABAYKEY99")
    const urls: string[] = []
    const out = await runImagesSearch("office desk", {
      fetch: async (input) => {
        const url = String(input)
        urls.push(url)
        if (url.startsWith("https://api.pexels.com/v1/search")) {
          return jsonResponse({ photos: [], total_results: 0 })
        }
        if (url.startsWith("https://pixabay.com/api/")) {
          return jsonResponse({ hits: [] })
        }
        if (url.startsWith("https://api.openverse.org/v1/images/")) {
          expect(url).toContain("license_type=commercial")
          expect(url).toMatch(/license=cc0(%2C|,)pdm/)
          return jsonResponse({ results: [OPENVERSE_BYSA, OPENVERSE_CC0] })
        }
        throw new Error(`unexpected fetch ${url}`)
      },
    })
    expect(out).toContain(`openverse:${OPENVERSE_CC0_ID}`)
    expect(out).not.toContain(OPENVERSE_BYSA_ID)
    expect(out).toContain("stocksnap")
    expect(out).toContain("Bench Accounting")
    expect(out).toContain("cc0")
    expect(out).toContain(OPENVERSE_CC0.attribution)
    expect(out).toContain("https://stocksnap.io/photo/office-desk")
    expect(out).toContain("Openverse does not verify individual licenses")
    expect(out).not.toMatch(/https:\/\/api\.openverse\.org\/v1\/images\/[^\s]+/)
    expect(out.split("https://stocksnap.io/photo/office-desk").length).toBeGreaterThan(1)
  })

  it("calls anonymous Openverse when no keys are configured, with a low-quota note and no missingKeysError", async () => {
    await tmpHome()
    const urls: string[] = []
    const out = await runImagesSearch("office", {
      fetch: async (input) => {
        const url = String(input)
        urls.push(url)
        if (url.startsWith("https://api.openverse.org/v1/images/")) {
          return jsonResponse({ results: [OPENVERSE_CC0] })
        }
        throw new Error(`unexpected fetch ${url}`)
      },
    })
    expect(urls.some((u) => u.startsWith("https://api.pexels.com"))).toBe(false)
    expect(urls.some((u) => u.startsWith("https://pixabay.com"))).toBe(false)
    expect(urls.some((u) => u.includes("auth_tokens"))).toBe(false)
    expect(out).toContain(`openverse:${OPENVERSE_CC0_ID}`)
    expect(out).toMatch(/anonymous/i)
    expect(out).toContain("pptfast config set openverse.clientId")
    expect(out).toContain("pptfast config set openverse.clientSecret")
    expect(out).not.toContain("<key>")
    expect(out).not.toContain("later version")
    expect(out).toContain("Pixabay is unconfigured")
  })

  it("searches Pixabay then Openverse when only Pixabay is configured", async () => {
    await tmpHome()
    await persistImageApiKey("pixabay", "TESTPIXABAYKEY99")
    const urls: string[] = []
    const out = await runImagesSearch("office", {
      fetch: async (input) => {
        const url = String(input)
        urls.push(url)
        if (url.startsWith("https://api.pexels.com")) {
          throw new Error("Pexels must not be called without a key")
        }
        if (url.startsWith("https://pixabay.com/api/")) {
          return jsonResponse({ hits: [] })
        }
        if (url.startsWith("https://api.openverse.org/v1/images/")) {
          return jsonResponse({ results: [OPENVERSE_CC0] })
        }
        throw new Error(`unexpected fetch ${url}`)
      },
    })
    expect(urls.some((u) => u.startsWith("https://pixabay.com/api/"))).toBe(true)
    expect(urls.some((u) => u.startsWith("https://api.openverse.org/v1/images/"))).toBe(true)
    expect(out).toContain(`openverse:${OPENVERSE_CC0_ID}`)
    expect(out).not.toContain("Pexels API key")
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

  it("POSTs an Openverse token then sends Bearer, and reuses the cached token", async () => {
    await tmpHome()
    await persistUserConfigValue(["images", "openverse", "clientId"], "ov-client-id-99")
    await persistUserConfigValue(["images", "openverse", "clientSecret"], "ov-client-secret-99")
    let tokenPosts = 0
    const out = await runImagesSearch("office", {
      fetch: async (input, init) => {
        const url = String(input)
        if (url === "https://api.openverse.org/v1/auth_tokens/token/") {
          tokenPosts += 1
          const body = String((init as RequestInit | undefined)?.body ?? "")
          expect(body).toContain("grant_type=client_credentials")
          expect(body).toContain("client_id=ov-client-id-99")
          expect(body).toContain("client_secret=ov-client-secret-99")
          return jsonResponse({ access_token: "ovtoken99", expires_in: 36000 })
        }
        if (url.startsWith("https://api.openverse.org/v1/images/")) {
          const headers = (init as RequestInit | undefined)?.headers as Record<string, string> | undefined
          const auth = headers?.Authorization ?? (headers as unknown as { authorization?: string })?.authorization
          expect(auth).toBe("Bearer ovtoken99")
          return jsonResponse({ results: [OPENVERSE_CC0] })
        }
        throw new Error(`unexpected fetch ${url}`)
      },
    })
    expect(out).toContain(`openverse:${OPENVERSE_CC0_ID}`)
    expect(tokenPosts).toBe(1)
    await runImagesSearch("office", {
      fetch: async (input, init) => {
        const url = String(input)
        if (url === "https://api.openverse.org/v1/auth_tokens/token/") {
          tokenPosts += 1
          return jsonResponse({ access_token: "ovtoken-should-not", expires_in: 36000 })
        }
        if (url.startsWith("https://api.openverse.org/v1/images/")) {
          const headers = (init as RequestInit | undefined)?.headers as Record<string, string>
          expect(headers.Authorization).toBe("Bearer ovtoken99")
          return jsonResponse({ results: [OPENVERSE_CC0] })
        }
        throw new Error(`unexpected fetch ${url}`)
      },
    })
    expect(tokenPosts).toBe(1)
  })

  it("retries a 429 then succeeds, and throws after 429×3 with a redacted body", async () => {
    await tmpHome()
    const slept: number[] = []
    let n = 0
    const out = await runImagesSearch("office", {
      sleep: async (ms) => {
        slept.push(ms)
      },
      fetch: async (input) => {
        const url = String(input)
        if (url.startsWith("https://api.openverse.org/v1/images/")) {
          n += 1
          if (n === 1) return new Response("slow down", { status: 429 })
          return jsonResponse({ results: [OPENVERSE_CC0] })
        }
        throw new Error(`unexpected fetch ${url}`)
      },
    })
    expect(out).toContain(`openverse:${OPENVERSE_CC0_ID}`)
    expect(slept).toEqual([500])

    n = 0
    await expect(
      runImagesSearch("office", {
        sleep: async () => {},
        fetch: async (input) => {
          const url = String(input)
          if (url.startsWith("https://api.openverse.org/v1/images/")) {
            n += 1
            return new Response("rate body SUPERSECRET99", { status: 429 })
          }
          throw new Error(`unexpected fetch ${url}`)
        },
      }),
    ).rejects.toSatisfy((e: unknown) => {
      const message = (e as Error).message
      expect(message).toMatch(/rate-limited \(HTTP 429\)/)
      expect(n).toBe(3)
      return true
    })
  })

  it("redacts client_secret from a thrown Openverse URL", async () => {
    await tmpHome()
    await persistUserConfigValue(["images", "openverse", "clientId"], "ov-client-id-99")
    await persistUserConfigValue(["images", "openverse", "clientSecret"], "OVSECRET99")
    await expect(
      runImagesSearch("office", {
        fetch: async () => {
          throw new Error("https://api.openverse.org/v1/auth_tokens/token/?client_secret=OVSECRET99")
        },
      }),
    ).rejects.toSatisfy((e: unknown) => {
      const message = (e as Error).message
      expect(message).not.toContain("OVSECRET99")
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

  it("fetches openverse:<uuid>, writes jpg + sidecar with cc0 attribution, and skips the second fetch", async () => {
    await tmpHome()
    const cwd = await mkdtemp(join(tmpdir(), "pptfast-fetch-ov-"))
    const deck = join(cwd, "demo-deck")
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      if (url === `https://api.openverse.org/v1/images/${OPENVERSE_CC0_ID}/`) {
        return jsonResponse(OPENVERSE_CC0)
      }
      if (url === OPENVERSE_CC0.url) {
        return bytesResponse(JPEG_TINY)
      }
      throw new Error(`unexpected fetch ${url}`)
    }
    const resize = async (bytes: Buffer) => bytes
    const first = await runImagesFetch(`openverse:${OPENVERSE_CC0_ID}`, {
      deck,
      as: "hero",
      cwd,
      query: "office desk",
      fetch: fetchImpl,
      resizeToJpeg: resize,
      now: () => new Date("2026-08-22T00:00:00.000Z"),
    })
    expect(first).toContain(`pinned openverse:${OPENVERSE_CC0_ID} as hero`)
    const assets = join(cwd, ".pptfast", "demo-deck", "assets")
    const sidecar = JSON.parse(await readFile(join(assets, "hero.json"), "utf8")) as Record<string, unknown>
    expect(sidecar.provider).toBe("openverse")
    expect(sidecar.photo_id).toBe(OPENVERSE_CC0_ID)
    expect(sidecar.license).toBe("cc0")
    expect(sidecar.author).toBe("Bench Accounting")
    expect(sidecar.page_url).toBe("https://stocksnap.io/photo/office-desk")
    expect(sidecar.attribution).toBe(OPENVERSE_CC0.attribution)
    expect(sidecar.source).toBe("stocksnap")
    expect(sidecar.query).toBe("office desk")
    expect(JSON.stringify(sidecar)).not.toMatch(/"apiKey"\s*:/)
    expect(JSON.stringify(sidecar)).not.toMatch(/"key"\s*:/)
    expect(JSON.stringify(sidecar)).not.toMatch(/"clientSecret"\s*:/)

    const second = await runImagesFetch(`openverse:${OPENVERSE_CC0_ID}`, {
      deck,
      as: "hero",
      cwd,
      fetch: async () => {
        throw new Error("network must not run on an idempotent skip")
      },
      resizeToJpeg: resize,
    })
    expect(second).toContain("already pinned")
    expect(second).toContain("skipped")
  })

  it("refuses to fetch an Openverse by-sa detail record and writes no file", async () => {
    await tmpHome()
    const cwd = await mkdtemp(join(tmpdir(), "pptfast-fetch-bysa-"))
    const deck = join(cwd, "demo-deck")
    await expect(
      runImagesFetch(`openverse:${OPENVERSE_BYSA_ID}`, {
        deck,
        as: "hero",
        cwd,
        fetch: async (input) => {
          const url = String(input)
          if (url === `https://api.openverse.org/v1/images/${OPENVERSE_BYSA_ID}/`) {
            return jsonResponse(OPENVERSE_BYSA)
          }
          throw new Error(`unexpected fetch ${url}`)
        },
        resizeToJpeg: async (bytes) => bytes,
      }),
    ).rejects.toThrow(/cc0|pdm|license/i)
    const { pathExists } = await import("./deck-dir")
    expect(await pathExists(join(cwd, ".pptfast", "demo-deck", "assets", "hero.jpg"))).toBe(false)
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

  it("lists an Openverse sidecar", async () => {
    await tmpHome()
    const cwd = await mkdtemp(join(tmpdir(), "pptfast-list-ov-"))
    const assets = join(cwd, ".pptfast", "demo-deck", "assets")
    const { mkdir } = await import("node:fs/promises")
    await mkdir(assets, { recursive: true })
    await writeFile(
      join(assets, "desk.json"),
      JSON.stringify({
        provider: "openverse",
        photo_id: OPENVERSE_CC0_ID,
        license: "cc0",
        author: "Bench Accounting",
        page_url: "https://stocksnap.io/photo/office-desk",
        attribution: OPENVERSE_CC0.attribution,
        source: "stocksnap",
        downloaded_at: "2026-08-22T00:00:00.000Z",
      }),
    )
    const out = await runImagesList({ deck: join(cwd, "demo-deck"), cwd })
    expect(out).toContain("desk")
    expect(out).toContain(`openverse:${OPENVERSE_CC0_ID}`)
    expect(out).toContain("Bench Accounting")
    expect(out).toContain("cc0")
  })
})
