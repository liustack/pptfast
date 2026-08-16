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
  pptxPath?: string
  pptxError?: string
}

interface PreviewValue {
  previewId: string
  outDir: string
  pageCount: number
  findingCount: number
  audited: boolean
  bundle: { title?: string; pages: { svg?: string | null }[] }
}

interface RouteRegistration {
  name: string
  kind: string
  path: string
  handler: (req: { url: string }, res: FakeResponse) => Promise<void>
}

interface FakeResponse {
  writeHead: (status: number, headers: Record<string, string | number>) => void
  end: (body?: string | Buffer) => void
}

interface PreviewService {
  tool: {
    name: string
    description: string
    output: {
      render: (a: unknown, v: unknown) => { type: string; text: string }[]
      presentationMeta: (a: unknown, v: unknown) => { card: string; bundle: { pages: unknown[] } }
    }
    execute: (args: { target: string }, exec?: unknown) => Promise<PreviewValue>
  }
  registerRoute: (ctx: { webServer: { register: (r: RouteRegistration) => void } }) => void
  remember: (id: string, entry: PreviewEntry) => Promise<void>
  recall: (id: string) => PreviewEntry | undefined
  recallAnywhere: (id: string) => Promise<PreviewEntry | undefined>
  recordDir: string
}

interface PreviewModule {
  createPreviewService: (cliPath: string) => PreviewService
  definePreviewTool: (cliPath: string) => PreviewService["tool"]
  recordDirFor: (cliPath: string) => string
  PREVIEW_ROUTE: string
  __testing: {
    readPreviewBundle: (outDir: string) => Promise<{ pages: { svg: string | null }[]; markupTruncated: boolean }>
    captureSnapshot: (
      cliPath: string,
      target: string,
      outDir: string,
    ) => Promise<{ snapshot: string; themeFile?: string }>
    exportName: (bundle: { title?: string } | undefined, target: string) => string
    readRecord: (dir: string, id: string) => Promise<PreviewEntry | undefined>
    writeRecord: (dir: string, id: string, record: unknown) => Promise<void>
    pruneRecords: (dir: string) => Promise<void>
    isDisposableOutDir: (dir: unknown) => boolean
    recordDirFor: (cliPath: string) => string
    RECORD_ROOT: string
    OUT_DIR_PREFIX: string
    SCRATCH_MAX_AGE_MS: number
    MAX_PRESENTED_BYTES: number
    MAX_PERSISTED: number
    PreviewExpired: new (m?: string) => Error
  }
}

async function loadPreviewTool(): Promise<PreviewModule> {
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

/**
 * Every service below is built on a CLI path unique to its test, and record
 * directories are keyed by that path — so no test can reach the directory the
 * really-installed plugin uses, and none of them can reach each other's.
 * Whatever they do create is removed here.
 *
 * The previous round of these tests wrote fixed ids into one shared directory
 * and never cleaned up, which put them in the same namespace as a DSH running
 * on the same machine.
 */
const scratchDirs = new Set<string>()

/** The CLI path each service was built with, so a "reload" can reuse it. */
const cliPaths = new WeakMap<PreviewService, string>()

/** `mkdtemp`, with the result queued for removal when the file is done. */
async function scratchTmp(prefix: string): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const dir = await mkdtemp(join(tmpdir(), prefix))
  scratchDirs.add(dir)
  return dir
}

function uniqueCli(tag: string): string {
  return `/pptfast-test/${tag}/${Math.random().toString(36).slice(2)}/cli.js`
}

async function makeService(tag: string, cliPath = uniqueCli(tag)): Promise<PreviewService> {
  const { createPreviewService } = await loadPreviewTool()
  const svc = createPreviewService(cliPath)
  cliPaths.set(svc, cliPath)
  scratchDirs.add(svc.recordDir)
  return svc
}

/**
 * A second service reading the same records as an existing one — the shape a
 * plugin reload takes, where the process is new but the installed CLI is not.
 */
async function reopen(svc: PreviewService): Promise<PreviewService> {
  const cliPath = cliPaths.get(svc)
  if (!cliPath) throw new Error("service was not built through makeService")
  return makeService("reload", cliPath)
}

