/**
 * Sync the package.json version into `src/version.ts`.
 *
 * package.json is the single source of truth — `changeset version` bumps it,
 * then `pnpm release:version` runs this script so the mirror follows.
 * `src/version-sync.test.ts` guards the agreement, so a missed sync fails
 * `pnpm check` rather than shipping a skewed version.
 */
import { readFileSync, writeFileSync } from "node:fs"

const version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version

writeFileSync("src/version.ts", `export const VERSION = "${version}"\n`)

console.log(`synced version ${version} -> src/version.ts`)
