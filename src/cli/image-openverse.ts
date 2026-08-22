/**
 * Openverse search / detail / OAuth token cache. Fetch and sleep are
 * injected so unit tests never hit the network or wait on backoff.
 */
import { PptfastError } from "../errors"
import { VERSION } from "../version"
import { redactSecrets } from "./redact"

export const OPENVERSE_SEARCH_URL = "https://api.openverse.org/v1/images/"
export const OPENVERSE_TOKEN_URL = "https://api.openverse.org/v1/auth_tokens/token/"
export const OPENVERSE_PAGE_SIZE = 8
const TOKEN_SKEW_MS = 30_000

export type SleepFn = (ms: number) => Promise<void>
export const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export interface OpenverseHit {
  id: string
  url: string
  foreignLandingUrl: string
  creator: string
  license: string
  attribution: string
  source: string
  width: number
  height: number
  thumbnail: string
}

interface CachedToken {
  accessToken: string
  expiresAt: number
}

const tokenCache = new Map<string, CachedToken>()

export function resetOpenverseTokenCache(): void {
  tokenCache.clear()
}

function userAgent(): string {
  return `pptfast/${VERSION} (+https://github.com/liustack/pptfast)`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function isCc0OrPdm(license: string | undefined): boolean {
  const token = (license ?? "").toLowerCase()
  return token === "cc0" || token === "pdm"
}

function retryDelayMs(res: Response, attempt: number): number {
  const raw = res.headers.get("Retry-After")
  if (raw !== null && raw !== "") {
    const seconds = Number(raw)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000)
  }
  return attempt === 0 ? 500 : 1500
}

async function fetchOpenverseJson(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  secrets: string[],
  sleep: SleepFn,
): Promise<unknown> {
  let attempt = 0
  while (true) {
    let res: Response
    try {
      res = await fetchImpl(url, init)
    } catch (e) {
      throw new PptfastError(
        redactSecrets(`stock image request failed: ${e instanceof Error ? e.message : String(e)}`, secrets),
      )
    }
    const text = await res.text()
    if (res.status === 429) {
      if (attempt >= 2) {
        throw new PptfastError(
          `stock image API rate-limited (HTTP 429): ${redactSecrets(text.slice(0, 800), secrets)}`,
        )
      }
      await sleep(retryDelayMs(res, attempt))
      attempt += 1
      continue
    }
    if (!res.ok) {
      throw new PptfastError(`stock image API HTTP ${res.status}: ${redactSecrets(text.slice(0, 800), secrets)}`)
    }
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new PptfastError(`stock image API returned non-JSON (HTTP ${res.status})`)
    }
  }
}

export async function getOpenverseAccessToken(
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch,
  secrets: string[],
  sleep: SleepFn,
  now: () => number = Date.now,
): Promise<string> {
  const cached = tokenCache.get(clientId)
  if (cached && now() < cached.expiresAt - TOKEN_SKEW_MS) return cached.accessToken
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  }).toString()
  const json = await fetchOpenverseJson(
    OPENVERSE_TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": userAgent(),
      },
      body,
    },
    fetchImpl,
    secrets,
    sleep,
  )
  const rec = asRecord(json)
  const accessToken = asString(rec?.access_token)
  const expiresIn = asNumber(rec?.expires_in) ?? 3600
  if (!accessToken) throw new PptfastError("Openverse token response was missing access_token")
  tokenCache.set(clientId, { accessToken, expiresAt: now() + expiresIn * 1000 })
  return accessToken
}

async function authHeaders(
  creds: { clientId?: string; clientSecret?: string },
  fetchImpl: typeof fetch,
  secrets: string[],
  sleep: SleepFn,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "User-Agent": userAgent() }
  if (creds.clientId && creds.clientSecret) {
    const token = await getOpenverseAccessToken(creds.clientId, creds.clientSecret, fetchImpl, secrets, sleep)
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

function parseHit(raw: unknown): OpenverseHit | null {
  const photo = asRecord(raw)
  if (!photo) return null
  const id = asString(photo.id)
  const url = asString(photo.url)
  if (!id || !url) return null
  const license = (asString(photo.license) ?? "").toLowerCase()
  if (!isCc0OrPdm(license)) return null
  const source = asString(photo.source) ?? asString(photo.provider) ?? "openverse"
  return {
    id,
    url,
    foreignLandingUrl: asString(photo.foreign_landing_url) ?? "",
    creator: asString(photo.creator) ?? "unknown",
    license,
    attribution: asString(photo.attribution) ?? "",
    source,
    width: asNumber(photo.width) ?? 0,
    height: asNumber(photo.height) ?? 0,
    thumbnail: asString(photo.thumbnail) ?? "",
  }
}

export interface OpenverseSearchOpts {
  query: string
  orientation?: "landscape" | "portrait" | "square"
  minWidth?: number
  minHeight?: number
  clientId?: string
  clientSecret?: string
  fetch: typeof fetch
  secrets: string[]
  sleep: SleepFn
}

function matchesOrientation(hit: OpenverseHit, orientation: "landscape" | "portrait" | "square" | undefined): boolean {
  if (!orientation) return true
  if (orientation === "landscape") return hit.width > hit.height
  if (orientation === "portrait") return hit.height > hit.width
  return hit.width === hit.height
}

export async function searchOpenverse(opts: OpenverseSearchOpts): Promise<OpenverseHit[]> {
  const url = new URL(OPENVERSE_SEARCH_URL)
  url.searchParams.set("q", opts.query)
  url.searchParams.set("license_type", "commercial")
  url.searchParams.set("license", "cc0,pdm")
  url.searchParams.set("page_size", String(OPENVERSE_PAGE_SIZE))
  const headers = await authHeaders(
    { clientId: opts.clientId, clientSecret: opts.clientSecret },
    opts.fetch,
    opts.secrets,
    opts.sleep,
  )
  const json = await fetchOpenverseJson(url.toString(), { headers }, opts.fetch, opts.secrets, opts.sleep)
  const root = asRecord(json)
  const list = Array.isArray(root?.results) ? root.results : []
  const hits: OpenverseHit[] = []
  for (const raw of list) {
    const hit = parseHit(raw)
    if (!hit) continue
    if (opts.minWidth !== undefined && hit.width < opts.minWidth) continue
    if (opts.minHeight !== undefined && hit.height < opts.minHeight) continue
    if (!matchesOrientation(hit, opts.orientation)) continue
    hits.push(hit)
    if (hits.length >= OPENVERSE_PAGE_SIZE) break
  }
  return hits
}

export async function loadOpenverseDetail(
  id: string,
  creds: { clientId?: string; clientSecret?: string },
  fetchImpl: typeof fetch,
  secrets: string[],
  sleep: SleepFn,
): Promise<OpenverseHit> {
  const url = `${OPENVERSE_SEARCH_URL}${encodeURIComponent(id)}/`
  const headers = await authHeaders(creds, fetchImpl, secrets, sleep)
  const json = await fetchOpenverseJson(url, { headers }, fetchImpl, secrets, sleep)
  const license = asString(asRecord(json)?.license)
  if (!isCc0OrPdm(license)) {
    throw new PptfastError(
      `Openverse photo ${id} is licensed "${license ?? "unknown"}", not cc0/pdm — refusing to download`,
    )
  }
  const hit = parseHit(json)
  if (!hit) throw new PptfastError(`Openverse photo ${id} was not found`)
  return hit
}