async function scratchRecordDir(tag: string): Promise<string> {
  const { recordDirFor } = await loadPreviewTool()
  const dir = recordDirFor(uniqueCli(tag))
  scratchDirs.add(dir)
  return dir
}

afterAll(async () => {
  const { rm } = await import("node:fs/promises")
  await Promise.all([...scratchDirs].map((d) => rm(d, { recursive: true, force: true }).catch(() => {})))
})

describe("preview recall across restarts", () => {
  it("keeps one record per preview on disk, because a transcript outlives the process", async () => {
    // A card lives in a transcript the user scrolls back to days later, and
    // DSH restarts on every plugin reload. In-memory alone meant a
    // historical session rendered an empty card and an export that saved a
    // 404 body as `pptx.json` — a failure disguised as a download.
    const { __testing } = await loadPreviewTool()
    const svc = await makeService("recall")
    const id = previewId("a1")
    await svc.remember(id, {
      bundle: { title: "d", pages: [] },
      target: "deck.json",
      outDir: "/tmp/out",
      snapshot: "/tmp/out/snapshot.ir.json",
      pptxPath: "/tmp/out/d.pptx",
    })
    expect(svc.recall(id)).toMatchObject({ target: "deck.json", outDir: "/tmp/out" })

    // Awaited by `remember`, not fired and forgotten: the tool must not be
    // able to return an id the disk has never heard of.
    expect(await __testing.readRecord(svc.recordDir, id)).toEqual({
      target: "deck.json",
      outDir: "/tmp/out",
      snapshot: "/tmp/out/snapshot.ir.json",
      pptxPath: "/tmp/out/d.pptx",
    })
    // The deck itself is never persisted — this is a lookup table for the
    // files on disk, not a cache of markup.
    expect(await __testing.readRecord(svc.recordDir, id)).not.toHaveProperty("bundle")
  })

  it("does not lose a record to a preview that finished at the same moment", async () => {
    // The old shared index was a read-modify-write over one file: two
    // previews landing together meant the second write erased the first, and
    // a reader that caught the file mid-write fell back to an empty object
    // and then overwrote everything in it.
    const { __testing } = await loadPreviewTool()
    const svc = await makeService("concurrent")
    const ids = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map(previewId)
    await Promise.all(
      ids.map((id) =>
        svc.remember(id, { bundle: { pages: [] }, target: `${id}.json`, outDir: "/tmp/out", snapshot: "/s.json" }),
      ),
    )
    const records = await Promise.all(ids.map((id) => __testing.readRecord(svc.recordDir, id)))
    expect(records.map((r) => r?.target)).toEqual(ids.map((id) => `${id}.json`))
  })

  it("never lets a reader see half a record, however hard two writers fight over one id", async () => {
    // The falsifiable form of "published by rename". Replace the scratch +
    // rename in `writeRecord` with a plain writeFile to the final path and
    // this goes red: a reader that catches the truncated file gets a JSON
    // parse error, which `readRecord` reports as "no such preview" — an id
    // that exists, briefly reporting that it does not.
    //
    // The payload is deliberately far larger than a pipe buffer so the write
    // cannot complete in one indivisible step.
    const { __testing } = await loadPreviewTool()
    const dir = await scratchRecordDir("atomic")
    const id = previewId("f1")
    const payload = (tag: string) => ({ target: tag, outDir: "/tmp/out", filler: tag.repeat(200_000) })

    await __testing.writeRecord(dir, id, payload("a"))
    const work: Promise<unknown>[] = []
    for (let round = 0; round < 20; round += 1) {
      work.push(__testing.writeRecord(dir, id, payload(round % 2 === 0 ? "a" : "b")))
      for (let read = 0; read < 10; read += 1) work.push(__testing.readRecord(dir, id))
    }
    const results = await Promise.all(work)
    const seen = results.filter((r): r is PreviewEntry => typeof r === "object" && r !== null)
    expect(seen.length).toBe(200)
    for (const record of seen) {
      expect(["a", "b"]).toContain(record.target)
      expect((record as unknown as { filler: string }).filler.length).toBe(200_000)
    }
  })

  it("rejects an id that is not the shape it hands out, since ids become filenames", async () => {
    const { __testing } = await loadPreviewTool()
    const dir = await scratchRecordDir("shape")
    expect(await __testing.readRecord(dir, "../../etc/passwd")).toBeUndefined()
    expect(await __testing.readRecord(dir, "")).toBeUndefined()
  })

  it("fails loudly when the rendered deck is gone instead of re-rendering today's version", async () => {
    // The whole point of one render window: a card must never quietly start
    // showing a deck rebuilt from today's configuration, today's image bytes
    // and today's renderer version.
    const { __testing } = await loadPreviewTool()
    const svc = await makeService("expired")
    const id = previewId("d1")
    await svc.remember(id, {
      bundle: { pages: [] },
      target: "deck-dir",
      outDir: "/tmp/pptfast-no-such-outdir",
      snapshot: "/tmp/pptfast-no-such-snapshot.ir.json",
    })
    // A second service on the same CLI path shares the records but not the
    // memory, which is exactly what a plugin reload looks like.
    const reloaded = await reopen(svc)
    await expect(reloaded.recallAnywhere(id)).rejects.toBeInstanceOf(__testing.PreviewExpired)
    // An id nobody ever handed out is a different answer: not found, not expired.
    expect(await reloaded.recallAnywhere(previewId("d2"))).toBeUndefined()
  })
})

