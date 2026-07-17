import type { BackgroundSpec, StyleOverride } from "@/ir";

export type LayoutType = "cover" | "chapter" | "content" | "ending";

export interface StyleColors {
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
   * (kpi_cards / icon_cards / callout — see components/kpi.tsx,
   * components/icon-cards.tsx, components/callout.tsx). Those component renderers are
   * shared across every theme and must stay theme-agnostic (no
   * `if (themeId === ...)` branching), so a theme that wants its cards
   * outlined sets this token instead — the renderers just consult it and add
   * a 1px stroke when it's defined. Omitted (`undefined`, the default) draws
   * no stroke, so every theme that doesn't set it keeps its current
   * fill-only card unchanged.
   */
  cardStroke?: string;
}

export interface StyleFonts {
  heading: string[];
  body: string[];
  mono?: string[];
}

export interface StyleTokens {
  id: string;
  allowCustomBackground?: boolean;
  colors: StyleColors;
  fonts: StyleFonts;
  shape?: StyleShape;
  defaultBackgrounds: Record<LayoutType, BackgroundSpec>;
}

/**
 * 主题细节 shape token（2026-07-10 用户立项，spec：
 * .issues/specs/2026-07-10-pptx-theme-detail-tokens-design.md）。
 * 全部可选——缺省时各消费点沿用自己的 baked 值（零观感）。
 */
export interface StyleShape {
  /** 卡片/横幅圆角 px（统一值）。缺省=各消费点原 baked 值（kpi 8/architecture 6/白卡 14 等）。 */
  radius?: number
  /** 块间距缩放（1=现 BLOCK_GAP）。建议范围 [0.8, 1.3]。 */
  gapScale?: number
}

/**
 * Deep-partial style override (zod-validated as IR theme.style — see
 * ir/index.ts StyleOverrideSchema). See themes/index.ts resolveStyle. Absent
 * override returns the base reference untouched (zero observable change).
 */
export function applyStyleOverride(
  base: StyleTokens,
  override?: StyleOverride,
): StyleTokens {
  if (!override) return base;
  return {
    ...base,
    colors: { ...base.colors, ...override.colors },
    fonts: { ...base.fonts, ...override.fonts },
    shape: override.shape ? { ...base.shape, ...override.shape } : base.shape,
  };
}
