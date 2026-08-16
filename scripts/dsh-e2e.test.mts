// @vitest-environment node
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  applyInstalledDshPlugin,
  assertPptfastMountedInDshConfig,
  buildDshDumpConfigInvocation,
  canonicalWorkspacePath,
  inspectInstalledDshPlugin,
  verifyInstalledDshRoute,
  verifyInstalledDshSkill,
  verifyInstalledDshTool,
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
        "export const inject = ['skills', 'tools']",
        "export function apply(ctx) {",
        `  ctx.skills.register({ name: 'pptfast', content: 'node "${join(pluginDir, "dist", "cli.js")}" <args>' })`,
        "  ctx.tools.register({",
        "    name: 'pptfast_preview',",
        "    execute: async () => ({}),",
        "    output: { render: () => [], presentationMeta: () => ({}) },",
        "  })",
        "  ctx.inject(['webServer'], (scope) => {",
        "    scope.webServer.register({ name: 'pptfast-preview', kind: 'prefix', path: '/pptfast/preview', handler: async () => {} })",
        "  })",
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
    const applied = await applyInstalledDshPlugin(installed)
    await expect(verifyInstalledDshSkill(installed, applied)).resolves.toMatchObject({ name: "pptfast" })
    expect(verifyInstalledDshTool(applied)).toMatchObject({ name: "pptfast_preview" })
    expect(verifyInstalledDshRoute(applied)).toMatchObject({ path: "/pptfast/preview" })

    // The gate's whole point: each half must be able to fail on its own.
    expect(() => verifyInstalledDshTool({ ...applied, tools: [] })).toThrow(/did not register the pptfast_preview/)
    expect(() =>
      verifyInstalledDshTool({ ...applied, tools: [{ name: "pptfast_preview", execute: undefined }] }),
    ).toThrow(/missing required members: execute, output\.render, output\.presentationMeta/)
    expect(() => verifyInstalledDshRoute({ ...applied, routes: [] })).toThrow(
      /did not register a \/pptfast\/preview route/,
    )
    expect(() => verifyInstalledDshRoute({ ...applied, injected: [], routes: [] })).toThrow(/never asked for/)

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
