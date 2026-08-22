// @vitest-environment node
import { describe, expect, it } from "vitest"
import { assertSafeRemoteTarget, isBlockedHostname, isPrivateIpAddress } from "./ssrf"

const publicLookup = async () => [{ address: "1.1.1.1", family: 4 }]

describe("isBlockedHostname", () => {
  it("rejects localhost, *.localhost, and cloud metadata names", () => {
    expect(isBlockedHostname("localhost")).toBe(true)
    expect(isBlockedHostname("foo.localhost")).toBe(true)
    expect(isBlockedHostname("metadata.google.internal")).toBe(true)
    expect(isBlockedHostname("metadata.amazonaws.com")).toBe(true)
    expect(isBlockedHostname("metadata.azure.internal")).toBe(true)
    expect(isBlockedHostname("images.pexels.com")).toBe(false)
  })
})

describe("isPrivateIpAddress", () => {
  it("rejects loopback, RFC1918, link-local, unspecified, CGNAT, and multicast IPv4", () => {
    expect(isPrivateIpAddress("127.0.0.1")).toBe(true)
    expect(isPrivateIpAddress("10.0.0.1")).toBe(true)
    expect(isPrivateIpAddress("172.16.5.1")).toBe(true)
    expect(isPrivateIpAddress("192.168.1.1")).toBe(true)
    expect(isPrivateIpAddress("169.254.1.1")).toBe(true)
    expect(isPrivateIpAddress("0.0.0.0")).toBe(true)
    expect(isPrivateIpAddress("100.64.0.1")).toBe(true)
    expect(isPrivateIpAddress("224.0.0.1")).toBe(true)
    expect(isPrivateIpAddress("8.8.8.8")).toBe(false)
  })

  it("rejects loopback, mapped IPv4, link-local, and ULA IPv6", () => {
    expect(isPrivateIpAddress("::1")).toBe(true)
    expect(isPrivateIpAddress("::ffff:127.0.0.1")).toBe(true)
    expect(isPrivateIpAddress("fe80::1")).toBe(true)
    expect(isPrivateIpAddress("fc00::1")).toBe(true)
    expect(isPrivateIpAddress("2001:4860:4860::8888")).toBe(false)
  })
})

describe("assertSafeRemoteTarget", () => {
  it("rejects a blocked hostname without calling lookup", async () => {
    let called = false
    await expect(
      assertSafeRemoteTarget(new URL("https://localhost/x.png"), async () => {
        called = true
        return []
      }),
    ).rejects.toThrow(/localhost/)
    expect(called).toBe(false)
  })

  it("rejects when any resolved address is private and names the host and IP", async () => {
    await expect(
      assertSafeRemoteTarget(new URL("https://evil.example/x.png"), async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "10.1.2.3", family: 4 },
      ]),
    ).rejects.toThrow(/evil\.example.*10\.1\.2\.3|10\.1\.2\.3.*evil\.example/)
  })

  it("pins the first public address", async () => {
    const pin = await assertSafeRemoteTarget(new URL("https://cdn.example/a.jpg"), publicLookup)
    expect(pin).toEqual({ hostname: "cdn.example", address: "1.1.1.1", family: 4 })
  })

  it("rejects a literal private IP without DNS", async () => {
    await expect(assertSafeRemoteTarget(new URL("https://192.168.0.9/x.png"), publicLookup)).rejects.toThrow(
      /192\.168\.0\.9/,
    )
  })
})
