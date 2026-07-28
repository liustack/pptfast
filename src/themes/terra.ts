import type { StyleTokens } from "./tokens";

/**
 * terra（可持续/ESG/大地色）——2026-07-28 themes-16 wave task T2（第 15
 * 主题）。用户拍板方向：13 个内置主题里没有大地色系，ESG 年报是企业刚需
 * 场景（.issues/2026-07-28-themes-16/plan.md 场景空档论证）。沙色底 +
 * 橄榄绿主色 + 陶土强调色，气质一句话：朴素、根系、长期主义（plan 裁定 1）。
 *
 * 校准记录（跑 full-matrix-contrast + colors.muted contrast 套件后按同色相
 * 调明度，先例：consulting muted #6C6C6C → #6B6B6B、pulse muted #5A6E6A）：
 *   - muted #6B6555（橄榄灰调，同色相非无关灰）：对 bg #F5F1E8 测得
 *     ~5.15:1，对 surface #FBF8F1 测得 ~5.47:1，双双清 4.5:1 正文门槛
 *     （`colors.muted contrast` 套件要求，起点即达标，无需二次校准）。
 *   - text #2E2A21 对 bg/surface 分别 ~12.7:1/~13.5:1，primary #4A5D3A 对
 *     bg ~6.4:1——均远超门槛，无需再调。
 *   - accent #C96F4A（陶土）对 bg/surface 约 3.18:1/3.38:1——低于正文
 *     4.5:1 但高于大字 3:1 门槛，同 heritage 的 accent #C98A4B（对 bg
 *     仅 ~2.61:1）先例：accent 只作装饰/图表/大字强调，从不当正文色，
 *     起点即优于该先例，无需再调。
 *   - chapter 底色取 primary（同 academic/consulting/pulse 先例），白字
 *     对 primary ~7.2:1，`readableOn` 自适应两墨取优后稳态可读。
 */
export const TERRA_TOKENS: StyleTokens = {
  id: "terra",
  colors: {
    bg: "#F5F1E8", // 沙色
    surface: "#FBF8F1",
    primary: "#4A5D3A", // 橄榄绿
    accent: "#C96F4A", // 陶土
    text: "#2E2A21", // 大地墨
    muted: "#6B6555", // 橄榄灰调，校准记录见上方文件头注释
    border: "#E6DCC5", // 深一档的沙色描边，同色相家族
    chartPalette: ["#4A5D3A", "#C96F4A", "#C9A24B", "#5C6B6E"], // 橄榄/陶土/麦黄/板岩
  },
  // Georgia first: resolveFontFace picks the first SAFE_FONTS match, and
  // Georgia is the first stack member here (not a vanity brand name like
  // academic's "Sectra") — resolves straight to Georgia, one of only two
  // faces with an exact per-character width table (`hasExactWidthTable`,
  // `src/lib/svg-text-layout.ts`; the other is Microsoft YaHei). SimSun
  // stays in the stack as the earthy-serif CJK fallback cue (brief's own
  // example), but is never actually selected on a stock install with
  // Georgia present. Same stack for heading and body (unlike academic's
  // serif-heading/sans-body split) — terra's "朴素、根系、长期主义" reads
  // better as one unbroken serif register than a paper-style mix.
  fonts: {
    heading: ["Georgia", "SimSun", "serif"],
    body: ["Georgia", "SimSun", "serif"],
  },
  shape: { radius: 4, gapScale: 1 }, // 朴实无华（ESG 年报/可持续报告的克制感）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F5F1E8" },
    chapter: { kind: "color", value: "#4A5D3A" },
    content: { kind: "color", value: "#F5F1E8" },
    ending: { kind: "color", value: "#F5F1E8" },
  },
};
