/**
 * Programmatic OOXML theme-part zip builder for brand-extraction tests
 * (brand-extract wave, 裁定 5: **never commit a real Microsoft theme file**
 * — copyright — so every fixture this wave's tests use is built here, in
 * code, from a minimal hand-written `<a:theme>` XML string wrapped in a
 * JSZip package). Not test-only despite living under `__fixtures__/` (same
 * convention `themes/__fixtures__/pre-wave-undeclared-layout-sequences.json`
 * already established for this directory): `src/themes/brand-extract.test.ts`
 * and `src/themes/brand-theme-file.test.ts` both import it, and
 * `src/cli/commands.test.ts`'s `pptfast brand extract` CLI-level tests reuse
 * it too, so a fixture only needs describing once.
 *
 * Deliberately reproduces just enough of a real `.thmx`/`.pptx`/`.potx`
 * theme part for {@link extractBrandTheme}'s regex-based parser to exercise
 * — a `<a:clrScheme>` with the 12 documented slots and a `<a:fontScheme>`
 * with major/minor `<a:latin>` faces — not a full OOXML package (no
 * `[Content_Types].xml` relationships, no slide master). The extractor never
 * reads anything else, so nothing else needs to be real.
 */
import JSZip from "jszip"

export interface ThmxColorSlots {
  dk1?: string
  lt1?: string
  dk2?: string
  lt2?: string
  accent1?: string
  accent2?: string
  accent3?: string
  accent4?: string
  accent5?: string
  accent6?: string
  hlink?: string
  folHlink?: string
}

/** A realistic, fully-populated light-theme palette (Office's own default
 *  "Office" theme color values) — the sane baseline every test starts from
 *  and overrides just the slot(s) it cares about. */
export const DEFAULT_THMX_COLORS: Required<ThmxColorSlots> = {
  dk1: "000000",
  lt1: "FFFFFF",
  dk2: "44546A",
  lt2: "E7E6E6",
  accent1: "4472C4",
  accent2: "ED7D31",
  accent3: "A5A5A5",
  accent4: "FFC000",
  accent5: "5B9BD5",
  accent6: "70AD47",
  hlink: "0563C1",
  folHlink: "954F72",
}

/** A deliberately near-monochrome palette (裁定 5's "病态色值" fixture): dk1/
 *  lt1/accent1 are all close-together mid-grays, so no muted derivation step
 *  can ever clear even the 3.0:1 registration floor — the guaranteed-failing
 *  fixture `registerBrandThemeFile`'s contrast-floor test loads. */
export const PATHOLOGICAL_THMX_COLORS: Required<ThmxColorSlots> = {
  dk1: "808080",
  lt1: "868686",
  dk2: "7E7E7E",
  lt2: "888888",
  accent1: "838383",
  accent2: "858585",
  accent3: "818181",
  accent4: "878787",
  accent5: "808080",
  accent6: "858585",
  hlink: "808080",
  folHlink: "808080",
}

export interface BuildThemeXmlOptions {
  schemeName?: string
  /** Explicit slot set — no merging with a default palette, so a sparse
   *  object (e.g. only `dk1`/`lt1`/`accent1`) is a deliberate "missing
   *  slots" fixture, not an accident of a spread that can't un-set a key.
   *  Omitted entirely falls back to {@link DEFAULT_THMX_COLORS}. */
  colors?: ThmxColorSlots
  /** Real Office theme files declare `dk1`/`lt1` via `<a:sysClr
   *  val="windowText|window" lastClr="…"/>` (the two "auto" slots) rather
   *  than `<a:srgbClr>` — probe.py's own regex matches both forms; this
   *  flag exercises that second form so the fixture matrix covers it too. */
  useSysClrForDkLt?: boolean
  fontSchemeName?: string
  /** `undefined` omits the whole `<a:majorFont>`/`<a:minorFont>` typeface
   *  attribute (empty string) — the "no usable font declared" fixture. */
  majorFont?: string | undefined
  minorFont?: string | undefined
}

const CLR_SLOT_ORDER: (keyof ThmxColorSlots)[] = [
  "dk1",
  "lt1",
  "dk2",
  "lt2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
]

function clrTag(slot: keyof ThmxColorSlots, hex: string | undefined, useSysClr: boolean): string {
  if (hex === undefined) return ""
  if (useSysClr && (slot === "dk1" || slot === "lt1")) {
    const sysVal = slot === "dk1" ? "windowText" : "window"
    return `<a:${slot}><a:sysClr val="${sysVal}" lastClr="${hex}"/></a:${slot}>`
  }
  return `<a:${slot}><a:srgbClr val="${hex}"/></a:${slot}>`
}

/** Builds just the `<a:theme>` XML string — exported separately from
 *  {@link buildThmxBytes} so a test can assert against the raw markup (e.g.
 *  the `themeVariants`-path-exclusion regex) without round-tripping through
 *  a zip. */
export function buildThemeXml(opts: BuildThemeXmlOptions = {}): string {
  const colors = opts.colors ?? DEFAULT_THMX_COLORS
  const schemeName = opts.schemeName ?? "Office"
  const clrBody = CLR_SLOT_ORDER.map((slot) => clrTag(slot, colors[slot], opts.useSysClrForDkLt ?? false)).join("")
  const fontSchemeName = opts.fontSchemeName ?? "Office"
  const majorTag = opts.majorFont === undefined ? "" : `<a:latin typeface="${opts.majorFont}"/>`
  const minorTag = opts.minorFont === undefined ? "" : `<a:latin typeface="${opts.minorFont}"/>`
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${schemeName} Theme">`,
    `  <a:themeElements>`,
    `    <a:clrScheme name="${schemeName}">${clrBody}</a:clrScheme>`,
    `    <a:fontScheme name="${fontSchemeName}">`,
    `      <a:majorFont>${majorTag}<a:ea typeface=""/><a:cs typeface=""/></a:majorFont>`,
    `      <a:minorFont>${minorTag}<a:ea typeface=""/><a:cs typeface=""/></a:minorFont>`,
    `    </a:fontScheme>`,
    `    <a:fmtScheme name="Office"/>`,
    `  </a:themeElements>`,
    `</a:theme>`,
  ].join("\n")
}

export interface BuildThmxBytesOptions extends BuildThemeXmlOptions {
  /** Zip entry path for the theme part — default `"ppt/theme/theme1.xml"`
   *  (the `.pptx`/`.potx` layout; a real `.thmx` uses
   *  `"theme/theme/theme1.xml"` instead — probe.py's own doc comment). */
  themePartPath?: string
  /** Extra zip entries the extractor must ignore/skip past — e.g. a
   *  `themeVariants` sibling with a *different* palette, proving the
   *  path-exclusion regex (not just candidate-length sorting) is what picks
   *  the real part. */
  extraEntries?: Record<string, string>
}

/** Wraps {@link buildThemeXml} in a minimal zip package — a programmatic
 *  stand-in for a real `.thmx`/`.potx`/`.pptx` file, per 裁定 5. */
export async function buildThmxBytes(opts: BuildThmxBytesOptions = {}): Promise<Uint8Array> {
  const zip = new JSZip()
  const themePath = opts.themePartPath ?? "ppt/theme/theme1.xml"
  zip.file(themePath, buildThemeXml(opts))
  for (const [path, content] of Object.entries(opts.extraEntries ?? {})) {
    zip.file(path, content)
  }
  return zip.generateAsync({ type: "uint8array" })
}
