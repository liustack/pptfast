// @vitest-environment node
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { findOnPath } from "./path-lookup"
import { resolveSpawnPlan, UnrecognizedBatchShimError } from "./win-exec"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

const NPM_CMD_SHIM = [
  "@ECHO off",
  "GOTO start",
  ":find_dp0",
  "SET dp0=%~dp0",
  "EXIT /b",
  ":start",
  "SETLOCAL",
  "CALL :find_dp0",
  "",
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ") ELSE (",
  '  SET "_prog=node"',
  ")",
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & set PATHEXT=%PATHEXT:;.JS;=;% & "%_prog%"  "%dp0%\\node_modules\\grok\\cli.js" %*',
  "",
].join("\r\n")

function winFindDeps(files: Set<string>) {
  return {
    platform: "win32" as const,
    delimiter: ";",
    join: path.win32.join,
    access: async (target: string) => {
      if (!files.has(target)) {
        const err = new Error("ENOENT") as NodeJS.ErrnoException
        err.code = "ENOENT"
        throw err
      }
    },
  }
}

describe("resolveSpawnPlan", () => {
  it("passes POSIX commands through unchanged", async () => {
    const plan = await resolveSpawnPlan("npm", ["view", "pptfast"], { PATH: "/usr/bin" }, undefined, {
      platform: "linux",
      readFileSync: () => {
        throw new Error("should not read a shim on POSIX")
      },
      resolveOnPath: async () => "/usr/bin/npm",
      existence: () => "absent",
    })
    expect(plan).toEqual({ command: "npm", args: ["view", "pptfast"] })
  })

  it("refuses an unrecognized Windows .cmd shim", async () => {
    const cmdPath = "C:\\bins\\mystery.cmd"
    await expect(
      resolveSpawnPlan("mystery", ["--prompt", "line1\nline2"], { Path: "C:\\bins", PATHEXT: ".CMD" }, undefined, {
        platform: "win32",
        readFileSync: () => "@echo off\r\necho nope\r\n",
        resolveOnPath: async () => cmdPath,
        existence: () => "present",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(UnrecognizedBatchShimError)
      const message = (error as Error).message
      expect(message).toMatch(/batch file without a shell|refuses to run/i)
      expect(message).toMatch(/multi-line|newline/i)
      expect(message).toMatch(/cmd/i)
      return true
    })
  })

  it("rewrites a recognised npm cmd-shim to node plus the JS entry", async () => {
    const cmdPath = "C:\\Users\\x\\AppData\\Roaming\\npm\\grok.cmd"
    const nodeExe = "C:\\Program Files\\nodejs\\node.exe"
    const plan = await resolveSpawnPlan("grok", ["-p", "a prompt"], { Path: "C:\\Users\\x\\AppData\\Roaming\\npm" }, undefined, {
      platform: "win32",
      readFileSync: (target) => {
        expect(target).toBe(cmdPath)
        return NPM_CMD_SHIM
      },
      resolveOnPath: async (bin) => {
        if (bin === "grok") return cmdPath
        if (bin === "node") return nodeExe
        return null
      },
      existence: (target) => (target.toLowerCase().endsWith("\\node.exe") && target.includes("Roaming") ? "absent" : "present"),
    })
    expect(plan.command).toBe(nodeExe)
    expect(plan.args[0]).toBe("C:\\Users\\x\\AppData\\Roaming\\npm\\node_modules\\grok\\cli.js")
    expect(plan.args.slice(1)).toEqual(["-p", "a prompt"])
    expect(plan.command.toLowerCase().endsWith(".cmd")).toBe(false)
  })

  it("findOnPath and resolveSpawnPlan pick the same PATHEXT hit", async () => {
    const files = new Set(["C:\\bins\\tool.EXE"])
    const env = { Path: "C:\\bins", PATHEXT: ".EXE;.CMD" }
    const found = await findOnPath("tool", env, winFindDeps(files))
    expect(found).toBe("C:\\bins\\tool.EXE")
    const plan = await resolveSpawnPlan("tool", ["--version"], env, undefined, {
      platform: "win32",
      readFileSync: () => {
        throw new Error("exe is not a shim")
      },
      resolveOnPath: async (bin, lookupEnv) => findOnPath(bin, lookupEnv, winFindDeps(files)),
      existence: (target) => (files.has(target) ? "present" : "absent"),
    })
    expect(plan.command).toBe(found)
    expect(plan.args).toEqual(["--version"])
  })

  it("prefers a PATHEXT match over a bare POSIX shim sitting beside it", async () => {
    const files = new Set(["C:\\bins\\npm", "C:\\bins\\npm.CMD"])
    const env = { Path: "C:\\bins", PATHEXT: ".CMD" }
    const found = await findOnPath("npm", env, winFindDeps(files))
    expect(found).toBe("C:\\bins\\npm.CMD")
  })
})

describe("no cmd wrapper for batch files", () => {
  it("does not spawn cmd.exe or set shell:true from shipped CLI files", () => {
    const files = [
      path.join(root, "src/cli/win-exec.ts"),
      path.join(root, "src/cli/child.ts"),
      path.join(root, "src/cli/path-lookup.ts"),
      path.join(root, "dsh/spawnHidden.js"),
    ]
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8")
      expect(source, file).not.toMatch(/spawn\w*\(\s*['"]cmd\.exe['"]/i)
      expect(source, file).not.toMatch(/shell:\s*true/)
    }
  })
})
