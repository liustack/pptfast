// @vitest-environment node
import { describe, expect, it } from "vitest"
import { redactSecrets } from "./redact"

describe("redactSecrets", () => {
  it("redacts a Pixabay URL that carries key=SUPERSECRET99 (api_key= regex is not enough)", () => {
    const text = "failed https://pixabay.com/api/?key=SUPERSECRET99&q=office"
    const out = redactSecrets(text, ["SUPERSECRET99"])
    expect(out).not.toContain("SUPERSECRET99")
    expect(out).not.toMatch(/key=SUPERSECRET99/)
    expect(out).toContain("[redacted]")
  })

  it("strips a bare key= value even when the secret is not in the known list", () => {
    const text = "https://pixabay.com/api/?key=SUPERSECRET99&q=office"
    const out = redactSecrets(text, [])
    expect(out).not.toContain("SUPERSECRET99")
    expect(out).toMatch(/key=\[redacted\]/)
  })

  it("exact-replaces known secrets of length >= 6", () => {
    expect(redactSecrets("token=ABCDEF99 in body", ["ABCDEF99"])).toBe("token=[redacted] in body")
  })

  it("does not exact-replace secrets shorter than 6 characters", () => {
    expect(redactSecrets("ab in a sentence", ["ab"])).toBe("ab in a sentence")
  })

  it("redacts client_secret= from a query string even without a known list", () => {
    const text = "https://api.openverse.org/v1/auth_tokens/token/?client_secret=OVSECRET99"
    const out = redactSecrets(text, [])
    expect(out).not.toContain("OVSECRET99")
    expect(out).toContain("client_secret=[redacted]")
  })
})
