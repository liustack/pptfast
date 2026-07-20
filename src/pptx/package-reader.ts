import type JSZip from "jszip"
import { getPlatform } from "../platform/registry"

/**
 * `PptxPackageReader` — internal, read-only OOXML package primitives (Audit
 * v2 spec §4.4). This is deliberately *not* a general PPTX object model:
 * spec §3.2/§8 rule out a PPTX importer/reader SDK surface, and §4.4 is
 * explicit that this only exposes the handful of stable primitives the
 * package-audit hard gate (`package-audit.ts`) needs — listing/checking
 * parts, parsing a part's XML, reading a part's relationships, and
 * resolving a relationship `Target` to a package-absolute part path.
 * Relationship path resolution, External-target detection, and XML
 * parse-error handling are centralized here so individual audit rules never
 * reimplement them (spec §4.4's own wording).
 *
 * Not exported from `src/index.ts`: the reader only ever sees the Blob this
 * generation chain just produced (threaded in as an already-loaded JSZip,
 * spec §10.4 — see `package-audit.ts`'s `auditPptxPackage`), never an
 * arbitrary caller-supplied PPTX.
 */

export interface PackageRelationship {
  id: string
  type: string
  target: string
  targetMode: "Internal" | "External"
}

export interface PptxPackageReader {
  /** Every non-directory part path in the package (e.g. `"ppt/slides/slide1.xml"`). */
  listParts(): string[]
  /** Whether `path` exists as a real (non-directory) part. */
  hasPart(path: string): boolean
  /**
   * Parse a part's content as XML. Throws when the part is missing, or when
   * parsing fails outright (no root element at all — e.g. empty content or
   * text that isn't XML-shaped in any way).
   *
   * **What this can't catch (empirically verified, not assumed):** the
   * `doc.querySelector("parsererror")` check `svg-audit.ts`/`deck-audit.ts`/
   * `serialize.ts` use for SVG parsing relies on a real browser (or jsdom,
   * which every vitest suite in this repo runs under by default) inserting a
   * `<parsererror>` node for malformed markup. linkedom — the parser this
   * reader actually runs under in the CLI/Node path (`installNodePlatform`)
   * — does not: probed directly against unclosed tags, mismatched tags,
   * truncated content, and an unescaped bare `&`, and linkedom silently
   * leniency-repairs every one of them (auto-closes, drops the mismatched
   * end tag, truncates at the last parseable point) with no `parsererror`
   * and no throw. So this method still checks for one (free, correct, and
   * load-bearing under a real browser DOMParser), but callers that need to
   * catch subtler corruption than "no root element survived at all" — e.g.
   * "is this actually a `<Types>` root, not some other tag" — must check the
   * parsed root themselves; `package-audit.ts`'s own rules do exactly that
   * for the parts where it matters (spec explicitly doesn't ask for full
   * ECMA-376 XSD validation — see spec §4.4's closing paragraph).
   */
  readXml(path: string): Promise<Document>
  /**
   * `sourcePart`'s own relationships, read from its OPC-conventional
   * `.rels` part (see `relsPathFor`). A part with no `.rels` file has no
   * relationships — returns `[]`, not an error (most parts, e.g. a theme or
   * a media file, never carry one).
   */
  readRelationships(sourcePart: string): Promise<PackageRelationship[]>
  /**
   * Resolve a relationship `Target` (as read off a `<Relationship>` from
   * `sourcePart`'s own `.rels` file) to a package-absolute part path, per
   * OPC's relative-reference convention: relative to `sourcePart`'s own
   * directory (`..`/`.` segments normalized away); a `Target` starting with
   * `/` is already package-root-absolute. Does not check whether the
   * resolved path actually exists — pair with `hasPart`.
   */
  resolveTarget(sourcePart: string, target: string): string
}

/** Split on `/`, drop empty/`.` segments, resolve `..` against what's been
 * seen so far. Shared by `resolveTarget` (relative-target resolution) and
 * part-path normalization — no Node `path` import (this module sits in
 * `src/index.ts`'s browser-safe closure, `docs/architecture.md`'s platform
 * seam rule), so this is the whole of what's needed rather than pulling in
 * a general path library for it. */
