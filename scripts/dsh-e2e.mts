import { execFileSync } from "node:child_process"
import { access, readFile, realpath, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const PACKAGE_NAME = "@liustack/pptfast"

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

/** Load the installed entry and prove that it registers the expected skill. */
export async function verifyInstalledDshRegistration(
  installed: InstalledDshPlugin,
): Promise<InstalledDshRegistration> {
  const module = (await import(pathToFileURL(installed.pluginEntryPath).href)) as {
    name?: string
    inject?: unknown
    apply?: (ctx: { skills: { register: (registration: InstalledDshRegistration) => () => void } }) => void
  }
  if (module.name !== "pptfast" || !Array.isArray(module.inject) || !module.inject.includes("skills")) {
    throw new Error("The installed package does not expose the pptfast DSH plugin shape")
  }
  if (typeof module.apply !== "function") {
    throw new Error("The installed pptfast DSH plugin has no apply function")
  }

  const registrations: InstalledDshRegistration[] = []
  module.apply({
    skills: {
      register(registration) {
        registrations.push(registration)
        return () => undefined
      },
    },
  })
  if (registrations.length !== 1 || registrations[0]?.name !== "pptfast") {
    throw new Error("The installed pptfast DSH plugin did not register exactly one pptfast skill")
  }
  const registration = registrations[0]
  if (typeof registration.content !== "string" || !registration.content.includes(installed.cliPath)) {
    throw new Error("The installed pptfast skill does not point at its packaged CLI")
  }
  return registration
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
  await verifyInstalledDshRegistration(installed)
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
