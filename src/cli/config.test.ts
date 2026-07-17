// @vitest-environment node
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { findConfig } from "./config"

function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "pptfast-config-"))
}

describe("findConfig", () => {
  it("returns null when no config exists up the tree", async () => {
    expect(await findConfig(await tmp())).toBeNull()
  })

  it("finds pptfast.config.json in a parent directory", async () => {
    const root = await tmp()
    await writeFile(join(root, "pptfast.config.json"), JSON.stringify({ theme: "tech" }))
    const nested = join(root, "a", "b")
    await mkdir(nested, { recursive: true })
    const hit = await findConfig(nested)
    expect(hit?.path).toBe(join(root, "pptfast.config.json"))
    expect(hit?.config.theme).toBe("tech")
  })

  it("rejects unknown keys with the config path in the message", async () => {
    const root = await tmp()
    await writeFile(join(root, "pptfast.config.json"), JSON.stringify({ them: "tech" }))
    await expect(findConfig(root)).rejects.toThrow(/pptfast\.config\.json/)
  })

  it("rejects an unknown theme id", async () => {
    const root = await tmp()
    await writeFile(join(root, "pptfast.config.json"), JSON.stringify({ theme: "neon" }))
    await expect(findConfig(root)).rejects.toThrow(/theme/)
  })

  it("validates style with the shared schema", async () => {
    const root = await tmp()
    await writeFile(
      join(root, "pptfast.config.json"),
      JSON.stringify({ style: { colors: { primary: "blue" } } }),
    )
    await expect(findConfig(root)).rejects.toThrow(/primary/)
  })

  it("rejects a config that is not valid JSON", async () => {
    const root = await tmp()
    await writeFile(join(root, "pptfast.config.json"), "{ theme: tech }")
    await expect(findConfig(root)).rejects.toThrow(/not valid JSON/)
  })
})
