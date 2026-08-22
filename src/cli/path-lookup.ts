import { constants } from "node:fs"
import { access as fsAccess } from "node:fs/promises"
import { delimiter as defaultDelimiter, join as defaultJoin } from "node:path"

const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD"

/** Case-insensitive env lookup (Windows names fold, POSIX usually does not). */
export function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const upper = name.toUpperCase()
  for (const [key, value] of Object.entries(env)) {
    if (key.toUpperCase() === upper) return value
  }
  return undefined
}

export interface FindOnPathDeps {
  platform?: NodeJS.Platform
  join?: (...parts: string[]) => string
  delimiter?: string
  access?: (target: string, mode?: number) => Promise<void>
}

/**
 * First executable named `bin` on PATH, or null. On Windows, PATHEXT
 * extensions are tried before the bare name so an npm POSIX shim cannot
 * hide the real `.cmd` (#30).
 */
export async function findOnPath(
  bin: string,
  env: NodeJS.ProcessEnv,
  deps: FindOnPathDeps = {},
): Promise<string | null> {
  const platform = deps.platform ?? process.platform
  const join = deps.join ?? defaultJoin
  const delimiter = deps.delimiter ?? defaultDelimiter
  const tryAccess = deps.access ?? ((target: string, mode?: number) => fsAccess(target, mode))
  const dirs = (envValue(env, "PATH") ?? "").split(delimiter).filter(Boolean)
  const suffixes =
    platform === "win32"
      ? [...(envValue(env, "PATHEXT") ?? DEFAULT_PATHEXT).split(";").map((ext) => ext.trim()).filter(Boolean), ""]
      : [""]
  for (const dir of dirs) {
    for (const suffix of suffixes) {
      const full = join(dir, `${bin}${suffix}`)
      try {
        await tryAccess(full, constants.X_OK)
        return full
      } catch {
        // not here
      }
    }
  }
  return null
}
