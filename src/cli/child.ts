/**
 * The only place in the CLI that starts a child process.
 *
 * A child started from a host with no console of its own gets one allocated,
 * and Windows shows its window, so a DSH desktop preview popped a black
 * window per child (issue #60). `windowsHide` suppresses it, defaults to
 * false, and is ignored off Windows. Written after the caller's options so a
 * spread cannot drop it.
 */
import {
  execFile,
  spawn,
  type ChildProcess,
  type ExecFileException,
  type ExecFileOptions,
  type SpawnOptions,
} from "node:child_process"

export const DRAIN_GRACE_MS = 500

export function spawnHidden(
  command: string,
  args: readonly string[] = [],
  options: Omit<SpawnOptions, "windowsHide"> = {},
): ChildProcess {
  return spawn(command, args, { ...options, windowsHide: true })
}

export function execFileHidden(
  file: string,
  args: readonly string[] | undefined,
  options: Omit<ExecFileOptions, "windowsHide"> | undefined,
  callback: (error: ExecFileException | null, stdout: string, stderr: string) => void,
): ChildProcess {
  return execFile(file, [...(args ?? [])], { ...options, windowsHide: true }, callback as never)
}

export interface RunChildOptions extends Omit<SpawnOptions, "windowsHide" | "stdio"> {
  timeoutMs?: number
  signal?: AbortSignal
}

export interface RunChildResult {
  code: number
  stdout: string
  stderr: string
}

export class ChildTimeoutError extends Error {
  readonly timedOut = true as const
  constructor(timeoutMs: number) {
    super(`child process timed out after ${timeoutMs}ms`)
    this.name = "ChildTimeoutError"
  }
}

/**
 * Settle on `exit` plus a short drain, or on `close` if it arrives first.
 * A grandchild that inherited stdout used to make `close` never fire (#1).
 * After settling, destroy the pipes and unref the child so a lingering
 * descendant cannot pin this process.
 */
export async function runChild(
  command: string,
  args: readonly string[] = [],
  options: RunChildOptions = {},
): Promise<RunChildResult> {
  const { timeoutMs, signal, ...spawnOptions } = options
  return new Promise((resolve, reject) => {
    const child = spawnHidden(command, [...args], {
      ...spawnOptions,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let settled = false
    let drainTimer: NodeJS.Timeout | undefined
    let timeoutTimer: NodeJS.Timeout | undefined
    let exitCode: number | null = null
    let exited = false
    let timedOut = false

    const settle = (code: number | null) => {
      if (settled) return
      settled = true
      if (timeoutTimer) clearTimeout(timeoutTimer)
      if (drainTimer) clearTimeout(drainTimer)
      child.stdout?.destroy()
      child.stderr?.destroy()
      child.unref()
      signal?.removeEventListener("abort", onAbort)
      if (timedOut) {
        reject(new ChildTimeoutError(timeoutMs ?? 0))
        return
      }
      resolve({ code: code ?? 0, stdout, stderr })
    }

    const restartDrain = () => {
      if (!exited || settled) return
      if (drainTimer) clearTimeout(drainTimer)
      drainTimer = setTimeout(() => settle(exitCode), DRAIN_GRACE_MS)
    }

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8")
      restartDrain()
    })
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8")
      restartDrain()
    })

    child.on("error", (error) => {
      if (settled) return
      settled = true
      if (timeoutTimer) clearTimeout(timeoutTimer)
      if (drainTimer) clearTimeout(drainTimer)
      signal?.removeEventListener("abort", onAbort)
      reject(error)
    })

    child.on("exit", (code) => {
      exitCode = code
      exited = true
      restartDrain()
    })

    child.on("close", (code) => settle(code))

    if (timeoutMs !== undefined) {
      timeoutTimer = setTimeout(() => {
        timedOut = true
        child.kill("SIGTERM")
        settle(null)
      }, timeoutMs)
    }

    const onAbort = () => child.kill()
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener("abort", onAbort, { once: true })
    }
  })
}
