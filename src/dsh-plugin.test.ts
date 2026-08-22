// @vitest-environment node
//
// Node environment on purpose: dsh/index.js resolves its skill/CLI paths
// with `new URL(..., import.meta.url)` + `fileURLToPath` at module scope,
// which the repo-default jsdom environment breaks (jsdom swaps global URL —
// same reason plugin-manifest.test.ts reads files by process.cwd()).
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"

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
  pptxFile?: string
  pptxPath?: string
  pptxError?: string
}

/** What actually lands in `<root>/<id>/record.json` — names, never paths. */
interface PreviewRecord {
  target?: string
  themeFile?: string
  pptxFile?: string
  pptxError?: string
  created?: number
  [key: string]: unknown
}

interface PreviewValue {
  previewId: string
  outDir: string
  pageCount: number
  findingCount: number
  audited: boolean
  bundle: { title?: string; draft?: boolean; pages: { svg?: string | null }[] }
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
  remember: (id: string, entry: Partial<PreviewEntry>) => Promise<PreviewEntry>
  recall: (id: string) => PreviewEntry | undefined
  recallAnywhere: (id: string) => Promise<PreviewEntry | undefined>
  root: string
}

interface PreviewModule {
  createPreviewService: (cliPath: string) => PreviewService
  definePreviewTool: (cliPath: string) => PreviewService["tool"]
  previewRoot: () => string
  PREVIEW_ROUTE: string
  ROUTE_HEADER: string
  ROUTE_HEADER_VALUE: string
  FAILURE_CODES: { unknown: string; missing: string; damaged: string; unreadable: string }
  __testing: {
    readPreviewBundle: (outDir: string) => Promise<{ pages: { svg: string | null }[]; draft: boolean }>
    captureSnapshot: (
      cliPath: string,
      target: string,
      outDir: string,
    ) => Promise<{ snapshot: string; themeFile?: string }>
    exportName: (bundle: { title?: string; draft?: boolean } | undefined, target: string) => string
    readRecord: (root: string, id: string) => Promise<PreviewRecord | undefined>
    writeRecord: (root: string, id: string, record: unknown) => Promise<void>
    entryFromRecord: (dir: string, record: PreviewRecord) => PreviewEntry
    fileInside: (dir: string, name: unknown) => string | undefined
    previewDir: (root: string, id: unknown) => string | undefined
    isSafeFileName: (name: unknown) => boolean
    directoryState: (path: string) => Promise<string>
    partialDir: (root: string, id: string) => string
    createOwnedDir: (root: string, dir: string) => Promise<void>
    discardOwnedDir: (dir: unknown) => Promise<void>
    missingPage: (message: string) => string
    unreadablePage: (message: string) => string
    damagedPage: (message: string) => string
    noticePageFor: (code: string, message: string) => string
    parseManifest: (raw: string, path: string) => { pages: unknown[] }
    describeIncomplete: (error: unknown, dir: string) => string
    inlineLocalImages: (snapshotPath: string) => Promise<void>
    isAbsent: (error: unknown) => boolean
    isTransient: (error: unknown) => boolean
    classifyReadFailure: (error: unknown) => string
    RETRYABLE_ERRNOS: Set<string>
    THUMBNAIL_STRIP_PAGES: number
    PREVIEW_HTML_FILE: string
    PREVIEW_DIR: string
    RECORD_FILE: string
    MANIFEST_FILE: string
    SNAPSHOT_FILE: string
    PARTIAL_SUFFIX: string
    OWNER_MARKER: string
    PreviewExpired: new (m?: string) => Error
    PreviewUnreadable: new (m?: string) => Error
    PreviewDamaged: new (m?: string) => Error
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
    stripPages: (pages: { svg?: string | null; page?: number }[]) => { svg?: string | null; page?: number }[]
    hasMarkup: (page: { svg?: string | null } | undefined) => boolean
    pageNumberOf: (page: { page?: number } | undefined, index: number) => number
    previewHtmlUrl: (previewId: string, startPage?: number) => string
    verdictOf: (
      res:
        | { ok?: boolean; status?: number; headers?: { get: (name: string) => string | null }; json?: () => Promise<unknown> }
        | undefined,
    ) => Promise<string>
    isRetryable: (verdict: string) => boolean
    isFinal: (verdict: string) => boolean
    DAMAGED_HINT: string
    ROUTE_HEADER: string
    MISSING_HINT: string
    UNREACHABLE_HINT: string
    REFUSED_HINT: string
    STRIP_PAGES: number
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

  it("counts every page the deck has, including the ones sent without markup", async () => {
    // The pages past the strip arrive as metadata only. They still have to
    // reach the card, or a twenty-page deck's header would call itself twelve
    // pages long.
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

  it("draws thumbnails only for the pages that arrived with markup", async () => {
    // The strip's cap and the host half's inlining cap are one decision
    // written down in two files (`STRIP_PAGES` / `THUMBNAIL_STRIP_PAGES`).
    // Slicing alone would turn a disagreement between them into a row of
    // empty boxes; this is the filter that makes it a shorter strip instead.
    const { __testing: host } = await loadPreviewTool()
    const bundle = await loadClientBundle(() => ({}))
    expect(bundle.__testing.STRIP_PAGES).toBe(host.THUMBNAIL_STRIP_PAGES)

    const pages = Array.from({ length: bundle.__testing.STRIP_PAGES + 5 }, (_x, i) => ({
      page: i + 1,
      svg: i < bundle.__testing.STRIP_PAGES ? "<svg/>" : null,
    }))
    expect(bundle.__testing.stripPages(pages)).toHaveLength(bundle.__testing.STRIP_PAGES)
    expect(bundle.__testing.stripPages([{ svg: "<svg/>", page: 1 }, { svg: null, page: 2 }])).toEqual([
      { svg: "<svg/>", page: 1 },
    ])
  })

  it("points the viewer at the html the CLI already wrote", async () => {
    // The one string the card and the route have to agree on for the modal to
    // show anything at all.
    const bundle = await loadClientBundle(() => ({}))
    const { PREVIEW_ROUTE } = await loadPreviewTool()
    expect(bundle.__testing.previewHtmlUrl("abc-123")).toBe(`${PREVIEW_ROUTE}/abc-123/html`)
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
 * Previews now live under `$PPTFAST_HOME/previews`, so every test below gets
 * its own `PPTFAST_HOME` and nothing here can reach the directory a real
 * installed plugin uses.
 *
 * A home per test, not one per file: the root is shared by every service that
 * can see it, which is the whole point of the fix, so tests that must share a
 * root — a reload, an upgrade — say so by passing the same home, and tests that
 * must not, cannot.
 */
const scratchDirs = new Set<string>()
const ORIGINAL_HOME = process.env.PPTFAST_HOME

/** The CLI path and home each service was built with, so a reload can reuse them. */
const builtWith = new WeakMap<PreviewService, { cliPath: string; home: string }>()

/** `mkdtemp`, with the result queued for removal when the file is done. */
async function scratchTmp(prefix: string): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const dir = await mkdtemp(join(tmpdir(), prefix))
  scratchDirs.add(dir)
  return dir
}

/** A private `$PPTFAST_HOME` for one test. */
async function scratchHome(tag: string): Promise<string> {
  return scratchTmp(`pptfast-home-${tag}-`)
}

/** The preview root inside a fresh scratch home, with the env pointed at it. */
async function scratchRoot(tag: string): Promise<string> {
  const { previewRoot } = await loadPreviewTool()
  process.env.PPTFAST_HOME = await scratchHome(tag)
  return previewRoot()
}

function uniqueCli(tag: string): string {
  return `/pptfast-test/${tag}/${Math.random().toString(36).slice(2)}/cli.js`
}

async function makeService(
  tag: string,
  options: { cliPath?: string; home?: string } = {},
): Promise<PreviewService> {
  const cliPath = options.cliPath ?? uniqueCli(tag)
  const home = options.home ?? (await scratchHome(tag))
  // Set before construction: the service reads its root once, at construction.
  process.env.PPTFAST_HOME = home
  const { createPreviewService } = await loadPreviewTool()
  const svc = createPreviewService(cliPath)
  builtWith.set(svc, { cliPath, home })
  scratchDirs.add(svc.root)
  return svc
}

function originOf(svc: PreviewService): { cliPath: string; home: string } {
  const origin = builtWith.get(svc)
  if (!origin) throw new Error("service was not built through makeService")
  return origin
}

/**
 * A second service reading the same previews as an existing one — the shape a
 * plugin reload takes, where the process is new but the installed CLI is not.
 */
async function reopen(svc: PreviewService): Promise<PreviewService> {
  return makeService("reload", originOf(svc))
}

/**
 * The same, after a version upgrade: same machine, same user, same home, and a
 * CLI path that has moved because npm puts the version number in it.
 */
async function upgrade(svc: PreviewService, version = "0.99.0"): Promise<PreviewService> {
  const { home } = originOf(svc)
  return makeService("upgrade", {
    home,
    cliPath: `/pptfast-test/.pnpm/@liustack+pptfast@${version}/node_modules/@liustack/pptfast/dist/cli.js`,
  })
}

/** A preview directory of the shape the tool writes, filled with `bytes` of page markup. */
async function seedPreview(
  root: string,
  id: string,
  options: { bytes?: number; record?: PreviewRecord | null } = {},
): Promise<string> {
  const { __testing } = await loadPreviewTool()
  const { mkdir, writeFile } = await import("node:fs/promises")
  const { join } = await import("node:path")
  const dir = join(root, id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, "001.svg"), "x".repeat(options.bytes ?? 8))
  await writeFile(
    join(dir, "manifest.json"),
    JSON.stringify({ title: id, pages: [{ page: 1, id: "page-1", file: "001.svg" }] }),
  )
  if (options.record !== null) {
    await __testing.writeRecord(root, id, options.record ?? { target: id, created: Date.now() })
  }
  return dir
}

afterAll(async () => {
  const { rm } = await import("node:fs/promises")
  if (ORIGINAL_HOME === undefined) delete process.env.PPTFAST_HOME
  else process.env.PPTFAST_HOME = ORIGINAL_HOME
  await Promise.all([...scratchDirs].map((d) => rm(d, { recursive: true, force: true }).catch(() => {})))
})

describe("preview recall across restarts", () => {
  it("keeps each preview's record inside the preview's own directory, named by its id", async () => {
    // A card lives in a transcript the user scrolls back to days later, and
    // DSH restarts on every plugin reload. In-memory alone meant a
    // historical session rendered an empty card and an export that saved a
    // 404 body as `pptx.json` — a failure disguised as a download.
    //
    // The record living *inside* the directory it describes is what removes
    // the half-dead state the old split layout made ordinary: a record in
    // `$TMPDIR/pptfast-previews/<hash>/<id>.json` pointing at a deck in
    // `$TMPDIR/pptfast-preview-XXXX/` could lose either half on its own.
    const { __testing } = await loadPreviewTool()
    const { join } = await import("node:path")
    const svc = await makeService("recall")
    const id = previewId("a1")
    const dir = join(svc.root, id)

    await seedPreview(svc.root, id)
    const entry = await svc.remember(id, {
      bundle: { title: "d", pages: [] },
      target: "deck.json",
      pptxPath: join(dir, "d.pptx"),
    })
    expect(entry.outDir).toBe(dir)
    // Read back through the only lookup this service has, which goes to disk.
    // There is deliberately no in-memory shortcut to ask instead — see the
    // note on the source of truth in preview-tool.js.
    expect(await svc.recallAnywhere(id)).toMatchObject({ target: "deck.json", outDir: dir })

    // Awaited by `remember`, not fired and forgotten: the tool must not be
    // able to return an id the disk has never heard of.
    const record = await __testing.readRecord(svc.root, id)
    expect(record).toMatchObject({ target: "deck.json", pptxFile: "d.pptx" })
    // No absolute path is persisted at all. That is the fix: a stored path is
    // a claim about a filesystem layout that an upgrade or a moved home
    // directory silently invalidates, and every path here is derived from the
    // record's own location instead.
    for (const value of Object.values(record!)) {
      expect(typeof value === "string" ? value.includes("/") : false).toBe(false)
    }
    expect(record).not.toHaveProperty("outDir")
    expect(record).not.toHaveProperty("snapshot")
    expect(record).not.toHaveProperty("pptxPath")
    // The deck itself is never persisted — this is a lookup table for the
    // files on disk, not a cache of markup.
    expect(record).not.toHaveProperty("bundle")
  })

  it("keeps every preview id resolvable after the plugin is upgraded", async () => {
    // The defect this whole change exists for, said as a test. Records used to
    // live in `$TMPDIR/pptfast-previews/<sha256(cliPath)[0:16]>/`, and an npm
    // install path carries the package version
    // (`.pnpm/@liustack+pptfast@0.19.2/…`), so the bucket name changed on
    // every upgrade and every previous preview went dead on the spot.
    //
    // `upgrade()` is exactly that event: same machine, same user, same home,
    // a CLI path with a different version in it. Re-key the root on `cliPath`
    // again and this goes red on the first assertion.
    const { __testing } = await loadPreviewTool()
    const { join } = await import("node:path")
    const before = await makeService("upgrade-src")
    const id = previewId("a2")
    await seedPreview(before.root, id, { record: { target: "deck.json", created: Date.now() } })

    const after = await upgrade(before)
    expect(originOf(after).cliPath).not.toBe(originOf(before).cliPath)
    expect(after.root).toBe(before.root)
    expect(await after.recallAnywhere(id)).toMatchObject({ target: "deck.json", outDir: join(before.root, id) })
    expect(await __testing.readRecord(after.root, id)).toMatchObject({ target: "deck.json" })

    // ...and the same after a second upgrade, because nothing accumulates a
    // per-version key anywhere along the way.
    const later = await upgrade(after, "1.4.0")
    expect(await later.recallAnywhere(id)).toBeDefined()
  })

  it("resolves an id rendered by one installed CLI through a service built on the next one", async () => {
    // The core metric, end to end, and the previous version of this test did
    // not earn that name: it fabricated a preview directory with `seedPreview`
    // and never ran a CLI at all, so the guardrail it claimed to be was not
    // holding anything.
    //
    // Here the preview is produced by a real `execute` against a CLI installed
    // at a version-stamped path, and then asked for through the real route
    // handler of a service built on a *different* version-stamped path — the
    // exact event that used to orphan every preview a user had, because the
    // record root was `sha256(cliPath)` and an npm install path carries the
    // version in it.
    const { copyFile, mkdir } = await import("node:fs/promises")
    const { dirname: dirOf, join } = await import("node:path")
    const { PREVIEW_ROUTE } = await loadPreviewTool()

    const home = await scratchHome("upgrade-e2e")
    const installs = await scratchTmp("pptfast-installs-")
    /** A CLI installed the way npm installs one: under a versioned directory. */
    const installAt = async (version: string, source: string) => {
      const dir = join(installs, ".pnpm", `@liustack+pptfast@${version}`, "node_modules", "@liustack", "pptfast", "dist")
      await mkdir(dir, { recursive: true })
      const cliPath = join(dir, "cli.mjs")
      await copyFile(source, cliPath)
      await copyFile(join(dirOf(source), "cli.log"), join(dir, "cli.log"))
      return cliPath
    }

    const template = await fakeCli()
    const before = await makeService("upgrade-e2e-old", { home, cliPath: await installAt("0.19.2", template) })
    const { deck } = await deckFixture("LOGO-V1")
    const value = await before.tool.execute({ target: deck })
    expect((await request(routeHandlerOf(before), `${PREVIEW_ROUTE}/${value.previewId}`)).status).toBe(200)

    const after = await makeService("upgrade-e2e-new", { home, cliPath: await installAt("0.99.0", template) })
    expect(originOf(after).cliPath).not.toBe(originOf(before).cliPath)
    expect(after.root).toBe(before.root)

    const handler = routeHandlerOf(after)
    for (const suffix of ["", "/html", "/pptx"]) {
      expect((await request(handler, `${PREVIEW_ROUTE}/${value.previewId}${suffix}`)).status, suffix).toBe(200)
    }
    // ...and the bytes are the ones the *old* CLI rendered, not something the
    // new one produced on the way past.
    const pptx = await request(handler, `${PREVIEW_ROUTE}/${value.previewId}/pptx`)
    expect(pptx.body.toString("utf8")).toBe("PPTX:e2e|LOGO-V1")
    expect(await cliInvocations(originOf(after).cliPath)).toEqual([])
  })

  it("puts nothing version-shaped or install-shaped in the path it writes to", async () => {
    // The property behind the test above, checked directly so it cannot be
    // satisfied by luck. The root is a function of the user's home alone.
    const { previewRoot, createPreviewService, __testing } = await loadPreviewTool()
    const { homedir } = await import("node:os")
    const { join } = await import("node:path")

    const original = process.env.PPTFAST_HOME
    try {
      delete process.env.PPTFAST_HOME
      // Follows the CLI's own `pptfastHome()` convention (src/cli/home.ts),
      // rather than inventing a second home for the plugin.
      expect(previewRoot()).toBe(join(homedir(), ".pptfast", __testing.PREVIEW_DIR))
      const a = createPreviewService("/opt/.pnpm/@liustack+pptfast@0.19.2/node_modules/x/dist/cli.js")
      const b = createPreviewService("/somewhere/else/@liustack+pptfast@9.9.9/dist/cli.js")
      expect(a.root).toBe(b.root)
      expect(a.root).toBe(previewRoot())
      expect(a.root).not.toMatch(/\d+\.\d+\.\d+/)
    } finally {
      if (original === undefined) delete process.env.PPTFAST_HOME
      else process.env.PPTFAST_HOME = original
    }
  })

  it("stays out of the system temp directory, which is swept on a schedule nobody controls", async () => {
    // The second half of the original defect, and the one that had nothing to
    // do with upgrades: the decks themselves were `mkdtemp` directories in
    // `$TMPDIR`, so macOS expired every card after a few days regardless.
    const { previewRoot } = await loadPreviewTool()
    const { tmpdir } = await import("node:os")
    const { resolve } = await import("node:path")

    const original = process.env.PPTFAST_HOME
    try {
      delete process.env.PPTFAST_HOME
      expect(previewRoot().startsWith(resolve(tmpdir()))).toBe(false)
    } finally {
      if (original === undefined) delete process.env.PPTFAST_HOME
      else process.env.PPTFAST_HOME = original
    }
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
    const records = await Promise.all(ids.map((id) => __testing.readRecord(svc.root, id)))
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
    const dir = await scratchRoot("atomic")
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
    // The id is the value that becomes a directory name, so the id is the value
    // whose shape is enforced. The tool's `target` is deliberately not checked
    // anywhere — `../deck` is a legal thing to ask the CLI for, and refusing it
    // would be a bug wearing a security badge.
    const { __testing } = await loadPreviewTool()
    const root = await scratchRoot("shape")
    for (const bad of ["../../etc/passwd", "", "..", ".", "a/b", "not a uuid!", "..%2fpasswd"]) {
      expect(await __testing.readRecord(root, bad), bad).toBeUndefined()
      expect(__testing.previewDir(root, bad), bad).toBeUndefined()
    }
    // Every path the module builds from an accepted id stays under the root,
    // staging directory included — that one is where the single `rm` points.
    const id = previewId("d0")
    expect(__testing.previewDir(root, id)!.startsWith(`${root}/`)).toBe(true)
    expect(__testing.partialDir(root, id).startsWith(`${root}/`)).toBe(true)
    expect(() => __testing.partialDir(root, "../../victim")).toThrow(/unsafe id/)
  })

  it("keeps the staging name out of reach of every id the route can spell", async () => {
    // The reason the route can never serve a half-written preview is not a
    // check, it is an alphabet: `ID_PATTERN` has no `.` in it, so no id can
    // name `<id>.partial`, and `<id>.partial` is where a render happens.
    const { __testing } = await loadPreviewTool()
    const root = await scratchRoot("staging-name")
    const id = previewId("d3")
    const staging = __testing.partialDir(root, id)
    expect(staging).toBe(`${__testing.previewDir(root, id)}${__testing.PARTIAL_SUFFIX}`)
    // Ask for the staging directory by name, the only way a client could: as
    // an id. It is not one.
    expect(__testing.previewDir(root, `${id}${__testing.PARTIAL_SUFFIX}`)).toBeUndefined()
  })

  it("reports a preview whose files are only partly there, instead of re-rendering today's version", async () => {
    // The whole point of one render window: a card must never quietly start
    // showing a deck rebuilt from today's configuration, today's image bytes
    // and today's renderer version.
    const { __testing } = await loadPreviewTool()
    const { rm } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const svc = await makeService("incomplete")
    const id = previewId("d1")
    await seedPreview(svc.root, id)
    await rm(join(svc.root, id, __testing.MANIFEST_FILE))

    // A second service on the same CLI path shares the previews but not the
    // memory, which is exactly what a plugin reload looks like.
    const reloaded = await reopen(svc)
    await expect(reloaded.recallAnywhere(id)).rejects.toBeInstanceOf(__testing.PreviewExpired)
    // ...and it names the file, because "your deck is gone" with no noun in it
    // leaves the user nowhere to look.
    await expect(reloaded.recallAnywhere(id)).rejects.toThrow(
      new RegExp(`${__testing.MANIFEST_FILE}.*is missing`),
    )
    // An id nobody ever handed out is a different answer: not found, not
    // half-there. That difference is what the route turns into 404 vs 410.
    expect(await reloaded.recallAnywhere(previewId("d2"))).toBeUndefined()
  })

  it("recalls a preview without writing anything, so reading history cannot change it", async () => {
    // The version of this file that had an eviction budget stamped an access
    // time on every recall to feed it. Nothing consumes that now, and a read
    // path that writes is a read path that can fail on a read-only disk, or
    // fight another process for the same inode.
    const { readdir, stat } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { __testing } = await loadPreviewTool()
    const svc = await makeService("recall-readonly")
    const id = previewId("d4")
    await seedPreview(svc.root, id)

    const dir = join(svc.root, id)
    const before = await readdir(dir)
    const stamp = (await stat(join(dir, __testing.RECORD_FILE))).mtimeMs
    // Fresh service, so the recall has to come off disk rather than out of the
    // in-memory map.
    expect(await (await reopen(svc)).recallAnywhere(id)).toBeDefined()
    expect(await readdir(dir)).toEqual(before)
    expect((await stat(join(dir, __testing.RECORD_FILE))).mtimeMs).toBe(stamp)
  })
})

describe("who can see whose previews", () => {
  it("shows one user's previews to every service that user runs, which is the fix", async () => {
    // The reverse of what this file used to assert, and deliberately so. The
    // old layout bucketed records by `sha256(cliPath)`, which made two services
    // strangers — including the two that matter: the plugin before an upgrade
    // and the plugin after it. Isolation there was a privacy claim about one
    // person's own machine, paid for with every historical card going dead on
    // `npm update`.
    const { __testing } = await loadPreviewTool()
    const { join } = await import("node:path")
    const first = await makeService("share-a")
    const second = await makeService("share-b", originOf(first))
    expect(second.root).toBe(first.root)

    const id = previewId("b1")
    await seedPreview(first.root, id, { record: { target: "a.json" } })
    expect(await second.recallAnywhere(id)).toMatchObject({ target: "a.json", outDir: join(first.root, id) })
  })

  it("keeps a different $PPTFAST_HOME entirely separate, which is how the tests stay off each other", async () => {
    const first = await makeService("home-a")
    const second = await makeService("home-b")
    expect(first.root).not.toBe(second.root)

    const id = previewId("b2")
    await seedPreview(first.root, id, { record: { target: "a.json" } })
    expect(await second.recallAnywhere(id)).toBeUndefined()
  })

  it("reads $PPTFAST_HOME the way the CLI does, including the empty-string case", async () => {
    // `PPTFAST_HOME=` in a shell profile sets the variable to the empty string
    // rather than unsetting it, and `join("", "previews")` is a relative path —
    // which would put a user's decks wherever the harness happened to be
    // started from, and would make the root move when the cwd did.
    const { previewRoot, __testing } = await loadPreviewTool()
    const { homedir } = await import("node:os")
    const { isAbsolute, join } = await import("node:path")
    const original = process.env.PPTFAST_HOME
    try {
      const fallback = join(homedir(), ".pptfast", __testing.PREVIEW_DIR)
      delete process.env.PPTFAST_HOME
      expect(previewRoot()).toBe(fallback)
      process.env.PPTFAST_HOME = ""
      expect(previewRoot()).toBe(fallback)
      process.env.PPTFAST_HOME = "relative/home"
      expect(isAbsolute(previewRoot())).toBe(true)
      process.env.PPTFAST_HOME = "/somewhere/else"
      expect(previewRoot()).toBe(join("/somewhere/else", __testing.PREVIEW_DIR))
    } finally {
      if (original === undefined) delete process.env.PPTFAST_HOME
      else process.env.PPTFAST_HOME = original
    }
  })
})

/**
 * A stand-in for `dist/cli.js`.
 *
 * The tests below have to observe what the renderer saw at the moment it ran,
 * which the real CLI cannot tell them and a build step should not be required
 * to find out. This one resolves every image the way a real renderer does —
 * a `data:` payload from the IR itself, anything else read off disk *at render
 * time* — and stamps what it got into its output. A deck rendered twice around
 * an edited image therefore produces two different files if and only if the
 * two runs really did read that file twice.
 *
 * Five switches, each a file in the CLI's own directory:
 *
 *  - `fail-render` — the export refuses, the preview still works.
 *  - `fail-preview` — the preview refuses, with page markup already written,
 *    so the failure path has a real half-built directory to clean up.
 *  - `mutate-asset` — holds a path the *preview* run overwrites just before
 *    it exits. That is the window between the two spawns, reproduced
 *    deterministically: the parent waits for this process to die before it
 *    starts the export, so an export that reads files off disk is guaranteed
 *    to see the new bytes and disagree with the preview it came from.
 *  - `kill-parent-at` — names a point in the render at which this process
 *    SIGKILLs the process that spawned it. That is how "the machine died
 *    here" gets tested rather than argued about: an exception runs `execute`'s
 *    own cleanup, and a kill runs nothing at all, which is the case the
 *    publish-by-rename exists for.
 *  - the IR's own `placeholder` flag — makes the manifest mark the page
 *    unfilled and makes `render` refuse without `--draft`, which is the real
 *    CLI's draft gate in miniature.
 *
 * It also appends every invocation to `cli.log`, which is how "the download
 * route starts no process" is checked rather than asserted.
 */
const FAKE_CLI_SOURCE = [
  'import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"',
  'import { dirname, join } from "node:path"',
  "",
  "const argv = process.argv.slice(2)",
  "const cmd = argv[0]",
  "const target = argv[1]",
  'const out = argv[argv.indexOf("-o") + 1]',
  "const home = dirname(process.argv[1])",
  'appendFileSync(join(home, "cli.log"), argv.join(" ") + "\\n")',
  "",
  "// The fixture images are a real PNG signature followed by a marker string,",
  "// so this fake can name what it saw the way a renderer names pixels.",
  "const payload = (buf) =>",
  '  buf.length >= 8 && buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG" ? buf.subarray(8).toString("utf8") : buf.toString("utf8")',
  "",
  'const ir = JSON.parse(readFileSync(target, "utf8"))',
  "const images = ir.assets && ir.assets.images ? Object.values(ir.assets.images) : []",
  "const bytes = images",
  "  .map((asset) => {",
  '    const src = String(asset.src || "")',
  '    if (src.startsWith("data:")) return payload(Buffer.from(src.slice(src.indexOf(",") + 1), "base64"))',
  "    try { return payload(readFileSync(src)) } catch { return \"MISSING\" }",
  "  })",
  '  .join(",")',
  'const marker = ir.filename + "|" + bytes',
  "",
  'const killFile = join(home, "kill-parent-at")',
  'const killAt = existsSync(killFile) ? readFileSync(killFile, "utf8").trim() : ""',
  "// Kill the process that spawned this one, at exactly the point a test named.",
  "// The parent is blocked waiting for this process to exit, so nothing of its",
  "// own runs between the write just above and the signal landing.",
  "const killParentAt = (point) => {",
  "  if (killAt !== point) return",
  '  if (process.ppid > 1) process.kill(process.ppid, "SIGKILL")',
  "  process.exit(0)",
  "}",
  "",
  'if (cmd === "preview") {',
  "  mkdirSync(out, { recursive: true })",
  '  killParentAt("preview-start")',
  '  writeFileSync(join(out, "001.svg"), "<svg>" + marker + "</svg>")',
  '  killParentAt("preview-svg")',
  '  if (existsSync(join(home, "fail-preview"))) {',
  '    process.stderr.write("fake preview refused\\n")',
  "    process.exit(5)",
  "  }",
  '  if (killAt === "preview-manifest") {',
  "    // An index naming a page whose file was never written — the nastiest",
  "    // shape a half-finished render can leave behind, because it reads as",
  "    // complete until something tries to open page two.",
  "    writeFileSync(",
  '      join(out, "manifest.json"),',
  "      JSON.stringify({",
  "        title: ir.filename,",
  '        pages: [{ page: 1, id: "page-1", file: "001.svg" }, { page: 2, id: "page-2", file: "002.svg" }],',
  "      }),",
  "    )",
  '    killParentAt("preview-manifest")',
  "  }",
  "  // The self-contained review page the real `preview --html` writes, and",
  "  // the file the card's modal loads in an iframe. Stamped with the same",
  "  // marker as everything else, so a test can tell which render produced it.",
  '  writeFileSync(join(out, "preview.html"), "<!doctype html><title>" + marker + "</title>")',
  "  writeFileSync(",
  '    join(out, "manifest.json"),',
  "    JSON.stringify({",
  "      title: ir.filename,",
  "      checks: { ran: true },",
  '      pages: [{ page: 1, id: "page-1", file: "001.svg", ...(ir.placeholder ? { placeholder: true } : {}) }],',
  "    }),",
  "  )",
  "  // Last thing before exit: move the source out from under whoever runs next.",
  '  const mutate = join(home, "mutate-asset")',
  "  if (existsSync(mutate)) {",
  '    const [path, replacement] = readFileSync(mutate, "utf8").split("\\n")',
  '    writeFileSync(path, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(replacement)]))',
  "  }",
  '} else if (cmd === "render") {',
  '  if (existsSync(join(home, "fail-render"))) {',
  '    process.stderr.write("fake render refused\\n")',
  "    process.exit(2)",
  "  }",
  '  if (ir.placeholder && !argv.includes("--draft")) {',
  '    process.stderr.write("deck has 1 unfilled placeholder page — fill it or pass --draft\\n")',
  "    process.exit(4)",
  "  }",
  "  mkdirSync(dirname(out), { recursive: true })",
  '  writeFileSync(out, "PPTX:" + marker)',
  '  killParentAt("render-done")',
  '  if (existsSync(join(home, "seal-root"))) {',
  "    // Take write permission off the preview root on the way out, so the",
  "    // publish that runs next fails the way a full disk would: everything",
  "    // rendered, nothing able to land under its final name.",
  "    chmodSync(dirname(dirname(out)), 0o500)",
  "  }",
  "} else {",
  '  process.stderr.write("unsupported command " + cmd + "\\n")',
  "  process.exit(3)",
  "}",
  "",
].join("\n")

async function fakeCli(
  options: { failRender?: boolean; failPreview?: boolean; sealRoot?: boolean } = {},
): Promise<string> {
  const { writeFile } = await import("node:fs/promises")
  const { join } = await import("node:path")
  const home = await scratchTmp("pptfast-fakecli-")
  const cliPath = join(home, "cli.mjs")
  await writeFile(cliPath, FAKE_CLI_SOURCE)
  await writeFile(join(home, "cli.log"), "")
  if (options.failRender) await writeFile(join(home, "fail-render"), "")
  if (options.failPreview) await writeFile(join(home, "fail-preview"), "")
  if (options.sealRoot) await writeFile(join(home, "seal-root"), "")
  return cliPath
}

/**
 * Arm the fake CLI to overwrite `path` with `replacement` at the end of its
 * preview run — the source edit that lands between the two spawns.
 */
async function mutateDuringPreview(cliPath: string, path: string, replacement: string): Promise<void> {
  const { writeFile } = await import("node:fs/promises")
  const { dirname, join } = await import("node:path")
  await writeFile(join(dirname(cliPath), "mutate-asset"), `${path}\n${replacement}`)
}

async function cliInvocations(cliPath: string): Promise<string[]> {
  const { readFile } = await import("node:fs/promises")
  const { dirname, join } = await import("node:path")
  const log = await readFile(join(dirname(cliPath), "cli.log"), "utf8")
  return log.split("\n").filter((line) => line !== "")
}

/**
 * PNG's own eight-byte signature.
 *
 * The fixtures carry it because the snapshot inliner sniffs magic numbers
 * rather than trusting a filename — a fixture that is only pretending to be a
 * PNG would be declined and silently left as a path, which would make every
 * test below pass for the wrong reason.
 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** A valid-enough PNG whose payload is a marker the fake CLI can echo back. */
function pngWith(marker: string): Buffer {
  return Buffer.concat([PNG_SIGNATURE, Buffer.from(marker)])
}

/** A deck directory holding one IR file and the local image it points at. */
async function deckFixture(
  logo: string,
  options: { placeholder?: boolean } = {},
): Promise<{ deck: string; logoPath: string }> {
  const { mkdir, writeFile } = await import("node:fs/promises")
  const { join } = await import("node:path")
  const src = await scratchTmp("pptfast-src-")
  await mkdir(join(src, "assets"), { recursive: true })
  const logoPath = join(src, "assets", "logo.png")
  await writeFile(logoPath, pngWith(logo))
  const deck = join(src, "deck.json")
  await writeFile(
    deck,
    JSON.stringify({
      filename: "e2e",
      ...(options.placeholder ? { placeholder: true } : {}),
      assets: { images: { local: { src: "assets/logo.png" } } },
    }),
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
  async function servedPreview(
    tag: string,
    options: { failRender?: boolean; placeholder?: boolean; mutateTo?: string } = {},
  ) {
    const { PREVIEW_ROUTE } = await loadPreviewTool()
    const cliPath = await fakeCli(options)
    const svc = await makeService(tag, { cliPath })
    const { deck, logoPath } = await deckFixture("LOGO-V1", { placeholder: options.placeholder })
    if (options.mutateTo) await mutateDuringPreview(cliPath, logoPath, options.mutateTo)
    const value = await svc.tool.execute({ target: deck })
    return { svc, cliPath, deck, logoPath, value, handler: routeHandlerOf(svc), route: PREVIEW_ROUTE }
  }

  it("publishes the whole preview under the id, in the user's home, in one step", async () => {
    // The layout, asserted once so the rest of this file can lean on it: the id
    // is the directory name, the record lives inside the directory it
    // describes, and nothing is left in a staging name once the call returns.
    const { readdir } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { __testing } = await loadPreviewTool()
    const { svc, value } = await servedPreview("route-layout")

    expect(value.outDir).toBe(join(svc.root, value.previewId))
    const produced = await readdir(value.outDir)
    expect(produced).toEqual(
      expect.arrayContaining([
        __testing.RECORD_FILE,
        __testing.MANIFEST_FILE,
        __testing.SNAPSHOT_FILE,
        __testing.PREVIEW_HTML_FILE,
        "001.svg",
        "e2e.pptx",
      ]),
    )
    // Nothing half-named survives a successful call.
    expect(await readdir(svc.root)).toEqual([value.previewId])
  })

  it("gives two previews of the same target two directories that cannot overwrite each other", async () => {
    // The first draft of this design kept one preview per deck, so a second
    // call silently invalidated every card the first one had produced. Worse
    // than expiry, because it happened on the user's own next action.
    const { readFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { svc, deck, value: first, handler, route } = await servedPreview("route-two-runs")
    const second = await svc.tool.execute({ target: deck })

    expect(second.previewId).not.toBe(first.previewId)
    expect(second.outDir).not.toBe(first.outDir)
    for (const value of [first, second]) {
      expect((await request(handler, `${route}/${value.previewId}`)).status).toBe(200)
      expect((await request(handler, `${route}/${value.previewId}/pptx`)).status).toBe(200)
      expect((await readFile(join(value.outDir, "e2e.pptx"))).toString("utf8")).toBe("PPTX:e2e|LOGO-V1")
    }
  })

  it("serves the rendered bundle to the card", async () => {
    const { handler, route, value } = await servedPreview("route-bundle")
    const res = await request(handler, `${route}/${value.previewId}`)
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toBe("application/json")
    const bundle = JSON.parse(res.body.toString("utf8")) as { pages: { svg: string }[] }
    expect(bundle.pages).toHaveLength(1)
    expect(bundle.pages[0]!.svg).toContain("LOGO-V1")
  })

  it("serves the deck's own preview.html, which is what the card's viewer loads", async () => {
    // The modal is an iframe pointing here. Before this route existed the card
    // reimplemented the viewer in React — its own arrow keys, its own counter,
    // its own idea of which pages were too big to show — next to the finished
    // page `preview --html` writes for every run. Delete this branch and the
    // modal opens on a 404.
    const { handler, route, value, cliPath } = await servedPreview("route-html")
    const res = await request(handler, `${route}/${value.previewId}/html`)

    expect(res.status).toBe(200)
    // Served as a page, not as a download and not as JSON: an iframe renders
    // what the content type says it is.
    expect(res.headers["content-type"]).toBe("text/html; charset=utf-8")
    expect(res.headers["content-disposition"]).toBeUndefined()
    expect(res.body.toString("utf8")).toContain("<!doctype html>")
    // ...and it is the file that render wrote, not one built now.
    expect(res.body.toString("utf8")).toContain("e2e|LOGO-V1")
    expect(await cliInvocations(cliPath)).toHaveLength(2)
  })

  it("serves the same deck to the iframe, the strip and the download", async () => {
    // One render window, said from the third side. The viewer is the surface
    // the user actually judges the deck on, so a viewer that could be built
    // from anything newer than the card would make the other two guarantees
    // decorative.
    const { handler, route, value, logoPath } = await servedPreview("route-html-same-source")
    const { writeFile } = await import("node:fs/promises")
    await writeFile(logoPath, "LOGO-V2")

    const html = await request(handler, `${route}/${value.previewId}/html`)
    expect(html.body.toString("utf8")).toContain("LOGO-V1")
    expect(html.body.toString("utf8")).not.toContain("LOGO-V2")
    expect((await request(handler, `${route}/${value.previewId}/pptx`)).body.toString("utf8")).toBe(
      "PPTX:e2e|LOGO-V1",
    )
  })

  it("reports 410 for a viewer page that is gone, rather than an empty frame", async () => {
    const { handler, route, value } = await servedPreview("route-html-gone")
    const { rm } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { __testing } = await loadPreviewTool()
    await rm(join(value.outDir, __testing.PREVIEW_HTML_FILE), { force: true })

    const res = await request(handler, `${route}/${value.previewId}/html`)
    expect(res.status).toBe(410)
    // Said as a page, because the only consumer of this route is an iframe
    // and an iframe renders whatever body it is handed. A JSON body here
    // reached the user as a bare browser document showing
    // `{"error":"..."}` inside the viewer's own frame.
    expect(res.headers["content-type"]).toBe("text/html; charset=utf-8")
    const page = res.body.toString("utf8")
    expect(page).toContain("<!doctype html>")
    expect(page).toContain("no longer on disk")
    expect(page).toMatch(/preview page for this preview is gone/)
    expect(page).not.toContain('{"error"')
    // Losing the viewer does not cost the card its strip or its export.
    expect((await request(handler, `${route}/${value.previewId}`)).status).toBe(200)
    expect((await request(handler, `${route}/${value.previewId}/pptx`)).status).toBe(200)
  })

  it("tells the reader where decks live and that nothing removes them on a timer", async () => {
    // The old page said the preview had "expired", which was true of the old
    // storage and is a lie about this one: there is no timer, no budget and no
    // sweep, so a missing deck was deleted. A user who reads "expired" goes
    // looking for a retention setting; a user who reads this goes looking in
    // the directory that is named for them.
    const { previewRoot, __testing } = await loadPreviewTool()
    const original = process.env.PPTFAST_HOME
    try {
      process.env.PPTFAST_HOME = "/tmp/pptfast-copy-check"
      const page = __testing.missingPage("the rendered deck for this preview is gone")
      expect(page).not.toMatch(/expired/i)
      expect(page).not.toMatch(/temporary|temp directory/i)
      expect(page).toContain(previewRoot())
      expect(page).toContain("until you delete them")
      expect(page).toContain("pptfast_preview")
    } finally {
      if (original === undefined) delete process.env.PPTFAST_HOME
      else process.env.PPTFAST_HOME = original
    }
  })

  it("escapes the path it names, so a message can never become markup", async () => {
    // The message carries a filesystem path, and this route now answers the
    // viewer with a document. A path is chosen by whoever created the deck.
    const { __testing } = await loadPreviewTool()
    const page = __testing.missingPage('gone (/tmp/<script>alert("x")</script>/deck)')
    expect(page).not.toContain("<script>")
    expect(page).toContain("&lt;script&gt;")
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

  it("survives a source image edited in the window between the preview and the export", async () => {
    // The defect the previous round's "same source" test could not see. It
    // edited the image after `execute` had finished, which only proves the
    // download starts no renderer. The window that actually exists is *inside*
    // `execute`: preview and render are two separate child processes, and the
    // parent waits for the first to exit before spawning the second. Anything
    // that writes to the source file in between — an agent regenerating a
    // logo, a build step, a designer hitting save — is seen by exactly one of
    // them.
    //
    // Here the preview process itself performs that write on its way out, so
    // the ordering is deterministic rather than lucky: the export process
    // starts strictly afterwards and would read LOGO-V2 off disk. It does not,
    // because the snapshot no longer names a path — it carries the bytes.
    // Remove the `inlineLocalImages` call in `captureSnapshot` and this goes
    // red on the .pptx.
    const { readFile } = await import("node:fs/promises")
    const { handler, route, value, logoPath } = await servedPreview("route-mid-window", { mutateTo: "LOGO-V2" })

    // The edit really did land, and really did land before the export ran.
    expect((await readFile(logoPath)).toString("utf8")).toContain("LOGO-V2")

    const pptx = await request(handler, `${route}/${value.previewId}/pptx`)
    expect(pptx.body.toString("utf8")).toBe("PPTX:e2e|LOGO-V1")
    const bundle = JSON.parse((await request(handler, `${route}/${value.previewId}`)).body.toString("utf8")) as {
      pages: { svg: string }[]
    }
    expect(bundle.pages[0]!.svg).toContain("LOGO-V1")
    // Said the way a user would say it: what is on screen is what got saved.
    expect(pptx.body.toString("utf8")).not.toContain("LOGO-V2")
    expect(bundle.pages[0]!.svg).not.toContain("LOGO-V2")
  })

  it("exports a deck with unfilled pages as a draft instead of leaving the button broken forever", async () => {
    // `preview` renders a placeholder page happily and `render` refuses it, so
    // the card used to show a deck whose download was guaranteed to fail —
    // discoverable only by clicking, and permanent, because the export is
    // rendered once inside `execute` and never retried. Drop the `--draft`
    // argument and this goes red at the first assertion, with a 410 on the
    // download.
    const { handler, route, value, cliPath } = await servedPreview("route-draft", { placeholder: true })

    const res = await request(handler, `${route}/${value.previewId}/pptx`)
    expect(res.status).toBe(200)
    expect(res.body.toString("utf8")).toBe("PPTX:e2e|LOGO-V1")

    // Not a silent substitution: the flag is passed exactly once, and only to
    // the render that needed it.
    const invocations = await cliInvocations(cliPath)
    expect(invocations.filter((line) => line.includes("--draft"))).toHaveLength(1)
    expect(invocations.find((line) => line.startsWith("render"))).toContain("--draft")

    // ...and everything the user sees says "draft": the card badge rides the
    // bundle, the saved file's own name carries it, and so does the line the
    // model reads.
    expect(value.bundle.draft).toBe(true)
    expect(res.headers["content-disposition"]).toBe('attachment; filename="e2e-draft.pptx"')
    const { definePreviewTool } = await loadPreviewTool()
    expect(definePreviewTool("/x.js").output.render({}, value)[0]!.text).toContain("draft")
  })

  it("keeps the draft gate armed for every deck that has no unfilled pages", async () => {
    // The lazy fix is to pass `--draft` always, which disables the gate for
    // decks whose placeholders nobody has looked at. The flag has to be a
    // consequence of what the preview showed.
    const { cliPath, value } = await servedPreview("route-no-draft")
    expect((await cliInvocations(cliPath)).some((line) => line.includes("--draft"))).toBe(false)
    expect(value.bundle.draft).toBe(false)
  })

  it("answers an unknown id with 404 and a malformed one with the same, never a stack trace", async () => {
    const { handler, route } = await servedPreview("route-unknown")
    const missing = await request(handler, `${route}/${previewId("e1")}`)
    expect(missing.status).toBe(404)
    expect(JSON.parse(missing.body.toString("utf8"))).toEqual({
      code: "preview_unknown",
      error: "unknown preview id",
    })

    // Ids become filenames, so a traversal attempt must not even be looked up.
    for (const bad of ["../../etc/passwd", "..%2f..%2fpasswd", "", "not a uuid!"]) {
      const res = await request(handler, `${route}/${bad}`)
      expect(res.status, bad).toBe(404)
    }
    // The suffix router must not let a traversal in through either of the
    // paths that end in one — the id is what becomes a filesystem lookup, and
    // it is the same id whichever suffix follows it.
    expect((await request(handler, `${route}/../../etc/passwd/pptx`)).status).toBe(404)
    expect((await request(handler, `${route}/../../etc/passwd/html`)).status).toBe(404)

    // The viewer's 404 is the one a person reads. This is the exact response
    // that reached a user as a bare browser document reading
    // `{"error":"unknown preview id"}`, framed by the viewer's own buttons.
    const viewer = await request(handler, `${route}/${previewId("e1")}/html`)
    expect(viewer.status).toBe(404)
    expect(viewer.headers["content-type"]).toBe("text/html; charset=utf-8")
    expect(viewer.body.toString("utf8")).toContain("no longer on disk")
    expect(viewer.body.toString("utf8")).not.toContain('{"error"')
  })

  it("answers for the disk, not for its own memory, without needing a restart first", async () => {
    // The bug this replaces made the answer depend on process state. The
    // service that rendered a preview kept its bundle in a map and checked that
    // map before the filesystem, so after the directory was deleted the bundle
    // route said 200 out of memory while `/html` and `/pptx` went to disk and
    // said 410 — and all three flipped to 404 once the entry aged out or the
    // harness restarted. One fact, three answers, decided by how many other
    // previews had been rendered since.
    //
    // The previous version of this test reopened the service before asking,
    // which threw away the memory that would have exposed it. This one asks the
    // *same* service that did the render. Put a read cache back in front of
    // `recallAnywhere` and this goes red immediately.
    const { rm } = await import("node:fs/promises")
    const { handler, route, value, svc } = await servedPreview("route-no-cache")
    expect((await request(handler, `${route}/${value.previewId}`)).status).toBe(200)

    await rm(value.outDir, { recursive: true, force: true })

    for (const path of ["", "/pptx", "/html"]) {
      expect((await request(handler, `${route}/${value.previewId}${path}`)).status, path).toBe(404)
    }
    expect(await svc.recallAnywhere(value.previewId)).toBeUndefined()
  })

  it("gives the same answer to a live service and a restarted one", async () => {
    // The property behind the test above, checked from both sides at once for
    // each disk state a preview can be in. Any disagreement between the two
    // columns means memory is deciding something, which is what makes a card's
    // behaviour depend on when it was opened.
    const { rm } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { __testing } = await loadPreviewTool()
    const { handler, route, value, svc, deck } = await servedPreview("route-agree")

    const damage = [
      ["untouched", async () => {}, 200],
      ["one page removed", async () => rm(join(value.outDir, "001.svg")), 410],
      // 410, not 404: the directory is still there and so are the rendered
      // pages. Only the bookkeeping went — which is a preview that lost part of
      // itself, not an id nobody was ever given.
      ["record removed", async () => rm(join(value.outDir, __testing.RECORD_FILE)), 410],
      ["whole directory removed", async () => rm(value.outDir, { recursive: true, force: true }), 404],
    ] as const

    for (const [name, breakIt, expected] of damage) {
      await breakIt()
      const live = await request(handler, `${route}/${value.previewId}`)
      const restarted = await request(routeHandlerOf(await reopen(svc)), `${route}/${value.previewId}`)
      expect(live.status, name).toBe(expected)
      expect(restarted.status, `${name} (after restart)`).toBe(expected)
    }
    void deck
  })

  it("stamps every answer, so a 404 from somewhere else cannot be mistaken for ours", async () => {
    // The card retires a deck permanently on our 404, and a 404 does not say
    // who wrote it: a plugin whose route never registered, a proxy in front of
    // the harness, or a shell serving its own not-found page all produce one
    // that looks identical. The stamp is the difference, so it has to be on
    // every answer this route writes — success and failure alike, or the card
    // would learn to distrust exactly the responses that matter.
    const { ROUTE_HEADER, ROUTE_HEADER_VALUE, PREVIEW_ROUTE, __testing } = await loadPreviewTool()
    const { rm } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { handler, route, value } = await servedPreview("route-stamp")

    const answers = [
      await request(handler, `${route}/${value.previewId}`),
      await request(handler, `${route}/${value.previewId}/html`),
      await request(handler, `${route}/${value.previewId}/pptx`),
      await request(handler, `${route}/${previewId("aa")}`),
      await request(handler, `${route}/not-an-id`),
    ]
    await rm(join(value.outDir, __testing.MANIFEST_FILE))
    answers.push(await request(handler, `${PREVIEW_ROUTE}/${value.previewId}`))

    expect(answers.map((a) => a.status)).toEqual([200, 200, 200, 404, 404, 410])
    for (const answer of answers) {
      expect(answer.headers[ROUTE_HEADER], String(answer.status)).toBe(ROUTE_HEADER_VALUE)
    }
  })

  it("answers 404 for a preview the user deleted outright, and keeps no gravestone", async () => {
    // The design's one deliberate loss. Once the directory is gone there is
    // nothing on disk that says this id ever existed, so the honest answer is
    // 404 — the same one an id that was never handed out gets. Keeping a
    // tombstone to answer 410 instead would put disk back on a per-call
    // footing, which is the cost this whole change exists to remove. The
    // evidence the card needs is in the transcript, not here.
    const { readdir } = await import("node:fs/promises")
    const { rm } = await import("node:fs/promises")
    const { handler, route, value, svc, cliPath } = await servedPreview("route-deleted")
    await rm(value.outDir, { recursive: true, force: true })
    // A reload: the files are gone and so is the memory that hid their loss.
    const afterReload = routeHandlerOf(await reopen(svc))

    for (const path of ["", "/pptx", "/html"]) {
      expect((await request(afterReload, `${route}/${value.previewId}${path}`)).status, path).toBe(404)
    }
    const viewer = await request(afterReload, `${route}/${value.previewId}/html`)
    expect(viewer.headers["content-type"]).toBe("text/html; charset=utf-8")
    expect(viewer.body.toString("utf8")).toContain("no longer on disk")
    // Nothing was written to answer the question, and nothing was re-rendered
    // to dodge it.
    expect(await readdir(svc.root)).toEqual([])
    expect(await cliInvocations(cliPath)).toHaveLength(2)
    void handler
  })

  it("answers 410 and names the missing file when a preview survived only in part", async () => {
    // The other row of the table: the directory is still there, the deck in it
    // is not whole. That is a different fact from "never heard of this id", and
    // the card acts on the difference — so the route has to make it.
    const { rm } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { route, value, svc, cliPath } = await servedPreview("route-incomplete")
    await rm(join(value.outDir, "001.svg"))
    const afterReload = routeHandlerOf(await reopen(svc))

    const bundle = await request(afterReload, `${route}/${value.previewId}`)
    expect(bundle.status).toBe(410)
    const message = JSON.parse(bundle.body.toString("utf8")).error as string
    expect(message).toMatch(/no longer complete/)
    expect(message).toContain(join(value.outDir, "001.svg"))

    // The viewer answers the same way, and says it in a document rather than
    // in JSON: an iframe renders the body it is handed, so this is the one
    // response on this route a person reads with their eyes.
    const html = await request(afterReload, `${route}/${value.previewId}/html`)
    expect(html.status).toBe(410)
    expect(html.headers["content-type"]).toBe("text/html; charset=utf-8")
    expect(html.body.toString("utf8")).toContain("no longer on disk")
    // Not a re-render, and not a 404 body saved as `deck.pptx` either.
    expect((await request(afterReload, `${route}/${value.previewId}/pptx`)).status).toBe(410)
    expect(await cliInvocations(cliPath)).toHaveLength(2)
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

  it("answers a file it could not read with a retryable status, never with a deletion", async () => {
    // The distinction the whole missing-state model rests on, and the one this
    // route got wrong everywhere at once: every read failure was reported as
    // "the file is not there". `ENOENT` means that. `EACCES` — a permission bit
    // changed by a backup tool, a directory a sync client locked — does not,
    // and neither does `EIO` off a failing disk.
    //
    // It matters because the card was just taught that 404 and 410 are final
    // and are never re-asked. Spend one on a permission blip and a deck that is
    // sitting right there is retired for the life of the page. Take the errno
    // check out of `readRecord`, `recallAnywhere` or the two file branches and
    // the matching row below goes red.
    const { chmod } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { __testing } = await loadPreviewTool()

    const unreadable = [
      ["the record", __testing.RECORD_FILE, ""],
      ["the manifest", __testing.MANIFEST_FILE, ""],
      ["a page", "001.svg", ""],
      ["the viewer page", __testing.PREVIEW_HTML_FILE, "/html"],
      ["the export", "e2e.pptx", "/pptx"],
    ] as const

    for (const [what, file, suffix] of unreadable) {
      const { handler, route, value } = await servedPreview(`unreadable-${file}`)
      const path = join(value.outDir, file)
      await chmod(path, 0o000)
      try {
        // Prove the environment can actually express this before trusting the
        // result — running as root would read it anyway and the assertion below
        // would pass for the wrong reason.
        const { readFile } = await import("node:fs/promises")
        let denied = false
        await readFile(path).catch((error: NodeJS.ErrnoException) => {
          denied = error.code === "EACCES" || error.code === "EPERM"
        })
        expect(denied, `${what}: chmod 000 did not deny this process a read`).toBe(true)

        const res = await request(handler, `${route}/${value.previewId}${suffix}`)
        expect(res.status, what).toBe(503)
        const body = res.body.toString("utf8")
        expect(body, what).toMatch(/could not be read right now/)
        expect(body, what).toContain(path)
        // The words that would be a lie about a file that is present.
        expect(body, what).not.toMatch(/is missing|unknown preview id/)
      } finally {
        await chmod(path, 0o600).catch(() => {})
      }
    }
  })

  it("says try again rather than rebuild it, when the viewer's own page is the one it cannot read", async () => {
    // The 503 reaches the iframe as a document, so it has to be a different
    // document. Handing a permission blip the "no longer on disk" page sends a
    // user off to rebuild a deck that never went anywhere.
    const { chmod } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { __testing } = await loadPreviewTool()
    const { handler, route, value } = await servedPreview("unreadable-html-page")
    const path = join(value.outDir, __testing.PREVIEW_HTML_FILE)

    await chmod(path, 0o000)
    try {
      const res = await request(handler, `${route}/${value.previewId}/html`)
      expect(res.status).toBe(503)
      expect(res.headers["content-type"]).toBe("text/html; charset=utf-8")
      const page = res.body.toString("utf8")
      expect(page).toContain("could not be read just now")
      expect(page).toContain("open it again in a moment")
      expect(page).not.toContain("no longer on disk")
      expect(page).not.toContain("until you delete them")
    } finally {
      await chmod(path, 0o600).catch(() => {})
    }
  })

  it("lands every real failure in exactly one class, and the right one", async () => {
    // The classification as a table, checked against the disk states that
    // actually occur. Written this way because the gap that was found was not a
    // wrong branch — it was a state nobody had enumerated: the directory
    // survives, the rendered pages survive, and only `record.json` is gone. It
    // fell into "unknown preview id", which told the user an id they were
    // looking at had never existed.
    //
    // Exhaustive and mutually exclusive: every row below produces exactly one
    // status and one code, and no two rows produce the same pair for different
    // reasons.
    const { chmod, rm, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { __testing, PREVIEW_ROUTE, FAILURE_CODES } = await loadPreviewTool()
    const svc = await makeService("classification")
    const handler = routeHandlerOf(svc)

    const cases: [string, (dir: string) => Promise<void>, number, string][] = [
      ["intact", async () => {}, 200, ""],
      [
        "the whole directory is gone",
        async (dir) => rm(dir, { recursive: true, force: true }),
        404,
        FAILURE_CODES.unknown,
      ],
      [
        "the directory is there and the record is not",
        async (dir) => rm(join(dir, __testing.RECORD_FILE)),
        410,
        FAILURE_CODES.missing,
      ],
      ["a rendered page is gone", async (dir) => rm(join(dir, "001.svg")), 410, FAILURE_CODES.missing],
      ["the manifest is gone", async (dir) => rm(join(dir, __testing.MANIFEST_FILE)), 410, FAILURE_CODES.missing],
      [
        "the record will not parse",
        async (dir) => writeFile(join(dir, __testing.RECORD_FILE), "{ not json"),
        410,
        FAILURE_CODES.damaged,
      ],
      [
        "the manifest is the wrong shape",
        async (dir) => writeFile(join(dir, __testing.MANIFEST_FILE), '{"pages":[null]}'),
        410,
        FAILURE_CODES.damaged,
      ],
      [
        "the record cannot be read",
        async (dir) => chmod(join(dir, __testing.RECORD_FILE), 0o000),
        503,
        FAILURE_CODES.unreadable,
      ],
      [
        "a page cannot be read",
        async (dir) => chmod(join(dir, "001.svg"), 0o000),
        503,
        FAILURE_CODES.unreadable,
      ],
    ]

    const seen = new Map<string, string>()
    for (const [index, [what, breakIt, status, code]] of cases.entries()) {
      const id = previewId(`7${index}a`)
      const dir = join(svc.root, id)
      await seedPreview(svc.root, id)
      await breakIt(dir)
      try {
        const res = await request(handler, `${PREVIEW_ROUTE}/${id}`)
        expect(res.status, what).toBe(status)
        if (code !== "") {
          expect(JSON.parse(res.body.toString("utf8")).code, what).toBe(code)
          seen.set(what, `${res.status} ${code}`)
        }
      } finally {
        await chmod(dir, 0o700).catch(() => {})
        await chmod(join(dir, __testing.RECORD_FILE), 0o600).catch(() => {})
        await chmod(join(dir, "001.svg"), 0o600).catch(() => {})
      }
    }

    // Every documented code was actually produced by a real disk state, so the
    // table is not carrying a class nothing can reach.
    expect(new Set(seen.values())).toEqual(
      new Set([
        `404 ${FAILURE_CODES.unknown}`,
        `410 ${FAILURE_CODES.missing}`,
        `410 ${FAILURE_CODES.damaged}`,
        `503 ${FAILURE_CODES.unreadable}`,
      ]),
    )
  })

  it("treats something that is not a directory as no preview at all", async () => {
    // The odd corner the classification has to answer anyway: a plain file
    // sitting where a preview directory should be. It is not a preview, so it
    // gets the answer nothing gets.
    const { PREVIEW_ROUTE, FAILURE_CODES, __testing } = await loadPreviewTool()
    const { mkdir, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const svc = await makeService("not-a-directory")
    const id = previewId("a6")
    await mkdir(svc.root, { recursive: true })
    await writeFile(join(svc.root, id), "not a directory")

    expect(await __testing.directoryState(join(svc.root, id))).toBe("other")
    expect(await svc.recallAnywhere(id)).toBeUndefined()
    const res = await request(routeHandlerOf(svc), `${PREVIEW_ROUTE}/${id}`)
    expect(res.status).toBe(404)
    expect(JSON.parse(res.body.toString("utf8")).code).toBe(FAILURE_CODES.unknown)
  })

  it("asks again later when the whole preview root is unreadable", async () => {
    // A root this process cannot traverse must not read as "no such preview" —
    // it would retire every card the user has at once, permanently, over one
    // permission bit on one directory.
    //
    // Named for what it actually exercises. It was written as a test of
    // `directoryState`'s errno branch and is not one: with the root shut, the
    // record read fails with `EACCES` first and `readRecord` throws before the
    // directory is ever stat'd. `directoryState`'s own transient branch is
    // unreachable by construction for the same reason — any error that would
    // make a `stat` fail makes the read inside it fail identically, one step
    // earlier. It is kept because a classifier that cannot express "I could not
    // look" is the bug this whole round removed, but it is defence, not a
    // reachable path, and the mutation list says so rather than pretending
    // otherwise.
    const { chmod, mkdir } = await import("node:fs/promises")
    const { PREVIEW_ROUTE, FAILURE_CODES } = await loadPreviewTool()
    const svc = await makeService("unreadable-root")
    const id = previewId("a5")
    await mkdir(svc.root, { recursive: true, mode: 0o700 })

    await chmod(svc.root, 0o000)
    try {
      const res = await request(routeHandlerOf(svc), `${PREVIEW_ROUTE}/${id}`)
      expect(res.status).toBe(503)
      expect(JSON.parse(res.body.toString("utf8")).code).toBe(FAILURE_CODES.unreadable)
    } finally {
      await chmod(svc.root, 0o700).catch(() => {})
    }
  })

  it("sorts filesystem errors by code, not by whether they carried a path", async () => {
    // The unit-level statement of the same rule, so the classification is
    // pinned even where no test can conveniently produce the errno. `ENOTDIR`
    // rides with `ENOENT` because it is the same answer arriving through a path
    // component: asking for `<id>/manifest.json` when `<id>` is a regular file
    // means the manifest is not there either.
    const { __testing } = await loadPreviewTool()
    for (const code of ["ENOENT", "ENOTDIR"]) {
      expect(__testing.isAbsent({ code }), code).toBe(true)
      expect(__testing.isTransient({ code }), code).toBe(false)
    }
    for (const code of ["EACCES", "EPERM", "EIO", "EMFILE", "EBUSY", "ENFILE"]) {
      expect(__testing.isAbsent({ code }), code).toBe(false)
      expect(__testing.isTransient({ code }), code).toBe(true)
    }
    // A parse failure carries no code, so it is neither: retrying identical
    // bytes is pointless, and it is not a deletion either.
    expect(__testing.isTransient(new SyntaxError("bad json"))).toBe(false)
    expect(__testing.isAbsent(new SyntaxError("bad json"))).toBe(false)
    expect(__testing.isTransient(undefined)).toBe(false)
  })

  it("only calls an error retryable if a retry could actually change it", async () => {
    // This was a blocklist — anything with a `code` that was not `ENOENT`
    // counted as temporary — and a blocklist answers "is this fixed bad data?"
    // with "I have not heard of it, so no". Two permanent conditions went out
    // as 503 with a Retry button on them: a `record.json` that is really a
    // directory, and a filename holding a NUL byte. Retrying either forever
    // changes nothing.
    //
    // Flip the set back to "has a code" and every row below goes red.
    const { __testing } = await loadPreviewTool()

    // Fixed bad data. Every one of these describes something wrong with the
    // deck, not with the moment.
    for (const code of ["EISDIR", "ENOTEMPTY", "ELOOP", "ENAMETOOLONG", "EINVAL", "ERR_INVALID_ARG_VALUE"]) {
      expect(__testing.isTransient({ code }), code).toBe(false)
      expect(__testing.classifyReadFailure({ code }), code).toBe("damaged")
    }
    // Absence is its own answer, not damage.
    for (const code of ["ENOENT", "ENOTDIR"]) {
      expect(__testing.classifyReadFailure({ code }), code).toBe("missing")
    }
    // ...and the allowlist is a list, so an unknown code is final by default
    // rather than retryable by default.
    expect(__testing.isTransient({ code: "ESOMETHINGNEW" })).toBe(false)
    expect(__testing.classifyReadFailure({ code: "ESOMETHINGNEW" })).toBe("damaged")
    expect(__testing.classifyReadFailure(new TypeError("no code at all"))).toBe("damaged")
    // Every entry that is on the list is on it for a stated reason, and the
    // list is the only thing that puts anything there.
    for (const code of __testing.RETRYABLE_ERRNOS) {
      expect(__testing.classifyReadFailure({ code }), code).toBe("unreadable")
    }
  })

  it("recovers from a connection that dropped, on a deck that never went anywhere", async () => {
    // The allowlist's own blind spot, first time round. It took the
    // "mounted network share" errnos and stopped short of the connection ones —
    // a distinction the kernel does not make. A read from an NFS or FUSE mount
    // answers `ECONNRESET`, `ECONNABORTED`, `ENOBUFS`, `ENONET` or `EREMOTEIO`
    // while the deck underneath is perfectly intact, and every one of those was
    // landing in `damaged`: a 410, final, card retired, deck still on disk.
    //
    // Exactly the cost the allowlist exists to avoid, in a different set of
    // errnos — which is why "I have not thought about this code" has to mean
    // "go and think about it", not "terminal by default, quietly".
    const { __testing } = await loadPreviewTool()
    const remote = ["ECONNRESET", "ECONNABORTED", "ECONNREFUSED", "ENETRESET", "ENOBUFS", "ENONET", "EREMOTEIO"]
    for (const code of remote) {
      expect(__testing.isTransient({ code }), code).toBe(true)
      expect(__testing.classifyReadFailure({ code }), code).toBe("unreadable")
    }
    // ...and they have not dragged the fixed-data cases in with them.
    for (const code of ["EISDIR", "ELOOP", "ENAMETOOLONG"]) {
      expect(__testing.classifyReadFailure({ code }), code).toBe("damaged")
    }
  })

  it("refuses a page name holding a NUL byte instead of trying to open it", async () => {
    // `" .svg"` cleared every other clause of the name check, and then
    // `readFile` threw `ERR_INVALID_ARG_VALUE` — not a filesystem error at all,
    // and under the old blocklist that meant "temporary". A card would have
    // been told to try again, for ever, over a name that can never open.
    const { __testing, PREVIEW_ROUTE, FAILURE_CODES } = await loadPreviewTool()
    const { writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const svc = await makeService("nul-in-name")
    const id = previewId("f7")
    await seedPreview(svc.root, id)

    const nasty = [" .svg", "a b.svg", "001.svg", "tab\t.svg", "nl\n.svg", "del.svg"]
    for (const name of nasty) expect(__testing.isSafeFileName(name), JSON.stringify(name)).toBe(false)

    await writeFile(
      join(svc.root, id, __testing.MANIFEST_FILE),
      JSON.stringify({ title: "x", pages: [{ page: 1, id: "p1", file: " .svg" }] }),
    )
    const res = await request(routeHandlerOf(svc), `${PREVIEW_ROUTE}/${id}`)
    expect(res.status).toBe(410)
    expect(JSON.parse(res.body.toString("utf8")).code).toBe(FAILURE_CODES.damaged)
  })

  it("calls a record that is really a directory damaged, not worth retrying", async () => {
    // `EISDIR`. No number of retries turns a directory into a JSON file, and
    // the old blocklist sent this out as a 503 with a Retry button attached.
    const { __testing, PREVIEW_ROUTE, FAILURE_CODES } = await loadPreviewTool()
    const { mkdir, rm } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const svc = await makeService("record-is-a-directory")
    const handler = routeHandlerOf(svc)

    for (const [index, file] of [__testing.RECORD_FILE, __testing.MANIFEST_FILE, "001.svg"].entries()) {
      const id = previewId(`f8${index}`)
      await seedPreview(svc.root, id)
      await rm(join(svc.root, id, file))
      await mkdir(join(svc.root, id, file))

      const res = await request(handler, `${PREVIEW_ROUTE}/${id}`)
      expect(res.status, file).toBe(410)
      expect(JSON.parse(res.body.toString("utf8")).code, file).toBe(FAILURE_CODES.damaged)
    }
  })

  it("reports a path the system will not accept as damaged, from the directory check itself", async () => {
    // `directoryState`'s non-absent branch, reached directly. An earlier round
    // called this branch unreachable "by construction" because the record read
    // was assumed to fail first with the same errno — an assumption about
    // ordering, not a fact about it, and wrong twice over: the two are separate
    // system calls with a filesystem free to change in between, and a path over
    // the length limit answers here on its own.
    const { __testing } = await loadPreviewTool()
    const { mkdir } = await import("node:fs/promises")
    const root = await scratchRoot("too-long")
    await mkdir(root, { recursive: true, mode: 0o700 })
    const absurd = `${root}/${"x".repeat(4096)}`

    expect(await __testing.directoryState(root)).toBe("directory")
    await expect(__testing.directoryState(absurd)).rejects.toBeInstanceOf(__testing.PreviewDamaged)
    // ...and it is not silently reported as "nothing is there", which is what a
    // two-way answer would have to do with it.
    await expect(__testing.directoryState(absurd)).rejects.toThrow(/cannot be used/)
  })

  it("never phrases a read failure as a deletion, even where nothing routes there today", async () => {
    // `describeIncomplete` writes the sentence a 410 carries, and it used to
    // assert "is missing" for any error that happened to have a `path` on it —
    // so an `EACCES` was reported as a file the user had deleted. The layer
    // above now diverts those to a 503 before this is reached, which makes the
    // check here unreachable in practice and worth pinning directly: the
    // phrasing rule lives in the function that does the phrasing, and a later
    // caller that forgets to divert must not resurrect the false claim.
    const { __testing } = await loadPreviewTool()
    const dir = "/previews/abc"
    const err = (code: string) => Object.assign(new Error(code), { code, path: "/previews/abc/001.svg" })

    expect(__testing.describeIncomplete(err("ENOENT"), dir)).toBe("/previews/abc/001.svg is missing")
    for (const code of ["EACCES", "EIO", "EPERM"]) {
      expect(__testing.describeIncomplete(err(code), dir), code).not.toMatch(/is missing/)
    }
    // A damaged manifest speaks for itself rather than being described as a
    // deletion of something.
    const damaged = new __testing.PreviewDamaged("manifest.json is present but unreadable")
    expect(__testing.describeIncomplete(damaged, dir)).toBe("manifest.json is present but unreadable")
  })

  it("serves a record written before exports existed as gone, not as a 404 body", async () => {
    // Real records from an earlier release carry no `pptxFile`. A browser that
    // saves a 404 body as `deck.pptx` is the failure this route was built to
    // stop, so the answer has to be an explicit 410.
    const svc = await makeService("route-legacy")
    const { PREVIEW_ROUTE } = await loadPreviewTool()
    const id = previewId("e9")
    await seedPreview(svc.root, id, { record: { target: "old.json", created: Date.now() } })

    const handler = routeHandlerOf(await reopen(svc))
    const res = await request(handler, `${PREVIEW_ROUTE}/${id}/pptx`)
    expect(res.status).toBe(410)
    expect(res.headers["content-type"]).toBe("application/json")
    expect(JSON.parse(res.body.toString("utf8")).error).toMatch(/no exported deck/)
    // ...while the strip it can still draw is drawn.
    expect((await request(handler, `${PREVIEW_ROUTE}/${id}`)).status).toBe(200)
  })

  it("shadows the absolute paths an old-format record carried, instead of following them", async () => {
    // Records written by the version this change replaces carried `outDir`,
    // `snapshot` and `pptxPath` as absolute paths into `$TMPDIR`. Following one
    // now would serve a file from wherever that string happens to point — or,
    // more likely, 500 on a directory the operating system swept months ago.
    // Every path is recomputed from the record's own location instead, so a
    // stale one is data that nothing reads.
    const { __testing, PREVIEW_ROUTE } = await loadPreviewTool()
    const { join } = await import("node:path")
    const svc = await makeService("route-old-format")
    const id = previewId("ea")
    await seedPreview(svc.root, id, {
      record: {
        target: "old.json",
        outDir: "/var/folders/xx/T/pptfast-preview-abc123",
        snapshot: "/var/folders/xx/T/pptfast-preview-abc123/snapshot.ir.json",
        pptxPath: "/var/folders/xx/T/pptfast-preview-abc123/old.pptx",
        // A relative escape in the one field that does become a path.
        pptxFile: "../../../etc/passwd",
      },
    })

    const entry = await (await reopen(svc)).recallAnywhere(id)
    expect(entry!.outDir).toBe(join(svc.root, id))
    expect(entry!.snapshot).toBe(join(svc.root, id, __testing.SNAPSHOT_FILE))
    // `pptxFile` is a name, never a path: a record naming its way out of its
    // own directory names nothing at all.
    expect(entry!.pptxPath).toBeUndefined()
    const res = await request(routeHandlerOf(await reopen(svc)), `${PREVIEW_ROUTE}/${id}/pptx`)
    expect(res.status).toBe(410)
    expect(res.body.toString("utf8")).not.toContain("root:")
  })

  it("calls a damaged record damaged, instead of pretending the id never existed", async () => {
    // This test used to assert 404, which was the bug wearing a green tick.
    // `record.json` sits on disk between runs, so it can be truncated by a full
    // disk, hand-edited, or written by a version that thought a record was an
    // array. None of those mean "no such preview": the file is right there, and
    // answering "unknown preview id" tells the user their deck never existed
    // when what actually happened is a write this program failed to finish.
    //
    // Still 410 rather than a 5xx, and that is the other half of the judgement:
    // re-reading the same bytes fails the same way for ever, so telling the
    // card to retry would spin it. Final, but honestly worded.
    const { __testing, PREVIEW_ROUTE } = await loadPreviewTool()
    const { mkdir, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const svc = await makeService("route-corrupt")
    const handler = routeHandlerOf(svc)

    const unparseable = ['{"target":', ""]
    const wrongShape = ["null", "42", '["target"]', '"a string"']
    for (const [index, body] of [...unparseable, ...wrongShape].entries()) {
      const id = previewId(`f${index}`)
      await mkdir(join(svc.root, id), { recursive: true })
      await writeFile(join(svc.root, id, __testing.RECORD_FILE), body)

      await expect(svc.recallAnywhere(id), body).rejects.toBeInstanceOf(__testing.PreviewDamaged)
      const res = await request(handler, `${PREVIEW_ROUTE}/${id}`)
      expect(res.status, body).toBe(410)
      const message = JSON.parse(res.body.toString("utf8")).error as string
      expect(message, body).toContain(join(svc.root, id, __testing.RECORD_FILE))
      expect(message, body).toMatch(
        unparseable.includes(body) ? /present but unreadable/ : /not in a shape this version understands/,
      )
      // Never the word that would blame the user for a file they did not touch.
      expect(message, body).not.toMatch(/unknown preview id/)
    }
  })

  it("calls a damaged manifest damaged too, rather than reporting a deletion", async () => {
    // Same judgement one file down. `readPreviewBundle` used to reach straight
    // for `manifest.pages`, so a half-written manifest threw a `TypeError` that
    // the layer above dressed up as "the rendered deck is no longer complete" —
    // a claim that a file had been deleted, made about a file that is present.
    const { __testing, PREVIEW_ROUTE } = await loadPreviewTool()
    const { writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const svc = await makeService("route-bad-manifest")
    const handler = routeHandlerOf(svc)

    for (const [index, body] of ['{"pages":', '{"pages":"nope"}', "[]", "null"].entries()) {
      const id = previewId(`e${index}`)
      await seedPreview(svc.root, id)
      await writeFile(join(svc.root, id, __testing.MANIFEST_FILE), body)

      await expect(svc.recallAnywhere(id), body).rejects.toBeInstanceOf(__testing.PreviewDamaged)
      const res = await request(handler, `${PREVIEW_ROUTE}/${id}`)
      expect(res.status, body).toBe(410)
      const message = JSON.parse(res.body.toString("utf8")).error as string
      expect(message, body).toContain(join(svc.root, id, __testing.MANIFEST_FILE))
      expect(message, body).not.toMatch(/is missing/)
    }
  })

  it("validates every page in a manifest, not just the array around them", async () => {
    // `{"pages":[null]}` is legal JSON and a shape a half-written file really
    // can have. Checking the container and then reaching straight into its
    // contents let it through to `page.file`, where the `TypeError` was caught
    // one level up and reported as "the rendered deck is no longer complete" —
    // a claim that a file had been deleted, about a preview whose files are all
    // present. Validating the outside and trusting the inside is the same bug
    // as not validating at all.
    const { __testing, PREVIEW_ROUTE, FAILURE_CODES } = await loadPreviewTool()
    const { writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const svc = await makeService("manifest-elements")
    const handler = routeHandlerOf(svc)

    const shapes = [
      '{"pages":[null]}',
      '{"pages":[42]}',
      '{"pages":["001.svg"]}',
      '{"pages":[[]]}',
      '{"pages":[{"page":1,"file":"001.svg"},null]}',
    ]
    for (const [index, body] of shapes.entries()) {
      const id = previewId(`b${index}`)
      await seedPreview(svc.root, id)
      await writeFile(join(svc.root, id, __testing.MANIFEST_FILE), body)

      await expect(svc.recallAnywhere(id), body).rejects.toBeInstanceOf(__testing.PreviewDamaged)
      const res = await request(handler, `${PREVIEW_ROUTE}/${id}`)
      expect(res.status, body).toBe(410)
      const parsed = JSON.parse(res.body.toString("utf8")) as { code: string; error: string }
      expect(parsed.code, body).toBe(FAILURE_CODES.damaged)
      // The phrase that would be a lie: nothing here is missing.
      expect(parsed.error, body).not.toMatch(/is missing|no longer complete/)
    }
  })

  it("gives a damaged preview its own page in the viewer, not the deletion one", async () => {
    // The iframe renders whatever body it is handed, so the wording there is
    // the wording a person reads. Sharing one page between "you deleted this"
    // and "this file is corrupt" is the same conflation as sharing one status.
    const { __testing, PREVIEW_ROUTE } = await loadPreviewTool()
    const { writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const svc = await makeService("damaged-html")
    const id = previewId("b8")
    await seedPreview(svc.root, id)
    await writeFile(join(svc.root, id, __testing.RECORD_FILE), '{"target":')

    const res = await request(routeHandlerOf(svc), `${PREVIEW_ROUTE}/${id}/html`)
    expect(res.status).toBe(410)
    expect(res.headers["content-type"]).toBe("text/html; charset=utf-8")
    const page = res.body.toString("utf8")
    expect(page).toContain("This deck cannot be opened")
    expect(page).toMatch(/rendered pages may still be there/)
    // Neither of the other two pages' headings, and never the accusation.
    expect(page).not.toContain("no longer on disk")
    expect(page).not.toContain("until you delete them")
    expect(page).not.toContain("could not be read just now")
  })

  it("pairs every failure code with the page that says the right thing", async () => {
    // The mapping itself, so a new code cannot quietly inherit the deletion
    // wording by being absent from a switch.
    const { __testing, FAILURE_CODES } = await loadPreviewTool()
    const heading = (code: string) => {
      const match = /<h1>([^<]*)<\/h1>/.exec(__testing.noticePageFor(code, "why"))
      return match![1]!
    }
    expect(heading(FAILURE_CODES.unknown)).toBe("This deck is no longer on disk")
    expect(heading(FAILURE_CODES.missing)).toBe("This deck is no longer on disk")
    expect(heading(FAILURE_CODES.damaged)).toBe("This deck cannot be opened")
    expect(heading(FAILURE_CODES.unreadable)).toBe("This deck could not be read just now")
    expect(new Set(Object.values(FAILURE_CODES).map(heading)).size).toBe(3)
  })

  it("refuses a page name that escapes, on pages the strip will never draw", async () => {
    // The shape that got through: thirteen pages, with `../../escape.svg` on
    // page thirteen. The name check ran where a name became a path, and only
    // the first `THUMBNAIL_STRIP_PAGES` pages have their markup read — so the
    // check followed the reader and stopped where the reader did. The bundle
    // came back `{ accepted: true, pages: 13, page13File: "../../escape.svg" }`,
    // with bad data admitted and handed to the card.
    //
    // Validation refuses bad data; it is not there to keep the renderer from
    // tripping. Whether this call happens to read a value cannot decide whether
    // the value is allowed.
    const { __testing, PREVIEW_ROUTE, FAILURE_CODES } = await loadPreviewTool()
    const { writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const svc = await makeService("manifest-escape-beyond-strip")
    const id = previewId("a7")
    await seedPreview(svc.root, id)

    const beyond = __testing.THUMBNAIL_STRIP_PAGES + 1
    const pages = Array.from({ length: beyond }, (_x, i) => ({
      page: i + 1,
      id: `page-${i + 1}`,
      file: i + 1 === beyond ? "../../escape.svg" : "001.svg",
    }))
    await writeFile(join(svc.root, id, __testing.MANIFEST_FILE), JSON.stringify({ title: "x", pages }))

    // The unit that used to accept it.
    await expect(svc.recallAnywhere(id)).rejects.toBeInstanceOf(__testing.PreviewDamaged)
    await expect(svc.recallAnywhere(id)).rejects.toThrow(/page 13 file this version will not open/)

    const res = await request(routeHandlerOf(svc), `${PREVIEW_ROUTE}/${id}`)
    expect(res.status).toBe(410)
    const parsed = JSON.parse(res.body.toString("utf8")) as { code: string; error: string }
    expect(parsed.code).toBe(FAILURE_CODES.damaged)
    // Nothing about the bad page reached the caller.
    expect(res.body.toString("utf8")).not.toContain('"accepted"')
    expect(res.body.toString("utf8")).not.toContain("escape.svg\",\"svg\"")
  })

  it("applies the same name rule to every page, whatever its position", async () => {
    // Positions across and past the strip boundary, so the rule cannot be
    // satisfied by a check that happens to cover "the ones we read".
    const { __testing, PREVIEW_ROUTE, FAILURE_CODES } = await loadPreviewTool()
    const { writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const svc = await makeService("manifest-name-rule")
    const handler = routeHandlerOf(svc)

    const bad = ["../../escape.svg", "/etc/passwd", "sub/dir.svg", "..", "", ".", 42, null]
    for (const [index, name] of bad.entries()) {
      for (const position of [0, __testing.THUMBNAIL_STRIP_PAGES, __testing.THUMBNAIL_STRIP_PAGES + 4]) {
        const id = previewId(`${index}${position}a`)
        await seedPreview(svc.root, id)
        const pages = Array.from({ length: position + 1 }, (_x, i) => ({
          page: i + 1,
          id: `page-${i + 1}`,
          file: i === position ? name : "001.svg",
        }))
        await writeFile(join(svc.root, id, __testing.MANIFEST_FILE), JSON.stringify({ title: "x", pages }))

        const res = await request(handler, `${PREVIEW_ROUTE}/${id}`)
        const label = `${String(name)} at ${position}`
        expect(res.status, label).toBe(410)
        expect(JSON.parse(res.body.toString("utf8")).code, label).toBe(FAILURE_CODES.damaged)
      }
    }
    // ...and the rule itself, stated once where it lives.
    expect(__testing.isSafeFileName("001.svg")).toBe(true)
    for (const name of bad) expect(__testing.isSafeFileName(name), String(name)).toBe(false)
  })

  it("refuses a manifest that names a page outside its own directory", async () => {
    // The manifest is JSON on disk and its `file` fields become paths. A
    // hand-edited `"file": "../../.ssh/id_rsa"` has to name nothing rather than
    // resolve, the same rule `fileInside` already applies to the record.
    const { __testing, PREVIEW_ROUTE } = await loadPreviewTool()
    const { writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const svc = await makeService("route-manifest-escape")
    const id = previewId("e8")
    await seedPreview(svc.root, id)
    await writeFile(
      join(svc.root, id, __testing.MANIFEST_FILE),
      JSON.stringify({ title: "x", pages: [{ page: 1, id: "p1", file: "../../../etc/passwd" }] }),
    )

    const res = await request(routeHandlerOf(svc), `${PREVIEW_ROUTE}/${id}`)
    expect(res.status).toBe(410)
    expect(res.body.toString("utf8")).not.toContain("root:")
    // Asserted on the message, not just the status. Resolve the name instead of
    // refusing it and the read fails with `ENOENT` anyway — a 410 for the wrong
    // reason, which would let this test pass while the check was gone.
    const message = JSON.parse(res.body.toString("utf8")).error as string
    expect(message).toMatch(/will not open/)
    expect(message).toContain("../../../etc/passwd")
  })
})

describe("publishing a preview", () => {
  /**
   * Drive one `execute` inside a real child process, so it can be killed.
   *
   * The atomicity claim is about a machine dying, not about an exception being
   * caught — and the two are different mechanisms with different failure
   * modes. A thrown error runs the cleanup in `execute`'s catch; a `SIGKILL`
   * runs nothing at all, which is exactly the case that has to leave the route
   * with nothing to serve.
   *
   * The fake CLI does the killing, from inside its own process and at a point
   * this test names, so "crash after the manifest was written" means precisely
   * that rather than approximately that. The parent is blocked waiting for the
   * CLI to exit while the signal arrives, so nothing else runs in between.
   */
  /**
   * The last window, which the fake CLI cannot reach.
   *
   * `render-done` kills the parent while it is blocked on the export process,
   * so the record has not been written yet. The gap between `writeRecordInto`
   * and the publishing `rename` is pure in-process work joined by microtasks —
   * no timer, no signal and no other process can land inside it.
   *
   * So the driver runs a copy of the module with exactly one substitution: its
   * `node:fs/promises` import is redirected at a shim that re-exports the real
   * module and wraps `rename`, killing the process when the staging directory
   * is the thing being renamed. Everything else about the module is the file
   * that ships, byte for byte.
   */
  async function fsHookModule(): Promise<string> {
    const { readFile, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { fileURLToPath } = await import("node:url")

    const dir = await scratchTmp("pptfast-hooked-")
    await writeFile(
      join(dir, "fs-hook.mjs"),
      [
        'import * as fs from "node:fs/promises"',
        'export * from "node:fs/promises"',
        "export async function rename(from, to) {",
        "  // The publish, and only the publish: `writeRecordInto` renames a",
        "  // scratch *file* into place, while this one moves `<id>.partial`.",
        '  if (String(from).endsWith(".partial")) process.kill(process.pid, "SIGKILL")',
        "  return fs.rename(from, to)",
        "}",
      ].join("\n"),
    )
    const dshDir = fileURLToPath(new URL("../dsh/", import.meta.url))
    const original = await readFile(join(dshDir, "preview-tool.js"), "utf8")
    const patched = original.replace(/ from 'node:fs\/promises'/, " from './fs-hook.mjs'")
    if (patched === original) throw new Error("the fs import moved — this hook patches one exact line")
    await writeFile(join(dir, "spawnHidden.js"), await readFile(join(dshDir, "spawnHidden.js"), "utf8"))
    const copy = join(dir, "preview-tool.js")
    await writeFile(copy, patched)
    return copy
  }

  async function crashDuringExecute(
    tag: string,
    at: string,
    options: { killBeforePublish?: boolean } = {},
  ): Promise<{ root: string; cliPath: string }> {
    const { spawn } = await import("node:child_process")
    const { writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { fileURLToPath } = await import("node:url")

    const cliPath = await fakeCli()
    if (!options.killBeforePublish) await writeFile(join(dirname(cliPath), "kill-parent-at"), at)
    const home = await scratchHome(tag)
    const { deck } = await deckFixture("LOGO-V1")
    const modulePath = options.killBeforePublish
      ? await fsHookModule()
      : fileURLToPath(new URL("../dsh/preview-tool.js", import.meta.url))
    const driver = join(await scratchTmp("pptfast-driver-"), "driver.mjs")
    await writeFile(
      driver,
      [
        `import { createPreviewService } from ${JSON.stringify(modulePath)}`,
        `const svc = createPreviewService(${JSON.stringify(cliPath)})`,
        `await svc.tool.execute({ target: ${JSON.stringify(deck)} })`,
      ].join("\n"),
    )

    const child = spawn(process.execPath, [driver], {
      env: { ...process.env, PPTFAST_HOME: home },
      stdio: "ignore",
    })
    // `error` as well as `exit`: a spawn that never starts — `EAGAIN` when the
    // machine is loaded, which is exactly when several of these run at once —
    // emits `error` and no `exit`, and waiting only for `exit` turns that into
    // a hang that surfaces as a timeout with no explanation.
    const signal = await new Promise<string | null>((resolve, reject) => {
      child.on("error", reject)
      child.on("exit", (_code, sig) => resolve(sig))
    })
    expect(signal, `the driver was supposed to be killed at ${at}`).toBe("SIGKILL")
    const { previewRoot } = await loadPreviewTool()
    const original = process.env.PPTFAST_HOME
    process.env.PPTFAST_HOME = home
    const root = previewRoot()
    if (original === undefined) delete process.env.PPTFAST_HOME
    else process.env.PPTFAST_HOME = original
    scratchDirs.add(root)
    return { root, cliPath }
  }

  /**
   * Five points inside one render, each the end of a real machine.
   *
   * They bracket every file a preview is made of: before anything is written,
   * with some page markup on disk and no index, with a complete-looking index
   * and no export, with the export done, and with the whole thing finished and
   * one `rename` away from existing. Every one of them has to leave the route
   * with nothing — not a card with holes in it, not a manifest naming SVGs that
   * were never written, not a download button pointing at a file that is not
   * there, and not a preview that is complete but was never published.
   *
   * The last one is the interesting one, because it is the state that looks
   * most like success: everything is on disk, correct, and readable. It still
   * has to be invisible, or "the id appears when the preview is whole" is not a
   * rule, just a tendency.
   */
  const CRASH_POINTS = [
    ["right after the directory was created", "preview-start", {}],
    ["after some page markup was written", "preview-svg", {}],
    ["after the manifest was written", "preview-manifest", {}],
    ["after the export was written", "render-done", {}],
    ["after the record was written, one rename short of done", "before-publish", { killBeforePublish: true }],
  ] as const

  for (const [when, at, options] of CRASH_POINTS) {
    it(`leaves nothing the route will serve when the machine dies ${when}`, { timeout: 60_000 }, async () => {
      const { readdir } = await import("node:fs/promises")
      const { PREVIEW_ROUTE, __testing } = await loadPreviewTool()
      const { root, cliPath } = await crashDuringExecute(`crash-${at}`, at, options)

      // Whatever the render got through is still on disk under the staging
      // name — nothing swept it, and nothing needs to.
      const left = await readdir(root)
      expect(left.length).toBe(1)
      const staged = left[0]!
      expect(staged.endsWith(__testing.PARTIAL_SUFFIX)).toBe(true)
      if (at === "before-publish") {
        // The state that looks like success, checked so the assertions below
        // are known to be about a complete preview rather than a broken one.
        expect(await readdir(join(root, staged))).toEqual(
          expect.arrayContaining([__testing.RECORD_FILE, __testing.MANIFEST_FILE, "e2e.pptx"]),
        )
      }

      // The id that directory would have been published under. This is the
      // value a card would have been given, so this is the value the route has
      // to disown.
      const id = staged.slice(0, -__testing.PARTIAL_SUFFIX.length)
      const svc = await makeService(`crash-reader-${at}`, { cliPath, home: dirname(root) })
      expect(svc.root).toBe(root)
      const handler = routeHandlerOf(svc)
      for (const path of ["", "/pptx", "/html"]) {
        expect((await request(handler, `${PREVIEW_ROUTE}/${id}${path}`)).status, `${at}${path}`).toBe(404)
      }
      // ...and asking for the staging directory by its own name gets the same
      // answer, because that name is not an id.
      expect((await request(handler, `${PREVIEW_ROUTE}/${staged}`)).status).toBe(404)
      expect(await svc.recallAnywhere(id)).toBeUndefined()
    })
  }

  it("makes the whole preview appear in one step, with the record already inside it", async () => {
    // The positive half of the four tests above. Replace the rename in
    // `execute` with a plain `mkdir` + write-in-place and they still pass in
    // spirit but this one goes red: the id resolves to a directory that exists
    // before its contents do.
    const { readdir } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { __testing } = await loadPreviewTool()
    const cliPath = await fakeCli()
    const svc = await makeService("publish-atomic", { cliPath })
    const { deck } = await deckFixture("LOGO-V1")

    // Watch the root while the render runs. Every observation has to see the
    // id absent or the id complete, and never a directory carrying that name
    // with a partial deck in it.
    let observations = 0
    let sawIncomplete: string[] | null = null
    const watch = setInterval(() => {
      void readdir(svc.root)
        .then(async (names) => {
          observations += 1
          for (const name of names) {
            if (name.endsWith(__testing.PARTIAL_SUFFIX)) continue
            const inside = await readdir(join(svc.root, name)).catch((): string[] => [])
            if (!inside.includes(__testing.RECORD_FILE)) sawIncomplete = [name, ...inside]
          }
        })
        .catch(() => {})
    }, 1)
    let value
    try {
      value = await svc.tool.execute({ target: deck })
    } finally {
      clearInterval(watch)
    }

    expect(observations).toBeGreaterThan(0)
    expect(sawIncomplete).toBeNull()
    expect(await readdir(svc.root)).toEqual([value.previewId])
    expect(await readdir(value.outDir)).toContain(__testing.RECORD_FILE)
  })

  it("removes the half-written directory when a render throws, and publishes nothing", async () => {
    // A failing target must not park a partial deck in the user's home. This
    // is the one deletion left in the module, and it only ever names the
    // directory the same call created.
    const { readdir } = await import("node:fs/promises")
    const cliPath = await fakeCli({ failPreview: true })
    const svc = await makeService("render-throws", { cliPath })
    const { deck } = await deckFixture("LOGO-V1")

    await expect(svc.tool.execute({ target: deck })).rejects.toThrow(/fake preview refused/)
    expect(await readdir(svc.root)).toEqual([])
  })

  it("publishes nothing when the publish itself fails", async () => {
    // A full disk, a quota, a permission that changed under the process: the
    // render finished and the `rename` did not. Everything the run produced is
    // still sitting in the staging directory, and none of it is reachable —
    // which is the same guarantee the crash tests make, arriving through the
    // ordinary error path instead of through a signal.
    const { chmod, readdir } = await import("node:fs/promises")
    const { PREVIEW_ROUTE, __testing } = await loadPreviewTool()
    const cliPath = await fakeCli({ sealRoot: true })
    const svc = await makeService("publish-fails", { cliPath })
    const { deck } = await deckFixture("LOGO-V1")

    try {
      await expect(svc.tool.execute({ target: deck })).rejects.toThrow(/EACCES|EPERM/)

      const left = await readdir(svc.root)
      expect(left.length).toBe(1)
      const staged = left[0]!
      expect(staged.endsWith(__testing.PARTIAL_SUFFIX)).toBe(true)
      // The whole deck really is in there — this is not passing because the
      // render failed early.
      expect(await readdir(join(svc.root, staged))).toEqual(
        expect.arrayContaining([__testing.RECORD_FILE, __testing.MANIFEST_FILE, "e2e.pptx"]),
      )

      const id = staged.slice(0, -__testing.PARTIAL_SUFFIX.length)
      const handler = routeHandlerOf(svc)
      for (const path of ["", "/pptx", "/html"]) {
        expect((await request(handler, `${PREVIEW_ROUTE}/${id}${path}`)).status, path).toBe(404)
      }
    } finally {
      await chmod(svc.root, 0o700).catch(() => {})
    }
  })

  it("refuses to delete a staging directory it did not create", async () => {
    // The marker's remaining job, said as a test. The path is built from a
    // fresh uuid so this is unreachable in production, but the deletion is
    // recursive and forced, and "unreachable" is a claim that should cost one
    // `stat` to keep true.
    const { mkdir, readdir, rm, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { __testing } = await loadPreviewTool()
    const root = await scratchRoot("owner-marker")
    const id = previewId("c0")

    const impostor = __testing.partialDir(root, id)
    await mkdir(impostor, { recursive: true })
    await writeFile(join(impostor, "someone-elses-work.txt"), "keep me")
    await __testing.discardOwnedDir(impostor)
    expect(await readdir(impostor)).toEqual(["someone-elses-work.txt"])

    // ...and a directory this module made is removed, marker and all.
    const ours = __testing.partialDir(root, previewId("c1"))
    await __testing.createOwnedDir(root, ours)
    expect(await readdir(ours)).toEqual([__testing.OWNER_MARKER])
    await __testing.discardOwnedDir(ours)
    await expect(readdir(ours)).rejects.toThrow()

    // Nothing without a path to check, either.
    for (const nothing of [undefined, "", "/", process.cwd()]) {
      await expect(__testing.discardOwnedDir(nothing)).resolves.toBeUndefined()
    }
    await rm(impostor, { recursive: true, force: true })
  })

  it("leaves nothing behind when the marker write fails, since nothing could ever claim it", async () => {
    // The narrow window: `mkdir` succeeds and the fifty bytes of owner marker
    // do not — a full disk is enough. Without the self-cleanup that leaves a
    // directory with no proof of ownership, and every cleanup path in this
    // module asks for that proof before deleting anything, so it would sit
    // there permanently and no later run could ever claim it.
    //
    // Forced through `umask` rather than by patching: `mkdir` applies it, so
    // the directory really is created and really is not writable, which is the
    // shape of the failure rather than a stand-in for it.
    const { mkdir, readdir } = await import("node:fs/promises")
    const { __testing } = await loadPreviewTool()
    const root = await scratchRoot("marker-fails")
    const dir = __testing.partialDir(root, previewId("c3"))
    // The root has to exist and be writable *before* the umask goes on, or the
    // leaf `mkdir` is what fails and this test proves nothing about the marker.
    await mkdir(root, { recursive: true, mode: 0o700 })

    const previous = process.umask(0o200)
    let created: string[] = []
    try {
      await expect(__testing.createOwnedDir(root, dir)).rejects.toThrow(/EACCES|EPERM/)
      created = await readdir(root)
    } finally {
      process.umask(previous)
    }
    // The directory it made on the way is gone with it.
    expect(created).toEqual([])
  })

  it("makes the marker directory unwritable in the first place, so the failure above is real", async () => {
    // Guards the guard: if `mkdir` ever stopped applying the umask, the test
    // above would pass by never reaching the marker write at all.
    const { mkdir, writeFile, rm } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const root = await scratchRoot("umask-check")
    await mkdir(root, { recursive: true, mode: 0o700 })
    const dir = join(root, "probe")

    const previous = process.umask(0o200)
    try {
      await mkdir(dir, { mode: 0o700 })
      await expect(writeFile(join(dir, "x"), "x")).rejects.toThrow(/EACCES|EPERM/)
    } finally {
      process.umask(previous)
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  })

  it("refuses to build inside a directory that is already there", async () => {
    // `mkdir -p` would adopt it, write this call's marker into it, and make it
    // deletable — which is how a cleanup ends up removing work it did not do.
    const { mkdir, readdir } = await import("node:fs/promises")
    const { __testing } = await loadPreviewTool()
    const root = await scratchRoot("no-adopt")
    const taken = __testing.partialDir(root, previewId("c2"))
    await mkdir(taken, { recursive: true })

    await expect(__testing.createOwnedDir(root, taken)).rejects.toThrow(/EEXIST/)
    expect(await readdir(taken)).toEqual([])
  })

  it("nothing in the module deletes a published preview, however many there are", { timeout: 120_000 }, async () => {
    // The design decision, held in place by a test rather than by everybody
    // remembering it. The previous version rendered eight decks, which crossed
    // none of the thresholds this code has ever had — the old count budget was
    // 240 and the old in-memory cap was 12 — so it would have stayed green
    // through the very change it claims to guard.
    //
    // So: cross both. Fifteen real renders take the in-memory cap out of the
    // picture, and 250 seeded directories take out any count budget short of
    // the old one. Every id still has to resolve, including the ones rendered
    // first, and including them after a restart.
    const { readdir } = await import("node:fs/promises")
    const { PREVIEW_ROUTE } = await loadPreviewTool()
    const cliPath = await fakeCli()
    const svc = await makeService("no-eviction", { cliPath })
    const { deck } = await deckFixture("LOGO-V1")

    const rendered: string[] = []
    for (let i = 0; i < 15; i += 1) rendered.push((await svc.tool.execute({ target: deck })).previewId)

    // Cheap stand-ins for the rest of a heavy user's history: real directories
    // with real records, without paying two process spawns each.
    const seeded: string[] = []
    for (let i = 0; i < 250; i += 1) {
      const id = previewId(`9${i}`)
      await seedPreview(svc.root, id)
      seeded.push(id)
    }

    expect((await readdir(svc.root)).length).toBe(rendered.length + seeded.length)
    // The first deck rendered is the one any least-recently-used rule would
    // reach for first, so it is the one worth naming.
    const handler = routeHandlerOf(await reopen(svc))
    for (const id of [...rendered, ...seeded]) {
      expect((await request(handler, `${PREVIEW_ROUTE}/${id}`)).status, id).toBe(200)
    }
    for (const id of rendered) {
      expect((await request(handler, `${PREVIEW_ROUTE}/${id}/pptx`)).status, id).toBe(200)
    }
    // ...and the live service agrees with the restarted one, which is what
    // stops a cache from quietly deciding this.
    expect((await request(routeHandlerOf(svc), `${PREVIEW_ROUTE}/${rendered[0]!}`)).status).toBe(200)
  })
})

describe("what a preview is allowed to touch", () => {
  it("previews a deck sitting in a read-only directory, because it writes nowhere near it", async () => {
    // The reason the artifacts do not live next to the deck. A read-only
    // checkout, a network share, a directory owned by someone else — all of
    // them are legitimate places to keep a deck, and all of them fail the
    // moment previewing requires write access to get one.
    const { chmod, readdir } = await import("node:fs/promises")
    const cliPath = await fakeCli()
    const svc = await makeService("read-only-input", { cliPath })
    const { deck } = await deckFixture("LOGO-V1")
    const deckDir = dirname(deck)

    await chmod(deckDir, 0o500)
    try {
      const value = await svc.tool.execute({ target: deck })
      expect(value.pageCount).toBe(1)
      expect(value.outDir.startsWith(svc.root)).toBe(true)
      // The input directory is exactly as it was: no preview/, no snapshot, no
      // stray file for a version-control status to report.
      expect((await readdir(deckDir)).sort()).toEqual(["assets", "deck.json"])
    } finally {
      await chmod(deckDir, 0o700)
    }
  })

  it("follows a symlinked target without writing through it", async () => {
    const { readdir, symlink } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const cliPath = await fakeCli()
    const svc = await makeService("symlink-input", { cliPath })
    const { deck } = await deckFixture("LOGO-V1")
    const linkDir = await scratchTmp("pptfast-link-")
    const link = join(linkDir, "linked-deck.json")
    await symlink(deck, link)

    const value = await svc.tool.execute({ target: link })
    expect(value.pageCount).toBe(1)
    expect(value.outDir.startsWith(svc.root)).toBe(true)
    expect(await readdir(linkDir)).toEqual(["linked-deck.json"])
    expect((await readdir(dirname(deck))).sort()).toEqual(["assets", "deck.json"])
  })

  it("leaves the working tree alone, so a preview never shows up in git status", async () => {
    // Said against a real repository rather than against a directory listing,
    // because "git sees nothing" is the claim a user actually cares about and
    // an ignored-file rule could satisfy a listing check while failing it.
    const { execFile } = await import("node:child_process")
    const { promisify } = await import("node:util")
    const { copyFile, mkdir, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const run = promisify(execFile)

    const cliPath = await fakeCli()
    const svc = await makeService("git-clean", { cliPath })
    const repo = await scratchTmp("pptfast-repo-")
    await run("git", ["init", "-q"], { cwd: repo })
    await run("git", ["config", "user.email", "t@example.com"], { cwd: repo })
    await run("git", ["config", "user.name", "t"], { cwd: repo })
    const { deck, logoPath } = await deckFixture("LOGO-V1")
    await mkdir(join(repo, "assets"), { recursive: true })
    await copyFile(logoPath, join(repo, "assets", "logo.png"))
    await writeFile(
      join(repo, "deck.json"),
      JSON.stringify({ filename: "e2e", assets: { images: { local: { src: "assets/logo.png" } } } }),
    )
    await run("git", ["add", "-A"], { cwd: repo })
    await run("git", ["commit", "-qm", "deck"], { cwd: repo })

    const before = (await run("git", ["status", "--short"], { cwd: repo })).stdout
    await svc.tool.execute({ target: join(repo, "deck.json") })
    expect((await run("git", ["status", "--short"], { cwd: repo })).stdout).toBe(before)
    expect(before).toBe("")
    void deck
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

  it("carries the image bytes, not just the path they were at", async () => {
    // A path is a promise about a file, and the file can be rewritten before
    // anyone follows it. Two CLI processes follow it — one for the preview,
    // one for the export — so a path in the snapshot is two independent reads
    // of something that is free to change in between.
    const { __testing } = await loadPreviewTool()
    const { mkdir, readFile, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")

    const src = await scratchTmp("pptfast-src-")
    await mkdir(join(src, "assets"), { recursive: true })
    await writeFile(join(src, "assets", "logo.png"), pngWith("BYTES-V1"))
    const deck = join(src, "deck.json")
    await writeFile(deck, JSON.stringify({ assets: { images: { local: { src: "assets/logo.png" } } } }))

    const outDir = await scratchTmp("pptfast-out-")
    const { snapshot } = await __testing.captureSnapshot("/x.js", deck, outDir)
    await writeFile(join(src, "assets", "logo.png"), pngWith("BYTES-V2"))

    const pinned = JSON.parse(await readFile(snapshot, "utf8"))
    expect(pinned.assets.images.local.src.startsWith("data:image/png;base64,")).toBe(true)
    const payload = Buffer.from(pinned.assets.images.local.src.split(",")[1], "base64")
    expect(payload.subarray(8).toString("utf8")).toBe("BYTES-V1")
  })

  it("leaves alone every asset it cannot pin, rather than guessing", async () => {
    // Each of these is a deliberate pass-through, and each one is a path the
    // renderer still resolves per run — so they are pinned here as documented
    // exposure, not as an oversight nobody noticed.
    const { __testing } = await loadPreviewTool()
    const { readFile, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")

    const src = await scratchTmp("pptfast-src-")
    // A PNG that somebody saved as .jpg. The CLI rejects this loudly by
    // design; inlining it would relabel it as valid and lose that error.
    await writeFile(join(src, "mislabelled.jpg"), pngWith("X"))
    // A format that needs a recode before PowerPoint will take it — the CLI
    // owns that decode, and this file has no image library of its own.
    await writeFile(join(src, "logo.webp"), Buffer.concat([Buffer.from("RIFF____WEBPVP8 "), Buffer.from("X")]))
    await writeFile(join(src, "empty.png"), "")
    await writeFile(join(src, "garbage.png"), "not an image at all")

    const snapshot = join(src, "snap.json")
    await writeFile(
      snapshot,
      JSON.stringify({
        assets: {
          images: {
            mislabelled: { src: join(src, "mislabelled.jpg") },
            webp: { src: join(src, "logo.webp") },
            empty: { src: join(src, "empty.png") },
            garbage: { src: join(src, "garbage.png") },
            missing: { src: join(src, "gone.png") },
            remote: { src: "https://example.com/a.png" },
            already: { src: "data:image/png;base64,AA" },
          },
        },
      }),
    )
    await __testing.inlineLocalImages(snapshot)

    const ir = JSON.parse(await readFile(snapshot, "utf8"))
    for (const id of ["mislabelled", "webp", "empty", "garbage", "missing"]) {
      expect(ir.assets.images[id].src.startsWith("data:"), id).toBe(false)
    }
    expect(ir.assets.images.remote.src).toBe("https://example.com/a.png")
    expect(ir.assets.images.already.src).toBe("data:image/png;base64,AA")
  })

  it("survives a snapshot it cannot parse, since that error belongs to the CLI", async () => {
    const { __testing } = await loadPreviewTool()
    const { readFile, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const dir = await scratchTmp("pptfast-src-")
    const broken = join(dir, "snap.json")
    await writeFile(broken, "{ not json")
    await expect(__testing.inlineLocalImages(broken)).resolves.toBeUndefined()
    // Handed on untouched: the CLI's own parser writes the message the user
    // should read.
    expect(await readFile(broken, "utf8")).toBe("{ not json")
  })
})

describe("what the bundle inlines", () => {
  async function bundleDir(sizes: number[]): Promise<string> {
    const { writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const dir = await scratchTmp("pptfast-strip-")
    const pages = sizes.map((size, i) => {
      const file = `${String(i + 1).padStart(3, "0")}.svg`
      return { page: i + 1, id: `page-${i + 1}`, file, size }
    })
    for (const p of pages) await writeFile(join(dir, p.file), "x".repeat(p.size))
    await writeFile(join(dir, "manifest.json"), JSON.stringify({ title: "d", pages }))
    return dir
  }

  it("inlines the pages the strip draws and no more, whatever they weigh", async () => {
    // The defect this replaced: a byte budget shared across the deck, which
    // made a page's fate depend on its neighbours. A real nine-page deck with
    // a photo per slide came back with pages 2 and 6 blank, because the early
    // photos had spent the budget and the later, lighter pages fit in what was
    // left. Restore any total-bytes cap and this goes red on the first
    // assertion: the heavy pages here are heavy enough to blow any of them,
    // and they still have to arrive with markup.
    const { __testing } = await loadPreviewTool()
    const heavy = 4 * 1024 * 1024
    const sizes = Array.from({ length: __testing.THUMBNAIL_STRIP_PAGES + 3 }, (_x, i) => (i % 2 === 0 ? heavy : 10))
    const bundle = await __testing.readPreviewBundle(await bundleDir(sizes))

    expect(bundle.pages.map((p) => p.svg !== null)).toEqual(
      sizes.map((_s, i) => i < __testing.THUMBNAIL_STRIP_PAGES),
    )
    // The pages past the strip are still there, with everything but markup —
    // the card counts them, and the html the modal opens shows them.
    expect(bundle.pages).toHaveLength(sizes.length)
    expect((bundle.pages[sizes.length - 1] as unknown as { id: string }).id).toBe(`page-${sizes.length}`)
  })

  it("inlines a short deck whole", async () => {
    const { __testing } = await loadPreviewTool()
    const bundle = await __testing.readPreviewBundle(await bundleDir([10, 10]))
    expect(bundle.pages.map((p) => p.svg !== null)).toEqual([true, true])
    // No "we cut this short" flag survives: a fixed-length strip is the
    // design, and a card announcing it as damage on every long deck would be
    // reporting the design as a defect.
    expect(bundle).not.toHaveProperty("markupTruncated")
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

describe("what the card does with a bad answer", () => {
  /**
   * The two halves of this plugin agree on statuses, not on prose, so the seam
   * is tested by feeding the route's own real responses to the card's own real
   * classifier. Faking the statuses on either side would let them drift apart
   * exactly where drifting apart is the bug.
   */
  async function routeStatuses() {
    const { PREVIEW_ROUTE } = await loadPreviewTool()
    const cliPath = await fakeCli()
    const svc = await makeService("verdict", { cliPath })
    const { deck } = await deckFixture("LOGO-V1")
    const value = await svc.tool.execute({ target: deck })
    const handler = routeHandlerOf(svc)

    const { rm } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const alive = await request(handler, `${PREVIEW_ROUTE}/${value.previewId}`)

    // A preview the user deleted: 404, the same answer an id nobody handed out
    // gets, because nothing on disk can tell them apart.
    const deleted = await request(handler, `${PREVIEW_ROUTE}/${previewId("aa")}`)

    // A preview that survived in part. Asked through a reloaded service, or
    // the answer would come out of the in-memory bundle the first render left
    // behind and never touch the disk this test just changed.
    const second = await svc.tool.execute({ target: deck })
    await rm(join(second.outDir, "001.svg"))
    const partial = await request(routeHandlerOf(await reopen(svc)), `${PREVIEW_ROUTE}/${second.previewId}`)

    return { alive, deleted, partial }
  }

  /**
   * The real route result, dressed as the `Response` the card would receive —
   * body included, since the failure code the card reads lives in it.
   */
  function asResponse(result: RouteResult) {
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: {
        get: (name: string) => {
          const found = Object.entries(result.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
          return found === undefined ? null : String(found[1])
        },
      },
      json: async () => JSON.parse(result.body.toString("utf8")) as unknown,
    }
  }

  it("treats only the route's own 404 and 410 as the deck being gone", async () => {
    const client = await loadClientBundle(() => ({}))
    const { alive, deleted, partial } = await routeStatuses()

    expect([alive.status, deleted.status, partial.status]).toEqual([200, 404, 410])
    expect(await client.__testing.verdictOf(asResponse(alive))).toBe("alive")
    expect(await client.__testing.verdictOf(asResponse(deleted))).toBe("gone")
    expect(await client.__testing.verdictOf(asResponse(partial))).toBe("gone")
  })

  it("reads a damaged preview as damaged, off the route's own answer", async () => {
    // The seam that was missing. The host half tells a damaged preview from a
    // deleted one and says so in the body; the card was throwing that away and
    // calling both `gone`, so the whole distinction existed only in a server
    // log. Statuses cannot carry it — both are 410 — so the code has to.
    const { writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { PREVIEW_ROUTE, __testing, FAILURE_CODES } = await loadPreviewTool()
    const client = await loadClientBundle(() => ({}))
    const svc = await makeService("verdict-damaged")
    const id = previewId("dd")
    await seedPreview(svc.root, id)
    await writeFile(join(svc.root, id, __testing.RECORD_FILE), '{"target":')

    const res = await request(routeHandlerOf(svc), `${PREVIEW_ROUTE}/${id}`)
    expect(res.status).toBe(410)
    expect(JSON.parse(res.body.toString("utf8")).code).toBe(FAILURE_CODES.damaged)
    expect(await client.__testing.verdictOf(asResponse(res))).toBe("damaged")
    // Final, like `gone` — nothing regenerates a preview — but a different
    // final, and the card says a different sentence for it.
    expect(client.__testing.isFinal("damaged")).toBe(true)
    expect(client.__testing.isRetryable("damaged")).toBe(false)
    expect(client.__testing.DAMAGED_HINT).not.toMatch(/deleted|no longer on disk/)
  })

  it("labels each kind of failure in a way a program can read", async () => {
    // Prose is not a protocol. Every failure this route reports carries a code
    // next to the sentence, so the card never has to pattern-match English to
    // decide what to show.
    const { rm, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { PREVIEW_ROUTE, __testing, FAILURE_CODES } = await loadPreviewTool()
    const svc = await makeService("failure-codes")
    const handler = routeHandlerOf(svc)

    const missing = previewId("c1")
    await seedPreview(svc.root, missing)
    await rm(join(svc.root, missing, "001.svg"))
    const damaged = previewId("c2")
    await seedPreview(svc.root, damaged)
    await writeFile(join(svc.root, damaged, __testing.MANIFEST_FILE), "{ not json")

    const codeOf = async (id: string) =>
      JSON.parse((await request(handler, `${PREVIEW_ROUTE}/${id}`)).body.toString("utf8")).code as string

    expect(await codeOf(previewId("c9"))).toBe(FAILURE_CODES.unknown)
    expect(await codeOf(missing)).toBe(FAILURE_CODES.missing)
    expect(await codeOf(damaged)).toBe(FAILURE_CODES.damaged)
    // The four are distinct, or the card could not act on them.
    expect(new Set(Object.values(FAILURE_CODES)).size).toBe(4)
  })

  it("will not read a verdict off a 404 that did not come from this route", async () => {
    // A 404 does not say who wrote it. The plugin's route may have failed to
    // register, a proxy may have answered first, or the shell may be serving
    // its own not-found page for a path it does not know — and the card retires
    // a deck permanently on our 404. So the stamp is required, and its absence
    // means "no verdict", not "gone".
    const client = await loadClientBundle(() => ({}))
    const { deleted } = await routeStatuses()
    const unstamped = { ...asResponse(deleted), headers: { get: () => null } }

    expect(await client.__testing.verdictOf(asResponse(deleted))).toBe("gone")
    expect(await client.__testing.verdictOf(unstamped)).toBe("unreachable")
    // ...and a response with no headers object at all, which is what a stub or
    // an older shell would hand over.
    expect(await client.__testing.verdictOf({ ok: false, status: 404 })).toBe("unreachable")
    expect(await client.__testing.verdictOf({ ok: false, status: 410 })).toBe("unreachable")
  })

  it("keeps a refusal apart from a failure worth retrying", async () => {
    // 401 and 403 are the route answering, so they are not "could not reach
    // it". They are also not worth an identical retry: the user has to change
    // something outside this card first. Lumping them into `unreachable` would
    // offer a button that cannot possibly work.
    const client = await loadClientBundle(() => ({}))
    const stamped = (status: number) => ({
      ok: false,
      status,
      headers: { get: (n: string) => (n === client.__testing.ROUTE_HEADER ? "1" : null) },
      json: async () => ({}),
    })
    expect(await client.__testing.verdictOf(stamped(401))).toBe("refused")
    expect(await client.__testing.verdictOf(stamped(403))).toBe("refused")
    expect(client.__testing.isRetryable("unreachable")).toBe(true)
    expect(client.__testing.isRetryable("refused")).toBe(false)
    expect(client.__testing.isRetryable("gone")).toBe(false)
    expect(client.__testing.isRetryable("damaged")).toBe(false)
    expect(client.__testing.REFUSED_HINT).toMatch(/refused/)
  })

  it("maps the route's own retryable status to a verdict that does not retire the deck", async () => {
    // The other half of the errno work, checked across the seam: the server
    // answers a file it could not read with 503, and the card has to read that
    // as "try again" rather than as a deck that is gone.
    const { chmod } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const { PREVIEW_ROUTE, __testing } = await loadPreviewTool()
    const client = await loadClientBundle(() => ({}))
    const cliPath = await fakeCli()
    const svc = await makeService("verdict-503", { cliPath })
    const { deck } = await deckFixture("LOGO-V1")
    const value = await svc.tool.execute({ target: deck })
    const path = join(value.outDir, __testing.RECORD_FILE)

    await chmod(path, 0o000)
    try {
      const res = await request(routeHandlerOf(svc), `${PREVIEW_ROUTE}/${value.previewId}`)
      expect(res.status).toBe(503)
      expect(await client.__testing.verdictOf(asResponse(res))).toBe("unreachable")
      expect(client.__testing.isRetryable(await client.__testing.verdictOf(asResponse(res)))).toBe(true)
    } finally {
      await chmod(path, 0o600).catch(() => {})
    }
  })

  it("never retires a deck on an answer that was not about the deck", async () => {
    // The live bug this replaces: `if (!r.ok)` collapsed every non-2xx into
    // "expired", so one 502 from a harness that was restarting — or a request
    // that never left the tab — permanently killed the strip, the Open button
    // and the download for a deck sitting on disk the whole time, with a page
    // reload the only way back. Widen this back to `!res.ok` and every case
    // below goes red.
    const client = await loadClientBundle(() => ({}))
    for (const status of [500, 502, 503, 504, 408, 429, 0]) {
      expect(await client.__testing.verdictOf({ ok: false, status }), String(status)).toBe("unreachable")
    }
    // A fetch that rejects hands the card nothing at all, which says even less
    // about the deck than a 500 does.
    expect(await client.__testing.verdictOf(undefined)).toBe("unreachable")
    expect(await client.__testing.verdictOf({ ok: false })).toBe("unreachable")
  })

  it("says why a deck is missing without inventing an expiry nobody implemented", async () => {
    // Both halves used to tell the user their preview had "expired", which
    // described the old temp-directory storage and is simply false of this
    // one. Nothing times a preview out, so the only true reason is deletion —
    // and a user told "expired" goes looking for a retention setting instead.
    const client = await loadClientBundle(() => ({}))
    for (const copy of [client.__testing.MISSING_HINT, client.__testing.UNREACHABLE_HINT]) {
      expect(copy).not.toMatch(/expire/i)
      expect(copy).not.toMatch(/temporary|temp dir/i)
    }
    expect(client.__testing.MISSING_HINT).toMatch(/no longer on disk/)
    expect(client.__testing.MISSING_HINT).toMatch(/never removed on a timer/)
    // The unreachable case must read as "try again", never as a verdict.
    expect(client.__testing.UNREACHABLE_HINT).toMatch(/try again/)
  })

  it("recovers the page count from the transcript, which is the only evidence a deleted deck leaves", async () => {
    // The design's deliberate trade: no gravestone on disk, so a 404 carries
    // no page count. The number survives in the tool's own summary line, which
    // rides the session log — and this drives the real `modelSummary` output
    // through the real parser, so the two cannot drift apart quietly.
    const { definePreviewTool } = await loadPreviewTool()
    const client = await loadClientBundle(() => ({}))
    const parse = client.__testing as unknown as { pageCountOf: (b: unknown) => number | null }

    for (const pageCount of [1, 9, 42]) {
      const text = definePreviewTool("/x.js").output.render({}, {
        previewId: "abc-123",
        outDir: "/x",
        pageCount,
        findingCount: 0,
        audited: true,
        bundle: { pages: [] },
      })[0]!.text
      expect(parse.pageCountOf({ content: [{ type: "text", text }] })).toBe(pageCount)
    }
    expect(parse.pageCountOf({ content: [{ type: "text", text: "no count here" }] })).toBeNull()
  })

  it("opens the viewer on the page the reader clicked", async () => {
    // `#page=N` is honoured by the html itself (`src/cli/preview-html.ts`), so
    // the card's only job is to put it in the URL. Clicking page 3 and landing
    // on page 1 is the kind of small lie that makes a strip feel decorative.
    const client = await loadClientBundle(() => ({}))
    const { PREVIEW_ROUTE } = await loadPreviewTool()
    expect(client.__testing.previewHtmlUrl("abc-123")).toBe(`${PREVIEW_ROUTE}/abc-123/html`)
    expect(client.__testing.previewHtmlUrl("abc-123", 1)).toBe(`${PREVIEW_ROUTE}/abc-123/html`)
    expect(client.__testing.previewHtmlUrl("abc-123", 4)).toBe(`${PREVIEW_ROUTE}/abc-123/html#page=4`)
  })
})

describe("preview record — fields, not just shape", () => {
  it("calls a record with an unusable field damaged, not a preview with no export", async () => {
    // Validating the outer shape and then reading fields off it is the same
    // mistake as validating a manifest's array and not its elements. A
    // `pptxFile` of the wrong type was silently turned into `undefined` by
    // `fileInside` and reported as "this preview has no exported deck" — a
    // claim about the deck, made on the strength of a record this version could
    // not read. Absent is a fact; present-and-wrong-type is damage.
    const { __testing, PREVIEW_ROUTE, FAILURE_CODES } = await loadPreviewTool()
    const { writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    const svc = await makeService("record-field-types")
    const handler = routeHandlerOf(svc)

    const broken = [
      { target: "d", pptxFile: 42 },
      { target: "d", pptxFile: { name: "x.pptx" } },
      { target: "d", themeFile: [] },
      { target: 7 },
      { target: "d", pptxError: false },
      { target: "d", created: "yesterday" },
    ]
    for (const [index, record] of broken.entries()) {
      const id = previewId(`e5${index}`)
      await seedPreview(svc.root, id)
      await writeFile(join(svc.root, id, __testing.RECORD_FILE), JSON.stringify(record))

      await expect(svc.recallAnywhere(id), JSON.stringify(record)).rejects.toBeInstanceOf(__testing.PreviewDamaged)
      const res = await request(handler, `${PREVIEW_ROUTE}/${id}/pptx`)
      expect(res.status, JSON.stringify(record)).toBe(410)
      const parsed = JSON.parse(res.body.toString("utf8")) as { code: string; error: string }
      expect(parsed.code, JSON.stringify(record)).toBe(FAILURE_CODES.damaged)
      // The sentence that would be a lie about a deck nobody has looked at.
      expect(parsed.error, JSON.stringify(record)).not.toMatch(/no exported deck/)
    }
  })

  it("still treats a genuinely absent field as absent", async () => {
    // The other half, so the check above cannot pass by rejecting everything: a
    // record with no `pptxFile` at all is an older record, and those really do
    // have no export. That is `missing`, and the deck still draws.
    const { PREVIEW_ROUTE, FAILURE_CODES } = await loadPreviewTool()
    const svc = await makeService("record-field-absent")
    const id = previewId("e59")
    await seedPreview(svc.root, id, { record: { target: "old.json", created: Date.now() } })

    const handler = routeHandlerOf(svc)
    const res = await request(handler, `${PREVIEW_ROUTE}/${id}/pptx`)
    expect(res.status).toBe(410)
    expect(JSON.parse(res.body.toString("utf8")).code).toBe(FAILURE_CODES.missing)
    expect((await request(handler, `${PREVIEW_ROUTE}/${id}`)).status).toBe(200)
  })
})
