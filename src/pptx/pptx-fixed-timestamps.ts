import type JSZip from "jszip"

/**
 * Whole-file byte determinism (P0 hardening, Task 4 — D4 in the robustness
 * deep-review, scratchpad `dr/d-robustness.md` §3).
 *
 * Two independent sources of wall-clock nondeterminism in the export chain,
 * both traced to the same root cause — nothing in the chain ever tells
 * either library what time it is, so both default to "now":
 *
 * 1. jszip's `fileAdd` (`node_modules/jszip/lib/object.js`) does
 *    `o.date = o.date || new Date()` on every `zip.file(name, data)` call
 *    that omits a `date` option, and `ZipFileWorker`'s date/time bit-packing
 *    (`node_modules/jszip/lib/generate/ZipFileWorker.js`) writes that
 *    per-entry `date` into each zip local-file-header's DOS timestamp field
 *    at 2-second granularity. pptxgenjs's own `write()` — the very first zip
 *    write in the chain (`generate.ts`'s `pptx.write()`) — calls
 *    `zip.file()` for every single part (slides, layouts, masters, media,
 *    theme, core.xml, …) with no `date` option, so *every* entry in the raw
 *    pptxgenjs output already carries the real instant `pptx.write()` ran.
 *    `JSZip.loadAsync` then carries a loaded entry's `date` forward
 *    unchanged unless something re-`zip.file()`s that exact path (confirmed
 *    against `lib/load.js`'s `addFiles`: `date: input.date` on every
 *    re-added entry) — so a later patch stage (gradient fill, `a:ea`, slide
 *    transitions, element animations, media dedupe) that never touches a
 *    given part leaves its original pptxgenjs-authored timestamp intact all
 *    the way to the final `generateAsync()`. Patching only the chain's own
 *    `zip.file()` call sites would therefore still leave the vast majority
 *    of entries (every part no patch stage rewrites) carrying real time —
 *    the only seam that reaches *every* entry is a final pass over the
 *    fully-assembled zip, right before the last `generateAsync()`, which is
 *    what `normalizePptxTimestamps` below is.
 *
 * 2. pptxgenjs's own `makeXmlCore` bakes `new Date().toISOString()` (twice,
 *    stripped to whole seconds) into `docProps/core.xml`'s
 *    `<dcterms:created>`/`<dcterms:modified>` — the zip-entry-metadata-level
 *    fix above doesn't touch this, it needs its own text-content patch.
 *
 * Epoch choice — fixed, not IR-derived: an IR has no timestamp field to
 * derive from, and hashing IR content into a synthetic calendar date would
 * be actively misleading (a caller opening PowerPoint's File > Info sees a
 * plausible-looking but meaningless date with no relation to when the file
 * was actually produced — worse than an obviously-a-placeholder epoch).
 * A single fixed instant makes "same IR in, byte-identical .pptx out" a
 * true content-addressable invariant (dedupe/cache/CDN-diff friendly) for
 * *any* two calls, not just calls that happen to land in the same wall-clock
 * window — which is exactly the property this task exists to guarantee.
 * The real "when was this generated" provenance a caller archiving exports
 * might want isn't lost: it lives at the filesystem layer (the exported
 * file's own mtime), which this module never touches — only the *internal*
 * zip/OOXML metadata, which PowerPoint surfaces to a user far less
 * prominently than a filesystem timestamp, is pinned.
 *
 * `1980-01-01T00:00:00Z` specifically: the DOS/zip date format can't
 * represent anything before 1980 (`ZipFileWorker`'s `date.getUTCFullYear()
 * - 1980` bit-packs negative for an earlier year, corrupting the field), so
 * this is the earliest instant that round-trips cleanly — also the
 * conventional reproducible-build zip epoch (npm pack, Bazel, and others
 * pin to the same neighborhood for the same reason).
 */
export const FIXED_ZIP_DATE = new Date(Date.UTC(1980, 0, 1, 0, 0, 0))

/** `FIXED_ZIP_DATE` in the exact `W3CDTF` shape `makeXmlCore` writes (no
 *  milliseconds) — derived from `FIXED_ZIP_DATE` itself, not hand-typed
 *  alongside it, so the two can never drift apart. */
export const FIXED_ZIP_DATE_ISO = FIXED_ZIP_DATE.toISOString().replace(/\.\d{3}Z$/, "Z")

const CORE_XML_PATH = "docProps/core.xml"

/** Matches pptxgenjs's `makeXmlCore` output for either timestamp element —
 *  see this file's header comment for the exact source line. Captures the
 *  open/close tags so the fixed instant can be spliced in without
 *  hardcoding the `created`/`modified` element name twice. */
const CORE_TIMESTAMP_RE =
  /(<dcterms:(?:created|modified) xsi:type="dcterms:W3CDTF">)[^<]*(<\/dcterms:(?:created|modified)>)/g

/**
 * Final normalization pass for the export chain: pin every zip entry's
 * local-file-header date to `FIXED_ZIP_DATE`, and pin `docProps/core.xml`'s
 * `<dcterms:created>`/`<dcterms:modified>` text to `FIXED_ZIP_DATE_ISO`.
 *
 * Must run on the fully-assembled zip, immediately before the chain's own
 * final `generateAsync()` — anything upstream of this call is irrelevant to
 * the output (this pass unconditionally overwrites every entry's `.date`,
 * so it doesn't matter whether an earlier patch stage set one or not).
 * Mutates `zip` in place, matching this file's siblings
 * (`applyGradientFills`/`applySlideTransitions`/`dedupeMediaInZip`'s
 * "open, rewrite parts, caller re-zips" shape) rather than returning a new
 * `Blob` itself — `generate.ts` already owns the one call to
 * `generateAsync()` that follows.
 */
export async function normalizePptxTimestamps(zip: JSZip): Promise<void> {
  const core = zip.file(CORE_XML_PATH)
  if (core) {
    const xml = await core.async("string")
    const patched = xml.replace(CORE_TIMESTAMP_RE, `$1${FIXED_ZIP_DATE_ISO}$2`)
    zip.file(CORE_XML_PATH, patched, { date: FIXED_ZIP_DATE })
  }
  // `ZipFileWorker` reads `file.date` fresh at generate time (`generate/
  // index.js`'s `zip.forEach` closure captures `date = file.date` per
  // entry right before compressing), so mutating each `ZipObject`'s public
  // `.date` property in place is picked up correctly by the caller's
  // subsequent `generateAsync()` without needing to re-add any entry's
  // content.
  for (const path of Object.keys(zip.files)) {
    zip.files[path]!.date = FIXED_ZIP_DATE
  }
}