describe("instance isolation", () => {
  it("keeps one service's decks off another service's disk records", async () => {
    // A flat shared record directory made every service a peer: service B's
    // `recallAnywhere` found service A's deck on disk and served it through
    // B's own route. Checking the in-memory map alone never caught this —
    // the maps were already private, the directory was not.
    const { __testing } = await loadPreviewTool()
    const first = await makeService("iso-a")
    const second = await makeService("iso-b")
    expect(first.recordDir).not.toBe(second.recordDir)
    expect(first.recordDir.startsWith(__testing.RECORD_ROOT)).toBe(true)

    const id = previewId("b1")
    await first.remember(id, {
      bundle: { pages: [] },
      target: "a.json",
      outDir: "/tmp/out",
      snapshot: "/s.json",
      pptxPath: "/tmp/out/a.pptx",
    })
    expect(first.recall(id)).toBeDefined()
    expect(second.recall(id)).toBeUndefined()
    // The disk path, not just the memory one: this is the assertion the
    // previous round was missing.
    expect(await second.recallAnywhere(id)).toBeUndefined()
    expect(await __testing.readRecord(second.recordDir, id)).toBeUndefined()
    // ...while the owner still finds it after a restart.
    expect(await __testing.readRecord(first.recordDir, id)).toMatchObject({ target: "a.json" })
  })

  it("gives two services on the same CLI the same records, since that is a reload", async () => {
    const cli = uniqueCli("reload")
    const { createPreviewService } = await loadPreviewTool()
    const before = createPreviewService(cli)
    const after = createPreviewService(cli)
    scratchDirs.add(before.recordDir)
    expect(before.recordDir).toBe(after.recordDir)
  })
})

/**
 * A stand-in for `dist/cli.js`.
 *
 * The tests below have to observe what the renderer saw at the moment it ran,
 * which the real CLI cannot tell them and a build step should not be required
 * to find out. This one does the one thing that matters for these defects: it
 * reads every image src off disk *at render time* and stamps the bytes into
 * its output, exactly as a real renderer resolving assets would. A deck
 * rendered twice around an edited image therefore produces two different
 * files, and any test that gets the same file twice has proved the second
 * render never happened.
 *
 * It also appends every invocation to `cli.log`, which is how "the download
 * route starts no process" is checked rather than asserted.
 */
