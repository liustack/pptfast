import type { StyleTokens } from "./tokens";

export const ACADEMIC_TOKENS: StyleTokens = {
  id: "academic",
  colors: {
    bg: "#FAFAF6",
    surface: "#FFFFFF",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    border: "#D5D5CB",
    chartPalette: ["#006A4E", "#00A878", "#5D6B65", "#D5D5CB"],
  },
  fonts: {
    heading: ["Sectra", "Georgia", "Source Han Serif SC", "serif"],
    body: ["Inter", "PingFang SC", "system-ui"],
  },
  shape: { radius: 2, gapScale: 1.05 }, // 学术严谨微圆+论文留白
  defaultBackgrounds: {
    cover: { kind: "color", value: "#FAFAF6" },
    chapter: { kind: "color", value: "#006A4E" },
    content: { kind: "color", value: "#FAFAF6" },
    ending: { kind: "color", value: "#FAFAF6" },
  },
};
