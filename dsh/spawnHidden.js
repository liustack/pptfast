// The only place this plugin starts a child process.
//
// The desktop app has no console of its own, so on Windows every child it
// starts would be given one and shown its window: a black box per preview
// (issue #60). `windowsHide` suppresses that, defaults to false in Node, and is
// ignored elsewhere.
//
// It lives in a file of its own, apart from its callers, so the rule can be
// checked by looking at which files reach `child_process` at all rather than at
// what each call passes. A call site cannot forget an option it never writes,
// and writing the option after the caller's leaves nothing to override it.
//
// The CLI has its own copy in src/cli/child.ts. The duplication is on
// purpose: this plugin ships as a unit and must not import from the CLI it
// drives.
import { spawn } from 'node:child_process'

const DRAIN_GRACE_MS = 500

export function spawnHidden(command, args, options) {
  return spawn(command, args, { ...options, windowsHide: true })
}

/**
 * Settle on `exit` plus a short drain, or on `close` if it arrives first.
 * A grandchild that inherited stdout used to make `close` never fire (#1).
 */
export function runChild(command, args, options = {}) {
  const { timeoutMs, signal, ...spawnOptions } = options
  return new Promise((resolve, reject) => {
    const child = spawnHidden(command, args, {
      ...spawnOptions,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    let drainTimer
    let timeoutTimer
    let exitCode = null
    let exited = false
    let timedOut = false

    const settle = (code) => {
      if (settled) return
      settled = true
      if (timeoutTimer) clearTimeout(timeoutTimer)
      if (drainTimer) clearTimeout(drainTimer)
      child.stdout?.destroy()
      child.stderr?.destroy()
      child.unref()
      signal?.removeEventListener('abort', onAbort)
      if (timedOut) {
        const error = new Error(`child process timed out after ${timeoutMs}ms`)
        error.timedOut = true
        reject(error)
        return
      }
      resolve({ code: code ?? 0, stdout, stderr })
    }

    const restartDrain = () => {
      if (!exited || settled) return
      if (drainTimer) clearTimeout(drainTimer)
      drainTimer = setTimeout(() => settle(exitCode), DRAIN_GRACE_MS)
    }

    child.stdout?.on('data', (chunk) => {
      stdout += chunk
      restartDrain()
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
      restartDrain()
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      if (timeoutTimer) clearTimeout(timeoutTimer)
      if (drainTimer) clearTimeout(drainTimer)
      signal?.removeEventListener('abort', onAbort)
      reject(error)
    })

    child.on('exit', (code) => {
      exitCode = code
      exited = true
      restartDrain()
    })

    child.on('close', (code) => settle(code))

    if (timeoutMs !== undefined) {
      timeoutTimer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        settle(null)
      }, timeoutMs)
    }

    const onAbort = () => child.kill()
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}
