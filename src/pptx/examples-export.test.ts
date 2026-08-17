// @vitest-environment node
//
// The shipped examples are the product's front door: `README.md` points at
// them, `skills/pptfast/SKILL.md` teaches models from them, and a new user's
// first command is usually `pptfast render examples/<one>.json`. Nothing was
// rendering five of the six — `scripts/e2e.mts` only ever rendered
// `examples/basic.json`, and the unit suite renders its own fixtures — so
// `examples/team-onboarding.json` shipped un-renderable through 0.19.2 and
// 0.20.0 (its `cycle` page exported text shapes with `a:ext cx <= 0`, which
// `package-audit.ts` rejects; see `svg2pptx/text.ts`'s `anchorTextBox`).
//
// This is the guard for that: every `examples/*.json`, discovered from disk
// rather than listed here, has to survive the whole export chain — the same
// `generatePptx` the CLI's `render` calls, package-audit gate included. Add
// an example and it is covered; break the export and this goes red before
// anything reaches a user.
//
// Why `pnpm check` and not `pnpm e2e`: nothing here needs a build or a
// subprocess (the defect it exists to catch is plain library code), and
// `check` is the gate that runs on every change while `e2e` runs when the
// render chain changes or a release is being cut — a guard against "no one
// noticed for two versions" belongs on the path nobody skips. Cost is in
// line with `all-themes.test.ts`, which already exports 17 decks here.
import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { generatePptx } from "@/api"
import { installNodePlatform } from "@/platform/node"

const EXAMPLES_DIR = new URL("../../examples/", import.meta.url)

installNodePlatform()

const exampleFiles = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith(".json")).sort()

describe("shipped examples export", () => {
  it("finds the examples directory (a guard that never matches is not a guard)", () => {
    expect(exampleFiles.length).toBeGreaterThan(0)
  })

  for (const file of exampleFiles) {
    it(`examples/${file} renders to a pptx`, async () => {
      const json = JSON.parse(readFileSync(new URL(file, EXAMPLES_DIR), "utf-8"))
      const bytes = await generatePptx(json)
      expect(bytes.byteLength).toBeGreaterThan(0)
    })
  }
})
