import { PptfastError } from "../errors"
import { findUserConfig } from "./config"
import { userConfigPath } from "./home"
import {
  GENERATOR_IDS,
  maskKey,
  parseCliConfigKey,
  parseCliConfigValue,
  persistUserConfigValue,
  resolveGenerators,
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
  const stored = parseCliConfigValue(parsed, resolved)
  const path = await persistUserConfigValue(parsed.path, stored)
  return `Saved ${key} to ${path}`
}

export async function runConfigShow(opts: { env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  const path = userConfigPath()
  const hit = await findUserConfig()
  const file = hit?.config ?? null
  const keys = resolveImageKeys({ file, env: opts.env ?? process.env })
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

  const gens = resolveGenerators({ file })
  lines.push("")
  for (const id of GENERATOR_IDS) {
    lines.push(`images.generators.${id}.enabled  ${gens.enabled[id] ? "true" : "false"}`)
  }
  const rawGens = file?.images?.generators
  if (rawGens?.order) lines.push(`images.generators.order  ${rawGens.order.join(",")}`)
  if (rawGens?.timeoutMs !== undefined) lines.push(`images.generators.timeoutMs  ${rawGens.timeoutMs}`)
  return lines.join("\n")
}
