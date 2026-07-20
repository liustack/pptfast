// @vitest-environment jsdom
//
// rasterizeSvgInBrowser wiring + failure-path coverage (audit-v2 phase B,
// spec §11.8) — jsdom cannot actually decode an image or run a real 2d
// canvas (`src/test-setup.ts`'s own comment: "jsdom intentionally does not
// implement canvas without the optional native canvas package"), so per the
// task brief this suite covers *wiring* and *both explicit-failure paths*
// with mocked collaborators; real rasterization correctness is verified once
// in a real browser via playwright (see this task's own report).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { IMAGE_LOAD_TIMEOUT_MS, rasterizeSvgInBrowser } from "./browser"

/** A controllable `Image` stand-in: `src` setter schedules `onload` (success)
 *  or `onerror` (failure) on the next microtask, mirroring how a real
 *  `Image`'s decode is always asynchronous relative to the `src` assignment.
 *  `"hang"` never calls either — simulates a stuck decode, for the timeout
 *  coverage below. */
function makeFakeImageClass(mode: "success" | "error" | "hang"): typeof Image {
  return class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    private _src = ""
    get src(): string {
      return this._src
    }
    set src(value: string) {
      this._src = value
      if (mode === "hang") return
      queueMicrotask(() => {
        if (mode === "success") this.onload?.()
        else this.onerror?.()
      })
    }
  } as unknown as typeof Image
}

function fakeImageData(width: number, height: number, fill: [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0]
    data[i + 1] = fill[1]
    data[i + 2] = fill[2]
    data[i + 3] = fill[3]
  }
  return { data, width, height, colorSpace: "srgb" } as ImageData
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("rasterizeSvgInBrowser — remote asset guard", () => {
  it("rejects an http(s) href before ever touching Image/canvas (no mocking needed — it must never reach either)", async () => {
    const svg = `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/photo.jpg" width="1280" height="720"/></svg>`
    await expect(rasterizeSvgInBrowser(svg, 1280, 720)).rejects.toThrow(/remote image.*https:\/\/example\.com\/photo\.jpg/)
  })

  it("rejects a legacy xlink:href remote reference too", async () => {
    const svg = `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg"><image xlink:href="http://example.com/photo.jpg" width="1280" height="720"/></svg>`
    await expect(rasterizeSvgInBrowser(svg, 1280, 720)).rejects.toThrow(/remote image/)
  })
})

describe("rasterizeSvgInBrowser — capability guard", () => {
  it("throws a curated message (not a raw ReferenceError) when Image is unavailable", async () => {
    vi.stubGlobal("Image", undefined)
    await expect(rasterizeSvgInBrowser("<svg/>", 10, 10)).rejects.toThrow(/rasterizeSvg unavailable/)
  })
})

describe("rasterizeSvgInBrowser — happy-path wiring (mocked Image + canvas)", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", makeFakeImageClass("success"))
  })

  it("draws the loaded image onto a canvas sized to the request and returns getImageData's own buffer", async () => {
    const expected = fakeImageData(8, 6, [10, 20, 30, 255])
    const drawImage = vi.fn()
    const getImageData = vi.fn().mockReturnValue(expected)
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      getImageData,
    } as unknown as CanvasRenderingContext2D)

    const result = await rasterizeSvgInBrowser("<svg viewBox='0 0 1280 720'/>", 8, 6)

    expect(drawImage).toHaveBeenCalledTimes(1)
    expect(drawImage.mock.calls[0]?.slice(1)).toEqual([0, 0, 8, 6])
    expect(getImageData).toHaveBeenCalledWith(0, 0, 8, 6)
    expect(result).toEqual({ width: 8, height: 6, data: expected.data })
  })

  it("prefers OffscreenCanvas when the environment provides one", async () => {
    const drawImage = vi.fn()
    const expected = fakeImageData(4, 4, [1, 2, 3, 255])
    const getImageData = vi.fn().mockReturnValue(expected)
    class FakeOffscreenCanvas {
      width: number
      height: number
      constructor(w: number, h: number) {
        this.width = w
        this.height = h
      }
      getContext() {
        return { drawImage, getImageData }
      }
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas)
    const htmlCanvasSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext")

    await rasterizeSvgInBrowser("<svg viewBox='0 0 1280 720'/>", 4, 4)

    expect(drawImage).toHaveBeenCalledTimes(1)
    expect(htmlCanvasSpy).not.toHaveBeenCalled()
  })

  it("rejects when getContext('2d') returns null", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    await expect(rasterizeSvgInBrowser("<svg viewBox='0 0 1280 720'/>", 4, 4)).rejects.toThrow(/2d canvas context/)
  })
})

describe("rasterizeSvgInBrowser — getImageData SecurityError fallback", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", makeFakeImageClass("success"))
  })

  it("catches a tainted-canvas SecurityError and rethrows an explicit, readable error", async () => {
    const securityError = Object.assign(new Error("tainted canvas"), { name: "SecurityError" })
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        throw securityError
      }),
    } as unknown as CanvasRenderingContext2D)

    await expect(rasterizeSvgInBrowser("<svg viewBox='0 0 1280 720'/>", 4, 4)).rejects.toThrow(/tainted while reading back pixel data/)
  })

  it("does not swallow an unrelated getImageData error under the SecurityError message", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        throw new Error("some other canvas failure")
      }),
    } as unknown as CanvasRenderingContext2D)

    await expect(rasterizeSvgInBrowser("<svg viewBox='0 0 1280 720'/>", 4, 4)).rejects.toThrow(/some other canvas failure/)
  })
})

describe("rasterizeSvgInBrowser — image decode failure", () => {
  it("rejects with an explicit message when the Image fails to load", async () => {
    vi.stubGlobal("Image", makeFakeImageClass("error"))
    await expect(rasterizeSvgInBrowser("<svg viewBox='0 0 1280 720'/>", 4, 4)).rejects.toThrow(/could not decode/)
  })
})

describe("rasterizeSvgInBrowser — decode timeout", () => {
  // A stuck decode (onload/onerror never fire — the "hang" fake Image mode
  // above) must not hang the whole rasterize call forever, unlike the
  // Node/Sharp path (a synchronous, bounded call). Fake timers: real time
  // never actually elapses, so this stays a fast unit test.
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it(`rejects with an explicit, named-timeout error after ${IMAGE_LOAD_TIMEOUT_MS}ms when onload/onerror never fire`, async () => {
    vi.stubGlobal("Image", makeFakeImageClass("hang"))
    const result = rasterizeSvgInBrowser("<svg viewBox='0 0 1280 720'/>", 4, 4)
    const assertion = expect(result).rejects.toThrow(new RegExp(`timed out after ${IMAGE_LOAD_TIMEOUT_MS}ms`))
    await vi.advanceTimersByTimeAsync(IMAGE_LOAD_TIMEOUT_MS)
    await assertion
  })

  it("does not fire the timeout when the image resolves well before it", async () => {
    vi.stubGlobal("Image", makeFakeImageClass("success"))
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    } as unknown as CanvasRenderingContext2D)

    const result = rasterizeSvgInBrowser("<svg viewBox='0 0 1280 720'/>", 1, 1)
    // Let the success microtask (queued synchronously by the fake Image's
    // `src` setter above) resolve before any fake-timer time passes at all.
    await vi.advanceTimersByTimeAsync(0)
    await expect(result).resolves.toEqual({ width: 1, height: 1, data: new Uint8ClampedArray(4) })
  })
})
