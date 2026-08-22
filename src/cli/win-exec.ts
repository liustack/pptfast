/**
 * Windows cannot spawn what POSIX can. npm/pnpm install every JS CLI as a
 * trio (POSIX sh shim, `.cmd`, `.ps1`). A bare `spawn('npm')` is ENOENT.
 * Handing spawn the `.cmd` hits Node's post-CVE-2024-27980 refusal to run
 * batch files without a shell (EINVAL). Wrapping the call in cmd.exe is not
 * open to us: cmd truncates at a raw newline, and image-generator prompts are
 * multi-line. So a `.cmd` is recognised as one of the generator templates
 * and rewritten to a direct spawn. Anything else is refused, loudly.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { envValue, findOnPath } from "./path-lookup"

export interface SpawnPlan {
  command: string
  args: string[]
  env?: NodeJS.ProcessEnv
}

export type Existence = "present" | "directory" | "absent" | "unknown"

export function existenceOf(target: string): Existence {
  try {
    return fs.statSync(target).isDirectory() ? "directory" : "present"
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "absent" : "unknown"
  }
}

export interface ResolveDeps {
  platform: NodeJS.Platform
  readFileSync: (p: string) => string
  resolveOnPath: (bin: string, env: NodeJS.ProcessEnv) => Promise<string | null> | string | null
  existence: (p: string) => Existence
}

const REAL_DEPS: ResolveDeps = {
  platform: process.platform,
  readFileSync: (p) => fs.readFileSync(p, "utf8"),
  resolveOnPath: (bin, env) => findOnPath(bin, env),
  existence: existenceOf,
}

export class UnrecognizedBatchShimError extends Error {
  constructor(command: string) {
    super(
      `Cannot spawn "${command}" as a Windows batch file without a shell. ` +
        "Node refuses to run .cmd/.bat files without a shell (EINVAL after CVE-2024-27980), " +
        "and wrapping the call in cmd.exe would truncate multi-line arguments at the first newline. " +
        "Use a recognised npm/pnpm shim, or spawn the real executable.",
    )
    this.name = "UnrecognizedBatchShimError"
  }
}

interface Recipe {
  command: string
  args: string[]
  env?: NodeJS.ProcessEnv
}

const PATHEXT_EDIT = /^@?SET PATHEXT=%PATHEXT:;\.([A-Z]+);=;%$/
const FLAG = /^--?[A-Za-z0-9][-A-Za-z0-9._]*(?:=[-A-Za-z0-9._/\\:]+)?$/

function withWindowsEnvAssignment(env: NodeJS.ProcessEnv, name: string, value: string): NodeJS.ProcessEnv {
  const upper = name.toUpperCase()
  const next: NodeJS.ProcessEnv = {}
  let replaced = false
  for (const [key, val] of Object.entries(env)) {
    if (key.toUpperCase() === upper) {
      next[key] = value
      replaced = true
    } else {
      next[key] = val
    }
  }
  if (!replaced) next[name] = value
  return next
}

function withoutWindowsEnvVariable(env: NodeJS.ProcessEnv, name: string): NodeJS.ProcessEnv {
  const upper = name.toUpperCase()
  const next: NodeJS.ProcessEnv = {}
  for (const [key, val] of Object.entries(env)) {
    if (key.toUpperCase() !== upper) next[key] = val
  }
  return next
}

function withPathextEdit(env: NodeJS.ProcessEnv, removed: string): NodeJS.ProcessEnv {
  const current = envValue(env, "PATHEXT") ?? ""
  const edited = current.replace(new RegExp(`;\\.${removed};`, "gi"), ";")
  if (edited === "") return withoutWindowsEnvVariable(env, "PATHEXT")
  return withWindowsEnvAssignment(env, "PATHEXT", edited)
}

function isFullyQualifiedLocalPath(target: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(target)
}

function templatePath(text: string, shimDir: string): string | null {
  const rooted = /^%(?:dp0%|~dp0)\\?(.*)$/i.exec(text)
  if (!rooted) {
    return isFullyQualifiedLocalPath(text) && !text.includes("%") ? text : null
  }
  const rest = rooted[1] ?? ""
  if (rest.includes("%") || rest === "") return null
  return path.win32.normalize(path.win32.join(shimDir, rest))
}

function interpreterTail(middle: string, shimDir: string): string[] | null {
  const tokens = middle
    .trim()
    .split(/\s+/)
    .filter((token) => token !== "")
  if (tokens.length === 0) return null
  const quoted = /^"([^"]*)"$/.exec(tokens[tokens.length - 1] ?? "")
  if (!quoted) return null
  const entry = templatePath(quoted[1]!, shimDir)
  if (entry === null) return null
  const flags = tokens.slice(0, -1)
  return flags.every((flag) => FLAG.test(flag)) ? [...flags, entry] : null
}

async function nodeRecipe(
  shimDir: string,
  tail: string[],
  effective: { present: NodeJS.ProcessEnv; absent: NodeJS.ProcessEnv },
  env: NodeJS.ProcessEnv,
  deps: ResolveDeps,
): Promise<Recipe | null> {
  const local = path.win32.join(shimDir, "node.exe")
  const found = deps.existence(local)
  if (found === "unknown") return null
  if (found === "present" || found === "directory") {
    return {
      command: local,
      args: tail,
      ...(effective.present === env ? {} : { env: effective.present }),
    }
  }
  const resolved = await deps.resolveOnPath("node", effective.absent)
  return resolved === null
    ? null
    : {
        command: resolved,
        args: tail,
        ...(effective.absent === env ? {} : { env: effective.absent }),
      }
}

const NPM_PROLOGUE = [
  "@ECHO off",
  "GOTO start",
  ":find_dp0",
  "SET dp0=%~dp0",
  "EXIT /b",
  ":start",
  "SETLOCAL",
  "CALL :find_dp0",
]

const NPM_PREFIX = "endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "
const NPM_EXEC_LEGACY = /^"%_prog%"(.*)\s%\*$/
const NPM_EXEC_CURRENT = /^set PATHEXT=%PATHEXT:;\.([A-Z]+);=;% & "%_prog%"(.*)\s%\*$/
const NPM_NATIVE_EXEC = /^"([^"]*)"\s+%\*$/
const PNPM_NODE_PATH_IF = /^@IF NOT DEFINED NODE_PATH \($/
const PNPM_NODE_PATH_SET = /^@SET "NODE_PATH=([^"%]+)"$/
const PNPM_NODE_PATH_PREPEND = /^@SET "NODE_PATH=([^"%]+);%NODE_PATH%"$/
const PNPM_IF = /^@IF EXIST "([^"]*)" \($/
const PNPM_ARM = /^"([^"]*)"(.*)\s%\*$/
const PNPM_BARE_ARM = /^node(.*)\s%\*$/
const PNPM_ONELINE = /^@"([^"]*)"(.*)\s%\*$/

function normalizeLines(content: string): string[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim())
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
  return lines
}

async function matchNpm(
  lines: string[],
  shimDir: string,
  env: NodeJS.ProcessEnv,
  deps: ResolveDeps,
): Promise<Recipe | null> {
  if (lines.length < NPM_PROLOGUE.length) return null
  if (!NPM_PROLOGUE.every((expected, index) => lines[index] === expected)) return null
  const body = lines.slice(NPM_PROLOGUE.length).filter((line) => line !== "")

  if (body.length === 1) {
    const native = NPM_NATIVE_EXEC.exec(body[0] ?? "")
    if (!native) return null
    const target = templatePath(native[1]!, shimDir)
    if (target === null || !/\.exe$/i.test(target)) return null
    const normalizedDir = path.win32.normalize(shimDir)
    const dp0 = normalizedDir.endsWith("\\") ? normalizedDir : `${normalizedDir}\\`
    return { command: target, args: [], env: withWindowsEnvAssignment(env, "dp0", dp0) }
  }

  if (body[0] !== 'IF EXIST "%dp0%\\node.exe" (') return null
  if (body[1] !== 'SET "_prog=%dp0%\\node.exe"') return null
  if (body[2] !== ") ELSE (") return null
  if (body[3] !== 'SET "_prog=node"') return null

  if (body.length === 7) {
    if (!PATHEXT_EDIT.test(body[4] ?? "")) return null
    if (body[5] !== ")") return null
    if (!(body[6] ?? "").startsWith(NPM_PREFIX)) return null
    const exec = NPM_EXEC_LEGACY.exec((body[6] ?? "").slice(NPM_PREFIX.length))
    if (!exec) return null
    const tail = interpreterTail(exec[1] ?? "", shimDir)
    return tail === null ? null : nodeRecipe(shimDir, tail, { present: env, absent: env }, env, deps)
  }

  if (body.length === 6) {
    if (body[4] !== ")") return null
    if (!(body[5] ?? "").startsWith(NPM_PREFIX)) return null
    const exec = NPM_EXEC_CURRENT.exec((body[5] ?? "").slice(NPM_PREFIX.length))
    if (!exec) return null
    const tail = interpreterTail(exec[2] ?? "", shimDir)
    if (tail === null) return null
    const edited = withPathextEdit(env, exec[1] ?? "JS")
    return nodeRecipe(shimDir, tail, { present: edited, absent: edited }, env, deps)
  }

  return null
}

async function matchPnpm(
  lines: string[],
  shimDir: string,
  env: NodeJS.ProcessEnv,
  deps: ResolveDeps,
): Promise<Recipe | null> {
  if (lines[0] !== "@SETLOCAL") return null
  let body = lines.slice(1).filter((line) => line !== "")

  let baseEnv = env
  if (body.length > 0 && PNPM_NODE_PATH_IF.test(body[0] ?? "")) {
    if (body.length < 5) return null
    const set = PNPM_NODE_PATH_SET.exec(body[1] ?? "")
    const prepend = PNPM_NODE_PATH_PREPEND.exec(body[3] ?? "")
    if (!set || body[2] !== ") ELSE (" || !prepend || body[4] !== ")") return null
    if (set[1] !== prepend[1]) return null
    const currentValue = envValue(env, "NODE_PATH")
    const defined = currentValue !== undefined && currentValue !== ""
    baseEnv = withWindowsEnvAssignment(env, "NODE_PATH", defined ? `${set[1]};${currentValue}` : set[1]!)
    body = body.slice(5)
  }

  if (body.length === 1) {
    const one = PNPM_ONELINE.exec(body[0] ?? "")
    if (!one) return null
    const program = templatePath(one[1]!, shimDir)
    if (program === null) return null
    const onelineEnv = baseEnv === env ? {} : { env: baseEnv }
    if ((one[2] ?? "").trim() === "") {
      return /\.exe$/i.test(program) ? { command: program, args: [], ...onelineEnv } : null
    }
    const tail = interpreterTail(one[2] ?? "", shimDir)
    return tail === null || /\.(cmd|bat)$/i.test(program) ? null : { command: program, args: tail, ...onelineEnv }
  }

  if (body.length !== 6) return null
  const opened = PNPM_IF.exec(body[0] ?? "")
  if (!opened) return null
  const local = path.win32.join(shimDir, "node.exe")
  const candidate = templatePath(opened[1]!, shimDir)
  if (candidate === null || candidate.toLowerCase() !== local.toLowerCase()) return null
  const present = PNPM_ARM.exec(body[1] ?? "")
  if (!present) return null
  const presentProgram = templatePath(present[1]!, shimDir)
  if (presentProgram === null || presentProgram.toLowerCase() !== local.toLowerCase()) return null
  if (body[2] !== ") ELSE (") return null
  const edit = PATHEXT_EDIT.exec(body[3] ?? "")
  if (!edit) return null
  const absent = PNPM_BARE_ARM.exec(body[4] ?? "")
  if (!absent) return null
  if (body[5] !== ")") return null

  const tail = interpreterTail(present[2] ?? "", shimDir)
  const otherTail = interpreterTail(absent[1] ?? "", shimDir)
  if (tail === null || otherTail === null || tail.join(" ") !== otherTail.join(" ")) return null
  const removed = edit[1] ?? "JS"
  return nodeRecipe(
    shimDir,
    tail,
    { present: baseEnv, absent: withPathextEdit(baseEnv, removed) },
    env,
    deps,
  )
}

export async function recognizeShim(
  cmdPath: string,
  content: string,
  env: NodeJS.ProcessEnv,
  deps: ResolveDeps = REAL_DEPS,
): Promise<Recipe | null> {
  if (!isFullyQualifiedLocalPath(cmdPath)) return null
  const shimDir = path.win32.dirname(cmdPath)
  const lines = normalizeLines(content)
  if (lines.length === 0) return null
  return (await matchNpm(lines, shimDir, env, deps)) ?? (await matchPnpm(lines, shimDir, env, deps))
}

export async function resolveSpawnPlan(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  _cwd?: string,
  deps: ResolveDeps = REAL_DEPS,
): Promise<SpawnPlan> {
  if (deps.platform !== "win32") return { command, args: [...args] }
  let resolved = command
  if (!command.includes("/") && !command.includes("\\")) {
    resolved = (await deps.resolveOnPath(command, env)) ?? command
  }
  if (!/\.(cmd|bat)$/i.test(path.win32.basename(resolved))) {
    return { command: resolved, args: [...args] }
  }
  if (!isFullyQualifiedLocalPath(resolved)) {
    throw new UnrecognizedBatchShimError(command)
  }
  let content: string
  try {
    content = deps.readFileSync(resolved)
  } catch {
    throw new UnrecognizedBatchShimError(command)
  }
  const recipe = await recognizeShim(resolved, content, env, deps)
  if (recipe === null) throw new UnrecognizedBatchShimError(command)
  return {
    command: recipe.command,
    args: [...recipe.args, ...args],
    ...(recipe.env ? { env: recipe.env } : {}),
  }
}
