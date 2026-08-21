// @vitest-environment node
import { Readable, Writable } from "node:stream"
import { describe, expect, it } from "vitest"
import { readSecret } from "./secret-input"

describe("readSecret", () => {
  it("reads the first trimmed line from non-TTY stdin", async () => {
    const stdin = Readable.from(["  PIPESECRET99\nignored\n"])
    const chunks: string[] = []
    const stderr = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(String(chunk))
        cb()
      },
    })
    const value = await readSecret("pexels.apiKey (input hidden): ", { stdin, stderr })
    expect(value).toBe("PIPESECRET99")
    expect(chunks.join("")).not.toContain("PIPESECRET99")
  })

  it("rejects an empty non-TTY line", async () => {
    const stdin = Readable.from(["   \n"])
    const stderr = new Writable({
      write(_chunk, _enc, cb) {
        cb()
      },
    })
    await expect(readSecret("pexels.apiKey (input hidden): ", { stdin, stderr })).rejects.toThrow(/empty/)
  })
})
