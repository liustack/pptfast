import type { ThemeTokens } from "./tokens";

/**
 * ink（水墨国风）——2026-07-10 用户裁决新增的「真创意」子类之二（用户
 * 点名的古风/中国风例子）。宣纸米底 + 墨黑 + 朱砂红 + 楷体标题（KaiTi
 * 在 CJK 导出安全白名单内），面向传统文化/节日/国潮/茶酒场景。专属
 * ink-motif 画古籍双线框 + 朱砂印章 + 淡墨山形。
 */
export const INK_TOKENS: ThemeTokens = {
  id: "ink",
  colors: {
    bg: "#F5F0E6", // 宣纸米
    surface: "#FBF8F1",
    primary: "#2B2B2B", // 墨
    accent: "#C3272B", // 朱砂
    text: "#262421",
    muted: "#8A8071",
    border: "#DED5C2",
    chartPalette: ["#2B2B2B", "#C3272B", "#8A8071", "#B5A36F"],
  },
  fonts: {
    heading: ["KaiTi", "楷体", "SimSun", "宋体", "serif"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
  },
  shape: { radius: 8, gapScale: 1.15 }, // 圆角柔和（水墨无锋，用户裁决）+留白
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F5F0E6" },
    chapter: { kind: "color", value: "#F5F0E6" },
    content: { kind: "color", value: "#F5F0E6" },
    ending: { kind: "color", value: "#F5F0E6" },
  },
};
