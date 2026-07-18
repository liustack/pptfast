import type { StyleTokens } from "./tokens";

export const CONSULTING_TOKENS: StyleTokens = {
  id: "consulting",
  colors: {
    bg: "#F7F7F2",
    surface: "#FFFFFF",
    primary: "#051C2C",
    accent: "#FFC72C",
    text: "#051C2C",
    muted: "#6B6B6B", // post-v0.3 W8 fix round补测（backlog 5a，content-matrix 色调混合格底色缺口，task-2 审校发现）：明度下调校准 4.5:1（原 #6C6C6C，保色相/饱和度——consulting 本轮首次校准，此前从未在 8/13 主题名单内）
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
