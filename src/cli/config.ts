import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { z } from "zod"
import { PptfastError } from "../errors"
import { BUILTIN_THEME_IDS, StyleOverrideSchema } from "../ir"

/**
 * Project-level deck defaults. Precedence: CLI flag > config > IR (see commands.ts applyDeckConfig).
 * `theme` is kept an open string at the schema layer (mirrors ThemeSchema in
 * ir/index.ts) — the installed-theme check runs post-parse in findConfig, the
 * same "unknown → PptfastError with the available list" UX as validateIr.
 */
const ConfigSchema = z
  .object({
    theme: z.string().optional(),
    style: StyleOverrideSchema.optional(),
  })
  .strict()

export type PptfastConfig = z.infer<typeof ConfigSchema>

export const CONFIG_FILENAME = "pptfast.config.json"

/** Walk from startDir up to the filesystem root looking for pptfast.config.json.
 *  Invalid config is a hard error (with the file path in the message), never silently ignored. */
export async function findConfig(
  startDir: string,
): Promise<{ path: string; config: PptfastConfig } | null> {
  let dir = resolve(startDir)
  for (;;) {
    const candidate = join(dir, CONFIG_FILENAME)
    let text: string | undefined
    try {
      text = await readFile(candidate, "utf8")
    } catch {
      // no config at this level — keep walking up
    }
    if (text !== undefined) {
      let raw: unknown
      try {
        raw = JSON.parse(text) as unknown
      } catch (e) {
        throw new PptfastError(`${candidate} is not valid JSON: ${(e as Error).message}`)
      }
      const r = ConfigSchema.safeParse(raw)
      if (!r.success) {
        const detail = r.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("\n")
        throw new PptfastError(`invalid ${candidate}:\n${detail}`)
      }
      if (r.data.theme !== undefined && !(BUILTIN_THEME_IDS as readonly string[]).includes(r.data.theme)) {
        throw new PptfastError(
          `${candidate}: unknown theme "${r.data.theme}" — available: ${BUILTIN_THEME_IDS.join(", ")} (see \`pptfast themes\`)`,
        )
      }
      return { path: candidate, config: r.data }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
