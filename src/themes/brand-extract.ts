/**
 * Local brand-color/font extraction from a user's own `.thmx`/`.potx`/`.pptx`
 * OOXML theme part (brand-extract wave, roadmap §2.0.1: the free
 * adoption-friction remover — "the output doesn't look like our company" is
 * pptfast's #1 enterprise-adoption blocker, and every user who hits it
 * already has a company template on disk). Everything in this module runs
 * against zip bytes only (`jszip`, already a browser-safe dependency) —
 * `src/index.ts`'s dependency closure stays free of Node-only deps
 * (`AGENTS.md`'s layout rule), so this can run in a browser as readily as
 * the CLI's `pptfast brand extract` wraps it for.
 *
 * Rewritten from `.issues/notes/brand-extraction-probe.py` (the 39/39
 * feasibility reference: every macOS Office `.thmx` extracted cleanly) —
 * read that file for the reference regex shapes, not embedded here as
 * Python. This is a TS reimplementation, not a port with a Python shim.
 *
 * ── Slot → token mapping (roadmap §2.0.1's table, 裁定 2) ──────────────
 *
 *   dk1/lt1 (by measured lightness) → text / bg — see below, not a fixed
 *                      dk1→text/lt1→bg assignment
 *   lt2              → surface (falls back to bg when absent)
 *   accent1 (or dk2) → primary/accent
 *   accent1-6        → chartPalette (OOXML's 6 accent slots map 1:1 onto
 *                      pptfast's chart palette — no reshaping needed)
 *   —                → muted, derived (see {@link deriveMuted})
 *
 * ── bg/text assignment: by measured lightness, not slot name ────────────
 *
 * OOXML's `dk1`/`lt1` are slot *names*, not a guarantee about which one is
 * actually darker. Empirically verified against all 39 real `.thmx` files
 * shipped with a local macOS Office install (`.issues/notes/brand-extraction-probe.py`'s
 * own corpus) before writing this: every single one — including
 * "Dark Gradient.thmx", the one visually dark-background theme in that
 * set — declares the conventional `dk1=#000000`/`lt1=#FFFFFF` unchanged;
 * six declare a near-black-but-not-pure `dk1` (e.g. `#131313`), never a
 * *light* `dk1`. A theme's actual dark/light background comes from the
 * slide master's own background fill (`<p:bg>`, often referencing `dk2` or a
 * gradient) — a part this extractor deliberately never reads (theme part
 * only, 裁定 1) — not from which literal color sits in `dk1` vs `lt1`. So
 * this extractor makes no claim about detecting "is this a dark theme" at
 * all; it only guards against the (real, if rare outside this local corpus)
 * case of a producer that swapped which raw color occupies which *named*
 * slot: {@link resolveBgText} assigns `text` to whichever of `dk1`/`lt1`
 * measures darker and `bg` to whichever measures lighter, regardless of
 * which slot name it came from — always a legible dark-ink-on-light-bg (or,
 * for a genuinely inverted producer, the reverse) pairing, never a
 * name-literal assignment that could land dark-on-dark. `isDark` (below)
 * measures "darker" with nothing but the already-exported `contrastRatio`
 * (`../svg/ink`) against pure black/white — no new luminance formula, per
 * this wave's "reuse existing ratio/mix utilities" discipline.
 */
import JSZip from "jszip"
import { PptfastError } from "../errors"
import { contrastRatio } from "../svg/ink"
import { mixHex } from "../svg/components/color-mix"
import type { BrandConfig } from "@/ir"
import type { StyleTokens } from "./tokens"

/** The theme-file JSON shape written by `pptfast brand extract` / SDK
 *  {@link extractBrandTheme}, and read back by `--theme-file` /
 *  `brand-theme-file.ts`'s `registerBrandThemeFile`. Pure data (裁定 3): no
 *  `layouts`/`motif`/`layoutTendencies` — those default to the full set,
 *  same as any other `registerTheme` caller that omits them. `label` is
 *  informational only (a human-readable name for the CLI/UI to show); the
 *  render chain never reads it — the theme's own `id` is what everything
 *  else keys off. */
export interface BrandThemeFile {
  id: string
  label: string
  style: StyleTokens
  brand: BrandConfig
  tags: string[]
}

