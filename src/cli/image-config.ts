/**
 * User-level stock-image credentials. Stored in `$PPTFAST_HOME/config.json`
 * under `images`, never in a project `pptfast.config.json`. Whole-source
 * per provider: if the file names `images.pexels` (even as `{}`), the env
 * var is ignored for Pexels. Same for Pixabay and Openverse. Never mix
 * env + file for one provider.
 */
import { chmodSync, lstatSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { z } from "zod"
import { PptfastError } from "../errors"
import { pptfastHome, userConfigPath } from "./home"

export const PEXELS_ENV = "PPTFAST_PEXELS_API_KEY"
export const PIXABAY_ENV = "PPTFAST_PIXABAY_API_KEY"
export const OPENVERSE_CLIENT_ID_ENV = "PPTFAST_OPENVERSE_CLIENT_ID"
export const OPENVERSE_CLIENT_SECRET_ENV = "PPTFAST_OPENVERSE_CLIENT_SECRET"

export const ImageProviderConfigSchema = z
  .object({
    apiKey: z.string().optional(),
  })
  .strict()

export const OpenverseConfigSchema = z
  .object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
  })
  .strict()

export const ImagesConfigSchema = z
  .object({
    pexels: ImageProviderConfigSchema.optional(),
    pixabay: ImageProviderConfigSchema.optional(),
    openverse: OpenverseConfigSchema.optional(),
  })
  .strict()

export type ImageApiKeyProviderId = "pexels" | "pixabay"
export type ImageProviderId = ImageApiKeyProviderId | "openverse"
export type KeySource = "file" | "env"

export interface ImageUserConfig {
  images?: {
    pexels?: { apiKey?: string }
    pixabay?: { apiKey?: string }
    openverse?: { clientId?: string; clientSecret?: string }
  }
}

export interface ResolvedImageKey {
  apiKey: string | undefined
  source: KeySource | null
  namedInFile: boolean
}

export interface ResolvedOpenverse {
  clientId: string | undefined
  clientSecret: string | undefined
  source: KeySource | null
  namedInFile: boolean
  /** Both clientId and clientSecret resolved from the same source. */
  ready: boolean
}

export interface ResolvedImageKeys {
  pexels: ResolvedImageKey
  pixabay: ResolvedImageKey
  openverse: ResolvedOpenverse
}

export type PersistableConfigValue = string | boolean | number | string[]

const API_KEY_PROVIDERS: ImageApiKeyProviderId[] = ["pexels", "pixabay"]
const ENV_BY_PROVIDER: Record<ImageApiKeyProviderId, string> = {
  pexels: PEXELS_ENV,
  pixabay: PIXABAY_ENV,
}

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"])

export interface CliConfigKey {
  cliKey: string
  path: string[]
  omitValue: boolean
  secret: boolean
}

const CLI_KEYS: Record<string, CliConfigKey> = {
  "pexels.apiKey": { cliKey: "pexels.apiKey", path: ["images", "pexels", "apiKey"], omitValue: true, secret: true },
  "pixabay.apiKey": { cliKey: "pixabay.apiKey", path: ["images", "pixabay", "apiKey"], omitValue: true, secret: true },
  "openverse.clientId": {
    cliKey: "openverse.clientId",
    path: ["images", "openverse", "clientId"],
    omitValue: false,
    secret: true,
  },
  "openverse.clientSecret": {
    cliKey: "openverse.clientSecret",
    path: ["images", "openverse", "clientSecret"],
    omitValue: true,
    secret: true,
  },
}

export function maskKey(value: string): string {
  if (value.length <= 8) return "****"
  return `${value.slice(0, 6)}...${value.slice(-2)}`
}

export function assertSafeConfigKeyPath(key: string): void {
  for (const segment of key.split(".")) {
    if (FORBIDDEN_SEGMENTS.has(segment)) {
      throw new PptfastError(`refusing to set "${key}": "${segment}" is not a valid config key`)
    }
  }
}

export function parseCliConfigKey(key: string): CliConfigKey {
  assertSafeConfigKeyPath(key)
  const hit = CLI_KEYS[key]
  if (!hit) {
    throw new PptfastError(
      `unknown config key "${key}" — expected pexels.apiKey, pixabay.apiKey, openverse.clientId, or openverse.clientSecret`,
    )
  }
  return hit
}

export function providerNamedInFile(file: ImageUserConfig | null | undefined, provider: ImageProviderId): boolean {
  return file?.images?.[provider] !== undefined
}

function nonempty(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined
}

function resolveOne(
  file: ImageUserConfig | null | undefined,
  env: NodeJS.ProcessEnv,
  provider: ImageApiKeyProviderId,
): ResolvedImageKey {
  const namedInFile = providerNamedInFile(file, provider)
  if (namedInFile) {
    const apiKey = nonempty(file?.images?.[provider]?.apiKey)
    return { apiKey, source: apiKey ? "file" : null, namedInFile: true }
  }
  const apiKey = nonempty(env[ENV_BY_PROVIDER[provider]])
  return { apiKey, source: apiKey ? "env" : null, namedInFile: false }
}

