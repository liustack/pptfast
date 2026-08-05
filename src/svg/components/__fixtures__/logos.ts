import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

/**
 * Transparent single-ink wordmark logos for logo_wall's unit tests, generated
 * the p14 landing's own way (sharp rasterizing hand-written SVG — see the
 * one-shot generator noted in the task report). Two ink extremes on a fully
 * transparent canvas — the exact shape a press kit ships — so a test can prove
 * the per-cell backing keeps BOTH a dark-ink and a light-ink logo legible.
 *
 * Loaded from the committed `.png` files here and inlined as `data:` URIs so a
 * test can hand them to `ctx.images` as real asset `src`s. Kept self-contained
 * in `__fixtures__` (裁定 2): unit tests never reach across into
 * `tests/bench/questions-probe`.
 */
const here = dirname(fileURLToPath(import.meta.url))

function dataUri(file: string): string {
  const bytes = readFileSync(join(here, file))
  return `data:image/png;base64,${bytes.toString("base64")}`
}

/** Near-black ink wordmark on transparent — legible on a light backing. */
export const DARK_INK_LOGO = dataUri("logo-dark-ink.png")
/** Near-white ink wordmark on transparent — the p14 case that vanished when
 * `image_grid` painted no backing behind it on a light theme. */
export const LIGHT_INK_LOGO = dataUri("logo-light-ink.png")