export interface ExtractBrandThemeOptions {
  /** Theme id — defaults to a slug of {@link ExtractBrandThemeOptions.label},
   *  or (when that's also absent) a slug of the source theme part's own
   *  `<a:clrScheme name="…">`. The CLI (`pptfast brand extract`) always
   *  passes one explicitly (`--id`, or a slug of the `-o` filename — 裁定
   *  4) — this default only ever fires for a bare SDK caller. */
  id?: string
  /** Human-readable label — defaults to the source theme part's own
   *  `<a:clrScheme name="…">`. */
  label?: string
}

/** Every OOXML color-scheme slot this parser reads. `hlink`/`folHlink` are
 *  parsed (mirroring probe.py) but never mapped onto a pptfast token — no
 *  hyperlink-color concept exists in `StyleColors` today. */
type ClrSlot = "dk1" | "lt1" | "dk2" | "lt2" | "accent1" | "accent2" | "accent3" | "accent4" | "accent5" | "accent6" | "hlink" | "folHlink"
type ClrSlots = Partial<Record<ClrSlot, string>>

const ACCENT_SLOTS: readonly ClrSlot[] = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"]

// Theme part location (probe.py's own comment): `.thmx` puts it at
// `theme/theme/theme1.xml`, `.pptx`/`.potx` at `ppt/theme/theme1.xml` — this
// regex matches either, and any numbered variant (`theme2.xml`, …). A
// multi-variant `.thmx` also carries per-variant copies under
// `theme/themeVariants/variant<N>/theme/theme1.xml`; those are excluded by
// path, and among the survivors the *shortest* path wins (probe.py's own
// `sorted(cands, key=len)[0]`) — the top-level part is always the shortest.
const THEME_PART_RE = /theme\d*\.xml$/
const THEME_VARIANTS_SEGMENT = "themeVariants"

const CLR_SCHEME_RE = /<a:clrScheme name="([^"]*)">([\s\S]*?)<\/a:clrScheme>/
const CLR_SLOT_RE =
  /<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)>\s*<a:(?:srgbClr val="([0-9A-Fa-f]{6})"|sysClr[^>]*lastClr="([0-9A-Fa-f]{6})")/g
const FONT_SCHEME_RE =
  /<a:fontScheme name="([^"]*)">[\s\S]*?<a:majorFont>\s*<a:latin typeface="([^"]*)"[\s\S]*?<a:minorFont>\s*<a:latin typeface="([^"]*)"/

interface ThemePart {
  path: string
  xml: string
}

async function findThemePart(zip: JSZip): Promise<ThemePart | undefined> {
  const candidates = Object.keys(zip.files)
    .filter((name) => !zip.files[name]!.dir && THEME_PART_RE.test(name) && !name.includes(THEME_VARIANTS_SEGMENT))
    .sort((a, b) => a.length - b.length)
  const path = candidates[0]
  if (path === undefined) return undefined
  const xml = await zip.files[path]!.async("string")
  return { path, xml }
}

function parseColors(xml: string): { schemeName: string | undefined; slots: ClrSlots } {
  const match = CLR_SCHEME_RE.exec(xml)
  if (!match) return { schemeName: undefined, slots: {} }
  const slots: ClrSlots = {}
  for (const m of match[2]!.matchAll(CLR_SLOT_RE)) {
    const slot = m[1] as ClrSlot
    const hex = m[2] ?? m[3]
    if (hex) slots[slot] = `#${hex.toUpperCase()}`
  }
  return { schemeName: match[1]?.trim() || undefined, slots }
}

function parseFonts(xml: string): { major: string | undefined; minor: string | undefined } {
  const m = FONT_SCHEME_RE.exec(xml)
  if (!m) return { major: undefined, minor: undefined }
  return { major: m[2]?.trim() || undefined, minor: m[3]?.trim() || undefined }
}

/** `hex` reads as closer to black than to white — see this file's own header
 *  comment ("bg/text assignment: by measured lightness, not slot name"). No
 *  new luminance math: two `contrastRatio` (`../svg/ink`) calls against pure
 *  black/white, compared against each other, rather than a fresh relative-
 *  luminance computation of its own. */
function isDark(hex: string): boolean {
  return contrastRatio(hex, "#FFFFFF") > contrastRatio(hex, "#000000")
}

/** `text` = whichever of `dk1`/`lt1` measures darker, `bg` = whichever
 *  measures lighter — see this file's own header comment for why this is
 *  a measured-lightness assignment, not a `dk1`-always-means-text one. The
 *  conventional case (`dk1` dark, `lt1` light — every real-world sample this
 *  wave checked) and the by-name assignment agree; this only diverges for a
 *  producer that put an unconventional raw color in either named slot. */
