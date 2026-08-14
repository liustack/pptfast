// @vitest-environment node
//
// Node environment on purpose: dsh/index.js resolves its skill/CLI paths
// with `new URL(..., import.meta.url)` + `fileURLToPath` at module scope,
// which the repo-default jsdom environment breaks (jsdom swaps global URL —
// same reason plugin-manifest.test.ts reads files by process.cwd()).
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// The plugin is plain dependency-free JS by design (no build step, no dsh
// type imports) — see dsh/index.js's own header comment.
// @ts-expect-error untyped on purpose
import * as plugin from "../dsh/index.js"

// The real render core, fed through the plugin's `config.core` DI seam
// (production resolves ../dist instead — dist/ is gitignored and absent in
// CI's `pnpm check`, so tests must not depend on it). The surface matches
// dsh/index.js's CORE_SURFACE list.
import * as api from "./api"
import { resolveLocalAssets } from "./cli/load-ir"
import { installNodePlatform } from "./platform/node"
import { CANONICAL_THEME_IDS } from "./themes"
import { getInstalledThemeIds } from "./themes/definitions"

const testCore = { ...api, getInstalledThemeIds, resolveLocalAssets, installNodePlatform }

const ROOT = process.cwd()

/** DSH rc.6's skill-name grammar (dsh-skill/lib/index.js SKILL_NAME). */
const DSH_SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Built-in DSH rc.6 skill names (naming-discipline check — the modlens
 *  read_image collision lesson): dsh-skill-badge's provider skill plus the
 *  two cordis-preset skills. */
const DSH_BUILTIN_SKILLS = ["dsh-badge", "cordis-plugin-development", "editing-cordis-compositions"]

interface Registration {
  name: string
  description: string
  source: string
  content: string
  path: string
  resourceBase: { kind: string; path: string }
}

function applyWithFakeCtx(overrides: { register?: (r: Registration) => () => void } = {}) {
  const registered: Registration[] = []
  const register =
    overrides.register ??
    ((r: Registration) => {
      registered.push(r)
      return () => registered.splice(registered.indexOf(r), 1)
    })
  // Only the inject-declared services exist on the fake (`skills`, `tools`)
  // plus `ctx.get` (the optional-service lookup the render tool's preview
  // path probes) — the plugin must not touch anything else.
  plugin.apply({ skills: { register }, tools: { register: () => () => {} }, get: () => undefined })
  return registered
}

/** dsh-tools ToolDefinition as far as this plugin exercises it. */
interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render: (args: unknown, value: never) => Array<{ type: string; text?: string; attachment?: Record<string, unknown> }>
  }
  timeoutMs?: number
  isConcurrencySafe?: () => boolean
  presentCall?: (args: unknown) => { card: string; title: string; kind?: string }
  execute: (args: unknown, exec: FakeExec) => Promise<Record<string, unknown>>
}

interface FakeExec {
  signal: AbortSignal
  agent?: unknown
  parent?: unknown
}

function toolsWithFakeCtx(ctxOverrides: Record<string, unknown> = {}, core: unknown = testCore) {
  const defs: ToolDefinition[] = []
  const ctx = {
    skills: { register: () => () => {} },
    tools: {
      register: (d: ToolDefinition) => {
        defs.push(d)
        return () => defs.splice(defs.indexOf(d), 1)
      },
    },
    get: () => undefined,
    ...ctxOverrides,
  }
  plugin.apply(ctx, { core })
  return Object.fromEntries(defs.map((d) => [d.name, d])) as Record<string, ToolDefinition>
}

function fakeExec(overrides: Partial<FakeExec> = {}): FakeExec {
  return { signal: new AbortController().signal, ...overrides }
}

function basicIr(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, "examples/basic.json"), "utf8")) as Record<string, unknown>
}

function renderText(def: ToolDefinition, value: unknown): string {
  const blocks = def.output.render(undefined, value as never)
  return blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
}