const FAKE_CLI_SOURCE = [
  'import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"',
  'import { dirname, join } from "node:path"',
  "",
  "const argv = process.argv.slice(2)",
  "const cmd = argv[0]",
  "const target = argv[1]",
  'const out = argv[argv.indexOf("-o") + 1]',
  "const home = dirname(process.argv[1])",
  'appendFileSync(join(home, "cli.log"), argv.join(" ") + "\\n")',
  "",
  'const ir = JSON.parse(readFileSync(target, "utf8"))',
  "const images = ir.assets && ir.assets.images ? Object.values(ir.assets.images) : []",
  "const bytes = images",
  "  .map((asset) => {",
  '    try { return readFileSync(asset.src, "utf8") } catch { return "MISSING" }',
  "  })",
  '  .join(",")',
  'const marker = ir.filename + "|" + bytes',
  "",
  'if (cmd === "preview") {',
  "  mkdirSync(out, { recursive: true })",
  '  writeFileSync(join(out, "001.svg"), "<svg>" + marker + "</svg>")',
  "  writeFileSync(",
  '    join(out, "manifest.json"),',
  '    JSON.stringify({ title: ir.filename, checks: { ran: true }, pages: [{ page: 1, id: "page-1", file: "001.svg" }] }),',
  "  )",
  '} else if (cmd === "render") {',
  '  if (existsSync(join(home, "fail-render"))) {',
  '    process.stderr.write("fake render refused\\n")',
  "    process.exit(2)",
  "  }",
  "  mkdirSync(dirname(out), { recursive: true })",
  '  writeFileSync(out, "PPTX:" + marker)',
  "} else {",
  '  process.stderr.write("unsupported command " + cmd + "\\n")',
  "  process.exit(3)",
  "}",
  "",
].join("\n")

async function fakeCli(options: { failRender?: boolean } = {}): Promise<string> {
  const { writeFile } = await import("node:fs/promises")
  const { join } = await import("node:path")
  const home = await scratchTmp("pptfast-fakecli-")
  const cliPath = join(home, "cli.mjs")
  await writeFile(cliPath, FAKE_CLI_SOURCE)
  await writeFile(join(home, "cli.log"), "")
  if (options.failRender) await writeFile(join(home, "fail-render"), "")
  return cliPath
}

async function cliInvocations(cliPath: string): Promise<string[]> {
  const { readFile } = await import("node:fs/promises")
  const { dirname, join } = await import("node:path")
  const log = await readFile(join(dirname(cliPath), "cli.log"), "utf8")
  return log.split("\n").filter((line) => line !== "")
}

/** A deck directory holding one IR file and the local image it points at. */
async function deckFixture(logo: string): Promise<{ deck: string; logoPath: string }> {
  const { mkdir, writeFile } = await import("node:fs/promises")
  const { join } = await import("node:path")
  const src = await scratchTmp("pptfast-src-")
  await mkdir(join(src, "assets"), { recursive: true })
  const logoPath = join(src, "assets", "logo.png")
  await writeFile(logoPath, logo)
  const deck = join(src, "deck.json")
  await writeFile(
    deck,
    JSON.stringify({ filename: "e2e", assets: { images: { local: { src: "assets/logo.png" } } } }),
  )
  return { deck, logoPath }
}

/** Capture the handler the service hands DSH's web server. */
function routeHandlerOf(svc: PreviewService): RouteRegistration["handler"] {
  let captured: RouteRegistration | undefined
  svc.registerRoute({ webServer: { register: (r) => { captured = r } } })
  if (!captured) throw new Error("registerRoute registered nothing")
  return captured.handler
}

interface RouteResult {
  status: number
  headers: Record<string, string | number>
  body: Buffer
}

/** Drive the handler the way an http server would, and collect what it wrote. */
async function request(handler: RouteRegistration["handler"], path: string): Promise<RouteResult> {
  const chunks: Buffer[] = []
  let status = 0
  let headers: Record<string, string | number> = {}
  const res: FakeResponse = {
    writeHead(s, h) {
      status = s
      headers = h
    },
    end(body) {
      if (body !== undefined) chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(String(body)))
    },
  }
  await handler({ url: path }, res)
  return { status, headers, body: Buffer.concat(chunks) }
}