function normalizeZipPath(path: string): string {
  const out: string[] = []
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue
    if (seg === "..") {
      out.pop()
      continue
    }
    out.push(seg)
  }
  return out.join("/")
}

/** `"ppt/slides/slide1.xml"` → `"ppt/slides"`; `""` (package root) → `""`. */
function dirname(path: string): string {
  const idx = path.lastIndexOf("/")
  return idx === -1 ? "" : path.slice(0, idx)
}

/**
 * OPC's own `.rels` naming convention for the part that owns them: the part
 * name, prefixed with a `_rels/` sibling directory next to it — e.g.
 * `"ppt/slides/slide1.xml"` → `"ppt/slides/_rels/slide1.xml.rels"`; the
 * package root (`""`, whose own relationships live at `_rels/.rels`) is the
 * one case with an empty part *name* rather than an empty part *path*, which
 * is why this can't just be `dirname + "/_rels/" + basename`.
 */
function relsPathFor(sourcePart: string): string {
  const dir = dirname(sourcePart)
  const name = dir ? sourcePart.slice(dir.length + 1) : sourcePart
  return dir ? `${dir}/_rels/${name}.rels` : `_rels/${name}.rels`
}

function resolveTargetPath(sourcePart: string, target: string): string {
  if (target.startsWith("/")) return normalizeZipPath(target)
  const base = dirname(sourcePart)
  return normalizeZipPath(base ? `${base}/${target}` : target)
}

/** Wrap a pre-loaded `JSZip` (per spec §10.4, the patch chain's own final
 * `JSZip.loadAsync` — see `generate.ts`'s last step — threaded straight in,
 * never re-read from bytes) into a `PptxPackageReader`. */
export function createPptxPackageReader(zip: JSZip): PptxPackageReader {
  const xmlCache = new Map<string, Promise<Document>>()

  const hasPart = (path: string): boolean => {
    const entry = zip.files[normalizeZipPath(path)]
    return !!entry && !entry.dir
  }

  const readXml = (path: string): Promise<Document> => {
    const p = normalizeZipPath(path)
    const cached = xmlCache.get(p)
    if (cached) return cached
    const promise = (async (): Promise<Document> => {
      const entry = zip.files[p]
      if (!entry || entry.dir) {
        throw new Error(`pptx package: part not found: ${p}`)
      }
      const xml = await entry.async("string")
      const Parser = getPlatform().domParser ?? globalThis.DOMParser
      if (!Parser) {
        throw new Error(
          'DOMParser unavailable — in Node, call installNodePlatform() from "@liustack/pptfast/node" first (the pptfast CLI does this automatically)',
        )
      }
      const doc = new Parser().parseFromString(xml, "application/xml")
      // Real under a browser/jsdom DOMParser, a no-op under linkedom — see
      // this method's own doc comment for why both halves of this check
      // still earn their keep.
      const err = doc.querySelector("parsererror")
      if (err) throw new Error(`pptx package: failed to parse ${p} as XML: ${err.textContent ?? ""}`)
      if (!doc.documentElement) {
        throw new Error(`pptx package: ${p} did not parse to any XML root element`)
      }
      return doc
    })()
    xmlCache.set(p, promise)
    return promise
  }

  const readRelationships = async (sourcePart: string): Promise<PackageRelationship[]> => {
    const relsPath = relsPathFor(normalizeZipPath(sourcePart))
    if (!hasPart(relsPath)) return []
    const doc = await readXml(relsPath)
    const rels: PackageRelationship[] = []
    const nodes = doc.getElementsByTagName("Relationship")
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i]!
      rels.push({
        id: el.getAttribute("Id") ?? "",
        type: el.getAttribute("Type") ?? "",
        target: el.getAttribute("Target") ?? "",
        targetMode: el.getAttribute("TargetMode") === "External" ? "External" : "Internal",
      })
    }
    return rels
  }

  return {
    listParts: () => Object.keys(zip.files).filter((p) => !zip.files[p]!.dir),
    hasPart,
    readXml,
    readRelationships,
    resolveTarget: (sourcePart, target) => resolveTargetPath(normalizeZipPath(sourcePart), target),
  }
}