describe("dsh plugin (skill registration, v0)", () => {
  it("exports the Cordis plugin shape: name, inject, apply", () => {
    expect(plugin.name).toBe("pptfast")
    expect(plugin.inject).toEqual(["skills", "tools"])
    expect(typeof plugin.apply).toBe("function")
  })

  it("registers exactly one skill named pptfast, valid under DSH's name grammar and clear of built-ins", () => {
    const registered = applyWithFakeCtx()
    expect(registered).toHaveLength(1)
    expect(registered[0]!.name).toBe("pptfast")
    expect(registered[0]!.name).toMatch(DSH_SKILL_NAME)
    expect(DSH_BUILTIN_SKILLS).not.toContain(registered[0]!.name)
  })

  it("registers the real SKILL.md's description and frontmatter-free body", () => {
    const [reg] = applyWithFakeCtx()
    const raw = readFileSync(join(ROOT, "skills/pptfast/SKILL.md"), "utf8")
    const description = raw.match(/^description:\s*(.+)$/m)![1]!.trim()
    expect(reg!.description).toBe(description)
    // content = preamble + body: never the frontmatter (DSH's runtime
    // registry treats content as body verbatim, no frontmatter parsing)
    expect(reg!.content).not.toMatch(/^---/m)
    expect(reg!.content).not.toContain("name: pptfast")
    expect(reg!.content).toContain("# pptfast — deck generation playbook")
    expect(reg!.source).toBe("bundled")
  })

  it("prepends the DSH runtime preamble mapping `pptfast` onto the package's own CLI (核实 B: profile .bin never enters PATH)", () => {
    const [reg] = applyWithFakeCtx()
    // The preamble comes first — the model must read the command mapping
    // before any `pptfast <cmd>` instruction in the body.
    expect(reg!.content.startsWith("## DSH runtime note")).toBe(true)
    const cliPath = reg!.content.match(/node "([^"]+)" <args>/)?.[1]
    expect(cliPath, "preamble must carry an absolute node invocation of the packaged CLI").toBeTruthy()
    expect(cliPath!.endsWith(join("dist", "cli.js"))).toBe(true)
    expect(cliPath!.startsWith("/") || /^[A-Za-z]:[\\/]/.test(cliPath!)).toBe(true)
    // npx fallback stays documented for a missing dist
    expect(reg!.content).toContain("npx -y @liustack/pptfast")
  })

  it("points path/resourceBase at the shipped skill directory", () => {
    const [reg] = applyWithFakeCtx()
    expect(reg!.path.endsWith(join("skills", "pptfast", "SKILL.md"))).toBe(true)
    expect(reg!.resourceBase.kind).toBe("directory")
    expect(reg!.resourceBase.path.replace(/[\\/]$/, "").endsWith(join("skills", "pptfast"))).toBe(true)
  })

  it("holds no module-level registration state — a fiber teardown + re-apply registers cleanly (Cordis reversibility)", () => {
    // register() rides a Cordis effect on the calling fiber, so unload
    // reverses it host-side; the plugin's own obligation is to keep apply
    // idempotent-per-context with no cross-apply memoization.
    expect(applyWithFakeCtx()).toHaveLength(1)
    expect(applyWithFakeCtx()).toHaveLength(1)
  })

  it("degrades loudly instead of throwing when the registry rejects the skill", () => {
    const errors: string[] = []
    const spy = vi.spyOn(console, "error").mockImplementation((msg: string) => {
      errors.push(String(msg))
    })
    try {
      expect(() =>
        applyWithFakeCtx({
          register: () => {
            throw new Error("duplicate name")
          },
        }),
      ).not.toThrow()
      expect(errors.some((e) => e.includes("[pptfast] skill registration skipped"))).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it("parseSkillMarkdown rejects frontmatter-less and description-less input", () => {
    expect(() => plugin.parseSkillMarkdown("# no frontmatter")).toThrow(/frontmatter/)
    expect(() => plugin.parseSkillMarkdown("---\nname: x\n---\nbody")).toThrow(/description/)
    expect(() => plugin.parseSkillMarkdown("---\ndescription: d\n---\n\n")).toThrow(/empty body/)
  })
})

describe("dsh plugin bundle manifest", () => {
  function readJson(rel: string): Record<string, unknown> {
    return JSON.parse(readFileSync(join(ROOT, rel), "utf8"))
  }

  it("wires the package root export to the plugin and the bundle manifest to the patch", () => {
    const pkg = readJson("package.json") as {
      main?: string
      exports?: Record<string, unknown>
      dsh?: { bundle?: { patch?: string } }
      files?: string[]
      keywords?: string[]
    }
    expect(pkg.exports?.["."]).toBe("./dsh/index.js")
    expect(pkg.main).toBe("./dsh/index.js")
    expect(pkg.dsh?.bundle?.patch).toBe("./cordis.patch.yml")
    expect(pkg.files).toContain("dsh")
    expect(pkg.files).toContain("cordis.patch.yml")
    // the plugin reads SKILL.md at runtime from the installed package
    expect(pkg.files).toContain("skills/pptfast/SKILL.md")
    expect(pkg.keywords).toEqual(expect.arrayContaining(["dsh", "dsh-plugin"]))
  })

  it("cordis.patch.yml mounts the plugin under the scoped package name (card shows 'pptfast')", () => {
    const patch = readFileSync(join(ROOT, "cordis.patch.yml"), "utf8")
    expect(patch).toContain("name: '@liustack/pptfast'")
    expect(patch).toContain("id: pptfast")
  })
})

/** Built-in DSH rc.6 tool names (grepped from every dsh-tool-* package's
 *  registrations, plus the reserved Code Mode transport) — the modlens
 *  read_image collision lesson, applied to tools this time. */
const DSH_BUILTIN_TOOLS = [
  "ask_user_question",
  "bash",
  "pwsh",
  "read",
  "read_image",
  "write",
  "edit",
  "glob",
  "grep",
  "str_replace_editor",
  "todo_write",
  "web_fetch",
  "web_search",
  "skill",
  "send_message",
  "interrupt_agent",
  "job_kill",
  "job_list",
  "job_output",
  "create_goal",
  "get_goal",
  "update_goal",
  "ralph",
  "cordis_define",
  "cordis_undefine",
  "cordis_run",
  "cordis_stop",
  "cordis_inspect_list",
  "cordis_inspect_query",
  "cordis_inspect_self",
  "run_code",
]

describe("dsh plugin tools (v1): registration", () => {
  it("registers exactly the three pptfast_-prefixed tools, clear of every DSH built-in name", () => {
    const defs = toolsWithFakeCtx()
    expect(Object.keys(defs).sort()).toEqual([...plugin.TOOL_NAMES].sort())
    for (const name of Object.keys(defs)) {
      expect(name).toMatch(/^pptfast_/)
      expect(DSH_BUILTIN_TOOLS).not.toContain(name)
    }
  })

  it("every tool carries the raw-registration contract: description, parameters, output {schema, render}, execute", () => {
    const defs = toolsWithFakeCtx()
    for (const def of Object.values(defs)) {
      expect(def.description.length).toBeGreaterThan(20)
      expect(def.parameters).toMatchObject({ type: "object" })
      expect(typeof def.output.render).toBe("function")
      expect(def.output.schema).toMatchObject({ type: "object" })
      expect(typeof def.execute).toBe("function")
      // PTC-friendly: parallel-safe, pure-JSON params, no callbacks in the schema
      expect(def.isConcurrencySafe?.()).toBe(true)
    }
  })

  it("parameter schemas are stable (model-facing contract snapshot)", () => {
    const defs = toolsWithFakeCtx()
    expect(defs.pptfast_validate!.parameters).toMatchSnapshot("pptfast_validate parameters")
    expect(defs.pptfast_render!.parameters).toMatchSnapshot("pptfast_render parameters")
    expect(defs.pptfast_themes!.parameters).toMatchSnapshot("pptfast_themes parameters")
  })

  it("holds no cross-apply state: a second apply registers three fresh tools (Cordis reversibility)", () => {
    expect(Object.keys(toolsWithFakeCtx())).toHaveLength(3)
    expect(Object.keys(toolsWithFakeCtx())).toHaveLength(3)
  })

  it("degrades loudly instead of throwing when the tool registry rejects a registration", () => {
    const errors: string[] = []
    const spy = vi.spyOn(console, "error").mockImplementation((msg: string) => {
      errors.push(String(msg))
    })
    try {
      expect(() =>
        plugin.apply(
          {
            skills: { register: () => () => {} },
            tools: {
              register: () => {
                throw new Error("duplicate name")
              },
            },
            get: () => undefined,
          },
          { core: testCore },
        ),
      ).not.toThrow()
      expect(errors.filter((e) => e.includes("registration skipped: Error: duplicate name"))).toHaveLength(3)
    } finally {
      spy.mockRestore()
    }
  })

  it("a broken engine surface fails the tool call with an actionable message, not the plugin load", async () => {
    const defs = toolsWithFakeCtx({}, { validateIr: () => ({}) })
    await expect(defs.pptfast_themes!.execute({}, fakeExec())).rejects.toThrow(/render engine is missing .*reinstall @liustack\/pptfast/)
  })
})

describe("dsh plugin tools: pptfast_validate", () => {
  it("accepts examples/basic.json and reports slide count + theme", async () => {
    const defs = toolsWithFakeCtx()
    const value = await defs.pptfast_validate!.execute({ ir: basicIr() }, fakeExec())
    expect(value).toMatchObject({ ok: true, slides: 5, theme: "consulting" })
    expect(renderText(defs.pptfast_validate!, value)).toContain('IR valid — 5 slide(s), theme "consulting".')
  })

  it("compresses an invalid IR into short path-annotated fix lines, never a zod error tree", async () => {
    const defs = toolsWithFakeCtx()
    const ir = basicIr()
    ;(ir.slides as Record<string, unknown>[])[2]!.components = [{ type: "no_such_component" }]
    ir.theme = { id: "consulting" }
    const value = await defs.pptfast_validate!.execute({ ir }, fakeExec())
    expect(value.ok).toBe(false)
    const errors = value.errors as string[]
    expect(errors.length).toBeGreaterThan(0)
    for (const line of errors) {
      expect(line.length).toBeLessThan(400)
      expect(line).not.toContain("ZodError")
    }
    // page-scoped issues carry the CLI's own `page N — path: message` shape
    expect(errors.join("\n")).toMatch(/page 3 — slides\.2/)
    expect(renderText(defs.pptfast_validate!, value)).toContain("IR invalid — fix these and retry:")
  })

  it("rejects a missing/non-object ir argument with a usable message", async () => {
    const defs = toolsWithFakeCtx()
    await expect(defs.pptfast_validate!.execute({}, fakeExec())).rejects.toThrow(/needs an "ir" object/)
    await expect(defs.pptfast_validate!.execute({ ir: "not an object" }, fakeExec())).rejects.toThrow(/needs an "ir" object/)
  })

  it("issueLines caps a pathological issue list", () => {
    const issues = Array.from({ length: 40 }, (_, i) => ({ path: `slides.${i}`, message: `problem ${i}` }))
    const lines = plugin.issueLines(testCore, issues)
    expect(lines).toHaveLength(26)
    expect(lines.at(-1)).toContain("and 15 more issue(s)")
  })
})

describe("dsh plugin tools: pptfast_themes", () => {
  it("lists all 17 canonical themes with a distinct one-line description each", async () => {
    const defs = toolsWithFakeCtx()
    const value = await defs.pptfast_themes!.execute({}, fakeExec())
    const themes = value.themes as Array<{ id: string; label: string; description: string }>
    expect(themes.map((t) => t.id)).toEqual([...CANONICAL_THEME_IDS])
    for (const t of themes) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.description.length, `theme ${t.id} needs a real character note`).toBeGreaterThan(20)
      expect(t.description, `theme ${t.id} fell back to its label — add it to THEME_NOTES`).not.toBe(t.label)
    }
    const text = renderText(defs.pptfast_themes!, value)
    expect(text.split("\n")).toHaveLength(17)
    expect(text).toContain("consulting (Business Consulting):")
  })

  it("THEME_NOTES covers exactly the canonical theme ids (a new theme must add its note)", () => {
    expect(Object.keys(plugin.THEME_NOTES).sort()).toEqual([...CANONICAL_THEME_IDS].sort())
  })
})

