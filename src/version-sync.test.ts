import { readFileSync } from "node:fs"
import { join } from "node:path"

import { VERSION } from "./version"

// vitest cwd = repo root (jsdom env swaps global URL, so import.meta.url tricks break here)
function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), rel), "utf8"))
}

describe("version mirrors", () => {
  it("src/version.ts VERSION tracks package.json", () => {
    const pkg = readJson("package.json")
    expect(VERSION).toBe(pkg.version)
  })
})
