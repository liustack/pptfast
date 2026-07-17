import type { StyleTokens } from "./tokens";

export const CONSULTING_TOKENS: StyleTokens = {
  id: "consulting",
  colors: {
    bg: "#F7F7F2",
    surface: "#FFFFFF",
    primary: "#051C2C",
    accent: "#FFC72C",
    text: "#051C2C",
    muted: "#6C6C6C",
    border: "#D5D5CB",
    chartPalette: ["#051C2C", "#FFC72C", "#00A9E0", "#6C6C6C"],
  },
  fonts: {
    heading: ["Bower", "Georgia", "Source Han Serif SC", "serif"],
    body: ["Bower", "Georgia", "Source Han Serif SC", "serif"],
  },
  shape: { radius: 2, gapScale: 1 }, // 微圆克制（咨询报告利落，全推广批次 2026-07-10）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F7F7F2" },
    chapter: { kind: "color", value: "#051C2C" },
    content: { kind: "color", value: "#F7F7F2" },
    ending: { kind: "color", value: "#F7F7F2" },
  },
};
