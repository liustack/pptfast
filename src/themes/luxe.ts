import type { StyleTokens } from "./tokens";

/**
 * luxe（高端品牌）——原 retail 主题改名+黑金重定位（2026-07-10 用户视觉
 * 伴侣裁决：配色选「高级黑金」方向，且 retail 名字不够高级）。
 * 深炭底 + 香槟金，奢侈品/美妆大牌/年会盛典气质。深底主题中与
 * creative（黑+红）、tech（黑蓝+青）以金色拉开。
 * 历史：retail v1 暖橙（撞 magazine）→ v2 莓红紫（否）→ v3 珊瑚青（否）
 * → luxe 黑金（视觉伴侣六方向对比后定案）。存量 retail deck 经
 * LEGACY_THEME_MAP 兜底解析到本主题。
 * **零版式代码**：全部借用 creative 家族深底版式（poster 系）+ 共享
 * two-column/split-diagonal。
 * 对比度约束：banner-heading 的横幅文字是 baked 白字，金色横幅上白字
 * 不可读——manifest 的 content 集**禁配 banner-heading**，用深底安全的
 * stacked-poster/two-column。
 */
export const LUXE_TOKENS: StyleTokens = {
  id: "luxe",
  colors: {
    bg: "#161310", // 深炭
    surface: "#211D18", // 卡底（略浅一档）
    primary: "#D4B876", // 香槟金
    accent: "#A67B45", // 深铜金（层次）
    text: "#F4EDDF", // 象牙白
    muted: "#9A9184",
    border: "#3A342C",
    chartPalette: ["#D4B876", "#A67B45", "#8C9A8E", "#6E7B8C"],
  },
  fonts: {
    // 黑金排印：无衬线大字重承载，雅黑前置保 CJK 导出。
    heading: ["Microsoft YaHei", "Helvetica Neue", "Arial", "system-ui"],
    body: ["Microsoft YaHei", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: { radius: 0, gapScale: 1.1 }, // 黑金直角凌厉+呼吸感（spec 提案，2026-07-10）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#161310" },
    chapter: { kind: "color", value: "#161310" },
    content: { kind: "color", value: "#161310" },
    ending: { kind: "color", value: "#161310" },
  },
};
