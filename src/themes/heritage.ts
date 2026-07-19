import type { StyleTokens } from "./tokens";

/**
 * heritage（典藏传承）——第 8 主题（2026-07-10 用户从视觉伴侣六方向中
 * 追加拍板「勃艮第×焦糖也不错，再加一个」）。putty 暖米底 + 勃艮第酒红 +
 * 焦糖铜，轻奢老钱质感，面向品牌传承/周年庆典/文化品鉴/高端定制场景。
 * 检索依据：「reds trending darker——old money 质感」+「putty 配黑白是
 * 当下 presentation 专用的高级感」（2026 趋势检索，见 luxe 同批调研）。
 * 与 magazine 暖纸的区分：主色勃艮第酒红大面积出现（banner/巨号数字）vs
 * magazine 黑标题+砖红点缀，无衬线 vs 报题衬线。
 * **零版式代码**：沿用原 retail v1 验证过的浅底混搭（creative 家族
 * cover/chapter + consulting 家族 content/ending + two-column 轮换）——
 * 酒红横幅上 baked 白字对比度充足（deep red ≈ 0.06 明度）。
 */
export const HERITAGE_TOKENS: StyleTokens = {
  id: "heritage",
  colors: {
    bg: "#F6F2EC", // putty 暖米
    surface: "#FFFFFF",
    primary: "#7D2A3C", // 勃艮第酒红
    accent: "#C98A4B", // 焦糖铜
    text: "#33262A", // 深酒褐
    muted: "#786961", // post-v0.3 W8 fix round补测（backlog 5a，content-matrix 色调混合格底色缺口，task-2 审校发现）：明度再下调校准 4.5:1（原 #7B6C64 为首轮校准值，更早为 #8C7A72，保色相/饱和度）
    border: "#E8DFD3",
    chartPalette: ["#7D2A3C", "#C98A4B", "#4A6670", "#A3A38C"],
  },
  fonts: {
    heading: ["Microsoft YaHei", "Helvetica Neue", "Arial", "system-ui"],
    body: ["Microsoft YaHei", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: { radius: 4, gapScale: 1.05 }, // 传统装帧微圆+沉稳
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F6F2EC" },
    chapter: { kind: "color", value: "#F6F2EC" },
    content: { kind: "color", value: "#F6F2EC" },
    ending: { kind: "color", value: "#F6F2EC" },
  },
};