describe("preview route (the handler DSH actually calls)", () => {
  async function servedPreview(tag: string, options: { failRender?: boolean } = {}) {
    const { PREVIEW_ROUTE } = await loadPreviewTool()
    const cliPath = await fakeCli(options)
    const svc = await makeService(tag, cliPath)
    const { deck, logoPath } = await deckFixture("LOGO-V1")
    const value = await svc.tool.execute({ target: deck })
    scratchDirs.add(value.outDir)
    return { svc, cliPath, deck, logoPath, value, handler: routeHandlerOf(svc), route: PREVIEW_ROUTE }
  }

  it("serves the rendered bundle to the card", async () => {
    const { handler, route, value } = await servedPreview("route-bundle")
    const res = await request(handler, `${route}/${value.previewId}`)
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toBe("application/json")
    const bundle = JSON.parse(res.body.toString("utf8")) as { pages: { svg: string }[] }
    expect(bundle.pages).toHaveLength(1)
    expect(bundle.pages[0]!.svg).toContain("LOGO-V1")
  })

  it("serves the .pptx as a file, and starts no process to do it", async () => {
    const { handler, route, value, cliPath } = await servedPreview("route-pptx")
    // Two runs so far: the preview and the export, both inside `execute`.
    expect((await cliInvocations(cliPath)).map((line) => line.split(" ")[0])).toEqual(["preview", "render"])

    const res = await request(handler, `${route}/${value.previewId}/pptx`)
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toContain("presentationml.presentation")
    expect(res.headers["content-disposition"]).toBe('attachment; filename="e2e.pptx"')
    expect(res.headers["content-length"]).toBe(res.body.length)
    expect(res.body.toString("utf8")).toBe("PPTX:e2e|LOGO-V1")

    // The point of the whole change: downloading renders nothing.
    expect(await cliInvocations(cliPath)).toHaveLength(2)
  })

  it("hands back the deck that was previewed, not the one the source has become", async () => {
    // End-to-end evidence for the defect that survived the last round.
    // Pinning the IR was not enough: the IR names an image by path, and the
    // bytes at that path are read by whichever render runs. Render on
    // download instead of here and this goes red with LOGO-V2 — the user
    // approves one deck and saves a different one.
    const { handler, route, value, logoPath } = await servedPreview("route-same-source")
    const { writeFile } = await import("node:fs/promises")
    await writeFile(logoPath, "LOGO-V2")

    const res = await request(handler, `${route}/${value.previewId}/pptx`)
    expect(res.status).toBe(200)
    expect(res.body.toString("utf8")).toBe("PPTX:e2e|LOGO-V1")
    expect(res.body.toString("utf8")).not.toContain("LOGO-V2")

    // And the card the user is looking at agrees with the file they saved:
    // both came out of the same render.
    const bundle = JSON.parse((await request(handler, `${route}/${value.previewId}`)).body.toString("utf8")) as {
      pages: { svg: string }[]
    }
    expect(bundle.pages[0]!.svg).toContain("LOGO-V1")
  })

  it("answers an unknown id with 404 and a malformed one with the same, never a stack trace", async () => {
    const { handler, route } = await servedPreview("route-unknown")
    const missing = await request(handler, `${route}/${previewId("e1")}`)
    expect(missing.status).toBe(404)
    expect(JSON.parse(missing.body.toString("utf8"))).toEqual({ error: "unknown preview id" })

    // Ids become filenames, so a traversal attempt must not even be looked up.
    for (const bad of ["../../etc/passwd", "..%2f..%2fpasswd", "", "not a uuid!"]) {
      const res = await request(handler, `${route}/${bad}`)
      expect(res.status, bad).toBe(404)
    }
    // The suffix router must not let a traversal in through the export path either.
    expect((await request(handler, `${route}/../../etc/passwd/pptx`)).status).toBe(404)
  })

  it("reports 410 for a preview whose rendered deck was cleaned up, rather than rebuilding it", async () => {
    const { handler, route, value, svc, cliPath } = await servedPreview("route-expired")
    const { rm } = await import("node:fs/promises")
    await rm(value.outDir, { recursive: true, force: true })
    // A reload: the files are gone and so is the memory that hid their loss.
    const reloaded = await reopen(svc)
    const afterReload = routeHandlerOf(reloaded)

    const bundle = await request(afterReload, `${route}/${value.previewId}`)
    expect(bundle.status).toBe(410)
    expect(JSON.parse(bundle.body.toString("utf8")).error).toMatch(/rendered deck for this preview is gone/)

    const pptx = await request(afterReload, `${route}/${value.previewId}/pptx`)
    expect(pptx.status).toBe(410)
    // Not a re-render, and not a 404 body saved as `deck.pptx` either.
    expect(pptx.headers["content-type"]).toBe("application/json")
    expect(await cliInvocations(cliPath)).toHaveLength(2)
    void handler
  })

  it("reports 410 when only the .pptx is missing, instead of quietly rendering a replacement", async () => {
    // The narrow case: the bundle survived, the export did not. Falling back
    // to a render here would be the drift walking straight back in.
    const { handler, route, value, cliPath, logoPath } = await servedPreview("route-pptx-gone")
    const { rm, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    await rm(join(value.outDir, "e2e.pptx"), { force: true })
    await writeFile(logoPath, "LOGO-V2")

    const res = await request(handler, `${route}/${value.previewId}/pptx`)
    expect(res.status).toBe(410)
    expect(JSON.parse(res.body.toString("utf8")).error).toMatch(/exported deck for this preview is gone/)
    expect(await cliInvocations(cliPath)).toHaveLength(2)
    // The card still works — losing the export does not cost the user the deck.
    expect((await request(handler, `${route}/${value.previewId}`)).status).toBe(200)
  })

  it("keeps the preview when the export fails, and states the reason at download time", async () => {
    const { handler, route, value } = await servedPreview("route-render-fails", { failRender: true })
    expect(value.pageCount).toBe(1)
    expect((await request(handler, `${route}/${value.previewId}`)).status).toBe(200)

    const res = await request(handler, `${route}/${value.previewId}/pptx`)
    expect(res.status).toBe(410)
    expect(JSON.parse(res.body.toString("utf8")).error).toMatch(/export for this preview failed to render/)
    expect(JSON.parse(res.body.toString("utf8")).error).toMatch(/fake render refused/)
  })

  it("serves a record written before exports existed as expired, not as a 404 body", async () => {
    // Real records from the previous release carry no `pptxPath`. A browser
    // that saves a 404 body as `deck.pptx` is the failure this route was
    // built to stop, so the answer has to be an explicit 410.
    const svc = await makeService("route-legacy")
    const { writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { PREVIEW_ROUTE, __testing } = await loadPreviewTool()
    const outDir = await scratchTmp(__testing.OUT_DIR_PREFIX)
    await writeFile(join(outDir, "001.svg"), "<svg/>")
    await writeFile(
      join(outDir, "manifest.json"),
      JSON.stringify({ title: "old", pages: [{ page: 1, id: "page-1", file: "001.svg" }] }),
    )
    const id = previewId("e9")
    await svc.remember(id, { bundle: undefined, target: "old.json", outDir, snapshot: join(outDir, "snapshot.ir.json") })

    const handler = routeHandlerOf(await reopen(svc))
    const res = await request(handler, `${PREVIEW_ROUTE}/${id}/pptx`)
    expect(res.status).toBe(410)
    expect(res.headers["content-type"]).toBe("application/json")
    expect(JSON.parse(res.body.toString("utf8")).error).toMatch(/no exported deck/)
  })
})

describe("preview lifecycle cleanup", () => {
  it("takes the rendered deck with the record it evicts", async () => {
    // Eviction used to delete a few hundred bytes of JSON and orphan the
    // directory it pointed at — a whole rendered deck plus an exported
    // .pptx, with nothing left holding a reference to it.
    const { __testing } = await loadPreviewTool()
    const { readdir, stat, utimes, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const dir = await scratchRecordDir("evict")

    const doomed = await scratchTmp(__testing.OUT_DIR_PREFIX)
    await writeFile(join(doomed, "001.svg"), "<svg/>")
    const survivor = await scratchTmp(__testing.OUT_DIR_PREFIX)
    // A record can point anywhere — `remember` is exported — so eviction must
    // refuse to recurse into a directory it did not create.
    const foreign = await scratchTmp("pptfast-not-ours-")

    await __testing.writeRecord(dir, previewId("90"), { target: "old", outDir: doomed })
    await __testing.writeRecord(dir, previewId("91"), { target: "foreign", outDir: foreign })
    for (let i = 0; i < __testing.MAX_PERSISTED; i += 1) {
      await __testing.writeRecord(dir, previewId(`7${i}`), { target: "keep", outDir: survivor })
    }
    // Deterministic order: mtime resolution is coarse enough that 240 writes
    // in a loop can tie, and the eviction is a sort on mtime.
    const old = new Date(2001, 0, 1)
    await utimes(join(dir, `${previewId("90")}.json`), old, old)
    await utimes(join(dir, `${previewId("91")}.json`), old, old)

    await __testing.pruneRecords(dir)

    expect(await __testing.readRecord(dir, previewId("90"))).toBeUndefined()
    await expect(stat(doomed)).rejects.toThrow()
    expect(await __testing.readRecord(dir, previewId("91"))).toBeUndefined()
    // Its record is gone, its directory is not — the guard held.
    expect((await stat(foreign)).isDirectory()).toBe(true)
    expect((await readdir(dir)).length).toBe(__testing.MAX_PERSISTED)
    expect((await stat(survivor)).isDirectory()).toBe(true)
  })

  it("collects abandoned scratch files, and leaves in-flight ones alone", async () => {
    // The old prune filtered for `.json` and skipped these entirely, so a
    // process that died between writing a scratch file and renaming it left
    // one behind permanently.
    const { __testing } = await loadPreviewTool()
    const { mkdir, readdir, utimes, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const dir = await scratchRecordDir("scratch")
    await mkdir(dir, { recursive: true })

    await writeFile(join(dir, ".abandoned.tmp"), "{}")
    await writeFile(join(dir, ".in-flight.tmp"), "{}")
    const old = new Date(Date.now() - __testing.SCRATCH_MAX_AGE_MS - 60_000)
    await utimes(join(dir, ".abandoned.tmp"), old, old)

    await __testing.pruneRecords(dir)

    const left = await readdir(dir)
    expect(left).not.toContain(".abandoned.tmp")
    // Age-gated: a fresh scratch file probably belongs to a write in progress.
    expect(left).toContain(".in-flight.tmp")
  })

  it("only ever deletes a directory it made itself", async () => {
    const { __testing } = await loadPreviewTool()
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    expect(__testing.isDisposableOutDir(join(tmpdir(), `${__testing.OUT_DIR_PREFIX}abc`))).toBe(true)
    expect(__testing.isDisposableOutDir(join(tmpdir(), "something-else"))).toBe(false)
    expect(__testing.isDisposableOutDir(join(tmpdir(), "sub", `${__testing.OUT_DIR_PREFIX}abc`))).toBe(false)
    expect(__testing.isDisposableOutDir("/")).toBe(false)
    expect(__testing.isDisposableOutDir(process.cwd())).toBe(false)
    expect(__testing.isDisposableOutDir(undefined)).toBe(false)
    expect(__testing.isDisposableOutDir("")).toBe(false)
  })
})

describe("export filename", () => {
  it("keeps the deck's own name, and keeps it safe as both a path and a header value", async () => {
    const { __testing } = await loadPreviewTool()
    expect(__testing.exportName({ title: "Q3 Review" }, "/x/deck.json")).toBe("Q3-Review.pptx")
    expect(__testing.exportName(undefined, "/x/quarterly.json")).toBe("quarterly.pptx")
    // A title that sanitizes down to nothing still has to name a file.
    expect(__testing.exportName({ title: "../.." }, "/x/deck.json")).toBe("deck.pptx")
    expect(__testing.exportName({ title: 'a"b/c' }, "/x/deck.json")).toBe("a-b-c.pptx")
    for (const name of ["Q3 Review", "../..", 'a"b/c'].map((t) => __testing.exportName({ title: t }, "t"))) {
      expect(name).not.toMatch(/["/\\]/)
    }
  })
})

describe("preview deck snapshot", () => {
  it("pins a single-file target so later edits cannot change what the card shows", async () => {
    // Preview, export and every later recall all read this one file. Before
    // it existed they were three independent readings of the user's target:
    // preview deck A, edit a page, hit download, get deck B.
    const { __testing } = await loadPreviewTool()
    const { mkdir, readFile, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")

    const src = await scratchTmp("pptfast-src-")
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
    const outDir = await scratchTmp("pptfast-out-")
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
    const { writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const dir = await scratchTmp("pptfast-budget-")
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
    const svc = await makeService("unsafe-id")
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