function resolveBgText(dk1: string, lt1: string): { bg: string; text: string } {
  return isDark(dk1) === isDark(lt1)
    ? { bg: lt1, text: dk1 } // ambiguous (both/neither read dark) — keep the conventional dk1→text/lt1→bg mapping
    : isDark(dk1)
      ? { bg: lt1, text: dk1 }
      : { bg: dk1, text: lt1 }
}

/** How many discrete steps {@link deriveMuted} walks from the most-muted
 *  (blended fully toward `bg`) candidate back toward `text` itself — same
 *  20-step (5% increment) granularity `metaInk` (`../svg/ink.ts`) already
 *  uses for its own stepped ink walk, reused here rather than picked fresh. */
const MUTED_STEPS = 20
/** The body-text WCAG floor (`CONTRAST_RATIO_BODY` in `../svg/ink.ts`,
 *  inlined rather than imported since that constant isn't exported) — a
 *  derived `muted` token must clear this against *both* `bg` and `surface`,
 *  not just registerTheme's lower 3.0:1 registration floor, so it reads
 *  correctly as body text on either background a theme might paint. */
const MUTED_TARGET_RATIO = 4.5

/**
 * Derive a `muted` token from `text` by blending it toward `bg` in
 * {@link MUTED_STEPS} discrete steps (`mixHex`, `../svg/components/color-mix.ts`
 * — the same solid-hex blend `swot.tsx`/`bmc.tsx`/`waterfall.tsx` already
 * share) and measuring each candidate with the already-exported
 * `contrastRatio` (`../svg/ink.ts`) — no new color math, per this wave's own
 * discipline. Walks from the most-muted end (`t=1`, blended fully toward
 * `bg`) down to `t=0` (`text` itself, the highest-contrast endpoint) and
 * returns the *first* candidate — i.e. the most-muted one — that clears
 * {@link MUTED_TARGET_RATIO} against **both** `bg` and `surface` (the two
 * backgrounds `colors.muted` can actually render against). Falls back to
 * `text` unchanged when no step clears the floor even at `t=0` — a
 * pathological source palette (near-identical text/bg/accent tones) that
 * `registerTheme`'s own `assertContrastFloor` (`./definitions.ts`, 3.0:1) is
 * the intended backstop for, not this function's job to paper over.
 */
export function deriveMuted(text: string, bg: string, surface: string): string {
  for (let step = MUTED_STEPS; step >= 0; step--) {
    const t = step / MUTED_STEPS
    const candidate = mixHex(text, bg, t)
    if (contrastRatio(candidate, bg) >= MUTED_TARGET_RATIO && contrastRatio(candidate, surface) >= MUTED_TARGET_RATIO) {
      return candidate
    }
  }
  return text
}

/** Keywords (lower-cased, substring match) that mark a font name as
 *  belonging to the serif family — used only to pick which of two
 *  `SAFE_FONTS` fallback chains {@link buildFontStack} appends after the
 *  extracted face, mirroring consulting's own `["Bower", "Georgia", "Source
 *  Han Serif SC", "serif"]` precedent (`./consulting.ts`) for a serif brand
 *  font, or a sans equivalent otherwise. This is a display-quality heuristic,
 *  not a safety one: `resolveFontFace` (`../svg/fonts.ts`) already falls
 *  back to a Windows-safe CJK default (`Microsoft YaHei`) when nothing in
 *  the stack matches `SAFE_FONTS` at all, so a missed classification here
 *  degrades to "the fallback face doesn't visually match the brand font's
 *  register," never a broken/unmeasured export. */
const SERIF_HINTS = [
  "times",
  "georgia",
  "cambria",
  "garamond",
  "palatino",
  "constantia",
  "book antiqua",
  "minion",
  "serif",
  "cochin",
  "didot",
  "baskerville",
  "sitka",
  "century",
  "goudy",
  "bodoni",
  "caslon",
  "perpetua",
  "rockwell",
  "playfair",
]

function isSerifName(name: string): boolean {
  const n = name.toLowerCase()
  return SERIF_HINTS.some((hint) => n.includes(hint))
}

/** Extracted face at the head of the stack (when present), followed by a
 *  Windows-safe fallback chain matching its apparent register — see
 *  {@link SERIF_HINTS}'s own doc comment. `undefined` (no `<a:latin
 *  typeface>` found at all) skips straight to the sans-serif fallback chain
 *  alone — the common Office default (Calibri/Calibri Light) is itself
 *  sans, so this is the safer bare default. */
