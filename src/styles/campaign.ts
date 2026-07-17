import type { ThemeTokens } from "./tokens";

/**
 * campaign（活力营销）——2026-07-13 memphis 拆分主题 A（用户拍板：场景
 * 命名 campaign + 深紫底多彩笔刷方向，参考「炫彩简约活动策划」类模板）。
 * 深紫底 + 品红/湖蓝/柠檬黄/薄荷四彩笔刷涂鸦，面向活动策划/营销
 * campaign/发布会/年轻化品牌。紫色系是全主题色域唯一空位（盘点先例：
 * 新主题配色必须先盘全主题色域找空位）。存量 memphis/doodle deck 经
 * LEGACY_THEME_MAP 兜底到本主题。
 * **零版式代码**：借 luxe 同款深底家族（poster 系 + stacked-poster/
 * two-column），气质由专属 campaign-motif（笔刷涂鸦）+ tokens 承载。
 * 对比度约束：banner-heading 横幅 baked 白字在品红横幅上仅 ~3.2:1——
 * 与 luxe 同理 content 集禁配 banner-heading。
 * chartPalette 即笔刷四色（motif 从 ctx 取色的零 hex 纪律：图表与装饰
 * 同色语言）。
 */
export const CAMPAIGN_TOKENS: ThemeTokens = {
  id: "campaign",
  colors: {
    bg: "#3D2E78", // 深紫
    surface: "#4A3A8E", // 卡底（略浅一档）
    primary: "#F0559E", // 品红（主强调）
    accent: "#F7D23E", // 柠檬黄（次强调）
    text: "#FFFFFF",
    muted: "#B8AFD9", // 浅紫灰
    border: "#5A4AA0",
    chartPalette: ["#F0559E", "#3EC1E8", "#F7D23E", "#7FE0C3"], // 品红/湖蓝/柠檬黄/薄荷=笔刷四色
  },
  fonts: {
    heading: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
  },
  shape: { radius: 10, gapScale: 1.0 }, // 活力圆润（tech 同档）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#3D2E78" },
    chapter: { kind: "color", value: "#3D2E78" },
    content: { kind: "color", value: "#3D2E78" },
    ending: { kind: "color", value: "#3D2E78" },
  },
};
