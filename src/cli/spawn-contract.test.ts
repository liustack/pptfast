// @vitest-environment node
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({ pid: 1 })),
  execFile: vi.fn(() => ({ pid: 1 })),
}))

const { execFile, spawn } = await import("node:child_process")
const { execFileHidden, spawnHidden } = await import("./child")

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

const WRAPPERS = new Set(["src/cli/child.ts", "dsh/spawnHidden.js"])

const INERT = /\.(json|md|ya?ml|d\.ts)$/

function shippedSources(): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (INERT.test(entry.name) || /\.test\./.test(entry.name)) continue
      found.push(full)
    }
  }
  walk(path.join(root, "src"))
  walk(path.join(root, "dsh"))
  return found
}

describe("no child process is started with a visible console (#60)", () => {
  it("writes windowsHide after the caller, so no call site can drop it", () => {
    vi.mocked(spawn).mockClear()
    vi.mocked(execFile).mockClear()

    spawnHidden("cmd", ["a"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false,
    } as never)
    execFileHidden("cmd", ["a"], { windowsHide: false } as never, () => {})

    expect(vi.mocked(spawn).mock.calls[0]?.[2]).toMatchObject({ windowsHide: true })
    expect(vi.mocked(execFile).mock.calls[0]?.[2]).toMatchObject({ windowsHide: true })
  })

  it("keeps the caller options it was given", () => {
    vi.mocked(spawn).mockClear()
    spawnHidden("cmd", ["a", "b"], { cwd: "/tmp", stdio: ["ignore", "pipe", "pipe"] })
    expect(vi.mocked(spawn).mock.calls[0]?.[0]).toBe("cmd")
    expect(vi.mocked(spawn).mock.calls[0]?.[1]).toEqual(["a", "b"])
    expect(vi.mocked(spawn).mock.calls[0]?.[2]).toMatchObject({ cwd: "/tmp" })
  })

  it("lets nothing but the wrappers reach child_process", () => {
    const reaching = shippedSources()
      .map((file) => path.relative(root, file).split(path.sep).join("/"))
      .filter((relative) => !WRAPPERS.has(relative))
      .filter((relative) => /child_process/.test(fs.readFileSync(path.join(root, relative), "utf8")))
    expect(reaching).toEqual([])
  })

  it("forces the option in the dsh wrapper too, which ships separately", async () => {
    vi.mocked(spawn).mockClear()
    // @ts-expect-error untyped on purpose
    const dsh = await import("../../dsh/spawnHidden.js")
    dsh.spawnHidden("cmd", ["a"], { stdio: "ignore", windowsHide: false })
    expect(vi.mocked(spawn).mock.calls[0]?.[2]).toMatchObject({ windowsHide: true })
  })
})
