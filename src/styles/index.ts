import type { TokensOverride } from "@/ir";
import { applyTokensOverride, type ThemeTokens } from "./tokens";
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
export const CANONICAL_STYLE_IDS = [
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

export type CanonicalStyleId = (typeof CANONICAL_STYLE_IDS)[number];

/** 场景 id → 英文场景名（plan 卡片徽章等对用户展示处用，接口统一英文）。 */
export const STYLE_LABELS: Record<CanonicalStyleId, string> = {
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
export function resolveThemeId(id: string): CanonicalStyleId {
  return (CANONICAL_STYLE_IDS as readonly string[]).includes(id)
    ? (id as CanonicalStyleId)
    : "consulting";
}

export const THEME_TOKENS: Record<CanonicalStyleId, ThemeTokens> = {
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

/** Resolve a style's theme tokens: base tokens → deep `tokens` override. */
export function getTheme(id: string, tokens?: TokensOverride): ThemeTokens {
  const base = THEME_TOKENS[resolveThemeId(id)];
  if (!base) throw new Error(`Unknown style id: ${id}`);
  return applyTokensOverride(base, tokens);
}

export type {
  ThemeTokens,
  ThemeColors,
  ThemeFonts,
  LayoutType,
} from "./tokens";
export { applyTokensOverride } from "./tokens";
