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
  /**
   * Optional semantic-role colors — the "this is an error", "this is a
   * caution", "this is a good result" trio that shared component renderers
   * used to bake in as literal hexes (`callout`'s warn rule and icon in
   * components/callout.tsx, `kpi_cards`' delta arrow in components/kpi.tsx).
   * Same reasoning as `cardStroke` above: those renderers are shared across
   * every theme and must stay theme-agnostic (no `if (themeId === ...)`
   * branching), so a theme that wants its own red or green sets these tokens
   * and the renderers read them through `resolveSemanticColor`
   * (`src/svg/ink.ts`), which owns the fallback order.
   *
   * All three are optional on the type, and an omitted role resolves to
   * exactly the hex its renderers baked in before this channel existed —
   * `#DC2626` for `danger`, `#16A34A` for `success`, and `warning` follows
   * whatever `danger` resolves to. So a theme that sets none of them renders
   * byte-for-byte as it did before the tokens were added.
   *
   * Every one of the 21 built-in themes does set all three (visual review
   * round 4 ruled that the alert color must belong to the theme's own
   * palette, not be one universal red), so in practice only a `--theme-file`
   * brand theme reaches the fallbacks. `danger` and `success` are calibrated
   * to clear 4.5:1 on their own theme's `surface` — they render as the kpi
   * delta arrow's *text*, which `accessibleInk` would otherwise demote to
   * neutral ink — while `warning` only has to clear the 3:1 non-text floor,
   * since `callout` paints it as a rule and an icon. Both floors are pinned
   * in `svg/audit/full-matrix-contrast.test.ts`.
   */
  danger?: string;
  warning?: string;
  success?: string;
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
  /**
   * Heading and display size multiplier. Applied to the layout's designed
   * max size *before* heading-fit shrinks to the box (`fitHeadingLines` /
   * `fitHeadingPt`, `src/svg/heading-fit.ts`). Body, meta, kicker, and
   * footnote sizes are untouched. Omit (or `1`) for a byte-identical no-op.
   * Fit still owns the floor: `minPt` is not scaled, so a long title still
   * shrinks instead of overflowing. Suggested range `[0.8, 1.6]`.
   */
  typeScale?: number
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
