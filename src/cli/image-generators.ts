/**
 * Local image-generator probe and adapters (grok / codex / antigravity).
 * Detection looks up binaries on PATH and optionally runs `--version`.
 * Generation is invoked through an injected {@link ProcessRunner} so tests
 * never spawn the real CLIs.
 */
import { execFile } from "node:child_process"
import { constants } from "node:fs"
import { access, copyFile, readdir, stat } from "node:fs/promises"
import { delimiter, join } from "node:path"
import { PptfastError } from "../errors"
import { sniffImageFormat } from "../ir/asset-sniff"
import { GENERATOR_IDS, type GeneratorId } from "./image-config"

export const GENERATOR_PROBE_TIMEOUT_MS = 2000

export interface ProcessRun {
  command: string
  args: string[]
  cwd?: string
  timeoutMs: number
  env?: NodeJS.ProcessEnv
}
export type ProcessRunner = (req: ProcessRun) => Promise<{ code: number; stdout: string; stderr: string }>

export interface GeneratorProbe {
  id: GeneratorId
  found: boolean
  bin: string | null
  version: string | null
  enabled: boolean
}

export interface AdapterRequest {
  bin: string
  workdir: string
  dest: string
  prompt: string
  timeoutMs: number
  run: ProcessRunner
}

const BIN_NAMES: Record<GeneratorId, readonly string[]> = {
  grok: ["grok"],
  codex: ["codex"],
  antigravity: ["antigravity", "agy"],
}

export async function findOnPath(bin: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const dirs = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean)
  const names =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").map((ext) => bin + ext.toLowerCase())
      : [bin]
  for (const dir of dirs) {
    for (const name of names) {
      const full = join(dir, name)
      try {
        await access(full, constants.X_OK)
        return full
      } catch {
        // not here
      }
    }
  }
  return null
}

export async function locateGeneratorBin(id: GeneratorId, env: NodeJS.ProcessEnv): Promise<string | null> {
  for (const name of BIN_NAMES[id]) {
    const found = await findOnPath(name, env)
    if (found) return found
  }
  return null
}

export function parseGeneratorVersion(stdout: string): string {
  const line = stdout.trim().split("\n")[0] ?? ""
  const m = /(\d+\.\d+\.\d+\S*)/.exec(line)
  return m?.[1] ?? line
}

export async function defaultProcessRunner(req: ProcessRun): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      req.command,
      req.args,
      {
        cwd: req.cwd,
        timeout: req.timeoutMs,
        env: req.env,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as NodeJS.ErrnoException & { killed?: boolean; code?: string | number }
          if (err.killed) {
            reject(new PptfastError(`image generator timed out after ${req.timeoutMs}ms`))
            return
          }
          const code = typeof err.code === "number" ? err.code : 1
          resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" })
          return
        }
        resolve({ code: 0, stdout: stdout ?? "", stderr: stderr ?? "" })
      },
    )
  })
}

export async function probeGenerators(opts: {
  env?: NodeJS.ProcessEnv
  run?: ProcessRunner
  enabled: Record<GeneratorId, boolean>
}): Promise<GeneratorProbe[]> {
  const env = opts.env ?? process.env
  const run = opts.run ?? defaultProcessRunner
  const probes: GeneratorProbe[] = []
  for (const id of GENERATOR_IDS) {
    const bin = await locateGeneratorBin(id, env)
    let version: string | null = null
    if (bin) {
      try {
        const result = await run({ command: bin, args: ["--version"], cwd: undefined, timeoutMs: GENERATOR_PROBE_TIMEOUT_MS, env })
        if (result.code === 0) version = parseGeneratorVersion(result.stdout)
      } catch {
        version = null
      }
    }
    probes.push({ id, found: bin !== null, bin, version, enabled: opts.enabled[id] === true })
  }
  return probes
}

function destContractPrompt(userPrompt: string, destAbs: string, toolName: string): string {
  return [
    `Generate exactly one image with the ${toolName} tool using this prompt:`,
    userPrompt,
    `Then copy or move the saved file to ${destAbs} so that path exists as a real image file.`,
    "Print DONE when that path exists. Edit no other files.",
  ].join("\n")
}

async function isSniffedImage(path: string): Promise<boolean> {
  try {
    const { readFile } = await import("node:fs/promises")
    const bytes = await readFile(path)
    return sniffImageFormat(bytes) !== null
  } catch {
    return false
  }
}

async function collectFiles(dir: string, acc: { path: string; mtime: number }[]): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(full, acc)
    } else if (entry.isFile()) {
      try {
        const st = await stat(full)
        acc.push({ path: full, mtime: st.mtimeMs })
      } catch {
        // skip
      }
    }
  }
}

async function harvestNewestImage(workdir: string, dest: string): Promise<boolean> {
  const files: { path: string; mtime: number }[] = []
  await collectFiles(workdir, files)
  const images: { path: string; mtime: number }[] = []
  for (const file of files) {
    if (file.path === dest) continue
    if (await isSniffedImage(file.path)) images.push(file)
  }
  images.sort((a, b) => b.mtime - a.mtime)
  const newest = images[0]
  if (!newest) return false
  await copyFile(newest.path, dest)
  return isSniffedImage(dest)
}

async function settleDest(req: AdapterRequest, result: { code: number; stdout: string; stderr: string }): Promise<void> {
  if (await isSniffedImage(req.dest)) return
  if (await harvestNewestImage(req.workdir, req.dest)) return
  const detail = (result.stderr || result.stdout).trim().slice(0, 400)
  throw new PptfastError(
    result.code === 0
      ? `produced no image file at ${req.dest}${detail ? `: ${detail}` : ""}`
      : `exited ${result.code}${detail ? `: ${detail}` : ""}`,
  )
}

export async function runGrokAdapter(req: AdapterRequest): Promise<void> {
  const result = await req.run({
    command: req.bin,
    args: [
      "-p",
      destContractPrompt(req.prompt, req.dest, "image_gen"),
      "--cwd",
      req.workdir,
      "--permission-mode",
      "bypassPermissions",
      "--max-turns",
      "12",
    ],
    cwd: req.workdir,
    timeoutMs: req.timeoutMs,
  })
  await settleDest(req, result)
}

export async function runCodexAdapter(req: AdapterRequest): Promise<void> {
  const result = await req.run({
    command: req.bin,
    args: [
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      "--skip-git-repo-check",
      "--ephemeral",
      "-C",
      req.workdir,
      destContractPrompt(req.prompt, req.dest, "image_gen__imagegen"),
    ],
    cwd: req.workdir,
    timeoutMs: req.timeoutMs,
  })
  await settleDest(req, result)
}

export async function runAntigravityAdapter(req: AdapterRequest): Promise<void> {
  const seconds = Math.max(1, Math.ceil(req.timeoutMs / 1000))
  const result = await req.run({
    command: req.bin,
    args: [
      "-p",
      destContractPrompt(req.prompt, req.dest, "generate_image"),
      "--dangerously-skip-permissions",
      "--print-timeout",
      `${seconds}s`,
    ],
    cwd: req.workdir,
    timeoutMs: req.timeoutMs,
  })
  await settleDest(req, result)
}

export const GENERATOR_ADAPTERS: Record<GeneratorId, (req: AdapterRequest) => Promise<void>> = {
  grok: runGrokAdapter,
  codex: runCodexAdapter,
  antigravity: runAntigravityAdapter,
}