function buildFontStack(extracted: string | undefined): string[] {
  if (extracted === undefined) return ["Calibri", "Microsoft YaHei", "sans-serif"]
  return isSerifName(extracted)
    ? [extracted, "Georgia", "Source Han Serif SC", "serif"]
    : [extracted, "Calibri", "Microsoft YaHei", "sans-serif"]
}

/** Lower-cases, replaces every run of non-alphanumeric characters with a
 *  single hyphen, and trims leading/trailing hyphens — a plain, dependency-free
 *  slug (no new package for one string transform). Empty input (or input
 *  that's entirely non-alphanumeric — a CJK-only deck name reduces to nothing
 *  here) falls back to `fallback` rather than producing an empty/invalid
 *  identifier. The fallback is a parameter because this function now serves
 *  two callers whose empty-input answer differs: a brand theme id (`"brand"`,
 *  the default) and a workspace deck directory name (`"deck"`,
 *  `../cli/workspace.ts`). */
export function slugify(input: string, fallback = "brand"): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || fallback
}

/**
 * Extract a {@link BrandThemeFile} from raw OOXML package bytes (a
 * `.thmx`/`.potx`/`.pptx` file's own bytes — this function only ever reads
 * the theme part inside, nothing else in the package). Deterministic: the
 * same bytes always produce the same output (no randomness, no wall-clock
 * read) — required for this wave's fixture tests' double-run-equality
 * assertions.
 *
 * Throws {@link PptfastError} for two *structural* failures — data this
 * function has no reasonable default for:
 * - no theme part found in the package at all
 * - a theme part with no `dk1`/`lt1` (nothing to derive `bg`/`text` from) or
 *   no accent color at all (nothing to derive `primary`/`chartPalette` from)
 *
 * Everything else degrades gracefully rather than throwing — a missing
 * `lt2` falls back to `bg` (no distinct surface tone available), a missing
 * `accent1` falls back to `dk2` then to the first available chart color, a
 * missing font falls back to a Windows-safe generic stack — so a real-world
 * theme missing a slot or two (this wave's own fixture matrix covers
 * several) still produces a usable, if plainer, theme. A palette that
 * degrades all the way into unreadable territory (near-identical
 * text/bg/muted tones) is *not* rejected here — that's `registerTheme`'s
 * own `assertContrastFloor` (`./definitions.ts`) job, at load time, with a
 * message naming the actual failing token/ratio (see `brand-theme-file.ts`).
 */
export async function extractBrandTheme(
  bytes: Uint8Array | ArrayBuffer,
  opts: ExtractBrandThemeOptions = {},
): Promise<BrandThemeFile> {
  const zip = await JSZip.loadAsync(bytes)
  const part = await findThemePart(zip)
  if (!part) {
    throw new PptfastError(
      "no theme part found in this file — expected a .thmx/.potx/.pptx OOXML package with a ppt/theme/theme1.xml (or theme/theme/theme1.xml) part",
    )
  }
  const { schemeName, slots } = parseColors(part.xml)
  if (!slots.dk1 || !slots.lt1) {
    throw new PptfastError(`theme part ${part.path} is missing dk1/lt1 colors — cannot derive bg/text tokens`)
  }
  const chartPalette = ACCENT_SLOTS.map((slot) => slots[slot]).filter((c): c is string => c !== undefined)
  if (chartPalette.length === 0) {
    throw new PptfastError(`theme part ${part.path} has no accent colors — cannot derive a chart palette or primary color`)
  }

  const { bg, text } = resolveBgText(slots.dk1, slots.lt1)
  const surface = slots.lt2 ?? bg
  const primary = slots.accent1 ?? slots.dk2 ?? chartPalette[0]!
  const accent = slots.accent2 ?? primary
  const muted = deriveMuted(text, bg, surface)

  const fonts = parseFonts(part.xml)
  const heading = buildFontStack(fonts.major)
  const body = buildFontStack(fonts.minor ?? fonts.major)

  const label = opts.label ?? schemeName ?? "brand"
  const id = opts.id ?? slugify(opts.label ?? schemeName ?? "brand")

  const style: StyleTokens = {
    id,
    colors: { bg, surface, primary, accent, text, muted, chartPalette },
    fonts: { heading, body },
    defaultBackgrounds: {
      cover: { kind: "color", value: bg },
      chapter: { kind: "color", value: bg },
      content: { kind: "color", value: bg },
      ending: { kind: "color", value: bg },
    },
  }

  return { id, label, style, brand: {}, tags: [] }
}
