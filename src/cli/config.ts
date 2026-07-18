import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { z } from "zod"
import { PptfastError } from "../errors"
import { StyleOverrideSchema } from "../ir"
import { userConfigPath } from "./home"

/**
 * Project-level deck defaults. Precedence (spec §7's four-layer chain, W5
 * task 5): CLI flag > project config (this schema, cwd walk-up) > user
 * config (`UserConfigSchema` below) > whatever the artifact itself already
 * carries (an authored IR's own `theme`, or the schema's own "consulting"
 * default when nothing anywhere sets one) — see `commands.ts`'s
 * `applyDeckConfig` for where all four layers actually get merged. `theme`
 * is kept an open string at this schema layer (mirrors `ThemeSchema` in
 * `ir/index.ts`) on purpose: `readConfigFile` below no longer checks it
 * against the installed set at read time — a config file's theme value
 * might sit behind a CLI flag or another layer that never actually gets
 * used, so rejecting it here would hard-fail a command over a value that
 * was never going to apply. `applyDeckConfig` runs that check once, at
 * resolution time, against whichever layer's value actually wins the chain
 * — the same "unknown → PptfastError with the available list" UX as
 * `validateIr`, just applied to the resolved value instead of unconditionally
 * to every layer.
 *
 * `decksDir` (W5 task 6, spec §7: a team that wants deck project
 * directories checked into the repo instead of living under
 * `~/.pptfast/decks` declares it here): a relative value resolves against
 * *this config file's own directory* (wherever `findConfig`'s cwd walk-up
 * found it) — never the CLI's cwd, and never `pptfastHome()`. Wins over the
 * user config's own `decksDir` (`UserConfigSchema` below) when both are
 * set, same project-beats-user precedence as `theme`/`style` above. The two
 * layers resolve against different bases, so this schema alone can't
 * express the final answer — `commands.ts`'s `resolveDecksDirSource`
 * computes the already-resolved absolute path before handing it down to
 * `./deck-dir.ts`'s `resolveDeckTarget` / `./home.ts`'s `decksRoot`, neither
 * of which knows there are two possible bases, only the final one.
 */
const ConfigSchema = z
  .object({
    theme: z.string().optional(),
    style: StyleOverrideSchema.optional(),
    decksDir: z.string().optional(),
  })
  .strict()

export type PptfastConfig = z.infer<typeof ConfigSchema>

/**
 * User-level config schema (spec §7's four-layer chain — the layer between
 * project config and the artifact's own value): the same three deck-default
 * fields as {@link ConfigSchema} (`theme`/`style`/`decksDir`) — `decksDir`
 * is no longer project-config-free as of W5 task 6 (see {@link ConfigSchema}'s
 * own doc comment on that field), but the two layers still resolve it
 * against different bases: this user layer always resolves against
 * `pptfastHome()` (`./home.ts`'s `decksRoot`, this layer's one fixed
 * location), the project layer against the project config file's own
 * directory. Declared as its own flat object literal rather than
 * `ConfigSchema.extend(...)` — a shape this small is not worth taking on
 * zod's extend-then-restrict chaining, and it keeps both schemas readable
 * independently.
 *
 * `decksDir`: a relative value resolves against this config file's own
 * directory (`./home.ts`'s `pptfastHome()` — the only directory a user
 * config can ever live in, see `decksRoot`), never the CLI's cwd. No tilde
 * expansion — a literal `~/decks` is the literal relative path segment
 * `~/decks` under that base, not the home directory. The resulting (almost
 * certainly missing) directory surfaces through whatever downstream error
 * reads it, same as any other bad path.
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
 * {@link PptfastError} naming `path`. Deliberately does *not* check `theme`
 * against the installed set here — see {@link ConfigSchema}'s own doc
 * comment for why that moved to `applyDeckConfig` (`../cli/commands.ts`) at
 * resolution time instead, applied only to whichever layer's value actually
 * wins the four-layer chain.
 */
async function readConfigFile<T>(
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
