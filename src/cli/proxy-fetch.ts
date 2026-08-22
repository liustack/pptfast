/**
 * Proxy-aware fetch for gallery API requests (issue #20). Node's fetch
 * ignores HTTP_PROXY/HTTPS_PROXY. Dispatcher and fetch both come from
 * undici. The dispatcher is closed after the body is buffered so a
 * keep-alive pool cannot pin the CLI process (#23).
 */
import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici"

const CONNECT_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
])

function hasProxyEnv(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy)
}

export function connectFailureHint(error: unknown, url: string): string | null {
  const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined
  if (!cause?.code || !CONNECT_CODES.has(cause.code)) return null
  let host: string
  try {
    host = new URL(url).host
  } catch {
    return null
  }
  return (
    `Could not connect to ${host} (${cause.code}). The request never reached the network. ` +
    "If this machine reaches the internet through a proxy, set HTTPS_PROXY/HTTP_PROXY."
  )
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

export async function proxyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!hasProxyEnv(process.env)) {
    return await fetch(input, init)
  }
  const dispatcher = new EnvHttpProxyAgent()
  try {
    const response = await undiciFetch(requestUrl(input), {
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
    const hint = connectFailureHint(error, requestUrl(input))
    throw hint ? new Error(hint, { cause: error }) : error
  }
}
