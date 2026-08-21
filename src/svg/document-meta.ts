import type { DeckChrome } from "@/ir"

/**
 * Confidentiality and date paint only when the deck wrote `"full"`. The
 * omitted default leaves those two off the canvas even if `meta` carries
 * them. Author, role, organization, version, and contact are unaffected.
 *
 * BrandChrome's content-page footer already only draws under `"full"`, so
 * it does not consult this helper.
 */
export function showsDocumentMeta(ir: { chrome?: DeckChrome }): boolean {
  return ir.chrome === "full"
}
