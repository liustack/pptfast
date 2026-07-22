/**
 * Sync the package.json version into its two mirrors:
 * `.claude-plugin/plugin.json` and `src/version.ts`.
 *
 * package.json is the single source of truth — `changeset version` bumps it,
 * then `pnpm release:version` runs this script so the mirrors follow.
 * `src/plugin-manifest.test.ts` guards the three-way agreement, so a missed
 * sync fails `pnpm check` rather than shipping a skewed version.
 */
import { readFileSync, writeFileSync } from "node:fs"

const version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version

const pluginPath = ".claude-plugin/plugin.json"
const plugin = JSON.parse(readFileSync(pluginPath, "utf8")) as Record<string, unknown>
plugin.version = version
writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + "\n")

writeFileSync("src/version.ts", `export const VERSION = "${version}"\n`)

console.log(`synced version ${version} -> ${pluginPath}, src/version.ts`)