function resolveOpenverse(file: ImageUserConfig | null | undefined, env: NodeJS.ProcessEnv): ResolvedOpenverse {
  const namedInFile = providerNamedInFile(file, "openverse")
  if (namedInFile) {
    const clientId = nonempty(file?.images?.openverse?.clientId)
    const clientSecret = nonempty(file?.images?.openverse?.clientSecret)
    const ready = Boolean(clientId && clientSecret)
    return { clientId, clientSecret, source: ready ? "file" : null, namedInFile: true, ready }
  }
  const clientId = nonempty(env[OPENVERSE_CLIENT_ID_ENV])
  const clientSecret = nonempty(env[OPENVERSE_CLIENT_SECRET_ENV])
  const ready = Boolean(clientId && clientSecret)
  return { clientId, clientSecret, source: ready ? "env" : null, namedInFile: false, ready }
}

export function resolveImageKeys(opts: { file?: ImageUserConfig | null; env?: NodeJS.ProcessEnv } = {}): ResolvedImageKeys {
  const file = opts.file ?? null
  const env = opts.env ?? process.env
  return {
    pexels: resolveOne(file, env, "pexels"),
    pixabay: resolveOne(file, env, "pixabay"),
    openverse: resolveOpenverse(file, env),
  }
}

export function knownSecretsFrom(keys: ResolvedImageKeys): string[] {
  const secrets: string[] = []
  for (const provider of API_KEY_PROVIDERS) {
    const apiKey = keys[provider].apiKey
    if (apiKey && apiKey.length >= 6) secrets.push(apiKey)
  }
  const { clientId, clientSecret } = keys.openverse
  if (clientSecret && clientSecret.length >= 6) secrets.push(clientSecret)
  if (clientId && clientId.length >= 6) secrets.push(clientId)
  return secrets
}

function assertNotSymlink(path: string): void {
  let st: ReturnType<typeof lstatSync>
  try {
    st = lstatSync(path)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return
    throw e
  }
  if (st.isSymbolicLink()) {
    throw new PptfastError(`refusing to write ${path}: it is a symlink`)
  }
}

function asPlainObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) }
  }
  return {}
}

async function readRawUserConfig(): Promise<Record<string, unknown>> {
  const path = userConfigPath()
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw e
  }
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch (e) {
    throw new PptfastError(`${path} is not valid JSON: ${(e as Error).message}`)
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PptfastError(`${path} must be a JSON object`)
  }
  return raw as Record<string, unknown>
}

export async function persistUserConfigValue(path: string[], value: PersistableConfigValue | ""): Promise<string> {
  for (const segment of path) {
    if (FORBIDDEN_SEGMENTS.has(segment) || segment === "") {
      throw new PptfastError(`refusing to set "${path.join(".")}": "${segment}" is not a valid config key`)
    }
  }
  if (path.length === 0) {
    throw new PptfastError("refusing to set an empty config path")
  }
  const filePath = userConfigPath()
  assertNotSymlink(filePath)
  const raw = await readRawUserConfig()
  let cursor: Record<string, unknown> = raw
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]!
    const next = asPlainObject(cursor[segment])
    cursor[segment] = next
    cursor = next
  }
  const leaf = path[path.length - 1]!
  if (value === "") {
    delete cursor[leaf]
  } else {
    cursor[leaf] = value
  }
  await mkdir(pptfastHome(), { recursive: true })
  const text = JSON.stringify(raw, null, 2) + "\n"
  await writeFile(filePath, text, { encoding: "utf8", mode: 0o600 })
  try {
    chmodSync(filePath, 0o600)
  } catch {
    // platforms without POSIX permission bits
  }
  return filePath
}

export async function persistImageApiKey(provider: ImageApiKeyProviderId, apiKey: string): Promise<string> {
  return persistUserConfigValue(["images", provider, "apiKey"], apiKey)
}

export function pexelsApplyUrl(): string {
  return "https://www.pexels.com/api/"
}

export function pixabayApplyUrl(): string {
  return "https://pixabay.com/api/docs/"
}

/** Hard-fail copy when fetch needs a Pexels or Pixabay key that is missing. */
export function missingKeysError(kind: "pexels" | "pixabay"): PptfastError {
  if (kind === "pixabay") {
    return new PptfastError(
      `Pixabay is not configured. Apply at ${pixabayApplyUrl()}, then run \`pptfast config set pixabay.apiKey\`.`,
    )
  }
  return new PptfastError(
    `Stock-photo search needs a Pexels API key. Apply at ${pexelsApplyUrl()}, then run \`pptfast config set pexels.apiKey\`.`,
  )
}
