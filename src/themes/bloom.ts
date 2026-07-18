import type { StyleTokens } from "./tokens";

/**
 * bloom（柔美庆典）——2026-07-13 memphis 拆分主题 B（用户拍板：命名
 * bloom + 紫粉杏水彩方向，参考「素雅水彩风婚庆策划」类模板）。暖奶白
 * 底 + 紫藤/杏粉/干玫瑰水彩晕染 + 宋体衬线标题 + 细线植物，面向婚庆
 * 策划/庆典邀约/花艺母婴美妆等柔美生活方式品牌。粉彩水彩质感是全主题
 * 色域空位；与 campaign 的深紫同族但明度两极不混淆。
 * **零版式代码**：借 heritage 同款浅底家族（poster cover/chapter +
 * banner content/ending + two-column 轮换），气质由专属 bloom-motif
 * （水彩晕染斑块+植物细线）+ tokens 承载。
 * 对比度：banner 横幅 primary #6F6190 上白字 ~6:1 ✓ 可配 banner-heading。
 * poster-chapter 标题 colors.text 直画——奶白底 ✓（chapter 底必须浅色
 * 的先例约束满足）。
 * chartPalette 即水彩四色（motif 零 hex 纪律）。
 */
export const BLOOM_TOKENS: StyleTokens = {
  id: "bloom",
  colors: {
    bg: "#F6F1EA", // 暖奶白
    surface: "#FFFFFF",
    primary: "#6F6190", // 紫藤（标题/横幅）
    accent: "#D89A8E", // 杏粉
    text: "#4A4258", // 深紫灰
    muted: "#756A84", // post-v0.3 W8 fix round（backlog 5a）：明度下调校准 4.5:1（原 #9C93A8，保色相/饱和度）
    border: "#E8E0D8",
    chartPalette: ["#8A7BA8", "#D89A8E", "#C9A0B0", "#A8B8CC"], // 紫藤/杏粉/干玫瑰/雾蓝=水彩四色
  },
  fonts: {
    // 婚庆衬线报题气质：SimSun 前置（CJK 安全衬线白名单唯一选择，journal 先例）
    heading: ["SimSun", "宋体", "Georgia", "serif"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
  },
  shape: { radius: 6, gapScale: 1.1 }, // 柔和圆角+呼吸感
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F6F1EA" },
    chapter: { kind: "color", value: "#F6F1EA" },
    content: { kind: "color", value: "#F6F1EA" },
    ending: { kind: "color", value: "#F6F1EA" },
  },
};
