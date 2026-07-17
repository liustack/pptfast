import type { BackgroundSpec, TokensOverride } from "@/ir";

export type LayoutType = "cover" | "chapter" | "content" | "ending";

export interface ThemeColors {
  bg: string;
  surface: string;
  panel?: string;
  primary: string;
  accent: string;
  text: string;
  muted: string;
  border?: string;
  chartPalette: string[];
  /**
   * Optional accent color pool for themes whose layout grammar cycles through
   * multiple accent colors (e.g. tech card corner stripes). Themes that
   * only use a single accent color can omit this.
   */
  accentPool?: string[];
  /**
   * Optional hairline stroke color for the shared "surface card" shells
   * (kpi_cards / icon_cards / callout — see blocks/kpi.tsx,
   * blocks/icon-cards.tsx, blocks/callout.tsx). Those block renderers are
   * shared across every theme and must stay theme-agnostic (no
   * `if (themeId === ...)` branching), so a theme that wants its cards
   * outlined sets this token instead — the renderers just consult it and add
   * a 1px stroke when it's defined. Omitted (`undefined`, the default) draws
   * no stroke, so every theme that doesn't set it keeps its current
   * fill-only card unchanged.
   */
  cardStroke?: string;
}

export interface ThemeFonts {
  heading: string[];
  body: string[];
  mono?: string[];
}

export interface ThemeTokens {
  id: string;
  allowCustomBackground?: boolean;
  colors: ThemeColors;
  fonts: ThemeFonts;
  shape?: ThemeShape;
  defaultBackgrounds: Record<LayoutType, BackgroundSpec>;
}

/**
 * 主题细节 shape token（2026-07-10 用户立项，spec：
 * .issues/specs/2026-07-10-pptx-theme-detail-tokens-design.md）。
 * 全部可选——缺省时各消费点沿用自己的 baked 值（零观感）。
 */
export interface ThemeShape {
  /** 卡片/横幅圆角 px（统一值）。缺省=各消费点原 baked 值（kpi 8/architecture 6/白卡 14 等）。 */
  radius?: number
  /** 块间距缩放（1=现 BLOCK_GAP）。建议范围 [0.8, 1.3]。 */
  gapScale?: number
}

export interface ThemeOverride {
  primary?: string;
  accent?: string;
  font_heading?: string[];
  font_body?: string[];
}

/**
 * Deep-partial brand override (v0.2, zod-validated as IR theme.tokens).
 * Applied after ThemeOverride — see themes/index.ts getTheme. Absent tokens
 * return the base reference untouched (zero observable change).
 */
export function applyTokensOverride(
  base: ThemeTokens,
  tokens?: TokensOverride,
): ThemeTokens {
  if (!tokens) return base;
  return {
    ...base,
    colors: { ...base.colors, ...tokens.colors },
    fonts: { ...base.fonts, ...tokens.fonts },
    shape: tokens.shape ? { ...base.shape, ...tokens.shape } : base.shape,
  };
}

export function applyOverride(
  base: ThemeTokens,
  override?: ThemeOverride,
): ThemeTokens {
  if (!override) return base;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: override.primary ?? base.colors.primary,
      accent: override.accent ?? base.colors.accent,
    },
    fonts: {
      ...base.fonts,
      heading: override.font_heading ?? base.fonts.heading,
      body: override.font_body ?? base.fonts.body,
    },
  };
}
