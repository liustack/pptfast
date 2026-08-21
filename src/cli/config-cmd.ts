import { PptfastError } from "../errors"
import { findUserConfig } from "./config"
import { userConfigPath } from "./home"
import { maskKey, parseCliImageKey, persistImageApiKey, resolveImageKeys, type ImageProviderId } from "./image-config"
import { readSecret, type SecretInputIo } from "./secret-input"

export interface ConfigSetOptions {
  readSecret?: (prompt: string, io?: SecretInputIo) => Promise<string>
  io?: SecretInputIo
}

export async function runConfigSet(key: string, value: string | undefined, opts: ConfigSetOptions = {}): Promise<string> {
  if (value === undefined && !key.endsWith(".apiKey")) {
    throw new PptfastError(`${key} needs a value: pptfast config set ${key} <value>`)
  }
  const { provider } = parseCliImageKey(key)
  let resolved = value
  if (resolved === undefined) {
    const read = opts.readSecret ?? readSecret
    resolved = await read(`${key} (input hidden): `, opts.io)
  }
  const path = await persistImageApiKey(provider, resolved)
  return `Saved ${key} to ${path}`
}

const SHOW_ORDER: ImageProviderId[] = ["pexels", "pixabay"]

export async function runConfigShow(opts: { env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  const path = userConfigPath()
  const hit = await findUserConfig()
  const keys = resolveImageKeys({ file: hit?.config ?? null, env: opts.env ?? process.env })
  const lines = [`User config: ${path}`, ""]
  for (const provider of SHOW_ORDER) {
    const label = `${provider}.apiKey`
    const entry = keys[provider]
    if (!entry.apiKey) {
      lines.push(`${label}  missing`)
      continue
    }
    const src = entry.source === null ? "" : ` (${entry.source})`
    lines.push(`${label}  ${maskKey(entry.apiKey)}${src}`)
  }
  return lines.join("\n")
}
