/** Preflight gate for the *installed* pptfast DSH plugin.
 *
 *  Everything here runs against the copy under `~/.dsh/profiles/<profile>/
 *  node_modules`, never against the working tree, because that is the artifact
 *  a release actually hands to DSH.
 *
 *  The gate used to check one thing — that the skill registers and points at
 *  its packaged CLI — while the plugin had grown three more halves: a tool, an
 *  HTTP route, and a browser bundle. Deleting any of those left the gate green,
 *  which is the failure mode a preflight exists to prevent. Each section below
 *  is therefore written so that removing the feature it covers turns the gate
 *  red, and each was proven that way by breaking the plugin on purpose.
 */
import { execFileSync } from "node:child_process"
import { access, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

const PACKAGE_NAME = "@liustack/pptfast"

/** The tool the card's slot key, the route and the model summary all agree on. */
const PREVIEW_TOOL_NAME = "pptfast_preview"

/** The slot the browser half must claim, or the call renders in the generic row. */
const TOOLVIEW_SLOT = "tool.call.toolview"

interface InspectInstalledDshPluginOptions {
  dshHome: string
  profile: string
  expectedVersion: string
}

export interface InstalledDshPlugin {
  profile: string
  profileDir: string
  pluginDir: string
  declaredSpecifier: string
  installedVersion: string
  pluginEntryPath: string
  cliPath: string
}

export interface InstalledDshRegistration {
  name: string
  content: string
}

/** Resolve the workspace identity exactly as DSH's WorkspaceRegistry does. */
export async function canonicalWorkspacePath(path: string): Promise<string> {
  const canonical = await realpath(path)
  if (!(await stat(canonical)).isDirectory()) {
    throw new Error(`DSH workspace must be an existing directory: ${canonical}`)
  }
  return canonical
}

/** Verify the exact pptfast package that the selected DSH profile can load. */
export async function inspectInstalledDshPlugin(
  options: InspectInstalledDshPluginOptions,
): Promise<InstalledDshPlugin> {
  const { dshHome, profile, expectedVersion } = options
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(profile)) {
    throw new Error(`Invalid DSH profile name: ${profile}`)
  }

  const profileDir = join(dshHome, "profiles", profile)
  const profilePackage = JSON.parse(await readFile(join(profileDir, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>
  }
  const declaredSpecifier = profilePackage.dependencies?.[PACKAGE_NAME]
  if (declaredSpecifier === undefined) {
    throw new Error(`${PACKAGE_NAME} is not declared in DSH profile ${profile}`)
  }

  const pluginDir = join(profileDir, "node_modules", "@liustack", "pptfast")
  const installedPackage = JSON.parse(await readFile(join(pluginDir, "package.json"), "utf8")) as {
    name?: string
    version?: string
    main?: string
    dsh?: { bundle?: { patch?: string } }
  }
  if (installedPackage.name !== PACKAGE_NAME || installedPackage.version === undefined) {
    throw new Error(`Invalid ${PACKAGE_NAME} package in DSH profile ${profile}`)
  }
  if (installedPackage.version !== expectedVersion) {
    throw new Error(
      `DSH profile ${profile} has ${PACKAGE_NAME}@${installedPackage.version}, expected ${expectedVersion}`,
    )
  }
  if (installedPackage.main !== "./dsh/index.js") {
    throw new Error(`${PACKAGE_NAME}@${installedPackage.version} has no DSH plugin entry`)
  }
  if (installedPackage.dsh?.bundle?.patch !== "./cordis.patch.yml") {
    throw new Error(`${PACKAGE_NAME}@${installedPackage.version} has no DSH bundle patch`)
  }

  const pluginEntryPath = join(pluginDir, "dsh", "index.js")
  const cliPath = join(pluginDir, "dist", "cli.js")
  await Promise.all([
    access(pluginEntryPath),
    access(cliPath),
    access(join(pluginDir, "skills", "pptfast", "SKILL.md")),
    access(join(pluginDir, "cordis.patch.yml")),
  ])

  return {
    profile,
    profileDir,
    pluginDir,
    declaredSpecifier,
    installedVersion: installedPackage.version,
    pluginEntryPath,
    cliPath,
  }
}

export interface DshRouteRegistration {
  name?: string
  kind?: string
  path?: string
  handler?: unknown
}

export interface DshToolRegistration {
  name?: string
  description?: string
  parameters?: unknown
  output?: {
    render?: (args: unknown, value: unknown) => unknown
    presentationMeta?: (args: unknown, value: unknown) => unknown
  }
  execute?: (args: { target: string }, exec?: unknown) => Promise<Record<string, unknown>>
}

export interface AppliedDshPlugin {
  skills: InstalledDshRegistration[]
  tools: DshToolRegistration[]
  routes: DshRouteRegistration[]
  injected: string[][]
}

/**
 * Run the installed plugin's `apply` against a stand-in for DSH's context.
 *
 * The stand-in has to be complete, not merely enough to get through the call.
 * The previous version handed over `skills` alone, so `ctx.tools.register`
 * threw, the plugin's own `try/catch` turned that into a console line, and the
 * gate happily reported success on a plugin whose tool had never registered.
 * Every service the plugin declares is provided here and every call recorded,
 * so a registration that silently fails shows up as a missing record rather
 * than as nothing at all.
 */
export async function applyInstalledDshPlugin(installed: InstalledDshPlugin): Promise<AppliedDshPlugin> {
  const module = (await import(pathToFileURL(installed.pluginEntryPath).href)) as {
    name?: string
    inject?: unknown
    apply?: (ctx: unknown) => void
  }
  if (module.name !== "pptfast" || !Array.isArray(module.inject) || !module.inject.includes("skills")) {
    throw new Error("The installed package does not expose the pptfast DSH plugin shape")
  }
  if (!module.inject.includes("tools")) {
    throw new Error(
      `The installed pptfast DSH plugin does not inject "tools" (expected it, so that ${PREVIEW_TOOL_NAME} can register)`,
    )
  }
  if (typeof module.apply !== "function") {
    throw new Error("The installed pptfast DSH plugin has no apply function")
  }

  const applied: AppliedDshPlugin = { skills: [], tools: [], routes: [], injected: [] }
  const webServer = {
    register(route: DshRouteRegistration) {
      applied.routes.push(route)
      return () => undefined
    },
  }
  module.apply({
    skills: {
      register(registration: InstalledDshRegistration) {
        applied.skills.push(registration)
        return () => undefined
      },
    },
    tools: {
      register(tool: DshToolRegistration) {
        applied.tools.push(tool)
        return () => undefined
      },
    },
    // Cordis runs a scoped `inject` closure as soon as the named services
    // exist. Under the web profile `webServer` always does, so running it
    // straight away is the faithful simulation — and it is the only way the
    // route registration is observable at all.
    inject(names: string[], fn: (scope: { webServer: typeof webServer }) => void) {
      applied.injected.push(names)
      if (names.includes("webServer")) fn({ webServer })
    },
  })
  return applied
}

/** Prove the installed entry registers the pptfast skill, pointing at its own CLI. */
export async function verifyInstalledDshSkill(
  installed: InstalledDshPlugin,
  applied: AppliedDshPlugin,
): Promise<InstalledDshRegistration> {
  if (applied.skills.length !== 1 || applied.skills[0]?.name !== "pptfast") {
    throw new Error(
      `The installed pptfast DSH plugin did not register exactly one pptfast skill (registered ${applied.skills.length}: ${applied.skills.map((s) => String(s.name)).join(", ") || "none"})`,
    )
  }
  const registration = applied.skills[0]
  // Compared on the resolved real path, not the path the profile happens to
  // reach the package by. Under a `link:` install — how a local checkout is
  // tried out in a real DSH profile — `node_modules/@liustack/pptfast` is a
  // symlink, and the plugin computes its own CLI path from `import.meta.url`,
  // which resolves it. The two strings then differ while naming the same
  // file, and this check failed every link install. A gate that cries wolf
  // on the one workflow it is most needed for is worse than no gate.
  const expectedCliPath = await realpath(installed.cliPath)
  const cliPathInSkill =
    typeof registration.content === "string" &&
    (registration.content.includes(installed.cliPath) || registration.content.includes(expectedCliPath))
  if (!cliPathInSkill) {
    throw new Error(
      `The installed pptfast skill does not point at its packaged CLI (expected ${installed.cliPath} or its real path ${expectedCliPath})`,
    )
  }
  return registration
}

/**
 * Prove the preview tool registered, with the three members its card depends on.
 *
 * `execute` produces the deck, `output.render` is the only channel the model
 * sees, and `output.presentationMeta` is what a native-mode top-level call
 * renders from. A tool missing any one of them still registers cleanly and
 * still fails in the conversation, which is why all three are named here.
 */
export function verifyInstalledDshTool(applied: AppliedDshPlugin): DshToolRegistration {
  const tool = applied.tools.find((t) => t.name === PREVIEW_TOOL_NAME)
  if (!tool) {
    throw new Error(
      `The installed pptfast DSH plugin did not register the ${PREVIEW_TOOL_NAME} tool (registered: ${applied.tools.map((t) => String(t.name)).join(", ") || "no tools at all"})`,
    )
  }
  const missing = [
    typeof tool.execute === "function" ? undefined : "execute",
    typeof tool.output?.render === "function" ? undefined : "output.render",
    typeof tool.output?.presentationMeta === "function" ? undefined : "output.presentationMeta",
  ].filter((name): name is string => name !== undefined)
  if (missing.length > 0) {
    throw new Error(`The ${PREVIEW_TOOL_NAME} tool is missing required members: ${missing.join(", ")}`)
  }
  return tool
}

/**
 * Prove the preview route registered on the web profile's HTTP server.
 *
 * The card fetches its deck from this route — under Code Mode it is the only
 * channel that carries the bundle at all — so a plugin that registers the tool
 * and skips the route ships a card that renders an empty box.
 */
export function verifyInstalledDshRoute(applied: AppliedDshPlugin): DshRouteRegistration {
  if (!applied.injected.some((names) => names.includes("webServer"))) {
    throw new Error(
      'The installed pptfast DSH plugin never asked for "webServer" (expected a scoped ctx.inject(["webServer"], …) that registers the preview route)',
    )
  }
  const route = applied.routes.find((r) => typeof r.path === "string" && r.path.startsWith("/pptfast/preview"))
  if (!route) {
    throw new Error(
      `The installed pptfast DSH plugin did not register a /pptfast/preview route (registered: ${applied.routes.map((r) => String(r.path)).join(", ") || "no routes at all"})`,
    )
  }
  if (typeof route.handler !== "function") {
    throw new Error(`The pptfast preview route ${String(route.path)} has no handler function`)
  }
  return route
}

export interface InstalledDshClient {
  clientPath: string
  moduleId: string
  slotKeys: string[]
}

/**
 * Prove the browser half is resolvable, declared correctly, and claims the slot.
 *
 * Three separate things have gone wrong here before, so all three are checked:
 *
 *  - `exports["./client"]` must resolve from inside the profile. The shell
 *    serves the bundle by package subpath, so a file that exists but is not
 *    exported is a file nobody can load.
 *  - `dsh.client.platform` and `dsh.client.immediately` must both be declared.
 *    The client module table is lazy and nothing in the shell imports a
 *    third-party plugin, so without `immediately` the bundle is served and
 *    never executed — the first build shipped exactly that, with no error
 *    anywhere to say the card had not loaded.
 *  - loading it the way the shell does must end in a `tool.call.toolview`
 *    registration keyed by the tool's name. Any other key, and the call
 *    renders in the generic row.
 */
export async function verifyInstalledDshClient(installed: InstalledDshPlugin): Promise<InstalledDshClient> {
  const installedPackage = JSON.parse(await readFile(join(installed.pluginDir, "package.json"), "utf8")) as {
    exports?: Record<string, unknown>
    dsh?: { client?: { platform?: unknown; immediately?: unknown } }
  }
  if (typeof installedPackage.exports?.["./client"] !== "string") {
    throw new Error(`${PACKAGE_NAME} does not declare exports["./client"] (the preview card bundle)`)
  }
  // Resolved through node from inside the profile, not by joining paths: that
  // is what proves the exports map itself works, rather than that some file
  // happens to sit at the expected place.
  const requireFromProfile = createRequire(join(installed.profileDir, "package.json"))
  let clientPath: string
  try {
    clientPath = requireFromProfile.resolve(`${PACKAGE_NAME}/client`)
  } catch (error) {
    throw new Error(
      `${PACKAGE_NAME}/client does not resolve from DSH profile ${installed.profile}: ${String(error)}`,
    )
  }
  await access(clientPath)

  const client = installedPackage.dsh?.client
  if (client?.platform !== "web") {
    throw new Error(
      `${PACKAGE_NAME} package.json dsh.client.platform is ${JSON.stringify(client?.platform)}, expected "web"`,
    )
  }
  if (client?.immediately !== true) {
    throw new Error(
      `${PACKAGE_NAME} package.json dsh.client.immediately is ${JSON.stringify(client?.immediately)}, expected true — without it the card bundle is served but never executed`,
    )
  }

  const loaded = await loadDshClientBundle(clientPath)
  if (!loaded.slotKeys.includes(PREVIEW_TOOL_NAME)) {
    throw new Error(
      `The preview card bundle did not register a ${TOOLVIEW_SLOT} slot keyed ${PREVIEW_TOOL_NAME} (registered keys: ${loaded.slotKeys.join(", ") || "none"})`,
    )
  }
  return { clientPath, moduleId: loaded.moduleId, slotKeys: loaded.slotKeys }
}

/**
 * Load the client bundle the way the DSH shell does, in Node.
 *
 * The bundle is hand-written in the shell's lazy-CJS protocol: importing it
 * calls `window.__ModuleLoader__.load({ id, factory })` and does nothing else.
 * Standing in for that loader — a captured registration, a `require` that
 * hands back a fake react, a slot registry that runs the registration
 * generator — is what turns "the file parses" into "the card claims its seat".
 */
async function loadDshClientBundle(clientPath: string): Promise<{ moduleId: string; slotKeys: string[] }> {
  interface ClientRegistration {
    id?: string
    factory?: (require: (id: string) => unknown) => { apply?: (ctx: unknown) => void; inject?: unknown }
  }
  let registration: ClientRegistration | undefined
  const globals = globalThis as unknown as { window?: unknown }
  const previousWindow = globals.window
  globals.window = {
    __ModuleLoader__: {
      load(value: ClientRegistration) {
        registration = value
      },
    },
  }
  try {
    await import(pathToFileURL(clientPath).href)
  } finally {
    if (previousWindow === undefined) delete globals.window
    else globals.window = previousWindow
  }

  if (!registration || typeof registration.factory !== "function") {
    throw new Error(
      "The preview card bundle did not call window.__ModuleLoader__.load({ id, factory }) — the DSH shell would load nothing",
    )
  }
  if (registration.id !== PACKAGE_NAME) {
    throw new Error(
      `The preview card bundle registered module id ${JSON.stringify(registration.id)}, expected ${JSON.stringify(PACKAGE_NAME)}`,
    )
  }

  // Just enough react for the card factory to close over. Nothing is rendered
  // here: this proves registration, not markup.
  const fakeReact = {
    createElement: () => ({}),
    useState: (initial: unknown) => [initial, () => undefined],
    useEffect: () => undefined,
    useRef: () => ({ current: null }),
  }
  const exportsObject = registration.factory((id: string) => {
    if (id === "react") return fakeReact
    throw new Error(`the preview card bundle required an unexpected module: ${id}`)
  })
  if (typeof exportsObject.apply !== "function") {
    throw new Error("The preview card bundle's factory returned no apply function")
  }

  const slotKeys: string[] = []
  const slots = {
    inject(_name: string, run: () => Iterator<unknown>) {
      // The shell drives this registrant as a generator (cordis effects), so
      // the registration only happens if the iterator is actually stepped.
      const iterator = run()
      let step = iterator.next()
      while (step.done !== true) step = iterator.next()
    },
    register(descriptor: { name?: string; key?: string }, component: unknown) {
      if (descriptor?.name === TOOLVIEW_SLOT && typeof descriptor.key === "string" && component) {
        slotKeys.push(descriptor.key)
      }
      return () => undefined
    },
  }
  exportsObject.apply({ slots })
  return { moduleId: registration.id, slotKeys }
}

export interface PreviewToolRun {
  previewId: string
  outDir: string
  pageCount: number
  pptxPath: string
  modelText: string
}

/** Where the plugin keeps previews, resolved by the plugin's own two rules. */
function previewRootForGate(): string {
  const home = process.env.PPTFAST_HOME
  return join(resolve(home === undefined || home === "" ? join(homedir(), ".pptfast") : home), "previews")
}

/**
 * Delete a preview this gate produced, and refuse anything it did not.
 *
 * Deliberately not a one-line `rm -rf` of whatever the tool reported. The gate
 * exists to run a plugin that might be broken, the value is a string that
 * plugin chose, and the deletion is recursive and forced into the user's home
 * directory. A bug that made `execute` report `outDir: "/Users/leon"` should
 * fail this check, not empty a home directory.
 */
async function removeGeneratedPreview(outDir: string): Promise<void> {
  const root = previewRootForGate()
  const resolved = resolve(outDir)
  if (dirname(resolved) !== root) {
    process.stderr.write(`Refusing to delete ${resolved}: not a direct child of ${root}\n`)
    return
  }
  if (!(await access(join(resolved, ".pptfast-preview-owner")).then(() => true, () => false))) {
    process.stderr.write(`Refusing to delete ${resolved}: no pptfast owner marker\n`)
    return
  }
  await rm(resolved, { recursive: true, force: true }).catch(() => {})
}

/**
 * Run the registered tool end to end against a throwaway deck.
 *
 * The cheap checks above all pass on a tool that registers and then fails on
 * every call. This one uses the installed CLI, on a real IR file, and asserts
 * the two products the card depends on: the preview bundle it pages through,
 * and the .pptx its download button serves (produced in the same call — see
 * the ONE RENDER WINDOW note in dsh/preview-tool.js).
 *
 * It also asserts what must NOT be there: a deck's SVG runs to tens of
 * kilobytes and carries nothing the model can act on, so `output.render` has
 * to stay a short line. Markup leaking into it is a silent context-window
 * regression that no other check would notice.
 */
export async function verifyPreviewToolRun(tool: DshToolRegistration): Promise<PreviewToolRun> {
  const workDir = await mkdtemp(join(tmpdir(), "pptfast-dsh-gate-"))
  const target = join(workDir, "gate-deck.json")
  await writeFile(
    target,
    JSON.stringify({
      version: "4",
      filename: "pptfast-dsh-gate",
      theme: { id: "consulting" },
      slides: [
        { type: "cover", heading: "pptfast DSH preflight", subheading: "generated by pnpm e2e:dsh" },
        { type: "content", heading: "It ran", components: [{ type: "bullets", items: ["one", "two"] }] },
      ],
    }),
  )

  let outDir: string | undefined
  try {
    const value = (await tool.execute?.({ target })) as {
      previewId?: unknown
      outDir?: unknown
      pageCount?: unknown
      bundle?: { pages?: unknown[] }
    }
    if (typeof value?.previewId !== "string" || value.previewId === "") {
      throw new Error(`${PREVIEW_TOOL_NAME}.execute returned no previewId — the card finds its deck by that id`)
    }
    if (typeof value.outDir !== "string") {
      throw new Error(`${PREVIEW_TOOL_NAME}.execute returned no outDir`)
    }
    outDir = value.outDir
    const pages = value.bundle?.pages
    if (!Array.isArray(pages) || pages.length !== 2) {
      throw new Error(
        `${PREVIEW_TOOL_NAME}.execute returned ${Array.isArray(pages) ? pages.length : "no"} preview pages, expected 2 (one per slide in the gate deck)`,
      )
    }
    if (!pages.every((page) => typeof (page as { svg?: unknown }).svg === "string")) {
      throw new Error(`${PREVIEW_TOOL_NAME}.execute returned a preview page without inlined SVG markup`)
    }

    const produced = await readdir(outDir)
    const pptx = produced.find((name) => name.endsWith(".pptx"))
    if (pptx === undefined) {
      throw new Error(
        `${PREVIEW_TOOL_NAME}.execute produced no .pptx in ${outDir} (found: ${produced.join(", ")}) — the card's download button would have nothing to serve`,
      )
    }
    const pptxPath = join(outDir, pptx)
    if ((await stat(pptxPath)).size < 1024) {
      throw new Error(`The exported deck ${pptxPath} is implausibly small for a pptx`)
    }

    const rendered = tool.output?.render?.({ target }, value)
    const modelText = Array.isArray(rendered)
      ? rendered
          .map((block) => (typeof (block as { text?: unknown }).text === "string" ? (block as { text: string }).text : ""))
          .join("\n")
      : ""
    if (!modelText.includes(value.previewId)) {
      throw new Error(
        "output.render did not carry the preview id in model-facing text — that id is the only channel a Code Mode sub-call's card can read",
      )
    }
    if (/<svg|<\/svg>|<g\s|<path\s/i.test(modelText) || modelText.length > 1000) {
      throw new Error(
        `output.render leaked deck markup into model-facing text (${modelText.length} bytes) — it must stay one short line`,
      )
    }
    return { previewId: value.previewId, outDir, pageCount: pages.length, pptxPath, modelText }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
    // The gate's own deck, not the user's, and nothing deletes it on its own:
    // previews live in `~/.pptfast/previews` until somebody removes them, so a
    // release check that skipped this would leave a rendered deck plus a .pptx
    // in the user's home every run.
    //
    // Proven before it is removed, rather than taken on the tool's word.
    // `outDir` arrives as a string out of a plugin this script is here to test,
    // it is handed to a recursive forced delete, and the directory it names now
    // sits in the user's home rather than in a temp directory. Two proofs: the
    // path resolves inside the preview root, and it carries the marker the
    // plugin writes into directories it created.
    if (outDir !== undefined) await removeGeneratedPreview(outDir)
  }
}

/** Assert that DSH's composed profile config mounts the installed bundle. */
export function assertPptfastMountedInDshConfig(dump: string): void {
  const mounted = dump.split(/(?=^- id:)/m).some((row) => {
    const isPptfast = /^- id:\s*["']?pptfast["']?\s*$/m.test(row)
    const hasPackage = /^\s+name:\s*["']?@liustack\/pptfast["']?\s*$/m.test(row)
    const disabled = /^\s+disabled:\s*true\s*$/m.test(row)
    return isPptfast && hasPackage && !disabled
  })
  if (!mounted) {
    throw new Error("The composed DSH profile does not mount @liustack/pptfast")
  }
}

export interface DshDumpConfigInvocation {
  command: string
  args: string[]
  cwd: string
}

/** Build the host probe with the same canonical cwd used by the browser session. */
export function buildDshDumpConfigInvocation(
  canonicalWorkspace: string,
  profile: string,
): DshDumpConfigInvocation {
  return {
    command: "npx",
    args: ["-y", "@deepseek-ai/dsh", "--profile", profile, "--dump-config"],
    cwd: canonicalWorkspace,
  }
}

interface CliOptions {
  workspace: string
  profile: string
  dshHome: string
}

function parseCliOptions(argv: string[]): CliOptions {
  let workspace: string | undefined
  let profile = "web"
  let dshHome = process.env.DSH_HOME ?? join(homedir(), ".dsh")

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = argv[i + 1]
    if (arg === "--workspace" && value !== undefined) {
      workspace = value
      i += 1
    } else if (arg === "--profile" && value !== undefined) {
      profile = value
      i += 1
    } else if (arg === "--dsh-home" && value !== undefined) {
      dshHome = value
      i += 1
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: pnpm e2e:dsh --workspace <existing-directory> [--profile web] [--dsh-home <path>]\n",
      )
      process.exit(0)
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`)
    }
  }

  if (workspace === undefined) {
    throw new Error("--workspace is required")
  }
  return { workspace, profile, dshHome }
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2))
  const canonicalWorkspace = await canonicalWorkspacePath(options.workspace)
  const rootPackage = JSON.parse(await readFile(join(import.meta.dirname, "..", "package.json"), "utf8")) as {
    version: string
  }
  const installed = await inspectInstalledDshPlugin({
    dshHome: options.dshHome,
    profile: options.profile,
    expectedVersion: rootPackage.version,
  })
  const applied = await applyInstalledDshPlugin(installed)
  await verifyInstalledDshSkill(installed, applied)
  const tool = verifyInstalledDshTool(applied)
  const route = verifyInstalledDshRoute(applied)
  const client = await verifyInstalledDshClient(installed)
  const run = await verifyPreviewToolRun(tool)
  const invocation = buildDshDumpConfigInvocation(canonicalWorkspace, options.profile)
  const dump = execFileSync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    encoding: "utf8",
  })
  assertPptfastMountedInDshConfig(dump)

  process.stdout.write(
    [
      "DSH pptfast preflight OK",
      `profile: ${installed.profile}`,
      `plugin: ${PACKAGE_NAME}@${installed.installedVersion}`,
      `skill: pptfast -> ${installed.cliPath}`,
      `tool: ${String(tool.name)} (render, presentationMeta, execute)`,
      `route: ${String(route.path)}`,
      `card: ${client.clientPath} -> ${TOOLVIEW_SLOT}:${client.slotKeys.join(",")}`,
      `live run: ${run.pageCount} pages + ${run.pptxPath.split("/").pop()}, model text ${run.modelText.length} bytes, no markup`,
      `requested workspace: ${options.workspace}`,
      `canonical workspace: ${canonicalWorkspace}`,
      "Use the canonical workspace path for any automated workspace fixture.",
    ].join("\n") + "\n",
  )
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`DSH pptfast preflight failed: ${message}\n`)
    process.exitCode = 1
  })
}
