// @vitest-environment node
//
// Node environment on purpose: dsh/index.js resolves its skill/CLI paths
// with `new URL(..., import.meta.url)` + `fileURLToPath` at module scope,
// which the repo-default jsdom environment breaks (jsdom swaps global URL —
// same reason plugin-manifest.test.ts reads files by process.cwd()).
import { readFileSync } from "node:fs"
import { join } from "node:path"

// The plugin is plain dependency-free JS by design (no build step, no dsh
// type imports) — see dsh/index.js's own header comment.
// @ts-expect-error untyped on purpose
import * as plugin from "../dsh/index.js"

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
  // Only `skills.register` exists on the fake — the plugin declares
  // inject: ['skills'] and must not touch any other service.
  plugin.apply({ skills: { register } })
  return registered
}

describe("dsh plugin (skill registration, v0)", () => {
  it("exports the Cordis plugin shape: name, inject, apply", () => {
    expect(plugin.name).toBe("pptfast")
    expect(plugin.inject).toEqual(["skills"])
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
