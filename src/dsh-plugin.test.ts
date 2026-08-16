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
    // `tools` joined `skills` when the preview tool landed: the skill teaches
    // the model to drive the CLI, and the tool is what gives pptfast a card of
    // its own to preview into.
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

/**
 * The plugin half is plain dependency-free JS by design (see dsh/index.js's
 * own header), so it carries no declaration file. Same `@ts-expect-error`
 * idiom the plugin import above already uses, in one place.
 */
async function loadPreviewTool(): Promise<{
  definePreviewTool: (cliPath: string) => {
    name: string
    description: string
    output: {
      render: (a: unknown, v: unknown) => { type: string; text: string }[]
      presentationMeta: (a: unknown, v: unknown) => { card: string; bundle: { pages: unknown[] } }
    }
  }
}> {
  // @ts-expect-error untyped on purpose
  return import("../dsh/preview-tool.js")
}

describe("pptfast_preview tool", () => {
  it("shows the model one line and the card the whole deck", async () => {
    // The split this tool exists for. A deck's markup is tens of kilobytes
    // and tells the model nothing it can act on, so it rides
    // `presentationMeta` (persisted, card-facing) while the model gets a
    // summary. Putting the deck in the model-facing content instead would
    // spend the context window on SVG.
    const { definePreviewTool } = await loadPreviewTool()
    const tool = definePreviewTool("/does/not/run/here.js")
    const value = {
      outDir: "/tmp/x",
      pageCount: 9,
      findingCount: 0,
      audited: true,
      bundle: { pages: [{ id: "page-001", svg: "<svg/>" }] },
    }

    const modelText = tool.output.render({}, value)[0]!.text
    expect(modelText).toContain("9 pages")
    expect(modelText).toContain("audit clean")
    expect(modelText).not.toContain("<svg")

    const meta = tool.output.presentationMeta({}, value)
    expect(meta.card).toBe("pptfast-preview")
    expect(meta.bundle.pages).toHaveLength(1)
  })

  it("never reports an unaudited deck as clean", async () => {
    // `checks` absent means the audit never ran (a deck with placeholder
    // pages). The preview manifest keeps "ran and found nothing" apart from
    // "never ran" on purpose; collapsing them here would undo that.
    const { definePreviewTool } = await loadPreviewTool()
    const tool = definePreviewTool("/x.js")
    const text = tool.output.render({}, {
      outDir: "/tmp/x",
      pageCount: 3,
      findingCount: 0,
      audited: false,
      bundle: { pages: [] },
    })[0]!.text
    expect(text).toContain("audit skipped")
    expect(text).not.toContain("clean")
  })

  it("tells the model not to fall back to handing over a URL", async () => {
    // The behaviour this whole tool exists to replace.
    const { definePreviewTool } = await loadPreviewTool()
    expect(definePreviewTool("/x.js").description).toMatch(/preview URL/)
  })
})

/**
 * Load the browser half the way the DSH shell does: evaluating the bundle
 * registers a factory with the module loader, and the factory runs at
 * materialization with a `require` the shell supplies. The module evaluates
 * once, so the registration is captured once and the factory — which is
 * re-runnable by design — is called per test with its own `require`.
 */
type ClientBundle = {
  apply: (ctx: unknown) => void
  inject: string[]
  __testing: {
    TOOL_NAME: string
    bundleOf: (block: unknown) => { pages: unknown[] } | null
    namespaceIds: (svg: string, prefix: string) => string
    drawablePages: (bundle: { pages: { svg?: string | null }[] }) => unknown[]
  }
}

let clientFactory: ((r: (id: string) => unknown) => ClientBundle) | undefined

async function loadClientBundle(requireImpl: (id: string) => unknown): Promise<ClientBundle> {
  if (!clientFactory) {
    let registered: { id: string; factory: (r: (id: string) => unknown) => ClientBundle } | undefined
    ;(globalThis as { window?: unknown }).window = {
      __ModuleLoader__: { load: (r: typeof registered) => { registered = r } },
    }
    // @ts-expect-error untyped on purpose, same as the host half
    await import("../dsh/client.js")
    if (!registered) throw new Error("client bundle registered no factory")
    expect(registered.id).toBe("@liustack/pptfast")
    clientFactory = registered.factory
  }
  return clientFactory(requireImpl)
}

const fakeReact = {
  createElement: () => null,
  useState: () => [0, () => {}],
  useEffect: () => {},
  useRef: () => ({}),
}

