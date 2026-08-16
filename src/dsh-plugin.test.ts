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
interface PreviewEntry {
  bundle?: unknown
  target: string
  outDir: string
  snapshot?: string
  themeFile?: string
}

interface PreviewService {
  tool: {
    name: string
    description: string
    output: {
      render: (a: unknown, v: unknown) => { type: string; text: string }[]
      presentationMeta: (a: unknown, v: unknown) => { card: string; bundle: { pages: unknown[] } }
    }
  }
  registerRoute: (ctx: unknown) => void
  remember: (id: string, entry: PreviewEntry) => Promise<void>
  recall: (id: string) => PreviewEntry | undefined
  recallAnywhere: (id: string) => Promise<PreviewEntry | undefined>
}

async function loadPreviewTool(): Promise<{
  createPreviewService: (cliPath: string) => PreviewService
  definePreviewTool: (cliPath: string) => PreviewService["tool"]
  __testing: {
    readPreviewBundle: (outDir: string) => Promise<{ pages: { svg: string | null }[]; markupTruncated: boolean }>
    captureSnapshot: (
      cliPath: string,
      target: string,
      outDir: string,
    ) => Promise<{ snapshot: string; themeFile?: string }>
    readRecord: (id: string) => Promise<PreviewEntry | undefined>
    RECORD_DIR: string
    MAX_PRESENTED_BYTES: number
    PreviewExpired: new (m?: string) => Error
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
    viewablePages: (bundle: { pages: { svg?: string | null; page?: number }[] }) => {
      svg?: string | null
      page?: number
    }[]
    hasMarkup: (page: { svg?: string | null } | undefined) => boolean
    pageNumberOf: (page: { page?: number } | undefined, index: number) => number
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

  it("keeps pages an oversized deck shipped without markup, so none of them vanish", async () => {
    // Dropping them renumbered the strip and, when every page was over
    // budget, returned an empty list — which made the entire card
    // disappear with nothing on screen to explain why.
    const bundle = await loadClientBundle(() => ({}))
    const pages = bundle.__testing.viewablePages({
      pages: [{ svg: "<svg/>", page: 1 }, { svg: null, page: 2 }, { svg: "", page: 3 }],
    })
    expect(pages).toHaveLength(3)
    expect(pages.map((_p, i) => bundle.__testing.pageNumberOf(pages[i], i))).toEqual([1, 2, 3])
    expect(pages.map((p) => bundle.__testing.hasMarkup(p))).toEqual([true, false, false])
  })

  it("still shows the card when no page at all carries markup", async () => {
    const bundle = await loadClientBundle(() => ({}))
    expect(bundle.__testing.viewablePages({ pages: [{ svg: null }, { svg: null }] })).toHaveLength(2)
  })

  it("returns nothing only when the deck itself has no pages", async () => {
    const bundle = await loadClientBundle(() => ({}))
    expect(bundle.__testing.viewablePages({ pages: [] })).toHaveLength(0)
    expect(
      bundle.__testing.viewablePages(undefined as unknown as { pages: { svg?: string | null }[] }),
    ).toHaveLength(0)
  })

  it("numbers a page by its own page field, falling back to its slot", async () => {
    // The modal counter has to read as the deck's real numbering; an
    // over-budget page in the middle must not shift the ones after it.
    const bundle = await loadClientBundle(() => ({}))
    expect(bundle.__testing.pageNumberOf({ page: 7 }, 2)).toBe(7)
    expect(bundle.__testing.pageNumberOf({}, 2)).toBe(3)
    expect(bundle.__testing.pageNumberOf(undefined, 0)).toBe(1)
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

/** A uuid-shaped id, since the route only accepts that shape. */
function previewId(tag: string): string {
  return `00000000-0000-4000-8000-${tag.padStart(12, "0")}`
}

describe("preview recall across restarts", () => {
  it("keeps one record per preview on disk, because a transcript outlives the process", async () => {
    // A card lives in a transcript the user scrolls back to days later, and
    // DSH restarts on every plugin reload. In-memory alone meant a
    // historical session rendered an empty card and an export that saved a
    // 404 body as `pptx.json` — a failure disguised as a download.
    const { createPreviewService, __testing } = await loadPreviewTool()
    const svc = createPreviewService("/x.js")
    const id = previewId("a1")
    await svc.remember(id, {
      bundle: { title: "d", pages: [] },
      target: "deck.json",
      outDir: "/tmp/out",
      snapshot: "/tmp/out/snapshot.ir.json",
    })
    expect(svc.recall(id)).toMatchObject({ target: "deck.json", outDir: "/tmp/out" })

    // Awaited by `remember`, not fired and forgotten: the tool must not be
    // able to return an id the disk has never heard of.
    expect(await __testing.readRecord(id)).toEqual({
      target: "deck.json",
      outDir: "/tmp/out",
      snapshot: "/tmp/out/snapshot.ir.json",
    })
    // The deck itself is never persisted — this is a lookup table for
    // re-rendering, not a cache of markup.
    expect(await __testing.readRecord(id)).not.toHaveProperty("bundle")
  })

  it("does not lose a record to a preview that finished at the same moment", async () => {
    // The old shared index was a read-modify-write over one file: two
    // previews landing together meant the second write erased the first, and
    // a reader that caught the file mid-write fell back to an empty object
    // and then overwrote everything in it.
    const { createPreviewService, __testing } = await loadPreviewTool()
    const svc = createPreviewService("/x.js")
    const ids = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map(previewId)
    await Promise.all(
      ids.map((id) =>
        svc.remember(id, { bundle: { pages: [] }, target: `${id}.json`, outDir: "/tmp/out", snapshot: "/s.json" }),
      ),
    )
    const records = await Promise.all(ids.map((id) => __testing.readRecord(id)))
    expect(records.map((r) => r?.target)).toEqual(ids.map((id) => `${id}.json`))
  })

  it("rejects an id that is not the shape it hands out, since ids become filenames", async () => {
    const { __testing } = await loadPreviewTool()
    expect(await __testing.readRecord("../../etc/passwd")).toBeUndefined()
    expect(await __testing.readRecord("")).toBeUndefined()
  })

  it("gives each service its own decks and its own CLI", async () => {
    // These two used to share a module-level map and, worse, a module-level
    // CLI path that the newest `definePreviewTool` call overwrote — so a
    // reload silently re-pointed the route the previous apply() registered.
    const { createPreviewService, __testing } = await loadPreviewTool()
    const first = createPreviewService("/cli-alpha/does-not-exist.js")
    const second = createPreviewService("/cli-beta/does-not-exist.js")
    const id = previewId("b1")
    await first.remember(id, { bundle: { pages: [] }, target: "a.json", outDir: "/tmp/out", snapshot: "/s.json" })
    expect(first.recall(id)).toBeDefined()
    expect(second.recall(id)).toBeUndefined()

    // Each service shells out to the CLI it was built with. Both paths are
    // missing, so the spawn fails naming the one it actually tried.
    const { mkdtemp, writeFile } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const dir = await mkdtemp(join(tmpdir(), "pptfast-test-"))
    const snapshot = join(dir, "snapshot.ir.json")
    await writeFile(snapshot, "{}")
    const gone = previewId("b2")
    await second.remember(gone, {
      bundle: { pages: [] },
      target: "a.json",
      outDir: join(dir, "no-such-out"),
      snapshot,
    })
    // Drop the in-memory entry so recall has to take the re-render tier.
    const fresh = createPreviewService("/cli-beta/does-not-exist.js")
    await expect(fresh.recallAnywhere(gone)).rejects.toThrow(/cli-beta/)
    expect(__testing.RECORD_DIR).toContain("pptfast-previews")
  })

  it("fails loudly when the snapshot is gone instead of re-reading the target", async () => {
    // The whole point of pinning a snapshot: a card must never quietly start
    // showing today's version of a file the user edited after previewing it.
    const { createPreviewService, __testing } = await loadPreviewTool()
    const svc = createPreviewService("/x.js")
    const id = previewId("d1")
    await svc.remember(id, {
      bundle: { pages: [] },
      target: "deck-dir",
      outDir: "/tmp/pptfast-no-such-outdir",
      snapshot: "/tmp/pptfast-no-such-snapshot.ir.json",
    })
    const fresh = createPreviewService("/x.js")
    await expect(fresh.recallAnywhere(id)).rejects.toBeInstanceOf(__testing.PreviewExpired)
    // An id nobody ever handed out is a different answer: not found, not expired.
    expect(await fresh.recallAnywhere(previewId("d2"))).toBeUndefined()
  })
})

describe("preview deck snapshot", () => {
  it("pins a single-file target so later edits cannot change what the card shows", async () => {
    // Preview, export and every later recall all read this one file. Before
    // it existed they were three independent readings of the user's target:
    // preview deck A, edit a page, hit download, get deck B.
    const { __testing } = await loadPreviewTool()
    const { mkdtemp, mkdir, readFile, writeFile } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")

    const src = await mkdtemp(join(tmpdir(), "pptfast-src-"))
    await mkdir(join(src, "assets"), { recursive: true })
    const deck = join(src, "deck.json")
    await writeFile(
      deck,
      JSON.stringify({
        filename: "before",
        assets: {
          images: {
            local: { src: "assets/logo.png" },
            remote: { src: "https://example.com/a.png" },
            inline: { src: "data:image/png;base64,AA" },
          },
        },
      }),
    )
    const outDir = await mkdtemp(join(tmpdir(), "pptfast-out-"))
    const { snapshot } = await __testing.captureSnapshot("/x.js", deck, outDir)
    expect(snapshot).toBe(join(outDir, "snapshot.ir.json"))

    await writeFile(deck, JSON.stringify({ filename: "after", assets: { images: {} } }))
    const pinned = JSON.parse(await readFile(snapshot, "utf8"))
    expect(pinned.filename).toBe("before")
    // A relative src resolves against the IR file's own directory, so the
    // copy has to carry absolute paths or it would silently lose every image.
    expect(pinned.assets.images.local.src).toBe(join(src, "assets", "logo.png"))
    expect(pinned.assets.images.remote.src).toBe("https://example.com/a.png")
    expect(pinned.assets.images.inline.src).toBe("data:image/png;base64,AA")
  })
})

describe("oversized deck budget", () => {
  async function bundleDir(sizes: number[]): Promise<string> {
    const { mkdtemp, writeFile } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const dir = await mkdtemp(join(tmpdir(), "pptfast-budget-"))
    const pages = sizes.map((size, i) => {
      const file = `${String(i + 1).padStart(3, "0")}.svg`
      return { page: i + 1, id: `page-${i + 1}`, file, size }
    })
    for (const p of pages) await writeFile(join(dir, p.file), "x".repeat(p.size))
    await writeFile(join(dir, "manifest.json"), JSON.stringify({ title: "d", pages }))
    return dir
  }

  it("skips only the page that does not fit, not every page after it", async () => {
    // The cascade meant one heavy slide cost the user every slide behind it,
    // and an over-budget first page blanked the whole deck.
    const { __testing } = await loadPreviewTool()
    const big = __testing.MAX_PRESENTED_BYTES + 1
    const bundle = await __testing.readPreviewBundle(await bundleDir([big, 10, big, 10]))
    expect(bundle.pages.map((p) => p.svg !== null)).toEqual([false, true, false, true])
    expect(bundle.markupTruncated).toBe(true)
  })

  it("keeps every page's metadata whether or not its markup fit", async () => {
    const { __testing } = await loadPreviewTool()
    const bundle = await __testing.readPreviewBundle(await bundleDir([10, 10]))
    expect(bundle.pages).toHaveLength(2)
    expect(bundle.markupTruncated).toBe(false)
    expect((bundle.pages[0] as unknown as { id: string }).id).toBe("page-1")
  })
})

describe("preview service — adversarial acceptance follow-ups", () => {
  it("refuses an unsafe id at the write boundary, not only when reading one back", async () => {
    // The commit that introduced per-id record files claimed ids were
    // "shape-checked before they ever reach the filesystem". They were not:
    // validation sat on the read path and the HTTP route, while `remember` —
    // an exported entry point — handed the id straight to `join`, so
    // "../../victim" resolved clean out of the record directory. Nothing in
    // production reached it (the plugin only ever passes a randomUUID), but
    // the guarantee was asserted before it was true.
    const { createPreviewService } = (await loadPreviewTool()) as unknown as {
      createPreviewService: (cli: string) => {
        remember: (id: string, entry: unknown) => Promise<unknown>
      }
    }
    const svc = createPreviewService("/x/cli.js")
    const entry = { outDir: "/tmp", target: "t", snapshot: "s", bundle: { pages: [] } }
    await expect(svc.remember("../../victim", entry)).rejects.toThrow(/unsafe id/)
    await expect(svc.remember("..%2f..%2fvictim", entry)).rejects.toThrow(/unsafe id/)
    await expect(svc.remember("", entry)).rejects.toThrow(/unsafe id/)
    // A real id still goes through, or the guard would be a denial of service.
    await expect(
      svc.remember("4a00e929-4e67-40a0-9292-1e2e72e4377f", entry),
    ).resolves.not.toThrow()
  })
})
