// @vitest-environment node

import { execFileSync } from "node:child_process"
import { statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const FIXTURE_BUDGET = 15 * 1024 * 1024

describe("gallery fixture budget", () => {
  it("keeps tracked files under evals/gallery/fixtures at or below 15MB", () => {
    const listed = execFileSync("git", ["ls-files", "evals/gallery/fixtures"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    expect(listed.length).toBeGreaterThan(0)
    const bytes = listed.reduce((sum, rel) => sum + statSync(join(ROOT, rel)).size, 0)
    expect(bytes).toBeLessThanOrEqual(FIXTURE_BUDGET)
  })
})
