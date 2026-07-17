import type { BrandConfig } from "@/ir"
import type { StyleTokens } from "./tokens"
import { CANONICAL_THEME_IDS, THEME_STYLES, resolveThemeId, type CanonicalThemeId } from "./index"

/** A theme = distributable bundle: `theme` (style tokens) + `master` (brand chrome) + affinity tags (filled in W4). */
export interface ThemeDefinition {
  id: CanonicalThemeId
  theme: StyleTokens
  master: BrandConfig
  tags: readonly string[]
}

const MASTERS: Partial<Record<CanonicalThemeId, BrandConfig>> = {
  enterprise: { suppressFooterOnCardContent: true },
  ink: { suppressFooterRule: true },
}

export const THEME_DEFINITIONS: Record<CanonicalThemeId, ThemeDefinition> = Object.fromEntries(
  CANONICAL_THEME_IDS.map((id) => [
    id,
    { id, theme: THEME_STYLES[id], master: MASTERS[id] ?? {}, tags: [] as const },
  ]),
) as unknown as Record<CanonicalThemeId, ThemeDefinition>

/** Theme brand config + optional IR-level override (shallow merge, override wins). */
export function resolveBrand(id: string, override?: BrandConfig): BrandConfig {
  const base = THEME_DEFINITIONS[resolveThemeId(id)].master
  return override ? { ...base, ...override } : base
}
