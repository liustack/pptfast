// @vitest-environment node
import { describe, expect, it } from "vitest"
import { flagValue } from "./run.mts"

// ── flagValue — --model=<id> CLI override parsing (round-2, same shape as
// run-agentic.mts's identical helper — see that file's test suite for the
// deriveModelTag half of the same feature) ──

describe("flagValue", () => {
  it("returns the value of a present --name=value flag", () => {
    expect(flagValue(["qwen", "--model=qwen-flash", "q01"], "model")).toBe("qwen-flash")
  })

  it("returns undefined when the flag is absent", () => {
    expect(flagValue(["qwen", "q01"], "model")).toBeUndefined()
  })

  it("does not match a same-prefixed but different flag name", () => {
    expect(flagValue(["--model-extra=x"], "model")).toBeUndefined()
  })

  it("handles a value that itself contains an equals sign", () => {
    expect(flagValue(["--model=qwen=flash"], "model")).toBe("qwen=flash")
  })
})
