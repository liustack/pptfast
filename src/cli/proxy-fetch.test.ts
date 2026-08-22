// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

const close = vi.fn(async () => {})

vi.mock("undici", () => {
  class EnvHttpProxyAgent {
    close = close
  }
  return {
    EnvHttpProxyAgent,
    fetch: vi.fn(async () => ({
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "text/plain" }),
    })),
  }
})

const undici = await import("undici")
const { proxyFetch } = await import("./proxy-fetch")

const originalEnv = { ...process.env }

afterEach(() => {
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "NO_PROXY", "no_proxy"]) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
  vi.mocked(undici.fetch).mockClear()
  close.mockClear()
  vi.unstubAllGlobals()
})

describe("proxyFetch", () => {
  it("uses global fetch when no proxy env is set", async () => {
    delete process.env.HTTP_PROXY
    delete process.env.HTTPS_PROXY
    delete process.env.http_proxy
    delete process.env.https_proxy
    const globalFetch = vi.fn(async () => new Response("ok", { status: 200 }))
    vi.stubGlobal("fetch", globalFetch)
    const res = await proxyFetch("https://example.com/api")
    expect(globalFetch).toHaveBeenCalled()
    expect(undici.fetch).not.toHaveBeenCalled()
    expect(await res.text()).toBe("ok")
  })

  it("routes through undici EnvHttpProxyAgent and closes the dispatcher", async () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:8080"
    delete process.env.HTTP_PROXY
    delete process.env.http_proxy
    delete process.env.https_proxy
    const res = await proxyFetch("https://example.com/api")
    expect(undici.fetch).toHaveBeenCalledTimes(1)
    const init = vi.mocked(undici.fetch).mock.calls[0]?.[1] as { dispatcher?: { close: typeof close } }
    expect(init.dispatcher).toBeDefined()
    expect(close).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]))
  })

  it("closes the dispatcher on failure and names HTTPS_PROXY/HTTP_PROXY", async () => {
    process.env.HTTP_PROXY = "http://127.0.0.1:8080"
    delete process.env.HTTPS_PROXY
    delete process.env.https_proxy
    const err = new Error("fetch failed")
    ;(err as Error & { cause?: { code: string } }).cause = { code: "ECONNREFUSED" }
    vi.mocked(undici.fetch).mockRejectedValueOnce(err)
    await expect(proxyFetch("https://example.com/api")).rejects.toThrow(/HTTPS_PROXY|HTTP_PROXY/)
    expect(close).toHaveBeenCalled()
  })
})
