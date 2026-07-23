import type JSZip from "jszip"

/**
 * Deduplicate identical media parts in-place on an already-loaded `zip`.
 *
 * PptxGenJS writes one media file per addImage call (`image-<slide>-<n>.<ext>`)
 * and only dedups within a single slide — so a shared background image placed on
 * N slides is embedded N times, bloating the file. This collapses byte-identical
 * media into a single part and repoints every relationship at it (the OOXML-native
 * "one media part, many relationships" shape that PowerPoint itself produces).
 *
 * Returns whether anything actually changed. Originally split out from a
 * since-removed `dedupePptxMedia` Blob-in/Blob-out wrapper (package-audit
 * wave, task 1 — that wrapper opened its own fresh `JSZip.loadAsync` and
 * re-serialized on every call) so `generate.ts`'s final pipeline step could
 * run this same mutation against the one `JSZip.loadAsync` it already did
 * for the package-audit hard gate instead — spec §10.4's "reuse the patch
 * chain's own final loadAsync, don't re-unzip." The wrapper itself became
 * dead code once `generate.ts` switched to calling this function directly
 * (every remaining production reference was in a comment) and was removed
 * (carried-items wave, P0 T4 carried item) — this function is the one
 * surviving surface, and stays exactly as it was: not defensive itself (an
 * unexpected failure propagates), the same posture `generate.ts`'s own
 * try/catch around its call site already documents as deliberate.
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
