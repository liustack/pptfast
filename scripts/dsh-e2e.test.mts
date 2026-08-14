// @vitest-environment node
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  assertPptfastMountedInDshConfig,
  buildDshDumpConfigInvocation,
  canonicalWorkspacePath,
  inspectInstalledDshPlugin,
  verifyInstalledDshRegistration,
} from "./dsh-e2e.mts"

describe("dsh e2e preflight", () => {
  const temporaryPaths: string[] = []

  afterEach(async () => {
    await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
  })

  it("uses the filesystem canonical path for workspace identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "pptfast-dsh-e2e-"))
    const alias = `${root}-alias`
    temporaryPaths.push(alias, root)
    await symlink(root, alias, "dir")

    expect(await canonicalWorkspacePath(alias)).toBe(await realpath(root))
  })

  it("verifies the plugin package installed in the selected DSH profile", async () => {
    const dshHome = await mkdtemp(join(tmpdir(), "pptfast-dsh-home-"))
    temporaryPaths.push(dshHome)
    const profileDir = join(dshHome, "profiles", "web")
    const pluginDir = join(profileDir, "node_modules", "@liustack", "pptfast")
    await mkdir(join(pluginDir, "dsh"), { recursive: true })
    await mkdir(join(pluginDir, "dist"), { recursive: true })
    await mkdir(join(pluginDir, "skills", "pptfast"), { recursive: true })
    await writeFile(
      join(profileDir, "package.json"),
      JSON.stringify({ dependencies: { "@liustack/pptfast": "0.19.2" } }),
    )
    await writeFile(
      join(pluginDir, "package.json"),
      JSON.stringify({
        name: "@liustack/pptfast",
        version: "0.19.2",
        type: "module",
        main: "./dsh/index.js",
        dsh: { bundle: { patch: "./cordis.patch.yml" } },
      }),
    )
    await writeFile(
      join(pluginDir, "dsh", "index.js"),
      [
        "export const name = 'pptfast'",
        "export const inject = ['skills']",
        "export function apply(ctx) {",
        `  ctx.skills.register({ name: 'pptfast', content: 'node "${join(pluginDir, "dist", "cli.js")}" <args>' })`,
        "}",
      ].join("\n"),
    )
    await writeFile(join(pluginDir, "dist", "cli.js"), "#!/usr/bin/env node\n")
    await writeFile(join(pluginDir, "skills", "pptfast", "SKILL.md"), "# pptfast\n")
    await writeFile(join(pluginDir, "cordis.patch.yml"), "- id: pptfast\n")

    const installed = await inspectInstalledDshPlugin({
      dshHome,
      profile: "web",
      expectedVersion: "0.19.2",
    })
    expect(installed).toMatchObject({
      profile: "web",
      declaredSpecifier: "0.19.2",
      installedVersion: "0.19.2",
      pluginDir,
    })
    await expect(verifyInstalledDshRegistration(installed)).resolves.toMatchObject({
      name: "pptfast",
    })
    await expect(
      inspectInstalledDshPlugin({ dshHome, profile: "web", expectedVersion: "0.20.0" }),
    ).rejects.toThrow(/has @liustack\/pptfast@0\.19\.2, expected 0\.20\.0/)
  })

  it("requires the composed DSH config to mount the installed pptfast bundle", () => {
    const dump = [
      "# == @liustack/modsearch",
      "- id: modsearch",
      "  name: '@liustack/modsearch'",
      "# == @liustack/pptfast",
      "- id: pptfast",
      "  name: '@liustack/pptfast'",
    ].join("\n")

    expect(() => assertPptfastMountedInDshConfig(dump)).not.toThrow()
    expect(() => assertPptfastMountedInDshConfig(dump.replace("id: pptfast", "id: disabled"))).toThrow(
      /does not mount/,
    )
  })

  it("boots DSH config inspection from the canonical workspace", () => {
    expect(buildDshDumpConfigInvocation("/private/tmp/pptfast-dsh-e2e", "web")).toEqual({
      command: "npx",
      args: ["-y", "@deepseek-ai/dsh", "--profile", "web", "--dump-config"],
      cwd: "/private/tmp/pptfast-dsh-e2e",
    })
  })
})
