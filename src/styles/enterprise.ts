import type { ThemeTokens } from "./tokens";

/**
 * enterprise（企业蓝）——原 custom→gallery→avant 的最终定名
 * （2026-07-10 用户四轮裁决收官：转企业风后 avant「先锋设计」名实不符，
 * 改 enterprise，场景词「企业介绍/产品方案/商务提案」）。以下沿革注释保留：
 * avant——原 custom→gallery 改造的形态（2026-07-10 用户视觉伴侣
 * 三轮裁决）：白墙 + 正宗国际克莱因蓝 IKB + 天蓝单色系辅助，企业风
 * （炸橘撞色版被否：橘只在小元素出现无大色块，名不副实且不好看）。
 * 演化链：custom（自定义，白底黑字）→ gallery（克莱因蓝 v1，冷白底
 * #F8F9FC + #1F3BC4，tone-adaptive 低色彩版式）→ avant（本形态）。
 * gallery v1 被否原因：①冷白底灰调显脏 ②撞色弱——根因是 tone-adaptive
 * 版式家族本身低色彩（巨号是浅灰水印、主题色少有上场机会），色值再艳也
 * 出不来。故 avant 同时换 tokens（白墙/正 IKB #002FA7）和
 * manifest 版式（IKB 斜切封面/IKB 巨号章节/IKB 横幅内容/IKB 大字结尾）。
 * 名字随之从 gallery 改 avant：大色块撞色是先锋气质，不是白盒画廊的素雅。
 * 2026-07-10 三轮：炸橘辅助被否（橘只在小元素出现无大色块，「撞色」名不
 * 副实且不好看）——转企业单色系：点缀用 IKB 本色、图表天蓝/蓝灰渐次。
 * 存量 custom/gallery deck 经 LEGACY_THEME_MAP 兜底到本主题。
 * **零版式代码**：全部借用现有 archetype（split-diagonal 在 IKB 上
 * readableOn 出白字，banner-heading 横幅 baked 白字在 IKB 上对比充足）。
 */
export const ENTERPRISE_TOKENS: ThemeTokens = {
  id: "enterprise",
  colors: {
    bg: "#FFFFFF", // 画廊白墙
    surface: "#FFFFFF",
    panel: "#F4F4F6",
    primary: "#002FA7", // 国际克莱因蓝（IKB）
    accent: "#002FA7", // 点缀直接用 IKB 本色（2026-07-10 用户裁决），天蓝/蓝灰留给图表
    text: "#14161F",
    muted: "#878B96",
    border: "#E8E8EC",
    cardStroke: "#E4E4E9", // 白墙上白卡靠描边区分（沿自 custom 存量语义）
    chartPalette: ["#002FA7", "#5B8DEF", "#8FA3C8", "#C9D3E8"], // IKB→天蓝→蓝灰渐次（企业单色系）
  },
  fonts: {
    heading: ["Microsoft YaHei", "Helvetica Neue", "Arial", "system-ui"],
    body: ["Microsoft YaHei", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: { radius: 8 }, // 企业圆润（spec 提案）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#FFFFFF" },
    chapter: { kind: "color", value: "#FFFFFF" },
    content: { kind: "color", value: "#FFFFFF" },
    ending: { kind: "color", value: "#FFFFFF" },
  },
};
