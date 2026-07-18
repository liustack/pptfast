import { readFileSync } from "node:fs"
import { join } from "node:path"

import { VERSION } from "./version"

// vitest cwd = repo root (jsdom env swaps global URL, so import.meta.url tricks break here)
function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), rel), "utf8"))
}

describe("claude plugin manifests", () => {
  it("plugin.json version and name track package.json", () => {
    const pkg = readJson("package.json")
    const plugin = readJson(".claude-plugin/plugin.json")
    expect(plugin.name).toBe("pptfast")
    expect(plugin.version).toBe(pkg.version)
  })

  it("src/version.ts VERSION tracks package.json", () => {
    const pkg = readJson("package.json")
    expect(VERSION).toBe(pkg.version)
  })

  it("marketplace.json lists the root plugin under the same name", () => {
    const marketplace = readJson(".claude-plugin/marketplace.json")
    const plugins = marketplace.plugins as Array<{ name: string; source: string }>
    expect(plugins).toHaveLength(1)
    expect(plugins[0]!.name).toBe("pptfast")
    expect(plugins[0]!.source).toBe("./")
  })
})
