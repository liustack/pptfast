// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { checkForUpdate, compareVersions, createSelfUpdater } from "./update"

describe("compareVersions", () => {
  it("orders semver numerically", () => {
    expect(compareVersions("0.1.0", "0.2.0")).toBeLessThan(0)
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0)
    expect(compareVersions("v1.0.0", "1.0.0")).toBe(0)
  })
})

describe("checkForUpdate", () => {
  it("reports an available update via npm view", async () => {
    const run = vi.fn().mockResolvedValue("9.9.9")
    const info = await checkForUpdate({ currentVersion: "0.1.0", run })
    expect(run).toHaveBeenCalledWith("npm", ["view", "@liustack/pptfast", "version"])
    expect(info).toMatchObject({ updateAvailable: true, latestVersion: "9.9.9", checked: true })
  })

  it("degrades gracefully when npm fails", async () => {
    const run = vi.fn().mockRejectedValue(new Error("offline"))
    const info = await checkForUpdate({ currentVersion: "0.1.0", run })
    expect(info).toMatchObject({ checked: false, updateAvailable: false, error: "offline" })
  })
})

describe("createSelfUpdater", () => {
  it("installs latest when behind", async () => {
    const run = vi.fn().mockResolvedValue("9.9.9")
    const result = await createSelfUpdater(run)({ currentVersion: "0.1.0" })
    expect(run).toHaveBeenCalledWith("npm", ["install", "-g", "@liustack/pptfast@latest"])
    expect(result.updated).toBe(true)
  })

  it("no-ops when current", async () => {
    const run = vi.fn().mockResolvedValue("0.1.0")
    const result = await createSelfUpdater(run)({ currentVersion: "0.1.0" })
    expect(result.updated).toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("throws when the update check itself fails", async () => {
    const run = vi.fn().mockRejectedValue(new Error("offline"))
    await expect(createSelfUpdater(run)({ currentVersion: "0.1.0" })).rejects.toThrow(/offline/)
  })
})
