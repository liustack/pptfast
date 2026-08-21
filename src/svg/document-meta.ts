import type { DeckChrome } from "@/ir"

/**
 * Confidentiality and date are document-grade chrome. They paint only when
 * the deck declared the read posture (`chrome: "full"`). Talk decks omit
 * the field, so those two stay off the canvas even if `meta` carries them.
 * Author, role, organization, version, and contact are unaffected.
 *
 * BrandChrome's content-page footer already only draws under `"full"`, so
 * it does not consult this helper.
 */
export function showsDocumentMeta(ir: { chrome?: DeckChrome }): boolean {
  return ir.chrome === "full"
}
