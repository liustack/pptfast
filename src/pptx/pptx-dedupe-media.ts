import JSZip from "jszip"

/**
 * Deduplicate identical media parts in-place on an already-loaded `zip`.
 *
 * PptxGenJS writes one media file per addImage call (`image-<slide>-<n>.<ext>`)
 * and only dedups within a single slide — so a shared background image placed on
 * N slides is embedded N times, bloating the file. This collapses byte-identical
 * media into a single part and repoints every relationship at it (the OOXML-native
 * "one media part, many relationships" shape that PowerPoint itself produces).
 *
 * Returns whether anything actually changed. Split out from `dedupePptxMedia`
 * below (package-audit wave, task 1) so `generate.ts`'s final pipeline step can
 * run this same mutation against the one `JSZip.loadAsync` it already did for
 * the package-audit hard gate, instead of `dedupePptxMedia` doing its own
 * second load — spec §10.4's "reuse the patch chain's own final loadAsync,
 * don't re-unzip." Not defensive itself (an unexpected failure propagates) —
 * `dedupePptxMedia`'s own try/catch below is the one place that still needs
 * to swallow a bad/mock zip, so it stays there rather than moving in here.
 */
export async function dedupeMediaInZip(zip: JSZip): Promise<boolean> {
  const mediaFiles = Object.keys(zip.files).filter(
    (p) => p.startsWith("ppt/media/") && !zip.files[p].dir,
  )
  if (mediaFiles.length < 2) return false

  // 1. Hash each media part; map duplicate filenames → canonical filename.
  const byKey = new Map<string, string>() // content key → canonical path
  const remap = new Map<string, string>() // dupe basename → canonical basename
  for (const path of mediaFiles) {
    const bytes = await zip.files[path].async("uint8array")
    const key = `${bytes.length}:${fnv1a(bytes)}`
    const canonical = byKey.get(key)
    if (canonical === undefined) byKey.set(key, path)
    else if (canonical !== path) remap.set(base(path), base(canonical))
  }
  if (remap.size === 0) return false

  // 2. Repoint every relationship Target at the canonical media file.
  const relsFiles = Object.keys(zip.files).filter(
    (p) => p.endsWith(".rels") && !zip.files[p].dir,
  )
  for (const path of relsFiles) {
    let xml = await zip.files[path].async("string")
    let changed = false
    for (const [dupe, canonical] of remap) {
      if (xml.includes(dupe)) {
        xml = xml.split(dupe).join(canonical)
        changed = true
      }
    }
    if (changed) zip.file(path, xml)
  }

  // 3. Remove the now-unreferenced duplicate media parts.
  for (const path of mediaFiles) {
    if (remap.has(base(path))) zip.remove(path)
  }

  return true
}

/**
 * Standalone `Blob → Blob` form of {@link dedupeMediaInZip}: loads, dedupes,
 * and re-serializes on its own.
 *
 * Defensive: any failure (e.g. a non-zip blob from a test mock) returns the
 * input unchanged so export never breaks. `generate.ts`'s pipeline no longer
 * calls this directly (see {@link dedupeMediaInZip}'s doc comment) — it stays
 * exported for the tests that exercise this exact contract in isolation.
 */
export async function dedupePptxMedia(blob: Blob): Promise<Blob> {
  try {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const changed = await dedupeMediaInZip(zip)
    if (!changed) return blob

    // arraybuffer (not "blob") so this works in browser, jsdom and Node alike,
    // and is a clean BlobPart.
    const ab = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })
    return new Blob([ab], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    })
  } catch {
    return blob
  }
}

function base(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1)
}

/** FNV-1a 32-bit over bytes; paired with byte length as the dedup key. */
function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}
