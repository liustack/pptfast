// @vitest-environment node
import { describe, expect, it } from "vitest"
import { DRAIN_GRACE_MS, runChild } from "./child"

describe.skipIf(process.platform === "win32")("runChild settlement (#1)", () => {
  // Windows cannot keep a grandchild on an inherited pipe the same way.
  // POSIX is enough to pin exit-then-drain so a stuck close cannot hang us.

  it("resolves on exit plus drain when a grandchild keeps the pipe open", async () => {
    const started = Date.now()
    const result = await runChild(process.execPath, [
      "-e",
      `
        const { spawn } = require('node:child_process')
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e6)'], {
          stdio: ['ignore', 'inherit', 'inherit'],
          detached: true,
        })
        child.unref()
        process.stdout.write('parent-exit\\n')
      `,
    ])
    const elapsed = Date.now() - started
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("parent-exit")
    expect(elapsed).toBeLessThan(DRAIN_GRACE_MS + 2000)
  })
})
