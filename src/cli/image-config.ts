/**
 * User-level stock-image API keys. Stored in `$PPTFAST_HOME/config.json`
 * under `images`, never in a project `pptfast.config.json`. Whole-source
 * per provider: if the file names `images.pexels` (even as `{}`), the env
 * var is ignored for Pexels. Same for Pixabay. Never mix env + file for one
 * provider.
 */
import { chmodSync, lstatSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { z } from "zod"
import { PptfastError } from "../errors"
import { pptfastHome, userConfigPath } from "./home"

export const PEXELS_ENV = "PPTFAST_PEXELS_API_KEY"
export const PIXABAY_ENV = "PPTFAST_PIXABAY_API_KEY"

export const ImageProviderConfigSchema = z
  .object({
    apiKey: z.string().optional(),
  })
  .strict()

export const ImagesConfigSchema = z
  .object({
    pexels: ImageProviderConfigSchema.optional(),
    pixabay: ImageProviderConfigSchema.optional(),
  })
  .strict()

export type ImageProviderId = "pexels" | "pixabay"
export type KeySource = "file" | "env"

export interface ImageUserConfig {
  images?: {
    pexels?: { apiKey?: string }
    pixabay?: { apiKey?: string }
  }
}

export interface ResolvedImageKey {
  apiKey: string | undefined
  source: KeySource | null
  namedInFile: boolean
}

export interface ResolvedImageKeys {
  pexels: ResolvedImageKey
  pixabay: ResolvedImageKey
}

const PROVIDERS: ImageProviderId[] = ["pexels", "pixabay"]
const ENV_BY_PROVIDER: Record<ImageProviderId, string> = {
  pexels: PEXELS_ENV,
  pixabay: PIXABAY_ENV,
}

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"])
const CLI_KEYS = new Set(["pexels.apiKey", "pixabay.apiKey"])

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

export function parseCliImageKey(key: string): { provider: ImageProviderId; field: "apiKey" } {
  assertSafeConfigKeyPath(key)
  if (!CLI_KEYS.has(key)) {
    throw new PptfastError(`unknown config key "${key}" — expected pexels.apiKey or pixabay.apiKey`)
  }
  const provider = key.split(".")[0] as ImageProviderId
  return { provider, field: "apiKey" }
}

export function providerNamedInFile(file: ImageUserConfig | null | undefined, provider: ImageProviderId): boolean {
  return file?.images?.[provider] !== undefined
}

function resolveOne(
  file: ImageUserConfig | null | undefined,
  env: NodeJS.ProcessEnv,
  provider: ImageProviderId,
): ResolvedImageKey {
  const namedInFile = providerNamedInFile(file, provider)
  if (namedInFile) {
    const apiKey = file?.images?.[provider]?.apiKey
    const present = typeof apiKey === "string" && apiKey !== ""
    return { apiKey: present ? apiKey : undefined, source: present ? "file" : null, namedInFile: true }
  }
  const fromEnv = env[ENV_BY_PROVIDER[provider]]
  const present = typeof fromEnv === "string" && fromEnv !== ""
  return { apiKey: present ? fromEnv : undefined, source: present ? "env" : null, namedInFile: false }
}

export function resolveImageKeys(opts: { file?: ImageUserConfig | null; env?: NodeJS.ProcessEnv } = {}): ResolvedImageKeys {
  const file = opts.file ?? null
  const env = opts.env ?? process.env
  return {
    pexels: resolveOne(file, env, "pexels"),
    pixabay: resolveOne(file, env, "pixabay"),
  }
}

export function knownSecretsFrom(keys: ResolvedImageKeys): string[] {
  return PROVIDERS.map((p) => keys[p].apiKey).filter((k): k is string => typeof k === "string" && k.length >= 6)
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

export async function persistImageApiKey(provider: ImageProviderId, apiKey: string): Promise<string> {
  const path = userConfigPath()
  assertNotSymlink(path)
  const raw = await readRawUserConfig()
  const images = asPlainObject(raw.images)
  const providerCfg = asPlainObject(images[provider])
  if (apiKey === "") {
    delete providerCfg.apiKey
  } else {
    providerCfg.apiKey = apiKey
  }
  images[provider] = providerCfg
  raw.images = images
  await mkdir(pptfastHome(), { recursive: true })
  const text = JSON.stringify(raw, null, 2) + "\n"
  await writeFile(path, text, { encoding: "utf8", mode: 0o600 })
  try {
    chmodSync(path, 0o600)
  } catch {
    // platforms without POSIX permission bits
  }
  return path
}

export function pexelsApplyUrl(): string {
  return "https://www.pexels.com/api/"
}

export function pixabayApplyUrl(): string {
  return "https://pixabay.com/api/docs/"
}

/** Hard-fail copy when search has no Pexels key (and optionally no keys at all). */
export function missingKeysError(kind: "none" | "pexels" | "pixabay"): PptfastError {
  if (kind === "pixabay") {
    return new PptfastError(
      `Pixabay is not configured. Apply at ${pixabayApplyUrl()}, then run \`pptfast config set pixabay.apiKey\`. Keyless sources are a later version, not this one.`,
    )
  }
  if (kind === "pexels") {
    return new PptfastError(
      `Stock-photo search needs a Pexels API key. Apply at ${pexelsApplyUrl()}, then run \`pptfast config set pexels.apiKey\`. Keyless sources are a later version, not this one.`,
    )
  }
  return new PptfastError(
    `Stock-photo search needs a Pexels API key (Pixabay is an empty-result fallback). Apply at ${pexelsApplyUrl()} and ${pixabayApplyUrl()}, then run \`pptfast config set pexels.apiKey\` and \`pptfast config set pixabay.apiKey\`. Keyless sources are a later version, not this one.`,
  )
}
