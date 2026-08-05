/**
 * Load an on-disk {@link BrandThemeFile} (`./brand-extract.ts`'s output, or
 * a hand-authored equivalent) into the theme registry (brand-extract wave,
 * 裁定 3: "装载走 registerTheme"). Split from `brand-extract.ts` because this
 * module's job is untrusted-input validation + registration — a theme file
 * is user-editable JSON, not something `extractBrandTheme`'s own return
 * value needs re-validated against when it's the one producing it — while
 * that module's job is the pure OOXML→tokens derivation. Both stay
 * browser-safe (no Node-only import), same as every other file under
 * `src/themes/` (`AGENTS.md`'s dependency-closure rule): the actual file
 * read (`readFile`) happens in `src/cli/commands.ts`, which hands this
 * module already-parsed JSON.
 */
import { z } from "zod"
import { PptfastError } from "../errors"
import { BrandConfigSchema } from "@/ir"
import type { BrandThemeFile } from "./brand-extract"
import { getInstalledThemeIds, registerTheme } from "./definitions"
import { CANONICAL_THEME_IDS } from "./index"

// A theme file is untrusted (user-edited, or hand-authored from scratch) —
// unlike `extractBrandTheme`'s own return value, it needs full structural
// validation before `registerTheme` ever sees it, so a malformed field
// produces a readable `PptfastError` instead of a raw `TypeError` deep
// inside `assertContrastFloor`. Deliberately a fresh schema rather than a
// reuse of `ir/index.ts`'s `StyleOverrideSchema` (every field there is
// `.optional()` — a deep-partial *override* shape — where a theme file's
// `style` must be a *complete* `StyleTokens`, `defaultBackgrounds` included).
const HexToken = z.string().regex(/^#[0-9A-Fa-f]{3,8}$/, "expected a hex color like #RRGGBB")

const BackgroundSpecFileSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("color"), value: HexToken }).strict(),
  z
    .object({
      kind: z.literal("gradient"),
      from: HexToken,
      to: HexToken,
      direction: z.enum(["tb", "lr", "diagonal"]).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("asset"),
      asset_id: z.string(),
      overlay: z.object({ color: HexToken, opacity: z.number().min(0).max(1) }).strict().optional(),
      fit: z.enum(["cover", "contain"]).optional(),
    })
    .strict(),
])

const StyleTokensFileSchema = z
  .object({
    id: z.string().min(1),
    allowCustomBackground: z.boolean().optional(),
    colors: z
      .object({
        bg: HexToken,
        surface: HexToken,
        panel: HexToken.optional(),
        primary: HexToken,
        accent: HexToken,
        text: HexToken,
        muted: HexToken,
        border: HexToken.optional(),
        chartPalette: z.array(HexToken).min(1),
        accentPool: z.array(HexToken).min(1).optional(),
        cardStroke: HexToken.optional(),
      })
      .strict(),
    fonts: z
      .object({
        heading: z.array(z.string()).min(1),
        body: z.array(z.string()).min(1),
        mono: z.array(z.string()).min(1).optional(),
      })
      .strict(),
    shape: z
      .object({
        radius: z.number().min(0).max(32).optional(),
        gapScale: z.number().min(0.8).max(1.3).optional(),
      })
      .strict()
      .optional(),
    defaultBackgrounds: z
      .object({
        cover: BackgroundSpecFileSchema,
        chapter: BackgroundSpecFileSchema,
        content: BackgroundSpecFileSchema,
        ending: BackgroundSpecFileSchema,
      })
      .strict(),
  })
  .strict()

export const BrandThemeFileSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().optional(),
    style: StyleTokensFileSchema,
    brand: BrandConfigSchema.optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict()

/** Parse+validate raw JSON (already `JSON.parse`d by the caller — see
 *  `src/cli/load-ir.ts`'s `loadIrFile`) as a {@link BrandThemeFile}. `source`
 *  names the file in the thrown message (a path, or another caller-chosen
 *  label) — mirrors `loadStyleFile`'s (`src/cli/commands.ts`) own
 *  "invalid <kind> file <path>:\n<detail>" shape so a theme-file error reads
 *  exactly like every other config-file validation error in this CLI. */
export function parseBrandThemeFile(raw: unknown, source: string): BrandThemeFile {
  const r = BrandThemeFileSchema.safeParse(raw)
  if (!r.success) {
    const detail = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")
    throw new PptfastError(`invalid theme file ${source}:\n${detail}`)
  }
  // BrandThemeFileSchema is a structural mirror of BrandThemeFile (every
  // field name/optionality matches `./brand-extract.ts`'s interface) — the
  // cast documents that equivalence rather than papering over a real
  // mismatch; `brand-theme-file.test.ts` round-trips a real
  // `extractBrandTheme` output through this exact parse to keep the two
  // definitions from silently drifting apart.
  return r.data as BrandThemeFile
}

/**
 * Register a parsed {@link BrandThemeFile} (`registerTheme`, `./definitions.ts`
 * — 裁定 3: this is the *only* loading path, so its contrast floor
 * automatically gates every custom theme). Two collision outcomes, per 裁定
 * 4:
 *
 * - `file.id` names a builtin (`CANONICAL_THEME_IDS`) → always a hard error,
 *   regardless of whether this exact file was already loaded once — a
 *   custom theme must never shadow a builtin id (determinism: which
 *   `layouts`/`layoutTendencies` "consulting" resolves to must never depend
 *   on whether some unrelated `--theme-file` ran first).
 * - `file.id` is already registered (not a builtin) → a silent no-op, not a
 *   second error. `registerTheme` itself throws unconditionally on *any*
 *   id collision, builtin or not — this idempotent skip exists because
 *   `pptfast serve`'s rebuild loop (`src/cli/serve.ts`) calls this on every
 *   file-watch rebuild for the *same* deck, and the theme-file/deck-dir
 *   `theme.json` it re-reads each time resolves to the same id every time.
 *   (A theme file edited *between* two rebuilds keeps whichever version
 *   registered first for that process's lifetime — no live-reload for a
 *   theme file's own content, only for deck content; out of this wave's
 *   scope.)
 *
 * Returns `file.id` so a caller can fold it into the deck's own
 * theme-resolution precedence chain (`applyDeckConfig`, `src/cli/commands.ts`).
 */
export function registerBrandThemeFile(file: BrandThemeFile): string {
  if ((CANONICAL_THEME_IDS as readonly string[]).includes(file.id)) {
    throw new PptfastError(
      `theme file id "${file.id}" collides with a built-in pptfast theme — pick a different id (\`pptfast brand extract --id <id>\`, or edit the theme file's own "id" field)`,
    )
  }
  if (!getInstalledThemeIds().includes(file.id)) {
    registerTheme({ id: file.id, style: file.style, brand: file.brand ?? {}, tags: file.tags ?? [] })
  }
  return file.id
}
