/**
 * Shared confidentiality label map.
 * Used by all v2 theme templates to render the confidentiality badge.
 * Public surface (rendered deck text) — English regardless of deck language,
 * same discipline as every other fixed-vocabulary label (`CONF_LABEL` and
 * the archetypes' "Contact"/"Chapter" labels).
 */
export const CONF_LABEL: Record<string, string> = {
  public: "Public",
  internal: "Internal",
  confidential: "Confidential",
  restricted: "Restricted",
}
