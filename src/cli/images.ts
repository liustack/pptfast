/**
 * `pptfast images search|fetch|list|generate` — Pexels first, Pixabay as
 * empty-result fallback, then Openverse (cc0/pdm). Local generators pin
 * through the same sidecar path. Inject `fetch` / `resizeToJpeg` / `run`
 * so tests never touch the network or spawn real CLIs.
 */
import { mkdir, mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { PptfastError } from "../errors"
import { sniffImageFormat } from "../ir/asset-sniff"
import { isMissingModuleError } from "../platform/node"
import { buildAssetBrief } from "../svg/asset-brief"
import { VERSION } from "../version"
import type * as Sharp from "sharp"
import { loadValidatedDeckIr } from "./commands"
import { findConfig, findUserConfig } from "./config"
import { assertSafeFileSegment, ASSETS_DIRNAME, isDeckDirectory, pathExists, resolveDeckTarget } from "./deck-dir"
import {
  GENERATOR_IDS,
  knownSecretsFrom,
  missingKeysError,
  resolveGenerators,
  resolveImageKeys,
  type GeneratorId,
  type ImageProviderId,
  type ResolvedImageKeys,
} from "./image-config"
import {
  defaultProcessRunner,
  GENERATOR_ADAPTERS,
  locateGeneratorBin,
  type ProcessRunner,
} from "./image-generators"
import { defaultSleep, loadOpenverseDetail, searchOpenverse, type SleepFn } from "./image-openverse"
import { redactSecrets } from "./redact"
import { resolveWorkspaceLocation, type WorkspaceLocation } from "./workspace"

export type { ProcessRun, ProcessRunner } from "./image-generators"

export const BYTE_CAP = 15 * 1024 * 1024
export const MAX_LONG_EDGE = 1920
const PER_PAGE = 8

export type ResizeToJpeg = (bytes: Buffer, maxLongEdge: number) => Promise<Buffer>

export interface StockSidecar {
  provider: ImageProviderId
  photo_id?: string
  license: string
  author?: string
  page_url?: string
  attribution?: string
  source?: string
  query?: string
  prompt?: string
  downloaded_at?: string
  generated_at?: string
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
  source?: string
}

export interface ImagesSearchOptions {
  orientation?: string
  color?: string
  minWidth?: number
  minHeight?: number
  fetch?: typeof fetch
  env?: NodeJS.ProcessEnv
  sleep?: SleepFn
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
  sleep?: SleepFn
}

export interface ImagesListOptions {
  deck: string
  cwd?: string
}

export interface ImagesGenerateOptions {
  deck: string
  as: string
  prompt?: string
  cwd?: string
  env?: NodeJS.ProcessEnv
  run?: ProcessRunner
  resolvePrompt?: (opts: { deck: string; as: string; cwd: string }) => Promise<string | undefined>
  resizeToJpeg?: ResizeToJpeg
  now?: () => Date
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
    .map((hit) => {
      const thumb = hit.thumb ? `\n  ${hit.thumb}` : ""
      const source = hit.source ? `  ${hit.source}` : ""
      return `${hit.id}  ${hit.width}x${hit.height}  ${hit.author}  ${hit.license}${source}${thumb}\n  ${hit.attribution}\n  ${hit.pageUrl}`
    })
    .join("\n")
}

function openverseNotes(anonymous: boolean, pixabaySkipped: boolean): string[] {
  const lines = ["Openverse does not verify individual licenses. Results are filtered to cc0/pdm."]
  if (anonymous) {
    lines.push(
      "Anonymous Openverse quota is very low. Set credentials with `pptfast config set openverse.clientId` and `pptfast config set openverse.clientSecret`.",
    )
  }
  if (pixabaySkipped) {
    lines.push("Pixabay is unconfigured — pptfast config set pixabay.apiKey")
  }
  return lines
}

export async function runImagesSearch(query: string, opts: ImagesSearchOptions = {}): Promise<string> {
  const q = query.trim()
  if (q === "") throw new PptfastError("search query must not be empty")
  const env = opts.env ?? process.env
  const keys = await loadKeys(env)
  const secrets = knownSecretsFrom(keys)
  const fetchImpl = opts.fetch ?? globalThis.fetch
  const sleep = opts.sleep ?? defaultSleep

  if (keys.pexels.apiKey) {
    const pexelsHits = await searchPexels(q, keys.pexels.apiKey, opts, fetchImpl, secrets)
    if (pexelsHits.length > 0) return formatHits(pexelsHits)
  }

  if (keys.pixabay.apiKey) {
    const pixabayHits = await searchPixabay(q, keys.pixabay.apiKey, opts, fetchImpl, secrets)
    if (pixabayHits.length > 0) return formatHits(pixabayHits)
  }

  const orientation = parseOrientation(opts.orientation)
  const ovHits = await searchOpenverse({
    query: q,
    orientation,
    minWidth: opts.minWidth,
    minHeight: opts.minHeight,
    clientId: keys.openverse.ready ? keys.openverse.clientId : undefined,
    clientSecret: keys.openverse.ready ? keys.openverse.clientSecret : undefined,
    fetch: fetchImpl,
    secrets,
    sleep,
  })
  const notes = openverseNotes(!keys.openverse.ready, !keys.pixabay.apiKey)
  if (ovHits.length === 0) {
    return ["No photos found.", ...notes].join("\n")
  }
  const hits: SearchHit[] = ovHits.map((hit) => ({
    id: `openverse:${hit.id}`,
    provider: "openverse",
    photoId: hit.id,
    thumb: hit.thumbnail,
    width: hit.width,
    height: hit.height,
    author: hit.creator,
    license: hit.license,
    pageUrl: hit.foreignLandingUrl,
    attribution: hit.attribution,
    source: hit.source,
  }))
  return [...notes, formatHits(hits)].join("\n")
}

type PhotoRefProvider = "pexels" | "pixabay" | "openverse"

function parsePhotoRef(ref: string): { provider: PhotoRefProvider; photoId: string } {
  const m = /^(pexels|pixabay|openverse):(.+)$/.exec(ref.trim())
  if (!m) {
    throw new PptfastError(`invalid photo ref "${ref}" — expected pexels:<id>, pixabay:<id>, or openverse:<id>`)
  }
  const photoId = m[2]!.trim()
  if (photoId === "" || photoId.includes("/") || photoId.includes("\\") || photoId.includes("..")) {
    throw new PptfastError(`invalid photo id in "${ref}"`)
  }
  return { provider: m[1] as PhotoRefProvider, photoId }
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
  attribution?: string
  source?: string
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
    const provider = asString(rec.provider) as ImageProviderId | undefined
    const known =
      provider === "pexels" ||
      provider === "pixabay" ||
      provider === "openverse" ||
      provider === "grok" ||
      provider === "codex" ||
      provider === "antigravity"
    if (!known || !provider) return null
    const photoId = asString(rec.photo_id)
    if ((provider === "pexels" || provider === "pixabay") && !photoId) return null
    return {
      provider,
      photo_id: photoId,
      license: asString(rec.license) ?? "",
      author: asString(rec.author),
      page_url: asString(rec.page_url),
      attribution: asString(rec.attribution),
      source: asString(rec.source),
      query: asString(rec.query),
      prompt: asString(rec.prompt),
      downloaded_at: asString(rec.downloaded_at),
      generated_at: asString(rec.generated_at),
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
  const secrets = knownSecretsFrom(keys)
  if (provider !== "openverse") {
    const apiKey = keys[provider].apiKey
    if (!apiKey) throw missingKeysError(provider)
  }

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
  const sleep = opts.sleep ?? defaultSleep
  let meta: PhotoMeta
  if (provider === "openverse") {
    const hit = await loadOpenverseDetail(
      photoId,
      {
        clientId: keys.openverse.ready ? keys.openverse.clientId : undefined,
        clientSecret: keys.openverse.ready ? keys.openverse.clientSecret : undefined,
      },
      fetchImpl,
      secrets,
      sleep,
    )
    meta = {
      author: hit.creator,
      pageUrl: hit.foreignLandingUrl,
      license: hit.license,
      downloadUrl: hit.url,
      width: hit.width,
      height: hit.height,
      attribution: hit.attribution,
      source: hit.source,
    }
  } else {
    const apiKey = keys[provider].apiKey!
    meta =
      provider === "pexels"
        ? await loadPexelsPhoto(photoId, apiKey, fetchImpl, secrets)
        : await loadPixabayPhoto(photoId, apiKey, fetchImpl, secrets)
  }

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
  if (meta.attribution) sidecar.attribution = meta.attribution
  if (meta.source) sidecar.source = meta.source
  const json = JSON.stringify(sidecar, null, 2) + "\n"
  if (/"apiKey"\s*:/.test(json) || /"key"\s*:/.test(json) || /"clientSecret"\s*:/.test(json)) {
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
    const id = sidecar.photo_id ? `${sidecar.provider}:${sidecar.photo_id}` : sidecar.provider
    const rest = [sidecar.author, sidecar.license, sidecar.page_url ?? sidecar.generated_at].filter(Boolean)
    lines.push(`${assetId}  ${id}  ${rest.join("  ")}`)
  }
  return lines.length === 0 ? "No pinned stock photos." : lines.join("\n")
}

async function writePinnedAsset(
  assetsDir: string,
  assetId: string,
  jpeg: Buffer,
  sidecar: StockSidecar,
): Promise<string> {
  await mkdir(assetsDir, { recursive: true })
  const jpgPath = join(assetsDir, `${assetId}.jpg`)
  const jsonPath = join(assetsDir, `${assetId}.json`)
  const tmpJpg = join(assetsDir, `.${assetId}.jpg.tmp`)
  const tmpJson = join(assetsDir, `.${assetId}.json.tmp`)
  const json = JSON.stringify(sidecar, null, 2) + "\n"
  if (/"apiKey"\s*:/.test(json) || /"key"\s*:/.test(json) || /"clientSecret"\s*:/.test(json)) {
    throw new PptfastError("internal error: sidecar would have contained a key field")
  }
  try {
    await writeFile(tmpJpg, jpeg)
    await writeFile(tmpJson, json)
    await rename(tmpJpg, jpgPath)
    await rename(tmpJson, jsonPath)
  } catch (e) {
    await unlink(tmpJpg).catch(() => undefined)
    await unlink(tmpJson).catch(() => undefined)
    await unlink(jpgPath).catch(() => undefined)
    throw e
  }
  return jpgPath
}

async function defaultResolvePrompt(opts: { deck: string; as: string; cwd: string }): Promise<string | undefined> {
  const ir = await loadValidatedDeckIr(opts.deck, opts.cwd)
  const brief = buildAssetBrief(ir)
  const item = brief.items.find((entry) => entry.asset_id === opts.as && entry.suggested_prompt.trim() !== "")
  return item?.suggested_prompt
}

export async function runImagesGenerate(opts: ImagesGenerateOptions): Promise<string> {
  assertSafeFileSegment(opts.as, "asset id")
  const cwd = opts.cwd ?? process.cwd()
  const env = opts.env ?? process.env
  const hit = await findUserConfig()
  const gens = resolveGenerators({ file: hit?.config ?? null })
  const fromFlag = opts.prompt?.trim()
  const prompt =
    fromFlag && fromFlag !== ""
      ? fromFlag
      : await (opts.resolvePrompt ?? defaultResolvePrompt)({ deck: opts.deck, as: opts.as, cwd })
  if (!prompt) {
    throw new PptfastError(`no prompt for asset "${opts.as}" — pass --prompt`)
  }

  const bins = {} as Record<GeneratorId, string | null>
  for (const id of GENERATOR_IDS) {
    bins[id] = await locateGeneratorBin(id, env)
  }

  const anyEnabled = GENERATOR_IDS.some((id) => gens.enabled[id])
  if (!anyEnabled) {
    const foundDisabled = GENERATOR_IDS.filter((id) => bins[id] !== null)
    if (foundDisabled.length === 0) {
      throw new PptfastError(
        "No image generator is enabled. Looked for grok, codex, antigravity. None were found on PATH.",
      )
    }
    const listed = foundDisabled
      .map((id) => `${id} — pptfast config set images.generators.${id}.enabled true`)
      .join("; ")
    throw new PptfastError(`No image generator is enabled. Found but disabled: ${listed}`)
  }

  const { assetsDir } = await resolveDeckWorkspace(opts.deck, cwd)
  const workdir = await mkdtemp(join(tmpdir(), "pptfast-gen-"))
  const dest = join(workdir, "generated.jpg")
  const run = opts.run ?? defaultProcessRunner
  const attempts: string[] = []
  try {
    for (const id of gens.order) {
      if (!gens.enabled[id]) continue
      const bin = bins[id]
      if (!bin) continue
      try {
        await GENERATOR_ADAPTERS[id]({
          bin,
          workdir,
          dest,
          prompt,
          timeoutMs: gens.timeoutMs,
          run,
        })
        const bytes = await readFile(dest)
        if (sniffImageFormat(bytes) === null) {
          throw new PptfastError("produced bytes that are not a recognized image")
        }
        const resize = opts.resizeToJpeg ?? defaultResizeToJpeg
        const jpeg = await toJpeg(bytes, undefined, resize)
        const sidecar: StockSidecar = {
          provider: id,
          license: "user-generated",
          prompt,
          generated_at: (opts.now ?? (() => new Date()))().toISOString(),
        }
        const pinned = await writePinnedAsset(assetsDir, opts.as, jpeg, sidecar)
        return `pinned ${id} as ${opts.as} → ${pinned}`
      } catch (e) {
        attempts.push(`${id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (attempts.length === 0) {
      throw new PptfastError(
        "No enabled image generator was found on PATH. Looked for grok, codex, antigravity.",
      )
    }
    throw new PptfastError(`All image generators failed: ${attempts.join("; ")}`)
  } finally {
    await rm(workdir, { recursive: true, force: true })
  }
}
