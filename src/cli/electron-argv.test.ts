// @vitest-environment node
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const CLI = join(ROOT, "src", "cli.ts")

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_OPTIONS
  return env
}

describe("CLI argv under Electron (#25)", () => {
  it("parses argv with node semantics when process.versions.electron is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "pptfast-electron-"))
    const shim = join(dir, "electron-shim.cjs")
    writeFileSync(
      shim,
      "Object.defineProperty(process.versions, 'electron', { value: '30.0.0', configurable: true });\n",
    )
    try {
      const result = spawnSync(
        process.execPath,
        ["--require", shim, "--import", "tsx", CLI, "themes"],
        { encoding: "utf8", cwd: ROOT, env: cleanEnv() },
      )
      expect(result.status, result.stderr || result.stdout).toBe(0)
      expect(result.stderr).not.toMatch(/unknown command|too many arguments|extra argument/i)
      expect(result.stdout).toMatch(/consulting/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
