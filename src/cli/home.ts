import { homedir } from "node:os"
import { join, resolve } from "node:path"

/**
 * Root directory for pptfast's user-level state — deck project defaults
 * (`decksRoot`) and the user config file (`userConfigPath`), spec §7's
 * storage-policy decision. `PPTFAST_HOME` overrides it wholesale (CI /
 * containers). Otherwise a single predictable dotdir under the user's home,
 * the same posture as `.ssh`/`.npmrc`/`.aws`/`~/.claude` — deliberately
 * *not* the per-OS XDG/AppData split an `env-paths`-style helper would give:
 * deck project directories are large working files an agent produces, not
 * roaming-synced app config, and this tool's users (developers and agents)
 * benefit more from one predictable path than from OS-idiomatic placement.
 * Read fresh on every call (never cached) — `PPTFAST_HOME` is meant to be
 * redirectable per-process (tests set it via `process.env` before calling).
 *
 * An empty value counts as unset, which `??` alone does not do. `PPTFAST_HOME=`
 * in a shell profile, or a container runtime that passes every declared
 * variable through whether or not it has a value, both produce `""` — and `""`
 * resolved to a relative path, so the deck root became `./decks`, moved
 * whenever the process's cwd did, and put `config.json` wherever the user
 * happened to be standing. The DSH plugin resolves its own preview root by the
 * same two rules (`previewRoot`, dsh/preview-tool.js), and it deletes
 * directories under that root, so the two agreeing is worth more than one
 * character of `??`.
 */
export function pptfastHome(): string {
  const home = process.env.PPTFAST_HOME
  return home === undefined || home === "" ? join(homedir(), ".pptfast") : home
}

/**
 * Default parent directory for bare-name deck resolution
 * (`$PPTFAST_HOME/decks/<name>/`, `./deck-dir.ts`'s `resolveDeckTarget`).
 * `config` is deliberately a minimal structural shape (`{ decksDir?: string
 * }`), not `UserPptfastConfig` itself — `./config.ts` already imports
 * `userConfigPath` from this module, so importing its type back here would
 * be circular. Redirecting `decksDir` is a user-identity concern (spec §7:
 * user-identity-class config belongs to the user layer) — a team that wants
 * deck projects tracked inside a repo instead reaches for project-level
 * `pptfast.config.json`, a separate, unrelated mechanism.
 *
 * A relative `decksDir` resolves against `pptfastHome()` itself — the only
 * directory a user config file can ever live in (see `userConfigPath`
 * below) — never the CLI's cwd. An absolute value passes through unchanged
 * (`path.resolve`'s own semantics handle both in one call, no separate
 * `isAbsolute` branch needed). No tilde expansion: a literal `~/decks` is
 * one relative path segment, not shorthand for the home directory — see
 * `./config.ts`'s `UserConfigSchema` doc comment.
 */
export function decksRoot(config?: { decksDir?: string }): string {
  return resolve(pptfastHome(), config?.decksDir ?? "decks")
}

/** Path to the user-level config file (theme/style defaults + `decksDir` redirect, spec §7's four-layer chain). */
export function userConfigPath(): string {
  return join(pptfastHome(), "config.json")
}
