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
 * The 11 themes that are actually registered/renderable. 场景化命名
 * （2026-07-08）：对外 theme.id 按内容场景命名（consulting 商务咨询 /
 * academic 学术教育 / insight 深度洞察 / campaign 活力营销 / bloom 柔美庆典 / ink 水墨国风 / tech 科技产品 / magazine
 * 人文杂志 / luxe 高端品牌 / enterprise 企业蓝 / heritage 典藏传承），与 ops-kb 的
 * THEME_IDS（pptx_create）**和 PlanThemeId（pptx_plan）两处枚举**
 * lockstep——加/改主题两处都要动。2026-07-10：retail→luxe（黑金重定位）、
 * custom→gallery→avant（「自定义」失去意义，改为克莱因蓝先锋设计主题，
 * 同日 gallery v1 因底色/撞色弱二次返工为 avant）。
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

/**
 * Retired theme ids → their replacement. 两代退役 id：主题重设计一代
 * （ikb-swiss/anthropic-clay，tokens+templates 已硬删）与场景化改名一代
 * （风格名 mckinsey-navy 等，2026-07-08）。ops-kb 解析时会把 legacy id
 * 归一化成场景 id（新产出的 deck 一律场景 id），这张表兜底**已存库**的
 * 旧 generated_file 回放，与 ops-kb LEGACY_THEME_MAP lockstep。
 */
const LEGACY_THEME_MAP: Record<string, CanonicalThemeId> = {
  "mckinsey-navy": "consulting",
  "bcg-emerald": "academic",
  "editorial-dark": "insight",
  "bento-tech": "tech",
  "editorial-serif": "journal",
  // 2026-07-10 拆分收口：magazine 一天内短暂做过时尚主题 id，最终时尚主题
  // 定名 runway——存量 magazine deck 全是拆分前的人文观感，归 journal。
  magazine: "journal",
  "ikb-swiss": "tech",
  "anthropic-clay": "journal",
  // 2026-07-10 第三代退役：retail 黑金重定位改名 luxe，custom 改造为
  // gallery、同日二次返工为 avant（已存库的 retail/custom/gallery deck
  // 由此兜底回放）。
  retail: "luxe",
  custom: "enterprise",
  gallery: "enterprise",
  avant: "enterprise",
  // 2026-07-10：creative 改名 insight（深底红金=财经信息图气质），存量
  // creative deck 由此兜底。
  creative: "insight",
  // 2026-07-10：doodle 被砍（手绘精髓无法用 SVG 原语表达），孟菲斯几何接盘；
  // 2026-07-13 memphis 拆分为 campaign（活力笔刷）+bloom（水彩庆典），
  // memphis/doodle 存量 deck 统一兜底到 campaign（单跳查询，不链式）。
  doodle: "campaign",
  memphis: "campaign",
};

/** Map any theme id (legacy or current) onto a canonical, registered theme id. */
export function resolveThemeId(id: string): CanonicalThemeId {
  return LEGACY_THEME_MAP[id] ?? (id as CanonicalThemeId);
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
