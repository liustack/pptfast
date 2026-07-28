import type { StyleTokens } from "./tokens";

/**
 * ember（创业路演/暖色能量）——2026-07-28 themes-16 wave task T3（第 16、
 * 本波最后一个主题）。用户拍板方向：13 个内置主题里橙色主色完全空缺，
 * pitch deck 要暖、亮、友好——campaign 太闹、tech 太暗、consulting 太冷
 * （.issues/2026-07-28-themes-16/plan.md 场景空档论证）。暖白底 + 火橙
 * 主色 + 火焰黄强调色，气质一句话：明快、上升、热身好了就开讲（plan
 * 裁定 1）。
 *
 * **对比度警告（裁定 1 原文，逐字节校准记录）**：橙色系明度高，primary
 * #E4572E 直接当标题色时对 bg #FFFBF5 的对比度处于临界——实测 ~3.57:1、
 * 对 surface #FFFFFF ~3.68:1，双双达 3:1 大字（≥24px bold）门槛但远不足
 * 4.5:1 正文门槛，因此 primary **只能用于大字标题/色块，正文与小字一律
 * 用 text**，起点 hex 未改（已达大字门槛，未改色相也未调明度）。
 * accent #FFC145 对浅底对比度必然极低——实测对 bg ~1.57:1、对 surface
 * ~1.62:1，低于 heritage 的 accent 先例（#C98A4B 对 bg ~2.61:1，terra 报告
 * 记录），**accent 只作装饰/图表/大字强调色块，绝不当任何文字色**（除非
 * 深底反白走 `readableOn` 自适应）——本主题任何 tokens 消费点（motif/
 * chartPalette）均未把 accent 用作文字填色。
 *   - muted #6E6259（暖灰调，同色相非无关灰，非中性灰）：对 bg 测得
 *     ~5.73:1，对 surface 测得 ~5.91:1，双双清 4.5:1 正文门槛（`colors.
 *     muted contrast` 套件要求），起点即达标，无需二次校准。
 *   - text #26221E 对 bg/surface 分别 ~15.3:1/~15.8:1——远超门槛，无需再调。
 *   - chapter 底色取 primary（同 academic/consulting/pulse/terra 先例）：
 *     白字对 primary 仅 ~3.68:1，text 墨对 primary ~4.29:1——`readableOn`
 *     两墨取优，自适应选中对比度更高的 text 墨，大字（chapter 标题字号
 *     远超 24px bold）稳态可读，不依赖任何一侧的固定假设。
 */
export const EMBER_TOKENS: StyleTokens = {
  id: "ember",
  colors: {
    bg: "#FFFBF5", // 暖白
    surface: "#FFFFFF",
    primary: "#E4572E", // 火橙
    accent: "#FFC145", // 火焰黄
    text: "#26221E", // 暖墨
    muted: "#6E6259", // 暖灰调，校准记录见上方文件头注释
    border: "#F0DEC5", // 深一档的暖白描边，同色相家族
    chartPalette: ["#E4572E", "#2B3A55", "#FFC145", "#8C7B6E"], // 火橙/藏青/火焰黄/暖灰
  },
  // Microsoft YaHei first (not Verdana/Segoe UI): resolveFontFace picks the
  // first SAFE_FONTS match, and only Georgia/Microsoft YaHei carry an exact
  // per-character width table (`hasExactWidthTable`, `src/lib/svg-text-
  // layout.ts`) — every builtin's body face must resolve to one of those two
  // (`definitions.test.ts`'s registerTheme console.warn regression test pins
  // this invariant across all builtins). Verdana stays second in the stack
  // as the brief's own "modern sans" flavor cue (a wide, geometric,
  // startup-web-native face), Segoe UI third as the other named option —
  // both are real SAFE_FONTS members, just not first.
  fonts: {
    heading: ["Microsoft YaHei", "Verdana", "Segoe UI", "Helvetica Neue", "Arial", "system-ui"],
    body: ["Microsoft YaHei", "Verdana", "Segoe UI", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: { radius: 10, gapScale: 1 }, // 友好圆润（创业路演的亲和感，介于 pulse 的 8 与更方正的既有主题之间）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#FFFBF5" },
    chapter: { kind: "color", value: "#E4572E" },
    content: { kind: "color", value: "#FFFBF5" },
    ending: { kind: "color", value: "#FFFBF5" },
  },
};