describe("dsh plugin tools: pptfast_render", () => {
  let outDir: string
  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), "pptfast-dsh-render-"))
  })
  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true })
  })

  it("renders basic.json to pptx + per-page SVG previews, deterministically under a fixed seed", async () => {
    const defs = toolsWithFakeCtx()
    const args = { ir: basicIr(), seed: 7, out_dir: outDir }
    const value = await defs.pptfast_render!.execute(args, fakeExec())
    expect(value).toMatchObject({ slides: 5, theme: "consulting", seed: 7 })
    const pptxPath = value.pptx_path as string
    expect(pptxPath).toBe(join(outDir, "pptfast-basic-demo.pptx"))
    expect(existsSync(pptxPath)).toBe(true)
    expect(value.pptx_bytes as number).toBeGreaterThan(10_000)
    const previews = value.preview_paths as string[]
    expect(previews).toHaveLength(5)
    expect(previews[0]).toBe(join(outDir, "pptfast-basic-demo-previews", "001-cover.svg"))
    for (const p of previews) expect(existsSync(p)).toBe(true)
    expect(readFileSync(previews[0]!, "utf8")).toContain("<svg")
    // no attachment service on the fake ctx → degrade note, never a failure
    expect(value.preview_image).toBeUndefined()
    expect(String(value.preview_note)).toContain("first-page preview not attached")
    // determinism: same IR + seed + theme → byte-identical pptx
    const first = readFileSync(pptxPath)
    const again = await defs.pptfast_render!.execute(args, fakeExec())
    expect(readFileSync(again.pptx_path as string).equals(first)).toBe(true)
    const text = renderText(defs.pptfast_render!, value)
    expect(text).toContain(`wrote ${pptxPath} (5 slide(s), ${value.pptx_bytes} bytes, theme "consulting", seed 7)`)
  })

  it("theme override swaps ir.theme.id; an unknown theme fails fast listing the installed ids", async () => {
    const defs = toolsWithFakeCtx()
    const value = await defs.pptfast_render!.execute({ ir: basicIr(), theme: "tech", out_dir: outDir }, fakeExec())
    expect(value.theme).toBe("tech")
    await expect(defs.pptfast_render!.execute({ ir: basicIr(), theme: "no-such-theme", out_dir: outDir }, fakeExec())).rejects.toThrow(
      /unknown theme "no-such-theme" — available: .*consulting/,
    )
  })

  it("an invalid IR fails the call with the compressed fix list", async () => {
    const defs = toolsWithFakeCtx()
    const ir = basicIr()
    ;(ir.slides as unknown[]).length = 0
    await expect(defs.pptfast_render!.execute({ ir, out_dir: outDir }, fakeExec())).rejects.toThrow(/IR invalid — fix these and retry:/)
  })

  it("does not mutate the caller's ir argument (theme/seed apply to a clone)", async () => {
    const defs = toolsWithFakeCtx()
    const ir = basicIr()
    Object.freeze(ir)
    const value = await defs.pptfast_render!.execute({ ir, theme: "tech", seed: 3, out_dir: outDir }, fakeExec())
    expect(value.theme).toBe("tech")
    expect((ir.theme as { id: string }).id).toBe("consulting")
    expect(ir).not.toHaveProperty("seed")
  })

  it("attaches the first-page preview through attachments.saveImage when the route declares image input (write-side {data, mediaType, name} contract)", async () => {
    const saved: Array<{ data: Uint8Array; mediaType: string; name?: string }> = []
    const services: Record<string, unknown> = {
      attachments: {
        imageLimits: {
          mediaTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
          maxImageBytes: 10 * 1024 * 1024,
          maxMessageImageBytes: 10 * 1024 * 1024,
        },
        saveImage: async (input: { data: Uint8Array; mediaType: string; name?: string }) => {
          saved.push(input)
          return {
            attachmentId: "att-1",
            mediaType: input.mediaType,
            bytes: input.data.length,
            width: 1280,
            height: 720,
            ...(input.name === undefined ? {} : { name: input.name }),
          }
        },
      },
      llm: {
        resolveModelInfo: async () => ({ inputModalities: ["text", "image"] }),
      },
    }
    const defs = toolsWithFakeCtx({ get: (name: string) => services[name] })
    const exec = fakeExec({
      agent: {
        session: { header: { cwd: outDir }, requestHeader: () => ({ config: { provider: "p", model: "m" } }) },
        options: {},
      },
    })
    const value = await defs.pptfast_render!.execute({ ir: basicIr(), out_dir: outDir }, exec)
    expect(saved).toHaveLength(1)
    expect(saved[0]!.mediaType).toBe("image/png")
    expect(saved[0]!.name).toBe("pptfast-basic-demo-page-1.png")
    // PNG magic bytes — the attachment write side gets a real raster, not SVG text
    expect(Array.from(saved[0]!.data.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(value.preview_image).toMatchObject({ attachmentId: "att-1", mediaType: "image/png", width: 1280, height: 720 })
    expect(value.preview_note).toBeUndefined()
    // the rendered content carries the image block beside the text summary
    const blocks = defs.pptfast_render!.output.render(undefined, value as never)
    expect(blocks.at(-1)).toMatchObject({ type: "image", attachment: { attachmentId: "att-1" } })
  })

  it("degrades to preview paths when the resolved route is text-only (the read_image gate, mirrored)", async () => {
    const services: Record<string, unknown> = {
      attachments: { imageLimits: { mediaTypes: ["image/png"], maxImageBytes: 1e7, maxMessageImageBytes: 1e7 }, saveImage: async () => ({}) },
      llm: { resolveModelInfo: async () => ({ inputModalities: ["text"] }) },
    }
    const defs = toolsWithFakeCtx({ get: (name: string) => services[name] })
    const exec = fakeExec({
      agent: {
        session: { header: { cwd: outDir }, requestHeader: () => ({ config: { provider: "p", model: "m" } }) },
        options: {},
      },
    })
    const value = await defs.pptfast_render!.execute({ ir: basicIr(), out_dir: outDir }, exec)
    expect(value.preview_image).toBeUndefined()
    expect(String(value.preview_note)).toContain("does not declare image input")
  })

  it("defaults out_dir to the session workspace directory (session.header.cwd)", async () => {
    const wsDir = mkdtempSync(join(tmpdir(), "pptfast-dsh-ws-"))
    try {
      const defs = toolsWithFakeCtx()
      const exec = fakeExec({ agent: { session: { header: { cwd: wsDir } }, options: {} } })
      const value = await defs.pptfast_render!.execute({ ir: basicIr() }, exec)
      expect(value.pptx_path).toBe(join(wsDir, "pptfast-basic-demo.pptx"))
      expect(existsSync(value.pptx_path as string)).toBe(true)
    } finally {
      rmSync(wsDir, { recursive: true, force: true })
    }
  })
})
