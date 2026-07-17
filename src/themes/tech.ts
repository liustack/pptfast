import type { StyleTokens } from "./tokens";

export const TECH_TOKENS: StyleTokens = {
  id: "tech",
  colors: {
    bg: "#060A13",
    surface: "#0A101C",
    // No `panel` override (Task 1, electric-cyan single-accent redesign):
    // the old lighter-than-surface "card-on-card" tier read as a muddy
    // blue-grey that fought the new near-black system, so bento now falls
    // back to `colors.surface` for its card fill like most of the other
    // theme token files already do (only `custom` sets a distinct `panel`).
    primary: "#2DD4E6",
    accent: "#2DD4E6",
    text: "#F2F6FA",
    muted: "#8A94A6",
    border: "#2C3140",
    // Single-accent redesign (Task 1): the old accentPool cycle is gone —
    // charts still need real hue separation between data series though, so
    // chartPalette stays a multi-color pool, just led by the theme's own
    // electric-cyan accent instead of an unrelated blue.
    chartPalette: ["#2DD4E6", "#3ECF8E", "#F5A623", "#B78CFF", "#4A5568"],
  },
  fonts: {
    // Microsoft YaHei 前置：导出的 pptx 单字体无法回退，纯拉丁 sans 无 CJK
    // 字形会渲染成豆腐块。雅黑承担 tech 的科技感无衬线气质。
    heading: ["Microsoft YaHei", "Helvetica Neue", "Helvetica", "Inter", "Arial", "system-ui"],
    body: [
      "Microsoft YaHei",
      "Helvetica Neue",
      "Helvetica",
      "Inter",
      "Arial",
      "system-ui",
    ],
    mono: ["Consolas", "Courier New"],
  },
  // 重设计（2026-07-09）：死黑纯色底是「空腔感」的放大器——换深蓝黑对角
  // 渐变（左上略亮、右下沉底），页面获得纵深，装饰光晕也有了依托。
  shape: { radius: 10, gapScale: 1 }, // bento 圆润（科技卡片感）
  defaultBackgrounds: {
    cover: { kind: "gradient", from: "#0D1526", to: "#05070E", direction: "diagonal" },
    chapter: { kind: "gradient", from: "#0D1526", to: "#05070E", direction: "diagonal" },
    content: { kind: "gradient", from: "#0A111F", to: "#060A13", direction: "diagonal" },
    ending: { kind: "gradient", from: "#0D1526", to: "#05070E", direction: "diagonal" },
  },
};
