// insight（深度洞察）——原 creative 改名（2026-07-10 用户裁决：深底红金
// 气质其实是 Bloomberg/Economist 财经信息图风，不配叫 creative；真正的
// 创意子类由 doodle/ink 两新主题承接）。tokens 全套不动，观感零变化。
import type { StyleTokens } from "./tokens";

export const INSIGHT_TOKENS: StyleTokens = {
  id: "insight",
  colors: {
    bg: "#0A0A0C",
    surface: "#14141A",
    primary: "#E63946",
    accent: "#D4A57C",
    text: "#F5F5F5",
    muted: "#888892",
    border: "#2A2A2E",
    chartPalette: ["#E63946", "#D4A57C", "#888892", "#F5F5F5"],
  },
  fonts: {
    heading: ["Lora", "Georgia", "Source Han Serif SC", "serif"],
    body: ["Inter", "system-ui"],
  },
  shape: { radius: 2, gapScale: 0.95 }, // 信息图利落+数据密度
  defaultBackgrounds: {
    cover: { kind: "color", value: "#0A0A0C" },
    chapter: { kind: "color", value: "#0A0A0C" },
    content: { kind: "color", value: "#0A0A0C" },
    ending: { kind: "color", value: "#0A0A0C" },
  },
};