describe("pptfast preview card (browser half)", () => {
  it("claims the tool.call.toolview key its own tool registers under", async () => {
    // The card and the tool have to agree on one wire name; a typo here
    // simply never renders, which is silent — so it is pinned from both
    // sides against the same constant.
    let spec: { name?: string; key?: string } | undefined
    const bundle = await loadClientBundle((id) => (id === "react" ? fakeReact : {}))
    bundle.apply({
      slots: {
        inject: (_name: string, gen: () => Iterable<unknown>) => {
          for (const _ of gen()) { /* drain the generator */ }
        },
        register: (s: { name: string; key: string }) => { spec = s },
      },
    })
    expect(spec).toEqual({ name: "tool.call.toolview", key: "pptfast_preview" })
    expect(bundle.__testing.TOOL_NAME).toBe("pptfast_preview")
  })

  it("degrades to a console line rather than taking the turn down with it", async () => {
    // A card that throws would break rendering for the whole conversation
    // turn, so both absences it can actually meet are survivable: a shell
    // with no slot service, and one where react is not resolvable.
    const noReact = await loadClientBundle((id) => {
      if (id === "react") throw new Error("react unavailable")
      return {}
    })
    expect(() => noReact.apply({})).not.toThrow()
    expect(() => noReact.apply({ slots: { inject: () => {} } })).not.toThrow()
  })

  it("namespaces each slide's ids so several in one DOM cannot cross-wire", async () => {
    // Same defect `src/lib/svg-ids.ts` documents: every slide is a standalone
    // document whose ids are only unique inside itself, and this card mounts
    // several into one page.
    const bundle = await loadClientBundle(() => ({}))
    const out = bundle.__testing.namespaceIds(
      '<svg><linearGradient id="sky"/><rect fill="url(#sky)"/></svg>',
      "p2-",
    )
    expect(out).toContain('id="p2-sky"')
    expect(out).toContain("url(#p2-sky)")
    expect(out).not.toContain('id="sky"')
  })

  it("falls through to the generic card instead of throwing on an unrecognized result", async () => {
    const bundle = await loadClientBundle(() => ({}))
    expect(bundle.__testing.bundleOf({})).toBeNull()
    expect(bundle.__testing.bundleOf(undefined)).toBeNull()
    expect(
      bundle.__testing.bundleOf({ meta: { card: "pptfast-preview", bundle: { pages: [{ id: "a" }] } } }),
    ).toEqual({ pages: [{ id: "a" }] })
  })

  it("skips pages an oversized deck shipped without markup", async () => {
    const bundle = await loadClientBundle(() => ({}))
    expect(
      bundle.__testing.drawablePages({ pages: [{ svg: "<svg/>" }, { svg: null }, { svg: "" }] }),
    ).toHaveLength(1)
  })
})

describe("preview payload channel", () => {
  it("carries the preview id in model-facing text, because that is what a sub-call keeps", async () => {
    // `presentationMeta` is computed for top-level calls only, and this
    // repo's default agent preset runs Code Mode, where every tool is
    // invoked from inside `run_code` and is therefore a sub-call. Verified
    // against a real session log: 34 top-level `run_code` calls, no
    // `pptfast_preview` among them, and no presentationMeta persisted at
    // all — the card rendered nothing and nothing said why. The id in the
    // result text is the channel that survives.
    const { definePreviewTool } = await loadPreviewTool()
    const text = definePreviewTool("/x.js").output.render({}, {
      previewId: "abc-123",
      outDir: "/tmp/x",
      pageCount: 4,
      findingCount: 0,
      audited: true,
      bundle: { pages: [] },
    })[0]!.text
    expect(text).toContain("pptfast-preview:abc-123")
    expect(text).not.toContain("<svg")
  })

  it("reads that id back out of a result block the way the card does", async () => {
    const bundle = await loadClientBundle(() => ({}))
    const idOf = (bundle.__testing as unknown as { previewIdOf: (b: unknown) => string | null }).previewIdOf
    expect(idOf({ content: [{ type: "text", text: "pptfast-preview:abc-123 · rendered 4 pages" }] })).toBe("abc-123")
    expect(idOf({ result: { content: [{ text: "pptfast-preview:zz-9" }] } })).toBe("zz-9")
    expect(idOf({ content: [{ type: "text", text: "no id here" }] })).toBeNull()
    expect(idOf({})).toBeNull()
  })
})
