/**
 * `pptfast images search|fetch|list` — Pexels first, Pixabay as empty-result
 * fallback. Downloads land in `.pptfast/<deck>/assets/` with a sidecar.
 * Inject `fetch` (and `resizeToJpeg`) so tests never touch the network.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { PptfastError } from "../errors"
import { sniffImageFormat } from "../ir/asset-sniff"
import { isMissingModuleError } from "../platform/node"
import { VERSION } from "../version"
import type * as Sharp from "sharp"
import { findConfig, findUserConfig } from "./config"
import { assertSafeFileSegment, ASSETS_DIRNAME, isDeckDirectory, pathExists, resolveDeckTarget } from "./deck-dir"
import { missingKeysError, resolveImageKeys, type ImageProviderId, type ResolvedImageKeys } from "./image-config"
import { redactSecrets } from "./redact"
import { resolveWorkspaceLocation, type WorkspaceLocation } from "./workspace"

export const BYTE_CAP = 15 * 1024 * 1024
export const MAX_LONG_EDGE = 1920
const PER_PAGE = 8

export type ResizeToJpeg = (bytes: Buffer, maxLongEdge: number) => Promise<Buffer>

export interface StockSidecar {
  provider: ImageProviderId
  photo_id: string
  license: string
  author: string
  page_url: string
  query?: string
  downloaded_at: string
}

export interface SearchHit {
  id: string
  provider: ImageProviderId
  photoId: string
  thumb: string
  width: number
  height: number
  author: string
  license: string
  pageUrl: string
  attribution: string
}

export interface ImagesSearchOptions {
  orientation?: string
  color?: string
  minWidth?: number
  minHeight?: number
  fetch?: typeof fetch
  env?: NodeJS.ProcessEnv
}

export interface ImagesFetchOptions {
  deck: string
  as: string
  cwd?: string
  query?: string
  fetch?: typeof fetch
  resizeToJpeg?: ResizeToJpeg
  env?: NodeJS.ProcessEnv
  now?: () => Date
}

export interface ImagesListOptions {
  deck: string
  cwd?: string
}

type FetchImpl = typeof fetch

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

async function loadKeys(env: NodeJS.ProcessEnv): Promise<ResolvedImageKeys> {
  const hit = await findUserConfig()
  return resolveImageKeys({ file: hit?.config ?? null, env })
}

async function fetchJson(
  url: string,
  init: RequestInit,
  fetchImpl: FetchImpl,
  secrets: string[],
): Promise<unknown> {
  let res: Response
  try {
    res = await fetchImpl(url, init)
  } catch (e) {
    throw new PptfastError(
      redactSecrets(`stock image request failed: ${e instanceof Error ? e.message : String(e)}`, secrets),
    )
  }
  const text = await res.text()
  const redacted = redactSecrets(text.slice(0, 800), secrets)
  if (!res.ok) {
    if (res.status === 429) {
      throw new PptfastError(`stock image API rate-limited (HTTP 429): ${redacted}`)
    }
    throw new PptfastError(`stock image API HTTP ${res.status}: ${redacted}`)
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new PptfastError(`stock image API returned non-JSON (HTTP ${res.status})`)
  }
}

function pexelsHeaders(apiKey: string): Record<string, string> {
  return { Authorization: apiKey, "User-Agent": userAgent() }
}

const ORIENTATIONS = new Set(["landscape", "portrait", "square"])

function parseOrientation(raw: string | undefined): "landscape" | "portrait" | "square" | undefined {
  if (raw === undefined || raw === "") return undefined
  if (!ORIENTATIONS.has(raw)) {
    throw new PptfastError(`invalid --orientation "${raw}" — expected landscape, portrait, or square`)
  }
  return raw as "landscape" | "portrait" | "square"
}

function clientFilter(hits: SearchHit[], minWidth?: number, minHeight?: number): SearchHit[] {
  return hits.filter((hit) => {
    if (minWidth !== undefined && hit.width < minWidth) return false
    if (minHeight !== undefined && hit.height < minHeight) return false
    return true
  })
}

function parsePexelsPhotos(json: unknown): SearchHit[] {
  const root = asRecord(json)
  const photos = Array.isArray(root?.photos) ? root.photos : []
  const hits: SearchHit[] = []
  for (const raw of photos) {
    const photo = asRecord(raw)
    if (!photo) continue
    const id = photo.id
    const photoId = typeof id === "number" || typeof id === "string" ? String(id) : ""
    if (!photoId) continue
    const src = asRecord(photo.src) ?? {}
    const author = asString(photo.photographer) ?? "unknown"
    const pageUrl = asString(photo.url) ?? `https://www.pexels.com/photo/${photoId}/`
    hits.push({
      id: `pexels:${photoId}`,
      provider: "pexels",
      photoId,
      thumb: asString(src.medium) ?? asString(src.tiny) ?? "",
      width: asNumber(photo.width) ?? 0,
      height: asNumber(photo.height) ?? 0,
      author,
      license: "Pexels License",
      pageUrl,
      attribution: `Photo by ${author} on Pexels`,
    })
  }
  return hits.slice(0, PER_PAGE)
}

function parsePixabayHits(json: unknown): SearchHit[] {
  const root = asRecord(json)
  const list = Array.isArray(root?.hits) ? root.hits : []
  const hits: SearchHit[] = []
  for (const raw of list) {
    const photo = asRecord(raw)
    if (!photo) continue
    const photoId = photo.id !== undefined ? String(photo.id) : ""
    if (!photoId) continue
    const author = asString(photo.user) ?? "unknown"
    const pageUrl = asString(photo.pageURL) ?? `https://pixabay.com/photos/${photoId}/`
    hits.push({
      id: `pixabay:${photoId}`,
      provider: "pixabay",
      photoId,
      thumb: asString(photo.previewURL) ?? "",
      width: asNumber(photo.imageWidth) ?? 0,
      height: asNumber(photo.imageHeight) ?? 0,
      author,
      license: "Pixabay License",
      pageUrl,
      attribution: `Photo by ${author} on Pixabay`,
    })
  }
  return hits.slice(0, PER_PAGE)
}

async function searchPexels(
  query: string,
  apiKey: string,
  opts: ImagesSearchOptions,
  fetchImpl: FetchImpl,
  secrets: string[],
): Promise<SearchHit[]> {
  const url = new URL("https://api.pexels.com/v1/search")
  url.searchParams.set("query", query)
  url.searchParams.set("locale", "zh-CN")
  url.searchParams.set("per_page", String(PER_PAGE))
  const orientation = parseOrientation(opts.orientation)
  if (orientation) url.searchParams.set("orientation", orientation)
  if (opts.color) url.searchParams.set("color", opts.color)
  const json = await fetchJson(url.toString(), { headers: pexelsHeaders(apiKey) }, fetchImpl, secrets)
  return clientFilter(parsePexelsPhotos(json), opts.minWidth, opts.minHeight)
}

function pixabayOrientation(orientation: string | undefined): string | undefined {
  if (orientation === "landscape") return "horizontal"
  if (orientation === "portrait") return "vertical"
  return undefined
}

async function searchPixabay(
  query: string,
  apiKey: string,
  opts: ImagesSearchOptions,
  fetchImpl: FetchImpl,
  secrets: string[],
): Promise<SearchHit[]> {
  const url = new URL("https://pixabay.com/api/")
  url.searchParams.set("key", apiKey)
  url.searchParams.set("q", query.slice(0, 100))
  url.searchParams.set("lang", "zh")
  url.searchParams.set("per_page", String(PER_PAGE))
  url.searchParams.set("safesearch", "true")
  const mapped = pixabayOrientation(parseOrientation(opts.orientation))
  if (mapped) url.searchParams.set("orientation", mapped)
  if (opts.color) url.searchParams.set("colors", opts.color)
  if (opts.minWidth !== undefined) url.searchParams.set("min_width", String(opts.minWidth))
  if (opts.minHeight !== undefined) url.searchParams.set("min_height", String(opts.minHeight))
  const json = await fetchJson(url.toString(), { headers: { "User-Agent": userAgent() } }, fetchImpl, secrets)
  return parsePixabayHits(json)
}

function formatHits(hits: SearchHit[]): string {
  return hits
    .map((hit) => `${hit.id}  ${hit.width}x${hit.height}  ${hit.author}  ${hit.license}\n  ${hit.attribution}\n  ${hit.pageUrl}`)
    .join("\n")
}

export async function runImagesSearch(query: string, opts: ImagesSearchOptions = {}): Promise<string> {
  const q = query.trim()
  if (q === "") throw new PptfastError("search query must not be empty")
  const env = opts.env ?? process.env
  const keys = await loadKeys(env)
  const secrets = [keys.pexels.apiKey, keys.pixabay.apiKey].filter((k): k is string => typeof k === "string" && k.length >= 6)
  const fetchImpl = opts.fetch ?? globalThis.fetch
  if (!keys.pexels.apiKey && !keys.pixabay.apiKey) throw missingKeysError("none")
  if (!keys.pexels.apiKey) throw missingKeysError("pexels")

  const pexelsHits = await searchPexels(q, keys.pexels.apiKey, opts, fetchImpl, secrets)
  if (pexelsHits.length > 0) return formatHits(pexelsHits)

  if (!keys.pixabay.apiKey) {
    return "No photos found.\nPixabay is unconfigured — pptfast config set pixabay.apiKey"
  }
  const pixabayHits = await searchPixabay(q, keys.pixabay.apiKey, opts, fetchImpl, secrets)
  if (pixabayHits.length === 0) return "No photos found."
  return formatHits(pixabayHits)
}

function parsePhotoRef(ref: string): { provider: ImageProviderId; photoId: string } {
  const m = /^(pexels|pixabay):(.+)$/.exec(ref.trim())
  if (!m) {
    throw new PptfastError(`invalid photo ref "${ref}" — expected pexels:<id> or pixabay:<id>`)
  }
  const photoId = m[2]!.trim()
  if (photoId === "" || photoId.includes("/") || photoId.includes("\\") || photoId.includes("..")) {
    throw new PptfastError(`invalid photo id in "${ref}"`)
  }
  return { provider: m[1] as ImageProviderId, photoId }
}

async function resolveDeckWorkspace(
  deckArg: string,
  cwd: string,
): Promise<{ location: WorkspaceLocation; assetsDir: string }> {
  const [projectHit, userHit] = await Promise.all([findConfig(cwd), findUserConfig()])
  const decksDirSource =
    projectHit?.config.decksDir !== undefined
      ? { decksDir: resolve(dirname(projectHit.path), projectHit.config.decksDir) }
      : userHit?.config
  const target = await resolveDeckTarget(deckArg, decksDirSource, cwd)
  const isDir = await isDeckDirectory(target)
  const location = resolveWorkspaceLocation({
    cwd,
    projectConfigPath: projectHit?.path,
    outDir: projectHit?.config.outDir,
    target,
    isDir,
  })
  return { location, assetsDir: join(location.dir, ASSETS_DIRNAME) }
}

function assertSafeDownloadUrl(url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new PptfastError("invalid download URL")
  }
  if (parsed.protocol !== "https:") {
    throw new PptfastError("refusing non-HTTPS download URL")
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new PptfastError("refusing download URL with embedded userinfo")
  }
  return parsed
}

async function downloadBytes(url: string, fetchImpl: FetchImpl, secrets: string[]): Promise<Buffer> {
  const parsed = assertSafeDownloadUrl(url)
  let res: Response
  try {
    res = await fetchImpl(parsed.toString(), { headers: { "User-Agent": userAgent() } })
  } catch (e) {
    throw new PptfastError(
      redactSecrets(`download failed: ${e instanceof Error ? e.message : String(e)}`, secrets),
    )
  }
  if (!res.ok) {
    throw new PptfastError(`download HTTP ${res.status}`)
  }
  const declared = Number(res.headers.get("content-length") ?? "0")
  if (declared > BYTE_CAP) {
    throw new PptfastError(`download exceeds the ${BYTE_CAP} byte cap`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength > BYTE_CAP) {
    throw new PptfastError(`download exceeds the ${BYTE_CAP} byte cap`)
  }
  return buf
}

export async function defaultResizeToJpeg(bytes: Buffer, maxLongEdge: number): Promise<Buffer> {
  let sharpMod: typeof Sharp.default
  try {
    sharpMod = (await import("sharp")).default as unknown as typeof Sharp.default
  } catch (e) {
    if (isMissingModuleError(e)) {
      throw new PptfastError(`Resizing stock photos requires the optional dependency "sharp" (npm i sharp)`)
    }
    throw e
  }
  const image = sharpMod(bytes)
  const meta = await image.metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  const long = Math.max(width, height)
  const pipeline = long > maxLongEdge ? (width >= height ? image.resize({ width: maxLongEdge }) : image.resize({ height: maxLongEdge })) : image
  return pipeline.jpeg({ quality: 85 }).toBuffer()
}

async function toJpeg(
  bytes: Buffer,
  apiLongEdge: number | undefined,
  resize: ResizeToJpeg,
): Promise<Buffer> {
  const format = sniffImageFormat(bytes)
  if (format === null) {
    throw new PptfastError("downloaded bytes are not a recognized image (png/jpeg/gif/webp)")
  }
  if (format === "jpeg" && apiLongEdge !== undefined && apiLongEdge <= MAX_LONG_EDGE) {
    return bytes
  }
  return resize(bytes, MAX_LONG_EDGE)
}

interface PhotoMeta {
  author: string
  pageUrl: string
  license: string
  downloadUrl: string
  fallbackUrl?: string
  width?: number
  height?: number
}

async function loadPexelsPhoto(photoId: string, apiKey: string, fetchImpl: FetchImpl, secrets: string[]): Promise<PhotoMeta> {
  const url = `https://api.pexels.com/v1/photos/${encodeURIComponent(photoId)}`
  const json = await fetchJson(url, { headers: pexelsHeaders(apiKey) }, fetchImpl, secrets)
  const photo = asRecord(json)
  if (!photo) throw new PptfastError(`Pexels photo ${photoId} was not found`)
  const src = asRecord(photo.src) ?? {}
  const original = asString(src.original)
  const large2x = asString(src.large2x)
  const downloadUrl = original ?? large2x
  if (!downloadUrl) throw new PptfastError(`Pexels photo ${photoId} has no download URL`)
  const author = asString(photo.photographer) ?? "unknown"
  return {
    author,
    pageUrl: asString(photo.url) ?? `https://www.pexels.com/photo/${photoId}/`,
    license: "Pexels License",
    downloadUrl,
    fallbackUrl: original ? large2x : undefined,
    width: asNumber(photo.width),
    height: asNumber(photo.height),
  }
}

async function loadPixabayPhoto(photoId: string, apiKey: string, fetchImpl: FetchImpl, secrets: string[]): Promise<PhotoMeta> {
  const url = new URL("https://pixabay.com/api/")
  url.searchParams.set("key", apiKey)
  url.searchParams.set("id", photoId)
  const json = await fetchJson(url.toString(), { headers: { "User-Agent": userAgent() } }, fetchImpl, secrets)
  const hits = parsePixabayHits(json)
  const hit = hits[0]
  const root = asRecord(json)
  const rawHits = Array.isArray(root?.hits) ? root.hits : []
  const raw = asRecord(rawHits[0])
  const downloadUrl = asString(raw?.largeImageURL)
  if (!hit || !downloadUrl) throw new PptfastError(`Pixabay photo ${photoId} was not found`)
  return {
    author: hit.author,
    pageUrl: hit.pageUrl,
    license: "Pixabay License",
    downloadUrl,
    width: hit.width,
    height: hit.height,
  }
}

async function readSidecar(path: string): Promise<StockSidecar | null> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown
    const rec = asRecord(raw)
    if (!rec) return null
    const provider = rec.provider === "pexels" || rec.provider === "pixabay" ? rec.provider : null
    const photoId = asString(rec.photo_id)
    if (!provider || !photoId) return null
    return {
      provider,
      photo_id: photoId,
      license: asString(rec.license) ?? "",
      author: asString(rec.author) ?? "",
      page_url: asString(rec.page_url) ?? "",
      query: asString(rec.query),
      downloaded_at: asString(rec.downloaded_at) ?? "",
    }
  } catch {
    return null
  }
}

export async function runImagesFetch(ref: string, opts: ImagesFetchOptions): Promise<string> {
  const { provider, photoId } = parsePhotoRef(ref)
  assertSafeFileSegment(opts.as, "asset id")
  const cwd = opts.cwd ?? process.cwd()
  const env = opts.env ?? process.env
  const keys = await loadKeys(env)
  const secrets = [keys.pexels.apiKey, keys.pixabay.apiKey].filter((k): k is string => typeof k === "string" && k.length >= 6)
  const apiKey = keys[provider].apiKey
  if (!apiKey) throw missingKeysError(provider === "pexels" ? "pexels" : "pixabay")

  const { assetsDir } = await resolveDeckWorkspace(opts.deck, cwd)
  const jpgPath = join(assetsDir, `${opts.as}.jpg`)
  const jsonPath = join(assetsDir, `${opts.as}.json`)
  if ((await pathExists(jpgPath)) && (await pathExists(jsonPath))) {
    const existing = await readSidecar(jsonPath)
    if (existing && existing.photo_id === photoId && existing.provider === provider) {
      return `already pinned ${provider}:${photoId} as ${opts.as} — skipped`
    }
  }

  const fetchImpl = opts.fetch ?? globalThis.fetch
  const meta =
    provider === "pexels"
      ? await loadPexelsPhoto(photoId, apiKey, fetchImpl, secrets)
      : await loadPixabayPhoto(photoId, apiKey, fetchImpl, secrets)

  let bytes: Buffer
  try {
    bytes = await downloadBytes(meta.downloadUrl, fetchImpl, secrets)
  } catch (e) {
    if (meta.fallbackUrl) {
      bytes = await downloadBytes(meta.fallbackUrl, fetchImpl, secrets)
    } else {
      throw e
    }
  }

  const apiLong = meta.width !== undefined && meta.height !== undefined ? Math.max(meta.width, meta.height) : undefined
  const resize = opts.resizeToJpeg ?? defaultResizeToJpeg
  const jpeg = await toJpeg(bytes, apiLong, resize)

  await mkdir(assetsDir, { recursive: true })
  await writeFile(jpgPath, jpeg)
  const sidecar: StockSidecar = {
    provider,
    photo_id: photoId,
    license: meta.license,
    author: meta.author,
    page_url: meta.pageUrl,
    downloaded_at: (opts.now ?? (() => new Date()))().toISOString(),
  }
  if (opts.query) sidecar.query = opts.query
  const json = JSON.stringify(sidecar, null, 2) + "\n"
  if (/"apiKey"\s*:/.test(json) || /"key"\s*:/.test(json)) {
    throw new PptfastError("internal error: sidecar would have contained a key field")
  }
  await writeFile(jsonPath, json)
  return `pinned ${provider}:${photoId} as ${opts.as} → ${jpgPath}`
}

export async function runImagesList(opts: ImagesListOptions): Promise<string> {
  const cwd = opts.cwd ?? process.cwd()
  const { assetsDir } = await resolveDeckWorkspace(opts.deck, cwd)
  let names: string[]
  try {
    names = (await readdir(assetsDir)).filter((n) => n.endsWith(".json") && !n.startsWith(".")).sort()
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return "No pinned stock photos."
    throw e
  }
  const lines: string[] = []
  for (const name of names) {
    const sidecar = await readSidecar(join(assetsDir, name))
    if (!sidecar) continue
    const assetId = name.slice(0, -".json".length)
    lines.push(`${assetId}  ${sidecar.provider}:${sidecar.photo_id}  ${sidecar.author}  ${sidecar.page_url}`)
  }
  return lines.length === 0 ? "No pinned stock photos." : lines.join("\n")
}
