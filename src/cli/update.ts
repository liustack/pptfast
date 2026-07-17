// Ported from markpress src/update.ts (same author), minus its playwright
// post-install step — pptfast has no browser dependency to refresh.
import { execFile } from "node:child_process"

export const PACKAGE_NAME = "@liustack/pptfast"

export interface UpdateInfo {
  packageName: string
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  checked: boolean
  error?: string
}

export interface SelfUpdateResult extends UpdateInfo {
  updated: boolean
}

export type CommandRunner = (command: string, args: string[]) => Promise<string>

function normalizeVersion(version: string): string {
  const normalized = version.trim().replace(/^v/i, "").split("-")[0]
  if (!normalized) throw new Error(`invalid version: ${version}`)
  return normalized
}

function parseVersion(version: string): number[] {
  return normalizeVersion(version)
    .split(".")
    .map((segment) => {
      const value = Number.parseInt(segment, 10)
      if (!Number.isFinite(value)) throw new Error(`invalid version segment: ${segment}`)
      return value
    })
}

export function compareVersions(left: string, right: string): number {
  const l = parseVersion(left)
  const r = parseVersion(right)
  for (let i = 0; i < Math.max(l.length, r.length); i++) {
    const a = l[i] ?? 0
    const b = r[i] ?? 0
    if (a !== b) return a < b ? -1 : 1
  }
  return 0
}

export const runCommand: CommandRunner = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
        return
      }
      resolve(stdout.trim())
    })
  })

export interface CheckForUpdateOptions {
  currentVersion: string
  packageName?: string
  run?: CommandRunner
}

/** Never throws — an unreachable registry reports { checked: false, error }. */
export async function checkForUpdate({
  currentVersion,
  packageName = PACKAGE_NAME,
  run = runCommand,
}: CheckForUpdateOptions): Promise<UpdateInfo> {
  const current = normalizeVersion(currentVersion)
  try {
    const latest = normalizeVersion(await run("npm", ["view", packageName, "version"]))
    return {
      packageName,
      currentVersion: current,
      latestVersion: latest,
      updateAvailable: compareVersions(current, latest) < 0,
      checked: true,
    }
  } catch (error) {
    return {
      packageName,
      currentVersion: current,
      latestVersion: null,
      updateAvailable: false,
      checked: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function createSelfUpdater(run: CommandRunner = runCommand) {
  return async ({
    currentVersion,
    packageName = PACKAGE_NAME,
  }: {
    currentVersion: string
    packageName?: string
  }): Promise<SelfUpdateResult> => {
    const info = await checkForUpdate({ currentVersion, packageName, run })
    if (!info.checked) throw new Error(`unable to check for updates: ${info.error ?? "unknown error"}`)
    if (!info.updateAvailable) return { ...info, updated: false }
    await run("npm", ["install", "-g", `${packageName}@latest`])
    return { ...info, updated: true }
  }
}
