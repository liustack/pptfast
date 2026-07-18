// @vitest-environment node
import { homedir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { decksRoot, pptfastHome, userConfigPath } from "./home"

describe("pptfastHome", () => {
  const original = process.env.PPTFAST_HOME

  afterEach(() => {
    if (original === undefined) delete process.env.PPTFAST_HOME
    else process.env.PPTFAST_HOME = original
  })

  it("defaults to ~/.pptfast when PPTFAST_HOME is unset", () => {
    delete process.env.PPTFAST_HOME
    expect(pptfastHome()).toBe(join(homedir(), ".pptfast"))
  })

  it("honors PPTFAST_HOME when set", () => {
    process.env.PPTFAST_HOME = "/tmp/custom-pptfast-home"
    expect(pptfastHome()).toBe("/tmp/custom-pptfast-home")
  })

  it("re-reads the env var on every call (not cached)", () => {
    delete process.env.PPTFAST_HOME
    expect(pptfastHome()).toBe(join(homedir(), ".pptfast"))
    process.env.PPTFAST_HOME = "/tmp/other-home"
    expect(pptfastHome()).toBe("/tmp/other-home")
  })
})

describe("decksRoot", () => {
  const original = process.env.PPTFAST_HOME

  afterEach(() => {
    if (original === undefined) delete process.env.PPTFAST_HOME
    else process.env.PPTFAST_HOME = original
  })

  it("defaults to $PPTFAST_HOME/decks with no config", () => {
    process.env.PPTFAST_HOME = "/tmp/pptfast-home-a"
    expect(decksRoot()).toBe(join("/tmp/pptfast-home-a", "decks"))
  })

  it("defaults to $PPTFAST_HOME/decks when config has no decksDir", () => {
    process.env.PPTFAST_HOME = "/tmp/pptfast-home-b"
    expect(decksRoot({})).toBe(join("/tmp/pptfast-home-b", "decks"))
  })

  it("uses config.decksDir as an override when present", () => {
    process.env.PPTFAST_HOME = "/tmp/pptfast-home-c"
    expect(decksRoot({ decksDir: "/elsewhere/decks" })).toBe("/elsewhere/decks")
  })
})

describe("userConfigPath", () => {
  const original = process.env.PPTFAST_HOME

  afterEach(() => {
    if (original === undefined) delete process.env.PPTFAST_HOME
    else process.env.PPTFAST_HOME = original
  })

  it("is $PPTFAST_HOME/config.json", () => {
    process.env.PPTFAST_HOME = "/tmp/pptfast-home-d"
    expect(userConfigPath()).toBe(join("/tmp/pptfast-home-d", "config.json"))
  })
})
