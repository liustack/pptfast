/**
 * SSRF guards for gallery downloads. Search APIs may use a proxy. The
 * pin-to-disk path must not: a proxy would connect to an address this
 * check never saw. DNS is resolved, every address is checked, and the
 * download pins the socket to the IP that passed.
 */
import { lookup as dnsLookup } from "node:dns/promises"
import { isIP } from "node:net"
import { Agent, fetch as undiciFetch } from "undici"

export interface PinnedTarget {
  hostname: string
  address: string
  family: number
}

export type DnsLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>

export async function defaultDnsLookup(hostname: string): Promise<Array<{ address: string; family: number }>> {
  return dnsLookup(hostname, { all: true, verbatim: true })
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.amazonaws.com",
  "metadata.azure.internal",
])

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  if (!normalized) return true
  if (BLOCKED_HOSTNAMES.has(normalized)) return true
  if (normalized.endsWith(".localhost")) return true
  return false
}

export function isPrivateIpAddress(ipAddress: string): boolean {
  const normalized = ipAddress.trim().toLowerCase()
  const family = isIP(normalized)
  if (family === 4) return isPrivateIPv4(normalized)
  if (family === 6) return isPrivateIPv6(normalized)
  return true
}

export async function assertSafeRemoteTarget(url: URL, lookup?: DnsLookup): Promise<PinnedTarget> {
  if (isBlockedHostname(url.hostname)) {
    throw new Error(blockedMessage(url.hostname))
  }

  const hostname = stripIpv6Brackets(url.hostname)
  const ipFamily = isIP(hostname)
  if (ipFamily > 0) {
    if (isPrivateIpAddress(hostname)) throw new Error(blockedMessage(hostname))
    return { hostname, address: hostname, family: ipFamily }
  }

  if (!lookup) return { hostname, address: hostname, family: 0 }

  let resolved: Array<{ address: string; family: number }>
  try {
    resolved = await lookup(hostname)
  } catch (error) {
    throw new Error(
      `DNS lookup failed for host ${hostname}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (resolved.length === 0) {
    throw new Error(`Host ${hostname} did not resolve to any IP address.`)
  }
  const blocked = resolved.find((record) => isPrivateIpAddress(record.address))
  if (blocked) throw new Error(blockedMessage(`${hostname} -> ${blocked.address}`))
  const [chosen] = resolved
  return { hostname, address: chosen!.address, family: chosen!.family }
}

export async function pinnedFetch(url: URL, pin: PinnedTarget, init?: RequestInit): Promise<Response> {
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname: string, options: { all?: boolean } | undefined, callback: (...args: unknown[]) => void) => {
        const record = { address: pin.address, family: pin.family }
        if (options?.all) callback(null, [record])
        else callback(null, pin.address, pin.family)
      },
    } as never,
  })
  try {
    const response = await undiciFetch(url, {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher,
    })
    const buffered = Buffer.from(await response.arrayBuffer())
    await dispatcher.close()
    return new Response(buffered, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as HeadersInit,
    })
  } catch (error) {
    await dispatcher.close().catch(() => {})
    throw error
  }
}

function blockedMessage(target: string): string {
  return `Blocked private or reserved download target: ${target}. pptfast does not download from private addresses.`
}

function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) return hostname.slice(1, -1)
  return hostname
}

function isPrivateIPv4(ipAddress: string): boolean {
  const octets = ipAddress.split(".").map((part) => Number.parseInt(part, 10))
  if (octets.length !== 4 || octets.some((value) => !Number.isFinite(value) || value < 0 || value > 255)) {
    return true
  }
  const value = octets[0]! * 256 ** 3 + octets[1]! * 256 ** 2 + octets[2]! * 256 + octets[3]!
  return (
    inRange(value, "0.0.0.0", "0.255.255.255") ||
    inRange(value, "10.0.0.0", "10.255.255.255") ||
    inRange(value, "100.64.0.0", "100.127.255.255") ||
    inRange(value, "127.0.0.0", "127.255.255.255") ||
    inRange(value, "169.254.0.0", "169.254.255.255") ||
    inRange(value, "172.16.0.0", "172.31.255.255") ||
    inRange(value, "192.0.0.0", "192.0.0.255") ||
    inRange(value, "192.168.0.0", "192.168.255.255") ||
    inRange(value, "198.18.0.0", "198.19.255.255") ||
    inRange(value, "224.0.0.0", "255.255.255.255")
  )
}

function inRange(value: number, start: string, end: string): boolean {
  return value >= ipv4ToNumber(start) && value <= ipv4ToNumber(end)
}

function ipv4ToNumber(ipAddress: string): number {
  const octets = ipAddress.split(".").map((part) => Number.parseInt(part, 10))
  return octets[0]! * 256 ** 3 + octets[1]! * 256 ** 2 + octets[2]! * 256 + octets[3]!
}

function isPrivateIPv6(ipAddress: string): boolean {
  const groups = expandIpv6(ipAddress)
  if (groups !== null && hasMappedV4Prefix(groups)) {
    const mapped = [groups[6]! >> 8, groups[6]! & 0xff, groups[7]! >> 8, groups[7]! & 0xff].join(".")
    return isPrivateIPv4(mapped)
  }
  const normalized = ipAddress.split("%")[0]!
  const mapped = extractMappedIpv4(normalized)
  if (mapped && isPrivateIPv4(mapped)) return true
  const value = ipv6ToBigInt(normalized)
  if (value === null) return true
  return (
    inIpv6Range(value, "::", 128) ||
    inIpv6Range(value, "::1", 128) ||
    inIpv6Range(value, "fc00::", 7) ||
    inIpv6Range(value, "fe80::", 10) ||
    inIpv6Range(value, "ff00::", 8) ||
    inIpv6Range(value, "2001:db8::", 32)
  )
}

function hasMappedV4Prefix(groups: number[]): boolean {
  return groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
}

function extractMappedIpv4(ipAddress: string): string | null {
  const lower = ipAddress.toLowerCase()
  const marker = "::ffff:"
  if (!lower.startsWith(marker)) return null
  const candidate = lower.slice(marker.length)
  return isIP(candidate) === 4 ? candidate : null
}

function inIpv6Range(value: bigint, start: string, prefixLength: number): boolean {
  const startValue = ipv6ToBigInt(start)
  if (startValue === null) return false
  const mask = prefixLength === 0 ? 0n : ((1n << BigInt(prefixLength)) - 1n) << BigInt(128 - prefixLength)
  return (value & mask) === (startValue & mask)
}

function ipv6ToBigInt(ipAddress: string): bigint | null {
  const expanded = expandIpv6(ipAddress)
  if (!expanded) return null
  return expanded.reduce((acc, group) => (acc << 16n) + BigInt(group), 0n)
}

function expandIpv6(ipAddress: string): number[] | null {
  const value = ipAddress.toLowerCase()
  if (value.includes("::")) {
    const [left, right] = value.split("::")
    const leftGroups = left ? left.split(":").filter(Boolean) : []
    const rightGroups = right ? right.split(":").filter(Boolean) : []
    if (leftGroups.length + rightGroups.length > 8) return null
    const middle = new Array(8 - leftGroups.length - rightGroups.length).fill("0")
    return parseIpv6Groups([...leftGroups, ...middle, ...rightGroups])
  }
  return parseIpv6Groups(value.split(":"))
}

function parseIpv6Groups(groups: string[]): number[] | null {
  if (groups.length !== 8) return null
  const parsed = groups.map((group) => Number.parseInt(group || "0", 16))
  if (parsed.some((value) => !Number.isFinite(value) || value < 0 || value > 0xffff)) return null
  return parsed
}
