import type { StyleOverride } from "@/ir";
import { applyStyleOverride, type StyleTokens } from "./tokens";
import { REGISTERED_THEMES } from "./registered-themes";
import { CONSULTING_TOKENS } from "./consulting";
import { ENTERPRISE_TOKENS } from "./enterprise";
import { ACADEMIC_TOKENS } from "./academic";
import { INSIGHT_TOKENS } from "./insight";
import { CAMPAIGN_TOKENS } from "./campaign";
import { BLOOM_TOKENS } from "./bloom";
import { CLASSROOM_TOKENS } from "./classroom";
import { INK_TOKENS } from "./ink";
import { TECH_TOKENS } from "./tech";
import { RUNWAY_TOKENS } from "./runway";
import { JOURNAL_TOKENS } from "./journal";
import { LUXE_TOKENS } from "./luxe";
import { HERITAGE_TOKENS } from "./heritage";

/**
 * The 13 canonical themes, registered/renderable. 场景化命名：对外 theme.id
 * 按内容场景命名（consulting Business Consulting / enterprise Enterprise /
 * academic Academic / insight Financial Insight / campaign Marketing Campaign /
 * bloom Soft Bloom / classroom Classroom / ink Ink Wash / tech Tech /
 * runway Fashion Runway / journal Editorial Journal / luxe Luxe /
 * heritage Heritage）。pptfast 是独立分叉，无存量 deck 兼容包袱，不维护 legacy id
 * 映射表（resolveThemeId 对未知 id 一律回落 consulting）。
 */
export const CANONICAL_THEME_IDS = [
  "consulting",
  "enterprise",
  "academic",
  "insight",
  "campaign",
  "bloom",
  "classroom",
  "ink",
  "tech",
  "runway",
  "journal",
  "luxe",
  "heritage",
] as const;

export type CanonicalThemeId = (typeof CANONICAL_THEME_IDS)[number];

/** 场景 id → 英文场景名（plan 卡片徽章等对用户展示处用，接口统一英文）。 */
export const THEME_LABELS: Record<CanonicalThemeId, string> = {
  consulting: "Business Consulting",
  academic: "Academic",
  insight: "Financial Insight",
  campaign: "Marketing Campaign",
  bloom: "Soft Bloom",
  classroom: "Classroom",
  ink: "Ink Wash",
  tech: "Tech",
  runway: "Fashion Runway",
  journal: "Editorial Journal",
  enterprise: "Enterprise",
  luxe: "Luxe",
  heritage: "Heritage",
};

/** Map any theme id onto a canonical, registered theme id. Unknown ids fall back to consulting. */
export function resolveThemeId(id: string): CanonicalThemeId {
  return (CANONICAL_THEME_IDS as readonly string[]).includes(id)
    ? (id as CanonicalThemeId)
    : "consulting";
}

export const THEME_STYLES: Record<CanonicalThemeId, StyleTokens> = {
  consulting: CONSULTING_TOKENS,
  enterprise: ENTERPRISE_TOKENS,
  academic: ACADEMIC_TOKENS,
  insight: INSIGHT_TOKENS,
  campaign: CAMPAIGN_TOKENS,
  bloom: BLOOM_TOKENS,
  classroom: CLASSROOM_TOKENS,
  ink: INK_TOKENS,
  tech: TECH_TOKENS,
  runway: RUNWAY_TOKENS,
  journal: JOURNAL_TOKENS,
  luxe: LUXE_TOKENS,
  heritage: HERITAGE_TOKENS,
};

/**
 * Resolve a theme's style tokens: base tokens → deep `style` override.
 * A registered theme's own style tokens (see `themes/definitions.ts`'s
 * `registerTheme`) win over the builtin fallback — same "registered lookup
 * first, then builtin via resolveThemeId" precedence as that module's
 * `getThemeDefinition` (see `registered-themes.ts`'s docstring for why this
 * function reads that shared map directly instead of calling
 * `getThemeDefinition` itself).
 */
export function resolveStyle(id: string, override?: StyleOverride): StyleTokens {
  const base = REGISTERED_THEMES.get(id)?.style ?? THEME_STYLES[resolveThemeId(id)];
  if (!base) throw new Error(`Unknown theme id: ${id}`);
  return applyStyleOverride(base, override);
}

export type {
  StyleTokens,
  StyleColors,
  StyleFonts,
  LayoutType,
} from "./tokens";
export { applyStyleOverride } from "./tokens";
