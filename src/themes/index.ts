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
import { PULSE_TOKENS } from "./pulse";
import { TERRA_TOKENS } from "./terra";
import { EMBER_TOKENS } from "./ember";
import { VERMILION_TOKENS } from "./vermilion";
import { CRAYON_TOKENS } from "./crayon";
import { ARENA_TOKENS } from "./arena";
import { MUSEUM_TOKENS } from "./museum";
import { STAGE_TOKENS } from "./stage";
import { LECTURE_TOKENS } from "./lecture";

/**
 * The 22 canonical theme ids, registered/renderable（产品口径 21 套主题：
 * bloom 已并入 classroom 作纯换色 preset，id 因兼容保留）。场景化命名：对外 theme.id
 * 按内容场景命名（consulting Business Consulting / enterprise Enterprise /
 * academic Academic / insight Financial Insight / campaign Marketing Campaign /
 * bloom Soft Bloom / classroom Classroom / ink Ink Wash / tech Tech /
 * runway Fashion Runway / journal Editorial Journal / luxe Luxe /
 * heritage Heritage / pulse Health & Life Science——themes-16 wave task T1
 * 新增第 14 个 / terra Sustainability & ESG——themes-16 wave task T2 新增
 * 第 15 个 / ember Startup Pitch——themes-16 wave task T3 新增第 16 个 /
 * vermilion Official Report——gov-theme wave 新增第 17 个，庄重公务汇报语域，
 * 第一个从立项即以中文语域为主的主题 / crayon Kids Education——低龄教育
 * 蜡笔卡纸 / arena Esports & Entertainment——娱乐电竞·竞技场紫黑 /
 * museum Museum——博物·棕黑厅堂衬线铜金，2026-08-21 鹦鹉站气质立项 /
 * stage Keynote Stage——黑场·冷玄黑无框发布会演讲，2026-08-21 huashu 风格库
 * Top 5 第 3，结构身份 19 → 20 / lecture Lecture Hall——黑板夜校，2026-08-21
 * 大学/成人课程夜校板，结构身份 20 → 21）。pptfast 是独立分叉，无存量 deck
 * 兼容包袱，不维护 legacy id 映射表（resolveThemeId 对未知 id 一律回落
 * consulting）。
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
  "pulse",
  "terra",
  "ember",
  "vermilion",
  "crayon",
  "arena",
  "museum",
  "stage",
  "lecture",
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
  pulse: "Health & Life Science",
  terra: "Sustainability & ESG",
  ember: "Startup Pitch",
  vermilion: "Official Report",
  crayon: "Kids Education",
  arena: "Esports & Entertainment",
  museum: "Museum",
  stage: "Keynote Stage",
  lecture: "Lecture Hall",
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
  pulse: PULSE_TOKENS,
  terra: TERRA_TOKENS,
  ember: EMBER_TOKENS,
  vermilion: VERMILION_TOKENS,
  crayon: CRAYON_TOKENS,
  arena: ARENA_TOKENS,
  museum: MUSEUM_TOKENS,
  stage: STAGE_TOKENS,
  lecture: LECTURE_TOKENS,
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
