import type { ThemeTokens } from "./tokens";

/**
 * journal（人文期刊）——原 magazine 主题纯改名（2026-07-10 用户裁决拆分：
 * 「现在的人文叙事/年度回顾风格配色和版式根本不是人们潜意识里对杂志的
 * 印象」——暖纸+砖红+宋体报头其实是人文期刊气质，magazine 名字腾给新的
 * 时尚杂志主题）。tokens/版式全套继承，观感零变化。存量 editorial-serif/
 * anthropic-clay 旧 deck 的 legacy 链随迁指向本主题。
 */

export const JOURNAL_TOKENS: ThemeTokens = {
  id: "journal",
  colors: {
    bg: "#FAF7F2",
    surface: "#FFFFFF",
    primary: "#1A1A1A",
    accent: "#C0392B",
    text: "#1F1F1F",
    muted: "#6E6259",
    border: "#E4DCD0",
    // Warm, low-saturation set (brick red accent + warm neutrals) to match
    // the editorial paper aesthetic — no saturated chart colors.
    chartPalette: ["#C0392B", "#A67B5B", "#6E6259", "#8C7B6B"],
  },
  fonts: {
    // SimSun 前置：导出的 pptx 单字体无法回退。Georgia/serif 是纯拉丁衬线，
    // 无 CJK 字形，中文标题会渲染成豆腐块。CJK 安全衬线白名单里唯一合适
    // 的是 SimSun/宋体，用它承担 magazine 的报题气质。
    heading: ["SimSun", "宋体", "Georgia", "serif"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "Arial", "system-ui"],
    mono: ["Consolas", "Courier New"],
  },
  shape: { radius: 6, gapScale: 1.1 }, // 期刊温和+杂志留白
  defaultBackgrounds: {
    cover: { kind: "color", value: "#FAF7F2" },
    chapter: { kind: "color", value: "#FAF7F2" },
    content: { kind: "color", value: "#FAF7F2" },
    ending: { kind: "color", value: "#FAF7F2" },
  },
};
