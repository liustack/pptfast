import { PptfastError } from "../errors"
import { findUserConfig } from "./config"
import { userConfigPath } from "./home"
import {
  maskKey,
  parseCliConfigKey,
  persistUserConfigValue,
  resolveImageKeys,
} from "./image-config"
import { readSecret, type SecretInputIo } from "./secret-input"

export interface ConfigSetOptions {
  readSecret?: (prompt: string, io?: SecretInputIo) => Promise<string>
  io?: SecretInputIo
}

function canOmitValue(key: string): boolean {
  return key.endsWith(".apiKey") || key.endsWith(".clientSecret")
}

export async function runConfigSet(key: string, value: string | undefined, opts: ConfigSetOptions = {}): Promise<string> {
  if (value === undefined && !canOmitValue(key)) {
    throw new PptfastError(`${key} needs a value: pptfast config set ${key} <value>`)
  }
  const parsed = parseCliConfigKey(key)
  let resolved = value
  if (resolved === undefined) {
    const read = opts.readSecret ?? readSecret
    resolved = await read(`${key} (input hidden): `, opts.io)
  }
  const path = await persistUserConfigValue(parsed.path, resolved)
  return `Saved ${key} to ${path}`
}

export async function runConfigShow(opts: { env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  const path = userConfigPath()
  const hit = await findUserConfig()
  const keys = resolveImageKeys({ file: hit?.config ?? null, env: opts.env ?? process.env })
  const lines = [`User config: ${path}`, ""]
  for (const provider of ["pexels", "pixabay"] as const) {
    const label = `${provider}.apiKey`
    const entry = keys[provider]
    if (!entry.apiKey) {
      lines.push(`${label}  missing`)
      continue
    }
    const src = entry.source === null ? "" : ` (${entry.source})`
    lines.push(`${label}  ${maskKey(entry.apiKey)}${src}`)
  }
  const ov = keys.openverse
  const ovSrc = ov.source === null ? "" : ` (${ov.source})`
  if (ov.clientId) lines.push(`openverse.clientId  ${maskKey(ov.clientId)}${ovSrc}`)
  else lines.push("openverse.clientId  missing")
  if (ov.clientSecret) lines.push(`openverse.clientSecret  ${maskKey(ov.clientSecret)}${ovSrc}`)
  else lines.push("openverse.clientSecret  missing")
  return lines.join("\n")
}
