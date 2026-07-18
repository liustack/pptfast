import { homedir } from "node:os"
import { join } from "node:path"

/**
 * Root directory for pptfast's user-level state — deck project defaults
 * (`decksRoot`) and the user config file (`userConfigPath`), spec §7's
 * storage-policy decision. `PPTFAST_HOME` overrides it wholesale (CI /
 * containers); otherwise a single predictable dotdir under the user's home,
 * the same posture as `.ssh`/`.npmrc`/`.aws`/`~/.claude` — deliberately
 * *not* the per-OS XDG/AppData split an `env-paths`-style helper would give:
 * deck project directories are large working files an agent produces, not
 * roaming-synced app config, and this tool's users (developers and agents)
 * benefit more from one predictable path than from OS-idiomatic placement.
 * Read fresh on every call (never cached) — `PPTFAST_HOME` is meant to be
 * redirectable per-process (tests set it via `process.env` before calling).
 */
export function pptfastHome(): string {
  return process.env.PPTFAST_HOME ?? join(homedir(), ".pptfast")
}

/**
 * Default parent directory for bare-name deck resolution
 * (`$PPTFAST_HOME/decks/<name>/`, `./deck-dir.ts`'s `resolveDeckTarget`).
 * `config` is deliberately a minimal structural shape (`{ decksDir?: string
 * }`), not `UserPptfastConfig` itself — `./config.ts` already imports
 * `userConfigPath` from this module, so importing its type back here would
 * be circular. Redirecting `decksDir` is a user-identity concern (spec §7:
 * "用户身份类配置...归用户层") — a team that wants deck projects tracked
 * inside a repo instead reaches for project-level `pptfast.config.json`,
 * a separate, unrelated mechanism.
 */
export function decksRoot(config?: { decksDir?: string }): string {
  return config?.decksDir ?? join(pptfastHome(), "decks")
}

/** Path to the user-level config file (theme/style defaults + `decksDir` redirect, spec §7's four-layer chain). */
export function userConfigPath(): string {
  return join(pptfastHome(), "config.json")
}
