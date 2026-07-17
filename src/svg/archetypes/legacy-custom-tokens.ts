import type { ThemeTokens } from "../../styles/tokens";

/**
 * 测试专用 fixture：退役前的 custom 主题 tokens 快照（2026-07-10
 * custom→gallery 改造前的最后形态，源自旧 themes/custom.ts）。
 *
 * tone-adaptive 家族的逐字节输出锁的语义是「P2 迁移自旧 CustomDecor /
 * custom.tsx 输出逐字节一致」——该历史保证是针对**当时的 custom tokens**
 * 成立的。gallery 换成克莱因蓝色板后 `getTheme("custom")` 已解析到新色板，
 * 锁若跟着 getTheme 走就失去「与迁移前一致」的锚点。故锁固定引用本快照，
 * 不随 canonical 主题演化漂移。生产代码不得 import 本文件。
 */
export const LEGACY_CUSTOM_TOKENS: ThemeTokens = {
  id: "custom",
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F5",
    panel: "#F4F4F5",
    primary: "#18181B",
    accent: "#3F3F46",
    text: "#18181B",
    muted: "#71717A",
    border: "#E4E4E7",
    cardStroke: "#E4E4E7",
    chartPalette: ["#18181B", "#52525B", "#A1A1AA", "#D4D4D8"],
  },
  fonts: {
    heading: ["Inter", "PingFang SC", "system-ui"],
    body: ["Inter", "PingFang SC", "system-ui"],
  },
  defaultBackgrounds: {
    cover: { kind: "color", value: "#FFFFFF" },
    chapter: { kind: "color", value: "#FFFFFF" },
    content: { kind: "color", value: "#FFFFFF" },
    ending: { kind: "color", value: "#FFFFFF" },
  },
};
