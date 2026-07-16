import {
  applyOverride,
  type ThemeOverride,
  type ThemeTokens,
} from "./tokens";
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
 * 按内容场景命名（consulting 商务咨询 / enterprise 企业蓝 / academic 学术教育 /
 * insight 深度洞察 / campaign 活力营销 / bloom 柔美庆典 / classroom 教学课堂 /
 * ink 水墨国风 / tech 科技产品 / runway 时尚秀场 / journal 人文期刊 / luxe 高端品牌 /
 * heritage 典藏传承）。pptfast 是独立分叉，无存量 deck 兼容包袱，不维护 legacy id
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

/** 场景 id → 中文场景名（plan 卡片徽章等对用户展示处用）。 */
export const THEME_LABELS: Record<CanonicalThemeId, string> = {
  consulting: "商务咨询",
  academic: "学术教育",
  insight: "深度洞察",
  campaign: "活力营销",
  bloom: "柔美庆典",
  classroom: "教学课堂",
  ink: "水墨国风",
  tech: "科技产品",
  runway: "时尚秀场",
  journal: "人文期刊",
  enterprise: "企业蓝",
  luxe: "高端品牌",
  heritage: "典藏传承",
};

/** Map any theme id onto a canonical, registered theme id. Unknown ids fall back to consulting. */
export function resolveThemeId(id: string): CanonicalThemeId {
  return (CANONICAL_THEME_IDS as readonly string[]).includes(id)
    ? (id as CanonicalThemeId)
    : "consulting";
}

export const THEME_TOKENS: Record<CanonicalThemeId, ThemeTokens> = {
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

export function getTheme(
  id: string,
  override?: ThemeOverride,
): ThemeTokens {
  const base = THEME_TOKENS[resolveThemeId(id)];
  if (!base) throw new Error(`Unknown theme id: ${id}`);
  return applyOverride(base, override);
}

export type {
  ThemeTokens,
  ThemeColors,
  ThemeFonts,
  ThemeOverride,
  LayoutType,
} from "./tokens";
export { applyOverride } from "./tokens";
