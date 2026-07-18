import type { StyleTokens } from "./tokens";

/**
 * runway（时尚秀场）——2026-07-10 拆分后的新主题（初名 magazine，用户
 * 裁决时尚主题不叫 magazine；magazine 转为 legacy id 指向 journal，存量
 * 人文观感 deck 回放不再突变）（原 magazine 的人文
 * 气质拆去 journal）。高对比时尚大片风：纯白底 + 纯黑报头 + 正红点缀
 * （Vogue 语法），面向时尚品牌/潮流生活/品牌大片场景。
 * **零版式代码**：与 journal 共享 masthead 报头家族（报头体正是时尚杂志
 * 的语言，同版式不同 tokens 气质大变——luxe 借 creative 家族的同款先例），
 * corner-ornament 角饰是人文感，本主题不带 motif。
 * 报头字体保持衬线（SimSun 承载 CJK，Didot 类报头是时尚杂志国际惯例），
 * 正文无衬线。
 */
export const RUNWAY_TOKENS: StyleTokens = {
  id: "runway",
  colors: {
    bg: "#FFFFFF",
    surface: "#FFFFFF",
    primary: "#0A0A0A", // 纯黑报头
    accent: "#D80027", // 正红（口红红）点缀
    text: "#111417",
    muted: "#76767B", // post-v0.3 W8 fix round（backlog 5a）：明度下调校准 4.5:1（原 #77787D，保色相/饱和度）
    border: "#E8E8E8",
    cardStroke: "#E8E8E8", // 纯白底白卡靠描边区分
    chartPalette: ["#0A0A0A", "#D80027", "#77787D", "#C9C9CC"],
  },
  fonts: {
    heading: ["SimSun", "宋体", "Georgia", "serif"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: { radius: 0, gapScale: 0.95 }, // 时尚硬朗+密排（spec 提案）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#FFFFFF" },
    chapter: { kind: "color", value: "#FFFFFF" },
    content: { kind: "color", value: "#FFFFFF" },
    ending: { kind: "color", value: "#FFFFFF" },
  },
};
