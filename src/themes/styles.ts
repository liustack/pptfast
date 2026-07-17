import type { MasterConfig } from "@/ir"
import type { ThemeTokens } from "./tokens"
import { CANONICAL_THEME_IDS, THEME_TOKENS, resolveThemeId, type CanonicalThemeId } from "./index"

/** A style = distributable bundle: theme (tokens) + master (brand chrome) + affinity tags (filled in W4). */
export interface StyleDefinition {
  id: CanonicalThemeId
  theme: ThemeTokens
  master: MasterConfig
  tags: readonly string[]
}

const MASTERS: Partial<Record<CanonicalThemeId, MasterConfig>> = {
  enterprise: { suppressFooterOnCardContent: true },
  ink: { suppressFooterRule: true },
}

export const STYLE_DEFINITIONS: Record<CanonicalThemeId, StyleDefinition> = Object.fromEntries(
  CANONICAL_THEME_IDS.map((id) => [
    id,
    { id, theme: THEME_TOKENS[id], master: MASTERS[id] ?? {}, tags: [] as const },
  ]),
) as unknown as Record<CanonicalThemeId, StyleDefinition>

/** Style master + optional IR-level override (shallow merge, override wins). */
export function resolveMaster(id: string, override?: MasterConfig): MasterConfig {
  const base = STYLE_DEFINITIONS[resolveThemeId(id)].master
  return override ? { ...base, ...override } : base
}
