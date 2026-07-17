import type { MasterConfig } from "@/ir"
import type { ThemeTokens } from "./tokens"
import { CANONICAL_STYLE_IDS, THEME_TOKENS, resolveThemeId, type CanonicalStyleId } from "./index"

/** A style = distributable bundle: theme (tokens) + master (brand chrome) + affinity tags (filled in W4). */
export interface StyleDefinition {
  id: CanonicalStyleId
  theme: ThemeTokens
  master: MasterConfig
  tags: readonly string[]
}

const MASTERS: Partial<Record<CanonicalStyleId, MasterConfig>> = {
  enterprise: { suppressFooterOnCardContent: true },
  ink: { suppressFooterRule: true },
}

export const STYLE_DEFINITIONS: Record<CanonicalStyleId, StyleDefinition> = Object.fromEntries(
  CANONICAL_STYLE_IDS.map((id) => [
    id,
    { id, theme: THEME_TOKENS[id], master: MASTERS[id] ?? {}, tags: [] as const },
  ]),
) as unknown as Record<CanonicalStyleId, StyleDefinition>

/** Style master + optional IR-level override (shallow merge, override wins). */
export function resolveMaster(id: string, override?: MasterConfig): MasterConfig {
  const base = STYLE_DEFINITIONS[resolveThemeId(id)].master
  return override ? { ...base, ...override } : base
}
