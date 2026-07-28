import type { StyleTokens } from "./tokens";

/**
 * pulse（医疗健康/生命科学）——2026-07-28 themes-16 wave task T1（第 14
 * 主题）。用户拍板方向：13 个内置主题里没有一个青绿清洁诊疗气质，覆盖
 * 体检报告/医院介绍/生物医药 BD 场景。极浅薄荷白底 + 深青绿主色 + 暖琥珀
 * 强调色，气质一句话：清洁、可信、生命力（.issues/2026-07-28-themes-16/
 * plan.md 裁定 1）。
 *
 * 校准记录（跑 full-matrix-contrast + colors.muted contrast 套件后按同色相
 * 调明度，先例：consulting muted #6C6C6C → #6B6B6B）：
 *   - muted #5A6E6A（青绿灰调，同色相非无关灰）：对 bg #F4F9F8 测得
 *     ~5.10:1，对 surface #FFFFFF 测得 ~5.42:1，双双清 4.5:1 正文门槛
 *     （`colors.muted contrast` 套件要求）。
 *   - text #10312E 对 bg/surface 分别 ~13.2:1/~14.0:1，primary #0E6E66 对 bg
 *     ~5.7:1——均远超门槛，无需再调。
 *   - chapter 底色取 primary（同 academic/consulting/classroom 先例），白字
 *     对 primary ~6.1:1，`readableOn` 自适应两墨取优后稳态可读。
 */
export const PULSE_TOKENS: StyleTokens = {
  id: "pulse",
  colors: {
    bg: "#F4F9F8", // 极浅薄荷白
    surface: "#FFFFFF",
    primary: "#0E6E66", // 深青绿
    accent: "#F4A259", // 暖琥珀
    text: "#10312E", // 墨青
    muted: "#5A6E6A", // 青绿灰调，校准记录见上方文件头注释
    border: "#D9E6E3", // 浅薄荷灰描边，同色相家族
    chartPalette: ["#0E6E66", "#F4A259", "#4FA8C9", "#B8AD98"], // 青绿/琥珀/天青/砂灰
  },
  // Microsoft YaHei first (not Segoe UI): resolveFontFace picks the first
  // SAFE_FONTS match, and only Georgia/Microsoft YaHei carry an exact
  // per-character width table (`hasExactWidthTable`, `src/lib/svg-text-
  // layout.ts`) — every other builtin's body face already resolves to one
  // of those two, and `definitions.test.ts`'s registerTheme console.warn
  // regression test pins that invariant across all builtins. Segoe UI stays
  // in the stack as the clean-sans flavor cue (brief's own example), just
  // not first.
  fonts: {
    heading: ["Microsoft YaHei", "Segoe UI", "Helvetica Neue", "Arial", "system-ui"],
    body: ["Microsoft YaHei", "Segoe UI", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: { radius: 8, gapScale: 1 }, // 圆润可亲（体检报告/诊所品牌的亲和感）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F4F9F8" },
    chapter: { kind: "color", value: "#0E6E66" },
    content: { kind: "color", value: "#F4F9F8" },
    ending: { kind: "color", value: "#F4F9F8" },
  },
};
