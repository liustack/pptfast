import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { z } from "zod"
import { PptfastError } from "../errors"
import { StyleOverrideSchema } from "../ir"
import { getInstalledThemeIds } from "../themes/definitions"
import { userConfigPath } from "./home"

/**
 * Project-level deck defaults. Precedence (spec §7's four-layer chain, W5
 * task 5): CLI flag > project config (this schema, cwd walk-up) > user
 * config (`UserConfigSchema` below) > whatever the artifact itself already
 * carries (an authored IR's own `theme`, or the schema's own "consulting"
 * default when nothing anywhere sets one) — see `commands.ts`'s
 * `applyDeckConfig` for where all four layers actually get merged. `theme`
 * is kept an open string at the schema layer (mirrors ThemeSchema in
 * ir/index.ts) — the installed-theme check runs post-parse in
 * `readConfigFile` against `getInstalledThemeIds()` (builtins + anything
 * registered via `registerTheme`, W3 task 4), the same "unknown →
 * PptfastError with the available list" UX as validateIr.
 */
const ConfigSchema = z
  .object({
    theme: z.string().optional(),
    style: StyleOverrideSchema.optional(),
  })
  .strict()

export type PptfastConfig = z.infer<typeof ConfigSchema>

/**
 * User-level config schema (spec §7's four-layer chain — the layer between
 * project config and the artifact's own value): the same two deck-default
 * fields as {@link ConfigSchema} plus `decksDir`, a user-identity concern
 * with no project-level equivalent (redirects `decksRoot`'s default,
 * `./home.ts`) — spec's own split, "用户身份类配置...归用户层，项目品牌类
 * （style/tokens）归项目层". Declared as its own flat object literal rather
 * than `ConfigSchema.extend(...)` — one extra field, not worth taking on
 * zod's extend-then-restrict chaining for a shape this small, and it keeps
 * both schemas readable independently.
 */
const UserConfigSchema = z
  .object({
    theme: z.string().optional(),
    style: StyleOverrideSchema.optional(),
    decksDir: z.string().optional(),
  })
  .strict()

export type UserPptfastConfig = z.infer<typeof UserConfigSchema>

export const CONFIG_FILENAME = "pptfast.config.json"

/**
 * Shared read+parse+validate body for both config layers (project and user)
 * — same failure posture either way: a missing file is `null` ("fine, no
 * config at this level"), invalid JSON or a failed schema parse is a hard
 * {@link PptfastError} naming `path`, and an unknown `theme` id is checked
 * against the installed set the same way `validateIr` checks IR's own
 * `theme.id`. `T` is constrained to `{ theme?: string }` only — the one
 * field this function itself inspects post-parse; the caller's schema is
 * free to carry more (`UserConfigSchema`'s `decksDir`).
 */
async function readConfigFile<T extends { theme?: string }>(
  path: string,
  schema: z.ZodType<T>,
): Promise<{ path: string; config: T } | null> {
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch {
    return null // no config at this level
  }
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch (e) {
    throw new PptfastError(`${path} is not valid JSON: ${(e as Error).message}`)
  }
  const r = schema.safeParse(raw)
  if (!r.success) {
    const detail = r.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n")
    throw new PptfastError(`invalid ${path}:\n${detail}`)
  }
  if (r.data.theme !== undefined) {
    const installedThemeIds = getInstalledThemeIds()
    if (!installedThemeIds.includes(r.data.theme)) {
      throw new PptfastError(
        `${path}: unknown theme "${r.data.theme}" — available: ${installedThemeIds.join(", ")} (see \`pptfast themes\`)`,
      )
    }
  }
  return { path, config: r.data }
}

/** Walk from startDir up to the filesystem root looking for pptfast.config.json.
 *  Invalid config is a hard error (with the file path in the message), never silently ignored. */
export async function findConfig(
  startDir: string,
): Promise<{ path: string; config: PptfastConfig } | null> {
  let dir = resolve(startDir)
  for (;;) {
    const hit = await readConfigFile(join(dir, CONFIG_FILENAME), ConfigSchema)
    if (hit) return hit
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * User-level config (spec §7's four-layer chain, the layer below project
 * config): a single fixed path (`userConfigPath()`, `./home.ts` —
 * `$PPTFAST_HOME` or `~/.pptfast`), no cwd walk-up — there is exactly one
 * user config, unlike project config which can live at any ancestor of cwd.
 * Same missing/invalid posture as {@link findConfig}: missing file is fine
 * (`null`), invalid JSON or schema is a hard {@link PptfastError} with the
 * path.
 */
export async function findUserConfig(): Promise<{ path: string; config: UserPptfastConfig } | null> {
  return readConfigFile(userConfigPath(), UserConfigSchema)
}
