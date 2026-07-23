import type JSZip from "jszip"
import { PptfastError } from "../errors"

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
 * A `normalizePptxTimestamps` ordering-contract violation — either half:
 * something mutated a zip after it was sealed, or `generateAsync()` was
 * reached through `finalizePptxZip` without ever sealing it (carried-items
 * wave, fix round — review finding F1).
 *
 * Deliberately its own subclass, not a bare `throw new PptfastError(...)`:
 * `generate.ts`'s call site for `dedupeMediaInZip` already wraps that call
 * in a broad, intentionally-forgiving `try/catch` (documented since
 * 85ebc1e, "a media-dedupe failure is not a reason to abandon export" — a
 * *genuine* dedupe failure, bad media bytes or malformed `.rels` XML, is
 * meant to be swallowed there and left for `auditPptxPackage` to catch
 * under its own name if it left real corruption behind). A seal violation
 * is not that: it means this call is running at the *wrong point in the
 * pipeline entirely* — reordered to run after `normalizePptxTimestamps`
 * sealed the zip — a programming-invariant failure the original catch was
 * never written to anticipate and must not silently absorb. Still an
 * `instanceof PptfastError` (extends it), so anything already catching that
 * broader class unconditionally elsewhere is unaffected — only a call site
 * that specifically checks `instanceof PptxSealViolationError` before its
 * own catch (see `generate.ts`'s own such check) can tell the two apart.
 */
export class PptxSealViolationError extends PptfastError {}

/**
 * Zip instances `normalizePptxTimestamps` has already run on (carried-items
 * wave — P0 T4 carried: "must run last" was convention only, enforced by
 * nothing). A `WeakSet` keyed on the zip object itself, not a boolean flag
 * anywhere on `JSZip` — this file never touches the `jszip` package itself,
 * so a per-instance side table is the only way to remember "this exact zip
 * was normalized" without monkeypatching the class.
 */
const sealedZips = new WeakSet<JSZip>()

function throwSealedViolation(method: string): never {
  throw new PptxSealViolationError(
    `pptx export invariant violated: "${method}" was called on a JSZip package after normalizePptxTimestamps had already run on it. normalizePptxTimestamps must be the last patch applied before generateAsync() (see its own doc comment, pptx-fixed-timestamps.ts) — move this call ahead of normalizePptxTimestamps in generate.ts's patch chain, or fold its mutation into normalizePptxTimestamps itself`,
  )
}

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
 *
 * Runtime seal (carried-items wave, P0 T4 carried item — judged more
 * robust than a source-order-parsing test alone, see this task's own
 * report for the comparison): once this function's own work is done, it
 * overrides `zip`'s `file`/`folder`/`remove` methods — the only mutating
 * surface any patch stage in this pipeline actually calls (`dedupeMediaInZip`
 * uses `.file()`/`.remove()`, the earlier Blob-in/Blob-out patches
 * (`applyGradientFills`/`applyEaFontFaces`/`applySlideTransitions`/
 * `applyElementAnimations`) each do their own independent `JSZip.loadAsync`
 * on a different object entirely, never touching this one) — on *this one
 * instance only*, never `JSZip.prototype`, so no other zip anywhere in the
 * process (including a concurrent `generatePptx` call) is affected. A call
 * to any of the three after this point throws immediately, loudly, at the
 * exact call site that violated the ordering — whether that call moved
 * here because `normalizePptxTimestamps` itself got reordered earlier (so
 * something that used to run *before* it now runs *after*) or because a
 * brand-new patch stage got inserted after it. `finalizePptxZip` below is
 * the only sanctioned way to reach `generateAsync()` on a sealed zip — it
 * throws if called on a zip this function never ran on, closing the other
 * half of the contract ("must run", not just "must run last").
 *
 * Read access (`zip.file(path)` with no write, `zip.files`) is deliberately
 * *not* guarded — nothing downstream of this call currently reads the zip
 * (`finalizePptxZip` only serializes it), and this function's own header
 * comment already establishes the contract as "nothing else touches this
 * zip," not just "nothing else mutates it," but a hard boundary on writes
 * is the one that actually protects the determinism invariant this file
 * exists for, and is the one every real call site in this pipeline would
 * trip if reordered.
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
  // Seal — see this function's own doc comment above. `generateAsync`
  // itself never calls `.file`/`.folder`/`.remove` internally (verified
  // against jszip 3.10.1's own source: `generateAsync` → `generateInternalStream`
  // → `generate.generateWorker` → `zip.forEach`, a read-only iteration over
  // `zip.files` that never touches these three), so overriding them here
  // cannot break the one call this pipeline is still allowed to make.
  zip.file = (() => throwSealedViolation("file")) as JSZip["file"]
  zip.folder = (() => throwSealedViolation("folder")) as JSZip["folder"]
  zip.remove = (() => throwSealedViolation("remove")) as JSZip["remove"]
  sealedZips.add(zip)
}

/**
 * The one sanctioned way to reach `generateAsync()` on the export
 * pipeline's zip (carried-items wave). Throws (`PptxSealViolationError`,
 * same invariant class as the seal itself) if `normalizePptxTimestamps`
 * never ran on this exact zip instance — catching the "forgot to call it
 * at all" case the seal above can't catch on its own (a skipped call
 * leaves the zip unsealed, not mutated-after-sealing). `generate.ts` calls
 * this instead of `zip.generateAsync(...)` directly, so both halves of the
 * "must run last" contract (must run, and nothing may follow it) are
 * enforced at the one call site that would otherwise silently reintroduce
 * wall-clock nondeterminism.
 *
 * Narrowed to the `"arraybuffer"` output type rather than forwarding
 * jszip's own `generateAsync<T>` generic — `generate.ts` is the only real
 * caller and always asks for `arraybuffer` (a clean `Blob` in Node, jsdom,
 * and the browser alike). jszip's own `OutputByType` map that a forwarded
 * generic would need to index into is a file-local type in jszip's `.d.ts`
 * (no `export` keyword, unreachable from outside that file even via the
 * `JSZip` namespace), so genericizing this wrapper would need a type this
 * package cannot actually name.
 */
export async function finalizePptxZip(
  zip: JSZip,
  options: JSZip.JSZipGeneratorOptions<"arraybuffer">,
): Promise<ArrayBuffer> {
  if (!sealedZips.has(zip)) {
    throw new PptxSealViolationError(
      "pptx export invariant violated: generateAsync() was reached without normalizePptxTimestamps having run on this zip first — call normalizePptxTimestamps(zip) immediately before finalizePptxZip(zip, options) (see normalizePptxTimestamps's own doc comment, pptx-fixed-timestamps.ts)",
    )
  }
  return zip.generateAsync(options)
}
