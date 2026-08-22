// @vitest-environment node
//
// Node environment on purpose: dsh/index.js resolves its skill/CLI paths
// with `new URL(..., import.meta.url)` + `fileURLToPath` at module scope,
// which the repo-default jsdom environment breaks (jsdom swaps global URL —
// same reason plugin-manifest.test.ts reads files by process.cwd()).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"

// The plugin is plain dependency-free JS by design (no build step, no dsh
// type imports) — see dsh/index.js's own header comment.
// @ts-expect-error untyped on purpose
import { __testing } from "../dsh/preview-tool.js"

const ROOT = process.cwd()

/** Module specifiers for `sharp`, not a bare `/sharp/` (comments may say "sharp/canvas"). */
const SHARP_SPECIFIER =
  /(?:from\s+|import\s*\(|require(?:\.resolve)?\s*\()\s*['"]sharp['"]/g

/** Static/dynamic module specifiers of the render/CLI entries. Path strings used only to spawn are not this. */
const DIST_MODULE_SPECIFIER =
  /(?:from\s+|import\s*\(|require(?:\.resolve)?\s*\()\s*['"][^'"]*dist\/(?:cli|node|index)\.js['"]/g

function pluginJsFiles(): string[] {
  const dir = join(ROOT, "dsh")
  return readdirSync(dir)
    .filter((name) => /\.(?:js|cjs|mjs)$/.test(name))
    .sort()
}

function walkSrcTs(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkSrcTs(abs))
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue
    out.push(abs)
  }
  return out
}

function rel(abs: string): string {
  return relative(ROOT, abs).split("\\").join("/")
}

function isSharpAllowedSrc(pathRel: string): boolean {
  return pathRel === "src/platform/node.ts" || pathRel === "src/cli.ts" || pathRel.startsWith("src/cli/")
}

function lineAt(source: string, index: number): string {
  const start = source.lastIndexOf("\n", index) + 1
  const end = source.indexOf("\n", index)
  return source.slice(start, end === -1 ? undefined : end)
}

function isLegalSharpUse(line: string): boolean {
  if (/^\s*import\s+type\b/.test(line) && /\bfrom\s+['"]sharp['"]/.test(line)) return true
  if (/\bimport\s*\(\s*['"]sharp['"]\s*\)/.test(line)) return true
  return false
}

function functionSource(source: string, name: string): string {
  const needle = `function ${name}(`
  const start = source.indexOf(needle)
  if (start < 0) throw new Error(`missing function ${name}`)
  const brace = source.indexOf("{", start)
  let depth = 0
  for (let i = brace; i < source.length; i++) {
    const ch = source[i]
    if (ch === "{") depth += 1
    else if (ch === "}") {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`unclosed function ${name}`)
}

function resolveRelativeImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null
  const base = join(dirname(fromFile), spec)
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

function indexClosureFiles(): string[] {
  const start = join(ROOT, "src/index.ts")
  const seen = new Set<string>()
  const queue = [start]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    const source = readFileSync(file, "utf8")
    for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const resolved = resolveRelativeImport(file, match[1]!)
      if (resolved) queue.push(resolved)
    }
  }
  return [...seen]
}

describe("dsh plugin never loads sharp in the host process", () => {
  it("publishes plugin JS under dsh/ with no sharp module specifier", () => {
    const files = pluginJsFiles()
    expect(files.length).toBeGreaterThan(0)
    expect(files).toEqual(expect.arrayContaining(["index.js", "preview-tool.js"]))

    for (const name of files) {
      const source = readFileSync(join(ROOT, "dsh", name), "utf8")
      expect(source.match(SHARP_SPECIFIER), `${name} must not import or require sharp`).toBeNull()
    }
  })

  it("does not import dist/cli.js, dist/node.js, or dist/index.js as a module", () => {
    for (const name of pluginJsFiles()) {
      const source = readFileSync(join(ROOT, "dsh", name), "utf8")
      expect(source.match(DIST_MODULE_SPECIFIER), `${name} must not import the render/CLI as a module`).toBeNull()
    }
  })
})

describe("optional sharp tracks the 0.35 line", () => {
  it("package.json optionalDependencies.sharp is ^0.35 and does not accept 0.34", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      optionalDependencies?: { sharp?: string }
    }
    const range = pkg.optionalDependencies?.sharp
    expect(range).toMatch(/^\^0\.35(\.\d+)?$/)
    expect(range).not.toMatch(/0\.34/)
  })
})

describe("runtime sharp loads in src are lazy", () => {
  it("only type-only or dynamic sharp specifiers exist, and only under the Node platform / CLI", () => {
    const files = walkSrcTs(join(ROOT, "src"))
    expect(files.length).toBeGreaterThan(0)

    for (const abs of files) {
      const pathRel = rel(abs)
      const source = readFileSync(abs, "utf8")
      for (const match of source.matchAll(SHARP_SPECIFIER)) {
        const line = lineAt(source, match.index ?? 0)
        expect(
          isSharpAllowedSrc(pathRel),
          `${pathRel}: sharp specifier is only legal in src/platform/node.ts and src/cli*: ${line.trim()}`,
        ).toBe(true)
        expect(
          isLegalSharpUse(line),
          `${pathRel}: sharp must be import type or import("sharp"), not a runtime static import: ${line.trim()}`,
        ).toBe(true)
      }
    }
  })

  it("src/index.ts dependency closure has no sharp specifier", () => {
    for (const abs of indexClosureFiles()) {
      const pathRel = rel(abs)
      const source = readFileSync(abs, "utf8")
      expect(source.match(SHARP_SPECIFIER), `${pathRel} is on the src/index.ts closure and must not load sharp`).toBeNull()
    }
  })
})

describe("CLI child isolation in dsh/preview-tool.js", () => {
  const previewTool = readFileSync(join(ROOT, "dsh/preview-tool.js"), "utf8")
  const originalNpmNode = process.env.npm_node_execpath
  const originalElectronRunAsNode = process.env.ELECTRON_RUN_AS_NODE
  const electronDesc = Object.getOwnPropertyDescriptor(process.versions, "electron")

  afterEach(() => {
    if (originalNpmNode === undefined) delete process.env.npm_node_execpath
    else process.env.npm_node_execpath = originalNpmNode
    if (originalElectronRunAsNode === undefined) delete process.env.ELECTRON_RUN_AS_NODE
    else process.env.ELECTRON_RUN_AS_NODE = originalElectronRunAsNode
    if (electronDesc) {
      Object.defineProperty(process.versions, "electron", electronDesc)
    } else {
      delete (process.versions as { electron?: string }).electron
    }
  })

  it("exports resolveCliCommand and cliChildEnv on __testing only", () => {
    expect(typeof __testing.resolveCliCommand).toBe("function")
    expect(typeof __testing.cliChildEnv).toBe("function")
  })

  it("runCli spawns resolveCliCommand with cliChildEnv, and never import()s the CLI", () => {
    const body = functionSource(previewTool, "runCli")
    expect(body).toMatch(/\bspawn\s*\(\s*resolveCliCommand\s*\(\s*\)/)
    expect(body).toMatch(/\benv\s*:\s*cliChildEnv\s*\(\s*\)/)
    expect(body).not.toMatch(/\bimport\s*\(/)
    expect(body).not.toMatch(/spawn\s*\(\s*process\.execPath/)
  })

  it("uses process.execPath when not running inside Electron", () => {
    delete (process.versions as { electron?: string }).electron
    expect(__testing.resolveCliCommand()).toBe(process.execPath)
  })

  it("uses a real Node binary when process.versions.electron is set", () => {
    Object.defineProperty(process.versions, "electron", {
      value: "2.0.0",
      configurable: true,
      enumerable: true,
      writable: true,
    })
    process.env.npm_node_execpath = "/usr/local/bin/node"
    expect(__testing.resolveCliCommand()).toBe("/usr/local/bin/node")
    delete process.env.npm_node_execpath
    expect(__testing.resolveCliCommand()).toBe("node")
    expect(__testing.resolveCliCommand()).not.toBe(process.execPath)
  })

  it("always sets ELECTRON_RUN_AS_NODE to 1 on the child env without mutating process.env", () => {
    process.env.ELECTRON_RUN_AS_NODE = "0"
    const env = __testing.cliChildEnv() as NodeJS.ProcessEnv
    expect(env.ELECTRON_RUN_AS_NODE).toBe("1")
    expect(process.env.ELECTRON_RUN_AS_NODE).toBe("0")
    expect(env).not.toBe(process.env)
  })
})
